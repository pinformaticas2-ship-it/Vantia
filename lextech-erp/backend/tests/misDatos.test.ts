// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Ajustes → Mis datos y privacidad (16/10/2026): descargar lo que Vantia
// guarda de cada persona y eliminar la cuenta (sin dejar despachos sin dueño).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
let org: string;
const borradosEnClerk: string[] = [];

function call(handler: any, userId: string, extra: any = {}): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    let status = 200;
    const headers: Record<string, string> = {};
    const res: any = {
      status(s: number) { status = s; return res; },
      setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
      json(b: any) { resolve({ status, body: b, headers }); return res; },
      send(b: any) { resolve({ status, body: JSON.parse(b), headers }); return res; },
    };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  // Clerk de mentira: ni perfil ni borrado real.
  const act = await import('../src/controllers/activityController');
  const clerk = act.getClerk();
  (clerk.users as any).getUser = async () => { throw new Error('sin Clerk en tests'); };
  (clerk.users as any).deleteUser = async (id: string) => { borradosEnClerk.push(id); };
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Mis datos') RETURNING id`)).rows[0].id;
  await pool.query(
    `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'md_jefa','propietario'),($1,'md_ana','miembro'),($1,'md_luis','miembro')`,
    [org],
  );
  await pool.query(`INSERT INTO aviso_preferencias (user_id, prefs) VALUES ('md_ana', '{}'), ('md_luis', '{}')`);
  await pool.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ('md_ana', 'https://push.test/md_ana', 'k', 'a')`);
});

after(async () => { if (pool) await pool.end(); });

test('descargar mis datos: solo lo mío, sin claves', { skip }, async () => {
  const c = await import('../src/controllers/privacidadController');
  const r = await call(c.exportarMisDatos, 'md_ana');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /vantia-mis-datos-/);
  assert.equal(r.body.perfil.id, 'md_ana');
  assert.deepEqual(r.body.datos.organizacion_miembros.map((m: any) => m.user_id), ['md_ana']);
  assert.ok(r.body.datos.aviso_preferencias, 'sus preferencias de avisos');
  assert.equal(r.body.datos.push_subscriptions[0].auth, undefined, 'sin las claves de la suscripción');
  assert.ok(!JSON.stringify(r.body).includes('md_luis'), 'nada de otra persona');
});

test('eliminar mi cuenta: pide confirmación y el propietario no puede', { skip }, async () => {
  const c = await import('../src/controllers/privacidadController');
  assert.equal((await call(c.eliminarMiCuenta, 'md_ana', { body: { confirmacion: 'si' } })).status, 400);
  const jefa = await call(c.eliminarMiCuenta, 'md_jefa', { body: { confirmacion: 'ELIMINAR' } });
  assert.equal(jefa.status, 409);
  assert.match(jefa.body.error, /Mis datos/);
  assert.deepEqual(borradosEnClerk, []);
});

test('eliminar mi cuenta: se borra en Clerk y sale de sus despachos', { skip }, async () => {
  const c = await import('../src/controllers/privacidadController');
  const r = await call(c.eliminarMiCuenta, 'md_ana', { body: { confirmacion: 'eliminar' } });
  assert.equal(r.status, 200);
  assert.deepEqual(borradosEnClerk, ['md_ana']);
  const quedan = async (sql: string) => (await pool.query(sql, ['md_ana'])).rows.length;
  assert.equal(await quedan(`SELECT 1 FROM organizacion_miembros WHERE user_id = $1`), 0);
  assert.equal(await quedan(`SELECT 1 FROM push_subscriptions WHERE user_id = $1`), 0);
  assert.equal(await quedan(`SELECT 1 FROM aviso_preferencias WHERE user_id = $1`), 0);
  assert.equal((await pool.query(`SELECT 1 FROM organizacion_miembros WHERE user_id = 'md_luis'`)).rows.length, 1, 'los demás, igual');
});
