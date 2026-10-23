import { Request, Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import { resolveNextInternalNumber } from './entities';
import { sendPushToUser } from '../utils/webPush';
import { tomarTurno, soltarTurno } from '../utils/turnos';

// ── CRM: oportunidades (23/10/2026) ──────────────────────────────────────────
// Cada persona o empresa que contacta con el despacho y aún no es cliente es
// una oportunidad. Estructura como la del CRM de GoHighLevel que usaba el
// despacho ("Escala tu despacho"):
// - Embudos con sus etapas, configurables. Por defecto, el "Pipeline" de 13
//   etapas del despacho.
// - Estado aparte de la etapa: abierta, ganada, perdida o abandonada. Entrar
//   en una etapa de tipo ganada/perdida cambia el estado.
// - Reglas por etapa (lo que allí hacían los flujos de trabajo): avisar al
//   responsable, poner la próxima acción y, si sigue en la etapa N horas sin
//   moverse, pasarla a otra (p. ej. "No respondió" → "No respondió (48h)").
// - Etiquetas y un cuestionario de captación configurable (campos).
// Permiso: el del módulo Clientes (routes/crm.ts).

export const ESTADOS = ['abierta', 'ganada', 'perdida', 'abandonada'] as const;
const ORIGENES = ['web', 'facebook', 'instagram', 'formulario', 'telefono', 'correo', 'whatsapp', 'recomendacion', 'presencial', 'otro'];
const TIPOS_ACTIVIDAD = ['nota', 'llamada', 'correo', 'whatsapp', 'reunion'];
const TIPOS_CAMPO = ['opcion', 'texto', 'fecha', 'numero'];

// El "Pipeline" del despacho, tal cual estaba en GoHighLevel.
type EtapaInicial = { nombre: string; tipo?: 'abierta' | 'ganada' | 'perdida'; color: string; aviso?: boolean; accion?: [string, number]; mover?: [number, string] };
export const ETAPAS_INICIALES: EtapaInicial[] = [
  { nombre: 'Nuevo lead', color: 'slate', aviso: true, accion: ['Primer contacto con el cliente', 0] },
  { nombre: 'Primer Contacto - No respondió', color: 'amber', accion: ['Volver a intentar el contacto', 24], mover: [48, 'Primer Contacto – No Respondió (48h)'] },
  { nombre: 'Primer Contacto - Respondió', color: 'sky', accion: ['Proponer una reunión', 24] },
  { nombre: 'Primer Contacto – No Respondió (48h)', color: 'amber', accion: ['Último intento de contacto', 0] },
  { nombre: 'Reunión agendada', color: 'indigo' },
  { nombre: 'Reunión Realizada – En Evaluación', color: 'violet', accion: ['Enviar la propuesta', 24] },
  { nombre: 'Seguimiento', color: 'sky' },
  { nombre: 'Llamada de seguimiento', color: 'sky', accion: ['Llamada de seguimiento', 0] },
  { nombre: 'Propuesta enviada', color: 'orange', accion: ['Llamar para confirmar la propuesta', 72] },
  { nombre: 'Hoja de encargo firmada', tipo: 'ganada', color: 'emerald', aviso: true },
  { nombre: 'Valoración Jurídico', color: 'teal' },
  { nombre: 'Valoración trabajador social', color: 'teal' },
  { nombre: 'No interesado', tipo: 'perdida', color: 'rose' },
];
// Las preguntas del formulario de captación del despacho.
export const CAMPOS_INICIALES: { nombre: string; opciones: string[] }[] = [
  { nombre: '¿Para cuándo necesitas resolver esta situación?', opciones: ['Lo antes posible (urgente, menos de 1 mes)', 'En los próximos 2-3 meses', 'A medio plazo (más de 6 meses)', 'Solo quiero información por ahora'] },
  { nombre: '¿Existe ya alguna medida de apoyo vigente?', opciones: ['Sí, curatela o guarda de hecho', 'Sí, poderes preventivos', 'No, no hay ninguna medida todavía', 'No lo sé'] },
  { nombre: '¿Qué tipo de apoyo crees que necesita ahora mismo?', opciones: ['Gestionar patrimonio o cuentas bancarias', 'Tomar decisiones médicas', 'Autorizar ventas o herencias', 'Representación legal amplia (curatela)', 'No estoy seguro/a, necesito orientación'] },
  { nombre: '¿La persona con discapacidad tiene reconocida oficialmente su discapacidad?', opciones: ['Sí, con certificado oficial', 'Sí, pero sin certificado oficial', 'No, aún no se ha tramitado', 'No lo sé'] },
  { nombre: '¿Cuál es la relación que tienes con la persona con discapacidad?', opciones: ['Padre/madre', 'Hermano/a', 'Hijo/a', 'Otro familiar cercano', 'Tutor/representante legal'] },
];
// Etapas de la primera versión del CRM → las del Pipeline.
const ETAPA_ANTIGUA: Record<string, string> = {
  contacto: 'Nuevo lead', consulta_agendada: 'Reunión agendada', consulta_hecha: 'Reunión Realizada – En Evaluación',
  propuesta_enviada: 'Propuesta enviada', ganada: 'Hoja de encargo firmada', perdida: 'No interesado',
};

const ok = (res: Response, data: any, status = 200) => res.status(status).json({ success: true, data });
const fallo = (res: Response, error: string, status = 500) => res.status(status).json({ success: false, error });
const texto = (v: any, max = 5000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const esUuid = (v: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const horas = (v: any) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 24 * 365 ? Math.round(n) : null; };

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
function etiquetas(v: any): string[] {
  const lista = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(lista.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

async function quien(req: Request) {
  const userId = (req as any).auth?.userId as string;
  return { userId, nombre: await resolveUserName(userId).catch(() => userId) };
}

async function apuntar(org: string, oportunidadId: string, tipo: string, textoActividad: string, autor: { userId: string | null; nombre: string | null }) {
  await pool.query(
    `INSERT INTO crm_actividades (oportunidad_id, organizacion_id, tipo, texto, user_id, user_name) VALUES ($1,$2,$3,$4,$5,$6)`,
    [oportunidadId, org, tipo, textoActividad, autor.userId, autor.nombre],
  );
}

// ── Embudo por defecto ──────────────────────────────────────────────────────

/** La primera vez que un despacho usa el CRM: crea el Pipeline y el
 *  cuestionario, y pasa las oportunidades de la primera versión a sus etapas. */
export async function asegurarEmbudos(org: string): Promise<void> {
  const { rows } = await pool.query(`SELECT 1 FROM crm_embudos WHERE organizacion_id = $1 LIMIT 1`, [org]);
  if (rows.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`crm-embudo:${org}`]);
    const ya = await client.query(`SELECT 1 FROM crm_embudos WHERE organizacion_id = $1 LIMIT 1`, [org]);
    if (!ya.rows.length) {
      const embudo = (await client.query(`INSERT INTO crm_embudos (organizacion_id, nombre) VALUES ($1, 'Pipeline') RETURNING id`, [org])).rows[0].id;
      const ids = new Map<string, string>();
      for (const [i, e] of ETAPAS_INICIALES.entries()) {
        const id = (await client.query(
          `INSERT INTO crm_etapas (embudo_id, organizacion_id, nombre, orden, tipo, color, aviso_responsable, accion_texto, accion_horas, mover_horas)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [embudo, org, e.nombre, i, e.tipo || 'abierta', e.color, !!e.aviso, e.accion?.[0] || null, e.accion?.[1] ?? null, e.mover?.[0] ?? null],
        )).rows[0].id;
        ids.set(e.nombre, id);
      }
      for (const e of ETAPAS_INICIALES) {
        if (e.mover) await client.query(`UPDATE crm_etapas SET mover_a_etapa_id = $1 WHERE id = $2`, [ids.get(e.mover[1]), ids.get(e.nombre)]);
      }
      for (const [i, c] of CAMPOS_INICIALES.entries()) {
        await client.query(`INSERT INTO crm_campos (organizacion_id, nombre, tipo, opciones, orden) VALUES ($1,$2,'opcion',$3,$4)`, [org, c.nombre, JSON.stringify(c.opciones), i]);
      }
      for (const [antigua, nueva] of Object.entries(ETAPA_ANTIGUA)) {
        await client.query(
          `UPDATE crm_oportunidades SET embudo_id = $1, etapa_id = $2,
                  estado = CASE $3 WHEN 'ganada' THEN 'ganada' WHEN 'perdida' THEN 'perdida' ELSE 'abierta' END
            WHERE organizacion_id = $4 AND etapa_id IS NULL AND etapa = $3`,
          [embudo, ids.get(nueva), antigua, org],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function etapaDelDespacho(org: string, id: any) {
  if (!esUuid(id)) return null;
  const { rows } = await pool.query(`SELECT * FROM crm_etapas WHERE id = $1 AND organizacion_id = $2`, [id, org]);
  return rows[0] || null;
}

/** Al entrar en una etapa: estado según su tipo y sus reglas (próxima acción y
 *  aviso al responsable). Devuelve los cambios a guardar en la oportunidad. */
function alEntrarEn(etapa: any): Record<string, any> {
  const cambios: Record<string, any> = { etapa_id: etapa.id, embudo_id: etapa.embudo_id, etapa_desde: new Date().toISOString() };
  if (etapa.tipo === 'ganada') { cambios.estado = 'ganada'; cambios.cerrada_at = new Date().toISOString(); }
  else if (etapa.tipo === 'perdida') { cambios.estado = 'perdida'; cambios.cerrada_at = new Date().toISOString(); }
  else { cambios.estado = 'abierta'; cambios.cerrada_at = null; } // sacarla de una etapa final la reabre
  if (etapa.accion_texto) {
    cambios.proxima_accion = etapa.accion_texto;
    cambios.proxima_accion_at = new Date(Date.now() + (etapa.accion_horas || 0) * 3600_000).toISOString();
  }
  return cambios;
}

function avisarResponsable(o: any, etapa: any) {
  if (!etapa.aviso_responsable || !o.responsable_user_id) return;
  void sendPushToUser(o.responsable_user_id, {
    title: `CRM: ${o.nombre}`,
    body: `Ha pasado a «${etapa.nombre}».${etapa.accion_texto ? ` Siguiente: ${etapa.accion_texto}.` : ''}`,
    url: `/dashboard/crm?o=${o.id}`,
    tag: `crm-${o.id}`,
  }).catch(() => {});
}

async function guardarCambios(org: string, id: string, cambios: Record<string, any>) {
  const cols = Object.keys(cambios);
  const { rows } = await pool.query(
    `UPDATE crm_oportunidades SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}, updated_at = NOW()
      WHERE id = $1 AND organizacion_id = $2 RETURNING *`,
    [id, org, ...cols.map((c) => cambios[c])],
  );
  return rows[0];
}

async function laOportunidad(req: Request, id: string) {
  if (!esUuid(id)) return null;
  const { rows } = await pool.query(`SELECT * FROM crm_oportunidades WHERE id = $1 AND organizacion_id = $2`, [id, (req as any).organizacionId]);
  return rows[0] || null;
}

// ── Configuración: embudos, etapas y cuestionario ───────────────────────────

/** GET /api/crm/config */
export async function verConfig(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  try {
    await asegurarEmbudos(org);
    const [embudos, etapas, campos] = await Promise.all([
      pool.query(`SELECT id, nombre, orden FROM crm_embudos WHERE organizacion_id = $1 ORDER BY orden, created_at`, [org]),
      pool.query(`SELECT * FROM crm_etapas WHERE organizacion_id = $1 ORDER BY orden`, [org]),
      pool.query(`SELECT * FROM crm_campos WHERE organizacion_id = $1 ORDER BY orden`, [org]),
    ]);
    return ok(res, {
      embudos: embudos.rows.map((e: any) => ({ ...e, etapas: etapas.rows.filter((s: any) => s.embudo_id === e.id) })),
      campos: campos.rows,
    });
  } catch (e: any) { return fallo(res, e.message); }
}

/** POST /api/crm/embudos { nombre } — con unas etapas básicas para empezar. */
export async function crearEmbudo(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  const nombre = texto(req.body?.nombre, 120);
  if (!nombre) return fallo(res, 'Ponle nombre al embudo.', 400);
  try {
    await asegurarEmbudos(org);
    const orden = (await pool.query(`SELECT COALESCE(MAX(orden), 0) + 1 AS o FROM crm_embudos WHERE organizacion_id = $1`, [org])).rows[0].o;
    const id = (await pool.query(`INSERT INTO crm_embudos (organizacion_id, nombre, orden) VALUES ($1,$2,$3) RETURNING id`, [org, nombre, orden])).rows[0].id;
    for (const [i, [n, tipo, color]] of [['Nuevo lead', 'abierta', 'slate'], ['En curso', 'abierta', 'sky'], ['Ganada', 'ganada', 'emerald'], ['Perdida', 'perdida', 'rose']].entries()) {
      await pool.query(`INSERT INTO crm_etapas (embudo_id, organizacion_id, nombre, orden, tipo, color) VALUES ($1,$2,$3,$4,$5,$6)`, [id, org, n, i, tipo, color]);
    }
    void logActivityForReq(req, `CRM: nuevo embudo «${nombre}»`, 'CRM', id, nombre).catch(() => {});
    return ok(res, { id }, 201);
  } catch (e: any) { return fallo(res, e.message); }
}

/** PUT /api/crm/embudos/:id { nombre?, etapas: [...] } — guarda el embudo
 *  entero: renombra, reordena, añade y quita etapas (no las que tengan
 *  oportunidades) y sus reglas. */
export async function guardarEmbudo(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  const embudoId = req.params.id;
  if (!esUuid(embudoId)) return fallo(res, 'Embudo no válido.', 400);
  const lista: any[] = Array.isArray(req.body?.etapas) ? req.body.etapas : [];
  if (!lista.length) return fallo(res, 'El embudo necesita al menos una etapa.', 400);
  if (lista.some((e) => !texto(e?.nombre, 120))) return fallo(res, 'Todas las etapas necesitan nombre.', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const emb = await client.query(`SELECT id FROM crm_embudos WHERE id = $1 AND organizacion_id = $2 FOR UPDATE`, [embudoId, org]);
    if (!emb.rows.length) { await client.query('ROLLBACK'); return fallo(res, 'Embudo no encontrado.', 404); }
    if (texto(req.body?.nombre, 120)) await client.query(`UPDATE crm_embudos SET nombre = $1 WHERE id = $2`, [texto(req.body.nombre, 120), embudoId]);
    const actuales = (await client.query(`SELECT id FROM crm_etapas WHERE embudo_id = $1`, [embudoId])).rows.map((r: any) => r.id);
    const quedan = new Set(lista.map((e) => e.id).filter((id) => actuales.includes(id)));
    const quitar = actuales.filter((id: string) => !quedan.has(id));
    if (quitar.length) {
      const usadas = await client.query(`SELECT COUNT(*)::int AS n FROM crm_oportunidades WHERE etapa_id = ANY($1::uuid[])`, [quitar]);
      if (usadas.rows[0].n) {
        await client.query('ROLLBACK');
        return fallo(res, `Hay ${usadas.rows[0].n} oportunidades en las etapas que quieres quitar. Muévelas antes a otra etapa.`, 409);
      }
      await client.query(`DELETE FROM crm_etapas WHERE id = ANY($1::uuid[])`, [quitar]);
    }
    // Primero se guardan todas (las nuevas reciben id) y luego las reglas que apuntan a otra etapa
    const idDe = new Map<string, string>();
    for (const [i, e] of lista.entries()) {
      const valores = [texto(e.nombre, 120), i, ['abierta', 'ganada', 'perdida'].includes(e.tipo) ? e.tipo : 'abierta', texto(e.color, 20),
        !!e.aviso_responsable, texto(e.accion_texto, 300), horas(e.accion_horas), horas(e.mover_horas)];
      if (quedan.has(e.id)) {
        await client.query(
          `UPDATE crm_etapas SET nombre=$2, orden=$3, tipo=$4, color=$5, aviso_responsable=$6, accion_texto=$7, accion_horas=$8, mover_horas=$9 WHERE id=$1`,
          [e.id, ...valores],
        );
        idDe.set(String(e.id), e.id);
      } else {
        const id = (await client.query(
          `INSERT INTO crm_etapas (embudo_id, organizacion_id, nombre, orden, tipo, color, aviso_responsable, accion_texto, accion_horas, mover_horas)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [embudoId, org, ...valores],
        )).rows[0].id;
        idDe.set(String(e.id ?? `nueva-${i}`), id);
      }
    }
    for (const [i, e] of lista.entries()) {
      const propia = idDe.get(String(e.id ?? `nueva-${i}`));
      const destino = e.mover_a_etapa_id ? idDe.get(String(e.mover_a_etapa_id)) || null : null;
      await client.query(`UPDATE crm_etapas SET mover_a_etapa_id = $1 WHERE id = $2`, [destino && destino !== propia ? destino : null, propia]);
    }
    await client.query('COMMIT');
    void logActivityForReq(req, 'CRM: embudo actualizado', 'CRM', embudoId).catch(() => {});
    return ok(res, { id: embudoId });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    return fallo(res, e.message);
  } finally {
    client.release();
  }
}

/** PUT /api/crm/campos { campos: [{ id?, nombre, tipo, opciones }] } */
export async function guardarCampos(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  const lista: any[] = Array.isArray(req.body?.campos) ? req.body.campos : [];
  if (lista.some((c) => !texto(c?.nombre, 300))) return fallo(res, 'Todas las preguntas necesitan texto.', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actuales = (await client.query(`SELECT id FROM crm_campos WHERE organizacion_id = $1`, [org])).rows.map((r: any) => r.id);
    const quedan = new Set(lista.map((c) => c.id).filter((id) => actuales.includes(id)));
    await client.query(`DELETE FROM crm_campos WHERE organizacion_id = $1 AND NOT (id = ANY($2::uuid[]))`, [org, [...quedan]]);
    for (const [i, c] of lista.entries()) {
      const tipo = TIPOS_CAMPO.includes(c.tipo) ? c.tipo : 'opcion';
      const opciones = tipo === 'opcion' ? (Array.isArray(c.opciones) ? c.opciones : []).map((o: any) => String(o).trim().slice(0, 200)).filter(Boolean).slice(0, 30) : [];
      if (quedan.has(c.id)) {
        await client.query(`UPDATE crm_campos SET nombre=$2, tipo=$3, opciones=$4, orden=$5 WHERE id=$1`, [c.id, texto(c.nombre, 300), tipo, JSON.stringify(opciones), i]);
      } else {
        await client.query(`INSERT INTO crm_campos (organizacion_id, nombre, tipo, opciones, orden) VALUES ($1,$2,$3,$4,$5)`, [org, texto(c.nombre, 300), tipo, JSON.stringify(opciones), i]);
      }
    }
    await client.query('COMMIT');
    return ok(res, { total: lista.length });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    return fallo(res, e.message);
  } finally {
    client.release();
  }
}

// ── Oportunidades ───────────────────────────────────────────────────────────

/** GET /api/crm/oportunidades?embudo=&estado=abierta|ganada|perdida|abandonada|todas&q=&mias=1 */
export async function listarOportunidades(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  try {
    await asegurarEmbudos(org);
    const q = texto(req.query.q, 200);
    const estado = req.query.estado === 'todas' ? null : ESTADOS.includes(String(req.query.estado) as any) ? String(req.query.estado) : 'abierta';
    const embudo = esUuid(req.query.embudo) ? String(req.query.embudo) : null;
    const mias = req.query.mias === '1' ? (req as any).auth?.userId : null;
    const { rows } = await pool.query(
      `SELECT o.*,
              (SELECT COUNT(*)::int FROM crm_actividades a WHERE a.oportunidad_id = o.id AND a.tipo <> 'etapa') AS n_actividades
         FROM crm_oportunidades o
        WHERE o.organizacion_id = $1
          AND ($2::uuid IS NULL OR o.embudo_id = $2)
          AND ($3::text IS NULL OR o.estado = $3)
          AND ($4::text IS NULL OR o.nombre ILIKE $4 OR o.asunto ILIKE $4 OR o.email ILIKE $4 OR o.telefono ILIKE $4
               OR o.area ILIKE $4 OR array_to_string(o.etiquetas, ' ') ILIKE $4)
          AND ($5::text IS NULL OR o.responsable_user_id = $5)
        ORDER BY o.updated_at DESC
        LIMIT 1000`,
      [org, embudo, estado, q ? `%${q}%` : null, mias],
    );
    return ok(res, rows);
  } catch (e: any) { return fallo(res, e.message); }
}

/** GET /api/crm/resumen?embudo= — cifras del tablero. */
export async function resumenCrm(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  try {
    await asegurarEmbudos(org);
    const embudo = esUuid(req.query.embudo) ? String(req.query.embudo) : null;
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE estado = 'abierta')::int AS abiertas,
              COALESCE(SUM(valor_estimado) FILTER (WHERE estado = 'abierta'), 0)::float AS valor_abierto,
              COUNT(*) FILTER (WHERE estado = 'ganada' AND cerrada_at > NOW() - INTERVAL '90 days')::int AS ganadas90,
              COALESCE(SUM(valor_estimado) FILTER (WHERE estado = 'ganada' AND cerrada_at > NOW() - INTERVAL '90 days'), 0)::float AS valor_ganado90,
              COUNT(*) FILTER (WHERE estado IN ('perdida','abandonada') AND cerrada_at > NOW() - INTERVAL '90 days')::int AS perdidas90,
              COUNT(*) FILTER (WHERE estado = 'abierta' AND proxima_accion_at < NOW())::int AS vencidas
         FROM crm_oportunidades WHERE organizacion_id = $1 AND ($2::uuid IS NULL OR embudo_id = $2)`,
      [org, embudo],
    );
    const r = rows[0];
    return ok(res, {
      abiertas: r.abiertas, valorAbierto: r.valor_abierto, ganadas90: r.ganadas90, valorGanado90: r.valor_ganado90, perdidas90: r.perdidas90,
      conversion90: r.ganadas90 + r.perdidas90 ? Math.round((r.ganadas90 / (r.ganadas90 + r.perdidas90)) * 100) : null,
      seguimientosVencidos: r.vencidas,
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

async function camposValidos(org: string, valores: any): Promise<Record<string, any>> {
  if (!valores || typeof valores !== 'object') return {};
  const { rows } = await pool.query(`SELECT id, tipo, opciones FROM crm_campos WHERE organizacion_id = $1`, [org]);
  const out: Record<string, any> = {};
  for (const c of rows) {
    const v = valores[c.id];
    if (v === undefined || v === null || v === '') continue;
    if (c.tipo === 'opcion') { if ((c.opciones || []).includes(v)) out[c.id] = v; }
    else out[c.id] = String(v).slice(0, 1000);
  }
  return out;
}

async function clienteDelDespacho(org: string, id: any): Promise<string | null> {
  if (!esUuid(id)) return null;
  const { rows } = await pool.query(`SELECT id FROM entities WHERE id = $1 AND organizacion_id = $2`, [id, org]);
  return rows[0]?.id || null;
}

/** POST /api/crm/oportunidades — entra en la etapa indicada o en la primera del embudo. */
export async function crearOportunidad(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  const b = req.body || {};
  const nombre = texto(b.nombre, 200);
  if (!nombre) return fallo(res, 'Falta el nombre de la persona o empresa.', 400);
  try {
    await asegurarEmbudos(org);
    const { userId, nombre: autor } = await quien(req);
    let etapa = await etapaDelDespacho(org, b.etapa_id);
    if (!etapa) {
      const emb = esUuid(b.embudo_id) ? b.embudo_id : null;
      etapa = (await pool.query(
        `SELECT s.* FROM crm_etapas s JOIN crm_embudos e ON e.id = s.embudo_id
          WHERE s.organizacion_id = $1 AND ($2::uuid IS NULL OR s.embudo_id = $2)
          ORDER BY e.orden, e.created_at, s.orden LIMIT 1`, [org, emb],
      )).rows[0];
    }
    if (!etapa) return fallo(res, 'Ese embudo no tiene etapas.', 400);
    const responsable = b.responsable_user_id ? String(b.responsable_user_id).slice(0, 150) : userId;
    const responsableNombre = responsable === userId ? autor : (texto(b.responsable_nombre, 200) || await resolveUserName(responsable).catch(() => null));
    const { rows } = await pool.query(
      `INSERT INTO crm_oportunidades (organizacion_id, nombre, telefono, email, origen, asunto, area, valor_estimado,
                                      responsable_user_id, responsable_nombre, proxima_accion, proxima_accion_at, cliente_id,
                                      etiquetas, campos, created_by, embudo_id, etapa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [org, nombre, texto(b.telefono, 40), texto(b.email, 200), ORIGENES.includes(b.origen) ? b.origen : 'otro',
        texto(b.asunto), texto(b.area, 120), importe(b.valor_estimado), responsable, responsableNombre,
        texto(b.proxima_accion, 500), fechaHora(b.proxima_accion_at), await clienteDelDespacho(org, b.cliente_id),
        etiquetas(b.etiquetas), JSON.stringify(await camposValidos(org, b.campos)), userId, etapa.embudo_id, etapa.id],
    );
    let o = rows[0];
    // Reglas de la etapa de entrada (sin pisar una próxima acción escrita a mano)
    const auto = alEntrarEn(etapa);
    if (o.proxima_accion) { delete auto.proxima_accion; delete auto.proxima_accion_at; }
    o = await guardarCambios(org, o.id, auto);
    await apuntar(org, o.id, 'etapa', `Oportunidad creada en «${etapa.nombre}» (origen: ${o.origen}).`, { userId, nombre: autor });
    avisarResponsable(o, etapa);
    void logActivityForReq(req, `CRM: nueva oportunidad «${nombre}»`, 'CRM', o.id, nombre).catch(() => {});
    return ok(res, o, 201);
  } catch (e: any) { return fallo(res, e.message); }
}

