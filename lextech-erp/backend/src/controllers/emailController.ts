import { Request, Response } from 'express';
import * as crypto from 'crypto';
import pool from '../config/database';
import { ImapClient, ImapConfig, syncInbox, testImapConnection } from '../utils/imap';
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

// ── Gmail API helpers ─────────────────────────────────────────────────────────

async function gmailApiGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any)) as any;
    throw Object.assign(
      new Error(body?.error?.message || `Gmail API ${res.status}`),
      { code: res.status },
    );
  }
  return res.json();
}

async function gmailApiPost(path: string, accessToken: string, body: object): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({} as any)) as any;
    throw Object.assign(new Error(b?.error?.message || `Gmail API ${res.status}`), { code: res.status });
  }
  return res.json();
}

async function getGmailAccessToken(profileId: string, uid: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT access_token_enc, token_expiry FROM email_oauth_profiles WHERE id=$1 AND user_id=$2`,
    [profileId, uid],
  );
  if (!rows.length) throw new Error('Perfil Gmail no encontrado');
  const row = rows[0];
  if (row.token_expiry && new Date(row.token_expiry) <= new Date()) {
    throw Object.assign(
      new Error('El token de Gmail ha expirado. Vuelve a conectar tu cuenta.'),
      { code: 401 },
    );
  }
  if (!row.access_token_enc) throw Object.assign(new Error('No hay token de acceso guardado'), { code: 401 });
  return decryptPassword(row.access_token_enc);
}

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
    `SELECT e.id, e.uid, e.folder, e.user_id, e.gmail_profile_id, e.gmail_message_id,
            a.id AS account_id, a.imap_host, a.imap_port, a.imap_secure, a.username, a.password_enc
       FROM emails e
       LEFT JOIN email_accounts a ON a.id=e.account_id
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

  const provider    = String(req.body?.provider || 'google').toLowerCase();
  const email       = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.display_name || req.body?.displayName || '').trim() || null;
  const avatarUrl   = String(req.body?.avatar_url   || req.body?.avatarUrl   || '').trim() || null;
  const externalId  = String(req.body?.external_id  || req.body?.externalId  || '').trim() || null;
  const accessToken = req.body?.access_token as string | undefined;
  const expiresIn   = Number(req.body?.expires_in || 3600);

  if (!email) return err(res, 'Falta el email del perfil', 400);

  const tokenEnc  = accessToken ? encryptPassword(accessToken) : null;
  const tokenExpiry = accessToken ? new Date(Date.now() + expiresIn * 1000) : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO email_oauth_profiles
         (user_id, provider, email, display_name, avatar_url, external_id,
          access_token_enc, token_expiry, last_used_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (user_id, provider, email)
       DO UPDATE SET
         display_name     = COALESCE(EXCLUDED.display_name,     email_oauth_profiles.display_name),
         avatar_url       = COALESCE(EXCLUDED.avatar_url,       email_oauth_profiles.avatar_url),
         external_id      = COALESCE(EXCLUDED.external_id,      email_oauth_profiles.external_id),
         access_token_enc = COALESCE(EXCLUDED.access_token_enc, email_oauth_profiles.access_token_enc),
         token_expiry     = COALESCE(EXCLUDED.token_expiry,     email_oauth_profiles.token_expiry),
         last_used_at     = NOW(),
         updated_at       = NOW()
       RETURNING id, provider, email, display_name, avatar_url, external_id, last_used_at, created_at`,
      [uid, provider, email, displayName, avatarUrl, externalId, tokenEnc, tokenExpiry],
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
    let smtpWarning: string | null = null;
    await withTimeout(testSmtpConnection(smtpCfg), 20000, 'SMTP').catch((e) => {
      // SMTP test failure is non-fatal: save the account anyway so the user
      // can still receive email via IMAP. The warning is returned to the UI.
      smtpWarning = explainMailConnectionError(e, 'smtp');
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
    const created = rows[0];

    // Register with EmailEngine (fire-and-forget)
    if (proto === 'imap') {
      import('../utils/emailEngineClient').then(({ isEmailEngineEnabled, eeRegisterAccount }) => {
        if (!isEmailEngineEnabled()) return;
        eeRegisterAccount({
          account: created.id,
          name: created.label,
          email: created.email,
          imap: { host: String(imap_host), port: inPort, secure: Boolean(imap_secure), auth: { user: String(username), pass: String(password) } },
          smtp: { host: String(smtp_host), port: Number(smtp_port), secure: Boolean(smtp_secure), auth: { user: String(username), pass: String(password) } },
        }).catch(() => {});
      }).catch(() => {});
    }

    return ok(res, { ...created, smtp_warning: smtpWarning });
  } catch (e: any) { return err(res, e.message); }
}

export async function deleteAccount(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    // Remove from EmailEngine before DB delete (fire-and-forget)
    import('../utils/emailEngineClient').then(({ isEmailEngineEnabled, eeDeleteAccount }) => {
      if (isEmailEngineEnabled()) eeDeleteAccount(id).catch(() => {});
    }).catch(() => {});

    const { rowCount } = await pool.query(
      `DELETE FROM email_accounts WHERE id=$1 AND user_id=$2`,
      [id, uid],
    );
    if (!rowCount) return err(res, 'Cuenta no encontrada', 404);
    return ok(res, { id });
  } catch (e: any) { return err(res, e.message); }
}

export async function updateAccount(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const {
    label, email,
    imap_host, imap_port, imap_secure,
    smtp_host, smtp_port, smtp_secure,
    username, password,
  } = req.body;

  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2`,
      [id, uid],
    );
    if (!existing.length) return err(res, 'Cuenta no encontrada', 404);
    const acc = existing[0];

    const newPassword = password && String(password).trim() ? String(password).trim() : null;
    let encPassword = acc.password_enc;

    if (newPassword) {
      const withTimeout = <T>(p: Promise<T>, ms: number, lbl: string): Promise<T> =>
        Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout (${lbl}): el servidor tardó demasiado en responder`)), ms))]);

      const proto = String(acc.protocol || 'imap').toLowerCase();
      const host  = String(imap_host ?? acc.imap_host);
      const port  = Number(imap_port ?? acc.imap_port);
      const secure = imap_secure !== undefined ? Boolean(imap_secure) : Boolean(acc.imap_secure);
      const user  = String(username ?? acc.username);

      if (proto === 'pop3') {
        const pop3Cfg: Pop3Config = { host, port, secure, user, password: newPassword, timeout: 12000 };
        await withTimeout(testPop3Connection(pop3Cfg), 20000, 'POP3').catch((e: any) => {
          throw new Error(explainMailConnectionError(e, 'pop3'));
        });
      } else {
        const imapCfg: ImapConfig = { host, port, secure, user, password: newPassword };
        await withTimeout(testImapConnection(imapCfg), 20000, 'IMAP').catch((e: any) => {
          throw new Error(explainMailConnectionError(e, 'imap'));
        });
      }
      encPassword = encryptPassword(newPassword);
    }

    const { rows } = await pool.query(
      `UPDATE email_accounts
          SET label        = COALESCE($3, label),
              email        = COALESCE($4, email),
              imap_host    = COALESCE($5, imap_host),
              imap_port    = COALESCE($6, imap_port),
              imap_secure  = COALESCE($7, imap_secure),
              smtp_host    = COALESCE($8, smtp_host),
              smtp_port    = COALESCE($9, smtp_port),
              smtp_secure  = COALESCE($10, smtp_secure),
              username     = COALESCE($11, username),
              password_enc = $12
        WHERE id=$1 AND user_id=$2
        RETURNING id, label, email, imap_host, imap_port, imap_secure,
                  smtp_host, smtp_port, smtp_secure, username, active,
                  protocol, last_sync_at, created_at`,
      [
        id, uid,
        label       !== undefined ? String(label)       : null,
        email       !== undefined ? String(email)       : null,
        imap_host   !== undefined ? String(imap_host)   : null,
        imap_port   !== undefined ? Number(imap_port)   : null,
        imap_secure !== undefined ? Boolean(imap_secure): null,
        smtp_host   !== undefined ? String(smtp_host)   : null,
        smtp_port   !== undefined ? Number(smtp_port)   : null,
        smtp_secure !== undefined ? Boolean(smtp_secure): null,
        username    !== undefined ? String(username)    : null,
        encPassword,
      ],
    );
    return ok(res, rows[0]);
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
      // Use last_sync_at so IMAP SEARCH SINCE skips already-synced messages.
      // Fall back to 7 days ago on first-ever sync.
      const sinceFallback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const sinceDate: Date = acc.last_sync_at ? new Date(acc.last_sync_at) : sinceFallback;
      const messages = await syncInbox(imapCfg, folder, limit, sinceDate);
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

// ── Sincronización Gmail ──────────────────────────────────────────────────────

export async function syncGmailProfile(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { profileId } = req.params;
  const folder = (req.query.folder as string) || 'INBOX';
  const limit  = Math.min(Number(req.query.limit) || 50, 200);

  try {
    const accessToken = await getGmailAccessToken(profileId, uid);

    const LABEL_MAP: Record<string, string[]> = {
      INBOX: ['INBOX'], SENT: ['SENT'], DRAFTS: ['DRAFT'], DRAFT: ['DRAFT'],
      TRASH: ['TRASH'], SPAM: ['SPAM'], STARRED: ['STARRED'],
    };
    const labelIds = LABEL_MAP[folder.toUpperCase()] || [folder];

    const params = new URLSearchParams({ maxResults: String(limit) });
    labelIds.forEach(id => params.append('labelIds', id));
    const listRes = await gmailApiGet(`/messages?${params}`, accessToken);
    const messageIds: string[] = (listRes.messages || []).map((m: any) => String(m.id));

    if (!messageIds.length) return ok(res, { synced: 0, inserted: 0, folder });

    let inserted = 0; let synced = 0;

    for (const msgId of messageIds) {
      const metaP = new URLSearchParams({ format: 'metadata' });
      ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID'].forEach(h => metaP.append('metadataHeaders', h));
      const msg = await gmailApiGet(`/messages/${msgId}?${metaP}`, accessToken);
      synced++;

      const hdrs: { name: string; value: string }[] = msg.payload?.headers || [];
      const h = (name: string) => hdrs.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value || '';

      const fromRaw   = h('From');
      const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+)>?$/);
      const fromName  = (fromMatch?.[1] || '').trim() || null;
      const fromEmail = (fromMatch?.[2] || fromRaw).trim().toLowerCase();

      const dateRaw = h('Date');
      const sentAt  = dateRaw ? new Date(dateRaw) : new Date(Number(msg.internalDate || 0));
      const labels  = msg.labelIds || [];

      let primaryFolder = folder;
      if (labels.includes('DRAFT'))        primaryFolder = 'DRAFTS';
      else if (labels.includes('SENT'))    primaryFolder = 'SENT';
      else if (labels.includes('TRASH'))   primaryFolder = 'TRASH';
      else if (labels.includes('SPAM'))    primaryFolder = 'SPAM';
      else if (labels.includes('INBOX'))   primaryFolder = 'INBOX';

      const isRead    = !labels.includes('UNREAD');
      const isStarred = labels.includes('STARRED');
      const isDraft   = labels.includes('DRAFT');
      const hasAtt    = (msg.payload?.parts || []).some((p: any) => p.filename && p.filename.length > 0);
      const msgId_    = h('Message-ID').replace(/[<>]/g, '') || null;

      const { rowCount } = await pool.query(
        `INSERT INTO emails
           (gmail_profile_id, user_id, gmail_message_id, message_id, folder,
            from_email, from_name, to_emails, cc_emails, subject, snippet,
            is_read, is_starred, is_draft, has_attachments, size_bytes, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (gmail_profile_id, gmail_message_id)
           WHERE gmail_profile_id IS NOT NULL
         DO UPDATE SET
           is_read    = EXCLUDED.is_read,
           is_starred = EXCLUDED.is_starred,
           folder     = EXCLUDED.folder,
           snippet    = COALESCE(EXCLUDED.snippet, emails.snippet)`,
        [
          profileId, uid, msgId, msgId_,
          primaryFolder, fromEmail, fromName, h('To') || null, h('Cc') || null,
          h('Subject') || '(Sin asunto)', (msg.snippet || '').slice(0, 200),
          isRead, isStarred, isDraft, hasAtt, msg.sizeEstimate || 0, sentAt,
        ],
      );
      if (rowCount) inserted++;
    }

    await pool.query(`UPDATE email_oauth_profiles SET last_used_at=NOW() WHERE id=$1`, [profileId]);
    return ok(res, { synced, inserted, folder });
  } catch (e: any) {
    return err(res, e.message, (e.code === 401 || e.code === 403) ? 401 : 500);
  }
}

// ── Mensajes ──────────────────────────────────────────────────────────────────

export async function getMessages(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);

  const accountId      = req.query.account_id       as string | undefined;
  const gmailProfileId = req.query.gmail_profile_id as string | undefined;
  const folder         = (req.query.folder as string) || 'INBOX';
  const search         = (req.query.q as string) || '';
  const onlyUnread     = req.query.unread   === '1';
  const onlyStarred    = req.query.starred  === '1';
  const page     = Math.max(1, Number(req.query.page)  || 1);
  const pageSize = Math.min(Number(req.query.limit) || 50, 200);
  const offset   = (page - 1) * pageSize;

  try {
    const params: any[] = [uid];
    const conditions: string[] = ['e.user_id=$1'];

    if (accountId)      { params.push(accountId);      conditions.push(`e.account_id=$${params.length}`); }
    if (gmailProfileId) { params.push(gmailProfileId); conditions.push(`e.gmail_profile_id=$${params.length}`); }

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
    const limitP  = params.length - 1;
    const offsetP = params.length;

    const { rows } = await pool.query(
      `SELECT e.id, e.uid, e.folder, e.from_email, e.from_name, e.to_emails,
              e.subject, e.snippet, e.is_read, e.is_starred, e.has_attachments,
              e.size_bytes, e.sent_at, e.account_id, e.gmail_profile_id, e.gmail_message_id,
              e.expediente_id, e.cliente_id,
              COALESCE(a.label, op.display_name, op.email) AS account_label,
              COALESCE(a.email, op.email)                  AS account_email
       FROM emails e
       LEFT JOIN email_accounts       a  ON a.id  = e.account_id
       LEFT JOIN email_oauth_profiles op ON op.id = e.gmail_profile_id
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
      `SELECT e.*,
              a.imap_host, a.imap_port, a.imap_secure, a.username, a.password_enc,
              COALESCE(a.email, op.email)                  AS account_email,
              COALESCE(a.label, op.display_name, op.email) AS account_label
       FROM emails e
       LEFT JOIN email_accounts       a  ON a.id  = e.account_id
       LEFT JOIN email_oauth_profiles op ON op.id = e.gmail_profile_id
       WHERE e.id=$1 AND e.user_id=$2`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Email no encontrado', 404);
    const row = rows[0];

    // Fetch body from Gmail API if missing
    if (row.gmail_profile_id && row.gmail_message_id && !row.body_html && !row.body_text) {
      try {
        const accessToken = await getGmailAccessToken(row.gmail_profile_id, uid);
        const full = await gmailApiGet(`/messages/${row.gmail_message_id}?format=full`, accessToken);
        let bodyHtml = ''; let bodyText = '';
        const walkParts = (p: any) => {
          if (!p) return;
          const mt = p.mimeType || '';
          if (mt === 'text/html'  && p.body?.data && !bodyHtml)
            bodyHtml = Buffer.from(p.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          else if (mt === 'text/plain' && p.body?.data && !bodyText)
            bodyText = Buffer.from(p.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          if (p.parts) p.parts.forEach(walkParts);
        };
        walkParts(full.payload);
        const snippet = (bodyText || bodyHtml.replace(/<[^>]+>/g, ' ')).slice(0, 200);
        await pool.query(
          `UPDATE emails SET body_text=$1, body_html=$2, snippet=$3 WHERE id=$4`,
          [bodyText, bodyHtml, snippet, id],
        );
        row.body_text = bodyText; row.body_html = bodyHtml; row.snippet = snippet;
      } catch (_e) { /* best effort */ }
    }

    // Fetch body from IMAP if missing
    if (!row.gmail_profile_id && row.uid && !row.body_html && !row.body_text) {
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
          row.body_text = full.bodyText; row.body_html = full.bodyHtml; row.snippet = full.snippet;
        }
      } catch (_e) { /* best effort */ }
    }

    // Mark as read
    if (!row.is_read) {
      await pool.query(`UPDATE emails SET is_read=true WHERE id=$1`, [id]);
      row.is_read = true;
      if (row.gmail_profile_id && row.gmail_message_id) {
        try {
          const token = await getGmailAccessToken(row.gmail_profile_id, uid);
          await gmailApiPost(`/messages/${row.gmail_message_id}/modify`, token,
            { addLabelIds: [], removeLabelIds: ['UNREAD'] });
        } catch (_e) {}
      } else if (row.uid) {
        try {
          const password = decryptPassword(row.password_enc);
          const cfg: ImapConfig = {
            host: row.imap_host, port: row.imap_port, secure: row.imap_secure,
            user: row.username, password,
          };
          const client = new ImapClient(cfg);
          await client.connect(); await client.login();
          await client.selectFolder(row.folder);
          await client.markRead(row.uid, true);
          await client.logout();
        } catch (_e) {}
      }
    }

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

    if (message.gmail_profile_id && message.gmail_message_id) {
      try {
        const token = await getGmailAccessToken(message.gmail_profile_id, uid);
        await gmailApiPost(`/messages/${message.gmail_message_id}/modify`, token, {
          addLabelIds:    read ? [] : ['UNREAD'],
          removeLabelIds: read ? ['UNREAD'] : [],
        });
      } catch (_e) {}
    } else if (message.uid) {
      try {
        const password = decryptPassword(message.password_enc);
        const cfg: ImapConfig = {
          host: message.imap_host, port: message.imap_port, secure: message.imap_secure,
          user: message.username, password,
        };
        const client = new ImapClient(cfg);
        await client.connect(); await client.login();
        await client.selectFolder(message.folder);
        await client.markRead(Number(message.uid), Boolean(read));
        await client.logout();
      } catch (_e) {}
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
    const starred = Boolean(rows[0].is_starred);

    if (message.gmail_profile_id && message.gmail_message_id) {
      try {
        const token = await getGmailAccessToken(message.gmail_profile_id, uid);
        await gmailApiPost(`/messages/${message.gmail_message_id}/modify`, token, {
          addLabelIds:    starred ? ['STARRED'] : [],
          removeLabelIds: starred ? [] : ['STARRED'],
        });
      } catch (_e) {}
    } else if (message.uid) {
      try {
        const password = decryptPassword(message.password_enc);
        const cfg: ImapConfig = {
          host: message.imap_host, port: message.imap_port, secure: message.imap_secure,
          user: message.username, password,
        };
        const client = new ImapClient(cfg);
        await client.connect(); await client.login();
        await client.selectFolder(message.folder);
        await client.markFlagged(Number(message.uid), starred);
        await client.logout();
      } catch (_e) {}
    }

    return ok(res, { id, is_starred: starred });
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
  const { account_id, to, cc, bcc, subject, html, text, draft_id, expediente_id, attachments } = req.body;
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
      attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined,
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

// ── EmailEngine: body cache + attachment proxy ────────────────────────────────

export async function getMessageBodyFromEngine(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT body_text, body_html, attachments_json, account_id, engine_msg_id
         FROM emails WHERE id=$1 AND user_id=$2`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Mensaje no encontrado', 404);
    const row = rows[0];

    let attachments: any[] = [];
    try { attachments = row.attachments_json ? JSON.parse(row.attachments_json) : []; } catch { /**/ }

    if (!row.body_html && !row.body_text && row.engine_msg_id && row.account_id) {
      const { isEmailEngineEnabled, eeGetMessage } = await import('../utils/emailEngineClient');
      if (isEmailEngineEnabled()) {
        try {
          const msg = await eeGetMessage(row.account_id, row.engine_msg_id);
          const bodyHtml = msg?.html || msg?.text || null;
          const bodyText = msg?.text || null;
          const newAttachments = msg?.attachments || [];
          await pool.query(
            `UPDATE emails SET body_html=$1, body_text=$2, attachments_json=$3 WHERE id=$4`,
            [bodyHtml, bodyText, newAttachments.length ? JSON.stringify(newAttachments) : null, id],
          );
          return ok(res, { body_html: bodyHtml, body_text: bodyText, attachments: newAttachments });
        } catch { /**/ }
      }
    }

    return ok(res, { body_html: row.body_html, body_text: row.body_text, attachments });
  } catch (e: any) { return err(res, e.message); }
}

export async function downloadAttachment(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id, attachmentId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT account_id, engine_msg_id FROM emails WHERE id=$1 AND user_id=$2`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Mensaje no encontrado', 404);
    const { account_id, engine_msg_id } = rows[0];
    if (!account_id || !engine_msg_id) return err(res, 'Adjunto no disponible via EmailEngine', 404);

    const { isEmailEngineEnabled, eeGetAttachment } = await import('../utils/emailEngineClient');
    if (!isEmailEngineEnabled()) return err(res, 'EmailEngine no configurado', 503);

    const buffer = await eeGetAttachment(account_id, attachmentId);
    res.setHeader('Content-Disposition', `attachment; filename="${attachmentId}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (e: any) { return err(res, e.message); }
}

// ── Estadísticas rápidas ──────────────────────────────────────────────────────

export async function getStats(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const accountId      = req.query.account_id       as string | undefined;
  const gmailProfileId = req.query.gmail_profile_id as string | undefined;

  try {
    const params: any[] = [uid];
    let accCond = '';
    if (accountId)      { params.push(accountId);      accCond = `AND account_id=$2`; }
    else if (gmailProfileId) { params.push(gmailProfileId); accCond = `AND gmail_profile_id=$2`; }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_read=false AND folder='INBOX' AND NOT is_draft) AS unread,
         COUNT(*) FILTER (WHERE is_starred AND NOT is_draft)                        AS starred,
         COUNT(*) FILTER (WHERE folder IN ('Drafts','DRAFTS') AND is_draft)         AS drafts,
         COUNT(*) FILTER (WHERE folder IN ('Sent','SENT')     AND NOT is_draft)     AS sent,
         COUNT(*) FILTER (WHERE folder IN ('Trash','TRASH')   AND NOT is_draft)     AS trash,
         COUNT(*) FILTER (WHERE folder='INBOX' AND NOT is_draft)                    AS inbox
       FROM emails WHERE user_id=$1 ${accCond}`,
      params,
    );
    return ok(res, rows[0]);
  } catch (e: any) { return err(res, e.message); }
}
