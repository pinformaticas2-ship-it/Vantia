import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import pool from '../config/database';
import { logActivityForReq } from '../controllers/activityController';
import { docsBaseConfig } from '../services/docsBaseExpediente';
import { normalizarRecordatorios, rellenarRecordatorio, TIPOS_RECORDABLES, varsDe } from '../services/recordatoriosClientes';
import { ultimasEjecuciones } from '../utils/automatizacionesRegistro';

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

export default router;
