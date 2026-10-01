import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../config/database';
import { logActivityForReq } from './activityController';
import { saveExpedienteAttachmentFromBuffer } from './filesController';

function buildWebhookUrl(token: string): string {
  const base = (process.env.PUBLIC_BACKEND_URL || 'https://vantia.up.railway.app').replace(/\/$/, '');
  return `${base}/api/plaud/webhook/${token}`;
}

async function assertExpedienteInOrg(expedienteId: string, organizacionId: string): Promise<boolean> {
  const r = await pool.query(`SELECT id FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [expedienteId, organizacionId]);
  return r.rows.length > 0;
}

export const getPlaudStatus = async (req: any, res: Response) => {
  const { id: expedienteId } = req.params;
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    if (!(await assertExpedienteInOrg(expedienteId, organizacionId))) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    }
    const r = await pool.query(
      `SELECT token, created_at FROM expediente_plaud_links WHERE expediente_id=$1 AND active=true`,
      [expedienteId],
    );
    if (!r.rows.length) return res.json({ success: true, data: { connected: false } });
    res.json({ success: true, data: { connected: true, webhookUrl: buildWebhookUrl(r.rows[0].token), createdAt: r.rows[0].created_at } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error comprobando la conexión con Plaud.' });
  }
};

export const connectPlaud = async (req: any, res: Response) => {
  const { id: expedienteId } = req.params;
  const organizacionId = req.organizacionId;
  const userId = req.auth?.userId || 'SYSTEM';
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    if (!(await assertExpedienteInOrg(expedienteId, organizacionId))) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    await pool.query(
      `INSERT INTO expediente_plaud_links (expediente_id, organizacion_id, token, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (expediente_id) DO UPDATE SET token = EXCLUDED.token, active = true, created_at = NOW(), created_by = EXCLUDED.created_by`,
      [expedienteId, organizacionId, token, userId],
    );
    logActivityForReq(req, 'Expediente conectado con Plaud', 'EXPEDIENTE', expedienteId);
    res.json({ success: true, data: { webhookUrl: buildWebhookUrl(token) } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error conectando con Plaud.' });
  }
};

export const disconnectPlaud = async (req: any, res: Response) => {
  const { id: expedienteId } = req.params;
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    if (!(await assertExpedienteInOrg(expedienteId, organizacionId))) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    }
    await pool.query(`DELETE FROM expediente_plaud_links WHERE expediente_id=$1`, [expedienteId]);
    logActivityForReq(req, 'Expediente desconectado de Plaud', 'EXPEDIENTE', expedienteId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error desconectando Plaud.' });
  }
};

// ── Webhook público: lo llama Zapier, no lleva sesión de Clerk. La seguridad
// es el propio token de la URL (igual que los enlaces públicos de reserva de
// agenda) -- generado aleatorio de 24 bytes, imposible de adivinar, y ya
// lleva amarrados expediente_id/organizacion_id desde que se creó.
export const receivePlaudWebhook = async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const link = await pool.query(
      `SELECT expediente_id FROM expediente_plaud_links WHERE token=$1 AND active=true`,
      [token],
    );
    if (!link.rows.length) return res.status(404).json({ success: false, error: 'Enlace no válido.' });
    const { expediente_id: expedienteId } = link.rows[0];

    const body = req.body || {};
    const title = String(body.title || body.name || 'Grabación Plaud').trim().slice(0, 200);
    const transcript = String(body.transcript || body.text || '').trim();
    const summary = String(body.summary || '').trim();
    const audioUrl = String(body.audio_url || body.audioUrl || body.file_url || '').trim();

    if (transcript || summary) {
      const parts = [`🎙️ ${title}`];
      if (summary) parts.push(`\nResumen:\n${summary}`);
      if (transcript) parts.push(`\nTranscripción:\n${transcript}`);
      await pool.query(
        `INSERT INTO notes (expediente_id, content, category, priority, color, created_by)
         VALUES ($1,$2,'general','normal','#A78BFA','Plaud')`,
        [expedienteId, parts.join('\n')],
      );
    }

    if (audioUrl) {
      try {
        const audioRes = await fetch(audioUrl);
        if (audioRes.ok) {
          const buffer = Buffer.from(await audioRes.arrayBuffer());
          const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
          const ext = contentType.includes('wav') ? 'wav' : contentType.includes('m4a') ? 'm4a' : 'mp3';
          await saveExpedienteAttachmentFromBuffer(expedienteId, buffer, `${title}.${ext}`, contentType, 'Plaud');
        }
      } catch {
        // Si falla la descarga del audio, la nota con la transcripción ya se
        // guardó igualmente -- no tiene sentido fallar el webhook entero por eso.
      }
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error procesando el webhook de Plaud.' });
  }
};
