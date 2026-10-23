// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// CRM (23/10/2026): oportunidades, etapas con historial, motivo al perderla,
// conversión en cliente, cifras del tablero y aislamiento entre despachos.
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
let otraOrg: string;
let c: any;

function call(handler: any, opts: { params?: any; body?: any; query?: any; org?: string; user?: string } = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({
      headers: {}, socket: {}, query: opts.query || {}, params: opts.params || {}, body: opts.body || {},
      auth: { userId: opts.user || 'crm_ana' }, organizacionId: opts.org || org,
    }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('CRM despacho') RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('CRM otro') RETURNING id`)).rows[0].id;
  // Sin Clerk en los tests: los nombres se resuelven con el propio id
  const act = await import('../src/controllers/activityController');
  (act.getClerk().users as any).getUser = async (id: string) => ({ id, firstName: 'Ana', lastName: 'Test', emailAddresses: [] });
  c = await import('../src/controllers/crmController');
});

after(async () => { if (pool) await pool.end(); });

test('crm: crear, validar y verla en el tablero', { skip }, async () => {
  assert.equal((await call(c.crearOportunidad, { body: { nombre: '  ' } })).status, 400, 'sin nombre no');
  const r = await call(c.crearOportunidad, { body: {
    nombre: 'Marta Coll', telefono: '600111222', email: 'marta@ejemplo.es', origen: 'whatsapp',
    asunto: 'Curatela de su madre', area: 'Medidas de apoyo', valor_estimado: '1.200,50',
    proxima_accion: 'Llamar para agendar consulta', proxima_accion_at: '2020-01-01T10:00:00Z',
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.etapa, 'contacto');
  assert.equal(Number(r.body.data.valor_estimado), 1200.5, 'importe con formato español');
  assert.equal(r.body.data.responsable_user_id, 'crm_ana', 'por defecto la lleva quien la crea');
  const lista = await call(c.listarOportunidades, { query: { q: 'curatela' } });
  assert.deepEqual(lista.body.data.map((o: any) => o.nombre), ['Marta Coll']);
  const resumen = await call(c.resumenCrm);
  assert.equal(resumen.body.data.abiertas, 1);
  assert.equal(resumen.body.data.seguimientosVencidos, 1, 'la próxima acción ya pasó');
});

test('crm: importes en cualquier formato', { skip }, async () => {
  const casos: [any, number | null][] = [
    ['1.200,50', 1200.5], ['1200,5', 1200.5], ['1.200', 1200], ['1200.00', 1200], ['1200.5', 1200.5],
    ['12.345.678', 12345678], ['900 €', 900], [1500, 1500], ['', null], ['abc', null], ['-5', null],
  ];
  for (const [entrada, esperado] of casos) assert.equal(c.importe(entrada), esperado, String(entrada));
});

test('crm: mover de etapa queda en el historial; perderla pide motivo', { skip }, async () => {
  const id = (await call(c.crearOportunidad, { body: { nombre: 'Luis Ferrer', origen: 'web' } })).body.data.id;
  const mov = await call(c.actualizarOportunidad, { params: { id }, body: { etapa: 'consulta_agendada' } });
  assert.equal(mov.body.data.etapa, 'consulta_agendada');
  assert.equal((await call(c.actualizarOportunidad, { params: { id }, body: { etapa: 'perdida' } })).status, 400, 'sin motivo no');
  const perdida = await call(c.actualizarOportunidad, { params: { id }, body: { etapa: 'perdida', motivo_perdida: 'Le parece caro' } });
  assert.equal(perdida.body.data.etapa, 'perdida');
  assert.ok(perdida.body.data.cerrada_at);
  await call(c.anadirActividad, { params: { id }, body: { tipo: 'llamada', texto: 'Dice que lo pensará' } });
  const ver = await call(c.verOportunidad, { params: { id } });
  const textos = ver.body.data.actividades.map((a: any) => a.texto);
  assert.ok(textos.includes('Contacto → Consulta agendada'));
  assert.ok(textos.includes('Consulta agendada → Perdida. Motivo: Le parece caro'));
  assert.ok(textos.includes('Dice que lo pensará'));
  assert.equal((await call(c.actualizarOportunidad, { params: { id }, body: { etapa: 'inventada' } })).status, 400);
});

test('crm: convertir en cliente crea la ficha y la marca ganada', { skip }, async () => {
  const id = (await call(c.crearOportunidad, { body: { nombre: 'Isabel Font', email: 'isabel@ejemplo.es', telefono: '611000000' } })).body.data.id;
  const r = await call(c.convertirEnCliente, { params: { id } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.creado, true);
  assert.equal(r.body.data.oportunidad.etapa, 'ganada');
  const { rows } = await pool.query(`SELECT first_name, email, phone_1, type, organizacion_id, internal_number FROM entities WHERE id = $1`, [r.body.data.clienteId]);
  assert.deepEqual({ ...rows[0], internal_number: undefined }, { first_name: 'Isabel Font', email: 'isabel@ejemplo.es', phone_1: '611000000', type: 'CLIENTE', organizacion_id: org, internal_number: undefined });
  assert.ok(rows[0].internal_number > 0);
  // Otra vez: no duplica el cliente
  const otra = await call(c.convertirEnCliente, { params: { id } });
  assert.equal(otra.body.data.creado, false);
  assert.equal(otra.body.data.clienteId, r.body.data.clienteId);
  const resumen = await call(c.resumenCrm);
  assert.equal(resumen.body.data.ganadas90, 1);
  assert.equal(resumen.body.data.conversion90, 50, '1 ganada y 1 perdida');
});

test('crm: nunca las de otro despacho', { skip }, async () => {
  const id = (await call(c.crearOportunidad, { body: { nombre: 'Del otro despacho' }, org: otraOrg })).body.data.id;
  assert.equal((await call(c.verOportunidad, { params: { id } })).status, 404);
  assert.equal((await call(c.actualizarOportunidad, { params: { id }, body: { nombre: 'Cambiado' } })).status, 404);
  assert.equal((await call(c.convertirEnCliente, { params: { id } })).status, 404);
  assert.equal((await call(c.borrarOportunidad, { params: { id } })).status, 404);
  assert.ok(!(await call(c.listarOportunidades)).body.data.some((o: any) => o.id === id));
  // Un cliente de otro despacho no se puede enlazar
  const ajeno = (await pool.query(`INSERT INTO entities (type, first_name, organizacion_id) VALUES ('CLIENTE','Ajeno',$1) RETURNING id`, [otraOrg])).rows[0].id;
  const mia = (await call(c.crearOportunidad, { body: { nombre: 'Mía', cliente_id: ajeno } })).body.data;
  assert.equal(mia.cliente_id, null);
});
