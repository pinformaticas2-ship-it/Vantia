import pool from '../config/database';
import { decryptPassword } from './emailCrypto';
import { dispatchEmail } from './mailer';
import { SmtpConfig, MailMessage } from './smtp';

// Correo de confirmación al dar de alta un cliente -- se dispara desde
// cualquier vía que cree un cliente "de verdad" (alta manual, formulario
// público con enlace). Deliberadamente NO se llama desde la importación
// masiva por CSV: mandar un email de "bienvenida" a cientos de clientes
// históricos que se importan de golpe no tiene sentido y sería spam.
//
// Best effort: si la organización no tiene ninguna cuenta de correo
// IMAP/SMTP configurada (pasa hoy con alguna organización), o si el envío
// falla por lo que sea, no se lanza ningún error -- el alta del cliente ya
// se ha guardado y no debe depender de que el correo salga bien.
export async function sendClientWelcomeEmail(
  organizacionId: string,
  client: { email?: string | null; first_name: string; last_name?: string | null },
): Promise<void> {
  if (!client.email?.trim()) return;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE organizacion_id = $1 AND active = true ORDER BY created_at ASC LIMIT 1`,
      [organizacionId],
    );
    if (!rows.length) return; // sin cuenta configurada -- no se manda, no rompe nada
    const acc = rows[0];
    const password = decryptPassword(acc.password_enc);
    const smtpCfg: SmtpConfig = {
      host: acc.smtp_host, port: acc.smtp_port, secure: acc.smtp_secure,
      user: acc.username, password,
    };
    const nombre = [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Estimado/a cliente';
    const html = `
      <p>Hola ${nombre},</p>
      <p>Hemos registrado correctamente tus datos en nuestro despacho. En breve nos pondremos en contacto contigo para los siguientes pasos.</p>
      <p>Un saludo.</p>
    `.trim();
    const msg: MailMessage = {
      from: acc.email,
      fromName: acc.label || undefined,
      to: [client.email.trim()],
      subject: 'Hemos recibido tus datos',
      html,
    };
    await dispatchEmail(smtpCfg, msg);
  } catch (e: any) {
    console.warn('No se pudo enviar el correo de bienvenida al cliente:', e?.message || e);
  }
}
