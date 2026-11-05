import pool from '../config/database';
import { decryptPassword } from './emailCrypto';
import { dispatchEmail } from './mailer';
import { SmtpConfig } from './smtp';

// Envía un correo "en nombre del despacho" con la primera cuenta de correo
// activa de la organización (la misma que usa el correo de bienvenida a
// clientes). Lanza SinCuentaCorreo si el despacho no tiene ninguna, para que
// quien llama decida si eso es un error para el usuario o se ignora.
export class SinCuentaCorreo extends Error {
  constructor() { super('El despacho no tiene ninguna cuenta de correo conectada (Configuración → Correo).'); }
}

export async function enviarCorreoDelDespacho(
  organizacionId: string,
  msg: { to: string[]; subject: string; html: string },
): Promise<{ from: string }> {
  const { rows } = await pool.query(
    `SELECT * FROM email_accounts WHERE organizacion_id = $1 AND active = true ORDER BY created_at ASC LIMIT 1`,
    [organizacionId],
  );
  if (!rows.length) throw new SinCuentaCorreo();
  const acc = rows[0];
  const smtpCfg: SmtpConfig = {
    host: acc.smtp_host, port: acc.smtp_port, secure: acc.smtp_secure,
    user: acc.username, password: decryptPassword(acc.password_enc),
  };
  await dispatchEmail(smtpCfg, { from: acc.email, fromName: acc.label || undefined, ...msg });
  return { from: acc.email };
}

export const escaparHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
