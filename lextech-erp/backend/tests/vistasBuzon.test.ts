// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// 09/10/2026: al activar la automatización de vistas en una organización se
// pregunta SIEMPRE qué correo revisar (antes se cogía solo el primero del
// usuario), y cada opción dice si ese correo ya lo revisa otra organización.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}
process.env.VISTAS_IDLE_DISABLED = '1';

let pool: any;
let orgA: string;
let orgB: string;
let accA: string;
let accB: string;

function call(handler: any, userId: string, org: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, organizacionRol: 'propietario', ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Despacho A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Despacho B') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'jefa_buzon','propietario'),($2,'jefa_buzon','propietario')`, [orgA, orgB]);
  const cuenta = async (org: string, email: string) => (await pool.query(
    `INSERT INTO email_accounts (user_id, label, email, imap_host, smtp_host, username, password_enc, organizacion_id)
     VALUES ('jefa_buzon', $2, $2, 'h', 'h', 'u', 'p', $1) RETURNING id`, [org, email])).rows[0].id;
  accA = await cuenta(orgA, 'vistas@despacho.es');
  accB = await cuenta(orgB, 'vistas@despacho.es');
});

after(async () => { if (pool) await pool.end(); });

test('activar sin elegir correo no vale; eligiéndolo, sí', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const sin = await call(v.updateVistasConfig, 'jefa_buzon', orgA, { body: { enabled: true } });
  assert.equal(sin.status, 400);
  assert.match(sin.body.error, /Elige qué correo/);
  assert.equal((await pool.query(`SELECT vistas_auto_enabled FROM organizaciones WHERE id = $1`, [orgA])).rows[0].vistas_auto_enabled, false);

  const con = await call(v.updateVistasConfig, 'jefa_buzon', orgA, { body: { enabled: true, config: { mailbox: { type: 'imap', id: accA } } } });
  assert.equal(con.status, 200, JSON.stringify(con.body));
  assert.equal(con.body.data.enabled, true);
  assert.equal(con.body.data.mailboxId, accA);
  assert.equal(con.body.data.organizacionNombre, 'Despacho A');

  // Ya activada: guardar otras cosas no vuelve a pedir el correo.
  const otra = await call(v.updateVistasConfig, 'jefa_buzon', orgA, { body: { enabled: true, config: { plantillaAceptar: 'Aceptada.' } } });
  assert.equal(otra.status, 200, JSON.stringify(otra.body));
  assert.equal(otra.body.data.mailboxId, accA);
});

test('al elegir, se avisa de que ese correo ya lo revisa otra organización', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const cfgB = await call(v.getVistasConfig, 'jefa_buzon', orgB);
  const opcion = cfgB.body.data.mailboxOptions.find((o: any) => o.id === accB);
  assert.deepEqual(opcion.vigiladoPor, ['Despacho A']);
  // Desde A, su propio buzón no sale como "vigilado por otra".
  const cfgA = await call(v.getVistasConfig, 'jefa_buzon', orgA);
  assert.deepEqual(cfgA.body.data.mailboxOptions.find((o: any) => o.id === accA).vigiladoPor, []);
});

test('no se puede elegir un buzón de otra organización', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const r = await call(v.updateVistasConfig, 'jefa_buzon', orgB, { body: { enabled: true, config: { mailbox: { type: 'imap', id: accA } } } });
  assert.equal(r.status, 400);
});
