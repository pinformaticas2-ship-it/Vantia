import webpush from 'web-push';
import pool from '../config/database';

// ── Notificaciones push del navegador ────────────────────────────────────────
// Envío best-effort: si faltan las claves VAPID en el entorno (no configuradas
// todavía, o en local), el push simplemente se queda desactivado -- nunca debe
// romper el flujo normal (enviar un mensaje, recibir un correo...) por esto.

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT      || 'mailto:soporte@vantia.app';

const enabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (enabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas -- notificaciones push desactivadas.');
}

export function pushEnabled(): boolean {
  return enabled;
}

export function vapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta dentro de la app a la que navegar al hacer clic en el aviso. */
  url?: string;
  /** Agrupa avisos relacionados: uno nuevo con el mismo tag sustituye al anterior en la bandeja del SO. */
  tag?: string;
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string; }

async function deliver(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (!enabled || !subs.length) return;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (e: any) {
      // 404/410 = el navegador revocó o caducó esa suscripción -- se limpia sola.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        try { await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]); } catch { /* noop */ }
      } else {
        console.error('[push] error enviando notificación:', e?.statusCode || e?.message || e);
      }
    }
  }));
}

export async function sendPushToUser(userId: string | null | undefined, payload: PushPayload): Promise<void> {
  if (!enabled || !userId) return;
  try {
    const { rows } = await pool.query<SubRow>(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
      [userId],
    );
    await deliver(rows, payload);
  } catch (e) { console.error('[push] sendPushToUser:', e); }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload, excludeUserId?: string | null): Promise<void> {
  const ids = [...new Set(userIds.filter((id) => id && id !== excludeUserId))];
  if (!enabled || !ids.length) return;
  try {
    const { rows } = await pool.query<SubRow>(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::text[])`,
      [ids],
    );
    await deliver(rows, payload);
  } catch (e) { console.error('[push] sendPushToUsers:', e); }
}

/** A todos los miembros de una organización (para avisos de ámbito de despacho: recordatorios de expediente). */
export async function sendPushToOrg(organizacionId: string | null | undefined, payload: PushPayload, excludeUserId?: string | null): Promise<void> {
  if (!enabled || !organizacionId) return;
  try {
    const { rows: members } = await pool.query(
      `SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1`,
      [organizacionId],
    );
    await sendPushToUsers(members.map((m: any) => m.user_id), payload, excludeUserId);
  } catch (e) { console.error('[push] sendPushToOrg:', e); }
}

/** A todos los suscritos, sin filtrar por organización -- para módulos aún no aislados por organización (WhatsApp). */
export async function sendPushToAll(payload: PushPayload, excludeUserId?: string | null): Promise<void> {
  if (!enabled) return;
  try {
    const { rows } = await pool.query<SubRow>(
      excludeUserId
        ? `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id <> $1`
        : `SELECT id, endpoint, p256dh, auth FROM push_subscriptions`,
      excludeUserId ? [excludeUserId] : [],
    );
    await deliver(rows, payload);
  } catch (e) { console.error('[push] sendPushToAll:', e); }
}
