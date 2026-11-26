// ── Fórmulas de las variables de documentos (26/11/2026) ─────────────────────
// Una variable puede calcularse a partir de otras: un texto con trozos entre
// llaves que se evalúan, al estilo de Excel:
//
//   {SI(Clientes_Sexo = "Mujer"; "doña"; "don")} {NOMPROPIO(Clientes_Nombre)}, con DNI {Clientes_NIF}
//   {EUROS_LETRAS(Expedientes_Cuantía)} ({IMPORTE(Expedientes_Cuantía)})
//
// Dentro de las llaves:
//   · variables por su nombre (Clientes_Nombre) o entre « » si llevan signos («Empresa_NIF/CIF»);
//   · textos entre comillas ("doña"), números (1500, 21.5);
//   · operadores: & (unir), + - * / , = <> > < >= <=;
//   · funciones (MAYUSCULAS, SI, LETRAS, FECHA_LARGA...) con los argumentos
//     separados por ";" (o ","). Cada función tiene también su nombre en inglés.
// Fuera de las llaves el texto sale tal cual; "{{" y "}}" escriben una llave.
//
// No usa eval: se analiza a un árbol y se evalúa con límites de tamaño y pasos.
// Las variables se piden a quien evalúa (resolverValor en plantillasDatos), que
// controla los ciclos (una fórmula que se usa a sí misma).

export class ErrorFormula extends Error {
  constructor(mensaje: string, public pos: number) { super(mensaje); }
}

type Valor = string | number | boolean;
type Nodo =
  | { t: 'txt'; v: string }
  | { t: 'num'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'var'; n: string }
  | { t: 'fn'; f: DefFuncion; args: Nodo[] }
  | { t: 'op'; op: string; a: Nodo; b: Nodo }
  | { t: 'neg'; a: Nodo }
  | { t: 'cat'; partes: Nodo[] };

export const MAX_FORMULA = 5000;
const MAX_SALIDA = 20000;
const MAX_PASOS = 20000;
const MAX_NODOS = 3000;

// ── Utilidades de valores ────────────────────────────────────────────────────

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const comparable = (s: string) => sinTildes(s).trim().toLowerCase().replace(/\s+/g, ' ');

/** "1.234,50 €" / "1,234.50" / "1234,5" / "21%" → número (NaN si no lo es). */
export function aNumero(v: Valor): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim().replace(/[€$%\s ]|EUR|euros?/gi, '');
  if (!s) return NaN;
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^[-(]+|\)+$/g, '');
  if (!/^[\d.,]+$/.test(s)) return NaN;
  const ultComa = s.lastIndexOf(','), ultPunto = s.lastIndexOf('.');
  if (ultComa >= 0 && ultPunto >= 0) {
    // El último separador es el decimal.
    s = ultComa > ultPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultComa >= 0) {
    // Una coma: decimal ("1234,5"). Varias: miles ("1,234,567").
    s = s.match(/,/g)!.length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ultPunto >= 0) {
    // "1.234" o "1.234.567": miles. "21.5": decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

/** 1234.5 → "1.234,50" (con dec). Sin "siempre", los miles solo desde 10.000 (como "2026"). */
function fmtNumero(n: number, dec?: number, siempre = true): string {
  if (!Number.isFinite(n)) return '';
  let s = dec === undefined ? String(Math.round(n * 1e10) / 1e10) : n.toFixed(dec);
  if (/e/i.test(s)) return s;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  let [ent, frac] = s.split('.');
  if (siempre || ent.length > 4) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + ent + (frac ? ',' + frac : '');
}

export function aTexto(v: Valor): string {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') return fmtNumero(v, undefined, false);
  return v;
}

function verdad(v: Valor): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  const s = comparable(v);
  return !!s && !['no', 'falso', 'false', '0', 'n'].includes(s);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "05/03/2026", "5-3-26", "2026-03-05", "5 de marzo de 2026" → fecha (UTC, sin hora). */
export function aFecha(v: Valor): Date | null {
  const s = sinTildes(aTexto(v)).trim().toLowerCase();
  if (!s) return null;
  let d: number, m: number, a: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { a = +r[1]; m = +r[2]; d = +r[3]; } else {
    r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (r) { d = +r[1]; m = +r[2]; a = +r[3]; if (a < 100) a += 2000; } else {
      r = s.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})$/);
      if (!r) return null;
      d = +r[1]; m = MESES.map(sinTildes).indexOf(r[2]) + 1; a = +r[3];
      if (!m) return null;
    }
  }
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f : null;
}

