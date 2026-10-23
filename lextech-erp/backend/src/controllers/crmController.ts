import { Request, Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import { resolveNextInternalNumber } from './entities';

// ── CRM: oportunidades (23/10/2026) ──────────────────────────────────────────
// Cada persona o empresa que contacta con el despacho y todavía no es cliente
// es una oportunidad. Avanza por etapas (contacto → consulta agendada →
// consulta hecha → propuesta enviada) hasta ganarse (se convierte en cliente)
// o perderse (con su motivo). Guarda quién la lleva, la próxima acción y todo
// lo que se ha hablado. Permiso: el del módulo Clientes (routes/crm.ts).

export const ETAPAS = ['contacto', 'consulta_agendada', 'consulta_hecha', 'propuesta_enviada', 'ganada', 'perdida'] as const;
export const ABIERTAS = ['contacto', 'consulta_agendada', 'consulta_hecha', 'propuesta_enviada'];
const ETIQUETA_ETAPA: Record<string, string> = {
  contacto: 'Contacto', consulta_agendada: 'Consulta agendada', consulta_hecha: 'Consulta hecha',
  propuesta_enviada: 'Propuesta enviada', ganada: 'Ganada', perdida: 'Perdida',
};
const ORIGENES = ['web', 'telefono', 'correo', 'whatsapp', 'redes', 'recomendacion', 'presencial', 'otro'];
const TIPOS_ACTIVIDAD = ['nota', 'llamada', 'correo', 'whatsapp', 'reunion'];

const ok = (res: Response, data: any, status = 200) => res.status(status).json({ success: true, data });
const fallo = (res: Response, error: string, status = 500) => res.status(status).json({ success: false, error });
const texto = (v: any, max = 5000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const esUuid = (v: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/** "1.200,50" (español), "1200,5", "1.200" (miles) y "1200.00" (como lo
 *  devuelve la base de datos) son todos importes válidos. */
export function importe(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).trim().replace(/\s|€/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
function fechaHora(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function quien(req: Request) {
  const userId = (req as any).auth?.userId as string;
  return { userId, nombre: await resolveUserName(userId).catch(() => userId) };
}

async function apuntar(req: Request, oportunidadId: string, tipo: string, textoActividad: string) {
  const { userId, nombre } = await quien(req);
  await pool.query(
    `INSERT INTO crm_actividades (oportunidad_id, organizacion_id, tipo, texto, user_id, user_name) VALUES ($1,$2,$3,$4,$5,$6)`,
    [oportunidadId, (req as any).organizacionId, tipo, textoActividad, userId, nombre],
  );
}

async function laOportunidad(req: Request, id: string) {
  if (!esUuid(id)) return null;
  const { rows } = await pool.query(
    `SELECT o.*, e.first_name AS cliente_nombre, e.last_name AS cliente_apellidos
       FROM crm_oportunidades o LEFT JOIN entities e ON e.id = o.cliente_id
      WHERE o.id = $1 AND o.organizacion_id = $2`,
    [id, (req as any).organizacionId],
  );
  return rows[0] || null;
}

/** GET /api/crm/oportunidades?q=&etapa=&mias=1&cerradas=1 */
export async function listarOportunidades(req: Request, res: Response) {
  try {
    const q = texto(req.query.q, 200);
    const etapa = ETAPAS.includes(String(req.query.etapa) as any) ? String(req.query.etapa) : null;
    const mias = req.query.mias === '1' ? (req as any).auth?.userId : null;
    // Las cerradas (ganadas/perdidas) solo de los últimos 90 días, salvo que se pidan todas
    const cerradas = req.query.cerradas === 'todas' ? 'todas' : '90';
    const { rows } = await pool.query(
      `SELECT o.*,
              (SELECT COUNT(*)::int FROM crm_actividades a WHERE a.oportunidad_id = o.id) AS n_actividades,
              (SELECT MAX(a.created_at) FROM crm_actividades a WHERE a.oportunidad_id = o.id) AS ultima_actividad_at
         FROM crm_oportunidades o
        WHERE o.organizacion_id = $1
          AND ($2::text IS NULL OR o.nombre ILIKE $2 OR o.asunto ILIKE $2 OR o.email ILIKE $2 OR o.telefono ILIKE $2 OR o.area ILIKE $2)
          AND ($3::text IS NULL OR o.etapa = $3)
          AND ($4::text IS NULL OR o.responsable_user_id = $4)
          AND (o.etapa NOT IN ('ganada','perdida') OR $5 = 'todas' OR o.cerrada_at > NOW() - INTERVAL '90 days')
        ORDER BY o.proxima_accion_at ASC NULLS LAST, o.updated_at DESC
        LIMIT 500`,
      [(req as any).organizacionId, q ? `%${q}%` : null, etapa, mias, cerradas],
    );
    return ok(res, rows);
  } catch (e: any) { return fallo(res, e.message); }
}

/** GET /api/crm/resumen — cifras del tablero. */
export async function resumenCrm(req: Request, res: Response) {
  try {
    const org = (req as any).organizacionId;
    const [porEtapa, conversion, porOrigen, vencidas] = await Promise.all([
      pool.query(`SELECT etapa, COUNT(*)::int AS n, COALESCE(SUM(valor_estimado), 0)::float AS valor
                    FROM crm_oportunidades WHERE organizacion_id = $1 AND etapa = ANY($2::text[]) GROUP BY etapa`, [org, ABIERTAS]),
      pool.query(`SELECT COUNT(*) FILTER (WHERE etapa = 'ganada')::int AS ganadas, COUNT(*) FILTER (WHERE etapa = 'perdida')::int AS perdidas
                    FROM crm_oportunidades WHERE organizacion_id = $1 AND cerrada_at > NOW() - INTERVAL '90 days'`, [org]),
      pool.query(`SELECT origen, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE etapa = 'ganada')::int AS ganadas
                    FROM crm_oportunidades WHERE organizacion_id = $1 AND created_at > NOW() - INTERVAL '365 days'
                   GROUP BY origen ORDER BY n DESC`, [org]),
      pool.query(`SELECT COUNT(*)::int AS n FROM crm_oportunidades
                   WHERE organizacion_id = $1 AND etapa = ANY($2::text[]) AND proxima_accion_at < NOW()`, [org, ABIERTAS]),
    ]);
    const abiertas = porEtapa.rows.reduce((s: number, r: any) => s + r.n, 0);
    const valor = porEtapa.rows.reduce((s: number, r: any) => s + Number(r.valor), 0);
    const { ganadas, perdidas } = conversion.rows[0];
    return ok(res, {
      abiertas, valorAbierto: valor, ganadas90: ganadas, perdidas90: perdidas,
      conversion90: ganadas + perdidas ? Math.round((ganadas / (ganadas + perdidas)) * 100) : null,
      seguimientosVencidos: vencidas.rows[0].n,
      porEtapa: porEtapa.rows, porOrigen: porOrigen.rows,
    });
  } catch (e: any) { return fallo(res, e.message); }
}

/** GET /api/crm/oportunidades/:id — con su historial. */
export async function verOportunidad(req: Request, res: Response) {
  try {
    const o = await laOportunidad(req, req.params.id);
    if (!o) return fallo(res, 'Oportunidad no encontrada.', 404);
    const { rows } = await pool.query(
      `SELECT * FROM crm_actividades WHERE oportunidad_id = $1 AND organizacion_id = $2 ORDER BY created_at DESC LIMIT 300`,
      [o.id, (req as any).organizacionId],
    );
    return ok(res, { ...o, actividades: rows });
  } catch (e: any) { return fallo(res, e.message); }
}

/** POST /api/crm/oportunidades */
export async function crearOportunidad(req: Request, res: Response) {
  const b = req.body || {};
  const nombre = texto(b.nombre, 200);
  if (!nombre) return fallo(res, 'Falta el nombre de la persona o empresa.', 400);
  try {
    const { userId, nombre: autor } = await quien(req);
    const responsable = esUuid(b.responsable_user_id) || /^user_/.test(String(b.responsable_user_id || '')) ? String(b.responsable_user_id) : userId;
    const responsableNombre = responsable === userId ? autor : (texto(b.responsable_nombre, 200) || await resolveUserName(responsable).catch(() => null));
    const { rows } = await pool.query(
      `INSERT INTO crm_oportunidades (organizacion_id, nombre, telefono, email, origen, asunto, area, valor_estimado,
                                      responsable_user_id, responsable_nombre, proxima_accion, proxima_accion_at, cliente_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [(req as any).organizacionId, nombre, texto(b.telefono, 40), texto(b.email, 200),
        ORIGENES.includes(b.origen) ? b.origen : 'otro', texto(b.asunto), texto(b.area, 120), importe(b.valor_estimado),
        responsable, responsableNombre, texto(b.proxima_accion, 500), fechaHora(b.proxima_accion_at),
        await clienteDelDespacho(req, b.cliente_id), userId],
    );
    await apuntar(req, rows[0].id, 'etapa', `Oportunidad creada (origen: ${rows[0].origen}).`);
    void logActivityForReq(req, `CRM: nueva oportunidad «${nombre}»`, 'CRM', rows[0].id, nombre).catch(() => {});
    return ok(res, rows[0], 201);
  } catch (e: any) { return fallo(res, e.message); }
}

async function clienteDelDespacho(req: Request, id: any): Promise<string | null> {
  if (!esUuid(id)) return null;
  const { rows } = await pool.query(`SELECT id FROM entities WHERE id = $1 AND organizacion_id = $2`, [id, (req as any).organizacionId]);
  return rows[0]?.id || null;
}

/** PUT /api/crm/oportunidades/:id — solo cambia lo que llega. Mover de etapa queda en el historial. */
export async function actualizarOportunidad(req: Request, res: Response) {
  try {
    const o = await laOportunidad(req, req.params.id);
    if (!o) return fallo(res, 'Oportunidad no encontrada.', 404);
    const b = req.body || {};
    const cambios: Record<string, any> = {};
    if ('nombre' in b) { const n = texto(b.nombre, 200); if (!n) return fallo(res, 'El nombre no puede quedar vacío.', 400); cambios.nombre = n; }
    for (const [k, max] of [['telefono', 40], ['email', 200], ['asunto', 5000], ['area', 120], ['proxima_accion', 500], ['motivo_perdida', 2000]] as [string, number][]) {
      if (k in b) cambios[k] = texto(b[k], max);
    }
    if ('origen' in b && ORIGENES.includes(b.origen)) cambios.origen = b.origen;
    if ('valor_estimado' in b) cambios.valor_estimado = importe(b.valor_estimado);
    if ('proxima_accion_at' in b) cambios.proxima_accion_at = fechaHora(b.proxima_accion_at);
    if ('cliente_id' in b) cambios.cliente_id = await clienteDelDespacho(req, b.cliente_id);
    if ('responsable_user_id' in b && b.responsable_user_id) {
      cambios.responsable_user_id = String(b.responsable_user_id).slice(0, 150);
      cambios.responsable_nombre = texto(b.responsable_nombre, 200) || await resolveUserName(cambios.responsable_user_id).catch(() => null);
    }
    let cambioEtapa: string | null = null;
    if ('etapa' in b && b.etapa !== o.etapa) {
      if (!ETAPAS.includes(b.etapa)) return fallo(res, 'Etapa no válida.', 400);
      if (b.etapa === 'perdida' && !texto(b.motivo_perdida) && !o.motivo_perdida) return fallo(res, 'Indica el motivo por el que se ha perdido.', 400);
      cambios.etapa = b.etapa;
      cambios.cerrada_at = b.etapa === 'ganada' || b.etapa === 'perdida' ? new Date().toISOString() : null;
      cambioEtapa = `${ETIQUETA_ETAPA[o.etapa]} → ${ETIQUETA_ETAPA[b.etapa]}${b.etapa === 'perdida' ? `. Motivo: ${texto(b.motivo_perdida) || o.motivo_perdida}` : ''}`;
    }
    if (!Object.keys(cambios).length) return ok(res, o);
    const cols = Object.keys(cambios);
    const { rows } = await pool.query(
      `UPDATE crm_oportunidades SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}, updated_at = NOW()
        WHERE id = $1 AND organizacion_id = $2 RETURNING *`,
      [o.id, (req as any).organizacionId, ...cols.map((c) => cambios[c])],
    );
    if (cambioEtapa) {
      await apuntar(req, o.id, 'etapa', cambioEtapa);
      void logActivityForReq(req, `CRM: «${rows[0].nombre}» ${cambioEtapa}`, 'CRM', o.id, rows[0].nombre).catch(() => {});
    }
    return ok(res, rows[0]);
  } catch (e: any) { return fallo(res, e.message); }
}

/** POST /api/crm/oportunidades/:id/actividades { tipo, texto } */
export async function anadirActividad(req: Request, res: Response) {
  try {
    const o = await laOportunidad(req, req.params.id);
    if (!o) return fallo(res, 'Oportunidad no encontrada.', 404);
    const t = texto(req.body?.texto);
    if (!t) return fallo(res, 'Escribe qué ha pasado.', 400);
    const tipo = TIPOS_ACTIVIDAD.includes(req.body?.tipo) ? req.body.tipo : 'nota';
    await apuntar(req, o.id, tipo, t);
    await pool.query(`UPDATE crm_oportunidades SET updated_at = NOW() WHERE id = $1`, [o.id]);
    const { rows } = await pool.query(`SELECT * FROM crm_actividades WHERE oportunidad_id = $1 ORDER BY created_at DESC LIMIT 1`, [o.id]);
    return ok(res, rows[0], 201);
  } catch (e: any) { return fallo(res, e.message); }
}

/** POST /api/crm/oportunidades/:id/convertir — crea el cliente (o enlaza uno
 *  existente) y marca la oportunidad como ganada. */
export async function convertirEnCliente(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  try {
    const o = await laOportunidad(req, req.params.id);
    if (!o) return fallo(res, 'Oportunidad no encontrada.', 404);
    let clienteId = o.cliente_id || await clienteDelDespacho(req, req.body?.cliente_id);
    let creado = false;
    if (!clienteId) {
      const { userId } = await quien(req);
      const numero = await resolveNextInternalNumber(pool, org);
      const { rows } = await pool.query(
        `INSERT INTO entities (internal_number, type, client_status, first_name, email, phone_1, organizacion_id, created_by, date_alta)
         VALUES ($1, 'CLIENTE', 'Alta', $2, $3, $4, $5, $6, CURRENT_DATE) RETURNING id`,
        [numero, o.nombre, o.email, o.telefono, org, userId],
      );
      clienteId = rows[0].id;
      creado = true;
    }
    const { rows } = await pool.query(
      `UPDATE crm_oportunidades SET etapa = 'ganada', cliente_id = $3, cerrada_at = COALESCE(cerrada_at, NOW()), updated_at = NOW()
        WHERE id = $1 AND organizacion_id = $2 RETURNING *`,
      [o.id, org, clienteId],
    );
    await apuntar(req, o.id, 'etapa', `${ETIQUETA_ETAPA[o.etapa]} → Ganada. ${creado ? 'Se ha dado de alta como cliente.' : 'Enlazada con su ficha de cliente.'}`);
    void logActivityForReq(req, `CRM: «${o.nombre}» convertida en cliente`, 'CLIENT', clienteId!, o.nombre).catch(() => {});
    return ok(res, { oportunidad: rows[0], clienteId, creado });
  } catch (e: any) { return fallo(res, e.message); }
}

/** DELETE /api/crm/oportunidades/:id — para las creadas por error. */
export async function borrarOportunidad(req: Request, res: Response) {
  try {
    const o = await laOportunidad(req, req.params.id);
    if (!o) return fallo(res, 'Oportunidad no encontrada.', 404);
    await pool.query(`DELETE FROM crm_oportunidades WHERE id = $1 AND organizacion_id = $2`, [o.id, (req as any).organizacionId]);
    void logActivityForReq(req, `CRM: oportunidad «${o.nombre}» eliminada`, 'CRM', o.id, o.nombre, 'DELETE').catch(() => {});
    return ok(res, { id: o.id });
  } catch (e: any) { return fallo(res, e.message); }
}
