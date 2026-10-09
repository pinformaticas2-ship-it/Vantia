// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Estados del chat (09/10/2026): se guardan por organización, el
// personalizado lo ven los demás, caducan solos, y "app en segundo plano"
// es ausente (no desconectado). Y la foto de cada grupo.
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
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org estados A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org estados B') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'est_ana','miembro'),($1,'est_luis','miembro'),($2,'est_ana','miembro')`, [orgA, orgB]);
});

after(async () => { if (pool) await pool.end(); });

test('el estado se guarda por organización y los demás ven el personalizado', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  // Sin estar en ningún canal (antes se perdía).
  const put = await call(c.updateMyStatus, 'est_ana', orgA, { body: { status: 'en_juicio', texto: '  En sala 3  ', emoji: '⚖️', color: 'blue' } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const mio = await call(c.getMyStatus, 'est_ana', orgA);
  assert.deepEqual({ ...mio.body.data, hasta: undefined }, { status: 'en_juicio', texto: 'En sala 3', emoji: '⚖️', color: 'blue', hasta: undefined });
  assert.equal((await call(c.getMyStatus, 'est_ana', orgB)).body.data.status, null, 'la otra organización no se pisa');

  const pres = await call(c.getPresence, 'est_luis', orgA);
  const ana = pres.body.data.find((r: any) => r.user_id === 'est_ana');
  assert.equal(ana.estado, 'en_juicio');
  assert.equal(ana.estado_texto, 'En sala 3');

  // "Ausente" a mano ya es válido (el botón daba error 400).
  assert.equal((await call(c.updateMyStatus, 'est_ana', orgA, { body: { status: 'ausente' } })).status, 200);
  assert.equal((await call(c.updateMyStatus, 'est_ana', orgA, { body: { status: 'disponible' } })).status, 400);
  assert.equal((await call(c.updateMyStatus, 'est_ana', orgA, { body: { status: null, texto: 'x', color: '"><script>' } })).body.data.color, null);
});

test('el estado caduca solo', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  const hasta = new Date(Date.now() + 3600_000).toISOString();
  assert.equal((await call(c.updateMyStatus, 'est_luis', orgA, { body: { status: 'en_reunion', hasta } })).status, 200);
  assert.equal((await call(c.getMyStatus, 'est_luis', orgA)).body.data.status, 'en_reunion');
  await pool.query(`UPDATE chat_presence SET estado_hasta = NOW() - INTERVAL '1 minute' WHERE user_id = 'est_luis' AND organizacion_id = $1`, [orgA]);
  assert.equal((await call(c.getMyStatus, 'est_luis', orgA)).body.data.status, null);
  const pres = await call(c.getPresence, 'est_ana', orgA);
  assert.equal(pres.body.data.find((r: any) => r.user_id === 'est_luis').estado, null);
  assert.equal((await call(c.updateMyStatus, 'est_luis', orgA, { body: { status: 'ocupado', hasta: '2000-01-01' } })).status, 400);
});

test('con la app en segundo plano sigue "vista" pero no activa', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  await call(c.updateHeartbeat, 'est_luis', orgA, { body: {} });
  await pool.query(`UPDATE chat_presence SET last_active_at = NOW() - INTERVAL '10 minutes', last_seen_at = NOW() - INTERVAL '10 minutes' WHERE user_id = 'est_luis' AND organizacion_id = $1`, [orgA]);
  await call(c.updateHeartbeat, 'est_luis', orgA, { body: { oculto: true } });
  const luis = (await call(c.getPresence, 'est_ana', orgA)).body.data.find((r: any) => r.user_id === 'est_luis');
  assert.ok(luis.age_seconds >= 590, 'el latido oculto no cuenta como activo');
  assert.ok(luis.seen_age_seconds < 5, 'pero sí como app abierta');
});

test('foto del grupo: solo miembros, solo imágenes subidas al chat', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  const canal = (await pool.query(
    `INSERT INTO chat_canales (nombre, tipo, created_by, organizacion_id) VALUES ('grupo-foto', 'publico', 'est_ana', $1) RETURNING id`, [orgA],
  )).rows[0].id;
  await pool.query(`INSERT INTO chat_miembros (canal_id, user_id, user_name, role) VALUES ($1, 'est_ana', 'Ana', 'admin')`, [canal]);
  const foto = '/uploads/chat/1760000000000-abc123.jpg';

  assert.equal((await call(c.updateCanal, 'est_luis', orgA, { params: { id: canal }, body: { foto_url: foto } })).status, 403, 'no miembro');
  assert.equal((await call(c.updateCanal, 'est_ana', orgA, { params: { id: canal }, body: { foto_url: 'https://evil.example/x.jpg' } })).status, 400);
  assert.equal((await call(c.updateCanal, 'est_ana', orgB, { params: { id: canal }, body: { foto_url: foto } })).status, 404, 'otra organización');
  const ok = await call(c.updateCanal, 'est_ana', orgA, { params: { id: canal }, body: { foto_url: foto } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.foto_url, foto);

  // Cambiar solo el nombre no borra la foto; null la quita.
  await call(c.updateCanal, 'est_ana', orgA, { params: { id: canal }, body: { nombre: 'grupo-foto-2' } });
  const lista = await call(c.getCanales, 'est_ana', orgA);
  assert.equal(lista.body.data.find((x: any) => x.id === canal).foto_url, foto);
  await call(c.updateCanal, 'est_ana', orgA, { params: { id: canal }, body: { foto_url: null } });
  assert.equal((await pool.query(`SELECT foto_url FROM chat_canales WHERE id = $1`, [canal])).rows[0].foto_url, null);
});
