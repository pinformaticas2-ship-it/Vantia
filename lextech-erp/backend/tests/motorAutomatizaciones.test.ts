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
