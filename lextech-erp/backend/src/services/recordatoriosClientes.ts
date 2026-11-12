import pool from '../config/database';
import { enviarCorreoDelDespacho, escaparHtml, SinCuentaCorreo } from '../utils/correoDespacho';
import { formatMadrid, madridLocalToDate, madridYmd } from './vistasAutomation';
import { tomarTurno } from '../utils/turnos';
import { registrarAutomatizacion } from '../utils/automatizacionesRegistro';
import { sendPushToUsers } from '../utils/webPush';

// Recordatorios a clientes (12/11/2026): unos días antes de una cita de la
// Agenda que tiene un cliente (directamente o por su expediente), se le manda
// un correo desde la cuenta del despacho. Se configura en Ajustes →
// Automatizaciones (organizaciones.automatizaciones.recordatorios).
// Cada evento se recuerda una vez por fecha: si se mueve, se recuerda la nueva.

export const TIPOS_RECORDABLES = ['cita', 'vista', 'reunion', 'llamada', 'video'] as const;

export interface RecordatoriosConfig {
  activo: boolean;
  diasAntes: number;
  hora: string;
  tipos: string[];
  asunto: string;
  cuerpo: string;
  avisarResponsable: boolean;
}

export const RECORDATORIO_POR_DEFECTO: RecordatoriosConfig = {
  activo: false,
  diasAntes: 1,
  hora: '10:00',
  tipos: ['cita', 'reunion', 'video'],
  asunto: 'Recordatorio: {titulo} el {fecha}',
  cuerpo: 'Hola {nombre},\n\nTe recordamos que tienes {titulo} con nosotros el {fecha} a las {hora}.{lugar_txt}\n\nSi no puedes asistir, avísanos respondiendo a este correo.\n\nUn saludo,\n{despacho}',
  avisarResponsable: false,
};

export function normalizarRecordatorios(raw: any): RecordatoriosConfig {
  const d = RECORDATORIO_POR_DEFECTO;
  const dias = Number(raw?.diasAntes);
  const tipos = Array.isArray(raw?.tipos) ? raw.tipos.filter((x: any) => (TIPOS_RECORDABLES as readonly string[]).includes(x)) : d.tipos;
  return {
    activo: raw?.activo === true,
    diasAntes: Number.isInteger(dias) && dias >= 0 && dias <= 14 ? dias : d.diasAntes,
    hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw?.hora || '')) ? String(raw.hora) : d.hora,
    tipos: tipos.length ? tipos : d.tipos,
    asunto: typeof raw?.asunto === 'string' && raw.asunto.trim() ? raw.asunto.trim().slice(0, 300) : d.asunto,
    cuerpo: typeof raw?.cuerpo === 'string' && raw.cuerpo.trim() ? raw.cuerpo.trim().slice(0, 5000) : d.cuerpo,
    avisarResponsable: raw?.avisarResponsable === true,
  };
}

function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

/** Momento en que sale el recordatorio de un evento que empieza en `inicio`. */
export function momentoRecordatorio(inicio: Date, cfg: Pick<RecordatoriosConfig, 'diasAntes' | 'hora'>): Date | null {
  return madridLocalToDate(sumarDias(madridYmd(inicio), -cfg.diasAntes), cfg.hora);
}

export interface VarsRecordatorio { nombre: string; titulo: string; fecha: string; hora: string; lugar: string; despacho: string }

export function rellenarRecordatorio(tpl: string, v: VarsRecordatorio, html: boolean): string {
  const esc = (s: string) => (html ? escaparHtml(s) : s);
  const lugarTxt = v.lugar ? `\nLugar: ${v.lugar}` : '';
  const out = tpl
    .replace(/\{lugar_txt\}/g, esc(lugarTxt))
    .replace(/\{(nombre|titulo|fecha|hora|lugar|despacho)\}/g, (_m, k: keyof VarsRecordatorio) => esc(v[k] || ''));
  return html ? out.replace(/\n/g, '<br>') : out;
}

/** Variables de un evento (también para la vista previa). */
export function varsDe(ev: { title: string; start_at: Date | string; all_day?: boolean; location?: string | null }, nombre: string, despacho: string): VarsRecordatorio {
  const inicio = new Date(ev.start_at);
  return {
    nombre: nombre || 'cliente',
    titulo: String(ev.title || 'una cita').trim(),
    fecha: formatMadrid(inicio, { weekday: 'long', day: 'numeric', month: 'long' }),
    hora: ev.all_day ? '' : formatMadrid(inicio, { hour: '2-digit', minute: '2-digit' }),
    lugar: String(ev.location || '').trim(),
    despacho,
  };
}

