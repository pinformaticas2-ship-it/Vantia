// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Aislamiento entre organizaciones de todo lo que pinta el dashboard (widgets)
// y la Trazabilidad. Regresión del 05/10/2026: el widget de facturación
// mostraba facturas de Quipu de otra organización, y Trazabilidad/correo/
// programados de WhatsApp mezclaban datos de todas. Cada endpoint se llama
// desde la organización B y NO debe devolver nada sembrado en la A.
//
// Necesita una base de datos DESECHABLE: borra y crea datos. Sin
// TEST_DATABASE_URL la prueba se salta (nunca usa DATABASE_URL de producción).
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
const MARK = 'SECRETO_ORG_A';

// Llama a un handler de Express con una petición falsa de la organización indicada.
function call(handler: any, organizacionId: string, extra: any = {}): Promise<any> {
  return new Promise((resolve) => {
    const res: any = { status() { return res; }, json(b: any) { resolve(b); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId: 'u1' }, organizacionId, organizacionRol: 'propietario', ...extra }, res));
  });
}
const leaks = (payload: any) => JSON.stringify(payload).includes(MARK);

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org B') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'u1','propietario'),($2,'u1','propietario')`, [orgA, orgB]);

  // Datos de la organización A, todos con la marca.
  const cli = (await pool.query(`INSERT INTO entities (type, first_name, nif_cif, organizacion_id) VALUES ('CLIENTE','${MARK}','X-${Date.now()}',$1) RETURNING id`, [orgA])).rows[0].id;
  const exp = (await pool.query(`INSERT INTO expedientes (anio, num_exp, descripcion, cliente_id, organizacion_id) VALUES (2026, 9001, '${MARK}', $1, $2) RETURNING id`, [cli, orgA])).rows[0].id;
  await pool.query(`INSERT INTO agenda_events (user_id, title, start_at, organizacion_id) VALUES ('u1','${MARK}', NOW() + interval '1 day', $1)`, [orgA]);
  await pool.query(`INSERT INTO client_tasks (titulo, user_id, organizacion_id, plazo) VALUES ('${MARK}','u1',$1, CURRENT_DATE)`, [orgA]).catch(() => {});
  await pool.query(`INSERT INTO facturacion_facturas (user_id, num, contacto, fecha, total, organizacion_id) VALUES ('u1','${MARK}','${MARK}', CURRENT_DATE, 123, $1)`, [orgA]).catch(() => {});
  const acc = (await pool.query(`INSERT INTO email_accounts (user_id, label, email, imap_host, smtp_host, username, password_enc, organizacion_id) VALUES ('u1','${MARK}','a@a.test','h','h','u','p',$1) RETURNING id`, [orgA])).rows[0].id;
  await pool.query(`INSERT INTO emails (account_id, user_id, uid, folder, subject, sent_at) VALUES ($1,'u1',1,'INBOX','${MARK}',NOW())`, [acc]);
  await pool.query(`INSERT INTO whatsapp_schedules (client_id, phone, body, scheduled_for, status) VALUES ($1,'600000000','${MARK}', NOW() + interval '1 day','pendiente')`, [cli]).catch(() => {});
  const { logActivity } = await import('../src/controllers/activityController');
  await logActivity('u1', 'U1', `Acción sobre ${MARK}`, 'EXPEDIENTE', exp, MARK, { organizacionId: orgA });
  // Sin organización explícita: debe deducirla de la entidad (no quedar huérfana).
  await logActivity('SYSTEM', 'Sistema', `Office ${MARK}`, 'CLIENT', cli, MARK);
});

after(async () => { if (pool) await pool.end(); });

test('widgets del dashboard: nada de la organización A visto desde la B', { skip }, async () => {
  const activity = await import('../src/controllers/activityController');
  const agenda = await import('../src/controllers/agendaController');
  const tasks = await import('../src/controllers/tasksController');
  const exps = await import('../src/controllers/expedientesController');
  const fact = await import('../src/controllers/facturacionController');
  const email = await import('../src/controllers/emailController');
  const wa = await import('../src/controllers/whatsappController');
  const entities = await import('../src/controllers/entities');

  const checks: [string, any][] = [
    ['Trazabilidad (widget: mi actividad)', await call(activity.getMyActivity, orgB)],
    ['Trazabilidad (página)', await call(activity.getActivity, orgB)],
    ['Trazabilidad (por usuarios)', await call(activity.getActivityByUsers, orgB)],
    ['Agenda (próximos)', await call(agenda.getUpcomingEvents, orgB)],
    ['Tareas', await call(tasks.getMyTasks, orgB)],
    ['Expedientes (stats)', await call(exps.getStats, orgB)],
    ['Facturación (bootstrap)', await call(fact.getBillingBootstrap, orgB)],
    ['Correo (lista sin cuenta)', await call(email.getMessages, orgB, { query: { folder: 'INBOX' } })],
    ['WhatsApp programados', await call(wa.getSchedules, orgB)],
    ['Clientes', await call(entities.getEntities, orgB)],
  ];
  for (const [name, payload] of checks) assert.ok(!leaks(payload), `${name} devuelve datos de otra organización`);

  // Y desde A sí se ven (la prueba no pasa "por no devolver nada").
  assert.ok(leaks(await call(activity.getMyActivity, orgA)), 'la actividad de A debe verse en A');
  assert.ok(leaks(await call(email.getMessages, orgA, { query: { folder: 'INBOX' } })), 'el correo de A debe verse en A');
  const stats: any = await call(email.getStats, orgB);
  assert.equal(Number(stats.data.inbox), 0, 'el contador de correo de B no debe contar el buzón de A');
});

test('logActivity sin organización la deduce de la entidad', { skip }, async () => {
  const { rows } = await pool.query(`SELECT organizacion_id FROM activity_log WHERE action_type = $1 ORDER BY created_at DESC LIMIT 1`, [`Office ${MARK}`]);
  assert.equal(rows[0]?.organizacion_id, orgA);
});

// 06/10/2026: firmas, plantillas y grupos de correo eran globales.
test('firmas y plantillas de correo: cada organización las suyas', { skip }, async () => {
  const st = await import('../src/controllers/sharedTemplatesController');
  const created: any = await call(st.createSharedTemplate, orgA, { body: { type: 'email_signature', name: MARK, data: { html: MARK } } });
  assert.equal(created.success, true);
  const id = created.data.id;
  assert.ok(!leaks(await call(st.listSharedTemplates, orgB, { query: { type: 'email_signature' } })), 'la firma de A se ve en B');
  assert.ok(leaks(await call(st.listSharedTemplates, orgA, { query: { type: 'email_signature' } })), 'la firma de A debe verse en A');
  // Desde B no se puede tocar.
  assert.equal((await call(st.updateSharedTemplate, orgB, { params: { id }, body: { name: 'x', data: {} } })).success, false);
  assert.equal((await call(st.setDefaultSharedTemplate, orgB, { params: { id } })).success, false);
  assert.equal((await call(st.deleteSharedTemplate, orgB, { params: { id } })).success, false);
  // Marcar predeterminada en B no quita la de A.
  await call(st.setDefaultSharedTemplate, orgA, { params: { id } });
  const b: any = await call(st.createSharedTemplate, orgB, { body: { type: 'email_signature', name: 'B', data: { html: 'B' } } });
  await call(st.setDefaultSharedTemplate, orgB, { params: { id: b.data.id } });
  const { rows } = await pool.query(`SELECT is_default FROM shared_templates WHERE id = $1`, [id]);
  assert.equal(rows[0].is_default, true);
});
