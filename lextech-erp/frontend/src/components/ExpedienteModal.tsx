import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen, Loader2, Paperclip, Activity, FileSpreadsheet,
  Users, ClipboardList, MoreHorizontal,
  Upload, Trash2, Eye, Download, ExternalLink, Maximize2,
} from "lucide-react";
import AppSelect from "./AppSelect";
import { useAuth } from "@clerk/clerk-react";
import { safeJson } from "../lib/api";
import AdjuntosModal from "./AdjuntosModal";
import BackButton from "./BackButton";

// ── Constantes compartidas ────────────────────────────────────
export const TIPOS: Record<string, { label: string; short: string; color: string }> = {
  judicial:         { label: "Expediente Judicial",        short: "JUDICIAL",      color: "bg-blue-100 text-blue-700" },
  extrajudicial:    { label: "Expediente Extrajudicial",    short: "EXTRAJUDICIAL", color: "bg-indigo-100 text-indigo-700" },
  monitorio:        { label: "Monitorio",                  short: "MONITORIO",     color: "bg-amber-100 text-amber-700" },
  obligacion_hacer: { label: "Obligación de Hacer",        short: "OBLIG. HACER",  color: "bg-orange-100 text-orange-700" },
  prejudicial:      { label: "Prejudicial",                short: "PREJUDICIAL",   color: "bg-purple-100 text-purple-700" },
  diligencias:      { label: "Diligencias Previas",        short: "DILIGENCIAS",   color: "bg-rose-100 text-rose-700" },
  penal:            { label: "Penal",                      short: "PENAL",         color: "bg-red-100 text-red-700" },
  laboral:          { label: "Laboral",                    short: "LABORAL",       color: "bg-teal-100 text-teal-700" },
  contencioso:      { label: "Contencioso-Administrativo", short: "CONTENCIOSO",   color: "bg-cyan-100 text-cyan-700" },
  otro:             { label: "Otro",                       short: "OTRO",          color: "bg-slate-100 text-slate-500" },
};

export const ESTADOS: Record<string, { label: string; color: string }> = {
  abierto:    { label: "Abierto",    color: "bg-emerald-100 text-emerald-700" },
  cerrado:    { label: "Cerrado",    color: "bg-slate-100 text-slate-500" },
  suspendido: { label: "Suspendido", color: "bg-amber-100 text-amber-700" },
  archivado:  { label: "Archivado",  color: "bg-red-100 text-red-600" },
};

export const ETAPAS = ["", "Inicio", "Instrucción", "Juicio Oral", "Ejecución", "Apelación", "Casación", "Archivo"];

export const COLORES = [
  { value: "ninguno",  label: "□ Ninguno" },
  { value: "rojo",     label: "Rojo" },
  { value: "azul",     label: "Azul" },
  { value: "verde",    label: "Verde" },
  { value: "amarillo", label: "Amarillo" },
  { value: "naranja",  label: "Naranja" },
  { value: "morado",   label: "Morado" },
];

export const EXP_EMPTY = {
  anio: new Date().getFullYear(),
  ref_propia: "", ref_expediente: "", descripcion: "",
  tipo: "judicial", cliente_id: "", cliente_nombre: "",
  contrario: "", procurador: "", juzgado: "", tipo_proc: "",
  num_autos: "", nig: "", estado: "abierto", observaciones: "",
  fecha_inicio: new Date().toISOString().slice(0, 10), fecha_cierre: "",
  fecha_notificacion: "",
  importe: "",
  tipos_asunto: "", cuantia_principal: "", intereses: "", costas: "",
  cuantia_total: "", indeterminado: false as boolean | string, etapa: "",
  persona_contacto: "", contacto: "", centro: "", color: "ninguno",
  // Campos multi-parte (usados en la vista de verificación de importación)
  demandantes: [] as string[],
  demandados:  [] as string[],
  representacion_contraria: [] as Array<{ nombre: string; rol: string; colegiado: string }>,
  // Representación legal
  abogado_propio:        "",
  abogado_contrario:     "",
  procurador_contrario:  "",
  // Campos intermedios de extracción IA (calculan propio/contrario según representaA)
  abogado_demandante:    "",
  abogado_demandado:     "",
  procurador_demandante: "",
  procurador_demandado:  "",
};

