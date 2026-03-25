import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, Plus, Edit3, Loader2, AlertCircle, RefreshCw,
  X, Printer, ChevronUp, ChevronDown, ChevronDown as ChevronDownSmall,
  UserMinus, FileSpreadsheet, ExternalLink, ListFilter,
  AlignJustify, LayoutList, ListChecks,
  MapPin, Phone, Mail,
  CheckSquare, Square,
  MessageCircle, PenLine, Zap, Activity, ClipboardList, Briefcase,
  Paperclip, BarChart2, MoreHorizontal, AlertTriangle,
  Star, Palette, Copy, GitMerge, CreditCard, MessageSquare,
  RotateCcw, Bell, ArrowRight, Settings, Trash2,
  ChevronRight, Bug, History, TrendingUp, Pencil, Smartphone,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { AtajosButton } from "../components/AtajosSystem";
import AdjuntosModal from "../components/AdjuntosModal";

// ── Helpers ───────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  Alta:       "bg-emerald-100 text-emerald-700",
  Baja:       "bg-red-100    text-red-700",
  Suspendido: "bg-amber-100  text-amber-700",
  Potencial:  "bg-blue-100   text-blue-700",
};
const lopdColor: Record<string, string> = {
  Firmada:    "bg-emerald-50 text-emerald-600",
  Pendiente:  "bg-amber-50   text-amber-600",
  "No aplica":"bg-slate-50   text-slate-500",
};
const tipoColor: Record<string, string> = {
  CLIENTE:   "text-slate-700",
  CONTRARIO: "text-red-600",
  JUZGADO:   "text-blue-600",
  PERITO:    "text-purple-600",
  PROVEEDOR: "text-amber-600",
};
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type SortKey = "internal_number" | "first_name" | "nif_cif" | "phone_mobile" | "phone_1" | "email" | "type" | "lopd" | "date_alta" | "client_status";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "detail" | "multiselect";

// ── Campos de filtro disponibles ──────────────────────────────
const FILTER_FIELDS = [
  { value: "any",          label: "Cualquier criterio" },
  { value: "first_name",   label: "Nombre y Apellidos" },
  { value: "internal_number", label: "Número" },
  { value: "nif_cif",      label: "NIF/CIF" },
  { value: "phones",       label: "Todos los teléfonos" },
  { value: "email",        label: "Correo electrónico" },
  { value: "type",         label: "Tipo Cliente" },
  { value: "lopd",         label: "LOPD" },
  { value: "client_status",label: "Estado" },
  { value: "address_town", label: "Población" },
];

interface ActiveFilter { id: number; field: string; value: string; }
let nextId = 1;

