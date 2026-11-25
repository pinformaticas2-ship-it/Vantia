// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Variables de documentos (25/11/2026): desactivar una variable, darle un valor
// fijo, crear variables propias (fijas o de cada expediente) y que todo eso
// llegue al relleno de las plantillas (resolverValor).
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
let otraOrg: string;
let exp: string;
let router: any;
const ROL: Record<string, string> = { pv_jefa: 'propietario', pv_miembro: 'miembro' };

/** El manejador final (y los intermedios, sin requireAuth) de una ruta del router. */
function ruta(metodo: string, path: string) {
  const capa = router.stack.find((l: any) => l.route?.path === path && l.route.methods[metodo]);
  if (!capa) throw new Error(`sin ruta ${metodo} ${path}`);
  return capa.route.stack.slice(1).map((s: any) => s.handle); // [0] = requireAuth
}

function call(metodo: string, path: string, userId: string, extra: any = {}): Promise<{ status: number; body: any }> {
  const handlers = ruta(metodo, path);
  return new Promise((resolve) => {
    let status = 200;
    const res: any = {
      status(s: number) { status = s; return res; },
      json(b: any) { resolve({ status, body: b }); return res; },
    };
    const req = { headers: {}, socket: {}, query: {}, params: {}, body: {}, auth: { userId }, organizacionId: org, organizacionRol: ROL[userId], ...extra };
    let i = 0;
    const next = () => { const h = handlers[i++]; if (h) Promise.resolve(h(req, res, next)); };
    next();
  });
}

