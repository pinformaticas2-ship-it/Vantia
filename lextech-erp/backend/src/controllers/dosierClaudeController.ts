import { Response } from 'express';
import fs from 'fs';
import pool from '../config/database';
import { ensureFileOnDisk } from './filesController';
import { logActivityForReq } from './activityController';
import { textoDeDocumento } from '../utils/textoDocumentos';

// ── Dosier del expediente para un proyecto de Claude (22/10/2026) ────────────
// GET /api/expedientes/:id/dosier-claude
// Un único archivo Markdown con todo lo que hay del expediente (datos, partes,
// plazos, citas, actuaciones, notas) y el TEXTO de sus documentos, para
// subirlo a un proyecto de claude.ai con la suscripción del despacho. No
// conecta Vantia con nada: el archivo lo descarga y lo sube la propia persona.
// Devuelve también las instrucciones del proyecto, listas para pegar.

const MAX_POR_DOCUMENTO = 150_000; // caracteres; lo que pase se corta con aviso
const MAX_DOCUMENTOS = 80;

const fecha = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const fechaHora = (d: any) => (d ? new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }) : '');
const limpio = (v: any) => String(v ?? '').trim();

export function instruccionesProyecto(ref: string, descripcion: string, archivo: string): string {
  return [
    `Eres el asistente del despacho para el expediente ${ref} «${descripcion}».`,
    `Toda la información del expediente está en el archivo «${archivo}» de este proyecto, sacado de Vantia (el programa de gestión del despacho) en la fecha que indica su cabecera.`,
    '',
    'Al responder:',
    '- Usa solo lo que consta en ese archivo. Si algo no consta, dilo claramente; no lo supongas.',
    '- Indica de dónde sale cada dato: el apartado o el nombre del documento, y su fecha.',
    '- Los plazos procesales y fechas de vencimiento recuérdalos tal como constan y recomienda confirmarlos en el expediente judicial.',
    '- Escribe en español, con lenguaje jurídico claro y sin rodeos.',
    '- Si te piden redactar un escrito, usa los datos del expediente (partes, juzgado, nº de autos, NIG) y marca entre [corchetes] lo que falte.',
    '- La información puede estar desactualizada: si la pregunta depende de algo reciente, recuerda que conviene descargar de nuevo el dosier desde Vantia.',
  ].join('\n');
}

export const getDosierClaude = async (req: any, res: Response) => {
  const { id } = req.params;
  const organizacionId = req.organizacionId;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, error: 'Expediente no válido.' });
  try {
    const { rows } = await pool.query(`SELECT * FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [id, organizacionId]);
    const e = rows[0];
    if (!e) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    const ref = `${e.anio}/${e.num_exp}`;

    const [org, tareas, citas, actuaciones, notas, docs] = await Promise.all([
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
      pool.query(`SELECT id, stored_name, original_name, document_name, attachment_type, mimetype, storage_provider, drive_file_id, dropbox_file_id, created_at
                    FROM client_files WHERE client_id = $1 ORDER BY created_at ASC LIMIT $2`, [id, MAX_DOCUMENTOS]),
    ]);

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

    // Documentos: índice y su texto
    const sinLeer: string[] = [];
    const textos: string[] = [];
    for (const d of docs.rows) {
      const nombre = limpio(d.document_name) || limpio(d.original_name);
      const cab = `### ${nombre}\n_${limpio(d.attachment_type) || 'Sin clasificar'} · añadido el ${fecha(d.created_at)}_`;
      try {
        const ruta = await ensureFileOnDisk(id, d.stored_name, d.storage_provider, d.drive_file_id, d.dropbox_file_id);
        if (!fs.existsSync(ruta)) { sinLeer.push(`${nombre} (archivo no encontrado)`); continue; }
        const r = await textoDeDocumento(ruta, d.original_name, d.mimetype || '');
        if ('aviso' in r) { sinLeer.push(`${nombre} (${r.aviso})`); continue; }
        const corto = r.texto.length > MAX_POR_DOCUMENTO;
        textos.push(`${cab}\n\n${corto ? r.texto.slice(0, MAX_POR_DOCUMENTO) : r.texto}${corto ? `\n\n_[Documento recortado: tiene ${r.texto.length.toLocaleString('es-ES')} caracteres. El resto, en Vantia.]_` : ''}`);
      } catch (err: any) {
        sinLeer.push(`${nombre} (no se pudo leer: ${err?.message || 'error'})`);
      }
    }
    md.push('', `## Documentos (${docs.rows.length})`);
    md.push(...docs.rows.map((d: any) => `- ${limpio(d.document_name) || limpio(d.original_name)} · ${limpio(d.attachment_type) || 'Sin clasificar'} · ${fecha(d.created_at)}`));
    if (!docs.rows.length) md.push('—');
    if (sinLeer.length) md.push('', '**Sin texto en este dosier** (ábrelos en Vantia):', ...sinLeer.map((s) => `- ${s}`));
    if (textos.length) md.push('', '## Texto de los documentos', '', textos.join('\n\n---\n\n'));

    const archivo = `Expediente ${ref.replace('/', '-')}.md`;
    await logActivityForReq(req, `Dosier para Claude del expediente ${ref}`, 'EXPEDIENTE', id, limpio(e.descripcion), 'EXPORT').catch(() => {});
    res.json({
      success: true,
      data: {
        archivo,
        contenido: md.join('\n'),
        instrucciones: instruccionesProyecto(ref, limpio(e.descripcion) || ref, archivo),
        documentos: { total: docs.rows.length, conTexto: textos.length, sinTexto: sinLeer.length },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'No se pudo preparar el dosier.' });
  }
};
