// Ejecutar con: TEST_DATABASE_URL=postgres://... npm test   (desde lextech-erp/backend)
//
// Motor de automatizaciones propias (12/11/2026): validación del flujo,
// condiciones con ramas, plantillas, hora fija, esperas que se reanudan,
// webhooks solo a direcciones públicas, y que cada despacho solo ve lo suyo.
// Ojo: el código del servidor se importa DENTRO de los tests (si se importa
// arriba, antes de fijar la base de datos de pruebas, usaría backend/.env).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB && 'TEST_DATABASE_URL no definida (base de datos de pruebas desechable)';
if (TEST_DB) { process.env.DATABASE_URL = TEST_DB; process.env.PGSSL = process.env.PGSSL || 'false'; }

const m = () => import('../src/services/motorAutomatizaciones');

const flujoBase = (extra: any[] = [], aristas: any[] = []) => ({
  nodos: [{ id: 'd', tipo: 'disparador', config: { evento: 'cliente.creado' } }, ...extra],
  aristas,
});

test('validación: un disparador, pasos completos y nada hacia el disparador', { skip }, async () => {
  const { validarFlujo } = await m();
  assert.deepEqual(validarFlujo(flujoBase()).errores, []);
  assert.match(validarFlujo({ nodos: [], aristas: [] }).errores.join(' '), /un solo disparador/);
  const malo = validarFlujo(flujoBase([{ id: 'c', tipo: 'enviar_correo', config: { asunto: '' } }, { id: 'w', tipo: 'webhook', config: { url: 'http://x' } }], [{ de: 'c', a: 'd' }]));
  assert.match(malo.errores.join(' '), /asunto o mensaje/);
  assert.match(malo.errores.join(' '), /https/);
  assert.match(malo.errores.join(' '), /hacia el disparador/);
  assert.equal(validarFlujo(flujoBase([], [{ de: 'd', a: 'nadie' }])).flujo.aristas.length, 0, 'conexiones a nodos que no existen, fuera');
});

test('condiciones, plantillas (con HTML escapado) y hora fija', { skip }, async () => {
  const { cumpleCondicion, rellenar, proximaEjecucion } = await m();
  const ctx = { cliente: { nombre: '<b>Ana</b>', email: 'ana@example.com' }, tarea: { importe: '1500' } };
  assert.equal(cumpleCondicion(ctx, { campo: 'cliente.email', operador: 'contiene', valor: 'EXAMPLE' }), true);
  assert.equal(cumpleCondicion(ctx, { campo: 'cliente.telefono', operador: 'vacio' }), true);
  assert.equal(cumpleCondicion(ctx, { campo: 'tarea.importe', operador: 'mayor', valor: '1000' }), true);
  assert.equal(cumpleCondicion(ctx, { campo: 'cliente.nombre', operador: 'igual', valor: 'otro' }), false);
  assert.equal(rellenar('Hola {cliente.nombre}\n{nada.aqui}', ctx, true), 'Hola &lt;b&gt;Ana&lt;/b&gt;<br>');
  // Jueves 12/11/2026 10:00 UTC (11:00 Madrid): diaria a las 09:00 → mañana 08:00 UTC; semanal lunes → 16/11.
  const desde = new Date('2026-11-12T10:00:00Z');
  assert.equal(proximaEjecucion({ frecuencia: 'diaria', hora: '09:00' }, desde)?.toISOString(), '2026-11-13T08:00:00.000Z');
  assert.equal(proximaEjecucion({ frecuencia: 'semanal', dia: 1, hora: '09:00' }, desde)?.toISOString(), '2026-11-16T08:00:00.000Z');
});

