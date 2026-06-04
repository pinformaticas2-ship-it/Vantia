import { Request, Response } from 'express';
import * as crypto from 'crypto';
import pool from '../config/database';
import { ImapClient, ImapConfig, ImapFolderInfo, syncInbox, testImapConnection } from '../utils/imap';
import { Pop3Config, syncPop3Inbox, testPop3Connection } from '../utils/pop3';
import { sendEmail, SmtpConfig, MailMessage, testSmtpConnection } from '../utils/smtp';
import { logActivityForReq } from './activityController';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENC_KEY = (process.env.EMAIL_ENC_KEY || 'lextech-default-enc-key-32-chars!!').slice(0, 32).padEnd(32, '!');
const ENC_IV  = (process.env.EMAIL_ENC_IV  || 'lextech-iv-16!!').slice(0, 16).padEnd(16, '!');

function encryptPassword(plain: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, ENC_IV);
  return cipher.update(plain, 'utf8', 'base64') + cipher.final('base64');
}

function decryptPassword(enc: string): string {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, ENC_IV);
    return decipher.update(enc, 'base64', 'utf8') + decipher.final('utf8');
  } catch {
    return enc; // fallback si falla el decrypt
  }
}

const ok  = (res: Response, data: any)         => res.json({ success: true,  data });
const err = (res: Response, msg: string, s=500) => res.status(s).json({ success: false, error: msg });

function userId(req: Request): string {
  return (req as any).auth?.userId || '';
}

function explainMailConnectionError(error: any, proto: 'imap' | 'pop3' | 'smtp'): string {
  const message = [
    error?.responseText,
    error?.response,
    error?.serverResponseText,
    error?.serverResponse,
    error?.command && error?.responseStatus ? `${error.command} ${error.responseStatus}` : null,
    error?.code,
    error?.message,
  ]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(' | ')
    .trim() || String(error?.message || error || '').trim();
  const lower = message.toLowerCase();
  const label = proto === 'smtp' ? 'SMTP' : proto.toUpperCase();

  if (lower.includes('auth') || lower.includes('login') || lower.includes('invalid credentials')) {
    return `No se pudo iniciar sesión en ${label}. Revisa el usuario, la contraseña o la contraseña de aplicación.`;
  }
  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return `El servidor ${label} rechazó la conexión. Revisa host, puerto y si ese servicio está habilitado.`;
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return `No se pudo resolver el servidor ${label}. Comprueba que el host esté bien escrito.`;
  }
  if (lower.includes('certificate') || lower.includes('tls') || lower.includes('ssl')) {
    return `La conexión segura con ${label} falló. Revisa SSL/TLS y el puerto configurado.`;
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return `El servidor ${label} tardó demasiado en responder. Comprueba host, puerto y conectividad.`;
  }

  if (lower.includes('command failed') || lower.includes('bad command') || lower.includes('no [')) {
    return `El servidor ${label} rechazó la operación. Suele deberse a usuario o contraseña incorrectos, SSL/TLS mal configurado o un host/puerto que no corresponde con ese proveedor.`;
  }

  return `No se pudo validar la conexión ${label}: ${message || 'error desconocido'}`;
}

function parseAddressToken(raw: string): { email: string; name: string | null } | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  const angled = value.match(/^(.*?)<([^>]+)>$/);
  const email = (angled ? angled[2] : value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const name = angled?.[1]?.trim().replace(/^"|"$/g, '') || null;
  return { email, name };
}

function extractContacts(input: unknown): Array<{ email: string; name: string | null }> {
  const parts = Array.isArray(input)
    ? input.flatMap((item) => String(item || '').split(/[;,]/))
    : String(input || '').split(/[;,]/);

  return parts
    .map(parseAddressToken)
    .filter((item): item is { email: string; name: string | null } => Boolean(item));
}

