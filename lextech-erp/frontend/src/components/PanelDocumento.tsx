import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Briefcase, Check, Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { BarraEditor, HojaEditor, contarPalabras } from "./EditorTexto";
import { SIN_TITULO, useDocumento } from "../lib/useDocumento";
import { Spinner } from "./Spinner";

// Editor de Documentos en un panel lateral (Chat IA): el documento que acaba
// de crear la IA se revisa y retoca sin salir de la conversación. Se guarda
// solo, igual que en la página Documentos.

export default function PanelDocumento({ id, onCerrar, movil }: { id: string; onCerrar: () => void; movil: boolean }) {
  const navigate = useNavigate();
  const { doc, cargando, error, titulo, cambiarTitulo, estadoGuardado, editor, guardarYa, descargarWord, exportando } = useDocumento(id);
  const [fallo, setFallo] = useState<string | null>(null);

  const panel = (
    <aside className={`${movil ? "fixed inset-0 z-[120]" : "relative h-full w-1/2 min-w-[420px] max-w-[760px] shrink-0 border-l border-slate-200 shadow-[-8px_0_24px_-12px_rgba(15,23,42,0.15)]"} flex min-h-0 flex-col bg-[#f6f8fc]`}>
      <div className="border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50"><FileText size={15} className="text-[#ab0433]" /></span>
          <div className="min-w-0 flex-1">
            <input
              value={titulo}
              onChange={(e) => cambiarTitulo(e.target.value)}
              placeholder={SIN_TITULO}
              aria-label="Título del documento"
              className="w-full truncate bg-transparent text-sm font-bold text-slate-900 outline-none"
            />
            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
              {doc?.expediente && <span className="inline-flex max-w-[260px] items-center gap-1 truncate text-blue-700"><Briefcase size={10} className="shrink-0" /><span className="truncate">{doc.expediente}</span></span>}
              <span className="inline-flex items-center gap-1">
                {estadoGuardado === "guardando" ? <><Loader2 size={10} className="animate-spin" /> Guardando…</>
                  : estadoGuardado === "pendiente" ? "Cambios sin guardar"
                  : estadoGuardado === "error" ? <span className="text-red-500">No se ha podido guardar</span>
                  : <><Check size={10} className="text-emerald-500" /> Guardado en Documentos</>}
              </span>
              <span>{contarPalabras(editor).toLocaleString("es-ES")} palabras</span>
            </div>
          </div>
          <button type="button" onClick={async () => setFallo(await descargarWord())} disabled={exportando || !doc} title="Descargar en Word (.docx)" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Word
          </button>
          <button type="button" onClick={async () => { await guardarYa(); navigate(`/dashboard/documentos/${id}`); }} title="Abrir en Documentos (con la IA del editor, PDF y guardar en el expediente)" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <ExternalLink size={13} /> <span className="hidden xl:inline">Abrir en Documentos</span>
          </button>
          <button type="button" onClick={async () => { await guardarYa(); onCerrar(); }} title="Cerrar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="border-b border-slate-200 bg-white"><BarraEditor editor={editor} /></div>
      {fallo && <p className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{fallo}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
        {cargando && !doc ? (
          <div className="flex justify-center py-16"><Spinner size="md" muted label="Abriendo documento..." /></div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-slate-500">{error}</p>
        ) : (
          <HojaEditor editor={editor} />
        )}
      </div>
    </aside>
  );
  // En móvil va a pantalla completa por encima de todo (el contenido de la
  // página está en un contexto de apilamiento por debajo de la cabecera).
  return movil ? createPortal(panel, document.body) : panel;
}
