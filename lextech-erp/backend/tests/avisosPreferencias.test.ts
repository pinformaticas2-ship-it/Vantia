// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Estudio de avisos (13/10/2026), fases 3-5: preferencias por tipo, horario
// de silencio (hora de Madrid), plazos que avisan por fases y no para
// siempre, "No molestar" en el chat, limpieza de suscripciones caducadas y
// descartados de la campana guardados en el servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}
// Push "encendido" con claves de prueba; el envío real se sustituye por uno
// que solo apunta qué se habría mandado.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpush = require('web-push');
const claves = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = claves.publicKey;
process.env.VAPID_PRIVATE_KEY = claves.privateKey;
const enviados: { endpoint: string; payload: any }[] = [];
let fallarCon: number | null = null;
webpush.sendNotification = async (sub: any, body: string) => {
  if (fallarCon) { const e: any = new Error('fallo'); e.statusCode = fallarCon; throw e; }
  enviados.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
  return { statusCode: 201 };
};

let pool: any;
let org: string;
let cliente: string;

function call(handler: any, userId: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, ...extra }, res));
  });
}
const sub = (user: string) => pool.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'k', 'a')`, [user, `https://push.test/${user}`]);
const paraUsuario = (user: string) => enviados.filter((e) => e.endpoint === `https://push.test/${user}`);
/** Un instante concreto en hora de Madrid (octubre: UTC+2). */
const madrid = (iso: string) => new Date(`${iso}+02:00`);

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Prefs avisos') RETURNING id`)).rows[0].id;
  await pool.query(
    `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'pa_ana','propietario'),($1,'pa_luis','miembro'),($1,'pa_eva','miembro')`,
    [org],
  );
  for (const u of ['pa_ana', 'pa_luis', 'pa_eva']) await sub(u);
  cliente = (await pool.query(`INSERT INTO entities (type, first_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Cliente avisos',$2,$1) RETURNING id`, [org, 'PA' + (Date.now() % 1e7)])).rows[0].id;
});

after(async () => { if (pool) await pool.end(); });

test('horario de silencio: cruza la medianoche, fines de semana, y lo urgente pasa', { skip }, async () => {
  const { enSilencio, PREFS_POR_DEFECTO, filtrarPorPreferencias } = await import('../src/utils/avisoPreferencias');
  const p = PREFS_POR_DEFECTO;
  assert.equal(enSilencio(p, madrid('2026-10-14T10:00:00')), false, 'miércoles 10:00');
  assert.equal(enSilencio(p, madrid('2026-10-14T21:30:00')), true, 'miércoles 21:30');
  assert.equal(enSilencio(p, madrid('2026-10-15T07:59:00')), true, 'jueves 07:59');
  assert.equal(enSilencio(p, madrid('2026-10-17T12:00:00')), true, 'sábado a mediodía');
  assert.equal(enSilencio({ ...p, silencio: { ...p.silencio, finDeSemana: false } }, madrid('2026-10-17T12:00:00')), false);
  assert.equal(enSilencio({ ...p, silencio: { ...p.silencio, activo: false } }, madrid('2026-10-14T23:00:00')), false);

  const noche = madrid('2026-10-14T23:00:00');
  assert.deepEqual((await filtrarPorPreferencias(['pa_ana'], 'correo', noche)).silenciados, ['pa_ana']);
  assert.deepEqual((await filtrarPorPreferencias(['pa_ana'], 'chat_dm', noche)).destinatarios, ['pa_ana'], 'los directos pasan');
  assert.deepEqual((await filtrarPorPreferencias(['pa_ana'], 'vista', noche)).destinatarios, ['pa_ana'], 'las vistas pasan');
});

test('preferencias: guardar, normalizar y que un tipo desactivado no llegue', { skip }, async () => {
  const c = await import('../src/controllers/pushController');
  const put = await call(c.putAvisoPrefs, 'pa_luis', { body: { prefs: { tipos: { correo: false }, silencio: { activo: false, desde: '25:99' } } } });
  assert.equal(put.status, 200);
  assert.equal(put.body.data.prefs.tipos.correo, false);
  assert.equal(put.body.data.prefs.tipos.chat, true, 'lo no indicado queda por defecto');
  assert.equal(put.body.data.prefs.silencio.desde, '21:00', 'una hora inválida vuelve a la de por defecto');
  const { filtrarPorPreferencias } = await import('../src/utils/avisoPreferencias');
  const r = await filtrarPorPreferencias(['pa_luis', 'pa_eva'], 'correo', madrid('2026-10-14T10:00:00'));
  assert.deepEqual(r.destinatarios, ['pa_eva']);
});

