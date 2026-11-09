// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Traducción de documentos (06/11/2026): adjuntos (Word, PDF) y documentos del
// editor, en segundo plano, conservando el formato por bloques y con versión
// bilingüe. La IA (Gemini) se sustituye por una falsa: nunca se llama de verdad.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'vantia-trad-'));
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
  process.env.UPLOADS_DIR = UPLOADS;
}

let pool: any;
let orgA: string;
let orgB: string;
let expA: string;
const llamadas: string[] = [];

function call(handler: any, organizacionId: string, extra: any = {}, userId = 'u_trad'): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = {
      headersSent: false,
      status(s: number) { status = s; return res; },
      setHeader() { /* nada */ },
      json(b: any) { res.headersSent = true; resolve({ status, body: b }); return res; },
    };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId, ...extra }, res));
  });
}

/** IA falsa: «traduce» poniendo en mayúsculas el texto de cada fragmento. */
function iaFalsa() {
  const idiomas = require('../src/utils/idiomas');
  idiomas.pedirGemini = async (o: any) => {
    llamadas.push(o.texto.slice(0, 60));
    const arr = JSON.parse(o.texto.slice(o.texto.lastIndexOf('\n\n[') + 2));
    return { ok: true, texto: JSON.stringify(arr.map((h: string) => (h.includes('<') ? h.replace(/>([^<]+)</g, (_: string, t: string) => `>${t.toUpperCase()}<`) : h.toUpperCase()))) };
  };
}

async function esperarTrabajo(id: string, org: string) {
  const { estadoTraduccion } = await import('../src/controllers/traduccionesController');
  for (let i = 0; i < 100; i++) {
    const r = await call(estadoTraduccion, org, { params: { id } });
    if (r.body?.data?.estado !== 'en_curso') return r.body.data;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  throw new Error('no terminó');
}

function docx(parrafos: string[]): Buffer {
  const AdmZip = require('adm-zip');
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  z.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  z.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`));
  return z.toBuffer();
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Despacho A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Despacho B') RETURNING id`)).rows[0].id;
  expA = (await pool.query(`INSERT INTO expedientes (anio, num_exp, descripcion, organizacion_id) VALUES (2026, 7001, 'Exp A', $1) RETURNING id`, [orgA])).rows[0].id;
  process.env.GEMINI_API_KEY = 'clave-de-prueba';
  iaFalsa();
});

after(async () => { if (pool) await pool.end(); });

test('partirBloques: un bloque por elemento de primer nivel, texto suelto en <p>, vacíos fuera', { skip }, async () => {
  const { partirBloques, textoAHtml } = await import('../src/utils/traducirDocumento');
  const b = partirBloques('<h1>Título</h1><p>Uno <b>dos</b></p><p></p>suelto<ul><li>a</li><li>b <i>c</i></li></ul><table><tr><td>x</td></tr></table><br>');
  assert.deepEqual(b, ['<h1>Título</h1>', '<p>Uno <b>dos</b></p>', '<p>suelto</p>', '<ul><li>a</li><li>b <i>c</i></li></ul>', '<table><tr><td>x</td></tr></table>']);
  assert.equal(textoAHtml('Hola\nmundo\n\nA & B'), '<p>Hola<br>mundo</p>\n<p>A &amp; B</p>');
});

test('traducirBloques: varias tandas en orden, y parcial si el documento es enorme', { skip }, async () => {
  const { traducirBloques, MAX_CARACTERES } = await import('../src/utils/traducirDocumento');
  llamadas.length = 0;
  const bloques = Array.from({ length: 40 }, (_, i) => `<p>parrafo ${i} ${'x'.repeat(900)}</p>`);
  const r: any = await traducirBloques(bloques, 'en', 'Demanda');
  assert.equal(r.ok, true);
  assert.ok(llamadas.length >= 2, 'se reparte en tandas');
  assert.equal(r.traduccion.length, 40);
  assert.match(r.traduccion[0], /^<p>PARRAFO 0 /);
  assert.match(r.traduccion[39], /^<p>PARRAFO 39 /);
  assert.equal(r.parcial, false);
  const enorme = Array.from({ length: Math.ceil(MAX_CARACTERES / 5000) + 3 }, (_, i) => `<p>${i} ${'y'.repeat(5000)}</p>`);
  const r2: any = await traducirBloques(enorme, 'fr', 'Largo');
  assert.equal(r2.parcial, true);
  assert.ok(r2.traduccion.length < enorme.length);
});

