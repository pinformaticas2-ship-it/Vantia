import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import {
  AlarmClock, AlertTriangle, BellRing, CalendarCheck, CalendarClock, CalendarPlus, CalendarSearch, Check, CheckCircle2, FileText,
  FolderPlus, GitBranch, Loader2, Mail, MailCheck, Paperclip, Reply, Search, Send, Sparkles, UserPlus, Workflow, X, XCircle, type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';
import { notifyVistasChanged } from '../lib/useVistasStatus';
import VistasCorreoConfigModal, { CorreoConfig } from '../components/VistasCorreoConfigModal';
import FlujoEditor, { Campo, CampoCorreo, CampoLista, campoCls, type PasoFlujo } from '../components/FlujoEditor';
import MisAutomatizaciones from './AutomatizacionesPropias';
import { locale, t, tn } from '../lib/i18n';

// Ajustes → Automatizaciones (12/11/2026). Fichas como las de Integraciones,
// con su estado, cifras y últimas ejecuciones, y un editor de flujo para cada
// una (components/FlujoEditor.tsx): ver qué pasa, paso a paso, ajustar cada
// paso y quitar los opcionales.
// Backend: /api/automatizaciones (resumen, bienvenida, recordatorios),
// /api/vistas/config (vistas por correo) y /api/docs-base/config.

type Clave = 'vistas' | 'docsBase' | 'bienvenida' | 'recordatorios';
interface Ejecucion { ok: boolean; detalle: string; created_at: string }
interface Resumen {
  canManage: boolean;
  cuentaCorreo: string | null;
  vistas: { activo: boolean; ultimaRevision: string | null; error: string | null; recibidas30: number; aceptadas30: number; pendientes: number; ultimas: Ejecucion[] };
  docsBase: { activo: boolean; docs: Record<string, boolean>; generados30: number };
  bienvenida: { activo: boolean; asunto: string; cuerpo: string; firma: string; asuntoPorDefecto: string; cuerpoPorDefecto: string; enviados30: number; ultimas: Ejecucion[] };
  recordatorios: RecordatoriosCfg & { tiposPosibles: string[]; enviados30: number; proximos7: number; ultimas: Ejecucion[] };
}
interface RecordatoriosCfg { activo: boolean; diasAntes: number; hora: string; tipos: string[]; asunto: string; cuerpo: string; avisarResponsable: boolean }
interface VistasCfg {
  mailbox: { type: string; id: string } | null; responsableUserId: string | null; duracionMin: number; recordatorioDias: number; recordatorioHora: string;
  palabrasClave: string[]; remitentes: string[]; guardarAdjuntos: boolean; responderAlAceptar: boolean; responderAlRechazar: boolean; recordatorioActivo: boolean;
  plantillaAceptar: { asunto: string; cuerpo: string }; plantillaRechazar: { asunto: string; cuerpo: string }; correo: any;
}
interface VistasResp {
  enabled: boolean; canManage: boolean; canSee: boolean; mailboxLabel?: string | null; mailboxWarning?: string | null; lastError?: string | null;
  iaDisponible?: boolean; config?: VistasCfg; mailboxCompartido?: boolean; mailboxOptions?: MailboxOption[]; mailboxId?: string | null;
  organizacionNombre?: string; miembros?: { userId: string; nombre: string; rol: string }[];
}
interface MailboxOption { type: 'imap' | 'gmail'; id: string; label: string; email?: string; warning: string | null; vigiladoEnOtra?: boolean }

const DOCS_BASE = [
  { tipo: 'lopd', nombre: 'LOPD', detalle: 'Documento LOPD, con los datos del despacho y del cliente.' },
  { tipo: 'toma_requisitos', nombre: 'Informe de toma de requisitos', detalle: 'El general, o el de cláusulas/hipotecas, medidas de apoyo o usura según el asunto.' },
  { tipo: 'hoja_encargo', nombre: 'Hoja de encargo', detalle: 'Según el tipo: civil, penal, asuntos masa, tarjeta revolving, medidas de apoyo u obligación de hacer.' },
];
const TIPOS_CITA: Record<string, string> = { cita: 'Cita', vista: 'Vista oral', reunion: 'Reunión', llamada: 'Llamada', video: 'Videollamada' };

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Ficha de una automatización (como las de Integraciones) ────────────────
function Interruptor({ activo, disabled, cargando, onClick, titulo }: { activo: boolean; disabled: boolean; cargando: boolean; onClick: () => void; titulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} disabled={disabled || cargando} onClick={onClick} title={titulo}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-red-600' : 'bg-slate-300'}`}>
      {cargando
        ? <Loader2 size={14} className="mx-auto animate-spin text-white" />
        : <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />}
    </button>
  );
}

