// La IA no sabe qué día es: sin esto se inventa fechas («23 de octubre de 2023»)
// y calcula mal «mañana» o «el jueves» al crear tareas y citas. 17/11/2026.

const ZONA = 'Europe/Madrid';

/** «lunes, 16 de noviembre de 2026», en hora de Madrid. */
export function fechaDeHoy(d = new Date()): string {
  return d.toLocaleDateString('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Línea para el prompt de cualquier IA de Vantia. */
export function lineaFechaIA(d = new Date()): string {
  const iso = d.toLocaleDateString('sv-SE', { timeZone: ZONA }); // AAAA-MM-DD
  const hora = d.toLocaleTimeString('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
  return `FECHA Y HORA ACTUAL (España peninsular): ${fechaDeHoy(d)}, ${hora} (${iso}). Úsala para «hoy», «mañana», «el jueves»… y cuando un texto lleve fecha; no inventes otra.`;
}
