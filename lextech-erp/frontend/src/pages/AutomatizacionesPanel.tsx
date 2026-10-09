import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, Check, Loader2, Mail, Settings2, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { notifyVistasChanged } from '../lib/useVistasStatus';
import VistasCorreoConfigModal, { CorreoConfig } from '../components/VistasCorreoConfigModal';

// Configuración → Automatizaciones. Un único interruptor: al encenderlo se
// activa la automatización de vistas por correo para la organización activa,
// con valores por defecto. "Configurar correo" solo cambia cómo se ve el
// correo de respuesta (textos, firma, formato).
// Backend: services/vistasAutomation.ts + controllers/vistasController.ts.

interface ConfigResponse {
  enabled: boolean;
  canManage: boolean;
  canSee: boolean;
  mailboxLabel?: string | null;
  mailboxWarning?: string | null;
  activatedAt?: string | null;
  lastRunAt?: string | null;
  lastError?: string | null;
  iaDisponible?: boolean;
  config?: CorreoConfig;
  mailboxCompartidoCon?: string[];
  mailboxOptions?: MailboxOption[];
  mailboxId?: string | null;
  organizacionNombre?: string;
}
interface MailboxOption { type: 'imap' | 'gmail'; id: string; label: string; email?: string; warning: string | null; vigiladoPor?: string[] }

const PASOS = [
  'Llega al correo un señalamiento de vista',
  'Se leen fecha, hora, juzgado, autos y NIG y se revisa el hueco en la agenda',
  'Se te pide confirmación (notificación y campana)',
  'Al aceptar o rechazar se responde por correo al remitente',
  'Al aceptar se da de alta el expediente (o se vincula al existente)',
  'Se añade la vista a la agenda',
  'Los adjuntos se guardan en la documentación del expediente',
  'Recordatorio para prepararla 1 día antes',
];

function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function AutomatizacionesPanel() {
  const { getToken } = useAuth();
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [configOpen, setConfigOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/vistas/config', { getToken });
      if (res?.success === false) throw new Error(res.error);
      setData(res.data);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar la automatización');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  // Al activar (o al cambiar de buzón) se pregunta qué correo se revisa en
  // esta organización -- nunca se elige uno solo (09/10/2026).
  const [eligiendoBuzon, setEligiendoBuzon] = useState(false);

  const toggle = async (mailbox?: { type: string; id: string }) => {
    if (!data) return;
    const next = mailbox ? true : !data.enabled;
    if (next && !data.enabled && !mailbox) { setError(''); setEligiendoBuzon(true); return; }
    setSaving(true); setError('');
    try {
      const res = await apiFetch('/api/vistas/config', { method: 'PUT', getToken, body: JSON.stringify(mailbox ? { enabled: true, config: { mailbox } } : { enabled: next }) });
      if (res?.success === false) throw new Error(res.error);
      setData(res.data);
      notifyVistasChanged();
      setEligiendoBuzon(false);
    } catch (e: any) {
      setError(e.message || 'No se pudo cambiar');
    } finally {
      setSaving(false);
    }
  };

  const guardarCorreo = async (c: CorreoConfig) => {
    const res = await apiFetch('/api/vistas/config', {
      method: 'PUT', getToken,
      body: JSON.stringify({ enabled: Boolean(data?.enabled), config: { plantillaAceptar: c.plantillaAceptar, plantillaRechazar: c.plantillaRechazar, correo: c.correo } }),
    });
    if (res?.success === false) throw new Error(res.error);
    setData(res.data);
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const enabled = Boolean(data?.enabled);
  const canManage = Boolean(data?.canManage);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-1">Automatizaciones</h1>
        <p className="text-sm text-slate-500">Se activan para la organización en la que estás trabajando.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
              <CalendarCheck size={20} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">Vistas recibidas por correo</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {enabled ? 'Activada en esta organización.' : 'Desactivada en esta organización.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
          {data?.config && (
            <button type="button" onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Settings2 size={14} /> Configurar correo
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!canManage || saving}
            onClick={() => void toggle()}
            title={canManage ? (enabled ? 'Desactivar' : 'Activar') : 'Solo el propietario o un administrador pueden cambiarlo'}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-red-600' : 'bg-slate-300'}`}
          >
            {saving
              ? <Loader2 size={14} className="mx-auto animate-spin text-white" />
              : <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />}
          </button>
          </div>
        </div>

        <ol className="mt-4 grid gap-1.5 sm:grid-cols-2 text-xs text-slate-600">
          {PASOS.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>

        {!canManage && (
          <p className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Solo el propietario o un administrador de la organización pueden activarla o desactivarla.
          </p>
        )}

        {enabled && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {data?.mailboxLabel && (
              <span>Buzón vigilado: <b className="text-slate-700">{data.mailboxLabel}</b>
                {canManage && <button type="button" onClick={() => setEligiendoBuzon(true)} className="ml-1.5 font-bold text-red-600 hover:underline">Cambiar</button>}
              </span>
            )}
            <span>Desde: <b className="text-slate-700">{fmt(data?.activatedAt)}</b></span>
            <span>Última revisión: <b className="text-slate-700">{fmt(data?.lastRunAt)}</b></span>
            {data?.canSee && <Link to="/dashboard/vistas" className="font-bold text-red-600 hover:underline">Ver vistas →</Link>}
          </div>
        )}
        {enabled && (
          <p className="mt-2 text-xs text-slate-500">
            Por privacidad, las vistas (con sus correos y adjuntos) solo las ven el dueño del buzón vigilado y el abogado responsable.
          </p>
        )}
        {enabled && !!data?.mailboxCompartidoCon?.length && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Este mismo buzón también lo vigila {data.mailboxCompartidoCon.join(', ')}: cada vista aparecerá en las dos organizaciones (el aviso solo te llega una vez). Si no lo necesitas, desactiva la automatización en una de ellas.</span>
          </p>
        )}
        {enabled && (data?.mailboxWarning || data?.lastError) && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {data?.mailboxWarning || data?.lastError}
          </p>
        )}
        {data && data.iaDisponible === false && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Sparkles size={13} className="shrink-0 mt-0.5" /> La IA (Gemini) no está configurada en el servidor: los datos se leerán por patrones, con menos precisión. Revisa siempre la fecha antes de aceptar.
          </p>
        )}

        {error && !eligiendoBuzon && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {eligiendoBuzon && data && (
        <ElegirBuzon
          organizacion={data.organizacionNombre || 'esta organización'}
          opciones={data.mailboxOptions || []}
          actual={data.mailboxId || null}
          activando={!data.enabled}
          guardando={saving}
          error={error}
          onCancel={() => { setEligiendoBuzon(false); setError(''); }}
          onConfirm={(m) => void toggle({ type: m.type, id: m.id })}
        />
      )}

      {configOpen && data?.config && (
        <VistasCorreoConfigModal initial={data.config} canManage={canManage} onClose={() => setConfigOpen(false)} onSave={guardarCorreo} />
      )}
    </div>
  );
}