async function procesarOrganizacion(org: { id: string; nombre: string; automatizaciones: any }): Promise<void> {
  const cfg = normalizarRecordatorios(org.automatizaciones?.recordatorios);
  if (!cfg.activo) return;
  // Eventos con cliente que empiezan pronto y aún no se han recordado.
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.start_at, e.all_day, e.location, e.user_id,
            COALESCE(c.email, ce.email) AS email,
            TRIM(COALESCE(c.first_name, ce.first_name, '') || ' ' || COALESCE(c.last_name, ce.last_name, '')) AS nombre
       FROM agenda_events e
       LEFT JOIN entities c ON c.id = e.cliente_id AND c.organizacion_id = e.organizacion_id
       LEFT JOIN expedientes x ON x.id = e.expediente_id AND x.organizacion_id = e.organizacion_id
       LEFT JOIN entities ce ON ce.id = x.cliente_id AND ce.organizacion_id = e.organizacion_id
      WHERE e.organizacion_id = $1
        AND e.type = ANY($2::text[])
        AND COALESCE(e.status, '') <> 'cancelado'
        AND e.start_at > NOW()
        AND e.start_at < NOW() + ($3::int + 1) * INTERVAL '1 day'
        AND COALESCE(c.email, ce.email) IS NOT NULL AND COALESCE(c.email, ce.email) <> ''
        AND NOT EXISTS (SELECT 1 FROM recordatorios_clientes_enviados r WHERE r.event_id = e.id AND r.start_at = e.start_at)
      ORDER BY e.start_at
      LIMIT 50`,
    [org.id, cfg.tipos, cfg.diasAntes],
  );
  const ahora = Date.now();
  for (const ev of rows) {
    const cuando = momentoRecordatorio(new Date(ev.start_at), cfg);
    if (!cuando || cuando.getTime() > ahora) continue;
    // La fila hace de candado: dos instancias no lo mandan dos veces.
    const { rows: claim } = await pool.query(
      `INSERT INTO recordatorios_clientes_enviados (event_id, start_at, organizacion_id, destinatario)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING event_id`,
      [ev.id, ev.start_at, org.id, ev.email],
    );
    if (!claim.length) continue;
    const v = varsDe(ev, ev.nombre, org.nombre);
    try {
      await enviarCorreoDelDespacho(org.id, {
        to: [String(ev.email).trim()],
        subject: rellenarRecordatorio(cfg.asunto, v, false),
        html: rellenarRecordatorio(cfg.cuerpo, v, true),
      });
      await registrarAutomatizacion(org.id, 'recordatorios', true, `Recordatorio enviado a ${ev.nombre || ev.email} <${ev.email}> · ${v.titulo}, ${v.fecha}`);
      if (cfg.avisarResponsable && ev.user_id) {
        await sendPushToUsers([ev.user_id], {
          title: 'Recordatorio enviado al cliente',
          body: `${ev.nombre || ev.email} · ${v.titulo}, ${v.fecha}${v.hora ? ` ${v.hora}` : ''}`,
          url: '/dashboard/agenda',
          tag: `recordatorio-cliente-${ev.id}`,
        }).catch(() => {});
      }
    } catch (e: any) {
      await pool.query(`UPDATE recordatorios_clientes_enviados SET ok = false WHERE event_id = $1 AND start_at = $2`, [ev.id, ev.start_at]).catch(() => {});
      const motivo = e instanceof SinCuentaCorreo ? 'el despacho no tiene correo conectado' : (e?.message || String(e));
      await registrarAutomatizacion(org.id, 'recordatorios', false, `No se pudo enviar a ${ev.email}: ${motivo}`);
    }
  }
}

export async function runRecordatoriosClientes(): Promise<void> {
  if (!(await tomarTurno('recordatorios-clientes', 4 * 60 * 1000).catch(() => false))) return;
  const { rows } = await pool.query(
    `SELECT id, nombre, automatizaciones FROM organizaciones WHERE (automatizaciones->'recordatorios'->>'activo') = 'true'`,
  ).catch(() => ({ rows: [] as any[] }));
  for (const org of rows) {
    await procesarOrganizacion(org).catch((e) => console.error('[recordatorios-clientes]', org.id, e?.message || e));
  }
}

export function startRecordatoriosClientesScheduler(): void {
  setTimeout(() => {
    void runRecordatoriosClientes();
    setInterval(() => void runRecordatoriosClientes(), 5 * 60 * 1000);
  }, 45_000);
}
