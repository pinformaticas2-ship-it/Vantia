import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { ensureFileOnDisk } from './filesController';
import { logActivityForReq, resolveUserName } from './activityController';
import { textoDeDocumento } from '../utils/textoDocumentos';

// ── Dosier del expediente para un proyecto de Claude (22/10/2026) ────────────
// GET /api/expedientes/:id/dosier-claude            → vista previa (JSON)
// GET /api/expedientes/:id/dosier-claude/descargar  → .md o .zip
// Un Markdown con todo lo que hay del expediente (datos, partes, plazos,
// citas, actuaciones, notas) y el TEXTO de sus documentos, para subirlo a un
// proyecto de claude.ai con la suscripción del despacho. No conecta Vantia con
// nada: el archivo lo descarga y lo sube la propia persona.
//
// 27/10/2026: el texto de cada adjunto se guarda (documento_textos) y se lee
// en paralelo, así que abrir el dosier por segunda vez es casi inmediato; los
// PDF escaneados y las imágenes van en el .zip tal cual (Claude sí los lee);
// y se recuerda la última descarga para avisar de lo que ha llegado después.

const MAX_POR_DOCUMENTO = 150_000; // caracteres; lo que pase se corta con aviso
const MAX_DOCUMENTOS = 80;          // los más recientes
const LECTURAS_A_LA_VEZ = 4;
const MAX_ORIGINAL = 30 * 1024 * 1024;   // límite de Claude por archivo
const MAX_ORIGINALES = 150 * 1024 * 1024; // lo que cabe en el .zip
const LEGIBLES_POR_CLAUDE = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];

const fecha = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const fechaHora = (d: any) => (d ? new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }) : '');
const limpio = (v: any) => String(v ?? '').trim();

export function instruccionesProyecto(ref: string, descripcion: string, archivo: string): string {
  return [
    `Eres el asistente del despacho para el expediente ${ref} «${descripcion}».`,
    `Toda la información del expediente está en el archivo «${archivo}» de este proyecto, sacado de Vantia (el programa de gestión del despacho) en la fecha que indica su cabecera. Si hay más archivos en el proyecto (documentos escaneados o imágenes), forman parte del mismo expediente.`,
    '',
    'Al responder:',
    '- Usa solo lo que consta en esos archivos. Si algo no consta, dilo claramente; no lo supongas.',
    '- Indica de dónde sale cada dato: el apartado o el nombre del documento, y su fecha.',
    '- Los plazos procesales y fechas de vencimiento recuérdalos tal como constan y recomienda confirmarlos en el expediente judicial.',
    '- Escribe en español, con lenguaje jurídico claro y sin rodeos.',
    '- Si te piden redactar un escrito, usa los datos del expediente (partes, juzgado, nº de autos, NIG) y marca entre [corchetes] lo que falte.',
    '- La información puede estar desactualizada: si la pregunta depende de algo reciente, recuerda que conviene descargar de nuevo el dosier desde Vantia.',
  ].join('\n');
}

/** Preguntas de partida que la ventana ofrece para copiar. */
export const PREGUNTAS_SUGERIDAS = [
  { titulo: 'Resumen', texto: 'Hazme un resumen del expediente: partes, qué se reclama, en qué punto está y qué es lo próximo que hay que hacer.' },
  { titulo: 'Cronología', texto: 'Ordena cronológicamente todo lo que ha pasado en el expediente, con la fecha y el documento o apartado de donde sale cada hecho.' },
  { titulo: 'Plazos', texto: '¿Qué plazos y vencimientos hay pendientes? Para cada uno, la fecha, qué hay que presentar o hacer y de dónde sale.' },
  { titulo: 'Fortalezas y riesgos', texto: 'Analiza los puntos fuertes y débiles de nuestra posición según los documentos, y qué falta para reforzarla.' },
  { titulo: 'Preguntas al cliente', texto: '¿Qué información o documentos deberíamos pedirle al cliente que no constan en el expediente?' },
  { titulo: 'Borrador de escrito', texto: 'Redacta un borrador de [tipo de escrito] para este expediente, con los datos de las partes, el juzgado y el nº de autos.' },
];

interface Documento { id: string; nombre: string; tipo: string; creado: any; original_name: string; stored_name: string; mimetype: string; storage_provider: string; drive_file_id: string; dropbox_file_id: string; size_bytes: number }
interface Lectura { texto?: string; aviso?: string }

