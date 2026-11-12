import { Bell, Clock, GitBranch, Globe, ListChecks, Mail, MessageSquare, Zap, type LucideIcon } from 'lucide-react';
import { t } from '../../lib/i18n';

// Tipos de paso del editor de automatizaciones (12/11/2026). Lo mismo que
// ejecuta el servidor (services/motorAutomatizaciones.ts).

export type TipoNodo = 'disparador' | 'condicion' | 'enviar_correo' | 'aviso_equipo' | 'crear_tarea' | 'mensaje_chat' | 'esperar' | 'webhook';
export interface NodoFlujo { id: string; tipo: TipoNodo; config: Record<string, any>; x: number; y: number }
export interface AristaFlujo { id: string; de: string; a: string; rama?: 'si' | 'no' | null }
export interface FlujoDatos { nodos: NodoFlujo[]; aristas: AristaFlujo[]; layout?: Record<string, { x: number; y: number }> }

export interface Variable { clave: string; etiqueta: string }
export interface Catalogo {
  disparadores: { clave: string; etiqueta: string; descripcion: string; variables: Variable[] }[];
  miembros: { userId: string; nombre: string }[];
  canales: { id: string; nombre: string }[];
  eventoDeSerie: Record<string, string>;
}

export type Clase = 'disparador' | 'logica' | 'accion';
export const META: Record<TipoNodo, { etiqueta: string; desc: string; icono: LucideIcon; clase: Clase; color: string }> = {
  disparador: { etiqueta: 'Cuando…', desc: 'Lo que pone en marcha el flujo', icono: Zap, clase: 'disparador', color: '#f59e0b' },
  condicion: { etiqueta: 'Condición', desc: 'Sigue por «Sí» o por «No»', icono: GitBranch, clase: 'logica', color: '#0ea5e9' },
  esperar: { etiqueta: 'Esperar', desc: 'Minutos, horas o días', icono: Clock, clase: 'logica', color: '#8b5cf6' },
  enviar_correo: { etiqueta: 'Enviar correo', desc: 'Al cliente o a quien digas', icono: Mail, clase: 'accion', color: '#dc2626' },
  aviso_equipo: { etiqueta: 'Avisar al equipo', desc: 'Notificación en Vantia y el móvil', icono: Bell, clase: 'accion', color: '#ea580c' },
  crear_tarea: { etiqueta: 'Crear tarea', desc: 'Tarea con plazo para alguien', icono: ListChecks, clase: 'accion', color: '#16a34a' },
  mensaje_chat: { etiqueta: 'Escribir en el chat', desc: 'Mensaje en un canal', icono: MessageSquare, clase: 'accion', color: '#4f46e5' },
  webhook: { etiqueta: 'Webhook', desc: 'Enviar los datos a otra herramienta', icono: Globe, clase: 'accion', color: '#475569' },
};
export const PALETA: { titulo: string; tipos: TipoNodo[] }[] = [
  { titulo: 'Lógica', tipos: ['condicion', 'esperar'] },
  { titulo: 'Acciones', tipos: ['enviar_correo', 'aviso_equipo', 'crear_tarea', 'mensaje_chat', 'webhook'] },
];

export const CONFIG_INICIAL: Record<TipoNodo, Record<string, any>> = {
  disparador: { evento: '' },
  condicion: { campo: '', operador: 'no_vacio', valor: '' },
  esperar: { cantidad: 1, unidad: 'dias' },
  enviar_correo: { para: 'cliente', direcciones: '', asunto: '', cuerpo: '' },
  aviso_equipo: { a: 'usuario', personas: [], titulo: '', mensaje: '' },
  crear_tarea: { titulo: '', descripcion: '', dias: 1, prioridad: 'media', asignar: 'usuario' },
  mensaje_chat: { canalId: '', texto: '' },
  webhook: { url: '' },
};

