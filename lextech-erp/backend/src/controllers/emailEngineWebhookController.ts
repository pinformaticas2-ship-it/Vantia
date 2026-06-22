import { Request, Response } from 'express';
import pool from '../config/database';

/**
 * Receives real-time webhook events from EmailEngine and updates the local DB.
 * No Clerk auth — this endpoint is called by EmailEngine, not by browsers.
 * Verify requests using the shared EMAIL_ENGINE_TOKEN if configured.
 */

const WEBHOOK_SECRET = process.env.EMAIL_ENGINE_TOKEN || '';

function verifyWebhook(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true; // no secret configured → accept all (dev)
  const auth = req.headers['authorization'] || '';
  return auth === `Bearer ${WEBHOOK_SECRET}`;
}

function toEmailsRow(accountDbId: string, userId: string, data: any, folder: string) {
  const from = data.from || {};
  const toList = (data.to || []).map((a: any) => a.address).join(', ');
  const ccList = (data.cc || []).map((a: any) => a.address).join(', ');
  return {
    account_id:      accountDbId,
    user_id:         userId,
    uid:             data.uid || null,
    message_id:      data.messageId || null,
    engine_msg_id:   data.id || null,
    thread_id:       data.threadId || null,
    folder,
    from_email:      from.address || null,
    from_name:       from.name   || null,
    to_emails:       toList || null,
    cc_emails:       ccList || null,
    subject:         data.subject  || '(Sin asunto)',
    snippet:         data.preview  || null,
    is_read:         (data.flags || []).includes('\\Seen'),
    is_starred:      (data.flags || []).includes('\\Flagged'),
    has_attachments: Boolean(data.hasAttachments),
    attachments_json: data.attachments?.length ? JSON.stringify(data.attachments) : null,
    size_bytes:      data.size || 0,
    sent_at:         data.date ? new Date(data.date) : null,
  };
}

export async function handleEngineWebhook(req: Request, res: Response) {
  if (!verifyWebhook(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Acknowledge immediately so EmailEngine doesn't retry
  res.status(200).json({ ok: true });

  const { account: engineAccountId, path: folder, event, data } = req.body || {};
  if (!engineAccountId || !event || !data) return;

  try {
    // Resolve our DB account from the EmailEngine account id (we store it as the UUID)
    const { rows: accRows } = await pool.query(
      `SELECT id, user_id FROM email_accounts WHERE id=$1 AND active=true LIMIT 1`,
      [engineAccountId],
    );
    if (!accRows.length) return;
    const { id: accountDbId, user_id: userId } = accRows[0];

    const msgFolder = folder || 'INBOX';

    if (event === 'messageNew') {
      const row = toEmailsRow(accountDbId, userId, data, msgFolder);
      await pool.query(
        `INSERT INTO emails
           (account_id, user_id, uid, message_id, engine_msg_id, thread_id,
            folder, from_email, from_name, to_emails, cc_emails,
            subject, snippet, is_read, is_starred, has_attachments,
            attachments_json, size_bytes, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (account_id, uid, folder) DO UPDATE SET
           is_read         = EXCLUDED.is_read,
           is_starred      = EXCLUDED.is_starred,
           has_attachments = EXCLUDED.has_attachments,
           attachments_json= COALESCE(EXCLUDED.attachments_json, emails.attachments_json),
           engine_msg_id   = COALESCE(EXCLUDED.engine_msg_id, emails.engine_msg_id),
           thread_id       = COALESCE(EXCLUDED.thread_id, emails.thread_id),
           snippet         = COALESCE(EXCLUDED.snippet, emails.snippet)`,
        [
          row.account_id, row.user_id, row.uid, row.message_id, row.engine_msg_id,
          row.thread_id, row.folder, row.from_email, row.from_name,
          row.to_emails, row.cc_emails, row.subject, row.snippet,
          row.is_read, row.is_starred, row.has_attachments,
          row.attachments_json, row.size_bytes, row.sent_at,
        ],
      );
    }

    if (event === 'messageSeen' || event === 'messageUnseen') {
      if (data.uid) {
        await pool.query(
          `UPDATE emails SET is_read=$1 WHERE account_id=$2 AND uid=$3`,
          [event === 'messageSeen', accountDbId, data.uid],
        );
      }
    }

    if (event === 'messageFlagged' || event === 'messageUnflagged') {
      if (data.uid) {
        await pool.query(
          `UPDATE emails SET is_starred=$1 WHERE account_id=$2 AND uid=$3`,
          [event === 'messageFlagged', accountDbId, data.uid],
        );
      }
    }

    if (event === 'messageDeleted') {
      if (data.uid) {
        await pool.query(
          `DELETE FROM emails WHERE account_id=$1 AND uid=$2 AND folder=$3`,
          [accountDbId, data.uid, msgFolder],
        );
      }
    }

    if (event === 'messageMoved') {
      // data.uid = old uid, data.destination.uid = new uid
      if (data.uid && data.destination) {
        await pool.query(
          `UPDATE emails SET folder=$1, uid=$2 WHERE account_id=$3 AND uid=$4 AND folder=$5`,
          [data.destination.path, data.destination.uid || data.uid, accountDbId, data.uid, msgFolder],
        );
      }
    }
  } catch (e: any) {
    console.error('❌ EmailEngine webhook error:', e?.message || e);
  }
}
