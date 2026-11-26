// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Cliente del expediente nuevo al aceptar una vista (26/11/2026): antes se
// creaba siempre sin cliente. Ahora se propone el cliente que sale en el
// correo (NIF o nombre), se puede buscar cualquiera del despacho y nunca se
// enlaza un cliente de otra organización.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { puntuarClientes, ClienteFila } from '../src/services/vistasClientes';

const cli = (id: string, first: string | null, last: string | null, nif: string | null = null, comercial: string | null = null): ClienteFila =>
  ({ id, first_name: first, last_name: last, nif_cif: nif, commercial_name: comercial });

test('propone los clientes que salen en el correo', () => {
  const clientes = [
    cli('ana', 'Ana María', 'López García', '12345678Z'),
    cli('pedro', 'Pedro', 'Martínez Ruiz'),
    cli('juan', 'Juan', null),
    cli('sl', null, null, 'B12345678', 'Construcciones Levante SL'),
    cli('imp', 'Luis', 'Gómez', 'IMP-1a2b3c4d'),
    cli('nadie', 'Marta', 'Sánchez'),
  ];
  const r = puntuarClientes(clientes,
    { cliente: 'ANA MARÍA LÓPEZ GARCÍA', partes: 'López García, Ana María contra Construcciones Levante, S.L.', contrario: 'Construcciones Levante SL' },
    { subject: 'SEÑALAMIENTO VISTA autos 945/2023', body_text: 'Se cita a las partes. Letrado: Pedro Martínez Ruiz. Juan comparecerá. NIF 12.345.678-Z' });
  assert.deepEqual(r.map((c) => [c.id, c.motivo]), [['ana', 'nif'], ['pedro', 'correo']]);
  // La parte contraria no se propone, un nombre suelto («Juan») tampoco, y un NIF de relleno no cuenta.
  assert.ok(!r.some((c) => ['sl', 'juan', 'imp', 'nadie'].includes(c.id)));
});

test('el orden «Apellidos, Nombre» de los juzgados también vale', () => {
  const r = puntuarClientes([cli('a', 'Ana', 'Pérez Gil'), cli('b', 'Rosa', 'Vidal Mas')],
    { partes: 'PÉREZ GIL, ANA y otros' }, { subject: '', body_text: 'Rosa Vidal Mas' });
  assert.deepEqual(r.map((c) => [c.id, c.motivo]), [['a', 'partes'], ['b', 'correo']]);
});

test('sin coincidencias no propone nada', () => {
  assert.deepEqual(puntuarClientes([cli('a', 'Ana', 'Pérez')], null, { subject: 'Hola', body_text: 'Ana Perezosa' }), []);
});

// ── Con base de datos ─────────────────────────────────────────────────────────
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
let org: string, otraOrg: string;
let cliPropio: string, cliAjeno: string;

function call(handler: any, userId: string, rol: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, organizacionRol: rol, ...extra }, res));
  });
}

const nuevaSolicitud = async (asunto: string, datos: any) => (await pool.query(
  `INSERT INTO vistas_solicitudes (organizacion_id, email_id, mailbox_user_id, estado, tipo, subject, body_text, datos, fecha_vista)
   VALUES ($1, uuid_generate_v4(), 'buzon', 'pendiente', 'vista', $2, $3, $4, NOW() + interval '10 days') RETURNING id`,
  [org, asunto, `Señalamiento. Partes: ${datos.partes || ''}`, JSON.stringify(datos)])).rows[0].id;

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  await pool.query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS expediente_id UUID`);
  org = (await pool.query(`INSERT INTO organizaciones (nombre, vistas_auto_enabled) VALUES ('Org clientes vistas', true) RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Otra org') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'buzon','miembro'),($1,'otro','miembro')`, [org]);
  const sufijo = String(Date.now() % 1e7);
  cliPropio = (await pool.query(`INSERT INTO entities (type, first_name, last_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Elena','Navarro Ortiz',$2,$1) RETURNING id`, [org, 'E' + sufijo])).rows[0].id;
  // Mismo nombre en otra organización: nunca debe salir ni enlazarse.
  cliAjeno = (await pool.query(`INSERT INTO entities (type, first_name, last_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Elena','Navarro Ortiz',$2,$1) RETURNING id`, [otraOrg, 'F' + sufijo])).rows[0].id;
});

after(async () => { if (pool) await pool.end(); });

test('la vista propone y busca solo clientes del despacho', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const id = await nuevaSolicitud('VISTA autos 31/2026', { num_autos: '31/2026', partes: 'Elena Navarro Ortiz contra Seguros X' });
  const det = await call(v.getVista, 'buzon', 'miembro', { params: { id } });
  assert.equal(det.status, 200, JSON.stringify(det.body));
  assert.deepEqual(det.body.data.clientesSugeridos.map((c: any) => [c.id, c.motivo]), [[cliPropio, 'partes']]);

  const busca = await call(v.buscarClientesVista, 'buzon', 'miembro', { params: { id }, query: { q: 'navarro' } });
  assert.deepEqual(busca.body.data.map((c: any) => c.id), [cliPropio]);
  const porNif = await call(v.buscarClientesVista, 'buzon', 'miembro', { params: { id }, query: { q: 'E' + String(Date.now() % 1e7).slice(0, 3) } });
  assert.ok(porNif.body.data.every((c: any) => c.id !== cliAjeno));
  // Quien no ve la vista tampoco puede buscar clientes a través de ella.
  assert.equal((await call(v.buscarClientesVista, 'otro', 'miembro', { params: { id }, query: { q: 'navarro' } })).status, 403);
});

test('al aceptar, el expediente nuevo se crea con el cliente elegido (y nunca con uno de otra organización)', { skip }, async () => {
  const v = await import('../src/controllers/vistasController');
  const acepta = async (autos: string, clienteId: string | null) => {
    const id = await nuevaSolicitud(`VISTA autos ${autos}`, { num_autos: autos, juzgado: 'JPI 1 de Murcia' });
    const r = await call(v.aceptarVista, 'buzon', 'miembro', { params: { id }, body: {
      fecha: new Date(Date.now() + 10 * 86400000).toISOString(), enviar_correo: false, recordatorio: false, guardar_adjuntos: false,
      expediente: { modo: 'nuevo', cliente_id: clienteId },
    } });
    assert.equal(r.body.success, true, JSON.stringify(r.body));
    const { rows } = await pool.query(
      `SELECT e.cliente_id, e.cliente_nombre, a.cliente_id AS agenda_cliente
         FROM vistas_solicitudes s JOIN expedientes e ON e.id = s.expediente_id
         LEFT JOIN agenda_events a ON a.id = s.agenda_event_id WHERE s.id = $1`, [id]);
    return rows[0];
  };
  const conCliente = await acepta('41/2026', cliPropio);
  assert.equal(conCliente.cliente_id, cliPropio);
  assert.match(conCliente.cliente_nombre, /Elena Navarro Ortiz/);
  assert.equal(conCliente.agenda_cliente, cliPropio, 'la vista de la agenda también queda con el cliente');

  const ajeno = await acepta('42/2026', cliAjeno);
  assert.equal(ajeno.cliente_id, null, 'un cliente de otra organización no se enlaza');

  const sin = await acepta('43/2026', null);
  assert.equal(sin.cliente_id, null);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM entities WHERE organizacion_id = $1`, [org]);
  assert.equal(rows[0].n, 1, 'no se crean clientes nuevos al aceptar');
});
