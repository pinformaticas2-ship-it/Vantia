import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';

// ── Plantillas Word con campos de MN Program (15/10/2026) ───────────────────
// Las plantillas del despacho (DocPlant) vienen de MN Program y marcan los
// datos como texto entre comillas angulares: «Contrarios_Nombre»,
// «Datos_del_Expediente_Ref._Expediente», «WIZINK_TAE_DEL_CONTRATO»...
// (unas pocas usan además campos MERGEFIELD de Word con esos mismos nombres).
// Aquí se buscan y se sustituyen directamente en el XML del .docx.
//
// Word suele partir un marcador en varios trozos de texto ("runs") por la
// ortografía o el formato: se reconstruye el texto de cada párrafo, se
// localizan los marcadores y se reescriben los trozos afectados, dejando el
// valor en el formato del primer trozo.

/** Un marcador es un nombre de campo de MN: sin espacios y con "_" (Grupo_Campo).
 *  «deudor cautivo», «BOE» y otras citas del propio texto legal se dejan. */
const RE_MARCADOR = /«([^«»\s_]{1,60}_[^«»\s]{1,80})»/g;

/** Clave canónica: sin tildes, en mayúsculas y con "_" como único separador
 *  ("Ref._Expediente" y "Ref__Expediente" son el mismo campo). */
export function claveCanonica(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const PARTES = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

const desescapar = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapar = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface NodoTexto { ini: number; fin: number; abre: string; texto: string }

/** Nodos <w:t> de un fragmento de XML, agrupados por párrafo. */
function nodosPorParrafo(xml: string): NodoTexto[][] {
  const grupos: NodoTexto[][] = [[]];
  const re = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0] === '</w:p>') { grupos.push([]); continue; }
    grupos[grupos.length - 1].push({ ini: m.index, fin: m.index + m[0].length, abre: `<w:t${m[1] || ''}>`, texto: desescapar(m[2]) });
  }
  return grupos.filter((g) => g.length);
}