test('componerHtml: aviso de traducción no jurada; bilingüe a dos columnas emparejadas', { skip }, async () => {
  const { componerHtml } = await import('../src/utils/traducirDocumento');
  const r = { original: ['<p>Hola</p>', '<p>Adiós</p>'], traduccion: ['<p>Hello</p>', '<p>Bye</p>'], parcial: false };
  // Solo la traducción: el mismo documento, sin añadir nada.
  const solo = componerHtml(r, { idioma: 'en', modo: 'traduccion', nombre: 'Carta' });
  assert.equal(solo.trim(), '<p>Hello</p>\n<p>Bye</p>');
  assert.match(componerHtml({ ...r, parcial: true }, { idioma: 'en', modo: 'traduccion', nombre: 'Carta' }), /Traducción parcial/);
  const bi = componerHtml(r, { idioma: 'en', modo: 'bilingue', nombre: 'Carta' });
  assert.match(bi, /<tr><td[^>]*><p>Hola<\/p><\/td><td[^>]*><p>Hello<\/p><\/td><\/tr>/);
  assert.match(bi, /English/);
  assert.match(bi, /No es una traducción jurada/);
});

/** Un Word «de verdad»: membrete en el encabezado, estilos, tabla, negrita a mitad de frase, tabulador, salto de página. */
function wordCompleto(): Buffer {
  const AdmZip = require('adm-zip');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'));
  z.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  z.addFile('word/_rels/document.xml.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'));
  z.addFile('word/styles.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Garamond"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`));
  z.addFile('word/header1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Despacho Pérez &amp; Asociados</w:t></w:r></w:p></w:hdr>`));
  z.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>
<w:p><w:pPr><w:pStyle w:val="Titulo"/><w:jc w:val="center"/></w:pPr><w:r><w:t>Contrato de arrendamiento</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">El arrendatario </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>pagará la renta</w:t></w:r><w:r><w:t xml:space="preserve"> cada mes.</w:t></w:r></w:p>
<w:p><w:r><w:t>Fecha:</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>uno de enero</w:t></w:r></w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>Renta</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1.200 €</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p/>
<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1417" w:left="1701"/></w:sectPr>
</w:body></w:document>`));
  return z.toBuffer();
}

test('Word «tal cual»: solo cambia el texto; formato, tablas, encabezado y márgenes intactos', { skip }, async () => {
  const { traducirDocx } = await import('../src/utils/traducirDocx');
  const original = wordCompleto();
  const r: any = await traducirDocx(original, 'en', 'Contrato');
  assert.equal(r.ok, true);
  assert.equal(r.sinFormatoInterior, 0);
  const AdmZip = require('adm-zip');
  const leer = (b: Buffer, p: string) => new AdmZip(b).getEntry(p).getData().toString('utf8');
  const doc = leer(r.buffer, 'word/document.xml');
  // Texto traducido, cada trozo en su tramo de formato (la negrita sigue siendo la negrita).
  assert.match(doc, /<w:t xml:space="preserve">CONTRATO DE ARRENDAMIENTO<\/w:t>/);
  assert.match(doc, /<w:t xml:space="preserve">EL ARRENDATARIO <\/w:t><\/w:r><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">PAGARÁ LA RENTA<\/w:t>/);
  assert.match(doc, /<w:tab\/>/);
  assert.match(doc, /UNO DE ENERO/);
  assert.match(doc, />RENTA<\/w:t>/);
  assert.match(doc, />1.200 €<\/w:t>/); // sin letras: no se toca
  assert.match(leer(r.buffer, 'word/header1.xml'), /<w:b\/><\/w:rPr><w:t xml:space="preserve">DESPACHO PÉREZ &amp; ASOCIADOS<\/w:t>/);
  // Todo lo que no es texto, idéntico.
  const sinTexto = (x: string) => x.replace(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g, '<w:t/>');
  assert.equal(sinTexto(doc), sinTexto(leer(original, 'word/document.xml')));
  assert.equal(leer(r.buffer, 'word/styles.xml'), leer(original, 'word/styles.xml').replace('es-ES', 'en-GB'));
  assert.equal(leer(r.buffer, 'word/_rels/document.xml.rels'), leer(original, 'word/_rels/document.xml.rels'));
});

test('repartir: si la IA pierde o reordena las etiquetas, el texto no se pierde', { skip }, async () => {
  const { repartir } = await import('../src/utils/traducirDocx');
  assert.deepEqual(repartir(2, '<g1>The tenant </g1><g2>will pay</g2>'), ['The tenant ', 'will pay']);
  assert.equal(repartir(2, '<g2>will pay</g2><g1>The tenant</g1>'), null);
  assert.equal(repartir(2, 'The tenant will pay'), null);
  assert.equal(repartir(2, '<g1>a</g1> suelto <g2>b</g2>'), null);
  assert.deepEqual(repartir(1, 'Hello'), ['Hello']);
});

test('traducir un Word adjunto al expediente: se adjunta la traducción (.docx) junto al original', { skip }, async () => {
  const { traducirArchivo } = await import('../src/controllers/traduccionesController');
  const stored = `orig-${Date.now()}.docx`;
  fs.mkdirSync(path.join(UPLOADS, 'clients', expA), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS, 'clients', expA, stored), docx(['Demanda de juicio ordinario', 'Primero. Hechos.']));
  const f = (await pool.query(
    `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes, created_by, document_name)
     VALUES ($1,'demanda.docx',$2,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',10,'u_trad','Demanda') RETURNING id`,
    [expA, stored],
  )).rows[0].id;

  const malo = await call(traducirArchivo, orgA, { params: { clientId: expA, fileId: f }, body: { idioma: 'xx' } });
  assert.equal(malo.status, 400);

  const r = await call(traducirArchivo, orgA, { params: { clientId: expA, fileId: f }, body: { idioma: 'en', modo: 'bilingue' } });
  assert.equal(r.status, 202);
  const fin = await esperarTrabajo(r.body.data.trabajoId, orgA);
  assert.equal(fin.estado, 'hecho', fin.error);
  assert.equal(fin.resultado.tipo, 'archivo');
  const nuevo = (await pool.query(`SELECT * FROM client_files WHERE id = $1`, [fin.resultado.archivoId])).rows[0];
  assert.equal(nuevo.client_id, expA);
  assert.equal(nuevo.document_name, 'Demanda (bilingüe EN)');
  assert.match(nuevo.original_name, /\.docx$/);
  const mammoth = require('mammoth');
  const texto = (await mammoth.extractRawText({ path: path.join(UPLOADS, 'clients', expA, nuevo.stored_name) })).value;
  assert.match(texto, /DEMANDA DE JUICIO ORDINARIO/);
  assert.match(texto, /Demanda de juicio ordinario/);
  assert.match(texto, /No es una traducción jurada/);

  // Otro usuario (aunque sea del mismo despacho) u otro despacho no ven el trabajo.
  const { estadoTraduccion } = await import('../src/controllers/traduccionesController');
  assert.equal((await call(estadoTraduccion, orgB, { params: { id: r.body.data.trabajoId } })).status, 404);
  assert.equal((await call(estadoTraduccion, orgA, { params: { id: r.body.data.trabajoId } }, 'otro')).status, 404);
  // Un archivo que no es de ese expediente: 404.
  const ajeno = await call(traducirArchivo, orgA, { params: { clientId: expA, fileId: '00000000-0000-4000-8000-000000000000' }, body: { idioma: 'en' } });
  assert.equal(ajeno.status, 404);
});

