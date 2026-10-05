import pool from '../config/database';
import { decryptPassword } from '../utils/emailCrypto';
import { normalizeVistasConfig, requestVistasCheck } from './vistasAutomation';

const { ImapFlow } = require('imapflow');

// ── Aviso inmediato de correo nuevo (IMAP IDLE) para la automatización de vistas
// Para cada buzón IMAP vigilado por una organización con la automatización
// activada se mantiene una conexión abierta a su Bandeja de entrada en modo
// IDLE: el propio servidor de correo avisa en cuanto entra un mensaje (igual
// que Thunderbird) y se lanza la revisión de esa organización al momento, sin
// esperar a la pasada de cada minuto. Si la conexión se cae, se reabre sola en
// la siguiente reconciliación (cada minuto). Gmail no admite este aviso sin
// Google Cloud Pub/Sub: esos buzones se quedan con la revisión de cada minuto.

interface Watcher { client: any; organizacionId: string; fingerprint: string; closed: boolean }

const watchers = new Map<string, Watcher>(); // clave: email_accounts.id
const RECONCILE_MS = 60 * 1000;
const DEBOUNCE_MS = 3000;

async function desiredMailboxes(): Promise<Map<string, { organizacionId: string; acc: any }>> {
  const { rows: orgs } = await pool.query(
    `SELECT id, vistas_auto_config FROM organizaciones WHERE vistas_auto_enabled = true AND vistas_auto_activated_at IS NOT NULL`,
  );
  const out = new Map<string, { organizacionId: string; acc: any }>();
  for (const org of orgs) {
    const cfg = normalizeVistasConfig(org.vistas_auto_config);
    if (cfg.mailbox?.type !== 'imap') continue;
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE id = $1 AND organizacion_id = $2 AND active = true AND COALESCE(protocol,'imap') = 'imap'`,
      [cfg.mailbox.id, org.id],
    );
    if (rows.length) out.set(rows[0].id, { organizacionId: org.id, acc: rows[0] });
  }
  return out;
}

// Si cambian host/usuario/contraseña de la cuenta, hay que reabrir la conexión.
const fingerprintOf = (acc: any) => [acc.imap_host, acc.imap_port, acc.imap_secure, acc.username, acc.password_enc].join('|');

async function stopWatcher(accountId: string) {
  const w = watchers.get(accountId);
  if (!w) return;
  watchers.delete(accountId);
  w.closed = true;
  try { await w.client.logout(); } catch { try { w.client.close(); } catch { /* noop */ } }
}

async function startWatcher(accountId: string, organizacionId: string, acc: any) {
  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.username, pass: decryptPassword(acc.password_enc) },
    tls: { rejectUnauthorized: false },
    logger: false,
  });
  const watcher: Watcher = { client, organizacionId, fingerprint: fingerprintOf(acc), closed: false };
  watchers.set(accountId, watcher);

  let timer: NodeJS.Timeout | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    // Pequeña espera: si entran varios correos seguidos, una sola revisión.
    timer = setTimeout(() => requestVistasCheck(organizacionId), DEBOUNCE_MS);
  };
  const drop = () => {
    if (watchers.get(accountId) === watcher) watchers.delete(accountId);
  };
  client.on('exists', trigger);
  client.on('close', drop);
  client.on('error', (e: any) => {
    console.warn(`[vistas-idle] ${acc.email}:`, e?.message || e);
    drop();
  });

  try {
    await client.connect();
    // Mantener INBOX abierta: imapflow entra solo en IDLE cuando no hay
    // otros comandos y re-IDLEa periódicamente (los servidores cortan a ~29 min).
    await client.mailboxOpen('INBOX');
    // Por si entró algo entre la última revisión y abrir la conexión.
    trigger();
  } catch (e: any) {
    console.warn(`[vistas-idle] no se pudo abrir ${acc.email}:`, e?.message || e);
    drop();
    try { client.close(); } catch { /* noop */ }
  }
}

export async function reconcileVistasIdle(): Promise<void> {
  try {
    const desired = await desiredMailboxes();
    for (const [accountId, w] of watchers) {
      const want = desired.get(accountId);
      if (!want || want.organizacionId !== w.organizacionId || fingerprintOf(want.acc) !== w.fingerprint || !w.client.usable) {
        await stopWatcher(accountId);
      }
    }
    for (const [accountId, { organizacionId, acc }] of desired) {
      if (!watchers.has(accountId)) await startWatcher(accountId, organizacionId, acc);
    }
  } catch (e) {
    console.error('[vistas-idle] reconcile:', e);
  }
}

export function startVistasIdle(): void {
  setTimeout(() => {
    void reconcileVistasIdle();
    setInterval(() => void reconcileVistasIdle(), RECONCILE_MS);
  }, 20_000);
}

/** Para cerrar las conexiones (pruebas). */
export async function stopVistasIdle(): Promise<void> {
  for (const id of [...watchers.keys()]) await stopWatcher(id);
}
