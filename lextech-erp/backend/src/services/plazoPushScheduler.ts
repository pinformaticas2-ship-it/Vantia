import { randomBytes } from 'crypto';
import pool from '../config/database';
import { pushEnabled, sendPushToUser, sendPushToOrg } from '../utils/webPush';

const PUBLIC_BACKEND_URL = (process.env.PUBLIC_BACKEND_URL || 'https://vantia.up.railway.app').replace(/\/$/, '');

function buildDismissUrl(kind: 'task' | 'notif', id: string, token: string): string {
  return `${PUBLIC_BACKEND_URL}/api/push/dismiss-plazo?kind=${kind}&id=${id}&token=${token}`;
}

// ── Avisos push de plazos ─────────────────────────────────────────────────────
// Los plazos (tareas con fecha límite, recordatorios de expediente) no son un
// evento que dispare nada por sí solo -- alguien tiene que fijarse en el
// calendario. Este programador revisa periódicamente qué está vencido o a
// punto de vencer y manda un push, una vez al día como mucho por elemento
// (columna *_push_sent_at), para no machacar al usuario en cada pasada.

const PLAZO_ALERT_DAYS = 3;
const RENOTIFY_AFTER_MS = 20 * 60 * 60 * 1000; // ~20h: deja repetir el aviso al día siguiente

async function checkTaskPlazos(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, titulo, plazo, user_id, expediente_id, client_name
       FROM client_tasks
      WHERE plazo IS NOT NULL
        AND estado <> 'completada'
        AND user_id IS NOT NULL
        AND NOT plazo_push_dismissed
        AND plazo <= (CURRENT_DATE + $1::int)
        AND (plazo_push_sent_at IS NULL OR plazo_push_sent_at < NOW() - $2::interval)`,
    [PLAZO_ALERT_DAYS, `${RENOTIFY_AFTER_MS} milliseconds`],
  );
  for (const t of rows) {
    const diffDays = Math.round((new Date(t.plazo).getTime() - Date.now()) / 86_400_000);
    const when =
      diffDays < 0 ? `Vencida hace ${Math.abs(diffDays)} día${Math.abs(diffDays) === 1 ? '' : 's'}` :
      diffDays === 0 ? 'Vence hoy' :
      diffDays === 1 ? 'Vence mañana' :
      `Vence en ${diffDays} días`;
    const dismissToken = randomBytes(16).toString('hex');
    await sendPushToUser(t.user_id, {
      title: t.titulo || 'Tarea sin título',
      body: `${when}${t.client_name ? ' · ' + t.client_name : ''}`,
      url: t.expediente_id ? `/dashboard/expedientes/${t.expediente_id}?tab=tareas` : '/dashboard/tareas',
      tag: `plazo-task-${t.id}`,
      dismissUrl: buildDismissUrl('task', t.id, dismissToken),
    });
    await pool.query(
      `UPDATE client_tasks SET plazo_push_sent_at = NOW(), plazo_push_dismiss_token = $2 WHERE id = $1`,
      [t.id, dismissToken],
    );
  }
}

async function checkExpedienteNotificaciones(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT n.id, n.titulo, n.fecha_limite, n.expediente_id, e.organizacion_id, e.anio, e.num_exp
       FROM exp_notificaciones n
       JOIN expedientes e ON e.id = n.expediente_id
      WHERE n.estado = 'pendiente'
        AND n.fecha_limite IS NOT NULL
        AND NOT n.push_dismissed
        AND n.fecha_limite <= (CURRENT_DATE + $1::int)
        AND (n.push_sent_at IS NULL OR n.push_sent_at < NOW() - $2::interval)`,
    [PLAZO_ALERT_DAYS, `${RENOTIFY_AFTER_MS} milliseconds`],
  );
  for (const n of rows) {
    const diffDays = Math.round((new Date(n.fecha_limite).getTime() - Date.now()) / 86_400_000);
    const when =
      diffDays < 0 ? `Vencida hace ${Math.abs(diffDays)} día${Math.abs(diffDays) === 1 ? '' : 's'}` :
      diffDays === 0 ? 'Vence hoy' :
      diffDays === 1 ? 'Vence mañana' :
      `Vence en ${diffDays} días`;
    const dismissToken = randomBytes(16).toString('hex');
    await sendPushToOrg(n.organizacion_id, {
      title: n.titulo || 'Recordatorio de expediente',
      body: `${when} · Exp. ${n.anio}/${n.num_exp}`,
      url: `/dashboard/expedientes/${n.expediente_id}?tab=notificaciones`,
      tag: `plazo-notif-${n.id}`,
      dismissUrl: buildDismissUrl('notif', n.id, dismissToken),
    });
    await pool.query(
      `UPDATE exp_notificaciones SET push_sent_at = NOW(), push_dismiss_token = $2 WHERE id = $1`,
      [n.id, dismissToken],
    );
  }
}

export async function runPlazoPushCheck(): Promise<void> {
  if (!pushEnabled()) return;
  try {
    await checkTaskPlazos();
    await checkExpedienteNotificaciones();
  } catch (e) {
    console.error('[push] runPlazoPushCheck:', e);
  }
}

export function startPlazoPushScheduler(): void {
  if (!pushEnabled()) return;
  // Primera pasada a los 30s (deja asentarse la conexión a BD), luego cada 30 min.
  setTimeout(() => {
    void runPlazoPushCheck();
    setInterval(() => void runPlazoPushCheck(), 30 * 60 * 1000);
  }, 30_000);
}
