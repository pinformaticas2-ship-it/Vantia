// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Instagram (02/11/2026): firma del webhook, mensajes repartidos por despacho
// según la cuenta conectada, ecos sin duplicar, no leídos, ventana de 24 h,
// aislamiento entre despachos y envío (API de Meta simulada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
  process.env.META_APP_ID = 'app_test';
  process.env.META_APP_SECRET = 'secreto_test';
  process.env.INSTAGRAM_CONFIG_ID = 'config_test';
  process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'verifica_test';
}

let pool: any;
let org: string;
let otraOrg: string;
let ig: any;
let utils: any;

function call(handler: any, opts: { params?: any; body?: any; query?: any; org?: string; headers?: any; rol?: string } = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = {
      status(s: number) { status = s; return res; },
      json(b: any) { resolve({ status, body: b }); return res; },
      send(b: any) { resolve({ status, body: b }); return res; },
      sendStatus(s: number) { resolve({ status: s, body: null }); return res; },
      setHeader() {}, sendFile() { resolve({ status, body: 'file' }); },
    };
    Promise.resolve(handler({
      headers: opts.headers || {}, socket: {}, query: opts.query || {}, params: opts.params || {}, body: opts.body ?? {},
      auth: { userId: 'ig_ana' }, organizacionId: opts.org || org, organizacionRol: opts.rol || 'propietario',
    }, res));
  });
}

