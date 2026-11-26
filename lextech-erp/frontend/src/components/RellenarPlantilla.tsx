import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Sparkles, AlertCircle, Building2, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeJson, resolveUploadUrl, apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';
import { t } from '../lib/i18n';
import { InputSegunFormato, type FormatoVariable } from './FormatoCampo';

// ── Revisar los datos antes de generar un documento (15/10/2026) ─────────────
// Las plantillas del despacho (de MN Program) llevan campos como
// «Contrarios_Nombre». Aquí se ve cada campo con el dato que pondrá Vantia;
// lo que Vantia no sabe (WIZINK_*, cláusulas...) se escribe a mano y queda
// recordado: en el expediente, o para todo el despacho si es del despacho.

interface Campo {
  nombre: string;
  clave: string;
  etiqueta: string;
  grupo: string;
  valor: string;
  origen: 'vantia' | 'guardado' | 'vacio' | 'fijo' | 'desactivada' | 'dato' | 'formula' | 'defecto';
  /** Variables propias de cada expediente: tipo de campo (fecha, opciones…). */
  formato?: FormatoVariable | null;
  conoceVantia: boolean;
  deDespacho: boolean;
  /** El logo: una imagen que sale de Ajustes → Mi Despacho (no se escribe). */
  imagen?: boolean;
  imagenUrl?: string | null;
  /** Por qué no se puede poner: sin_logo | perdido | formato. */
  avisoImagen?: string | null;
  /** Ajuste solo de esta plantilla (null = como en general). */
  enPlantilla?: { estado: EstadoAjuste; valor: string } | null;
}

// "Ajustar esta plantilla" (25/11/2026): lo que se elige vale solo para esta
// plantilla, en todos los expedientes, y manda sobre Ajustes → Variables de documentos.
// 'dato' (con otro dato de Vantia) se elige en Ajustes → Plantillas del despacho → Variables.
type EstadoAjuste = 'on' | 'off' | 'fijo' | 'dato' | 'formula';
const AJUSTES: [EstadoAjuste | 'general', string][] = [
  ['general', 'Como en general'],
  ['off', 'Desactivada en esta plantilla'],
  ['fijo', 'Valor fijo en esta plantilla'],
  ['on', 'Activa en esta plantilla aunque en general no'],
];

