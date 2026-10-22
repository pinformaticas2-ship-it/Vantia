// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Dosier del expediente para un proyecto de Claude (22/10/2026): todo el
// expediente en un Markdown, con el texto de sus PDF y Word; solo del propio
// despacho.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'vantia-dosier-'));
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
  process.env.UPLOADS_DIR = UPLOADS;
}

let pool: any;
let org: string;
let otraOrg: string;
let exp: string;
let expAjeno: string;

function call(handler: any, params: any, organizacionId: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = { status(s: number) { status = s; return res; }, json(b: any) { resolve({ status, body: b }); return res; } };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params, body: {}, auth: { userId: 'dc_ana' }, organizacionId }, res));
  });
}

/** Un .docx mínimo con un párrafo. */
function docx(texto: string): Buffer {
  const AdmZip = require('adm-zip');
  const z = new AdmZip();
  z.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  z.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  z.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`));
  return z.toBuffer();
}

async function pdf(texto: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const d = await PDFDocument.create();
  const p = d.addPage();
  p.drawText(texto, { x: 50, y: 700, size: 12, font: await d.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await d.save());
}

async function adjuntar(expedienteId: string, nombre: string, mime: string, buffer: Buffer) {
  const stored = `${Date.now()}-${nombre}`;
  fs.mkdirSync(path.join(UPLOADS, 'clients', expedienteId), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS, 'clients', expedienteId, stored), buffer);
  await pool.query(
    `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes, created_by, attachment_type)
     VALUES ($1,$2,$3,$4,$5,'dc_ana','Demanda')`,
    [expedienteId, nombre, stored, mime, buffer.length],
  );
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Dosier despacho') RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Otro despacho') RETURNING id`)).rows[0].id;
  exp = (await pool.query(
    `INSERT INTO expedientes (anio, num_exp, descripcion, cliente_nombre, contrario, juzgado, num_autos, organizacion_id, created_by)
     VALUES (2026, 7, 'Aimar VS Wizink', 'Aimar Pérez', 'Wizink Bank', 'JPI nº 3 de Palma', '123/2026', $1, 'dc_ana') RETURNING id`, [org],
  )).rows[0].id;
  expAjeno = (await pool.query(
    `INSERT INTO expedientes (anio, num_exp, descripcion, organizacion_id, created_by) VALUES (2026, 8, 'Ajeno', $1, 'dc_otro') RETURNING id`, [otraOrg],
  )).rows[0].id;
  await adjuntar(exp, 'demanda.pdf', 'application/pdf', await pdf('Se reclaman 4.500 euros por intereses usurarios'));
  await adjuntar(exp, 'contrato.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx('Tarjeta revolving con TAE del 26,82 %'));
  await adjuntar(exp, 'foto.png', 'image/png', Buffer.from('89504e47', 'hex'));
});

after(async () => {
  if (pool) await pool.end();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

test('dosier: datos del expediente y texto de sus PDF y Word', { skip }, async () => {
  const { getDosierClaude } = await import('../src/controllers/dosierClaudeController');
  const r = await call(getDosierClaude, { id: exp }, org);
  assert.equal(r.status, 200);
  const d = r.body.data;
  assert.equal(d.archivo, 'Expediente 2026-7.md');
  assert.match(d.contenido, /# Expediente 2026\/7 · Aimar VS Wizink/);
  assert.match(d.contenido, /\*\*Contrario:\*\* Wizink Bank/);
  assert.match(d.contenido, /\*\*Nº de autos:\*\* 123\/2026/);
  assert.match(d.contenido, /4\.500 euros por intereses usurarios/, 'texto del PDF');
  assert.match(d.contenido, /TAE del 26,82 %/, 'texto del Word');
  assert.match(d.contenido, /foto\.png \(imagen \(sin texto\)\)/, 'la imagen sale como sin texto');
  assert.deepEqual(d.documentos, { total: 3, conTexto: 2, sinTexto: 1 });
  assert.match(d.instrucciones, /expediente 2026\/7 «Aimar VS Wizink»/);
  assert.match(d.instrucciones, /Expediente 2026-7\.md/);
});

test('dosier: nunca el de otro despacho', { skip }, async () => {
  const { getDosierClaude } = await import('../src/controllers/dosierClaudeController');
  assert.equal((await call(getDosierClaude, { id: expAjeno }, org)).status, 404);
  assert.equal((await call(getDosierClaude, { id: 'no-es-un-id' }, org)).status, 400);
});
