import { normalizarIdioma } from './idiomas';
import { traducirLista, type Resultado } from './traducirDocumento';

// ── Traducir un Word «tal cual» (09/11/2026) ─────────────────────────────────
// En vez de rehacer el documento, se abre el propio .docx y se cambia solo el
// texto de cada párrafo (cuerpo, tablas, encabezados, pies y notas). Todo lo
// demás queda idéntico: membrete, logos, fuentes, márgenes, numeración,
// estilos, tablas, saltos de página, campos.
//
// Dentro de un párrafo, el texto va en «runs» con su formato (negrita, cursiva,
// subrayado…). A la IA se le manda el párrafo con una etiqueta por tramo de
// formato (<g1>…</g1><g2>…</g2>) y devuelve la traducción con las mismas
// etiquetas, para poner cada trozo traducido en su tramo. Si las etiquetas no
// vuelven bien, el párrafo entero va al primer tramo (se pierde solo la
// negrita/cursiva interior de ese párrafo, nunca el texto).

const PARTES = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
// Párrafo sin otro párrafo dentro (los de los cuadros de texto se tratan aparte, por ser los «de dentro»).
const PARRAFO = /<w:p(?:\s[^>]*?[^/])?>(?:(?!<w:p[\s>])[\s\S])*?<\/w:p>/g;
const RUN = /<w:r(?:\s[^>]*?[^/])?>[\s\S]*?<\/w:r>/g;
const TEXTO = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>/g;

const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escaparXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escaparTag = escaparXml; // el texto dentro de <gN> va escapado, para no confundirlo con las etiquetas

/** Un tramo: texto seguido con el mismo formato, repartido en uno o más <w:t>. */
interface Tramo { texto: string; nodos: { ini: number; fin: number }[] }
interface Parrafo { parte: string; ini: number; fin: number; xml: string; tramos: Tramo[] }

/** Tramos de un párrafo. Se corta el tramo cuando cambia el formato o hay algo que no es texto (tabulador, salto, imagen, campo). */
function tramosDe(xml: string): Tramo[] {
  const tramos: Tramo[] = [];
  let actual: Tramo | null = null; let formato = '';
  RUN.lastIndex = 0; let r: RegExpExecArray | null;
  let fin = 0;
  while ((r = RUN.exec(xml))) {
    // Algo entre runs (marcadores, inserciones, hipervínculos…) no rompe el tramo; un campo sí.
    const entre = xml.slice(fin, r.index);
    if (/<w:fldSimple|<w:fldChar/.test(entre)) actual = null;
    fin = r.index + r[0].length;
    const run = r[0];
    const rPr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const dentro = run.replace(/^<w:r[^>]*>/, '').replace(/<\/w:r>$/, '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
    const soloTexto = dentro.replace(TEXTO, '').replace(/<w:lastRenderedPageBreak\/>/g, '').trim() === '';
    if (!soloTexto) actual = null; // tab, br, dibujo, campo, símbolo…: corta
    TEXTO.lastIndex = 0; let t: RegExpExecArray | null;
    const runIni = r.index; // posiciones relativas al XML del párrafo
    while ((t = TEXTO.exec(run))) {
      if (!actual || rPr !== formato) { actual = { texto: '', nodos: [] }; tramos.push(actual); formato = rPr; }
      actual.texto += desescapar(t[1] || '');
      actual.nodos.push({ ini: runIni + t.index, fin: runIni + t.index + t[0].length });
    }
    if (!soloTexto) actual = null;
  }
  return tramos.filter((x) => x.nodos.length);
}

/** Párrafos con texto que traducir (con letras) de todas las partes del documento. */
function parrafosDe(partes: Record<string, string>): Parrafo[] {
  const out: Parrafo[] = [];
  for (const [parte, xml] of Object.entries(partes)) {
    PARRAFO.lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = PARRAFO.exec(xml))) {
      const tramos = tramosDe(m[0]);
      if (!/\p{L}/u.test(tramos.map((t) => t.texto).join(''))) continue;
      out.push({ parte, ini: m.index, fin: m.index + m[0].length, xml: m[0], tramos });
    }
  }
  return out;
}

/** El párrafo como lo ve la IA: texto plano, o con <gN> si tiene varios tramos de formato. */
function paraIA(p: Parrafo): string {
  if (p.tramos.length === 1) return p.tramos[0].texto;
  return p.tramos.map((t, i) => `<g${i + 1}>${escaparTag(t.texto)}</g${i + 1}>`).join('');
}

/** Reparte la traducción entre los tramos. null si las etiquetas no vuelven bien. */
export function repartir(n: number, traducido: string): string[] | null {
  if (n === 1) return [traducido.replace(/<\/?g\d+>/g, '')];
  const re = /<g(\d+)>([\s\S]*?)<\/g\1>/g;
  const out: string[] = []; let m: RegExpExecArray | null; let esperado = 1; let fuera = traducido;
  while ((m = re.exec(traducido))) {
    if (Number(m[1]) !== esperado) return null; // reordenadas: no se puede mover el formato
    out.push(desescapar(m[2])); esperado++;
    fuera = fuera.replace(m[0], '');
  }
  if (out.length !== n || fuera.trim()) return null;
  return out;
}

