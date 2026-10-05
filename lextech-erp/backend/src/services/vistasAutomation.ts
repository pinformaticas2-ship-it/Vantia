import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from '../config/database';
import {
  syncImapAccountRecord,
  syncGmailProfileRecord,
  loadEmailContent,
  fetchEmailAttachmentBuffer,
} from '../controllers/emailController';
import { sendPushToUsers } from '../utils/webPush';
import { heartbeatStart, heartbeatEnd } from '../utils/heartbeat';

// ── Automatización de vistas por correo ──────────────────────────────────────
// Flujo (activable por organización desde Configuración → Automatizaciones):
//   1. Llega un correo al buzón vigilado          → este programador lo detecta
//   2. Se revisa el hueco en la Agenda del abogado → findAgendaConflicts
//   3. Se pregunta al abogado (push + campana + página Vistas)
//   4-8. Aceptar/rechazar, expediente, agenda, adjuntos y recordatorio se
//        ejecutan cuando el abogado decide -- ver controllers/vistasController.ts.
// Este fichero solo hace la parte automática (1-3) y el envío de los
// recordatorios (8) cuando llega su momento.

export interface VistasPlantilla { asunto: string; cuerpo: string }

export interface VistasConfig {
  mailbox: { type: 'imap' | 'gmail'; id: string } | null;
  responsableUserId: string | null;
  duracionMin: number;
  recordatorioDias: number;
  recordatorioHora: string;
  palabrasClave: string[];
  remitentes: string[];
  guardarAdjuntos: boolean;
  plantillaAceptar: VistasPlantilla;
  plantillaRechazar: VistasPlantilla;
}

export const DEFAULT_PALABRAS_CLAVE = [
  'vista', 'señalamiento', 'señala', 'juicio', 'audiencia previa', 'comparecencia', 'citación', 'citacion',
];

export const DEFAULT_PLANTILLA_ACEPTAR: VistasPlantilla = {
  asunto: 'Re: {asunto_original}',
  cuerpo:
    'Buenos días,\n\n' +
    'Les confirmamos nuestra asistencia a la vista señalada para el {fecha} a las {hora}{juzgado_txt}{autos_txt}.\n\n' +
    '{mensaje}\n\n' +
    'Un cordial saludo,\n{abogado}\n{despacho}',
};

export const DEFAULT_PLANTILLA_RECHAZAR: VistasPlantilla = {
  asunto: 'Re: {asunto_original}',
  cuerpo:
    'Buenos días,\n\n' +
    'Lamentamos comunicarles que no nos es posible asistir a la vista señalada para el {fecha} a las {hora}{juzgado_txt}{autos_txt}.\n\n' +
    '{mensaje}\n\n' +
    'Un cordial saludo,\n{abogado}\n{despacho}',
};

function clampInt(v: any, min: number, max: number, def: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

function cleanList(v: any): string[] {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[,;\n]/);
  return Array.from(new Set(arr.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean))).slice(0, 50);
}

function cleanPlantilla(v: any, def: VistasPlantilla): VistasPlantilla {
  const asunto = String(v?.asunto ?? '').trim().slice(0, 300);
  const cuerpo = String(v?.cuerpo ?? '').trim().slice(0, 5000);
  return { asunto: asunto || def.asunto, cuerpo: cuerpo || def.cuerpo };
}

/** Normaliza lo que haya guardado en organizaciones.vistas_auto_config (o lo
 *  que mande el frontend) a una configuración completa con valores por defecto. */
