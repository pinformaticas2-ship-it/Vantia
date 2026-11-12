// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Avisos en el idioma de cada persona (12/11/2026): con la app en inglés, las
// partes fijas de los avisos push y por correo llegan en inglés; lo que
// escribe la gente (mensajes, asuntos, nombres) no se toca.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { traducirAviso } from '../src/utils/idiomaAviso';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

test('partes fijas traducidas, contenido intacto', () => {
  assert.equal(traducirAviso('Aviso de prueba'), 'Test notification');
  assert.equal(traducirAviso('3 correos nuevos'), '3 new emails');
  assert.equal(traducirAviso('Ana, Luis, Eva y 2 más'), 'Ana, Luis, Eva and 2 more');
  assert.equal(traducirAviso('Vence en 3 días · Juan Pérez'), 'Due in 3 days · Juan Pérez');
  assert.equal(traducirAviso('Vencida hace 1 día · Exp. 2026/14'), 'Overdue by 1 day · Case 2026/14');
  assert.equal(traducirAviso('Ha pasado a «Propuesta». Siguiente: llamar.'), 'Moved to «Propuesta». Next: llamar.');
  assert.equal(traducirAviso('✅ Vista aceptada por Ana'), '✅ Hearing accepted by Ana');
  assert.equal(traducirAviso('#canal (hilo)'), '#channel (thread)');
  assert.equal(traducirAviso('lunes, 3 de noviembre de 2026, 10:00 · Juzgado nº 3'), 'Monday, 3 November 2026, 10:00 · Juzgado nº 3');
  assert.equal(traducirAviso('Hola, ¿vienes mañana a la reunión?'), 'Hola, ¿vienes mañana a la reunión?', 'el texto de la gente no se toca');
  assert.equal(traducirAviso(''), '');
});

let pool: any;
before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  await pool.query(`INSERT INTO user_preferences (user_id, theme, extras) VALUES ('idi_en', 'rojo', '{"idioma":"en"}'), ('idi_es', 'rojo', '{"idioma":"es"}') ON CONFLICT (user_id) DO UPDATE SET extras = EXCLUDED.extras`);
});
after(async () => { if (pool) await pool.end(); });

test('el idioma de cada persona sale de sus preferencias (por defecto, español)', { skip }, async () => {
  const { idiomasDe } = await import('../src/utils/idiomaAviso');
  const m = await idiomasDe(['idi_en', 'idi_es', 'idi_nadie']);
  assert.equal(m.get('idi_en'), 'en');
  assert.equal(m.get('idi_es'), 'es');
  assert.equal(m.get('idi_nadie'), 'es');
});
