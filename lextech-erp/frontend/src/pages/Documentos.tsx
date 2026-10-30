import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Briefcase, Check, CheckCircle2, Download, FileText, FolderInput, Loader2, Plus, Printer,
  Search, Sparkles, Trash2, Wand2, X,
} from "lucide-react";
import { apiFetch, safeJson } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { Spinner } from "../components/Spinner";
import { BarraEditor, HojaEditor, contarPalabras, useEditorTexto } from "../components/EditorTexto";

// Documentos (30/10/2026): editor de texto del despacho con IA. A la
// izquierda los documentos (como una bandeja); en el centro la hoja; a la
// derecha, si se abre, el panel "Redactar con IA", que usa las skills de
// Ajustes → Skills y los datos del expediente vinculado.
// Backend: controllers/documentosController.ts.

interface DocResumen {
  id: string;
  titulo: string;
  expedienteId: string | null;
  expediente: string | null;
  actualizado: string;
  actualizadoPor: string | null;
  extracto: string;
}
interface Doc extends Omit<DocResumen, "extracto"> {
  contenido: string;
}
interface Skill {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: "documento" | "estilo" | "tarea";
  activa: boolean;
}
interface ExpedienteOption {
  id: string;
  anio: number;
  num_exp: number;
  descripcion: string | null;
  cliente_nombre: string | null;
}

const SIN_TITULO = "Documento sin título";
const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  return d.toDateString() === hoy.toDateString()
    ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};
const etiquetaExp = (e: ExpedienteOption) => `${e.anio}/${e.num_exp}${e.descripcion ? ` — ${e.descripcion}` : ""}`;

