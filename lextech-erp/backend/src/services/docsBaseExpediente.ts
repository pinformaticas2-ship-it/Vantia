import path from 'path';
import pool from '../config/database';
import { rutaPlantillaOrg, nombrePlantillaOrg, saveExpedienteAttachmentFromBuffer } from '../controllers/filesController';
import { configPlantillas, usaNube, listarPlantillasNube } from './plantillasNube';
import { leerComoDocx, camposDePlantilla, rellenarPlantilla, claveCanonica } from './plantillasWord';
import { contextoPlantilla, valorVantia, valoresGuardados, esCampoLogo, logoDespacho, esDeDespacho } from './plantillasDatos';

// ── Documentos base de cada expediente (15/10/2026) ─────────────────────────
// Con la automatización activada en la organización (Ajustes →
// Automatizaciones), todo expediente tiene su LOPD, su informe de toma de
// requisitos y su hoja de encargo, rellenos con los datos del expediente.
//  - Expedientes nuevos: se generan al crearlos.
//  - Los que ya existían: la primera vez que alguien los abre.
// La toma de requisitos y la hoja de encargo dependen del tipo de asunto.
// Los datos que Vantia no tiene se quedan marcados «así» para completarlos
// (y se cuentan como pendientes); se puede revisar y volver a generar.

