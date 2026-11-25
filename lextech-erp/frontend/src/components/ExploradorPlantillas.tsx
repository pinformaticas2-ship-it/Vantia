import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ChevronRight, FileText, Folder, FolderPlus, FolderUp, Loader2, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { apiFetch, safeJson } from '../lib/api';
import { aviso } from '../lib/avisos';
import { t } from '../lib/i18n';
import EditorPlantilla from './EditorPlantilla';

// ── Ajustes → Plantillas del despacho → explorador (25/11/2026) ─────────────
// Las carpetas y plantillas de la carpeta de Drive/Dropbox del despacho:
// subir archivos o carpetas enteras (botón o arrastrando), crear carpetas y
// abrir el editor de variables de cada plantilla (EditorPlantilla).

interface Plantilla { ref: string; nombre: string; carpeta: string; ext: string }
interface Archivo { file: File; ruta: string }

const LOTE = 15;
const esWord = (n: string) => /\.docx?$/i.test(n) && !n.startsWith('~$');
const dirDe = (rel: string) => rel.split('/').slice(0, -1).join('/');

/** Archivos de lo que se arrastra (carpetas incluidas, con su ruta). */
async function archivosArrastrados(dt: DataTransfer): Promise<Archivo[]> {
  const entradas = [...dt.items].map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (!entradas.length) return [...dt.files].map((file) => ({ file, ruta: '' }));
  const out: Archivo[] = [];
  const leer = async (e: any, ruta: string): Promise<void> => {
    if (e.isFile) {
      const file: File = await new Promise((ok, ko) => e.file(ok, ko));
      out.push({ file, ruta });
    } else if (e.isDirectory) {
      const lector = e.createReader();
      const sub = ruta ? `${ruta}/${e.name}` : e.name;
      // readEntries devuelve por tandas: hasta que venga vacía.
      for (;;) {
        const tanda: any[] = await new Promise((ok, ko) => lector.readEntries(ok, ko));
        if (!tanda.length) break;
        for (const x of tanda) await leer(x, sub);
      }
    }
  };
  for (const e of entradas) await leer(e, '');
  return out;
}

