import dns from 'dns/promises';
import net from 'net';
import pool from '../config/database';
import { enviarCorreoDelDespacho, escaparHtml, SinCuentaCorreo } from '../utils/correoDespacho';
import { sendPushToUsers } from '../utils/webPush';
import { tomarTurno } from '../utils/turnos';
import { formatMadrid, madridLocalToDate, madridYmd } from './vistasAutomation';

// ── Motor de automatizaciones propias (12/11/2026) ─────────────────────────
// Un flujo es un grafo: un nodo «disparador» (cuándo empieza), nodos
// «condicion» (si… / si no…) y nodos de acción, unidos por conexiones. Lo
// dibuja y edita el lienzo de Ajustes → Automatizaciones.
//
// El código de Vantia avisa con emitirEvento(org, 'cliente.creado', datos) y
// aquí se ejecutan los flujos activos de ese despacho con ese disparador.
// «Esperar» guarda dónde se quedó y el programador lo reanuda a su hora.
// Las automatizaciones de serie pueden llevar pasos añadidos al final: son
// flujos «vinculados» cuyo disparador es el evento con el que termina la de
// serie (y solo corren si la de serie está activa).

export type TipoNodo = 'disparador' | 'condicion' | 'enviar_correo' | 'aviso_equipo' | 'crear_tarea' | 'mensaje_chat' | 'esperar' | 'webhook';
export interface Nodo { id: string; tipo: TipoNodo; config?: Record<string, any>; x?: number; y?: number }
export interface Arista { id?: string; de: string; a: string; rama?: 'si' | 'no' | null }
export interface Flujo { nodos: Nodo[]; aristas: Arista[]; layout?: Record<string, { x: number; y: number }> }

// ── Catálogo: disparadores y sus datos ──────────────────────────────────────
const V = (clave: string, etiqueta: string) => ({ clave, etiqueta });
const COMUNES = [V('despacho.nombre', 'Nombre del despacho'), V('fecha.hoy', 'Fecha de hoy'), V('usuario.nombre', 'Quién lo hizo')];
const CLIENTE = [V('cliente.nombre', 'Nombre del cliente'), V('cliente.email', 'Correo del cliente'), V('cliente.telefono', 'Teléfono del cliente'), V('cliente.nif', 'NIF del cliente')];