/** PUT /api/crm/oportunidades/:id — solo cambia lo que llega. */
export async function actualizarOportunidad(req: Request, res: Response) {
  const org = (req as any).organizacionId;
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
    if ('cliente_id' in b) cambios.cliente_id = await clienteDelDespacho(org, b.cliente_id);
    if ('etiquetas' in b) cambios.etiquetas = etiquetas(b.etiquetas);
    if ('campos' in b) cambios.campos = JSON.stringify(await camposValidos(org, b.campos));
    if ('responsable_user_id' in b && b.responsable_user_id) {
      cambios.responsable_user_id = String(b.responsable_user_id).slice(0, 150);
      cambios.responsable_nombre = texto(b.responsable_nombre, 200) || await resolveUserName(cambios.responsable_user_id).catch(() => null);
    }

    const avisos: string[] = [];
    let etapaNueva: any = null;
    if ('etapa_id' in b && b.etapa_id !== o.etapa_id) {
      etapaNueva = await etapaDelDespacho(org, b.etapa_id);
      if (!etapaNueva) return fallo(res, 'Etapa no válida.', 400);
      if (etapaNueva.tipo === 'perdida' && !texto(b.motivo_perdida) && !o.motivo_perdida) return fallo(res, 'Indica el motivo por el que se ha perdido.', 400);
      Object.assign(cambios, alEntrarEn(etapaNueva));
      const anterior = await etapaDelDespacho(org, o.etapa_id);
      avisos.push(`${anterior?.nombre || 'Sin etapa'} → ${etapaNueva.nombre}`);
    }
    if ('estado' in b && b.estado !== (cambios.estado || o.estado)) {
      if (!ESTADOS.includes(b.estado)) return fallo(res, 'Estado no válido.', 400);
      if ((b.estado === 'perdida' || b.estado === 'abandonada') && !texto(b.motivo_perdida) && !o.motivo_perdida) {
        return fallo(res, b.estado === 'perdida' ? 'Indica el motivo por el que se ha perdido.' : 'Indica el motivo del abandono.', 400);
      }
      cambios.estado = b.estado;
      cambios.cerrada_at = b.estado === 'abierta' ? null : new Date().toISOString();
      avisos.push(`Estado: ${b.estado}`);
    }
    if (avisos.length && (cambios.estado === 'perdida' || cambios.estado === 'abandonada')) {
      avisos[avisos.length - 1] += `. Motivo: ${texto(b.motivo_perdida) || o.motivo_perdida}`;
    }
    if (!Object.keys(cambios).length) return ok(res, o);
    const nueva = await guardarCambios(org, o.id, cambios);
    if (avisos.length) {
      const yo = await quien(req);
      await apuntar(org, o.id, 'etapa', avisos.join('. '), yo);
      void logActivityForReq(req, `CRM: «${nueva.nombre}» ${avisos.join('. ')}`, 'CRM', o.id, nueva.nombre).catch(() => {});
    }
    if (etapaNueva) avisarResponsable(nueva, etapaNueva);
    return ok(res, nueva);
  } catch (e: any) { return fallo(res, e.message); }
}