/** Escribe los textos nuevos de un párrafo en sus <w:t> (el primero de cada tramo lleva todo; el resto, vacíos). */
function reescribir(p: Parrafo, textos: string[]): string {
  const cambios: { ini: number; fin: number; xml: string }[] = [];
  p.tramos.forEach((t, i) => t.nodos.forEach((n, k) => {
    const abre = (p.xml.slice(n.ini, n.fin).match(/^<w:t(?:\s[^>]*?)?(?=\/?>)/) || ['<w:t'])[0].replace(/\s*xml:space="[^"]*"/, '');
    const txt = k === 0 ? escaparXml(textos[i] ?? '') : '';
    cambios.push({ ini: n.ini, fin: n.fin, xml: `${abre} xml:space="preserve">${txt}</w:t>` });
  }));
  let xml = p.xml;
  for (const c of cambios.sort((a, b) => b.ini - a.ini)) xml = xml.slice(0, c.ini) + c.xml + xml.slice(c.fin);
  return xml;
}

// Idioma de corrección de Word (para que no subraye todo en rojo).
const LOCALE: Record<string, string> = {
  es: 'es-ES', en: 'en-GB', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-PT', ca: 'ca-ES', nl: 'nl-NL',
  ro: 'ro-RO', pl: 'pl-PL', uk: 'uk-UA', ru: 'ru-RU', ar: 'ar-SA', zh: 'zh-CN',
};
function cambiarIdiomaCorreccion(xml: string, idioma: string): string {
  const loc = LOCALE[idioma];
  if (!loc) return xml;
  if (idioma === 'ar') return xml.replace(/(<w:lang\b[^>]*?\bw:bidi=")[^"]*"/g, `$1${loc}"`);
  if (idioma === 'zh') return xml.replace(/(<w:lang\b[^>]*?\bw:eastAsia=")[^"]*"/g, `$1${loc}"`);
  return xml.replace(/(<w:lang\b[^>]*?\bw:val=")[^"]*"/g, `$1${loc}"`);
}

export type ResultadoDocx = { ok: true; buffer: Buffer; parcial: boolean; sinFormatoInterior: number } | Extract<Resultado, { ok: false }>;

/** Traduce un .docx conservando todo su formato. */
export async function traducirDocx(docx: Buffer, idioma: string, nombre: string, progreso?: (h: number, t: number) => void): Promise<ResultadoDocx> {
  const destino = normalizarIdioma(idioma);
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(docx);
  const partes: Record<string, string> = {};
  for (const e of zip.getEntries()) if (PARTES.test(e.entryName)) partes[e.entryName] = e.getData().toString('utf8');
  if (!partes['word/document.xml']) return { ok: false, motivo: 'vacio' };
  // Primero el cuerpo y luego encabezados/pies/notas: si el documento es enorme, se traduce lo principal.
  const orden = (k: string) => (k === 'word/document.xml' ? 0 : 1);
  const parrafos = parrafosDe(Object.fromEntries(Object.entries(partes).sort((a, b) => orden(a[0]) - orden(b[0]))));
  if (!parrafos.length) return { ok: false, motivo: 'vacio' };

  const r = await traducirLista(parrafos.map(paraIA), destino, nombre, {
    que: 'párrafos consecutivos de un documento Word',
    formato: `- Algunos párrafos llevan etiquetas <g1>…</g1>, <g2>…</g2>: marcan tramos con formato distinto (negrita, cursiva…). Devuélvelas TODAS, una vez cada una y en el mismo orden, rodeando la traducción de lo que contenían; nada de texto fuera de ellas. Si el orden natural de la frase cambia, reparte el texto para que cada etiqueta conserve su sentido sin reordenarlas.
- No añadas ni quites espacios al principio o al final de cada etiqueta respecto al original.
- Los párrafos sin etiquetas devuélvelos como texto plano, sin etiquetas.`,
  }, progreso);
  if ('motivo' in r) return r;

  let sinFormatoInterior = 0;
  const nuevos = new Map<string, { ini: number; fin: number; xml: string }[]>();
  r.traduccion.forEach((trad, i) => {
    const p = parrafos[i];
    let textos = repartir(p.tramos.length, trad);
    if (!textos) { // etiquetas perdidas: todo al primer tramo
      sinFormatoInterior++;
      textos = [desescapar(trad.replace(/<\/?g\d+>/g, '')), ...p.tramos.slice(1).map(() => '')];
    }
    const lista = nuevos.get(p.parte) || []; lista.push({ ini: p.ini, fin: p.fin, xml: reescribir(p, textos) }); nuevos.set(p.parte, lista);
  });
  for (const [parte, xml0] of Object.entries(partes)) {
    let xml = xml0;
    for (const c of (nuevos.get(parte) || []).sort((a, b) => b.ini - a.ini)) xml = xml.slice(0, c.ini) + c.xml + xml.slice(c.fin);
    zip.updateFile(parte, Buffer.from(cambiarIdiomaCorreccion(xml, destino), 'utf8'));
  }
  const estilos = zip.getEntry('word/styles.xml');
  if (estilos) zip.updateFile('word/styles.xml', Buffer.from(cambiarIdiomaCorreccion(estilos.getData().toString('utf8'), destino), 'utf8'));
  return { ok: true, buffer: zip.toBuffer(), parcial: r.parcial, sinFormatoInterior };
}
