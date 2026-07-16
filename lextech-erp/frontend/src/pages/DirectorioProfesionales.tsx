import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Scale, Gavel, Search, Plus, X, Loader2, Pen, Trash2,
  Mail, Phone, MapPin, Building2, BadgeCheck, AlertCircle,
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
  created_at: string;
}

const EMPTY_FORM = {
  first_name: "", last_name: "", colegio: "", num_colegiado: "",
  despacho: "", email: "", phone: "", address: "", notes: "",
};

export default function DirectorioProfesionales({ tipo, title, desc }: {
  tipo: "PROCURADOR" | "ABOGADO";
  title: string;
  desc: string;
}) {
  const { getToken } = useAuth();
  const Icon = tipo === "PROCURADOR" ? Scale : Gavel;

  const [items, setItems]       = useState<Profesional[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Profesional | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Profesional | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const params = new URLSearchParams({ tipo });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/directorio?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) setItems(d.data || []);
    } finally {
      setLoading(false);
    }
  }, [getToken, tipo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setError(""); setShowForm(true); };
  const openEdit = (p: Profesional) => {
    setEditing(p);
    setForm({
      first_name: p.first_name, last_name: p.last_name || "", colegio: p.colegio || "",
      num_colegiado: p.num_colegiado || "", despacho: p.despacho || "", email: p.email || "",
      phone: p.phone || "", address: p.address || "", notes: p.notes || "",
    });
    setError("");
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); setError(""); };
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError("");
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(editing ? `/api/directorio/${editing.id}` : "/api/directorio", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, tipo }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo guardar");
      closeForm();
      load(search);
    } catch (e: any) {
      setError(e.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 lg:px-8 py-5 border-b border-slate-200 bg-white flex-shrink-0 flex items-center justify-between gap-4">
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
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 pr-3 py-2 w-56 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
            />
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm active:scale-95 transition-all"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 lg:p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="md" muted /></div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 flex flex-col items-center gap-3 text-slate-400">
            <Icon size={40} className="opacity-20" />
            <p className="font-medium text-sm">
              {search ? "Sin resultados para tu búsqueda" : `Todavía no hay ${desc}`}
            </p>
            {!search && <p className="text-xs text-slate-300">Pulsa "Nuevo" para dar de alta el primero</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map(p => (
              <div key={p.id} className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-red-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{p.first_name} {p.last_name || ""}</p>
                    {(p.colegio || p.num_colegiado) && (
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                        <BadgeCheck size={11} className="text-slate-300 shrink-0" />
                        {[p.colegio, p.num_colegiado ? `Nº ${p.num_colegiado}` : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Editar">
                      <Pen size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Eliminar">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  {p.despacho && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                      <Building2 size={11} className="text-slate-300 shrink-0" /> {p.despacho}
                    </p>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1.5 truncate">
                      <Mail size={11} className="text-slate-300 shrink-0" /> {p.email}
                    </a>
                  )}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1.5 truncate">
                      <Phone size={11} className="text-slate-300 shrink-0" /> {p.phone}
                    </a>
                  )}
                  {p.address && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                      <MapPin size={11} className="text-slate-300 shrink-0" /> {p.address}
                    </p>
                  )}
                  {!p.despacho && !p.email && !p.phone && !p.address && (
                    <p className="text-xs text-slate-300">Sin datos de contacto</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm px-4" onClick={closeForm}>
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{editing ? `Editar ${title.slice(0, -1)}` : `Nuevo ${title.slice(0, -1)}`}</h3>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nombre *"><input value={form.first_name} onChange={e => set("first_name", e.target.value)} className={inputCls} autoFocus /></FormField>
                <FormField label="Apellidos"><input value={form.last_name} onChange={e => set("last_name", e.target.value)} className={inputCls} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Colegio"><input value={form.colegio} onChange={e => set("colegio", e.target.value)} placeholder="Ej. ICAM" className={inputCls} /></FormField>
                <FormField label="Nº Colegiado"><input value={form.num_colegiado} onChange={e => set("num_colegiado", e.target.value)} className={inputCls} /></FormField>
              </div>
              <FormField label="Despacho / Bufete"><input value={form.despacho} onChange={e => set("despacho", e.target.value)} className={inputCls} /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Email"><input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} /></FormField>
                <FormField label="Teléfono"><input value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls} /></FormField>
              </div>
              <FormField label="Dirección"><input value={form.address} onChange={e => set("address", e.target.value)} className={inputCls} /></FormField>
              <FormField label="Notas"><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className={inputCls} /></FormField>
              {error && (
                <p className="text-xs text-red-600 font-medium flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={closeForm} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm">
                {saving && <Loader2 size={13} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm px-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">¿Eliminar {tipo === "PROCURADOR" ? "procurador" : "abogado"}?</h3>
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

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}
