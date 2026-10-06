import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  X, Loader2, Plus, ArrowUp, ArrowDown, Trash2, RotateCw, ChevronDown, ChevronRight,
  ChevronLeft, FileText, Combine, AlertTriangle, CheckCircle2,
} from "lucide-react";

// Herramienta PDF de los documentos de un cliente o expediente: fusionar
// varios documentos (PDF, Word, Excel, imágenes) en un único PDF y retoques
// sencillos de páginas (quitar, reordenar, girar), con numeración opcional.
// El resultado se guarda como documento NUEVO en la misma ficha.
// Backend: controllers/pdfToolController.ts.

export interface PdfToolFile { id: string; original_name: string; document_name?: string | null; mimetype: string }

interface Pagina { index: number; rotacion: number; incluida: boolean }
interface Parte {
  key: string;
  file: PdfToolFile;
  estado: "cargando" | "ok" | "error";
  error?: string;
  paginas: Pagina[];
  miniaturas: string[];
  abierta: boolean;
}

const CONVERTIBLE = /\.(pdf|docx?|odt|rtf|txt|xlsx?|ods|csv|pptx?|odp|html?|jpe?g|png)$/i;
export function isPdfToolCompatible(f: { original_name: string; mimetype: string }) {
  return CONVERTIBLE.test(f.original_name || "") || f.mimetype === "application/pdf" || f.mimetype === "image/jpeg" || f.mimetype === "image/png";
}
const nombreDe = (f: PdfToolFile) => f.document_name || f.original_name;

