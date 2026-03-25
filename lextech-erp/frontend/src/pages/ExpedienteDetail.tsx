import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  ArrowLeft, Edit3, Loader2, AlertCircle, FolderOpen,
  Users, ClipboardList, MoreHorizontal, Activity,
  Paperclip, RefreshCw,
} from "lucide-react";
import { safeJson } from "../lib/api";
import {
  TIPOS, ESTADOS, EXP_EMPTY, BOTTOM_TABS, TabKey,
  ExpedienteModal,
} from "../components/ExpedienteModal";

// ── Helpers de visualización ──────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(v: any) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

const Section = ({ title, icon: Icon, children, cols = 3 }: {
  title: string; icon: any; children: React.ReactNode; cols?: number;
}) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <Icon size={13} className="text-slate-400" />
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
    </div>
    <div className={`p-4 grid gap-4 ${cols === 4 ? "grid-cols-2 md:grid-cols-4" : cols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
      {children}
    </div>
  </div>
);

const Field = ({ label, value, mono = false, wide = false }: {
  label: string; value?: string | null; mono?: boolean; wide?: boolean;
}) => (
  <div className={wide ? "col-span-2" : ""}>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
    <p className={`text-sm font-medium ${mono ? "font-mono text-slate-600" : "text-slate-700"}`}>
      {value || <span className="text-slate-300 font-normal">—</span>}
    </p>
  </div>
);

// ── Página principal ──────────────────────────────────────────
export default function ExpedienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [exp,     setExp]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<TabKey>("notas");
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);

  const fetchExp = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo cargar el expediente");
      setExp(d.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

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

  useEffect(() => { fetchExp(); fetchClientes(); }, [fetchExp, fetchClientes]);

  // ── Guardar cambios ────────────────────────────────────────
  const handleSave = async (form: typeof EXP_EMPTY) => {
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await safeJson(res);
      if (!res.ok) { alert(d.error || "Error al guardar"); return; }
      setEditing(false);
      await fetchExp();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  // ── Estados de carga ──────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm animate-pulse">Cargando expediente...</p>
    </div>
  );

  if (error) return (
    <div className="space-y-4">
      <Link to="/dashboard/expedientes" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Volver a expedientes
      </Link>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle size={20} className="shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm">Error al cargar</p>
          <p className="text-xs mt-0.5">{error}</p>
        </div>
        <button onClick={fetchExp}
          className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    </div>
  );

  if (!exp) return null;

  const tipoConf   = TIPOS[exp.tipo]   || TIPOS.otro;
  const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;

  // ── Modal de edición (overlay) ────────────────────────────
  if (editing) {
    const initial: typeof EXP_EMPTY = {
      anio:              exp.anio,
      ref_propia:        exp.ref_propia        || "",
      ref_expediente:    exp.ref_expediente    || "",
      descripcion:       exp.descripcion       || "",
      tipo:              exp.tipo              || "judicial",
      cliente_id:        exp.cliente_id        || "",
      cliente_nombre:    exp.cliente_nombre    || "",
      contrario:         exp.contrario         || "",
      procurador:        exp.procurador        || "",
      juzgado:           exp.juzgado           || "",
      tipo_proc:         exp.tipo_proc         || "",
      num_autos:         exp.num_autos         || "",
      nig:               exp.nig               || "",
      estado:            exp.estado            || "abierto",
      observaciones:     exp.observaciones     || "",
      fecha_inicio:      exp.fecha_inicio      ? exp.fecha_inicio.slice(0, 10) : "",
      fecha_cierre:      exp.fecha_cierre      ? exp.fecha_cierre.slice(0, 10) : "",
      importe:           exp.importe           ? String(exp.importe) : "",
      tipos_asunto:      exp.tipos_asunto      || "",
      cuantia_principal: exp.cuantia_principal ? String(exp.cuantia_principal) : "",
      intereses:         exp.intereses         ? String(exp.intereses)         : "",
      costas:            exp.costas            ? String(exp.costas)            : "",
      cuantia_total:     exp.cuantia_total     ? String(exp.cuantia_total)     : "",
      indeterminado:     exp.indeterminado     || false,
      etapa:             exp.etapa             || "",
      persona_contacto:  exp.persona_contacto  || "",
      contacto:          exp.contacto          || "",
      centro:            exp.centro            || "",
      color:             exp.color             || "ninguno",
      ...(exp.num_exp ? { num_exp: exp.num_exp } : {}),
    } as typeof EXP_EMPTY;

    return (
      <ExpedienteModal
        editId={id}
        initial={initial}
        clientes={clientes}
        onSave={handleSave}
        onClose={() => setEditing(false)}
        saving={saving}
      />
    );
  }

  // ── Vista de ficha (solo lectura) ─────────────────────────
  return (
    <div className="flex flex-col animate-in fade-in duration-300" style={{ height: "calc(100vh - 96px)" }}>

      {/* ── Cabecera ── */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
        <Link to="/dashboard/expedientes"
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors shrink-0">
          <ArrowLeft size={16} />
        </Link>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 border border-red-100 shrink-0">
            <FolderOpen size={15} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-800 leading-tight truncate">
              {exp.anio}/{exp.num_exp} — {exp.descripcion || "Sin descripción"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${estadoConf.color}`}>
                {estadoConf.label}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${tipoConf.color}`}>
                {tipoConf.short}
              </span>
              {exp.etapa && (
                <span className="text-[10px] text-slate-400">· {exp.etapa}</span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all shrink-0">
          <Edit3 size={12} /> Modificar
        </button>
      </div>

      {/* ── Cuerpo ── */}
      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">

        {/* Columna izquierda */}
        <div className="flex-1 overflow-y-auto space-y-4 min-w-0 pr-1">

          <Section title="Identificación" icon={FolderOpen} cols={4}>
            <Field label="Núm. Expediente" value={`${exp.anio}/${exp.num_exp}`} mono />
            <Field label="Fecha Alta"      value={fmtDate(exp.fecha_inicio)} />
            <Field label="Fecha Cierre"    value={fmtDate(exp.fecha_cierre)} />
            <Field label="Estado"          value={estadoConf.label} />
            <Field label="Descripción" value={exp.descripcion} wide />
            <Field label="Tipo"            value={tipoConf.label} />
            <Field label="Tipos de Asunto" value={exp.tipos_asunto} />
            <Field label="Etapa"           value={exp.etapa} />
          </Section>

          <Section title="Procedimiento judicial" icon={Users} cols={3}>
            <Field label="Tipo de Procedimiento" value={exp.tipo_proc} />
            <Field label="Juzgado / Tribunal"    value={exp.juzgado} />
            <Field label="Procurador Propio"     value={exp.procurador} />
            <Field label="N.I.G."                value={exp.nig} mono />
            <Field label="Núm. Autos"            value={exp.num_autos} mono />
          </Section>

          <Section title="Cuantías económicas" icon={ClipboardList} cols={4}>
            <Field label="Cuantía Principal" value={fmtMoney(exp.cuantia_principal)} />
            <Field label="Intereses"         value={fmtMoney(exp.intereses)} />
            <Field label="Costas"            value={fmtMoney(exp.costas)} />
            <Field label="Cuantía Total"     value={fmtMoney(exp.cuantia_total)} />
            <Field label="Importe"           value={fmtMoney(exp.importe)} />
            <Field label="Indeterminada"     value={exp.indeterminado ? "Sí" : "No"} />
          </Section>

          <Section title="Referencias y datos internos" icon={MoreHorizontal} cols={4}>
            <Field label="Ref. Propia"      value={exp.ref_propia} mono />
            <Field label="Ref. Expediente"  value={exp.ref_expediente} mono />
            <Field label="Centro"           value={exp.centro} />
            <Field label="Color"            value={exp.color !== "ninguno" ? exp.color : "—"} />
          </Section>

        </div>

        {/* Columna derecha */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Partes */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Users size={13} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Partes</span>
            </div>
            <div className="p-3 space-y-3">
              {/* Cliente */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 overflow-hidden">
                <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Cliente</span>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  {exp.cliente_id ? (
                    <Link
                      to={`/dashboard/clientes/${exp.cliente_id}`}
                      className="text-sm font-semibold text-blue-600 hover:underline block">
                      {exp.cliente_nombre || "—"}
                    </Link>
                  ) : (
                    <p className="text-sm text-slate-300">Sin asignar</p>
                  )}
                  {exp.persona_contacto && (
                    <p className="text-xs text-slate-500">Contacto: {exp.persona_contacto}</p>
                  )}
                  {exp.contacto && (
                    <p className="text-xs text-slate-400">{exp.contacto}</p>
                  )}
                </div>
              </div>
              {/* Contrario */}
              <div className="rounded-lg border border-red-200 bg-red-50/30 overflow-hidden">
                <div className="px-3 py-1.5 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Parte Contraria</span>
                </div>
                <div className="px-3 py-2">
                  <p className="text-sm text-slate-700 font-medium">
                    {exp.contrario || <span className="text-slate-300 font-normal">—</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Indicadores */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
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

      {/* ── Pestañas inferiores ── */}
      <div className="border-t border-slate-200 shrink-0 bg-white flex flex-col mt-4" style={{ height: 220 }}>
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
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "notas" ? (
            exp.observaciones ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{exp.observaciones}</p>
            ) : (
              <p className="text-sm text-slate-300 italic">Sin notas</p>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
              <FolderOpen size={28} className="opacity-20" />
              <span className="text-xs font-medium">Sin datos por ahora</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
