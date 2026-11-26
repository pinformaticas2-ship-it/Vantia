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

test('por plantilla: desactivada, valor propio o activa solo en esa plantilla', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const ctx = await d.contextoPlantilla(org, exp);
  const A = ['Encargos', 'Hoja de encargo.doc'].join(String.fromCharCode(92)), B = 'nube:otra'; // ruta con barra de Windows
  const put = (body: any, u = 'pv_jefa') => call('put', '/variables-plantilla', u, { body });
  assert.equal((await put({ plantilla: A, nombre: 'Juzgados_Núm_Autos', estado: 'off' }, 'pv_miembro')).status, 403);
  assert.equal((await put({ plantilla: A, nombre: 'Juzgados_Núm_Autos', estado: 'off' })).status, 200);
  assert.equal((await put({ plantilla: A, nombre: 'Empresa_Nombre', estado: 'fijo', valor: 'Solo en la hoja de encargo' })).status, 200);
  // En general Contrarios_Nombre está desactivada (test anterior): en A se activa.
  assert.equal((await put({ plantilla: '/Encargos/Hoja de encargo.doc', nombre: 'Contrarios_Nombre', estado: 'on' })).status, 200);

  const cA = await d.configParaPlantilla(org, A);
  assert.equal(d.resolverValor('Juzgados_Núm_Autos', ctx, new Map(), cA).origen, 'desactivada');
  assert.equal(d.resolverValor('Empresa_Nombre', ctx, new Map(), cA).valor, 'Solo en la hoja de encargo');
  assert.equal(d.resolverValor('Contrarios_Nombre', ctx, new Map(), cA).valor, 'Banco Contrario', 'la misma ruta con otras barras es la misma plantilla');
  // Otra plantilla: lo general.
  const cB = await d.configParaPlantilla(org, B);
  assert.equal(d.resolverValor('Juzgados_Núm_Autos', ctx, new Map(), cB).valor, '123/2026');
  assert.equal(d.resolverValor('Empresa_Nombre', ctx, new Map(), cB).valor, 'Despacho Variables');
  assert.equal(d.resolverValor('Contrarios_Nombre', ctx, new Map(), cB).origen, 'desactivada');
  // La lista general avisa de cuántas plantillas la cambian.
  const lista = (await call('get', '/variables', 'pv_jefa')).body.data.variables;
  assert.equal(lista.find((v: any) => v.clave === 'EMPRESA_NOMBRE').enPlantillas, 1);
  // Volver a lo general.
  await put({ plantilla: A, nombre: 'Juzgados_Núm_Autos', estado: 'general' });
  assert.equal(d.resolverValor('Juzgados_Núm_Autos', ctx, new Map(), await d.configParaPlantilla(org, A)).valor, '123/2026');
});

test('por plantilla: una variable se rellena con otro dato de Vantia', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const ctx = await d.contextoPlantilla(org, exp);
  const put = (body: any) => call('put', '/variables-plantilla', 'pv_jefa', { body });
  const P = 'nube:con-dato';
  // «Nombre_Deudor» no la conoce Vantia: en esta plantilla, que salga el nombre del cliente.
  assert.equal((await put({ plantilla: P, nombre: 'Nombre_Deudor', estado: 'dato', valor: 'Nombre_Deudor' })).status, 400, 'no consigo misma');
  assert.equal((await put({ plantilla: P, nombre: 'Nombre_Deudor', estado: 'dato', valor: '' })).status, 400);
  assert.equal((await put({ plantilla: P, nombre: 'Nombre_Deudor', estado: 'dato', valor: 'Clientes_Nombre' })).status, 200);
  const r = d.resolverValor('Nombre_Deudor', ctx, new Map(), await d.configParaPlantilla(org, P));
  assert.deepEqual([r.valor, r.origen], ['Ana Cliente', 'dato']);
  // Lo escrito al generar sigue mandando; en otra plantilla no cambia nada.
  assert.equal(d.resolverValor('Nombre_Deudor', ctx, new Map(), await d.configParaPlantilla(org, P), 'A mano').valor, 'A mano');
  assert.equal(d.resolverValor('Nombre_Deudor', ctx, new Map(), await d.configParaPlantilla(org, 'nube:otra')).origen, 'vacio');
});