async function upsertEmailContacts(
  uid: string,
  contacts: Array<{ email: string; name?: string | null }>,
  source = 'gmail',
) {
  for (const contact of contacts) {
    await pool.query(
      `INSERT INTO email_contacts (user_id, email, name, source, usage_count, last_used_at)
       VALUES ($1,$2,$3,$4,1,NOW())
       ON CONFLICT (user_id, email)
       DO UPDATE SET
         name = COALESCE(EXCLUDED.name, email_contacts.name),
         source = EXCLUDED.source,
         usage_count = email_contacts.usage_count + 1,
         last_used_at = NOW(),
         updated_at = NOW()`,
      [uid, contact.email, contact.name || null, source],
    );
  }
}

async function getAccountForMessage(messageId: string, uid: string) {
  const { rows } = await pool.query(
    `SELECT e.id, e.uid, e.folder, e.user_id,
            a.id AS account_id, a.imap_host, a.imap_port, a.imap_secure, a.username, a.password_enc
       FROM emails e
       JOIN email_accounts a ON a.id=e.account_id
      WHERE e.id=$1 AND e.user_id=$2`,
    [messageId, uid],
  );
  return rows[0] || null;
}

// ── Cuentas ───────────────────────────────────────────────────────────────────

export async function getAccounts(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(
      `SELECT id, label, email, imap_host, imap_port, imap_secure,
              smtp_host, smtp_port, smtp_secure, username, active,
              COALESCE(protocol, 'imap') AS protocol,
              last_sync_at, created_at
       FROM email_accounts WHERE user_id=$1 ORDER BY created_at`,
      [uid],
    );
    return ok(res, rows);
  } catch (e: any) { return err(res, e.message); }
}

export async function getOAuthProfiles(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const provider = String(req.query.provider || 'google').toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT id, provider, email, display_name, avatar_url, external_id, last_used_at, created_at
         FROM email_oauth_profiles
        WHERE user_id=$1 AND provider=$2
        ORDER BY last_used_at DESC, created_at DESC`,
      [uid, provider],
    );
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function upsertOAuthProfile(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);

  const provider = String(req.body?.provider || 'google').toLowerCase();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.display_name || req.body?.displayName || '').trim() || null;
  const avatarUrl = String(req.body?.avatar_url || req.body?.avatarUrl || '').trim() || null;
  const externalId = String(req.body?.external_id || req.body?.externalId || '').trim() || null;

  if (!email) return err(res, 'Falta el email del perfil', 400);

  try {
    const { rows } = await pool.query(
      `INSERT INTO email_oauth_profiles (user_id, provider, email, display_name, avatar_url, external_id, last_used_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (user_id, provider, email)
       DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, email_oauth_profiles.display_name),
         avatar_url   = COALESCE(EXCLUDED.avatar_url, email_oauth_profiles.avatar_url),
         external_id  = COALESCE(EXCLUDED.external_id, email_oauth_profiles.external_id),
         last_used_at = NOW(),
         updated_at   = NOW()
       RETURNING id, provider, email, display_name, avatar_url, external_id, last_used_at, created_at`,
      [uid, provider, email, displayName, avatarUrl, externalId],
    );
    return ok(res, rows[0]);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function deleteOAuthProfile(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM email_oauth_profiles WHERE id=$1 AND user_id=$2`,
      [id, uid],
    );
    if (!rowCount) return err(res, 'Perfil no encontrado', 404);
    return ok(res, true);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function createAccount(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const {
    label = 'Mi cuenta', email,
    imap_host, imap_port, imap_secure = true,
    smtp_host, smtp_port = 587, smtp_secure = false,
    username, password,
    protocol = 'imap',   // 'imap' | 'pop3'
  } = req.body;

  const proto      = String(protocol).toLowerCase() === 'pop3' ? 'pop3' : 'imap';
  const defaultPort = proto === 'pop3' ? 995 : 993;
  const inPort     = Number(imap_port ?? defaultPort);

  if (!email || !imap_host || !smtp_host || !username || !password) {
    return err(res, 'Faltan campos obligatorios (email, servidor, usuario, contraseña)', 400);
  }

  try {
    const { rows: existingAccounts } = await pool.query(
      `SELECT id, label
         FROM email_accounts
        WHERE user_id=$1
          AND LOWER(email)=LOWER($2)
          AND LOWER(username)=LOWER($3)
          AND LOWER(imap_host)=LOWER($4)
          AND COALESCE(protocol, 'imap')=$5
          AND active=true
        LIMIT 1`,
      [uid, email, username, imap_host, proto],
    );
    if (existingAccounts.length) {
      return err(res, 'Esa cuenta ya existe en el módulo de correo. Usa la cuenta ya creada o bórrala antes de crear otra igual.', 409);
    }

    const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout (${label}): el servidor tardó demasiado en responder`)), ms))]);

    if (proto === 'pop3') {
      const pop3Cfg: Pop3Config = {
        host: String(imap_host),
        port: inPort,
        secure: Boolean(imap_secure),
        user: String(username),
        password: String(password),
        timeout: 12000,
      };
      await withTimeout(testPop3Connection(pop3Cfg), 20000, 'POP3').catch((e) => {
        throw new Error(explainMailConnectionError(e, 'pop3'));
      });
    } else {
      const imapCfg: ImapConfig = {
        host: String(imap_host),
        port: inPort,
        secure: Boolean(imap_secure),
        user: String(username),
        password: String(password),
      };
      await withTimeout(testImapConnection(imapCfg), 20000, 'IMAP').catch((e) => {
        throw new Error(explainMailConnectionError(e, 'imap'));
      });
    }

    const smtpCfg: SmtpConfig = {
      host: String(smtp_host),
      port: Number(smtp_port),
      secure: Boolean(smtp_secure),
      user: String(username),
      password: String(password),
    };
    await withTimeout(testSmtpConnection(smtpCfg), 20000, 'SMTP').catch((e) => {
      throw new Error(explainMailConnectionError(e, 'smtp'));
    });

    const enc = encryptPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO email_accounts
         (user_id, label, email, imap_host, imap_port, imap_secure,
          smtp_host, smtp_port, smtp_secure, username, password_enc, protocol)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, label, email, imap_host, imap_port, imap_secure,
                 smtp_host, smtp_port, smtp_secure, username, active,
                 protocol, last_sync_at, created_at`,
      [uid, label, email, imap_host, inPort, Boolean(imap_secure),
       smtp_host, Number(smtp_port), Boolean(smtp_secure), username, enc, proto],
    );
    return ok(res, rows[0]);
  } catch (e: any) { return err(res, e.message); }
}

