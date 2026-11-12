// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Automatizaciones (12/11/2026): recordatorios a clientes (cuándo salen, una
// sola vez por fecha, solo eventos con cliente y del propio despacho), pasos
// que se pueden quitar del flujo y la bienvenida apagada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { momentoRecordatorio, normalizarRecordatorios, rellenarRecordatorio } from '../src/services/recordatoriosClientes';
import { normalizeVistasConfig } from '../src/services/vistasAutomation';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

test('recordatorio: N días antes a la hora elegida, en hora de Madrid', () => {
  // Cita el jueves 19/11/2026 a las 10:00 (Madrid, UTC+1) → recordatorio el miércoles a las 09:00 Madrid = 08:00 UTC.
  const cita = new Date('2026-11-19T09:00:00Z');
  assert.equal(momentoRecordatorio(cita, { diasAntes: 1, hora: '09:00' })?.toISOString(), '2026-11-18T08:00:00.000Z');
  assert.equal(momentoRecordatorio(cita, { diasAntes: 0, hora: '08:00' })?.toISOString(), '2026-11-19T07:00:00.000Z');
});

test('recordatorio: valores no válidos vuelven a los de por defecto y la plantilla escapa HTML', () => {
  const c = normalizarRecordatorios({ activo: true, diasAntes: 99, hora: '25:00', tipos: ['cita', 'hackeo'] });
  assert.equal(c.activo, true);
  assert.equal(c.diasAntes, 1);
  assert.equal(c.hora, '10:00');
  assert.deepEqual(c.tipos, ['cita']);
  const v = { nombre: '<b>Ana</b>', titulo: 'una cita', fecha: 'jueves, 19 de noviembre', hora: '10:00', lugar: '', despacho: 'Despacho' };
  assert.equal(rellenarRecordatorio('Hola {nombre}{lugar_txt}', v, true), 'Hola &lt;b&gt;Ana&lt;/b&gt;');
  assert.equal(rellenarRecordatorio('{titulo} el {fecha} a las {hora}', v, false), 'una cita el jueves, 19 de noviembre a las 10:00');
});

test('vistas: los pasos quitables están encendidos salvo que se apaguen', () => {
  const def = normalizeVistasConfig({});
  assert.equal(def.responderAlAceptar, true);
  assert.equal(def.responderAlRechazar, true);
  assert.equal(def.recordatorioActivo, true);
  const off = normalizeVistasConfig({ responderAlRechazar: false, recordatorioActivo: false });
  assert.equal(off.responderAlRechazar, false);
  assert.equal(off.recordatorioActivo, false);
  assert.equal(off.responderAlAceptar, true);
});

let pool: any;
let orgA: string;
let orgB: string;
before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  const cfg = JSON.stringify({ recordatorios: { activo: true, diasAntes: 1, hora: '00:00', tipos: ['cita'] }, bienvenida: { activo: false } });
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre, automatizaciones) VALUES ('Autom A', $1) RETURNING id`, [cfg])).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Autom B') RETURNING id`)).rows[0].id;
});
after(async () => { if (pool) await pool.end(); });

test('recordatorios: solo citas con cliente, una vez, y sin correo del despacho queda registrado', { skip }, async () => {
  const cli = (await pool.query(
    `INSERT INTO entities (type, first_name, email, nif_cif, organizacion_id) VALUES ('CLIENTE','Lucía','lucia@example.test',$2,$1) RETURNING id`,
    [orgA, 'RC' + (Date.now() % 1e7)],
  )).rows[0].id;
  const cliB = (await pool.query(
    `INSERT INTO entities (type, first_name, email, nif_cif, organizacion_id) VALUES ('CLIENTE','Otro','otro@example.test',$2,$1) RETURNING id`,
    [orgB, 'RB' + (Date.now() % 1e7)],
  )).rows[0].id;
  const enUnasHoras = new Date(Date.now() + 5 * 3600_000);
  const ins = (org: string, tipo: string, cliente: string | null, titulo: string) => pool.query(
    `INSERT INTO agenda_events (user_id, title, start_at, type, cliente_id, organizacion_id) VALUES ('u1',$1,$2,$3,$4,$5) RETURNING id`,
    [titulo, enUnasHoras, tipo, cliente, org],
  ).then((r: any) => r.rows[0].id);
  const cita = await ins(orgA, 'cita', cli, 'Reunión inicial');
  await ins(orgA, 'plazo', cli, 'Plazo (no se recuerda)');
  await ins(orgA, 'cita', null, 'Sin cliente');
  // Cliente de otro despacho enlazado por error: no se le escribe.
  await ins(orgA, 'cita', cliB, 'Cliente ajeno');

  const { runRecordatoriosClientes } = await import('../src/services/recordatoriosClientes');
  await runRecordatoriosClientes();
  await runRecordatoriosClientes();
  const { rows: env } = await pool.query(`SELECT event_id, ok FROM recordatorios_clientes_enviados WHERE organizacion_id = $1`, [orgA]);
  assert.deepEqual(env.map((r: any) => r.event_id), [cita], 'solo la cita con cliente propio, y una sola vez');
  assert.equal(env[0].ok, false, 'sin cuenta de correo no sale');
  const { rows: reg } = await pool.query(`SELECT ok, detalle FROM automatizaciones_registro WHERE organizacion_id = $1 AND clave = 'recordatorios'`, [orgA]);
  assert.equal(reg.length, 1);
  assert.match(reg[0].detalle, /no tiene correo conectado/);
});

test('bienvenida apagada: no se intenta enviar ni se registra nada', { skip }, async () => {
  const { sendClientWelcomeEmail } = await import('../src/utils/clientWelcomeEmail');
  await sendClientWelcomeEmail(orgA, { email: 'nuevo@example.test', first_name: 'Nuevo' });
  await sendClientWelcomeEmail(orgB, { email: 'nuevo@example.test', first_name: 'Nuevo' });
  const { rows } = await pool.query(`SELECT organizacion_id FROM automatizaciones_registro WHERE clave = 'bienvenida' AND organizacion_id = ANY($1::uuid[])`, [[orgA, orgB]]);
  assert.deepEqual(rows.map((r: any) => r.organizacion_id), [orgB], 'B (encendida por defecto) lo intenta y lo registra; A no');
});

test('documentos base: por defecto, todos; se puede quitar uno', { skip }, async () => {
  const { docsBaseConfig } = await import('../src/services/docsBaseExpediente');
  assert.deepEqual((await docsBaseConfig(orgB)).docs, { lopd: true, toma_requisitos: true, hoja_encargo: true });
  await pool.query(`UPDATE organizaciones SET docs_base_config = '{"activo":true,"docs":{"lopd":false}}' WHERE id = $1`, [orgB]);
  const c = await docsBaseConfig(orgB);
  assert.equal(c.activo, true);
  assert.deepEqual(c.docs, { lopd: false, toma_requisitos: true, hoja_encargo: true });
});
