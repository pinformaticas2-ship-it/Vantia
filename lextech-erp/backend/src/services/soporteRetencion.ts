import pool from '../config/database';
import {
  RETENCION_DIAS, AVISO_DIAS_ANTES, buildTicketsCsv, sendOrgEmail, getSoporteEmail,
  emailLayout, escapeHtml, fmtFecha, ticketRef,
} from '../controllers/soporteController';

// ── Retención de tickets de soporte cerrados ─────────────────────────────────
// Los tickets cerrados se borran a los RETENCION_DIAS días de cerrarse. Antes
// de borrar nada, AVISO_DIAS_ANTES días antes, se manda al correo de soporte
// de la organización un aviso con el CSV de esos tickets adjunto (datos y
// conversación completa). Garantías:
//   - Nunca se borra un ticket sin aviso: si el correo no sale (sin correo de
//     soporte, sin cuenta de envío...), no se marca como avisado, se
//     reintenta en la siguiente pasada y el ticket sigue sin borrarse.
//   - Siempre hay al menos AVISO_DIAS_ANTES días entre el aviso y el borrado,
//     aunque el aviso salga tarde (servidor parado, correo que fallaba).
//   - Antes de borrar se suma el ticket al recuento mensual
//     (soporte_cierres_mensuales), así las estadísticas no pierden nada.
// Reabrir un ticket anula cerrado_at y el aviso (ver RETENCION_SET).

const DIA_MS = 86_400_000;
const LOCK_KEY = 'soporte_retencion';

async function avisarPendientes(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM soporte_tickets
      WHERE estado = 'cerrado' AND aviso_borrado_at IS NULL
        AND cerrado_at <= NOW() - make_interval(days => $1)
      ORDER BY organizacion_id, numero`,
    [RETENCION_DIAS - AVISO_DIAS_ANTES],
  );
  const porOrg = new Map<string, any[]>();
  for (const t of rows) {
    if (!porOrg.has(t.organizacion_id)) porOrg.set(t.organizacion_id, []);
    porOrg.get(t.organizacion_id)!.push(t);
  }

  for (const [organizacionId, tickets] of porOrg) {
    const { email, orgNombre } = await getSoporteEmail(organizacionId);
    if (!email) {
      console.warn(`[soporte] ${tickets.length} ticket(s) de "${orgNombre}" pendientes de aviso de borrado, pero la organización no tiene correo de soporte.`);
      continue;
    }
    // Se envía desde la cuenta de un informático (rol soporte) si tiene una
    // conectada; si no, desde la primera cuenta de la organización.
    const { rows: soporte } = await pool.query(
      `SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1 AND rol = 'soporte' ORDER BY created_at ASC LIMIT 1`,
      [organizacionId],
    );
    const fechaBorrado = (t: any) => new Date(Math.max(
      new Date(t.cerrado_at).getTime() + RETENCION_DIAS * DIA_MS,
      Date.now() + AVISO_DIAS_ANTES * DIA_MS,
    ));
    const primera = new Date(Math.min(...tickets.map((t) => fechaBorrado(t).getTime())));

    const filas = tickets.map((t) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace">${escapeHtml(ticketRef(t.numero))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(t.asunto)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(t.created_by_name || '')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${escapeHtml(new Date(t.cerrado_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap"><b>${escapeHtml(fechaBorrado(t).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }))}</b></td>
    </tr>`).join('');
    const th = 'padding:6px 10px;text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0';
    const html = emailLayout(
      `${tickets.length} ${tickets.length === 1 ? 'ticket cerrado se borrará' : 'tickets cerrados se borrarán'} ${AVISO_DIAS_ANTES === 1 ? 'mañana' : `en ${AVISO_DIAS_ANTES} días`}`,
      `Aviso de borrado · ${orgNombre}`,
      '#d97706',
      `<p style="font-size:14px;line-height:1.55;margin:0 0 14px">
         Los tickets de soporte se borran automáticamente a los ${RETENCION_DIAS} días de cerrarse.
         Los siguientes se borrarán a partir del <b>${escapeHtml(fmtFecha(primera))}</b>.
         Te adjuntamos un <b>CSV con todos sus datos y la conversación completa</b> para que lo guardes.
       </p>
       <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
         <tr><th style="${th}">Nº</th><th style="${th}">Asunto</th><th style="${th}">Abierto por</th><th style="${th}">Cerrado</th><th style="${th}">Se borra</th></tr>
         ${filas}
       </table>
       <p style="font-size:13px;color:#475569;margin:0">
         El recuento mensual de tickets cerrados se conserva aunque se borren los tickets.
         Si alguno no debe borrarse, reábrelo antes de esa fecha.
       </p>`,
      'También puedes descargar el CSV desde Vantia → Centro de soporte.',
    );
    const csv = await buildTicketsCsv(tickets);
    const hoy = new Date().toISOString().slice(0, 10);
    const error = await sendOrgEmail(
      organizacionId, soporte[0]?.user_id || '', email,
      `[Soporte] ${tickets.length} ticket(s) cerrados se borrarán el ${primera.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })} · CSV adjunto`,
      html, null,
      [{ filename: `soporte-tickets-a-borrar-${hoy}.csv`, contentType: 'text/csv; charset=utf-8', content: Buffer.from(csv, 'utf8').toString('base64') }],
    );
    if (error) {
      console.warn(`[soporte] No se pudo enviar el aviso de borrado de "${orgNombre}" (se reintentará):`, error);
      continue;
    }
    await pool.query(
      `UPDATE soporte_tickets SET aviso_borrado_at = NOW()
        WHERE id = ANY($1::uuid[]) AND estado = 'cerrado' AND aviso_borrado_at IS NULL`,
      [tickets.map((t) => t.id)],
    );
    console.log(`[soporte] Aviso de borrado enviado a ${email} (${tickets.length} ticket(s), "${orgNombre}").`);
  }
}

