import { Resend } from 'resend';
import { createClerkClient } from '@clerk/backend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL    = process.env.PUBLIC_URL || 'http://localhost:5173';

let _clerk: ReturnType<typeof createClerkClient> | null = null;
function getClerk() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk;
}

const _emailCache = new Map<string, { email: string; name: string; exp: number }>();

export async function resolveUserEmailAndName(userId: string): Promise<{ email: string | null; name: string }> {
  const hit = _emailCache.get(userId);
  if (hit && hit.exp > Date.now()) return { email: hit.email, name: hit.name };
  try {
    const user = await getClerk().users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress ?? null;
    const name  = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email || userId;
    if (email) _emailCache.set(userId, { email, name, exp: Date.now() + 15 * 60 * 1000 });
    return { email, name };
  } catch {
    return { email: null, name: userId };
  }
}

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface DigestTask {
  id: string;
  titulo: string;
  estado: string;
  prioridad: string;
  tipo: string;
  plazo: string | null;
  fecha_aviso: string | null;
  client_name_resolved: string | null;
  client_name: string | null;
  expediente: string | null;
  juzgado: string | null;
}

export interface TaskDigest {
  overdue:   DigestTask[];
  today:     DigestTask[];
  aviso:     DigestTask[];  // fecha_aviso = today
  tomorrow:  DigestTask[];
}

// ── Colores y etiquetas ────────────────────────────────────────────────────────
const TIPO_LABEL: Record<string, string> = {
  plazo_procesal: 'Plazo procesal',
  vista_juicio:   'Vista / Juicio',
  notificacion:   'Notificación',
  reunion:        'Reunión',
  escrito:        'Escrito',
  gestion:        'Gestión',
  pago:           'Pago',
  llamada:        'Llamada',
  diligencia:     'Diligencia',
  otro:           'Otro',
};

const PRIO_COLORS: Record<string, string> = {
  alta:  '#dc2626',
  media: '#d97706',
  baja:  '#64748b',
};

const ESTADO_COLORS: Record<string, string> = {
  pendiente:  '#d97706',
  urgente:    '#dc2626',
  completada: '#059669',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}

function clientLabel(t: DigestTask): string {
  return t.client_name_resolved || t.client_name || '—';
}

// ── Plantilla HTML ─────────────────────────────────────────────────────────────
function taskRow(t: DigestTask, badge: { bg: string; text: string; label: string }): string {
  const prioBg  = PRIO_COLORS[t.prioridad] || '#64748b';
  const estaBg  = ESTADO_COLORS[t.estado]  || '#64748b';
  const tipoLbl = TIPO_LABEL[t.tipo] || t.tipo;
  const plazoTxt = t.plazo ? fmtDate(t.plazo) : (t.fecha_aviso ? fmtDate(t.fecha_aviso) : '—');

  return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <span style="display:inline-block;background:${badge.bg};color:${badge.text};font-size:10px;font-weight:700;
                    letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;margin-bottom:5px;">
                ${badge.label}
              </span>
              <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;">${t.titulo}</div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">${clientLabel(t)}${t.expediente ? ` · ${t.expediente}` : ''}</div>
              ${t.juzgado ? `<div style="font-size:11px;color:#94a3b8;margin-top:1px;">${t.juzgado}</div>` : ''}
            </td>
            <td width="130" style="text-align:right;vertical-align:top;padding-left:12px;">
              <div style="font-size:11px;color:#475569;margin-bottom:4px;">${plazoTxt}</div>
              <span style="display:inline-block;background:${estaBg}22;color:${estaBg};font-size:10px;font-weight:700;
                    padding:2px 7px;border-radius:6px;margin-bottom:3px;">${t.estado}</span><br>
              <span style="display:inline-block;background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;
                    padding:2px 7px;border-radius:6px;margin-bottom:3px;">${tipoLbl}</span><br>
              <span style="display:inline-block;background:${prioBg}22;color:${prioBg};font-size:10px;font-weight:700;
                    padding:2px 7px;border-radius:6px;">${t.prioridad}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function section(title: string, emoji: string, color: string, tasks: DigestTask[], badge: { bg: string; text: string; label: string }): string {
  if (!tasks.length) return '';
  return `
    <tr>
      <td style="padding:20px 16px 6px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="border-left:3px solid ${color};padding-left:10px;">
              <span style="font-size:13px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.08em;">
                ${emoji} ${title}
              </span>
              <span style="background:${color}22;color:${color};font-size:11px;font-weight:700;
                    padding:2px 8px;border-radius:999px;margin-left:8px;">${tasks.length}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:4px 8px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          ${tasks.map(t => taskRow(t, badge)).join('')}
        </table>
      </td>
    </tr>`;
}

