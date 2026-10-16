import pool from '../config/database';

// ── Preferencias de avisos por persona (13/10/2026) ──────────────────────────
// Qué tipos de aviso push quiere cada uno y su horario de silencio. Por
// defecto, todo activado y silencio de 21:00 a 08:00 y fines de semana (hora
// de Madrid). Los mensajes directos del chat y las vistas llegan siempre,
// también en silencio: son lo urgente.

export type TipoAviso = 'chat' | 'chat_dm' | 'correo' | 'whatsapp' | 'plazo' | 'vista' | 'soporte';
export type TipoPref = 'chat' | 'correo' | 'whatsapp' | 'plazo' | 'vista' | 'soporte';
export const TIPOS_PREF: TipoPref[] = ['chat', 'correo', 'whatsapp', 'plazo', 'vista', 'soporte'];

export interface AvisoPrefs {
  tipos: Record<TipoPref, boolean>;
  /** Además del push, por correo (16/10/2026). Por defecto, ninguno; "correo"
   *  no se ofrece (sería un correo para avisar de un correo). */
  email: Record<TipoPref, boolean>;
  silencio: { activo: boolean; desde: string; hasta: string; finDeSemana: boolean };
}

export const PREFS_POR_DEFECTO: AvisoPrefs = {
  tipos: { chat: true, correo: true, whatsapp: true, plazo: true, vista: true, soporte: true },
  email: { chat: false, correo: false, whatsapp: false, plazo: false, vista: false, soporte: false },
  silencio: { activo: true, desde: '21:00', hasta: '08:00', finDeSemana: true },
};

/** Los que atraviesan el horario de silencio. */
const SIEMPRE: TipoAviso[] = ['chat_dm', 'vista'];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizarPrefs(raw: any): AvisoPrefs {
  const p = raw && typeof raw === 'object' ? raw : {};
  const tipos = { ...PREFS_POR_DEFECTO.tipos };
  for (const t of TIPOS_PREF) if (typeof p.tipos?.[t] === 'boolean') tipos[t] = p.tipos[t];
  const email = { ...PREFS_POR_DEFECTO.email };
  for (const t of TIPOS_PREF) if (t !== 'correo' && typeof p.email?.[t] === 'boolean') email[t] = p.email[t];
  const s = p.silencio || {};
  return {
    tipos,
    email,
    silencio: {
      activo: typeof s.activo === 'boolean' ? s.activo : PREFS_POR_DEFECTO.silencio.activo,
      desde: HORA.test(s.desde) ? s.desde : PREFS_POR_DEFECTO.silencio.desde,
      hasta: HORA.test(s.hasta) ? s.hasta : PREFS_POR_DEFECTO.silencio.hasta,
      finDeSemana: typeof s.finDeSemana === 'boolean' ? s.finDeSemana : PREFS_POR_DEFECTO.silencio.finDeSemana,
    },
  };
}

/** Hora y día de la semana en Madrid (0 = domingo). */
function madridAhora(ahora: Date): { minutos: number; diaSemana: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(ahora);
  const v = (t: string) => partes.find((p) => p.type === t)?.value || '';
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { minutos: (Number(v('hour')) % 24) * 60 + Number(v('minute')), diaSemana: dias.indexOf(v('weekday')) };
}

export function enSilencio(prefs: AvisoPrefs, ahora = new Date()): boolean {
  const s = prefs.silencio;
  if (!s.activo) return false;
  const { minutos, diaSemana } = madridAhora(ahora);
  if (s.finDeSemana && (diaSemana === 0 || diaSemana === 6)) return true;
  const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const desde = aMin(s.desde);
  const hasta = aMin(s.hasta);
  if (desde === hasta) return false;
  // Rango que cruza la medianoche (21:00 → 08:00) o dentro del mismo día.
  return desde > hasta ? (minutos >= desde || minutos < hasta) : (minutos >= desde && minutos < hasta);
}

export async function prefsDe(userIds: string[]): Promise<Map<string, AvisoPrefs>> {
  const mapa = new Map<string, AvisoPrefs>();
  if (!userIds.length) return mapa;
  const { rows } = await pool.query(`SELECT user_id, prefs FROM aviso_preferencias WHERE user_id = ANY($1::text[])`, [userIds]);
  const guardadas = new Map(rows.map((r: any) => [r.user_id, r.prefs]));
  for (const id of userIds) mapa.set(id, normalizarPrefs(guardadas.get(id)));
  return mapa;
}

/** Quién recibe un aviso de ese tipo ahora mismo: fuera quien lo tiene
 *  desactivado y, salvo lo urgente, quien está en su horario de silencio. */
export async function filtrarPorPreferencias(userIds: string[], tipo: TipoAviso, ahora = new Date()): Promise<{ destinatarios: string[]; silenciados: string[]; porCorreo: string[] }> {
  const prefs = await prefsDe(userIds);
  const pref: TipoPref = tipo === 'chat_dm' ? 'chat' : tipo;
  const destinatarios: string[] = [];
  const silenciados: string[] = [];
  const porCorreo: string[] = [];
  for (const id of userIds) {
    const p = prefs.get(id)!;
    if (!p.tipos[pref] && !p.email[pref]) continue;
    // El silencio vale para los dos canales (los plazos silenciados se
    // reintentan después: así tampoco llegan dos correos del mismo aviso).
    if (!SIEMPRE.includes(tipo) && enSilencio(p, ahora)) { silenciados.push(id); continue; }
    if (p.tipos[pref]) destinatarios.push(id);
    if (p.email[pref]) porCorreo.push(id);
  }
  return { destinatarios, silenciados, porCorreo };
}