test('avisos por correo: solo los activados, nunca "correo", y el silencio también vale', { skip }, async () => {
  const c = await import('../src/controllers/pushController');
  const put = await call(c.putAvisoPrefs, 'pa_eva', { body: { prefs: { tipos: { plazo: false }, email: { plazo: true, correo: true } } } });
  assert.equal(put.status, 200);
  assert.equal(put.body.data.prefs.email.plazo, true);
  assert.equal(put.body.data.prefs.email.correo, false, 'un correo para avisar de un correo, no');
  assert.equal(put.body.data.prefs.email.chat, false, 'por defecto, ninguno por correo');
  assert.equal(put.body.data.cuentaCorreo, null, 'sin cuenta de correo propia conectada');
  const { filtrarPorPreferencias } = await import('../src/utils/avisoPreferencias');
  const dia = await filtrarPorPreferencias(['pa_eva', 'pa_ana'], 'plazo', madrid('2026-10-14T10:00:00'));
  assert.deepEqual(dia.destinatarios, ['pa_ana'], 'Eva quitó el push de plazos');
  assert.deepEqual(dia.porCorreo, ['pa_eva'], 'pero lo quiere por correo');
  const noche = await filtrarPorPreferencias(['pa_eva'], 'plazo', madrid('2026-10-14T23:00:00'));
  assert.deepEqual(noche.porCorreo, [], 'en silencio no sale el correo');
  assert.deepEqual(noche.silenciados, ['pa_eva'], 'y se reintenta como un push silenciado');
  // Se deja como estaba para los demás tests
  await call(c.putAvisoPrefs, 'pa_eva', { body: { prefs: {} } });
});

