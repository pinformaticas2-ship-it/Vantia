// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Turnos de los procesos de fondo (19/10/2026, utils/turnos.ts): sustituyen a
// pg_try_advisory_lock para no retener una conexión del pool durante la pasada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
});
after(async () => { if (pool) await pool.end(); });

test('turnos: uno a la vez, se renueva, se suelta y caduca solo', { skip }, async () => {
  const t = await import('../src/utils/turnos');
  const nombre = `prueba-${Date.now()}`;
  assert.equal(await t.tomarTurno(nombre, 60_000), true, 'libre: se toma');
  assert.equal(await t.tomarTurno(nombre, 60_000), true, 'la misma instancia lo renueva');

  // Otra instancia lo tiene y sigue vigente: no se puede tomar
  await pool.query(`UPDATE tareas_turnos SET dueno = 'otra-instancia', hasta = NOW() + INTERVAL '1 minute' WHERE nombre = $1`, [nombre]);
  assert.equal(await t.tomarTurno(nombre, 60_000), false, 'lo tiene otra instancia');
  await t.soltarTurno(nombre);
  assert.equal(await t.tomarTurno(nombre, 60_000), false, 'no se puede soltar el turno de otra');

  // Caducado (la otra instancia murió): se toma
  await pool.query(`UPDATE tareas_turnos SET hasta = NOW() - INTERVAL '1 second' WHERE nombre = $1`, [nombre]);
  assert.equal(await t.tomarTurno(nombre, 60_000), true, 'caducado: se toma');

  // Soltado: libre para la siguiente pasada
  await t.soltarTurno(nombre);
  const { rows } = await pool.query(`SELECT hasta <= NOW() AS libre FROM tareas_turnos WHERE nombre = $1`, [nombre]);
  assert.equal(rows[0].libre, true);
  // (el precalentamiento del pool en local puede ir aún por medio un instante)
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(pool.totalCount - pool.idleCount, 0, 'no se queda ninguna conexión ocupada');
});