export async function deleteAccount(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM email_accounts WHERE id=$1 AND user_id=$2`,
      [id, uid],
    );
    if (!rowCount) return err(res, 'Cuenta no encontrada', 404);
    return ok(res, { id });
  } catch (e: any) { return err(res, e.message); }
}

export async function getAccountFolders(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2 AND active=true`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Cuenta no encontrada', 404);

    const acc = rows[0];
    const proto = String(acc.protocol || 'imap').toLowerCase();
    if (proto === 'pop3') return ok(res, []);

    const password = decryptPassword(acc.password_enc);
    const cfg: ImapConfig = {
      host: acc.imap_host,
      port: acc.imap_port,
      secure: acc.imap_secure,
      user: acc.username,
      password,
    };

    const client = new ImapClient(cfg);
    try {
      await client.connect();
      await client.login();
      const folders = await client.listFolders();
      return ok(res, folders);
    } finally {
      await client.logout().catch(() => undefined);
    }
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function createAccountFolder(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const name = String(req.body?.name || '').trim();

  if (!name) return err(res, 'Indica un nombre de carpeta', 400);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2 AND active=true`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Cuenta no encontrada', 404);

    const acc = rows[0];
    const proto = String(acc.protocol || 'imap').toLowerCase();
    if (proto === 'pop3') return err(res, 'Las cuentas POP3 no permiten crear carpetas', 400);

    const password = decryptPassword(acc.password_enc);
    const cfg: ImapConfig = {
      host: acc.imap_host,
      port: acc.imap_port,
      secure: acc.imap_secure,
      user: acc.username,
      password,
    };

    const client = new ImapClient(cfg);
    try {
      await client.connect();
      await client.login();
      const existingFolders = await client.listFolders();
      if (existingFolders.some((folder) => folder.path.toLowerCase() === name.toLowerCase())) {
        return err(res, 'Ya existe una carpeta con ese nombre', 409);
      }
      await client.createFolder(name);
      const folders = await client.listFolders();
      return ok(res, { created: name, folders });
    } finally {
      await client.logout().catch(() => undefined);
    }
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Sincronización IMAP / POP3 ────────────────────────────────────────────────

export async function syncAccount(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const folder = (req.query.folder as string) || 'INBOX';
  const limit  = Math.min(Number(req.query.limit) || 50, 200);

  try {
    const { rows: accs } = await pool.query(
      `SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2 AND active=true`,
      [id, uid],
    );
    if (!accs.length) return err(res, 'Cuenta no encontrada', 404);
    const acc      = accs[0];
    const password = decryptPassword(acc.password_enc);
    const proto    = (acc.protocol || 'imap').toLowerCase();

    let inserted = 0;
    let synced   = 0;

    if (proto === 'pop3') {
      // ── POP3: descargar solo mensajes nuevos por UIDL ──────────────────────
      const { rows: known } = await pool.query(
        `SELECT message_id FROM emails WHERE account_id=$1 AND message_id IS NOT NULL`,
        [acc.id],
      );
      const knownUidls = new Set(known.map((r: any) => String(r.message_id)));

      const pop3Cfg: Pop3Config = {
        host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure,
        user: acc.username, password,
      };
      const messages = await syncPop3Inbox(pop3Cfg, knownUidls, limit);
      synced = messages.length;

      for (const msg of messages) {
        const sentAt = msg.date ? new Date(msg.date) : null;
        const { rowCount } = await pool.query(
          `INSERT INTO emails
             (account_id, user_id, message_id, folder, from_email, from_name,
              to_emails, subject, snippet, body_text, body_html, is_read,
              is_starred, size_bytes, sent_at)
           VALUES ($1,$2,$3,'INBOX',$4,$5,$6,$7,$8,$9,$10,false,false,$11,$12)
           ON CONFLICT DO NOTHING`,
          [
            acc.id, uid, msg.uidl,
            msg.from || null, msg.fromName || null, msg.to || null,
            msg.subject || '(Sin asunto)', msg.snippet || null,
            msg.bodyText || null, msg.bodyHtml || null,
            msg.size || 0, sentAt,
          ],
        );
        if (rowCount) inserted++;
      }
    } else {
      // ── IMAP ──────────────────────────────────────────────────────────────
      const imapCfg: ImapConfig = {
        host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure,
        user: acc.username, password,
      };
      const messages = await syncInbox(imapCfg, folder, limit);
      synced = messages.length;

      for (const msg of messages) {
        const sentAt = msg.date ? new Date(msg.date) : null;
        const { rowCount } = await pool.query(
          `INSERT INTO emails
             (account_id, user_id, uid, message_id, folder, from_email, from_name,
              to_emails, subject, snippet, is_read, is_starred, size_bytes, sent_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (account_id, uid, folder) DO UPDATE SET
             is_read    = EXCLUDED.is_read,
             is_starred = EXCLUDED.is_starred,
             snippet    = COALESCE(EXCLUDED.snippet, emails.snippet)`,
          [
            acc.id, uid,
            msg.uid > 0 ? msg.uid : null, msg.messageId || null,
            folder, msg.from || null, msg.fromName || null, msg.to || null,
            msg.subject || '(Sin asunto)', msg.snippet || null,
            msg.flags.includes('\\Seen'), msg.flags.includes('\\Flagged'),
            msg.size || 0, sentAt,
          ],
        );
        if (rowCount) inserted++;
      }
    }

    await pool.query(`UPDATE email_accounts SET last_sync_at=NOW() WHERE id=$1`, [acc.id]);

    return ok(res, { synced, inserted, folder, protocol: proto });
  } catch (e: any) { return err(res, `Error de sincronización: ${e.message}`); }
}

// ── Mensajes ──────────────────────────────────────────────────────────────────

export async function getMessages(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);

  const accountId = req.query.account_id as string | undefined;
  const folder    = (req.query.folder as string) || 'INBOX';
  const search    = (req.query.q as string) || '';
  const onlyUnread = req.query.unread === '1';
  const onlyStarred = req.query.starred === '1';
  const page      = Math.max(1, Number(req.query.page) || 1);
  const pageSize  = Math.min(Number(req.query.limit) || 50, 200);
  const offset    = (page - 1) * pageSize;

  try {
    const params: any[] = [uid];
    const conditions: string[] = ['e.user_id=$1'];

    if (accountId) { params.push(accountId); conditions.push(`e.account_id=$${params.length}`); }

    // Map virtual folders
    if (folder === 'STARRED') {
      conditions.push(`e.is_starred=true`);
    } else if (folder === 'UNREAD') {
      conditions.push(`e.is_read=false`);
    } else {
      params.push(folder); conditions.push(`e.folder=$${params.length}`);
    }

    if (onlyUnread)  conditions.push(`e.is_read=false`);
    if (onlyStarred) conditions.push(`e.is_starred=true`);

    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      conditions.push(`(e.subject ILIKE $${p} OR e.from_email ILIKE $${p} OR e.from_name ILIKE $${p} OR e.snippet ILIKE $${p})`);
    }

    const where = conditions.join(' AND ');
    params.push(pageSize, offset);
    const limitP = params.length - 1;
    const offsetP = params.length;

    const { rows } = await pool.query(
      `SELECT e.id, e.uid, e.folder, e.from_email, e.from_name, e.to_emails,
              e.subject, e.snippet, e.is_read, e.is_starred, e.has_attachments,
              e.size_bytes, e.sent_at, e.account_id, e.expediente_id, e.cliente_id,
              a.label AS account_label, a.email AS account_email
       FROM emails e
       JOIN email_accounts a ON a.id=e.account_id
       WHERE ${where}
       ORDER BY e.sent_at DESC NULLS LAST
       LIMIT $${limitP} OFFSET $${offsetP}`,
      params,
    );

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM emails e WHERE ${where}`,
      params.slice(0, -2),
    );

    return ok(res, { emails: rows, total: parseInt(cnt[0].count), page, pageSize });
  } catch (e: any) { return err(res, e.message); }
}

