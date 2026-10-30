import { Request, Response } from 'express';
import pool from '../config/database';
import { resolveUserName, logActivityForReq } from './activityController';
import { saveExpedienteAttachmentFromBuffer } from './filesController';
import { skillsActivas } from './skillsController';

// Documentos (30/10/2026): editor de texto de Vantia. El contenido es el HTML
// que produce TipTap en el navegador; aquí se guarda, se exporta a Word, se
// guarda como archivo en un expediente y la IA (Gemini) lo redacta siguiendo
// las skills del despacho y los datos reales del expediente.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_CONTENIDO = 2_000_000;

const ok = (res: Response, data: any, status = 200) => res.status(status).json({ success: true, data });
const fallo = (res: Response, error: string, status = 500) => res.status(status).json({ success: false, error });
const ctx = (req: Request) => ({ org: (req as any).organizacionId as string, userId: (req as any).auth?.userId as string });

const etiquetaExp = (e: any) => e
  ? `${e.ref_expediente || e.ref_propia || (e.anio && e.num_exp ? `${e.anio}/${e.num_exp}` : 'Expediente')}${e.descripcion ? ` — ${e.descripcion}` : ''}`
  : null;

/** El expediente existe y es de este despacho. */
async function expedienteDeLaOrg(org: string, id: any): Promise<string | null> {
  if (!id || !UUID_RE.test(String(id))) return null;
  const { rows } = await pool.query(`SELECT id FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [id, org]);
  return rows[0]?.id || null;
}

/** Quita lo que no debe llegar nunca al HTML guardado (TipTap ya filtra, pero el API es público para el navegador). */
export function limpiarHtml(html: string): string {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .slice(0, MAX_CONTENIDO);
}

const textoPlano = (html: string) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// GET /api/documentos?q=&expedienteId=
export async function listarDocumentos(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    const params: any[] = [org];
    let filtro = '';
    const q = String(req.query.q || '').trim();
    if (q) { params.push(`%${q}%`); filtro += ` AND (d.titulo ILIKE $${params.length} OR d.contenido ILIKE $${params.length})`; }
    const exp = String(req.query.expedienteId || '');
    if (exp && UUID_RE.test(exp)) { params.push(exp); filtro += ` AND d.expediente_id = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT d.id, d.titulo, d.expediente_id, d.updated_at, d.updated_by_name, d.created_by_name,
              LEFT(regexp_replace(d.contenido, '<[^>]+>', ' ', 'g'), 400) AS extracto,
              e.anio, e.num_exp, e.ref_expediente, e.ref_propia, e.descripcion
         FROM documentos d
         LEFT JOIN expedientes e ON e.id = d.expediente_id AND e.organizacion_id = d.organizacion_id
        WHERE d.organizacion_id = $1 ${filtro}
        ORDER BY d.updated_at DESC
        LIMIT 300`,
      params,
    );
    return ok(res, rows.map((r) => ({
      id: r.id, titulo: r.titulo, expedienteId: r.expediente_id, expediente: r.expediente_id ? etiquetaExp(r) : null,
      actualizado: r.updated_at, actualizadoPor: r.updated_by_name || r.created_by_name,
      extracto: String(r.extracto || '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160),
    })));
  } catch (e: any) { return fallo(res, e?.message || 'No se pudieron cargar los documentos'); }
}

async function leerDocumento(org: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await pool.query(
    `SELECT d.*, e.anio, e.num_exp, e.ref_expediente, e.ref_propia, e.descripcion
       FROM documentos d
       LEFT JOIN expedientes e ON e.id = d.expediente_id AND e.organizacion_id = d.organizacion_id
      WHERE d.id = $1 AND d.organizacion_id = $2`,
    [id, org],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, titulo: r.titulo, contenido: r.contenido, expedienteId: r.expediente_id,
    expediente: r.expediente_id ? etiquetaExp(r) : null, skillId: r.skill_id,
    creadoPor: r.created_by_name, actualizadoPor: r.updated_by_name, creado: r.created_at, actualizado: r.updated_at,
  };
}

// GET /api/documentos/:id
export async function verDocumento(req: Request, res: Response) {
  try {
    const d = await leerDocumento(ctx(req).org, req.params.id);
    if (!d) return fallo(res, 'Documento no encontrado.', 404);
    return ok(res, d);
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo abrir el documento'); }
}

// POST /api/documentos
export async function crearDocumento(req: Request, res: Response) {
  try {
    const { org, userId } = ctx(req);
    const b = req.body || {};
    const expedienteId = b.expedienteId ? await expedienteDeLaOrg(org, b.expedienteId) : null;
    if (b.expedienteId && !expedienteId) return fallo(res, 'Expediente no encontrado.', 404);
    const autor = await resolveUserName(userId).catch(() => null);
    const { rows } = await pool.query(
      `INSERT INTO documentos (organizacion_id, titulo, contenido, expediente_id, skill_id, created_by, created_by_name, updated_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
      [org, String(b.titulo || '').trim().slice(0, 300) || 'Documento sin título', limpiarHtml(b.contenido || ''),
        expedienteId, b.skillId && UUID_RE.test(b.skillId) ? b.skillId : null, userId, autor],
    );
    void logActivityForReq(req, `Documento creado: ${b.titulo || 'Documento sin título'}`, 'DOCUMENTO', rows[0].id).catch(() => {});
    return ok(res, await leerDocumento(org, rows[0].id), 201);
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo crear el documento'); }
}

// PUT /api/documentos/:id  (guardado automático del editor)
export async function actualizarDocumento(req: Request, res: Response) {
  try {
    const { org, userId } = ctx(req);
    if (!UUID_RE.test(req.params.id)) return fallo(res, 'Documento no encontrado.', 404);
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [req.params.id, org];
    if ('titulo' in b) { vals.push(String(b.titulo || '').trim().slice(0, 300) || 'Documento sin título'); sets.push(`titulo=$${vals.length}`); }
    if ('contenido' in b) { vals.push(limpiarHtml(b.contenido)); sets.push(`contenido=$${vals.length}`); }
    if ('expedienteId' in b) {
      const exp = b.expedienteId ? await expedienteDeLaOrg(org, b.expedienteId) : null;
      if (b.expedienteId && !exp) return fallo(res, 'Expediente no encontrado.', 404);
      vals.push(exp); sets.push(`expediente_id=$${vals.length}`);
    }
    if (!sets.length) return fallo(res, 'No hay cambios.', 400);
    vals.push(await resolveUserName(userId).catch(() => null)); sets.push(`updated_by_name=$${vals.length}`);
    const { rowCount } = await pool.query(
      `UPDATE documentos SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$1 AND organizacion_id=$2`, vals,
    );
    if (!rowCount) return fallo(res, 'Documento no encontrado.', 404);
    return ok(res, await leerDocumento(org, req.params.id));
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo guardar el documento'); }
}

// DELETE /api/documentos/:id
export async function borrarDocumento(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    if (!UUID_RE.test(req.params.id)) return fallo(res, 'Documento no encontrado.', 404);
    const { rows } = await pool.query(
      `DELETE FROM documentos WHERE id=$1 AND organizacion_id=$2 RETURNING titulo`, [req.params.id, org],
    );
    if (!rows.length) return fallo(res, 'Documento no encontrado.', 404);
    void logActivityForReq(req, `Documento borrado: ${rows[0].titulo}`, 'DOCUMENTO', req.params.id).catch(() => {});
    return ok(res, { borrado: true });
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo borrar el documento'); }
}

const nombreArchivo = (titulo: string) =>
  (String(titulo || 'Documento').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Documento');

/** HTML del editor → .docx (A4, márgenes de 2,5 cm, Times 12). */
export async function htmlADocx(titulo: string, html: string): Promise<Buffer> {
  // html-to-docx no trae tipos.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const HTMLtoDOCX = require('html-to-docx');
  // html-to-docx solo reconoce la cursiva como <i> (con <em> la pierde).
  const compatible = String(html || '<p></p>').replace(/<(\/?)em(\s[^>]*)?>/gi, '<$1i>');
  const cuerpo = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo.replace(/</g, '&lt;')}</title></head><body>${compatible}</body></html>`;
  const out = await HTMLtoDOCX(cuerpo, null, {
    title: titulo,
    font: 'Times New Roman',
    fontSize: 24, // medios puntos
    margins: { top: 1417, right: 1417, bottom: 1417, left: 1417 },
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(await (out as Blob).arrayBuffer());
}

// GET /api/documentos/:id/docx
export async function exportarDocx(req: Request, res: Response) {
  try {
    const d = await leerDocumento(ctx(req).org, req.params.id);
    if (!d) return fallo(res, 'Documento no encontrado.', 404);
    const buf = await htmlADocx(d.titulo, d.contenido);
    const nombre = `${nombreArchivo(d.titulo)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="documento.docx"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    return res.send(buf);
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo exportar a Word'); }
}

// POST /api/documentos/:id/guardar-en-expediente  → lo adjunta como .docx
export async function guardarEnExpediente(req: Request, res: Response) {
  try {
    const { org, userId } = ctx(req);
    const d = await leerDocumento(org, req.params.id);
    if (!d) return fallo(res, 'Documento no encontrado.', 404);
    const expedienteId = await expedienteDeLaOrg(org, req.body?.expedienteId || d.expedienteId);
    if (!expedienteId) return fallo(res, 'Elige el expediente donde guardarlo.', 400);
    const buf = await htmlADocx(d.titulo, d.contenido);
    const archivo = await saveExpedienteAttachmentFromBuffer(
      expedienteId, buf, `${nombreArchivo(d.titulo)}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', userId,
    );
    if (!d.expedienteId) {
      await pool.query(`UPDATE documentos SET expediente_id=$1 WHERE id=$2 AND organizacion_id=$3`, [expedienteId, d.id, org]);
    }
    void logActivityForReq(req, `Documento guardado en el expediente: ${d.titulo}`, 'EXPEDIENTE', expedienteId).catch(() => {});
    return ok(res, { archivoId: archivo?.id, expedienteId });
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo guardar en el expediente'); }
}

// ── IA ────────────────────────────────────────────────────────────────────

const CAMPOS_EXPEDIENTE: [string, string][] = [
  ['ref_expediente', 'Referencia'], ['ref_propia', 'Referencia propia'], ['descripcion', 'Asunto'], ['tipo', 'Tipo'],
  ['tipos_asunto', 'Materia'], ['estado', 'Estado'], ['etapa', 'Etapa'], ['juzgado', 'Juzgado'], ['tipo_proc', 'Procedimiento'],
  ['num_autos', 'Nº de autos'], ['nig', 'NIG'], ['demandantes', 'Demandantes'], ['demandados', 'Demandados'],
  ['contrario', 'Parte contraria'], ['procurador', 'Procurador'], ['procurador_contrario', 'Procurador contrario'],
  ['abogado_propio', 'Abogado propio'], ['abogado_contrario', 'Abogado contrario'], ['cuantia_principal', 'Cuantía principal'],
  ['intereses', 'Intereses'], ['costas', 'Costas'], ['cuantia_total', 'Cuantía total'], ['importe', 'Honorarios / importe'],
  ['fecha_inicio', 'Fecha de apertura'], ['fecha_notificacion', 'Fecha de notificación'], ['observaciones', 'Observaciones'],
];

const valor = (v: any) => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Datos reales del despacho, del expediente y de su cliente para la IA. */
export async function contextoParaRedactar(org: string, expedienteId: string | null): Promise<string> {
  const lineas: string[] = [];
  const { rows: o } = await pool.query(
    `SELECT nombre, nif_cif, direccion_fiscal, telefono, email_contacto, web FROM organizaciones WHERE id=$1`, [org],
  );
  if (o[0]) {
    const d = o[0];
    lineas.push(`DESPACHO: ${[d.nombre, d.nif_cif && `NIF ${d.nif_cif}`, d.direccion_fiscal, d.telefono, d.email_contacto, d.web].filter(Boolean).join(' · ')}`);
  }
  if (!expedienteId) return lineas.join('\n');
  const { rows } = await pool.query(`SELECT * FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [expedienteId, org]);
  const e = rows[0];
  if (!e) return lineas.join('\n');
  lineas.push('\nEXPEDIENTE:');
  if (e.anio && e.num_exp) lineas.push(`- Número: ${e.anio}/${e.num_exp}`);
  for (const [k, etiqueta] of CAMPOS_EXPEDIENTE) {
    const v = valor(e[k]);
    if (v) lineas.push(`- ${etiqueta}: ${v.slice(0, 1500)}`);
  }
  if (e.cliente_id) {
    const { rows: c } = await pool.query(`SELECT * FROM entities WHERE id=$1 AND organizacion_id=$2`, [e.cliente_id, org]);
    const cl = c[0];
    if (cl) {
      const nombre = cl.commercial_name || `${cl.first_name || ''} ${cl.last_name || ''}`.trim();
      const dir = [cl.address_street, cl.address_cp, cl.address_town, cl.address_province, cl.address_country].filter(Boolean).join(', ');
      lineas.push('\nCLIENTE:');
      lineas.push(`- Nombre: ${nombre || '—'}${cl.type ? ` (${cl.type})` : ''}`);
      if (cl.nif_cif) lineas.push(`- ${cl.document_type || 'NIF'}: ${cl.nif_cif}`);
      if (dir) lineas.push(`- Domicilio: ${dir}`);
      const tel = cl.phone_mobile || cl.phone_1;
      if (tel) lineas.push(`- Teléfono: ${tel}`);
      if (cl.email) lineas.push(`- Email: ${cl.email}`);
      if (cl.nationality) lineas.push(`- Nacionalidad: ${cl.nationality}`);
    }
  } else if (e.cliente_nombre) {
    lineas.push(`\nCLIENTE: ${e.cliente_nombre}`);
  }
  // Datos rellenados para las plantillas (MN Program): suelen ser los más completos.
  const { rows: pv } = await pool.query(
    `SELECT clave, valor FROM plantillas_valores WHERE organizacion_id=$1 AND expediente_id=$2 AND COALESCE(valor,'') <> '' LIMIT 200`,
    [org, expedienteId],
  ).catch(() => ({ rows: [] as any[] }));
  if (pv.length) {
    lineas.push('\nOTROS DATOS DEL EXPEDIENTE:');
    for (const r of pv) lineas.push(`- ${String(r.clave).replace(/_/g, ' ')}: ${String(r.valor).slice(0, 500)}`);
  }
  // Últimas actuaciones, para contar los hechos con fechas reales.
  const { rows: t } = await pool.query(
    `SELECT titulo, descripcion, estado, plazo, created_at FROM client_tasks
      WHERE expediente_id=$1 AND organizacion_id=$2 ORDER BY created_at DESC LIMIT 15`,
    [expedienteId, org],
  ).catch(() => ({ rows: [] as any[] }));
  if (t.length) {
    lineas.push('\nÚLTIMAS ACTUACIONES Y TAREAS:');
    for (const r of t) {
      lineas.push(`- ${valor(r.created_at)}: ${r.titulo || ''}${r.descripcion ? ` — ${String(r.descripcion).slice(0, 300)}` : ''} (${r.estado}${r.plazo ? `, plazo ${valor(r.plazo)}` : ''})`);
    }
  }
  return lineas.join('\n');
}

const INSTRUCCIONES_FORMATO = `FORMATO DE LA RESPUESTA (obligatorio):
- Devuelve SOLO el contenido del documento en HTML, sin explicaciones antes ni después y sin bloques \`\`\`.
- Etiquetas permitidas: h1, h2, h3, p, strong, em, u, ul, ol, li, blockquote, table, thead, tbody, tr, th, td, br, hr. Alineación con style="text-align: center|right|justify" en p y h1-h3. Nada de <html>, <head>, <body>, clases ni otros estilos.
- Párrafos de cuerpo justificados (style="text-align: justify") en escritos jurídicos.`;

async function llamarGemini(prompt: string): Promise<{ texto: string; uso: any }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw Object.assign(new Error('La IA no está configurada (falta GEMINI_API_KEY en el servidor).'), { status: 503 });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 16384 },
      }),
    },
  );
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    throw Object.assign(new Error(r.status === 429 ? 'La IA ha alcanzado su límite de uso por ahora. Prueba en un minuto.' : `Error de la IA: ${msg}`), { status: r.status === 429 ? 429 : 502 });
  }
  const texto = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  return { texto, uso: data?.usageMetadata };
}

