// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Etiquetas de Vantia para el correo (27/11/2026): iguales para Gmail e IMAP,
// de cada persona en cada organización. Nadie ve ni usa las etiquetas de otro,
// ni puede etiquetar correos que no son suyos o de otra organización.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
// Usuarios nuevos en cada ejecución: la base de pruebas puede traer datos de otra.
const ANA = `ana_${Date.now()}`, LUIS = `luis_${Date.now()}`;
let org: string, otraOrg: string;
let correoImap: string, correoGmail: string, correoAjeno: string, correoOtraOrg: string;

function call(handler: any, userId: string, organizacionId: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId, ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org etiquetas') RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Otra org etiquetas') RETURNING id`)).rows[0].id;
  const cuenta = async (u: string, o: string) => (await pool.query(
    `INSERT INTO email_accounts (user_id, label, email, imap_host, smtp_host, username, password_enc, organizacion_id)
     VALUES ($1,'x','x@example.com','imap.invalid','smtp.invalid','x','x',$2) RETURNING id`, [u, o])).rows[0].id;
  const perfil = (await pool.query(
    `INSERT INTO email_oauth_profiles (user_id, provider, email, organizacion_id) VALUES ($2,'google','ana@gmail.com',$1) RETURNING id`, [org, ANA])).rows[0].id;
  const correo = async (u: string, cols: string, v: string) => (await pool.query(
    `INSERT INTO emails (user_id, ${cols}, folder, subject, is_read) VALUES ($1,$2,'INBOX','Prueba',false) RETURNING id`, [u, v])).rows[0].id;
  correoImap = await correo(ANA, 'account_id', await cuenta(ANA, org));
  correoGmail = await correo(ANA, 'gmail_profile_id', perfil);
  correoAjeno = await correo(LUIS, 'account_id', await cuenta(LUIS, org));
  correoOtraOrg = await correo(ANA, 'account_id', await cuenta(ANA, otraOrg));
});

after(async () => { if (pool) await pool.end(); });

test('crear, listar, renombrar y borrar etiquetas (solo las propias)', { skip }, async () => {
  const c = await import('../src/controllers/correoEtiquetasController');
  const a = await call(c.crearEtiqueta, ANA, org, { body: { nombre: '  Urgente  ', color: '#EF4444' } });
  assert.equal(a.body.success, true, JSON.stringify(a.body));
  assert.deepEqual([a.body.data.nombre, a.body.data.color], ['Urgente', '#ef4444']);
  // El mismo nombre (otra mayúscula) no crea otra: devuelve la misma.
  const b = await call(c.crearEtiqueta, ANA, org, { body: { nombre: 'urgente' } });
  assert.equal(b.body.data.id, a.body.data.id);
  assert.equal((await call(c.crearEtiqueta, ANA, org, { body: { nombre: '   ' } })).status, 400);
  await call(c.crearEtiqueta, ANA, org, { body: { nombre: 'Clientes' } });

  assert.deepEqual((await call(c.listarEtiquetas, ANA, org)).body.data.map((e: any) => e.nombre), ['Clientes', 'Urgente']);
  assert.deepEqual((await call(c.listarEtiquetas, LUIS, org)).body.data, [], 'otra persona no las ve');
  assert.deepEqual((await call(c.listarEtiquetas, ANA, otraOrg)).body.data, [], 'en otra organización tampoco');

  assert.equal((await call(c.editarEtiqueta, LUIS, org, { params: { id: a.body.data.id }, body: { nombre: 'Mía' } })).status, 404, 'no puede renombrar la de otro');
  assert.equal((await call(c.editarEtiqueta, ANA, org, { params: { id: a.body.data.id }, body: { nombre: 'Clientes' } })).status, 409, 'nombre repetido');
  const r = await call(c.editarEtiqueta, ANA, org, { params: { id: a.body.data.id }, body: { nombre: 'Muy urgente', color: 'rojo' } });
  assert.deepEqual([r.body.data.nombre, r.body.data.color], ['Muy urgente', '#3b82f6'], 'color no válido → el de por defecto');
  assert.equal((await call(c.borrarEtiqueta, LUIS, org, { params: { id: a.body.data.id } })).status, 404, 'no puede borrar la de otro');
  assert.equal((await call(c.borrarEtiqueta, ANA, org, { params: { id: a.body.data.id } })).body.success, true);
});

test('etiquetar correos de Gmail e IMAP por igual, y nunca los de otro', { skip }, async () => {
  const c = await import('../src/controllers/correoEtiquetasController');
  const e1 = (await call(c.crearEtiqueta, ANA, org, { body: { nombre: 'Juicio' } })).body.data.id;
  const e2 = (await call(c.crearEtiqueta, ANA, org, { body: { nombre: 'Factura' } })).body.data.id;
  const deLuis = (await call(c.crearEtiqueta, LUIS, org, { body: { nombre: 'Luis' } })).body.data.id;

  for (const correo of [correoImap, correoGmail]) {
    const p = await call(c.ponerEtiquetasCorreo, ANA, org, { params: { emailId: correo }, body: { etiquetas: [e1, e2, deLuis] } });
    assert.equal(p.body.success, true, JSON.stringify(p.body));
    assert.deepEqual([...p.body.data.etiquetas].sort(), [e1, e2].sort(), 'la etiqueta de otra persona se ignora');
  }
  // Quitar una: queda exactamente la lista enviada.
  await call(c.ponerEtiquetasCorreo, ANA, org, { params: { emailId: correoGmail }, body: { etiquetas: [e2] } });
  const asig = (await call(c.etiquetasDeCorreos, ANA, org, { query: { ids: `${correoImap},${correoGmail}` } })).body.data;
  assert.deepEqual([...asig[correoImap]].sort(), [e1, e2].sort());
  assert.deepEqual(asig[correoGmail], [e2]);
  assert.deepEqual((await call(c.etiquetasDeCorreos, LUIS, org, { query: { ids: correoImap } })).body.data, {}, 'otro no ve las etiquetas de ana');

  assert.equal((await call(c.ponerEtiquetasCorreo, ANA, org, { params: { emailId: correoAjeno }, body: { etiquetas: [e1] } })).status, 404, 'correo de otra persona');
  assert.equal((await call(c.ponerEtiquetasCorreo, ANA, org, { params: { emailId: correoOtraOrg }, body: { etiquetas: [e1] } })).status, 404, 'correo de otra organización');
  assert.equal((await call(c.ponerEtiquetasCorreo, ANA, org, { params: { emailId: correoImap }, body: { etiquetas: 'x' } })).status, 400);

  // La carpeta de la etiqueta en la lista de correos (folder=ETQ:id).
  const e = await import('../src/controllers/emailController');
  const lista = await call(e.getMessages, ANA, org, { query: { folder: `ETQ:${e1}` } });
  assert.equal(lista.body.success, true, JSON.stringify(lista.body));
  assert.deepEqual(lista.body.data.emails.map((m: any) => m.id), [correoImap]);
  const deOtro = await call(e.getMessages, LUIS, org, { query: { folder: `ETQ:${e1}` } });
  assert.deepEqual(deOtro.body.data.emails, [], 'la etiqueta de ana no le sirve a otro');

  // Borrar la etiqueta la quita de los correos, sin borrar correos.
  await call(c.borrarEtiqueta, ANA, org, { params: { id: e2 } });
  const tras = (await call(c.etiquetasDeCorreos, ANA, org, { query: { ids: `${correoImap},${correoGmail}` } })).body.data;
  assert.deepEqual(tras[correoImap], [e1]);
  assert.equal(tras[correoGmail], undefined);
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM emails WHERE id = ANY($1::uuid[])`, [[correoImap, correoGmail]])).rows[0].n, 2);
});