export async function getMessage(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT e.*, a.imap_host, a.imap_port, a.imap_secure,
              a.username, a.password_enc, a.email AS account_email, a.label AS account_label
       FROM emails e
       JOIN email_accounts a ON a.id=e.account_id
       WHERE e.id=$1 AND e.user_id=$2`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Email no encontrado', 404);
    const row = rows[0];

    // If we have a uid and no body, fetch from IMAP
    if (row.uid && !row.body_html && !row.body_text) {
      try {
        const password = decryptPassword(row.password_enc);
        const cfg: ImapConfig = {
          host: row.imap_host, port: row.imap_port, secure: row.imap_secure,
          user: row.username, password,
        };
        const client = new ImapClient(cfg);
        await client.connect();
        await client.login();
        await client.selectFolder(row.folder);
        const full = await client.fetchFullMessage(row.uid);
        await client.logout();

        if (full) {
          await pool.query(
            `UPDATE emails SET body_text=$1, body_html=$2, snippet=$3 WHERE id=$4`,
            [full.bodyText, full.bodyHtml, full.snippet, id],
          );
          row.body_text = full.bodyText;
          row.body_html = full.bodyHtml;
          row.snippet   = full.snippet;
        }
      } catch (_e) { /* best effort — return what we have */ }
    }

    // Mark as read
    if (!row.is_read) {
      await pool.query(`UPDATE emails SET is_read=true WHERE id=$1`, [id]);
      row.is_read = true;
      // Also mark on IMAP server (best effort)
      if (row.uid) {
        try {
          const password = decryptPassword(row.password_enc);
          const cfg: ImapConfig = {
            host: row.imap_host, port: row.imap_port, secure: row.imap_secure,
            user: row.username, password,
          };
          const client = new ImapClient(cfg);
          await client.connect();
          await client.login();
          await client.selectFolder(row.folder);
          await client.markRead(row.uid, true);
          await client.logout();
        } catch (_e) {}
      }
    }

    // Remove sensitive fields
    const { imap_host, imap_port, imap_secure, username, password_enc, ...safe } = row;
    return ok(res, safe);
  } catch (e: any) { return err(res, e.message); }
}

export async function markRead(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { read = true } = req.body;
  try {
    const message = await getAccountForMessage(id, uid);
    if (!message) return err(res, 'Email no encontrado', 404);

    await pool.query(
      `UPDATE emails SET is_read=$1 WHERE id=$2 AND user_id=$3`,
      [Boolean(read), id, uid],
    );

    if (message.uid) {
      try {
        const password = decryptPassword(message.password_enc);
        const cfg: ImapConfig = {
          host: message.imap_host, port: message.imap_port, secure: message.imap_secure,
          user: message.username, password,
        };
        const client = new ImapClient(cfg);
        await client.connect();
        await client.login();
        await client.selectFolder(message.folder);
        await client.markRead(Number(message.uid), Boolean(read));
        await client.logout();
      } catch (_e) { /* best effort */ }
    }

    return ok(res, { id, is_read: Boolean(read) });
  } catch (e: any) { return err(res, e.message); }
}

export async function toggleStar(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const message = await getAccountForMessage(id, uid);
    if (!message) return err(res, 'Email no encontrado', 404);

    const { rows } = await pool.query(
      `UPDATE emails SET is_starred = NOT is_starred WHERE id=$1 AND user_id=$2
       RETURNING is_starred`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Email no encontrado', 404);

    if (message.uid) {
      try {
        const password = decryptPassword(message.password_enc);
        const cfg: ImapConfig = {
          host: message.imap_host, port: message.imap_port, secure: message.imap_secure,
          user: message.username, password,
        };
        const client = new ImapClient(cfg);
        await client.connect();
        await client.login();
        await client.selectFolder(message.folder);
        await client.markFlagged(Number(message.uid), Boolean(rows[0].is_starred));
        await client.logout();
      } catch (_e) { /* best effort */ }
    }

    return ok(res, { id, is_starred: rows[0].is_starred });
  } catch (e: any) { return err(res, e.message); }
}

export async function deleteMessage(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const permanent = req.query.permanent === '1';

  try {
    const { rows } = await pool.query(
      `SELECT e.uid, e.folder, a.imap_host, a.imap_port, a.imap_secure, a.username, a.password_enc
       FROM emails e JOIN email_accounts a ON a.id=e.account_id
       WHERE e.id=$1 AND e.user_id=$2`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Email no encontrado', 404);

    if (permanent) {
      await pool.query(`DELETE FROM emails WHERE id=$1 AND user_id=$2`, [id, uid]);
    } else {
      await pool.query(
        `UPDATE emails SET folder='Trash' WHERE id=$1 AND user_id=$2`,
        [id, uid],
      );
    }

    // Best-effort IMAP delete
    const row = rows[0];
    if (row.uid) {
      try {
        const password = decryptPassword(row.password_enc);
        const cfg: ImapConfig = {
          host: row.imap_host, port: row.imap_port, secure: row.imap_secure,
          user: row.username, password,
        };
        const client = new ImapClient(cfg);
        await client.connect();
        await client.login();
        await client.selectFolder(row.folder);
        if (permanent) {
          await client.addFlag(row.uid, '\\Deleted');
          await client.expunge();
        } else {
          await client.moveToTrash(row.uid);
        }
        await client.logout();
      } catch (_e) {}
    }

    return ok(res, { id, deleted: true, permanent });
  } catch (e: any) { return err(res, e.message); }
}

// ── Vaciar papelera ───────────────────────────────────────────────────────────

export async function emptyTrash(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const accountId = req.query.account_id as string | undefined;

  try {
    const params: any[] = [uid];
    const accCond = accountId ? `AND account_id=$2` : '';
    if (accountId) params.push(accountId);

    const { rowCount } = await pool.query(
      `DELETE FROM emails WHERE user_id=$1 ${accCond} AND folder='Trash'`,
      params,
    );
    return ok(res, { deleted: rowCount ?? 0 });
  } catch (e: any) { return err(res, e.message); }
}

// ── Enviar ────────────────────────────────────────────────────────────────────

export async function sendMail(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { account_id, to, cc, bcc, subject, html, text, draft_id, expediente_id } = req.body;
  let accountId = account_id as string | undefined;

  if (!to || !subject || !html) {
    return err(res, 'Faltan campos obligatorios (to, subject, html)', 400);
  }

  try {
    if (!accountId) {
      const { rows: firstAccountRows } = await pool.query(
        `SELECT id FROM email_accounts WHERE user_id=$1 AND active=true ORDER BY created_at ASC LIMIT 1`,
        [uid],
      );
      accountId = firstAccountRows[0]?.id;
    }
    if (!accountId) return err(res, 'No hay ninguna cuenta IMAP/SMTP activa para enviar', 400);

    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2 AND active=true`,
      [accountId, uid],
    );
    if (!rows.length) return err(res, 'Cuenta no encontrada', 404);
    const acc = rows[0];
    const password = decryptPassword(acc.password_enc);

    const smtpCfg: SmtpConfig = {
      host: acc.smtp_host, port: acc.smtp_port, secure: acc.smtp_secure,
      user: acc.username, password,
    };

    const toList  = Array.isArray(to)  ? to  : [to];
    const ccList  = Array.isArray(cc)  ? cc  : cc  ? [cc]  : [];
    const bccList = Array.isArray(bcc) ? bcc : bcc ? [bcc] : [];

    const mailMsg: MailMessage = {
      from: acc.email, fromName: acc.label,
      to: toList, cc: ccList, bcc: bccList,
      subject, html, text,
    };

    await sendEmail(smtpCfg, mailMsg);

    // Save to sent
    await pool.query(
      `INSERT INTO emails (account_id, user_id, folder, from_email, from_name,
        to_emails, cc_emails, subject, body_html, body_text, snippet, is_read, sent_at, expediente_id)
       VALUES ($1,$2,'Sent',$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),$11)`,
      [
        acc.id, uid, acc.email, acc.label,
        toList.join(', '), ccList.join(', '),
        subject, html, text || '',
        (text || html.replace(/<[^>]+>/g, '')).slice(0, 200),
        expediente_id || null,
      ],
    );

    // Delete draft if any
    if (draft_id) {
      await pool.query(`DELETE FROM emails WHERE id=$1 AND user_id=$2 AND is_draft=true`, [draft_id, uid]);
    }

    await upsertEmailContacts(uid, [
      ...extractContacts(to),
      ...extractContacts(cc),
      ...extractContacts(bcc),
    ], 'smtp');

    await logActivityForReq(
      req,
      `Correo enviado: ${subject}`,
      'EMAIL',
      accountId,
      (Array.isArray(toList) ? toList : [toList]).join(', '),
      'CREATE',
    );

    return ok(res, { sent: true });
  } catch (e: any) { return err(res, `Error al enviar: ${e.message}`); }
}

