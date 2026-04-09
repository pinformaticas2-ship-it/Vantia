import { Request, Response } from 'express';
import * as crypto from 'crypto';
import pool from '../config/database';
import { ImapClient, ImapConfig, syncInbox } from '../utils/imap';
import { sendEmail, SmtpConfig, MailMessage } from '../utils/smtp';

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

// ── Cuentas ───────────────────────────────────────────────────────────────────

export async function getAccounts(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(
      `SELECT id, label, email, imap_host, imap_port, imap_secure,
              smtp_host, smtp_port, smtp_secure, username, active, last_sync_at, created_at
       FROM email_accounts WHERE user_id=$1 ORDER BY created_at`,
      [uid],
    );
    return ok(res, rows);
  } catch (e: any) { return err(res, e.message); }
}

export async function createAccount(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const {
    label = 'Mi cuenta', email,
    imap_host, imap_port = 993, imap_secure = true,
    smtp_host, smtp_port = 587, smtp_secure = false,
    username, password,
  } = req.body;

  if (!email || !imap_host || !smtp_host || !username || !password) {
    return err(res, 'Faltan campos obligatorios', 400);
  }

  // Test IMAP connection before saving
  const imapCfg: ImapConfig = {
    host: imap_host, port: Number(imap_port), secure: Boolean(imap_secure),
    user: username, password,
  };
  try {
    const client = new ImapClient(imapCfg);
    await client.connect();
    await client.login();
    await client.logout();
  } catch (e: any) {
    return err(res, `No se pudo conectar a IMAP: ${e.message}`, 400);
  }

  try {
    const enc = encryptPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO email_accounts (user_id, label, email, imap_host, imap_port, imap_secure,
        smtp_host, smtp_port, smtp_secure, username, password_enc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, label, email, imap_host, imap_port, imap_secure,
                 smtp_host, smtp_port, smtp_secure, username, active, last_sync_at, created_at`,
      [uid, label, email, imap_host, Number(imap_port), Boolean(imap_secure),
       smtp_host, Number(smtp_port), Boolean(smtp_secure), username, enc],
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

// ── Sincronización IMAP ───────────────────────────────────────────────────────

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
    const acc = accs[0];
    const password = decryptPassword(acc.password_enc);

    const imapCfg: ImapConfig = {
      host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure,
      user: acc.username, password,
    };

    const messages = await syncInbox(imapCfg, folder, limit);

    // Upsert into DB
    let inserted = 0;
    for (const msg of messages) {
      const sentAt = msg.date ? new Date(msg.date) : null;
      const { rowCount } = await pool.query(
        `INSERT INTO emails
          (account_id, user_id, uid, message_id, folder, from_email, from_name,
           to_emails, subject, snippet, is_read, size_bytes, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (account_id, uid, folder) DO UPDATE SET
           is_read    = EXCLUDED.is_read,
           is_starred = emails.is_starred,
           snippet    = COALESCE(EXCLUDED.snippet, emails.snippet)`,
        [
          acc.id, uid,
          msg.uid > 0 ? msg.uid : null,
          msg.messageId || null,
          folder,
          msg.from || null,
          msg.fromName || null,
          msg.to || null,
          msg.subject || '(Sin asunto)',
          msg.snippet || null,
          msg.flags.includes('\\Seen'),
          msg.size || 0,
          sentAt,
        ],
      );
      if (rowCount) inserted++;
    }

    await pool.query(
      `UPDATE email_accounts SET last_sync_at=NOW() WHERE id=$1`,
      [acc.id],
    );

    return ok(res, { synced: messages.length, inserted, folder });
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
    await pool.query(
      `UPDATE emails SET is_read=$1 WHERE id=$2 AND user_id=$3`,
      [Boolean(read), id, uid],
    );
    return ok(res, { id, is_read: Boolean(read) });
  } catch (e: any) { return err(res, e.message); }
}

export async function toggleStar(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE emails SET is_starred = NOT is_starred WHERE id=$1 AND user_id=$2
       RETURNING is_starred`,
      [id, uid],
    );
    if (!rows.length) return err(res, 'Email no encontrado', 404);
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

// ── Enviar ────────────────────────────────────────────────────────────────────

export async function sendMail(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return err(res, 'No autenticado', 401);
  const { account_id, to, cc, bcc, subject, html, text, draft_id } = req.body;

  if (!account_id || !to || !subject || !html) {
    return err(res, 'Faltan campos obligatorios (account_id, to, subject, html)', 400);
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2 AND active=true`,
      [account_id, uid],
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
        to_emails, cc_emails, subject, body_html, body_text, snippet, is_read, sent_at)
       VALUES ($1,$2,'Sent',$3,$4,$5,$6,$7,$8,$9,$10,true,NOW())`,
      [
        acc.id, uid, acc.email, acc.label,
        toList.join(', '), ccList.join(', '),
        subject, html, text || '',
        (text || html.replace(/<[^>]+>/g, '')).slice(0, 200),
      ],
    );

    // Delete draft if any
    if (draft_id) {
      await pool.query(`DELETE FROM emails WHERE id=$1 AND user_id=$2 AND is_draft=true`, [draft_id, uid]);
    }

    return ok(res, { sent: true });
  } catch (e: any) { return err(res, `Error al enviar: ${e.message}`); }
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
