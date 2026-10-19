// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Ajustes (14/10/2026): preferencias personales nuevas y "Datos y privacidad"
// (retención de la trazabilidad y exportación de los datos del despacho).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.PGSSL = process.env.PGSSL || 'false';
}

let pool: any;
let org: string;
const ROL: Record<string, string> = { aj_jefa: 'propietario', aj_miembro: 'miembro' };

function call(handler: any, userId: string, extra: any = {}): Promise<{ status: number; body: any; headers: Record<string, string>; raw?: string }> {
  return new Promise((resolve) => {
    let status = 200;
    const headers: Record<string, string> = {};
    const res: any = {
      status(s: number) { status = s; return res; },
      setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
      json(b: any) { resolve({ status, body: b, headers }); return res; },
      send(t: string) { resolve({ status, body: null, headers, raw: t }); return res; },
    };
    Promise.resolve(handler({ headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, organizacionRol: ROL[userId], ...extra }, res));
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  org = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Ajustes prueba') RETURNING id`)).rows[0].id;
  for (const [u, r] of Object.entries(ROL)) await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,$2,$3)`, [org, u, r]);
  await pool.query(`INSERT INTO entities (type, first_name, nif_cif, organizacion_id) VALUES ('CLIENTE','Cliente export',$2,$1)`, [org, 'AJ' + (Date.now() % 1e7)]);
  await pool.query(
    `INSERT INTO activity_log (user_id, user_name, action_type, event_type, organizacion_id, created_at) VALUES
       ('aj_miembro','M','Antiguo','ACTION',$1, NOW() - INTERVAL '20 months'),
       ('aj_miembro','M','Reciente','ACTION',$1, NOW() - INTERVAL '2 months')`,
    [org],
  );
});

after(async () => { if (pool) await pool.end(); });

test('preferencias personales: por defecto, cambios parciales y valores no válidos', { skip }, async () => {
  const p = await import('../src/controllers/preferencesController');
  const ini = await call(p.getMyExtras, 'aj_miembro');
  assert.deepEqual(ini.body.data, { modo: 'claro', inicio: '/dashboard', primerDia: 'lunes', atajos: true, cargo: '', telefono: '', texto: 'normal' });
  await call(p.updateMyExtras, 'aj_miembro', { body: { modo: 'oscuro', inicio: '/dashboard/agenda' } });
  const r = await call(p.updateMyExtras, 'aj_miembro', { body: { cargo: '  Abogada  ', telefono: '+34 600 <b>11 22 33', inicio: 'https://malo.example', modo: 'neón' } });
  assert.equal(r.body.data.modo, 'oscuro', 'un valor no válido no pisa el guardado');
  assert.equal(r.body.data.inicio, '/dashboard/agenda', 'solo páginas de la lista');
  assert.equal(r.body.data.cargo, 'Abogada');
  assert.equal(r.body.data.telefono, '+34 600 11 22 33');
  // Tamaño del texto: solo los de la lista
  assert.equal((await call(p.updateMyExtras, 'aj_miembro', { body: { texto: 'grande' } })).body.data.texto, 'grande');
  assert.equal((await call(p.updateMyExtras, 'aj_miembro', { body: { texto: 'enorme' } })).body.data.texto, 'grande');
});

test('datos y privacidad: solo propietario/admin; retención borra lo antiguo', { skip }, async () => {
  const p = await import('../src/controllers/privacidadController');
  assert.equal((await call(p.getPrivacidad, 'aj_miembro')).status, 403);
  assert.equal((await call(p.putPrivacidad, 'aj_jefa', { body: { retencionMeses: 7 } })).status, 400);
  const r = await call(p.putPrivacidad, 'aj_jefa', { body: { retencionMeses: 12 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.borrados, 1);
  const { rows } = await pool.query(`SELECT action_type FROM activity_log WHERE organizacion_id = $1 AND user_id = 'aj_miembro'`, [org]);
  assert.deepEqual(rows.map((x: any) => x.action_type), ['Reciente']);
  assert.equal((await call(p.getPrivacidad, 'aj_jefa')).body.data.retencionMeses, 12);
});

test('exportar: JSON del despacho, sin secretos y solo de esta organización', { skip }, async () => {
  const p = await import('../src/controllers/privacidadController');
  assert.equal((await call(p.exportarDatos, 'aj_miembro')).status, 403);
  const r = await call(p.exportarDatos, 'aj_jefa');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /attachment; filename="vantia-Ajustes_prueba-/);
  const j = JSON.parse(r.raw!);
  assert.equal(j.datos.clientes_y_contactos.length, 1);
  assert.equal(j.datos.clientes_y_contactos[0].first_name, 'Cliente export');
  assert.ok(j.datos.clientes_y_contactos.every((c: any) => c.organizacion_id === org));
  assert.ok(!/password|token/i.test(Object.keys(j.datos.miembros[0] || {}).join(',')));
});
