import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, Check, ChevronDown, Loader2, Sparkles, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { notifyVistasChanged } from '../lib/useVistasStatus';

// Configuración → Automatizaciones. Por ahora un único flujo: vistas
// recibidas por correo (backend: services/vistasAutomation.ts +
// controllers/vistasController.ts). El toggle es por organización: lo activa
// el propietario o un administrador y afecta a todo el despacho.

interface Plantilla { asunto: string; cuerpo: string }
interface VistasConfig {
  mailbox: { type: 'imap' | 'gmail'; id: string } | null;
  responsableUserId: string | null;
  duracionMin: number;
  recordatorioDias: number;
  recordatorioHora: string;
  palabrasClave: string[];
  remitentes: string[];
  guardarAdjuntos: boolean;
  plantillaAceptar: Plantilla;
  plantillaRechazar: Plantilla;
}
interface ConfigResponse {
  enabled: boolean;
  canManage: boolean;
  canSee: boolean;
  config?: VistasConfig;
  mailboxLabel?: string | null;
  mailboxWarning?: string | null;
  mailboxOptions?: { type: 'imap' | 'gmail'; id: string; label: string; warning: string | null }[];
  miembros?: { userId: string; nombre: string; rol: string }[];
  activatedAt?: string | null;
  lastRunAt?: string | null;
  lastError?: string | null;
  iaDisponible?: boolean;
}

const PASOS = [
  'Llega al buzón vigilado un correo de señalamiento de vista',
  'Se leen fecha, hora, juzgado, autos y NIG (también de los PDF adjuntos) y se revisa el hueco en la agenda del abogado',
  'Se avisa al abogado (notificación y campana) para que confirme',
  'Al aceptar o rechazar se responde por correo al remitente',
  'Al aceptar se da de alta el expediente (o se vincula al existente con los mismos autos/NIG)',
  'Se añade la vista a la agenda del abogado',
  'Los adjuntos se guardan en la documentación del expediente',
  'Se programa un recordatorio para preparar la vista',
];

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-500';

