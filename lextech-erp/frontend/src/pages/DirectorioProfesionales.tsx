import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Scale, Gavel, Search, Plus, X, Edit3, Trash2, ExternalLink,
  RefreshCw, AlertCircle, Loader2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { Spinner } from "../components/Spinner";
import { ConnectionErrorBanner } from "../components/ConnectionErrorBanner";
import { safeJson } from "../lib/api";
import ColumnVisibilityModal from "../components/ColumnVisibilityModal";

interface Profesional {
  id: string;
  tipo: "PROCURADOR" | "ABOGADO";
  first_name: string;
  last_name: string | null;
  nif_cif: string | null;
  estado: string;
  colegio: string | null;
  num_colegiado: string | null;
  despacho: string | null;
  email: string | null;
  website: string | null;
  phone_1: string | null;
  phone_2: string | null;
  phone_3: string | null;
  mobile: string | null;
  fax: string | null;
  address_street: string | null;
  address_cp: string | null;
  address_town: string | null;
  address_province: string | null;
  address_country: string | null;
  notes: string | null;
  cuenta_consignaciones: string | null;
  codigo_repre: string | null;
  especialidad: string | null;
  turno_oficio: boolean;
  created_at: string;
}

type SortKey = "nombre" | "colegio";
const PAGE_SIZE = 60;

// ── Columnas disponibles (igual concepto que "Elegir columnas" en Clientes) ──
type ColumnKey =
  | "name" | "nif_cif" | "colegio" | "num_colegiado" | "codigo_repre" | "especialidad" | "turno_oficio"
  | "cuenta_consignaciones" | "despacho" | "address_street" | "address_cp" | "address_town"
  | "address_province" | "address_country" | "email" | "website" | "phone_1" | "phone_2" | "phone_3"
  | "mobile" | "fax" | "estado";

const ALL_COLUMNS: { key: ColumnKey; label: string; tipoOnly?: "PROCURADOR" | "ABOGADO" }[] = [
  { key: "name",                   label: "Nombre y Apellidos" },
  { key: "nif_cif",                label: "NIF / CIF" },
  { key: "colegio",                label: "Colegio" },
  { key: "num_colegiado",          label: "Nº Colegiado" },
  { key: "codigo_repre",           label: "Código REPRE",          tipoOnly: "PROCURADOR" },
  { key: "cuenta_consignaciones",  label: "Cuenta de consignaciones", tipoOnly: "PROCURADOR" },
  { key: "especialidad",           label: "Especialidad",          tipoOnly: "ABOGADO" },
  { key: "turno_oficio",           label: "Turno de oficio",       tipoOnly: "ABOGADO" },
  { key: "despacho",               label: "Despacho" },
  { key: "address_street",         label: "Dirección" },
  { key: "address_cp",             label: "Código Postal" },
  { key: "address_town",           label: "Población" },
  { key: "address_province",       label: "Provincia" },
  { key: "address_country",        label: "País" },
  { key: "email",                  label: "Correo Electrónico" },
  { key: "website",                label: "Página web" },
  { key: "phone_1",                label: "Teléfono 1" },
  { key: "phone_2",                label: "Teléfono 2" },
  { key: "phone_3",                label: "Teléfono 3" },
  { key: "mobile",                 label: "Móvil" },
  { key: "fax",                    label: "Fax" },
  { key: "estado",                 label: "Estado" },
];

const DEFAULT_VISIBLE: ColumnKey[] = ["name", "colegio", "num_colegiado", "codigo_repre", "especialidad", "email", "phone_1", "estado"];

function cellValue(p: Profesional, key: ColumnKey): React.ReactNode {
  switch (key) {
    case "turno_oficio":
      return p.turno_oficio
        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">Sí</span>
        : <span className="text-slate-300">—</span>;
    case "estado":
      return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.estado === "Baja" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
          {p.estado || "Alta"}
        </span>
      );
    case "num_colegiado":
      return p.num_colegiado ? `Nº ${p.num_colegiado}` : <span className="text-slate-300">—</span>;
    default: {
      const v = (p as any)[key];
      return v ? v : <span className="text-slate-300">—</span>;
    }
  }
}

