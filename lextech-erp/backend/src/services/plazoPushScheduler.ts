import { randomBytes } from 'crypto';
import pool from '../config/database';
import { pushEnabled, sendPushToUser, sendPushToOrgModule, ResultadoPush } from '../utils/webPush';

const PUBLIC_BACKEND_URL = (process.env.PUBLIC_BACKEND_URL || 'https://vantia.up.railway.app').replace(/\/$/, '');

function buildDismissUrl(kind: 'task' | 'notif', id: string, token: string): string {
  return `${PUBLIC_BACKEND_URL}/api/push/dismiss-plazo?kind=${kind}&id=${id}&token=${token}`;
}

// ── Avisos push de plazos ─────────────────────────────────────────────────────
// Los plazos (tareas con fecha límite, recordatorios de expediente) no son un
// evento que dispare nada por sí solo -- alguien tiene que fijarse en el
// calendario. Este programador revisa cada 30 min qué está cerca o vencido.
//
// 13/10/2026: antes repetía el aviso cada ~20 h para siempre (también de
// madrugada, y la hora iba derivando) y contaba los días en UTC ("Vence hoy"
// de noche cuando era mañana). Ahora:
//  · los días se cuentan en hora de Madrid;
//  · se avisa una vez por fase: "en N días" (≤3), "mañana", "hoy" y
//    "vencida"; ya vencida, como mucho 3 veces, una por semana;
//  · el horario de silencio de cada persona se respeta: si todos estaban en
//    silencio, no se marca como avisado y se reintenta en la siguiente pasada.

const PLAZO_ALERT_DAYS = 3;
const MAX_VENCIDA = 3;
const VENCIDA_CADA_DIAS = 7;

type Fase = 'pronto' | 'manana' | 'hoy' | 'vencida';

function faseDe(dias: number): Fase {
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'manana';
  return 'pronto';
}

function texto(dias: number): string {
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}

/** ¿Toca avisar? Al entrar en una fase nueva, o (vencida) cada semana hasta 3 veces. */
function tocaAvisar(fase: Fase, faseAnterior: string | null, vencidaN: number, ultimoEnvio: Date | null): boolean {
  if (fase !== faseAnterior) return true;
  if (fase !== 'vencida' || vencidaN >= MAX_VENCIDA) return false;
  return !ultimoEnvio || Date.now() - new Date(ultimoEnvio).getTime() >= VENCIDA_CADA_DIAS * 86_400_000;
}

/** Se da por avisado si le llegó a alguien, o si nadie lo quería (tipo
 *  desactivado / sin acceso). Si solo faltó porque era hora de silencio, no. */
function avisado(r: ResultadoPush): boolean {
  return r.enviados > 0 || r.silenciados === 0;
}

// Días hasta el plazo contados en el calendario de Madrid.
const DIAS_SQL = (col: string) => `(${col} - (NOW() AT TIME ZONE 'Europe/Madrid')::date)`;

async function checkTaskPlazos(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, titulo, user_id, expediente_id, client_name, plazo_push_fase, plazo_push_vencida_n, plazo_push_sent_at,
            ${DIAS_SQL('plazo')}::int AS dias
       FROM client_tasks
      WHERE plazo IS NOT NULL
        AND estado <> 'completada'
        AND user_id IS NOT NULL
        AND NOT plazo_push_dismissed
        AND plazo <= ((NOW() AT TIME ZONE 'Europe/Madrid')::date + $1::int)`,
    [PLAZO_ALERT_DAYS],
  );
  for (const t of rows) {
    const fase = faseDe(t.dias);
    if (!tocaAvisar(fase, t.plazo_push_fase, t.plazo_push_vencida_n, t.plazo_push_sent_at)) continue;
    const dismissToken = randomBytes(16).toString('hex');
    const r = await sendPushToUser(t.user_id, {
      title: t.titulo || 'Tarea sin título',
      body: `${texto(t.dias)}${t.client_name ? ' · ' + t.client_name : ''}`,
      url: t.expediente_id ? `/dashboard/expedientes/${t.expediente_id}?tab=tareas` : '/dashboard/tareas',
      tag: `plazo-task-${t.id}`,
      dismissUrl: buildDismissUrl('task', t.id, dismissToken),
      tipo: 'plazo',
    });
    if (!avisado(r)) continue;
    await pool.query(
      `UPDATE client_tasks
          SET plazo_push_sent_at = NOW(), plazo_push_dismiss_token = $2, plazo_push_fase = $3::varchar,
              plazo_push_vencida_n = CASE WHEN $3::varchar = 'vencida' THEN plazo_push_vencida_n + 1 ELSE 0 END
        WHERE id = $1`,
      [t.id, dismissToken, fase],
    );
  }
}

async function checkExpedienteNotificaciones(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT n.id, n.titulo, n.expediente_id, n.push_fase, n.push_vencida_n, n.push_sent_at,
            e.organizacion_id, e.anio, e.num_exp, ${DIAS_SQL('n.fecha_limite')}::int AS dias
       FROM exp_notificaciones n
       JOIN expedientes e ON e.id = n.expediente_id
      WHERE n.estado = 'pendiente'
        AND n.fecha_limite IS NOT NULL
        AND NOT n.push_dismissed
        AND n.fecha_limite <= ((NOW() AT TIME ZONE 'Europe/Madrid')::date + $1::int)`,
    [PLAZO_ALERT_DAYS],
  );
  for (const n of rows) {
    const fase = faseDe(n.dias);
    if (!tocaAvisar(fase, n.push_fase, n.push_vencida_n, n.push_sent_at)) continue;
    const dismissToken = randomBytes(16).toString('hex');
    // Solo a quien puede ver Expedientes en esa organización (no a soporte).
    const r = await sendPushToOrgModule(n.organizacion_id, 'expedientes', {
      title: n.titulo || 'Recordatorio de expediente',
      body: `${texto(n.dias)} · Exp. ${n.anio}/${n.num_exp}`,
      url: `/dashboard/expedientes/${n.expediente_id}?tab=notificaciones`,
      tag: `plazo-notif-${n.id}`,
      dismissUrl: buildDismissUrl('notif', n.id, dismissToken),
      tipo: 'plazo',
    });
    if (!avisado(r)) continue;
    await pool.query(
      `UPDATE exp_notificaciones
          SET push_sent_at = NOW(), push_dismiss_token = $2, push_fase = $3::varchar,
              push_vencida_n = CASE WHEN $3::varchar = 'vencida' THEN push_vencida_n + 1 ELSE 0 END
        WHERE id = $1`,
      [n.id, dismissToken, fase],
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
