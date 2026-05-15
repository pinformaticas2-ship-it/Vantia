import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Link as LinkIcon,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import { apiFetch } from "../lib/api";

type Period = "7d" | "30d" | "90d" | "year";
type TabKey = "dashboard" | "facturas" | "gastos" | "presupuestos";
type BillingArea = "procesal" | "mercantil" | "laboral" | "familia" | "penal" | "fiscal";
type PaymentMethod = "transferencia" | "tarjeta" | "domiciliacion" | "bizum" | "efectivo";
type BillingFormType = "factura" | "gasto" | "presupuesto";

type Factura = {
  id: string;
  num: string;
  contacto: string;
  clientId: string;
  expedienteId: string;
  expedienteRef: string;
  fecha: string;
  vencimiento: string;
  total: number;
  estado: "pendiente" | "enviada" | "vencida" | "cobrada";
  area: BillingArea;
  responsable: string;
  formaPago: PaymentMethod;
  serie: string;
  tipoCliente: "empresa" | "particular";
};

type Gasto = {
  id: string;
  num: string;
  proveedor: string;
  fecha: string;
  total: number;
  cat: string;
  estado: "pendiente" | "contabilizado";
  area: BillingArea;
  responsable: string;
  deducible: boolean;
};

type Presupuesto = {
  id: string;
  num: string;
  contacto: string;
  clientId: string;
  expedienteId: string;
  expedienteRef: string;
  fecha: string;
  total: number;
  estado: "pendiente" | "aprobado" | "rechazado" | "facturado";
  area: BillingArea;
  responsable: string;
  iguala: boolean;
};

type BillingClientOption = {
  id: string;
  label: string;
  commercialName: string;
  totalExpedientes: number;
};

type BillingExpedienteOption = {
  id: string;
  clientId: string;
  label: string;
  clientLabel: string;
  description: string;
};

type QuipuStatus = {
  connected: boolean;
  baseUrl?: string;
  ownerSlug?: string;
  lastSyncAt?: string | null;
  syncSummary?: {
    contacts?: number;
    invoices?: number;
    numberingSeries?: number;
    syncedAt?: string;
  } | null;
};

type RawFactura = {
  id: string;
  num: string;
  contacto: string;
  client_id?: string | null;
  expediente_id?: string | null;
  anio?: number | null;
  num_exp?: number | null;
  ref_expediente?: string | null;
  ref_propia?: string | null;
  fecha: string;
  vencimiento?: string | null;
  total: number | string;
  estado: Factura["estado"];
  area: BillingArea;
  responsable?: string | null;
  forma_pago?: PaymentMethod | null;
  serie?: string | null;
  tipo_cliente?: Factura["tipoCliente"] | null;
};

type RawGasto = {
  id: string;
  num: string;
  proveedor: string;
  fecha: string;
  total: number | string;
  categoria?: string | null;
  estado: Gasto["estado"];
  area: BillingArea;
  responsable?: string | null;
  deducible?: boolean | null;
};

type RawPresupuesto = {
  id: string;
  num: string;
  contacto: string;
  client_id?: string | null;
  expediente_id?: string | null;
  anio?: number | null;
  num_exp?: number | null;
  ref_expediente?: string | null;
  ref_propia?: string | null;
  fecha: string;
  total: number | string;
  estado: Presupuesto["estado"];
  area: BillingArea;
  responsable?: string | null;
  iguala?: boolean | null;
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  year: "Este año",
};

const AREA_LABELS: Record<BillingArea, string> = {
  procesal: "Procesal",
  mercantil: "Mercantil",
  laboral: "Laboral",
  familia: "Familia",
  penal: "Penal",
  fiscal: "Fiscal",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  domiciliacion: "Domiciliación",
  bizum: "Bizum",
  efectivo: "Efectivo",
};

const fmtEur = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const fmtDate = (s: string) =>
  s ? new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const buildExpedienteRef = (row: {
  anio?: number | null;
  num_exp?: number | null;
  ref_expediente?: string | null;
  ref_propia?: string | null;
}) => {
  if (row.ref_expediente) return row.ref_expediente;
  if (row.anio && row.num_exp) return `${row.anio}/${row.num_exp}`;
  return row.ref_propia || "";
};

const mapFacturaFromApi = (row: RawFactura): Factura => ({
  id: row.id,
  num: row.num,
  contacto: row.contacto,
  clientId: row.client_id || "",
  expedienteId: row.expediente_id || "",
  expedienteRef: buildExpedienteRef(row),
  fecha: String(row.fecha || "").slice(0, 10),
  vencimiento: String(row.vencimiento || "").slice(0, 10),
  total: Number(row.total || 0),
  estado: row.estado,
  area: row.area,
  responsable: row.responsable || "Despacho",
  formaPago: row.forma_pago || "transferencia",
  serie: row.serie || "HON",
  tipoCliente: row.tipo_cliente || "empresa",
});

const mapGastoFromApi = (row: RawGasto): Gasto => ({
  id: row.id,
  num: row.num,
  proveedor: row.proveedor,
  fecha: String(row.fecha || "").slice(0, 10),
  total: Number(row.total || 0),
  cat: row.categoria || "General",
  estado: row.estado,
  area: row.area,
  responsable: row.responsable || "Despacho",
  deducible: Boolean(row.deducible),
});