const firmar = (cuerpo: Buffer) => 'sha256=' + crypto.createHmac('sha256', 'secreto_test').update(cuerpo).digest('hex');
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('IG despacho') RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('IG otro') RETURNING id`)).rows[0].id;
  const act = await import('../src/controllers/activityController');
  (act.getClerk().users as any).getUser = async (id: string) => ({ id, firstName: 'Ana', lastName: 'Test', emailAddresses: [] });
  ig = await import('../src/controllers/instagramController');
  utils = await import('../src/utils/instagram');
  await utils.guardarCuentaInstagram(org, 'ig_ana', { accessToken: 'tok_org', expiresIn: 5184000, clientBusinessId: 'bm' }, { id: '1784000', username: 'despacho' });
  await utils.guardarCuentaInstagram(otraOrg, 'ig_ana', { accessToken: 'tok_otra', expiresIn: 5184000, clientBusinessId: 'bm' }, { id: '1785000', username: 'otro' });
});

after(async () => { if (pool) await pool.end(); });

test('instagram: verificación del webhook y firma', { skip }, async () => {
  assert.equal((await call(ig.verificarWebhook, { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verifica_test', 'hub.challenge': '42' } })).body, '42');
  assert.equal((await call(ig.verificarWebhook, { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '42' } })).status, 403);
  const cuerpo = Buffer.from(JSON.stringify({ object: 'instagram', entry: [] }));
  assert.equal((await call(ig.recibirWebhook, { body: cuerpo, headers: { 'x-hub-signature-256': 'sha256=00' } })).status, 401);
  assert.equal((await call(ig.recibirWebhook, { body: cuerpo, headers: {} })).status, 401);
  assert.equal((await call(ig.recibirWebhook, { body: cuerpo, headers: { 'x-hub-signature-256': firmar(cuerpo) } })).status, 200);
});

test('instagram: los mensajes llegan al despacho de la cuenta, sin duplicar ecos', { skip }, async () => {
  const realFetch = global.fetch;
  (global as any).fetch = async () => new Response(JSON.stringify({ name: 'Marta Coll', username: 'marta.coll', profile_pic: 'https://x/p.jpg' }), { status: 200 });
  try {
    const ahora = Date.now();
    await ig.procesarWebhook({ object: 'instagram', entry: [{ id: '1784000', messaging: [
      { sender: { id: 'cliente1' }, recipient: { id: '1784000' }, timestamp: ahora - 1000, message: { mid: 'm1', text: 'Hola, necesito ayuda con una herencia' } },
      { sender: { id: 'cliente1' }, recipient: { id: '1784000' }, timestamp: ahora - 900, message: { mid: 'm1', text: 'duplicado' } },
      { sender: { id: '1784000' }, recipient: { id: 'cliente1' }, timestamp: ahora - 500, message: { mid: 'm2', text: 'Te respondo desde el móvil', is_echo: true } },
      { sender: { id: 'cliente1' }, recipient: { id: '1784000' }, timestamp: ahora - 400, message: { mid: 'm3', attachments: [{ type: 'image', payload: { url: 'https://x/i.jpg' } }] } },
    ] }, { id: 'cuenta-desconocida', messaging: [{ sender: { id: 'z' }, recipient: { id: 'x' }, timestamp: ahora, message: { mid: 'mz', text: 'nadie' } }] }] });
  } finally { (global as any).fetch = realFetch; }

  const lista = (await call(ig.listarConversaciones)).body.data;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].igsid, 'cliente1');
  assert.equal(lista[0].noLeidos, 2, 'el eco no cuenta como no leído');
  assert.equal(lista[0].nombre, 'Marta Coll');
  assert.equal(lista[0].ultimoMensaje, '[Imagen]');
  assert.equal(lista[0].ventanaAbierta, true);
  assert.equal((await call(ig.listarConversaciones, { org: otraOrg })).body.data.length, 0, 'otro despacho no la ve');
  assert.equal((await call(ig.verConversacion, { params: { igsid: 'cliente1' }, org: otraOrg })).status, 404);

  const hilo = (await call(ig.verConversacion, { params: { igsid: 'cliente1' } })).body.data;
  assert.deepEqual(hilo.mensajes.map((m: any) => m.direccion), ['entrante', 'saliente', 'entrante']);
  assert.equal((await call(ig.listarConversaciones)).body.data[0].noLeidos, 0, 'abrir la marca como leída');
});

test('instagram: responder desde Vantia', { skip }, async () => {
  const realFetch = global.fetch;
  const llamadas: any[] = [];
  (global as any).fetch = async (url: string, init: any) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify({ recipient_id: 'cliente1', message_id: 'm-salida' }), { status: 200 });
  };
  try {
    assert.equal((await call(ig.enviarMensaje, { params: { igsid: 'cliente1' }, body: { texto: '  ' } })).status, 400);
    assert.equal((await call(ig.enviarMensaje, { params: { igsid: 'cliente1' }, body: { texto: 'Hola' }, org: otraOrg })).status, 404);
    const r = await call(ig.enviarMensaje, { params: { igsid: 'cliente1' }, body: { texto: 'Buenos días, Marta. ¿Cuándo te viene bien hablar?' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.enviado_por, 'Ana Test');
    assert.match(llamadas[0].url, /graph\.facebook\.com\/v\d+\.0\/1784000\/messages/);
    assert.equal(llamadas[0].init.headers.Authorization, 'Bearer tok_org');
    assert.deepEqual(JSON.parse(llamadas[0].init.body), { recipient: { id: 'cliente1' }, message: { text: 'Buenos días, Marta. ¿Cuándo te viene bien hablar?' } });
    // El eco que manda Meta después no se duplica
    await ig.procesarWebhook({ object: 'instagram', entry: [{ id: '1784000', messaging: [
      { sender: { id: '1784000' }, recipient: { id: 'cliente1' }, timestamp: Date.now(), message: { mid: 'm-salida', text: 'Buenos días, Marta. ¿Cuándo te viene bien hablar?', is_echo: true } }] }] });
    const hilo = (await call(ig.verConversacion, { params: { igsid: 'cliente1' } })).body.data;
    assert.equal(hilo.mensajes.filter((m: any) => m.texto?.startsWith('Buenos días')).length, 1);
  } finally { (global as any).fetch = realFetch; }
});

test('instagram: ventana de 24 h cerrada y errores de Meta en castellano', { skip }, async () => {
  const realFetch = global.fetch;
  // Entre 24 h y 7 días: se contesta como agente humano.
  await pool.query(`UPDATE instagram_contactos SET last_inbound_at = NOW() - INTERVAL '30 hours' WHERE organizacion_id=$1`, [org]);
  const h = (await call(ig.verConversacion, { params: { igsid: 'cliente1' } })).body.data;
  assert.equal(h.ventanaAbierta, true);
  assert.equal(h.agenteHumano, true);
  const cuerpos: any[] = [];
  (global as any).fetch = async (_u: string, init: any) => { cuerpos.push(JSON.parse(init.body)); return new Response(JSON.stringify({ message_id: 'm-agente' }), { status: 200 }); };
  try {
    assert.equal((await call(ig.enviarMensaje, { params: { igsid: 'cliente1' }, body: { texto: 'Ya tengo la respuesta del juzgado' } })).status, 200);
    assert.equal(cuerpos[0].messaging_type, 'MESSAGE_TAG');
    assert.equal(cuerpos[0].tag, 'HUMAN_AGENT');
  } finally { (global as any).fetch = realFetch; }
  // Más de 7 días: bloqueado sin llamar a Meta.
  await pool.query(`UPDATE instagram_contactos SET last_inbound_at = NOW() - INTERVAL '8 days' WHERE organizacion_id=$1`, [org]);
  assert.equal((await call(ig.verConversacion, { params: { igsid: 'cliente1' } })).body.data.ventanaAbierta, false);
  const bloqueado = await call(ig.enviarMensaje, { params: { igsid: 'cliente1' }, body: { texto: 'Hola' } });
  assert.equal(bloqueado.status, 400);
  assert.match(bloqueado.body.error, /7 días/);
  await pool.query(`UPDATE instagram_contactos SET last_inbound_at = NOW() - INTERVAL '30 hours' WHERE organizacion_id=$1`, [org]);
  (global as any).fetch = async () => new Response(JSON.stringify({ error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2534022 } }), { status: 400 });
  try {
    const r = await call(ig.enviarMensaje, { params: { igsid: 'cliente1' }, body: { texto: 'Hola' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /24 horas/);
  } finally { (global as any).fetch = realFetch; }
});

test('instagram: solo gestores conectan; una cuenta no puede estar en dos despachos', { skip }, async () => {
  assert.equal((await call(ig.startInstagramConnect, { rol: 'miembro' })).status, 403);
  const r = await call(ig.startInstagramConnect, { headers: { origin: 'https://app.vantia.test' } });
  assert.equal(r.status, 200);
  const url = new URL(r.body.data.url);
  assert.equal(url.origin + url.pathname, 'https://www.facebook.com/v26.0/dialog/oauth');
  assert.equal(url.searchParams.get('config_id'), 'config_test');
  assert.equal(url.searchParams.get('response_type'), 'code');
  const state = url.searchParams.get('state')!;
  // Simula que la otra organización conecta la cuenta que ya tiene este despacho
  await pool.query(`UPDATE instagram_oauth_states SET organizacion_id=$1 WHERE state=$2`, [otraOrg, state]);
  const realFetch = global.fetch;
  (global as any).fetch = async (u: string) => {
    if (u.includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'suat', token_type: 'bearer' }), { status: 200 });
    if (u.includes('me?fields=id,client_business_id')) return new Response(JSON.stringify({ id: 'su1', client_business_id: 'bm1' }), { status: 200 });
    if (u.includes('assigned_instagram_accounts')) return new Response(JSON.stringify({ data: [{ id: '1784000', username: 'despacho' }] }), { status: 200 });
    return new Response(JSON.stringify({ id: '1784000', username: 'despacho' }), { status: 200 });
  };
  let destino = '';
  try {
    await new Promise<void>((resolve) => {
      ig.instagramCallback({ query: { state, code: 'abc#_' }, headers: {} }, { redirect(u: string) { destino = u; resolve(); }, status() { return this; }, send() { resolve(); } });
    });
  } finally { (global as any).fetch = realFetch; }
  assert.match(new URL(destino).searchParams.get('mensaje') || '', /ya está conectada en otro despacho/);
  const { rows } = await pool.query(`SELECT ig_user_id FROM instagram_cuentas WHERE organizacion_id=$1`, [otraOrg]);
  assert.equal(rows[0].ig_user_id, '1785000', 'la otra organización conserva su cuenta');
});

test('instagram: el archivo público solo se sirve mientras se publica', { skip }, async () => {
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query(`INSERT INTO instagram_subidas (token, organizacion_id, archivo, mimetype, estado) VALUES ($1,$2,$3,'video/mp4','procesando')`, [token, org, __filename]);
  assert.equal((await call(ig.servirArchivo, { params: { token } })).body, 'file');
  await pool.query(`UPDATE instagram_subidas SET estado='publicado' WHERE token=$1`, [token]);
  assert.equal((await call(ig.servirArchivo, { params: { token } })).status, 404);
  assert.equal((await call(ig.servirArchivo, { params: { token: '../../etc/passwd' } })).status, 404);
  assert.equal((await call(ig.estadoPublicacion, { params: { token }, org: otraOrg })).status, 404);
  await espera(1);
});

test('instagram: si Meta no lista las cuentas, se sacan de los permisos del token', { skip }, async () => {
  const realFetch = global.fetch;
  (global as any).fetch = async (u: string) => {
    if (u.includes('me?fields=id,client_business_id')) return new Response(JSON.stringify({ id: 'su1', client_business_id: 'bm1' }), { status: 200 });
    if (u.includes('assigned_instagram_accounts')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (u.includes('debug_token')) return new Response(JSON.stringify({ data: { scopes: ['instagram_basic', 'instagram_manage_messages'], granular_scopes: [
      { scope: 'instagram_basic', target_ids: ['1786000'] }, { scope: 'instagram_manage_messages', target_ids: ['1786000'] }] } }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'no', code: 100 } }), { status: 400 });
  };
  try {
    const r = await utils.cuentasCompartidasInstagram('suat');
    assert.deepEqual(r.cuentas, [{ id: '1786000' }]);
    assert.equal(r.clientBusinessId, 'bm1');
  } finally { (global as any).fetch = realFetch; }
});

test('instagram: conectar con un identificador pegado (pruebas)', { skip }, async () => {
  const nueva = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('IG token') RETURNING id`)).rows[0].id;
  assert.equal((await call(ig.conectarConToken, { org: nueva, rol: 'miembro', body: { token: 'x'.repeat(30) } })).status, 403);
  assert.equal((await call(ig.conectarConToken, { org: nueva, body: { token: 'corto' } })).status, 400);
  const realFetch = global.fetch;
  const llamadas: string[] = [];
  (global as any).fetch = async (u: string) => {
    llamadas.push(u);
    if (u.includes('subscribed_apps')) return new Response(JSON.stringify({ success: true }), { status: 200 });
    return new Response(JSON.stringify({ id: '1787000', username: 'despacho.token' }), { status: 200 });
  };
  try {
    const r = await call(ig.conectarConToken, { org: nueva, body: { token: 'EAA' + 'x'.repeat(40), igUserId: '1787000' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.username, 'despacho.token');
    assert.ok(llamadas.some((u) => u.includes('/1787000/subscribed_apps')));
    // Una cuenta ya conectada en otro despacho no se puede volver a usar
    assert.equal((await call(ig.conectarConToken, { org: nueva, body: { token: 'EAA' + 'x'.repeat(40), igUserId: '1784000' } })).status, 409);
  } finally { (global as any).fetch = realFetch; }
  const { rows } = await pool.query(`SELECT ig_user_id, webhook_ok FROM instagram_cuentas WHERE organizacion_id=$1`, [nueva]);
  assert.deepEqual(rows[0], { ig_user_id: '1787000', webhook_ok: true });
});
