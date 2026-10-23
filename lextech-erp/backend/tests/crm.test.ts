// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// CRM (23/10/2026): embudo del despacho con sus 13 etapas y reglas, estado
// aparte de la etapa, etiquetas, cuestionario, conversión en cliente, reglas
// con tiempo y aislamiento entre despachos.
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
let cfg: any;
const etapa = (nombre: string) => cfg.embudos[0].etapas.find((e: any) => e.nombre === nombre);

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
  const act = await import('../src/controllers/activityController');
  (act.getClerk().users as any).getUser = async (id: string) => ({ id, firstName: 'Ana', lastName: 'Test', emailAddresses: [] });
  c = await import('../src/controllers/crmController');
});

after(async () => { if (pool) await pool.end(); });

test('crm: el despacho empieza con su Pipeline de 13 etapas y el cuestionario', { skip }, async () => {
  // Una oportunidad de la primera versión del CRM pasa a la etapa equivalente
  const vieja = (await pool.query(`INSERT INTO crm_oportunidades (organizacion_id, nombre, etapa) VALUES ($1,'De antes','propuesta_enviada') RETURNING id`, [org])).rows[0].id;
  cfg = (await call(c.verConfig)).body.data;
  assert.equal(cfg.embudos.length, 1);
  assert.equal(cfg.embudos[0].nombre, 'Pipeline');
  assert.deepEqual(cfg.embudos[0].etapas.map((e: any) => e.nombre), c.ETAPAS_INICIALES.map((e: any) => e.nombre));
  assert.equal(etapa('Hoja de encargo firmada').tipo, 'ganada');
  assert.equal(etapa('No interesado').tipo, 'perdida');
  assert.equal(etapa('Primer Contacto - No respondió').mover_a_etapa_id, etapa('Primer Contacto – No Respondió (48h)').id);
  assert.equal(etapa('Primer Contacto - No respondió').mover_horas, 48);
  assert.equal(cfg.campos.length, 5);
  assert.equal(cfg.campos[0].opciones.length, 4);
  const { rows } = await pool.query(`SELECT etapa_id, estado FROM crm_oportunidades WHERE id = $1`, [vieja]);
  assert.equal(rows[0].etapa_id, etapa('Propuesta enviada').id);
  assert.equal(rows[0].estado, 'abierta');
  // Una segunda llamada no duplica nada
  assert.equal((await call(c.verConfig)).body.data.embudos.length, 1);
});