function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function AutomatizacionesPanel() {
  const { getToken } = useAuth();
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cfg, setCfg] = useState<VistasConfig | null>(null);
  const [palabras, setPalabras] = useState('');
  const [remitentes, setRemitentes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showAvanzado, setShowAvanzado] = useState(false);

  const apply = (d: ConfigResponse) => {
    setData(d);
    setEnabled(d.enabled);
    if (d.config) {
      setCfg(d.config);
      setPalabras(d.config.palabrasClave.join(', '));
      setRemitentes(d.config.remitentes.join(', '));
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/vistas/config', { getToken });
      if (res?.success === false) throw new Error(res.error);
      apply(res.data);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const save = async (nextEnabled = enabled) => {
    if (!cfg) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await apiFetch('/api/vistas/config', {
        method: 'PUT', getToken,
        body: JSON.stringify({
          enabled: nextEnabled,
          config: {
            ...cfg,
            palabrasClave: palabras.split(',').map((s) => s.trim()).filter(Boolean),
            remitentes: remitentes.split(',').map((s) => s.trim()).filter(Boolean),
          },
        }),
      });
      if (res?.success === false) throw new Error(res.error);
      apply(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notifyVistasChanged();
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar');
      setEnabled(data?.enabled ?? false);
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof VistasConfig>(k: K, v: VistasConfig[K]) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const canManage = Boolean(data?.canManage);
  const selectedMailbox = data?.mailboxOptions?.find((m) => m.id === cfg?.mailbox?.id);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-1">Automatizaciones</h1>
        <p className="text-sm text-slate-500">Flujos que Vantia ejecuta solo para toda la organización.</p>
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
                Detecta los señalamientos que llegan al correo y, tras tu confirmación, responde, crea el expediente, lo agenda, guarda la documentación y te recuerda prepararla.
              </p>
            </div>
          </div>
          {/* Toggle: una única elección para toda la organización */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!canManage || saving || !cfg}
            onClick={() => { const next = !enabled; setEnabled(next); void save(next); }}
            title={canManage ? (enabled ? 'Desactivar' : 'Activar') : 'Solo el propietario o un administrador pueden cambiarlo'}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-red-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
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
            Solo el propietario o un administrador de la organización pueden activar o cambiar esta automatización.
          </p>
        )}

        {data?.enabled && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Vigilando desde: <b className="text-slate-700">{fmt(data.activatedAt)}</b></span>
            <span>Última revisión: <b className="text-slate-700">{fmt(data.lastRunAt)}</b></span>
            {data.canSee && <Link to="/dashboard/vistas" className="font-bold text-red-600 hover:underline">Ver vistas →</Link>}
          </div>
        )}
        {data?.enabled && data.lastError && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {data.lastError}
          </p>
        )}
        {data && data.iaDisponible === false && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Sparkles size={13} className="shrink-0 mt-0.5" /> La IA (Gemini) no está configurada en el servidor: los datos se leerán por patrones, con menos precisión. Revisa siempre la fecha antes de aceptar.
          </p>
        )}

        {cfg && (canManage || data?.canSee) && (
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Buzón que recibe las vistas</span>
                <select
                  disabled={!canManage}
                  value={cfg.mailbox ? `${cfg.mailbox.type}:${cfg.mailbox.id}` : ''}
                  onChange={(e) => {
                    const [type, id] = e.target.value.split(':');
                    set('mailbox', id ? { type: type as 'imap' | 'gmail', id } : null);
                  }}
                  className={inputCls}
                >
                  <option value="">— Elige un buzón —</option>
                  {(data?.mailboxOptions || []).map((m) => <option key={m.id} value={`${m.type}:${m.id}`}>{m.label}</option>)}
                </select>
                <span className="block text-[11px] text-slate-400 mt-1">Solo puedes elegir buzones conectados por ti en Correo.</span>
                {(selectedMailbox?.warning || data?.mailboxWarning) && (
                  <span className="block text-[11px] text-amber-700 mt-1">{selectedMailbox?.warning || data?.mailboxWarning}</span>
                )}
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Abogado responsable</span>
                <select disabled={!canManage} value={cfg.responsableUserId || ''} onChange={(e) => set('responsableUserId', e.target.value || null)} className={inputCls}>
                  <option value="">— Propietario y administradores —</option>
                  {(data?.miembros || []).filter((m) => m.rol !== 'soporte').map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
                </select>
                <span className="block text-[11px] text-slate-400 mt-1">Recibe el aviso y se revisa su agenda. Se puede cambiar en cada vista.</span>
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Duración por defecto (minutos)</span>
                <input type="number" min={15} max={600} step={15} disabled={!canManage} value={cfg.duracionMin} onChange={(e) => set('duracionMin', Number(e.target.value) || 120)} className={inputCls} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Recordatorio (días antes)</span>
                  <input type="number" min={0} max={30} disabled={!canManage} value={cfg.recordatorioDias} onChange={(e) => set('recordatorioDias', Math.max(0, Number(e.target.value) || 0))} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">A las</span>
                  <input type="time" disabled={!canManage} value={cfg.recordatorioHora} onChange={(e) => set('recordatorioHora', e.target.value || '09:00')} className={inputCls} />
                </label>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">
              Si el correo indica una fecha para preparar la vista, el recordatorio se calcula desde esa fecha; si no, desde la propia vista.
            </p>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" disabled={!canManage} checked={cfg.guardarAdjuntos} onChange={(e) => set('guardarAdjuntos', e.target.checked)} className="accent-red-600" />
              Guardar los adjuntos del correo en la documentación del expediente
            </label>

            <button type="button" onClick={() => setShowAvanzado((v) => !v)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800">
              <ChevronDown size={13} className={showAvanzado ? 'rotate-180' : ''} /> Detección y plantillas de respuesta
            </button>

            {showAvanzado && (
              <div className="space-y-4">
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Palabras clave (separadas por comas)</span>
                  <input disabled={!canManage} value={palabras} onChange={(e) => setPalabras(e.target.value)} className={inputCls} />
                  <span className="block text-[11px] text-slate-400 mt-1">Solo se analizan los correos que contienen alguna (en el asunto, el texto o el nombre de un adjunto).</span>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Solo de estos remitentes (opcional)</span>
                  <input disabled={!canManage} value={remitentes} onChange={(e) => setRemitentes(e.target.value)} placeholder="procurador@ejemplo.es, justicia.es" className={inputCls} />
                  <span className="block text-[11px] text-slate-400 mt-1">Direcciones completas o dominios. Vacío = cualquier remitente.</span>
                </label>
                {(['plantillaAceptar', 'plantillaRechazar'] as const).map((k) => (
                  <div key={k} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <p className="text-xs font-bold text-slate-700">{k === 'plantillaAceptar' ? 'Correo al aceptar' : 'Correo al rechazar'}</p>
                    <input disabled={!canManage} value={cfg[k].asunto} onChange={(e) => set(k, { ...cfg[k], asunto: e.target.value })} className={inputCls} />
                    <textarea disabled={!canManage} rows={7} value={cfg[k].cuerpo} onChange={(e) => set(k, { ...cfg[k], cuerpo: e.target.value })} className={inputCls} />
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  Variables: {'{fecha}'} {'{hora}'} {'{juzgado}'} {'{autos}'} {'{juzgado_txt}'} {'{autos_txt}'} {'{abogado}'} {'{despacho}'} {'{asunto_original}'} {'{mensaje}'} (el mensaje adicional que se escriba al decidir).
                </p>
              </div>
            )}

            {canManage && (
              <div className="flex items-center gap-3">
                <button onClick={() => void save()} disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Guardar
                </button>
                {saved && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Guardado</span>}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
