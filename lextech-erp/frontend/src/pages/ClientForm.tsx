import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Save, X, ArrowLeft, ScanLine, Upload, Image as ImageIcon,
  Loader2, Sparkles, RotateCcw, AlertTriangle, CheckCircle2,
  Camera, Edit3,
} from "lucide-react";
import { safeJson } from "../lib/api";

// ── UI helpers ────────────────────────────────────────────────
const F = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const I = ({ highlight = false, className = "", ...props }: any) => (
  <input
    className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition-all
      ${highlight
        ? "border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/40"
        : "border-slate-200 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100"
      } ${className}`}
    {...props}
  />
);

const S = ({ highlight = false, className = "", children, ...props }: any) => (
  <select
    className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition-all
      ${highlight
        ? "border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/40"
        : "border-slate-200 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100"
      } ${className}`}
    {...props}
  >
    {children}
  </select>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
    </div>
    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
      {children}
    </div>
  </div>
);

const Indicador = ({ label, value, color = "text-slate-700" }: any) => (
  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={`text-xs font-bold ${color}`}>{value}</span>
  </div>
);

type FilledFields = Set<string>;

const PROVINCIAS = ["Álava","Albacete","Alicante","Almería","Asturias","Ávila","Badajoz","Barcelona","Burgos","Cáceres","Cádiz","Cantabria","Castellón","Ciudad Real","Córdoba","Cuenca","Girona","Granada","Guadalajara","Guipúzcoa","Huelva","Huesca","Illes Balears","Jaén","La Coruña","La Rioja","Las Palmas","León","Lleida","Lugo","Madrid","Málaga","Murcia","Navarra","Ourense","Palencia","Pontevedra","Salamanca","Santa Cruz de Tenerife","Segovia","Sevilla","Soria","Tarragona","Teruel","Toledo","Valencia","Valladolid","Vizcaya","Zamora","Zaragoza","Ceuta","Melilla"];
const PAISES = ["España","Francia","Portugal","Italia","Alemania","Reino Unido","Países Bajos","Bélgica","Suiza","Estados Unidos","México","Argentina","Colombia","Venezuela","Otro"];

