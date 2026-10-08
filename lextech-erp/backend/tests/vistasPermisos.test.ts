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

// 07/10/2026: el mismo buzón vigilado en dos organizaciones (Avalentia y
// PRUEBA) mandaba dos avisos de cada vista a la misma persona.
test('un mismo correo en dos organizaciones: el aviso solo se manda una vez', { skip }, async () => {
  const { yaAvisados } = await import('../src/services/vistasAutomation');
  const org2 = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org vistas 2') RETURNING id`)).rows[0].id;
  const msgId = `msg-dup-${Date.now()}@x`;
  const ins = async (o: string, estado = 'pendiente') => (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, subject, message_id)
     VALUES ($1, uuid_generate_v4(), 'buzon', $2, 'VISTA 12/10/2026 autos 9/2026', $3) RETURNING id`, [o, estado, msgId])).rows[0].id;
  const a = await ins(org);
  const b = await ins(org2);
  assert.equal((await yaAvisados(a)).usuarios.size, 0, 'la primera organización avisa');
  assert.deepEqual([...(await yaAvisados(b)).usuarios], ['buzon'], 'la segunda ya no avisa al mismo usuario');
});

// 07/10/2026: cancelar una vista aceptada; después, otra vista con los mismos
// autos se puede aceptar como nueva.
test('cancelar una vista aceptada libera los autos', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const { findRelacion } = await import('../src/services/vistasAutomation');
  const ev = (await pool.query(`INSERT INTO agenda_events (user_id, title, start_at, organizacion_id) VALUES ('buzon','Vista', NOW() + interval '5 days', $1) RETURNING id`, [org])).rows[0].id;
  const rec = (await pool.query(`INSERT INTO agenda_events (user_id, title, start_at, organizacion_id) VALUES ('buzon','Preparar', NOW() + interval '4 days', $1) RETURNING id`, [org])).rows[0].id;
  // Expediente de la vista, para ver que la cancelación queda anotada en él.
  await pool.query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS expediente_id UUID`);
  const cli = (await pool.query(`INSERT INTO entities (type, first_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Cli vista',$2,$1) RETURNING id`, [org, 'V' + (Date.now() % 1e7)])).rows[0].id;
  const expId = (await pool.query(`INSERT INTO expedientes (anio, num_exp, descripcion, cliente_id, organizacion_id) VALUES (2026, $3, 'Exp vista', $2, $1) RETURNING id`, [org, cli, Date.now() % 100000])).rows[0].id;
  const aceptada = (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, datos, fecha_vista, agenda_event_id, recordatorio_event_id, recordatorio_at, pasos, expediente_id)
     VALUES ($1, uuid_generate_v4(), 'buzon', 'aceptada', 'vista', 'VISTA autos 777/2026', '{"num_autos":"777/2026","juzgado":"JPI 3 de Murcia"}', NOW() + interval '5 days', $2, $3, NOW() + interval '4 days', '[]', $4) RETURNING id`,
    [org, ev, rec, expId])).rows[0].id;
  const cambio = (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, datos, fecha_vista, relacion)
     VALUES ($1, uuid_generate_v4(), 'buzon', 'pendiente', 'cambio', 'VISTA nueva autos 777/2026', '{"num_autos":"777/2026"}', NOW() + interval '9 days', $2) RETURNING id`,
    [org, JSON.stringify({ autos: '777/2026', vista: { id: aceptada } })])).rows[0].id;

  assert.ok((await findRelacion(org, ['777/2026'], []))?.vista, 'antes de cancelar, los autos tienen vista');
  // Solo quien la ve puede cancelarla.
  assert.equal((await call(v.cancelarVista, 'otro', 'miembro', { params: { id: aceptada } })).status, 403);
  const r = await call(v.cancelarVista, 'buzon', 'miembro', { params: { id: aceptada }, body: { motivo: 'Suspendida', cerrar_expediente: true } });
  assert.equal(r.body.success, true, JSON.stringify(r.body));

  const s = (await pool.query(`SELECT estado, recordatorio_at FROM vistas_solicitudes WHERE id = $1`, [aceptada])).rows[0];
  assert.deepEqual([s.estado, s.recordatorio_at], ['cancelada', null]);
  // Vista y recordatorio quedan tachados (cancelados) en la agenda, no borrados.
  const { rows: eventos } = await pool.query(`SELECT status, title, description FROM agenda_events WHERE id = ANY($1::uuid[])`, [[ev, rec]]);
  assert.equal(eventos.length, 2);
  assert.ok(eventos.every((e: any) => e.status === 'cancelado' && e.title.startsWith('❌ CANCELADA') && /Suspendida/.test(e.description)));
  // Se pidió cerrar el expediente: queda cerrado, con fecha de cierre.
  const ex = (await pool.query('SELECT estado, fecha_cierre FROM expedientes WHERE id = $1', [expId])).rows[0];
  assert.equal(ex.estado, 'cerrado');
  assert.ok(ex.fecha_cierre);
  // Y anotado en el expediente.
  const { rows: notas } = await pool.query(`SELECT content FROM notes WHERE expediente_id = $1`, [expId]);
  assert.ok(notas.some((n: any) => /❌ Vista cancelada/.test(n.content) && /JPI 3 de Murcia/.test(n.content) && /Suspendida/.test(n.content)), JSON.stringify(notas));
  assert.equal((await findRelacion(org, ['777/2026'], []))?.vista ?? null, null, 'los autos quedan libres');
  const c = (await pool.query(`SELECT tipo, relacion FROM vistas_solicitudes WHERE id = $1`, [cambio])).rows[0];
  assert.equal(c.tipo, 'vista', 'el cambio pendiente pasa a vista nueva');
  assert.equal(c.relacion.vista, undefined);
  // No se puede cancelar dos veces.
  assert.equal((await call(v.cancelarVista, 'buzon', 'miembro', { params: { id: aceptada } })).status, 409);
  // Aparece en la pestaña Canceladas.
  const lista = await call(v.listVistas, 'buzon', 'miembro', { query: { estado: 'cancelada' } });
  assert.ok(lista.body.data.some((x: any) => x.id === aceptada));
});

