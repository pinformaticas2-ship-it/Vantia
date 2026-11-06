// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Tres funciones del 05/11/2026:
//  - Pago en efectivo a un procurador → recibo pendiente / solicitado / recibido.
//  - Idioma de comunicación del cliente (correo bilingüe).
//  - Escala de honorarios del despacho (Calculadora).
// Todo comprobando que un despacho no ve ni toca lo de otro.
//
// Necesita una base de datos DESECHABLE. Sin TEST_DATABASE_URL se salta.
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
let procA: string;
let procASinEmail: string;
let procB: string;

function call(handler: any, organizacionId: string, extra: any = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId: 'u1' }, organizacionId, organizacionRol: 'propietario', ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Despacho A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Despacho B') RETURNING id`)).rows[0].id;
  const proc = async (org: string, nombre: string, email: string | null) =>
    (await pool.query(
      `INSERT INTO directorio_profesionales (tipo, first_name, email, organizacion_id) VALUES ('PROCURADOR', $1, $2, $3) RETURNING id`,
      [nombre, email, org],
    )).rows[0].id;
  procA = await proc(orgA, 'Procuradora A', 'proc-a@example.test');
  procASinEmail = await proc(orgA, 'Procurador sin correo', null);
  procB = await proc(orgB, 'Procurador B', 'proc-b@example.test');
});

after(async () => { if (pool) await pool.end(); });

test('pago en efectivo al procurador: el recibo pasa por pendiente → recibido y se conserva al editar', { skip }, async () => {
  const f = await import('../src/controllers/facturacionController');
  const base = { num: 'G-1', proveedor: 'Procuradora A', fecha: '2026-11-05', total: 150, cat: 'Procurador', estado: 'pendiente', area: 'procesal', deducible: true };

  const creado = await call(f.createGasto, orgA, { body: { ...base, procuradorId: procA, formaPago: 'efectivo', concepto: 'Provisión de fondos' } });
  assert.equal(creado.status, 201);
  const g = creado.body.data;
  assert.equal(g.recibo_estado, 'pendiente');
  assert.equal(g.forma_pago, 'efectivo');

  // Por transferencia ya no hace falta recibo.
  const transf = await call(f.updateGasto, orgA, { params: { id: g.id }, body: { ...base, procuradorId: procA, formaPago: 'transferencia' } });
  assert.equal(transf.body.data.recibo_estado, null);

  // Vuelve a efectivo y se marca recibido; editar otra cosa no lo pierde.
  await call(f.updateGasto, orgA, { params: { id: g.id }, body: { ...base, procuradorId: procA, formaPago: 'efectivo' } });
  const recibido = await call(f.marcarReciboGasto, orgA, { params: { id: g.id }, body: { recibido: true } });
  assert.equal(recibido.body.data.recibo_estado, 'recibido');
  const editado = await call(f.updateGasto, orgA, { params: { id: g.id }, body: { ...base, total: 160, procuradorId: procA, formaPago: 'efectivo' } });
  assert.equal(editado.body.data.recibo_estado, 'recibido');

  const desmarcado = await call(f.marcarReciboGasto, orgA, { params: { id: g.id }, body: { recibido: false } });
  assert.equal(desmarcado.body.data.recibo_estado, 'pendiente');

  // Un gasto normal (sin procurador) en efectivo no pide recibo.
  const normal = await call(f.createGasto, orgA, { body: { ...base, num: 'G-2', formaPago: 'efectivo' } });
  assert.equal(normal.body.data.recibo_estado, null);
});

test('pedir el recibo: explica qué falta (correo del procurador, cuenta de correo del despacho)', { skip }, async () => {
  const f = await import('../src/controllers/facturacionController');
  const base = { num: 'G-3', proveedor: 'X', fecha: '2026-11-05', total: 80, cat: 'Procurador', estado: 'pendiente', area: 'procesal', formaPago: 'efectivo' };
  const sinEmail = (await call(f.createGasto, orgA, { body: { ...base, procuradorId: procASinEmail } })).body.data;
  const r1 = await call(f.solicitarReciboGasto, orgA, { params: { id: sinEmail.id } });
  assert.equal(r1.status, 400);
  assert.match(r1.body.error, /no tiene correo/);

  const conEmail = (await call(f.createGasto, orgA, { body: { ...base, num: 'G-4', procuradorId: procA } })).body.data;
  const r2 = await call(f.solicitarReciboGasto, orgA, { params: { id: conEmail.id } });
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /cuenta de correo/);
  const sigue = await pool.query(`SELECT recibo_estado FROM facturacion_gastos WHERE id = $1`, [conEmail.id]);
  assert.equal(sigue.rows[0].recibo_estado, 'pendiente', 'si no se envía, no se marca como solicitado');
});

test('aislamiento: procuradores, gastos y recibos de un despacho no cruzan al otro', { skip }, async () => {
  const f = await import('../src/controllers/facturacionController');
  // Un procurador del despacho B no se puede asociar desde el A.
  const ajeno = await call(f.createGasto, orgA, { body: { num: 'G-5', proveedor: 'X', fecha: '2026-11-05', total: 10, procuradorId: procB, formaPago: 'efectivo' } });
  assert.equal(ajeno.body.data.procurador_id, null);
  assert.equal(ajeno.body.data.recibo_estado, null);

  const gastoA = (await pool.query(`SELECT id FROM facturacion_gastos WHERE organizacion_id = $1 AND recibo_estado IS NOT NULL LIMIT 1`, [orgA])).rows[0].id;
  assert.equal((await call(f.marcarReciboGasto, orgB, { params: { id: gastoA }, body: { recibido: true } })).status, 404);
  assert.equal((await call(f.solicitarReciboGasto, orgB, { params: { id: gastoA } })).status, 404);

  const boot = await call(f.getBillingBootstrap, orgB);
  const nombres = (boot.body.data.procuradores || []).map((p: any) => p.first_name);
  assert.deepEqual(nombres, ['Procurador B']);
  assert.equal(JSON.stringify(boot.body.data.gastos).includes('Procuradora A'), false);
});