async function borrarCaducados(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM soporte_tickets
        WHERE estado = 'cerrado'
          AND cerrado_at <= NOW() - make_interval(days => $1)
          AND aviso_borrado_at IS NOT NULL
          AND aviso_borrado_at <= NOW() - make_interval(days => $2)
        FOR UPDATE`,
      [RETENCION_DIAS, AVISO_DIAS_ANTES],
    );
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }
    const ids = rows.map((r) => r.id);
    await client.query(
      `INSERT INTO soporte_cierres_mensuales (organizacion_id, mes, categoria, total, suma_horas_resolucion)
       SELECT organizacion_id, date_trunc('month', cerrado_at AT TIME ZONE 'Europe/Madrid')::date, categoria,
              COUNT(*), SUM(EXTRACT(EPOCH FROM (cerrado_at - created_at)) / 3600)
         FROM soporte_tickets WHERE id = ANY($1::uuid[])
        GROUP BY 1, 2, 3
       ON CONFLICT (organizacion_id, mes, categoria) DO UPDATE
         SET total = soporte_cierres_mensuales.total + EXCLUDED.total,
             suma_horas_resolucion = soporte_cierres_mensuales.suma_horas_resolucion + EXCLUDED.suma_horas_resolucion`,
      [ids],
    );
    await client.query(`DELETE FROM soporte_tickets WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query('COMMIT');
    console.log(`[soporte] ${ids.length} ticket(s) cerrados borrados por retención (${RETENCION_DIAS} días).`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function runSoporteRetencion(): Promise<void> {
  // Lock de sesión: si hubiera más de una instancia del backend, solo una
  // hace la pasada (evita avisos duplicados).
  const lockClient = await pool.connect();
  try {
    const { rows } = await lockClient.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [LOCK_KEY]);
    if (!rows[0]?.ok) return;
    try {
      await avisarPendientes();
      await borrarCaducados();
    } finally {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [LOCK_KEY]).catch(() => {});
    }
  } catch (e) {
    console.error('[soporte] runSoporteRetencion:', e);
  } finally {
    lockClient.release();
  }
}

export function startSoporteRetencionScheduler(): void {
  // Primera pasada al minuto de arrancar, luego cada hora.
  setTimeout(() => {
    void runSoporteRetencion();
    setInterval(() => void runSoporteRetencion(), 60 * 60 * 1000);
  }, 60_000);
}