// 08/10/2026: un correo que cancela la vista aceptada de esos autos.
test('aplicar la cancelación que llega por correo', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const ev = (await pool.query(`INSERT INTO agenda_events (user_id, title, start_at, organizacion_id) VALUES ('buzon','Vista', NOW() + interval '6 days', $1) RETURNING id`, [org])).rows[0].id;
  const vista = (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, datos, fecha_vista, agenda_event_id, pasos)
     VALUES ($1, uuid_generate_v4(), 'buzon', 'aceptada', 'vista', 'VISTA autos 888/2026', '{"num_autos":"888/2026"}', NOW() + interval '6 days', $2, '[]') RETURNING id`,
    [org, ev])).rows[0].id;
  const aviso = (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, datos, relacion)
     VALUES ($1, uuid_generate_v4(), 'buzon', 'pendiente', 'cancelacion', 'SUSPENSIÓN VISTA autos 888/2026', '{}', $2) RETURNING id`,
    [org, JSON.stringify({ autos: '888/2026', vista: { id: vista, fecha_vista: new Date(Date.now() + 6 * 86400000).toISOString() } })])).rows[0].id;

  // Una vista normal no se puede "aplicar como cancelación".
  assert.equal((await call(v.aplicarCancelacionVista, 'buzon', 'miembro', { params: { id: vista } })).status, 400);
  const r = await call(v.aplicarCancelacionVista, 'buzon', 'miembro', { params: { id: aviso }, body: {} });
  assert.equal(r.body.success, true, JSON.stringify(r.body));
  assert.equal((await pool.query(`SELECT estado FROM vistas_solicitudes WHERE id = $1`, [vista])).rows[0].estado, 'cancelada');
  assert.equal((await pool.query(`SELECT estado FROM vistas_solicitudes WHERE id = $1`, [aviso])).rows[0].estado, 'documentada');
  assert.equal((await pool.query(`SELECT status FROM agenda_events WHERE id = $1`, [ev])).rows[0].status, 'cancelado');
  // Y no se puede aplicar dos veces.
  assert.equal((await call(v.aplicarCancelacionVista, 'buzon', 'miembro', { params: { id: aviso }, body: {} })).status, 409);
});

// 08/10/2026: quedaba pendiente una "cancelación de la vista del 1 nov" después
// de moverla al 3 nov. Al modificar, lo que ya no corresponde queda superado.
test('al cambiar la fecha, las solicitudes pendientes que ya no corresponden quedan superadas', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const ev = (await pool.query(`INSERT INTO agenda_events (user_id, title, start_at, organizacion_id) VALUES ('buzon','Vista', '2027-11-01T09:00:00Z', $1) RETURNING id`, [org])).rows[0].id;
  const vista = (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, datos, fecha_vista, agenda_event_id, pasos, duracion_min)
     VALUES ($1, uuid_generate_v4(), 'buzon', 'aceptada', 'vista', 'VISTA autos 901/2027', '{"num_autos":"901/2027"}', '2027-11-01T09:00:00Z', $2, '[]', 60) RETURNING id`,
    [org, ev])).rows[0].id;
  const rel = JSON.stringify({ autos: '901/2027', vista: { id: vista, fecha_vista: '2027-11-01T09:00:00Z' } });
  const ins = async (tipo: string, datos: any, fecha: string | null) => (await pool.query(
    `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, datos, fecha_vista, relacion)
     VALUES ($1, uuid_generate_v4(), 'buzon', 'pendiente', $2, 'x autos 901/2027', $3, $4, $5) RETURNING id`,
    [org, tipo, JSON.stringify(datos), fecha, rel])).rows[0].id;
  const cancel1nov = await ins('cancelacion', { fecha_vista: '2027-11-01' }, '2027-11-01T09:00:00Z');
  const cambio = await ins('cambio', {}, null);
  const doc = await ins('documentacion', {}, null);

  const r = await call(v.modificarVista, 'buzon', 'miembro', { params: { id: cambio }, body: { fecha: '2027-11-03T09:00:00Z' } });
  assert.equal(r.body.success, true, JSON.stringify(r.body));
  const estado = async (id: string) => (await pool.query(`SELECT estado, error, relacion FROM vistas_solicitudes WHERE id = $1`, [id])).rows[0];
  const c = await estado(cancel1nov);
  assert.equal(c.estado, 'descartada', 'la cancelación del 1 nov ya no corresponde');
  assert.match(c.error, /Superada/);
  const d = await estado(doc);
  assert.equal(d.estado, 'pendiente', 'la documentación sigue pendiente');
  assert.equal(new Date(d.relacion.vista.fecha_vista).toISOString(), '2027-11-03T09:00:00.000Z', 'con la fecha actual de la vista');
  // getVista avisa de la fecha actual.
  const det = await call(v.getVista, 'buzon', 'miembro', { params: { id: cancel1nov } });
  assert.equal(new Date(det.body.data.vistaActual.fecha_vista).toISOString(), '2027-11-03T09:00:00.000Z');
});
