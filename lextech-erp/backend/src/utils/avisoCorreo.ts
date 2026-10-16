import pool from '../config/database';
import { getClerk } from '../controllers/activityController';
import { decryptPassword } from './emailCrypto';
import { dispatchEmail } from './mailer';
import { SmtpConfig } from './smtp';
import { TipoAviso } from './avisoPreferencias';

// ── Avisos por correo (16/10/2026) ───────────────────────────────────────────
// Segundo canal de los avisos push, para quien lo activa en Ajustes →
// Notificaciones. El correo sale de la propia cuenta de correo de la persona
// en Vantia y va a su correo de acceso: así no sale nada desde el buzón de un
// compañero. Sin cuenta de correo conectada, no se envía (se avisa en Ajustes).
// Chat y WhatsApp, como mucho uno cada 15 minutos por persona: una
// conversación no puede convertirse en veinte correos.

const AGRUPAR_MS = 15 * 60_000;
const ultimoEnvio = new Map<string, number>();

/** Dirección pública de la app para los enlaces del correo. */
function urlApp(): string {
  const env = process.env.FRONTEND_URL || (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim())
    .find((o) => o.startsWith('https://')) || '';
  return env.replace(/\/+$/, '');
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Cuenta de correo propia con la que se envía el aviso (la más antigua activa). */
export async function cuentaEnvioAvisos(userId: string): Promise<{ email: string; label: string | null; smtp: SmtpConfig } | null> {
  const { rows } = await pool.query(
    `SELECT email, label, smtp_host, smtp_port, smtp_secure, username, password_enc
       FROM email_accounts WHERE user_id = $1 AND active = true ORDER BY created_at ASC LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  const a = rows[0];
  if (!a) return null;
  return {
    email: a.email, label: a.label || null,
    smtp: { host: a.smtp_host, port: a.smtp_port, secure: a.smtp_secure, user: a.username, password: decryptPassword(a.password_enc) },
  };
}

export async function enviarAvisoPorCorreo(
  userIds: string[], aviso: { title: string; body: string; url?: string; tipo?: TipoAviso },
): Promise<number> {
  let enviados = 0;
  const agrupar = aviso.tipo === 'chat' || aviso.tipo === 'chat_dm' || aviso.tipo === 'whatsapp';
  await Promise.all(userIds.map(async (userId) => {
    const clave = `${userId}:${aviso.tipo === 'chat_dm' ? 'chat' : aviso.tipo}`;
    if (agrupar && Date.now() - (ultimoEnvio.get(clave) || 0) < AGRUPAR_MS) return;
    try {
      const cuenta = await cuentaEnvioAvisos(userId);
      if (!cuenta) return;
      const user = await getClerk().users.getUser(userId);
      const destino = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress;
      if (!destino) return;
      if (agrupar) ultimoEnvio.set(clave, Date.now());
      const base = urlApp();
      const enlace = base && aviso.url ? `${base}${aviso.url.startsWith('/') ? '' : '/'}${aviso.url}` : '';
      const ajustes = base ? `${base}/dashboard/config?section=notificaciones` : '';
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;max-width:560px">
<p style="font-size:16px;font-weight:bold;margin:0 0 8px">${escapar(aviso.title)}</p>
<p style="margin:0 0 16px;white-space:pre-line">${escapar(aviso.body)}</p>
${enlace ? `<p style="margin:0 0 24px"><a href="${escapar(enlace)}" style="background:#b91c1c;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir en Vantia</a></p>` : ''}
<p style="font-size:11px;color:#94a3b8;margin:0">Te llega porque tienes activados los avisos por correo en Vantia.${ajustes ? ` <a href="${escapar(ajustes)}" style="color:#94a3b8">Cambiar qué avisos recibo</a>.` : ''}</p>
</div>`;
      await dispatchEmail(cuenta.smtp, {
        from: cuenta.email, fromName: 'Avisos de Vantia', to: [destino],
        subject: `Vantia · ${aviso.title}`, html, text: `${aviso.title}\n\n${aviso.body}${enlace ? `\n\n${enlace}` : ''}`,
      });
      enviados++;
    } catch (e: any) {
      console.error('[aviso-correo] no se pudo enviar:', e?.message || e);
    }
  }));
  return enviados;
}