/** Texto de un adjunto: del registro guardado si el archivo no ha cambiado; si no, se lee y se guarda. */
async function leerDocumento(expedienteId: string, d: Documento): Promise<Lectura> {
  const { rows } = await pool.query(`SELECT texto, aviso FROM documento_textos WHERE file_id = $1 AND stored_name = $2`, [d.id, d.stored_name]);
  if (rows[0]) return { texto: rows[0].texto ?? undefined, aviso: rows[0].aviso ?? undefined };
  const ruta = await ensureFileOnDisk(expedienteId, d.stored_name, d.storage_provider, d.drive_file_id, d.dropbox_file_id);
  // Sin guardar: puede que el archivo aparezca más tarde (nube, disco).
  if (!fs.existsSync(ruta)) return { aviso: 'archivo no encontrado' };
  const r = await textoDeDocumento(ruta, d.original_name, d.mimetype || '');
  const lectura: Lectura = 'aviso' in r ? { aviso: r.aviso } : { texto: r.texto };
  await pool.query(
    `INSERT INTO documento_textos (file_id, stored_name, texto, aviso) VALUES ($1, $2, $3, $4)
     ON CONFLICT (file_id) DO UPDATE SET stored_name = EXCLUDED.stored_name, texto = EXCLUDED.texto, aviso = EXCLUDED.aviso, updated_at = NOW()`,
    [d.id, d.stored_name, lectura.texto ?? null, lectura.aviso ?? null],
  ).catch(() => {});
  return lectura;
}

async function enParalelo<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const legiblePorClaude = (d: Documento) => LEGIBLES_POR_CLAUDE.includes(path.extname(d.original_name).toLowerCase()) || d.mimetype === 'application/pdf' || /^image\/(png|jpe?g|gif|webp)$/.test(d.mimetype || '');

