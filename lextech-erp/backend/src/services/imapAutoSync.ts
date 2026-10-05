import pool from '../config/database';
import { syncImapAccountAllFolders } from '../controllers/emailController';
import { emitEmailEvent } from '../utils/emailSSE';

// ── Sincronización automática de todas las carpetas IMAP ─────────────────────
// Antes solo se sincronizaba la carpeta que el usuario tenía abierta (más
// Recibidos/Enviados/Borradores al pulsar "Enviar y Recibir"), y solo con la
// página de Correo abierta: el resto de carpetas se quedaban desfasadas hasta
// entrar en ellas. Esto las recorre todas, cada pocos minutos, como hace
// Thunderbird -- un único login por cuenta para no saturar al servidor de
// correo. Si llega algo nuevo, la pestaña de Correo abierta se refresca sola
// (evento SSE 'messageNew').

const INTERVAL_MS = 5 * 60 * 1000;
// Clave fija para pg_try_advisory_lock: con varias instancias del backend,
// solo una recorre las cuentas a la vez.
const ADVISORY_LOCK_KEY = 74_810_234;
let running = false;

export async function runImapAutoSync(): Promise<void> {
  if (running) return;
  running = true;
  const client = await pool.connect().catch(() => null);
  if (!client) { running = false; return; }
  try {
    const { rows: lock } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [ADVISORY_LOCK_KEY]);
    if (!lock[0]?.ok) return;
    try {
      const { rows: accounts } = await pool.query(
        `SELECT * FROM email_accounts WHERE active = true AND COALESCE(protocol, 'imap') = 'imap' ORDER BY last_sync_at ASC NULLS FIRST`,
      );
      for (const acc of accounts) {
        try {
          const r = await syncImapAccountAllFolders(acc);
          if (r.nuevos > 0) emitEmailEvent(acc.user_id, { type: 'messageNew', accountId: acc.id, folder: '*' });
          if (r.errores.length) console.warn(`[imap-auto] ${acc.email}: ${r.errores.length} carpeta(s) con error`, r.errores.slice(0, 3));
        } catch (e: any) {
          // Credenciales caducadas, servidor caído... se reintenta en la siguiente pasada.
          console.warn(`[imap-auto] ${acc.email}:`, e?.message || e);
        }
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } catch (e) {
    console.error('[imap-auto] runImapAutoSync:', e);
  } finally {
    client.release();
    running = false;
  }
}

export function startImapAutoSync(): void {
  // Sin EmailEngine (que ya empuja los cambios por webhook) -- con él activo
  // esto sería trabajo duplicado.
  if (process.env.EMAIL_ENGINE_URL) return;
  setTimeout(() => {
    void runImapAutoSync();
    setInterval(() => void runImapAutoSync(), INTERVAL_MS);
  }, 90_000);
}
