import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "../components/Spinner";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Library, Landmark, Scale, ShieldCheck, Search, Loader2, ExternalLink,
  FileText, BookOpen, Link2, AlertCircle, CheckCircle2, X, ChevronDown,
  Copy, Check, BookmarkPlus, Clock, Briefcase,
} from "lucide-react";
import { apiFetch } from "../lib/api";

// ── Búsquedas recientes (localStorage) ──────────────────────────────────────
// Puramente local: no hay endpoint de "historial de búsquedas" en el backend,
// y no hace falta uno para algo tan ligero -- guardamos las últimas consultas
// BOE vistas para no obligar a repetir la búsqueda cada vez que se vuelve al
// módulo.
const BOE_RECENT_KEY = "vantia_boe_recientes_v1";
const BOE_RECENT_MAX = 8;
interface BoeRecentItem { id: string; titulo: string | null; viewedAt: string }
function loadBoeRecent(): BoeRecentItem[] {
  try {
    const raw = localStorage.getItem(BOE_RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function pushBoeRecent(item: BoeRecentItem) {
  try {
    const current = loadBoeRecent().filter((entry) => entry.id !== item.id);
    const next = [item, ...current].slice(0, BOE_RECENT_MAX);
    localStorage.setItem(BOE_RECENT_KEY, JSON.stringify(next));
    return next;
  } catch { return loadBoeRecent(); }
}

interface ProviderInfo {
  key: string;
  name: string;
  status: string;
  mode: string;
  docsUrl: string;
  searchUrl: string;
  supports: string[];
  note: string;
  configured?: boolean;
  requiresCertificate?: boolean;
}

interface BoeDocumentResponse {
  id: string;
  titulo: string | null;
  rango: string | null;
  fecha_publicacion: string | null;
  fecha_disposicion: string | null;
  departamento: string | null;
  estado_consolidacion: string | null;
  materias: string[];
  urlHtml: string;
  urlPdf: string;
  blocks: Array<{
    id: string | null;
    titulo: string | null;
    fecha_actualizacion: string | null;
    url: string | null;
  }>;
}

interface BoeBlockResponse {
  documentId: string;
  id: string | null;
  tipo: string | null;
  titulo: string | null;
  idNorma: string | null;
  fechaPublicacion: string | null;
  fechaVigencia: string | null;
  paragraphs: string[];
  quotes: string[];
  rawXml: string;
  sourceUrl: string;
  htmlUrl: string;
}

interface BoeSearchResult {
  identificador: string | null;
  titulo: string | null;
  numero_oficial: string | null;
  fecha_publicacion: string | null;
  fecha_disposicion: string | null;
  departamento: string | null;
  rango: string | null;
  estado_consolidacion: string | null;
  url_html_consolidada: string | null;
}

interface BoeAdvancedFilters {
  title: string;
  texto: string;
  rango: string;
  departamento: string;
  materia: string;
  yearFrom: string;
  yearTo: string;
}

interface ExpedienteOption {
  id: string;
  anio: number;
  num_exp: number;
  descripcion: string | null;
  cliente_nombre: string | null;
}

// ── Guardar una referencia (documento o bloque) como nota del expediente ────
// Reutiliza POST /api/expedientes/:id/notes (categoría "legal", ya existente
// para cualquier nota) en vez de montar una tabla/endpoint nuevo solo para
// esto -- es justo lo que esa categoría ya está pensada para guardar.
function GuardarEnExpedienteModal({ content, onClose, getToken }: {
  content: { titulo: string; cuerpo: string };
  onClose: (saved: boolean) => void;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExpedienteOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ExpedienteOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch(`/api/expedientes?limit=8${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`, { getToken });
        setResults(data?.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, getToken]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/expedientes/${selected.id}/notes`, {
        getToken,
        method: "POST",
        body: JSON.stringify({ content: content.cuerpo, category: "legal" }),
      });
      if (data?.success === false) throw new Error(data.error || "No se pudo guardar la referencia.");
      setSaved(true);
      setTimeout(() => onClose(true), 900);
    } catch (e: any) {
      setError(e.message || "No se pudo guardar la referencia.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-sm flex items-center justify-center px-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#ab0433]">Guardar en expediente</p>
            <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">{content.titulo}</h3>
          </div>
          <button type="button" onClick={() => onClose(false)} className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {saved ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} /> Guardado como nota del expediente.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 focus-within:border-emerald-300 focus-within:bg-white transition-colors">
                <Search size={13} className="text-slate-400 shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                  placeholder="Buscar expediente por referencia, cliente..."
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
                {searching && <Loader2 size={13} className="animate-spin text-slate-400 shrink-0" />}
              </div>

              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {results.length === 0 && !searching && (
                  <p className="px-1 py-2 text-xs text-slate-400">
                    {query.trim() ? "Sin expedientes con esa búsqueda." : "Escribe para buscar o elige de los más recientes."}
                  </p>
                )}
                {results.map((exp) => (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => setSelected(exp)}
                    className={`w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      selected?.id === exp.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <Briefcase size={13} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700">{exp.anio}/{exp.num_exp}</p>
                      <p className="truncate text-xs text-slate-500">{exp.descripcion || exp.cliente_nombre || "Sin descripción"}</p>
                    </div>
                    {selected?.id === exp.id && <Check size={14} className="shrink-0 text-emerald-600" />}
                  </button>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  <AlertCircle size={13} className="shrink-0" /> {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={!selected || saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#92042c] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />}
                Guardar como nota
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Documental() {
  const { getToken } = useAuth();
  const [providers, setProviders] = useState<Record<string, ProviderInfo> | null>(null);
  const [, setLoadingProviders] = useState(true);
  const [, setProviderError] = useState<string | null>(null);

  const [boeId, setBoeId] = useState("BOE-A-2020-8099");
  const [boeDocument, setBoeDocument] = useState<BoeDocumentResponse | null>(null);
  const [boeLoading, setBoeLoading] = useState(false);
  const [boeError, setBoeError] = useState<string | null>(null);
  const [boeSearchResults, setBoeSearchResults] = useState<BoeSearchResult[]>([]);
  const [boeSearchMode, setBoeSearchMode] = useState<"id" | "search" | null>(null);
  const [showAllBoeBlocks, setShowAllBoeBlocks] = useState(false);
  const [boeAdvanced, setBoeAdvanced] = useState<BoeAdvancedFilters>({
    title: "",
    texto: "",
    rango: "",
    departamento: "",
    materia: "",
    yearFrom: "",
    yearTo: "",
  });
  const [selectedBlock, setSelectedBlock] = useState<BoeBlockResponse | null>(null);
  const [selectedBlockLoading, setSelectedBlockLoading] = useState(false);
  const [selectedBlockError, setSelectedBlockError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"boe" | "cendoj" | "lexnet">("boe");
  const [showBoeAdvanced, setShowBoeAdvanced] = useState(false);

  const [boeRecent, setBoeRecent] = useState<BoeRecentItem[]>(() => loadBoeRecent());
  const [copiedCitation, setCopiedCitation] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<{ titulo: string; cuerpo: string } | null>(null);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCitation(key);
      setTimeout(() => setCopiedCitation((k) => (k === key ? null : k)), 1600);
    } catch { /* portapapeles no disponible (permiso denegado, http sin TLS...) */ }
  }, []);

  const documentCitation = useMemo(() => {
    if (!boeDocument) return "";
    const titulo = boeDocument.titulo || "Norma BOE";
    const meta = [
      boeDocument.rango,
      boeDocument.id,
      boeDocument.fecha_publicacion ? `BOE de ${boeDocument.fecha_publicacion}` : null,
    ].filter(Boolean).join(", ");
    return `${titulo}${meta ? ` (${meta})` : ""}. ${boeDocument.urlHtml}`;
  }, [boeDocument]);

  const fetchProviders = useCallback(async () => {
    try {
      setLoadingProviders(true);
      setProviderError(null);
      const data = await apiFetch("/api/documental/providers", { getToken });
      if (data?.success === false) throw new Error(data.error || "No se pudo cargar la configuración documental.");
      setProviders(data.data || null);
    } catch (e: any) {
      setProviderError(e.message || "No se pudo cargar la configuración documental.");
    } finally {
      setLoadingProviders(false);
    }
  }, [getToken]);

  const fetchBoeDocument = useCallback(async (id: string) => {
    try {
      setBoeLoading(true);
      setBoeError(null);
      setShowAllBoeBlocks(false);
      const data = await apiFetch(`/api/documental/boe/document/${encodeURIComponent(id.trim())}`, { getToken });
      if (data?.success === false) throw new Error(data.error || "No se pudo consultar el BOE.");
      setBoeDocument(data.data || null);
      if (data.data?.id) {
        setBoeRecent(pushBoeRecent({ id: data.data.id, titulo: data.data.titulo, viewedAt: new Date().toISOString() }));
      }
    } catch (e: any) {
      setBoeDocument(null);
      setBoeError(e.message || "No se pudo consultar el BOE.");
    } finally {
      setBoeLoading(false);
    }
  }, [getToken]);

  const fetchBoeBlock = useCallback(async (documentId: string, blockId: string) => {
    try {
      setSelectedBlockLoading(true);
      setSelectedBlockError(null);
      const data = await apiFetch(`/api/documental/boe/document/${encodeURIComponent(documentId)}/block/${encodeURIComponent(blockId)}`, { getToken });
      if (data?.success === false) throw new Error(data.error || "No se pudo consultar el bloque del BOE.");
      setSelectedBlock(data.data || null);
    } catch (e: any) {
      setSelectedBlock(null);
      setSelectedBlockError(e.message || "No se pudo consultar el bloque del BOE.");
    } finally {
      setSelectedBlockLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    if (!(selectedBlockLoading || selectedBlock || selectedBlockError)) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedBlock, selectedBlockError, selectedBlockLoading]);

  const lexnetProvider = providers?.lexnet;
  const cendojProvider = providers?.cendoj;
  const showBlockModal = selectedBlockLoading || selectedBlock || selectedBlockError;

  const handleBoeLookup = useCallback(async () => {
    const value = boeId.trim();
    const hasAdvanced = Object.values(boeAdvanced).some((item) => item.trim());
    if (!value && !hasAdvanced) {
      setBoeError("Escribe un identificador BOE, una referencia o usa algún filtro avanzado.");
      setBoeDocument(null);
      setBoeSearchMode(null);
      return;
    }

    if (value && /^BOE-[A-Z]-\d{4}-\d+$/i.test(value)) {
      setBoeSearchMode("id");
      setBoeSearchResults([]);
      await fetchBoeDocument(value);
      return;
    }

    try {
      setBoeLoading(true);
      setBoeError(null);
      setBoeDocument(null);
      setBoeSearchMode("search");
      const params = new URLSearchParams();
      if (value) params.set("q", value);
      if (boeAdvanced.title.trim()) params.set("title", boeAdvanced.title.trim());
      if (boeAdvanced.texto.trim()) params.set("texto", boeAdvanced.texto.trim());
      if (boeAdvanced.rango.trim()) params.set("rango", boeAdvanced.rango.trim());
      if (boeAdvanced.departamento.trim()) params.set("departamento", boeAdvanced.departamento.trim());
      if (boeAdvanced.materia.trim()) params.set("materia", boeAdvanced.materia.trim());
      if (boeAdvanced.yearFrom.trim()) params.set("year_from", boeAdvanced.yearFrom.trim());
      if (boeAdvanced.yearTo.trim()) params.set("year_to", boeAdvanced.yearTo.trim());
      params.set("limit", "1000");
      const data = await apiFetch(`/api/documental/boe/search?${params.toString()}`, { getToken });
      if (data?.success === false) throw new Error(data.error || "No se pudo buscar en el BOE.");
      setBoeSearchResults(data.data?.results || []);
    } catch (e: any) {
      setBoeSearchResults([]);
      setBoeError(e.message || "No se pudo buscar en el BOE.");
    } finally {
      setBoeLoading(false);
    }
  }, [boeAdvanced, boeId, fetchBoeDocument, getToken]);

  return (
    <>
    <div className="flex flex-col gap-5 max-w-5xl mx-auto w-full">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#ab0433]/10 flex items-center justify-center">
            <Library size={18} className="text-[#ab0433]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Documental</h1>
            <p className="text-xs text-slate-500">BOE · CENDOJ · LexNET</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />BOE · API oficial
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />CENDOJ · Solo enlace directo
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />LexNET · {lexnetProvider?.configured ? "Preparado" : "Pendiente"}
          </span>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {(["boe", "cendoj", "lexnet"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              activeTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "boe" ? "BOE" : t === "cendoj" ? "CENDOJ" : "LexNET"}
          </button>
        ))}
      </div>

      {/* ── BOE ─────────────────────────────────────────────────── */}
      {activeTab === "boe" && (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[240px] flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-emerald-300 focus-within:bg-white transition-colors">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                value={boeId}
                onChange={(e) => setBoeId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleBoeLookup(); } }}
                placeholder="BOE-A-2020-8099 · Ley 40/2015 · texto libre..."
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {boeId && <button type="button" onClick={() => setBoeId("")} className="text-slate-300 hover:text-slate-500"><X size={13} /></button>}
            </div>
            <button
              type="button"
              onClick={() => void handleBoeLookup()}
              disabled={boeLoading}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#ab0433] px-5 py-3 text-sm font-bold text-white hover:bg-[#92042c] disabled:opacity-60 transition-colors"
            >
              {boeLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Consultar
            </button>
            <button
              type="button"
              onClick={() => setShowBoeAdvanced((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                showBoeAdvanced ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ChevronDown size={14} className={`transition-transform ${showBoeAdvanced ? "rotate-180" : ""}`} />
              Filtros
            </button>
          </div>

          {showBoeAdvanced && (
            <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {[
                { label: "Título", key: "title" as const, placeholder: "Ley Orgánica 3/2018" },
                { label: "Texto", key: "texto" as const, placeholder: "protección de datos" },
                { label: "Rango", key: "rango" as const, placeholder: "Ley, Real Decreto..." },
                { label: "Departamento", key: "departamento" as const, placeholder: "Ministerio de Justicia" },
                { label: "Materia", key: "materia" as const, placeholder: "procedimiento administrativo" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
                  <input
                    value={boeAdvanced[key]}
                    onChange={(e) => setBoeAdvanced((c) => ({ ...c, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-300"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Desde</label>
                  <input value={boeAdvanced.yearFrom} onChange={(e) => setBoeAdvanced((c) => ({ ...c, yearFrom: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))} placeholder="2015" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-300" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Hasta</label>
                  <input value={boeAdvanced.yearTo} onChange={(e) => setBoeAdvanced((c) => ({ ...c, yearTo: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))} placeholder="2024" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-300" />
                </div>
              </div>
            </div>
          )}

          {boeRecent.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Clock size={12} /> Consultadas recientemente
              </p>
              <div className="flex flex-wrap gap-2">
                {boeRecent.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setBoeId(item.id); setBoeSearchMode("id"); setBoeSearchResults([]); setBoeError(null); void fetchBoeDocument(item.id); }}
                    title={item.titulo || item.id}
                    className={`max-w-[240px] truncate rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      boeDocument?.id === item.id
                        ? "border-[#ab0433]/30 bg-red-50/60 text-[#ab0433]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#ab0433]/30 hover:bg-red-50/40"
                    }`}
                  >
                    {item.titulo || item.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {boeError && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" /> {boeError}
            </div>
          )}

          {boeLoading && (
            <div className="mt-5 flex items-center gap-3 text-sm text-slate-500">
              <Spinner size="sm" muted /> Consultando BOE...
            </div>
          )}

          {boeSearchMode === "search" && !boeLoading && !boeError && (
            <div className="mt-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                {boeSearchResults.length > 0 ? `${boeSearchResults.length} resultados` : "Sin resultados"}
              </p>
              {boeSearchResults.length === 0
                ? <p className="text-sm text-slate-500">No se encontraron normas con esa referencia o texto.</p>
                : (
                  <div className="space-y-2">
                    {boeSearchResults.map((item) => (
                      <button
                        key={`${item.identificador}-${item.titulo}`}
                        type="button"
                        onClick={() => {
                          if (!item.identificador) return;
                          setBoeId(item.identificador);
                          setBoeSearchMode("id");
                          setBoeSearchResults([]);
                          void fetchBoeDocument(item.identificador);
                        }}
                        className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-left transition-colors hover:border-[#ab0433]/30 hover:bg-red-50/40"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-slate-400">{item.identificador}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{item.titulo || "Norma BOE"}</p>
                          <p className="mt-0.5 text-xs text-slate-400 flex flex-wrap gap-3">
                            {item.rango && <span>{item.rango}</span>}
                            {item.fecha_publicacion && <span>{item.fecha_publicacion}</span>}
                            {item.departamento && <span className="truncate">{item.departamento}</span>}
                          </p>
                        </div>
                        <ExternalLink size={13} className="text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}

          {!boeDocument && !boeError && boeSearchMode !== "search" && !boeLoading && (
            <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
              <Landmark size={28} className="text-slate-300" />
              <p className="text-sm text-slate-400">Escribe un identificador BOE o texto para buscar normas consolidadas</p>
            </div>
          )}

          {boeDocument && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">{boeDocument.id}</p>
                    <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-900">{boeDocument.titulo || "Norma BOE"}</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {boeDocument.rango && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{boeDocument.rango}</span>}
                      {boeDocument.fecha_publicacion && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{boeDocument.fecha_publicacion}</span>}
                      {boeDocument.estado_consolidacion && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{boeDocument.estado_consolidacion}</span>}
                    </div>
                    {boeDocument.departamento && <p className="mt-2 text-xs text-slate-500">{boeDocument.departamento}</p>}
                    {boeDocument.materias.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {boeDocument.materias.map((m) => <span key={m} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">{m}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(documentCitation, "document")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      {copiedCitation === "document" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      {copiedCitation === "document" ? "Copiada" : "Copiar cita"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveTarget({ titulo: boeDocument.titulo || boeDocument.id, cuerpo: `📚 ${documentCitation}` })}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <BookmarkPlus size={12} /> Guardar en expediente
                    </button>
                    <a href={boeDocument.urlHtml} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      <ExternalLink size={12} /> Abrir BOE
                    </a>
                    <a href={boeDocument.urlPdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      <Link2 size={12} /> PDF
                    </a>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Estructura · {boeDocument.blocks.length} secciones
                  </p>
                  {boeDocument.blocks.length > 12 && (
                    <button type="button" onClick={() => setShowAllBoeBlocks((c) => !c)} className="text-xs font-semibold text-[#ab0433] hover:underline">
                      {showAllBoeBlocks ? "Mostrar menos" : `Ver todas (${boeDocument.blocks.length})`}
                    </button>
                  )}
                </div>
                {boeDocument.blocks.length === 0
                  ? <p className="text-sm text-slate-400">Sin secciones disponibles.</p>
                  : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(showAllBoeBlocks ? boeDocument.blocks : boeDocument.blocks.slice(0, 12)).map((block) => (
                        <button
                          key={`${block.id}-${block.titulo}`}
                          type="button"
                          onClick={() => block.id && void fetchBoeBlock(boeDocument.id, block.id)}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-[#ab0433]/30 hover:bg-red-50/40"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{block.id || "—"}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-800">{block.titulo || "Sección"}</p>
                          {block.fecha_actualizacion && <p className="mt-1 text-[11px] text-slate-400">Act. {block.fecha_actualizacion}</p>}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CENDOJ ──────────────────────────────────────────────── */}
      {activeTab === "cendoj" && (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
              <Scale size={22} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-slate-900">CENDOJ</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-700">
                  Búsqueda automática desactivada
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Buscador de jurisprudencia del Poder Judicial</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-700">El portal público bloquea las consultas automáticas</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  CENDOJ devuelve error 403 ante peticiones automatizadas, así que hemos desactivado la búsqueda integrada. Usa el enlace oficial para consultar jurisprudencia directamente en el portal.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a href={cendojProvider?.searchUrl || "https://www.poderjudicial.es/search/indexAN.jsp"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              <ExternalLink size={14} /> Abrir CENDOJ oficial
            </a>
            <a href={cendojProvider?.docsUrl || "https://www.poderjudicial.es"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              <BookOpen size={14} /> CGPJ
            </a>
          </div>
        </div>
      )}

      {/* ── LexNET ──────────────────────────────────────────────── */}
      {activeTab === "lexnet" && (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-slate-900">LexNET</h2>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${
                  lexnetProvider?.configured
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}>
                  {lexnetProvider?.configured ? "Preparado" : "Pendiente de configuración"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Comunicaciones judiciales electrónicas seguras</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-start gap-3">
              {lexnetProvider?.configured
                ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />}
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {lexnetProvider?.configured ? "Configuración base detectada" : "Faltan certificado y credenciales"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  LexNET requiere certificado digital válido del despacho y credenciales de integración. El módulo está preparado para activarse cuando dispongas de acceso técnico.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <a href={lexnetProvider?.searchUrl || "https://sedejudicial.justicia.es/-/lexnet"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              <ExternalLink size={14} /> Abrir LexNET oficial
            </a>
          </div>
        </div>
      )}

    </div>

    {showBlockModal && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl max-h-[calc(100vh-3rem)] flex flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 shrink-0">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#ab0433]">Bloque BOE</p>
              <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">
                {selectedBlock?.titulo || selectedBlock?.id || "Cargando bloque"}
              </h3>
              {selectedBlock?.tipo && <p className="mt-0.5 text-xs text-slate-500">{selectedBlock.tipo}</p>}
            </div>
            <button
              type="button"
              onClick={() => { setSelectedBlock(null); setSelectedBlockError(null); }}
              className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-5 flex-1">
            {selectedBlockLoading ? (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Spinner size="sm" muted /> Cargando contenido del bloque...
              </div>
            ) : selectedBlockError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{selectedBlockError}</div>
            ) : selectedBlock ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {selectedBlock.id && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{selectedBlock.id}</span>}
                  {selectedBlock.fechaPublicacion && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Publicado {selectedBlock.fechaPublicacion}</span>}
                  {selectedBlock.fechaVigencia && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Vigencia {selectedBlock.fechaVigencia}</span>}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700 space-y-4">
                  {selectedBlock.paragraphs.map((p, i) => <p key={`p-${i}`}>{p}</p>)}
                  {selectedBlock.quotes.map((q, i) => (
                    <blockquote key={`q-${i}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600">
                      {q.split("\n").map((line, li) => <p key={`ql-${li}`}>{line}</p>)}
                    </blockquote>
                  ))}
                  {selectedBlock.paragraphs.length === 0 && selectedBlock.quotes.length === 0 && (
                    <p className="text-slate-400 text-sm">Este bloque no tiene párrafos renderizables en el formato actual del BOE.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const cita = `${selectedBlock.titulo || selectedBlock.id || "Artículo"} — ${selectedBlock.documentId}. ${selectedBlock.htmlUrl}`;
                      void copyToClipboard(cita, "block");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {copiedCitation === "block" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copiedCitation === "block" ? "Copiada" : "Copiar cita"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cuerpo = [
                        `📚 ${selectedBlock.titulo || selectedBlock.id || "Artículo"} (${selectedBlock.documentId})`,
                        selectedBlock.paragraphs[0] || null,
                        selectedBlock.htmlUrl,
                      ].filter(Boolean).join("\n\n");
                      setSaveTarget({ titulo: selectedBlock.titulo || selectedBlock.id || "Artículo BOE", cuerpo });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <BookmarkPlus size={12} /> Guardar en expediente
                  </button>
                  <a href={selectedBlock.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <ExternalLink size={12} /> Abrir en BOE
                  </a>
                  <a href={selectedBlock.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <Link2 size={12} /> Ver XML oficial
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>,
      document.body
    )}

    {saveTarget && (
      <GuardarEnExpedienteModal
        content={saveTarget}
        getToken={getToken}
        onClose={() => setSaveTarget(null)}
      />
    )}
    </>
  );
}
