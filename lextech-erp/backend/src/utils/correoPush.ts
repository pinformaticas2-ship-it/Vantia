import { sendPushToUser } from './webPush';

// ── Push de "correo nuevo" (13/10/2026) ─────────────────────────────────────
// Antes solo existía en el webhook de EmailEngine, pero en producción todo el
// correo entra por la sincronización IMAP propia: el aviso no llegaba nunca.
// Ahora lo lanza saveImapEnvelopes (emailController) al insertar de verdad un
// mensaje en la bandeja de entrada -- da igual qué vía lo traiga (sincronización
// automática, la de vistas cada minuto o la página de Correo).

export interface CorreoNuevo {
  id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  sent_at: Date | null;
}

const MAX_ANTIGUEDAD_MS = 24 * 60 * 60 * 1000;

export async function avisarCorreosNuevos(acc: { id: string; user_id: string; email?: string | null }, correos: CorreoNuevo[]): Promise<void> {
  const propio = String(acc.email || '').toLowerCase();
  const recientes = correos.filter((c) =>
    // Solo lo que acaba de llegar: un mensaje antiguo que aparece por una
    // reparación o una recarga de la carpeta no es "correo nuevo".
    c.sent_at && Date.now() - new Date(c.sent_at).getTime() < MAX_ANTIGUEDAD_MS
    // Lo que uno se manda a sí mismo (o las respuestas automáticas de Vantia
    // desde el propio buzón) no avisa.
    && String(c.from_email || '').toLowerCase() !== propio,
  );
  if (!recientes.length) return;
  const nombre = (c: CorreoNuevo) => c.from_name || c.from_email || 'Remitente desconocido';
  if (recientes.length === 1) {
    const c = recientes[0];
    await sendPushToUser(acc.user_id, {
      title: nombre(c),
      body: c.subject || '(Sin asunto)',
      url: `/dashboard/correo?openEmail=${encodeURIComponent(c.id)}`,
      tag: `correo-${acc.id}`,
      tipo: 'correo',
    });
    return;
  }
  const remitentes = [...new Set(recientes.map(nombre))];
  await sendPushToUser(acc.user_id, {
    title: `${recientes.length} correos nuevos`,
    body: remitentes.slice(0, 3).join(', ') + (remitentes.length > 3 ? ` y ${remitentes.length - 3} más` : ''),
    url: '/dashboard/correo',
    tag: `correo-${acc.id}`,
    tipo: 'correo',
  });
}
