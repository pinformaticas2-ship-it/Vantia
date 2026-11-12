import pool from '../config/database';

// Avisos push y por correo en el idioma de cada persona (12/11/2026). Los
// avisos se montan en español en cada módulo; aquí, para quien tiene la app en
// inglés (Ajustes → Preferencias de trabajo), se traducen las partes fijas.
// El contenido que escribe la gente (mensajes, asuntos, nombres) no se toca.

export type IdiomaAviso = 'es' | 'en';

/** Idioma de cada persona (por defecto, español). */
export async function idiomasDe(userIds: string[]): Promise<Map<string, IdiomaAviso>> {
  const mapa = new Map<string, IdiomaAviso>();
  for (const id of userIds) mapa.set(id, 'es');
  if (!userIds.length) return mapa;
  try {
    const { rows } = await pool.query(
      `SELECT user_id, extras->>'idioma' AS idioma FROM user_preferences WHERE user_id = ANY($1::text[])`,
      [userIds],
    );
    for (const r of rows) if (r.idioma === 'en') mapa.set(r.user_id, 'en');
  } catch { /* sin preferencias: español */ }
  return mapa;
}

const EXACTOS: Record<string, string> = {
  'Aviso de prueba': 'Test notification',
  'Si ves esto, los avisos de Vantia te llegan a este dispositivo.': 'If you can see this, Vantia notifications are reaching this device.',
  'Nuevo correo': 'New email',
  '(Sin asunto)': '(No subject)',
  'Tarea sin título': 'Untitled task',
  'Recordatorio de expediente': 'Case reminder',
  '📚 Preparar vista': '📚 Prepare hearing',
  'Vence hoy': 'Due today',
  'Vence mañana': 'Due tomorrow',
  'Recordatorio enviado al cliente': 'Reminder sent to the client',
};

// [patrón, sustitución] en orden. Se aplican sobre el título y el cuerpo.
const REGLAS: [RegExp, string][] = [
  [/^(\d+) correos nuevos$/, '$1 new emails'],
  [/ y (\d+) más$/, ' and $1 more'],
  [/Vencida hace (\d+) día(s?)/g, 'Overdue by $1 day$2'],
  [/Vence en (\d+) días/g, 'Due in $1 days'],
  [/Vence hoy/g, 'Due today'],
  [/Vence mañana/g, 'Due tomorrow'],
  [/(^| · )Exp\. /g, '$1Case '],
  [/Ha pasado a «(.+?)»\./, 'Moved to «$1».'],
  [/ Siguiente: /, ' Next: '],
  [/^Centro de soporte · Respuesta en /, 'Support centre · Reply in '],
  [/^Centro de soporte · Nuevo ticket /, 'Support centre · New ticket '],
  [/^Centro de soporte · /, 'Support centre · '],
  [/ ha respondido a «/, ' replied to «'],
  [/Vista cancelada o suspendida/g, 'Hearing cancelled or postponed'],
  [/Vista por confirmar \(choca con tu agenda\)/g, 'Hearing to confirm (clashes with your calendar)'],
  [/Vista por confirmar/g, 'Hearing to confirm'],
  [/Cambio en una vista ya aceptada/g, 'Change to an already accepted hearing'],
  [/Nueva documentación de un procedimiento/g, 'New documents for a proceeding'],
  [/^✅ Vista aceptada por /, '✅ Hearing accepted by '],
  [/^🔁 Vista modificada por /, '🔁 Hearing changed by '],
  [/^❌ Vista cancelada por /, '❌ Hearing cancelled by '],
  [/^Según el correo «/, 'According to the email «'],
  [/^Se cancela la vista del /, 'Cancelling the hearing of '],
  [/^La vista del (.+) pasaría al /, 'The hearing of $1 would move to '],
  [/^Del (.+) al /, 'From $1 to '],
  [/^al /, 'to '],
  [/ señalada para el /, ' scheduled for '],
  [/ \(hilo\)$/, ' (thread)'],
  [/^#canal/, '#channel'],
];

const DIAS: Record<string, string> = { lunes: 'Monday', martes: 'Tuesday', 'miércoles': 'Wednesday', jueves: 'Thursday', viernes: 'Friday', 'sábado': 'Saturday', domingo: 'Sunday' };
const MESES: Record<string, string> = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December' };

/** Traduce al inglés las partes fijas de un aviso (y las fechas escritas). */
export function traducirAviso(texto: string | undefined | null): string {
  if (!texto) return texto || '';
  if (EXACTOS[texto]) return EXACTOS[texto];
  let s = texto;
  for (const [re, sust] of REGLAS) s = s.replace(re, sust);
  // Fechas escritas en español: "lunes, 3 de noviembre de 2026, 10:00".
  s = s.replace(/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/gi, (m) => DIAS[m.toLowerCase()] || m);
  s = s.replace(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)( de (\d{4}))?/gi,
    (_m, d, mes, _c, anio) => `${d} ${MESES[mes.toLowerCase()]}${anio ? ` ${anio}` : ''}`);
  return s;
}

/** Textos fijos del correo de aviso. */
export function textosCorreoAviso(idioma: IdiomaAviso) {
  return idioma === 'en'
    ? { abrir: 'Open in Vantia', motivo: 'You get this because you have email notifications turned on in Vantia.', cambiar: 'Change which notifications I get', remitente: 'Vantia notifications' }
    : { abrir: 'Abrir en Vantia', motivo: 'Te llega porque tienes activados los avisos por correo en Vantia.', cambiar: 'Cambiar qué avisos recibo', remitente: 'Avisos de Vantia' };
}
