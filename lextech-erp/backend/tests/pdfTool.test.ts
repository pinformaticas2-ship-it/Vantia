// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Herramienta PDF de documentos (06/10/2026): fusionar varios documentos,
// quitar/reordenar/girar páginas y numerar. El resultado se guarda como un
// documento NUEVO de la misma ficha; los originales no se tocan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vantia-pdftool-test-'));
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
  process.env.DATA_ROOT = tmp;
  process.env.TEMP_DIR = path.join(tmp, 'temp');
}

let pool: any;
let clienteId: string;
const ids: Record<string, string> = {};

function call(handler: any, extra: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res: any = {
      status(s: number) { status = s; return res; },
      setHeader() { return res; },
      json(b: any) { resolve({ status, body: b }); return res; },
      send(b: any) { resolve({ status, body: b }); return res; },
    };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, body: {}, auth: { userId: 'u1' }, organizacionRol: 'propietario', ...extra }, res));
  });
}

async function pdfConPaginas(n: number, ancho = 595): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([ancho, 842]);
  return Buffer.from(await d.save());
}
// PNG 1x1 rojo
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  const { UPLOADS_CLIENTS_ROOT } = await import('../src/config/paths');
  await runMigrations();
  const org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org PDF') RETURNING id`)).rows[0].id;
  clienteId = (await pool.query(`INSERT INTO entities (type, first_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Cliente PDF','P-${Date.now()}',$1) RETURNING id`, [org])).rows[0].id;
  const dir = path.join(UPLOADS_CLIENTS_ROOT, clienteId);
  fs.mkdirSync(dir, { recursive: true });
  const add = async (key: string, name: string, mime: string, buf: Buffer) => {
    const stored = `${key}${path.extname(name)}`;
    fs.writeFileSync(path.join(dir, stored), buf);
    ids[key] = (await pool.query(
      `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [clienteId, name, stored, mime, buf.length],
    )).rows[0].id;
  };
  await add('a', 'Demanda.pdf', 'application/pdf', await pdfConPaginas(3));
  await add('b', 'Poder.pdf', 'application/pdf', await pdfConPaginas(2, 842));
  await add('img', 'DNI.png', 'image/png', PNG);
  await add('zip', 'cosas.zip', 'application/zip', Buffer.from('PK'));
});

after(async () => {
  if (pool) await pool.end();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temporal */ }
});

async function resultado(body: any) {
  const { rows } = await pool.query(`SELECT stored_name FROM client_files WHERE id = $1`, [body.data.id]);
  const { UPLOADS_CLIENTS_ROOT } = await import('../src/config/paths');
  return PDFDocument.load(fs.readFileSync(path.join(UPLOADS_CLIENTS_ROOT, clienteId, rows[0].stored_name)));
}

test('fusiona documentos enteros (PDF + imagen) en el orden indicado', { skip }, async () => {
  const { runPdfTool } = await import('../src/controllers/pdfToolController');
  const r = await call(runPdfTool, {
    params: { clientId: clienteId },
    body: { nombre: 'Escrito completo', partes: [{ fileId: ids.b }, { fileId: ids.a }, { fileId: ids.img }], opciones: { numerarDocumentos: true, numerarPaginas: true } },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.original_name, 'Escrito completo.pdf');
  const pdf = await resultado(r.body);
  assert.equal(pdf.getPageCount(), 6);
  assert.equal(Math.round(pdf.getPage(0).getWidth()), 842, 'primero el Poder (apaisado)');
  assert.equal(Math.round(pdf.getPage(2).getWidth()), 595, 'después la Demanda');
  // Los originales siguen ahí.
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM client_files WHERE client_id = $1`, [clienteId]);
  assert.equal(rows[0].n, 5);
});

test('retoque de un documento: quitar, reordenar y girar páginas', { skip }, async () => {
  const { runPdfTool } = await import('../src/controllers/pdfToolController');
  const r = await call(runPdfTool, {
    params: { clientId: clienteId },
    body: { partes: [{ fileId: ids.a, paginas: [{ index: 2, rotacion: 90 }, { index: 0 }] }], opciones: { numerarPaginas: true } },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.original_name, 'Demanda (editado).pdf');
  const pdf = await resultado(r.body);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getPage(0).getRotation().angle, 90);
  assert.equal(pdf.getPage(1).getRotation().angle, 0);
});

test('errores claros', { skip }, async () => {
  const { runPdfTool, getFileAsPdf } = await import('../src/controllers/pdfToolController');
  const zip = await call(runPdfTool, { params: { clientId: clienteId }, body: { partes: [{ fileId: ids.zip }] } });
  assert.equal(zip.status, 422);
  assert.match(zip.body.error, /cosas\.zip/);
  const vacio = await call(runPdfTool, { params: { clientId: clienteId }, body: { partes: [] } });
  assert.equal(vacio.status, 400);
  // Un archivo de otra ficha no se puede usar.
  const otro = await call(runPdfTool, { params: { clientId: '00000000-0000-0000-0000-000000000000' }, body: { partes: [{ fileId: ids.a }] } });
  assert.equal(otro.status, 404);
  const asPdf = await call(getFileAsPdf, { params: { clientId: clienteId, fileId: ids.img } });
  assert.ok(Buffer.isBuffer(asPdf.body) && asPdf.body.subarray(0, 4).toString() === '%PDF');
});
