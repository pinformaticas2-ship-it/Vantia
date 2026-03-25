import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  FolderOpen, Plus, Loader2, AlertCircle, RefreshCw,
  X, ChevronUp, ChevronDown, ListFilter, ExternalLink,
  Edit3, Trash2, FileSpreadsheet, Printer, MoreHorizontal,
  Users, Activity, Mail, MessageSquare, Paperclip,
  AlertTriangle, ClipboardList, ChevronRight, Star,
  Palette, Zap, Bell, Copy, GitMerge, Smartphone,
  Bug, History, TrendingUp, UserMinus, Pencil, Bookmark,
  AlignJustify, LayoutList, ListChecks,
} from "lucide-react";
import { AtajosButton } from "../components/AtajosSystem";
import AdjuntosModal from "../components/AdjuntosModal";

type ViewMode = "list" | "detail" | "multiselect";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { TIPOS, ESTADOS, EXP_EMPTY, ExpedienteModal } from "../components/ExpedienteModal";

type SortKey = "anio" | "num_exp" | "descripcion" | "tipo" | "cliente_nombre" | "contrario" | "juzgado" | "estado" | "fecha_inicio";
type SortDir = "asc" | "desc";

interface ActiveFilter { id: number; field: string; value: string; }
let nextId = 1;

const FILTER_FIELDS = [
  { value: "any",          label: "Cualquier criterio" },
  { value: "descripcion",  label: "Descripción" },
  { value: "cliente",      label: "Cliente" },
  { value: "contrario",    label: "Parte contraria" },
  { value: "juzgado",      label: "Juzgado / Tribunal" },
  { value: "tipo",         label: "Tipo de expediente" },
  { value: "estado",       label: "Estado" },
  { value: "nig",          label: "NIG" },
  { value: "num_autos",    label: "Núm. Autos" },
  { value: "ref_propia",   label: "Ref. Propia" },
  { value: "anio",         label: "Año" },
];