export const OPERADORES: { v: string; l: string; sinValor?: boolean }[] = [
  { v: 'igual', l: 'es igual a' }, { v: 'distinto', l: 'no es igual a' }, { v: 'contiene', l: 'contiene' },
  { v: 'no_contiene', l: 'no contiene' }, { v: 'vacio', l: 'está vacío', sinValor: true }, { v: 'no_vacio', l: 'no está vacío', sinValor: true },
  { v: 'mayor', l: 'es mayor que' }, { v: 'menor', l: 'es menor que' },
];
const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function etiquetaVariable(cat: Catalogo | null, clave: string): string {
  for (const d of cat?.disparadores || []) { const v = d.variables.find((x) => x.clave === clave); if (v) return t(v.etiqueta); }
  return clave;
}

/** Una línea con lo que hace el paso tal y como está configurado. */
export function resumen(n: { tipo: TipoNodo; config: Record<string, any> }, cat: Catalogo | null): string {
  const c = n.config || {};
  switch (n.tipo) {
    case 'disparador': {
      const d = cat?.disparadores.find((x) => x.clave === c.evento);
      if (!d) return t('Elige qué lo pone en marcha');
      if (c.evento === 'programado') {
        const cuando = c.frecuencia === 'semanal' ? t('Cada {dia}', { dia: t(DIAS_SEMANA[(Number(c.dia) || 1) - 1]) })
          : c.frecuencia === 'mensual' ? t('El día {n} de cada mes', { n: Number(c.dia) || 1 }) : t('Cada día');
        return `${cuando} · ${c.hora || '09:00'}`;
      }
      return t(d.etiqueta);
    }
    case 'condicion': {
      if (!c.campo) return t('Elige qué comprobar');
      const op = OPERADORES.find((o) => o.v === c.operador);
      return `${etiquetaVariable(cat, c.campo)} ${t(op?.l || '')}${op?.sinValor ? '' : ` «${c.valor || ''}»`}`;
    }
    case 'esperar': return tn2(Number(c.cantidad) || 1, c.unidad);
    case 'enviar_correo': return c.asunto ? `${c.para === 'otro' ? (c.direcciones || '…') : t('Al cliente')} · ${c.asunto}` : t('Escribe el correo');
    case 'aviso_equipo': return c.titulo ? `${{ usuario: t('A quien lo hizo'), responsable: t('Al responsable'), todos: t('A todo el despacho'), personas: t('A personas concretas') }[c.a as string] || ''} · ${c.titulo}` : t('Escribe el aviso');
    case 'crear_tarea': return c.titulo ? `${c.titulo} · ${t('plazo en {n} días', { n: Number(c.dias) || 0 })}` : t('Escribe la tarea');
    case 'mensaje_chat': { const k = cat?.canales.find((x) => x.id === c.canalId); return k ? `#${k.nombre} · ${String(c.texto || '').slice(0, 40)}` : t('Elige el canal'); }
    case 'webhook': { try { return new URL(c.url).host; } catch { return t('Pon la dirección'); } }
  }
  return '';
}
function tn2(n: number, unidad: string) {
  const u = unidad === 'minutos' ? (n === 1 ? 'minuto' : 'minutos') : unidad === 'horas' ? (n === 1 ? 'hora' : 'horas') : (n === 1 ? 'día' : 'días');
  return t('Esperar {n} {u}', { n, u: t(u) });
}

/** ¿Le falta algo al paso para poder activarse? */
export function faltaAlgo(n: { tipo: TipoNodo; config: Record<string, any> }, fijo: boolean): string | null {
  const c = n.config || {};
  switch (n.tipo) {
    case 'disparador': return fijo || c.evento ? null : t('Elige qué lo pone en marcha');
    case 'condicion': return c.campo ? null : t('Elige qué comprobar');
    case 'enviar_correo': return !String(c.asunto || '').trim() || !String(c.cuerpo || '').trim() ? t('Falta el asunto o el mensaje')
      : c.para === 'otro' && !String(c.direcciones || '').includes('@') ? t('Falta a quién enviarlo') : null;
    case 'aviso_equipo': return String(c.titulo || '').trim() ? (c.a === 'personas' && !(c.personas || []).length ? t('Elige a quién avisar') : null) : t('Falta el título');
    case 'crear_tarea': return String(c.titulo || '').trim() ? null : t('Falta el título');
    case 'mensaje_chat': return c.canalId && String(c.texto || '').trim() ? null : t('Falta el canal o el texto');
    case 'webhook': return /^https:\/\/\S+$/i.test(String(c.url || '')) ? null : t('Falta una dirección https://');
    default: return null;
  }
}

