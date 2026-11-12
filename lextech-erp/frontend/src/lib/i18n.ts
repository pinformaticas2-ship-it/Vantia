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
  // "Alta@@prioridad": la misma palabra con otro sentido según el sitio. En
  // español se muestra "Alta"; en inglés se busca la clave entera.
  const ctx = texto.indexOf('@@');
  const base = ctx >= 0 ? texto.slice(0, ctx) : texto;
  let s = actual === 'en' ? (en[texto] ?? en[base] ?? base) : base;
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

// ── Red de seguridad en pantalla (12/11/2026) ───────────────────────────────
// Con la app en inglés, cualquier texto visible que coincida EXACTAMENTE con
// una frase del diccionario se cambia por su traducción (también title,
// placeholder y aria-label). Así se traducen también las etiquetas que vienen
// de listas de datos (columnas, opciones, estados...) sin tocar sus valores
// internos. Nunca dentro de lo que se edita o se genera para un cliente o un
// juzgado: editores, vistas previas de documentos, campos de texto, código.
const NO_TRADUCIR = 'textarea, input, script, style, pre, code, kbd, [contenteditable=""], [contenteditable="true"], .ProseMirror, .ql-editor, [data-sin-traducir]';
const ATRIBUTOS_TEXTO = ['placeholder', 'title', 'aria-label'];

function traducirNodoTexto(n: Text) {
  const v = n.nodeValue;
  if (!v || v.length > 600) return;
  const k = v.trim();
  if (!k) return;
  const tr = en[k];
  if (!tr || tr === k) return;
  const padre = n.parentElement;
  if (!padre || padre.closest(NO_TRADUCIR)) return;
  const i = v.indexOf(k);
  n.nodeValue = v.slice(0, i) + tr + v.slice(i + k.length);
}
function traducirAtributos(el: Element) {
  for (const a of ATRIBUTOS_TEXTO) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const tr = en[v.trim()];
    if (tr && tr !== v && !el.closest(NO_TRADUCIR.replace('textarea, input, ', ''))) el.setAttribute(a, tr);
  }
}
function traducirArbol(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) { traducirNodoTexto(raiz as Text); return; }
  if (raiz.nodeType !== Node.ELEMENT_NODE) return;
  const el = raiz as Element;
  if (el.matches?.('script, style')) return;
  traducirAtributos(el);
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) traducirNodoTexto(n as Text);
    else traducirAtributos(n as Element);
  }
}

export function instalarTraduccionEnPantalla() {
  if (actual !== 'en' || typeof MutationObserver === 'undefined') return;
  const pendientes = new Set<Node>();
  let programado = false;
  const procesar = () => {
    programado = false;
    for (const n of pendientes) if (n.isConnected) traducirArbol(n);
    pendientes.clear();
  };
  const obs = new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === 'characterData') pendientes.add(c.target);
      else if (c.type === 'attributes') pendientes.add(c.target);
      else c.addedNodes.forEach((n) => pendientes.add(n));
    }
    // Antes de pintar: así no se llega a ver el texto en español.
    if (!programado) { programado = true; queueMicrotask(procesar); }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS_TEXTO });
  traducirArbol(document.body);
  // También el título de la pestaña.
  const tit = en[document.title.trim()];
  if (tit) document.title = tit;
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = actual;
  instalarFormatoFechas();
}