test('traducir un documento del editor crea otro documento; nunca el de otro despacho', { skip }, async () => {
  const { traducirDocumentoEditor } = await import('../src/controllers/traduccionesController');
  const d = (await pool.query(
    `INSERT INTO documentos (organizacion_id, titulo, contenido, expediente_id, created_by) VALUES ($1,'Contrato','<h2>Cláusulas</h2><p>Primera. Objeto.</p>',$2,'u_trad') RETURNING id`,
    [orgA, expA],
  )).rows[0].id;
  assert.equal((await call(traducirDocumentoEditor, orgB, { params: { id: d }, body: { idioma: 'en' } })).status, 404);
  const r = await call(traducirDocumentoEditor, orgA, { params: { id: d }, body: { idioma: 'de' } });
  assert.equal(r.status, 202);
  const fin = await esperarTrabajo(r.body.data.trabajoId, orgA);
  assert.equal(fin.estado, 'hecho', fin.error);
  const nuevo = (await pool.query(`SELECT * FROM documentos WHERE id = $1`, [fin.resultado.documentoId])).rows[0];
  assert.equal(nuevo.organizacion_id, orgA);
  assert.equal(nuevo.expediente_id, expA);
  assert.equal(nuevo.titulo, 'Contrato (DE)');
  assert.match(nuevo.contenido, /CLÁUSULAS/);
  assert.match(nuevo.contenido, /PRIMERA\. OBJETO\./);
});

test('sin clave de IA: 503 con mensaje claro y sin lanzar nada', { skip }, async () => {
  const { traducirDocumentoEditor } = await import('../src/controllers/traduccionesController');
  const guardada = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_API_KEY;
  try {
    const r = await call(traducirDocumentoEditor, orgA, { params: { id: '00000000-0000-4000-8000-000000000001' }, body: { idioma: 'en' } });
    // El documento no existe → 404 antes que nada; con uno real, 503.
    assert.equal(r.status, 404);
    const d = (await pool.query(`INSERT INTO documentos (organizacion_id, titulo, contenido, created_by) VALUES ($1,'X','<p>x</p>','u') RETURNING id`, [orgA])).rows[0].id;
    const r2 = await call(traducirDocumentoEditor, orgA, { params: { id: d }, body: { idioma: 'en' } });
    assert.equal(r2.status, 503);
    assert.match(r2.body.error, /clave/);
  } finally { process.env.GEMINI_API_KEY = guardada; }
});