export function normalizeVistasConfig(raw: any): VistasConfig {
  const mb = raw?.mailbox;
  const mailbox = mb && (mb.type === 'imap' || mb.type === 'gmail') && typeof mb.id === 'string' && mb.id
    ? { type: mb.type as 'imap' | 'gmail', id: mb.id }
    : null;
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw?.recordatorioHora || '')) ? String(raw.recordatorioHora) : '09:00';
  const palabras = cleanList(raw?.palabrasClave);
  return {
    mailbox,
    responsableUserId: raw?.responsableUserId ? String(raw.responsableUserId) : null,
    duracionMin: clampInt(raw?.duracionMin, 15, 600, 120),
    recordatorioDias: clampInt(raw?.recordatorioDias, 0, 30, 1),
    recordatorioHora: hora,
    palabrasClave: palabras.length ? palabras : DEFAULT_PALABRAS_CLAVE,
    remitentes: cleanList(raw?.remitentes),
    guardarAdjuntos: raw?.guardarAdjuntos !== false,
    plantillaAceptar: cleanPlantilla(raw?.plantillaAceptar, DEFAULT_PLANTILLA_ACEPTAR),
    plantillaRechazar: cleanPlantilla(raw?.plantillaRechazar, DEFAULT_PLANTILLA_RECHAZAR),
  };
}

// ── Zona horaria ─────────────────────────────────────────────────────────────
// El servidor corre en UTC, pero "10:30" en un señalamiento es hora de Madrid
// (con su horario de verano). Sin librerías: se calcula el desfase real de esa
// fecha concreta con Intl.

function madridOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** 'YYYY-MM-DD' + 'HH:MM' en hora de Madrid → instante real (Date). */
export function madridLocalToDate(ymd: string, hm: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!dm || !tm) return null;
  const guess = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  let ts = guess - madridOffsetMinutes(new Date(guess)) * 60000;
  const off2 = madridOffsetMinutes(new Date(ts));
  ts = guess - off2 * 60000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMadrid(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...opts }).format(d);
}

