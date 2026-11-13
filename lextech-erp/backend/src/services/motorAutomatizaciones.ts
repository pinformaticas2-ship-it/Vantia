import dns from 'dns/promises';
import net from 'net';
import pool from '../config/database';
import { enviarCorreoDelDespacho, escaparHtml, SinCuentaCorreo } from '../utils/correoDespacho';
import { sendPushToUsers } from '../utils/webPush';
import { tomarTurno } from '../utils/turnos';
import { formatMadrid, madridLocalToDate, madridYmd } from './vistasAutomation';

// ── Motor de automatizaciones propias (12/11/2026; ampliado 13/11/2026) ─────
// Un flujo es un grafo: un nodo «disparador» (cuándo empieza), nodos
// «condicion» (si… / si no…, con varias reglas unidas por «y» u «o») y nodos
// de acción, unidos por conexiones. Lo edita el lienzo de Ajustes →
// Automatizaciones.
//
// Disparadores por evento: el resto de Vantia llama a emitirEvento(org, …).
// Disparadores que se buscan (plazos, facturas vencidas, correo recibido):
// el programador los revisa cada pocos minutos; cada cosa dispara una vez.
// «Esperar» guarda dónde se quedó y el programador lo reanuda a su hora.
// Las de serie pueden llevar pasos añadidos al final («vinculadas»).
// Cada paso guarda su resultado con «clave» (plantilla en español) y «vars»
// para que la pantalla lo traduzca.

export type TipoNodo = 'disparador' | 'condicion' | 'enviar_correo' | 'aviso_equipo' | 'crear_tarea' | 'mensaje_chat' | 'esperar' | 'webhook'
  | 'mover_crm' | 'estado_expediente' | 'crear_cita' | 'enviar_whatsapp';
export interface Nodo { id: string; tipo: TipoNodo; config?: Record<string, any>; x?: number; y?: number }
export interface Arista { id?: string; de: string; a: string; rama?: 'si' | 'no' | null }
export interface Flujo { nodos: Nodo[]; aristas: Arista[]; layout?: Record<string, { x: number; y: number }> }

// ── Catálogo: disparadores y sus datos ──────────────────────────────────────
const V = (clave: string, etiqueta: string) => ({ clave, etiqueta });
const COMUNES = [V('despacho.nombre', 'Nombre del despacho'), V('fecha.hoy', 'Fecha de hoy'), V('usuario.nombre', 'Quién lo hizo')];
/** Lo que dejan los pasos anteriores del mismo flujo. */
const SALIDAS = [V('tarea_creada.titulo', 'Tarea creada en un paso anterior'), V('tarea_creada.plazo', 'Plazo de esa tarea'),
  V('cita_creada.fecha', 'Fecha de la cita creada en un paso anterior'), V('cita_creada.hora', 'Hora de esa cita')];
const CLIENTE = [V('cliente.nombre', 'Nombre del cliente'), V('cliente.email', 'Correo del cliente'), V('cliente.telefono', 'Teléfono del cliente'), V('cliente.nif', 'NIF del cliente')];
const OPORTUNIDAD = [V('oportunidad.nombre', 'Nombre de la oportunidad'), V('oportunidad.email', 'Correo de la oportunidad'), V('oportunidad.telefono', 'Teléfono de la oportunidad'),
  V('oportunidad.asunto', 'Asunto de la oportunidad'), V('oportunidad.etapa', 'Etapa'), V('oportunidad.valor', 'Valor estimado'), V('oportunidad.origen', 'Origen'), V('responsable.nombre', 'Responsable')];
const TAREA = [V('tarea.titulo', 'Título'), V('tarea.plazo', 'Plazo'), V('tarea.prioridad', 'Prioridad'), V('tarea.tipo', 'Tipo'), V('responsable.nombre', 'Responsable')];