export const DISPARADORES: Record<string, { etiqueta: string; descripcion: string; variables: { clave: string; etiqueta: string }[]; ejemplo: Record<string, any> }> = {
  'cliente.creado': {
    etiqueta: 'Se da de alta un cliente', descripcion: 'A mano o con el formulario del enlace (no en importaciones CSV).',
    variables: [...CLIENTE, ...COMUNES],
    ejemplo: { cliente: { id: null, nombre: 'María López', email: 'maria@example.com', telefono: '600 11 22 33', nif: '12345678Z' } },
  },
  'expediente.creado': {
    etiqueta: 'Se crea un expediente', descripcion: 'Al abrir un expediente nuevo.',
    variables: [V('expediente.ref', 'Número de expediente'), V('expediente.descripcion', 'Asunto'), V('expediente.tipo', 'Tipo'), ...CLIENTE, ...COMUNES],
    ejemplo: { expediente: { id: null, ref: '2026/0042', descripcion: 'Reclamación de cantidad', tipo: 'judicial' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'cita.creada': {
    etiqueta: 'Se añade una cita a la agenda', descripcion: 'Cualquier evento nuevo de la Agenda (se puede filtrar por tipo con una condición).',
    variables: [V('cita.titulo', 'Título'), V('cita.tipo', 'Tipo'), V('cita.fecha', 'Fecha'), V('cita.hora', 'Hora'), V('cita.lugar', 'Lugar'), V('responsable.nombre', 'De quién es la cita'), ...CLIENTE, ...COMUNES],
    ejemplo: { cita: { titulo: 'Reunión inicial', tipo: 'reunion', fecha: 'jueves, 19 de noviembre', hora: '10:00', lugar: 'Despacho' }, cliente: { nombre: 'María López', email: 'maria@example.com' }, responsable: { nombre: 'Ana Pérez' } },
  },
  'tarea.creada': {
    etiqueta: 'Se crea una tarea', descripcion: 'Una tarea o plazo nuevo.',
    variables: [V('tarea.titulo', 'Título'), V('tarea.plazo', 'Plazo'), V('tarea.prioridad', 'Prioridad'), V('tarea.tipo', 'Tipo'), ...CLIENTE, ...COMUNES],
    ejemplo: { tarea: { titulo: 'Presentar escrito', plazo: '20/11/2026', prioridad: 'alta', tipo: 'plazo' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'vista.aceptada': {
    etiqueta: 'Se acepta una vista', descripcion: 'Cuando alguien acepta una vista recibida por correo.',
    variables: [V('vista.fecha', 'Fecha'), V('vista.hora', 'Hora'), V('vista.juzgado', 'Juzgado'), V('vista.autos', 'Autos'), V('expediente.ref', 'Expediente'), ...COMUNES],
    ejemplo: { vista: { fecha: 'martes, 1 de diciembre', hora: '10:30', juzgado: 'Juzgado de 1ª Instancia nº 3', autos: '945/2026' }, expediente: { ref: '2026/0042' } },
  },
  'recordatorio.enviado': {
    etiqueta: 'Se envía un recordatorio a un cliente', descripcion: 'Después de cada recordatorio de cita enviado.',
    variables: [V('cita.titulo', 'Título de la cita'), V('cita.fecha', 'Fecha'), V('cita.hora', 'Hora'), ...CLIENTE, ...COMUNES],
    ejemplo: { cita: { titulo: 'Reunión', fecha: 'jueves, 19 de noviembre', hora: '10:00' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'programado': {
    etiqueta: 'A una hora fija', descripcion: 'Cada día, cada semana o cada mes, a la hora que elijas.',
    variables: [...COMUNES], ejemplo: {},
  },
  'manual': {
    etiqueta: 'Al pulsar «Ejecutar ahora»', descripcion: 'Solo cuando lo lances tú desde el editor.',
    variables: [...COMUNES], ejemplo: {},
  },
};

/** Evento con el que termina cada automatización de serie. */
export const EVENTO_DE_SERIE: Record<string, string> = {
  vistas: 'vista.aceptada', docsBase: 'expediente.creado', bienvenida: 'cliente.creado', recordatorios: 'recordatorio.enviado',
};

export const TIPOS_NODO: TipoNodo[] = ['disparador', 'condicion', 'enviar_correo', 'aviso_equipo', 'crear_tarea', 'mensaje_chat', 'esperar', 'webhook'];
const MAX_NODOS = 60;
const MAX_PASOS_EJECUCION = 80;
const MAX_CORREOS_DIA = 100;

// ── Validación ──────────────────────────────────────────────────────────────
export function validarFlujo(raw: any): { flujo: Flujo; evento: string; errores: string[] } {
  const errores: string[] = [];
  const nodos: Nodo[] = (Array.isArray(raw?.nodos) ? raw.nodos : []).slice(0, MAX_NODOS)
    .filter((n: any) => n && typeof n.id === 'string' && TIPOS_NODO.includes(n.tipo))
    .map((n: any) => ({
      id: String(n.id).slice(0, 60), tipo: n.tipo,
      config: n.config && typeof n.config === 'object' ? JSON.parse(JSON.stringify(n.config)) : {},
      x: Number.isFinite(n.x) ? Math.round(n.x) : 0, y: Number.isFinite(n.y) ? Math.round(n.y) : 0,
    }));
  const ids = new Set(nodos.map((n) => n.id));
  const aristas: Arista[] = (Array.isArray(raw?.aristas) ? raw.aristas : [])
    .filter((a: any) => a && ids.has(a.de) && ids.has(a.a) && a.de !== a.a)
    .map((a: any) => ({ id: String(a.id || `${a.de}-${a.a}-${a.rama || ''}`).slice(0, 140), de: a.de, a: a.a, rama: a.rama === 'si' || a.rama === 'no' ? a.rama : null }));
  const layout: Flujo['layout'] = {};
  if (raw?.layout && typeof raw.layout === 'object') {
    for (const [k, v] of Object.entries(raw.layout).slice(0, 40)) {
      const p = v as any;
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) layout[String(k).slice(0, 60)] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  const disparadores = nodos.filter((n) => n.tipo === 'disparador');
  if (disparadores.length !== 1) errores.push('El flujo necesita un solo disparador («Cuando…»).');
  const evento = String(disparadores[0]?.config?.evento || '');
  if (disparadores.length === 1 && !DISPARADORES[evento]) errores.push('Elige qué pone en marcha el flujo.');
  if (aristas.some((a) => a.a === disparadores[0]?.id)) errores.push('Nada puede ir hacia el disparador: es el primer paso.');
  for (const n of nodos) {
    const c = n.config || {};
    if (n.tipo === 'enviar_correo' && (!String(c.asunto || '').trim() || !String(c.cuerpo || '').trim())) errores.push('Un «Enviar correo» no tiene asunto o mensaje.');
    if (n.tipo === 'enviar_correo' && c.para === 'otro' && !String(c.direcciones || '').includes('@')) errores.push('Un «Enviar correo» no tiene a quién enviarlo.');
    if (n.tipo === 'aviso_equipo' && !String(c.titulo || '').trim()) errores.push('Un «Avisar al equipo» no tiene título.');
    if (n.tipo === 'crear_tarea' && !String(c.titulo || '').trim()) errores.push('Un «Crear tarea» no tiene título.');
    if (n.tipo === 'mensaje_chat' && (!c.canalId || !String(c.texto || '').trim())) errores.push('Un «Escribir en el chat» no tiene canal o texto.');
    if (n.tipo === 'webhook' && !/^https:\/\/[^\s]+$/i.test(String(c.url || ''))) errores.push('Un «Webhook» necesita una dirección https://.');
    if (n.tipo === 'condicion' && !String(c.campo || '').trim()) errores.push('Una condición no tiene qué comprobar.');
  }
  return { flujo: { nodos, aristas, layout }, evento, errores: Array.from(new Set(errores)) };
}

// ── Programado: siguiente ejecución (hora de Madrid) ────────────────────────
function sumarDias(ymd: string, d: number) { const [y, m, dd] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); }
export function proximaEjecucion(cfg: any, desde = new Date()): Date | null {
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(cfg?.hora || '')) ? cfg.hora : '09:00';
  const frec = ['diaria', 'semanal', 'mensual'].includes(cfg?.frecuencia) ? cfg.frecuencia : 'diaria';
  let ymd = madridYmd(desde);
  for (let i = 0; i < 400; i++) {
    const cand = madridLocalToDate(ymd, hora);
    const [y, m, d] = ymd.split('-').map(Number);
    const diaSemana = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; // 1 = lunes
    const vale = frec === 'diaria' || (frec === 'semanal' && diaSemana === Number(cfg?.dia || 1)) || (frec === 'mensual' && d === Math.min(28, Number(cfg?.dia || 1)));
    if (vale && cand && cand.getTime() > desde.getTime()) return cand;
    ymd = sumarDias(ymd, 1);
  }
  return null;
}

// ── Plantillas: {cliente.nombre} → valor ────────────────────────────────────
export function valorDe(ctx: any, ruta: string): string {
  const v = ruta.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), ctx);
  return v === null || v === undefined ? '' : String(v);
}
export function rellenar(tpl: string, ctx: any, html = false): string {
  const out = String(tpl || '').replace(/\{([a-z_]+(?:\.[a-z_]+)+)\}/gi, (_m, ruta) => (html ? escaparHtml(valorDe(ctx, ruta)) : valorDe(ctx, ruta)));
  return html ? out.replace(/\n/g, '<br>') : out;
}

export function cumpleCondicion(ctx: any, c: any): boolean {
  const v = valorDe(ctx, String(c?.campo || '')).trim();
  const x = String(c?.valor ?? '').trim();
  const a = v.toLowerCase(), b = x.toLowerCase();
  const num = (s: string) => Number(s.replace(',', '.'));
  switch (c?.operador) {
    case 'distinto': return a !== b;
    case 'contiene': return a.includes(b);
    case 'no_contiene': return !a.includes(b);
    case 'vacio': return !a;
    case 'no_vacio': return Boolean(a);
    case 'mayor': return Number.isFinite(num(v)) && Number.isFinite(num(x)) && num(v) > num(x);
    case 'menor': return Number.isFinite(num(v)) && Number.isFinite(num(x)) && num(v) < num(x);
    case 'igual': default: return a === b;
  }
}

// ── Acciones ────────────────────────────────────────────────────────────────
export interface Paso { nodo: string; tipo: TipoNodo; ok: boolean; detalle: string; at: string }

async function direccionPublica(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return false;
    const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
    return ips.every((ip) => !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip));
  } catch { return false; }
}

async function usuariosPara(org: string, modo: string, ctx: any, personas: string[] = []): Promise<string[]> {
  if (modo === 'todos') {
    const { rows } = await pool.query(`SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1`, [org]);
    return rows.map((r: any) => r.user_id);
  }
  if (modo === 'personas') {
    const { rows } = await pool.query(`SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1 AND user_id = ANY($2::text[])`, [org, personas]);
    return rows.map((r: any) => r.user_id);
  }
  const id = modo === 'responsable' ? (ctx?.responsable?.id || ctx?.usuario?.id) : ctx?.usuario?.id;
  return id ? [String(id)] : [];
}

/** Ejecuta un nodo (o, en modo prueba, dice qué haría). Devuelve el detalle. */
async function ejecutarNodo(org: string, flujoId: string, n: Nodo, ctx: any, prueba: boolean): Promise<string> {
  const c = n.config || {};
  switch (n.tipo) {
    case 'enviar_correo': {
      const para = c.para === 'otro'
        ? String(c.direcciones || '').split(/[,;\s]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 10)
        : [valorDe(ctx, 'cliente.email')].filter((x) => x.includes('@'));
      if (!para.length) throw new Error('No hay a quién enviarlo (el cliente no tiene correo).');
      const asunto = rellenar(c.asunto, ctx);
      if (prueba) return `Se enviaría «${asunto}» a ${para.join(', ')}`;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM automatizaciones_ejecuciones e, jsonb_array_elements(e.pasos) p
          WHERE e.organizacion_id = $1 AND e.created_at > NOW() - INTERVAL '1 day' AND p->>'tipo' = 'enviar_correo' AND (p->>'ok')::boolean`,
        [org],
      );
      if ((rows[0]?.n || 0) >= MAX_CORREOS_DIA) throw new Error(`Límite de ${MAX_CORREOS_DIA} correos al día de las automatizaciones alcanzado.`);
      try {
        await enviarCorreoDelDespacho(org, { to: para, subject: asunto, html: rellenar(c.cuerpo, ctx, true) });
      } catch (e: any) {
        throw new Error(e instanceof SinCuentaCorreo ? 'El despacho no tiene correo conectado.' : (e?.message || String(e)));
      }
      return `Correo «${asunto}» enviado a ${para.join(', ')}`;
    }
    case 'aviso_equipo': {
      const ids = await usuariosPara(org, String(c.a || 'usuario'), ctx, Array.isArray(c.personas) ? c.personas : []);
      if (!ids.length) throw new Error('No hay a quién avisar.');
      const titulo = rellenar(c.titulo, ctx);
      if (prueba) return `Se avisaría a ${ids.length} persona(s): «${titulo}»`;
      await sendPushToUsers(ids, { title: titulo, body: rellenar(c.mensaje || '', ctx), url: /^\/[a-z]/i.test(String(c.enlace || '')) ? String(c.enlace) : '/dashboard', tag: `autom-${flujoId}-${Date.now()}` });
      return `Aviso «${titulo}» a ${ids.length} persona(s)`;
    }
    case 'crear_tarea': {
      const clienteId = ctx?.cliente?.id;
      if (!clienteId) throw new Error('Las tareas van ligadas a un cliente y este disparador no tiene cliente.');
      const titulo = rellenar(c.titulo, ctx).slice(0, 300);
      const dias = Math.max(0, Math.min(365, Number(c.dias) || 0));
      const plazo = sumarDias(madridYmd(new Date()), dias);
      const asignar = c.asignar === 'responsable' ? (ctx?.responsable?.id || ctx?.usuario?.id) : (c.asignar === 'usuario' || !c.asignar ? ctx?.usuario?.id : c.asignar);
      if (prueba) return `Se crearía la tarea «${titulo}» con plazo ${plazo}`;
      const { rows: cli } = await pool.query(`SELECT COALESCE(commercial_name, first_name || ' ' || COALESCE(last_name,'')) AS nombre FROM entities WHERE id = $1 AND organizacion_id = $2`, [clienteId, org]);
      if (!cli.length) throw new Error('El cliente ya no existe.');
      await pool.query(
        `INSERT INTO client_tasks (client_id, client_name, titulo, descripcion, plazo, estado, prioridad, expediente_id, created_by, user_id, organizacion_id)
         VALUES ($1,$2,$3,$4,$5,'pendiente',$6,$7,'Automatización',$8,$9)`,
        [clienteId, cli[0].nombre, titulo, rellenar(c.descripcion || '', ctx) || null, plazo,
          ['alta', 'media', 'baja'].includes(c.prioridad) ? c.prioridad : 'media', ctx?.expediente?.id || null, asignar || null, org],
      );
      return `Tarea «${titulo}» creada (plazo ${plazo})`;
    }
    case 'mensaje_chat': {
      const { rows } = await pool.query(`SELECT id, nombre FROM chat_canales WHERE id = $1 AND organizacion_id = $2`, [c.canalId, org]);
      if (!rows.length) throw new Error('El canal del chat ya no existe.');
      const texto = rellenar(c.texto, ctx).slice(0, 4000);
      if (prueba) return `Se escribiría en #${rows[0].nombre}: «${texto.slice(0, 80)}»`;
      await pool.query(`INSERT INTO chat_mensajes (canal_id, user_id, user_name, contenido) VALUES ($1, 'vantia-automatizaciones', 'Vantia · Automatización', $2)`, [rows[0].id, texto]);
      return `Mensaje en #${rows[0].nombre}`;
    }
    case 'webhook': {
      const url = String(c.url || '');
      if (!(await direccionPublica(url))) throw new Error('La dirección del webhook no es pública o no es https.');
      if (prueba) return `Se enviarían los datos a ${new URL(url).host}`;
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Vantia-Automatizaciones' },
        body: JSON.stringify({ evento: ctx?._evento, datos: Object.fromEntries(Object.entries(ctx || {}).filter(([k]) => !k.startsWith('_'))) }),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!r.ok) throw new Error(`El webhook respondió ${r.status}`);
      return `Datos enviados a ${new URL(url).host} (${r.status})`;
    }
    default: return '';
  }
}

function msEspera(c: any): number {
  const n = Math.max(1, Math.min(10_000, Number(c?.cantidad) || 1));
  const u = c?.unidad === 'dias' ? 86_400_000 : c?.unidad === 'horas' ? 3_600_000 : 60_000;
  return Math.min(n * u, 90 * 86_400_000);
}

/** Recorre el grafo desde `inicio` (ids de nodo). Devuelve los pasos hechos. */
async function recorrer(org: string, flujoId: string, flujo: Flujo, inicio: string[], ctx: any, prueba: boolean, ejecucionId: string | null): Promise<Paso[]> {
  const porId = new Map(flujo.nodos.map((n) => [n.id, n]));
  const pasos: Paso[] = [];
  const cola = [...inicio];
  let hechos = 0;
  while (cola.length && hechos < MAX_PASOS_EJECUCION) {
    const id = cola.shift()!;
    const n = porId.get(id);
    if (!n) continue;
    hechos++;
    const salidas = (rama?: 'si' | 'no' | null) => flujo.aristas.filter((a) => a.de === id && (rama === undefined || (a.rama || null) === rama)).map((a) => a.a);
    const at = new Date().toISOString();
    if (n.tipo === 'disparador') { cola.push(...salidas()); continue; }
    if (n.tipo === 'condicion') {
      const si = cumpleCondicion(ctx, n.config);
      pasos.push({ nodo: id, tipo: n.tipo, ok: true, detalle: si ? 'Se cumple → «Sí»' : 'No se cumple → «No»', at });
      cola.push(...salidas(si ? 'si' : 'no'));
      continue;
    }
    if (n.tipo === 'esperar') {
      const ms = msEspera(n.config);
      const siguientes = salidas();
      if (prueba) { pasos.push({ nodo: id, tipo: n.tipo, ok: true, detalle: `Esperaría ${Math.round(ms / 60000)} min y seguiría`, at }); cola.push(...siguientes); continue; }
      if (siguientes.length && ejecucionId) {
        await pool.query(
          `INSERT INTO automatizaciones_esperas (ejecucion_id, flujo_id, organizacion_id, nodos, contexto, reanudar_at) VALUES ($1,$2,$3,$4,$5, NOW() + $6 * INTERVAL '1 millisecond')`,
          [ejecucionId, flujoId, org, JSON.stringify(siguientes), JSON.stringify(ctx), ms],
        );
      }
      pasos.push({ nodo: id, tipo: n.tipo, ok: true, detalle: `En espera hasta ${formatMadrid(new Date(Date.now() + ms), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, at });
      continue;
    }
    try {
      const detalle = await ejecutarNodo(org, flujoId, n, ctx, prueba);
      pasos.push({ nodo: id, tipo: n.tipo, ok: true, detalle, at });
      cola.push(...salidas());
    } catch (e: any) {
      // Un paso que falla corta su rama, no las demás.
      pasos.push({ nodo: id, tipo: n.tipo, ok: false, detalle: String(e?.message || e).slice(0, 300), at });
    }
  }
  return pasos;
}

async function contextoBase(org: string, evento: string, datos: any, actorId?: string | null) {
  const { rows } = await pool.query(`SELECT nombre FROM organizaciones WHERE id = $1`, [org]);
  let usuario: any = actorId ? { id: actorId } : null;
  if (actorId) {
    try { const { resolveUserName } = await import('../controllers/activityController'); usuario = { id: actorId, nombre: await resolveUserName(actorId) }; } catch { /* sin nombre */ }
  }
  return {
    ...datos,
    usuario: datos?.usuario || usuario || {},
    despacho: { nombre: rows[0]?.nombre || '' },
    fecha: { hoy: formatMadrid(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
    _evento: evento,
  };
}

async function serieActiva(org: string, clave: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT vistas_auto_enabled, docs_base_config, automatizaciones FROM organizaciones WHERE id = $1`, [org]);
  const o = rows[0];
  if (!o) return false;
  if (clave === 'vistas') return Boolean(o.vistas_auto_enabled);
  if (clave === 'docsBase') return Boolean(o.docs_base_config?.activo);
  if (clave === 'bienvenida') return o.automatizaciones?.bienvenida?.activo !== false;
  if (clave === 'recordatorios') return o.automatizaciones?.recordatorios?.activo === true;
  return false;
}

/** Ejecuta un flujo guardado con unos datos. */
export async function ejecutarFlujo(row: { id: string; organizacion_id: string; flujo: Flujo; nombre?: string }, ctx: any, disparo: string): Promise<{ ejecucionId: string; pasos: Paso[] }> {
  const flujo = row.flujo;
  const disparador = flujo.nodos.find((n) => n.tipo === 'disparador');
  const { rows } = await pool.query(
    `INSERT INTO automatizaciones_ejecuciones (flujo_id, organizacion_id, estado, disparo) VALUES ($1,$2,'en_curso',$3) RETURNING id`,
    [row.id, row.organizacion_id, disparo.slice(0, 300)],
  );
  const ejecucionId = rows[0].id;
  const pasos = disparador ? await recorrer(row.organizacion_id, row.id, flujo, [disparador.id], ctx, false, ejecucionId) : [];
  const { rows: esp } = await pool.query(`SELECT 1 FROM automatizaciones_esperas WHERE ejecucion_id = $1 LIMIT 1`, [ejecucionId]);
  const estado = esp.length ? 'esperando' : pasos.some((p) => !p.ok) ? 'error' : 'ok';
  await pool.query(`UPDATE automatizaciones_ejecuciones SET estado = $2, pasos = $3, updated_at = NOW() WHERE id = $1`, [ejecucionId, estado, JSON.stringify(pasos)]);
  await pool.query(`UPDATE automatizaciones_flujos SET ultima_at = NOW(), ejecuciones = ejecuciones + 1 WHERE id = $1`, [row.id]);
  return { ejecucionId, pasos };
}

/** Prueba sin efectos: dice qué haría cada paso con los datos de ejemplo. */
export async function probarFlujo(org: string, flujo: Flujo, datos?: any): Promise<Paso[]> {
  const disparador = flujo.nodos.find((n) => n.tipo === 'disparador');
  if (!disparador) return [];
  const evento = String(disparador.config?.evento || 'manual');
  const ctx = await contextoBase(org, evento, datos || DISPARADORES[evento]?.ejemplo || {}, null);
  return recorrer(org, 'prueba', flujo, [disparador.id], ctx, true, null);
}

/**
 * Lo llama el resto de Vantia cuando pasa algo. Nunca lanza ni hace esperar:
 * las automatizaciones no pueden romper lo que las dispara.
 */
export function emitirEvento(org: string | null | undefined, evento: string, datos: any, actorId?: string | null): void {
  if (!org || !DISPARADORES[evento]) return;
  void (async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, organizacion_id, nombre, flujo, vinculada FROM automatizaciones_flujos WHERE organizacion_id = $1 AND evento = $2 AND activo`,
        [org, evento],
      );
      if (!rows.length) return;
      const ctx = await contextoBase(org, evento, datos, actorId);
      for (const r of rows) {
        if (r.vinculada && !(await serieActiva(org, r.vinculada))) continue;
        await ejecutarFlujo(r, ctx, DISPARADORES[evento].etiqueta).catch((e) => console.error('[automatizaciones]', r.id, e?.message || e));
      }
    } catch (e: any) { console.error('[automatizaciones] emitir', evento, e?.message || e); }
  })();
}

/** Igual que emitirEvento, pero añadiendo los datos del cliente (por su id o
 *  por el de su expediente). */
export function emitirConCliente(org: string | null | undefined, evento: string, datos: any, ref: { clienteId?: string | null; expedienteId?: string | null }, actorId?: string | null): void {
  if (!org) return;
  void (async () => {
    let cliente: any = null;
    try {
      let id = ref.clienteId || null;
      if (!id && ref.expedienteId) {
        const { rows } = await pool.query(`SELECT cliente_id FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [ref.expedienteId, org]);
        id = rows[0]?.cliente_id || null;
      }
      if (id) {
        const { rows } = await pool.query(
          `SELECT id, COALESCE(NULLIF(commercial_name, ''), TRIM(first_name || ' ' || COALESCE(last_name, ''))) AS nombre, email, phone AS telefono, nif_cif AS nif
             FROM entities WHERE id = $1 AND organizacion_id = $2`,
          [id, org],
        ).catch(() => pool.query(
          `SELECT id, TRIM(first_name || ' ' || COALESCE(last_name, '')) AS nombre, email, nif_cif AS nif FROM entities WHERE id = $1 AND organizacion_id = $2`,
          [id, org],
        ));
        cliente = rows[0] || null;
      }
    } catch { /* sin cliente */ }
    emitirEvento(org, evento, { ...datos, cliente: cliente || datos?.cliente || {} }, actorId);
  })();
}

// ── Programador: esperas y flujos a hora fija ───────────────────────────────
export async function tickAutomatizaciones(): Promise<void> {
  if (!(await tomarTurno('automatizaciones-motor', 50_000).catch(() => false))) return;
  // Esperas cumplidas.
  const { rows: esperas } = await pool.query(
    `DELETE FROM automatizaciones_esperas WHERE id IN (SELECT id FROM automatizaciones_esperas WHERE reanudar_at <= NOW() ORDER BY reanudar_at LIMIT 30)
     RETURNING ejecucion_id, flujo_id, organizacion_id, nodos, contexto`,
  ).catch(() => ({ rows: [] as any[] }));
  for (const e of esperas) {
    try {
      const { rows } = await pool.query(`SELECT flujo, activo FROM automatizaciones_flujos WHERE id = $1`, [e.flujo_id]);
      if (!rows.length || !rows[0].activo) continue;
      const pasos = await recorrer(e.organizacion_id, e.flujo_id, rows[0].flujo, e.nodos, e.contexto, false, e.ejecucion_id);
      const { rows: quedan } = await pool.query(`SELECT 1 FROM automatizaciones_esperas WHERE ejecucion_id = $1 LIMIT 1`, [e.ejecucion_id]);
      await pool.query(
        `UPDATE automatizaciones_ejecuciones SET pasos = pasos || $2::jsonb, updated_at = NOW(),
                estado = CASE WHEN $3 THEN 'esperando' WHEN $4 OR estado = 'error' THEN 'error' ELSE 'ok' END
          WHERE id = $1`,
        [e.ejecucion_id, JSON.stringify(pasos), quedan.length > 0, pasos.some((p) => !p.ok)],
      );
    } catch (err: any) { console.error('[automatizaciones] espera', e.flujo_id, err?.message || err); }
  }
  // Flujos programados.
  const { rows: prog } = await pool.query(
    `SELECT id, organizacion_id, nombre, flujo FROM automatizaciones_flujos WHERE activo AND evento = 'programado' AND proxima_at <= NOW() LIMIT 20`,
  ).catch(() => ({ rows: [] as any[] }));
  for (const f of prog) {
    const cfg = (f.flujo?.nodos || []).find((n: Nodo) => n.tipo === 'disparador')?.config || {};
    await pool.query(`UPDATE automatizaciones_flujos SET proxima_at = $2 WHERE id = $1`, [f.id, proximaEjecucion(cfg)]);
    const ctx = await contextoBase(f.organizacion_id, 'programado', {}, null);
    await ejecutarFlujo(f, ctx, 'A una hora fija').catch((e) => console.error('[automatizaciones] programado', f.id, e?.message || e));
  }
}

export function startMotorAutomatizaciones(): void {
  setTimeout(() => {
    void tickAutomatizaciones().catch(() => {});
    setInterval(() => void tickAutomatizaciones().catch(() => {}), 60_000);
  }, 40_000);
}