// ── Botón de barra de herramientas (calcado de ToolBtn en ClientList) ──────
function ToolBtn({ icon: Icon, label, onClick, disabled, danger, primary }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] border ${
        disabled
          ? "text-slate-300 cursor-not-allowed bg-white border-slate-100"
          : primary
            ? "bg-red-600 text-white hover:bg-red-700 border-red-600 shadow-sm shadow-red-200"
            : danger
              ? "text-red-600 bg-white hover:bg-red-50 border-red-200"
              : "text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 border-slate-200"
      }`}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Th({ label, sortKey, active, dir, onSort, className }: {
  label: string; sortKey?: SortKey; active?: boolean; dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void; className?: string;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap ${sortKey ? "cursor-pointer hover:text-slate-600" : ""} ${className || ""}`}
      onClick={() => sortKey && onSort?.(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey && (
          <span className={active ? "text-red-500" : "text-slate-200"}>
            {active && dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
      </span>
    </th>
  );
}

function PaginationBar({ currentPage, totalPages, onPageChange, totalItems, pageSize }: {
  currentPage: number; totalPages: number; onPageChange: (page: number) => void;
  totalItems: number; pageSize: number;
}) {
  if (totalPages <= 1) return null;
  const pageSet = new Set<number>([1, totalPages]);
  for (let p = currentPage - 1; p <= currentPage + 1; p++) if (p > 1 && p < totalPages) pageSet.add(p);
  const sorted = [...pageSet].sort((a, b) => a - b);
  const items: (number | "...")[] = [];
  let prev = 0;
  for (const p of sorted) { if (prev && p - prev > 1) items.push("..."); items.push(p); prev = p; }
  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-100 bg-white text-xs shrink-0">
      <span className="text-slate-400">{from}–{to} de {totalItems}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors">
          <ChevronLeft size={13} />
        </button>
        {items.map((p, i) => p === "..." ? (
          <span key={`e-${i}`} className="w-7 h-7 flex items-center justify-center text-slate-300 select-none">…</span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold transition-colors ${p === currentPage ? "bg-red-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors">
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

export default function DirectorioProfesionales({ tipo, title, singular, desc }: {
  tipo: "PROCURADOR" | "ABOGADO";
  title: string;
  singular: string;
  desc: string;
}) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const base = tipo === "PROCURADOR" ? "procuradores" : "abogados";
  const Icon = tipo === "PROCURADOR" ? Scale : Gavel;
  const storageKey = `directorio-${base}-visible-columns`;

  const columnsForTipo = useMemo(
    () => ALL_COLUMNS.filter(c => !c.tipoOnly || c.tipoOnly === tipo),
    [tipo]
  );

  const [items, setItems]       = useState<Profesional[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("nombre");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Profesional | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<ColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ColumnKey[];
        const valid = new Set(columnsForTipo.map(c => c.key));
        const filtered = parsed.filter(k => valid.has(k));
        if (filtered.length) return filtered;
      }
    } catch {}
    return DEFAULT_VISIBLE.filter(k => columnsForTipo.some(c => c.key === k));
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleKeys));
  }, [visibleKeys, storageKey]);

  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const availableColumnItems = useMemo(
    () => columnsForTipo.filter(c => !visibleSet.has(c.key)).map(c => ({ key: c.key, label: c.label })),
    [columnsForTipo, visibleSet]
  );
  const visibleColumnItems = useMemo(
    () => columnsForTipo.filter(c => visibleSet.has(c.key)).map(c => ({ key: c.key, label: c.label })),
    [columnsForTipo, visibleSet]
  );
  const orderedVisibleColumns = useMemo(
    () => columnsForTipo.filter(c => visibleSet.has(c.key)),
    [columnsForTipo, visibleSet]
  );

  const load = useCallback(async (q = "", spin = false) => {
    if (spin) setRefreshSpin(true); else setLoading(true);
    setError("");
    try {
      const token = await getToken({ skipCache: true });
      const params = new URLSearchParams({ tipo });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/directorio?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setItems(d.data || []);
    } catch (e: any) {
      setError(e.message || "Error al cargar el directorio");
    } finally {
      setLoading(false);
      setRefreshSpin(false);
    }
  }, [getToken, tipo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { load(search); setCurrentPage(1); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleRefresh = () => load(search, true);
  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = sortKey === "nombre" ? `${a.first_name} ${a.last_name || ""}` : (a.colegio || "");
      const bv = sortKey === "nombre" ? `${b.first_name} ${b.last_name || ""}` : (b.colegio || "");
      return sortDir === "asc" ? av.localeCompare(bv, "es") : bv.localeCompare(av, "es");
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(1); }, [totalPages, currentPage]);
  const paged = useMemo(() => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [sorted, currentPage]);

  const selectedItem = items.find(i => i.id === selected) || null;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/directorio/${deleteTarget.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
      setSelected(prev => prev === deleteTarget.id ? null : prev);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const initials = (p: Profesional) => ((p.first_name || "?")[0] || "?").toUpperCase();
  const turnoOficioCount = tipo === "ABOGADO" ? items.filter(i => i.turno_oficio).length : 0;

  if (loading) return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <Spinner size="xl" label={`Cargando ${desc}...`} />
    </div>
  );

  if (error) return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-10">
      <ConnectionErrorBanner error={error} onRetry={() => load(search)} title={`No se han podido cargar los ${desc}`} />
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden animate-page-in">

      {/* ── CABECERA ─────────────────────────────────────────── */}
      <div className="px-6 lg:px-8 py-5 border-b border-slate-200 bg-white flex-shrink-0 z-10 animate-card-in">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 border border-red-100">
              <Icon size={18} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">{title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-semibold text-slate-700">{items.length}</span> {desc}
                {tipo === "ABOGADO" && (
                  <> {" · "}<span className="font-semibold text-emerald-600">{turnoOficioCount}</span> en turno de oficio</>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            title="Refrescar datos"
            className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all"
          >
            <RefreshCw size={14} className={refreshSpin ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── BARRA DE HERRAMIENTAS ───────────────────────────────── */}
      <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0 z-10 overflow-x-auto animate-card-in-1">
        <div className="flex items-center gap-1.5 min-w-max pb-0.5">
          <ToolBtn icon={Plus} label="Nuevo" primary onClick={() => navigate(`/dashboard/${base}/new`)} />
          <ToolBtn icon={Edit3} label="Editar" disabled={!selected} onClick={() => selected && navigate(`/dashboard/${base}/${selected}/edit`)} />
          <ToolBtn icon={Trash2} label="Eliminar" danger disabled={!selected} onClick={() => selectedItem && setDeleteTarget(selectedItem)} />
        </div>
        <ToolBtn icon={SlidersHorizontal} label="Elegir columnas" onClick={() => setShowColumnModal(true)} />
      </div>

      {/* ── FILTROS / BÚSQUEDA ──────────────────────────────────── */}
      <div className="px-6 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-3 flex-shrink-0 z-10">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-56 pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 placeholder:text-slate-300"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X size={11} />
            </button>
          )}
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {items.length} {items.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {/* ── TABLA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left text-sm min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
            <tr>
              {orderedVisibleColumns.map(col => (
                col.key === "name" ? (
                  <Th key={col.key} label={col.label} sortKey="nombre" active={sortKey === "nombre"} dir={sortDir} onSort={handleSort} />
                ) : col.key === "colegio" ? (
                  <Th key={col.key} label={col.label} sortKey="colegio" active={sortKey === "colegio"} dir={sortDir} onSort={handleSort} />
                ) : (
                  <Th key={col.key} label={col.label} />
                )
              ))}
              <th className="px-3 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={orderedVisibleColumns.length + 1} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Icon size={36} className="opacity-15" />
                    <p className="font-medium text-sm">
                      {search ? "No hay registros que coincidan con la búsqueda" : "No hay registros todavía"}
                    </p>
                    {!search && (
                      <button onClick={() => navigate(`/dashboard/${base}/new`)} className="text-red-600 text-xs font-bold hover:underline">
                        + Crear el primer {singular.toLowerCase()}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : paged.map((p, rowIdx) => {
              const isSelected = selected === p.id;
              return (
                <tr
                  key={p.id}
                  onClick={() => setSelected(isSelected ? null : p.id)}
                  onDoubleClick={() => navigate(`/dashboard/${base}/${p.id}/edit`)}
                  className={`border-b border-slate-50 cursor-pointer transition-colors group${rowIdx < 12 ? " anim-fade-up" : ""} ${
                    isSelected ? "bg-red-50 border-l-2 border-l-red-500" : "hover:bg-slate-50/80"
                  }`}
                  style={rowIdx < 12 ? { animationDelay: `${rowIdx * 35}ms` } : undefined}
                >
                  {orderedVisibleColumns.map(col => (
                    col.key === "name" ? (
                      <td key={col.key} className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? "bg-red-200 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                            {initials(p)}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold leading-tight truncate ${isSelected ? "text-red-700" : "text-slate-800"}`}>{p.first_name} {p.last_name || ""}</p>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <td key={col.key} className="px-3 py-3 text-slate-500 truncate max-w-[220px]">
                        {cellValue(p, col.key)}
                      </td>
                    )
                  ))}
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/dashboard/${base}/${p.id}/edit`); }}
                      className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex opacity-0 group-hover:opacity-100"
                      title="Abrir ficha"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationBar currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={sorted.length} pageSize={PAGE_SIZE} />

      {/* ── BARRA DE ESTADO INFERIOR ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 shrink-0 overflow-x-auto">
        <span className="whitespace-nowrap">
          <span className="font-semibold text-slate-700">{title}:</span>{" "}
          <span className="font-mono">{items.length.toLocaleString("es-ES")}</span>
        </span>
        {tipo === "ABOGADO" && (
          <span className="whitespace-nowrap">
            <span className="font-semibold text-emerald-600">Turno de oficio:</span>{" "}
            <span className="font-mono">{turnoOficioCount.toLocaleString("es-ES")}</span>
          </span>
        )}
        <span className="ml-auto text-slate-300 whitespace-nowrap hidden lg:inline">
          Doble clic para editar · Ctrl+F para buscar
        </span>
      </div>

      <ColumnVisibilityModal
        open={showColumnModal}
        title={`Columnas de ${title}`}
        sourceLabel="Disponibles"
        targetLabel="Visibles"
        availableItems={availableColumnItems}
        visibleItems={visibleColumnItems}
        onMoveToVisible={(keys) => setVisibleKeys(prev => [...prev, ...keys.filter(k => !prev.includes(k as ColumnKey)) as ColumnKey[]])}
        onMoveToAvailable={(keys) => setVisibleKeys(prev => prev.filter(k => !keys.includes(k)))}
        onMoveAllToVisible={() => setVisibleKeys(columnsForTipo.map(c => c.key))}
        onMoveAllToAvailable={() => setVisibleKeys([])}
        onClose={() => setShowColumnModal(false)}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm px-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">¿Eliminar {singular.toLowerCase()}?</h3>
            <p className="text-sm text-slate-500 mt-1.5">
              Se eliminará <strong>{deleteTarget.first_name} {deleteTarget.last_name || ""}</strong> del directorio. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting && <Loader2 size={13} className="animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