const ORIGEN: Record<Campo['origen'], { label: string; cls: string }> = {
  vantia: { label: 'De Vantia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  guardado: { label: 'Guardado', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  vacio: { label: 'Falta', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  // Ajustes → Mi Despacho → Variables de documentos
  fijo: { label: 'Valor fijo', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  desactivada: { label: 'Desactivada', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  dato: { label: 'De Vantia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  formula: { label: 'Fórmula', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  defecto: { label: 'Por defecto', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
}

export default function RellenarPlantilla({ path, nombre, expedienteId, clienteId, onVolver, onGenerado, generar: generarFuera, textoBoton = 'Generar documento' }: {
  path: string;
  nombre: string;
  /** De qué se sacan los datos: un expediente o, desde la ficha del cliente, un cliente. */
  expedienteId?: string;
  clienteId?: string;
  onVolver: () => void;
  onGenerado?: (archivo: File) => Promise<void> | void;
  /** Si se pasa, genera y guarda quien llama (p. ej. los documentos base del expediente). */
  generar?: (valores: Record<string, string>) => Promise<void>;
  textoBoton?: string;
}) {
  const { getToken } = useAuth();
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [convertida, setConvertida] = useState(false);
  const [error, setError] = useState('');
  const [soloFaltan, setSoloFaltan] = useState(false);
  const [dejarMarcados, setDejarMarcados] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [puedeAjustar, setPuedeAjustar] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [guardandoAjuste, setGuardandoAjuste] = useState<string | null>(null);

  const leerCampos = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    const de = expedienteId ? `expedienteId=${encodeURIComponent(expedienteId)}` : `clienteId=${encodeURIComponent(clienteId || '')}`;
    const res = await fetch(`/api/files/templates/campos?path=${encodeURIComponent(path)}&${de}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await safeJson(res);
    if (!res.ok || !d?.success) throw new Error(d?.error || t("No se pudo leer la plantilla."));
    return d.data as { campos: Campo[]; convertida: boolean; canManage?: boolean };
  }, [path, expedienteId, clienteId, getToken]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await leerCampos();
        if (!vivo) return;
        setCampos(d.campos);
        setConvertida(!!d.convertida);
        setPuedeAjustar(!!d.canManage);
        setValores(Object.fromEntries(d.campos.map((c: Campo) => [c.clave, c.valor || ''])));
      } catch (e: any) { if (vivo) setError(e?.message || t("No se pudo leer la plantilla.")); }
    })();
    return () => { vivo = false; };
  }, [leerCampos]);

  /** Guarda el ajuste de una variable solo para esta plantilla y refresca su valor. */
  const ajustar = async (c: Campo, estado: EstadoAjuste | 'general', valor = '') => {
    setGuardandoAjuste(c.clave);
    try {
      const r = await apiFetch('/api/plantillas/variables-plantilla', {
        method: 'PUT', getToken, body: JSON.stringify({ plantilla: path, nombre: c.nombre, estado, valor }),
      });
      if (r?.success === false) throw new Error(r.error);
      const d = await leerCampos();
      const nuevo = d.campos.find((x) => x.clave === c.clave);
      setCampos(d.campos);
      if (nuevo) setValores((p) => ({ ...p, [c.clave]: nuevo.valor || '' }));
    } catch (e: any) { aviso.error(e?.message || t("No se pudo guardar la variable.")); }
    finally { setGuardandoAjuste(null); }
  };

  const rellenos = useMemo(() => (campos || []).filter((c) => (valores[c.clave] || '').trim()).length, [campos, valores]);
  const grupos = useMemo(() => {
    const out: { grupo: string; campos: Campo[] }[] = [];
    for (const c of campos || []) {
      if (soloFaltan && (valores[c.clave] || '').trim()) continue;
      const g = out.find((x) => x.grupo === c.grupo) || (out.push({ grupo: c.grupo, campos: [] }), out[out.length - 1]);
      g.campos.push(c);
    }
    return out;
  }, [campos, soloFaltan, valores]);

  const generar = async () => {
    if (!campos) return;
    setGenerando(true);
    try {
      // Con "dejar marcados", lo vacío no se manda: en el documento queda el
      // «Campo» visible para completarlo en Word.
      const enviar = Object.fromEntries(campos
        .filter((c) => !c.imagen)
        .filter((c) => !dejarMarcados || (valores[c.clave] || '').trim())
        .map((c) => [c.nombre, valores[c.clave] ?? '']));
      if (generarFuera) { await generarFuera(enviar); return; }
      const token = await getToken({ skipCache: true });
      const res = await fetch('/api/files/templates/generar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, expedienteId, clienteId, valores: enviar }),
      });
      if (!res.ok) { const d = await safeJson(res); throw new Error(d?.error || t("No se pudo generar el documento.")); }
      const blob = await res.blob();
      const archivo = new File([blob], nombre.replace(/\.docx?$/i, '') + '.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await onGenerado?.(archivo);
      aviso.ok(t("Documento generado con los datos y adjuntado"));
    } catch (e: any) {
      aviso.error(e?.message || t("No se pudo generar el documento."));
    } finally { setGenerando(false); }
  };

  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-8">
      <AlertCircle size={22} className="text-red-500" />
      <p className="text-sm text-slate-700">{error}</p>
      <button type="button" onClick={onVolver} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{t("Volver")}</button>
    </div>
  );
  if (!campos) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
      <Loader2 size={20} className="animate-spin" />
      <p className="text-sm">{t("Leyendo la plantilla…")}</p>
      <p className="text-xs text-slate-400">{t("Las plantillas .doc antiguas tardan unos segundos la primera vez.")}</p>
    </div>
  );

  const faltan = campos.length - rellenos;
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-start gap-3 pb-3">
        <button type="button" onClick={onVolver} title={t("Volver")} className="mt-0.5 h-8 w-8 shrink-0 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 truncate" title={nombre}><FileText size={14} className="inline -mt-0.5 mr-1 text-slate-400" />{nombre}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {campos.length === 0
              ? t("Esta plantilla no tiene campos para rellenar.")
              : <>{campos.length}{" "}{t("campos ·")}{" "}<span className="text-emerald-700 font-semibold">{rellenos}{" "}{t("rellenos")}</span>{faltan > 0 && <> · <span className="text-amber-700 font-semibold">{faltan}{" "}{t("por completar")}</span></>}</>}
            {convertida && t(" · plantilla .doc: se entregará como .docx")}
          </p>
        </div>
        {puedeAjustar && campos.length > 0 && (
          <button type="button" onClick={() => setAjustando((a) => !a)}
            title={t("Desactivar variables o darles un valor solo en esta plantilla")}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${ajustando ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <SlidersHorizontal size={13} />{ajustando ? t("Listo") : t("Ajustar esta plantilla")}
          </button>
        )}
        {faltan > 0 && !ajustando && (
          <label className="shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={soloFaltan} onChange={(e) => setSoloFaltan(e.target.checked)} className="accent-red-600" />{t("Solo los que faltan")}</label>
        )}
      </div>

      {ajustando && (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {t("Lo que elijas aquí vale solo para esta plantilla, en todos los expedientes. Lo general está en Ajustes → Mi Despacho → Variables de documentos.")}
        </p>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-4 max-h-[52vh]">
        {grupos.map((g) => (
          <section key={g.grupo}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t(g.grupo)}</p>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
              {g.campos.map((c) => {
                const v = valores[c.clave] ?? '';
                const cambiado = v !== (c.valor || '');
                const origen: Campo['origen'] = cambiado ? (v.trim() ? 'guardado' : 'vacio') : (v.trim() || c.origen === 'desactivada' ? c.origen : 'vacio');
                const o = ORIGEN[origen];
                const largo = v.length > 70 || v.includes('\n');
                return (
                  <div key={c.clave} className="grid grid-cols-1 sm:grid-cols-[minmax(0,200px)_1fr] gap-1.5 sm:gap-3 px-3 py-2 items-start">
                    <div className="min-w-0 pt-1.5">
                      <p className="text-xs font-medium text-slate-700 break-words" title={`«${c.nombre}»`}>{c.etiqueta}</p>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold ${o.cls}`}>
                        {origen === 'vantia' || origen === 'dato' || origen === 'formula' ? <Sparkles size={9} /> : origen === 'guardado' ? <CheckCircle2 size={9} /> : null}{t(o.label)}
                      </span>
                      {c.enPlantilla && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-600" title={t("Ajustada solo en esta plantilla")}><SlidersHorizontal size={9} />{" "}{t("esta plantilla")}</span>}
                      {c.deDespacho && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-slate-400" title={t("Lo que escribas aquí se recuerda para todo el despacho")}><Building2 size={9} />{" "}{t("despacho")}</span>}
                    </div>
                    {ajustando && !c.imagen ? (
                      <AjusteCampo c={c} guardando={guardandoAjuste === c.clave} onCambiar={(e, v) => void ajustar(c, e, v)} />
                    ) : c.imagen ? (
                      c.imagenUrl ? (
                        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                          <img src={resolveUploadUrl(c.imagenUrl) || undefined} alt={t("Logo del despacho")} className="h-9 max-w-[140px] object-contain" />
                          <span className="text-xs text-slate-500">{t("Se pondrá el logo de Mi Despacho.")}</span>
                        </div>
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                          {c.avisoImagen === 'formato' ? t("El logo del despacho está en un formato que Word no muestra (usa PNG o JPG): vuelve a subirlo en ")
                            : c.avisoImagen === 'perdido' ? t("No se encuentra el archivo del logo del despacho: vuelve a subirlo en ")
                            : t("El despacho no tiene logo: súbelo en ")}
                          <Link to="/dashboard/config?section=despacho" className="font-semibold underline">{t("Ajustes → Mi Despacho")}</Link>{" "}{t("y saldrá en todos los documentos.")}</p>
                      )
                    ) : c.formato && c.formato.tipo !== 'texto' ? (
                      <InputSegunFormato formato={c.formato} valor={v} onChange={(x) => setValores((p) => ({ ...p, [c.clave]: x }))} />
                    ) : largo ? (
                      <textarea value={v} rows={Math.min(5, Math.max(2, v.split('\n').length))}
                        onChange={(e) => setValores((p) => ({ ...p, [c.clave]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 focus:bg-white focus:border-red-300 outline-none" />
                    ) : (
                      <input value={v} placeholder={c.conoceVantia ? t("Vantia no tiene este dato en el expediente") : t("Escríbelo (se recordará)")}
                        onChange={(e) => setValores((p) => ({ ...p, [c.clave]: e.target.value }))}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-red-300 outline-none" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {soloFaltan && grupos.length === 0 && <p className="py-8 text-center text-sm text-emerald-700">{t("Todos los campos tienen dato. ✓")}</p>}
      </div>

      <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {faltan > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none" title={t("Si no, los campos vacíos desaparecen del documento")}>
            <input type="checkbox" checked={dejarMarcados} onChange={(e) => setDejarMarcados(e.target.checked)} className="accent-red-600" />{t("Dejar marcados los vacíos para completarlos en Word")}</label>
        )}
        <div className="sm:ml-auto flex gap-2">
          <button type="button" onClick={onVolver} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50">{t("Volver")}</button>
          <button type="button" onClick={generar} disabled={generando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl">
            {generando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {textoBoton}
          </button>
        </div>
      </div>
    </div>
  );
}

function AjusteCampo({ c, guardando, onCambiar }: {
  c: Campo; guardando: boolean; onCambiar: (estado: EstadoAjuste | 'general', valor?: string) => void;
}) {
  const actual = c.enPlantilla?.estado || 'general';
  const [estado, setEstado] = useState<EstadoAjuste | 'general'>(actual);
  const [valor, setValor] = useState(c.enPlantilla?.estado === 'fijo' ? (c.enPlantilla.valor || '') : (c.valor || ''));
  useEffect(() => { setEstado(c.enPlantilla?.estado || 'general'); }, [c.enPlantilla?.estado]);
  const pendiente = estado === 'fijo' && (actual !== 'fijo' || valor !== (c.enPlantilla?.valor ?? ''));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select value={estado} disabled={guardando}
          onChange={(e) => { const v = e.target.value as EstadoAjuste | 'general'; setEstado(v); if (v !== 'fijo') onCambiar(v); }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-red-300">
          {actual === 'dato' && <option value="dato" disabled>{t("Con otro dato (se cambia en Ajustes → Plantillas)")}</option>}
          {actual === 'formula' && <option value="formula" disabled>{t("Con una fórmula (se cambia en Ajustes → Plantillas)")}</option>}
          {AJUSTES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
        {guardando && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
      </div>
      {estado === 'fijo' && (
        <div className="flex items-start gap-2">
          <textarea value={valor} rows={Math.min(4, Math.max(1, valor.split('\n').length))} onChange={(e) => setValor(e.target.value)}
            placeholder={t("El texto que saldrá siempre en esta plantilla")}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-red-300" />
          <button type="button" disabled={!pendiente || guardando} onClick={() => onCambiar('fijo', valor)}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40">{t("Guardar")}</button>
        </div>
      )}
    </div>
  );
}