test('editor: convertir texto en variable (una vez o todas) y quitarla', { skip }, async () => {
  const { reemplazarTextoPlantilla, parrafosDePlantilla, camposDePlantilla, esNombreMarcador } = await import('../src/services/plantillasWord');
  const AdmZip = (await import('adm-zip')).default;
  const z = new AdmZip();
  // "Ana Cliente" partido en dos trozos con formato distinto, y repetido.
  z.addFile('word/document.xml', Buffer.from('<w:document><w:body>'
    + '<w:p><w:r><w:t>Don/Doña </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Ana </w:t></w:r><w:r><w:t>Cliente, mayor de edad &amp; vecina.</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Firma: Ana Cliente</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Ref. «Expediente_Ref» de Ana Cliente</w:t></w:r></w:p>'
    + '</w:body></w:document>'));
  z.addFile('word/footer1.xml', Buffer.from('<w:ftr><w:p><w:r><w:t>Pie de Ana Cliente</w:t></w:r></w:p></w:ftr>'));
  const docx = z.toBuffer();
  const ps = parrafosDePlantilla(docx);
  assert.deepEqual(ps.map((p) => p.texto), ['Don/Doña Ana Cliente, mayor de edad & vecina.', 'Firma: Ana Cliente', 'Ref. «Expediente_Ref» de Ana Cliente', 'Pie de Ana Cliente']);
  assert.equal(ps[3].parte, 'word/footer1.xml', 'los pies van después del cuerpo');

  // Solo la selección
  const uno = reemplazarTextoPlantilla(docx, { parte: 'word/document.xml', parrafo: 0, desde: 9, hasta: 20, esperado: 'Ana Cliente', nuevo: '«Clientes_Nombre»' });
  assert.equal(uno.cambios, 1);
  assert.deepEqual(parrafosDePlantilla(uno.docx).map((p) => p.texto).slice(0, 2), ['Don/Doña «Clientes_Nombre», mayor de edad & vecina.', 'Firma: Ana Cliente']);
  assert.match(new AdmZip(uno.docx).readAsText('word/document.xml'), /&amp; vecina/, 'el resto sigue escapado');
  // Todas las veces (también en el pie)
  const todas = reemplazarTextoPlantilla(docx, { parte: 'word/document.xml', parrafo: 0, desde: 9, hasta: 20, esperado: 'Ana Cliente', nuevo: '«Clientes_Nombre»', todas: true });
  assert.equal(todas.cambios, 4);
  assert.deepEqual(camposDePlantilla(todas.docx).sort(), ['Clientes_Nombre', 'Expediente_Ref']);
  // Si el texto ya no es el que se vio, no se toca nada.
  assert.throws(() => reemplazarTextoPlantilla(docx, { parte: 'word/document.xml', parrafo: 1, desde: 0, hasta: 5, esperado: 'Otra!', nuevo: '«A_B»' }), /ha cambiado/);
  assert.throws(() => reemplazarTextoPlantilla(docx, { parte: '../evil.xml', parrafo: 0, desde: 0, hasta: 1, esperado: 'D', nuevo: 'x' }), /no válida/);
  // Quitar una variable y dejar texto
  const p2 = parrafosDePlantilla(uno.docx)[0];
  const ini = p2.texto.indexOf('«Clientes_Nombre»');
  const quitada = reemplazarTextoPlantilla(uno.docx, { parte: p2.parte, parrafo: p2.i, desde: ini, hasta: ini + '«Clientes_Nombre»'.length, esperado: '«Clientes_Nombre»', nuevo: 'Pepe' });
  assert.equal(parrafosDePlantilla(quitada.docx)[0].texto, 'Don/Doña Pepe, mayor de edad & vecina.');
  assert.equal(esNombreMarcador('Clientes_Nombre'), true);
  assert.equal(esNombreMarcador('Sin guion'), false);
});

