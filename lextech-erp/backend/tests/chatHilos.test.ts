// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Hilos del chat (11/11/2026, como en Slack): las respuestas en hilo no salen
// en la conversación ni cuentan como "sin leer"; el mensaje principal lleva
// el resumen. Y los permisos: un canal privado o un mensaje directo solo lo
// lee quien es miembro; la cita y lo fijado tienen que ser del mismo canal.
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
let canal: string;
let privado: string;
let ajeno: string;

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
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org hilos A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org hilos B') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'hil_ana','miembro'),($1,'hil_luis','miembro'),($1,'hil_eva','miembro'),($2,'hil_otro','miembro')`, [orgA, orgB]);
  const nuevo = async (nombre: string, tipo: string, org: string, miembros: string[]) => {
    const id = (await pool.query(`INSERT INTO chat_canales (nombre, tipo, created_by, organizacion_id) VALUES ($1, $2, $3, $4) RETURNING id`, [nombre, tipo, miembros[0], org])).rows[0].id;
    for (const u of miembros) await pool.query(`INSERT INTO chat_miembros (canal_id, user_id, user_name) VALUES ($1, $2, $2)`, [id, u]);
    return id;
  };
  canal = await nuevo('general-hilos', 'publico', orgA, ['hil_ana', 'hil_luis']);
  privado = await nuevo('socios', 'privado', orgA, ['hil_ana']);
  ajeno = await nuevo('ajeno', 'publico', orgB, ['hil_otro']);
});

after(async () => { if (pool) await pool.end(); });

test('las respuestas en hilo van al hilo, no a la conversación', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  const enviar = (u: string, body: any) => call(c.sendMensaje, u, orgA, { params: { id: canal }, body });
  const principal = (await enviar('hil_ana', { contenido: '¿Quién lleva el recurso?' })).body.data;
  await pool.query(`UPDATE chat_miembros SET last_read_at = NOW() WHERE canal_id = $1 AND user_id = 'hil_luis'`, [canal]);
  const antes = new Date(Date.now() - 1000).toISOString();

  const r1 = await enviar('hil_luis', { contenido: 'Yo', hilo_id: principal.id });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body.data.hilo_id, principal.id);
  await enviar('hil_ana', { contenido: 'Gracias', hilo_id: principal.id });

  const lista = (await call(c.getMensajes, 'hil_luis', orgA, { params: { id: canal } })).body.data;
  assert.deepEqual(lista.map((m: any) => m.contenido), ['¿Quién lleva el recurso?'], 'las respuestas no salen en la conversación');
  assert.equal(lista[0].respuestas, 2);
  assert.ok(lista[0].ultima_respuesta_at);
  assert.deepEqual(lista[0].hilo_autores.map((a: any) => a.user_id).sort(), ['hil_ana', 'hil_luis']);

  const hilo = (await call(c.getHilo, 'hil_luis', orgA, { params: { id: principal.id } })).body.data;
  assert.equal(hilo.principal.id, principal.id);
  assert.deepEqual(hilo.respuestas.map((m: any) => m.contenido), ['Yo', 'Gracias']);
  // Desde una respuesta también se abre el hilo de su mensaje principal.
  assert.equal((await call(c.getHilo, 'hil_luis', orgA, { params: { id: r1.body.data.id } })).body.data.principal.id, principal.id);

  // Las respuestas no cuentan como "sin leer" de la conversación.
  const unread = (await call(c.getUnreadCounts, 'hil_luis', orgA)).body.data.find((r: any) => r.canal_id === canal);
  assert.equal(unread.no_leidos, 0);

  // Los demás ven el contador nuevo por "cambios".
  const cambios = (await call(c.getCambiosMensajes, 'hil_luis', orgA, { params: { id: canal }, query: { desde: antes } })).body.data;
  assert.deepEqual(cambios.cambiados.map((m: any) => m.id), [principal.id]);
  assert.equal(cambios.cambiados[0].respuestas, 2);

  // No hay hilos dentro de hilos.
  assert.equal((await enviar('hil_ana', { contenido: 'x', hilo_id: r1.body.data.id })).status, 404);
});

test('al borrar una respuesta baja el contador', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  const p = (await call(c.sendMensaje, 'hil_ana', orgA, { params: { id: canal }, body: { contenido: 'principal 2' } })).body.data;
  const r = (await call(c.sendMensaje, 'hil_ana', orgA, { params: { id: canal }, body: { contenido: 'resp', hilo_id: p.id } })).body.data;
  assert.equal((await call(c.deleteMensaje, 'hil_ana', orgA, { params: { id: r.id } })).status, 200);
  const hilo = (await call(c.getHilo, 'hil_ana', orgA, { params: { id: p.id } })).body.data;
  assert.equal(hilo.respuestas.length, 0);
  assert.equal(hilo.principal.respuestas, 0);
});

test('un canal privado solo lo lee y escribe quien es miembro', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  const m = (await call(c.sendMensaje, 'hil_ana', orgA, { params: { id: privado }, body: { contenido: 'secreto' } })).body.data;
  assert.equal((await call(c.getMensajes, 'hil_eva', orgA, { params: { id: privado } })).status, 404);
  assert.equal((await call(c.sendMensaje, 'hil_eva', orgA, { params: { id: privado }, body: { contenido: 'hola' } })).status, 404);
  assert.equal((await call(c.getHilo, 'hil_eva', orgA, { params: { id: m.id } })).status, 404);
  assert.equal((await call(c.getCambiosMensajes, 'hil_eva', orgA, { params: { id: privado }, query: { desde: new Date(0).toISOString() } })).status, 404);
  // Un canal público sí se puede leer sin haberse unido.
  assert.equal((await call(c.getMensajes, 'hil_eva', orgA, { params: { id: canal } })).status, 200);
});

test('la cita y lo fijado tienen que ser de la misma conversación', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  const fuera = (await call(c.sendMensaje, 'hil_otro', orgB, { params: { id: ajeno }, body: { contenido: 'dato de otra organización' } })).body.data;
  const cita = await call(c.sendMensaje, 'hil_ana', orgA, { params: { id: canal }, body: { contenido: 'cito', reply_to_id: fuera.id } });
  assert.equal(cita.status, 400);
  assert.equal((await call(c.fijarMensaje, 'hil_ana', orgA, { params: { id: canal, mensajeId: fuera.id } })).status, 404);
  const fijados = (await call(c.getFijados, 'hil_ana', orgA, { params: { id: canal } })).body.data;
  assert.ok(!fijados.some((f: any) => f.mensaje_id === fuera.id));
});
