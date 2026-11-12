// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Avisos del chat (12/11/2026, como en Slack): "solo menciones y directos",
// canales silenciados y sonido dentro de la app.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mencionaA, normalizarPrefs } from '../src/utils/avisoPreferencias';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
let org: string;
let canal: string;

function call(handler: any, userId: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, ...extra }, res));
  });
}

test('menciones: nombre entero sin tildes ni mayúsculas, y @canal / @todos / @aquí', () => {
  assert.equal(mencionaA('Hola @Ana López, ¿lo miras?', ['Ana López']), true);
  assert.equal(mencionaA('hola @ana lopez', ['Ana López']), true);
  assert.equal(mencionaA('@Ana López.', ['Ana López']), true);
  assert.equal(mencionaA('@Ana Lópezz', ['Ana López']), false, 'otro nombre que empieza igual');
  assert.equal(mencionaA('Hola Ana López', ['Ana López']), false, 'sin @ no es mención');
  assert.equal(mencionaA('Aviso a @todos', ['Ana']), true);
  assert.equal(mencionaA('@aquí reunión', ['Ana']), true);
  assert.equal(mencionaA('@canal', [null, undefined]), true);
  assert.equal(mencionaA('correo@canalplus.es', ['Ana']), false, 'un correo no es mención');
  assert.equal(mencionaA('', ['Ana']), false);
});

test('preferencias del chat: por defecto todo y sin sonido; valores raros no cuelan', () => {
  assert.equal(normalizarPrefs({}).chatModo, 'todo');
  assert.equal(normalizarPrefs({}).sonido, false);
  assert.equal(normalizarPrefs({ chatModo: 'menciones', sonido: true }).chatModo, 'menciones');
  assert.equal(normalizarPrefs({ chatModo: 'menciones', sonido: true }).sonido, true);
  assert.equal(normalizarPrefs({ chatModo: 'nada', sonido: 'si' }).chatModo, 'todo');
  assert.equal(normalizarPrefs({ chatModo: 'nada', sonido: 'si' }).sonido, false);
});

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org avisos chat') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'av_ana','miembro'),($1,'av_luis','miembro')`, [org]);
  canal = (await pool.query(`INSERT INTO chat_canales (nombre, tipo, created_by, organizacion_id) VALUES ('general-av', 'publico', 'av_ana', $1) RETURNING id`, [org])).rows[0].id;
  await pool.query(`INSERT INTO chat_miembros (canal_id, user_id, user_name) VALUES ($1, 'av_ana', 'Ana'), ($1, 'av_luis', 'Luis')`, [canal]);
});

after(async () => { if (pool) await pool.end(); });

test('silenciar un canal: solo para mí, y se ve en la lista y en los no leídos', { skip }, async () => {
  const c = await import('../src/controllers/chatController');
  assert.equal((await call(c.silenciarCanal, 'av_luis', { params: { id: canal }, body: { silenciado: true } })).status, 200);
  const deLuis = (await call(c.getCanales, 'av_luis')).body.data.find((x: any) => x.id === canal);
  const deAna = (await call(c.getCanales, 'av_ana')).body.data.find((x: any) => x.id === canal);
  assert.equal(deLuis.silenciado, true);
  assert.equal(deAna.silenciado, false, 'no afecta a los demás');
  const unread = (await call(c.getUnreadCounts, 'av_luis')).body.data.find((x: any) => x.canal_id === canal);
  assert.equal(unread.silenciado, true);
  assert.equal((await call(c.silenciarCanal, 'av_luis', { params: { id: canal }, body: { silenciado: false } })).body.data.silenciado, false);
  // Quien no es miembro no puede.
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'av_eva','miembro')`, [org]);
  assert.equal((await call(c.silenciarCanal, 'av_eva', { params: { id: canal }, body: { silenciado: true } })).status, 403);
});
