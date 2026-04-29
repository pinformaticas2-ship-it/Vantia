import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Library, Landmark, Scale, ShieldCheck, Search, Loader2, ExternalLink,
  FileText, BookOpen, Sparkles, Link2, AlertCircle, CheckCircle2, X, HelpCircle,
} from "lucide-react";
import { apiFetch } from "../lib/api";

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

interface CendojHighlight {
  id: string;
  title: string;
  url: string;
}

interface CendojSearchResult {
  id: string;
  roj: string | null;
  ecli: string | null;
  organo: string | null;
  municipio: string | null;
  ponente: string | null;
  numeroRecurso: string | null;
  fecha: string | null;
  tipoResolucion: string | null;
  resumen: string | null;
  url: string | null;
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

interface CendojAdvancedFilters {
  organo: string;
  tipo: string;
  ponente: string;
  year: string;
}

function ProviderCard({ provider }: { provider: ProviderInfo }) {
  const tone = provider.status === "available"
    ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
    : provider.status === "partial" || provider.status === "prepared"
    ? "border-amber-200 bg-amber-50/70 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{provider.name}</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">{provider.mode.replaceAll("_", " ")}</h3>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
          {provider.status}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">{provider.note}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {provider.supports.map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
            {item.replaceAll("_", " ")}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <BookOpen size={13} />
          Fuente oficial
        </a>
        <a href={provider.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <ExternalLink size={13} />
          Abrir servicio
        </a>
      </div>
    </div>
  );
}

function ResultMeta({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

export default function Documental() {
  const { getToken } = useAuth();
  const [providers, setProviders] = useState<Record<string, ProviderInfo> | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);

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

  const [cendojHighlights, setCendojHighlights] = useState<CendojHighlight[]>([]);
  const [cendojLoading, setCendojLoading] = useState(false);
  const [cendojError, setCendojError] = useState<string | null>(null);
  const [cendojQuery, setCendojQuery] = useState("caducidad");
  const [cendojSearchLoading, setCendojSearchLoading] = useState(false);
  const [cendojSearchError, setCendojSearchError] = useState<string | null>(null);
  const [cendojSearchResults, setCendojSearchResults] = useState<CendojSearchResult[]>([]);
  const [cendojSearchTotal, setCendojSearchTotal] = useState<number | null>(null);
  const [cendojRemoteTotal, setCendojRemoteTotal] = useState<number | null>(null);
  const [cendojRecoverableMax, setCendojRecoverableMax] = useState<number | null>(null);
  const [cendojSearchUrl, setCendojSearchUrl] = useState<string | null>(null);
  const [cendojSearchWarning, setCendojSearchWarning] = useState<string | null>(null);
  const [showCendojHelp, setShowCendojHelp] = useState(false);
  const [cendojAdvanced, setCendojAdvanced] = useState<CendojAdvancedFilters>({
    organo: "",
    tipo: "",
    ponente: "",
    year: "",
  });

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

  const fetchCendojHighlights = useCallback(async () => {
    try {
      setCendojLoading(true);
      setCendojError(null);
      const data = await apiFetch("/api/documental/cendoj/highlights", { getToken });
      if (data?.success === false) throw new Error(data.error || "No se pudo consultar CENDOJ.");
      setCendojHighlights(data.data?.highlights || []);
    } catch (e: any) {
      setCendojHighlights([]);
      setCendojError(null);
    } finally {
      setCendojLoading(false);
    }
  }, [getToken]);

  const searchCendoj = useCallback(async (query: string) => {
    const value = query.trim();
    const hasAdvanced = Object.values(cendojAdvanced).some((item) => item.trim());
    if (!value && !hasAdvanced) {
      setCendojSearchError("Escribe un texto o usa algún filtro avanzado para buscar en CENDOJ.");
      setCendojSearchResults([]);
      setCendojSearchTotal(null);
      setCendojRemoteTotal(null);
      setCendojRecoverableMax(null);
      setCendojSearchUrl(null);
      setCendojSearchWarning(null);
      return;
    }

    try {
      setCendojSearchLoading(true);
      setCendojSearchError(null);
      const params = new URLSearchParams();
      if (value) params.set("q", value);
      if (cendojAdvanced.organo.trim()) params.set("organo", cendojAdvanced.organo.trim());
      if (cendojAdvanced.tipo.trim()) params.set("tipo", cendojAdvanced.tipo.trim());
      if (cendojAdvanced.ponente.trim()) params.set("ponente", cendojAdvanced.ponente.trim());
      if (cendojAdvanced.year.trim()) params.set("year", cendojAdvanced.year.trim());
      params.set("page", "1");
      params.set("max_pages", "100");
      const data = await apiFetch(`/api/documental/cendoj/search?${params.toString()}`, { getToken });
      if (data?.success === false) throw new Error(data.error || "No se pudo buscar en CENDOJ.");
      setCendojSearchResults(data.data?.results || []);
      setCendojSearchTotal(typeof data.data?.total === "number" ? data.data.total : null);
      setCendojRemoteTotal(typeof data.data?.remoteTotal === "number" ? data.data.remoteTotal : null);
      setCendojRecoverableMax(typeof data.data?.recoverableMax === "number" ? data.data.recoverableMax : null);
      setCendojSearchUrl(data.data?.searchUrl || null);
      setCendojSearchWarning(data.data?.warning || null);
    } catch (e: any) {
      setCendojSearchResults([]);
      setCendojSearchTotal(null);
      setCendojRemoteTotal(null);
      setCendojRecoverableMax(null);
      setCendojSearchUrl(null);
      setCendojSearchWarning(null);
      setCendojSearchError(e.message || "No se pudo buscar en CENDOJ.");
    } finally {
      setCendojSearchLoading(false);
    }
  }, [cendojAdvanced, getToken]);

  useEffect(() => {
    void fetchProviders();
    void fetchCendojHighlights();
  }, [fetchProviders, fetchCendojHighlights]);

  useEffect(() => {
    if (!(selectedBlockLoading || selectedBlock || selectedBlockError)) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedBlock, selectedBlockError, selectedBlockLoading]);

  const providerList = useMemo(() => providers ? Object.values(providers) : [], [providers]);
  const lexnetProvider = providers?.lexnet;
  const cendojProvider = providers?.cendoj;
  const showBlockModal = selectedBlockLoading || selectedBlock || selectedBlockError;

  const handleBoeLookup = useCallback(async () => {
    const value = boeId.trim();
    const hasAdvanced = Object.values(boeAdvanced).some((item) => item.trim());
    if (!value && !hasAdvanced) {
      setBoeError("Escribe un identificador BOE, una referencia o usa algún filtro avanzado.");
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
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(171,4,51,0.08),_transparent_32%),linear-gradient(180deg,_white,_rgba(248,250,252,0.96))] px-7 py-7 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#ab0433] shadow-sm ring-1 ring-red-100">
              <Library size={13} />
              Módulo Documental
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">BOE, CENDOJ y LexNET conectados hasta donde hoy es viable</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              He dejado una base documental real: BOE operativo con API oficial, CENDOJ enlazado y preparado con información pública oficial,
              y LexNET listo para integración segura cuando tengamos credenciales y certificado del despacho.
            </p>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">BOE</p>
              <p className="mt-2 text-lg font-black text-emerald-600">API oficial</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">CENDOJ</p>
              <p className="mt-2 text-lg font-black text-amber-600">Portal público</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LexNET</p>
              <p className="mt-2 text-lg font-black text-slate-700">
                {lexnetProvider?.configured ? "Preparado" : "Pendiente"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {loadingProviders ? (
          <div className="xl:col-span-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Cargando conectores documentales...
          </div>
        ) : providerError ? (
          <div className="xl:col-span-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <AlertCircle size={16} />
            {providerError}
          </div>
        ) : (
          providerList.map((provider) => <ProviderCard key={provider.key} provider={provider} />)
        )}
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="self-start rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">BOE operativo</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">Consulta de norma por identificador</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                Esta parte ya está conectada con la API oficial de datos abiertos del BOE. Puedes recuperar metadatos y estructura del texto consolidado.
              </p>
            </div>
            <Landmark size={22} className="text-emerald-500" />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <div className="min-w-[320px] flex-1">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Identificador BOE</label>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-emerald-300 focus-within:bg-white">
                <Search size={15} className="text-slate-400" />
                <input
                  value={boeId}
                  onChange={(e) => setBoeId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleBoeLookup();
                    }
                  }}
                  placeholder="BOE-A-2020-8099 o Ley 40/2015"
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Usa un identificador BOE exacto o una referencia tipo <span className="font-semibold">Ley 40/2015</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleBoeLookup()}
              className="self-end inline-flex items-center gap-2 rounded-2xl bg-[#ab0433] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-colors hover:bg-[#92042c]"
            >
              {boeLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Consultar
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Título exacto</label>
              <input
                value={boeAdvanced.title}
                onChange={(e) => setBoeAdvanced((current) => ({ ...current, title: e.target.value }))}
                placeholder="Ley Orgánica 3/2018"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Texto legal</label>
              <input
                value={boeAdvanced.texto}
                onChange={(e) => setBoeAdvanced((current) => ({ ...current, texto: e.target.value }))}
                placeholder="protección de datos"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Rango</label>
              <input
                value={boeAdvanced.rango}
                onChange={(e) => setBoeAdvanced((current) => ({ ...current, rango: e.target.value }))}
                placeholder="Ley, Real Decreto..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Departamento</label>
              <input
                value={boeAdvanced.departamento}
                onChange={(e) => setBoeAdvanced((current) => ({ ...current, departamento: e.target.value }))}
                placeholder="Ministerio de Justicia"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Materia</label>
              <input
                value={boeAdvanced.materia}
                onChange={(e) => setBoeAdvanced((current) => ({ ...current, materia: e.target.value }))}
                placeholder="procedimiento administrativo"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Año desde</label>
                <input
                  value={boeAdvanced.yearFrom}
                  onChange={(e) => setBoeAdvanced((current) => ({ ...current, yearFrom: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))}
                  placeholder="2015"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Año hasta</label>
                <input
                  value={boeAdvanced.yearTo}
                  onChange={(e) => setBoeAdvanced((current) => ({ ...current, yearTo: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))}
                  placeholder="2024"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {boeError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {boeError}
            </div>
          )}

          {boeSearchMode === "search" && !boeLoading && !boeError && (
            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Resultados BOE</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">
                    {boeSearchResults.length > 0 ? `${boeSearchResults.length} coincidencias` : "Sin resultados"}
                  </h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                  búsqueda por referencia/texto
                </span>
              </div>

              {boeSearchResults.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No he encontrado normas consolidadas con esa referencia o texto.</p>
              ) : (
                    <div className="mt-4 space-y-3">
                      {boeSearchResults.map((item) => (
                        <button
                      key={`${item.identificador}-${item.numero_oficial}-${item.titulo}`}
                      type="button"
                      onClick={() => {
                        if (!item.identificador) return;
                        setBoeId(item.identificador);
                        setBoeSearchMode("id");
                        setBoeSearchResults([]);
                        void fetchBoeDocument(item.identificador);
                      }}
                          className="block w-full rounded-[24px] border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#ab0433]/30 hover:bg-red-50/30"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.identificador || "sin identificador"}</p>
                              <p className="mt-1 text-lg font-black text-slate-900">{item.titulo || "Norma BOE"}</p>
                              {item.numero_oficial && (
                                <p className="mt-2 text-sm text-slate-500">{item.numero_oficial}</p>
                              )}
                            </div>
                            <span className="inline-flex items-center rounded-full bg-[#ab0433] px-3 py-1 text-xs font-semibold text-white">
                              Abrir ficha
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <ResultMeta label="Rango" value={item.rango} />
                            <ResultMeta label="Publicación" value={item.fecha_publicacion} />
                            <ResultMeta label="Departamento" value={item.departamento} />
                          </div>
                        </button>
                      ))}
                    </div>
              )}
            </div>
          )}

          {!boeDocument && !boeError && boeSearchMode !== "search" && !boeLoading && (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
              Busca por identificador BOE o por referencia para cargar la ficha de la norma sin ocupar media pantalla vacía.
            </div>
          )}

          {boeDocument && (
            <div className="mt-6 space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{boeDocument.id}</p>
                    <h3 className="mt-2 text-xl font-black leading-tight text-slate-900">{boeDocument.titulo || "Norma BOE"}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {boeDocument.rango && <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{boeDocument.rango}</span>}
                      {boeDocument.fecha_publicacion && <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">Publicación {boeDocument.fecha_publicacion}</span>}
                      {boeDocument.estado_consolidacion && <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{boeDocument.estado_consolidacion}</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a href={boeDocument.urlHtml} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                      <ExternalLink size={13} />
                      Abrir BOE
                    </a>
                    <a href={boeDocument.urlPdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                      <Link2 size={13} />
                      Texto oficial
                    </a>
                  </div>
                </div>

                {boeDocument.departamento && (
                  <p className="mt-4 text-sm text-slate-500">Departamento: <span className="font-medium text-slate-700">{boeDocument.departamento}</span></p>
                )}

                {boeDocument.materias.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {boeDocument.materias.map((materia) => (
                      <span key={materia} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        {materia}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[#ab0433]" />
                    <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Estructura consolidada</h4>
                  </div>
                  {boeDocument.blocks.length > 12 && (
                    <button
                      type="button"
                      onClick={() => setShowAllBoeBlocks((current) => !current)}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      {showAllBoeBlocks ? "Mostrar menos" : `Mostrar todos (${boeDocument.blocks.length})`}
                    </button>
                  )}
                </div>

                {boeDocument.blocks.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No se pudieron recuperar bloques estructurados.</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(showAllBoeBlocks ? boeDocument.blocks : boeDocument.blocks.slice(0, 12)).map((block) => (
                      <button
                        key={`${block.id}-${block.titulo}`}
                        type="button"
                        onClick={() => block.id && void fetchBoeBlock(boeDocument.id, block.id)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-[#ab0433]/30 hover:bg-red-50/40"
                      >
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{block.id || "bloque"}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{block.titulo || "Bloque sin título"}</p>
                        {block.fecha_actualizacion && (
                          <p className="mt-2 text-xs text-slate-400">Actualizado {block.fecha_actualizacion}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-600">CENDOJ funcional</p>
                <h2 className="mt-2 text-xl font-black text-slate-900">Búsqueda pública de jurisprudencia</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCendojHelp((current) => !current)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
                  title="Qué necesita CENDOJ para funcionar bien"
                >
                  <HelpCircle size={16} />
                </button>
                <Scale size={20} className="text-amber-500" />
              </div>
            </div>

            {showCendojHelp && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                <p className="font-semibold">Para que CENDOJ funcione correctamente necesitamos:</p>
                <p>Que el portal público del CGPJ permita la consulta automática en ese momento, que no bloquee la petición por protección anti-bot y que la búsqueda no supere el límite recuperable que el propio portal publica.</p>
                <p className="mt-2">Si CENDOJ devuelve `403` o limita resultados, el ERP seguirá mostrándote la opción de abrir la búsqueda oficial directamente en el portal.</p>
              </div>
            )}

            <p className="mt-3 text-sm leading-7 text-slate-500">
              Ahora puedes buscar jurisprudencia pública en CENDOJ desde el ERP, revisar datos clave de cada resolución y abrir el documento oficial en el portal del CGPJ.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href={cendojProvider?.searchUrl || "https://www.poderjudicial.es/search/indexAN.jsp"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                <ExternalLink size={13} />
                Abrir buscador oficial
              </a>
              <a href={cendojProvider?.docsUrl || "https://www.poderjudicial.es/cgpj/es/Servicios/Jurisprudencia/Buscador-Fondo-Documental-Jurisprudencia/?perfil=1"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                <BookOpen size={13} />
                Fuente CGPJ
              </a>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[260px] flex-1">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar en CENDOJ</label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-amber-300">
                    <Search size={15} className="text-slate-400" />
                    <input
                      value={cendojQuery}
                      onChange={(e) => setCendojQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void searchCendoj(cendojQuery);
                        }
                      }}
                      placeholder="caducidad, despido, Ley 40/2015..."
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Busca por concepto jurídico, referencia normativa o texto libre.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void searchCendoj(cendojQuery)}
                  className="self-end inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                >
                  {cendojSearchLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  Buscar
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Órgano</label>
                  <input
                    value={cendojAdvanced.organo}
                    onChange={(e) => setCendojAdvanced((current) => ({ ...current, organo: e.target.value }))}
                    placeholder="Tribunal Supremo"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo</label>
                  <input
                    value={cendojAdvanced.tipo}
                    onChange={(e) => setCendojAdvanced((current) => ({ ...current, tipo: e.target.value }))}
                    placeholder="Sentencia, Auto..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Ponente</label>
                  <input
                    value={cendojAdvanced.ponente}
                    onChange={(e) => setCendojAdvanced((current) => ({ ...current, ponente: e.target.value }))}
                    placeholder="apellido del ponente"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Año</label>
                  <input
                    value={cendojAdvanced.year}
                    onChange={(e) => setCendojAdvanced((current) => ({ ...current, year: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))}
                    placeholder="2024"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-300"
                  />
                </div>
              </div>

              {cendojSearchError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cendojSearchError}</div>
              )}

              {!cendojSearchError && cendojSearchWarning && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>{cendojSearchWarning}</p>
                  {cendojSearchUrl && (
                    <a
                      href={cendojSearchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                    >
                      <ExternalLink size={13} />
                      Abrir búsqueda en CENDOJ
                    </a>
                  )}
                </div>
              )}

              {!cendojSearchError && !cendojSearchWarning && (cendojSearchLoading || cendojSearchResults.length > 0 || cendojSearchTotal === 0) && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Resultados CENDOJ</p>
                    {typeof cendojSearchTotal === "number" && (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                        {typeof cendojRemoteTotal === "number" ? `${cendojRemoteTotal} resultados en CENDOJ` : `${cendojSearchTotal} resultados cargados`}
                      </span>
                    )}
                  </div>

                  {typeof cendojRecoverableMax === "number" && typeof cendojRemoteTotal === "number" && cendojRemoteTotal > cendojRecoverableMax && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      CENDOJ informa de <span className="font-semibold">{cendojRemoteTotal}</span> resultados, pero el propio portal limita la recuperación automática a <span className="font-semibold">{cendojRecoverableMax}</span> documentos por búsqueda.
                    </div>
                  )}

                  {cendojSearchLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 size={15} className="animate-spin" />
                      Consultando CENDOJ...
                    </div>
                  ) : cendojSearchResults.length === 0 ? (
                    <p className="text-sm text-slate-500">No he encontrado resoluciones para esa búsqueda.</p>
                  ) : (
                    <div className="space-y-4">
                      {cendojSearchResults.map((item) => (
                        <a
                          key={`${item.id}-${item.roj}-${item.ecli}`}
                          href={item.url || cendojProvider?.searchUrl || "https://www.poderjudicial.es/search/indexAN.jsp"}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-[24px] border border-slate-200 bg-white p-5 transition-colors hover:border-amber-300 hover:bg-amber-50/30"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.roj || "ROJ no disponible"}</p>
                              <h4 className="mt-1 text-lg font-black text-slate-900">{item.organo || "Resolución CENDOJ"}</h4>
                              {item.ecli && (
                                <p className="mt-1 break-all text-sm text-slate-500">{item.ecli}</p>
                              )}
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              <ExternalLink size={12} />
                              Abrir
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <ResultMeta label="Fecha" value={item.fecha} />
                            <ResultMeta label="Tipo" value={item.tipoResolucion} />
                            <ResultMeta label="Ponente" value={item.ponente} />
                            <ResultMeta label="Recurso" value={item.numeroRecurso} />
                          </div>

                          {item.municipio && (
                            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-amber-700">
                              Municipio: <span className="text-amber-900">{item.municipio}</span>
                            </div>
                          )}

                          {item.resumen && (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Resumen</p>
                              <p className="mt-3 text-sm leading-6 text-slate-600">{item.resumen}</p>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Resoluciones destacadas</p>
              {cendojLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 size={15} className="animate-spin" />
                  Cargando resoluciones destacadas...
                </div>
              ) : cendojError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cendojError}</div>
              ) : cendojHighlights.length === 0 ? (
                <p className="text-sm text-slate-400">No hay destacados disponibles ahora mismo.</p>
              ) : (
                <div className="space-y-3">
                  {cendojHighlights.map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:border-amber-300 hover:bg-amber-50/40">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">LexNET preparado</p>
                <h2 className="mt-2 text-xl font-black text-slate-900">Integración segura pendiente de credenciales</h2>
              </div>
              <ShieldCheck size={20} className="text-slate-500" />
            </div>

            <p className="mt-3 text-sm leading-7 text-slate-500">
              LexNET no se puede dejar operativo sin certificado válido y flujo de autenticación del despacho. Te he dejado el módulo preparado para esa siguiente fase.
            </p>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                {lexnetProvider?.configured ? <CheckCircle2 size={15} className="text-emerald-500" /> : <AlertCircle size={15} className="text-amber-500" />}
                {lexnetProvider?.configured ? "Configuración base detectada" : "Faltan certificado y credenciales de integración"}
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Cuando tengas acceso técnico del despacho, el siguiente paso es montar autenticación, manejo de certificado y operaciones permitidas sobre la sede.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href={lexnetProvider?.searchUrl || "https://sedejudicial.justicia.es/-/lexnet"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                <ExternalLink size={13} />
                Abrir LexNET oficial
              </a>
            </div>
          </section>
        </div>
      </section>

    </div>
    {showBlockModal && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-950/35 backdrop-blur-sm">
        <div className="fixed inset-0 grid place-items-center px-4 py-6">
          <div className="my-auto w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#ab0433]">Bloque BOE</p>
                <h3 className="mt-2 truncate text-2xl font-black text-slate-900">
                  {selectedBlock?.titulo || selectedBlock?.id || "Cargando bloque"}
                </h3>
                {selectedBlock?.tipo && (
                  <p className="mt-1 text-sm text-slate-500">Tipo: <span className="font-medium text-slate-700">{selectedBlock.tipo}</span></p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedBlock(null); setSelectedBlockError(null); }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 max-h-[calc(100vh-11rem)]">
              {selectedBlockLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Cargando contenido del bloque...
                </div>
              ) : selectedBlockError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{selectedBlockError}</div>
              ) : selectedBlock ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {selectedBlock.id && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedBlock.id}</span>}
                    {selectedBlock.fechaPublicacion && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Publicado {selectedBlock.fechaPublicacion}</span>}
                    {selectedBlock.fechaVigencia && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Vigencia {selectedBlock.fechaVigencia}</span>}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Texto legible</p>
                    <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-700">
                      {selectedBlock.paragraphs.map((paragraph, index) => (
                        <p key={`p-${index}`}>{paragraph}</p>
                      ))}
                      {selectedBlock.quotes.map((quote, index) => (
                        <blockquote key={`q-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600">
                          {quote.split("\n").map((line, lineIndex) => (
                            <p key={`ql-${lineIndex}`}>{line}</p>
                          ))}
                        </blockquote>
                      ))}
                      {selectedBlock.paragraphs.length === 0 && selectedBlock.quotes.length === 0 && (
                        <p className="text-slate-400">Este bloque no trae párrafos renderizables con el formato actual del BOE.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a href={selectedBlock.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                      <ExternalLink size={13} />
                      Abrir en BOE
                    </a>
                    <a href={selectedBlock.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                      <Link2 size={13} />
                      Ver XML oficial
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