/** POST /api/crm/oportunidades/:id/actividades { tipo, texto } */
export async function anadirActividad(req: Request, res: Response) {
  const org = (req as any).organizacionId;
  try {
    const o = await laOportunidad(req, req.params.id);
    if (!o) return fallo(res, 'Oportunidad no encontrada.', 404);
    const t = texto(req.body?.texto);
    if (!t) return fallo(res, 'Escribe qué ha pasado.', 400);
    const tipo = TIPOS_ACTIVIDAD.includes(req.body?.tipo) ? req.body.tipo : 'nota';
    await apuntar(org, o.id, tipo, t, await quien(req));
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
    let clienteId = o.cliente_id || await clienteDelDespacho(org, req.body?.cliente_id);
    let creado = false;
    const yo = await quien(req);
    if (!clienteId) {
      const numero = await resolveNextInternalNumber(pool, org);
      const { rows } = await pool.query(
        `INSERT INTO entities (internal_number, type, client_status, first_name, email, phone_1, organizacion_id, created_by, date_alta)
         VALUES ($1, 'CLIENTE', 'Alta', $2, $3, $4, $5, $6, CURRENT_DATE) RETURNING id`,
        [numero, o.nombre, o.email, o.telefono, org, yo.userId],
      );
      clienteId = rows[0].id;
      creado = true;
    }
    const nueva = await guardarCambios(org, o.id, { estado: 'ganada', cliente_id: clienteId, cerrada_at: o.cerrada_at || new Date().toISOString() });
    await apuntar(org, o.id, 'etapa', `Estado: ganada. ${creado ? 'Se ha dado de alta como cliente.' : 'Enlazada con su ficha de cliente.'}`, yo);
    void logActivityForReq(req, `CRM: «${o.nombre}» convertida en cliente`, 'CLIENT', clienteId!, o.nombre).catch(() => {});
    return ok(res, { oportunidad: nueva, clienteId, creado });
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

// ── Reglas con tiempo: "si sigue N horas en esta etapa, pásala a otra" ──────

/** Mueve las oportunidades abiertas que llevan en su etapa más horas de las
 *  que dice la regla. Devuelve cuántas ha movido. */
export async function aplicarReglasDeTiempo(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT o.*, s.nombre AS etapa_nombre, d.id AS destino_id
       FROM crm_oportunidades o
       JOIN crm_etapas s ON s.id = o.etapa_id
       JOIN crm_etapas d ON d.id = s.mover_a_etapa_id
      WHERE o.estado = 'abierta' AND s.mover_horas IS NOT NULL
        AND o.etapa_desde < NOW() - s.mover_horas * INTERVAL '1 hour'
      LIMIT 500`,
  );
  let movidas = 0;
  for (const o of rows) {
    const destino = (await pool.query(`SELECT * FROM crm_etapas WHERE id = $1`, [o.destino_id])).rows[0];
    if (!destino) continue;
    const nueva = await guardarCambios(o.organizacion_id, o.id, alEntrarEn(destino));
    await apuntar(o.organizacion_id, o.id, 'etapa', `Automático: sin cambios en «${o.etapa_nombre}» → ${destino.nombre}`, { userId: null, nombre: 'Vantia' });
    avisarResponsable(nueva, destino);
    movidas++;
  }
  return movidas;
}

export function startCrmReglas(): void {
  const pasada = async () => {
    if (!(await tomarTurno('crm-reglas', 9 * 60_000).catch(() => false))) return;
    try { await aplicarReglasDeTiempo(); }
    catch (e: any) { console.error('[crm] reglas:', e?.message || e); }
    finally { await soltarTurno('crm-reglas'); }
  };
  setTimeout(() => { void pasada(); setInterval(() => void pasada(), 10 * 60_000); }, 60_000);
}
