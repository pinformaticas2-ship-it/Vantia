// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Documentos y skills de la IA (30/10/2026): skills iniciales por despacho,
// solo gestores las editan, documentos aislados por despacho, HTML limpio,
// exportación a Word, guardado en el expediente y la IA (Gemini simulado)
// recibe la skill, el estilo y los datos reales del expediente.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
  process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'vt-docs-'));
}

let pool: any;
let org: string;
let otraOrg: string;
let expediente: string;
let d: any;
let s: any;

function call(handler: any, opts: { params?: any; body?: any; query?: any; org?: string; user?: string; rol?: string } = {}): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    let status = 200;
    const headers: Record<string, string> = {};
    const res: any = {
      status(x: number) { status = x; return res; },
      json(b: any) { resolve({ status, body: b, headers }); return res; },
      setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
      send(b: any) { resolve({ status, body: b, headers }); return res; },
    };
    Promise.resolve(handler({
      headers: {}, socket: {}, query: opts.query || {}, params: opts.params || {}, body: opts.body || {},
      auth: { userId: opts.user || 'doc_ana' }, organizacionId: opts.org || org, organizacionRol: opts.rol || 'propietario',
    }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre, nif_cif) VALUES ('Despacho Docs','B12345678') RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Otro despacho') RETURNING id`)).rows[0].id;
  const cliente = (await pool.query(
    `INSERT INTO entities (type, first_name, last_name, nif_cif, address_street, address_town, organizacion_id)
     VALUES ('CLIENTE','Lucía','Pérez','12345678Z','Calle Mayor 1','Valencia',$1) RETURNING id`, [org],
  )).rows[0].id;
  expediente = (await pool.query(
    `INSERT INTO expedientes (anio, num_exp, descripcion, cliente_id, juzgado, cuantia_principal, organizacion_id)
     VALUES (2026, 31, 'Reclamación factura impagada', $1, 'Juzgado de 1ª Instancia nº 3 de Valencia', 4200, $2) RETURNING id`,
    [cliente, org],
  )).rows[0].id;
  const act = await import('../src/controllers/activityController');
  (act.getClerk().users as any).getUser = async (id: string) => ({ id, firstName: 'Ana', lastName: 'Test', emailAddresses: [] });
  d = await import('../src/controllers/documentosController');
  s = await import('../src/controllers/skillsController');
});

after(async () => { if (pool) await pool.end(); });

test('skills: cada despacho empieza con las suyas y solo gestores las cambian', { skip }, async () => {
  const r = await call(s.listarSkills);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.skills.length, s.SKILLS_INICIALES.length);
  assert.ok(r.body.data.skills.some((k: any) => k.categoria === 'estilo'));
  // Una segunda vez no duplica, y el otro despacho tiene las suyas aparte
  assert.equal((await call(s.listarSkills)).body.data.skills.length, s.SKILLS_INICIALES.length);
  assert.equal((await call(s.listarSkills, { org: otraOrg })).body.data.skills.length, s.SKILLS_INICIALES.length);

  assert.equal((await call(s.crearSkill, { rol: 'miembro', body: { nombre: 'X', instrucciones: 'Y' } })).status, 403);
  assert.equal((await call(s.crearSkill, { body: { nombre: 'Sin instrucciones' } })).status, 400);
  const nueva = await call(s.crearSkill, { body: { nombre: 'Recurso de reposición', instrucciones: 'Plazo de 5 días.', categoria: 'documento', en_chat: false } });
  assert.equal(nueva.status, 201);
  const id = nueva.body.data.id;
  assert.equal((await call(s.actualizarSkill, { params: { id }, org: otraOrg, body: { nombre: 'Robada' } })).status, 404, 'otro despacho');
  assert.equal((await call(s.actualizarSkill, { params: { id }, body: { activa: false } })).body.data.activa, false);
  assert.ok(!(await s.skillsActivas(org)).some((k: any) => k.id === id), 'desactivada no se usa');
  const bloque = await s.bloqueSkillsParaChat(org);
  assert.match(bloque, /SKILLS DEL DESPACHO/);
  assert.doesNotMatch(bloque, /Recurso de reposición/);
  assert.equal((await call(s.borrarSkill, { params: { id }, rol: 'miembro' })).status, 403);
  assert.equal((await call(s.borrarSkill, { params: { id } })).status, 200);
});

