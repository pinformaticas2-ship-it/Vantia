import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import pool from '../config/database';
import { logActivityForReq } from '../controllers/activityController';
import { docsBaseConfig } from '../services/docsBaseExpediente';
import { normalizarRecordatorios, rellenarRecordatorio, TIPOS_RECORDABLES, varsDe } from '../services/recordatoriosClientes';
import { ultimasEjecuciones } from '../utils/automatizacionesRegistro';
import { DISPARADORES, EVENTO_DE_SERIE, ejecutarFlujo, probarFlujo, proximaEjecucion, validarFlujo } from '../services/motorAutomatizaciones';

// Ajustes → Automatizaciones (12/11/2026): resumen de todas (estado, cifras
// y últimas ejecuciones) y los ajustes de las que no tienen ruta propia
// (bienvenida al cliente y recordatorios a clientes). Las vistas por correo
// siguen en /api/vistas/config y los documentos base en /api/docs-base/config.
const router = Router();
const esGestor = (req: any) => ['propietario', 'admin'].includes(req.organizacionRol);
const fallo = (res: Response, error: string, status = 400) => res.status(status).json({ success: false, error });

const BIENVENIDA_ASUNTO = 'Hemos recibido tus datos';
const BIENVENIDA_CUERPO = 'Hola {nombre},\n\nHemos registrado correctamente tus datos en nuestro despacho. En breve nos pondremos en contacto contigo para los siguientes pasos.\n\nUn saludo.';

async function contar(sql: string, params: any[]): Promise<number> {
  const { rows } = await pool.query(sql, params).catch(() => ({ rows: [] as any[] }));
  return Number(rows[0]?.n || 0);
}