/** Fecha 'YYYY-MM-DD' de un instante, vista en Madrid. */
export function madridYmd(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // en-CA ya da YYYY-MM-DD
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Momento del recordatorio "preparar vista": N días antes de la fecha de
 *  preparación indicada en el correo (si la hay) o, si no, de la propia vista,
 *  a la hora configurada. Si ese momento ya pasó, se avisa en la próxima pasada. */
export function computeRecordatorioAt(fechaVista: Date, fechaPreparacionYmd: string | null, cfg: VistasConfig): Date | null {
  const base = fechaPreparacionYmd && /^\d{4}-\d{2}-\d{2}$/.test(fechaPreparacionYmd) ? fechaPreparacionYmd : madridYmd(fechaVista);
  return madridLocalToDate(addDaysYmd(base, -cfg.recordatorioDias), cfg.recordatorioHora);
}

// ── Detección: palabras clave ────────────────────────────────────────────────

function fold(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export function emailPlainText(row: any): string {
  const t = String(row?.body_text || '').trim();
  return (t || htmlToText(row?.body_html || '')).slice(0, 30000);
}

function parseAttachments(row: any): { filename: string; contentType: string; size: number }[] {
  try { return JSON.parse(row?.attachments_json || '[]') || []; } catch { return []; }
}

function matchesKeywords(text: string, palabras: string[]): boolean {
  const t = fold(text);
  return palabras.some((p) => {
    const k = fold(p).trim();
    if (!k) return false;
    // Palabra completa: "vista" no debe disparar con "revista" ni "entrevista".
    const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    return re.test(t);
  });
}

function matchesSender(fromEmail: string, remitentes: string[]): boolean {
  if (!remitentes.length) return true;
  const f = String(fromEmail || '').toLowerCase();
  return remitentes.some((r) => (r.includes('@') ? f === r : f.endsWith(`@${r.replace(/^@/, '')}`) || f.endsWith(`.${r.replace(/^@/, '')}`)));
}

// ── Extracción de datos ──────────────────────────────────────────────────────

export interface VistaDatos {
  es_vista: boolean;
  tipo_acto: string | null;
  fecha_vista: string | null;   // YYYY-MM-DD (Madrid)
  hora_vista: string | null;    // HH:MM (Madrid)
  duracion_min: number | null;
  juzgado: string | null;
  sala: string | null;
  direccion: string | null;
  num_autos: string | null;
  nig: string | null;
  tipo_procedimiento: string | null;
  partes: string | null;
  cliente: string | null;
  contrario: string | null;
  fecha_preparacion: string | null;
  modalidad: string | null;
  enlace_telematico: string | null;
  resumen: string | null;
}

const EMPTY_DATOS: VistaDatos = {
  es_vista: false, tipo_acto: null, fecha_vista: null, hora_vista: null, duracion_min: null,
  juzgado: null, sala: null, direccion: null, num_autos: null, nig: null, tipo_procedimiento: null,
  partes: null, cliente: null, contrario: null, fecha_preparacion: null, modalidad: null,
  enlace_telematico: null, resumen: null,
};

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

// Google emite claves con el formato antiguo (AIzaSy…) y con el nuevo (AQ.…):
// basta con que haya una. Si no vale, la llamada falla y se usa el respaldo
// por patrones igualmente.
export function geminiAvailable(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim());
}

function str(v: any, max = 500): string | null {
  const s = v == null ? '' : String(v).trim();
  return s && s.toLowerCase() !== 'null' ? s.slice(0, max) : null;
}

function normYmd(v: any): string | null {
  const s = str(v, 20);
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function normHm(v: any): string | null {
  const m = /^(\d{1,2})[:.h](\d{2})/.exec(String(v ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function sanitizeDatos(raw: any): VistaDatos {
  return {
    es_vista: raw?.es_vista === true || raw?.es_vista === 'true',
    tipo_acto: str(raw?.tipo_acto, 120),
    fecha_vista: normYmd(raw?.fecha_vista),
    hora_vista: normHm(raw?.hora_vista),
    duracion_min: Number.isFinite(Number(raw?.duracion_min)) && Number(raw.duracion_min) > 0 ? Math.min(600, Math.round(Number(raw.duracion_min))) : null,
    juzgado: str(raw?.juzgado, 300),
    sala: str(raw?.sala, 120),
    direccion: str(raw?.direccion, 300),
    num_autos: str(raw?.num_autos, 120),
    nig: str(raw?.nig, 60),
    tipo_procedimiento: str(raw?.tipo_procedimiento, 200),
    partes: str(raw?.partes, 500),
    cliente: str(raw?.cliente, 200),
    contrario: str(raw?.contrario, 200),
    fecha_preparacion: normYmd(raw?.fecha_preparacion),
    modalidad: str(raw?.modalidad, 40),
    enlace_telematico: str(raw?.enlace_telematico, 500),
    resumen: str(raw?.resumen, 1500),
  };
}

async function extractWithGemini(
  subject: string, from: string, text: string,
  pdfs: { filename: string; contentType: string; content: Buffer }[],
): Promise<VistaDatos | null> {
  if (!geminiAvailable()) return null;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
  const hoy = madridYmd(new Date());
  const prompt = `Eres el asistente de un despacho de abogados en España. Hoy es ${hoy}.
Analiza el correo siguiente (y los PDF adjuntos, si los hay) y decide si comunica el SEÑALAMIENTO
de una vista, juicio, audiencia previa, comparecencia u otro acto procesal con fecha y hora al que
deba asistir un abogado del despacho. Boletines, publicidad, facturas o correos que solo mencionan
la palabra "vista" sin señalar un acto concreto NO son una vista.

Devuelve SOLO este JSON (sin markdown), con null en lo que no aparezca:
{"es_vista": true|false,
 "tipo_acto": "vista|juicio oral|audiencia previa|comparecencia|...",
 "fecha_vista": "YYYY-MM-DD", "hora_vista": "HH:MM", "duracion_min": número|null,
 "juzgado": "órgano judicial completo", "sala": "sala o despacho", "direccion": "dirección postal",
 "num_autos": "número de procedimiento, p.ej. 123/2026", "nig": "NIG",
 "tipo_procedimiento": "p.ej. Juicio verbal", "partes": "demandante contra demandado",
 "cliente": "parte a la que representa el despacho si se deduce", "contrario": "parte contraria",
 "fecha_preparacion": "YYYY-MM-DD solo si el correo indica expresamente cuándo preparar la vista o un plazo para prepararla",
 "modalidad": "presencial|telematica", "enlace_telematico": "url si la hay",
 "resumen": "1-2 frases en español"}

Remitente: ${from}
Asunto: ${subject}
Cuerpo:
${text.slice(0, 20000)}`;

  const parts: any[] = [{ text: prompt }];
  let inlineBytes = 0;
  for (const pdf of pdfs) {
    if (inlineBytes + pdf.content.length > MAX_INLINE_BYTES) break;
    inlineBytes += pdf.content.length;
    parts.push({ inlineData: { mimeType: 'application/pdf', data: pdf.content.toString('base64') } });
  }

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      } as any);
      const raw = result.response.text().trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      return sanitizeDatos(JSON.parse(raw));
    } catch { /* siguiente modelo */ }
  }
  return null;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Respaldo sin IA (Gemini no configurado o caído): busca la primera fecha
 *  futura acompañada de una hora, más autos/NIG/juzgado por patrones típicos
 *  de las cédulas de citación. Menos fino que la IA, pero el abogado siempre
 *  revisa y puede corregir los datos antes de aceptar. */
export function extractWithPatterns(subject: string, text: string): VistaDatos {
  const src = `${subject}\n${text}`;
  const f = fold(src);
  const today = madridYmd(new Date());
  const candidates: { ymd: string; hm: string | null; idx: number }[] = [];

  const timeAfter = (idx: number): string | null => {
    const tail = f.slice(idx, idx + 60);
    const m = /(?:a\s+las|las|,)?\s*(\d{1,2})[:.h](\d{2})\s*(?:h|horas|hrs)?/.exec(tail);
    return m ? normHm(`${m[1]}:${m[2]}`) : null;
  };

  const reNum = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g;
  for (let m; (m = reNum.exec(f));) {
    const ymd = normYmd(`${m[1]}/${m[2]}/${m[3]}`);
    if (ymd) candidates.push({ ymd, hm: timeAfter(m.index + m[0].length), idx: m.index });
  }
  const reTxt = /\b(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})\b/g;
  for (let m; (m = reTxt.exec(f));) {
    const mes = MESES[m[2]];
    if (mes) candidates.push({ ymd: `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`, hm: timeAfter(m.index + m[0].length), idx: m.index });
  }

  const futuras = candidates.filter((c) => c.ymd >= today).sort((a, b) => (Number(!!b.hm) - Number(!!a.hm)) || a.idx - b.idx);
  const best = futuras[0] || null;

  const autos = /(?:autos|procedimiento|p\.?\s?o\.?|juicio verbal|ejecuci[oó]n|n[ºo°]\s*proc\.?)[^0-9]{0,25}(\d{1,6}\s*\/\s*\d{2,4})/i.exec(src);
  const nig = /\bNIG[:.\s]*([0-9A-Z]{8,25})/i.exec(src);
  // El punto corta el nombre salvo en abreviaturas tipo "n.º 2".
  const juzgado = /((?:Juzgado|Tribunal|Audiencia\s+Provincial|Secci[oó]n)\s+(?:[^\n.;,]|\.(?=\s*[º°ª0-9])){3,120})/i.exec(src);
  const sala = /\b(Sala\s+(?:de\s+vistas\s+)?(?:n[ºo°.]*\s*)?[0-9A-Z]{1,4})\b/i.exec(src);

  return {
    ...EMPTY_DATOS,
    es_vista: Boolean(best),
    tipo_acto: /audiencia previa/.test(f) ? 'audiencia previa' : /\bvista\b/.test(f) ? 'vista' : /juicio/.test(f) ? 'juicio' : /comparecencia/.test(f) ? 'comparecencia' : 'vista',
    fecha_vista: best?.ymd || null,
    hora_vista: best?.hm || null,
    juzgado: juzgado ? juzgado[1].trim().slice(0, 300) : null,
    sala: sala ? sala[1].trim() : null,
    num_autos: autos ? autos[1].replace(/\s+/g, '') : null,
    nig: nig ? nig[1] : null,
  };
}

// ── Hueco en la agenda ───────────────────────────────────────────────────────

export interface AgendaConflict {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  type: string;
}

/** Eventos de la Agenda del abogado (propios o en los que figura como
 *  usuario relacionado) que se solapan con la franja de la vista. Los de
 *  "todo el día" cuentan si caen ese mismo día en Madrid (vacaciones, fuera
 *  de la oficina...). */
export async function findAgendaConflicts(
  organizacionId: string, userId: string | null, start: Date, duracionMin: number, excludeEventIds: string[] = [],
): Promise<AgendaConflict[]> {
  if (!userId) return [];
  const end = new Date(start.getTime() + duracionMin * 60000);
  const { rows } = await pool.query(
    `SELECT id, title, start_at, end_at, all_day, type
       FROM agenda_events
      WHERE organizacion_id = $1
        AND (user_id = $2 OR related_user_id = $2)
        AND status <> 'cancelado'
        AND NOT (id = ANY($6::uuid[]))
        AND (
          (NOT all_day AND start_at < $4 AND COALESCE(end_at, start_at + interval '1 hour') > $3)
          OR (all_day AND (start_at AT TIME ZONE 'Europe/Madrid')::date <= $5::date
                      AND (COALESCE(end_at, start_at) AT TIME ZONE 'Europe/Madrid')::date >= $5::date)
        )
      ORDER BY start_at ASC
      LIMIT 20`,
    [organizacionId, userId, start, end, madridYmd(start), excludeEventIds],
  );
  return rows.map((r: any) => ({
    id: r.id, title: r.title, start_at: r.start_at, end_at: r.end_at, all_day: r.all_day, type: r.type,
  }));
}

// ── Plantillas de correo ─────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface PlantillaVars {
  asunto_original: string;
  fecha: string;
  hora: string;
  juzgado: string;
  autos: string;
  abogado: string;
  despacho: string;
  mensaje: string;
}

