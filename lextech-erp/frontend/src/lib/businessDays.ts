// ── Cómputo de días hábiles (ayuda para calcular plazos procesales) ────────────
// AVISO: esto es una AYUDA para estimar una fecha, no un cómputo procesal
// oficial. Excluye fines de semana y festivos nacionales de España (fijos +
// Viernes Santo, que se calcula), pero NO conoce festivos autonómicos ni
// locales, y "excluir agosto" es opcional porque no aplica igual a todos los
// procedimientos (la inhabilidad de agosto de la LEC tiene excepciones). El
// resultado siempre debe verificarse contra el calendario oficial del órgano
// judicial correspondiente antes de darlo por bueno.

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Domingo de Pascua vía el algoritmo de Meeus/Jones/Butcher (calendario gregoriano).
function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzo, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Festivos nacionales de España (fijos + Viernes Santo) para un año dado, como claves ISO "YYYY-MM-DD". */
export function getSpanishNationalHolidays(year: number): Set<string> {
  const fixed = [
    [0, 1],   // Año Nuevo
    [0, 6],   // Reyes
    [4, 1],   // Día del Trabajo
    [7, 15],  // Asunción de la Virgen
    [9, 12],  // Fiesta Nacional de España
    [10, 1],  // Todos los Santos
    [11, 6],  // Día de la Constitución
    [11, 8],  // Inmaculada Concepción
    [11, 25], // Navidad
  ];
  const holidays = new Set(fixed.map(([m, d]) => isoDate(new Date(year, m, d))));
  const easter = computeEasterSunday(year);
  const viernesSanto = new Date(easter);
  viernesSanto.setDate(easter.getDate() - 2);
  holidays.add(isoDate(viernesSanto));
  return holidays;
}

export function isBusinessDay(date: Date, opts: { excludeAugust?: boolean; extraHolidays?: Set<string> } = {}): boolean {
  const dow = date.getDay(); // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return false;
  if (opts.excludeAugust && date.getMonth() === 7) return false;
  const key = isoDate(date);
  const holidays = getSpanishNationalHolidays(date.getFullYear());
  if (holidays.has(key)) return false;
  if (opts.extraHolidays?.has(key)) return false;
  return true;
}

/** Suma `count` días hábiles a partir de `start` (sin contar `start` en sí). */
export function addBusinessDays(start: Date, count: number, opts: { excludeAugust?: boolean; extraHolidays?: Set<string> } = {}): Date {
  const result = new Date(start);
  let remaining = Math.abs(Math.round(count));
  const step = count >= 0 ? 1 : -1;
  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    if (isBusinessDay(result, opts)) remaining--;
  }
  return result;
}

export { isoDate as businessDaysIsoDate };