let seq = 0;
export const nuevoId = (tipo: string) => `${tipo}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ── Plantillas para empezar ─────────────────────────────────────────────────
export interface Plantilla { id: string; nombre: string; desc: string; flujo: () => FlujoDatos }
const n = (id: string, tipo: TipoNodo, x: number, y: number, config: Record<string, any> = {}): NodoFlujo => ({ id, tipo, x, y, config: { ...CONFIG_INICIAL[tipo], ...config } });
const a = (de: string, aa: string, rama: 'si' | 'no' | null = null): AristaFlujo => ({ id: `${de}-${aa}-${rama || ''}`, de, a: aa, rama });
export const PLANTILLAS: Plantilla[] = [
  { id: 'blanco', nombre: 'En blanco', desc: 'Empieza desde cero.', flujo: () => ({ nodos: [n('d', 'disparador', 0, 0)], aristas: [] }) },
  {
    id: 'seguimiento', nombre: 'Seguimiento de clientes nuevos', desc: 'A los 3 días del alta, una tarea para llamar al cliente.',
    flujo: () => ({
      nodos: [n('d', 'disparador', 0, 0, { evento: 'cliente.creado' }), n('e', 'esperar', 0, 160, { cantidad: 3, unidad: 'dias' }),
        n('t', 'crear_tarea', 0, 320, { titulo: 'Llamar a {cliente.nombre}', descripcion: 'Seguimiento tras el alta.', dias: 1, asignar: 'usuario' })],
      aristas: [a('d', 'e'), a('e', 't')],
    }),
  },
  {
    id: 'expediente', nombre: 'Avisar al equipo de cada expediente nuevo', desc: 'Notificación a todo el despacho.',
    flujo: () => ({
      nodos: [n('d', 'disparador', 0, 0, { evento: 'expediente.creado' }),
        n('v', 'aviso_equipo', 0, 160, { a: 'todos', titulo: 'Nuevo expediente {expediente.ref}', mensaje: '{expediente.descripcion} · {cliente.nombre}' })],
      aristas: [a('d', 'v')],
    }),
  },
  {
    id: 'citas', nombre: 'Confirmar las citas al cliente', desc: 'Al poner una cita con cliente, se le confirma por correo.',
    flujo: () => ({
      nodos: [n('d', 'disparador', 0, 0, { evento: 'cita.creada' }), n('c', 'condicion', 0, 160, { campo: 'cliente.email', operador: 'no_vacio' }),
        n('m', 'enviar_correo', -180, 340, { asunto: 'Cita confirmada: {cita.titulo}', cuerpo: 'Hola {cliente.nombre},\n\nTe confirmamos la cita del {cita.fecha} a las {cita.hora}.\n\nUn saludo,\n{despacho.nombre}' }),
        n('v', 'aviso_equipo', 200, 340, { a: 'responsable', titulo: 'La cita con {cliente.nombre} no tiene correo', mensaje: 'No se ha podido confirmar por correo.' })],
      aristas: [a('d', 'c'), a('c', 'm', 'si'), a('c', 'v', 'no')],
    }),
  },
  {
    id: 'semanal', nombre: 'Recordatorio semanal en el chat', desc: 'Cada lunes a las 9, un mensaje en un canal.',
    flujo: () => ({
      nodos: [n('d', 'disparador', 0, 0, { evento: 'programado', frecuencia: 'semanal', dia: 1, hora: '09:00' }),
        n('m', 'mensaje_chat', 0, 160, { texto: 'Buenos días equipo 👋 Recordad revisar los plazos de esta semana en Tareas.' })],
      aristas: [a('d', 'm')],
    }),
  },
  {
    id: 'webhook', nombre: 'Enviar clientes nuevos a otra herramienta', desc: 'Con un webhook (Zapier, Make, n8n…).',
    flujo: () => ({ nodos: [n('d', 'disparador', 0, 0, { evento: 'cliente.creado' }), n('w', 'webhook', 0, 160)], aristas: [a('d', 'w')] }),
  },
];