/** Quita los ``` y lo que no sea el cuerpo, por si la IA no obedece del todo. */
export function htmlDeRespuesta(t: string): string {
  let s = String(t || '').trim();
  s = s.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(s);
  if (body) s = body[1];
  s = s.replace(/<\/?(html|head)[^>]*>/gi, '').replace(/<title>[\s\S]*?<\/title>/gi, '');
  // Si vino en texto plano, cada párrafo a <p>.
  if (!/<(p|h[1-6]|ul|ol|table|blockquote)\b/i.test(s)) {
    s = s.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
  }
  return limpiarHtml(s);
}

// POST /api/documentos/generar
// { modo: 'nuevo'|'reescribir'|'continuar', instrucciones, skillId?, expedienteId?, documentoHtml?, seleccion? }
export async function generarConIa(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    const b = req.body || {};
    const modo = ['nuevo', 'reescribir', 'continuar'].includes(b.modo) ? b.modo : 'nuevo';
    const instrucciones = String(b.instrucciones || '').trim().slice(0, 8000);
    const expedienteId = b.expedienteId ? await expedienteDeLaOrg(org, b.expedienteId) : null;
    if (b.expedienteId && !expedienteId) return fallo(res, 'Expediente no encontrado.', 404);

    const skills = await skillsActivas(org);
    const estilo = skills.filter((s) => s.categoria === 'estilo');
    const elegida = b.skillId ? skills.find((s) => s.id === b.skillId) : null;
    if (b.skillId && !elegida) return fallo(res, 'Esa skill no existe o está desactivada.', 404);
    if (modo === 'nuevo' && !instrucciones && !elegida) return fallo(res, 'Dile a la IA qué quieres redactar o elige una skill.', 400);

    const partes: string[] = [
      'Eres el redactor jurídico del despacho dentro de Vantia, un ERP para despachos de abogados en España. Redactas con calidad profesional, listo para revisar y firmar.',
    ];
    if (estilo.length) partes.push(`ESTILO DEL DESPACHO (aplícalo siempre):\n${estilo.map((s) => s.instrucciones).join('\n\n')}`);
    if (elegida) partes.push(`SKILL ELEGIDA — «${elegida.nombre}». Síguela al pie de la letra:\n${elegida.instrucciones}`);
    const contexto = await contextoParaRedactar(org, expedienteId);
    if (contexto) partes.push(`DATOS REALES (úsalos; lo que no esté aquí, déjalo como [●]):\n${contexto}`);

    const documentoTexto = textoPlano(b.documentoHtml || '').slice(0, 60_000);
    if (modo === 'nuevo') {
      partes.push(`TAREA: redacta el documento completo.${instrucciones ? `\nIndicaciones del usuario: ${instrucciones}` : ''}`);
    } else if (modo === 'reescribir') {
      const sel = String(b.seleccion || '').trim().slice(0, 30_000);
      if (!sel) return fallo(res, 'Selecciona el texto que quieres que cambie la IA.', 400);
      partes.push(`DOCUMENTO COMPLETO (solo de contexto):\n${documentoTexto}`);
      partes.push(`TAREA: reescribe ÚNICAMENTE este fragmento y devuelve solo el fragmento nuevo (no el documento entero).\nFragmento:\n${sel}\n\nCómo cambiarlo: ${instrucciones || 'mejóralo: más claro, preciso y correcto, con el mismo sentido.'}`);
    } else {
      partes.push(`DOCUMENTO HASTA AHORA:\n${documentoTexto || '(vacío)'}`);
      partes.push(`TAREA: continúa el documento desde donde termina, sin repetir lo que ya está. Devuelve solo lo nuevo.${instrucciones ? `\nIndicaciones: ${instrucciones}` : ''}`);
    }
    partes.push(INSTRUCCIONES_FORMATO);

    const { texto, uso } = await llamarGemini(partes.join('\n\n'));
    const html = htmlDeRespuesta(texto);
    if (!textoPlano(html)) return fallo(res, 'La IA no ha devuelto texto. Prueba a darle más detalles.', 502);

    pool.query(
      `INSERT INTO vantia_usage_daily (usage_date, requests, prompt_tokens, completion_tokens, total_tokens)
       VALUES (CURRENT_DATE, 1, $1, $2, $3)
       ON CONFLICT (usage_date) DO UPDATE SET
         requests = vantia_usage_daily.requests + 1,
         prompt_tokens = vantia_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
         completion_tokens = vantia_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
         total_tokens = vantia_usage_daily.total_tokens + EXCLUDED.total_tokens`,
      [uso?.promptTokenCount || 0, uso?.candidatesTokenCount || 0, uso?.totalTokenCount || 0],
    ).catch(() => {});

    // Título sugerido para documentos nuevos: el primer encabezado.
    const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
    const tituloSugerido = modo === 'nuevo' ? (textoPlano(h?.[1] || '') || elegida?.nombre || '').slice(0, 300) : null;
    return ok(res, { html, tituloSugerido, skill: elegida?.nombre || null });
  } catch (e: any) {
    return fallo(res, e?.message || 'No se pudo generar con la IA', e?.status || 500);
  }
}

/** Para Chat IA: crea un documento con lo que ha redactado y devuelve dónde abrirlo. */
export async function crearDocumentoDesdeChat(org: string, userId: string, titulo: string, contenidoHtml: string, expedienteId?: string | null) {
  const exp = expedienteId ? await expedienteDeLaOrg(org, expedienteId) : null;
  const autor = await resolveUserName(userId).catch(() => null);
  const { rows } = await pool.query(
    `INSERT INTO documentos (organizacion_id, titulo, contenido, expediente_id, created_by, created_by_name, updated_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id, titulo`,
    [org, String(titulo || '').trim().slice(0, 300) || 'Documento sin título', htmlDeRespuesta(contenidoHtml), exp, userId, autor],
  );
  return { id: rows[0].id, titulo: rows[0].titulo, url: `/dashboard/documentos/${rows[0].id}`, expedienteVinculado: Boolean(exp) };
}
