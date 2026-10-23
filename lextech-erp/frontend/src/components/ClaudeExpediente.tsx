import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { Check, Copy, Download, ExternalLink, Loader2, ShieldAlert, Sparkles, X } from "lucide-react";
import { apiFetch } from "../lib/api";

// ── Preparar el expediente para un proyecto de Claude (22/10/2026) ───────────
// Sin API ni conector: Vantia arma un dosier con todo el expediente (y el texto
// de sus documentos) y las instrucciones del proyecto; la persona lo sube a un
// proyecto de claude.ai con la suscripción del despacho. Backend:
// controllers/dosierClaudeController.ts.

interface Dosier {
  archivo: string;
  contenido: string;
  instrucciones: string;
  documentos: { total: number; conTexto: number; sinTexto: number };
}

export default function ClaudeExpediente({ expedienteId, referencia }: { expedienteId: string; referencia: string }) {
  const { getToken } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [dosier, setDosier] = useState<Dosier | null>(null);
  const [descargado, setDescargado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const abrir = async () => {
    setAbierto(true); setError(""); setDescargado(false); setCopiado(false); setDosier(null); setCargando(true);
    try {
      const res = await apiFetch(`/api/expedientes/${expedienteId}/dosier-claude`, { getToken });
      if (res?.success === false || !res?.data) throw new Error(res?.error || "No se pudo preparar el dosier.");
      setDosier(res.data);
    } catch (e: any) {
      setError(e?.message || "No se pudo preparar el dosier.");
    } finally {
      setCargando(false);
    }
  };

  const descargar = () => {
    if (!dosier) return;
    const url = URL.createObjectURL(new Blob([dosier.contenido], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = dosier.archivo; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setDescargado(true);
  };

  const copiar = async () => {
    if (!dosier) return;
    try { await navigator.clipboard.writeText(dosier.instrucciones); setCopiado(true); }
    catch { setError("No se pudo copiar: selecciona el texto de las instrucciones y cópialo a mano."); }
  };

  const paso = "flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4";
  const num = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 text-xs font-extrabold text-red-600";
  const boton = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <>
      <button
        onClick={() => void abrir()}
        title="Prepara este expediente para preguntarle a Claude"
        className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm active:scale-95 transition-all"
      >
        <Sparkles size={14} className="text-slate-400" /> Claude
      </button>

      {abierto && createPortal(
        // Fuera de la ficha (tiene animación de entrada, y con ella "fixed" se
        // medía respecto a la ficha: la ventana quedaba bajo la cabecera).
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="claude-exp-titulo" onClick={(e) => e.stopPropagation()}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="claude-exp-titulo" className="text-base font-extrabold text-slate-900">Preguntar a Claude sobre el expediente {referencia}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Crea un proyecto en Claude con todo el expediente. Tres pasos, menos de un minuto.</p>
              </div>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
              {cargando && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  <Loader2 size={16} className="animate-spin" /> Preparando el dosier y leyendo los documentos…
                </div>
              )}
              {error && <p className="peligro rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

              {dosier && (
                <>
                  <div className={paso}>
                    <span className={num}>1</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">Descarga el dosier</p>
                      <p className="text-xs text-slate-500">
                        Datos, partes, plazos, agenda, actuaciones, notas y el texto de {dosier.documentos.conTexto} de {dosier.documentos.total} documentos.
                        {dosier.documentos.sinTexto > 0 && ` ${dosier.documentos.sinTexto} no tienen texto (escaneados o imágenes): salen en la lista, pero Claude no podrá leerlos.`}
                      </p>
                      <button onClick={descargar} className={boton}>
                        {descargado ? <Check size={14} className="text-emerald-600" /> : <Download size={14} />} {descargado ? "Descargado" : `Descargar «${dosier.archivo}»`}
                      </button>
                    </div>
                  </div>

                  <div className={paso}>
                    <span className={num}>2</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">Copia las instrucciones del proyecto</p>
                      <textarea readOnly value={dosier.instrucciones} rows={6} aria-label="Instrucciones del proyecto"
                        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-600"
                        onFocus={(e) => e.currentTarget.select()} />
                      <button onClick={() => void copiar()} className={boton}>
                        {copiado ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copiado ? "Copiadas" : "Copiar instrucciones"}
                      </button>
                    </div>
                  </div>

                  <div className={paso}>
                    <span className={num}>3</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">Crea el proyecto en Claude</p>
                      <ol className="list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                        <li>Pulsa «Nuevo proyecto» y llámalo «Expediente {referencia}».</li>
                        <li>En «Instrucciones del proyecto», pega lo que has copiado.</li>
                        <li>En «Archivos del proyecto», sube el dosier descargado.</li>
                        <li>Abre un chat dentro del proyecto y pregunta lo que necesites.</li>
                      </ol>
                      <a href="https://claude.ai/projects" target="_blank" rel="noopener noreferrer" className={boton}>
                        <ExternalLink size={14} /> Abrir Claude
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Estás sacando datos de clientes de Vantia. Usa la cuenta de Claude del despacho y comprueba que en
                      Claude → Ajustes → Privacidad está desactivado el uso de tus chats para mejorar Claude.
                      El dosier es una foto de hoy: si llegan documentos nuevos, vuelve a descargarlo y sustitúyelo en el proyecto.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