function buildHtml(digest: TaskDigest, userName: string, totalCount: number): string {
  const now   = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const nowCap = now.charAt(0).toUpperCase() + now.slice(1);

  const overdueSection  = section('Vencidas', '⚠️', '#dc2626', digest.overdue,
    { bg: '#fee2e2', text: '#991b1b', label: 'Vencida' });
  const todaySection    = section('Vencen hoy', '📅', '#d97706', digest.today,
    { bg: '#fef3c7', text: '#92400e', label: 'Hoy' });
  const avisoSection    = section('Aviso programado', '🔔', '#3b82f6', digest.aviso,
    { bg: '#dbeafe', text: '#1e40af', label: 'Aviso' });
  const tomorrowSection = section('Mañana vence', '📌', '#6366f1', digest.tomorrow,
    { bg: '#e0e7ff', text: '#3730a3', label: 'Mañana' });

  return `<!doctype html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <!-- HEADER -->
      <tr>
        <td style="background:#dc2626;border-radius:16px 16px 0 0;padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <div style="font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#fca5a5;">VANTIA · DESPACHO LEGAL</div>
                <div style="font-size:22px;font-weight:900;color:#ffffff;margin-top:4px;line-height:1.2;">
                  Recordatorio de actuaciones
                </div>
                <div style="font-size:13px;color:#fca5a5;margin-top:4px;">${nowCap}</div>
              </td>
              <td width="60" style="text-align:right;vertical-align:top;">
                <div style="width:48px;height:48px;background:rgba(255,255,255,.15);border-radius:12px;
                            display:inline-flex;align-items:center;justify-content:center;
                            font-size:24px;line-height:48px;text-align:center;">⚖️</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="background:#ffffff;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:0;padding:8px 8px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">

            <!-- Saludo -->
            <tr>
              <td style="padding:20px 16px 12px;">
                <div style="font-size:15px;font-weight:600;color:#0f172a;">Hola, ${userName} 👋</div>
                <div style="font-size:13px;color:#64748b;margin-top:3px;">
                  Tienes <strong style="color:#dc2626;">${totalCount} actuación${totalCount !== 1 ? 'es' : ''}</strong>
                  que requiere${totalCount !== 1 ? 'n' : ''} atención.
                </div>
              </td>
            </tr>

            ${overdueSection}
            ${todaySection}
            ${avisoSection}
            ${tomorrowSection}

            <!-- CTA -->
            <tr>
              <td style="padding:24px 16px 8px;text-align:center;">
                <a href="${APP_URL}/dashboard/tareas"
                   style="display:inline-block;background:#dc2626;color:#ffffff;font-size:14px;font-weight:700;
                          padding:12px 32px;border-radius:10px;text-decoration:none;letter-spacing:.02em;">
                  Ver mis tareas en Vantia →
                </a>
              </td>
            </tr>

          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:16px 0 0;text-align:center;">
          <div style="font-size:11px;color:#94a3b8;">
            Este recordatorio se envía automáticamente desde Vantia · Despacho Legal.<br>
            Sólo tú ves tus propias actuaciones.
          </div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Enviar digest ──────────────────────────────────────────────────────────────
export async function sendTaskDigest(
  toEmail: string,
  toName: string,
  digest: TaskDigest,
): Promise<void> {
  const totalCount = digest.overdue.length + digest.today.length + digest.aviso.length + digest.tomorrow.length;
  if (totalCount === 0) return;

  const subjectParts: string[] = [];
  if (digest.overdue.length)  subjectParts.push(`${digest.overdue.length} vencida${digest.overdue.length !== 1 ? 's' : ''}`);
  if (digest.today.length)    subjectParts.push(`${digest.today.length} hoy`);
  if (digest.aviso.length)    subjectParts.push(`${digest.aviso.length} aviso${digest.aviso.length !== 1 ? 's' : ''}`);
  if (digest.tomorrow.length) subjectParts.push(`${digest.tomorrow.length} mañana`);

  const subject = `⚖️ Vantia: ${subjectParts.join(' · ')} — ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to:   toEmail,
    subject,
    html: buildHtml(digest, toName, totalCount),
  });
}