/** Todo el dosier. Devuelve null si el expediente no es de este despacho. */
async function prepararDosier(id: string, organizacionId: string) {
  const { rows } = await pool.query(`SELECT * FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [id, organizacionId]);
  const e = rows[0];
  if (!e) return null;
  const ref = `${e.anio}/${e.num_exp}`;

  const [org, tareas, citas, actuaciones, notas, docs, totalDocs, ultima] = await Promise.all([
    pool.query(`SELECT nombre FROM organizaciones WHERE id = $1`, [organizacionId]),
    pool.query(`SELECT titulo, plazo, estado, prioridad FROM client_tasks
                 WHERE expediente_id = $1 AND organizacion_id = $2 AND estado <> 'completada' AND COALESCE(tipo, '') <> 'actuacion'
                 ORDER BY plazo NULLS LAST`, [id, organizacionId]),
    pool.query(`SELECT title, start_at, location FROM agenda_events
                 WHERE expediente_id = $1 AND organizacion_id = $2 ORDER BY start_at DESC LIMIT 50`, [id, organizacionId]).catch(() => ({ rows: [] as any[] })),
    pool.query(`SELECT titulo, COALESCE(plazo, created_at) AS fecha, COALESCE(NULLIF(descripcion, ''), notas) AS notas FROM client_tasks
                 WHERE expediente_id = $1 AND organizacion_id = $2 AND tipo = 'actuacion'
                 ORDER BY COALESCE(plazo, created_at) DESC`, [id, organizacionId]),
    pool.query(`SELECT content, category, created_at FROM notes WHERE expediente_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]).catch(() => ({ rows: [] as any[] })),
    pool.query(`SELECT id, stored_name, original_name, COALESCE(NULLIF(document_name, ''), original_name) AS nombre, attachment_type AS tipo, mimetype,
                       storage_provider, drive_file_id, dropbox_file_id, size_bytes, created_at AS creado
                  FROM client_files WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2`, [id, MAX_DOCUMENTOS]),
    pool.query(`SELECT COUNT(*)::int AS n FROM client_files WHERE client_id = $1`, [id]),
    pool.query(`SELECT created_at, user_name FROM dosier_claude_descargas WHERE expediente_id = $1 AND organizacion_id = $2 ORDER BY created_at DESC LIMIT 1`, [id, organizacionId]),
  ]);
  const documentos: Documento[] = docs.rows.reverse();
  const omitidos = Math.max(0, totalDocs.rows[0].n - documentos.length);

  const partes: string[] = [];
  const linea = (k: string, v: any) => { if (limpio(v)) partes.push(`- **${k}:** ${limpio(v)}`); };
  const md: string[] = [];
  md.push(`# Expediente ${ref} · ${limpio(e.descripcion) || 'Sin descripción'}`);
  md.push('');
  md.push(`Dosier sacado de Vantia (${limpio(org.rows[0]?.nombre)}) el ${fechaHora(new Date())}. Es una foto de ese momento: lo posterior no está aquí.`);

  md.push('', '## Datos');
  linea('Estado', e.estado); linea('Etapa', e.etapa); linea('Tipo', e.tipo); linea('Tipos de asunto', e.tipos_asunto);
  linea('Fecha de alta', fecha(e.fecha_inicio || e.created_at)); linea('Fecha de cierre', fecha(e.fecha_cierre)); linea('Referencia propia', e.ref_propia);
  md.push(...partes.splice(0));
  md.push('', '## Partes y profesionales');
  linea('Cliente', e.cliente_nombre); linea('Demandantes', e.demandantes); linea('Contrario', e.contrario); linea('Demandados', e.demandados);
  linea('Abogado propio', e.abogado_propio); linea('Abogado contrario', e.abogado_contrario);
  linea('Procurador propio', e.procurador); linea('Procurador contrario', e.procurador_contrario);
  linea('Persona de contacto', e.persona_contacto || e.contacto);
  md.push(...(partes.length ? partes.splice(0) : ['—']));
  md.push('', '## Procedimiento');
  linea('Juzgado / tribunal', e.juzgado); linea('Tipo de procedimiento', e.tipo_proc); linea('Nº de autos', e.num_autos); linea('NIG', e.nig);
  linea('Fecha de notificación', fecha(e.fecha_notificacion));
  md.push(...(partes.length ? partes.splice(0) : ['—']));
  md.push('', '## Cuantías');
  linea('Principal', e.cuantia_principal); linea('Intereses', e.intereses); linea('Costas', e.costas); linea('Total', e.cuantia_total);
  linea('Importe', e.importe); if (e.indeterminado) linea('Cuantía', 'indeterminada');
  md.push(...(partes.length ? partes.splice(0) : ['—']));
  if (limpio(e.observaciones)) md.push('', '## Observaciones', limpio(e.observaciones));

  md.push('', `## Plazos y tareas pendientes (${tareas.rows.length})`);
  md.push(...(tareas.rows.map((t: any) => `- ${t.plazo ? fecha(t.plazo) : 'Sin fecha'} · ${limpio(t.titulo)} · ${t.estado}${t.prioridad ? ` · prioridad ${t.prioridad}` : ''}`)));
  if (!tareas.rows.length) md.push('—');
  md.push('', '## Agenda del expediente');
  md.push(...(citas.rows.map((c: any) => `- ${fechaHora(c.start_at)} · ${limpio(c.title)}${limpio(c.location) ? ` · ${limpio(c.location)}` : ''}`)));
  if (!citas.rows.length) md.push('—');
  md.push('', `## Actuaciones (${actuaciones.rows.length})`);
  md.push(...(actuaciones.rows.map((a: any) => `- ${fecha(a.fecha)} · ${limpio(a.titulo)}${limpio(a.notas) ? `: ${limpio(a.notas)}` : ''}`)));
  if (!actuaciones.rows.length) md.push('—');
  md.push('', `## Notas (${notas.rows.length})`);
  md.push(...(notas.rows.map((n: any) => `- ${fecha(n.created_at)}${n.category && n.category !== 'general' ? ` [${n.category}]` : ''}: ${limpio(n.content)}`)));
  if (!notas.rows.length) md.push('—');

  // Documentos: índice y su texto (los sin texto que Claude sí puede leer van aparte, como originales)
  const lecturas = await enParalelo(documentos, LECTURAS_A_LA_VEZ, (d) =>
    leerDocumento(id, d).catch((err: any): Lectura => ({ aviso: `no se pudo leer: ${err?.message || 'error'}` })));
  const textos: string[] = [];
  const sinLeer: { doc: Documento; motivo: string; original: boolean }[] = [];
  documentos.forEach((d, k) => {
    const r = lecturas[k];
    const cab = `### ${limpio(d.nombre)}\n_${limpio(d.tipo) || 'Sin clasificar'} · añadido el ${fecha(d.creado)}_`;
    if (r.texto) {
      const corto = r.texto.length > MAX_POR_DOCUMENTO;
      textos.push(`${cab}\n\n${corto ? r.texto.slice(0, MAX_POR_DOCUMENTO) : r.texto}${corto ? `\n\n_[Documento recortado: tiene ${r.texto.length.toLocaleString('es-ES')} caracteres. El resto, en Vantia.]_` : ''}`);
    } else {
      const original = r.aviso !== 'archivo no encontrado' && legiblePorClaude(d) && Number(d.size_bytes || 0) <= MAX_ORIGINAL;
      sinLeer.push({ doc: d, motivo: r.aviso || 'sin texto', original });
    }
  });
  md.push('', `## Documentos (${totalDocs.rows[0].n})`);
  md.push(...documentos.map((d) => `- ${limpio(d.nombre)} · ${limpio(d.tipo) || 'Sin clasificar'} · ${fecha(d.creado)}`));
  if (omitidos) md.push(`- … y ${omitidos} más antiguos, que no están en este dosier (ábrelos en Vantia).`);
  if (!documentos.length) md.push('—');
  const originales = sinLeer.filter((s) => s.original);
  if (originales.length) md.push('', '**Van como archivo aparte** (escaneados o imágenes, Claude los lee directamente):', ...originales.map((s) => `- ${limpio(s.doc.nombre)}`));
  const fuera = sinLeer.filter((s) => !s.original);
  if (fuera.length) md.push('', '**Sin texto en este dosier** (ábrelos en Vantia):', ...fuera.map((s) => `- ${limpio(s.doc.nombre)} (${s.motivo})`));
  if (textos.length) md.push('', '## Texto de los documentos', '', textos.join('\n\n---\n\n'));

  // Lo que ha llegado desde la última descarga
  let novedades: any = null;
  if (ultima.rows[0]) {
    const desde = ultima.rows[0].created_at;
    const [nd, na] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM client_files WHERE client_id = $1 AND created_at > $2`, [id, desde]),
      pool.query(`SELECT COUNT(*)::int AS n FROM client_tasks WHERE expediente_id = $1 AND organizacion_id = $2 AND created_at > $3`, [id, organizacionId, desde]),
    ]);
    novedades = { desde, por: ultima.rows[0].user_name, documentos: nd.rows[0].n, tareas: na.rows[0].n };
  }

  const archivo = `Expediente ${ref.replace('/', '-')}.md`;
  return {
    e, ref, archivo,
    contenido: md.join('\n'),
    instrucciones: instruccionesProyecto(ref, limpio(e.descripcion) || ref, archivo),
    documentos: { total: totalDocs.rows[0].n, conTexto: textos.length, sinTexto: fuera.length, originales: originales.length, omitidos },
    originales: originales.map((s) => s.doc),
    novedades,
  };
}

export const getDosierClaude = async (req: any, res: Response) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, error: 'Expediente no válido.' });
  try {
    const d = await prepararDosier(id, req.organizacionId);
    if (!d) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    res.json({
      success: true,
      data: {
        archivo: d.archivo,
        contenido: d.contenido,
        instrucciones: d.instrucciones,
        documentos: d.documentos,
        originales: d.originales.map((o) => ({ nombre: limpio(o.nombre), bytes: Number(o.size_bytes || 0) })),
        novedades: d.novedades,
        preguntas: PREGUNTAS_SUGERIDAS,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'No se pudo preparar el dosier.' });
  }
};

/** Nombre de archivo sin caracteres que den problemas en Windows ni repetidos. */
function nombreUnico(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150) || 'documento';
  const ext = path.extname(base);
  let n = base; let k = 2;
  while (usados.has(n.toLowerCase())) n = `${base.slice(0, base.length - ext.length)} (${k++})${ext}`;
  usados.add(n.toLowerCase());
  return n;
}

// GET /api/expedientes/:id/dosier-claude/descargar?formato=zip|md
export const descargarDosierClaude = async (req: any, res: Response) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, error: 'Expediente no válido.' });
  try {
    const d = await prepararDosier(id, req.organizacionId);
    if (!d) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    const userId = req.auth?.userId || 'SYSTEM';
    await pool.query(
      `INSERT INTO dosier_claude_descargas (expediente_id, organizacion_id, user_id, user_name) VALUES ($1, $2, $3, $4)`,
      [id, req.organizacionId, userId, await resolveUserName(userId).catch(() => userId)],
    );
    await logActivityForReq(req, `Dosier para Claude del expediente ${d.ref}`, 'EXPEDIENTE', id, limpio(d.e.descripcion), 'EXPORT').catch(() => {});

    if (req.query.formato !== 'zip' || !d.originales.length) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.archivo)}`);
      return res.send(d.contenido);
    }
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const usados = new Set<string>([d.archivo.toLowerCase()]);
    zip.addFile(d.archivo, Buffer.from(d.contenido, 'utf8'));
    let total = 0;
    const fuera: string[] = [];
    for (const o of d.originales) {
      try {
        const ruta = await ensureFileOnDisk(id, o.stored_name, o.storage_provider, o.drive_file_id, o.dropbox_file_id);
        const tam = fs.statSync(ruta).size;
        if (tam > MAX_ORIGINAL || total + tam > MAX_ORIGINALES) { fuera.push(limpio(o.nombre)); continue; }
        total += tam;
        let nombre = limpio(o.nombre);
        if (!path.extname(nombre)) nombre += path.extname(o.original_name);
        zip.addFile(nombreUnico(nombre, usados), fs.readFileSync(ruta));
      } catch {
        fuera.push(limpio(o.nombre));
      }
    }
    if (fuera.length) zip.addFile('LEEME - no incluidos.txt', Buffer.from(`No caben en el .zip (o no se encontraron). Ábrelos en Vantia:\r\n${fuera.map((f) => `- ${f}`).join('\r\n')}\r\n`, 'utf8'));
    const nombreZip = d.archivo.replace(/\.md$/, '.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombreZip)}`);
    res.send(zip.toBuffer());
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ success: false, error: err?.message || 'No se pudo descargar el dosier.' });
  }
};