function matchesFilter(e: any, field: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  switch (field) {
    case "any":
      return (
        (e.descripcion     || "").toLowerCase().includes(v) ||
        (e.cliente_nombre  || "").toLowerCase().includes(v) ||
        (e.contrario       || "").toLowerCase().includes(v) ||
        (e.juzgado         || "").toLowerCase().includes(v) ||
        (e.nig             || "").toLowerCase().includes(v) ||
        (e.num_autos       || "").toLowerCase().includes(v) ||
        (e.ref_propia      || "").toLowerCase().includes(v) ||
        (e.tipo_proc       || "").toLowerCase().includes(v) ||
        String(e.num_exp   || "").includes(v) ||
        String(e.anio      || "").includes(v)
      );
    case "descripcion": return (e.descripcion   || "").toLowerCase().includes(v);
    case "cliente":     return (e.cliente_nombre|| "").toLowerCase().includes(v);
    case "contrario":   return (e.contrario     || "").toLowerCase().includes(v);
    case "juzgado":     return (e.juzgado       || "").toLowerCase().includes(v);
    case "tipo":        return (e.tipo          || "").toLowerCase().includes(v) || (TIPOS[e.tipo]?.label || "").toLowerCase().includes(v);
    case "estado":      return (e.estado        || "").toLowerCase().includes(v);
    case "nig":         return (e.nig           || "").toLowerCase().includes(v);
    case "num_autos":   return (e.num_autos     || "").toLowerCase().includes(v);
    case "ref_propia":  return (e.ref_propia    || "").toLowerCase().includes(v);
    case "anio":        return String(e.anio    || "").includes(v);
    default: return true;
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Botón de toolbar ──────────────────────────────────────────
function ToolBtn({
  icon: Icon, label, onClick, disabled = false, primary = false, danger = false,
}: {
  icon: any; label: string; onClick?: () => void;
  disabled?: boolean; primary?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
        transition-all select-none whitespace-nowrap
        ${disabled
          ? "text-slate-300 cursor-not-allowed"
          : primary
            ? "bg-red-700 text-white hover:bg-red-800 shadow-sm active:scale-95"
            : danger
              ? "text-red-500 hover:bg-red-50 hover:text-red-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
        }
      `}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

// ── Cabecera columna ordenable ─────────────────────────────────
function Th({ label, sk, sort, dir, onSort, className = "" }: {
  label: string; sk?: SortKey; sort: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sk && sort === sk;
  return (
    <th
      onClick={() => sk && onSort(sk)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap ${sk ? "cursor-pointer hover:text-slate-600" : ""} ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {sk && (
          <span className={active ? "text-red-500" : "text-slate-200"}>
            {active && dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        )}
      </span>
    </th>
  );
}

// ── Fila de filtro ─────────────────────────────────────────────
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
      <select
        value={filter.field}
        onChange={e => onChange(filter.id, { field: e.target.value, value: "" })}
        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 bg-white focus:outline-none focus:border-red-400 h-7"
      >
        {FILTER_FIELDS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      <input
        ref={inputRef}
        value={filter.value}
        onChange={e => onChange(filter.id, { value: e.target.value })}
        placeholder="Buscar..."
        className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:border-red-400 h-7 w-48"
      />
      {canRemove && (
        <button
          onClick={() => onRemove(filter.id)}
          className="text-slate-300 hover:text-red-500 transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}




// ── Componente principal ───────────────────────────────────────
export default function ExpedienteList() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [expedientes, setExpedientes] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshSpin, setRefreshSpin] = useState(false);

  // Filtros
  const [filters, setFilters] = useState<ActiveFilter[]>([
    { id: nextId++, field: "any", value: "" },
  ]);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Ordenación
  const [sort, setSort] = useState<SortKey>("anio");
  const [dir,  setDir]  = useState<SortDir>("desc");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editItem,  setEditItem]  = useState<any>(null);
  const [saving,    setSaving]    = useState(false);
  const [clientes,  setClientes]  = useState<any[]>([]);

  // Confirmación borrado
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Vistas
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const switchView = (v: ViewMode) => setViewMode(v);

  // Adjuntos modal
  const [showAdjuntos, setShowAdjuntos] = useState(false);

  // Dropdowns click-based
  const [showOpciones, setShowOpciones] = useState(false);
  const opcionesRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown Opciones al clicar fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (opcionesRef.current && !opcionesRef.current.contains(e.target as Node)) setShowOpciones(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Carga de expedientes ──────────────────────────────────────
  const fetchExpedientes = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/expedientes?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (res.ok) setExpedientes(d.data || []);
      else throw new Error(d.error || "Error al cargar expedientes");
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchExpedientes(); }, [fetchExpedientes]);
  useAutoRefresh(() => fetchExpedientes(true), { intervalMs: 30_000 });

  // Cargar clientes para el modal
  const fetchClientes = useCallback(async () => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/entities?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (res.ok) setClientes(d.data || []);
    } catch {}
  }, [getToken]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  // ── Filtros ───────────────────────────────────────────────────
  const addFilter    = () => setFilters(prev => [...prev, { id: nextId++, field: "any", value: "" }]);
  const removeFilter = (id: number) => setFilters(prev => prev.filter(f => f.id !== id));
  const updateFilter = (id: number, patch: Partial<ActiveFilter>) =>
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  const clearAllFilters = () => setFilters([{ id: nextId++, field: "any", value: "" }]);
  const hasActiveFilters = filters.some(f => f.value.trim() !== "");

  // ── Filtrado + ordenación ──────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = expedientes.filter(e => filters.every(f => matchesFilter(e, f.field, f.value)));
    rows = [...rows].sort((a, b) => {
      let av: any = a[sort] ?? ""; let bv: any = b[sort] ?? "";
      if (sort === "num_exp" || sort === "anio") { av = Number(av); bv = Number(bv); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ?  1 : -1;
      return 0;
    });
    return rows;
  }, [expedientes, filters, sort, dir]);

  // ── Stats (computed localmente, sin llamada extra a la API) ────
  const stats = useMemo(() => ({
    total:      expedientes.length,
    abiertos:   expedientes.filter(e => e.estado === "abierto").length,
    cerrados:   expedientes.filter(e => e.estado === "cerrado").length,
    suspendidos:expedientes.filter(e => e.estado === "suspendido").length,
    esteAnio:   expedientes.filter(e => e.anio === new Date().getFullYear()).length,
  }), [expedientes]);

  // ── Ordenación ────────────────────────────────────────────────
  const handleSort = (k: SortKey) => {
    if (sort === k) setDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(k); setDir("asc"); }
  };

  // ── CRUD ──────────────────────────────────────────────────────
  const handleSave = async (form: typeof EXP_EMPTY) => {
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const isEdit = !!editItem?.id;
      const res = await fetch(isEdit ? `/api/expedientes/${editItem.id}` : "/api/expedientes", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await safeJson(res);
      if (!res.ok) { alert(d.error || "Error al guardar"); return; }
      setShowModal(false); setEditItem(null);
      fetchExpedientes(true);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/expedientes/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setExpedientes(prev => prev.filter(x => x.id !== id));
      setDeleteId(null);
      if (selected === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
  };

  // ── Acciones toolbar ──────────────────────────────────────────
  const selectedExp = useMemo(() => expedientes.find(e => e.id === selected), [expedientes, selected]);

  const handleRefresh = async () => {
    setRefreshSpin(true);
    await fetchExpedientes(false);
    setTimeout(() => setRefreshSpin(false), 600);
  };

  const exportCSV = () => {
    const headers = ["Año","Núm.","Ref. Propia","Descripción","Tipo","Cliente","Contrario","Procurador","Juzgado","Tipo Proc.","Núm. Autos","NIG","Estado"];
    const rows = filtered.map(e => [
      e.anio, e.num_exp, e.ref_propia ?? "", e.descripcion ?? "",
      TIPOS[e.tipo]?.label ?? e.tipo, e.cliente_nombre ?? "",
      e.contrario ?? "", e.procurador ?? "", e.juzgado ?? "",
      e.tipo_proc ?? "", e.num_autos ?? "", e.nig ?? "", e.estado ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv);
    a.download = `expedientes_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  // ── Teclado: Enter abre seleccionado, Ctrl+F foco búsqueda ────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selected) navigate(`/dashboard/expedientes/${selected}`);
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault(); firstInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, navigate]);

  // ── Render: carga ─────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm font-medium animate-pulse">Cargando expedientes...</p>
    </div>
  );

  if (error) return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
        <FolderOpen size={20} className="text-red-600" /> Gestión de Expedientes
      </h1>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle size={20} className="shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm">Error de conexión con el backend</p>
          <p className="text-xs mt-0.5 font-mono">{error}</p>
        </div>
        <button onClick={() => fetchExpedientes()} className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    </div>
  );

  // ── Render principal ──────────────────────────────────────────
  return (
    <>
      {/* ── Modal Adjuntos ──────────────────────────────────── */}
      {showAdjuntos && selected && (
        <AdjuntosModal
          entityId={selected}
          entityName={selectedExp ? `${selectedExp.ref_expediente || selectedExp.ref_propia || "Exp."} — ${selectedExp.descripcion || ""}` : "Expediente"}
          onClose={() => setShowAdjuntos(false)}
        />
      )}

      {/* ── Modal alta / edición ────────────────────────────── */}
      {showModal && (
        <ExpedienteModal
          editId={editItem?.id}
          initial={editItem ? {
            anio:             editItem.anio,
            ref_propia:       editItem.ref_propia       || "",
            ref_expediente:   editItem.ref_expediente   || "",
            descripcion:      editItem.descripcion      || "",
            tipo:             editItem.tipo             || "judicial",
            cliente_id:       editItem.cliente_id       || "",
            cliente_nombre:   editItem.cliente_nombre   || "",
            contrario:        editItem.contrario        || "",
            procurador:       editItem.procurador       || "",
            juzgado:          editItem.juzgado          || "",
            tipo_proc:        editItem.tipo_proc        || "",
            num_autos:        editItem.num_autos        || "",
            nig:              editItem.nig              || "",
            estado:           editItem.estado           || "abierto",
            observaciones:    editItem.observaciones    || "",
            fecha_inicio:     editItem.fecha_inicio     ? editItem.fecha_inicio.slice(0,10) : "",
            fecha_cierre:     editItem.fecha_cierre     ? editItem.fecha_cierre.slice(0,10) : "",
            importe:          editItem.importe          ? String(editItem.importe) : "",
            tipos_asunto:     editItem.tipos_asunto     || "",
            cuantia_principal:editItem.cuantia_principal? String(editItem.cuantia_principal) : "",
            intereses:        editItem.intereses        ? String(editItem.intereses) : "",
            costas:           editItem.costas           ? String(editItem.costas) : "",
            cuantia_total:    editItem.cuantia_total    ? String(editItem.cuantia_total) : "",
            indeterminado:    editItem.indeterminado    || false,
            etapa:            editItem.etapa            || "",
            persona_contacto: editItem.persona_contacto|| "",
            contacto:         editItem.contacto        || "",
            centro:           editItem.centro          || "",
            color:            editItem.color           || "ninguno",
            // num_exp injected so modal can display it
            ...(editItem.num_exp ? { num_exp: editItem.num_exp } : {}),
          } as typeof EXP_EMPTY : EXP_EMPTY}
          clientes={clientes}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          saving={saving}
        />
      )}

      {/* ── Confirmar borrado ───────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar expediente?</h3>
                <p className="text-xs text-slate-500 mt-1">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0 animate-in fade-in duration-300" style={{ height: "calc(100vh - 96px)" }}>

        {/* ── Cabecera ──────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderOpen size={20} className="text-red-600" /> Gestión de Expedientes
          </h1>
          <button onClick={() => fetchExpedientes(true)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Actualizar">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">

          {/* ── Toolbar de acciones ─────────────────────────── */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex-wrap">

            {/* — Alta / Baja / Modificar / Abrir ficha — misma posición que ClientList */}
            <ToolBtn icon={Plus}         label="Alta"       primary  onClick={() => { setEditItem(null); setShowModal(true); }} />
            <ToolBtn icon={Trash2}       label="Baja"       danger   disabled={!selected} onClick={() => selected && setDeleteId(selected)} />
            <ToolBtn icon={Edit3}        label="Modificar"           disabled={!selected} onClick={() => { setEditItem(selectedExp); setShowModal(true); }} />
            <ToolBtn icon={ExternalLink} label="Abrir ficha"         disabled={!selected} onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <ToolBtn icon={Mail}         label="Enviar Correo"  disabled={!selected} onClick={() => {}} />
            <ToolBtn icon={MessageSquare}label="WhatsApp"       disabled={!selected} onClick={() => {}} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <ToolBtn icon={ClipboardList}label="Actuación"     disabled={!selected} onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)} />
            <ToolBtn icon={Paperclip}    label="Adjuntos"      disabled={!selected} onClick={() => selected && setShowAdjuntos(true)} />
            <ToolBtn icon={Users}        label="Ir a cliente"  disabled={!selectedExp?.cliente_id} onClick={() => selectedExp?.cliente_id && navigate(`/dashboard/clientes/${selectedExp.cliente_id}`)} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <ToolBtn icon={FileSpreadsheet} label="Excel"    onClick={exportCSV} />
            <ToolBtn icon={Printer}         label="Imprimir" onClick={() => window.print()} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* ── Atajos ── */}
            <AtajosButton modulo="Expedientes" />

            {/* ── Opciones ── */}
            <div className="relative" ref={opcionesRef}>
              <button
                onClick={() => setShowOpciones(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${showOpciones ? "bg-red-50 border-red-300 text-red-700" : "text-slate-600 hover:bg-slate-100 border-slate-200"}`}>
                <MoreHorizontal size={13} /> Opciones <ChevronDown size={10} />
              </button>
              {showOpciones && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[230px] py-1.5">

                {/* Grupo 1: acciones principales */}
                <button onClick={exportCSV}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <FileSpreadsheet size={12} className="text-slate-400" /> Excel
                </button>
                <button onClick={() => selected && alert("Dar de baja: " + selected)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <UserMinus size={12} className="text-slate-400" /> Baja
                </button>
                <button onClick={() => selected && selectedExp && (setEditItem(selectedExp), setShowModal(true))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Pencil size={12} className="text-slate-400" /> Modificar
                </button>
                <button onClick={() => alert("Seleccionar opciones favoritas")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Star size={12} className="text-slate-400" /> Seleccionar Opciones Favoritas
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 2: navegación y color */}
                {/* Ir a → submenú */}
                <div className="relative group/sub">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <ExternalLink size={12} className="text-slate-400" /> Ir a
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/sub:block">
                    <button onClick={() => selectedExp?.cliente_id && navigate(`/dashboard/clientes/${selectedExp.cliente_id}`)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Users size={12} className="text-slate-400" /> Ir a Cliente
                    </button>
                    <button onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <FolderOpen size={12} className="text-slate-400" /> Ir a Expediente
                    </button>
                    <button onClick={() => alert("Ir a Juzgado")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <ClipboardList size={12} className="text-slate-400" /> Ir a Juzgado
                    </button>
                  </div>
                </div>

                <button onClick={() => alert("Asignar color al expediente")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Palette size={12} className="text-slate-400" /> Asignar Color
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 3: acciones especiales */}
                <button onClick={() => alert("Alta Acción")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Zap size={12} className="text-slate-400" /> Alta Acción
                </button>
                <button onClick={() => alert("Crear Recall")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Bell size={12} className="text-slate-400" /> Crear Recall
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 4: duplicar / fusionar */}
                <button onClick={() => alert("Duplicar expediente")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Copy size={12} className="text-slate-400" /> Duplicar
                </button>
                <button onClick={() => alert("Fusionar expedientes")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <GitMerge size={12} className="text-slate-400" /> Fusionar
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 5: comunicación + debug */}
                <button onClick={() => selectedExp && window.open(`https://wa.me/?text=Expediente ${selectedExp.anio}/${selectedExp.num_exp}`, "_blank")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Smartphone size={12} className="text-slate-400" /> Enviar SMS
                </button>

                {/* Depurar → submenú */}
                <div className="relative group/dep">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <Bug size={12} className="text-slate-400" /> Depurar
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/dep:block">
                    <button onClick={() => console.log("Expediente:", selectedExp)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Bug size={12} className="text-slate-400" /> Ver en consola
                    </button>
                    <button onClick={() => alert(JSON.stringify(selectedExp, null, 2))}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <ClipboardList size={12} className="text-slate-400" /> Mostrar datos crudos
                    </button>
                  </div>
                </div>

                {/* Versión Antigua → submenú */}
                <div className="relative group/ver">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <History size={12} className="text-slate-400" /> Versión Antigua
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/ver:block">
                    <button onClick={() => alert("Restaurar versión anterior")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <History size={12} className="text-slate-400" /> Ver historial versiones
                    </button>
                    <button onClick={() => alert("Comparar con versión")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <RefreshCw size={12} className="text-slate-400" /> Comparar versión
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 6: recalcular */}
                <button onClick={() => alert("Recalcular intereses")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <TrendingUp size={12} className="text-slate-400" /> Recalcular Intereses
                </button>
                <button onClick={() => fetchExpedientes(false)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Activity size={12} className="text-slate-400" /> Recalcular Indicadores
                </button>

              </div>
              )}
            </div>

            {/* Expediente seleccionado */}
            {selectedExp && (
              <div className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-lg shrink-0">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-xs text-red-700 font-medium max-w-[200px] truncate">
                  {selectedExp.anio}/{selectedExp.num_exp} — {selectedExp.descripcion}
                </span>
                <button onClick={() => setSelected(null)} className="text-red-300 hover:text-red-600 ml-0.5">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>

          {/* ── Barra de filtros ────────────────────────────── */}
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
                  {idx === filters.length - 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={addFilter}
                        className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm font-bold">
                        +
                      </button>
                      {filters.length > 1 && (
                        <button onClick={() => removeFilter(filter.id)}
                          className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors text-xs font-bold">
                          −
                        </button>
                      )}
                      <button onClick={clearAllFilters}
                        className={`flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${hasActiveFilters || filters.length > 1 ? "border-red-300 text-red-500 hover:bg-red-50" : "border-slate-200 text-slate-300 cursor-default"}`}>
                        <ListFilter size={12} />
                      </button>
                    </div>
                  )}
                  {idx === filters.length - 1 && (
                    <div className="ml-auto flex items-center gap-2">
                      {/* Contador */}
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {filtered.length !== expedientes.length
                          ? <span className="text-amber-600 font-medium">{filtered.length} de {expedientes.length}</span>
                          : <>{expedientes.length} {expedientes.length === 1 ? "registro" : "registros"}</>
                        }
                      </span>

                      <div className="w-px h-4 bg-slate-200" />

                      {/* Controles de vista */}
                      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                        <button
                          onClick={() => switchView("list")}
                          title="Vista listado"
                          className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <AlignJustify size={13} />
                        </button>
                        <button
                          onClick={() => switchView("detail")}
                          title="Vista listado con detalle"
                          className={`p-1.5 rounded-md transition-all ${viewMode === "detail" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <LayoutList size={13} />
                        </button>
                        <button
                          onClick={() => switchView("multiselect")}
                          title="Selección múltiple"
                          className={`p-1.5 rounded-md transition-all ${viewMode === "multiselect" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <ListChecks size={13} />
                        </button>
                      </div>

                      {/* Refrescar */}
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

          {/* ══════════════════════════════════════════════════
              VISTA LISTA — tabla densa compacta
          ══════════════════════════════════════════════════ */}
          {viewMode === "list" && (
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <Th label="Año"                    sk="anio"          sort={sort} dir={dir} onSort={handleSort} className="w-14 pl-4" />
                  <Th label="Núm. Exp"               sk="num_exp"        sort={sort} dir={dir} onSort={handleSort} className="w-16" />
                  <Th label="Ref. Propia"                                 sort={sort} dir={dir} onSort={handleSort} className="w-24" />
                  <Th label="Descripción Expediente" sk="descripcion"    sort={sort} dir={dir} onSort={handleSort} className="min-w-[180px]" />
                  <Th label="Tipo de Expediente"     sk="tipo"           sort={sort} dir={dir} onSort={handleSort} className="w-40" />
                  <Th label="Cliente"                sk="cliente_nombre" sort={sort} dir={dir} onSort={handleSort} className="w-36" />
                  <Th label="Contrario"              sk="contrario"      sort={sort} dir={dir} onSort={handleSort} className="w-36" />
                  <Th label="Procurador Propio"                          sort={sort} dir={dir} onSort={handleSort} className="w-32 hidden xl:table-cell" />
                  <Th label="Juzgado Principal"      sk="juzgado"        sort={sort} dir={dir} onSort={handleSort} className="w-44 hidden lg:table-cell" />
                  <Th label="Tipo Procedimiento"                         sort={sort} dir={dir} onSort={handleSort} className="w-28 hidden xl:table-cell" />
                  <Th label="Núm. Autos"                                 sort={sort} dir={dir} onSort={handleSort} className="w-24 hidden lg:table-cell" />
                  <Th label="NIG"                                        sort={sort} dir={dir} onSort={handleSort} className="w-28 hidden xl:table-cell" />
                  <Th label="Estado"                 sk="estado"         sort={sort} dir={dir} onSort={handleSort} className="w-24" />
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <FolderOpen size={36} className="opacity-15" />
                        <p className="font-medium text-sm">
                          {hasActiveFilters || filters.length > 1
                            ? "No hay expedientes con esos filtros"
                            : "No hay expedientes todavía"}
                        </p>
                        {!hasActiveFilters && filters.length === 1 && (
                          <button onClick={() => setShowModal(true)}
                            className="text-red-600 text-xs font-bold hover:underline">
                            + Crear el primer expediente
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(exp => {
                  const isSel      = selected === exp.id;
                  const tipoConf   = TIPOS[exp.tipo]   || TIPOS.otro;
                  const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                  return (
                    <tr
                      key={exp.id}
                      onClick={() => setSelected(isSel ? null : exp.id)}
                      onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors group
                        ${isSel ? "bg-red-50 border-l-2 border-l-red-500" : "hover:bg-slate-50/80"}`}
                    >
                      {/* Año */}
                      <td className={`pl-4 pr-3 py-2 font-mono ${isSel ? "text-red-400" : "text-slate-400"}`}>{exp.anio}</td>

                      {/* Núm */}
                      <td className="px-3 py-2">
                        <span className={`font-extrabold text-sm ${isSel ? "text-red-700" : "text-red-600"}`}>{exp.num_exp}</span>
                      </td>

                      {/* Ref */}
                      <td className="px-3 py-2 font-mono text-slate-400">
                        {exp.ref_propia || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Descripción */}
                      <td className="px-3 py-2">
                        <span className={`font-semibold truncate block max-w-[220px] ${isSel ? "text-red-700" : "text-slate-800"}`}>
                          {exp.descripcion || <span className="text-slate-300 font-normal">Sin descripción</span>}
                        </span>
                      </td>

                      {/* Tipo */}
                      <td className="px-3 py-2 text-[11px] text-slate-600 uppercase whitespace-nowrap font-medium">
                        {tipoConf.label}
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-2">
                        {exp.cliente_id ? (
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/dashboard/clientes/${exp.cliente_id}`); }}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-left truncate block max-w-[130px]">
                            {exp.cliente_nombre || "Ver"}
                          </button>
                        ) : (
                          <span className="text-slate-400 truncate block max-w-[130px]">
                            {exp.cliente_nombre || <span className="text-slate-200">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Contrario */}
                      <td className="px-3 py-2 text-slate-500 truncate max-w-[130px]">
                        {exp.contrario || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Procurador */}
                      <td className="px-3 py-2 text-slate-400 hidden xl:table-cell truncate max-w-[120px]">
                        {exp.procurador || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Juzgado */}
                      <td className="px-3 py-2 text-slate-400 hidden lg:table-cell truncate max-w-[150px]">
                        {exp.juzgado || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Tipo proc */}
                      <td className="px-3 py-2 text-slate-400 uppercase hidden xl:table-cell whitespace-nowrap">
                        {exp.tipo_proc || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Núm. Autos */}
                      <td className="px-3 py-2 font-mono text-slate-400 hidden lg:table-cell">
                        {exp.num_autos || <span className="text-slate-200">—</span>}
                      </td>

                      {/* NIG */}
                      <td className="px-3 py-2 font-mono text-slate-300 hidden xl:table-cell">
                        {exp.nig ? <span title={exp.nig}>{exp.nig.slice(0,12)}{exp.nig.length > 12 ? "…" : ""}</span> : <span className="text-slate-200">—</span>}
                      </td>

                      {/* Estado */}
                      <td className="px-3 py-2 text-[11px] text-slate-600 whitespace-nowrap">
                        {estadoConf.label}
                      </td>

                      {/* Abrir */}
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/dashboard/expedientes/${exp.id}`); }}
                          className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex opacity-0 group-hover:opacity-100"
                          title="Abrir expediente">
                          <ExternalLink size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* ══════════════════════════════════════════════════
              VISTA DETALLE — tarjetas expandibles
          ══════════════════════════════════════════════════ */}
          {viewMode === "detail" && (
            <div className="overflow-auto flex-1 p-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                  <FolderOpen size={36} className="opacity-15" />
                  <p className="font-medium text-sm">{hasActiveFilters || filters.length > 1 ? "No hay expedientes con esos filtros" : "No hay expedientes todavía"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(exp => {
                    const tipoConf   = TIPOS[exp.tipo]   || TIPOS.otro;
                    const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                    const isSel = selected === exp.id;
                    return (
                      <div
                        key={exp.id}
                        onClick={() => setSelected(isSel ? null : exp.id)}
                        onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                        className={`rounded-xl border cursor-pointer transition-all ${isSel ? "border-red-300 bg-red-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}
                      >
                        <div className="px-4 py-3 flex items-center gap-4">
                          <div className="shrink-0 w-20 text-right">
                            <span className={`font-extrabold text-base ${isSel ? "text-red-600" : "text-red-500"}`}>{exp.anio}/{exp.num_exp}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${isSel ? "text-red-800" : "text-slate-800"}`}>{exp.descripcion || "Sin descripción"}</p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {exp.cliente_nombre && <span className="text-emerald-600 font-medium">{exp.cliente_nombre}</span>}
                              {exp.contrario && <><span className="mx-1 text-slate-300">vs</span><span className="text-red-500">{exp.contrario}</span></>}
                              {exp.juzgado && <><span className="mx-1 text-slate-200">·</span><span>{exp.juzgado}</span></>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tipoConf.color}`}>{tipoConf.short}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${estadoConf.color}`}>{estadoConf.label}</span>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/dashboard/expedientes/${exp.id}`); }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              VISTA MULTISELECT — cuadrícula de tarjetas
          ══════════════════════════════════════════════════ */}
          {viewMode === "multiselect" && (
            <div className="overflow-auto flex-1 p-4">
              <div className="mb-3 px-1">
                <span className="text-xs text-slate-400">{filtered.length} expedientes</span>
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                  <FolderOpen size={36} className="opacity-15" />
                  <p className="font-medium text-sm">{hasActiveFilters || filters.length > 1 ? "No hay expedientes con esos filtros" : "No hay expedientes todavía"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filtered.map(exp => {
                    const isSel = selected === exp.id;
                    const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                    return (
                      <div
                        key={exp.id}
                        onClick={() => setSelected(isSel ? null : exp.id)}
                        onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                        className={`rounded-xl border cursor-pointer p-3 flex flex-col gap-1.5 transition-all ${isSel ? "border-red-300 bg-red-50 shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}
                      >
                        <div className={`text-xs font-extrabold ${isSel ? "text-red-600" : "text-red-500"}`}>{exp.anio}/{exp.num_exp}</div>
                        <p className="text-xs font-semibold text-slate-700 line-clamp-2 leading-snug">{exp.descripcion || "Sin descripción"}</p>
                        {exp.cliente_nombre && <p className="text-[10px] text-emerald-600 truncate font-medium">{exp.cliente_nombre}</p>}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full self-start mt-auto ${estadoConf.color}`}>{estadoConf.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Barra de estado inferior ─────────────────────── */}
          <div className="flex items-center gap-6 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 shrink-0">
            <span><span className="font-semibold text-slate-700">Total expedientes:</span> <span className="font-mono">{stats.total.toLocaleString("es-ES")}</span></span>
            <span><span className="font-semibold text-emerald-600">Abiertos:</span> <span className="font-mono">{stats.abiertos}</span></span>
            <span><span className="font-semibold text-slate-500">Cerrados:</span> <span className="font-mono">{stats.cerrados}</span></span>
            <span><span className="font-semibold text-amber-500">Suspendidos:</span> <span className="font-mono">{stats.suspendidos}</span></span>
            <span><span className="font-semibold text-red-600">Año {new Date().getFullYear()}:</span> <span className="font-mono">{stats.esteAnio}</span></span>
            {hasActiveFilters && (
              <span className="text-amber-600 font-medium">↳ Mostrando {filtered.length} de {expedientes.length} con filtros activos</span>
            )}
            <span className="ml-auto text-slate-300">Doble clic para abrir · Enter abre seleccionado · Ctrl+F para filtrar</span>
          </div>

        </div>
      </div>
    </>
  );
}