export const DISPARADORES: Record<string, { etiqueta: string; descripcion: string; variables: { clave: string; etiqueta: string }[]; ejemplo: Record<string, any>; muestra?: string }> = {
  'cliente.creado': {
    etiqueta: 'Se da de alta un cliente', descripcion: 'A mano o con el formulario del enlace (no en importaciones CSV).', muestra: 'cliente',
    variables: [...CLIENTE, ...COMUNES],
    ejemplo: { cliente: { id: null, nombre: 'María López', email: 'maria@example.com', telefono: '600 11 22 33', nif: '12345678Z' } },
  },
  'expediente.creado': {
    etiqueta: 'Se crea un expediente', descripcion: 'Al abrir un expediente nuevo (también los importados de un documento).', muestra: 'expediente',
    variables: [V('expediente.ref', 'Número de expediente'), V('expediente.descripcion', 'Asunto'), V('expediente.tipo', 'Tipo'), ...CLIENTE, ...COMUNES],
    ejemplo: { expediente: { id: null, ref: '2026/0042', descripcion: 'Reclamación de cantidad', tipo: 'judicial' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'cita.creada': {
    etiqueta: 'Se añade una cita a la agenda', descripcion: 'Cualquier evento nuevo de la Agenda, también las reservas de la página pública.', muestra: 'cita',
    variables: [V('cita.titulo', 'Título'), V('cita.tipo', 'Tipo'), V('cita.fecha', 'Fecha'), V('cita.hora', 'Hora'), V('cita.lugar', 'Lugar'), V('cita.reserva', 'Reservada por el cliente («sí»)'), V('responsable.nombre', 'De quién es la cita'), ...CLIENTE, ...COMUNES],
    ejemplo: { cita: { titulo: 'Reunión inicial', tipo: 'reunion', fecha: 'jueves, 19 de noviembre', hora: '10:00', lugar: 'Despacho' }, cliente: { nombre: 'María López', email: 'maria@example.com' }, responsable: { nombre: 'Ana Pérez' } },
  },
  'tarea.creada': {
    etiqueta: 'Se crea una tarea', descripcion: 'Una tarea o plazo nuevo.', muestra: 'tarea',
    variables: [...TAREA, ...CLIENTE, ...COMUNES],
    ejemplo: { tarea: { titulo: 'Presentar escrito', plazo: '20/11/2026', prioridad: 'alta', tipo: 'plazo' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'tarea.vence': {
    etiqueta: 'Se acerca el plazo de una tarea', descripcion: 'Unos días antes del plazo de una tarea sin completar.', muestra: 'tarea',
    variables: [...TAREA, V('tarea.dias', 'Días que quedan'), ...CLIENTE, ...COMUNES],
    ejemplo: { tarea: { titulo: 'Presentar escrito', plazo: '20/11/2026', prioridad: 'alta', tipo: 'plazo', dias: '2' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'tarea.vencida': {
    etiqueta: 'Una tarea se queda vencida', descripcion: 'Cuando pasa el plazo de una tarea sin completar.', muestra: 'tarea',
    variables: [...TAREA, ...CLIENTE, ...COMUNES],
    ejemplo: { tarea: { titulo: 'Presentar escrito', plazo: '10/11/2026', prioridad: 'alta', tipo: 'plazo' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'oportunidad.creada': {
    etiqueta: 'Entra una oportunidad en el CRM', descripcion: 'Un posible cliente nuevo en el CRM.', muestra: 'oportunidad',
    variables: [...OPORTUNIDAD, ...CLIENTE, ...COMUNES],
    ejemplo: { oportunidad: { id: null, nombre: 'Jorge Ruiz', email: 'jorge@example.com', telefono: '600 22 33 44', asunto: 'Despido', etapa: 'Nuevo lead', valor: '1500', origen: 'web' }, responsable: { nombre: 'Ana Pérez' } },
  },
  'crm.etapa': {
    etiqueta: 'Una oportunidad cambia de etapa', descripcion: 'En el CRM, a mano o por las reglas de la etapa (usa una condición para elegir la etapa).', muestra: 'oportunidad',
    variables: [...OPORTUNIDAD, V('oportunidad.etapa_anterior', 'Etapa anterior'), ...CLIENTE, ...COMUNES],
    ejemplo: { oportunidad: { id: null, nombre: 'Jorge Ruiz', email: 'jorge@example.com', telefono: '600 22 33 44', asunto: 'Despido', etapa: 'Reunión agendada', etapa_anterior: 'Nuevo lead', valor: '1500' }, responsable: { nombre: 'Ana Pérez' } },
  },
  'factura.vencida': {
    etiqueta: 'Una factura se queda vencida', descripcion: 'Cuando pasa su vencimiento sin cobrarse.',
    variables: [V('factura.numero', 'Número de factura'), V('factura.contacto', 'A quién se facturó'), V('factura.total', 'Importe'), V('factura.vencimiento', 'Vencimiento'), ...COMUNES],
    ejemplo: { factura: { numero: 'HON-2026-031', contacto: 'Bar El Puerto SL', total: '1.210,00 €', vencimiento: '05/11/2026' } },
  },
  'correo.recibido': {
    etiqueta: 'Llega un correo', descripcion: 'A cualquiera de los buzones del despacho (usa una condición para filtrar por remitente o asunto).',
    variables: [V('correo.de', 'Remitente'), V('correo.nombre', 'Nombre del remitente'), V('correo.asunto', 'Asunto'), V('correo.extracto', 'Primeras líneas'), V('correo.buzon', 'Buzón'), ...COMUNES],
    ejemplo: { correo: { de: 'juzgado@justicia.es', nombre: 'Juzgado nº 3', asunto: 'Notificación', extracto: 'Se le notifica…', buzon: 'despacho@example.com' } },
  },
  'vista.aceptada': {
    etiqueta: 'Se acepta una vista', descripcion: 'Cuando alguien acepta una vista recibida por correo.',
    variables: [V('vista.fecha', 'Fecha'), V('vista.hora', 'Hora'), V('vista.juzgado', 'Juzgado'), V('vista.autos', 'Autos'), V('expediente.ref', 'Expediente'), ...CLIENTE, ...COMUNES],
    ejemplo: { vista: { fecha: 'martes, 1 de diciembre', hora: '10:30', juzgado: 'Juzgado de 1ª Instancia nº 3', autos: '945/2026' }, expediente: { ref: '2026/0042' } },
  },
  'recordatorio.enviado': {
    etiqueta: 'Se envía un recordatorio a un cliente', descripcion: 'Después de cada recordatorio de cita enviado.',
    variables: [V('cita.titulo', 'Título de la cita'), V('cita.fecha', 'Fecha'), V('cita.hora', 'Hora'), ...CLIENTE, ...COMUNES],
    ejemplo: { cita: { titulo: 'Reunión', fecha: 'jueves, 19 de noviembre', hora: '10:00' }, cliente: { nombre: 'María López', email: 'maria@example.com' } },
  },
  'programado': { etiqueta: 'A una hora fija', descripcion: 'Cada día, cada semana o cada mes, a la hora que elijas.', variables: [...COMUNES], ejemplo: {} },
  'manual': { etiqueta: 'Al pulsar «Ejecutar ahora»', descripcion: 'Solo cuando lo lances tú desde el editor.', variables: [...COMUNES], ejemplo: {} },
};
for (const d of Object.values(DISPARADORES)) d.variables.push(...SALIDAS);

/** Evento con el que termina cada automatización de serie. */
export const EVENTO_DE_SERIE: Record<string, string> = {
  vistas: 'vista.aceptada', docsBase: 'expediente.creado', bienvenida: 'cliente.creado', recordatorios: 'recordatorio.enviado',
};
export const ESTADOS_EXPEDIENTE = ['abierto', 'suspendido', 'cerrado', 'archivado'];
export const TIPOS_CITA = ['cita', 'reunion', 'llamada', 'video', 'vista', 'otro'];

export const TIPOS_NODO: TipoNodo[] = ['disparador', 'condicion', 'enviar_correo', 'aviso_equipo', 'crear_tarea', 'mensaje_chat', 'esperar', 'webhook',
  'mover_crm', 'estado_expediente', 'crear_cita', 'enviar_whatsapp'];
const MAX_NODOS = 60;
const MAX_PASOS_EJECUCION = 80;
const MAX_CORREOS_DIA = 100;
const MAX_PROFUNDIDAD = 3;

// ── Validación ──────────────────────────────────────────────────────────────
export function reglasDe(c: any): { campo: string; operador: string; valor: string }[] {
  const lista = Array.isArray(c?.reglas) && c.reglas.length ? c.reglas : [{ campo: c?.campo, operador: c?.operador, valor: c?.valor }];
  return lista.slice(0, 10).map((r: any) => ({ campo: String(r?.campo || ''), operador: String(r?.operador || 'igual'), valor: String(r?.valor ?? '') }));
}

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
    if (n.tipo === 'crear_cita' && !String(c.titulo || '').trim()) errores.push('Un «Crear cita» no tiene título.');
    if (n.tipo === 'mensaje_chat' && (!c.canalId || !String(c.texto || '').trim())) errores.push('Un «Escribir en el chat» no tiene canal o texto.');
    if (n.tipo === 'enviar_whatsapp' && !String(c.texto || '').trim()) errores.push('Un «Enviar WhatsApp» no tiene texto.');
    if (n.tipo === 'webhook' && !/^https:\/\/[^\s]+$/i.test(String(c.url || ''))) errores.push('Un «Webhook» necesita una dirección https://.');
    if (n.tipo === 'mover_crm' && !c.etapaId) errores.push('Un «Mover en el CRM» no tiene etapa.');
    if (n.tipo === 'estado_expediente' && !ESTADOS_EXPEDIENTE.includes(c.estado)) errores.push('Un «Cambiar estado del expediente» no tiene estado.');
    if (n.tipo === 'condicion' && !reglasDe(c).every((r) => r.campo)) errores.push('Una condición no tiene qué comprobar.');
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

function cumpleRegla(ctx: any, r: { campo: string; operador: string; valor: string }): boolean {
  const v = valorDe(ctx, r.campo).trim();
  const x = String(r.valor ?? '').trim();
  const a = v.toLowerCase(), b = x.toLowerCase();
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  switch (r.operador) {
    case 'distinto': return a !== b;
    case 'contiene': return a.includes(b);
    case 'no_contiene': return !a.includes(b);
    case 'empieza': return a.startsWith(b);
    case 'vacio': return !a;
    case 'no_vacio': return Boolean(a);
    case 'mayor': return Number.isFinite(num(v)) && Number.isFinite(num(x)) && num(v) > num(x);
    case 'menor': return Number.isFinite(num(v)) && Number.isFinite(num(x)) && num(v) < num(x);
    case 'igual': default: return a === b;
  }
}
/** Todas («y») o alguna («o») de las reglas. */
export function cumpleCondicion(ctx: any, c: any): boolean {
  const reglas = reglasDe(c);
  return c?.modo === 'o' ? reglas.some((r) => cumpleRegla(ctx, r)) : reglas.every((r) => cumpleRegla(ctx, r));
}

// ── Acciones ────────────────────────────────────────────────────────────────
export interface Paso { nodo: string; tipo: TipoNodo; ok: boolean; detalle: string; clave?: string; vars?: Record<string, string | number>; at: string }
type Res = { clave: string; vars: Record<string, string | number> };
const R = (clave: string, vars: Record<string, string | number> = {}): Res => ({ clave, vars });
class FalloPaso extends Error { constructor(public clave: string, public vars: Record<string, string | number> = {}) { super(clave); } }
const F = (clave: string, vars: Record<string, string | number> = {}) => new FalloPaso(clave, vars);
const pintar = (clave: string, vars: Record<string, string | number>) => clave.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

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
async function miembro(org: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { rows } = await pool.query(`SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1 AND user_id = $2`, [org, id]);
  return rows[0]?.user_id || null;
}
function persona(c: any, ctx: any): string | null {
  return c.asignar === 'responsable' ? (ctx?.responsable?.id || ctx?.usuario?.id) : (c.asignar === 'usuario' || !c.asignar ? ctx?.usuario?.id : c.asignar);
}

/** Ejecuta un nodo (o, en modo prueba, dice qué haría). */
async function ejecutarNodo(org: string, flujoId: string, n: Nodo, ctx: any, prueba: boolean): Promise<Res> {
  const c = n.config || {};
  switch (n.tipo) {
    case 'enviar_correo': {
      const para = c.para === 'otro'
        ? String(c.direcciones || '').split(/[,;\s]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 10)
        : [valorDe(ctx, 'cliente.email') || valorDe(ctx, 'oportunidad.email')].filter((x) => x.includes('@'));
      if (!para.length) throw F('No hay a quién enviarlo (no hay correo).');
      const asunto = rellenar(c.asunto, ctx);
      if (prueba) return R('Se enviaría «{asunto}» a {para}', { asunto, para: para.join(', ') });
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM automatizaciones_ejecuciones e, jsonb_array_elements(e.pasos) p
          WHERE e.organizacion_id = $1 AND e.created_at > NOW() - INTERVAL '1 day' AND p->>'tipo' = 'enviar_correo' AND (p->>'ok')::boolean`,
        [org],
      );
      if ((rows[0]?.n || 0) >= MAX_CORREOS_DIA) throw F('Límite de {n} correos al día de las automatizaciones alcanzado.', { n: MAX_CORREOS_DIA });
      try { await enviarCorreoDelDespacho(org, { to: para, subject: asunto, html: rellenar(c.cuerpo, ctx, true) }); }
      catch (e: any) { if (e instanceof SinCuentaCorreo) throw F('El despacho no tiene correo conectado.'); throw F('{error}', { error: e?.message || String(e) }); }
      return R('Correo «{asunto}» enviado a {para}', { asunto, para: para.join(', ') });
    }
    case 'aviso_equipo': {
      const ids = await usuariosPara(org, String(c.a || 'usuario'), ctx, Array.isArray(c.personas) ? c.personas : []);
      const titulo = rellenar(c.titulo, ctx);
      // Con datos de ejemplo no hay personas reales: se dice a quién iría.
      if (prueba && !ids.length) return R('Se avisaría al responsable o a quien lo hizo: «{titulo}»', { titulo });
      if (!ids.length) throw F('No hay a quién avisar.');
      if (prueba) return R('Se avisaría a {n} persona(s): «{titulo}»', { n: ids.length, titulo });
      await sendPushToUsers(ids, { title: titulo, body: rellenar(c.mensaje || '', ctx), url: /^\/[a-z]/i.test(String(c.enlace || '')) ? String(c.enlace) : '/dashboard', tag: `autom-${flujoId}-${Date.now()}` });
      return R('Aviso «{titulo}» a {n} persona(s)', { titulo, n: ids.length });
    }
    case 'crear_tarea': {
      const clienteId = ctx?.cliente?.id;
      if (!clienteId) throw F('Las tareas van ligadas a un cliente y aquí no hay cliente.');
      const titulo = rellenar(c.titulo, ctx).slice(0, 300);
      const dias = Math.max(0, Math.min(365, Number(c.dias) || 0));
      const plazo = sumarDias(madridYmd(new Date()), dias);
      const plazoTxt = plazo.split('-').reverse().join('/');
      ctx.tarea_creada = { titulo, plazo: plazoTxt };
      if (prueba) return R('Se crearía la tarea «{titulo}» con plazo {plazo}', { titulo, plazo: plazoTxt });
      const { rows: cli } = await pool.query(`SELECT COALESCE(NULLIF(commercial_name, ''), TRIM(first_name || ' ' || COALESCE(last_name,''))) AS nombre FROM entities WHERE id = $1 AND organizacion_id = $2`, [clienteId, org]);
      if (!cli.length) throw F('El cliente ya no existe.');
      await pool.query(
        `INSERT INTO client_tasks (client_id, client_name, titulo, descripcion, plazo, estado, prioridad, expediente_id, created_by, user_id, organizacion_id)
         VALUES ($1,$2,$3,$4,$5,'pendiente',$6,$7,'Automatización',$8,$9)`,
        [clienteId, cli[0].nombre, titulo, rellenar(c.descripcion || '', ctx) || null, plazo,
          ['alta', 'media', 'baja'].includes(c.prioridad) ? c.prioridad : 'media', ctx?.expediente?.id || null, await miembro(org, persona(c, ctx)), org],
      );
      return R('Tarea «{titulo}» creada (plazo {plazo})', { titulo, plazo: plazoTxt });
    }
    case 'crear_cita': {
      const titulo = rellenar(c.titulo, ctx).slice(0, 300);
      const quien = await miembro(org, persona(c, ctx));
      if (!quien && !prueba) throw F('No hay en la agenda de quién ponerla.');
      const dias = Math.max(0, Math.min(365, Number(c.dias) || 0));
      const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.hora || '')) ? c.hora : '10:00';
      const ini = madridLocalToDate(sumarDias(madridYmd(new Date()), dias), hora)!;
      const fin = new Date(ini.getTime() + Math.max(15, Math.min(600, Number(c.duracion) || 60)) * 60_000);
      const fecha = formatMadrid(ini, { weekday: 'long', day: 'numeric', month: 'long' });
      ctx.cita_creada = { fecha, hora };
      if (prueba) return R('Se crearía la cita «{titulo}» el {fecha} a las {hora}', { titulo, fecha, hora });
      const { resolveUserName } = await import('../controllers/activityController');
      await pool.query(
        `INSERT INTO agenda_events (user_id, user_name, title, description, start_at, end_at, type, status, cliente_id, expediente_id, source, organizacion_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente',$8,$9,'automatizacion',$10)`,
        [quien, await resolveUserName(quien!), titulo, rellenar(c.descripcion || '', ctx) || null, ini, fin,
          TIPOS_CITA.includes(c.tipo) ? c.tipo : 'cita', ctx?.cliente?.id || null, ctx?.expediente?.id || null, org],
      );
      return R('Cita «{titulo}» creada el {fecha} a las {hora}', { titulo, fecha, hora });
    }
    case 'mensaje_chat': {
      const { rows } = await pool.query(`SELECT id, nombre FROM chat_canales WHERE id = $1 AND organizacion_id = $2`, [c.canalId, org]);
      if (!rows.length) throw F('El canal del chat ya no existe.');
      const texto = rellenar(c.texto, ctx).slice(0, 4000);
      if (prueba) return R('Se escribiría en #{canal}: «{texto}»', { canal: rows[0].nombre, texto: texto.slice(0, 80) });
      await pool.query(`INSERT INTO chat_mensajes (canal_id, user_id, user_name, contenido) VALUES ($1, 'vantia-automatizaciones', 'Vantia · Automatización', $2)`, [rows[0].id, texto]);
      return R('Mensaje en #{canal}', { canal: rows[0].nombre });
    }
    case 'enviar_whatsapp': {
      const tel = valorDe(ctx, 'cliente.telefono') || valorDe(ctx, 'oportunidad.telefono');
      if (!tel) throw F('No hay teléfono al que escribir.');
      const texto = rellenar(c.texto, ctx);
      if (prueba) return R('Se enviaría un WhatsApp a {tel}: «{texto}»', { tel, texto: texto.slice(0, 80) });
      const { enviarWhatsAppTexto } = await import('../controllers/whatsappController');
      try { const to = await enviarWhatsAppTexto(org, tel, texto, ctx?.cliente?.id || null); return R('WhatsApp enviado a {tel}', { tel: to }); }
      catch (e: any) { throw F('{error}', { error: e?.message || String(e) }); }
    }
    case 'mover_crm': {
      const id = ctx?.oportunidad?.id;
      if (!id) throw F('Aquí no hay ninguna oportunidad del CRM.');
      const { rows } = await pool.query(`SELECT nombre FROM crm_etapas WHERE id = $1 AND organizacion_id = $2`, [c.etapaId, org]);
      if (!rows.length) throw F('Esa etapa ya no existe.');
      if (prueba) return R('Se movería a «{etapa}»', { etapa: rows[0].nombre });
      const { moverOportunidadAEtapa } = await import('../controllers/crmController');
      try { const r = await moverOportunidadAEtapa(org, id, c.etapaId, Number(ctx?._profundidad) || 0); return R('Movida de «{antes}» a «{despues}»', r); }
      catch (e: any) { throw F('{error}', { error: e?.message || String(e) }); }
    }
    case 'estado_expediente': {
      const id = ctx?.expediente?.id;
      if (!id) throw F('Aquí no hay ningún expediente.');
      if (!ESTADOS_EXPEDIENTE.includes(c.estado)) throw F('Estado no válido.');
      if (prueba) return R('Se pondría el expediente en «{estado}»', { estado: c.estado });
      const { rowCount } = await pool.query(
        `UPDATE expedientes SET estado = $3, fecha_cierre = CASE WHEN $3 IN ('cerrado','archivado') THEN COALESCE(fecha_cierre, CURRENT_DATE) ELSE fecha_cierre END, updated_at = NOW()
          WHERE id = $1 AND organizacion_id = $2`,
        [id, org, c.estado],
      );
      if (!rowCount) throw F('El expediente ya no existe.');
      return R('Expediente en «{estado}»', { estado: c.estado });
    }
    case 'webhook': {
      const url = String(c.url || '');
      if (!(await direccionPublica(url))) throw F('La dirección del webhook no es pública o no es https.');
      const host = new URL(url).host;
      if (prueba) return R('Se enviarían los datos a {host}', { host });
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Vantia-Automatizaciones' },
        body: JSON.stringify({ evento: ctx?._evento, datos: Object.fromEntries(Object.entries(ctx || {}).filter(([k]) => !k.startsWith('_'))) }),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!r.ok) throw F('El webhook respondió {status}', { status: r.status });
      return R('Datos enviados a {host} ({status})', { host, status: r.status });
    }
    default: return R('');
  }
}

function msEspera(c: any): number {
  const n = Math.max(1, Math.min(10_000, Number(c?.cantidad) || 1));
  const u = c?.unidad === 'dias' ? 86_400_000 : c?.unidad === 'horas' ? 3_600_000 : 60_000;
  return Math.min(n * u, 90 * 86_400_000);
}

const paso = (nodo: string, tipo: TipoNodo, ok: boolean, r: Res): Paso => ({ nodo, tipo, ok, detalle: pintar(r.clave, r.vars), clave: r.clave, vars: r.vars, at: new Date().toISOString() });

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
    if (n.tipo === 'disparador') { cola.push(...salidas()); continue; }
    if (n.tipo === 'condicion') {
      const si = cumpleCondicion(ctx, n.config);
      pasos.push(paso(id, n.tipo, true, si ? R('Se cumple → «Sí»') : R('No se cumple → «No»')));
      cola.push(...salidas(si ? 'si' : 'no'));
      continue;
    }
    if (n.tipo === 'esperar') {
      const ms = msEspera(n.config);
      const siguientes = salidas();
      if (prueba) { pasos.push(paso(id, n.tipo, true, R('Esperaría {n} min y seguiría', { n: Math.round(ms / 60000) }))); cola.push(...siguientes); continue; }
      if (siguientes.length && ejecucionId) {
        await pool.query(
          `INSERT INTO automatizaciones_esperas (ejecucion_id, flujo_id, organizacion_id, nodos, contexto, reanudar_at) VALUES ($1,$2,$3,$4,$5, NOW() + $6 * INTERVAL '1 millisecond')`,
          [ejecucionId, flujoId, org, JSON.stringify(siguientes), JSON.stringify(ctx), ms],
        );
      }
      pasos.push(paso(id, n.tipo, true, R('En espera hasta {fecha}', { fecha: formatMadrid(new Date(Date.now() + ms), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })));
      continue;
    }
    try {
      pasos.push(paso(id, n.tipo, true, await ejecutarNodo(org, flujoId, n, ctx, prueba)));
      cola.push(...salidas());
    } catch (e: any) {
      // Un paso que falla corta su rama, no las demás.
      const r = e instanceof FalloPaso ? R(e.clave, e.vars) : R('{error}', { error: String(e?.message || e).slice(0, 300) });
      pasos.push(paso(id, n.tipo, false, r));
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

// ── Datos reales para probar ────────────────────────────────────────────────
const fechaLarga = (d: any) => (d ? formatMadrid(new Date(d), { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const fechaCorta = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { timeZone: 'UTC' }) : '');
async function clienteDe(org: string, id: string | null | undefined) {
  if (!id) return {};
  const { rows } = await pool.query(
    `SELECT id, COALESCE(NULLIF(commercial_name, ''), TRIM(first_name || ' ' || COALESCE(last_name, ''))) AS nombre, email, COALESCE(phone_1, phone_2) AS telefono, nif_cif AS nif FROM entities WHERE id = $1 AND organizacion_id = $2`,
    [id, org],
  );
  return rows[0] || {};
}

/** Los últimos registros con los que se puede probar un disparador. */
export async function muestrasDe(org: string, evento: string): Promise<{ id: string; etiqueta: string }[]> {
  const tipo = DISPARADORES[evento]?.muestra;
  const q: Record<string, string> = {
    cliente: `SELECT id, COALESCE(NULLIF(commercial_name, ''), TRIM(first_name || ' ' || COALESCE(last_name, ''))) AS etiqueta FROM entities WHERE organizacion_id = $1 AND type = 'CLIENTE' ORDER BY created_at DESC LIMIT 12`,
    expediente: `SELECT id, anio || '/' || num_exp || ' · ' || COALESCE(descripcion, '') AS etiqueta FROM expedientes WHERE organizacion_id = $1 ORDER BY created_at DESC LIMIT 12`,
    cita: `SELECT id, title || ' · ' || to_char(start_at AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI') AS etiqueta FROM agenda_events WHERE organizacion_id = $1 ORDER BY start_at DESC LIMIT 12`,
    tarea: `SELECT id, titulo || COALESCE(' · ' || to_char(plazo, 'DD/MM'), '') AS etiqueta FROM client_tasks WHERE organizacion_id = $1 ORDER BY created_at DESC LIMIT 12`,
    oportunidad: `SELECT id, nombre AS etiqueta FROM crm_oportunidades WHERE organizacion_id = $1 ORDER BY created_at DESC LIMIT 12`,
  };
  if (!tipo || !q[tipo]) return [];
  const { rows } = await pool.query(q[tipo], [org]).catch(() => ({ rows: [] as any[] }));
  return rows.map((r: any) => ({ id: r.id, etiqueta: String(r.etiqueta || '').slice(0, 120) }));
}

async function datosDeMuestra(org: string, evento: string, id: string): Promise<any | null> {
  const tipo = DISPARADORES[evento]?.muestra;
  if (tipo === 'cliente') { const c = await clienteDe(org, id); return (c as any).id ? { cliente: c } : null; }
  if (tipo === 'expediente') {
    const { rows } = await pool.query(`SELECT * FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [id, org]);
    const x = rows[0]; if (!x) return null;
    return { expediente: { id: x.id, ref: `${x.anio}/${x.num_exp}`, descripcion: x.descripcion || '', tipo: x.tipo || '' }, cliente: await clienteDe(org, x.cliente_id) };
  }
  if (tipo === 'cita') {
    const { rows } = await pool.query(`SELECT * FROM agenda_events WHERE id = $1 AND organizacion_id = $2`, [id, org]);
    const e = rows[0]; if (!e) return null;
    let cli: any = await clienteDe(org, e.cliente_id);
    if (!cli.id && e.expediente_id) { const { rows: x } = await pool.query(`SELECT cliente_id FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [e.expediente_id, org]); cli = await clienteDe(org, x[0]?.cliente_id); }
    return { cita: { id: e.id, titulo: e.title, tipo: e.type, lugar: e.location || '', fecha: fechaLarga(e.start_at), hora: e.all_day ? '' : formatMadrid(new Date(e.start_at), { hour: '2-digit', minute: '2-digit' }) },
      cliente: cli, responsable: { id: e.user_id, nombre: e.user_name || '' }, expediente: e.expediente_id ? { id: e.expediente_id } : undefined };
  }
  if (tipo === 'tarea') {
    const { rows } = await pool.query(`SELECT * FROM client_tasks WHERE id = $1 AND organizacion_id = $2`, [id, org]);
    const t = rows[0]; if (!t) return null;
    const dias = t.plazo ? Math.round((new Date(t.plazo).getTime() - new Date(madridYmd(new Date())).getTime()) / 86_400_000) : '';
    return { tarea: { id: t.id, titulo: t.titulo, plazo: fechaCorta(t.plazo), prioridad: t.prioridad || '', tipo: t.tipo || '', dias: String(dias) },
      cliente: await clienteDe(org, t.client_id), responsable: { id: t.user_id || null }, expediente: t.expediente_id ? { id: t.expediente_id } : undefined };
  }
  if (tipo === 'oportunidad') {
    const { rows } = await pool.query(`SELECT o.*, s.nombre AS etapa_nombre FROM crm_oportunidades o LEFT JOIN crm_etapas s ON s.id = o.etapa_id WHERE o.id = $1 AND o.organizacion_id = $2`, [id, org]);
    const o = rows[0]; if (!o) return null;
    return { oportunidad: { id: o.id, nombre: o.nombre, email: o.email || '', telefono: o.telefono || '', asunto: o.asunto || '', etapa: o.etapa_nombre || '', etapa_anterior: '', valor: o.valor_estimado != null ? String(o.valor_estimado) : '', estado: o.estado || '', origen: o.origen || '' },
      responsable: { id: o.responsable_user_id || null, nombre: o.responsable_nombre || '' }, cliente: await clienteDe(org, o.cliente_id) };
  }
  return null;
}

/** Prueba sin efectos: dice qué haría cada paso, con datos de ejemplo o con un registro real. */
export async function probarFlujo(org: string, flujo: Flujo, muestraId?: string | null): Promise<Paso[]> {
  const disparador = flujo.nodos.find((n) => n.tipo === 'disparador');
  if (!disparador) return [];
  const evento = String(disparador.config?.evento || 'manual');
  const datos = (muestraId && await datosDeMuestra(org, evento, muestraId)) || DISPARADORES[evento]?.ejemplo || {};
  const ctx = await contextoBase(org, evento, datos, null);
  return recorrer(org, 'prueba', flujo, [disparador.id], ctx, true, null);
}

/**
 * Lo llama el resto de Vantia cuando pasa algo. Nunca lanza ni hace esperar:
 * las automatizaciones no pueden romper lo que las dispara.
 */
export function emitirEvento(org: string | null | undefined, evento: string, datos: any, actorId?: string | null): void {
  if (!org || !DISPARADORES[evento]) return;
  // Una automatización que dispara otra que dispara otra… se corta aquí.
  if ((Number(datos?._profundidad) || 0) >= MAX_PROFUNDIDAD) return;
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
        await ejecutarFlujo(r, { ...ctx }, DISPARADORES[evento].etiqueta).catch((e) => console.error('[automatizaciones]', r.id, e?.message || e));
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
      if (id) { const c: any = await clienteDe(org, id); cliente = c.id ? c : null; }
    } catch { /* sin cliente */ }
    emitirEvento(org, evento, { ...datos, cliente: cliente || datos?.cliente || {} }, actorId);
  })();
}

// ── Disparadores que se buscan (plazos, facturas, correo) ───────────────────
async function primeraVez(flujoId: string, clave: string): Promise<boolean> {
  const { rows } = await pool.query(`INSERT INTO automatizaciones_disparos (flujo_id, clave) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING clave`, [flujoId, clave.slice(0, 120)]);
  return rows.length > 0;
}

async function buscarDisparos(): Promise<void> {
  const { rows: flujos } = await pool.query(
    `SELECT id, organizacion_id, nombre, flujo, evento, cursor_at FROM automatizaciones_flujos
      WHERE activo AND evento IN ('tarea.vence', 'tarea.vencida', 'factura.vencida', 'correo.recibido')`,
  ).catch(() => ({ rows: [] as any[] }));
  const hoy = madridYmd(new Date());
  for (const f of flujos) {
    const org = f.organizacion_id;
    const cfg = (f.flujo?.nodos || []).find((n: Nodo) => n.tipo === 'disparador')?.config || {};
    try {
      if (f.evento === 'tarea.vence' || f.evento === 'tarea.vencida') {
        const dias = Math.max(0, Math.min(60, Number(cfg.diasAntes) || 0));
        const { rows } = f.evento === 'tarea.vence'
          ? await pool.query(`SELECT * FROM client_tasks WHERE organizacion_id = $1 AND estado <> 'completada' AND plazo = $2::date LIMIT 100`, [org, sumarDias(hoy, dias)])
          : await pool.query(`SELECT * FROM client_tasks WHERE organizacion_id = $1 AND estado <> 'completada' AND plazo < $2::date AND plazo >= $2::date - INTERVAL '30 days' LIMIT 100`, [org, hoy]);
        for (const t of rows) {
          if (!(await primeraVez(f.id, `tarea:${t.id}:${fechaCorta(t.plazo)}`))) continue;
          const datos = await datosDeMuestra(org, f.evento, t.id);
          if (datos) await ejecutarFlujo(f, await contextoBase(org, f.evento, datos, null), DISPARADORES[f.evento].etiqueta);
        }
      } else if (f.evento === 'factura.vencida') {
        const { rows } = await pool.query(
          `SELECT id, num, contacto, total, vencimiento FROM facturacion_facturas
            WHERE organizacion_id = $1 AND vencimiento < $2::date AND vencimiento >= $2::date - INTERVAL '60 days'
              AND estado NOT IN ('cobrada', 'pagada', 'anulada', 'borrador', 'rectificada') LIMIT 100`,
          [org, hoy],
        );
        for (const x of rows) {
          if (!(await primeraVez(f.id, `factura:${x.id}`))) continue;
          const datos = { factura: { numero: x.num, contacto: x.contacto, total: `${Number(x.total).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, vencimiento: fechaCorta(x.vencimiento) } };
          await ejecutarFlujo(f, await contextoBase(org, f.evento, datos, null), DISPARADORES[f.evento].etiqueta);
        }
      } else if (f.evento === 'correo.recibido') {
        const desde = f.cursor_at || new Date();
        const { rows } = await pool.query(
          `SELECT e.id, e.from_email, e.from_name, e.subject, e.snippet, e.created_at, a.email AS buzon
             FROM emails e JOIN email_accounts a ON a.id = e.account_id
            WHERE a.organizacion_id = $1 AND upper(e.folder) = 'INBOX' AND e.created_at > $2
            ORDER BY e.created_at LIMIT 30`,
          [org, desde],
        );
        let ultimo = desde;
        for (const m of rows) {
          ultimo = m.created_at;
          if (!(await primeraVez(f.id, `correo:${m.id}`))) continue;
          const datos = { correo: { de: m.from_email || '', nombre: m.from_name || '', asunto: m.subject || '', extracto: String(m.snippet || '').slice(0, 200), buzon: m.buzon || '' } };
          await ejecutarFlujo(f, await contextoBase(org, f.evento, datos, null), DISPARADORES[f.evento].etiqueta);
        }
        await pool.query(`UPDATE automatizaciones_flujos SET cursor_at = $2 WHERE id = $1`, [f.id, ultimo]);
      }
    } catch (e: any) { console.error('[automatizaciones] buscar', f.id, e?.message || e); }
  }
}

// ── Programador: esperas, programados y búsquedas ───────────────────────────
let ultimaBusqueda = 0;
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
  // Plazos, facturas y correo: cada 3 minutos.
  if (Date.now() - ultimaBusqueda > 3 * 60_000) { ultimaBusqueda = Date.now(); await buscarDisparos(); }
}
export async function forzarBusqueda(): Promise<void> { ultimaBusqueda = 0; await buscarDisparos(); }

export function startMotorAutomatizaciones(): void {
  setTimeout(() => {
    void tickAutomatizaciones().catch(() => {});
    setInterval(() => void tickAutomatizaciones().catch(() => {}), 60_000);
  }, 40_000);
}