export async function getEmailsByExpediente(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.folder, e.from_email, e.from_name, e.to_emails, e.cc_emails,
              e.subject, e.snippet, e.is_read, e.is_starred, e.has_attachments,
              e.sent_at, e.account_id, e.expediente_id,
              a.label AS account_label, a.email AS account_email
       FROM emails e
       JOIN email_accounts a ON a.id = e.account_id
       WHERE e.user_id = $1 AND e.expediente_id = $2 AND e.is_draft = false
       ORDER BY e.sent_at DESC NULLS LAST
       LIMIT 200`,
      [uid, id],
    );
    return ok(res, rows);
  } catch (e: any) { return err(res, e.message); }
}

export async function linkEmailToExpediente(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { expediente_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE emails SET expediente_id = $1 WHERE id = $2 AND user_id = $3 RETURNING id`,
      [expediente_id || null, id, uid],
    );
    if (!result.rows.length) return err(res, 'Email no encontrado', 404);
    return ok(res, { linked: true });
  } catch (e: any) { return err(res, e.message); }
}

export async function getRecipientSuggestions(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);

  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 8), 1), 20);
  const like = `%${q}%`;

  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM (
        SELECT
          ec.email,
          COALESCE(NULLIF(ec.name, ''), ec.email) AS name,
          ec.source,
          ec.usage_count,
          ec.last_used_at
        FROM email_contacts ec
        WHERE ec.user_id = $1
          AND ($2 = '' OR ec.email ILIKE $3 OR COALESCE(ec.name, '') ILIKE $3)

        UNION

        SELECT
          e.email,
          COALESCE(NULLIF(TRIM(CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, ''))), ''), e.commercial_name, e.email) AS name,
          'cliente' AS source,
          0 AS usage_count,
          NULL::timestamptz AS last_used_at
        FROM entities e
        WHERE e.email IS NOT NULL
          AND e.email <> ''
          AND ($2 = '' OR e.email ILIKE $3 OR COALESCE(e.first_name, '') ILIKE $3 OR COALESCE(e.last_name, '') ILIKE $3 OR COALESCE(e.commercial_name, '') ILIKE $3)
      ) candidates
      ORDER BY usage_count DESC, last_used_at DESC NULLS LAST, name ASC
      LIMIT $4
      `,
      [uid, q, like, limit],
    );

    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function logGmailSent(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);

  const { to, cc, bcc, subject, snippet, has_attachments } = req.body || {};
  if (!to || !subject) return err(res, 'Faltan campos obligatorios (to, subject)', 400);

  try {
    const contacts = [
      ...extractContacts(to),
      ...extractContacts(cc),
      ...extractContacts(bcc),
    ];

    if (contacts.length) {
      await upsertEmailContacts(uid, contacts, 'gmail');
    }

    const recipientsText = contacts.map((contact) => contact.email).join(', ');
    const attachmentSuffix = has_attachments ? ' con adjuntos' : '';
    const summary = String(snippet || '').slice(0, 220);

    await logActivityForReq(
      req,
      `Correo Gmail enviado${attachmentSuffix}: ${subject}`,
      'EMAIL',
      undefined,
      recipientsText || subject,
      'CREATE',
    );

    return ok(res, {
      logged: true,
      contacts_saved: contacts.length,
      summary,
    });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Borradores ────────────────────────────────────────────────────────────────

export async function saveDraft(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id, account_id, to, cc, subject, html } = req.body;

  try {
    if (id) {
      const { rows } = await pool.query(
        `UPDATE emails SET to_emails=$1, cc_emails=$2, subject=$3, body_html=$4, sent_at=NOW()
         WHERE id=$5 AND user_id=$6 AND is_draft=true RETURNING id`,
        [to || '', cc || '', subject || '(Sin asunto)', html || '', id, uid],
      );
      return ok(res, rows[0] || { id });
    }

    const { rows } = await pool.query(
      `INSERT INTO emails (account_id, user_id, folder, to_emails, cc_emails,
        subject, body_html, is_draft, is_read, sent_at)
       VALUES ($1,$2,'Drafts',$3,$4,$5,$6,true,true,NOW())
       RETURNING id`,
      [account_id || null, uid, to || '', cc || '', subject || '(Sin asunto)', html || ''],
    );
    return ok(res, rows[0]);
  } catch (e: any) { return err(res, e.message); }
}

export async function getDrafts(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(
      `SELECT id, to_emails, cc_emails, subject, body_html, sent_at, account_id
       FROM emails WHERE user_id=$1 AND is_draft=true ORDER BY sent_at DESC`,
      [uid],
    );
    return ok(res, rows);
  } catch (e: any) { return err(res, e.message); }
}

// ── Estadísticas rápidas ──────────────────────────────────────────────────────

export async function getStats(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const accountId = req.query.account_id as string | undefined;

  try {
    const params: any[] = [uid];
    const accCond = accountId ? `AND account_id=$2` : '';
    if (accountId) params.push(accountId);

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_read=false AND folder='INBOX' AND NOT is_draft) AS unread,
         COUNT(*) FILTER (WHERE is_starred AND NOT is_draft)                        AS starred,
         COUNT(*) FILTER (WHERE folder='Drafts' AND is_draft)                      AS drafts,
         COUNT(*) FILTER (WHERE folder='Sent'   AND NOT is_draft)                  AS sent,
         COUNT(*) FILTER (WHERE folder='Trash'  AND NOT is_draft)                  AS trash,
         COUNT(*) FILTER (WHERE folder='INBOX'  AND NOT is_draft)                  AS inbox
       FROM emails WHERE user_id=$1 ${accCond}`,
      params,
    );
    return ok(res, rows[0]);
  } catch (e: any) { return err(res, e.message); }
}
