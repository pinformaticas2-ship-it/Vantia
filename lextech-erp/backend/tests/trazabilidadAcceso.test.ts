// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Quién ve qué en Trazabilidad (14/10/2026):
//  · propietario/admin: todo;
//  · soporte: técnica (sesiones y tipos de acción, sin datos de clientes),
//    o completa si el propietario/admin le da acceso temporal;
//  · el resto: solo lo suyo.
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
let cliente: string;
const ROL: Record<string, string> = { tz_jefa: 'propietario', tz_abogado: 'miembro', tz_soporte: 'soporte', tz_otro: 'miembro' };

function call(handler: any, userId: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, organizacionRol: ROL[userId], ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Traz acceso') RETURNING id`)).rows[0].id;
  for (const [u, r] of Object.entries(ROL)) {
    await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,$2,$3)`, [org, u, r]);
  }
  cliente = (await pool.query(`INSERT INTO entities (type, first_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Juan Pérez',$2,$1) RETURNING id`, [org, 'TZ' + (Date.now() % 1e7)])).rows[0].id;
  await pool.query(
    `INSERT INTO activity_log (user_id, user_name, action_type, entity_type, entity_id, entity_name, event_type, ip_address, device_id, organizacion_id) VALUES
       ('tz_abogado','Abogado','Inicio de sesión',NULL,NULL,NULL,'LOGIN','81.0.0.1','dev-1',$1),
       ('tz_abogado','Abogado','Correo enviado: Divorcio de Juan Pérez','EMAIL',uuid_generate_v4(),'juan@cliente.es','ACTION','81.0.0.1','dev-1',$1),
       ('tz_abogado','Abogado','Cliente modificado: Juan Pérez','CLIENT',$2,'Juan Pérez','UPDATE','81.0.0.1','dev-1',$1),
       ('tz_otro','Otro','Inicio de sesión',NULL,NULL,NULL,'LOGIN','82.0.0.2','dev-2',$1)`,
    [org, cliente],
  );
});

after(async () => { if (pool) await pool.end(); });

test('un miembro solo ve su propia actividad', { skip }, async () => {
  const a = await import('../src/controllers/activityController');
  assert.equal((await call(a.getNivelTrazabilidad, 'tz_otro')).body.data.nivel, 'propia');
  const users = await call(a.getActivityByUsers, 'tz_otro');
  assert.deepEqual(users.body.data.map((u: any) => u.user_id), ['tz_otro']);
  assert.equal((await call(a.getUserActivity, 'tz_otro', { params: { userId: 'tz_abogado' } })).status, 403);
  assert.equal((await call(a.getUserActivity, 'tz_otro', { params: { userId: 'tz_otro' } })).status, 200);
  const todo = await call(a.getActivity, 'tz_otro');
  assert.ok(todo.body.data.every((r: any) => r.user_id === 'tz_otro'));
});

test('soporte ve lo técnico de todos, sin datos de clientes', { skip }, async () => {
  const a = await import('../src/controllers/activityController');
  assert.equal((await call(a.getNivelTrazabilidad, 'tz_soporte')).body.data.nivel, 'tecnica');
  assert.equal((await call(a.getActivityByUsers, 'tz_soporte')).body.data.length, 2, 've a todos');
  const r = await call(a.getUserActivity, 'tz_soporte', { params: { userId: 'tz_abogado' } });
  const json = JSON.stringify(r.body.data);
  assert.ok(!json.includes('Juan') && !json.includes('Divorcio') && !json.includes('juan@cliente.es'), json);
  const acciones = r.body.data.map((x: any) => x.action_type).sort();
  assert.deepEqual(acciones, ['Acción · correo', 'Inicio de sesión', 'Modificación · cliente']);
  assert.ok(r.body.data.every((x: any) => x.ip_address === '81.0.0.1'), 'la IP sí (es técnica)');
  // El historial de la ficha de un cliente es de Clientes: soporte no lo ve.
  assert.equal((await call(a.getClientActivity, 'tz_soporte', { params: { clientId: cliente } })).status, 403);
});

test('acceso temporal: solo lo da propietario/admin, solo a soporte, y se puede retirar', { skip }, async () => {
  const a = await import('../src/controllers/activityController');
  assert.equal((await call(a.concederAccesoTemporal, 'tz_abogado', { body: { user_id: 'tz_soporte', horas: 24 } })).status, 403);
  assert.equal((await call(a.concederAccesoTemporal, 'tz_jefa', { body: { user_id: 'tz_otro', horas: 24 } })).status, 400, 'solo a soporte');
  assert.equal((await call(a.concederAccesoTemporal, 'tz_jefa', { body: { user_id: 'tz_soporte', horas: 500 } })).status, 400, 'máximo 72 h');
  const ok = await call(a.concederAccesoTemporal, 'tz_jefa', { body: { user_id: 'tz_soporte', horas: 24 } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));

  const nivel = (await call(a.getNivelTrazabilidad, 'tz_soporte')).body.data;
  assert.equal(nivel.nivel, 'completa');
  assert.ok(nivel.hasta);
  const r = await call(a.getUserActivity, 'tz_soporte', { params: { userId: 'tz_abogado' } });
  assert.ok(JSON.stringify(r.body.data).includes('Divorcio de Juan Pérez'), 'con acceso completo ve el detalle');
  const lista = await call(a.getAccesosTemporales, 'tz_jefa');
  assert.ok(lista.body.data.find((p: any) => p.user_id === 'tz_soporte').hasta);
  // Queda registrado.
  const { rows } = await pool.query(`SELECT 1 FROM activity_log WHERE organizacion_id = $1 AND action_type LIKE 'Acceso completo a la trazabilidad concedido%'`, [org]);
  assert.equal(rows.length, 1);

  await call(a.revocarAccesoTemporal, 'tz_jefa', { params: { userId: 'tz_soporte' } });
  assert.equal((await call(a.getNivelTrazabilidad, 'tz_soporte')).body.data.nivel, 'tecnica');
});

test('ficha del cliente: quien ve Clientes ve el historial, la IP solo con nivel completo', { skip }, async () => {
  const a = await import('../src/controllers/activityController');
  const miembro = await call(a.getClientActivity, 'tz_otro', { params: { clientId: cliente } });
  assert.equal(miembro.status, 200);
  assert.ok(miembro.body.data.length >= 1);
  assert.ok(miembro.body.data.every((r: any) => r.ip_address === null && r.device_id === null));
  const jefa = await call(a.getClientActivity, 'tz_jefa', { params: { clientId: cliente } });
  assert.ok(jefa.body.data.some((r: any) => r.ip_address === '81.0.0.1'));
});
