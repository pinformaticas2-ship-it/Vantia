// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Tarjeta de persona en el chat (16/11/2026): cargo y teléfono de Mi perfil,
// solo entre miembros del mismo despacho.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) { process.env.DATABASE_URL = TEST_DB; process.env.PGSSL = process.env.PGSSL || 'false'; }

let pool: any; let orgA: string; let orgB: string;
const llamar = (h: any, userId: string, org: string, params: any) => new Promise<{ status: number; body: any }>((resolve) => {
  let status = 200;
  const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
  Promise.resolve(h({ auth: { userId }, organizacionId: org, params, query: {}, body: {} }, res));
});

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Perfil A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Perfil B') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'pf_ana','propietario'),($1,'pf_luis','miembro'),($2,'pf_eva','miembro')`, [orgA, orgB]);
  await pool.query(`INSERT INTO user_preferences (user_id, theme, extras) VALUES ('pf_luis','rojo','{"cargo":"Procurador","telefono":"+34 600 11 22 33"}') ON CONFLICT (user_id) DO UPDATE SET extras = EXCLUDED.extras`);
});
after(async () => { if (pool) await pool.end(); });

test('se ve el cargo y el teléfono de un compañero; de otro despacho, no', { skip }, async () => {
  const { getPerfilPersona } = await import('../src/controllers/chatController');
  const r = await llamar(getPerfilPersona, 'pf_ana', orgA, { userId: 'pf_luis' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.cargo, 'Procurador');
  assert.equal(r.body.data.telefono, '+34 600 11 22 33');
  assert.equal(r.body.data.rol, 'miembro');
  const ajena = await llamar(getPerfilPersona, 'pf_ana', orgA, { userId: 'pf_eva' });
  assert.equal(ajena.status, 404, 'alguien de otro despacho no se puede consultar');
});