let pool: any;
let orgA: string;
let orgB: string;
let cliente: string;
before(async () => {
  if (skip) return;
  ({ default: pool } = await import('../src/config/database'));
  const { runMigrations } = await import('../src/config/migrations');
  await runMigrations();
  orgA = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Motor A') RETURNING id`)).rows[0].id;
  orgB = (await pool.query(`INSERT INTO organizaciones (nombre) VALUES ('Motor B') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1,'mo_ana','propietario')`, [orgA]);
  cliente = (await pool.query(
    `INSERT INTO entities (type, first_name, email, nif_cif, organizacion_id) VALUES ('CLIENTE','Lucía','lucia@example.test',$2,$1) RETURNING id`,
    [orgA, 'MO' + (Date.now() % 1e7)],
  )).rows[0].id;
});
after(async () => { if (pool) await pool.end(); });

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('evento real: condición con ramas, tarea creada, espera que se reanuda; otro despacho no lo dispara', { skip }, async () => {
  const { validarFlujo, emitirConCliente, tickAutomatizaciones } = await m();
  const { flujo } = validarFlujo({
    nodos: [
      { id: 'd', tipo: 'disparador', config: { evento: 'cliente.creado' } },
      { id: 'c', tipo: 'condicion', config: { campo: 'cliente.email', operador: 'contiene', valor: '@example.test' } },
      { id: 't', tipo: 'crear_tarea', config: { titulo: 'Llamar a {cliente.nombre}', dias: 2, prioridad: 'alta' } },
      { id: 'n', tipo: 'crear_tarea', config: { titulo: 'No debería crearse' } },
      { id: 'e', tipo: 'esperar', config: { cantidad: 1, unidad: 'minutos' } },
      { id: 't2', tipo: 'crear_tarea', config: { titulo: 'Seguimiento de {cliente.nombre}' } },
    ],
    aristas: [{ de: 'd', a: 'c' }, { de: 'c', a: 't', rama: 'si' }, { de: 'c', a: 'n', rama: 'no' }, { de: 't', a: 'e' }, { de: 'e', a: 't2' }],
  });
  const id = (await pool.query(
    `INSERT INTO automatizaciones_flujos (organizacion_id, nombre, activo, evento, flujo) VALUES ($1,'Prueba',true,'cliente.creado',$2) RETURNING id`,
    [orgA, JSON.stringify(flujo)],
  )).rows[0].id;

  emitirConCliente(orgB, 'cliente.creado', {}, { clienteId: cliente }); // otro despacho: nada
  emitirConCliente(orgA, 'cliente.creado', {}, { clienteId: cliente }, 'mo_ana');
  for (let i = 0; i < 60; i++) {
    const { rows } = await pool.query(`SELECT estado FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [id]);
    if (rows[0] && rows[0].estado !== 'en_curso') break;
    await esperar(250);
  }
  await esperar(300);
  const tareas = async () => (await pool.query(`SELECT titulo, prioridad FROM client_tasks WHERE client_id = $1 ORDER BY created_at`, [cliente])).rows;
  assert.deepEqual(await tareas(), [{ titulo: 'Llamar a Lucía', prioridad: 'alta' }], 'solo la rama «sí», y aún no lo de después de esperar');
  const { rows: ej } = await pool.query(`SELECT estado, organizacion_id FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [id]);
  assert.equal(ej.length, 1);
  assert.equal(ej[0].estado, 'esperando');

  // Se adelanta la espera y el programador la reanuda.
  await pool.query(`UPDATE automatizaciones_esperas SET reanudar_at = NOW() - INTERVAL '1 second' WHERE flujo_id = $1`, [id]);
  await pool.query(`DELETE FROM tareas_turnos WHERE nombre = 'automatizaciones-motor'`).catch(() => {});
  await tickAutomatizaciones();
  assert.deepEqual((await tareas()).map((t: any) => t.titulo), ['Llamar a Lucía', 'Seguimiento de Lucía']);
  const { rows: fin } = await pool.query(`SELECT estado, jsonb_array_length(pasos) AS n FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [id]);
  assert.equal(fin[0].estado, 'ok');
  assert.equal(fin[0].n, 4, 'condición, tarea, espera y la tarea de después');
});

test('prueba sin efectos y webhook bloqueado a direcciones internas', { skip }, async () => {
  const { probarFlujo, validarFlujo } = await m();
  const { flujo } = validarFlujo({
    nodos: [
      { id: 'd', tipo: 'disparador', config: { evento: 'cliente.creado' } },
      { id: 'w', tipo: 'webhook', config: { url: 'https://127.0.0.1/robar' } },
      { id: 'c', tipo: 'enviar_correo', config: { para: 'cliente', asunto: 'Hola {cliente.nombre}', cuerpo: 'x' } },
    ],
    aristas: [{ de: 'd', a: 'w' }, { de: 'd', a: 'c' }],
  });
  const antes = (await pool.query(`SELECT COUNT(*)::int AS n FROM automatizaciones_ejecuciones`)).rows[0].n;
  const pasos = await probarFlujo(orgA, flujo);
  const w = pasos.find((p) => p.nodo === 'w')!;
  const c = pasos.find((p) => p.nodo === 'c')!;
  assert.equal(w.ok, false);
  assert.match(w.detalle, /no es pública/);
  assert.equal(c.ok, true);
  assert.match(c.detalle, /Se enviaría «Hola María López» a maria@example.com/);
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM automatizaciones_ejecuciones`)).rows[0].n, antes, 'probar no deja ejecuciones');
});