// ── Función de filtrado por campo ─────────────────────────────
function matchesFilter(c: any, field: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  switch (field) {
    case "any":
      return (
        `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().includes(v) ||
        (c.nif_cif          || "").toLowerCase().includes(v) ||
        (c.email            || "").toLowerCase().includes(v) ||
        (c.phone_1          || "").includes(v) ||
        (c.phone_mobile     || "").includes(v) ||
        (c.commercial_name  || "").toLowerCase().includes(v) ||
        String(c.internal_number || "").includes(v) ||
        (c.address_town     || "").toLowerCase().includes(v)
      );
    case "first_name":
      return `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().includes(v);
    case "internal_number":
      return String(c.internal_number || "").includes(v);
    case "nif_cif":
      return (c.nif_cif || "").toLowerCase().includes(v);
    case "phones":
      return (c.phone_1 || "").includes(v) || (c.phone_mobile || "").includes(v);
    case "email":
      return (c.email || "").toLowerCase().includes(v);
    case "type":
      return (c.type || "").toLowerCase().includes(v);
    case "lopd":
      return (c.lopd || "").toLowerCase().includes(v);
    case "client_status":
      return (c.client_status || "").toLowerCase().includes(v);
    case "address_town":
      return (c.address_town || "").toLowerCase().includes(v);
    default:
      return true;
  }
}

// ── Botón simple de la barra de herramientas ─────────────────
function ToolBtn({
  icon: Icon, label, onClick, disabled = false, primary = false, danger = false,
}: {
  icon: any; label: string; onClick?: () => void; disabled?: boolean; primary?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95
        ${disabled
          ? "text-slate-300 cursor-not-allowed"
          : primary
            ? "bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-200"
            : danger
              ? "text-red-600 hover:bg-red-50 border border-red-200"
              : "text-slate-600 hover:bg-slate-100 border border-slate-200"
        }
      `}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Botón con dropdown (posición fixed para evitar overflow clip) ──
function DropdownBtn({
  icon: Icon, label, items, disabled = false,
}: {
  icon: any; label: string; disabled?: boolean;
  items: { label: string; icon?: any; onClick: () => void; divider?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cierra al hacer scroll
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={disabled}
        title={label}
        className={`
          flex items-center gap-0 rounded-lg text-xs font-semibold transition-all active:scale-95 border overflow-hidden
          ${disabled ? "text-slate-300 cursor-not-allowed border-slate-100" : "text-slate-600 hover:bg-slate-100 border-slate-200"}
        `}
      >
        <span className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Icon size={13} />
          <span className="hidden sm:inline">{label}</span>
        </span>
        <span className={`px-1 py-1.5 border-l ${disabled ? "border-slate-100" : "border-slate-200 hover:bg-slate-200"}`}>
          <ChevronDownSmall size={10} />
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 220) }}
          className="z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl shadow-slate-300/40 py-1 max-h-[70vh] overflow-y-auto"
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="h-px bg-slate-100 my-1" />
            ) : (
              <button
                key={i}
                onClick={() => { item.onClick(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
              >
                {item.icon && <item.icon size={12} className="shrink-0 text-slate-400" />}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}

// ── Modal de confirmación ─────────────────────────────────────
function ConfirmModal({
  title, message, confirmLabel = "Confirmar", danger = false,
  onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-xl shrink-0 ${danger ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertTriangle size={18} className={danger ? "text-red-600" : "text-amber-600"} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 ${danger ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-500 text-white hover:bg-amber-600"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cabecera de columna ordenable ─────────────────────────────
function Th({
  label, sortKey, currentSort, currentDir, onSort, className = "",
}: {
  label: string; sortKey?: SortKey; currentSort: SortKey; currentDir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey && currentSort === sortKey;
  return (
    <th
      className={`px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap ${sortKey ? "cursor-pointer hover:text-slate-600" : ""} ${className}`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey && (
          <span className={`${active ? "text-red-500" : "text-slate-200"}`}>
            {active && currentDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
      </span>
    </th>
  );
}

// ── Fila de filtro individual ─────────────────────────────────
function FilterRow({
  filter, onChange, onRemove, canRemove, inputRef,
}: {
  filter: ActiveFilter;
  onChange: (id: number, patch: Partial<ActiveFilter>) => void;
  onRemove: (id: number) => void;
  canRemove: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Selector de campo */}
      <select
        value={filter.field}
        onChange={e => onChange(filter.id, { field: e.target.value, value: "" })}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-red-400 text-slate-600 min-w-[160px]"
      >
        {FILTER_FIELDS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Input de valor */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={filter.value}
          onChange={e => onChange(filter.id, { value: e.target.value })}
          placeholder={filter.field === "any" ? "Buscar…" : `Filtrar por ${FILTER_FIELDS.find(f => f.value === filter.field)?.label ?? ""}…`}
          className="w-44 pl-2.5 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 placeholder:text-slate-300"
        />
        {filter.value && (
          <button
            onClick={() => onChange(filter.id, { value: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Botón quitar esta fila */}
      {canRemove && (
        <button
          onClick={() => onRemove(filter.id)}
          title="Quitar este filtro"
          className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors text-xs font-bold"
        >
          −
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function ClientList() {
  const { getToken } = useAuth();
  const navigate     = useNavigate();

  const [clients,   setClients]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [viewMode,  setViewMode]  = useState<ViewMode>("list");
  const [expandedId, setExpandedId] = useState<string | null>(null);         // vista detalle
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());    // vista multiselect
  const [showSelectionDropdown, setShowSelectionDropdown] = useState(false); // dropdown lista seleccionados
  const [showOpciones, setShowOpciones] = useState(false);
  const opcionesRef = useRef<HTMLDivElement>(null);
  const [showAdjuntos, setShowAdjuntos] = useState(false);

  // Cerrar Opciones al clicar fuera
  React.useEffect(() => {
    function outside(e: MouseEvent) {
      if (opcionesRef.current && !opcionesRef.current.contains(e.target as Node)) setShowOpciones(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  const [refreshSpin, setRefreshSpin] = useState(false);                     // animación refresco
  const [bajaConfirm, setBajaConfirm] = useState(false);                     // modal confirmar baja
  const [bajaLoading, setBajaLoading] = useState(false);                     // spinner baja

  // Sistema de filtros multicriteria
  const [filters, setFilters] = useState<ActiveFilter[]>([
    { id: nextId++, field: "any", value: "" },
  ]);

  // Ordenación
  const [sortKey, setSortKey] = useState<SortKey>("internal_number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Ref del primer input (para Ctrl+F)
  const firstInputRef = useRef<HTMLInputElement>(null);

  // ── Operaciones sobre filtros ───────────────────────────────
  const addFilter = () =>
    setFilters(prev => [...prev, { id: nextId++, field: "any", value: "" }]);

  const removeFilter = (id: number) =>
    setFilters(prev => prev.filter(f => f.id !== id));

  const updateFilter = (id: number, patch: Partial<ActiveFilter>) =>
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  const clearAllFilters = () =>
    setFilters([{ id: nextId++, field: "any", value: "" }]);

  const hasActiveFilters = filters.some(f => f.value.trim() !== "");

  // ── Carga de datos ──────────────────────────────────────────
  const fetchClients = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const token = await getToken({ skipCache: true });
      const res   = await fetch("/api/entities", { headers: { Authorization: `Bearer ${token}` } });
      const result = await safeJson(res);
      if (res.ok) setClients(result.data || []);
      else throw new Error(result.error || "Error al obtener clientes");
    } catch (err: any) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useAutoRefresh(() => fetchClients(true), { intervalMs: 30_000 });

  // ── Filtrado + ordenación (memoizado) ──────────────────────
  const filtered = useMemo(() => {
    let rows = clients.filter(c =>
      // Todos los filtros activos deben cumplirse (AND)
      filters.every(f => matchesFilter(c, f.field, f.value))
    );

    rows = [...rows].sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      if (sortKey === "internal_number") { va = Number(va) || 0; vb = Number(vb) || 0; }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
    return rows;
  }, [clients, filters, sortKey, sortDir]);

  // ── Estadísticas barra inferior ────────────────────────────
  const stats = useMemo(() => {
    const total   = clients.length;
    const activos = clients.filter(c => c.client_status === "Alta").length;
    const bajas   = clients.filter(c => c.client_status === "Baja").length;
    const pctBaja = total > 0 ? ((bajas / total) * 100).toFixed(2) : "0,00";
    return { total, activos, bajas, pctBaja };
  }, [clients]);

  // ── Ordenación ─────────────────────────────────────────────
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  // ── Acciones toolbar ───────────────────────────────────────
  const selectedClient = useMemo(() => clients.find(c => c.id === selected), [clients, selected]);

  // ── Cambio de vista ────────────────────────────────────────
  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    setExpandedId(null);
    setSelectedIds(new Set());
    setSelected(null);
  };

  // ── Refresco manual con animación ──────────────────────────
  const handleRefresh = async () => {
    setRefreshSpin(true);
    await fetchClients(false);
    setTimeout(() => setRefreshSpin(false), 600);
  };

  // ── Dar de baja = eliminar cliente ─────────────────────────
  const handleBaja = async () => {
    if (!selected) return;
    setBajaLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/entities/${selected}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await safeJson(res);
      if (res.ok) {
        setClients(prev => prev.filter(c => c.id !== selected));
        setBajaConfirm(false);
        setSelected(null);
      } else {
        alert(result.error || "Error al eliminar el cliente");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBajaLoading(false);
    }
  };

  // ── Dar de alta (reactivar) ─────────────────────────────────
  const handleAlta = async () => {
    if (!selected) return;
    try {
      const token = await getToken({ skipCache: true });
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/entities/${selected}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ client_status: "Alta", date_alta: today, date_baja: "" }),
      });
      const result = await safeJson(res);
      if (res.ok) {
        setClients(prev => prev.map(c => c.id === selected ? { ...c, ...result.data } : c));
      } else {
        alert(result.error || "Error al reactivar");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ── Helpers multiselect ────────────────────────────────────
  const toggleId = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(prev =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map(c => c.id))
    );

  const allChecked   = filtered.length > 0 && selectedIds.size === filtered.length;
  const someChecked  = selectedIds.size > 0 && !allChecked;

  const exportSelectedCSV = () => {
    const rows = filtered.filter(c => selectedIds.has(c.id));
    const headers = ["Nº","Nombre","NIF/CIF","Móvil","Teléfono","Email","Tipo","LOPD","Fecha Alta","Estado"];
    const data = rows.map(c => [
      c.internal_number ?? "", `${c.first_name||""} ${c.last_name||""}`.trim(),
      c.nif_cif ?? "", c.phone_mobile ?? "", c.phone_1 ?? "",
      c.email ?? "", c.type ?? "", c.lopd ?? "",
      fmtDate(c.date_alta ?? c.created_at), c.client_status ?? "",
    ]);
    const csv = [headers, ...data].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv);
    a.download = `clientes_seleccionados_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const exportCSV = () => {
    const headers = ["Nº", "Nombre", "NIF/CIF", "Móvil", "Teléfono", "Email", "Tipo", "LOPD", "Fecha Alta", "Estado"];
    const rows = filtered.map(c => [
      c.internal_number ?? "",
      `${c.first_name || ""} ${c.last_name || ""}`.trim(),
      c.nif_cif ?? "", c.phone_mobile ?? "", c.phone_1 ?? "",
      c.email ?? "", c.type ?? "", c.lopd ?? "",
      fmtDate(c.date_alta ?? c.created_at), c.client_status ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv);
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Duplicar cliente ───────────────────────────────────────
  const handleDuplicar = async () => {
    if (!selected || !selectedClient) return;
    try {
      const token = await getToken({ skipCache: true });
      const { id, internal_number, created_at, updated_at, ...rest } = selectedClient;
      const body = { ...rest, first_name: `${rest.first_name} (copia)`, nif_cif: "" };
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const result = await safeJson(res);
      if (res.ok) {
        await fetchClients(true);
        setSelected(result.data?.id ?? null);
      } else {
        alert(result.error || "Error al duplicar");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ── Enviar SMS ──────────────────────────────────────────────
  const handleSMS = () => {
    const tel = selectedClient?.phone_mobile || selectedClient?.phone_1 || "";
    if (tel) window.open(`sms:${tel}`);
  };

  // ── Teclado ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selected) navigate(`/dashboard/clientes/${selected}`);
      if (e.key === "Escape") setSelected(null);
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        firstInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, navigate]);

  // ── Render: carga ──────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm font-medium animate-pulse">Cargando clientes...</p>
    </div>
  );

  // ── Render: error ──────────────────────────────────────────
  if (error) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
        <Users className="text-red-600" /> Gestión de Clientes
      </h1>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle size={20} className="shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm">Error de conexión con el backend</p>
          <p className="text-xs mt-0.5 font-mono">{error}</p>
        </div>
        <button onClick={() => fetchClients()} className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    </div>
  );

  // ── Render principal ───────────────────────────────────────
  return (
    <>
    {/* ── Modal Adjuntos ──────────────────────────────────── */}
    {showAdjuntos && selected && (
      <AdjuntosModal
        entityId={selected}
        entityName={selectedClient ? `${selectedClient.first_name || ""} ${selectedClient.last_name || ""}`.trim() : "Cliente"}
        onClose={() => setShowAdjuntos(false)}
      />
    )}

    {/* ── Modal confirmación baja ───────────────────────────── */}
    {bajaConfirm && selectedClient && (
      <ConfirmModal
        title={`Eliminar a ${selectedClient.first_name} ${selectedClient.last_name}`}
        message={`Se borrará el cliente de la base de datos de forma permanente. Esta acción no se puede deshacer.`}
        confirmLabel={bajaLoading ? "Eliminando…" : "Eliminar cliente"}
        danger
        onConfirm={handleBaja}
        onCancel={() => setBajaConfirm(false)}
      />
    )}
    <div className="flex flex-col gap-0 animate-in fade-in duration-300" style={{ height: "calc(100vh - 96px)" }}>

      {/* ── CABECERA ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Users size={20} className="text-red-600" /> Gestión de Clientes
        </h1>
        <button
          onClick={() => fetchClients(true)}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">

        {/* ── BARRA DE ACCIONES ────────────────────────────────── */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex-wrap">

          {/* ─ Alta ─ */}
          <Link to="/dashboard/clientes/new">
            <ToolBtn icon={Plus} label="Alta" primary />
          </Link>

          {/* ─ Baja (eliminar) ─ */}
          <ToolBtn
            icon={UserMinus} label="Baja"
            disabled={!selected}
            danger
            onClick={() => setBajaConfirm(true)}
          />

          {/* ─ Modificar ─ */}
          <ToolBtn
            icon={Edit3} label="Modificar"
            disabled={!selected}
            onClick={() => selected && navigate(`/dashboard/clientes/${selected}/edit`)}
          />

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* ─ Enviar Correo ─ */}
          <DropdownBtn
            icon={Mail} label="Enviar Correo"
            disabled={!selected}
            items={[
              {
                label: "Nuevo",
                icon: Mail,
                onClick: () => selectedClient?.email && window.open(`mailto:${selectedClient.email}`),
              },
              {
                label: "Con Plantilla",
                icon: FileSpreadsheet,
                onClick: () => selectedClient?.email && window.open(`mailto:${selectedClient.email}`),
              },
              { divider: true, label: "", onClick: () => {} },
              {
                label: "Con Adjuntos",
                icon: Paperclip,
                onClick: () => selectedClient?.email && window.open(`mailto:${selectedClient.email}`),
              },
              {
                label: "Correo Corporativo",
                icon: ExternalLink,
                onClick: () => selectedClient?.email && window.open(`https://mail.google.com/mail/?view=cm&to=${selectedClient.email}`),
              },
              {
                label: "Mensaje Interno",
                icon: MessageSquare,
                onClick: () => selected && navigate(`/dashboard/clientes/${selected}#notas`),
              },
              {
                label: "MN Sign",
                icon: PenLine,
                onClick: () => selected && navigate(`/dashboard/clientes/${selected}#firma`),
              },
            ]}
          />

          {/* ─ Enviar WhatsApp ─ */}
          <DropdownBtn
            icon={MessageCircle} label="Enviar WhatsApp"
            disabled={!selected}
            items={[
              {
                label: "Nuevo",
                icon: MessageCircle,
                onClick: () => {
                  const tel = (selectedClient?.phone_mobile || selectedClient?.phone_1 || "").replace(/\D/g, "");
                  window.open(`https://wa.me/34${tel}`);
                },
              },
              {
                label: "Con Plantilla",
                icon: FileSpreadsheet,
                onClick: () => {
                  const tel = (selectedClient?.phone_mobile || selectedClient?.phone_1 || "").replace(/\D/g, "");
                  window.open(`https://wa.me/34${tel}`);
                },
              },
              {
                label: "Programar WhatsApp",
                icon: Bell,
                onClick: () => {},
              },
              {
                label: "MN Sign",
                icon: PenLine,
                onClick: () => selected && navigate(`/dashboard/clientes/${selected}#firma`),
              },
              {
                label: "Ver Conversación",
                icon: ExternalLink,
                onClick: () => {
                  const tel = (selectedClient?.phone_mobile || selectedClient?.phone_1 || "").replace(/\D/g, "");
                  window.open(`https://web.whatsapp.com/send?phone=34${tel}`);
                },
              },
            ]}
          />

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* ─ MN Sign ─ */}
          <ToolBtn
            icon={PenLine} label="MN Sign"
            disabled={!selected}
            onClick={() => selected && navigate(`/dashboard/clientes/${selected}#firma`)}
          />

          {/* ─ Atajos ─ */}
          <DropdownBtn
            icon={Zap} label="Atajos"
            items={[
              { label: "Propuesta Colaboración Asociaciones", icon: ArrowRight,    onClick: () => {} },
              { label: "LOPD",                               icon: ArrowRight,    onClick: () => {} },
              { label: "Domiciliación Bancaria",             icon: ArrowRight,    onClick: () => {} },
              { label: "Informes",                           icon: ArrowRight,    onClick: () => {} },
              { label: "Consentimientos",                    icon: ArrowRight,    onClick: () => {} },
              { divider: true, label: "", onClick: () => {} },
              { label: "Correo microcréditos Javier",        icon: Mail,          onClick: () => selectedClient?.email && window.open(`mailto:${selectedClient.email}`) },
              { label: "Formulario COVID",                   icon: FileSpreadsheet, onClick: () => {} },
              { label: "Firma LOPD Correo",                  icon: Mail,          onClick: () => selectedClient?.email && window.open(`mailto:${selectedClient.email}`) },
              { label: "Valoración",                         icon: Mail,          onClick: () => {} },
              { label: "Formulario Registro Cliente + LOPD", icon: Mail,          onClick: () => {} },
              { label: "Formulario Actualización Datos cliente", icon: Mail,      onClick: () => {} },
              { label: "Firma LOPD",                         icon: Mail,          onClick: () => {} },
              { label: "Imprimir LOPD",                      icon: Printer,       onClick: () => {} },
              { label: "Firma Consentimiento Grabación de Imágenes", icon: Mail,  onClick: () => {} },
              { label: "Firma Domiciliación Bancaria",       icon: Mail,          onClick: () => {} },
              { label: "Solicitar Valoración",               icon: Mail,          onClick: () => {} },
              { label: "Registro en Acceso Clientes",        icon: Mail,          onClick: () => {} },
              { label: "Imprimir Presupuesto",               icon: Printer,       onClick: () => {} },
              { divider: true, label: "", onClick: () => {} },
              { label: "<Añadir nuevo>",                     icon: Plus,          onClick: () => {} },
              { label: "<Configurar Atajos>",                icon: Settings,      onClick: () => {} },
            ]}
          />

          {/* ─ Actuación ─ */}
          <DropdownBtn
            icon={Activity} label="Actuación"
            disabled={!selected}
            items={[
              { label: "Nueva actuación",       icon: Activity,  onClick: () => selected && navigate(`/dashboard/clientes/${selected}#notas`) },
              { label: "Ver historial",          icon: ClipboardList, onClick: () => selected && navigate(`/dashboard/clientes/${selected}`) },
              { divider: true, label: "", onClick: () => {} },
              { label: "Reactivar cliente (Alta)", icon: Plus,   onClick: handleAlta },
            ]}
          />

          {/* ─ Crear Obligaciones ─ */}
          <ToolBtn
            icon={ClipboardList} label="Crear Obligaciones"
            disabled={!selected}
            onClick={() => selected && navigate(`/dashboard/clientes/${selected}#obligaciones`)}
          />

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* ─ Adjuntos ─ */}
          <ToolBtn
            icon={Paperclip} label="Adjuntos"
            disabled={!selected}
            onClick={() => selected && setShowAdjuntos(true)}
          />

          {/* ─ Imprimir ─ */}
          <DropdownBtn
            icon={Printer} label="Imprimir"
            items={[
              { label: "Imprimir listado",      icon: Printer, onClick: () => window.print() },
              { label: "Imprimir ficha seleccionada", icon: Printer,
                onClick: () => selected && navigate(`/dashboard/clientes/${selected}`) },
            ]}
          />

          {/* ─ Excel ─ */}
          <ToolBtn icon={FileSpreadsheet} label="Excel" onClick={exportCSV} />

          {/* ─ Informes/Dashboard ─ */}
          <ToolBtn
            icon={BarChart2} label="Informes"
            onClick={() => navigate("/dashboard")}
          />

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* ─ Atajos ─ */}
          <AtajosButton modulo="Clientes" />

          {/* ─ Opciones ─ */}
          <div className="relative" ref={opcionesRef}>
            <button
              onClick={() => setShowOpciones(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${showOpciones ? "bg-red-50 border-red-300 text-red-700" : "text-slate-600 hover:bg-slate-100 border-slate-200"}`}>
              <MoreHorizontal size={13} /> Opciones <ChevronDown size={10} />
            </button>
            {showOpciones && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[230px] py-1.5">

                {/* Grupo 1 */}
                <button onClick={() => { exportCSV(); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <FileSpreadsheet size={12} className="text-slate-400" /> Excel
                </button>
                <button onClick={() => { selected && setBajaConfirm(true); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <UserMinus size={12} className="text-slate-400" /> Baja
                </button>
                <button onClick={() => { selected && selectedClient && navigate(`/dashboard/clientes/${selected}/edit`); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Pencil size={12} className="text-slate-400" /> Modificar
                </button>
                <button onClick={() => { alert("Seleccionar opciones favoritas"); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Star size={12} className="text-slate-400" /> Seleccionar Opciones Favoritas
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Ir a → submenú */}
                <div className="relative group/ira">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5"><ExternalLink size={12} className="text-slate-400" /> Ir a</span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/ira:block">
                    <button onClick={() => { selected && navigate(`/dashboard/clientes/${selected}`); setShowOpciones(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Users size={12} className="text-slate-400" /> Ir a Ficha Cliente
                    </button>
                    <button onClick={() => { selected && navigate(`/dashboard/clientes/${selected}#expedientes`); setShowOpciones(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <ClipboardList size={12} className="text-slate-400" /> Ir a Expedientes
                    </button>
                    <button onClick={() => { selected && navigate(`/dashboard/clientes/${selected}#notas`); setShowOpciones(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Paperclip size={12} className="text-slate-400" /> Ir a Notas
                    </button>
                  </div>
                </div>

                <button onClick={() => { alert("Asignar color al cliente"); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Palette size={12} className="text-slate-400" /> Asignar Color
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 3 */}
                <button onClick={() => { selected && navigate(`/dashboard/clientes/${selected}#notas`); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Zap size={12} className="text-slate-400" /> Alta Acción
                </button>
                <button onClick={() => { alert("Crear Recall"); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Bell size={12} className="text-slate-400" /> Crear Recall
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 4 */}
                <button onClick={() => { handleDuplicar(); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Copy size={12} className="text-slate-400" /> Duplicar
                </button>
                <button onClick={() => { alert("Fusionar clientes"); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <GitMerge size={12} className="text-slate-400" /> Fusionar
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 5 */}
                <button onClick={() => { handleSMS(); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Smartphone size={12} className="text-slate-400" /> Enviar SMS
                </button>

                {/* Depurar → submenú */}
                <div className="relative group/dep">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5"><Bug size={12} className="text-slate-400" /> Depurar</span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/dep:block">
                    <button onClick={() => console.log("Cliente:", selectedClient)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Bug size={12} className="text-slate-400" /> Ver en consola
                    </button>
                    <button onClick={() => alert(JSON.stringify(selectedClient, null, 2))}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <ClipboardList size={12} className="text-slate-400" /> Mostrar datos crudos
                    </button>
                  </div>
                </div>

                {/* Versión Antigua → submenú */}
                <div className="relative group/ver">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5"><History size={12} className="text-slate-400" /> Versión Antigua</span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/ver:block">
                    <button onClick={() => alert("Ver historial de versiones")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <History size={12} className="text-slate-400" /> Ver historial versiones
                    </button>
                    <button onClick={() => alert("Comparar versión")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <RefreshCw size={12} className="text-slate-400" /> Comparar versión
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 6 */}
                <button onClick={() => { alert("Recalcular intereses"); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <TrendingUp size={12} className="text-slate-400" /> Recalcular Intereses
                </button>
                <button onClick={() => { fetchClients(false); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Activity size={12} className="text-slate-400" /> Recalcular Indicadores
                </button>

              </div>
            )}
          </div>

          {/* ─ Indicador cliente seleccionado ─ */}
          {selectedClient && (
            <div className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-lg shrink-0">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-xs text-red-700 font-medium max-w-[140px] truncate">
                {selectedClient.first_name} {selectedClient.last_name}
              </span>
              <button onClick={() => setSelected(null)} className="text-red-300 hover:text-red-600 transition-colors ml-0.5">
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        {/* ── BARRA DE FILTROS MULTICRITERIA ───────────────────── */}
        <div className="px-4 py-2 border-b border-slate-100 bg-white">
          <div className="flex flex-col gap-1.5">
            {filters.map((filter, idx) => (
              <div key={filter.id} className="flex items-center gap-1.5 flex-wrap">
                <FilterRow
                  filter={filter}
                  onChange={updateFilter}
                  onRemove={removeFilter}
                  canRemove={filters.length > 1}
                  inputRef={idx === 0 ? firstInputRef : undefined}
                />

                {/* Botones + / - solo en la última fila */}
                {idx === filters.length - 1 && (
                  <div className="flex items-center gap-1">
                    {/* Añadir otro filtro */}
                    <button
                      onClick={addFilter}
                      title="Añadir otro filtro"
                      className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm font-bold"
                    >
                      +
                    </button>

                    {/* Quitar último filtro (solo si hay más de uno) */}
                    {filters.length > 1 && (
                      <button
                        onClick={() => removeFilter(filter.id)}
                        title="Quitar este filtro"
                        className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors text-xs font-bold"
                      >
                        −
                      </button>
                    )}

                    {/* Limpiar todos los filtros */}
                    <button
                      onClick={clearAllFilters}
                      title="Quitar todos los filtros"
                      className={`flex items-center justify-center w-6 h-6 rounded-md border transition-colors
                        ${hasActiveFilters || filters.length > 1
                          ? "border-red-300 text-red-500 hover:bg-red-50 hover:border-red-400"
                          : "border-slate-200 text-slate-300 cursor-default"
                        }`}
                    >
                      <ListFilter size={12} />
                    </button>
                  </div>
                )}

                {/* Contador + controles de vista — solo en la última fila */}
                {idx === filters.length - 1 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {filtered.length !== clients.length
                        ? <span className="text-amber-600 font-medium">{filtered.length} de {clients.length}</span>
                        : <>{clients.length} {clients.length === 1 ? "registro" : "registros"}</>
                      }
                    </span>

                    {/* ── Separador ── */}
                    <div className="w-px h-4 bg-slate-200" />

                    {/* ── Controles de vista ── */}
                    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                      {/* Vista lista simple */}
                      <button
                        onClick={() => switchView("list")}
                        title="Vista listado"
                        className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                      >
                        <AlignJustify size={13} />
                      </button>

                      {/* Vista lista + detalle expandible */}
                      <button
                        onClick={() => switchView("detail")}
                        title="Vista listado con detalle"
                        className={`p-1.5 rounded-md transition-all ${viewMode === "detail" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                      >
                        <LayoutList size={13} />
                      </button>

                      {/* Vista multiselección */}
                      <button
                        onClick={() => switchView("multiselect")}
                        title="Selección múltiple"
                        className={`p-1.5 rounded-md transition-all ${viewMode === "multiselect" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                      >
                        <ListChecks size={13} />
                      </button>
                    </div>

                    {/* ── Botón refrescar ── */}
                    <button
                      onClick={handleRefresh}
                      title="Refrescar datos"
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all"
                    >
                      <RefreshCw size={13} className={refreshSpin ? "animate-spin" : ""} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── BARRA MULTISELECT ────────────────────────────────── */}
        {viewMode === "multiselect" && selectedIds.size > 0 && (
          <div className="border-b border-slate-100 text-xs">
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50">
              {/* Badge clickable que muestra/oculta lista */}
              <div className="relative">
                <button
                  onClick={() => setShowSelectionDropdown(v => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-full text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
                >
                  <span>Has seleccionado <strong className="text-slate-700">{selectedIds.size}</strong> elemento{selectedIds.size !== 1 ? "s" : ""}</span>
                  <svg className={`w-3 h-3 transition-transform ${showSelectionDropdown ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4l4 4 4-4"/></svg>
                </button>
                {showSelectionDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[200px] max-h-48 overflow-y-auto py-1">
                    {filtered.filter(c => selectedIds.has(c.id)).map(c => (
                      <div key={c.id} className="px-3 py-1.5 text-slate-600 hover:bg-slate-50 truncate">
                        {c.nombre} {c.apellidos ?? ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={exportSelectedCSV}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                <FileSpreadsheet size={11} /> Exportar seleccionados
              </button>
              <button
                onClick={() => { setSelectedIds(new Set()); setShowSelectionDropdown(false); }}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-600 font-medium"
              >
                <X size={11} /> Limpiar
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            VISTA LISTA — tabla densa compacta
        ══════════════════════════════════════════════════════ */}
        {viewMode === "list" && (
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <Th label="Nº"                 sortKey="internal_number" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="w-14 pl-4" />
                  <Th label="Nombre y Apellidos" sortKey="first_name"      currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <Th label="NIF / CIF"          sortKey="nif_cif"         currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <Th label="Móvil"              sortKey="phone_mobile"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                  <Th label="Teléfono"           sortKey="phone_1"         currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />
                  <Th label="Correo Electrónico" sortKey="email"           currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                  <Th label="Tipo"               sortKey="type"            currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <Th label="LOPD"               sortKey="lopd"            currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />
                  <Th label="Fecha Alta"         sortKey="date_alta"       currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <Th label="Estado"             sortKey="client_status"   currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Actuac.</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Exp.</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Users size={36} className="opacity-15" />
                        <p className="font-medium text-sm">
                          {hasActiveFilters || filters.length > 1
                            ? "No hay registros que coincidan con los filtros"
                            : "No hay registros todavía"
                          }
                        </p>
                        {!hasActiveFilters && filters.length === 1 && (
                          <Link to="/dashboard/clientes/new">
                            <span className="text-red-600 text-xs font-bold hover:underline">+ Crear el primer cliente</span>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((client) => {
                  const isSelected = selected === client.id;
                  return (
                    <tr
                      key={client.id}
                      onClick={() => setSelected(isSelected ? null : client.id)}
                      onDoubleClick={() => navigate(`/dashboard/clientes/${client.id}`)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors group ${isSelected ? "bg-red-50 border-l-2 border-l-red-500" : "hover:bg-slate-50/80"}`}
                    >
                      <td className={`pl-4 pr-3 py-2 font-mono text-slate-400 ${isSelected ? "text-red-400" : ""}`}>{client.internal_number || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          {client.photo_url
                            ? <img src={client.photo_url} alt="" className="h-7 w-7 rounded-lg object-cover shrink-0 border border-slate-100" />
                            : <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${isSelected ? "bg-red-200 text-red-700" : "bg-slate-100 text-slate-500"}`}>{((client.first_name || "?")[0] || "?").toUpperCase()}</div>
                          }
                          <div className="min-w-0">
                            <p className={`font-semibold leading-tight truncate ${isSelected ? "text-red-700" : "text-slate-800"}`}>{client.first_name} {client.last_name}</p>
                            {client.commercial_name && <p className="text-[10px] text-slate-400 truncate leading-tight">{client.commercial_name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">{client.nif_cif || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-500 hidden lg:table-cell">{client.phone_mobile || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-500 hidden xl:table-cell">{client.phone_1 || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-500 hidden lg:table-cell truncate max-w-[160px]">{client.email || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 hidden md:table-cell"><span className={`font-semibold ${tipoColor[client.type] || "text-slate-600"}`}>{client.type || "—"}</span></td>
                      <td className="px-3 py-2 hidden xl:table-cell">
                        {client.lopd ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${lopdColor[client.lopd] || "bg-slate-50 text-slate-500"}`}>{client.lopd}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 hidden md:table-cell whitespace-nowrap">{fmtDate(client.date_alta ?? client.created_at)}</td>
                      <td className="px-3 py-2">
                        {client.client_status ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor[client.client_status] || "bg-slate-100 text-slate-600"}`}>{client.client_status}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell text-center">
                        {(client.total_actuaciones ?? 0) > 0
                          ? <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{client.total_actuaciones}</span>
                          : <span className="text-slate-300 text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell text-center">
                        {(client.total_expedientes ?? 0) > 0
                          ? <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">{client.total_expedientes}</span>
                          : <span className="text-slate-300 text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/dashboard/clientes/${client.id}`} onClick={e => e.stopPropagation()} className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex opacity-0 group-hover:opacity-100" title="Abrir ficha">
                          <ExternalLink size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            VISTA DETALLE — tarjetas horizontales completas
        ══════════════════════════════════════════════════════ */}
        {viewMode === "detail" && (
          <div className="overflow-auto flex-1 p-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                <Users size={36} className="opacity-15" />
                <p className="font-medium text-sm">{hasActiveFilters || filters.length > 1 ? "No hay registros que coincidan con los filtros" : "No hay registros todavía"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((client) => {
                  const isSelected = selected === client.id;
                  return (
                    <div
                      key={client.id}
                      onClick={() => setSelected(isSelected ? null : client.id)}
                      onDoubleClick={() => navigate(`/dashboard/clientes/${client.id}`)}
                      className={`
                        flex items-center gap-4 px-4 py-3 rounded-xl border cursor-pointer transition-all group
                        ${isSelected
                          ? "border-red-300 bg-red-50 shadow-md shadow-red-100"
                          : "border-slate-150 bg-white hover:border-slate-300 hover:shadow-sm"
                        }
                      `}
                    >
                      {/* Avatar grande */}
                      <div className="shrink-0">
                        {client.photo_url
                          ? <img src={client.photo_url} alt="" className="h-11 w-11 rounded-xl object-cover border border-slate-100 shadow-sm" />
                          : (
                            <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-base font-bold shadow-sm
                              ${isSelected ? "bg-gradient-to-br from-red-400 to-red-600 text-white" : "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600"}`}>
                              {((client.first_name || "?")[0] || "?").toUpperCase()}
                            </div>
                          )
                        }
                      </div>

                      {/* Nombre + número */}
                      <div className="w-52 shrink-0">
                        <p className={`font-bold text-sm leading-tight truncate ${isSelected ? "text-red-700" : "text-slate-800"}`}>
                          {client.first_name} {client.last_name}
                        </p>
                        {client.commercial_name && <p className="text-[11px] text-slate-400 truncate">{client.commercial_name}</p>}
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">#{client.internal_number || "—"} · {client.nif_cif || "Sin NIF"}</p>
                      </div>

                      {/* Separador */}
                      <div className="w-px h-10 bg-slate-100 shrink-0 hidden md:block" />

                      {/* Contacto */}
                      <div className="flex-1 min-w-0 hidden md:flex flex-col gap-0.5">
                        {(client.phone_mobile || client.phone_1) && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Phone size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{client.phone_mobile || client.phone_1}</span>
                            {client.phone_mobile && client.phone_1 && <span className="text-slate-300 text-[10px]">· {client.phone_1}</span>}
                          </div>
                        )}
                        {client.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Mail size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{client.email}</span>
                          </div>
                        )}
                        {client.address_town && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{client.address_town}{client.address_province ? `, ${client.address_province}` : ""}</span>
                          </div>
                        )}
                      </div>

                      {/* Separador */}
                      <div className="w-px h-10 bg-slate-100 shrink-0 hidden lg:block" />

                      {/* Badges + fecha + contadores */}
                      <div className="hidden lg:flex flex-col items-end gap-1.5 shrink-0 w-44">
                        <div className="flex items-center gap-1.5">
                          {client.type && <span className={`text-[10px] font-bold ${tipoColor[client.type] || "text-slate-500"}`}>{client.type}</span>}
                          {client.client_status && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor[client.client_status] || "bg-slate-100 text-slate-600"}`}>{client.client_status}</span>}
                        </div>
                        {client.lopd && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${lopdColor[client.lopd] || "bg-slate-50 text-slate-500"}`}>{client.lopd}</span>}
                        <div className="flex items-center gap-2">
                          {(client.total_actuaciones ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold" title="Actuaciones">
                              <Activity size={9} /> {client.total_actuaciones}
                            </span>
                          )}
                          {(client.total_expedientes ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold" title="Expedientes">
                              <Briefcase size={9} /> {client.total_expedientes}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{fmtDate(client.date_alta ?? client.created_at)}</span>
                        </div>
                      </div>

                      {/* Botones acción — aparecen al hover */}
                      <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          to={`/dashboard/clientes/${client.id}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-bold hover:bg-red-700 transition-colors whitespace-nowrap"
                        >
                          <ExternalLink size={11} /> Ver ficha
                        </Link>
                        <Link
                          to={`/dashboard/clientes/${client.id}/edit`}
                          onClick={e => e.stopPropagation()}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={13} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            VISTA MULTISELECT — cuadrícula de tarjetas con checkbox
        ══════════════════════════════════════════════════════ */}
        {viewMode === "multiselect" && (
          <div className="overflow-auto flex-1 p-4">
            {/* Cabecera de selección rápida */}
            <div className="flex items-center gap-3 mb-3 px-1">
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors"
              >
                {allChecked
                  ? <CheckSquare size={15} className="text-red-600" />
                  : someChecked
                    ? <CheckSquare size={15} className="text-slate-400" />
                    : <Square size={15} />
                }
                {allChecked ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
              <span className="text-xs text-slate-400">{filtered.length} registros</span>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                <Users size={36} className="opacity-15" />
                <p className="font-medium text-sm">{hasActiveFilters || filters.length > 1 ? "No hay registros que coincidan con los filtros" : "No hay registros todavía"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filtered.map((client) => {
                  const isChecked = selectedIds.has(client.id);
                  return (
                    <div
                      key={client.id}
                      onClick={() => toggleId(client.id)}
                      className={`
                        relative flex flex-col items-center gap-2 px-3 pt-4 pb-3 rounded-xl border cursor-pointer
                        transition-all select-none group
                        ${isChecked
                          ? "border-red-400 bg-red-50 shadow-md shadow-red-100 scale-[0.98]"
                          : "border-slate-200 bg-white hover:border-red-200 hover:shadow-sm hover:bg-slate-50/60"
                        }
                      `}
                    >
                      {/* Checkbox esquina superior derecha */}
                      <div className={`absolute top-2.5 right-2.5 transition-all ${isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}>
                        {isChecked
                          ? <CheckSquare size={15} className="text-red-600" />
                          : <Square size={15} className="text-slate-400" />
                        }
                      </div>

                      {/* Avatar */}
                      {client.photo_url
                        ? <img src={client.photo_url} alt="" className={`h-12 w-12 rounded-2xl object-cover border-2 transition-all ${isChecked ? "border-red-400 shadow-md shadow-red-200" : "border-slate-100"}`} />
                        : (
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-bold transition-all
                            ${isChecked
                              ? "bg-gradient-to-br from-red-400 to-red-600 text-white shadow-md shadow-red-200"
                              : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500"
                            }`}>
                            {((client.first_name || "?")[0] || "?").toUpperCase()}
                          </div>
                        )
                      }

                      {/* Nombre */}
                      <div className="text-center min-w-0 w-full">
                        <p className={`text-[11px] font-bold leading-tight truncate ${isChecked ? "text-red-700" : "text-slate-800"}`}>
                          {client.first_name}
                        </p>
                        <p className={`text-[10px] leading-tight truncate ${isChecked ? "text-red-500" : "text-slate-500"}`}>
                          {client.last_name}
                        </p>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-col items-center gap-1 w-full">
                        {client.client_status && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold w-full text-center truncate ${statusColor[client.client_status] || "bg-slate-100 text-slate-600"}`}>
                            {client.client_status}
                          </span>
                        )}
                        {client.type && (
                          <span className={`text-[9px] font-semibold truncate ${tipoColor[client.type] || "text-slate-400"}`}>
                            {client.type}
                          </span>
                        )}
                      </div>

                      {/* Actuaciones / Expedientes */}
                      {((client.total_actuaciones ?? 0) > 0 || (client.total_expedientes ?? 0) > 0) && (
                        <div className="flex items-center gap-1.5 justify-center">
                          {(client.total_actuaciones ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[9px] text-blue-600 font-semibold" title="Actuaciones">
                              <Activity size={8} /> {client.total_actuaciones}
                            </span>
                          )}
                          {(client.total_expedientes ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[9px] text-indigo-600 font-semibold" title="Expedientes">
                              <Briefcase size={8} /> {client.total_expedientes}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Nº interno */}
                      <p className="text-[9px] font-mono text-slate-300">#{client.internal_number || "—"}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BARRA DE ESTADO INFERIOR ─────────────────────────── */}
        <div className="flex items-center gap-6 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 shrink-0">
          <span>
            <span className="font-semibold text-slate-700">Núm. Clientes:</span>{" "}
            <span className="font-mono">{stats.total.toLocaleString("es-ES")}</span>
          </span>
          <span>
            <span className="font-semibold text-emerald-600">Total Activos:</span>{" "}
            <span className="font-mono">{stats.activos.toLocaleString("es-ES")}</span>
          </span>
          <span>
            <span className="font-semibold text-red-500">% Bajas:</span>{" "}
            <span className="font-mono">{stats.pctBaja.replace(".", ",")}%</span>
          </span>
          {hasActiveFilters && (
            <span className="text-amber-600 font-medium">
              ↳ Mostrando {filtered.length} de {clients.length} con filtros activos
            </span>
          )}
          <span className="ml-auto text-slate-300">
            Doble clic para abrir · Enter abre seleccionado · Ctrl+F para filtrar
          </span>
        </div>
      </div>
    </div>
    </>
  );
}