const TIPOS_ASUNTO_GROUPS: Array<{ label: string; items: string[] }> = [
  {
    label: "General",
    items: [
      "CIVIL",
      "PENAL",
      "SOCIAL",
      "CONTENCIOSO - ADMINISTRATIVO",
      "EXTRAJUDICIAL",
      "MERCANTIL",
      "CONCURSAL",
    ],
  },
  {
    label: "Familia y persona",
    items: [
      "FAMILIA",
      "HERENCIA",
      "MENORES",
      "VIOLENCIA DE GENERO",
      "MEDIDAS DE APOYO A PERSONAS CON DISCAPACIDAD",
    ],
  },
  {
    label: "Administrativo y plazos",
    items: [
      "VIA ADMINISTRATIVA",
      "CONTESTACION A LA DEMANDA",
      "PLAZO_APELACION",
      "FECHA_FIN_PLAZO_CONTESTAR_DEMANDA",
    ],
  },
  {
    label: "Bancario y consumo",
    items: [
      "DERECHO BANCARIO",
      "USURA Y TRANSPARENCIA - MICROCREDITOS",
    ],
  },
  {
    label: "Demandas especiales",
    items: [
      "DEMANDA ODH",
      "DEMANDA UT",
    ],
  },
];

// ── Estilos de formulario ─────────────────────────────────────
export const lbl   = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block";
export const inp   = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-white";
export const inpRO = "w-full border border-slate-100 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 bg-slate-50 cursor-default";

