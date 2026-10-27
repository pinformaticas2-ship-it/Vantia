import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { AlertCircle, Check, ChevronDown, Copy, Download, ExternalLink, FileArchive, Loader2, RefreshCw, ShieldAlert, Sparkles, X } from "lucide-react";
import { apiFetch } from "../lib/api";

// ── Preparar el expediente para un proyecto de Claude (22/10/2026) ───────────
// Sin API ni conector: Vantia arma un dosier con todo el expediente (y el texto
// de sus documentos) y las instrucciones del proyecto; la persona lo sube a un
// proyecto de claude.ai con la suscripción del despacho. Backend:
// controllers/dosierClaudeController.ts.
//
// 27/10/2026: los escaneados e imágenes van en un .zip junto al dosier (Claude
// los lee directamente), aviso de lo que ha llegado desde la última descarga y
// preguntas de partida para copiar.

interface Dosier {
  archivo: string;
  instrucciones: string;
  documentos: { total: number; conTexto: number; sinTexto: number; originales: number; omitidos: number };
  originales: { nombre: string; bytes: number }[];
  novedades: { desde: string; por: string | null; documentos: number; tareas: number } | null;
  preguntas: { titulo: string; texto: string }[];
}

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
const cuando = (v: string) => new Date(v).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ClaudeExpediente({ expedienteId, referencia }: { expedienteId: string; referencia: string }) {
  const { getToken } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [dosier, setDosier] = useState<Dosier | null>(null);
  const [descargando, setDescargando] = useState<"" | "zip" | "md">("");
  const [descargado, setDescargado] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [verPreguntas, setVerPreguntas] = useState(false);

  const abrir = async () => {
    setAbierto(true); setError(""); setDescargado(false); setCopiado(""); setDosier(null); setCargando(true);
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

  const descargar = async (formato: "zip" | "md") => {
    if (!dosier) return;
    setDescargando(formato); setError("");
    try {
      const token = await getToken();
      const res = await fetch(`/api/expedientes/${expedienteId}/dosier-claude/descargar?formato=${formato}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "No se pudo descargar el dosier.");
      const nombre = decodeURIComponent((res.headers.get("Content-Disposition") || "").match(/filename\*=UTF-8''([^;]+)/)?.[1] || dosier.archivo);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDescargado(true);
    } catch (e: any) {
      setError(e?.message || "No se pudo descargar el dosier.");
    } finally {
      setDescargando("");
    }
  };

  const copiar = async (texto: string, clave: string) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(clave); window.setTimeout(() => setCopiado((c) => (c === clave ? "" : c)), 2500); return true; }
    catch { setError("No se pudo copiar: selecciona el texto y cópialo a mano."); return false; }
  };

  const copiarYAbrir = async () => {
    if (!dosier) return;
    // La pestaña se abre antes del await para que el navegador no la bloquee
    // (sin "noopener" en las opciones: con él window.open devuelve siempre null)
    const w = window.open("https://claude.ai/projects", "_blank");
    if (w) w.opener = null;
    await copiar(dosier.instrucciones, "instrucciones");
    if (!w) setError("El navegador ha bloqueado la pestaña: abre claude.ai/projects a mano.");
  };

  const paso = "flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4";
  const num = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 text-xs font-extrabold text-red-600";
  const boton = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  const botonPri = "inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50";
  const conZip = !!dosier && dosier.originales.length > 0;
  const hayNovedades = !!dosier?.novedades && (dosier.novedades.documentos > 0 || dosier.novedades.tareas > 0);

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
                  {dosier.novedades && (
                    <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${hayNovedades ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600"}`}>
                      {hayNovedades ? <RefreshCw size={15} className="mt-0.5 shrink-0" /> : <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />}
                      <p>
                        Último dosier: {cuando(dosier.novedades.desde)}{dosier.novedades.por ? ` (${dosier.novedades.por})` : ""}.{" "}
                        {hayNovedades
                          ? <>Desde entonces hay <b>{[dosier.novedades.documentos && `${dosier.novedades.documentos} documento${dosier.novedades.documentos === 1 ? "" : "s"}`, dosier.novedades.tareas && `${dosier.novedades.tareas} tarea${dosier.novedades.tareas === 1 ? "" : "s"} o actuaci${dosier.novedades.tareas === 1 ? "ón" : "ones"}`].filter(Boolean).join(" y ")} nuevos</b>: descárgalo otra vez y sustituye el archivo en el proyecto de Claude.</>
                          : "No ha cambiado nada desde entonces: si ya tienes el proyecto en Claude, no hace falta volver a subirlo."}
                      </p>
                    </div>
                  )}

                  <div className={paso}>
                    <span className={num}>1</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">Descarga el dosier</p>
                      <p className="text-xs text-slate-500">
                        Datos, partes, plazos, agenda, actuaciones y notas{dosier.documentos.total > 0 ? `, y el texto de ${dosier.documentos.conTexto} de ${dosier.documentos.total} documentos` : ""}.
                        {conZip && ` Los ${dosier.originales.length} escaneados o imágenes van dentro del .zip tal cual: Claude los lee directamente.`}
                        {dosier.documentos.sinTexto > 0 && ` ${dosier.documentos.sinTexto} no se pueden incluir (salen en la lista del dosier).`}
                        {dosier.documentos.omitidos > 0 && ` Solo van los ${dosier.documentos.total - dosier.documentos.omitidos} más recientes.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => void descargar(conZip ? "zip" : "md")} disabled={!!descargando} className={botonPri}>
                          {descargando ? <Loader2 size={14} className="animate-spin" /> : descargado ? <Check size={14} /> : conZip ? <FileArchive size={14} /> : <Download size={14} />}
                          {descargado ? "Descargado" : conZip ? "Descargar dosier y documentos (.zip)" : `Descargar «${dosier.archivo}»`}
                        </button>
                        {conZip && (
                          <button onClick={() => void descargar("md")} disabled={!!descargando} className={boton}><Download size={14} /> Solo el dosier (.md)</button>
                        )}
                      </div>
                      {conZip && (
                        <details className="text-xs text-slate-500">
                          <summary className="cursor-pointer">Qué va en el .zip</summary>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            <li>{dosier.archivo}</li>
                            {dosier.originales.map((o) => <li key={o.nombre}>{o.nombre} · {mb(o.bytes)}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>

                  <div className={paso}>
                    <span className={num}>2</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">Crea el proyecto en Claude</p>
                      <ol className="list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                        <li>Pulsa el botón: copia las instrucciones y abre Claude.</li>
                        <li>«Nuevo proyecto», llámalo «Expediente {referencia}» y pega las instrucciones en «Instrucciones del proyecto».</li>
                        <li>En «Archivos del proyecto», sube {conZip ? "todos los archivos del .zip (descomprímelo antes)" : "el dosier descargado"}.</li>
                      </ol>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => void copiarYAbrir()} className={botonPri}>
                          {copiado === "instrucciones" ? <Check size={14} /> : <ExternalLink size={14} />} {copiado === "instrucciones" ? "Copiadas · Claude abierto" : "Copiar instrucciones y abrir Claude"}
                        </button>
                        <button onClick={() => void copiar(dosier.instrucciones, "instrucciones")} className={boton}><Copy size={14} /> Solo copiar</button>
                      </div>
                      <details className="text-xs text-slate-500">
                        <summary className="cursor-pointer">Ver las instrucciones</summary>
                        <textarea readOnly value={dosier.instrucciones} rows={7} aria-label="Instrucciones del proyecto"
                          className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-600"
                          onFocus={(e) => e.currentTarget.select()} />
                      </details>
                    </div>
                  </div>

                  <div className={paso}>
                    <span className={num}>3</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <button onClick={() => setVerPreguntas((v) => !v)} className="flex w-full items-center justify-between text-left">
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">Pregunta</span>
                          <span className="block text-xs text-slate-500">Abre un chat dentro del proyecto. Para empezar, copia una de estas:</span>
                        </span>
                        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${verPreguntas ? "rotate-180" : ""}`} />
                      </button>
                      {verPreguntas && (
                        <ul className="space-y-1.5">
                          {dosier.preguntas.map((p) => (
                            <li key={p.titulo} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-700">{p.titulo}</p>
                                <p className="text-xs text-slate-500">{p.texto}</p>
                              </div>
                              <button onClick={() => void copiar(p.texto, p.titulo)} aria-label={`Copiar «${p.titulo}»`} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700">
                                {copiado === p.titulo ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {dosier.documentos.total === 0 && (
                    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" /> Este expediente aún no tiene documentos: Claude solo tendrá los datos, plazos y notas.
                    </p>
                  )}

                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Estás sacando datos de clientes de Vantia. Usa la cuenta de Claude del despacho y comprueba que en
                      Claude → Ajustes → Privacidad está desactivado el uso de tus chats para mejorar Claude.
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