function Ficha({ icono: Icono, fondo, titulo, subtitulo, activo, revisar, descripcion, cifras, avisos, ultimas, puedeCambiar, cambiando, onCambiar, onFlujo, puedeVerFlujo, pie }: {
  icono: LucideIcon; fondo: string; titulo: string; subtitulo: string; activo: boolean; revisar?: boolean; descripcion: string;
  cifras: { valor: React.ReactNode; etiqueta: string }[]; avisos: React.ReactNode[]; ultimas?: Ejecucion[];
  puedeCambiar: boolean; cambiando: boolean; onCambiar: () => void; onFlujo: () => void; puedeVerFlujo: boolean; pie?: React.ReactNode;
}) {
  const estado = !activo ? { txt: t('Desactivada'), cls: 'bg-slate-100 text-slate-500' }
    : revisar ? { txt: t('Revisar'), cls: 'bg-amber-50 text-amber-700' } : { txt: t('Activa'), cls: 'bg-emerald-50 text-emerald-700' };
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${fondo}`}><Icono size={20} /></div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">{titulo}</p>
            <p className="flex items-start gap-1 text-xs text-slate-400"><GitBranch size={11} className="mt-0.5 shrink-0" />{subtitulo}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${estado.cls}`}>{estado.txt}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{descripcion}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cifras.map((c) => (
          <div key={c.etiqueta} className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-base font-extrabold leading-tight text-slate-800">{c.valor}</p>
            <p className="text-[11px] leading-tight text-slate-500">{c.etiqueta}</p>
          </div>
        ))}
      </div>

      {avisos.filter(Boolean).map((a, i) => (
        <p key={i} className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{a}</span>
        </p>
      ))}

      {ultimas && ultimas.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('Últimas ejecuciones')}</p>
          <ul className="space-y-1">
            {ultimas.slice(0, 3).map((u, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                {u.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-red-500" />}
                <span className="min-w-0 flex-1 truncate" title={u.detalle} data-sin-traducir>{u.detalle}</span>
                <span className="shrink-0 text-slate-400">{fmt(u.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pie}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <button type="button" onClick={onFlujo} disabled={!puedeVerFlujo}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">
          <Workflow size={13} />{puedeCambiar ? t('Editar flujo') : t('Ver flujo')}
        </button>
        <Interruptor activo={activo} disabled={!puedeCambiar} cargando={cambiando} onClick={onCambiar}
          titulo={puedeCambiar ? (activo ? t('Desactivar') : t('Activar')) : t('Solo el propietario o un administrador pueden cambiarlo')} />
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────
export default function AutomatizacionesPanel() {
  const { getToken } = useAuth();
  const [res, setRes] = useState<Resumen | null>(null);
  const [vistas, setVistas] = useState<VistasResp | null>(null);
  const [error, setError] = useState('');
  const [cambiando, setCambiando] = useState<Clave | null>(null);
  const [abierto, setAbierto] = useState<Clave | null>(null);
  const [eligiendoBuzon, setEligiendoBuzon] = useState(false);
  const [errorBuzon, setErrorBuzon] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [r, v] = await Promise.all([
        apiFetch('/api/automatizaciones', { getToken }),
        apiFetch('/api/vistas/config', { getToken }),
      ]);
      if (r?.success === false) throw new Error(r.error);
      setRes(r.data);
      if (v?.success !== false) setVistas(v.data);
      setError('');
    } catch (e: any) { setError(e?.message || t('No se pudo cargar la automatización')); }
  }, [getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  const put = async (url: string, body: unknown) => {
    const r = await apiFetch(url, { method: 'PUT', getToken, body: JSON.stringify(body) });
    if (r?.success === false) throw new Error(r.error);
    return r;
  };

  const cambiar = async (clave: Clave, mailbox?: { type: string; id: string }) => {
    if (!res) return;
    // Las vistas piden elegir el buzón al activarlas.
    if (clave === 'vistas' && !vistas?.enabled && !mailbox) { setErrorBuzon(''); setEligiendoBuzon(true); return; }
    setCambiando(clave);
    try {
      if (clave === 'vistas') {
        const r = await put('/api/vistas/config', mailbox ? { enabled: true, config: { mailbox } } : { enabled: !vistas?.enabled });
        setVistas(r.data); notifyVistasChanged(); setEligiendoBuzon(false);
      } else if (clave === 'docsBase') await put('/api/docs-base/config', { activo: !res.docsBase.activo });
      else if (clave === 'bienvenida') await put('/api/automatizaciones/bienvenida', { activo: !res.bienvenida.activo });
      else {
        const { tiposPosibles, enviados30, proximos7, ultimas, ...cfg } = res.recordatorios;
        await put('/api/automatizaciones/recordatorios', { ...cfg, activo: !cfg.activo });
      }
      await cargar();
    } catch (e: any) {
      if (clave === 'vistas' && mailbox) setErrorBuzon(e?.message || t('No se pudo cambiar'));
      else aviso.error(e?.message || t('No se pudo cambiar'));
    } finally { setCambiando(null); }
  };

  if (!res) {
    return error
      ? <p className="peligro rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      : <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>;
  }
  const gestor = res.canManage;
  const sinCorreo = !res.cuentaCorreo ? t('El despacho no tiene ninguna cuenta de correo conectada: no se puede enviar nada. Conéctala en Correo.') : null;
  const docsEnFlujo = DOCS_BASE.filter((d) => res.docsBase.docs?.[d.tipo] !== false).length;
  const r = res.recordatorios;

  return (
    <div>
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-extrabold text-slate-800">{t('Automatizaciones')}</h1>
        <p className="text-sm text-slate-500">{t('Tareas que Vantia hace sola en esta organización. Abre el flujo de cada una para ver qué hace, paso a paso, y ajustarlo.')}</p>
      </div>

      <h2 className="mb-1 text-lg font-extrabold text-slate-800">{t('De serie')}</h2>
      <p className="mb-4 text-sm text-slate-500">{t('Vienen con Vantia. Puedes mover sus pasos, quitar los opcionales y añadirles pasos propios al final.')}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Ficha icono={CalendarCheck} fondo="bg-red-50 text-red-600" titulo={t('Vistas recibidas por correo')}
          subtitulo={t('Correo del juzgado → expediente y agenda')}
          activo={Boolean(vistas?.enabled)} revisar={Boolean(vistas?.mailboxWarning || vistas?.lastError || vistas?.mailboxCompartido)}
          descripcion={t('Detecta los señalamientos que llegan al correo, te pide confirmación y, al aceptar, responde, crea el expediente, lo pone en la agenda y guarda los adjuntos.')}
          cifras={[
            { valor: res.vistas.recibidas30, etiqueta: t('recibidas (30 días)') },
            { valor: res.vistas.aceptadas30, etiqueta: t('aceptadas (30 días)') },
            { valor: res.vistas.pendientes, etiqueta: t('por decidir') },
          ]}
          avisos={vistas?.enabled ? [vistas.mailboxWarning || vistas.lastError || null,
            vistas.mailboxCompartido ? t('Este correo también se revisa en otra organización, así que las vistas pueden duplicarse. Elige otro correo aquí o pide que lo desactiven allí.') : null,
            vistas.iaDisponible === false ? t('La IA (Gemini) no está configurada en el servidor: los datos se leerán por patrones, con menos precisión. Revisa siempre la fecha antes de aceptar.') : null] : []}
          ultimas={res.vistas.ultimas}
          pie={vistas?.enabled ? (
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              {vistas.mailboxLabel && <span>{t('Buzón vigilado:')}{' '}<b className="text-slate-700" data-sin-traducir>{vistas.mailboxLabel}</b>
                {gestor && <button type="button" onClick={() => { setErrorBuzon(''); setEligiendoBuzon(true); }} className="ml-1.5 font-bold text-red-600 hover:underline">{t('Cambiar')}</button>}</span>}
              <span>{t('Última revisión:')}{' '}<b className="text-slate-700">{fmt(res.vistas.ultimaRevision)}</b></span>
              {vistas.canSee && <Link to="/dashboard/vistas" className="font-bold text-red-600 hover:underline">{t('Ver vistas →')}</Link>}
            </p>
          ) : null}
          puedeCambiar={gestor} cambiando={cambiando === 'vistas'} onCambiar={() => void cambiar('vistas')}
          onFlujo={() => setAbierto('vistas')} puedeVerFlujo={Boolean(vistas?.config)} />

        <Ficha icono={FileText} fondo="bg-indigo-50 text-indigo-600" titulo={t('Documentos de cada expediente')}
          subtitulo={t('Expediente nuevo → documentos rellenos')}
          activo={res.docsBase.activo}
          descripcion={t('Todo expediente tendrá estos documentos, rellenos con sus datos. Los nuevos, al crearlos; los que ya existían, la primera vez que se abran. Están en la ficha del expediente.')}
          cifras={[
            { valor: res.docsBase.generados30, etiqueta: t('generados (30 días)') },
            { valor: `${docsEnFlujo}/${DOCS_BASE.length}`, etiqueta: t('documentos en el flujo') },
          ]}
          avisos={[]}
          puedeCambiar={gestor} cambiando={cambiando === 'docsBase'} onCambiar={() => void cambiar('docsBase')}
          onFlujo={() => setAbierto('docsBase')} puedeVerFlujo />

        <Ficha icono={UserPlus} fondo="bg-emerald-50 text-emerald-600" titulo={t('Bienvenida al cliente')}
          subtitulo={t('Alta de cliente → correo de bienvenida')}
          activo={res.bienvenida.activo} revisar={!res.cuentaCorreo}
          descripcion={t('Al dar de alta un cliente con correo (a mano o con el formulario del enlace) se le envía un correo confirmando que tenéis sus datos.')}
          cifras={[
            { valor: res.bienvenida.enviados30, etiqueta: t('enviados (30 días)') },
            { valor: res.cuentaCorreo ? <span className="block truncate text-xs font-semibold" data-sin-traducir>{res.cuentaCorreo}</span> : '—', etiqueta: t('se envía desde') },
          ]}
          avisos={res.bienvenida.activo ? [sinCorreo] : []}
          ultimas={res.bienvenida.ultimas}
          puedeCambiar={gestor} cambiando={cambiando === 'bienvenida'} onCambiar={() => void cambiar('bienvenida')}
          onFlujo={() => setAbierto('bienvenida')} puedeVerFlujo />

        <Ficha icono={CalendarClock} fondo="bg-sky-50 text-sky-600" titulo={t('Recordatorios a clientes')}
          subtitulo={t('Cita con cliente → correo recordatorio')}
          activo={r.activo} revisar={!res.cuentaCorreo}
          descripcion={t('Antes de cada cita de la Agenda con un cliente, le llega un correo recordándole el día, la hora y el lugar. Menos olvidos y menos huecos perdidos.')}
          cifras={[
            { valor: r.enviados30, etiqueta: t('enviados (30 días)') },
            { valor: r.proximos7, etiqueta: t('citas con cliente en 7 días') },
            { valor: r.diasAntes === 0 ? t('El mismo día') : tn(r.diasAntes, '{n} día antes', '{n} días antes'), etiqueta: t('a las {hora}', { hora: r.hora }) },
          ]}
          avisos={r.activo ? [sinCorreo] : []}
          ultimas={r.ultimas}
          puedeCambiar={gestor} cambiando={cambiando === 'recordatorios'} onCambiar={() => void cambiar('recordatorios')}
          onFlujo={() => setAbierto('recordatorios')} puedeVerFlujo />
      </div>

      <MisAutomatizaciones puedeEditar={gestor} />

      {abierto === 'vistas' && vistas?.config && (
        <FlujoVistas datos={vistas} puedeEditar={gestor} onCerrar={() => setAbierto(null)} onGuardado={cargar} put={put}
          onCambiarBuzon={() => { setErrorBuzon(''); setEligiendoBuzon(true); }} />
      )}
      {abierto === 'docsBase' && <FlujoDocs docs={res.docsBase.docs} activo={res.docsBase.activo} puedeEditar={gestor} onCerrar={() => setAbierto(null)} onGuardado={cargar} put={put} />}
      {abierto === 'bienvenida' && <FlujoBienvenida datos={res.bienvenida} cuenta={res.cuentaCorreo} puedeEditar={gestor} onCerrar={() => setAbierto(null)} onGuardado={cargar} put={put} />}
      {abierto === 'recordatorios' && <FlujoRecordatorios datos={res.recordatorios} cuenta={res.cuentaCorreo} puedeEditar={gestor} onCerrar={() => setAbierto(null)} onGuardado={cargar} put={put} />}

      {eligiendoBuzon && vistas && (
        <ElegirBuzon
          organizacion={vistas.organizacionNombre || t('esta organización')}
          opciones={vistas.mailboxOptions || []}
          actual={vistas.mailboxId || null}
          activando={!vistas.enabled}
          guardando={cambiando === 'vistas'}
          error={errorBuzon}
          onCancel={() => { setEligiendoBuzon(false); setErrorBuzon(''); }}
          onConfirm={(m) => void cambiar('vistas', { type: m.type, id: m.id })}
        />
      )}
    </div>
  );
}

type Put = (url: string, body: unknown) => Promise<any>;
interface PropsFlujo { puedeEditar: boolean; onCerrar: () => void; onGuardado: () => Promise<void>; put: Put }

/** Borrador + guardar, igual para todos los flujos. */
function useBorrador<T>(inicial: T, guardar: (b: T) => Promise<void>, onGuardado: () => Promise<void>) {
  const [base, setBase] = useState(inicial);
  const [b, setB] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof T>(k: K, v: T[K]) => setB((p) => ({ ...p, [k]: v }));
  const onGuardar = async () => {
    setGuardando(true); setError('');
    try { await guardar(b); setBase(b); await onGuardado(); aviso.ok(t('Flujo guardado.')); }
    catch (e: any) { setError(e?.message || t('No se pudo guardar')); }
    finally { setGuardando(false); }
  };
  return { b, set, setB, sucio: !igual(b, base), guardando, error, onGuardar };
}

// ── Flujo: vistas por correo ────────────────────────────────────────────────
function FlujoVistas({ datos, puedeEditar, onCerrar, onGuardado, put, onCambiarBuzon }: PropsFlujo & { datos: VistasResp; onCambiarBuzon: () => void }) {
  const cfg = datos.config!;
  const inicial = useMemo(() => ({
    palabrasClave: cfg.palabrasClave, remitentes: cfg.remitentes, responsableUserId: cfg.responsableUserId, duracionMin: cfg.duracionMin,
    guardarAdjuntos: cfg.guardarAdjuntos, responderAlAceptar: cfg.responderAlAceptar !== false, responderAlRechazar: cfg.responderAlRechazar !== false,
    recordatorioActivo: cfg.recordatorioActivo !== false, recordatorioDias: cfg.recordatorioDias, recordatorioHora: cfg.recordatorioHora,
  }), [cfg]);
  const f = useBorrador(inicial, async (b) => { await put('/api/vistas/config', { enabled: datos.enabled, config: b }); }, onGuardado);
  const { b, set } = f;
  const [correoAbierto, setCorreoAbierto] = useState(false);
  const [plantillas, setPlantillas] = useState<CorreoConfig>({ plantillaAceptar: cfg.plantillaAceptar, plantillaRechazar: cfg.plantillaRechazar, correo: cfg.correo });
  const miembros = datos.miembros || [];
  const responsable = miembros.find((m) => m.userId === b.responsableUserId)?.nombre;

  const botonCorreo = (
    <button type="button" onClick={() => setCorreoAbierto(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      <Mail size={14} />{t('Editar los correos de respuesta')}
    </button>
  );

  const pasos: PasoFlujo[] = [
    {
      id: 'correo', clase: 'disparador', icono: Mail, titulo: t('Llega un correo al buzón vigilado'),
      resumen: datos.mailboxLabel || t('Sin buzón elegido'),
      explicacion: t('Vantia revisa ese buzón cada minuto (y al momento si el servidor de correo avisa). Solo lo que llega desde que se activó.'),
      ajustes: (
        <>
          <Campo etiqueta={t('Buzón')}>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate" data-sin-traducir>{datos.mailboxLabel || '—'}</span>
              {datos.enabled && <button type="button" onClick={onCambiarBuzon} className="shrink-0 text-xs font-bold text-red-600 hover:underline">{t('Cambiar')}</button>}
            </div>
          </Campo>
          <CampoLista etiqueta={t('Solo de estos remitentes (opcional)')} valor={b.remitentes} onChange={(v) => set('remitentes', v)}
            placeholder={'@justicia.es\nlexnet@...'} ayuda={t('Uno por línea: direcciones o dominios. Vacío: de cualquiera.')} />
        </>
      ),
    },
    {
      id: 'palabras', clase: 'condicion', icono: Search, titulo: t('El correo habla de una vista'),
      resumen: tn(b.palabrasClave.length, '{n} palabra clave', '{n} palabras clave'),
      explicacion: t('Tiene que contener alguna de estas palabras y un número de autos. Las respuestas automáticas y los correos sin relación se ignoran.'),
      ajustes: <CampoLista etiqueta={t('Palabras clave')} valor={b.palabrasClave} onChange={(v) => set('palabrasClave', v)} ayuda={t('Una por línea. Sin distinguir mayúsculas ni tildes.')} />,
    },
    {
      id: 'leer', clase: 'accion', icono: Sparkles, titulo: t('Leer fecha, hora, juzgado, autos y NIG'),
      resumen: datos.iaDisponible === false ? t('Por patrones (IA no configurada)') : t('Con IA'),
      explicacion: t('Se leen el correo y sus adjuntos. Si es un cambio de fecha o una cancelación de una vista que ya teníais, se trata como tal.'),
    },
    {
      id: 'agenda-check', clase: 'accion', icono: CalendarSearch, titulo: t('Comprobar si choca con la agenda'),
      explicacion: t('Se avisa si a esa hora ya hay algo en la agenda, para decidir con todo a la vista.'),
    },
    {
      id: 'confirmar', clase: 'accion', icono: BellRing, titulo: t('Pedir confirmación'),
      resumen: responsable ? t('A {nombre}', { nombre: responsable }) : t('Al dueño del buzón'),
      explicacion: t('Llega un aviso (y a la campana) para aceptarla o rechazarla desde Vistas. Por privacidad, solo la ven el dueño del buzón y esta persona.'),
      ajustes: (
        <Campo etiqueta={t('¿A quién se pide?')}>
          <select className={campoCls} value={b.responsableUserId || ''} onChange={(e) => set('responsableUserId', e.target.value || null)}>
            <option value="">{t('Al dueño del buzón')}</option>
            {miembros.map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
          </select>
        </Campo>
      ),
    },
  ];

  const ramas = [
    {
      id: 'aceptar', titulo: t('Si aceptas'), tono: 'verde' as const, pasos: [
        {
          id: 'resp-ok', clase: 'accion' as const, icono: Reply, titulo: t('Responder al remitente confirmando'),
          resumen: plantillas.plantillaAceptar.asunto,
          explicacion: t('Al aceptar puedes revisar el correo antes de que salga, o no enviarlo esa vez.'),
          opcional: { activo: b.responderAlAceptar, cambiar: (v: boolean) => set('responderAlAceptar', v) },
          ajustes: botonCorreo,
        },
        { id: 'expediente', clase: 'accion' as const, icono: FolderPlus, titulo: t('Dar de alta el expediente o vincularlo'),
          explicacion: t('Si los autos o el NIG coinciden con un expediente vuestro, se vincula a él; si no, se crea uno nuevo.') },
        {
          id: 'agenda', clase: 'accion' as const, icono: CalendarPlus, titulo: t('Añadir la vista a la agenda'),
          resumen: t('Duración: {n} min', { n: b.duracionMin }),
          explicacion: t('En la agenda de quien la acepta, con el juzgado y la sala.'),
          ajustes: (
            <Campo etiqueta={t('Duración por defecto')}>
              <select className={campoCls} value={b.duracionMin} onChange={(e) => set('duracionMin', Number(e.target.value))}>
                {[30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{tn(m, '{n} minuto', '{n} minutos')}</option>)}
              </select>
            </Campo>
          ),
        },
        {
          id: 'adjuntos', clase: 'accion' as const, icono: Paperclip, titulo: t('Guardar los adjuntos en el expediente'),
          explicacion: t('Los documentos del correo pasan a la documentación del expediente.'),
          opcional: { activo: b.guardarAdjuntos, cambiar: (v: boolean) => set('guardarAdjuntos', v) },
        },
        {
          id: 'recordatorio', clase: 'accion' as const, icono: AlarmClock, titulo: t('Recordatorio para prepararla'),
          resumen: b.recordatorioDias === 0 ? t('El mismo día a las {hora}', { hora: b.recordatorioHora }) : tn(b.recordatorioDias, '{n} día antes a las {hora}', '{n} días antes a las {hora}', { hora: b.recordatorioHora }),
          explicacion: t('Un aviso para preparar la vista con tiempo.'),
          opcional: { activo: b.recordatorioActivo, cambiar: (v: boolean) => set('recordatorioActivo', v) },
          ajustes: (
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta={t('Días antes')}>
                <input type="number" min={0} max={30} className={campoCls} value={b.recordatorioDias} onChange={(e) => set('recordatorioDias', Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
              </Campo>
              <Campo etiqueta={t('Hora')}>
                <input type="time" className={campoCls} value={b.recordatorioHora} onChange={(e) => set('recordatorioHora', e.target.value || '09:00')} />
              </Campo>
            </div>
          ),
        },
      ],
    },
    {
      id: 'rechazar', titulo: t('Si rechazas'), tono: 'rojo' as const, pasos: [
        {
          id: 'resp-no', clase: 'accion' as const, icono: Reply, titulo: t('Responder que no podéis asistir'),
          resumen: plantillas.plantillaRechazar.asunto,
          explicacion: t('No se crea nada más. Si lo quitas, al rechazar no se responde (salvo que prepares el correo a mano).'),
          opcional: { activo: b.responderAlRechazar, cambiar: (v: boolean) => set('responderAlRechazar', v) },
          ajustes: botonCorreo,
        },
      ],
    },
  ];

  return (
    <>
      <FlujoEditor vinculada="vistas" titulo={t('Vistas recibidas por correo')} subtitulo={t('Correo del juzgado → expediente y agenda')} icono={CalendarCheck}
        pasos={pasos} ramas={ramas} puedeEditar={puedeEditar} sucio={f.sucio} guardando={f.guardando} error={f.error} onGuardar={f.onGuardar} onCerrar={onCerrar}
        descripcion={t('Cuando llega un señalamiento al correo, Vantia lo lee, te pide confirmación y, según lo que decidas, hace el resto. Puedes quitar los pasos que no quieras.')} />
      {correoAbierto && createPortal(
        <VistasCorreoConfigModal initial={plantillas} canManage={puedeEditar} onClose={() => setCorreoAbierto(false)}
          onSave={async (c) => {
            await put('/api/vistas/config', { enabled: datos.enabled, config: { plantillaAceptar: c.plantillaAceptar, plantillaRechazar: c.plantillaRechazar, correo: c.correo } });
            setPlantillas(c);
          }} />,
        document.body,
      )}
    </>
  );
}

// ── Flujo: documentos de cada expediente ────────────────────────────────────
function FlujoDocs({ docs, activo, puedeEditar, onCerrar, onGuardado, put }: PropsFlujo & { docs: Record<string, boolean>; activo: boolean }) {
  const inicial = useMemo(() => Object.fromEntries(DOCS_BASE.map((d) => [d.tipo, docs?.[d.tipo] !== false])) as Record<string, boolean>, [docs]);
  const f = useBorrador(inicial, async (b) => {
    if (!Object.values(b).some(Boolean)) throw new Error(t('Deja al menos un documento en el flujo.'));
    await put('/api/docs-base/config', { activo, docs: b });
  }, onGuardado);
  const pasos: PasoFlujo[] = [
    { id: 'exp', clase: 'disparador', icono: FolderPlus, titulo: t('Se crea un expediente'),
      resumen: t('O se abre uno anterior por primera vez'),
      explicacion: t('Los expedientes que ya existían reciben sus documentos la primera vez que se abren.') },
    ...DOCS_BASE.map((d): PasoFlujo => ({
      id: d.tipo, clase: 'accion', icono: FileText, titulo: t('Generar: {doc}', { doc: t(d.nombre) }), resumen: t(d.detalle),
      explicacion: t(d.detalle),
      opcional: { activo: f.b[d.tipo], cambiar: (v) => f.set(d.tipo, v) },
    })),
    { id: 'ficha', clase: 'accion', icono: MailCheck, titulo: t('Dejarlos en la ficha del expediente'),
      explicacion: t('Rellenos con los datos del despacho, del cliente y del expediente. Lo que falte queda marcado para completarlo, y se pueden volver a generar.') },
  ];
  return (
    <FlujoEditor vinculada="docsBase" titulo={t('Documentos de cada expediente')} subtitulo={t('Expediente nuevo → documentos rellenos')} icono={FileText}
      pasos={pasos} puedeEditar={puedeEditar} sucio={f.sucio} guardando={f.guardando} error={f.error} onGuardar={f.onGuardar} onCerrar={onCerrar}
      descripcion={t('Elige qué documentos se preparan solos en cada expediente. Las plantillas que se usan son las de Documentos.')} />
  );
}

// ── Flujo: bienvenida al cliente ────────────────────────────────────────────
function FlujoBienvenida({ datos, cuenta, puedeEditar, onCerrar, onGuardado, put }: PropsFlujo & { datos: Resumen['bienvenida']; cuenta: string | null }) {
  const inicial = useMemo(() => ({ asunto: datos.asunto, cuerpo: datos.cuerpo, firma: datos.firma }), [datos]);
  const f = useBorrador(inicial, async (b) => { await put('/api/automatizaciones/bienvenida', { activo: datos.activo, ...b }); }, onGuardado);
  const pasos: PasoFlujo[] = [
    { id: 'alta', clase: 'disparador', icono: UserPlus, titulo: t('Se da de alta un cliente'),
      resumen: t('A mano o con el formulario del enlace'),
      explicacion: t('No en las importaciones por CSV: no se escribe a cientos de clientes antiguos de golpe.') },
    { id: 'email', clase: 'condicion', icono: Mail, titulo: t('El cliente tiene correo electrónico'),
      explicacion: t('Sin correo, no se envía nada.') },
    { id: 'correo', clase: 'accion', icono: Send, titulo: t('Enviar el correo de bienvenida'),
      resumen: f.b.asunto || t(datos.asuntoPorDefecto),
      explicacion: <>{cuenta ? t('Sale desde {cuenta}.', { cuenta }) : t('El despacho no tiene ninguna cuenta de correo conectada: no se puede enviar nada. Conéctala en Correo.')}{' '}{t('Si el cliente prefiere otro idioma, va en español y en el suyo.')}</>,
      ajustes: (
        <>
          <CampoCorreo asunto={f.b.asunto} cuerpo={f.b.cuerpo} onAsunto={(v) => f.set('asunto', v)} onCuerpo={(v) => f.set('cuerpo', v)}
            phAsunto={datos.asuntoPorDefecto} phCuerpo={datos.cuerpoPorDefecto}
            variables={[{ clave: 'nombre', desc: t('Nombre completo del cliente') }]} />
          <Campo etiqueta={t('Firma (opcional)')} ayuda={t('Se añade al final del correo, debajo del mensaje.')}>
            <textarea rows={3} className={campoCls} value={f.b.firma} onChange={(e) => f.set('firma', e.target.value)} />
          </Campo>
          <p className="text-[11px] text-slate-400">{t('Deja asunto y mensaje vacíos para usar el texto por defecto.')}</p>
        </>
      ) },
  ];
  return (
    <FlujoEditor vinculada="bienvenida" titulo={t('Bienvenida al cliente')} subtitulo={t('Alta de cliente → correo de bienvenida')} icono={UserPlus}
      pasos={pasos} puedeEditar={puedeEditar} sucio={f.sucio} guardando={f.guardando} error={f.error} onGuardar={f.onGuardar} onCerrar={onCerrar}
      descripcion={t('Un correo para que el cliente sepa que tenéis sus datos. Pulsa «Enviar el correo de bienvenida» para cambiar el texto.')} />
  );
}

// ── Flujo: recordatorios a clientes ─────────────────────────────────────────
function FlujoRecordatorios({ datos, cuenta, puedeEditar, onCerrar, onGuardado, put }: PropsFlujo & { datos: Resumen['recordatorios']; cuenta: string | null }) {
  const { getToken } = useAuth();
  const inicial = useMemo<RecordatoriosCfg>(() => ({
    activo: datos.activo, diasAntes: datos.diasAntes, hora: datos.hora, tipos: datos.tipos, asunto: datos.asunto, cuerpo: datos.cuerpo, avisarResponsable: datos.avisarResponsable,
  }), [datos]);
  const f = useBorrador(inicial, async (b) => {
    if (!b.tipos.length) throw new Error(t('Elige al menos un tipo de cita.'));
    await put('/api/automatizaciones/recordatorios', b);
  }, onGuardado);
  const { b, set } = f;
  const [previa, setPrevia] = useState<{ asunto: string; html: string; ejemploReal: boolean } | null>(null);
  const [cargandoPrevia, setCargandoPrevia] = useState(false);
  const verPrevia = async () => {
    setCargandoPrevia(true);
    try {
      const r = await apiFetch('/api/automatizaciones/recordatorios/preview', { method: 'POST', getToken, body: JSON.stringify(b) });
      if (r?.success === false) throw new Error(r.error);
      setPrevia(r.data);
    } catch (e: any) { aviso.error(e?.message || t('No se pudo preparar la vista previa')); } finally { setCargandoPrevia(false); }
  };
  const cuando = b.diasAntes === 0 ? t('El mismo día a las {hora}', { hora: b.hora }) : tn(b.diasAntes, '{n} día antes a las {hora}', '{n} días antes a las {hora}', { hora: b.hora });

  const pasos: PasoFlujo[] = [
    {
      id: 'cita', clase: 'disparador', icono: CalendarClock, titulo: t('Se acerca una cita con un cliente'),
      resumen: `${cuando} · ${b.tipos.map((x) => t(TIPOS_CITA[x] || x)).join(', ')}`,
      explicacion: t('Cuenta cualquier evento de la Agenda de estos tipos que tenga un cliente, o un expediente con cliente. Si la cita se cambia de día, se recuerda la nueva fecha.'),
      ajustes: (
        <>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">{t('Tipos de cita')}</span>
            <div className="flex flex-wrap gap-2">
              {datos.tiposPosibles.map((tp) => {
                const on = b.tipos.includes(tp);
                return (
                  <button key={tp} type="button" onClick={() => set('tipos', on ? b.tipos.filter((x) => x !== tp) : [...b.tipos, tp])}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {on && <Check size={12} />}{t(TIPOS_CITA[tp] || tp)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta={t('¿Cuándo?')}>
              <select className={campoCls} value={b.diasAntes} onChange={(e) => set('diasAntes', Number(e.target.value))}>
                <option value={0}>{t('El mismo día')}</option>
                {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{tn(d, '{n} día antes', '{n} días antes')}</option>)}
              </select>
            </Campo>
            <Campo etiqueta={t('Hora')}><input type="time" className={campoCls} value={b.hora} onChange={(e) => set('hora', e.target.value || '10:00')} /></Campo>
          </div>
        </>
      ),
    },
    { id: 'email', clase: 'condicion', icono: Mail, titulo: t('El cliente tiene correo electrónico'),
      explicacion: t('Las citas canceladas no se recuerdan, y cada cita se recuerda una sola vez.') },
    {
      id: 'correo', clase: 'accion', icono: Send, titulo: t('Enviar el recordatorio al cliente'), resumen: b.asunto,
      explicacion: cuenta ? t('Sale desde {cuenta}.', { cuenta }) : t('El despacho no tiene ninguna cuenta de correo conectada: no se puede enviar nada. Conéctala en Correo.'),
      ajustes: (
        <>
          <CampoCorreo asunto={b.asunto} cuerpo={b.cuerpo} onAsunto={(v) => set('asunto', v)} onCuerpo={(v) => set('cuerpo', v)}
            variables={[
              { clave: 'nombre', desc: t('Nombre del cliente') }, { clave: 'titulo', desc: t('Título de la cita') },
              { clave: 'fecha', desc: t('Fecha') }, { clave: 'hora', desc: t('Hora') }, { clave: 'lugar', desc: t('Lugar') },
              { clave: 'lugar_txt', desc: t('«Lugar: …» si la cita tiene lugar') }, { clave: 'despacho', desc: t('Nombre del despacho') },
            ]} />
          <button type="button" onClick={() => void verPrevia()} disabled={cargandoPrevia}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {cargandoPrevia ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}{t('Vista previa')}
          </button>
          {previa && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] text-slate-400">{previa.ejemploReal ? t('Con tu próxima cita con cliente:') : t('Con una cita de ejemplo:')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800" data-sin-traducir>{previa.asunto}</p>
              <div className="mt-2 text-sm leading-6 text-slate-700" data-sin-traducir dangerouslySetInnerHTML={{ __html: previa.html }} />
            </div>
          )}
        </>
      ),
    },
    {
      id: 'aviso', clase: 'accion', icono: BellRing, titulo: t('Avisarte de que se ha enviado'),
      explicacion: t('Un aviso a quien tiene la cita en su agenda.'),
      opcional: { activo: b.avisarResponsable, cambiar: (v) => set('avisarResponsable', v) },
    },
  ];
  return (
    <FlujoEditor vinculada="recordatorios" titulo={t('Recordatorios a clientes')} subtitulo={t('Cita con cliente → correo recordatorio')} icono={CalendarClock}
      pasos={pasos} puedeEditar={puedeEditar} sucio={f.sucio} guardando={f.guardando} error={f.error} onGuardar={f.onGuardar} onCerrar={onCerrar}
      descripcion={t('Antes de cada cita de la Agenda con un cliente, le llega un correo recordándole el día, la hora y el lugar. Menos olvidos y menos huecos perdidos.')} />
  );
}

// ── Elegir el buzón que se vigila (vistas) ──────────────────────────────────
function ElegirBuzon({ organizacion, opciones, actual, activando, guardando, error, onCancel, onConfirm }: {
  organizacion: string; opciones: MailboxOption[]; actual: string | null; activando: boolean; guardando: boolean; error: string;
  onCancel: () => void; onConfirm: (m: MailboxOption) => void;
}) {
  // Con la automatización apagada no se revisa ninguno (aunque quede guardado el último).
  const actualActivo = activando ? null : actual;
  // Un correo, una organización: el que ya revisa otra no se puede elegir
  // (salvo el que esta ya tiene activo).
  const bloqueada = (o: MailboxOption) => !!o.warning || (!!o.vigiladoEnOtra && o.id !== actualActivo);
  const usables = opciones.filter((o) => !bloqueada(o));
  const [elegido, setElegido] = useState<string | null>(
    (actual && usables.some((o) => o.id === actual) ? actual : null) || (usables.length === 1 ? usables[0].id : null),
  );
  const sel = opciones.find((o) => o.id === elegido) || null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-800">{t('¿Qué correo se revisa para buscar vistas?')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('En')}{' '}<b className="text-slate-700">{organizacion}</b>{t('. Solo se leerá este buzón, y solo lo que llegue a partir de ahora.')}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label={t('Cerrar')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="space-y-2 px-5 py-4">
          {opciones.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('No tienes ningún correo conectado en esta organización.')}{' '}
              <Link to="/dashboard/correo" className="font-bold underline">{t('Conéctalo en Correo')}</Link>{' '}{t('y vuelve aquí para activarla.')}</div>
          )}
          {opciones.map((o) => {
            const activo = elegido === o.id;
            return (
              <button key={o.id} type="button" disabled={bloqueada(o)} onClick={() => setElegido(o.id)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${activo ? 'border-red-300 bg-red-50 ring-1 ring-red-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${activo ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 bg-white'}`}>
                  {activo && <Check size={12} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Mail size={14} className="shrink-0 text-slate-400" /><span className="truncate">{o.label}</span></span>
                  {o.id === actualActivo && <span className="mt-0.5 block text-xs text-slate-500">{t('Es el que se revisa ahora.')}</span>}
                  {o.warning && <span className="mt-1 block text-xs text-amber-700">{o.warning}</span>}
                  {o.vigiladoEnOtra && o.id !== actualActivo && (
                    <span className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>{t('Este correo ya se revisa en otra organización. Para usarlo aquí, primero hay que desactivarlo allí.')}</span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {error && <p className="peligro text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('Cancelar')}</button>
          <button type="button" disabled={!sel || bloqueada(sel) || guardando} onClick={() => sel && onConfirm(sel)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            {guardando && <Loader2 size={14} className="animate-spin" />}
            {activando ? t('Activar con este correo') : t('Usar este correo')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