// ── SecCard ───────────────────────────────────────────────────
export function SecCard({ title, icon: Icon, children, cols = 3 }: {
  title: string; icon: any; children: React.ReactNode; cols?: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
        <Icon size={13} className="text-slate-400" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
      </div>
      <div className={`p-4 grid gap-3 ${cols === 4 ? "grid-cols-2 md:grid-cols-4" : cols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
        {children}
      </div>
    </div>
  );
}

// ── Tab keys ──────────────────────────────────────────────────
export type TabKey = "notas" | "adjuntos" | "clientes" | "contrarios" | "juzgados" | "historial" | "tareas";

export const BOTTOM_TABS: { key: TabKey; label: string }[] = [
  { key: "notas",      label: "Notas" },
  { key: "adjuntos",   label: "Adjuntos" },
  { key: "clientes",   label: "Clientes" },
  { key: "contrarios", label: "Contrarios" },
  { key: "juzgados",   label: "Juzgados" },
  { key: "historial",  label: "Historial Expediente" },
  { key: "tareas",     label: "Tareas-Plazos" },
];

// ── helpers locales ──────────────────────────────────────────
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function fileEmoji(mime: string, name: string) {
  const n = name.toLowerCase();
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word") || n.endsWith(".doc") || n.endsWith(".docx")) return "📝";
  if (mime.includes("excel") || mime.includes("spreadsheet") || n.endsWith(".xlsx") || n.endsWith(".xls")) return "📊";
  if (mime.startsWith("text/")) return "📃";
  return "📎";
}

// ── AdjuntosPanel — lista inline de adjuntos para el panel inferior ──
export function AdjuntosPanel({ entityId, entityName, onOpenFull }: {
  entityId: string;
  entityName: string;
  onOpenFull: () => void;
}) {
  const { getToken } = useAuth();
  const [files, setFiles]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isDrag, setIsDrag]         = useState(false);
  const fileRef                     = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setFiles(data.data || []);
      else setError(data?.error || "Error al cargar");
    } catch (e: any) { setError(e?.message || "Error de conexión"); }
    finally { setLoading(false); }
  }, [entityId, getToken]);

  useEffect(() => { load(); }, [load]);

  const upload = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      arr.forEach(f => fd.append("files", f));
      const res = await fetch(`/api/files/${entityId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || `Error ${res.status}`);
      } else {
        await load();
        window.dispatchEvent(new CustomEvent("historial-changed"));
      }
    } catch (e: any) { setError(e?.message || "Error al subir"); }
    finally { setUploading(false); }
  };

  const del = async (fileId: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${fileId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setFiles(p => p.filter(f => f.id !== fileId)); window.dispatchEvent(new CustomEvent("historial-changed")); }
      else { const d = await res.json().catch(() => ({})); setError(d?.error || "Error al eliminar"); }
    } catch (e: any) { setError(e?.message || "Error al eliminar"); }
  };

  const downloadFile = async (fileId: string, fileName: string) => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (_) {}
  };

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
      onDragEnter={e => { e.preventDefault(); setIsDrag(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDrag(false); }}
      onDrop={e => { e.preventDefault(); setIsDrag(false); upload(e.dataTransfer.files); }}
    >
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 shrink-0 bg-slate-50">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
          Subir
        </button>
        <span className="text-[11px] text-slate-400">{loading ? "Cargando…" : `${files.length} archivo${files.length !== 1 ? "s" : ""}`}</span>
        {error && <span className="text-[11px] text-red-600 font-medium truncate flex-1">{error}</span>}
        <button
          onClick={onOpenFull}
          title="Abrir en ventana completa"
          className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <Maximize2 size={11} /> Ventana completa
        </button>
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={e => { if (e.target.files) { upload(e.target.files); e.target.value = ""; } }} />
      </div>

      {/* file list */}
      <div className="flex-1 overflow-y-auto relative">
        {isDrag && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-50/95 border-2 border-dashed border-red-400 rounded pointer-events-none">
            <Upload size={24} className="text-red-500 mb-1 animate-bounce" />
            <p className="text-xs font-bold text-red-600">Suelta para subir</p>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-red-400" /></div>
        ) : files.length === 0 ? (
          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 cursor-pointer hover:text-slate-400 transition-colors group"
          >
            <Upload size={24} className="group-hover:text-red-400 transition-colors" />
            <span className="text-xs font-medium">Sin adjuntos — haz clic o arrastra archivos</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
              <tr>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">Tipo</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tamaño</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Fecha</th>
                <th className="px-3 py-1.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {files.map((f: any) => (
                <tr key={f.id} className="bg-white hover:bg-slate-50/60 group transition-colors">
                  <td className="px-3 py-1.5 max-w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm shrink-0">{fileEmoji(f.mimetype, f.original_name)}</span>
                      <span className="text-xs font-medium text-slate-700 truncate" title={f.document_name || f.original_name}>
                        {f.document_name || f.original_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 hidden sm:table-cell">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      {f.attachment_type || "Sin clasificar"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-400 whitespace-nowrap hidden md:table-cell">{fmtSize(f.size_bytes)}</td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-400 whitespace-nowrap hidden md:table-cell">
                    {new Date(f.created_at).toLocaleDateString("es-ES")}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => downloadFile(f.id, f.original_name)}
                        title="Descargar"
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      ><Download size={12} /></button>
                      <button
                        onClick={() => del(f.id, f.document_name || f.original_name)}
                        title="Eliminar"
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      ><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Modal de alta / edición ───────────────────────────────────
export function ExpedienteModal({ initial, editId, clientes, onSave, onClose, saving }: {
  initial: typeof EXP_EMPTY;
  editId?: string;
  clientes: any[];
  onSave: (d: typeof EXP_EMPTY) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm]     = useState(initial);
  const [tab, setTab]       = useState<TabKey>("notas");
  const [showAdj, setShowAdj] = useState(false);
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleClienteChange = (id: string) => {
    const c = clientes.find((x: any) => x.id === id);
    set("cliente_id", id);
    set("cliente_nombre", c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : "");
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">

      {/* ── Cabecera ── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2.5 mr-2">
          <div className="p-2 bg-red-50 rounded-xl">
            <FolderOpen size={16} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              {editId
                ? `Expediente ${form.anio}/${(form as any).num_exp || "—"}`
                : "Nuevo expediente"}
            </h1>
            <p className="text-[10px] text-slate-400">
              {form.descripcion || "Rellena los datos del expediente"}
            </p>
          </div>
        </div>

        <div className="w-px h-6 bg-slate-200 mx-1" />

        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.descripcion.trim() || !form.cliente_id}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl shadow-sm active:scale-95 transition-all">
          {saving && <Loader2 size={13} className="animate-spin" />}
          {editId ? "Guardar cambios" : "Crear expediente"}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
          Cancelar
        </button>

        <div className="w-px h-6 bg-slate-200 mx-1" />

        <button
          onClick={() => editId && setShowAdj(true)}
          disabled={!editId}
          title={!editId ? "Guarda el expediente primero" : "Adjuntos"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            editId ? "text-slate-600 hover:bg-slate-100 cursor-pointer" : "text-slate-300 cursor-not-allowed"
          }`}
        >
          <Paperclip size={12} /> Adjuntos
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <Activity size={12} /> Historial
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <FileSpreadsheet size={12} /> Económico
        </button>

        <div className="ml-auto">
          <BackButton onClick={onClose} />
        </div>
      </div>

      {/* ── Cuerpo ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Columna izquierda */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-w-0">

          <SecCard title="Identificación" icon={FolderOpen} cols={4}>
            <div>
              <label className={lbl}>Núm. Exp</label>
              <input value={(form as any).num_exp || (editId ? "—" : "Auto")} readOnly className={inpRO} />
            </div>
            <div>
              <label className={lbl}>Año</label>
              <input type="number" value={form.anio}
                onChange={e => set("anio", parseInt(e.target.value) || new Date().getFullYear())}
                className={inp} min={2000} max={2100} />
            </div>
            <div>
              <label className={lbl}>Fecha Alta</label>
              <input type="date" value={form.fecha_inicio}
                onChange={e => set("fecha_inicio", e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Estado</label>
              <AppSelect value={form.estado} onChange={e => set("estado", e.target.value)} searchable searchPlaceholder="Buscar estado...">
                {Object.entries(ESTADOS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </AppSelect>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Descripción Expediente *</label>
              <input value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
                placeholder="Ej: Reclamación de cantidad contra BBVA" className={inp} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Tipo de Expediente</label>
              <AppSelect value={form.tipo} onChange={e => set("tipo", e.target.value)} searchable searchPlaceholder="Buscar tipo de expediente...">
                {Object.entries(TIPOS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </AppSelect>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Tipos de Asunto</label>
              <AppSelect value={form.tipos_asunto} onChange={e => set("tipos_asunto", e.target.value)} searchable searchPlaceholder="Buscar tipo de asunto...">
                <option value="">— Seleccionar —</option>
                <option value="CIVIL">CIVIL</option>
                <option value="PENAL">PENAL</option>
                <option value="SOCIAL">SOCIAL</option>
                <option value="CONTENCIOSO - ADMINISTRATIVO">CONTENCIOSO - ADMINISTRATIVO</option>
                <option value="EXTRAJUDICIAL">EXTRAJUDICIAL</option>
                <option value="DERECHO BANCARIO">DERECHO BANCARIO</option>
                <option value="FAMILIA">FAMILIA</option>
                <option value="VÍA ADMINISTRATIVA">VÍA ADMINISTRATIVA</option>
                <option value="HERENCIA">HERENCIA</option>
                <option value="MENORES">MENORES</option>
                <option value="VIOLENCIA DE GÉNERO">VIOLENCIA DE GÉNERO</option>
                <option value="CONCURSAL">CONCURSAL</option>
                <option value="MERCANTIL">MERCANTIL</option>
                <option value="MEDIDAS DE APOYO A PERSONAS CON DISCAPACIDAD">MEDIDAS DE APOYO A PERSONAS CON DISCAPACIDAD</option>
                <option value="USURA Y TRANSPARENCIA - MICROCREDITOS">USURA Y TRANSPARENCIA - MICROCREDITOS</option>
                <option value="FECHA_FIN_PLAZO_CONTESTAR_DEMANDA">FECHA_FIN_PLAZO_CONTESTAR_DEMANDA</option>
                <option value="CONTESTACIÓN A LA DEMANDA">CONTESTACIÓN A LA DEMANDA</option>
                <option value="PLAZO_APELACION">PLAZO_APELACION</option>
                <option value="DEMANDA ODH">DEMANDA ODH</option>
                <option value="DEMANDA UT">DEMANDA UT</option>
              </AppSelect>
              <p className="mt-1 text-[11px] text-slate-400">
                Puedes escribir para filtrar y encontrar el asunto mas rapido.
              </p>
            </div>
            <div>
              <label className={lbl}>Etapa</label>
              <AppSelect value={form.etapa} onChange={e => set("etapa", e.target.value)} searchable searchPlaceholder="Buscar etapa...">
                {ETAPAS.map(et => <option key={et} value={et}>{et || "— Seleccionar —"}</option>)}
              </AppSelect>
            </div>
            <div>
              <label className={lbl}>Fecha Cierre</label>
              <input type="date" value={form.fecha_cierre}
                onChange={e => set("fecha_cierre", e.target.value)} className={inp} />
            </div>
          </SecCard>

          <SecCard title="Procedimiento judicial" icon={Users} cols={3}>
            <div>
              <label className={lbl}>Tipo de Procedimiento</label>
              <input value={form.tipo_proc} onChange={e => set("tipo_proc", e.target.value)}
                placeholder="Monitorio, Ordinario…" className={inp} />
            </div>
            <div>
              <label className={lbl}>Juzgado / Tribunal</label>
              <input value={form.juzgado} onChange={e => set("juzgado", e.target.value)}
                placeholder="Juzgado de 1ª Inst. nº 3 de Madrid" className={inp} />
            </div>
            <div>
              <label className={lbl}>Procurador Propio</label>
              <input value={form.procurador} onChange={e => set("procurador", e.target.value)}
                placeholder="Nombre del procurador" className={inp} />
            </div>
            <div>
              <label className={lbl}>N.I.G.</label>
              <input value={form.nig} onChange={e => set("nig", e.target.value)}
                placeholder="2809042120240001302" className={inp} />
            </div>
            <div>
              <label className={lbl}>Núm. Autos</label>
              <input value={form.num_autos} onChange={e => set("num_autos", e.target.value)}
                placeholder="1302/2024" className={inp} />
            </div>
          </SecCard>

          <SecCard title="Cuantías económicas" icon={ClipboardList} cols={4}>
            <div>
              <label className={lbl}>Cuantía Principal (€)</label>
              <input type="number" value={form.cuantia_principal}
                onChange={e => set("cuantia_principal", e.target.value)}
                placeholder="0.00" step="0.01" className={inp} />
            </div>
            <div>
              <label className={lbl}>Intereses (€)</label>
              <input type="number" value={form.intereses}
                onChange={e => set("intereses", e.target.value)}
                placeholder="0.00" step="0.01" className={inp} />
            </div>
            <div>
              <label className={lbl}>Costas (€)</label>
              <input type="number" value={form.costas}
                onChange={e => set("costas", e.target.value)}
                placeholder="0.00" step="0.01" className={inp} />
            </div>
            <div>
              <label className={lbl}>Cuantía Total (€)</label>
              <input type="number" value={form.cuantia_total}
                onChange={e => set("cuantia_total", e.target.value)}
                placeholder="0.00" step="0.01" className={inp} />
            </div>
            <div>
              <label className={lbl}>Importe (€)</label>
              <input type="number" value={form.importe}
                onChange={e => set("importe", e.target.value)}
                placeholder="0.00" step="0.01" className={inp} />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none font-medium">
                <input type="checkbox"
                  checked={form.indeterminado === true || form.indeterminado === "true"}
                  onChange={e => set("indeterminado", e.target.checked)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-400" />
                Cuantía indeterminada
              </label>
            </div>
          </SecCard>

          <SecCard title="Referencias y datos internos" icon={MoreHorizontal} cols={4}>
            <div>
              <label className={lbl}>Ref. Propia</label>
              <input value={form.ref_propia} onChange={e => set("ref_propia", e.target.value)}
                placeholder="2024-CIVIL-001" className={inp} />
            </div>
            <div>
              <label className={lbl}>Ref. Expediente</label>
              <input value={form.ref_expediente} onChange={e => set("ref_expediente", e.target.value)}
                placeholder="REF-EXP-001" className={inp} />
            </div>
            <div>
              <label className={lbl}>Centro</label>
              <input value={form.centro} onChange={e => set("centro", e.target.value)}
                placeholder="Oficina / Centro" className={inp} />
            </div>
            <div>
              <label className={lbl}>Color</label>
              <AppSelect value={form.color} onChange={e => set("color", e.target.value)}>
                {COLORES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </AppSelect>
            </div>
          </SecCard>

        </div>

        {/* Columna derecha */}
        <div className="w-80 shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            <div className="flex items-center gap-2 mb-1">
              <Users size={13} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Partes</span>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Cliente</span>
              </div>
              <div className="p-3 space-y-2.5">
                <div>
                  <label className={lbl}>Nombre <span className="text-red-500">*</span></label>
                  <AppSelect
                    value={form.cliente_id}
                    onChange={e => handleClienteChange(e.target.value)}
                    required
                    variant="emerald"
                  >
                    <option value="" disabled>— Selecciona un cliente —</option>
                    {clientes.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.commercial_name || c.nif_cif}
                      </option>
                    ))}
                  </AppSelect>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/30 overflow-hidden">
              <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Parte Contraria</span>
              </div>
              <div className="p-3">
                <label className={lbl}>Nombre / Razón social</label>
                <input value={form.contrario} onChange={e => set("contrario", e.target.value)}
                  placeholder="Nombre de la parte contraria"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-white" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-1">
              <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <Activity size={13} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</span>
              </div>
              <div className="px-3 py-2">
                {([
                  ["Días sin actuaciones", "0 días", "text-slate-700"],
                  ["Total cobrado",        "0 €",    "text-emerald-600"],
                  ["Imp. Cobros Pdtes.",   "0 €",    "text-amber-600"],
                  ["Total Prov. Recibidas","0 €",    "text-slate-600"],
                  ["Nº Exptes Relac.",     "0",      "text-blue-600"],
                  ["Saldo Total Exp",      "0 €",    "text-slate-700"],
                  ["Pdte. Facturar",       "0 €",    "text-red-600"],
                ] as [string, string, string][]).map(([label, value, color]) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={`text-xs font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Panel inferior (solo en edición) ── */}
      {editId && (
        <div className="border-t border-slate-200 shrink-0 bg-white flex flex-col" style={{ height: 240 }}>
          <div className="flex items-end overflow-x-auto shrink-0 border-b border-slate-100 bg-slate-50 px-2 pt-2 gap-0.5">
            {BOTTOM_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg border border-b-0 transition-colors shrink-0
                  ${tab === t.key
                    ? "bg-white border-slate-200 text-red-700 shadow-sm"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/70"}`}>
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center pr-1 pb-1">
              <span className="text-[10px] text-slate-300 italic">Más pestañas próximamente</span>
            </div>
          </div>
          <div className={`flex-1 overflow-hidden bg-white ${tab !== "adjuntos" ? "overflow-y-auto p-4" : ""}`}>
            {tab === "notas" ? (
              <textarea
                value={form.observaciones}
                onChange={e => set("observaciones", e.target.value)}
                placeholder="Escribe aquí las notas internas del expediente…"
                className="w-full h-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 resize-none placeholder:text-slate-300"
              />
            ) : tab === "adjuntos" ? (
              <AdjuntosPanel
                entityId={editId}
                entityName={form.descripcion || `Expediente ${form.anio}`}
                onOpenFull={() => setShowAdj(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
                <FolderOpen size={28} className="opacity-20" />
                <span className="text-xs font-medium">Sin datos por ahora</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