// ── Redimensiona y comprime la foto a base64 (max 200px, JPEG 80%) ──────────
function resizeImageToBase64(file: File, maxPx = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxPx / Math.max(img.width, img.height), 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

const EMPTY_FORM = {
  type: "CLIENTE",
  client_status: "Alta",
  document_type: "DNI",
  first_name: "",
  last_name: "",
  nif_cif: "",
  gender: "",
  birth_date: "",
  nationality: "Española",
  expedition_country: "España",
  legal_nature: "",
  commercial_name: "",
  address_street: "",
  address_town: "",
  address_cp: "",
  address_province: "",
  address_country: "España",
  email: "",
  phone_1: "",
  phone_2: "",
  phone_3: "",
  phone_mobile: "",
  phone_fax: "",
  website: "",
  date_alta: new Date().toISOString().split("T")[0],
  date_baja: "",
  lopd: "Pendiente",
  commercial_communications: "No",
  center: "",
  photo_url: "",
};

export default function ClientForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const { getToken } = useAuth();
  const navigate = useNavigate();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const photoInputRef  = useRef<HTMLInputElement>(null);

  const [loadingData, setLoadingData] = useState(isEdit);
  const [loadError, setLoadError]     = useState("");

  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [filledFields, setFilledFields] = useState<FilledFields>(new Set());

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [dniImage, setDniImage]   = useState<string | null>(null);
  const [dniFile, setDniFile]     = useState<File | null>(null);
  const [scanning, setScanning]   = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanDone, setScanDone]   = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  // ── Cargar datos cuando es edición ────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/entities/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await safeJson(res);
        if (!res.ok) throw new Error(result.error || "No se pudo cargar el cliente");

        const d = result.data;
        // Normalizar fechas: la API devuelve ISO, el input[date] necesita YYYY-MM-DD
        const toInputDate = (v: string | null) =>
          v ? new Date(v).toISOString().split("T")[0] : "";

        setForm({
          type:                    d.type                     || "CLIENTE",
          client_status:           d.client_status            || "Alta",
          document_type:           d.document_type            || "DNI",
          first_name:              d.first_name               || "",
          last_name:               d.last_name                || "",
          nif_cif:                 d.nif_cif                  || "",
          gender:                  d.gender                   || "",
          birth_date:              toInputDate(d.birth_date),
          nationality:             d.nationality              || "Española",
          expedition_country:      d.expedition_country       || "España",
          legal_nature:            d.legal_nature             || "",
          commercial_name:         d.commercial_name          || "",
          address_street:          d.address_street           || "",
          address_town:            d.address_town             || "",
          address_cp:              d.address_cp               || "",
          address_province:        d.address_province         || "",
          address_country:         d.address_country          || "España",
          email:                   d.email                    || "",
          phone_1:                 d.phone_1                  || "",
          phone_2:                 d.phone_2                  || "",
          phone_3:                 d.phone_3                  || "",
          phone_mobile:            d.phone_mobile             || "",
          phone_fax:               d.phone_fax                || "",
          website:                 d.website                  || "",
          date_alta:               toInputDate(d.date_alta) || new Date().toISOString().split("T")[0],
          date_baja:               toInputDate(d.date_baja),
          lopd:                    d.lopd                     || "Pendiente",
          commercial_communications: d.commercial_communications || "No",
          center:                  d.center                   || "",
          photo_url:               d.photo_url                || "",
        });
        if (d.photo_url) setPhotoPreview(d.photo_url);
      } catch (err: any) {
        setLoadError(err.message);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [id]);

  const age = form.birth_date
    ? Math.floor((Date.now() - new Date(form.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setFilledFields(p => { const n = new Set(p); n.delete(name); return n; });
  };

  // ── Photo ────────────────────────────────────────────────
  const handlePhoto = async (file: File) => {
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const base64 = await resizeImageToBase64(file);
      setForm(p => ({ ...p, photo_url: base64 }));
    } catch (_e) { /* ignorar error de conversión */ }
  };

  // ── DNI scanner ──────────────────────────────────────────
  const handleDniFile = (file: File) => {
    setDniFile(file);
    setScanDone(false); setScanError("");
    setDniImage(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleDniFile(file);
  }, []);

  const handleScanDNI = async () => {
    if (!dniFile) return;
    setScanning(true); setScanError("");
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      fd.append("dni_image", dniFile);
      const response = await fetch("/api/ocr/dni", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const result = await safeJson(response);
      if (!response.ok) throw new Error(result.error);

      const data = result.data;
      const filled = new Set<string>();
      setForm(prev => {
        const u = { ...prev };
        if (data.first_name   && !prev.first_name)   { u.first_name   = data.first_name;   filled.add("first_name"); }
        if (data.last_name    && !prev.last_name)     { u.last_name    = data.last_name;    filled.add("last_name"); }
        if (data.nif_cif      && !prev.nif_cif)       { u.nif_cif      = data.nif_cif;      filled.add("nif_cif"); }
        if (data.birth_date   && !prev.birth_date)    { u.birth_date   = data.birth_date;   filled.add("birth_date"); }
        if (data.address_town && !prev.address_town)  { u.address_town = data.address_town; filled.add("address_town"); }
        return u;
      });
      setFilledFields(filled);
      setScanDone(true);
    } catch (err: any) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const clearDni = () => {
    setDniImage(null); setDniFile(null);
    setScanDone(false); setScanError("");
    setFilledFields(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Submit (POST crear / PUT editar) ─────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.nif_cif) {
      setError("Nombre y NIF/CIF son obligatorios.");
      return;
    }
    setLoading(true); setError("");
    try {
      const token = await getToken({ skipCache: true });
      const url    = isEdit ? `/api/entities/${id}` : "/api/entities";
      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || "Error al guardar");

      setShowSuccess(true);
      const returnId = isEdit ? id : data.data?.id;
      setTimeout(() => navigate(returnId ? `/dashboard/clientes/${returnId}` : "/dashboard/clientes"), 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const h = (name: string) => filledFields.has(name);

  // ── Loading skeleton al cargar datos de edición ──────────
  if (loadingData) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm animate-pulse">Cargando datos del cliente...</p>
    </div>
  );

  if (loadError) return (
    <div className="space-y-4">
      <Link to="/dashboard/clientes" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Volver
      </Link>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertTriangle size={20} className="shrink-0" />
        <span className="text-sm">{loadError}</span>
      </div>
    </div>
  );

  return (
    <div className="flex gap-6 animate-in fade-in duration-500">

      {/* ── COLUMNA PRINCIPAL ─────────────────────────────── */}
      <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-4">

        {/* Cabecera */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link
              to={isEdit ? `/dashboard/clientes/${id}` : "/dashboard/clientes"}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                {isEdit ? <><Edit3 size={18} className="text-red-600" /> Editar cliente</> : "Nuevo cliente"}
              </h1>
              <p className="text-slate-400 text-xs">
                {isEdit ? "Modifica los datos y pulsa Guardar cambios" : "Ficha de alta · todos los campos son editables"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={isEdit ? `/dashboard/clientes/${id}` : "/dashboard/clientes"}>
              <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                <X size={15} /> Cancelar
              </button>
            </Link>
            <button
              type="submit" disabled={loading || showSuccess}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-md shadow-red-200 active:scale-95 transition-all"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                : <><Save size={14} /> {isEdit ? "Guardar cambios" : "Guardar"}</>
              }
            </button>
          </div>
        </div>

        {showSuccess && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium">
            <CheckCircle2 size={18} className="shrink-0" />
            {isEdit ? "¡Cambios guardados! Volviendo a la ficha..." : "¡Cliente registrado! Redirigiendo..."}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertTriangle size={18} className="shrink-0" /> {error}
          </div>
        )}

        {/* ── SCANNER DNI (solo en alta) ────────────────────── */}
        {!isEdit && (
          <div className="bg-slate-900 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-red-600 rounded-md"><ScanLine size={14} /></div>
              <span className="text-sm font-bold">Lector de DNI</span>
              <span className="ml-auto text-[10px] bg-white/10 border border-white/20 px-2 py-0.5 rounded-full">Tesseract OCR · Local</span>
            </div>
            <div className="flex gap-4 items-start">
              <div
                onClick={!dniImage ? () => fileInputRef.current?.click() : undefined}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                className={`relative w-40 h-24 rounded-lg border-2 overflow-hidden shrink-0 transition-all
                  ${dniImage ? "border-slate-600" : isDragOver ? "border-red-400 bg-red-500/10 cursor-copy scale-105" : "border-slate-600 border-dashed hover:border-red-400 cursor-pointer"}`}
              >
                {dniImage ? (
                  <>
                    <img src={dniImage} alt="DNI" className="w-full h-full object-cover" />
                    {scanning && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-full h-0.5 bg-red-500/30 relative overflow-hidden">
                          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-red-400 to-transparent animate-scan" />
                        </div>
                      </div>
                    )}
                    {scanDone && !scanning && (
                      <div className="absolute inset-0 bg-emerald-900/60 flex items-center justify-center">
                        <CheckCircle2 size={24} className="text-emerald-300" />
                      </div>
                    )}
                    <button type="button" onClick={clearDni}
                      className="absolute top-1 right-1 h-5 w-5 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center">
                      <X size={10} />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-1.5 text-slate-500 p-2 text-center">
                    <ImageIcon size={20} className="opacity-40" />
                    <p className="text-[10px] leading-tight">Arrastra o pulsa para subir foto del DNI</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleDniFile(e.target.files[0])} />

              <div className="flex-1 space-y-2">
                <p className="text-slate-400 text-xs">Sube una foto del anverso del DNI. El OCR leerá los datos y rellenará el formulario automáticamente.</p>
                {scanError && (
                  <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">
                    <AlertTriangle size={12} /> {scanError}
                  </div>
                )}
                {scanDone && !scanError && (
                  <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs">
                    <Sparkles size={12} /> {filledFields.size} campos rellenados automáticamente
                  </div>
                )}
                <div className="flex gap-2">
                  {!dniImage ? (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg border border-white/10">
                      <Upload size={12} /> Subir foto
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={handleScanDNI} disabled={scanning || scanDone}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg active:scale-95 transition-all">
                        {scanning ? <><Loader2 size={12} className="animate-spin" /> Leyendo...</> : scanDone ? <><CheckCircle2 size={12} /> Completado</> : <><ScanLine size={12} /> Escanear</>}
                      </button>
                      {scanDone && (
                        <button type="button" onClick={handleScanDNI}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-bold rounded-lg border border-white/10">
                          <RotateCcw size={12} /> Re-escanear
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FOTO DE PERFIL + IDENTIFICACIÓN ──────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Identificación</h3>
          </div>
          <div className="p-4 flex gap-5">
            {/* Avatar */}
            <div className="shrink-0">
              <div
                onClick={() => photoInputRef.current?.click()}
                className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-200 hover:border-red-400 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all group bg-slate-50 hover:bg-red-50"
              >
                {photoPreview
                  ? <img src={photoPreview} alt="Foto" className="w-full h-full object-cover" />
                  : <><Camera size={20} className="text-slate-300 group-hover:text-red-400 transition-colors" /><p className="text-[9px] text-slate-300 mt-1">Foto</p></>
                }
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
            </div>

            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
              <F label="Tipo documento">
                <S name="document_type" value={form.document_type} onChange={handleChange}>
                  <option>DNI</option><option>NIE</option><option>Pasaporte</option><option>CIF</option><option>Otro</option>
                </S>
              </F>
              <F label="NIF / CIF" required>
                <I name="nif_cif" value={form.nif_cif} onChange={handleChange} placeholder="12345678Z" highlight={h("nif_cif")} required />
              </F>
              <F label="Tipo cliente">
                <S name="type" value={form.type} onChange={handleChange}>
                  <option value="CLIENTE">Cliente</option>
                  <option value="CONTRARIO">Contrario</option>
                  <option value="JUZGADO">Juzgado</option>
                  <option value="PERITO">Perito</option>
                  <option value="PROVEEDOR">Proveedor</option>
                </S>
              </F>
              <F label="Naturaleza jurídica">
                <S name="legal_nature" value={form.legal_nature} onChange={handleChange}>
                  <option value="">—</option>
                  <option>Física</option><option>Jurídica</option><option>Autónomo</option>
                </S>
              </F>

              <F label="Nombre / Razón social" required>
                <I name="first_name" value={form.first_name} onChange={handleChange} placeholder="Nombre" highlight={h("first_name")} required className="md:col-span-2" />
              </F>
              <F label="Apellidos">
                <I name="last_name" value={form.last_name} onChange={handleChange} placeholder="Apellidos" highlight={h("last_name")} />
              </F>
              <F label="Nombre comercial">
                <I name="commercial_name" value={form.commercial_name} onChange={handleChange} placeholder="Ej: Transportes S.L." />
              </F>
              <F label="Sexo">
                <S name="gender" value={form.gender} onChange={handleChange}>
                  <option value="">—</option><option value="M">Masculino</option><option value="F">Femenino</option><option value="O">Otro</option>
                </S>
              </F>

              <F label="Fecha nacimiento">
                <I type="date" name="birth_date" value={form.birth_date} onChange={handleChange} highlight={h("birth_date")} />
              </F>
              <F label="Edad">
                <I value={age !== null ? `${age} años` : ""} readOnly className="bg-slate-50 text-slate-400" />
              </F>
              <F label="Nacionalidad">
                <I name="nationality" value={form.nationality} onChange={handleChange} />
              </F>
              <F label="País de expedición">
                <S name="expedition_country" value={form.expedition_country} onChange={handleChange}>
                  {PAISES.map(p => <option key={p}>{p}</option>)}
                </S>
              </F>
            </div>
          </div>
        </div>

        {/* ── DIRECCIÓN ─────────────────────────────────────── */}
        <Section title="Dirección">
          <div className="col-span-2 md:col-span-2">
            <F label="Dirección"><I name="address_street" value={form.address_street} onChange={handleChange} placeholder="Calle, número, piso..." /></F>
          </div>
          <F label="Población">
            <I name="address_town" value={form.address_town} onChange={handleChange} placeholder="Ciudad" highlight={h("address_town")} />
          </F>
          <F label="Código postal">
            <I name="address_cp" value={form.address_cp} onChange={handleChange} placeholder="28000" />
          </F>
          <F label="Provincia">
            <S name="address_province" value={form.address_province} onChange={handleChange}>
              <option value="">— Selecciona —</option>
              {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
            </S>
          </F>
          <F label="País">
            <S name="address_country" value={form.address_country} onChange={handleChange}>
              {PAISES.map(p => <option key={p}>{p}</option>)}
            </S>
          </F>
        </Section>

        {/* ── CONTACTO ──────────────────────────────────────── */}
        <Section title="Contacto">
          <div className="col-span-2">
            <F label="Correo electrónico"><I type="email" name="email" value={form.email} onChange={handleChange} placeholder="cliente@email.com" /></F>
          </div>
          <F label="Teléfono"><I name="phone_1" value={form.phone_1} onChange={handleChange} placeholder="900 000 000" /></F>
          <F label="Móvil"><I name="phone_mobile" value={form.phone_mobile} onChange={handleChange} placeholder="600 000 000" /></F>
          <F label="Teléfono 2"><I name="phone_2" value={form.phone_2} onChange={handleChange} placeholder="—" /></F>
          <F label="Teléfono 3"><I name="phone_3" value={form.phone_3} onChange={handleChange} placeholder="—" /></F>
          <F label="Fax"><I name="phone_fax" value={form.phone_fax} onChange={handleChange} placeholder="—" /></F>
          <div className="col-span-2 md:col-span-3">
            <F label="Página web"><I name="website" value={form.website} onChange={handleChange} placeholder="https://www.empresa.com" /></F>
          </div>
        </Section>

        {/* ── ADMINISTRACIÓN ────────────────────────────────── */}
        <Section title="Administración">
          <F label="Estado">
            <S name="client_status" value={form.client_status} onChange={handleChange}>
              <option>Alta</option><option>Baja</option><option>Suspendido</option><option>Potencial</option>
            </S>
          </F>
          <F label="Fecha alta">
            <I type="date" name="date_alta" value={form.date_alta} onChange={handleChange} />
          </F>
          <F label="Fecha baja">
            <I type="date" name="date_baja" value={form.date_baja} onChange={handleChange} />
          </F>
          <F label="Centro">
            <I name="center" value={form.center} onChange={handleChange} placeholder="—" />
          </F>
          <F label="LOPD">
            <S name="lopd" value={form.lopd} onChange={handleChange}>
              <option>Pendiente</option><option>Firmado</option><option>Rechazado</option><option>No aplica</option>
            </S>
          </F>
          <F label="Comunicaciones comerciales">
            <S name="commercial_communications" value={form.commercial_communications} onChange={handleChange}>
              <option>No</option><option>Sí</option>
            </S>
          </F>
        </Section>

        {filledFields.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700">
            <Sparkles size={14} className="shrink-0 text-emerald-500" />
            Los campos resaltados en verde fueron rellenados por el OCR. Revísalos antes de guardar.
          </div>
        )}
      </form>

      {/* ── PANEL INDICADORES ─────────────────────────────── */}
      <aside className="w-52 shrink-0 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-6">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</h3>
          </div>
          <div className="px-4 py-3">
            <Indicador label="Expedientes" value="—" />
            <Indicador label="Expedientes abiertos" value="—" />
            <Indicador label="Días sin actuaciones" value="—" />
            <Indicador label="Actuaciones atrasadas" value="—" />
            <Indicador label="Días morosidad" value="—" />
            <Indicador label="Domicilio económico" value="No" color="text-red-500" />
            <Indicador label="Domicilio historial" value="No" color="text-red-500" />
          </div>
          <div className="px-4 pb-3">
            <p className="text-[10px] text-slate-300 italic">
              {isEdit ? "Vuelve a la ficha para ver los indicadores" : "Disponible tras guardar el cliente"}
            </p>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-scan { animation: scan 1.2s linear infinite; }
      `}</style>
    </div>
  );
}
