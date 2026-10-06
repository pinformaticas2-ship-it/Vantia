import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, Loader2, Settings2, Sparkles } from 'lucide-react';
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
}

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

  const toggle = async () => {
    if (!data) return;
    const next = !data.enabled;
    setSaving(true); setError('');
    try {
      const res = await apiFetch('/api/vistas/config', { method: 'PUT', getToken, body: JSON.stringify({ enabled: next }) });
      if (res?.success === false) throw new Error(res.error);
      setData(res.data);
      notifyVistasChanged();
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
            {data?.mailboxLabel && <span>Buzón vigilado: <b className="text-slate-700">{data.mailboxLabel}</b></span>}
            <span>Desde: <b className="text-slate-700">{fmt(data?.activatedAt)}</b></span>
            <span>Última revisión: <b className="text-slate-700">{fmt(data?.lastRunAt)}</b></span>
            {data?.canSee && <Link to="/dashboard/vistas" className="font-bold text-red-600 hover:underline">Ver vistas →</Link>}
          </div>
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

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {configOpen && data?.config && (
        <VistasCorreoConfigModal initial={data.config} canManage={canManage} onClose={() => setConfigOpen(false)} onSave={guardarCorreo} />
      )}
    </div>
  );
}