export default function ExploradorPlantillas({ puedeSubir, onPedirPermiso, onCambio }: {
  puedeSubir: boolean;
  onPedirPermiso?: () => void;
  onCambio?: () => void;
}) {
  const { getToken } = useAuth();
  const [lista, setLista] = useState<Plantilla[] | null>(null);
  const [origen, setOrigen] = useState<string>('');
  const [carpeta, setCarpeta] = useState('');
  const [extra, setExtra] = useState<string[]>([]); // carpetas recién creadas (aún vacías)
  const [q, setQ] = useState('');
  const [subiendo, setSubiendo] = useState<{ hechos: number; total: number } | null>(null);
  const [nuevaCarpeta, setNuevaCarpeta] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const archivosRef = useRef<HTMLInputElement>(null);
  const carpetaRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async (refrescar = false) => {
    try {
      const r = await apiFetch(`/api/plantillas/lista${refrescar ? '?refrescar=1' : ''}`, { getToken });
      if (r?.success === false) throw new Error(r.error);
      // apiFetch convierte los textos vacíos en null: la raíz es carpeta "".
      setLista((r.data.plantillas || []).map((p: any) => ({ ...p, carpeta: p.carpeta || '', nombre: p.nombre || '' })));
      setOrigen(r.data.origen || '');
    } catch (e: any) { aviso.error(e?.message ? t(e.message) : t("No se pudieron leer las plantillas.")); setLista([]); }
  }, [getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  const nube = origen === 'drive' || origen === 'dropbox';
  const escribir = nube && puedeSubir;

  // Subcarpetas directas de la carpeta actual y plantillas de esta carpeta.
  const { subcarpetas, aqui } = useMemo(() => {
    const subs = new Map<string, number>();
    const pre = carpeta ? `${carpeta}/` : '';
    for (const c of [...(lista || []).map((p) => p.carpeta), ...extra]) {
      if (carpeta && c !== carpeta && !c.startsWith(pre)) continue;
      if (!carpeta && !c) continue;
      if (c === carpeta) continue;
      const nombre = c.slice(pre.length).split('/')[0];
      subs.set(nombre, (subs.get(nombre) || 0));
    }
    for (const p of lista || []) {
      if (p.carpeta === carpeta || !(carpeta ? p.carpeta.startsWith(pre) : true) || !p.carpeta) continue;
      const nombre = p.carpeta.slice(pre.length).split('/')[0];
      if (subs.has(nombre)) subs.set(nombre, subs.get(nombre)! + 1);
    }
    return {
      subcarpetas: [...subs].sort((a, b) => a[0].localeCompare(b[0], 'es')),
      aqui: (lista || []).filter((p) => p.carpeta === carpeta).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
  }, [lista, extra, carpeta]);

  const encontradas = useMemo(() => {
    const n = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (!n) return null;
    return (lista || []).filter((p) => `${p.carpeta} ${p.nombre}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(n)).slice(0, 200);
  }, [lista, q]);

  const subir = async (archivos: Archivo[]) => {
    if (!escribir) { onPedirPermiso?.(); return; }
    const validos = archivos.filter((a) => esWord(a.file.name));
    const fuera = archivos.length - validos.length;
    if (!validos.length) { aviso.error(t("Solo se admiten archivos de Word (.doc, .docx).")); return; }
    setSubiendo({ hechos: 0, total: validos.length });
    let hechos = 0;
    try {
      // Por tandas y de una en una (así no se crean carpetas repetidas en Drive).
      for (let i = 0; i < validos.length; i += LOTE) {
        const fd = new FormData();
        fd.append('carpeta', carpeta);
        const tanda = validos.slice(i, i + LOTE);
        for (const a of tanda) fd.append('rutas', a.ruta);
        for (const a of tanda) fd.append('files', a.file, a.file.name);
        const token = await getToken({ skipCache: true });
        const res = await fetch('/api/plantillas/subir', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await safeJson(res);
        if (!res.ok || d?.success === false) {
          if (d?.code === 'SIN_ESCRITURA') onPedirPermiso?.();
          throw new Error(d?.error || t("No se pudo subir."));
        }
        hechos += (d.data?.subidas || []).length;
        setSubiendo({ hechos, total: validos.length });
      }
      aviso.ok(t("{n} plantillas subidas", { n: hechos }) + (fuera ? ` · ${t("{n} archivos que no son Word se han dejado fuera", { n: fuera })}` : ''));
    } catch (e: any) {
      aviso.error((e?.message ? t(e.message) : t("No se pudo subir.")) + (hechos ? ` (${t("{n} subidas", { n: hechos })})` : ''));
    } finally {
      setSubiendo(null);
      await cargar(true);
      onCambio?.();
    }
  };

  const crearCarpeta = async () => {
    const nombre = (nuevaCarpeta || '').trim().replace(/[\\/]/g, ' ');
    if (!nombre) return;
    const ruta = carpeta ? `${carpeta}/${nombre}` : nombre;
    try {
      const r = await apiFetch('/api/plantillas/carpeta', { method: 'POST', getToken, body: JSON.stringify({ ruta }) });
      if (r?.success === false) { if (r.code === 'SIN_ESCRITURA') onPedirPermiso?.(); throw new Error(r.error); }
      setExtra((x) => [...x, ruta]); setNuevaCarpeta(null); setCarpeta(ruta);
    } catch (e: any) { aviso.error(e?.message ? t(e.message) : t("No se pudo crear la carpeta.")); }
  };

  const migas = carpeta ? carpeta.split('/') : [];
  const filaPlantilla = (p: Plantilla, conCarpeta = false) => (
    <li key={p.ref} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
      <FileText size={15} className="shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-800">{p.nombre}</p>
        {conCarpeta && p.carpeta && <p className="truncate text-[11px] text-slate-400">{p.carpeta}</p>}
      </div>
      <button type="button" onClick={() => setEditando(p.ref)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white">
        <SlidersHorizontal size={12} />{" "}{t("Variables")}</button>
    </li>
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-[180px] flex-1 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5">
          <Search size={14} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar plantilla…")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </div>
        {nube && (
          <>
            <input ref={archivosRef} type="file" multiple accept=".doc,.docx" className="hidden"
              onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; void subir(fs.map((file) => ({ file, ruta: '' }))); }} />
            <input ref={carpetaRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; void subir(fs.map((file) => ({ file, ruta: dirDe((file as any).webkitRelativePath || '') }))); }} />
            <button type="button" disabled={!!subiendo} onClick={() => (escribir ? archivosRef.current?.click() : onPedirPermiso?.())}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              <Upload size={14} />{" "}{t("Subir archivos")}</button>
            <button type="button" disabled={!!subiendo} onClick={() => (escribir ? carpetaRef.current?.click() : onPedirPermiso?.())}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <FolderUp size={14} />{" "}{t("Subir carpeta")}</button>
            <button type="button" disabled={!!subiendo} onClick={() => (escribir ? setNuevaCarpeta('') : onPedirPermiso?.())}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <FolderPlus size={14} />{" "}{t("Nueva carpeta")}</button>
          </>
        )}
      </div>

      {subiendo && (
        <div className="mt-2 text-xs text-slate-600">
          <p className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />{" "}{t("Subiendo {hechos} de {total}…", { hechos: subiendo.hechos, total: subiendo.total })}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-red-600 transition-all" style={{ width: `${Math.round(100 * subiendo.hechos / subiendo.total)}%` }} /></div>
        </div>
      )}

      {nuevaCarpeta !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input autoFocus value={nuevaCarpeta} onChange={(e) => setNuevaCarpeta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void crearCarpeta(); if (e.key === 'Escape') setNuevaCarpeta(null); }}
            placeholder={t("Nombre de la carpeta")} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-red-300" />
          <button type="button" onClick={() => void crearCarpeta()} className="h-9 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white">{t("Crear")}</button>
          <button type="button" onClick={() => setNuevaCarpeta(null)} className="h-9 px-2 text-sm text-slate-500">{t("Cancelar")}</button>
        </div>
      )}

      <div
        onDragOver={(e) => { if (!nube) return; e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={async (e) => { if (!nube) return; e.preventDefault(); setEncima(false); void subir(await archivosArrastrados(e.dataTransfer)); }}
        className={`mt-3 overflow-hidden rounded-xl border ${encima ? 'border-red-400 bg-red-50/40' : 'border-slate-200'}`}>
        {!encontradas && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
            <button type="button" onClick={() => setCarpeta('')} className={`rounded px-1.5 py-0.5 ${carpeta ? 'text-slate-500 hover:bg-white' : 'font-semibold text-slate-800'}`}>{t("Plantillas")}</button>
            {migas.map((m, i) => (
              <span key={i} className="inline-flex items-center">
                <ChevronRight size={12} className="text-slate-300" />
                <button type="button" onClick={() => setCarpeta(migas.slice(0, i + 1).join('/'))}
                  className={`rounded px-1.5 py-0.5 ${i === migas.length - 1 ? 'font-semibold text-slate-800' : 'text-slate-500 hover:bg-white'}`}>{m}</button>
              </span>
            ))}
          </div>
        )}
        {!lista ? (
          <p className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />{" "}{t("Leyendo la carpeta…")}</p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {encontradas ? (
              encontradas.length ? encontradas.map((p) => filaPlantilla(p, true)) : <li className="p-4 text-sm text-slate-500">{t("Ninguna plantilla con ese nombre.")}</li>
            ) : (
              <>
                {subcarpetas.map(([nombre, n]) => (
                  <li key={nombre}>
                    <button type="button" onClick={() => setCarpeta(carpeta ? `${carpeta}/${nombre}` : nombre)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                      <Folder size={15} className="shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{nombre}</span>
                      <span className="text-[11px] text-slate-400">{n}</span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </button>
                  </li>
                ))}
                {aqui.map((p) => filaPlantilla(p))}
                {!subcarpetas.length && !aqui.length && (
                  <li className="p-4 text-sm text-slate-500">{nube ? t("Carpeta vacía. Arrastra aquí archivos de Word o carpetas enteras.") : t("No hay plantillas.")}</li>
                )}
              </>
            )}
          </ul>
        )}
      </div>
      {nube && <p className="mt-1.5 text-[11px] text-slate-400">{t("También puedes arrastrar archivos de Word o carpetas enteras encima de la lista: se suben a la carpeta que tengas abierta.")}</p>}

      {editando && (
        <EditorPlantilla refInicial={editando} onCerrar={() => setEditando(null)} onPedirPermiso={onPedirPermiso}
          onCambiada={(ref) => { if (ref !== editando) { setEditando(ref); void cargar(true); } }} />
      )}
    </div>
  );
}