const mapPresupuestoFromApi = (row: RawPresupuesto): Presupuesto => ({
  id: row.id,
  num: row.num,
  contacto: row.contacto,
  clientId: row.client_id || "",
  expedienteId: row.expediente_id || "",
  expedienteRef: buildExpedienteRef(row),
  fecha: String(row.fecha || "").slice(0, 10),
  total: Number(row.total || 0),
  estado: row.estado,
  area: row.area,
  responsable: row.responsable || "Despacho",
  iguala: Boolean(row.iguala),
});

const buildPayloadForApi = (type: BillingFormType, payload: any) => {
  if (type === "factura") {
    return {
      num: payload.num,
      contacto: payload.contacto,
      fecha: payload.fecha,
      vencimiento: payload.vencimiento || null,
      total: payload.total,
      estado: payload.estado,
      area: payload.area,
      responsable: payload.responsable,
      formaPago: payload.formaPago,
      serie: payload.serie,
      tipoCliente: payload.tipoCliente,
      clientId: payload.clientId,
      expedienteId: payload.expedienteId,
    };
  }

  if (type === "gasto") {
    return {
      num: payload.num,
      proveedor: payload.proveedor,
      fecha: payload.fecha,
      total: payload.total,
      cat: payload.cat,
      estado: payload.estado,
      area: payload.area,
      responsable: payload.responsable,
      deducible: payload.deducible,
    };
  }

  return {
    num: payload.num,
    contacto: payload.contacto,
    fecha: payload.fecha,
    total: payload.total,
    estado: payload.estado,
    area: payload.area,
    responsable: payload.responsable,
    iguala: payload.iguala,
    clientId: payload.clientId,
    expedienteId: payload.expedienteId,
  };
};

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    vencida: "bg-red-100 text-red-700",
    pendiente: "bg-amber-100 text-amber-700",
    enviada: "bg-blue-100 text-blue-700",
    cobrada: "bg-emerald-100 text-emerald-700",
    contabilizado: "bg-emerald-100 text-emerald-700",
    aprobado: "bg-emerald-100 text-emerald-700",
    rechazado: "bg-red-100 text-red-700",
    facturado: "bg-violet-100 text-violet-700",
  };
  const labels: Record<string, string> = {
    vencida: "Vencida",
    pendiente: "Pendiente",
    enviada: "Enviada",
    cobrada: "Cobrada",
    contabilizado: "Contabilizado",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
    facturado: "Facturado",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${map[estado] || "bg-slate-100 text-slate-600"}`}>{labels[estado] || estado}</span>;
}

function KpiCard({ label, value, sub, color = "slate", icon: Icon }: { label: string; value: string; sub?: string; color?: string; icon: any }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-100 text-slate-500",
    red: "bg-red-100 text-red-600",
    green: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    blue: "bg-blue-100 text-blue-600",
    violet: "bg-violet-100 text-violet-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${colors[color] || colors.slate}`}>
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function OdooMiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "amber" | "red" | "violet" | "blue";
}) {
  const toneMap: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneMap[tone] || toneMap.slate}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function OdooSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ActionIconButton({ title, tone = "slate", onClick, children }: { title: string; tone?: "slate" | "red"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        tone === "red" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SimpleBarChart({ data }: { data: { mes: string; emitido: number; cobrado: number }[] }) {
  const max = Math.max(...data.flatMap((item) => [item.emitido, item.cobrado]), 1);
  return (
    <div className="space-y-4">
      {data.map((row) => (
        <div key={row.mes} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="w-10 font-semibold">{row.mes}</span>
            <span>{fmtEur(row.emitido)} / {fmtEur(row.cobrado)}</span>
          </div>
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-400" style={{ width: `${(row.emitido / max) * 100}%` }} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(row.cobrado / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryChart({ data }: { data: { cat: string; total: number; color: string }[] }) {
  const total = data.reduce((sum, row) => sum + row.total, 0) || 1;
  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.cat} className="flex items-center gap-3">
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-600">{row.cat}</span>
              <span className="text-slate-500">{fmtEur(row.total)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${(row.total / total) * 100}%` }} />
            </div>
          </div>
          <span className="w-8 text-right text-[10px] font-bold text-slate-400">{Math.round((row.total / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function TableShell({
  title,
  count,
  headers,
  children,
}: {
  title: string;
  count: string;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-700">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{count}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="border-b border-slate-100">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function StructuredBillingEditorModal({
  type,
  initialValues,
  clients,
  expedientes,
  onClose,
  onSave,
}: {
  type: BillingFormType;
  initialValues?: any;
  clients: BillingClientOption[];
  expedientes: BillingExpedienteOption[];
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const isFactura = type === "factura";
  const isGasto = type === "gasto";
  const [form, setForm] = useState({
    num: initialValues?.num ?? "",
    contacto: initialValues?.contacto ?? "",
    clientId: initialValues?.clientId ?? "",
    expedienteId: initialValues?.expedienteId ?? "",
    proveedor: initialValues?.proveedor ?? "",
    fecha: initialValues?.fecha ?? new Date().toISOString().slice(0, 10),
    vencimiento: initialValues?.vencimiento ?? new Date().toISOString().slice(0, 10),
    total: String(initialValues?.total ?? ""),
    estado: initialValues?.estado ?? "pendiente",
    area: initialValues?.area ?? "procesal",
    responsable: initialValues?.responsable ?? "Despacho",
    formaPago: initialValues?.formaPago ?? "transferencia",
    serie: initialValues?.serie ?? "HON",
    tipoCliente: initialValues?.tipoCliente ?? "empresa",
    cat: initialValues?.cat ?? "Suministros",
    deducible: Boolean(initialValues?.deducible ?? true),
    iguala: Boolean(initialValues?.iguala ?? false),
  });

  const setField = (field: string, value: any) => setForm((current) => ({ ...current, [field]: value }));
  const expedientesForClient = useMemo(
    () => (form.clientId ? expedientes.filter((item) => item.clientId === form.clientId) : expedientes),
    [expedientes, form.clientId],
  );
  const selectedClient = useMemo(() => clients.find((item) => item.id === form.clientId) || null, [clients, form.clientId]);
  const selectedExpediente = useMemo(() => expedientes.find((item) => item.id === form.expedienteId) || null, [expedientes, form.expedienteId]);

  const setClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId) || null;
    setForm((current) => ({
      ...current,
      clientId,
      contacto: client?.label || "",
      expedienteId: current.expedienteId && expedientes.some((exp) => exp.id === current.expedienteId && exp.clientId === clientId) ? current.expedienteId : "",
    }));
  };

  const setExpediente = (expedienteId: string) => {
    const expediente = expedientes.find((item) => item.id === expedienteId) || null;
    const client = clients.find((item) => item.id === expediente?.clientId) || null;
    setForm((current) => ({
      ...current,
      expedienteId,
      clientId: expediente?.clientId || current.clientId,
      contacto: client?.label || current.contacto,
    }));
  };

  const submit = () => {
    const total = Number(form.total);
    if (!form.num.trim() || !Number.isFinite(total) || total <= 0) return;
    if (isGasto && !form.proveedor.trim()) return;
    if (!isGasto && (!form.contacto.trim() || !form.clientId || !form.expedienteId)) return;
    onSave({
      ...form,
      total,
      num: form.num.trim(),
      contacto: form.contacto.trim(),
      proveedor: form.proveedor.trim(),
      responsable: form.responsable.trim(),
    });
  };

  const title = initialValues?.id ? "Editar" : "Crear";
  const subtitle = isFactura ? "factura" : isGasto ? "gasto" : "presupuesto";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Facturación</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">{title} {subtitle}</h3>
          </div>
          <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Número</span>
                <input value={form.num} onChange={(e) => setField("num", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              {isGasto ? (
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</span>
                  <input value={form.proveedor} onChange={(e) => setField("proveedor", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              ) : (
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cliente del despacho</span>
                  <select value={form.clientId} onChange={(e) => setClient(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="">Selecciona un cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.label} · {client.totalExpedientes} expediente{client.totalExpedientes === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {!isGasto && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Expediente asociado</span>
                  <select value={form.expedienteId} onChange={(e) => setExpediente(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="">Selecciona un expediente</option>
                    {expedientesForClient.map((expediente) => (
                      <option key={expediente.id} value={expediente.id}>
                        {expediente.label} · {expediente.description || expediente.clientLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Relación cliente-expediente</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-800">Cliente:</span> {selectedClient?.label || "Sin seleccionar"}</p>
                    <p><span className="font-semibold text-slate-800">Expediente:</span> {selectedExpediente?.label || "Sin seleccionar"}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Fecha</span>
                <input type="date" value={form.fecha} onChange={(e) => setField("fecha", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              {isFactura ? (
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Vencimiento</span>
                  <input type="date" value={form.vencimiento} onChange={(e) => setField("vencimiento", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              ) : (
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</span>
                  <input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setField("total", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            {isFactura && (
              <>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</span>
                  <input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setField("total", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Serie</span>
                  <input value={form.serie} onChange={(e) => setField("serie", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Forma de pago</span>
                  <select value={form.formaPago} onChange={(e) => setField("formaPago", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    {Object.entries(PAYMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              </>
            )}

            {isGasto && (
              <>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Categoría</span>
                  <input value={form.cat} onChange={(e) => setField("cat", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</span>
                  <input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setField("total", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <input type="checkbox" checked={form.deducible} onChange={(e) => setField("deducible", e.target.checked)} />
                  <span className="text-sm text-slate-700">Gasto deducible</span>
                </label>
              </>
            )}

            {!isFactura && !isGasto && (
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                <input type="checkbox" checked={form.iguala} onChange={(e) => setField("iguala", e.target.checked)} />
                <span className="text-sm text-slate-700">Iguala / servicio recurrente</span>
              </label>
            )}

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Responsable</span>
              <input value={form.responsable} onChange={(e) => setField("responsable", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Área jurídica</span>
              <select value={form.area} onChange={(e) => setField("area", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                {Object.entries(AREA_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado</span>
              <select value={form.estado} onChange={(e) => setField("estado", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                {(isFactura
                  ? [["pendiente", "Pendiente"], ["enviada", "Enviada"], ["vencida", "Vencida"], ["cobrada", "Cobrada"]]
                  : isGasto
                    ? [["pendiente", "Pendiente"], ["contabilizado", "Contabilizado"]]
                    : [["pendiente", "Pendiente"], ["aprobado", "Aprobado"], ["rechazado", "Rechazado"], ["facturado", "Facturado"]]
                ).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={submit} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800">
            <Save size={14} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function QuipuConnectModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (payload: { appId: string; appSecret: string; baseUrl: string; ownerSlug: string }) => void;
}) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://getquipu.com");
  const [ownerSlug, setOwnerSlug] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Integración</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">Conectar Quipu</h3>
          </div>
          <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-6">
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">App ID</span>
            <input value={appId} onChange={(e) => setAppId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">App Secret</span>
            <input value={appSecret} onChange={(e) => setAppSecret(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Base URL</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Owner Slug</span>
            <input value={ownerSlug} onChange={(e) => setOwnerSlug(e.target.value)} placeholder="ej. mi-despacho" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </label>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Quipu usa OAuth2 con <code>app_id</code> y <code>app_secret</code>. El backend ya está preparado para validar la conexión y sincronizar contactos, facturas y series de numeración.
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ appId: appId.trim(), appSecret: appSecret.trim(), baseUrl: baseUrl.trim(), ownerSlug: ownerSlug.trim() })}
            className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800"
          >
            <Save size={14} /> Guardar y validar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Facturacion() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [period, setPeriod] = useState<Period>("30d");
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [clientes, setClientes] = useState<BillingClientOption[]>([]);
  const [expedientes, setExpedientes] = useState<BillingExpedienteOption[]>([]);
  const [search, setSearch] = useState("");
  const [filterResponsable, setFilterResponsable] = useState("todos");
  const [filterArea, setFilterArea] = useState<"todas" | BillingArea>("todas");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterFormaPago, setFilterFormaPago] = useState<"todas" | PaymentMethod>("todas");
  const [filterSerie, setFilterSerie] = useState("todas");
  const [editorType, setEditorType] = useState<BillingFormType | null>(null);
  const [editorRecord, setEditorRecord] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quipuStatus, setQuipuStatus] = useState<QuipuStatus>({ connected: false });
  const [showQuipuModal, setShowQuipuModal] = useState(false);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "dashboard", label: "Resumen" },
    { key: "facturas", label: "Facturas de cliente" },
    { key: "gastos", label: "Gastos del despacho" },
    { key: "presupuestos", label: "Presupuestos y ofertas" },
  ];

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await apiFetch("/api/facturacion/bootstrap", { getToken });
      const data = response?.data || {};
      setFacturas(Array.isArray(data.facturas) ? data.facturas.map(mapFacturaFromApi) : []);
      setGastos(Array.isArray(data.gastos) ? data.gastos.map(mapGastoFromApi) : []);
      setPresupuestos(Array.isArray(data.presupuestos) ? data.presupuestos.map(mapPresupuestoFromApi) : []);
      setClientes(
        Array.isArray(data.clientes)
          ? data.clientes.map((row: any) => ({
              id: row.id,
              label: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.commercial_name || "Cliente sin nombre",
              commercialName: row.commercial_name || "",
              totalExpedientes: Number(row.total_expedientes || 0),
            }))
          : [],
      );
      setExpedientes(
        Array.isArray(data.expedientes)
          ? data.expedientes.map((row: any) => ({
              id: row.id,
              clientId: row.cliente_id || "",
              label: row.ref_expediente || (row.anio && row.num_exp ? `${row.anio}/${row.num_exp}` : row.ref_propia || "Expediente"),
              clientLabel: row.cliente_nombre || "Sin cliente",
              description: row.descripcion || "",
            }))
          : [],
      );
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo cargar el módulo de facturación.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const loadQuipuStatus = useCallback(async () => {
    try {
      const response = await apiFetch("/api/quipu/status", { getToken });
      setQuipuStatus(response?.data || { connected: false });
    } catch {
      setQuipuStatus({ connected: false });
    }
  }, [getToken]);

  useEffect(() => {
    loadBilling();
    loadQuipuStatus();
  }, [loadBilling, loadQuipuStatus]);

  const cobrosPendientes = useMemo(
    () =>
      facturas
        .filter((factura) => factura.estado !== "cobrada")
        .map((factura) => ({
          id: factura.id,
          num: factura.num,
          contacto: factura.contacto,
          vencimiento: factura.vencimiento,
          pendiente: factura.total,
          estado: factura.estado === "enviada" ? "pendiente" : factura.estado,
          area: factura.area,
          responsable: factura.responsable,
          formaPago: factura.formaPago,
          serie: factura.serie,
          expedienteRef: factura.expedienteRef,
        })),
    [facturas],
  );

  const allRows = useMemo(() => [...facturas, ...cobrosPendientes, ...gastos, ...presupuestos], [facturas, cobrosPendientes, gastos, presupuestos]);
  const responsables = useMemo(() => Array.from(new Set(allRows.map((row: any) => row.responsable).filter(Boolean))), [allRows]);
  const series = useMemo(() => Array.from(new Set(facturas.map((row) => row.serie).filter(Boolean))), [facturas]);

  const matchesCommonFilters = useCallback((row: any) => {
    const q = search.trim().toLowerCase();
    const searchable = [row.num, row.contacto, row.proveedor, row.responsable, row.cat, row.serie, row.area, row.expedienteRef]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (filterResponsable !== "todos" && row.responsable !== filterResponsable) return false;
    if (filterArea !== "todas" && row.area !== filterArea) return false;
    if (filterEstado !== "todos" && row.estado !== filterEstado) return false;
    if (filterFormaPago !== "todas" && row.formaPago !== filterFormaPago) return false;
    if (filterSerie !== "todas" && row.serie !== filterSerie) return false;
    return true;
  }, [search, filterResponsable, filterArea, filterEstado, filterFormaPago, filterSerie]);

  const filteredFacturas = useMemo(() => facturas.filter(matchesCommonFilters), [facturas, matchesCommonFilters]);
  const filteredCobrosPendientes = useMemo(() => cobrosPendientes.filter(matchesCommonFilters), [cobrosPendientes, matchesCommonFilters]);
  const filteredGastos = useMemo(() => gastos.filter(matchesCommonFilters), [gastos, matchesCommonFilters]);
  const filteredPresupuestos = useMemo(() => presupuestos.filter(matchesCommonFilters), [presupuestos, matchesCommonFilters]);

  const monthlySeries = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat("es-ES", { month: "short" });
    const buckets = new Map<string, { mes: string; emitido: number; cobrado: number; sort: string }>();
    filteredFacturas.forEach((factura) => {
      const date = new Date(factura.fecha);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const current = buckets.get(key) || { mes: monthFormatter.format(date).replace(".", ""), emitido: 0, cobrado: 0, sort: key };
      current.emitido += factura.total;
      if (factura.estado === "cobrada") current.cobrado += factura.total;
      buckets.set(key, current);
    });
    return Array.from(buckets.values()).sort((a, b) => a.sort.localeCompare(b.sort)).slice(-6).map(({ sort, ...row }) => row);
  }, [filteredFacturas]);

  const gastosPorCategoria = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredGastos.forEach((gasto) => grouped.set(gasto.cat, (grouped.get(gasto.cat) || 0) + gasto.total));
    const palette = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-slate-400"];
    return Array.from(grouped.entries()).map(([cat, total], index) => ({ cat, total, color: palette[index % palette.length] }));
  }, [filteredGastos]);

  const openEditor = (type: BillingFormType, record?: any) => {
    setEditorType(type);
    setEditorRecord(record ?? null);
  };

  const closeEditor = () => {
    setEditorType(null);
    setEditorRecord(null);
  };

  const resolveExpedienteRef = useCallback((expedienteId: string) => {
    return expedientes.find((item) => item.id === expedienteId)?.label || "";
  }, [expedientes]);

  const saveQuipuCredentials = async (payload: { appId: string; appSecret: string; baseUrl: string; ownerSlug: string }) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await apiFetch("/api/quipu/connect", { method: "POST", body: JSON.stringify(payload), getToken });
      await loadQuipuStatus();
      setShowQuipuModal(false);
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo conectar con Quipu.");
    } finally {
      setSaving(false);
    }
  };

  const syncQuipu = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const response = await apiFetch("/api/quipu/sync", { method: "POST", getToken });
      setQuipuStatus((current) => ({
        ...current,
        connected: true,
        lastSyncAt: response?.data?.summary?.syncedAt || new Date().toISOString(),
        syncSummary: response?.data?.summary || null,
      }));
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo sincronizar Quipu.");
    } finally {
      setSaving(false);
    }
  };

  const disconnectQuipu = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await apiFetch("/api/quipu/disconnect", { method: "DELETE", getToken });
      setQuipuStatus({ connected: false });
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo desconectar Quipu.");
    } finally {
      setSaving(false);
    }
  };

  const saveRecord = async (payload: any) => {
    if (!editorType) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const isEditing = Boolean(editorRecord?.id);
      const basePath =
        editorType === "factura"
          ? "/api/facturacion/facturas"
          : editorType === "gasto"
            ? "/api/facturacion/gastos"
            : "/api/facturacion/presupuestos";
      const response = await apiFetch(isEditing ? `${basePath}/${editorRecord.id}` : basePath, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(buildPayloadForApi(editorType, payload)),
        getToken,
      });
      const saved = response?.data;
      if (editorType === "factura") {
        const next = {
          ...mapFacturaFromApi(saved),
          expedienteRef: buildExpedienteRef(saved) || resolveExpedienteRef(payload.expedienteId),
          clientId: saved?.client_id || payload.clientId || "",
          expedienteId: saved?.expediente_id || payload.expedienteId || "",
          contacto: saved?.contacto || payload.contacto,
        };
        setFacturas((current) => (isEditing ? current.map((item) => (item.id === next.id ? next : item)) : [next, ...current]));
      } else if (editorType === "gasto") {
        const next = mapGastoFromApi(saved);
        setGastos((current) => (isEditing ? current.map((item) => (item.id === next.id ? next : item)) : [next, ...current]));
      } else {
        const next = {
          ...mapPresupuestoFromApi(saved),
          expedienteRef: buildExpedienteRef(saved) || resolveExpedienteRef(payload.expedienteId),
          clientId: saved?.client_id || payload.clientId || "",
          expedienteId: saved?.expediente_id || payload.expedienteId || "",
          contacto: saved?.contacto || payload.contacto,
        };
        setPresupuestos((current) => (isEditing ? current.map((item) => (item.id === next.id ? next : item)) : [next, ...current]));
      }
      closeEditor();
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  };

  const removeRecord = async (type: BillingFormType, id: string) => {
    setErrorMsg(null);
    try {
      const basePath =
        type === "factura"
          ? "/api/facturacion/facturas"
          : type === "gasto"
            ? "/api/facturacion/gastos"
            : "/api/facturacion/presupuestos";
      await apiFetch(`${basePath}/${id}`, { method: "DELETE", getToken });
      if (type === "factura") setFacturas((current) => current.filter((item) => item.id !== id));
      if (type === "gasto") setGastos((current) => current.filter((item) => item.id !== id));
      if (type === "presupuesto") setPresupuestos((current) => current.filter((item) => item.id !== id));
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo eliminar el registro.");
    }
  };

  const totalPendiente = filteredCobrosPendientes.reduce((sum, row) => sum + row.pendiente, 0);
  const totalFacturado = filteredFacturas.reduce((sum, row) => sum + row.total, 0);
  const totalCobrado = filteredFacturas.filter((row) => row.estado === "cobrada").reduce((sum, row) => sum + row.total, 0);
  const totalPresupuestado = filteredPresupuestos.reduce((sum, row) => sum + row.total, 0);
  const facturasVencidas = filteredCobrosPendientes.filter((row) => row.estado === "vencida").length;
  const presupuestosPendientes = filteredPresupuestos.filter((row) => row.estado === "pendiente").length;
  const presupuestosAprobados = filteredPresupuestos.filter((row) => row.estado === "aprobado").length;
  const pagosPendientes = filteredGastos.filter((row) => row.estado === "pendiente").reduce((sum, row) => sum + row.total, 0);
  const gastosMensuales = filteredGastos.reduce((sum, row) => sum + row.total, 0);
  const margenBruto = Math.max(totalFacturado - gastosMensuales, 0);
  const ticketsPendientes = facturas.filter((row) => row.estado === "pendiente" || row.estado === "enviada").length;
  const expedientesFacturables = new Set([...filteredFacturas, ...filteredPresupuestos].map((row) => row.expedienteId).filter(Boolean)).size;
  const clientesFacturables = new Set([...filteredFacturas, ...filteredPresupuestos].map((row) => row.clientId).filter(Boolean)).size;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.08),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">No se pudo completar la operación de facturación</p>
                <p className="mt-1 text-red-600">{errorMsg}</p>
              </div>
            </div>
          )}

          {!quipuStatus.connected ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <LinkIcon size={16} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Conecta Quipu para completar la capa contable</p>
                  <p className="mt-0.5 text-xs text-amber-600">La pantalla ya trabaja con backend real del ERP; cuando conectes Quipu podrás preparar conciliación y sincronización de series, contactos y facturas.</p>
                </div>
              </div>
              <button onClick={() => setShowQuipuModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600">
                <ExternalLink size={13} /> Conectar Quipu
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-emerald-800">Quipu conectado</p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  {quipuStatus.lastSyncAt ? `Última sincronización: ${new Date(quipuStatus.lastSyncAt).toLocaleString("es-ES")}` : "Sincronización pendiente"}
                </p>
                {quipuStatus.syncSummary && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Contactos: {quipuStatus.syncSummary.contacts || 0} · Facturas: {quipuStatus.syncSummary.invoices || 0} · Series: {quipuStatus.syncSummary.numberingSeries || 0}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={syncQuipu} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <RefreshCw size={13} className={saving ? "animate-spin" : ""} /> Sincronizar
                </button>
                <button onClick={disconnectQuipu} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                  Desconectar
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_45%,#f8fafc_100%)] px-6 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    <span>Contabilidad</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-red-600">Facturación</span>
                  </div>
                  <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Centro de facturación del despacho</h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-500">Controla ventas, provisiones, gastos, presupuestos y relación cliente-expediente con una estructura tipo ERP, sin perder el flujo jurídico del despacho.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => openEditor("factura")} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">
                    <Plus size={14} /> Nueva factura
                  </button>
                  <button onClick={() => openEditor("presupuesto")} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60">
                    <FileSpreadsheet size={14} /> Nuevo presupuesto
                  </button>
                  <button onClick={() => openEditor("gasto")} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60">
                    <Plus size={14} /> Registrar gasto
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <OdooMiniStat label="Facturado" value={fmtEur(totalFacturado)} tone="blue" />
                <OdooMiniStat label="Cobrado" value={fmtEur(totalCobrado)} tone="emerald" />
                <OdooMiniStat label="Pendiente de cobro" value={fmtEur(totalPendiente)} tone="amber" />
                <OdooMiniStat label="Pagos pendientes" value={fmtEur(pagosPendientes)} tone="red" />
                <OdooMiniStat label="Expedientes facturables" value={String(expedientesFacturables)} tone="violet" />
                <OdooMiniStat label="Clientes con movimiento" value={String(clientesFacturables)} tone="slate" />
              </div>
            </div>

            <div className="border-b border-slate-200 px-4 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                {TABS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`rounded-t-2xl border border-b-0 px-4 py-3 text-sm font-semibold transition-colors ${
                      tab === item.key ? "border-slate-200 bg-white text-red-700 shadow-[0_-1px_0_0_white]" : "border-transparent bg-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-5 bg-slate-50/70 p-5">
              <OdooSection
                title="Criterios de facturación"
                subtitle="Busca por cliente, expediente, número, proveedor o responsable y refina por área, estado, serie y cobro."
                action={
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilterResponsable("todos");
                      setFilterArea("todas");
                      setFilterEstado("todos");
                      setFilterFormaPago("todas");
                      setFilterSerie("todas");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <RefreshCw size={12} /> Restablecer
                  </button>
                }
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, expediente, factura o proveedor..." className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm xl:col-span-2" />
                  <select value={filterResponsable} onChange={(e) => setFilterResponsable(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="todos">Todos los responsables</option>
                    {responsables.map((responsable) => <option key={responsable} value={responsable}>{responsable}</option>)}
                  </select>
                  <select value={filterArea} onChange={(e) => setFilterArea(e.target.value as "todas" | BillingArea)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="todas">Todas las áreas</option>
                    {Object.entries(AREA_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="todos">Todos los estados</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="vencida">Vencida</option>
                    <option value="enviada">Enviada</option>
                    <option value="cobrada">Cobrada</option>
                    <option value="contabilizado">Contabilizado</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="rechazado">Rechazado</option>
                    <option value="facturado">Facturado</option>
                  </select>
                  <select value={filterFormaPago} onChange={(e) => setFilterFormaPago(e.target.value as "todas" | PaymentMethod)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="todas">Todas las formas de pago</option>
                    {Object.entries(PAYMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Series contables</span>
                  <button onClick={() => setFilterSerie("todas")} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${filterSerie === "todas" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Todas</button>
                  {series.map((serie) => (
                    <button key={serie} onClick={() => setFilterSerie(serie)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${filterSerie === serie ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{serie}</button>
                  ))}
                </div>
              </OdooSection>

              {tab === "dashboard" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-fit">
                      <button onClick={() => setShowPeriodMenu((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300">
                        Vista temporal: {PERIOD_LABELS[period]}
                        <ChevronDown size={14} className={showPeriodMenu ? "rotate-180" : ""} />
                      </button>
                      {showPeriodMenu && (
                        <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
                            <button key={key} onClick={() => { setPeriod(key); setShowPeriodMenu(false); }} className={`w-full px-4 py-2.5 text-left text-sm ${period === key ? "bg-red-50 font-semibold text-red-700" : "text-slate-600 hover:bg-slate-50"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Tickets pendientes: {ticketsPendientes}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Margen bruto: {fmtEur(margenBruto)}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Presupuestado: {fmtEur(totalPresupuestado)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <KpiCard label="Cobros pendientes" value={fmtEur(totalPendiente)} sub={PERIOD_LABELS[period]} color="amber" icon={Banknote} />
                    <KpiCard label="Facturas vencidas" value={String(facturasVencidas)} sub={PERIOD_LABELS[period]} color="red" icon={AlertCircle} />
                    <KpiCard label="Presupuestos pendientes de respuesta" value={String(presupuestosPendientes)} sub={PERIOD_LABELS[period]} color="blue" icon={FileSpreadsheet} />
                    <KpiCard label="Presupuestos aprobados sin facturar" value={String(presupuestosAprobados)} sub={PERIOD_LABELS[period]} color="violet" icon={CheckCircle2} />
                    <KpiCard label="Pagos pendientes" value={fmtEur(pagosPendientes)} sub={PERIOD_LABELS[period]} color="slate" icon={Clock} />
                    <KpiCard label="Gastos del periodo" value={fmtEur(gastosMensuales)} sub="Control de costes" color="green" icon={TrendingDown} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <OdooSection title="Emitido vs cobrado" subtitle="Comparativa mensual entre la facturación emitida y lo realmente cobrado.">
                      <div className="mb-4 flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" /> Emitido</span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" /> Cobrado</span>
                      </div>
                      <SimpleBarChart data={monthlySeries.length ? monthlySeries : []} />
                    </OdooSection>

                    <OdooSection title="Control de explotación" subtitle="Balance rápido del ciclo de facturación del despacho.">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <OdooMiniStat label="Facturas registradas" value={String(filteredFacturas.length)} tone="blue" />
                        <OdooMiniStat label="Presupuestos activos" value={String(filteredPresupuestos.length)} tone="violet" />
                        <OdooMiniStat label="Gastos registrados" value={String(filteredGastos.length)} tone="red" />
                        <OdooMiniStat label="Clientes del circuito" value={String(clientes.length)} tone="slate" />
                      </div>
                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Gastos por categoría</h4>
                        <div className="mt-3">
                          <CategoryChart data={gastosPorCategoria} />
                        </div>
                      </div>
                    </OdooSection>
                  </div>

                  <TableShell title="Cobros pendientes de facturas" count={`${filteredCobrosPendientes.length} registros`} headers={["Número", "Cliente", "Expediente", "Vencimiento", "Pendiente", "Estado", ""]}>
                    {filteredCobrosPendientes.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">{row.num}</td>
                        <td className="px-5 py-3 text-sm text-slate-600">{row.contacto}</td>
                        <td className="px-5 py-3 text-sm text-slate-500">{row.expedienteRef || "Sin expediente"}</td>
                        <td className="px-5 py-3 text-sm text-slate-500">{fmtDate(row.vencimiento)}</td>
                        <td className="px-5 py-3 text-sm font-bold text-slate-900">{fmtEur(row.pendiente)}</td>
                        <td className="px-5 py-3"><EstadoBadge estado={row.estado} /></td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            <ActionIconButton title="Editar factura" onClick={() => {
                              const factura = facturas.find((item) => item.id === row.id);
                              if (factura) openEditor("factura", factura);
                            }}>
                              <Pencil size={14} />
                            </ActionIconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </TableShell>
                </>
              )}

              {tab === "facturas" && (
                <TableShell title="Facturas de cliente" count={`${filteredFacturas.length} facturas`} headers={["Número", "Cliente", "Expediente", "Área", "Serie", "Vencimiento", "Total", "Estado", ""]}>
                  {filteredFacturas.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{row.num}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">
                        <div className="font-medium text-slate-700">{row.contacto}</div>
                        <div className="text-xs text-slate-400">{row.responsable}</div>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{row.expedienteRef || "Sin expediente"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{AREA_LABELS[row.area]}</td>
                      <td className="px-5 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{row.serie}</span></td>
                      <td className="px-5 py-3 text-sm text-slate-500">{fmtDate(row.vencimiento)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{fmtEur(row.total)}</td>
                      <td className="px-5 py-3"><EstadoBadge estado={row.estado} /></td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionIconButton title="Editar factura" onClick={() => openEditor("factura", row)}>
                            <Pencil size={14} />
                          </ActionIconButton>
                          <ActionIconButton title="Borrar factura" tone="red" onClick={() => removeRecord("factura", row.id)}>
                            <Trash2 size={14} />
                          </ActionIconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableShell>
              )}

              {tab === "gastos" && (
                <TableShell title="Gastos del despacho" count={`${filteredGastos.length} gastos`} headers={["Número", "Proveedor", "Categoría", "Área", "Responsable", "Fecha", "Total", "Estado", ""]}>
                  {filteredGastos.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{row.num}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">
                        <div className="font-medium text-slate-700">{row.proveedor}</div>
                        <div className="text-xs text-slate-400">{row.deducible ? "Deducible" : "No deducible"}</div>
                      </td>
                      <td className="px-5 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{row.cat}</span></td>
                      <td className="px-5 py-3 text-sm text-slate-500">{AREA_LABELS[row.area]}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{row.responsable}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{fmtDate(row.fecha)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{fmtEur(row.total)}</td>
                      <td className="px-5 py-3"><EstadoBadge estado={row.estado} /></td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionIconButton title="Editar gasto" onClick={() => openEditor("gasto", row)}>
                            <Pencil size={14} />
                          </ActionIconButton>
                          <ActionIconButton title="Borrar gasto" tone="red" onClick={() => removeRecord("gasto", row.id)}>
                            <Trash2 size={14} />
                          </ActionIconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableShell>
              )}

              {tab === "presupuestos" && (
                <TableShell title="Presupuestos y ofertas" count={`${filteredPresupuestos.length} presupuestos`} headers={["Número", "Cliente", "Expediente", "Área", "Fecha", "Total", "Estado", ""]}>
                  {filteredPresupuestos.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{row.num}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">
                        <div className="font-medium text-slate-700">{row.contacto}</div>
                        <div className="text-xs text-slate-400">{row.responsable}</div>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{row.expedienteRef || "Sin expediente"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{AREA_LABELS[row.area]}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{fmtDate(row.fecha)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{fmtEur(row.total)}</td>
                      <td className="px-5 py-3"><EstadoBadge estado={row.estado} /></td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionIconButton title="Editar presupuesto" onClick={() => openEditor("presupuesto", row)}>
                            <Pencil size={14} />
                          </ActionIconButton>
                          <ActionIconButton title="Borrar presupuesto" tone="red" onClick={() => removeRecord("presupuesto", row.id)}>
                            <Trash2 size={14} />
                          </ActionIconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableShell>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              <RefreshCw size={16} className="animate-spin" />
              Cargando datos reales de facturación...
            </div>
          )}
        </div>
      </div>

      {editorType && (
        <StructuredBillingEditorModal
          type={editorType}
          initialValues={editorRecord ?? undefined}
          clients={clientes}
          expedientes={expedientes}
          onClose={closeEditor}
          onSave={saveRecord}
        />
      )}

      {showQuipuModal && (
        <QuipuConnectModal
          onClose={() => setShowQuipuModal(false)}
          onSave={saveQuipuCredentials}
        />
      )}
    </div>
  );
}
