// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Estudio de avisos (13/10/2026), fase 1 -- seguridad:
//  · los push de organización van solo a quien puede ver ese módulo (no a
//    soporte ni a quien tenga el módulo quitado), y ya no existe "a todos";
//  · enviar correo solo con cuentas de la organización activa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
let orgA: string;
let orgB: string;
let cuentaA: string;

function call(handler: any, userId: string, org: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Avisos A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Avisos B') RETURNING id`)).rows[0].id;
  await pool.query(
    `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES
       ($1,'av_jefa','propietario'),($1,'av_abogado','miembro'),($1,'av_soporte','soporte'),($1,'av_sin_wa','miembro'),
       ($2,'av_jefa','propietario'),($2,'av_otro','miembro')`,
    [orgA, orgB],
  );
  // A este miembro se le ha quitado Comunicación externa.
  await pool.query(
    `INSERT INTO organizacion_miembro_permisos (organizacion_id, user_id, modulo, nivel) VALUES ($1,'av_sin_wa','whatsapp','ninguno')`,
    [orgA],
  );
  cuentaA = (await pool.query(
    `INSERT INTO email_accounts (user_id, label, email, imap_host, smtp_host, username, password_enc, organizacion_id)
     VALUES ('av_jefa','A','jefa@a.es','h','h','u','p',$1) RETURNING id`, [orgA])).rows[0].id;
});

after(async () => { if (pool) await pool.end(); });

test('push de organización: solo quien puede ver el módulo', { skip }, async () => {
  const { miembrosConAcceso } = await import('../src/utils/webPush');
  const wa = (await miembrosConAcceso(orgA, 'whatsapp')).sort();
  assert.deepEqual(wa, ['av_abogado', 'av_jefa'], 'ni soporte ni quien tiene WhatsApp quitado');
  const exp = (await miembrosConAcceso(orgA, 'expedientes')).sort();
  assert.deepEqual(exp, ['av_abogado', 'av_jefa', 'av_sin_wa'], 'soporte no ve expedientes');
  assert.ok(!(await miembrosConAcceso(orgA, 'expedientes')).includes('av_otro'), 'nadie de otra organización');
});

test('ya no existe el envío push "a todos"', { skip }, async () => {
  const push: any = await import('../src/utils/webPush');
  assert.equal(push.sendPushToAll, undefined);
  assert.equal(push.sendPushToOrg, undefined);
});

test('enviar correo: solo con cuentas de la organización activa', { skip }, async () => {
  const { sendMail } = await import('../src/controllers/emailController');
  const body = { to: 'x@y.es', subject: 'Hola', html: '<p>Hola</p>' };
  // En B no tiene cuentas: antes cogía la de A sin decir nada.
  const sinCuenta = await call(sendMail, 'av_jefa', orgB, { body });
  assert.equal(sinCuenta.status, 400, JSON.stringify(sinCuenta.body));
  // Y pedir expresamente la cuenta de A estando en B tampoco vale.
  const ajena = await call(sendMail, 'av_jefa', orgB, { body: { ...body, account_id: cuentaA } });
  assert.equal(ajena.status, 404, JSON.stringify(ajena.body));
});
