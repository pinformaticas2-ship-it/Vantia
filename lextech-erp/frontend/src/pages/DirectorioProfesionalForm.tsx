import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  ChevronLeft, Scale, Gavel, X, CheckCircle2, AlertTriangle, Loader2, Save,
  BadgeCheck, Building2, Phone, StickyNote,
} from "lucide-react";
import { Spinner } from "../components/Spinner";
import { safeJson } from "../lib/api";

const EMPTY_FORM = {
  first_name: "", last_name: "", nif_cif: "", estado: "Alta",
  colegio: "", num_colegiado: "",
  despacho: "", address_street: "", address_cp: "", address_town: "", address_province: "", address_country: "España",
  email: "", website: "", phone_1: "", phone_2: "", phone_3: "", mobile: "", fax: "",
  notes: "",
  cuenta_consignaciones: "", codigo_repre: "", especialidad: "", turno_oficio: false,
};

const lbl = "text-xs font-bold text-slate-500 uppercase tracking-wider";
const inputCls = "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors";

export default function DirectorioProfesionalForm({ tipo, singular }: {
  tipo: "PROCURADOR" | "ABOGADO";
  singular: string;
}) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const base = tipo === "PROCURADOR" ? "procuradores" : "abogados";
  const Icon = tipo === "PROCURADOR" ? Scale : Gavel;
  const backTo = `/dashboard/${base}`;

  const [form, setForm]           = useState(EMPTY_FORM);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      setLoadError("");
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/directorio/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await safeJson(res);
        if (!res.ok) throw new Error(d.error || "No se pudo cargar el registro");
        const p = d.data;
        if (!cancelled) {
          setForm({
            first_name: p.first_name || "", last_name: p.last_name || "", nif_cif: p.nif_cif || "", estado: p.estado || "Alta",
            colegio: p.colegio || "", num_colegiado: p.num_colegiado || "",
            despacho: p.despacho || "", address_street: p.address_street || "", address_cp: p.address_cp || "",
            address_town: p.address_town || "", address_province: p.address_province || "", address_country: p.address_country || "España",
            email: p.email || "", website: p.website || "",
            phone_1: p.phone_1 || "", phone_2: p.phone_2 || "", phone_3: p.phone_3 || "", mobile: p.mobile || "", fax: p.fax || "",
            notes: p.notes || "",
            cuenta_consignaciones: p.cuenta_consignaciones || "", codigo_repre: p.codigo_repre || "",
            especialidad: p.especialidad || "", turno_oficio: !!p.turno_oficio,
          });
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message || "No se pudo cargar el registro");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isEdit, getToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError("");
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(isEdit ? `/api/directorio/${id}` : "/api/directorio", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, tipo }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo guardar");
      setShowSuccess(true);
      setTimeout(() => navigate(backTo), 700);
    } catch (e: any) {
      setError(e.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Spinner size="xl" label={`Cargando ${singular.toLowerCase()}...`} />
    </div>
  );

  if (loadError) return (
    <div className="space-y-4 p-8">
      <Link to={backTo}>
        <button type="button" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold px-3 py-2 rounded-md bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all">
          <ChevronLeft size={13} /> Volver
        </button>
      </Link>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertTriangle size={20} className="shrink-0" />
        <span className="text-sm">{loadError}</span>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="h-full flex flex-col overflow-hidden animate-page-in">

      {/* HEADER */}
      <div className="px-6 sm:px-8 py-5 bg-white border-b border-slate-200 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-card-in">
        <div className="flex items-center gap-4">
          <Link to={backTo} className="shrink-0">
            <button type="button" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold px-3 py-2 rounded-md bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all">
              <ChevronLeft size={13} /> Volver
            </button>
          </Link>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-100 flex-shrink-0">
            <Icon size={18} />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-extrabold text-slate-800 leading-none tracking-tight mb-0.5">
              {isEdit ? `Editar ${singular.toLowerCase()}` : `Nuevo ${singular.toLowerCase()}`}
            </h1>
            <p className="text-[11px] font-medium text-slate-500">
              {isEdit ? "Modifica los datos y pulsa Guardar cambios" : `Rellena la ficha de alta del ${singular.toLowerCase()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showSuccess && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
              <CheckCircle2 size={14} /> {isEdit ? "¡Cambios guardados!" : "¡Registrado!"}
            </span>
          )}
          {error && (
            <span className="max-w-xs truncate flex items-center gap-1.5 text-red-600 text-xs">
              <AlertTriangle size={14} className="shrink-0" /> {error}
            </span>
          )}
          <Link to={backTo}>
            <button type="button" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-md shadow-sm transition-colors">
              <X size={14} className="text-slate-400" /> Cancelar
            </button>
          </Link>
          <button type="submit" disabled={saving || showSuccess}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 border border-red-700 rounded-md shadow-sm transition-all active:scale-[0.98]">
            {saving
              ? <><Loader2 size={13} className="animate-spin" /> Guardando...</>
              : <><Save size={13} /> {isEdit ? "Guardar cambios" : "Guardar"}</>}
          </button>
        </div>
      </div>

      {/* BODY */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 lg:p-12 bg-white animate-card-in-1">
        <div className="max-w-[900px] mx-auto flex flex-col gap-10">

          {/* IDENTIFICACIÓN */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Icon size={16} className="text-slate-400" /> Identificación
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div className="flex flex-col gap-2">
                <label className={lbl}>Nombre *</label>
                <input name="first_name" value={form.first_name} onChange={handleChange} className={inputCls} autoFocus />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Apellidos</label>
                <input name="last_name" value={form.last_name} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>NIF / CIF</label>
                <input name="nif_cif" value={form.nif_cif} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} className={inputCls}>
                  <option value="Alta">Alta</option>
                  <option value="Baja">Baja</option>
                </select>
              </div>
            </div>
          </div>

          {/* COLEGIACIÓN */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
              <BadgeCheck size={16} className="text-slate-400" /> Colegiación
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div className="flex flex-col gap-2">
                <label className={lbl}>Colegio</label>
                <input name="colegio" value={form.colegio} onChange={handleChange} placeholder={tipo === "PROCURADOR" ? "Ej. ICPM" : "Ej. ICAM"} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Nº Colegiado</label>
                <input name="num_colegiado" value={form.num_colegiado} onChange={handleChange} className={inputCls} />
              </div>
              {tipo === "PROCURADOR" ? (
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Código REPRE</label>
                  <input name="codigo_repre" value={form.codigo_repre} onChange={handleChange} placeholder="Identificador LexNET" className={inputCls} />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Especialidad</label>
                  <input name="especialidad" value={form.especialidad} onChange={handleChange} placeholder="Ej. Civil, Penal, Laboral..." className={inputCls} />
                </div>
              )}
              {tipo === "PROCURADOR" ? (
                <div className="flex flex-col gap-2 md:col-span-3">
                  <label className={lbl}>Cuenta de consignaciones (IBAN)</label>
                  <input name="cuenta_consignaciones" value={form.cuenta_consignaciones} onChange={handleChange} placeholder="ES00 0000 0000 0000 0000 0000" className={`${inputCls} font-mono`} />
                </div>
              ) : (
                <div className="flex items-center gap-2 md:col-span-3 pt-1">
                  <input
                    type="checkbox"
                    id="turno_oficio"
                    checked={form.turno_oficio}
                    onChange={e => setForm(prev => ({ ...prev, turno_oficio: e.target.checked }))}
                    className="w-4 h-4 accent-red-600 cursor-pointer"
                  />
                  <label htmlFor="turno_oficio" className="text-sm text-slate-700 font-medium cursor-pointer select-none">Está en turno de oficio</label>
                </div>
              )}
            </div>
          </div>

          {/* DIRECCIÓN */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Building2 size={16} className="text-slate-400" /> Despacho y dirección
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div className="flex flex-col gap-2 md:col-span-3">
                <label className={lbl}>Despacho / Bufete</label>
                <input name="despacho" value={form.despacho} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2 md:col-span-3">
                <label className={lbl}>Dirección</label>
                <input name="address_street" value={form.address_street} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Código Postal</label>
                <input name="address_cp" value={form.address_cp} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Población</label>
                <input name="address_town" value={form.address_town} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Provincia</label>
                <input name="address_province" value={form.address_province} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>País</label>
                <input name="address_country" value={form.address_country} onChange={handleChange} className={inputCls} />
              </div>
            </div>
          </div>

          {/* CONTACTO */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Phone size={16} className="text-slate-400" /> Contacto
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className={lbl}>Correo electrónico</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="nombre@despacho.com" className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Página web</label>
                <input name="website" value={form.website} onChange={handleChange} placeholder="www.despacho.com" className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Teléfono 1</label>
                <input name="phone_1" value={form.phone_1} onChange={handleChange} placeholder="900 000 000" className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Teléfono 2</label>
                <input name="phone_2" value={form.phone_2} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Teléfono 3</label>
                <input name="phone_3" value={form.phone_3} onChange={handleChange} className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Móvil</label>
                <input name="mobile" value={form.mobile} onChange={handleChange} placeholder="600 000 000" className={inputCls} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={lbl}>Fax</label>
                <input name="fax" value={form.fax} onChange={handleChange} className={inputCls} />
              </div>
            </div>
          </div>

          {/* NOTAS */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
              <StickyNote size={16} className="text-slate-400" /> Notas
            </h3>
            <div className="flex flex-col gap-2">
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className={inputCls} />
            </div>
          </div>

        </div>
      </main>
    </form>
  );
}