test('condiciones con varias reglas: «y» y «o»', { skip }, async () => {
  const { cumpleCondicion } = await m();
  const ctx = { cliente: { email: 'a@example.com', telefono: '' }, oportunidad: { valor: '2.500,00' } };
  const reglas = [{ campo: 'cliente.email', operador: 'no_vacio', valor: '' }, { campo: 'cliente.telefono', operador: 'no_vacio', valor: '' }];
  assert.equal(cumpleCondicion(ctx, { modo: 'y', reglas }), false);
  assert.equal(cumpleCondicion(ctx, { modo: 'o', reglas }), true);
  assert.equal(cumpleCondicion(ctx, { reglas: [{ campo: 'oportunidad.valor', operador: 'mayor', valor: '2000' }] }), true, 'importes con formato español');
});

test('se buscan: plazo que se acerca (una sola vez) y correo recibido desde que se activó', { skip }, async () => {
  const { validarFlujo, forzarBusqueda } = await m();
  const plazo = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await pool.query(`INSERT INTO client_tasks (client_id, client_name, titulo, plazo, estado, organizacion_id) VALUES ($1,'Lucía','Recurso de apelación',$2,'pendiente',$3)`, [cliente, plazo, orgA]);
  const crear = async (evento: string, config: any, titulo: string) => {
    const { flujo } = validarFlujo({ nodos: [{ id: 'd', tipo: 'disparador', config: { evento, ...config } }, { id: 't', tipo: 'crear_tarea', config: { titulo } }], aristas: [{ de: 'd', a: 't' }] });
    return (await pool.query(`INSERT INTO automatizaciones_flujos (organizacion_id, nombre, activo, evento, flujo, cursor_at) VALUES ($1,'B',true,$2,$3, NOW() - INTERVAL '1 minute') RETURNING id`, [orgA, evento, JSON.stringify(flujo)])).rows[0].id;
  };
  const fv = await crear('tarea.vence', { diasAntes: 2 }, 'Preparar: {tarea.titulo}');
  // Correo: sin cliente, la tarea no se puede crear → queda registrado el fallo (la ejecución existe).
  const fc = await crear('correo.recibido', {}, 'x');
  const acc = (await pool.query(`INSERT INTO email_accounts (organizacion_id, user_id, email, label, imap_host, imap_port, smtp_host, smtp_port, username, password_enc, active)
     VALUES ($1,'mo_ana','buzon@example.test','B','h',993,'h',465,'u','x',true) RETURNING id`, [orgA]).catch(() => ({ rows: [] as any[] }))).rows[0]?.id;
  if (acc) await pool.query(`INSERT INTO emails (account_id, user_id, folder, from_email, subject) VALUES ($1,'mo_ana','INBOX','juzgado@example.test','Notificación')`, [acc]);
  await forzarBusqueda();
  await forzarBusqueda();
  const tareas = (await pool.query(`SELECT titulo FROM client_tasks WHERE organizacion_id = $1 AND titulo LIKE 'Preparar:%'`, [orgA])).rows;
  assert.deepEqual(tareas.map((r: any) => r.titulo).sort(), ['Preparar: Llamar a Lucía', 'Preparar: Recurso de apelación'], 'cada tarea que vence en 2 días, una sola vez aunque se busque dos veces');
  if (acc) {
    const ej = (await pool.query(`SELECT pasos FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [fc])).rows;
    assert.equal(ej.length, 1, 'un correo, una ejecución');
    assert.match(ej[0].pasos[0].detalle, /cliente/);
  }
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [fv])).rows[0].n, 2);
});

test('probar con un registro real y resultados traducibles', { skip }, async () => {
  const { probarFlujo, validarFlujo, muestrasDe } = await m();
  const muestras = await muestrasDe(orgA, 'cliente.creado');
  assert.ok(muestras.some((x) => x.id === cliente));
  const { flujo } = validarFlujo({ nodos: [{ id: 'd', tipo: 'disparador', config: { evento: 'cliente.creado' } }, { id: 'c', tipo: 'enviar_correo', config: { asunto: 'Hola {cliente.nombre}', cuerpo: 'x' } }], aristas: [{ de: 'd', a: 'c' }] });
  const [p] = await probarFlujo(orgA, flujo, cliente);
  assert.equal(p.detalle, 'Se enviaría «Hola Lucía» a lucia@example.test');
  assert.equal(p.clave, 'Se enviaría «{asunto}» a {para}');
  assert.deepEqual(p.vars, { asunto: 'Hola Lucía', para: 'lucia@example.test' });
});

// IA simulada: nunca se llama a Google en las pruebas.
function simularIA(respuesta: (cuerpo: any) => string) {
  const real = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'prueba';
  (globalThis as any).fetch = async (url: any, init: any) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      const cuerpo = JSON.parse(init.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: respuesta(cuerpo) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } }), { status: 200 });
    }
    return real(url, init);
  };
  return () => { globalThis.fetch = real; delete process.env.GEMINI_API_KEY; };
}

test('paso de IA: su respuesta (sí/no) decide la condición siguiente', { skip }, async () => {
  const { probarFlujo, validarFlujo } = await m();
  const deshacer = simularIA((c) => (JSON.stringify(c).includes('María López') ? 'Sí, es urgente.' : 'no'));
  try {
    const { flujo } = validarFlujo({
      nodos: [
        { id: 'd', tipo: 'disparador', config: { evento: 'cliente.creado' } },
        { id: 'i', tipo: 'ia', config: { instrucciones: '¿Es urgente el caso de {cliente.nombre}?', formato: 'si_no', variable: 'urgente' } },
        { id: 'c', tipo: 'condicion', config: { reglas: [{ campo: 'ia.urgente', operador: 'igual', valor: 'sí' }] } },
        { id: 'a', tipo: 'aviso_equipo', config: { a: 'todos', titulo: 'Urgente: {cliente.nombre}' } },
      ],
      aristas: [{ de: 'd', a: 'i' }, { de: 'i', a: 'c' }, { de: 'c', a: 'a', rama: 'si' }],
    });
    const pasos = await probarFlujo(orgA, flujo);
    assert.equal(pasos[0].detalle, 'La IA respondería: «sí»');
    assert.equal(pasos[1].detalle, 'Se cumple → «Sí»');
    assert.match(pasos[2].detalle, /Urgente: María López/);
  } finally { deshacer(); }
});

test('«Créalo con IA»: lo que devuelve la IA se valida, se coloca y no inventa nada peligroso', { skip }, async () => {
  const { generarFlujoConIA } = await m();
  const deshacer = simularIA(() => JSON.stringify({
    nombre: 'Seguimiento', descripcion: 'x',
    nodos: [{ id: 'd', tipo: 'disparador', config: { evento: 'cliente.creado' } }, { id: 'e', tipo: 'esperar', config: { cantidad: 2, unidad: 'dias' } },
      { id: 't', tipo: 'crear_tarea', config: { titulo: 'Llamar a {cliente.nombre}' } }, { id: 'x', tipo: 'borrar_todo', config: {} }],
    aristas: [{ de: 'd', a: 'e' }, { de: 'e', a: 't' }, { de: 't', a: 'd' }],
  }));
  try {
    const r = await generarFlujoConIA(orgA, 'Cuando entre un cliente, espera 2 días y crea una tarea para llamarle', {});
    assert.equal(r.nombre, 'Seguimiento');
    assert.deepEqual(r.flujo.nodos.map((n) => n.tipo), ['disparador', 'esperar', 'crear_tarea'], 'tipos desconocidos, fuera');
    assert.ok(r.avisos.some((a) => /hacia el disparador/.test(a)));
    assert.ok(r.flujo.nodos.find((n) => n.id === 't')!.y! > r.flujo.nodos.find((n) => n.id === 'd')!.y!, 'colocado de arriba abajo');
  } finally { deshacer(); }
});

test('webhook entrante: con su token activa el flujo; sin él, nada', { skip }, async () => {
  const { validarFlujo, recibirWebhook } = await m();
  const { flujo } = validarFlujo({ nodos: [{ id: 'd', tipo: 'disparador', config: { evento: 'webhook.entrante' } }, { id: 'n', tipo: 'aviso_equipo', config: { a: 'todos', titulo: 'Formulario de {entrada.nombre}' } }], aristas: [{ de: 'd', a: 'n' }] });
  const token = flujo.nodos[0].config!.token;
  assert.match(token, /^[a-f0-9]{32}$/, 'se genera un token al guardar');
  const id = (await pool.query(`INSERT INTO automatizaciones_flujos (organizacion_id, nombre, activo, evento, flujo) VALUES ($1,'W',true,'webhook.entrante',$2) RETURNING id`, [orgA, JSON.stringify(flujo)])).rows[0].id;
  assert.equal((await recibirWebhook('0'.repeat(32), { nombre: 'X' })).status, 404);
  assert.equal((await recibirWebhook(token, { Nombre: '<b>Laura</b>', extra: { a: 1 } })).status, 202);
  for (let i = 0; i < 40; i++) { const { rows } = await pool.query(`SELECT pasos FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [id]); if (rows[0]?.pasos?.length) break; await esperar(100); }
  const { rows } = await pool.query(`SELECT pasos FROM automatizaciones_ejecuciones WHERE flujo_id = $1`, [id]);
  assert.match(rows[0].pasos[0].detalle, /Formulario de <b>Laura<\/b>/, 'los datos llegan como texto (el aviso no interpreta HTML)');
});

test('un flujo no puede dar vueltas (con una espera dentro, sería infinito)', { skip }, async () => {
  const { validarFlujo } = await m();
  const r = validarFlujo({ nodos: [{ id: 'd', tipo: 'disparador', config: { evento: 'manual' } }, { id: 'e', tipo: 'esperar', config: {} }, { id: 'v', tipo: 'aviso_equipo', config: { titulo: 'x' } }],
    aristas: [{ de: 'd', a: 'e' }, { de: 'e', a: 'v' }, { de: 'v', a: 'e' }] });
  assert.match(r.errores.join(' '), /volver a un paso anterior/);
});
