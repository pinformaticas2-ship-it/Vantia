import { Request, Response } from 'express';
import pool from '../config/database';
import { emitEmailEvent } from '../utils/emailSSE';
import { sendPushToUser } from '../utils/webPush';

const API_TOKEN = process.env.EMAIL_ENGINE_TOKEN || '';

export async function handleEngineWebhook(req: Request, res: Response) {
  const auth = req.headers.authorization || '';
  if (API_TOKEN && auth !== `Bearer ${API_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({ ok: true });

  const event = req.body?.event as string;
  const engineAccountId = req.body?.account as string;
  const data = req.body?.data || req.body || {};

  if (!event || !engineAccountId) return;

  try {
    const { rows: accs } = await pool.query(
      `SELECT id, user_id FROM email_accounts WHERE id=$1`,
      [engineAccountId],
    );
    if (!accs.length) return;
    const { id: accountId, user_id: userId } = accs[0];

    switch (event) {
      case 'messageNew': {
        const msg = data;
        const sentAt = msg.date ? new Date(msg.date) : null;
        await pool.query(
          `INSERT INTO emails
             (account_id, user_id, engine_msg_id, thread_id, uid, message_id,
              folder, from_email, from_name, to_emails, subject, snippet,
              body_text, body_html, is_read, is_starred, size_bytes, sent_at,
              attachments_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (engine_msg_id) DO NOTHING`,
          [
            accountId, userId,
            msg.id || null,
            msg.threadId || null,
            msg.uid ? Number(msg.uid) : null,
            msg.messageId?.replace(/[<>]/g, '') || null,
            msg.path || 'INBOX',
            msg.from?.address || null,
            msg.from?.name || null,
            Array.isArray(msg.to) ? msg.to.map((t: any) => t.address).join(', ') : (msg.to || null),
            msg.subject || '(Sin asunto)',
            (msg.text || msg.preview || '').slice(0, 200) || null,
            msg.text || null,
            msg.html || null,
            Boolean(msg.flags?.includes('\\Seen')),
            Boolean(msg.flags?.includes('\\Flagged')),
            msg.size || 0,
            sentAt,
            msg.attachments?.length ? JSON.stringify(msg.attachments) : null,
          ],
        );
        emitEmailEvent(userId, { type: 'messageNew', accountId, folder: msg.path || 'INBOX' });
        if ((msg.path || 'INBOX') === 'INBOX' && !msg.flags?.includes('\\Seen')) {
          void sendPushToUser(userId, {
            title: msg.from?.name || msg.from?.address || 'Nuevo correo',
            body: msg.subject || '(Sin asunto)',
            url: '/dashboard/correo',
            tag: `email-${accountId}`,
          });
        }
        break;
      }
      case 'messageSeen':
        await pool.query(
          `UPDATE emails SET is_read=true  WHERE engine_msg_id=$1 AND user_id=$2`,
          [data.id, userId],
        );
        break;
      case 'messageUnseen':
        await pool.query(
          `UPDATE emails SET is_read=false WHERE engine_msg_id=$1 AND user_id=$2`,
          [data.id, userId],
        );
        break;
      case 'messageFlagged':
        await pool.query(
          `UPDATE emails SET is_starred=true  WHERE engine_msg_id=$1 AND user_id=$2`,
          [data.id, userId],
        );
        break;
      case 'messageUnflagged':
        await pool.query(
          `UPDATE emails SET is_starred=false WHERE engine_msg_id=$1 AND user_id=$2`,
          [data.id, userId],
        );
        break;
      case 'messageDeleted':
        await pool.query(
          `DELETE FROM emails WHERE engine_msg_id=$1 AND user_id=$2`,
          [data.id, userId],
        );
        break;
      case 'messageMoved':
        await pool.query(
          `UPDATE emails SET folder=$3 WHERE engine_msg_id=$1 AND user_id=$2`,
          [data.id, userId, data.path || 'INBOX'],
        );
        break;
    }
  } catch (e) {
    console.error('EmailEngine webhook error:', e);
  }
}