// pdf.js se carga solo al abrir la herramienta (es grande).
let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export default function PdfToolModal({ entityId, files, initialFileIds = [], onClose, onDone }: {
  entityId: string;
  files: PdfToolFile[];
  initialFileIds?: string[];
  onClose: () => void;
  onDone: (nuevo: any) => void;
}) {
  const { getToken } = useAuth();
  const disponibles = useMemo(() => files.filter(isPdfToolCompatible), [files]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [nombre, setNombre] = useState("");
  const [numerarDocumentos, setNumerarDocumentos] = useState(false);
  const [primerNumero, setPrimerNumero] = useState(1);
  const [numerarPaginas, setNumerarPaginas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<any | null>(null);
  const keySeq = useRef(0);

  const updateParte = (key: string, patch: Partial<Parte> | ((p: Parte) => Partial<Parte>)) =>
    setPartes((ps) => ps.map((p) => (p.key === key ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)));

  const cargarParte = useCallback(async (key: string, file: PdfToolFile) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/files/${entityId}/${file.id}/as-pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "No se pudo abrir el documento");
      }
      const data = new Uint8Array(await res.arrayBuffer());
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data }).promise;
      updateParte(key, {
        estado: "ok",
        paginas: Array.from({ length: doc.numPages }, (_, index) => ({ index, rotacion: 0, incluida: true })),
        miniaturas: [],
      });
      // Miniaturas una a una, sin bloquear la ventana.
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 120 / vp0.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        const url = canvas.toDataURL("image/jpeg", 0.7);
        updateParte(key, (p) => { const m = [...p.miniaturas]; m[i - 1] = url; return { miniaturas: m }; });
      }
      doc.destroy?.();
    } catch (e: any) {
      updateParte(key, { estado: "error", error: e?.message || "No se pudo abrir el documento" });
    }
  }, [entityId, getToken]);

  const anadir = useCallback((file: PdfToolFile, abierta = false) => {
    const key = `p${++keySeq.current}`;
    setPartes((ps) => [...ps, { key, file, estado: "cargando", paginas: [], miniaturas: [], abierta }]);
    void cargarParte(key, file);
  }, [cargarParte]);

  // Documentos con los que se abre la herramienta (p.ej. "Editar páginas" de uno).
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    const ini = initialFileIds.map((id) => disponibles.find((f) => f.id === id)).filter(Boolean) as PdfToolFile[];
    ini.forEach((f) => anadir(f, ini.length === 1));
  }, [anadir, disponibles, initialFileIds]);

  const mover = (i: number, d: -1 | 1) => setPartes((ps) => {
    const j = i + d; if (j < 0 || j >= ps.length) return ps;
    const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const moverPagina = (key: string, i: number, d: -1 | 1) => updateParte(key, (p) => {
    const j = i + d; if (j < 0 || j >= p.paginas.length) return {};
    const n = [...p.paginas]; [n[i], n[j]] = [n[j], n[i]]; return { paginas: n };
  });
  const setPagina = (key: string, i: number, patch: Partial<Pagina>) =>
    updateParte(key, (p) => ({ paginas: p.paginas.map((pg, k) => (k === i ? { ...pg, ...patch } : pg)) }));

  const totalPaginas = partes.reduce((n, p) => n + p.paginas.filter((x) => x.incluida).length, 0);
  const cargando = partes.some((p) => p.estado === "cargando");
  const conError = partes.some((p) => p.estado === "error");
  const unSoloDoc = partes.length === 1;

  const crear = async () => {
    setGuardando(true); setError("");
    try {
      const token = await getToken();
      const body = {
        nombre: nombre.trim(),
        partes: partes.map((p) => ({ fileId: p.file.id, paginas: p.paginas.filter((x) => x.incluida).map((x) => ({ index: x.index, rotacion: x.rotacion })) }))
          .filter((p) => p.paginas.length),
        opciones: { numerarDocumentos, primerNumero, numerarPaginas },
      };
      const res = await fetch(`/api/files/${entityId}/pdf-tool`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error || "No se pudo crear el PDF");
      setHecho(j.data);
      onDone(j.data);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear el PDF");
    } finally {
      setGuardando(false);
    }
  };

  const enLista = new Set(partes.map((p) => p.file.id));

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-800"><Combine size={18} className="text-red-600" /> Fusionar y editar PDF</h2>
            <p className="text-xs text-slate-500">Une documentos en un solo PDF, quita, ordena o gira páginas. Se guarda como un documento nuevo; los originales no se tocan.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>

        {hecho ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="text-lg font-bold text-slate-800">PDF creado</p>
            <p className="text-sm text-slate-500"><b>{hecho.original_name}</b> · {hecho.paginas} página{hecho.paginas === 1 ? "" : "s"} · ya está en los documentos.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setHecho(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Crear otro</button>
              <button type="button" onClick={onClose} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Cerrar</button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_1fr]">
            {/* Documentos disponibles */}
            <div className="min-h-0 overflow-y-auto border-slate-200 bg-slate-50 p-4 lg:border-r">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Documentos de la ficha</h3>
              {disponibles.length === 0 && <p className="text-xs text-slate-400">No hay documentos PDF, Word, Excel o imágenes.</p>}
              <ul className="space-y-1">
                {disponibles.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => anadir(f)}
                      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-white">
                      <FileText size={14} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate" title={nombreDe(f)}>{nombreDe(f)}</span>
                      {enLista.has(f.id) && <span className="text-[10px] text-emerald-600">añadido</span>}
                      <Plus size={14} className="shrink-0 text-slate-300 group-hover:text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-slate-400">Los Word, Excel e imágenes se convierten a PDF. Puedes añadir el mismo documento varias veces.</p>
            </div>

            {/* Composición */}
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {partes.length === 0 && (
                  <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-center text-sm text-slate-400">
                    <Combine size={28} className="mb-2" />
                    Elige a la izquierda los documentos a unir, en orden.<br />Con uno solo, puedes quitar, ordenar o girar sus páginas.
                  </div>
                )}
                {partes.map((p, i) => {
                  const incluidas = p.paginas.filter((x) => x.incluida).length;
                  return (
                    <div key={p.key} className="rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-2 px-3 py-2">
                        {numerarDocumentos && <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">Doc. {primerNumero + i}</span>}
                        <button type="button" onClick={() => updateParte(p.key, { abierta: !p.abierta })} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                          {p.abierta ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                          <span className="truncate text-sm font-semibold text-slate-800" title={nombreDe(p.file)}>{nombreDe(p.file)}</span>
                        </button>
                        <span className="shrink-0 text-xs text-slate-500">
                          {p.estado === "cargando" ? <Loader2 size={13} className="animate-spin" />
                            : p.estado === "error" ? <span className="text-red-600">no se puede abrir</span>
                            : `${incluidas} de ${p.paginas.length} pág.`}
                        </span>
                        <button type="button" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14} /></button>
                        <button type="button" title="Bajar" onClick={() => mover(i, 1)} disabled={i === partes.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14} /></button>
                        <button type="button" title="Quitar" onClick={() => setPartes((ps) => ps.filter((x) => x.key !== p.key))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                      {p.estado === "error" && <p className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs text-red-600"><AlertTriangle size={12} /> {p.error}</p>}
                      {p.abierta && p.estado === "ok" && (
                        <div className="border-t border-slate-100 p-3">
                          <p className="mb-2 text-[11px] text-slate-400">Pulsa una página para quitarla o volver a incluirla. Las flechas la mueven; ↻ la gira.</p>
                          <div className="flex flex-wrap gap-3">
                            {p.paginas.map((pg, k) => (
                              <div key={`${pg.index}-${k}`} className="w-[96px]">
                                <button type="button" onClick={() => setPagina(p.key, k, { incluida: !pg.incluida })}
                                  className={`relative flex h-[128px] w-[96px] items-center justify-center overflow-hidden rounded-lg border-2 bg-slate-50 ${pg.incluida ? "border-slate-200 hover:border-red-300" : "border-dashed border-slate-300 opacity-40"}`}
                                  title={pg.incluida ? "Quitar esta página" : "Volver a incluirla"}>
                                  {p.miniaturas[pg.index]
                                    ? <img src={p.miniaturas[pg.index]} alt="" className="max-h-full max-w-full transition-transform" style={{ transform: `rotate(${pg.rotacion}deg)` }} />
                                    : <Loader2 size={14} className="animate-spin text-slate-300" />}
                                  {!pg.incluida && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-red-600">Quitada</span>}
                                </button>
                                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                                  <button type="button" onClick={() => moverPagina(p.key, k, -1)} disabled={k === 0} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={12} /></button>
                                  <span>{pg.index + 1}</span>
                                  <button type="button" title="Girar" onClick={() => setPagina(p.key, k, { rotacion: (pg.rotacion + 90) % 360 })} className="rounded p-0.5 hover:bg-slate-100"><RotateCw size={11} /></button>
                                  <button type="button" onClick={() => moverPagina(p.key, k, 1)} disabled={k === p.paginas.length - 1} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Opciones y crear */}
              <div className="space-y-3 border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={numerarDocumentos} onChange={(e) => setNumerarDocumentos(e.target.checked)} className="h-4 w-4 accent-red-600" />
                    Sellar «DOCUMENTO Nº» en cada documento, desde el
                    <input type="number" min={1} value={primerNumero} disabled={!numerarDocumentos}
                      onChange={(e) => setPrimerNumero(Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-sm disabled:bg-slate-50" />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={numerarPaginas} onChange={(e) => setNumerarPaginas(e.target.checked)} className="h-4 w-4 accent-red-600" />
                    Numerar páginas («Página X de Y»)
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={180}
                    placeholder={unSoloDoc ? `${nombreDe(partes[0].file).replace(/\.[^.]+$/, "")} (editado).pdf` : "Nombre del PDF (opcional)"}
                    className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100" />
                  <span className="text-xs text-slate-500">{totalPaginas} página{totalPaginas === 1 ? "" : "s"}</span>
                  <button type="button" onClick={() => void crear()}
                    disabled={guardando || cargando || conError || totalPaginas === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                    {guardando ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />}
                    {unSoloDoc ? "Guardar PDF editado" : "Crear PDF fusionado"}
                  </button>
                </div>
                {conError && <p className="text-xs text-amber-700">Quita los documentos que no se pueden abrir para continuar.</p>}
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
