// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Imágenes de las firmas de correo (07/10/2026): se sirven sin sesión (las
// pide el correo del destinatario) y con caché larga; ids no válidos → 404.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
let id: string;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

function get(handler: any, file: string): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    let status = 200;
    const res: any = {
      set(h: any) { Object.assign(headers, h); return res; },
      removeHeader(k: string) { delete headers[k]; },
      status(s: number) { status = s; return res; },
      end() { resolve({ status, headers, body: null }); },
      send(b: any) { resolve({ status, headers, body: b }); },
    };
    handler({ params: { file } }, res);
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  const org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Org firmas') RETURNING id`)).rows[0].id;
  id = (await pool.query(`INSERT INTO firma_imagenes (organizacion_id, mimetype, size_bytes, data) VALUES ($1,'image/png',$2,$3) RETURNING id`, [org, PNG.length, PNG])).rows[0].id;
});
after(async () => { if (pool) await pool.end(); });

test('la imagen de una firma se sirve públicamente', { skip }, async () => {
  const { servirFirmaImagen } = await import('../src/routes/firmaImagenes');
  const r = await get(servirFirmaImagen, `${id}.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers['Content-Type'], 'image/png');
  assert.match(r.headers['Cache-Control'], /immutable/);
  assert.ok(Buffer.from(r.body).equals(PNG));
  assert.equal((await get(servirFirmaImagen, '../../etc/passwd')).status, 404);
  assert.equal((await get(servirFirmaImagen, '00000000-0000-0000-0000-000000000000.png')).status, 404);
});