export default function Documentos() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // El layout vuelve a montar la página al cambiar de URL (PantallaSegura con
  // key = ruta), así que "abrir la IA con esta skill" viaja en el estado de la navegación.
  const estadoNav = (useLocation().state || {}) as { abrirIa?: boolean; skillId?: string };

  const [lista, setLista] = useState<DocResumen[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [cargandoDoc, setCargandoDoc] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [estadoGuardado, setEstadoGuardado] = useState<"guardado" | "pendiente" | "guardando" | "error">("guardado");
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [iaAbierta, setIaAbierta] = useState(Boolean(estadoNav.abrirIa));
  const skillInicial = estadoNav.skillId || "";
  const [selectorExp, setSelectorExp] = useState<null | "vincular" | "guardar">(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [exportando, setExportando] = useState(false);

  const pendiente = useRef<{ titulo?: string; contenido?: string }>({});
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docIdRef = useRef<string | null>(null);
  // Id del documento cuyo texto ya está en el editor. Hasta entonces se
  // ignoran los cambios: al abrir, el editor emite un cambio "vacío" propio
  // que, si se guardaba, machacaba el documento con <p></p>.
  const cargadoPara = useRef<string | null>(null);

  // ── Guardado automático ───────────────────────────────────────────────
  const guardarYa = useCallback(async () => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
    const docId = docIdRef.current;
    const cambios = pendiente.current;
    if (!docId || !Object.keys(cambios).length) return;
    pendiente.current = {};
    setEstadoGuardado("guardando");
    try {
      const r = await apiFetch(`/api/documentos/${docId}`, { getToken, method: "PUT", body: JSON.stringify(cambios) });
      if (r?.success === false) throw new Error(r.error);
      setEstadoGuardado(Object.keys(pendiente.current).length ? "pendiente" : "guardado");
      const d: Doc = r.data;
      setLista((prev) => {
        const resto = prev.filter((x) => x.id !== d.id);
        const extracto = (cambios.contenido ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        const anterior = prev.find((x) => x.id === d.id);
        return [{ ...d, extracto: cambios.contenido !== undefined ? extracto : anterior?.extracto || "" }, ...resto];
      });
    } catch {
      pendiente.current = { ...cambios, ...pendiente.current };
      setEstadoGuardado("error");
    }
  }, [getToken]);

  const programarGuardado = useCallback((cambios: { titulo?: string; contenido?: string }) => {
    pendiente.current = { ...pendiente.current, ...cambios };
    setEstadoGuardado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => { void guardarYa(); }, 900);
  }, [guardarYa]);

  const editor = useEditorTexto({
    contenido: "",
    onChange: (html) => {
      if (!docIdRef.current || cargadoPara.current !== docIdRef.current) return;
      programarGuardado({ contenido: html });
    },
  });

  // Al salir de la página o cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendiente.current).length) { void guardarYa(); e.preventDefault(); }
    };
    window.addEventListener("beforeunload", antesDeSalir);
    return () => { window.removeEventListener("beforeunload", antesDeSalir); void guardarYa(); };
  }, [guardarYa]);

  // ── Carga ─────────────────────────────────────────────────────────────
  const cargarLista = useCallback(async (q = "") => {
    setCargandoLista(true);
    try {
      const r = await apiFetch(`/api/documentos${q ? `?q=${encodeURIComponent(q)}` : ""}`, { getToken });
      setLista(r?.data || []);
    } catch { /* la lista vacía ya lo dice */ } finally {
      setCargandoLista(false);
    }
  }, [getToken]);

  useEffect(() => {
    const t = setTimeout(() => { void cargarLista(busqueda.trim()); }, busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [busqueda, cargarLista]);

  useEffect(() => {
    apiFetch("/api/skills", { getToken }).then((r) => setSkills((r?.data?.skills || []).filter((s: Skill) => s.activa))).catch(() => {});
  }, [getToken]);

  useEffect(() => {
    if (!id) { docIdRef.current = null; setDoc(null); return; }
    let vivo = true;
    void guardarYa();
    cargadoPara.current = null;
    docIdRef.current = id;
    setCargandoDoc(true);
    setConfirmarBorrar(false);
    apiFetch(`/api/documentos/${id}`, { getToken })
      .then((r) => {
        if (!vivo) return;
        if (r?.success === false) throw new Error(r.error);
        setDoc(r.data);
        setTitulo(r.data.titulo);
        setEstadoGuardado("guardado");
      })
      .catch((e) => { if (vivo) { setDoc(null); setAviso({ tono: "error", texto: e.message || "No se pudo abrir el documento." }); } })
      .finally(() => { if (vivo) setCargandoDoc(false); });
    return () => { vivo = false; };
  }, [id, getToken, guardarYa]);

  // Pasa el contenido al editor sin disparar el guardado.
  useEffect(() => {
    if (!editor || !doc) return;
    editor.commands.setContent(doc.contenido || "", { emitUpdate: false });
    cargadoPara.current = doc.id;
  }, [editor, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Acciones ──────────────────────────────────────────────────────────
  const crear = useCallback(async (opciones: { skillId?: string; expedienteId?: string | null } = {}) => {
    await guardarYa();
    try {
      const r = await apiFetch("/api/documentos", {
        getToken, method: "POST",
        body: JSON.stringify({ titulo: SIN_TITULO, expedienteId: opciones.expedienteId || undefined }),
      });
      if (r?.success === false) throw new Error(r.error);
      navigate(`/dashboard/documentos/${r.data.id}`, opciones.skillId !== undefined ? { state: { abrirIa: true, skillId: opciones.skillId } } : undefined);
    } catch (e: any) {
      setAviso({ tono: "error", texto: e.message || "No se pudo crear el documento." });
    }
  }, [getToken, guardarYa, navigate]);

  // ?nuevo=1&expediente=<id>&skill=<id>: crear desde otra pantalla (p. ej. un expediente).
  useEffect(() => {
    if (searchParams.get("nuevo") !== "1") return;
    const expedienteId = searchParams.get("expediente");
    const skillId = searchParams.get("skill");
    setSearchParams({}, { replace: true });
    void crear({ expedienteId, skillId: skillId ?? "" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarTitulo = (t: string) => {
    setTitulo(t);
    programarGuardado({ titulo: t.trim() || SIN_TITULO });
  };

  const vincularExpediente = async (exp: ExpedienteOption | null) => {
    if (!doc) return;
    setSelectorExp(null);
    const r = await apiFetch(`/api/documentos/${doc.id}`, { getToken, method: "PUT", body: JSON.stringify({ expedienteId: exp?.id || null }) }).catch(() => null);
    if (!r?.success) { setAviso({ tono: "error", texto: r?.error || "No se pudo vincular el expediente." }); return; }
    setDoc((d) => d ? { ...d, expedienteId: r.data.expedienteId, expediente: r.data.expediente } : d);
    setLista((prev) => prev.map((x) => x.id === doc.id ? { ...x, expedienteId: r.data.expedienteId, expediente: r.data.expediente } : x));
  };

  const descargarWord = async () => {
    if (!doc) return;
    setExportando(true);
    try {
      await guardarYa();
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/documentos/${doc.id}/docx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await safeJson(res))?.error || "No se pudo exportar a Word.");
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const nombre = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disp)?.[1] || "documento.docx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      setAviso({ tono: "error", texto: e.message });
    } finally {
      setExportando(false);
    }
  };

  const imprimir = () => {
    if (!editor || !doc) return;
    const w = window.open("", "_blank");
    if (!w) { setAviso({ tono: "error", texto: "El navegador ha bloqueado la ventana de impresión." }); return; }
    w.opener = null;
    const t = (titulo || SIN_TITULO).replace(/</g, "&lt;");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${t}</title><style>
      @page { size: A4; margin: 2.5cm; }
      body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; color: #000; }
      h1 { font-size: 16pt; } h2 { font-size: 14pt; } h3 { font-size: 12pt; text-transform: uppercase; }
      table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #555; padding: 4px 6px; vertical-align: top; }
      th { background: #eee; } blockquote { border-left: 3px solid #999; padding-left: 10px; font-style: italic; }
      mark { background: #ff0; } p { margin: 0 0 8pt; }
    </style></head><body>${editor.getHTML()}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const guardarEnExpediente = async (exp?: ExpedienteOption) => {
    if (!doc) return;
    setSelectorExp(null);
    await guardarYa();
    const expedienteId = exp?.id || doc.expedienteId;
    if (!expedienteId) { setSelectorExp("guardar"); return; }
    setAviso(null);
    const r = await apiFetch(`/api/documentos/${doc.id}/guardar-en-expediente`, { getToken, method: "POST", body: JSON.stringify({ expedienteId }) }).catch((e) => ({ success: false, error: e.message }));
    if (!r?.success) { setAviso({ tono: "error", texto: r?.error || "No se pudo guardar en el expediente." }); return; }
    setAviso({ tono: "ok", texto: "Guardado como Word en los archivos del expediente." });
    if (!doc.expedienteId) {
      const d = await apiFetch(`/api/documentos/${doc.id}`, { getToken }).catch(() => null);
      if (d?.success) setDoc((x) => x ? { ...x, expedienteId: d.data.expedienteId, expediente: d.data.expediente } : x);
    }
  };

  const borrar = async () => {
    if (!doc) return;
    pendiente.current = {};
    const r = await apiFetch(`/api/documentos/${doc.id}`, { getToken, method: "DELETE" }).catch(() => null);
    if (!r?.success) { setAviso({ tono: "error", texto: r?.error || "No se pudo borrar." }); return; }
    setLista((prev) => prev.filter((x) => x.id !== doc.id));
    setConfirmarBorrar(false);
    navigate("/dashboard/documentos");
  };

  const skillsDocumento = useMemo(() => skills.filter((s) => s.categoria === "documento"), [skills]);
  const palabras = contarPalabras(editor);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      {/* ── Lista ─────────────────────────────────────────────────────── */}
      {/* Con el panel de IA abierto, la lista se oculta salvo en pantallas muy anchas: la hoja necesita el sitio. */}
      <aside className={`${isMobile && id ? "hidden" : "flex w-full"} ${iaAbierta && id ? "md:hidden 2xl:flex" : "md:flex"} md:w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white`}>
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Editor del despacho</p>
              <h1 className="mt-1 text-base font-bold text-slate-900">Documentos</h1>
            </div>
            <button type="button" onClick={() => crear()} className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-[#ab0433] px-3.5 text-xs font-semibold text-white transition hover:bg-[#92042c]">
              <Plus size={14} /> Nuevo
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={15} className="text-slate-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en los documentos..." className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {cargandoLista && !lista.length ? (
            <div className="flex justify-center py-10"><Spinner size="sm" muted /></div>
          ) : !lista.length ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><FileText size={22} className="text-slate-300" /></div>
              <p className="text-sm font-semibold text-slate-600">{busqueda ? "Sin resultados" : "Aún no hay documentos"}</p>
              <p className="max-w-[220px] text-xs text-slate-400">{busqueda ? "Ningún documento contiene ese texto." : "Crea uno en blanco o pide a la IA que lo redacte."}</p>
            </div>
          ) : lista.map((d) => {
            const sel = d.id === id;
            return (
              <button key={d.id} type="button" onClick={() => navigate(`/dashboard/documentos/${d.id}`)}
                className={`relative flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left transition-colors ${sel ? "bg-red-50/60" : "bg-white hover:bg-slate-50"}`}>
                {sel && <span className="absolute bottom-0 left-0 top-0 w-1 bg-red-500" />}
                <div className="flex items-start justify-between gap-2">
                  <p className={`line-clamp-2 text-sm leading-5 ${sel ? "font-bold text-red-700" : "font-semibold text-slate-800"}`}>{d.titulo}</p>
                  <span className={`shrink-0 text-[11px] ${sel ? "text-red-500" : "text-slate-400"}`}>{fechaCorta(d.actualizado)}</span>
                </div>
                {d.expediente && (
                  <span className="inline-flex max-w-full items-center gap-1 self-start truncate rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                    <Briefcase size={10} className="shrink-0" /> <span className="truncate">{d.expediente}</span>
                  </span>
                )}
                {d.extracto && <p className="line-clamp-2 text-xs leading-5 text-slate-500">{d.extracto}</p>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Documento ─────────────────────────────────────────────────── */}
      <section className={`${isMobile && !id ? "hidden" : "flex"} min-w-0 flex-1 flex-col bg-[#f6f8fc] md:flex`}>
        {!id ? (
          <Bienvenida skills={skillsDocumento} onNuevo={() => crear()} onSkill={(s) => crear({ skillId: s })} />
        ) : cargandoDoc && !doc ? (
          <div className="flex flex-1 items-center justify-center"><Spinner size="md" muted label="Abriendo documento..." /></div>
        ) : !doc ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500">{aviso?.texto || "Documento no encontrado."}</div>
        ) : (
          <>
            <div className="border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                {isMobile && (
                  <button type="button" onClick={() => navigate("/dashboard/documentos")} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500" title="Volver a la lista">
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <input
                    value={titulo}
                    onChange={(e) => cambiarTitulo(e.target.value)}
                    onFocus={(e) => { if (e.target.value === SIN_TITULO) e.target.select(); }}
                    className="w-full truncate bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-300"
                    placeholder={SIN_TITULO}
                    aria-label="Título del documento"
                  />
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <button type="button" onClick={() => setSelectorExp("vincular")} className={`inline-flex max-w-[320px] items-center gap-1 truncate rounded-md px-1.5 py-0.5 font-semibold ${doc.expediente ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "text-slate-500 hover:bg-slate-100"}`}>
                      <Briefcase size={11} className="shrink-0" /> <span className="truncate">{doc.expediente || "Vincular a un expediente"}</span>
                    </button>
                    <span className="inline-flex items-center gap-1">
                      {estadoGuardado === "guardando" ? <><Loader2 size={11} className="animate-spin" /> Guardando…</>
                        : estadoGuardado === "pendiente" ? "Cambios sin guardar"
                        : estadoGuardado === "error" ? <span className="text-red-500">No se ha podido guardar. Reintentando al seguir escribiendo.</span>
                        : <><Check size={11} className="text-emerald-500" /> Guardado</>}
                    </span>
                    <span>{palabras.toLocaleString("es-ES")} palabras</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => setIaAbierta((v) => !v)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${iaAbierta ? "bg-[#ab0433] text-white" : "border border-[#ab0433]/30 bg-red-50 text-[#ab0433] hover:bg-red-100"}`}>
                    <Sparkles size={14} /> Redactar con IA
                  </button>
                  <button type="button" onClick={descargarWord} disabled={exportando} title="Descargar en Word (.docx)" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Word
                  </button>
                  <button type="button" onClick={imprimir} title="Imprimir o guardar como PDF" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Printer size={14} /> PDF
                  </button>
                  <button type="button" onClick={() => guardarEnExpediente()} title="Guardar como Word en los archivos del expediente" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <FolderInput size={14} /> <span className="hidden lg:inline">Guardar en expediente</span><span className="lg:hidden">Expediente</span>
                  </button>
                  {confirmarBorrar ? (
                    <span className="inline-flex items-center gap-1">
                      <button type="button" onClick={borrar} className="h-9 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700">Sí, borrar</button>
                      <button type="button" onClick={() => setConfirmarBorrar(false)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">No</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmarBorrar(true)} title="Borrar el documento" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="border-b border-slate-200 bg-white"><BarraEditor editor={editor} /></div>
            {aviso && (
              <div className={`mx-4 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm sm:mx-6 ${aviso.tono === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {aviso.tono === "ok" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <X size={15} className="mt-0.5 shrink-0" />}
                <span className="flex-1">{aviso.texto}</span>
                <button type="button" onClick={() => setAviso(null)} className="text-xs font-semibold opacity-60 hover:opacity-100">Cerrar</button>
              </div>
            )}
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-y-auto px-3 py-6 sm:px-8 sm:py-10" onClick={(e) => { if (e.target === e.currentTarget) editor?.commands.focus("end"); }}>
                <HojaEditor editor={editor} />
              </div>
              {iaAbierta && editor && (
                <PanelIa
                  key={doc.id}
                  skills={skills}
                  skillInicial={skillInicial}
                  expediente={doc.expediente}
                  onVincular={() => setSelectorExp("vincular")}
                  onCerrar={() => setIaAbierta(false)}
                  getToken={getToken}
                  editor={editor}
                  expedienteId={doc.expedienteId}
                  onTitulo={(t) => { if (!titulo.trim() || titulo === SIN_TITULO) cambiarTitulo(t); }}
                  movil={isMobile}
                />
              )}
            </div>
          </>
        )}
      </section>

      {selectorExp && (
        <SelectorExpediente
          titulo={selectorExp === "guardar" ? "¿En qué expediente lo guardo?" : "Vincular a un expediente"}
          getToken={getToken}
          onElegir={(e) => (selectorExp === "guardar" ? guardarEnExpediente(e) : vincularExpediente(e))}
          onQuitar={selectorExp === "vincular" && doc?.expedienteId ? () => vincularExpediente(null) : undefined}
          onCerrar={() => setSelectorExp(null)}
        />
      )}
    </div>
  );
}

function Bienvenida({ skills, onNuevo, onSkill }: { skills: Skill[]; onNuevo: () => void; onSkill: (id: string) => void }) {
  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50"><FileText size={24} className="text-[#ab0433]" /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Escribe o deja que la IA lo redacte</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Los documentos se guardan solos. Vincúlalos a un expediente para que la IA use sus datos reales, y descárgalos en Word o PDF.
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onNuevo} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Plus size={16} className="text-slate-600" /></span>
            <span>
              <span className="block text-sm font-bold text-slate-800">Documento en blanco</span>
              <span className="block text-xs text-slate-500">Empieza a escribir desde cero.</span>
            </span>
          </button>
          {skills.map((s) => (
            <button key={s.id} type="button" onClick={() => onSkill(s.id)} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#ab0433]/40 hover:shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50"><Sparkles size={15} className="text-[#ab0433]" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">{s.nombre}</span>
                {s.descripcion && <span className="line-clamp-2 block text-xs text-slate-500">{s.descripcion}</span>}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">Las plantillas con IA salen de Ajustes → Skills, donde podéis crear las vuestras.</p>
      </div>
    </div>
  );
}

type Modo = "nuevo" | "reescribir" | "continuar";

function PanelIa({ skills, skillInicial, expediente, expedienteId, onVincular, onCerrar, getToken, editor, onTitulo, movil }: {
  skills: Skill[];
  skillInicial: string;
  expediente: string | null;
  expedienteId: string | null;
  onVincular: () => void;
  onCerrar: () => void;
  getToken: (o?: { skipCache?: boolean }) => Promise<string | null>;
  editor: NonNullable<ReturnType<typeof useEditorTexto>>;
  onTitulo: (t: string) => void;
  movil: boolean;
}) {
  const vacio = editor.isEmpty;
  const [modo, setModo] = useState<Modo>(vacio ? "nuevo" : "reescribir");
  const [skillId, setSkillId] = useState(skillInicial);
  const [instrucciones, setInstrucciones] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const { from, to } = editor.state.selection;
  const haySeleccion = to > from;
  const usables = skills.filter((s) => s.categoria !== "estilo");
  const skill = usables.find((s) => s.id === skillId);

  const generar = async () => {
    setError(null); setHecho(null);
    const seleccion = haySeleccion ? editor.state.doc.textBetween(from, to, "\n") : "";
    if (modo === "reescribir" && !seleccion.trim()) { setError("Selecciona en el documento el texto que quieres cambiar."); return; }
    setGenerando(true);
    try {
      const r = await apiFetch("/api/documentos/generar", {
        getToken, method: "POST",
        body: JSON.stringify({ modo, instrucciones, skillId: skillId || undefined, expedienteId: expedienteId || undefined, documentoHtml: editor.getHTML(), seleccion }),
      });
      if (r?.success === false) throw new Error(r.error);
      const html: string = r.data.html;
      if (modo === "reescribir") {
        editor.chain().focus().insertContentAt({ from, to }, html).run();
        setHecho("Texto sustituido. Si no te convence, deshazlo con Ctrl+Z.");
      } else if (modo === "nuevo" && editor.isEmpty) {
        editor.chain().focus().setContent(html).run();
        if (r.data.tituloSugerido) onTitulo(r.data.tituloSugerido);
        setHecho("Documento redactado. Revísalo antes de usarlo: los datos que faltan aparecen como [●].");
      } else {
        editor.chain().focus("end").insertContent(html).run();
        setHecho(modo === "continuar" ? "Añadido al final del documento." : "Añadido al final. Si no lo quieres, deshazlo con Ctrl+Z.");
      }
      if (modo !== "reescribir") setInstrucciones("");
    } catch (e: any) {
      setError(e.message || "No se pudo generar.");
    } finally {
      setGenerando(false);
    }
  };

  const ejemplos: Record<Modo, string[]> = {
    nuevo: ["Reclama 4.200 € de la factura 23/2026 con intereses", "Carta al cliente explicando la sentencia"],
    reescribir: ["Más formal", "Más breve y directo", "Corrige la ortografía y la puntuación", "Tradúcelo al inglés"],
    continuar: ["Añade los fundamentos de derecho", "Añade el suplico"],
  };

  return (
    <aside className={`${movil ? "fixed inset-0 z-50" : "w-[360px] shrink-0 border-l border-slate-200"} flex flex-col bg-white`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><Sparkles size={15} className="text-[#ab0433]" /> Redactar con IA</p>
        <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Cerrar"><X size={15} /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {([["nuevo", "Redactar"], ["reescribir", "Cambiar selección"], ["continuar", "Continuar"]] as [Modo, string][]).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${modo === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
          ))}
        </div>

        {modo === "reescribir" && (
          <p className={`rounded-xl px-3 py-2 text-xs ${haySeleccion ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {haySeleccion ? `Texto seleccionado: ${editor.state.doc.textBetween(from, to, " ").slice(0, 90)}${to - from > 90 ? "…" : ""}` : "Selecciona en el documento el texto que quieres cambiar."}
          </p>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-500">Skill</label>
          <select value={skillId} onChange={(e) => setSkillId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="">Ninguna (solo mis indicaciones)</option>
            {usables.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {skill?.descripcion && <p className="mt-1 text-[11px] text-slate-400">{skill.descripcion}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500">
            {modo === "nuevo" ? "¿Qué quieres que redacte?" : modo === "reescribir" ? "¿Cómo lo cambio?" : "¿Qué añado?"}
          </label>
          <textarea
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void generar(); } }}
            rows={5}
            placeholder={modo === "nuevo" ? "Ej.: demanda contra Construcciones Sur por la factura impagada de marzo, con intereses desde el vencimiento." : modo === "reescribir" ? "Ej.: hazlo más formal" : "Ej.: añade los fundamentos de derecho"}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ejemplos[modo].map((t) => (
              <button key={t} type="button" onClick={() => setInstrucciones(t)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50">{t}</button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-3 text-xs">
          <p className="font-semibold text-slate-600">Datos que usará</p>
          {expediente ? (
            <p className="mt-1 flex items-center gap-1 text-blue-700"><Briefcase size={11} className="shrink-0" /> <span className="truncate">{expediente}</span></p>
          ) : (
            <p className="mt-1 text-slate-400">
              Ningún expediente vinculado: lo que falte quedará como [●].{" "}
              <button type="button" onClick={onVincular} className="font-semibold text-[#ab0433] hover:underline">Vincular</button>
            </p>
          )}
          <p className="mt-1 text-slate-400">También los datos del despacho y la skill de estilo.</p>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {hecho && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{hecho}</p>}
      </div>
      <div className="border-t border-slate-100 p-4">
        <button
          type="button"
          onClick={generar}
          disabled={generando || (modo === "nuevo" && !instrucciones.trim() && !skillId) || (modo === "reescribir" && !haySeleccion)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#92042c] disabled:opacity-40"
        >
          {generando ? <><Loader2 size={15} className="animate-spin" /> Redactando… (puede tardar un poco)</> : <><Wand2 size={15} /> {modo === "nuevo" ? "Redactar" : modo === "reescribir" ? "Cambiar el texto" : "Continuar"}</>}
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-400">La IA puede equivocarse: revisa siempre el documento antes de usarlo.</p>
      </div>
    </aside>
  );
}

function SelectorExpediente({ titulo, getToken, onElegir, onQuitar, onCerrar }: {
  titulo: string;
  getToken: (o?: { skipCache?: boolean }) => Promise<string | null>;
  onElegir: (e: ExpedienteOption) => void;
  onQuitar?: () => void;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ExpedienteOption[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const d = await apiFetch(`/api/expedientes?limit=8${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`, { getToken });
        setRes(d?.data || []);
      } catch { setRes([]); } finally { setBuscando(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, getToken]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
          <button type="button" onClick={onCerrar} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Referencia, cliente o asunto..." className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            {buscando && <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" />}
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {!res.length && !buscando && <p className="px-1 py-2 text-xs text-slate-400">Sin expedientes con esa búsqueda.</p>}
            {res.map((e) => (
              <button key={e.id} type="button" onClick={() => onElegir(e)} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50">
                <p className="truncate text-sm font-semibold text-slate-800">{etiquetaExp(e)}</p>
                {e.cliente_nombre && <p className="truncate text-xs text-slate-500">{e.cliente_nombre}</p>}
              </button>
            ))}
          </div>
          {onQuitar && (
            <button type="button" onClick={onQuitar} className="text-xs font-semibold text-slate-500 hover:text-red-600">Quitar el expediente vinculado</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