function fillTemplate(tpl: string, vars: PlantillaVars): string {
  const map: Record<string, string> = {
    ...vars,
    juzgado_txt: vars.juzgado ? ` en ${vars.juzgado}` : '',
    autos_txt: vars.autos ? ` (autos ${vars.autos})` : '',
  };
  return tpl.replace(/\{(\w+)\}/g, (all, key) => (key in map ? map[key] : all));
}

export function renderPlantilla(tpl: VistasPlantilla, vars: PlantillaVars): { asunto: string; html: string; texto: string } {
  const asunto = fillTemplate(tpl.asunto, vars).replace(/\s+/g, ' ').trim().slice(0, 900);
  // Un {mensaje} vacío no debe dejar un hueco de párrafos en blanco.
  const texto = fillTemplate(tpl.cuerpo, vars).replace(/\n{3,}/g, '\n\n').trim();
  const html = texto.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return { asunto, html, texto };
}

// ── Destinatarios de los avisos ──────────────────────────────────────────────

/** Quién debe enterarse de una vista pendiente: el abogado responsable y,
 *  si no hay ninguno configurado, el propietario y los administradores. */
async function avisoDestinatarios(organizacionId: string, responsableUserId: string | null): Promise<string[]> {
  if (responsableUserId) return [responsableUserId];
  const { rows } = await pool.query(
    `SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1 AND rol IN ('propietario','admin')`,
    [organizacionId],
  );
  return rows.map((r: any) => r.user_id);
}