export type TipoDocBase = 'lopd' | 'toma_requisitos' | 'hoja_encargo';
export const DOCS_BASE: { tipo: TipoDocBase; nombre: string }[] = [
  { tipo: 'lopd', nombre: 'LOPD' },
  { tipo: 'toma_requisitos', nombre: 'Informe de toma de requisitos' },
  { tipo: 'hoja_encargo', nombre: 'Hoja de encargo' },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Plantilla (ruta dentro de DocPlant) que corresponde a cada documento según el asunto. */
export function plantillaPara(tipo: TipoDocBase, exp: any): string {
  const t = norm(`${exp?.tipo || ''} ${exp?.tipos_asunto || ''} ${exp?.descripcion || ''} ${exp?.tipo_proc || ''}`);
  const esPenal = exp?.tipo === 'penal' || exp?.tipo === 'diligencias' || /\bpenal\b|delito/.test(t);
  const esApoyo = /medidas de apoyo|discapacidad|\bifp\b/.test(t);
  const esUsura = /revolving|tarjeta|wizink|usura|transparencia|abusiv/.test(t);
  if (tipo === 'lopd') return 'Clientes/Clientes/Documento LOPD.docx';
  if (tipo === 'toma_requisitos') {
    if (/clausula|hipotec/.test(t)) return 'Expedientes/INFORME TOMA DE REQUISITOS CLÁUSULAS-HIPOTECAS.doc';
    if (esApoyo) return 'Expedientes/INFORME TOMA DE REQUISITOS MEDIDAS DE APOYO PERS. DISC..doc';
    if (esUsura) return 'Expedientes/USURA-TRANSPARENCIA-ABUSIVIDAD/INFORME DE TOMA DE REQUISITOS USURA-TRANSPARENCIA-ABUSIVIDAD.doc';
    return 'Expedientes/INFORME DE TOMA DE REQUISITOS.doc';
  }
  if (esPenal) return 'Facturas/Proformas/Expedientes/HOJA DE ENCARGO ASUNTO PENAL.doc';
  if (exp?.tipo === 'obligacion_hacer') return 'Expedientes/HOJA DE ENCARGO OBLIGACIÓN DE HACER.doc';
  if (/revolving|tarjeta|wizink/.test(t)) return 'Facturas/Presupuesto/HOJA DE ENCARGO TARJETA REVOLVING.docx';
  if (/\bmasa\b|masiv/.test(t)) return 'Expedientes/HOJA DE ENCARGO ASUNTOS MASA (23-06-2025).doc';
  if (esApoyo) return 'Expedientes/HOJA DE ENCARGO ESPECÍFICA IFP MEDIDAS DE APOYO SIN APLAZAR.doc';
  return 'Facturas/HOJA DE ENCARGO ASUNTO CIVIL.doc';
}

const PALABRA_CLAVE: Record<TipoDocBase, RegExp> = {
  lopd: /lopd|proteccion de datos|consentimiento/,
  toma_requisitos: /toma de requisitos/,
  hoja_encargo: /hoja de encargo/,
};

/** Plantilla para esta organización: la integrada que toca o, si el despacho
 *  tiene su carpeta en la nube, la de mismo nombre allí (o la más parecida). */
export async function elegirPlantilla(organizacionId: string, tipo: TipoDocBase, exp: any): Promise<string | null> {
  const integrada = plantillaPara(tipo, exp);
  if (!usaNube(await configPlantillas(organizacionId))) return integrada;
  const lista = await listarPlantillasNube(organizacionId);
  return mejorPlantilla(lista, tipo, integrada)?.ref || null;
}

/** Las plantillas pueden estar en subcarpetas y repetirse con el mismo nombre
 *  (p. ej. "Documento LOPD" de Clientes y de Trabajadores): se puntúa cada
 *  candidata y gana la que más se parece a la integrada, también por carpeta. */
export function mejorPlantilla<T extends { nombre: string; carpeta: string; ext: string }>(lista: T[], tipo: TipoDocBase, integrada: string): T | null {
  const sinExt = (s: string) => norm(s).replace(/\.docx?$/, '').trim();
  const nombre = sinExt(path.basename(integrada));
  const carpetaInt = norm(path.posix.dirname(integrada));
  const pista = nombre.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const puntos = (p: T) => {
    const n = sinExt(p.nombre);
    const c = norm(p.carpeta);
    let s = 0;
    if (n === nombre) s += 100;
    else if (PALABRA_CLAVE[tipo].test(n)) s += 20 + 3 * pista.filter((w) => n.includes(w)).length;
    else return -1;
    // La carpeta de la integrada ("clientes/clientes", "expedientes"...) al final de la ruta en la nube
    if (carpetaInt !== '.' && (c === carpetaInt || c.endsWith('/' + carpetaInt))) s += 30;
    else if (carpetaInt !== '.' && c.includes(carpetaInt.split('/')[0])) s += 10;
    // Documentos de empleados, nunca para un expediente
    if (/trabajador|emplead|personal/.test(c)) s -= 60;
    if (p.ext === '.docx') s += 2;
    return s;
  };
  const ordenadas = lista.map((p) => ({ p, s: puntos(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return ordenadas[0]?.p || null;
}

export async function docsBaseActivos(organizacionId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT docs_base_config FROM organizaciones WHERE id = $1`, [organizacionId]).catch(() => ({ rows: [] as any[] }));
  return Boolean(rows[0]?.docs_base_config?.activo);
}

/** Genera (o vuelve a generar) un documento y lo guarda en el expediente. */
export async function generarDocBase(opts: {
  organizacionId: string; expedienteId: string; tipo: TipoDocBase; userId: string;
  plantilla?: string; valores?: Record<string, string>;
}): Promise<any> {
  const { organizacionId, expedienteId, tipo, userId } = opts;
  const ctx = await contextoPlantilla(organizacionId, expedienteId);
  if (!ctx.exp) throw new Error('Expediente no encontrado.');
  const rel = opts.plantilla || (await elegirPlantilla(organizacionId, tipo, ctx.exp));
  if (!rel) throw new Error('No hay ninguna plantilla para este documento en la carpeta de plantillas del despacho.');
  const ruta = await rutaPlantillaOrg(organizacionId, rel);
  if (!ruta) throw new Error(`No se encuentra la plantilla «${await nombrePlantillaOrg(organizacionId, rel)}».`);

  const docx = await leerComoDocx(ruta);
  const nombres = camposDePlantilla(docx);
  const guardados = await valoresGuardados(organizacionId, expedienteId);
  const enviados = new Map(Object.entries(opts.valores || {}).map(([k, v]) => [claveCanonica(k), String(v ?? '')]));
  const valores: Record<string, string> = {};
  const imagenes: Record<string, { buffer: Buffer; mime: string }> = {};
  const logo = nombres.some(esCampoLogo) ? await logoDespacho(organizacionId) : null;
  let pendientes = 0;
  for (const n of nombres) {
    const clave = claveCanonica(n);
    if (esCampoLogo(n)) { if (logo) imagenes[clave] = logo; else pendientes++; continue; }
    const deVantia = valorVantia(n, ctx);
    // Lo de Mi Despacho manda sobre lo escrito a mano para el despacho.
    const v = enviados.get(clave) ?? (esDeDespacho(n) && deVantia ? deVantia : guardados.get(clave)) ?? deVantia;
    if (v !== undefined && v !== '') valores[clave] = v;
    else pendientes++; // se queda «marcado» en el documento
  }
  const salida = rellenarPlantilla(docx, valores, imagenes);
  const nombreDoc = DOCS_BASE.find((d) => d.tipo === tipo)!.nombre;
  const ref = `${ctx.exp.anio}-${ctx.exp.num_exp}`;
  const archivo = await saveExpedienteAttachmentFromBuffer(
    expedienteId, salida, `${nombreDoc} ${ref}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', userId,
  );
  await pool.query(`UPDATE client_files SET document_name = $2, attachment_type = $3 WHERE id = $1`,
    [archivo.id, `${nombreDoc} ${ref}`, 'Sin clasificar']).catch(() => {});
  const { rows } = await pool.query(
    `UPDATE expediente_docs_base SET estado = 'listo', plantilla = $3, file_id = $4, pendientes = $5, error = NULL, updated_at = NOW(),
            generado_at = NOW(), generado_por = $6
      WHERE expediente_id = $1 AND tipo = $2 RETURNING *`,
    [expedienteId, tipo, rel, archivo.id, pendientes, userId],
  );
  return rows[0];
}

/** Crea lo que falte (sin esperar: la conversión de .doc tarda unos segundos). */
export async function asegurarDocsBase(organizacionId: string, expedienteId: string, userId: string): Promise<void> {
  if (!(await docsBaseActivos(organizacionId))) return;
  for (const { tipo } of DOCS_BASE) {
    // La fila hace de "candado": dos aperturas a la vez no generan dos veces.
    // Un error de hace más de 10 minutos se reintenta.
    const { rows } = await pool.query(
      `INSERT INTO expediente_docs_base (organizacion_id, expediente_id, tipo, estado)
       VALUES ($1, $2, $3, 'generando')
       ON CONFLICT (expediente_id, tipo) DO UPDATE SET estado = 'generando', error = NULL
         WHERE expediente_docs_base.estado = 'error' AND expediente_docs_base.updated_at < NOW() - INTERVAL '10 minutes'
       RETURNING id`,
      [organizacionId, expedienteId, tipo],
    );
    if (!rows.length) continue;
    generarDocBase({ organizacionId, expedienteId, tipo, userId }).catch(async (e) => {
      console.error(`[docs-base] ${expedienteId} ${tipo}:`, e?.message);
      await pool.query(`UPDATE expediente_docs_base SET estado = 'error', error = $3, updated_at = NOW() WHERE expediente_id = $1 AND tipo = $2`,
        [expedienteId, tipo, String(e?.message || e).slice(0, 500)]).catch(() => {});
    });
  }
}

export async function estadoDocsBase(organizacionId: string, expedienteId: string) {
  const { rows } = await pool.query(
    `SELECT d.tipo, d.estado, d.plantilla, d.file_id, d.pendientes, d.error, d.generado_at, f.original_name, f.document_name
       FROM expediente_docs_base d LEFT JOIN client_files f ON f.id = d.file_id
      WHERE d.expediente_id = $1 AND d.organizacion_id = $2`,
    [expedienteId, organizacionId],
  );
  const { rows: exp } = await pool.query(`SELECT * FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [expedienteId, organizacionId]);
  return Promise.all(DOCS_BASE.map(async ({ tipo, nombre }) => {
    const r = rows.find((x) => x.tipo === tipo);
    const plantilla = r?.plantilla || (await elegirPlantilla(organizacionId, tipo, exp[0]).catch(() => null)) || '';
    return {
      tipo, nombre,
      estado: r?.estado || 'pendiente',
      plantilla,
      plantillaNombre: plantilla ? await nombrePlantillaOrg(organizacionId, plantilla) : 'Sin plantilla',
      fileId: r?.file_id || null,
      archivo: r?.document_name || r?.original_name || null,
      pendientes: r?.pendientes ?? null,
      error: r?.error || null,
      generadoAt: r?.generado_at || null,
    };
  }));
}