const dos = (n: number) => String(n).padStart(2, '0');
export const fechaCortaDe = (f: Date) => `${dos(f.getUTCDate())}/${dos(f.getUTCMonth() + 1)}/${f.getUTCFullYear()}`;
const fechaLargaDe = (f: Date) => `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;

function hoy(): Date {
  // El día de hoy en España.
  const [d, m, a] = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }).split('/').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function sumarMeses(f: Date, n: number): Date {
  const a = f.getUTCFullYear(), m = f.getUTCMonth() + n, d = f.getUTCDate();
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m, Math.min(d, ultimo)));
}

// ── Números en letras ────────────────────────────────────────────────────────

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 0..999. apocope: "uno" → "un" (veintiún, un) delante de un sustantivo. */
function hasta999(n: number, apocope: boolean): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  let txt = '';
  if (r < 30) txt = r ? UNIDADES[r] : '';
  else {
    const d = Math.floor(r / 10), u = r % 10;
    txt = DECENAS[d] + (u ? ' y ' + UNIDADES[u] : '');
  }
  if (apocope) txt = txt.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');
  return [CENTENAS[c], txt].filter(Boolean).join(' ');
}

/** Entero en letras (hasta billones). apocope: para "veintiún euros". */
export function enteroEnLetras(n: number, apocope = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'cero';
  if (n >= 1e15) return String(n);
  const partes: string[] = [];
  const billones = Math.floor(n / 1e12), millones = Math.floor((n % 1e12) / 1e6), miles = Math.floor((n % 1e6) / 1e3), resto = n % 1e3;
  const grupoMillon = (x: number, uno: string, varios: string) => {
    if (!x) return;
    // "un millón", "veintiún millones", "mil millones"
    if (x === 1) partes.push('un ' + uno);
    else partes.push(enteroEnLetras(x, true) + ' ' + varios);
  };
  grupoMillon(billones, 'billón', 'billones');
  grupoMillon(millones, 'millón', 'millones');
  if (miles) partes.push(miles === 1 ? 'mil' : hasta999(miles, true) + ' mil');
  if (resto) partes.push(hasta999(resto, apocope));
  return partes.join(' ');
}

function numeroEnLetras(n: number): string {
  if (!Number.isFinite(n)) return '';
  const neg = n < 0 ? 'menos ' : '';
  const a = Math.abs(n);
  const ent = Math.floor(a);
  const dec = Math.round((a - ent) * 100);
  return neg + enteroEnLetras(ent) + (dec ? ' con ' + enteroEnLetras(dec) : '');
}

function eurosEnLetras(n: number): string {
  if (!Number.isFinite(n)) return '';
  const neg = n < 0 ? 'menos ' : '';
  let cents = Math.round(Math.abs(n) * 100);
  const ent = Math.floor(cents / 100); cents %= 100;
  // "un millón de euros", "dos millones de euros" (sin más cifras detrás)
  const deEuros = ent >= 1e6 && ent % 1e6 === 0 ? 'de euros' : ent === 1 ? 'euro' : 'euros';
  let txt = `${enteroEnLetras(ent, true)} ${deEuros}`;
  if (cents) txt += ` con ${enteroEnLetras(cents, true)} ${cents === 1 ? 'céntimo' : 'céntimos'}`;
  return neg + txt;
}

function fechaEnLetras(f: Date): string {
  const d = f.getUTCDate();
  return `${d === 1 ? 'uno' : enteroEnLetras(d)} de ${MESES[f.getUTCMonth()]} de ${enteroEnLetras(f.getUTCFullYear())}`;
}

// ── Funciones ───────────────────────────────────────────────────────────────

interface DefFuncion {
  nombre: string; en: string; min: number; max: number;
  /** Recibe los argumentos ya evaluados, salvo las "perezosas" (SI...). */
  fn?: (a: Valor[]) => Valor;
  perezosa?: (args: Nodo[], ev: (n: Nodo) => Valor) => Valor;
}

const TXT = (v: Valor) => aTexto(v);
const NUM = (v: Valor) => aNumero(v);
const conFecha = (v: Valor, f: (d: Date) => Valor): Valor => { const d = aFecha(v); return d ? f(d) : ''; };
const conNumero = (v: Valor, f: (n: number) => Valor): Valor => { const n = aNumero(v); return Number.isFinite(n) ? f(n) : ''; };
const PEQUENAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'con', 'por', 'para', 'sin']);
// En las fichas de Vantia el sexo es "Hombre"/"Mujer"; en MN, "M"/"F" (M = masculino).
function genero(v: Valor): 'f' | 'm' | '' {
  const s = comparable(TXT(v)).replace(/\.$/, '');
  if (['mujer', 'f', 'femenino', 'femenina', 'female', 'woman', 'dona', 'dna', 'sra'].includes(s)) return 'f';
  if (['hombre', 'h', 'm', 'v', 'varon', 'masculino', 'male', 'man', 'don', 'd', 'sr'].includes(s)) return 'm';
  return '';
}
const igualdad = (a: Valor, b: Valor): boolean => {
  if ((typeof a === 'number' || typeof b === 'number')) {
    const x = aNumero(a), y = aNumero(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return verdad(a) === verdad(b);
  return comparable(TXT(a)) === comparable(TXT(b));
};

const LISTA_FUNCIONES: DefFuncion[] = [
  // Texto
  { nombre: 'MAYUSCULAS', en: 'UPPER', min: 1, max: 1, fn: ([a]) => TXT(a).toLocaleUpperCase('es-ES') },
  { nombre: 'MINUSCULAS', en: 'LOWER', min: 1, max: 1, fn: ([a]) => TXT(a).toLocaleLowerCase('es-ES') },
  { nombre: 'NOMPROPIO', en: 'PROPER', min: 1, max: 1, fn: ([a]) => TXT(a).toLocaleLowerCase('es-ES').split(/(\s+|-)/)
      .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('es-ES') + p.slice(1))).join('') },
  { nombre: 'PRIMERA_MAYUSCULA', en: 'CAPITALIZE', min: 1, max: 1, fn: ([a]) => { const s = TXT(a); return s.charAt(0).toLocaleUpperCase('es-ES') + s.slice(1); } },
  { nombre: 'RECORTAR', en: 'TRIM', min: 1, max: 1, fn: ([a]) => TXT(a).replace(/\s+/g, ' ').trim() },
  { nombre: 'IZQUIERDA', en: 'LEFT', min: 2, max: 2, fn: ([a, n]) => [...TXT(a)].slice(0, Math.max(0, NUM(n) || 0)).join('') },
  { nombre: 'DERECHA', en: 'RIGHT', min: 2, max: 2, fn: ([a, n]) => { const c = [...TXT(a)], k = Math.max(0, NUM(n) || 0); return k ? c.slice(-k).join('') : ''; } },
  { nombre: 'EXTRAE', en: 'MID', min: 3, max: 3, fn: ([a, d, n]) => [...TXT(a)].slice(Math.max(0, (NUM(d) || 1) - 1), Math.max(0, (NUM(d) || 1) - 1) + Math.max(0, NUM(n) || 0)).join('') },
  { nombre: 'LARGO', en: 'LEN', min: 1, max: 1, fn: ([a]) => [...TXT(a)].length },
  { nombre: 'REEMPLAZAR', en: 'REPLACE', min: 3, max: 3, fn: ([a, b, c]) => (TXT(b) ? TXT(a).split(TXT(b)).join(TXT(c)) : TXT(a)) },
  { nombre: 'CONTIENE', en: 'CONTAINS', min: 2, max: 2, fn: ([a, b]) => comparable(TXT(a)).includes(comparable(TXT(b))) },
  { nombre: 'EMPIEZA_POR', en: 'STARTS_WITH', min: 2, max: 2, fn: ([a, b]) => comparable(TXT(a)).startsWith(comparable(TXT(b))) },
  { nombre: 'PALABRA', en: 'WORD', min: 2, max: 2, fn: ([a, n]) => { const p = TXT(a).trim().split(/\s+/).filter(Boolean); const i = NUM(n) || 1; return (i > 0 ? p[i - 1] : p[p.length + i]) || ''; } },
  { nombre: 'UNIR', en: 'JOIN', min: 2, max: 50, fn: ([sep, ...r]) => r.map(TXT).map((x) => x.trim()).filter(Boolean).join(TXT(sep)) },
  { nombre: 'LISTA', en: 'LIST', min: 1, max: 50, fn: (r) => {
      const p = r.map(TXT).map((x) => x.trim()).filter(Boolean);
      if (p.length < 2) return p[0] || '';
      const ult = p[p.length - 1];
      // "y" → "e" delante de "i"/"hi" (Juan e Isabel)
      const y = /^h?i[^aeiouáéíóú]/i.test(sinTildes(ult)) || /^h?i$/i.test(ult) ? 'e' : 'y';
      return `${p.slice(0, -1).join(', ')} ${y} ${ult}`;
    } },
  { nombre: 'TEXTO_SI', en: 'TEXT_IF', min: 2, max: 3, perezosa: ([v, antes, despues], ev) => {
      // Pone "antes + valor + después" solo si hay valor: {TEXTO_SI(Clientes_NIF; ", con DNI ")}
      const val = TXT(ev(v)).trim();
      return val ? TXT(ev(antes)) + val + (despues ? TXT(ev(despues)) : '') : '';
    } },
  // Condiciones
  { nombre: 'SI', en: 'IF', min: 2, max: 3, perezosa: ([c, a, b], ev) => (verdad(ev(c)) ? ev(a) : b ? ev(b) : '') },
  { nombre: 'SI_VACIO', en: 'IF_EMPTY', min: 2, max: 2, perezosa: ([a, b], ev) => { const v = ev(a); return TXT(v).trim() ? v : ev(b); } },
  { nombre: 'PRIMERO_NO_VACIO', en: 'COALESCE', min: 1, max: 50, perezosa: (args, ev) => {
      for (const n of args) { const v = ev(n); if (TXT(v).trim()) return v; }
      return '';
    } },
  { nombre: 'VACIO', en: 'IS_EMPTY', min: 1, max: 1, fn: ([a]) => !TXT(a).trim() },
  { nombre: 'Y', en: 'AND', min: 1, max: 50, perezosa: (args, ev) => args.every((n) => verdad(ev(n))) },
  { nombre: 'O', en: 'OR', min: 1, max: 50, perezosa: (args, ev) => args.some((n) => verdad(ev(n))) },
  { nombre: 'NO', en: 'NOT', min: 1, max: 1, fn: ([a]) => !verdad(a) },
  { nombre: 'SEGUN', en: 'SWITCH', min: 3, max: 61, perezosa: ([v, ...casos], ev) => {
      // SEGUN(valor; caso1; resultado1; caso2; resultado2; ...; [si no])
      const x = ev(v);
      for (let i = 0; i + 1 < casos.length; i += 2) if (igualdad(x, ev(casos[i]))) return ev(casos[i + 1]);
      return casos.length % 2 ? ev(casos[casos.length - 1]) : '';
    } },
  // Género (con el sexo de la ficha: "Hombre"/"Mujer")
  { nombre: 'DON_DONA', en: 'HONORIFIC', min: 1, max: 1, fn: ([s]) => ({ f: 'doña', m: 'don', '': 'don/doña' })[genero(s)] },
  { nombre: 'GENERO', en: 'GENDER', min: 3, max: 4, fn: ([s, m, f, x]) => { const g = genero(s); return g === 'f' ? f : g === 'm' ? m : x !== undefined ? x : `${TXT(m)}/${TXT(f)}`; } },
  // Números e importes
  { nombre: 'NUMERO', en: 'NUMBER', min: 1, max: 1, fn: ([a]) => { const n = NUM(a); return Number.isFinite(n) ? n : ''; } },
  { nombre: 'REDONDEAR', en: 'ROUND', min: 1, max: 2, fn: ([a, d]) => conNumero(a, (n) => { const k = 10 ** Math.min(6, Math.max(0, d === undefined ? 0 : NUM(d) || 0)); return Math.round(n * k) / k; }) },
  { nombre: 'IMPORTE', en: 'CURRENCY', min: 1, max: 1, fn: ([a]) => conNumero(a, (n) => `${fmtNumero(n, 2)} €`) },
  { nombre: 'FORMATO_NUMERO', en: 'FORMAT_NUMBER', min: 1, max: 2, fn: ([a, d]) => conNumero(a, (n) => fmtNumero(n, d === undefined ? 2 : Math.min(6, Math.max(0, NUM(d) || 0)))) },
  { nombre: 'LETRAS', en: 'IN_WORDS', min: 1, max: 1, fn: ([a]) => conNumero(a, numeroEnLetras) },
  { nombre: 'EUROS_LETRAS', en: 'EUROS_IN_WORDS', min: 1, max: 1, fn: ([a]) => conNumero(a, eurosEnLetras) },
  { nombre: 'PORCENTAJE', en: 'PERCENT', min: 2, max: 2, fn: ([a, p]) => conNumero(a, (n) => { const q = NUM(p); return Number.isFinite(q) ? (n * q) / 100 : ''; }) },
  { nombre: 'SUMA', en: 'SUM', min: 1, max: 50, fn: (r) => r.map(NUM).filter(Number.isFinite).reduce((x, y) => x + y, 0) },
  { nombre: 'MAXIMO', en: 'MAX', min: 1, max: 50, fn: (r) => { const n = r.map(NUM).filter(Number.isFinite); return n.length ? Math.max(...n) : ''; } },
  { nombre: 'MINIMO', en: 'MIN', min: 1, max: 50, fn: (r) => { const n = r.map(NUM).filter(Number.isFinite); return n.length ? Math.min(...n) : ''; } },
  // Fechas
  { nombre: 'HOY', en: 'TODAY', min: 0, max: 0, fn: () => fechaCortaDe(hoy()) },
  { nombre: 'FECHA_CORTA', en: 'SHORT_DATE', min: 1, max: 1, fn: ([a]) => conFecha(a, fechaCortaDe) },
  { nombre: 'FECHA_LARGA', en: 'LONG_DATE', min: 1, max: 1, fn: ([a]) => conFecha(a, fechaLargaDe) },
  { nombre: 'FECHA_LETRAS', en: 'DATE_IN_WORDS', min: 1, max: 1, fn: ([a]) => conFecha(a, fechaEnLetras) },
  { nombre: 'DIA', en: 'DAY', min: 1, max: 1, fn: ([a]) => conFecha(a, (f) => f.getUTCDate()) },
  { nombre: 'MES', en: 'MONTH', min: 1, max: 1, fn: ([a]) => conFecha(a, (f) => f.getUTCMonth() + 1) },
  { nombre: 'NOMBRE_MES', en: 'MONTH_NAME', min: 1, max: 1, fn: ([a]) => conFecha(a, (f) => MESES[f.getUTCMonth()]) },
  { nombre: 'AÑO', en: 'YEAR', min: 1, max: 1, fn: ([a]) => conFecha(a, (f) => String(f.getUTCFullYear())) },
  { nombre: 'DIA_SEMANA', en: 'WEEKDAY', min: 1, max: 1, fn: ([a]) => conFecha(a, (f) => DIAS_SEMANA[f.getUTCDay()]) },
  { nombre: 'SUMAR_DIAS', en: 'ADD_DAYS', min: 2, max: 2, fn: ([a, n]) => conFecha(a, (f) => fechaCortaDe(new Date(f.getTime() + Math.trunc(NUM(n) || 0) * 864e5))) },
  { nombre: 'SUMAR_DIAS_HABILES', en: 'ADD_WORKDAYS', min: 2, max: 2, fn: ([a, n]) => conFecha(a, (f) => {
      // Sin sábados ni domingos (no descuenta festivos ni agosto).
      let k = Math.min(3650, Math.abs(Math.trunc(NUM(n) || 0)));
      const paso = (NUM(n) || 0) < 0 ? -1 : 1;
      let d = f;
      while (k > 0) { d = new Date(d.getTime() + paso * 864e5); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) k--; }
      return fechaCortaDe(d);
    }) },
  { nombre: 'SUMAR_MESES', en: 'ADD_MONTHS', min: 2, max: 2, fn: ([a, n]) => conFecha(a, (f) => fechaCortaDe(sumarMeses(f, Math.trunc(NUM(n) || 0)))) },
  { nombre: 'SUMAR_AÑOS', en: 'ADD_YEARS', min: 2, max: 2, fn: ([a, n]) => conFecha(a, (f) => fechaCortaDe(sumarMeses(f, 12 * Math.trunc(NUM(n) || 0)))) },
  { nombre: 'DIAS_ENTRE', en: 'DAYS_BETWEEN', min: 2, max: 2, fn: ([a, b]) => { const x = aFecha(a), y = aFecha(b); return x && y ? Math.round((y.getTime() - x.getTime()) / 864e5) : ''; } },
  { nombre: 'EDAD', en: 'AGE', min: 1, max: 1, fn: ([a]) => conFecha(a, (f) => {
      const h = hoy();
      let e = h.getUTCFullYear() - f.getUTCFullYear();
      if (h.getUTCMonth() < f.getUTCMonth() || (h.getUTCMonth() === f.getUTCMonth() && h.getUTCDate() < f.getUTCDate())) e--;
      return e;
    }) },
];

const normNombreFn = (s: string) => sinTildes(s).toUpperCase().replace(/Ñ/g, 'N');
const FUNCIONES = new Map<string, DefFuncion>();
for (const f of LISTA_FUNCIONES) {
  FUNCIONES.set(normNombreFn(f.nombre), f);
  FUNCIONES.set(normNombreFn(f.en), f);
}
// Alias de Excel en castellano.
FUNCIONES.set('MAX', FUNCIONES.get('MAXIMO')!);
FUNCIONES.set('MIN', FUNCIONES.get('MINIMO')!);
FUNCIONES.set('ESBLANCO', FUNCIONES.get('VACIO')!);
FUNCIONES.set('SI_ERROR_VACIO', FUNCIONES.get('SI_VACIO')!);
FUNCIONES.set('CONCATENAR', { nombre: 'CONCATENAR', en: 'CONCAT', min: 1, max: 50, fn: (r) => r.map(TXT).join('') });
FUNCIONES.set('CONCAT', FUNCIONES.get('CONCATENAR')!);

/** Nombres de todas las funciones (castellano e inglés), para la ayuda y las pruebas. */
export const nombresFunciones = () => LISTA_FUNCIONES.map((f) => ({ nombre: f.nombre, en: f.en, min: f.min, max: f.max }));

// ── Análisis ────────────────────────────────────────────────────────────────

interface Token { k: 'num' | 'txt' | 'id' | 'var' | 'op' | 'fin'; v: string; pos: number }

const COMILLAS_ABRE = '"“”„';
const OPS = ['<>', '!=', '>=', '<=', '&', '+', '-', '*', '/', '=', '>', '<', '(', ')', ';', ','];

function tokens(src: string, base: number): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const pos = base + i;
    if (COMILLAS_ABRE.includes(c)) {
      let j = i + 1, v = '';
      for (;;) {
        if (j >= src.length) throw new ErrorFormula('Falta cerrar las comillas', pos);
        const d = src[j];
        if (d === '"' && src[j + 1] === '"') { v += '"'; j += 2; continue; }
        if (COMILLAS_ABRE.includes(d)) break;
        v += d; j++;
      }
      out.push({ k: 'txt', v, pos }); i = j + 1; continue;
    }
    if (c === '«') {
      const j = src.indexOf('»', i + 1);
      if (j < 0) throw new ErrorFormula('Falta cerrar el nombre con »', pos);
      const n = src.slice(i + 1, j).trim();
      if (!n) throw new ErrorFormula('Falta el nombre de la variable', pos);
      out.push({ k: 'var', v: n, pos }); i = j + 1; continue;
    }
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num && !/^[\p{L}_]/u.test(src.slice(i + num[0].length))) { out.push({ k: 'num', v: num[0], pos }); i += num[0].length; continue; }
    const id = /^[\p{L}\p{N}_ºª]+/u.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0], pos }); i += id[0].length; continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { out.push({ k: 'op', v: op, pos }); i += op.length; continue; }
    throw new ErrorFormula(`No se entiende «${c}»`, pos);
  }
  out.push({ k: 'fin', v: '', pos: base + src.length });
  return out;
}

class Analizador {
  i = 0;
  nodos = 0;
  constructor(private ts: Token[], private vars: Set<string>) {}
  ver() { return this.ts[this.i]; }
  tomar() { return this.ts[this.i++]; }
  es(v: string) { const t = this.ver(); return t.k === 'op' && t.v === v; }
  nodo<T extends Nodo>(n: T): T { if (++this.nodos > MAX_NODOS) throw new ErrorFormula('La fórmula es demasiado larga', this.ver().pos); return n; }

  expresion(): Nodo { return this.comparacion(); }
  comparacion(): Nodo {
    let a = this.union();
    while (['=', '<>', '!=', '>', '<', '>=', '<='].some((o) => this.es(o))) {
      const op = this.tomar().v;
      a = this.nodo({ t: 'op', op: op === '!=' ? '<>' : op, a, b: this.union() });
    }
    return a;
  }
  union(): Nodo {
    let a = this.suma();
    while (this.es('&')) { this.tomar(); a = this.nodo({ t: 'op', op: '&', a, b: this.suma() }); }
    return a;
  }
  suma(): Nodo {
    let a = this.producto();
    while (this.es('+') || this.es('-')) { const op = this.tomar().v; a = this.nodo({ t: 'op', op, a, b: this.producto() }); }
    return a;
  }
  producto(): Nodo {
    let a = this.unario();
    while (this.es('*') || this.es('/')) { const op = this.tomar().v; a = this.nodo({ t: 'op', op, a, b: this.unario() }); }
    return a;
  }
  unario(): Nodo {
    if (this.es('-')) { this.tomar(); return this.nodo({ t: 'neg', a: this.unario() }); }
    if (this.es('+')) { this.tomar(); return this.unario(); }
    return this.primario();
  }
  primario(): Nodo {
    const t = this.tomar();
    if (t.k === 'num') return this.nodo({ t: 'num', v: Number(t.v) });
    if (t.k === 'txt') return this.nodo({ t: 'txt', v: t.v });
    if (t.k === 'var') { this.vars.add(t.v); return this.nodo({ t: 'var', n: t.v }); }
    if (t.k === 'op' && t.v === '(') {
      const e = this.expresion();
      if (!this.es(')')) throw new ErrorFormula('Falta cerrar el paréntesis', this.ver().pos);
      this.tomar();
      return e;
    }
    if (t.k === 'id') {
      if (this.es('(')) {
        const f = FUNCIONES.get(normNombreFn(t.v));
        if (!f) throw new ErrorFormula(`No existe la función ${t.v}`, t.pos);
        this.tomar();
        const args: Nodo[] = [];
        if (!this.es(')')) {
          for (;;) {
            args.push(this.expresion());
            if (this.es(';') || this.es(',')) { this.tomar(); continue; }
            break;
          }
        }
        if (!this.es(')')) throw new ErrorFormula(`Falta cerrar el paréntesis de ${t.v}`, this.ver().pos);
        this.tomar();
        if (args.length < f.min || args.length > f.max) {
          throw new ErrorFormula(f.min === f.max
            ? `${t.v} lleva ${f.min} ${f.min === 1 ? 'dato' : 'datos'} y tiene ${args.length}`
            : `${t.v} lleva entre ${f.min} y ${f.max} datos y tiene ${args.length}`, t.pos);
        }
        return this.nodo({ t: 'fn', f, args });
      }
      const up = normNombreFn(t.v);
      if (['VERDADERO', 'TRUE', 'CIERTO'].includes(up)) return this.nodo({ t: 'bool', v: true });
      if (['FALSO', 'FALSE'].includes(up)) return this.nodo({ t: 'bool', v: false });
      this.vars.add(t.v);
      return this.nodo({ t: 'var', n: t.v });
    }
    if (t.k === 'fin') throw new ErrorFormula('La fórmula está incompleta', t.pos);
    throw new ErrorFormula(`No se esperaba «${t.v}»`, t.pos);
  }
}

export interface FormulaAnalizada { raiz: Nodo; variables: string[] }

/** Analiza el texto de una fórmula. Lanza ErrorFormula con la posición del fallo. */
export function analizarFormula(texto: string): FormulaAnalizada {
  const src = String(texto ?? '');
  if (src.length > MAX_FORMULA) throw new ErrorFormula(`La fórmula no puede pasar de ${MAX_FORMULA} caracteres`, MAX_FORMULA);
  const partes: Nodo[] = [];
  const vars = new Set<string>();
  let lit = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '{' && src[i + 1] === '{') { lit += '{'; i += 2; continue; }
    if (c === '}' && src[i + 1] === '}') { lit += '}'; i += 2; continue; }
    if (c === '}') throw new ErrorFormula('Sobra una llave «}» (para escribirla, pon «}}»)', i);
    if (c !== '{') { lit += c; i++; continue; }
    // Busca la "}" que cierra, sin contar las que van dentro de comillas o « ».
    let j = i + 1, en: string | null = null;
    for (; j < src.length; j++) {
      const d = src[j];
      if (en) { if ((en === '«' && d === '»') || (en !== '«' && COMILLAS_ABRE.includes(d))) en = null; continue; }
      if (d === '«' || COMILLAS_ABRE.includes(d)) { en = d; continue; }
      if (d === '{') throw new ErrorFormula('No se puede abrir una llave dentro de otra', j);
      if (d === '}') break;
    }
    if (j >= src.length) throw new ErrorFormula('Falta cerrar la llave «}»', i);
    if (lit) { partes.push({ t: 'txt', v: lit }); lit = ''; }
    const dentro = src.slice(i + 1, j);
    if (!dentro.trim()) throw new ErrorFormula('Llaves vacías: escribe dentro una variable o una función', i);
    const an = new Analizador(tokens(dentro, i + 1), vars);
    const e = an.expresion();
    if (an.ver().k !== 'fin') {
      const t = an.ver();
      throw new ErrorFormula(t.k === 'op' && (t.v === ';' || t.v === ',') ? 'Sobra un separador fuera de una función' : `No se esperaba «${t.v}»`, t.pos);
    }
    partes.push(e);
    i = j + 1;
  }
  if (lit) partes.push({ t: 'txt', v: lit });
  return { raiz: partes.length === 1 ? partes[0] : { t: 'cat', partes }, variables: [...vars] };
}

// Las fórmulas se analizan una vez y se reutilizan.
const cache = new Map<string, FormulaAnalizada | ErrorFormula>();
function analizadaCache(texto: string): FormulaAnalizada {
  let r = cache.get(texto);
  if (!r) {
    try { r = analizarFormula(texto); } catch (e: any) { r = e instanceof ErrorFormula ? e : new ErrorFormula(String(e?.message || e), 0); }
    if (cache.size > 500) cache.clear();
    cache.set(texto, r);
  }
  if (r instanceof ErrorFormula) throw r;
  return r;
}

// ── Evaluación ──────────────────────────────────────────────────────────────

/** Evalúa una fórmula. `valorDe` da el valor de cada variable ('' si no hay). */
export function evaluarFormula(texto: string, valorDe: (nombre: string) => string | undefined): string {
  const { raiz } = analizadaCache(texto);
  let pasos = 0;
  const ev = (n: Nodo): Valor => {
    if (++pasos > MAX_PASOS) throw new ErrorFormula('La fórmula hace demasiadas operaciones', 0);
    switch (n.t) {
      case 'txt': case 'num': case 'bool': return n.v;
      case 'var': return valorDe(n.n) ?? '';
      case 'neg': { const x = aNumero(ev(n.a)); return Number.isFinite(x) ? -x : ''; }
      case 'cat': {
        let s = '';
        for (const p of n.partes) { s += aTexto(ev(p)); if (s.length > MAX_SALIDA) break; }
        return s;
      }
      case 'fn': {
        const r = n.f.perezosa ? n.f.perezosa(n.args, ev) : n.f.fn!(n.args.map(ev));
        return typeof r === 'string' && r.length > MAX_SALIDA ? r.slice(0, MAX_SALIDA) : r;
      }
      case 'op': {
        const a = ev(n.a), b = ev(n.b);
        switch (n.op) {
          case '&': return (aTexto(a) + aTexto(b)).slice(0, MAX_SALIDA);
          case '=': return igualdad(a, b);
          case '<>': return !igualdad(a, b);
          case '>': case '<': case '>=': case '<=': {
            let x: number = aNumero(a), y: number = aNumero(b);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              const fa = aFecha(a), fb = aFecha(b);
              if (fa && fb) { x = fa.getTime(); y = fb.getTime(); } else {
                const c = comparable(aTexto(a)).localeCompare(comparable(aTexto(b)), 'es');
                x = c; y = 0;
              }
            }
            return n.op === '>' ? x > y : n.op === '<' ? x < y : n.op === '>=' ? x >= y : x <= y;
          }
          default: {
            const x = aNumero(a), y = aNumero(b);
            const x0 = Number.isFinite(x) ? x : (aTexto(a).trim() ? NaN : 0);
            const y0 = Number.isFinite(y) ? y : (aTexto(b).trim() ? NaN : 0);
            if (!Number.isFinite(x0) || !Number.isFinite(y0)) return '';
            const r = n.op === '+' ? x0 + y0 : n.op === '-' ? x0 - y0 : n.op === '*' ? x0 * y0 : y0 === 0 ? NaN : x0 / y0;
            return Number.isFinite(r) ? r : '';
          }
        }
      }
    }
  };
  return aTexto(ev(raiz)).slice(0, MAX_SALIDA);
}

/** ¿Lleva algo que calcular? (un texto sin llaves sale tal cual) */
export const esFormula = (texto: string | null | undefined) => /\{(?!\{)/.test(String(texto || '').replace(/\{\{/g, ''));