test('crm: crear entra en Nuevo lead con su regla, etiquetas y cuestionario', { skip }, async () => {
  assert.equal((await call(c.crearOportunidad, { body: { nombre: '  ' } })).status, 400);
  const campo = cfg.campos[0];
  const r = await call(c.crearOportunidad, { body: {
    nombre: 'Marta Coll', origen: 'facebook', valor_estimado: '1.200,50', etiquetas: 'curatela, urgente, curatela',
    campos: { [campo.id]: campo.opciones[0], [cfg.campos[1].id]: 'Opción que no existe' },
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const o = r.body.data;
  assert.equal(o.etapa_id, etapa('Nuevo lead').id);
  assert.equal(o.estado, 'abierta');
  assert.equal(o.proxima_accion, 'Primer contacto con el cliente', 'regla de la etapa');
  assert.equal(Number(o.valor_estimado), 1200.5);
  assert.deepEqual(o.etiquetas, ['curatela', 'urgente']);
  assert.deepEqual(o.campos, { [campo.id]: campo.opciones[0] }, 'solo opciones válidas');
  const lista = await call(c.listarOportunidades, { query: { q: 'urgente' } });
  assert.deepEqual(lista.body.data.map((x: any) => x.nombre), ['Marta Coll'], 'busca también por etiqueta');
});

test('crm: etapas finales cambian el estado; perder pide motivo; volver la reabre', { skip }, async () => {
  const id = (await call(c.crearOportunidad, { body: { nombre: 'Luis Ferrer' } })).body.data.id;
  const prop = await call(c.actualizarOportunidad, { params: { id }, body: { etapa_id: etapa('Propuesta enviada').id } });
  assert.equal(prop.body.data.proxima_accion, 'Llamar para confirmar la propuesta');
  assert.equal((await call(c.actualizarOportunidad, { params: { id }, body: { etapa_id: etapa('No interesado').id } })).status, 400, 'sin motivo no');
  const perdida = await call(c.actualizarOportunidad, { params: { id }, body: { etapa_id: etapa('No interesado').id, motivo_perdida: 'Le parece caro' } });
  assert.equal(perdida.body.data.estado, 'perdida');
  const vuelta = await call(c.actualizarOportunidad, { params: { id }, body: { etapa_id: etapa('Seguimiento').id } });
  assert.equal(vuelta.body.data.estado, 'abierta');
  assert.equal(vuelta.body.data.cerrada_at, null);
  const aband = await call(c.actualizarOportunidad, { params: { id }, body: { estado: 'abandonada', motivo_perdida: 'No contesta' } });
  assert.equal(aband.body.data.estado, 'abandonada');
  assert.equal((await call(c.actualizarOportunidad, { params: { id }, body: { estado: 'inventado' } })).status, 400);
  const textos = (await call(c.verOportunidad, { params: { id } })).body.data.actividades.map((a: any) => a.texto);
  assert.ok(textos.includes('Nuevo lead → Propuesta enviada'));
  assert.ok(textos.some((t: string) => t.startsWith('Propuesta enviada → No interesado') && t.includes('Le parece caro')));
});

test('crm: regla con tiempo — sin respuesta 48 h pasa a la etapa (48h)', { skip }, async () => {
  const id = (await call(c.crearOportunidad, { body: { nombre: 'Rosa Pons', etapa_id: etapa('Primer Contacto - No respondió').id } })).body.data.id;
  assert.equal(await c.aplicarReglasDeTiempo(), 0, 'aún no han pasado 48 h');
  await pool.query(`UPDATE crm_oportunidades SET etapa_desde = NOW() - INTERVAL '49 hours' WHERE id = $1`, [id]);
  assert.ok(await c.aplicarReglasDeTiempo() >= 1);
  const o = (await call(c.verOportunidad, { params: { id } })).body.data;
  assert.equal(o.etapa_id, etapa('Primer Contacto – No Respondió (48h)').id);
  assert.equal(o.proxima_accion, 'Último intento de contacto');
  assert.ok(o.actividades.some((a: any) => a.texto.startsWith('Automático: sin cambios')));
});

test('crm: configurar el embudo y el cuestionario', { skip }, async () => {
  const emb = cfg.embudos[0];
  const etapas = emb.etapas.map((e: any) => ({ ...e }));
  // Quitar una etapa con oportunidades: no
  const sinNuevoLead = etapas.filter((e: any) => e.nombre !== 'Nuevo lead');
  assert.equal((await call(c.guardarEmbudo, { params: { id: emb.id }, body: { etapas: sinNuevoLead } })).status, 409);
  // Renombrar, añadir una nueva y quitar una vacía
  const nuevas = etapas.filter((e: any) => e.nombre !== 'Valoración trabajador social')
    .map((e: any) => (e.nombre === 'Seguimiento' ? { ...e, nombre: 'Seguimiento semanal' } : e));
  nuevas.push({ id: 'nueva-x', nombre: 'Recuperar', tipo: 'abierta', mover_horas: 0 });
  const g = await call(c.guardarEmbudo, { params: { id: emb.id }, body: { etapas: nuevas } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  cfg = (await call(c.verConfig)).body.data;
  const nombres = cfg.embudos[0].etapas.map((e: any) => e.nombre);
  assert.ok(nombres.includes('Seguimiento semanal') && nombres.includes('Recuperar') && !nombres.includes('Valoración trabajador social'));
  // Cuestionario
  const campos = [...cfg.campos.slice(0, 2), { nombre: '¿Cómo nos conociste?', tipo: 'texto' }];
  assert.equal((await call(c.guardarCampos, { body: { campos } })).status, 200);
  assert.deepEqual((await call(c.verConfig)).body.data.campos.map((x: any) => x.nombre), campos.map((x) => x.nombre));
  // Otro embudo
  const nuevo = await call(c.crearEmbudo, { body: { nombre: 'Herencias' } });
  assert.equal(nuevo.status, 201);
  assert.equal((await call(c.verConfig)).body.data.embudos.length, 2);
});

test('crm: importes en cualquier formato', { skip }, async () => {
  const casos: [any, number | null][] = [
    ['1.200,50', 1200.5], ['1200,5', 1200.5], ['1.200', 1200], ['1200.00', 1200], ['1200.5', 1200.5],
    ['12.345.678', 12345678], ['900 €', 900], [1500, 1500], ['', null], ['abc', null], ['-5', null],
  ];
  for (const [entrada, esperado] of casos) assert.equal(c.importe(entrada), esperado, String(entrada));
});

test('crm: convertir en cliente crea la ficha y la marca ganada, sin duplicar', { skip }, async () => {
  const id = (await call(c.crearOportunidad, { body: { nombre: 'Isabel Font', email: 'isabel@ejemplo.es', telefono: '611000000' } })).body.data.id;
  const r = await call(c.convertirEnCliente, { params: { id } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.creado, true);
  assert.equal(r.body.data.oportunidad.estado, 'ganada');
  const { rows } = await pool.query(`SELECT first_name, email, type, organizacion_id FROM entities WHERE id = $1`, [r.body.data.clienteId]);
  assert.deepEqual(rows[0], { first_name: 'Isabel Font', email: 'isabel@ejemplo.es', type: 'CLIENTE', organizacion_id: org });
  const otra = await call(c.convertirEnCliente, { params: { id } });
  assert.equal(otra.body.data.creado, false);
  assert.equal(otra.body.data.clienteId, r.body.data.clienteId);
  const resumen = await call(c.resumenCrm);
  assert.ok(resumen.body.data.ganadas90 >= 1);
});

test('crm: nunca lo de otro despacho', { skip }, async () => {
  const ajena = (await call(c.crearOportunidad, { body: { nombre: 'Del otro despacho' }, org: otraOrg })).body.data;
  const id = ajena.id;
  assert.equal((await call(c.verOportunidad, { params: { id } })).status, 404);
  assert.equal((await call(c.actualizarOportunidad, { params: { id }, body: { nombre: 'Cambiado' } })).status, 404);
  assert.equal((await call(c.convertirEnCliente, { params: { id } })).status, 404);
  assert.equal((await call(c.borrarOportunidad, { params: { id } })).status, 404);
  assert.ok(!(await call(c.listarOportunidades, { query: { estado: 'todas' } })).body.data.some((o: any) => o.id === id));
  // Ni sus etapas ni su embudo
  const mia = (await call(c.crearOportunidad, { body: { nombre: 'Mía' } })).body.data;
  assert.equal((await call(c.actualizarOportunidad, { params: { id: mia.id }, body: { etapa_id: ajena.etapa_id } })).status, 400);
  assert.equal((await call(c.guardarEmbudo, { params: { id: ajena.embudo_id }, body: { etapas: [{ nombre: 'X' }] } })).status, 404);
});
