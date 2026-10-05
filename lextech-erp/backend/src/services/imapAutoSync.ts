import pool from '../config/database';
import { syncImapAccountAllFolders, probeImapAccount } from '../controllers/emailController';
import { emitEmailEvent } from '../utils/emailSSE';
import { withTimeout } from '../utils/imap';
import { heartbeatStart, heartbeatEnd } from '../utils/heartbeat';

// Tope por cuenta: aunque cada conexión/carpeta ya tiene su límite, una cuenta
// nunca puede retener la pasada (antes una cuenta que no respondía dejaba sin
// sincronizar a todas las demás).
const ACCOUNT_TIMEOUT_MS = 5 * 60 * 1000;

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
  const resumen = { cuentas: 0, ok: 0, conError: 0, nuevos: 0, sondeadas: 0, sinLock: false };
  let fallo: string | null = null;
  await heartbeatStart('imap-auto-sync');
  const client = await pool.connect().catch(() => null);
  if (!client) { running = false; return; }
  try {
    const { rows: lock } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [ADVISORY_LOCK_KEY]);
    if (!lock[0]?.ok) { resumen.sinLock = true; return; }
    try {
      const { rows: accounts } = await pool.query(
        `SELECT * FROM email_accounts WHERE active = true AND COALESCE(protocol, 'imap') = 'imap' ORDER BY last_sync_at ASC NULLS FIRST`,
      );
      resumen.cuentas = accounts.length;
      for (const acc of accounts) {
        try {
          // Sondeo completo (estructura + estado de cada carpeta) y reparación
          // de las atrasadas, como mucho una vez al día por cuenta -- deja el
          // informe en probe_report para "Diagnosticar buzón".
          if (!acc.probe_at || Date.now() - new Date(acc.probe_at).getTime() > 24 * 60 * 60 * 1000) {
            resumen.sondeadas++;
            await withTimeout(probeImapAccount(acc, { repair: true }), ACCOUNT_TIMEOUT_MS, `sondeo de ${acc.email}`)
              .catch((e) => console.warn(`[imap-probe] ${acc.email}:`, e?.message || e));
          }
          const r = await withTimeout(syncImapAccountAllFolders(acc), ACCOUNT_TIMEOUT_MS, `sincronización de ${acc.email}`);
          resumen.nuevos += r.nuevos;
          if (r.errores.length) resumen.conError++; else resumen.ok++;
          if (r.nuevos > 0) emitEmailEvent(acc.user_id, { type: 'messageNew', accountId: acc.id, folder: '*' });
          if (r.errores.length) console.warn(`[imap-auto] ${acc.email}: ${r.errores.length} carpeta(s) con error`, r.errores.slice(0, 3));
        } catch (e: any) {
          // Credenciales caducadas, servidor caído... se reintenta en la siguiente pasada.
          resumen.conError++;
          console.warn(`[imap-auto] ${acc.email}:`, e?.message || e);
        }
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } catch (e: any) {
    fallo = e?.message || String(e);
    console.error('[imap-auto] runImapAutoSync:', e);
  } finally {
    client.release();
    running = false;
    await heartbeatEnd('imap-auto-sync', resumen, fallo);
  }
}

export function startImapAutoSync(): void {
  // Se ejecuta SIEMPRE, también con EmailEngine configurado: antes se
  // desactivaba si existía EMAIL_ENGINE_URL y, si EmailEngine no estaba
  // empujando cambios de verdad, las carpetas dejaban de actualizarse sin
  // ningún aviso. Hacer ambas cosas es seguro (los INSERT son idempotentes).
  setTimeout(() => {
    void runImapAutoSync();
    setInterval(() => void runImapAutoSync(), INTERVAL_MS);
  }, 30_000);
}
