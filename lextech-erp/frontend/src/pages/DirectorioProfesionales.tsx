import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Scale, Gavel, Search, Plus, X, Pen, Trash2, ExternalLink,
  RefreshCw, AlertCircle, Loader2,
} from "lucide-react";
import { Spinner } from "../components/Spinner";
import { safeJson } from "../lib/api";

interface Profesional {
  id: string;
  tipo: "PROCURADOR" | "ABOGADO";
  first_name: string;
  last_name: string | null;
  colegio: string | null;
  num_colegiado: string | null;
  despacho: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  cuenta_consignaciones: string | null;
  codigo_repre: string | null;
  especialidad: string | null;
  turno_oficio: boolean;
  created_at: string;
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

  const [items, setItems]       = useState<Profesional[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profesional | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleRefresh = () => load(search, true);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/directorio/${deleteTarget.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const initials = (p: Profesional) => ((p.first_name || "?")[0] || "?").toUpperCase();

  if (loading) return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <Spinner size="xl" label={`Cargando ${desc}...`} />
    </div>
  );

  if (error) return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-10">
      <div className="w-full max-w-md flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle size={20} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Error de conexión con el backend</p>
          <p className="text-xs mt-0.5 font-mono break-all">{error}</p>
        </div>
        <button onClick={() => load(search)} className="shrink-0 flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
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

      {/* ── TOOLBAR ──────────────────────────────────────────── */}
      <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0 z-10 animate-card-in-1">
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {items.length} {items.length === 1 ? "registro" : "registros"}
          </span>
          <button
            onClick={() => navigate(`/dashboard/${base}/new`)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] border bg-red-600 text-white hover:bg-red-700 border-red-600 shadow-sm shadow-red-200"
          >
            <Plus size={13} /> Nuevo
          </button>
        </div>
      </div>

      {/* ── TABLA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left text-sm min-w-[820px]">
          <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap">Nombre</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap">Colegiación</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap">
                {tipo === "PROCURADOR" ? "Código REPRE" : "Especialidad"}
              </th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none whitespace-nowrap">Contacto</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-20 text-center">
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
            ) : items.map((p, rowIdx) => {
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
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? "bg-red-200 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                        {initials(p)}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-semibold leading-tight truncate ${isSelected ? "text-red-700" : "text-slate-800"}`}>{p.first_name} {p.last_name || ""}</p>
                        {p.despacho && <p className="text-xs text-slate-400 truncate leading-tight">{p.despacho}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {(p.colegio || p.num_colegiado)
                      ? <>{p.colegio}{p.colegio && p.num_colegiado ? " · " : ""}{p.num_colegiado ? `Nº ${p.num_colegiado}` : ""}</>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {tipo === "PROCURADOR" ? (
                      p.codigo_repre ? <span className="font-mono">{p.codigo_repre}</span> : <span className="text-slate-300">—</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.especialidad ? <span>{p.especialidad}</span> : <span className="text-slate-300">—</span>}
                        {p.turno_oficio && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            Turno de oficio
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {p.email && <p className="truncate max-w-[180px]">{p.email}</p>}
                    {p.phone && <p className="text-xs text-slate-400">{p.phone}</p>}
                    {!p.email && !p.phone && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link to={`/dashboard/${base}/${p.id}/edit`} onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors inline-flex" title="Editar">
                        <Pen size={13} />
                      </Link>
                      <button onClick={e => { e.stopPropagation(); setDeleteTarget(p); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