test('editor: las plantillas integradas no se editan (son de todos los despachos)', { skip }, async () => {
  const r = await call('post', '/editor/texto', 'pv_jefa', { body: { path: 'Encargos/Hoja.docx', accion: 'marcar', nombre: 'A_B', esperado: 'x' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /comunes a todos los despachos/);
  assert.equal((await call('post', '/editor/texto', 'pv_miembro', { body: { path: 'nube:x' } })).status, 403);
  assert.equal((await call('get', '/lista', 'pv_miembro')).status, 403);
});

// ── Fórmulas (26/11/2026) ────────────────────────────────────────────────────

test('fórmulas: funciones de texto, condiciones, importes y fechas', async () => {
  const { evaluarFormula, analizarFormula, nombresFunciones } = await import('../src/services/plantillasFormulas');
  const v: Record<string, string> = { Clientes_Nombre: 'ANA DE LA FUENTE', Clientes_Sexo: 'Mujer', 'Empresa_NIF/CIF': 'B1', Cuantia_X: '1.234,50 €', F_X: '05/03/2026', Vacia_X: '' };
  const ev = (f: string) => evaluarFormula(f, (n) => v[n]);
  assert.equal(ev('{DON_DONA(Clientes_Sexo)} {NOMPROPIO(Clientes_Nombre)}'), 'doña Ana de la Fuente');
  assert.equal(ev('{EUROS_LETRAS(Cuantia_X)} ({IMPORTE(Cuantia_X)})'), 'mil doscientos treinta y cuatro euros con cincuenta céntimos (1.234,50 €)');
  assert.equal(ev('{EUROS_LETRAS(21)}|{EUROS_LETRAS(1000000)}|{LETRAS(21)}'), 'veintiún euros|un millón de euros|veintiuno');
  assert.equal(ev('{FECHA_LARGA(F_X)}|{FECHA_LETRAS(F_X)}|{SUMAR_MESES("31/01/2026"; 1)}'), '5 de marzo de 2026|cinco de marzo de dos mil veintiséis|28/02/2026');
  assert.equal(ev('{SI(Cuantia_X > 1000; "verbal"; "otro")} {Cuantia_X * 2}'), 'verbal 2469');
  assert.equal(ev('{«Empresa_NIF/CIF»}{SI_VACIO(Vacia_X; "-")}{TEXTO_SI(Vacia_X; ", tel ")}'), 'B1-');
  assert.equal(ev('{LISTA("Juan"; "Pedro"; "Isabel")}'), 'Juan, Pedro e Isabel');
  assert.equal(ev('{UPPER(Clientes_Nombre)} {IF(Clientes_Sexo = "mujer"; "F"; "M")} {{x}}'), 'ANA DE LA FUENTE F {x}', 'nombres en inglés y comparación sin mayúsculas');
  assert.deepEqual(analizarFormula('{A_B & «C/D»} {X_Y}').variables, ['A_B', 'C/D', 'X_Y']);
  for (const [f, re] of [['{NOEXISTE(1)}', /No existe la función/], ['{SI(1)}', /entre 2 y 3/], ['{1 +}', /incompleta/], ['a }', /Sobra una llave/], ['{"a}', /llave|comillas/]] as const) {
    assert.throws(() => analizarFormula(f), re, f);
  }
  // Las funciones de la ayuda del navegador existen todas aquí.
  const fs = await import('fs');
  const front = fs.readFileSync(require('path').join(__dirname, '../../frontend/src/lib/formulasVariables.ts'), 'utf8');
  const enAyuda = [...front.matchAll(/nombre: '([A-ZÑ_]+)', en: '([A-Z_]+)'/g)].map((m) => `${m[1]}/${m[2]}`).sort();
  assert.deepEqual(enAyuda, nombresFunciones().map((f) => `${f.nombre}/${f.en}`).sort());
});

test('fórmulas: variables calculadas, sin círculos y por plantilla', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const ctx = await d.contextoPlantilla(org, exp);
  const post = (body: any) => call('post', '/variables', 'pv_jefa', { body });
  // Una fórmula mal escrita no se guarda y dice dónde falla.
  const mal = await post({ nombre: 'Formula_Mala', modo: 'formula', valor: 'Hola {MAYUSCULAS(Clientes_Nombre}' });
  assert.equal(mal.status, 400);
  assert.match(mal.body.error, /paréntesis/);
  assert.equal(typeof mal.body.pos, 'number');
  assert.equal((await post({ nombre: 'Formula_Cliente', modo: 'formula', valor: '{MAYUSCULAS(Clientes_Nombre)} c/ {Contrarios_Nombre}' })).status, 200);
  // Una fórmula que usa otra, y dos que se usan entre sí (no se cuelga).
  assert.equal((await post({ nombre: 'Formula_Doble', modo: 'formula', valor: '[{Formula_Cliente}]' })).status, 200);
  await post({ nombre: 'Circulo_A', modo: 'formula', valor: 'A{Circulo_B}' });
  await post({ nombre: 'Circulo_B', modo: 'formula', valor: 'B{Circulo_A}' });
  // (Contrarios_Nombre está desactivada en general por un test anterior)
  const config = await d.configVariables(org);
  let r = d.resolverValor('Formula_Cliente', ctx, new Map(), config);
  assert.deepEqual([r.valor, r.origen], ['ANA CLIENTE c/ ', 'formula']);
  assert.equal(d.resolverValor('Formula_Doble', ctx, new Map(), config).valor, '[ANA CLIENTE c/ ]');
  assert.equal(d.resolverValor('Circulo_A', ctx, new Map(), config).valor, 'AB');
  // Una variable de Vantia transformada con su propio valor.
  const put = await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'CLIENTES_NOMBRE' }, body: { nombre: 'Clientes_Nombre', modo: 'formula', valor: '{MAYUSCULAS(Clientes_Nombre)}' } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  r = d.resolverValor('Clientes_Nombre', ctx, new Map(), await d.configVariables(org));
  assert.deepEqual([r.valor, r.origen], ['ANA CLIENTE', 'formula']);
  await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'CLIENTES_NOMBRE' }, body: { nombre: 'Clientes_Nombre', modo: 'auto' } });
  // Solo en una plantilla.
  const pp = await call('put', '/variables-plantilla', 'pv_jefa', { body: { plantilla: 'nube:f', nombre: 'Juzgados_Núm_Autos', estado: 'formula', valor: 'Autos {Juzgados_Núm_Autos}' } });
  assert.equal(pp.status, 200);
  assert.equal(d.resolverValor('Juzgados_Núm_Autos', ctx, new Map(), await d.configParaPlantilla(org, 'nube:f')).valor, 'Autos 123/2026');
  assert.equal(d.resolverValor('Juzgados_Núm_Autos', ctx, new Map(), await d.configParaPlantilla(org, 'nube:g')).valor, '123/2026');
  // Probar: con los datos de un expediente, sin guardar nada; marca las variables que no existen.
  const p = await call('post', '/variables/probar', 'pv_jefa', { body: { formula: '{NOMPROPIO(Clientes_Nombre)} {No_Existe_Nunca}', expedienteId: exp } });
  assert.equal(p.body.data.valor, 'Ana Cliente ');
  assert.deepEqual(p.body.data.variables.map((x: any) => [x.nombre, x.conocida]), [['Clientes_Nombre', true], ['No_Existe_Nunca', false]]);
  const pe = await call('post', '/variables/probar', 'pv_jefa', { body: { formula: '{SI(}' } });
  assert.ok(pe.body.data.error);
  assert.equal((await call('post', '/variables/probar', 'pv_miembro', { body: { formula: 'x' } })).status, 403);
  const ej = await call('get', '/variables/expedientes-ejemplo', 'pv_jefa');
  assert.deepEqual(ej.body.data.map((x: any) => x.id), [exp], 'solo los de su despacho');
});