test('chat: no llega push a quien está en "No molestar" / "En juicio"', { skip }, async () => {
  const chat = await import('../src/controllers/chatController');
  await call(chat.updateMyStatus, 'pa_eva', { body: { status: 'en_juicio' } });
  const canal = (await pool.query(`INSERT INTO chat_canales (nombre, tipo, created_by, organizacion_id) VALUES ('avisos-dnd','publico','pa_ana',$1) RETURNING id`, [org])).rows[0].id;
  await pool.query(`INSERT INTO chat_miembros (canal_id, user_id, user_name, role) VALUES ($1,'pa_ana','Ana','admin'),($1,'pa_eva','Eva','miembro'),($1,'pa_luis','Luis','miembro')`, [canal]);
  // Luis tiene el silencio desactivado (test anterior); Eva está en juicio.
  enviados.length = 0;
  const r = await call(chat.sendMensaje, 'pa_ana', { params: { id: canal }, body: { contenido: 'Hola equipo' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // El push va en segundo plano (resuelve el nombre del autor antes): se
  // espera a que llegue, con tope de 5 s.
  for (let i = 0; i < 50 && paraUsuario('pa_luis').length === 0; i++) await new Promise((ok) => setTimeout(ok, 100));
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(paraUsuario('pa_eva').length, 0, 'en juicio: sin push');
  assert.equal(paraUsuario('pa_luis').length, 1);
  assert.equal(paraUsuario('pa_ana').length, 0, 'nunca al autor');
  assert.equal(paraUsuario('pa_luis')[0].payload.tipo, undefined, 'el tipo no viaja al navegador');
});

test('plazos: una vez por fase, en hora de Madrid, y vencidos como mucho 3 veces', { skip }, async () => {
  const { runPlazoPushCheck } = await import('../src/services/plazoPushScheduler');
  await pool.query(`INSERT INTO aviso_preferencias (user_id, prefs) VALUES ('pa_ana', '{"silencio":{"activo":false}}') ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`);
  const hoyMadrid = `(NOW() AT TIME ZONE 'Europe/Madrid')::date`;
  const tarea = (await pool.query(
    `INSERT INTO client_tasks (client_id, organizacion_id, titulo, plazo, user_id, estado) VALUES ($1, $2, 'Contestar demanda', ${hoyMadrid} + 1, 'pa_ana', 'pendiente') RETURNING id`, [cliente, org],
  )).rows[0].id;
  const vieja = (await pool.query(
    `INSERT INTO client_tasks (client_id, organizacion_id, titulo, plazo, user_id, estado) VALUES ($1, $2, 'Plazo de hace un año', ${hoyMadrid} - 366, 'pa_ana', 'pendiente') RETURNING id`, [cliente, org],
  )).rows[0].id;

  enviados.length = 0;
  await runPlazoPushCheck();
  const deAna = () => paraUsuario('pa_ana').map((e) => e.payload);
  assert.deepEqual(deAna().map((p) => p.body).sort(), ['Vence mañana', 'Vencida hace 366 días']);

  // Otra pasada el mismo día: nada nuevo (antes: cada ~20 h para siempre).
  enviados.length = 0;
  await runPlazoPushCheck();
  assert.equal(deAna().length, 0);

  // Llega el día: nueva fase → nuevo aviso.
  await pool.query(`UPDATE client_tasks SET plazo = ${hoyMadrid} WHERE id = $1`, [tarea]);
  await runPlazoPushCheck();
  assert.deepEqual(deAna().map((p) => p.body), ['Vence hoy']);

  // Vencida: se repite cada semana, como mucho 3 veces.
  for (let i = 0; i < 4; i++) {
    await pool.query(`UPDATE client_tasks SET plazo_push_sent_at = NOW() - INTERVAL '8 days' WHERE id = $1`, [vieja]);
    await runPlazoPushCheck();
  }
  const { rows } = await pool.query(`SELECT plazo_push_vencida_n FROM client_tasks WHERE id = $1`, [vieja]);
  assert.equal(rows[0].plazo_push_vencida_n, 3);
});

test('plazos en horario de silencio: no se dan por avisados y se reintentan', { skip }, async () => {
  const { runPlazoPushCheck } = await import('../src/services/plazoPushScheduler');
  // Silencio "siempre" (de 00:00 a 23:59) para Eva.
  await pool.query(`INSERT INTO aviso_preferencias (user_id, prefs) VALUES ('pa_eva', '{"silencio":{"activo":true,"desde":"00:00","hasta":"23:59","finDeSemana":true}}')
                    ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`);
  const t = (await pool.query(
    `INSERT INTO client_tasks (client_id, organizacion_id, titulo, plazo, user_id, estado) VALUES ($1, $2, 'En silencio', (NOW() AT TIME ZONE 'Europe/Madrid')::date + 2, 'pa_eva', 'pendiente') RETURNING id`, [cliente, org],
  )).rows[0].id;
  enviados.length = 0;
  await runPlazoPushCheck();
  assert.equal(paraUsuario('pa_eva').length, 0);
  const { rows } = await pool.query(`SELECT plazo_push_fase, plazo_push_sent_at FROM client_tasks WHERE id = $1`, [t]);
  assert.equal(rows[0].plazo_push_fase, null, 'pendiente de avisar cuando acabe el silencio');
});

test('suscripción hecha con otras claves (403): se borra sola', { skip }, async () => {
  const { sendPushToUser } = await import('../src/utils/webPush');
  await sub('pa_caducada');
  fallarCon = 403;
  await sendPushToUser('pa_caducada', { title: 'x', body: 'y' });
  fallarCon = null;
  const { rows } = await pool.query(`SELECT 1 FROM push_subscriptions WHERE user_id = 'pa_caducada'`);
  assert.equal(rows.length, 0);
});

test('campana: los descartados se guardan en el servidor y se acumulan', { skip }, async () => {
  const c = await import('../src/controllers/pushController');
  await call(c.addDescartados, 'pa_ana', { body: { ids: ['chat-1', 'email-2'] } });
  await call(c.addDescartados, 'pa_ana', { body: { ids: ['vista-pendiente-3'] } });
  const r = await call(c.getDescartados, 'pa_ana');
  assert.deepEqual(r.body.data, ['chat-1', 'email-2', 'vista-pendiente-3']);
});
