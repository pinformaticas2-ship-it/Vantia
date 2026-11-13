import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { CheckCircle2, Clock, Copy, History, Loader2, Play, Plus, Sparkles, Trash2, Workflow, X, XCircle } from 'lucide-react';
import { apiFetch, resolveApiUrl } from '../lib/api';
import { aviso, confirmar } from '../lib/avisos';
import { locale, t, tn } from '../lib/i18n';
import Lienzo, { textoPaso } from '../components/automatizaciones/Lienzo';
import { campoCls } from '../components/automatizaciones/campos';
import { META, PLANTILLAS, faltaAlgo, type Catalogo, type FlujoDatos, type Plantilla } from '../components/automatizaciones/tipos';

// «Mis automatizaciones» (12/11/2026): las que crea cada despacho con el
// lienzo, desde cero o desde una plantilla. Backend: /api/automatizaciones/flujos
// y services/motorAutomatizaciones.ts.

interface FilaFlujo {
  id: string; nombre: string; descripcion: string | null; activo: boolean; evento: string; flujo: FlujoDatos; vinculada: string | null;
  proxima_at: string | null; ultima_at: string | null; ejecuciones: number; ultimo_estado: string | null; updated_at: string;
}
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function MisAutomatizaciones({ puedeEditar }: { puedeEditar: boolean }) {
  const { getToken } = useAuth();
  const [lista, setLista] = useState<FilaFlujo[] | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [editando, setEditando] = useState<{ fila: FilaFlujo | null; flujo: FlujoDatos; nombre: string } | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [historial, setHistorial] = useState<FilaFlujo | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [f, c] = await Promise.all([apiFetch('/api/automatizaciones/flujos', { getToken }), apiFetch('/api/automatizaciones/catalogo', { getToken })]);
    if (f?.success) setLista((f.data as FilaFlujo[]).filter((x) => !x.vinculada));
    if (c?.success) setCatalogo(c.data);
  }, [getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  const disparador = (f: FilaFlujo) => catalogo?.disparadores.find((d) => d.clave === f.evento);
  const incompleto = (f: FilaFlujo) => (f.flujo?.nodos || []).some((n) => faltaAlgo(n, false));

  const cambiarActivo = async (f: FilaFlujo) => {
    setCambiando(f.id);
    try {
      const r = await apiFetch(`/api/automatizaciones/flujos/${f.id}`, { method: 'PUT', getToken, body: JSON.stringify({ nombre: f.nombre, descripcion: f.descripcion, flujo: f.flujo, activo: !f.activo }) });
      if (r?.success === false) throw new Error(r.error);
      await cargar();
    } catch (e: any) { aviso.error(e?.message || t('No se pudo cambiar')); } finally { setCambiando(null); }
  };
  const borrar = async (f: FilaFlujo) => {
    if (!(await confirmar({ titulo: t('¿Eliminar «{nombre}»?', { nombre: f.nombre }), mensaje: t('Se borra la automatización y su historial. No se puede deshacer.'), confirmar: t('Eliminar'), peligro: true }))) return;
    const r = await apiFetch(`/api/automatizaciones/flujos/${f.id}`, { method: 'DELETE', getToken });
    if (r?.success === false) aviso.error(r.error); else { aviso.ok(t('Automatización eliminada.')); await cargar(); }
  };
  const duplicar = async (f: FilaFlujo) => {
    const r = await apiFetch(`/api/automatizaciones/flujos/${f.id}/duplicar`, { method: 'POST', getToken });
    if (r?.success === false) aviso.error(r.error); else { aviso.ok(t('Copia creada (desactivada).')); await cargar(); }
  };
  const ejecutar = async (f: FilaFlujo) => {
    const r = await apiFetch(`/api/automatizaciones/flujos/${f.id}/ejecutar`, { method: 'POST', getToken });
    if (r?.success === false) aviso.error(r.error);
    else { const mal = (r.data?.pasos || []).filter((p: any) => !p.ok).length; mal ? aviso.error(t('Ejecutada con {n} paso(s) con error.', { n: mal })) : aviso.ok(t('Ejecutada.')); await cargar(); }
  };
  const desdePlantilla = (pl: Plantilla) => { setEligiendo(false); setEditando({ fila: null, flujo: pl.flujo(), nombre: pl.id === 'blanco' ? '' : t(pl.nombre) }); };
  const desdeIA = (nombre: string, flujo: FlujoDatos) => { setEligiendo(false); setEditando({ fila: null, flujo, nombre }); };

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">{t('Mis automatizaciones')}</h2>
          <p className="text-sm text-slate-500">{t('Las que crea el despacho: elige qué las pone en marcha y qué pasos siguen, en un lienzo libre.')}</p>
        </div>
        {puedeEditar && (
          <button type="button" onClick={() => setEligiendo(true)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
            <Plus size={15} />{t('Crear automatización')}</button>
        )}
      </div>

      {lista === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : lista.length === 0 ? (
        <button type="button" disabled={!puedeEditar} onClick={() => setEligiendo(true)}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-10 text-center hover:border-red-200 hover:bg-red-50/30 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white">
          <Workflow size={28} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">{t('Todavía no hay automatizaciones propias')}</p>
          <p className="max-w-md text-xs text-slate-500">{t('Por ejemplo: «cuando se da de alta un cliente, espera 3 días y crea una tarea para llamarle», o «cada lunes, recuerda los plazos en el chat».')}</p>
        </button>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {lista.map((f) => {
            const d = disparador(f);
            const pasos = (f.flujo?.nodos || []).filter((n) => n.tipo !== 'disparador');
            const falta = incompleto(f);
            const estado = !f.activo ? { txt: falta ? t('Borrador') : t('Desactivada'), cls: 'bg-slate-100 text-slate-500' }
              : f.ultimo_estado === 'error' ? { txt: t('Revisar'), cls: 'bg-amber-50 text-amber-700' } : { txt: t('Activa'), cls: 'bg-emerald-50 text-emerald-700' };
            return (
              <div key={f.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Workflow size={20} /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800" data-sin-traducir>{f.nombre}</p>
                      <p className="truncate text-xs text-slate-400">{d ? t(d.etiqueta) : t('Sin disparador')}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${estado.cls}`}>{estado.txt}</span>
                </div>
                {f.descripcion && <p className="mt-3 text-xs leading-5 text-slate-500" data-sin-traducir>{f.descripcion}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  {pasos.slice(0, 8).map((n) => { const m = META[n.tipo]; const I = m.icono; return (
                    <span key={n.id} title={t(m.etiqueta)} className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${m.color}1a`, color: m.color }}><I size={12} /></span>
                  ); })}
                  {pasos.length > 8 && <span className="text-[11px] text-slate-400">+{pasos.length - 8}</span>}
                  <span className="ml-1 text-[11px] text-slate-400">{tn(pasos.length, '{n} paso', '{n} pasos')}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2"><p className="text-base font-extrabold text-slate-800">{f.ejecuciones}</p><p className="text-[11px] text-slate-500">{t('ejecuciones')}</p></div>
                  <div className="col-span-2 rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-xs font-semibold text-slate-800">{f.evento === 'programado' && f.activo ? fmt(f.proxima_at) : fmt(f.ultima_at)}</p>
                    <p className="text-[11px] text-slate-500">{f.evento === 'programado' && f.activo ? t('próxima ejecución') : t('última ejecución')}</p>
                  </div>
                </div>
                {falta && <p className="mt-3 text-xs text-amber-700">{t('Hay pasos por completar: ábrela para terminarla antes de activarla.')}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  <button type="button" onClick={() => setEditando({ fila: f, flujo: f.flujo, nombre: f.nombre })} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Workflow size={13} />{puedeEditar ? t('Editar flujo') : t('Ver flujo')}</button>
                  <button type="button" onClick={() => setHistorial(f)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><History size={13} />{t('Historial')}</button>
                  {puedeEditar && f.evento === 'manual' && <button type="button" onClick={() => void ejecutar(f)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Play size={13} />{t('Ejecutar ahora')}</button>}
                  {puedeEditar && <button type="button" onClick={() => void duplicar(f)} title={t('Duplicar')} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy size={14} /></button>}
                  {puedeEditar && <button type="button" onClick={() => void borrar(f)} title={t('Eliminar')} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                  <button type="button" role="switch" aria-checked={f.activo} disabled={!puedeEditar || cambiando === f.id || (falta && !f.activo)} onClick={() => void cambiarActivo(f)}
                    title={falta && !f.activo ? t('Completa los pasos antes de activarla') : f.activo ? t('Desactivar') : t('Activar')}
                    className={`relative ml-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${f.activo ? 'bg-red-600' : 'bg-slate-300'}`}>
                    {cambiando === f.id ? <Loader2 size={14} className="mx-auto animate-spin text-white" /> : <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${f.activo ? 'translate-x-5' : 'translate-x-0.5'}`} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {eligiendo && <ElegirPlantilla catalogo={catalogo} onElegir={desdePlantilla} onIA={desdeIA} onCerrar={() => setEligiendo(false)} />}
      {editando && <EditorPropio catalogo={catalogo} fila={editando.fila} flujo={editando.flujo} nombreInicial={editando.nombre} puedeEditar={puedeEditar}
        onCerrar={() => setEditando(null)} onGuardado={async (fila) => { setEditando((e) => (e ? { ...e, fila } : e)); await cargar(); }} />}
      {historial && <Historial fila={historial} onCerrar={() => setHistorial(null)} />}
    </section>
  );
}

function ElegirPlantilla({ catalogo, onElegir, onIA, onCerrar }: { catalogo: Catalogo | null; onElegir: (p: Plantilla) => void; onIA: (nombre: string, f: FlujoDatos) => void; onCerrar: () => void }) {
  const { getToken } = useAuth();
  const [texto, setTexto] = useState('');
  const modelos = catalogo?.modelosIA || [{ id: 'gemini-2.5-flash', etiqueta: 'Gemini 2.5 Flash', disponible: true }];
  const [modelo, setModelo] = useState(modelos.find((m) => m.disponible)?.id || modelos[0].id);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const crearConIA = async () => {
    setCreando(true); setError('');
    try {
      const r = await apiFetch('/api/automatizaciones/generar', { method: 'POST', getToken, body: JSON.stringify({ descripcion: texto, modelo }) });
      if (r?.success === false) throw new Error(r.error);
      onIA(r.data.nombre, r.data.flujo);
    } catch (e: any) { setError(e?.message || t('La IA no ha podido crear el flujo')); } finally { setCreando(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-bold text-slate-800">{t('Crear automatización')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('Empieza desde cero o desde una plantilla; luego la cambias a tu gusto en el lienzo.')}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label={t('Cerrar')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="border-b border-slate-100 bg-gradient-to-br from-violet-50 to-white p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><Sparkles size={15} className="text-violet-600" />{t('Créala con IA: descríbela con tus palabras')}</p>
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
            placeholder={t('Por ejemplo: «Cuando entre un cliente nuevo, espera 2 días, y si tiene correo mándale uno preguntando qué tal; si no, crea una tarea para llamarle»')}
            className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
              {modelos.map((m) => <option key={m.id} value={m.id} disabled={!m.disponible}>{m.etiqueta}{m.disponible ? '' : ` · ${t('Próximamente')}`}</option>)}
            </select>
            <button type="button" onClick={() => void crearConIA()} disabled={creando || texto.trim().length < 8 || catalogo?.iaDisponible === false}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
              {creando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{creando ? t('Creando…') : t('Crear con IA')}</button>
          </div>
          {catalogo?.iaDisponible === false && <p className="mt-2 text-xs text-amber-700">{t('La IA de Vantia no está configurada en el servidor.')}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <p className="mt-2 text-[11px] text-slate-500">{t('Se abre en el lienzo para que la revises antes de guardarla; nada se activa solo.')}</p>
        </div>
        <p className="px-5 pt-4 text-xs font-bold uppercase tracking-wider text-slate-400">{t('O empieza desde una plantilla')}</p>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {PLANTILLAS.map((p) => {
            const f = p.flujo();
            return (
              <button key={p.id} type="button" onClick={() => onElegir(p)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-red-300 hover:bg-red-50/40 ${p.id === 'blanco' ? 'border-dashed border-slate-300' : 'border-slate-200'}`}>
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">{p.id === 'blanco' ? <Plus size={15} className="text-slate-400" /> : <Sparkles size={15} className="text-red-500" />}{t(p.nombre)}</span>
                <span className="text-xs text-slate-500">{t(p.desc)}</span>
                {p.id !== 'blanco' && (
                  <span className="flex items-center gap-1">
                    {f.nodos.map((n) => { const m = META[n.tipo]; const I = m.icono; return <span key={n.id} className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${m.color}1a`, color: m.color }}><I size={12} /></span>; })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EditorPropio({ catalogo, fila, flujo, nombreInicial, puedeEditar, onCerrar, onGuardado }: {
  catalogo: Catalogo | null; fila: FilaFlujo | null; flujo: FlujoDatos; nombreInicial: string; puedeEditar: boolean;
  onCerrar: () => void; onGuardado: (fila: FilaFlujo) => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [nombre, setNombre] = useState(nombreInicial);
  const [descripcion, setDescripcion] = useState(fila?.descripcion || '');
  const [activo, setActivo] = useState(fila?.activo ?? false);
  const [id, setId] = useState(fila?.id || null);
  const tokenDe = (f?: FlujoDatos | null) => (f?.nodos || []).find((n) => n.tipo === 'disparador')?.config?.token as string | undefined;
  const [token, setToken] = useState<string | undefined>(tokenDe(fila?.flujo));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [base, setBase] = useState(JSON.stringify({ nombre: nombreInicial, descripcion: fila?.descripcion || '', activo: fila?.activo ?? false }));
  const metaSucia = JSON.stringify({ nombre, descripcion, activo }) !== base || !id;

  const guardar = async (f: FlujoDatos) => {
    setGuardando(true); setError('');
    try {
      const incompleto = f.nodos.some((n) => faltaAlgo(n, false));
      const quiereActiva = activo && !incompleto;
      const r = await apiFetch(id ? `/api/automatizaciones/flujos/${id}` : '/api/automatizaciones/flujos', {
        method: id ? 'PUT' : 'POST', getToken,
        body: JSON.stringify({ nombre: nombre.trim() || t('Automatización sin nombre'), descripcion, flujo: f, activo: quiereActiva }),
      });
      if (r?.success === false) throw new Error(r.error);
      setId(r.data.id);
      setToken(tokenDe(r.data.flujo));
      if (activo && !quiereActiva) { setActivo(false); aviso.info(t('Guardada como borrador: hay pasos por completar.')); }
      else aviso.ok(quiereActiva ? t('Automatización guardada y activa.') : t('Automatización guardada.'));
      setBase(JSON.stringify({ nombre, descripcion, activo: quiereActiva }));
      await onGuardado(r.data);
    } catch (e: any) { setError(e?.message || t('No se pudo guardar')); throw e; } finally { setGuardando(false); }
  };
  const probar = async (f: FlujoDatos, muestraId?: string | null) => {
    const r = await apiFetch('/api/automatizaciones/probar', { method: 'POST', getToken, body: JSON.stringify({ flujo: f, muestraId }) });
    return r?.success ? r.data : [];
  };
  const muestras = async (evento: string) => {
    const r = await apiFetch(`/api/automatizaciones/muestras?evento=${encodeURIComponent(evento)}`, { getToken });
    return r?.success ? r.data : [];
  };

  return (
    <Lienzo
      titulo={nombre.trim() || t('Nueva automatización')} subtitulo={t('Automatización propia')} icono={Workflow} catalogo={catalogo}
      inicial={flujo} puedeEditar={puedeEditar} sucioExterno={metaSucia} guardando={guardando} error={error}
      onGuardar={guardar} onProbar={probar} onMuestras={muestras} onCerrar={onCerrar}
      urlEntrada={token ? new URL(resolveApiUrl(`/api/automatizaciones/entrada/${token}`), window.location.origin).href : null}
      onGenerar={catalogo?.iaDisponible === false ? undefined : async (descripcion, actual) => {
        const r = await apiFetch('/api/automatizaciones/generar', { method: 'POST', getToken, body: JSON.stringify({ descripcion, flujo: actual }) });
        if (r?.success === false) throw new Error(r.error);
        return r.data;
      }}
      cabecera={puedeEditar ? (
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          {activo ? t('Activa') : t('Desactivada')}
          <button type="button" role="switch" aria-checked={activo} onClick={() => setActivo((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${activo ? 'bg-red-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </label>
      ) : undefined}
      panelGeneral={(
        <fieldset disabled={!puedeEditar} className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{t('Nombre')}</span>
            <input className={campoCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('Por ejemplo: Seguimiento de clientes nuevos')} autoFocus={!fila} /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{t('Descripción (opcional)')}</span>
            <textarea rows={2} className={campoCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
          <p className="text-[11px] text-slate-400">{t('Se guarda con el botón «Guardar». Si le falta algún paso, se guarda como borrador y no se activa.')}</p>
        </fieldset>
      )}
    />
  );
}

function Historial({ fila, onCerrar }: { fila: FilaFlujo; onCerrar: () => void }) {
  const { getToken } = useAuth();
  const [ejec, setEjec] = useState<any[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  useEffect(() => { apiFetch(`/api/automatizaciones/flujos/${fila.id}/ejecuciones`, { getToken }).then((r) => setEjec(r?.data || [])).catch(() => setEjec([])); }, [fila.id, getToken]);
  const chip = (e: string) => ({ ok: ['bg-emerald-50 text-emerald-700', t('Bien')], error: ['bg-red-50 text-red-700', t('Con errores')], esperando: ['bg-violet-50 text-violet-700', t('Esperando')], en_curso: ['bg-slate-100 text-slate-600', t('En curso')] } as Record<string, string[]>)[e] || ['bg-slate-100 text-slate-600', e];
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-bold text-slate-800">{t('Historial')}</p>
            <p className="text-xs text-slate-500" data-sin-traducir>{fila.nombre}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label={t('Cerrar')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-4">
          {ejec === null ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
            : !ejec.length ? <p className="py-8 text-center text-sm text-slate-500">{t('Todavía no se ha ejecutado.')}</p>
            : (
              <ul className="space-y-2">
                {ejec.map((e) => { const [cls, txt] = chip(e.estado); return (
                  <li key={e.id} className="rounded-xl border border-slate-200">
                    <button type="button" onClick={() => setAbierta(abierta === e.id ? null : e.id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                      <Clock size={14} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 text-sm text-slate-700">{fmt(e.created_at)} · <span className="text-slate-500">{e.disparo}</span></span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{txt}</span>
                    </button>
                    {abierta === e.id && (
                      <ul className="space-y-1 border-t border-slate-100 px-3.5 py-2.5">
                        {(e.pasos || []).map((p: any, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                            {p.ok ? <CheckCircle2 size={12} className="mt-px shrink-0 text-emerald-500" /> : <XCircle size={12} className="mt-px shrink-0 text-red-500" />}
                            <span data-sin-traducir>{textoPaso(p)}</span>
                          </li>
                        ))}
                        {!(e.pasos || []).length && <li className="text-xs text-slate-400">{t('Sin pasos ejecutados.')}</li>}
                      </ul>
                    )}
                  </li>
                ); })}
              </ul>
            )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