/** Nombres de los campos que usa una parte del documento (en su forma original). */
function marcadoresDeXml(xml: string, out: Set<string>) {
  for (const grupo of nodosPorParrafo(xml)) {
    const texto = grupo.map((n) => n.texto).join('');
    for (const m of texto.matchAll(RE_MARCADOR)) out.add(m[1]);
  }
  for (const m of xml.matchAll(/MERGEFIELD\s+(?:&quot;)?([^\s\\<&"]+)/g)) out.add(m[1]);
}

/** Valor en XML de un run: los saltos de línea pasan a <w:br/>. */
function textoRun(valor: string) {
  return valor.split(/\r?\n/).map(escapar).join('</w:t><w:br/><w:t xml:space="preserve">');
}

function sustituirEnXml(xml: string, valores: Map<string, string>): string {
  // 1) Campos MERGEFIELD de Word: se quita el código del campo y se deja solo
  //    su resultado (que suele ser el propio «Campo», que se sustituye luego).
  //    Así Word no vuelve a poner el nombre del campo al actualizar campos.
  xml = xml.replace(/<w:fldSimple\b[^>]*w:instr="\s*MERGEFIELD[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g, '$1');
  const runs = /<w:r(?:\s[^>]*)?>(?:(?!<w:r[\s>])[\s\S])*?<\/w:r>/g;
  const lista: { ini: number; fin: number; xml: string }[] = [];
  let r: RegExpExecArray | null;
  while ((r = runs.exec(xml))) lista.push({ ini: r.index, fin: r.index + r[0].length, xml: r[0] });
  const ediciones: { ini: number; fin: number; nuevo: string }[] = [];
  for (let i = 0; i < lista.length; i++) {
    if (!/w:fldCharType="begin"/.test(lista[i].xml)) continue;
    // Instrucción del campo: lo que hay hasta "separate" (o "end").
    let j = i + 1, instr = '';
    while (j < lista.length && !/w:fldCharType="(separate|end)"/.test(lista[j].xml)) {
      instr += (lista[j].xml.match(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join('');
      j++;
    }
    if (j >= lista.length || !/^\s*MERGEFIELD\b/.test(instr)) continue;
    if (/w:fldCharType="separate"/.test(lista[j].xml)) {
      // Fuera el código (begin..separate) y el cierre; el resultado se queda.
      let k = j + 1;
      while (k < lista.length && !/w:fldCharType="end"/.test(lista[k].xml)) k++;
      for (let x = i; x <= j; x++) ediciones.push({ ini: lista[x].ini, fin: lista[x].fin, nuevo: '' });
      if (k < lista.length) ediciones.push({ ini: lista[k].ini, fin: lista[k].fin, nuevo: '' });
      i = k;
    } else {
      // Campo sin resultado visible: se cambia por el marcador «Campo».
      const nombre = instr.replace(/^\s*MERGEFIELD\s+/, '').split('\\')[0].replace(/"/g, '').trim();
      ediciones.push({ ini: lista[i].ini, fin: lista[i].fin, nuevo: `<w:r><w:t xml:space="preserve">«${escapar(nombre)}»</w:t></w:r>` });
      for (let x = i + 1; x <= j; x++) ediciones.push({ ini: lista[x].ini, fin: lista[x].fin, nuevo: '' });
      i = j;
    }
  }
  for (const ed of ediciones.sort((a, c) => c.ini - a.ini)) xml = xml.slice(0, ed.ini) + ed.nuevo + xml.slice(ed.fin);

  // 2) Marcadores «Campo» repartidos entre varios trozos de texto.
  const cambios: { ini: number; fin: number; nuevo: string }[] = [];
  for (const grupo of nodosPorParrafo(xml)) {
    const textos = grupo.map((n) => n.texto);
    const completo = textos.join('');
    const hits = [...completo.matchAll(RE_MARCADOR)].filter((m) => valores.has(claveCanonica(m[1])));
    if (!hits.length) continue;
    // Posición de cada nodo dentro del texto del párrafo.
    const desde: number[] = []; let acc = 0;
    for (const t of textos) { desde.push(acc); acc += t.length; }
    const nuevos = [...textos];
    const conSalto = new Set<number>();
    // De atrás hacia delante para no mover las posiciones pendientes.
    for (const m of hits.reverse()) {
      const a = m.index!, b = a + m[0].length;
      const valor = valores.get(claveCanonica(m[1])) ?? '';
      const na = desde.findIndex((d, k) => a >= d && a < d + textos[k].length);
      const nb = desde.findIndex((d, k) => b - 1 >= d && b - 1 < d + textos[k].length);
      if (na < 0 || nb < 0) continue;
      // Lo anterior a cada marcador no ha cambiado todavía (se va de atrás a
      // delante), así que las posiciones originales siguen valiendo.
      const antes = nuevos[na].slice(0, a - desde[na]);
      if (na === nb) {
        nuevos[na] = antes + '\u0000' + valor + '\u0000' + nuevos[na].slice(b - desde[na]);
      } else {
        nuevos[na] = antes + '\u0000' + valor + '\u0000';
        for (let k = na + 1; k < nb; k++) nuevos[k] = '';
        nuevos[nb] = nuevos[nb].slice(b - desde[nb]);
      }
      if (/\n/.test(valor)) conSalto.add(na);
    }
    grupo.forEach((n, k) => {
      if (nuevos[k] === textos[k]) return;
      // \u0000 delimita el valor ya insertado (no se escapa dos veces el resto)
      const cuerpo = nuevos[k].split('\u0000').map((trozo, idx) => (idx % 2 === 1 ? textoRun(trozo) : escapar(trozo))).join('');
      cambios.push({ ini: n.ini, fin: n.fin, nuevo: `<w:t xml:space="preserve">${cuerpo}</w:t>` });
    });
  }
  for (const c of cambios.sort((a, b) => b.ini - a.ini)) xml = xml.slice(0, c.ini) + c.nuevo + xml.slice(c.fin);
  return xml;
}

/** Campos que usa una plantilla .docx (nombres tal cual aparecen, sin repetir). */
export function camposDePlantilla(docx: Buffer): string[] {
  const zip = new AdmZip(docx);
  const out = new Set<string>();
  for (const e of zip.getEntries()) if (PARTES.test(e.entryName)) marcadoresDeXml(e.getData().toString('utf-8'), out);
  // Mismo campo escrito de dos formas (Ref._Expediente / Ref__Expediente): uno solo.
  const vistos = new Map<string, string>();
  for (const n of out) if (!vistos.has(claveCanonica(n))) vistos.set(claveCanonica(n), n);
  return [...vistos.values()];
}

/** Rellena la plantilla. `valores` va por clave canónica; lo que no esté se deja como «Campo». */
export function rellenarPlantilla(docx: Buffer, valores: Record<string, string>): Buffer {
  const mapa = new Map(Object.entries(valores).map(([k, v]) => [claveCanonica(k), String(v ?? '')]));
  const zip = new AdmZip(docx);
  for (const e of zip.getEntries()) {
    if (!PARTES.test(e.entryName)) continue;
    const xml = e.getData().toString('utf-8');
    const nuevo = sustituirEnXml(xml, mapa);
    if (nuevo !== xml) zip.updateFile(e.entryName, Buffer.from(nuevo, 'utf-8'));
  }
  return zip.toBuffer();
}

// ── .doc antiguos: se convierten a .docx con LibreOffice (instalado en el
// servidor, ver Dockerfile) y se guardan en caché mientras no cambie el original.
const CACHE = path.join(os.tmpdir(), 'vantia-plantillas-docx');

function soffice(): string[] {
  return process.platform === 'win32'
    ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe', 'soffice']
    : ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice'];
}

export async function leerComoDocx(ruta: string): Promise<Buffer> {
  if (ruta.toLowerCase().endsWith('.docx')) return fs.promises.readFile(ruta);
  const st = await fs.promises.stat(ruta);
  const hash = crypto.createHash('sha1').update(`${ruta}|${st.mtimeMs}|${st.size}`).digest('hex');
  const destino = path.join(CACHE, `${hash}.docx`);
  if (fs.existsSync(destino)) return fs.promises.readFile(destino);
  const trabajo = path.join(CACHE, hash);
  await fs.promises.mkdir(trabajo, { recursive: true });
  const origen = path.join(trabajo, 'plantilla.doc');
  await fs.promises.copyFile(ruta, origen);
  let ultimoError: any = null;
  for (const bin of soffice()) {
    try {
      await new Promise<void>((ok, ko) => execFile(bin, ['--headless', '--norestore', '--convert-to', 'docx', '--outdir', trabajo, origen],
        { timeout: 90_000, env: { ...process.env, HOME: process.env.HOME || os.tmpdir() } }, (err) => (err ? ko(err) : ok())));
      const convertido = path.join(trabajo, 'plantilla.docx');
      if (fs.existsSync(convertido)) {
        await fs.promises.rename(convertido, destino);
        fs.promises.rm(trabajo, { recursive: true, force: true }).catch(() => {});
        return fs.promises.readFile(destino);
      }
    } catch (e) { ultimoError = e; }
  }
  fs.promises.rm(trabajo, { recursive: true, force: true }).catch(() => {});
  throw new Error(`No se pudo convertir la plantilla .doc a .docx (LibreOffice: ${ultimoError?.code || ultimoError?.message || 'no disponible'}).`);
}