router.get('/', requireAuth, async (req: any, res: Response) => {
  const org = req.organizacionId;
  try {
    const { rows } = await pool.query(
      `SELECT nombre, automatizaciones, vistas_auto_enabled, vistas_auto_last_run_at, vistas_auto_last_error,
              client_welcome_email_subject, client_welcome_email_body, client_welcome_email_signature
         FROM organizaciones WHERE id = $1`,
      [org],
    );
    if (!rows.length) return fallo(res, 'Organización no encontrada', 404);
    const o = rows[0];
    const a = o.automatizaciones || {};
    const recordatorios = normalizarRecordatorios(a.recordatorios);
    const [cuenta, docs, vistasRecibidas, vistasAceptadas, vistasPendientes, docsGenerados, bienvenidas, recordados, proximos,
      ultVistas, ultBienvenida, ultRecordatorios] = await Promise.all([
      pool.query(`SELECT email FROM email_accounts WHERE organizacion_id = $1 AND active = true ORDER BY created_at LIMIT 1`, [org]).catch(() => ({ rows: [] as any[] })),
      docsBaseConfig(org),
      contar(`SELECT COUNT(*) AS n FROM vistas_solicitudes WHERE organizacion_id = $1 AND created_at > NOW() - INTERVAL '30 days'`, [org]),
      contar(`SELECT COUNT(*) AS n FROM vistas_solicitudes WHERE organizacion_id = $1 AND estado = 'aceptada' AND decidido_at > NOW() - INTERVAL '30 days'`, [org]),
      contar(`SELECT COUNT(*) AS n FROM vistas_solicitudes WHERE organizacion_id = $1 AND estado = 'pendiente'`, [org]),
      contar(`SELECT COUNT(*) AS n FROM expediente_docs_base WHERE organizacion_id = $1 AND estado = 'listo' AND generado_at > NOW() - INTERVAL '30 days'`, [org]),
      contar(`SELECT COUNT(*) AS n FROM automatizaciones_registro WHERE organizacion_id = $1 AND clave = 'bienvenida' AND ok AND created_at > NOW() - INTERVAL '30 days'`, [org]),
      contar(`SELECT COUNT(*) AS n FROM recordatorios_clientes_enviados WHERE organizacion_id = $1 AND ok AND created_at > NOW() - INTERVAL '30 days'`, [org]),
      contar(
        `SELECT COUNT(*) AS n FROM agenda_events e
           LEFT JOIN entities c ON c.id = e.cliente_id
           LEFT JOIN expedientes x ON x.id = e.expediente_id
           LEFT JOIN entities ce ON ce.id = x.cliente_id
          WHERE e.organizacion_id = $1 AND e.type = ANY($2::text[]) AND COALESCE(e.status, '') <> 'cancelado'
            AND e.start_at > NOW() AND e.start_at < NOW() + INTERVAL '7 days'
            AND COALESCE(c.email, ce.email, '') <> ''`,
        [org, recordatorios.tipos],
      ),
      pool.query(
        `SELECT estado, subject, created_at FROM vistas_solicitudes WHERE organizacion_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [org],
      ).catch(() => ({ rows: [] as any[] })),
      ultimasEjecuciones(org, 'bienvenida'),
      ultimasEjecuciones(org, 'recordatorios'),
    ]);
    res.json({
      success: true,
      data: {
        canManage: esGestor(req),
        cuentaCorreo: cuenta.rows[0]?.email || null,
        vistas: {
          activo: Boolean(o.vistas_auto_enabled),
          ultimaRevision: o.vistas_auto_last_run_at,
          error: o.vistas_auto_last_error,
          recibidas30: vistasRecibidas, aceptadas30: vistasAceptadas, pendientes: vistasPendientes,
          ultimas: ultVistas.rows.map((r: any) => ({ ok: r.estado !== 'error', detalle: `${r.subject || '(Sin asunto)'} · ${r.estado}`, created_at: r.created_at })),
        },
        docsBase: { ...docs, generados30: docsGenerados },
        bienvenida: {
          activo: a.bienvenida?.activo !== false,
          asunto: o.client_welcome_email_subject || '',
          cuerpo: o.client_welcome_email_body || '',
          firma: o.client_welcome_email_signature || '',
          asuntoPorDefecto: BIENVENIDA_ASUNTO,
          cuerpoPorDefecto: BIENVENIDA_CUERPO,
          enviados30: bienvenidas,
          ultimas: ultBienvenida,
        },
        recordatorios: { ...recordatorios, tiposPosibles: TIPOS_RECORDABLES, enviados30: recordados, proximos7: proximos, ultimas: ultRecordatorios },
      },
    });
  } catch (e: any) {
    fallo(res, e?.message || 'No se pudieron cargar las automatizaciones', 500);
  }
});

router.put('/bienvenida', requireAuth, async (req: any, res: Response) => {
  if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador.', 403);
  const b = req.body || {};
  const txt = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  const asunto = txt(b.asunto, 300);
  const cuerpo = txt(b.cuerpo, 5000);
  const firma = txt(b.firma, 2000);
  try {
    await pool.query(
      `UPDATE organizaciones
          SET automatizaciones = COALESCE(automatizaciones, '{}'::jsonb) || jsonb_build_object('bienvenida', jsonb_build_object('activo', $2::boolean)),
              client_welcome_email_subject = COALESCE($3, client_welcome_email_subject),
              client_welcome_email_body = COALESCE($4, client_welcome_email_body),
              client_welcome_email_signature = COALESCE($5, client_welcome_email_signature),
              updated_at = NOW()
        WHERE id = $1`,
      [req.organizacionId, b.activo !== false, asunto === undefined ? null : asunto, cuerpo === undefined ? null : cuerpo, firma === undefined ? null : firma],
    );
    logActivityForReq(req, 'Automatización «Bienvenida al cliente» actualizada', 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true });
  } catch (e: any) { fallo(res, e?.message || 'No se pudo guardar', 500); }
});

router.put('/recordatorios', requireAuth, async (req: any, res: Response) => {
  if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador.', 403);
  const cfg = normalizarRecordatorios(req.body || {});
  try {
    await pool.query(
      `UPDATE organizaciones SET automatizaciones = COALESCE(automatizaciones, '{}'::jsonb) || jsonb_build_object('recordatorios', $2::jsonb), updated_at = NOW() WHERE id = $1`,
      [req.organizacionId, JSON.stringify(cfg)],
    );
    logActivityForReq(req, `Automatización «Recordatorios a clientes» ${cfg.activo ? 'activada' : 'desactivada'}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true, data: cfg });
  } catch (e: any) { fallo(res, e?.message || 'No se pudo guardar', 500); }
});

// Vista previa del correo de recordatorio con lo que se está editando: con la
// próxima cita real con cliente, o con una de ejemplo.
router.post('/recordatorios/preview', requireAuth, async (req: any, res: Response) => {
  const cfg = normalizarRecordatorios({ ...(req.body || {}), activo: true });
  try {
    const { rows: org } = await pool.query(`SELECT nombre FROM organizaciones WHERE id = $1`, [req.organizacionId]);
    const { rows } = await pool.query(
      `SELECT e.title, e.start_at, e.all_day, e.location,
              TRIM(COALESCE(c.first_name, ce.first_name, '') || ' ' || COALESCE(c.last_name, ce.last_name, '')) AS nombre
         FROM agenda_events e
         LEFT JOIN entities c ON c.id = e.cliente_id
         LEFT JOIN expedientes x ON x.id = e.expediente_id
         LEFT JOIN entities ce ON ce.id = x.cliente_id
        WHERE e.organizacion_id = $1 AND e.type = ANY($2::text[]) AND e.start_at > NOW()
          AND COALESCE(c.email, ce.email, '') <> ''
        ORDER BY e.start_at LIMIT 1`,
      [req.organizacionId, cfg.tipos],
    );
    const manana = new Date(Date.now() + 86_400_000); manana.setUTCHours(9, 30, 0, 0);
    const ev = rows[0] || { title: 'una reunión', start_at: manana, all_day: false, location: 'C/ Mayor 1, Madrid', nombre: 'María López' };
    const v = varsDe(ev, ev.nombre, org[0]?.nombre || '');
    res.json({ success: true, data: { ejemploReal: Boolean(rows[0]), asunto: rellenarRecordatorio(cfg.asunto, v, false), html: rellenarRecordatorio(cfg.cuerpo, v, true) } });
  } catch (e: any) { fallo(res, e?.message || 'No se pudo preparar la vista previa', 500); }
});

// ── Automatizaciones propias (editor de flujos) ─────────────────────────────
// Verlas: cualquiera del despacho. Crearlas, cambiarlas, borrarlas o
// ejecutarlas: propietario y administradores.

router.get('/catalogo', requireAuth, async (req: any, res: Response) => {
  const [miembros, canales] = await Promise.all([
    pool.query(`SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1 ORDER BY created_at`, [req.organizacionId]),
    pool.query(`SELECT id, nombre FROM chat_canales WHERE organizacion_id = $1 AND COALESCE(tipo, '') <> 'directo' ORDER BY nombre`, [req.organizacionId]).catch(() => ({ rows: [] as any[] })),
  ]);
  const { resolveUserName } = await import('../controllers/activityController');
  res.json({
    success: true,
    data: {
      disparadores: Object.entries(DISPARADORES).map(([clave, d]) => ({ clave, etiqueta: d.etiqueta, descripcion: d.descripcion, variables: d.variables })),
      miembros: await Promise.all(miembros.rows.map(async (m: any) => ({ userId: m.user_id, nombre: await resolveUserName(m.user_id) }))),
      canales: canales.rows,
      eventoDeSerie: EVENTO_DE_SERIE,
    },
  });
});

const FILA = `id, nombre, descripcion, activo, evento, flujo, vinculada, proxima_at, ultima_at, ejecuciones, created_at, updated_at`;

router.get('/flujos', requireAuth, async (req: any, res: Response) => {
  const { rows } = await pool.query(
    `SELECT ${FILA},
            (SELECT estado FROM automatizaciones_ejecuciones e WHERE e.flujo_id = f.id ORDER BY created_at DESC LIMIT 1) AS ultimo_estado
       FROM automatizaciones_flujos f WHERE organizacion_id = $1 ORDER BY vinculada NULLS FIRST, created_at DESC`,
    [req.organizacionId],
  );
  res.json({ success: true, data: rows });
});

async function guardarFlujo(req: any, res: Response, id: string | null) {
  if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador.', 403);
  const b = req.body || {};
  const vinculada = typeof b.vinculada === 'string' && EVENTO_DE_SERIE[b.vinculada] ? b.vinculada : null;
  const { flujo, evento, errores } = validarFlujo(b.flujo || {});
  // En las de serie, el disparador es siempre el evento con el que terminan.
  const eventoFinal = vinculada ? EVENTO_DE_SERIE[vinculada] : evento;
  if (vinculada) { const d = flujo.nodos.find((n) => n.tipo === 'disparador'); if (d) d.config = { ...(d.config || {}), evento: eventoFinal }; }
  const erroresFinal = vinculada ? errores.filter((e) => !/disparador|pone en marcha/.test(e)) : errores;
  const activo = b.activo === true;
  if (activo && erroresFinal.length) return fallo(res, erroresFinal.join(' '), 400);
  const nombre = String(b.nombre || '').trim().slice(0, 120) || 'Automatización sin nombre';
  const descripcion = String(b.descripcion || '').trim().slice(0, 500) || null;
  const disp = flujo.nodos.find((n) => n.tipo === 'disparador');
  const proxima = eventoFinal === 'programado' ? proximaEjecucion(disp?.config || {}) : null;
  try {
    let fila;
    if (vinculada) {
      ({ rows: [fila] } = await pool.query(
        `INSERT INTO automatizaciones_flujos (organizacion_id, nombre, descripcion, activo, evento, flujo, vinculada, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (organizacion_id, vinculada) WHERE vinculada IS NOT NULL
         DO UPDATE SET flujo = EXCLUDED.flujo, activo = EXCLUDED.activo, evento = EXCLUDED.evento, updated_at = NOW()
         RETURNING ${FILA}`,
        [req.organizacionId, nombre, descripcion, activo, eventoFinal, JSON.stringify(flujo), vinculada, req.auth?.userId || null],
      ));
    } else if (id) {
      ({ rows: [fila] } = await pool.query(
        `UPDATE automatizaciones_flujos SET nombre = $3, descripcion = $4, activo = $5, evento = $6, flujo = $7, proxima_at = $8, updated_at = NOW()
          WHERE id = $1 AND organizacion_id = $2 AND vinculada IS NULL RETURNING ${FILA}`,
        [id, req.organizacionId, nombre, descripcion, activo, evento || 'manual', JSON.stringify(flujo), proxima],
      ));
      if (!fila) return fallo(res, 'Automatización no encontrada', 404);
    } else {
      const { rows: n } = await pool.query(`SELECT COUNT(*)::int AS n FROM automatizaciones_flujos WHERE organizacion_id = $1`, [req.organizacionId]);
      if (n[0].n >= 50) return fallo(res, 'Máximo de 50 automatizaciones por despacho.', 400);
      ({ rows: [fila] } = await pool.query(
        `INSERT INTO automatizaciones_flujos (organizacion_id, nombre, descripcion, activo, evento, flujo, proxima_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${FILA}`,
        [req.organizacionId, nombre, descripcion, activo, evento || 'manual', JSON.stringify(flujo), proxima, req.auth?.userId || null],
      ));
    }
    logActivityForReq(req, `Automatización «${nombre}» guardada${activo ? ' (activa)' : ''}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true, data: { ...fila, avisos: erroresFinal } });
  } catch (e: any) { fallo(res, e?.message || 'No se pudo guardar', 500); }
}
router.post('/flujos', requireAuth, (req: any, res: Response) => guardarFlujo(req, res, null));
router.put('/flujos/:id', requireAuth, (req: any, res: Response) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return fallo(res, 'Automatización no encontrada', 404);
  return guardarFlujo(req, res, req.params.id);
});

router.delete('/flujos/:id', requireAuth, async (req: any, res: Response) => {
  if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador.', 403);
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return fallo(res, 'Automatización no encontrada', 404);
  const { rows } = await pool.query(`DELETE FROM automatizaciones_flujos WHERE id = $1 AND organizacion_id = $2 RETURNING nombre`, [req.params.id, req.organizacionId]);
  if (!rows.length) return fallo(res, 'Automatización no encontrada', 404);
  logActivityForReq(req, `Automatización «${rows[0].nombre}» eliminada`, 'ORGANIZACION', req.organizacionId).catch(() => {});
  res.json({ success: true });
});

// Prueba sin efectos: con el flujo que se está editando (aún sin guardar).
router.post('/probar', requireAuth, async (req: any, res: Response) => {
  const { flujo } = validarFlujo(req.body?.flujo || {});
  if (typeof req.body?.vinculada === 'string' && EVENTO_DE_SERIE[req.body.vinculada]) {
    const d = flujo.nodos.find((n) => n.tipo === 'disparador'); if (d) d.config = { ...(d.config || {}), evento: EVENTO_DE_SERIE[req.body.vinculada] };
  }
  try { res.json({ success: true, data: await probarFlujo(req.organizacionId, flujo) }); }
  catch (e: any) { fallo(res, e?.message || 'No se pudo probar', 500); }
});

// Ejecutar de verdad (los de disparador manual).
router.post('/flujos/:id/ejecutar', requireAuth, async (req: any, res: Response) => {
  if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador.', 403);
  const { rows } = await pool.query(`SELECT id, organizacion_id, nombre, flujo, evento FROM automatizaciones_flujos WHERE id = $1 AND organizacion_id = $2`, [req.params.id, req.organizacionId]).catch(() => ({ rows: [] as any[] }));
  if (!rows.length) return fallo(res, 'Automatización no encontrada', 404);
  if (rows[0].evento !== 'manual') return fallo(res, 'Solo se ejecutan a mano las que empiezan con «Al pulsar Ejecutar ahora».', 400);
  try {
    const ctx = { usuario: { id: req.auth?.userId }, despacho: {}, _evento: 'manual' };
    const r = await ejecutarFlujo(rows[0], ctx, 'A mano');
    res.json({ success: true, data: r });
  } catch (e: any) { fallo(res, e?.message || 'No se pudo ejecutar', 500); }
});

router.get('/flujos/:id/ejecuciones', requireAuth, async (req: any, res: Response) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return fallo(res, 'Automatización no encontrada', 404);
  const { rows } = await pool.query(
    `SELECT id, estado, disparo, pasos, created_at FROM automatizaciones_ejecuciones WHERE flujo_id = $1 AND organizacion_id = $2 ORDER BY created_at DESC LIMIT 20`,
    [req.params.id, req.organizacionId],
  );
  res.json({ success: true, data: rows });
});

export default router;