// ── Procesado de una organización ────────────────────────────────────────────

const MAX_EMAILS_PER_TICK = 15;

async function syncMailbox(organizacionId: string, cfg: VistasConfig): Promise<{ accountId: string | null; gmailProfileId: string | null; ownerUserId: string | null; syncError: string | null }> {
  const mb = cfg.mailbox!;
  if (mb.type === 'imap') {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE id = $1 AND organizacion_id = $2 AND active = true`,
      [mb.id, organizacionId],
    );
    if (!rows.length) throw new Error('La cuenta de correo configurada ya no existe, está desactivada o no pertenece a esta organización.');
    let syncError: string | null = null;
    try { await syncImapAccountRecord(rows[0], 'INBOX', 50); } catch (e: any) { syncError = e?.message || String(e); }
    return { accountId: rows[0].id, gmailProfileId: null, ownerUserId: rows[0].user_id, syncError };
  }
  const { rows } = await pool.query(
    `SELECT id, user_id FROM email_oauth_profiles WHERE id = $1 AND organizacion_id = $2`,
    [mb.id, organizacionId],
  );
  if (!rows.length) throw new Error('El perfil de Gmail configurado ya no existe o no pertenece a esta organización.');
  let syncError: string | null = null;
  try { await syncGmailProfileRecord(rows[0].id, rows[0].user_id, organizacionId, 'INBOX', 15); } catch (e: any) { syncError = e?.message || String(e); }
  return { accountId: null, gmailProfileId: rows[0].id, ownerUserId: rows[0].user_id, syncError };
}

async function analyzeEmail(emailId: string, cfg: VistasConfig) {
  const row = await loadEmailContent(emailId);
  if (!row) return null;
  const text = emailPlainText(row);
  const attachments = parseAttachments(row);
  const haystack = `${row.subject || ''}\n${text}\n${attachments.map((a) => a.filename).join('\n')}`;

  if (!matchesSender(row.from_email, cfg.remitentes) || !matchesKeywords(haystack, cfg.palabrasClave)) {
    return { row, text, datos: null as VistaDatos | null, origen: 'filtro' as const };
  }

  const pdfs: { filename: string; contentType: string; content: Buffer }[] = [];
  if (geminiAvailable()) {
    for (let i = 0; i < attachments.length && pdfs.length < 4; i++) {
      const a = attachments[i];
      const isPdf = /pdf/i.test(a.contentType || '') || /\.pdf$/i.test(a.filename || '');
      if (!isPdf || (a.size && a.size > MAX_INLINE_BYTES)) continue;
      try {
        const buf = await fetchEmailAttachmentBuffer(emailId, i);
        if (buf) pdfs.push(buf);
      } catch { /* adjunto ilegible: se analiza solo el cuerpo */ }
    }
  }

  const ia = await extractWithGemini(row.subject || '', `${row.from_name || ''} <${row.from_email || ''}>`, text, pdfs);
  if (ia) return { row, text, datos: ia, origen: 'ia' as const };
  return { row, text, datos: extractWithPatterns(row.subject || '', text), origen: 'patrones' as const };
}

async function processOrganizacion(org: { id: string; nombre: string; vistas_auto_config: any; vistas_auto_activated_at: Date }): Promise<string | null> {
  const cfg = normalizeVistasConfig(org.vistas_auto_config);
  if (!cfg.mailbox) return 'No hay ningún buzón configurado para vigilar.';

  const mb = await syncMailbox(org.id, cfg);
  const mailboxCond = mb.accountId ? 'e.account_id = $1' : 'e.gmail_profile_id = $1';

  const { rows: candidatos } = await pool.query(
    `SELECT e.id
       FROM emails e
      WHERE ${mailboxCond}
        AND e.folder = 'INBOX'
        AND NOT e.is_draft
        -- "Nuevo" = guardado en Vantia después de activar (created_at) y con
        -- fecha de envío como mucho 1 h anterior (correos entregados con
        -- retraso). Antes solo contaba la fecha del remitente, y un correo
        -- fechado un minuto antes de activar pero entregado después se perdía.
        -- La fecha de envío sigue excluyendo el histórico que la sincronización
        -- automática de carpetas va bajando (correos de hace semanas).
        AND e.created_at >= $2
        AND COALESCE(e.sent_at, e.created_at) >= $2::timestamptz - interval '1 hour'
        AND NOT EXISTS (SELECT 1 FROM vistas_solicitudes vs WHERE vs.email_id = e.id)
      ORDER BY COALESCE(e.sent_at, e.created_at) ASC
      LIMIT ${MAX_EMAILS_PER_TICK}`,
    [mb.accountId || mb.gmailProfileId, org.vistas_auto_activated_at],
  );

  for (const { id: emailId } of candidatos) {
    let analysis: Awaited<ReturnType<typeof analyzeEmail>> = null;
    try {
      analysis = await analyzeEmail(emailId, cfg);
    } catch (e: any) {
      // No se pudo ni leer el correo (credenciales, red...): se reintentará en
      // la siguiente pasada, no se marca como procesado.
      console.warn('[vistas] no se pudo analizar el correo', emailId, e?.message || e);
      continue;
    }
    if (!analysis) continue;
    const { row, text, datos, origen } = analysis;

    const base = [
      org.id, emailId, mb.accountId, mb.gmailProfileId, mb.ownerUserId,
      row.from_email || null, row.from_name || null, row.subject || null, row.message_id || null,
      row.sent_at || row.created_at || null,
    ];

    // Ni remitente ni palabras clave: no es una vista. Se registra sin cuerpo
    // solo para no volver a analizarlo en cada pasada.
    if (!datos) {
      await pool.query(
        `INSERT INTO vistas_solicitudes
           (organizacion_id, email_id, account_id, gmail_profile_id, mailbox_user_id,
            from_email, from_name, subject, message_id, received_at, estado, extraccion_origen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ignorada','filtro')
         ON CONFLICT (email_id) DO NOTHING`,
        base,
      );
      continue;
    }

    const esVista = datos.es_vista && Boolean(datos.fecha_vista);
    const duracion = datos.duracion_min || cfg.duracionMin;
    const fechaVista = datos.fecha_vista ? madridLocalToDate(datos.fecha_vista, datos.hora_vista || '09:00') : null;
    const conflictos = esVista && fechaVista ? await findAgendaConflicts(org.id, cfg.responsableUserId, fechaVista, duracion) : [];
    let responsableNombre: string | null = null;
    if (cfg.responsableUserId) {
      const { resolveUserName } = await import('../controllers/activityController');
      responsableNombre = await resolveUserName(cfg.responsableUserId);
    }

    const { rows: inserted } = await pool.query(
      `INSERT INTO vistas_solicitudes
         (organizacion_id, email_id, account_id, gmail_profile_id, mailbox_user_id,
          from_email, from_name, subject, message_id, received_at,
          estado, extraccion_origen, body_text, datos, fecha_vista, duracion_min,
          responsable_user_id, responsable_nombre, conflictos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (email_id) DO NOTHING
       RETURNING id`,
      [
        ...base,
        esVista ? 'pendiente' : 'descartada', origen, text.slice(0, 20000), JSON.stringify(datos),
        fechaVista, duracion, cfg.responsableUserId, responsableNombre, JSON.stringify(conflictos),
      ],
    );

    if (esVista && inserted.length && fechaVista) {
      const cuando = `${formatMadrid(fechaVista, { weekday: 'short', day: 'numeric', month: 'short' })} ${datos.hora_vista || ''}`.trim();
      const destinatarios = await avisoDestinatarios(org.id, cfg.responsableUserId);
      await sendPushToUsers(destinatarios, {
        title: conflictos.length ? '⚠️ Vista por confirmar (choca con tu agenda)' : '⚖️ Vista por confirmar',
        body: `${cuando}${datos.juzgado ? ' · ' + datos.juzgado : ''}`,
        url: `/dashboard/vistas?id=${inserted[0].id}`,
        tag: `vista-${inserted[0].id}`,
      });
    }
  }

  return mb.syncError ? `Sincronización del buzón: ${mb.syncError}` : null;
}

// ── Recordatorios "preparar vista" ───────────────────────────────────────────

async function sendDueReminders(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT vs.id, vs.organizacion_id, vs.responsable_user_id, vs.fecha_vista, vs.datos
       FROM vistas_solicitudes vs
       JOIN organizaciones o ON o.id = vs.organizacion_id
      WHERE vs.estado = 'aceptada'
        AND o.vistas_auto_enabled = true
        AND vs.recordatorio_at IS NOT NULL
        AND vs.recordatorio_at <= NOW()
        AND vs.recordatorio_enviado_at IS NULL
        AND vs.fecha_vista > NOW()
      LIMIT 50`,
  );
  for (const r of rows) {
    const datos = r.datos || {};
    const fecha = new Date(r.fecha_vista);
    const destinatarios = await avisoDestinatarios(r.organizacion_id, r.responsable_user_id);
    await sendPushToUsers(destinatarios, {
      title: '📚 Preparar vista',
      body: `${formatMadrid(fecha, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}${datos.juzgado ? ' · ' + datos.juzgado : ''}`,
      url: `/dashboard/vistas?id=${r.id}`,
      tag: `vista-recordatorio-${r.id}`,
    });
    await pool.query(`UPDATE vistas_solicitudes SET recordatorio_enviado_at = NOW(), updated_at = NOW() WHERE id = $1`, [r.id]);
  }
}

// ── Programador ──────────────────────────────────────────────────────────────

// Clave fija para pg_try_advisory_lock: si hay más de una instancia del
// backend (o una pasada se alarga más que el intervalo), solo una procesa a
// la vez y nunca se crean dos solicitudes ni se avisa dos veces.
const ADVISORY_LOCK_KEY = 74_810_233;
let running = false;
// Organizaciones con correo nuevo avisado (IMAP IDLE) mientras ya había una
// pasada en marcha: se procesan justo al terminarla, sin esperar al minuto.
const pendingOrgs = new Set<string>();

/** Revisión inmediata de una organización (la llama vistasIdle.ts en cuanto
 *  el servidor de correo avisa de un mensaje nuevo). */
export function requestVistasCheck(organizacionId: string): void {
  pendingOrgs.add(organizacionId);
  if (!running) void runVistasTick([...pendingOrgs]);
}

export async function runVistasTick(onlyOrgIds?: string[]): Promise<void> {
  if (running) return;
  running = true;
  for (const id of onlyOrgIds || []) pendingOrgs.delete(id);
  if (!onlyOrgIds) pendingOrgs.clear();
  const client = await pool.connect().catch(() => null);
  if (!client) { running = false; return; }
  await heartbeatStart('vistas');
  let hbOrgs = 0;
  try {
    const { rows: lock } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [ADVISORY_LOCK_KEY]);
    if (!lock[0]?.ok) return;
    try {
      const { rows: orgs } = await pool.query(
        `SELECT id, nombre, vistas_auto_config, vistas_auto_activated_at
           FROM organizaciones
          WHERE vistas_auto_enabled = true AND vistas_auto_activated_at IS NOT NULL
            AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`,
        [onlyOrgIds && onlyOrgIds.length ? onlyOrgIds : null],
      );
      hbOrgs = orgs.length;
      for (const org of orgs) {
        let lastError: string | null = null;
        try {
          lastError = await processOrganizacion(org);
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.error('[vistas] organización', org.id, lastError);
        }
        await pool.query(
          `UPDATE organizaciones SET vistas_auto_last_run_at = NOW(), vistas_auto_last_error = $2 WHERE id = $1`,
          [org.id, lastError],
        ).catch(() => {});
      }
      await sendDueReminders();
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } catch (e) {
    console.error('[vistas] runVistasTick:', e);
  } finally {
    client.release();
    running = false;
    await heartbeatEnd('vistas', { organizaciones: hbOrgs, soloOrgs: onlyOrgIds?.length || null });
    if (pendingOrgs.size) setImmediate(() => void runVistasTick([...pendingOrgs]));
  }
}

export function startVistasScheduler(): void {
  // Red de seguridad cada minuto (Gmail, o si se cae la conexión IDLE); lo
  // habitual es que el aviso inmediato de vistasIdle.ts llegue antes.
  setTimeout(() => {
    void runVistasTick();
    setInterval(() => void runVistasTick(), 60 * 1000);
  }, 30_000);
}
