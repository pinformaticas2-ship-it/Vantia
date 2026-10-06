// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Permisos de las vistas (06/10/2026): solo el dueño del buzón vigilado y el
// abogado responsable ven las vistas; propietario/admin configuran pero no
// leen los correos; soporte no ve nada.
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
let solId: string;

function call(handler: any, userId: string, rol: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, organizacionRol: rol, ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre, vistas_auto_enabled) VALUES ('Org vistas', true) RETURNING id`)).rows[0].id;
  await pool.query(
    `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'jefe','propietario'),($1,'admin1','admin'),($1,'buzon','miembro'),($1,'sop','soporte'),($1,'otro','miembro')`,
    [org],
  );
  solId = (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, subject) VALUES ($1, uuid_generate_v4(), 'buzon', 'pendiente', 'VISTA autos 1/2026') RETURNING id`,
    [org],
  )).rows[0].id;
});

after(async () => { if (pool) await pool.end(); });

test('solo el dueño del buzón (o el responsable) ve las vistas', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const ve = async (user: string, rol: string) => {
    const list = await call(v.listVistas, user, rol, { query: { estado: 'pendiente' } });
    const avisos = await call(v.getVistasAvisos, user, rol);
    const det = await call(v.getVista, user, rol, { params: { id: solId } });
    return { list: list.body.data.length, avisos: avisos.body.data.length, detalle: det.status };
  };
  assert.deepEqual(await ve('buzon', 'miembro'), { list: 1, avisos: 1, detalle: 200 }, 'dueño del buzón');
  assert.deepEqual(await ve('jefe', 'propietario'), { list: 0, avisos: 0, detalle: 403 }, 'propietario');
  assert.deepEqual(await ve('admin1', 'admin'), { list: 0, avisos: 0, detalle: 403 }, 'administrador');
  assert.deepEqual(await ve('sop', 'soporte'), { list: 0, avisos: 0, detalle: 403 }, 'soporte');
  assert.deepEqual(await ve('otro', 'miembro'), { list: 0, avisos: 0, detalle: 403 }, 'otro miembro');

  // Al asignarla a un abogado, él también la ve.
  await pool.query(`UPDATE vistas_solicitudes SET responsable_user_id = 'otro' WHERE id = $1`, [solId]);
  assert.equal((await ve('otro', 'miembro')).detalle, 200, 'abogado responsable');

  // Las pestañas por estado concreto funcionan (antes faltaba el $ del parámetro).
  const rech = await call(v.listVistas, 'buzon', 'miembro', { query: { estado: 'rechazada' } });
  assert.equal(rech.body.success, true, JSON.stringify(rech.body));
});

test('la configuración solo la ven y cambian propietario/admin', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const cfgMiembro = await call(v.getVistasConfig, 'buzon', 'miembro');
  assert.equal(cfgMiembro.body.data.config, undefined, 'un miembro no recibe la configuración');
  assert.equal(cfgMiembro.body.data.canSee, false, 'sin buzón configurado aún nadie es dueño');
  const cfgJefe = await call(v.getVistasConfig, 'jefe', 'propietario');
  assert.ok(cfgJefe.body.data.config, 'el propietario recibe la configuración');
  assert.equal((await call(v.previewVistasConfigCorreo, 'buzon', 'miembro')).status, 403);
  assert.equal((await call(v.updateVistasConfig, 'buzon', 'miembro', { body: { enabled: false } })).status, 403);
});