test('documentos: crear, guardar, buscar y aislamiento entre despachos', { skip }, async () => {
  const r = await call(d.crearDocumento, { body: {
    titulo: 'Burofax a Construcciones Sur',
    contenido: '<p onclick="alert(1)">Muy señores míos</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>',
    expedienteId: expediente,
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const doc = r.body.data;
  assert.equal(doc.contenido.includes('onclick'), false);
  assert.equal(doc.contenido.includes('<script'), false);
  assert.equal(doc.contenido.includes('javascript:'), false);
  assert.match(doc.expediente, /2026\/31/);

  assert.equal((await call(d.crearDocumento, { body: { expedienteId: expediente }, org: otraOrg })).status, 404, 'expediente de otro despacho');
  assert.equal((await call(d.verDocumento, { params: { id: doc.id }, org: otraOrg })).status, 404);
  assert.equal((await call(d.verDocumento, { params: { id: 'no-es-uuid' } })).status, 404);
  assert.equal((await call(d.actualizarDocumento, { params: { id: doc.id }, org: otraOrg, body: { titulo: 'x' } })).status, 404);
  assert.equal((await call(d.listarDocumentos, { org: otraOrg })).body.data.length, 0);

  const upd = await call(d.actualizarDocumento, { params: { id: doc.id }, body: { contenido: '<h1>Requerimiento</h1><p>Le requerimos el pago.</p>' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.actualizadoPor, 'Ana Test');
  const lista = await call(d.listarDocumentos, { query: { q: 'requerimos' } });
  assert.equal(lista.body.data.length, 1);
  assert.match(lista.body.data[0].extracto, /Le requerimos el pago/);
  assert.equal((await call(d.listarDocumentos, { query: { expedienteId: expediente } })).body.data.length, 1);
});

test('documentos: exportar a Word y guardarlo en el expediente', { skip }, async () => {
  const doc = (await call(d.crearDocumento, { body: { titulo: 'Demanda / verbal', contenido: '<h1>DEMANDA</h1><p style="text-align: justify">Hechos.</p><table><tr><td>A</td></tr></table>' } })).body.data;
  const w = await call(d.exportarDocx, { params: { id: doc.id } });
  assert.equal(w.status, 200);
  assert.ok(Buffer.isBuffer(w.body));
  assert.equal(w.body.subarray(0, 2).toString(), 'PK', 'un .docx es un zip');
  assert.match(w.headers['content-disposition'], /Demanda%20verbal\.docx/);

  assert.equal((await call(d.guardarEnExpediente, { params: { id: doc.id } })).status, 400, 'sin expediente');
  assert.equal((await call(d.guardarEnExpediente, { params: { id: doc.id }, body: { expedienteId: expediente }, org: otraOrg })).status, 404);
  const g = await call(d.guardarEnExpediente, { params: { id: doc.id }, body: { expedienteId: expediente } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const { rows } = await pool.query(`SELECT original_name, mimetype FROM client_files WHERE id=$1`, [g.body.data.archivoId]);
  assert.equal(rows[0].original_name, 'Demanda verbal.docx');
  assert.equal((await call(d.verDocumento, { params: { id: doc.id } })).body.data.expedienteId, expediente, 'queda vinculado');
});

test('documentos: la IA recibe skill, estilo y datos del expediente', { skip }, async () => {
  const skills = (await call(s.listarSkills)).body.data.skills;
  const demanda = skills.find((k: any) => k.nombre.startsWith('Demanda de juicio verbal'));
  const prompts: string[] = [];
  const realFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'test';
  (global as any).fetch = async (_url: string, init: any) => {
    prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '```html\n<h1>DEMANDA DE JUICIO VERBAL</h1><p>Doña Lucía Pérez...</p><script>x</script>\n```' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }), { status: 200 });
  };
  try {
    assert.equal((await call(d.generarConIa, { body: { modo: 'nuevo' } })).status, 400, 'sin indicaciones ni skill');
    const r = await call(d.generarConIa, { body: { modo: 'nuevo', skillId: demanda.id, expedienteId: expediente, instrucciones: 'Reclama la factura 23/2026' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.html, '<h1>DEMANDA DE JUICIO VERBAL</h1><p>Doña Lucía Pérez...</p>');
    assert.equal(r.body.data.tituloSugerido, 'DEMANDA DE JUICIO VERBAL');
    const p = prompts[0];
    assert.match(p, /SKILL ELEGIDA — «Demanda de juicio verbal/);
    assert.match(p, /ESTILO DEL DESPACHO/);
    assert.match(p, /12345678Z/, 'NIF del cliente');
    assert.match(p, /Juzgado de 1ª Instancia nº 3 de Valencia/);
    assert.match(p, /Despacho Docs/);
    assert.match(p, /Reclama la factura 23\/2026/);

    assert.equal((await call(d.generarConIa, { body: { modo: 'reescribir', instrucciones: 'más formal' } })).status, 400, 'sin selección');
    assert.equal((await call(d.generarConIa, { body: { modo: 'nuevo', instrucciones: 'x', expedienteId: expediente }, org: otraOrg })).status, 404);

    // Desde Chat IA
    const c = await d.crearDocumentoDesdeChat(org, 'doc_ana', 'Carta', '<p>Hola</p>', expediente);
    assert.equal(c.url, `/dashboard/documentos/${c.id}`);
    assert.equal(c.expedienteVinculado, true);
    const otra = await d.crearDocumentoDesdeChat(otraOrg, 'doc_ana', 'Carta', '<p>Hola</p>', expediente);
    assert.equal(otra.expedienteVinculado, false, 'no se vincula a un expediente de otro despacho');
  } finally {
    (global as any).fetch = realFetch;
  }
});