function ElegirBuzon({ organizacion, opciones, actual, activando, guardando, error, onCancel, onConfirm }: {
  organizacion: string; opciones: MailboxOption[]; actual: string | null; activando: boolean; guardando: boolean; error: string;
  onCancel: () => void; onConfirm: (m: MailboxOption) => void;
}) {
  const usables = opciones.filter((o) => !o.warning);
  const [elegido, setElegido] = useState<string | null>(actual || (usables.length === 1 ? usables[0].id : null));
  const sel = opciones.find((o) => o.id === elegido) || null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={onCancel}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-800">¿Qué correo se revisa para buscar vistas?</p>
            <p className="mt-0.5 text-xs text-slate-500">En <b className="text-slate-700">{organizacion}</b>. Solo se leerá este buzón, y solo lo que llegue a partir de ahora.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="space-y-2 px-5 py-4">
          {opciones.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No tienes ningún correo conectado en esta organización.{' '}
              <Link to="/dashboard/correo" className="font-bold underline">Conéctalo en Correo</Link> y vuelve aquí para activarla.
            </div>
          )}
          {opciones.map((o) => {
            const activo = elegido === o.id;
            return (
              <button key={o.id} type="button" disabled={!!o.warning} onClick={() => setElegido(o.id)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${activo ? 'border-red-300 bg-red-50 ring-1 ring-red-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${activo ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 bg-white'}`}>
                  {activo && <Check size={12} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Mail size={14} className="shrink-0 text-slate-400" /><span className="truncate">{o.label}</span></span>
                  {o.id === actual && <span className="mt-0.5 block text-xs text-slate-500">Es el que se revisa ahora.</span>}
                  {o.warning && <span className="mt-1 block text-xs text-amber-700">{o.warning}</span>}
                  {!!o.vigiladoPor?.length && (
                    <span className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>Ya lo revisa {o.vigiladoPor.join(', ')}: cada vista aparecería también allí.</span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" disabled={!sel || !!sel.warning || guardando} onClick={() => sel && onConfirm(sel)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            {guardando && <Loader2 size={14} className="animate-spin" />}
            {activando ? 'Activar con este correo' : 'Usar este correo'}
          </button>
        </div>
      </div>
    </div>
  );
}
