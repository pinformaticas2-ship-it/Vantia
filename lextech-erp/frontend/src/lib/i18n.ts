// ── Idioma de la aplicación (12/11/2026) ─────────────────────────────────────
// Español (original) e inglés. El texto en español ES la clave: t("Guardar")
// devuelve "Save" en inglés y "Guardar" en español, y si una frase todavía no
// está traducida sale en español (nunca vacía). Las traducciones viven en
// src/i18n/en/*.ts, una por zona de la app.
//
// Cambiar de idioma recarga la página: así se traduce también lo que se
// calcula al cargar (menús, listas de opciones...), sin dejar nada a medias.
//
// Los documentos que genera la app (escritos, plantillas, facturas, correos a
// clientes) siguen siempre en español: van a juzgados y clientes españoles.

export type Idioma = 'es' | 'en';
export const IDIOMAS: { valor: Idioma; label: string; nativo: string }[] = [
  { valor: 'es', label: 'Español', nativo: 'Español' },
  { valor: 'en', label: 'Inglés', nativo: 'English' },
];

const CLAVE_PREFS = 'vantia.preferencias';

function idiomaGuardado(): Idioma {
  try {
    const raw = localStorage.getItem(CLAVE_PREFS);
    const p = raw ? JSON.parse(raw) : null;
    if (p?.idioma === 'en' || p?.idioma === 'es') return p.idioma;
  } catch { /* sin almacenamiento */ }
  return 'es';
}

let actual: Idioma = typeof window !== 'undefined' ? idiomaGuardado() : 'es';
const en: Record<string, string> = {};

export function idioma(): Idioma { return actual; }
/** Para fechas y números: es-ES o en-GB (día/mes/año, como en España). */
export function locale(): string { return actual === 'en' ? 'en-GB' : 'es-ES'; }

/** Añade traducciones al inglés (las llama cada archivo de src/i18n/en). */
export function registrarEn(dic: Record<string, string>) { Object.assign(en, dic); }

/** Traduce un texto en español. {nombre} se sustituye por vars.nombre. */
export function t(texto: string, vars?: Record<string, string | number | null | undefined>): string {
  let s = actual === 'en' ? (en[texto] ?? texto) : texto;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));
  return s;
}

/** Singular o plural: tn(n, "{n} mensaje", "{n} mensajes"). */
export function tn(n: number, uno: string, varios: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? uno : varios, { n: n.toLocaleString(locale()), ...vars });
}

/** Lo que se guarda al elegir idioma: se aplica recargando la página. */
export function cambiarIdioma(nuevo: Idioma) {
  if (nuevo === actual) return;
  actual = nuevo;
  window.location.reload();
}

// ── Fechas, horas y números en el idioma y la zona elegidos ─────────────────
// La app tiene ~150 sitios que formatean fechas con toLocaleDateString('es-ES')
// y similares. En vez de tocarlos uno a uno, aquí se ajustan todos: el idioma
// sigue al de la app y se aplican la zona horaria y el formato de hora de
// Ajustes → Preferencias de trabajo. Quien pida otro idioma a propósito
// (p. ej. 'en-US' para un documento) lo sigue teniendo.
let zonaElegida = '';
let hora12 = false;

export function fijarFormatoFechas(opts: { zonaHoraria?: string; formatoHora?: '24h' | '12h' }) {
  zonaElegida = opts.zonaHoraria || '';
  hora12 = opts.formatoHora === '12h';
}

/** ¿Es una fecha "de la app" (sin idioma o en español)? Solo a esas se les
 *  cambia idioma, zona y formato de hora: si alguien pide 'sv-SE' para sacar
 *  una fecha AAAA-MM-DD y leerla, se queda exactamente como la pidió. */
function esDeLaApp(loc?: string | string[]) { return loc === undefined || loc === 'es-ES' || loc === 'es'; }
function mapearLocale(loc?: string | string[]): string | string[] | undefined {
  return esDeLaApp(loc) ? locale() : loc;
}
function conOpciones(opts: Intl.DateTimeFormatOptions | undefined, conHora: boolean): Intl.DateTimeFormatOptions | undefined {
  if (!zonaElegida && !hora12) return opts;
  const o: Intl.DateTimeFormatOptions = { ...(opts || {}) };
  if (zonaElegida && !o.timeZone) o.timeZone = zonaElegida;
  const pideHora = conHora && (!opts || opts.hour !== undefined || opts.timeStyle !== undefined || (!opts.year && !opts.month && !opts.day && !opts.weekday && !opts.dateStyle));
  if (hora12 && pideHora && o.hour12 === undefined && o.hourCycle === undefined) o.hour12 = true;
  return o;
}

let instalado = false;
export function instalarFormatoFechas() {
  if (instalado || typeof Date === 'undefined') return;
  instalado = true;
  const dP = Date.prototype as any;
  const fecha = dP.toLocaleDateString, hora = dP.toLocaleTimeString, ambas = dP.toLocaleString;
  dP.toLocaleDateString = function (loc?: any, opts?: any) { return esDeLaApp(loc) ? fecha.call(this, locale(), conOpciones(opts, false)) : fecha.call(this, loc, opts); };
  dP.toLocaleTimeString = function (loc?: any, opts?: any) { return esDeLaApp(loc) ? hora.call(this, locale(), conOpciones(opts, true)) : hora.call(this, loc, opts); };
  dP.toLocaleString = function (loc?: any, opts?: any) { return esDeLaApp(loc) ? ambas.call(this, locale(), conOpciones(opts, true)) : ambas.call(this, loc, opts); };
  const nP = Number.prototype as any;
  const num = nP.toLocaleString;
  nP.toLocaleString = function (loc?: any, opts?: any) { return num.call(this, mapearLocale(loc), opts); };
  // new Intl.DateTimeFormat('es-ES', ...) también.
  const DTF = Intl.DateTimeFormat;
  const Envuelto: any = function (this: any, loc?: any, opts?: any) {
    return esDeLaApp(loc) ? new DTF(locale(), conOpciones(opts, !!(opts && (opts.hour || opts.timeStyle)))) : new DTF(loc, opts);
  };
  Envuelto.prototype = DTF.prototype;
  Envuelto.supportedLocalesOf = DTF.supportedLocalesOf;
  (Intl as any).DateTimeFormat = Envuelto;
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = actual;
  instalarFormatoFechas();
}