test('idioma del cliente: se guarda, se normaliza y solo se consulta dentro del despacho', { skip }, async () => {
  const entities = await import('../src/controllers/entities');
  const idioma = await import('../src/controllers/idiomaController');
  const cli = (await pool.query(
    `INSERT INTO entities (type, first_name, email, organizacion_id) VALUES ('CLIENTE','John','john@example.test',$1) RETURNING id`, [orgA],
  )).rows[0].id;
  assert.equal((await pool.query(`SELECT idioma FROM entities WHERE id = $1`, [cli])).rows[0].idioma, 'es', 'por defecto, español');

  await call(entities.updateEntity, orgA, { params: { id: cli }, body: { first_name: 'John', email: 'john@example.test', idioma: 'en' } });
  assert.equal((await pool.query(`SELECT idioma FROM entities WHERE id = $1`, [cli])).rows[0].idioma, 'en');
  await call(entities.updateEntity, orgA, { params: { id: cli }, body: { first_name: 'John', email: 'john@example.test', idioma: 'klingon' } });
  assert.equal((await pool.query(`SELECT idioma FROM entities WHERE id = $1`, [cli])).rows[0].idioma, 'es', 'un código desconocido vuelve a español');
  await call(entities.updateEntity, orgA, { params: { id: cli }, body: { first_name: 'John', email: 'john@example.test', idioma: 'fr' } });

  const desdeA = await call(idioma.idiomasDestinatarios, orgA, { query: { emails: 'John <JOHN@example.test>, otro@example.test' } });
  assert.deepEqual(desdeA.body.data.map((d: any) => [d.email, d.idioma]), [['john@example.test', 'fr']]);
  const desdeB = await call(idioma.idiomasDestinatarios, orgB, { query: { emails: 'john@example.test' } });
  assert.deepEqual(desdeB.body.data, []);

  // Sin clave de IA, traducir avisa en vez de fallar en silencio. (Se quita
  // aquí: cargar la configuración de la BD vuelve a leer el .env.)
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const t = await call(idioma.traducirTexto, orgA, { body: { texto: 'Hola', idioma: 'en' } });
  assert.equal(t.status, 503);
  // Traducir al español un correo recibido ya no se rechaza por idioma (solo falta la IA).
  const alEs = await call(idioma.traducirTexto, orgA, { body: { texto: 'Dear Sir', idioma: 'es' } });
  assert.equal(alEs.status, 503);
});

test('escala de honorarios: solo propietario/admin la cambian, se valida y es de cada despacho', { skip }, async () => {
  const org = await import('../src/controllers/organizacionesController');
  const escala = { nombre: 'Criterios prueba', minimo: 300, tramos: [{ hasta: 6000, pct: 15 }, { hasta: null, pct: 5 }] };

  const miembro = await call(org.putEscalaHonorarios, orgA, { organizacionRol: 'miembro', body: escala });
  assert.equal(miembro.status, 403);
  const mala = await call(org.putEscalaHonorarios, orgA, { body: { tramos: [{ hasta: 6000, pct: 15 }, { hasta: 3000, pct: 5 }, { hasta: null, pct: 1 }] } });
  assert.equal(mala.status, 400);
  const buena = await call(org.putEscalaHonorarios, orgA, { body: escala });
  assert.equal(buena.status, 200);

  const leidaA = await call(org.getEscalaHonorarios, orgA, { organizacionRol: 'miembro' });
  assert.equal(leidaA.body.data.escala.nombre, 'Criterios prueba');
  assert.equal(leidaA.body.data.puedeEditar, false);
  const leidaB = await call(org.getEscalaHonorarios, orgB);
  assert.equal(leidaB.body.data.escala, null);
});

test('correo: las sugerencias de destinatarios solo traen clientes del despacho activo', { skip }, async () => {
  const email = await import('../src/controllers/emailController');
  await pool.query(
    `INSERT INTO entities (type, first_name, email, organizacion_id) VALUES ('CLIENTE','Cliente Secreto A','secreto.a@example.test',$1)`, [orgA],
  );
  const desdeA = await call(email.getRecipientSuggestions, orgA, { query: { q: 'secreto' } });
  assert.ok(JSON.stringify(desdeA.body).includes('secreto.a@example.test'));
  const desdeB = await call(email.getRecipientSuggestions, orgB, { query: { q: 'secreto' } });
  assert.equal(JSON.stringify(desdeB.body).includes('secreto.a@example.test'), false);
});

test('IA para la Calculadora de costas: valida lo que recibe y sin clave lo dice', { skip }, async () => {
  const ia = await import('../src/controllers/iaController');
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  assert.equal((await call(ia.iaJson, orgA, { body: { prompt: '' } })).status, 400);
  assert.equal((await call(ia.iaJson, orgA, { body: { prompt: 'x'.repeat(90_001) } })).status, 400);
  const sinClave = await call(ia.iaJson, orgA, { body: { prompt: 'Devuelve {"a":1}', imagenes: [{ mime: 'text/html', base64: 'PGgxPg==' }] } });
  assert.equal(sinClave.status, 503);
  assert.equal(sinClave.body.motivo, 'sin_clave');
});