test('variables de cada expediente: tipo de campo, opciones y valor por defecto', { skip }, async () => {
  const d = await import('../src/services/plantillasDatos');
  const r = await call('post', '/variables', 'pv_jefa', { body: {
    nombre: 'Asunto_Tipo_Juicio', modo: 'expediente',
    formato: { tipo: 'opciones', opciones: ['Verbal', 'Ordinario', 'Verbal', ''], defecto: '{SI(1 = 1; "Verbal")}', ayuda: 'Según la cuantía' },
  } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cfg = (await d.configVariables(org)).get('ASUNTO_TIPO_JUICIO')!;
  assert.deepEqual(cfg.formato, { tipo: 'opciones', opciones: ['Verbal', 'Ordinario'], defecto: '{SI(1 = 1; "Verbal")}', ayuda: 'Según la cuantía' });
  const ctx = await d.contextoPlantilla(org, exp);
  const config = await d.configVariables(org);
  const def = d.resolverValor('Asunto_Tipo_Juicio', ctx, new Map(), config);
  assert.deepEqual([def.valor, def.origen], ['Verbal', 'defecto']);
  assert.equal(d.resolverValor('Asunto_Tipo_Juicio', ctx, new Map([['ASUNTO_TIPO_JUICIO', 'Ordinario']]), config).valor, 'Ordinario');
  const datos = await call('get', '/datos/:id', 'pv_jefa', { params: { id: exp } });
  const campo = datos.body.data.campos.find((c: any) => c.clave === 'ASUNTO_TIPO_JUICIO');
  assert.equal(campo.formato.tipo, 'opciones');
  assert.equal(campo.porDefecto, 'Verbal');
  // Por defecto mal escrito: no se guarda.
  const mal = await call('put', '/variables/:clave', 'pv_jefa', { params: { clave: 'ASUNTO_TIPO_JUICIO' }, body: { formato: { tipo: 'texto', defecto: '{SI(' } } });
  assert.equal(mal.status, 400);
  assert.equal(mal.body.campo, 'defecto');
});