before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  ({ default: router } = await import('../src/routes/plantillas'));
  org = (await pool.query(`INSERT INTO organizaciones (nombre, nif_cif, telefono) VALUES ('Despacho Variables', 'B12345678', '965 000 000') RETURNING id`)).rows[0].id;
  otraOrg = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Otro despacho') RETURNING id`)).rows[0].id;
  for (const [u, r] of Object.entries(ROL)) await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,$2,$3)`, [org, u, r]);
  exp = (await pool.query(
    `INSERT INTO expedientes (organizacion_id, anio, num_exp, cliente_nombre, contrario, num_autos) VALUES ($1, 2026, 7, 'Ana Cliente', 'Banco Contrario', '123/2026') RETURNING id`,
    [org],
  )).rows[0].id;
});

after(async () => { if (pool) await pool.end(); });

test('por defecto cada variable sale de Vantia', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const ctx = await d.contextoPlantilla(org, exp);
  const r = d.resolverValor('Empresa_Nombre', ctx, new Map(), await d.configVariables(org));
  assert.deepEqual([r.valor, r.origen], ['Despacho Variables', 'vantia']);
  assert.equal(d.resolverValor('Contrarios_Nombre', ctx, new Map(), new Map()).valor, 'Banco Contrario');
  assert.equal(d.vantiaLaConoce('Juzgados_Núm_Autos'), true);
  assert.equal(d.vantiaLaConoce('WIZINK_TAE_DEL_CONTRATO'), false);
});

test('solo propietario/admin pueden cambiar variables; los miembros solo verlas', { skip }, async () => {
  const no = await call('put', '/variables/:clave', 'pv_miembro', { params: { clave: 'EMPRESA_NOMBRE' }, body: { nombre: 'Empresa_Nombre', activa: false } });
  assert.equal(no.status, 403);
  const ver = await call('get', '/variables', 'pv_miembro');
  assert.equal(ver.status, 200);
  assert.equal(ver.body.data.canManage, false);
  const nombre = ver.body.data.variables.find((v: any) => v.clave === 'EMPRESA_NOMBRE');
  assert.equal(nombre.actual, 'Despacho Variables', 'enseña lo que sale hoy de Mi Despacho');
  assert.equal(nombre.automatica, true);
  assert.ok(ver.body.data.variables.length > 300, 'lista todas las macros de MN');
});

test('valor fijo: manda sobre Mi Despacho y lo escrito a mano; quitarlo vuelve a Vantia', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const r = await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'EMPRESA_NOMBRE' }, body: { nombre: 'Empresa_Nombre', modo: 'fijo', valor: 'Despacho Variables, S.L.P.' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ctx = await d.contextoPlantilla(org, exp);
  const guardados = new Map([['EMPRESA_NOMBRE', 'escrito a mano']]);
  let v = d.resolverValor('Empresa_Nombre', ctx, guardados, await d.configVariables(org));
  assert.deepEqual([v.valor, v.origen], ['Despacho Variables, S.L.P.', 'fijo']);
  // Lo escrito al generar sigue mandando (es una corrección puntual).
  v = d.resolverValor('Empresa_Nombre', ctx, guardados, await d.configVariables(org), 'Solo hoy');
  assert.equal(v.valor, 'Solo hoy');
  // No afecta a otra organización.
  assert.equal((await d.configVariables(otraOrg)).size, 0);
  // Volver a automático: sin fila.
  await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'EMPRESA_NOMBRE' }, body: { nombre: 'Empresa_Nombre', modo: 'auto', activa: true } });
  assert.equal((await pool.query(`SELECT 1 FROM plantillas_variables WHERE organizacion_id = $1`, [org])).rowCount, 0);
});

test('desactivada: Vantia no la rellena y no se pide en el expediente', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'CONTRARIOS_NOMBRE' }, body: { nombre: 'Contrarios_Nombre', activa: false } });
  await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'WIZINK_TAE_DEL_CONTRATO' }, body: { nombre: 'WIZINK_TAE_DEL_CONTRATO', activa: false } });
  const ctx = await d.contextoPlantilla(org, exp);
  const v = d.resolverValor('Contrarios_Nombre', ctx, new Map(), await d.configVariables(org));
  assert.deepEqual([v.valor, v.origen], [undefined, 'desactivada']);
  const datos = await call('get', '/datos/:id', 'pv_jefa', { params: { id: exp } });
  assert.ok(!datos.body.data.campos.some((c: any) => c.clave === 'WIZINK_TAE_DEL_CONTRATO'));
  // Un nombre que no es de la variable: rechazado.
  const mal = await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'EMPRESA_NIF_CIF' }, body: { nombre: 'Otra_Cosa', activa: false } });
  assert.equal(mal.status, 400);
});

test('variables propias: fija para todo el despacho o de cada expediente', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const fija = await call('post', '/variables', 'pv_jefa', { body: { nombre: 'Horario de atención', modo: 'fijo', valor: 'L-V 9:00-14:00' } });
  assert.equal(fija.status, 200, JSON.stringify(fija.body));
  assert.equal(fija.body.data.nombre, 'Horario_de_atención', 'los espacios pasan a "_"');
  const suelta = await call('post', '/variables', 'pv_jefa', { body: { nombre: 'Horario', modo: 'fijo', valor: 'x' } });
  assert.equal(suelta.body.data.nombre, 'Propio_Horario', 'sin "_" las plantillas no la reconocerían');
  const porExp = await call('post', '/variables', 'pv_jefa', { body: { nombre: 'Asunto_Juez_ponente', etiqueta: 'Juez ponente', modo: 'expediente' } });
  assert.equal(porExp.status, 200);
  // Duplicada o que pisa una de Vantia/MN: no.
  assert.equal((await call('post', '/variables', 'pv_jefa', { body: { nombre: 'Asunto_Juez_ponente' } })).status, 409);
  assert.equal((await call('post', '/variables', 'pv_jefa', { body: { nombre: 'Empresa_Horario' } })).status, 409);
  assert.equal((await call('post', '/variables', 'pv_jefa', { body: { nombre: 'Cliente_Nombre_Corto' } })).status, 409);

  // La "de cada expediente" sale en Datos para documentos y se guarda allí.
  const datos = await call('get', '/datos/:id', 'pv_jefa', { params: { id: exp } });
  const campo = datos.body.data.campos[0];
  assert.deepEqual([campo.grupo, campo.etiqueta, campo.nombre], ['Variables del despacho', 'Juez ponente', 'Asunto_Juez_ponente']);
  await call('put', '/datos/:id', 'pv_jefa', { params: { id: exp }, body: { valores: { Asunto_Juez_ponente: 'D. Pedro Ruiz' } } });

  const ctx = await d.contextoPlantilla(org, exp);
  const guardados = await d.valoresGuardados(org, exp);
  const config = await d.configVariables(org);
  assert.equal(d.resolverValor('Horario_de_atención', ctx, guardados, config).valor, 'L-V 9:00-14:00');
  assert.deepEqual(d.resolverValor('Asunto_Juez_ponente', ctx, guardados, config).valor, 'D. Pedro Ruiz');

  // Se rellenan de verdad en un .docx.
  const { rellenarPlantilla, camposDePlantilla } = await import('../src/services/plantillasWord');
  const AdmZip = (await import('adm-zip')).default;
  const z = new AdmZip();
  z.addFile('word/document.xml', Buffer.from('<w:document><w:body><w:p><w:r><w:t>Horario: «Horario_de_atención». Ponente: «Asunto_Juez_ponente»</w:t></w:r></w:p></w:body></w:document>'));
  const docx = z.toBuffer();
  const nombres = camposDePlantilla(docx);
  assert.deepEqual(nombres.sort(), ['Asunto_Juez_ponente', 'Horario_de_atención']);
  const { claveCanonica } = await import('../src/services/plantillasWord');
  const valores: Record<string, string> = {};
  for (const n of nombres) valores[claveCanonica(n)] = d.resolverValor(n, ctx, guardados, config).valor || '';
  const xml = new AdmZip(rellenarPlantilla(docx, valores)).readAsText('word/document.xml');
  assert.match(xml, /Horario: L-V 9:00-14:00\. Ponente: D\. Pedro Ruiz/);

  // Se ven en la lista y se pueden borrar.
  const lista = (await call('get', '/variables', 'pv_jefa')).body.data.variables;
  assert.equal(lista.filter((v: any) => v.tipo === 'propia').length, 3);
  await call('delete', '/variables/:clave', 'pv_jefa', { params: { clave: 'HORARIO_DE_ATENCION' } });
  assert.equal((await d.configVariables(org)).has('HORARIO_DE_ATENCION'), false);
});
