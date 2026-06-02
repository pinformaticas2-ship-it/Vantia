import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  BarChart2,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  LineChart,
  Link as LinkIcon,
  Loader2,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  TrendingDown,
  Upload,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "../lib/api";

type FilterPeriod = "year" | "q1" | "q2" | "q3" | "q4" | "jan" | "feb" | "mar" | "apr" | "may" | "jun" | "jul" | "aug" | "sep" | "oct" | "nov" | "dec";
type TabKey = "dashboard" | "facturas" | "gastos" | "presupuestos" | "contacts" | "bank_accounts" | "receipts" | "config";

type QuipuContact = {
  id: string;
  kind: string;
  name: string;
  fullName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  town?: string;
  zipCode?: string;
  country?: string;
  countryCode?: string;
};

type QuipuBankAccount = {
  id: string;
  name: string;
  iban?: string;
  balance: number;
  bankName?: string;
  currency?: string;
  updatedAt?: string;
};

type QuipuTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balanceAfter?: number;
  kind?: string;
};

type QuipuReceipt = {
  id: string;
  number?: string;
  settlementDate: string;
  amount: number;
  contactName?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  kind?: string;
};
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
  syncRunning?: boolean;
  syncError?: string | null;
  syncSummary?: {
    contacts?: number;
    invoices?: number;
    numberingSeries?: number;
    syncedAt?: string;
    importedToFacturacion?: number;
    updatedInFacturacion?: number;
    syncErrors?: number;
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

const PERIOD_OPTIONS: { value: FilterPeriod; label: string; group?: "quarter" | "month" }[] = [
  { value: "year",  label: "Todo el año" },
  { value: "q1",   label: "Trimestre 1", group: "quarter" },
  { value: "q2",   label: "Trimestre 2", group: "quarter" },
  { value: "q3",   label: "Trimestre 3", group: "quarter" },
  { value: "q4",   label: "Trimestre 4", group: "quarter" },
  { value: "jan",  label: "Enero",       group: "month" },
  { value: "feb",  label: "Febrero",     group: "month" },
  { value: "mar",  label: "Marzo",       group: "month" },
  { value: "apr",  label: "Abril",       group: "month" },
  { value: "may",  label: "Mayo",        group: "month" },
  { value: "jun",  label: "Junio",       group: "month" },
  { value: "jul",  label: "Julio",       group: "month" },
  { value: "aug",  label: "Agosto",      group: "month" },
  { value: "sep",  label: "Septiembre",  group: "month" },
  { value: "oct",  label: "Octubre",     group: "month" },
  { value: "nov",  label: "Noviembre",   group: "month" },
  { value: "dec",  label: "Diciembre",   group: "month" },
];

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

function ClientRecordLink({ clientId, label }: { clientId?: string; label: string }) {
  if (!clientId) {
    return <span className="font-medium text-slate-700">{label}</span>;
  }

  return (
    <Link
      to={`/dashboard/clientes/${clientId}`}
      className="inline-flex items-center gap-1 font-medium text-red-700 transition-colors hover:text-red-800 hover:underline"
      title="Abrir ficha del cliente"
    >
      <span>{label}</span>
      <ExternalLink size={12} />
    </Link>
  );
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
    if (!isGasto && (!form.contacto.trim() || !form.clientId)) return;
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
                    <p>
                      <span className="font-semibold text-slate-800">Cliente:</span>{" "}
                      {selectedClient ? <ClientRecordLink clientId={selectedClient.id} label={selectedClient.label} /> : "Sin seleccionar"}
                    </p>
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
  const [filterYear,   setFilterYear]   = useState<number>(new Date().getFullYear());
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("year");
  const [showYearMenu,   setShowYearMenu]   = useState(false);
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const yearMenuRef   = useRef<HTMLDivElement>(null);
  const periodMenuRef = useRef<HTMLDivElement>(null);
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
  // Quipu live data
  const [quipuContacts, setQuipuContacts] = useState<QuipuContact[]>([]);
  const [quipuBankAccounts, setQuipuBankAccounts] = useState<QuipuBankAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [quipuTransactions, setQuipuTransactions] = useState<QuipuTransaction[]>([]);
  const [quipuReceipts, setQuipuReceipts] = useState<QuipuReceipt[]>([]);
  const [loadingQuipu, setLoadingQuipu] = useState(false);
  const [quipuError, setQuipuError] = useState<string | null>(null);
  const [pushingToQuipuId, setPushingToQuipuId] = useState<string | null>(null);
  const [showContactEditor, setShowContactEditor] = useState(false);
  const [editingContact, setEditingContact] = useState<QuipuContact | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [isSilentSyncing, setIsSilentSyncing] = useState(false);
  const silentSyncDoneRef = useRef(false);

  const TABS: { key: TabKey; label: string; icon?: React.ComponentType<any>; quipuOnly?: boolean }[] = [
    { key: "dashboard",     label: "Vista general" },
    { key: "facturas",      label: "Facturas" },
    { key: "gastos",        label: "Gastos" },
    { key: "presupuestos",  label: "Presupuestos" },
    { key: "receipts",      label: "Cobros",           icon: CreditCard,   quipuOnly: true },
    { key: "contacts",      label: "Contactos",         icon: Users,        quipuOnly: true },
    { key: "bank_accounts", label: "Cuentas bancarias", icon: Building2,    quipuOnly: true },
    { key: "config",        label: "Configuración",     icon: Settings },
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
      // Quipu synced data comes directly from the bootstrap — no separate calls needed
      if (Array.isArray(data.quipuContacts)) {
        setQuipuContacts(data.quipuContacts.map((r: any) => ({
          id: String(r.id),
          kind: r.kind || "client",
          name: r.name || "Sin nombre",
          fullName: r.name || "",
          taxId: r.tax_id || "",
          email: r.email || "",
          phone: "",
          address: "",
          countryCode: "ES",
        })));
      }
      if (Array.isArray(data.quipuBankAccounts) && data.quipuBankAccounts.length > 0) {
        setQuipuBankAccounts(data.quipuBankAccounts.map((r: any) => ({
          id: String(r.id),
          name: r.name || "Cuenta bancaria",
          iban: r.iban || "",
          balance: Number(r.balance ?? 0),
          bankName: r.bank_name || "",
          currency: r.currency_code || "EUR",
          updatedAt: "",
        })));
        if (!selectedBankAccountId) setSelectedBankAccountId(String(data.quipuBankAccounts[0].id));
      }
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

  // Auto-sync Quipu silently once per session when data is stale (>30 min)
  useEffect(() => {
    if (!quipuStatus.connected || silentSyncDoneRef.current) return;
    const lastSync = quipuStatus.lastSyncAt ? new Date(quipuStatus.lastSyncAt).getTime() : 0;
    if (Date.now() - lastSync <= 30 * 60 * 1000) return;
    silentSyncDoneRef.current = true;
    setIsSilentSyncing(true);
    const prevLastSyncAt = quipuStatus.lastSyncAt;
    apiFetch("/api/quipu/sync", { method: "POST", getToken })
      .then(() => pollQuipuStatus(prevLastSyncAt))
      .catch((e: any) => console.warn("[AutoSync] Quipu:", e?.message))
      .finally(() => setIsSilentSyncing(false));
  }, [quipuStatus.connected, quipuStatus.lastSyncAt]);

  // Close year/period menus when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (yearMenuRef.current && !yearMenuRef.current.contains(e.target as Node)) setShowYearMenu(false);
      if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node)) setShowPeriodMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const availableYears = useMemo(() => {
    const allYears = new Set<number>();
    [...facturas.map(f => f.fecha), ...gastos.map(g => g.fecha), ...presupuestos.map(p => p.fecha)]
      .filter(Boolean)
      .forEach(d => { const y = new Date(d).getFullYear(); if (!isNaN(y)) allYears.add(y); });
    const cur = new Date().getFullYear();
    allYears.add(cur);
    allYears.add(cur + 1);
    return Array.from(allYears).sort((a, b) => b - a);
  }, [facturas, gastos, presupuestos]);

  const matchesDateFilter = useCallback((fecha: string): boolean => {
    if (!fecha) return true;
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return true;
    if (d.getFullYear() !== filterYear) return false;
    const m = d.getMonth();
    if (filterPeriod === "year") return true;
    if (filterPeriod === "q1") return m <= 2;
    if (filterPeriod === "q2") return m >= 3 && m <= 5;
    if (filterPeriod === "q3") return m >= 6 && m <= 8;
    if (filterPeriod === "q4") return m >= 9;
    const mMap: Record<string, number> = {
      jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
      jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
    };
    return filterPeriod in mMap ? m === mMap[filterPeriod] : true;
  }, [filterYear, filterPeriod]);

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
    if (!matchesDateFilter(row.fecha)) return false;
    if (filterResponsable !== "todos" && row.responsable !== filterResponsable) return false;
    if (filterArea !== "todas" && row.area !== filterArea) return false;
    if (filterEstado !== "todos" && row.estado !== filterEstado) return false;
    if (filterFormaPago !== "todas" && row.formaPago !== filterFormaPago) return false;
    if (filterSerie !== "todas" && row.serie !== filterSerie) return false;
    return true;
  }, [search, matchesDateFilter, filterResponsable, filterArea, filterEstado, filterFormaPago, filterSerie]);

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

  const pollQuipuStatus = useCallback(async (prevLastSyncAt: string | null | undefined) => {
    const maxWait = 120_000; // 2 min max
    const start = Date.now();
    const interval = 5_000;
    return new Promise<void>((resolve) => {
      const tick = async () => {
        try {
          const res = await apiFetch("/api/quipu/status", { getToken });
          const s = res?.data;
          if (s) setQuipuStatus((cur) => ({ ...cur, ...s }));
          const done = !s?.syncRunning;
          const changed = s?.lastSyncAt && s.lastSyncAt !== prevLastSyncAt;
          if (done && changed) { await loadBilling(); resolve(); return; }
          if (done && s?.syncError) {
            // Only show rate-limit errors briefly to the user (not as a permanent banner)
            const isRateLimit = s.syncError.includes('429') || s.syncError.toLowerCase().includes('rate limit');
            if (!isRateLimit) setErrorMsg(`Quipu: ${s.syncError}`);
            else console.warn('[Quipu polling] sync error (rate limit, not shown to user):', s.syncError);
            resolve(); return;
          }
          if (done) { resolve(); return; }
        } catch { /* ignore poll errors */ }
        if (Date.now() - start < maxWait) setTimeout(tick, interval);
        else resolve();
      };
      setTimeout(tick, interval);
    });
  }, [getToken, loadBilling]);

  const syncQuipu = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const prevLastSyncAt = quipuStatus.lastSyncAt;
      await apiFetch("/api/quipu/sync", { method: "POST", getToken });
      setQuipuStatus((cur) => ({ ...cur, syncRunning: true, syncError: null }));
      setIsSilentSyncing(true);
      await pollQuipuStatus(prevLastSyncAt);
    } catch (error: any) {
      setErrorMsg(error?.message || "No se pudo iniciar la sincronización con Quipu.");
    } finally {
      setSaving(false);
      setIsSilentSyncing(false);
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

  // ── Quipu live loaders ───────────────────────────────────────

  const loadQuipuContacts = useCallback(async () => {
    if (!quipuStatus.connected) return;
    setLoadingQuipu(true); setQuipuError(null);
    try {
      // Use synced local DB — no live API call needed
      const res = await apiFetch("/api/quipu/synced/contacts", { getToken });
      const rows: any[] = res?.data || [];
      setQuipuContacts(rows.map((r: any) => ({
        id: String(r.id),
        kind: r.kind || "client",
        name: r.name || "Sin nombre",
        fullName: r.name || "",
        taxId: r.tax_id || "",
        email: r.email || "",
        phone: r.phone || "",
        address: r.address || "",
        town: r.town || "",
        zipCode: r.zip_code || "",
        country: r.country || "",
        countryCode: r.country_code || "ES",
      })));
    } catch (e: any) { setQuipuError(e?.message || "Error al cargar contactos"); }
    finally { setLoadingQuipu(false); }
  }, [getToken, quipuStatus.connected]);

  const loadQuipuBankAccounts = useCallback(async () => {
    if (!quipuStatus.connected) return;
    setLoadingQuipu(true); setQuipuError(null);
    try {
      // Use synced local DB — no live API call needed
      const res = await apiFetch("/api/quipu/synced/bank_accounts", { getToken });
      const rows: any[] = res?.data || [];
      setQuipuBankAccounts(rows.map((r: any) => ({
        id: String(r.id),
        name: r.name || "Cuenta bancaria",
        iban: r.iban || "",
        balance: Number(r.balance ?? r.current_balance ?? 0),
        bankName: r.bank_name || "",
        currency: r.currency_code || "EUR",
        updatedAt: r.updated_at || "",
      })));
      if (rows.length > 0 && !selectedBankAccountId) setSelectedBankAccountId(String(rows[0].id));
    } catch (e: any) { setQuipuError(e?.message || "Error al cargar cuentas bancarias"); }
    finally { setLoadingQuipu(false); }
  }, [getToken, quipuStatus.connected, selectedBankAccountId]);

  const loadQuipuTransactions = useCallback(async (bankAccountId: string) => {
    if (!quipuStatus.connected || !bankAccountId) return;
    setLoadingQuipu(true);
    try {
      const res = await apiFetch(`/api/quipu/bank_accounts/${bankAccountId}/transactions`, { getToken });
      const rows: any[] = res?.data || [];
      setQuipuTransactions(rows.map((r: any) => ({
        id: String(r.id),
        date: String(r.attributes?.date || r.attributes?.issued_at || "").slice(0, 10),
        description: r.attributes?.description || r.attributes?.concept || r.attributes?.notes || "",
        amount: Number(r.attributes?.amount ?? r.attributes?.total_amount ?? 0),
        balanceAfter: r.attributes?.balance_after ?? r.attributes?.running_balance ?? null,
        kind: r.attributes?.kind || r.attributes?.transaction_type || "",
      })));
    } catch { setQuipuTransactions([]); }
    finally { setLoadingQuipu(false); }
  }, [getToken, quipuStatus.connected]);

  const loadQuipuReceipts = useCallback(async () => {
    if (!quipuStatus.connected) return;
    setLoadingQuipu(true); setQuipuError(null);
    try {
      const res = await apiFetch("/api/quipu/receipts", { getToken });
      const rows: any[] = res?.data || [];
      setQuipuReceipts(rows.map((r: any) => ({
        id: String(r.id),
        number: r.attributes?.number || "",
        settlementDate: String(r.attributes?.settlement_date || "").slice(0, 10),
        amount: Number(r.attributes?.amount || 0),
        contactName: r.attributes?.contact_name || "",
        invoiceNumber: r.attributes?.invoice_number || "",
        paymentMethod: r.attributes?.payment_method || "",
        kind: r.attributes?.kind || "",
      })));
    } catch (e: any) { setQuipuError(e?.message || "Error al cargar cobros"); }
    finally { setLoadingQuipu(false); }
  }, [getToken, quipuStatus.connected]);

  useEffect(() => {
    if (!quipuStatus.connected) return;
    if ((tab === "dashboard" || tab === "bank_accounts") && quipuBankAccounts.length === 0) loadQuipuBankAccounts();
    if (tab === "contacts"      && quipuContacts.length === 0)     loadQuipuContacts();
    if (tab === "receipts"      && quipuReceipts.length === 0)     loadQuipuReceipts();
  }, [tab, quipuStatus.connected]);

  useEffect(() => {
    if (selectedBankAccountId && (tab === "bank_accounts" || tab === "dashboard")) {
      loadQuipuTransactions(selectedBankAccountId);
    }
  }, [selectedBankAccountId, tab]);

  const pushToQuipu = useCallback(async (facturaId: string) => {
    setPushingToQuipuId(facturaId);
    try {
      await apiFetch(`/api/quipu/push-factura/${facturaId}`, { method: "POST", getToken });
      await loadBilling();
    } catch (e: any) { setErrorMsg(e?.message || "Error al enviar factura a Quipu."); }
    finally { setPushingToQuipuId(null); }
  }, [getToken, loadBilling]);

  const saveContact = async (attrs: Partial<QuipuContact>) => {
    setSavingContact(true);
    try {
      if (editingContact?.id) {
        await apiFetch(`/api/quipu/contacts/${editingContact.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            kind: attrs.kind,
            name: attrs.name,
            tax_id: attrs.taxId,
            email: attrs.email,
            phone: attrs.phone,
            address: attrs.address,
            town: attrs.town,
            zip_code: attrs.zipCode,
            country: attrs.country,
            country_code: attrs.countryCode,
          }),
          getToken,
        });
      } else {
        await apiFetch("/api/quipu/contacts", {
          method: "POST",
          body: JSON.stringify({
            kind: attrs.kind || "client",
            name: attrs.name,
            tax_id: attrs.taxId,
            email: attrs.email,
            phone: attrs.phone,
            address: attrs.address,
            town: attrs.town,
            zip_code: attrs.zipCode,
            country: attrs.country,
            country_code: attrs.countryCode,
          }),
          getToken,
        });
      }
      await loadQuipuContacts();
      setShowContactEditor(false); setEditingContact(null);
    } catch (e: any) { setErrorMsg(e?.message || "Error al guardar contacto."); }
    finally { setSavingContact(false); }
  };

  const deleteContact = async (id: string) => {
    if (!confirm("¿Eliminar este contacto de Quipu?")) return;
    try {
      await apiFetch(`/api/quipu/contacts/${id}`, { method: "DELETE", getToken });
      setQuipuContacts(prev => prev.filter(c => c.id !== id));
    } catch (e: any) { setErrorMsg(e?.message || "Error al eliminar contacto."); }
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-emerald-800">Quipu conectado</p>
                  {isSilentSyncing && <span className="flex items-center gap-1 text-[11px] text-emerald-600"><Loader2 size={11} className="animate-spin" /> sincronizando…</span>}
                </div>
                <p className="mt-0.5 text-xs text-emerald-700">
                  {quipuStatus.syncError
                    ? <span className="text-red-600">{quipuStatus.syncError}</span>
                    : quipuStatus.lastSyncAt
                      ? `Última sincronización: ${new Date(quipuStatus.lastSyncAt).toLocaleString("es-ES")}`
                      : "Sincronización pendiente"}
                </p>
                {quipuStatus.syncSummary && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Contactos: {quipuStatus.syncSummary.contacts || 0} · Facturas Quipu: {quipuStatus.syncSummary.invoices || 0} · Importadas: {quipuStatus.syncSummary.importedToFacturacion ?? 0} · Actualizadas: {quipuStatus.syncSummary.updatedInFacturacion ?? 0}
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
              {(["dashboard","facturas","gastos","presupuestos"] as TabKey[]).includes(tab) && <OdooSection
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
              </OdooSection>}

              {/* ══ CONTACTOS ══════════════════════════════════════════════════════ */}
              {tab === "contacts" && (
                <div className="space-y-4">
                  {!quipuStatus.connected ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-700">
                      Conecta Quipu para gestionar contactos.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-600">{quipuContacts.length} contactos en Quipu</p>
                        <div className="flex gap-2">
                          <button onClick={loadQuipuContacts} disabled={loadingQuipu} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                            <RefreshCw size={12} className={loadingQuipu ? "animate-spin" : ""} /> Actualizar
                          </button>
                          <button onClick={() => { setEditingContact(null); setShowContactEditor(true); }} className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800">
                            <Plus size={12} /> Nuevo contacto
                          </button>
                        </div>
                      </div>
                      {quipuError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{quipuError}</div>}
                      <TableShell title="Contactos de Quipu" count={`${quipuContacts.length} registros`} headers={["Nombre", "Tipo", "NIF/CIF", "Email", "Teléfono", ""]}>
                        {loadingQuipu ? (
                          <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando...</td></tr>
                        ) : quipuContacts.map(c => (
                          <tr key={c.id} className="transition-colors hover:bg-slate-50/60">
                            <td className="px-5 py-3 text-sm font-semibold text-slate-800">{c.name}</td>
                            <td className="px-5 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${c.kind === "client" ? "bg-blue-100 text-blue-700" : c.kind === "provider" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{c.kind === "client" ? "Cliente" : c.kind === "provider" ? "Proveedor" : c.kind}</span></td>
                            <td className="px-5 py-3 text-sm text-slate-500 font-mono">{c.taxId || "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-500">{c.email || "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-500">{c.phone || "—"}</td>
                            <td className="px-5 py-3">
                              <div className="flex justify-end gap-2">
                                <ActionIconButton title="Editar" onClick={() => { setEditingContact(c); setShowContactEditor(true); }}><Pencil size={13} /></ActionIconButton>
                                <ActionIconButton title="Eliminar" tone="red" onClick={() => deleteContact(c.id)}><Trash2 size={13} /></ActionIconButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </TableShell>
                    </>
                  )}
                </div>
              )}

              {/* ══ CUENTAS BANCARIAS ═══════════════════════════════════════════════ */}
              {tab === "bank_accounts" && (
                <BankAccountsTab
                  connected={quipuStatus.connected}
                  accounts={quipuBankAccounts}
                  selectedId={selectedBankAccountId}
                  transactions={quipuTransactions}
                  loading={loadingQuipu}
                  error={quipuError}
                  lastSyncAt={quipuStatus.lastSyncAt}
                  onSelectAccount={setSelectedBankAccountId}
                  onRefresh={loadQuipuBankAccounts}
                  getToken={getToken}
                />
              )}

              {/* ══ COBROS ══════════════════════════════════════════════════════════ */}
              {tab === "receipts" && (
                <div className="space-y-4">
                  {!quipuStatus.connected ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-700">Conecta Quipu para ver cobros.</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-600">{quipuReceipts.length} cobros registrados en Quipu</p>
                        <button onClick={loadQuipuReceipts} disabled={loadingQuipu} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                          <RefreshCw size={12} className={loadingQuipu ? "animate-spin" : ""} /> Actualizar
                        </button>
                      </div>
                      {quipuError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{quipuError}</div>}
                      <TableShell title="Cobros de Quipu" count={`${quipuReceipts.length} registros`} headers={["Número", "Contacto", "Factura", "Fecha cobro", "Importe", "Forma de pago", "Tipo"]}>
                        {loadingQuipu ? (
                          <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando cobros...</td></tr>
                        ) : quipuReceipts.length === 0 ? (
                          <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">Sin cobros registrados</td></tr>
                        ) : quipuReceipts.map(r => (
                          <tr key={r.id} className="transition-colors hover:bg-slate-50/60">
                            <td className="px-5 py-3 text-sm font-semibold text-slate-800">{r.number || "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{r.contactName || "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-500">{r.invoiceNumber || "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-500">{fmtDate(r.settlementDate)}</td>
                            <td className="px-5 py-3 text-sm font-bold text-emerald-700">{fmtEur(r.amount)}</td>
                            <td className="px-5 py-3 text-xs text-slate-500">{r.paymentMethod || "—"}</td>
                            <td className="px-5 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${r.kind === "revenue" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{r.kind === "revenue" ? "Cobro" : r.kind || "—"}</span></td>
                          </tr>
                        ))}
                      </TableShell>
                    </>
                  )}
                </div>
              )}

              {/* ══ CONFIGURACIÓN ═══════════════════════════════════════════════════ */}
              {tab === "config" && (
                <div className="space-y-4 max-w-2xl">
                  <OdooSection title="Conexión con Quipu" subtitle="Gestiona las credenciales API para sincronizar facturas, contactos y cuentas bancarias.">
                    {quipuStatus.connected ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-emerald-800">Quipu conectado</p>
                            <p className="text-xs text-emerald-700 mt-0.5">
                              {quipuStatus.lastSyncAt ? `Última sincronización: ${new Date(quipuStatus.lastSyncAt).toLocaleString("es-ES")}` : "Sin sincronizar aún"}
                            </p>
                          </div>
                        </div>
                        {quipuStatus.syncSummary && (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                              <p className="text-2xl font-bold text-slate-900">{quipuStatus.syncSummary.contacts || 0}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Contactos</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                              <p className="text-2xl font-bold text-slate-900">{quipuStatus.syncSummary.invoices || 0}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Facturas Quipu</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                              <p className="text-2xl font-bold text-slate-900">{quipuStatus.syncSummary.numberingSeries || 0}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Series</p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-3">
                          <button onClick={syncQuipu} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                            <RefreshCw size={14} className={saving ? "animate-spin" : ""} /> Sincronizar ahora
                          </button>
                          <button onClick={() => setShowQuipuModal(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            <Settings size={14} /> Editar credenciales
                          </button>
                          <button onClick={disconnectQuipu} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                            <Trash2 size={14} /> Desconectar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-500">Conecta con Quipu para sincronizar tu contabilidad automáticamente.</p>
                        <button onClick={() => setShowQuipuModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800">
                          <ExternalLink size={14} /> Conectar Quipu
                        </button>
                      </div>
                    )}
                  </OdooSection>
                </div>
              )}

              {tab === "dashboard" && (
                <>
                  {/* ── Filtros de periodo ── */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {/* Año */}
                      <div className="relative" ref={yearMenuRef}>
                        <button
                          onClick={() => { setShowYearMenu(v => !v); setShowPeriodMenu(false); }}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${showYearMenu ? "border-slate-300 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                        >
                          {filterYear}
                          <ChevronDown size={13} className={`transition-transform ${showYearMenu ? "rotate-180" : ""}`} />
                        </button>
                        {showYearMenu && (
                          <div className="absolute left-0 top-full z-30 mt-1.5 w-28 overflow-hidden overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl" style={{ maxHeight: 220 }}>
                            {availableYears.map(year => (
                              <button
                                key={year}
                                onClick={() => { setFilterYear(year); setShowYearMenu(false); }}
                                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${filterYear === year ? "font-bold text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}
                              >
                                {filterYear === year && <span className="shrink-0 text-teal-600">✓</span>}
                                {year}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Periodo */}
                      <div className="relative" ref={periodMenuRef}>
                        <button
                          onClick={() => { setShowPeriodMenu(v => !v); setShowYearMenu(false); }}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${showPeriodMenu ? "border-slate-300 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                        >
                          {PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? "Todo el año"}
                          <ChevronDown size={13} className={`transition-transform ${showPeriodMenu ? "rotate-180" : ""}`} />
                        </button>
                        {showPeriodMenu && (
                          <div className="absolute left-0 top-full z-30 mt-1.5 w-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl" style={{ maxHeight: 280 }}>
                            {PERIOD_OPTIONS.map((opt, idx) => {
                              const isSelected = filterPeriod === opt.value;
                              const prevGroup = idx > 0 ? PERIOD_OPTIONS[idx - 1].group : undefined;
                              const showDivider = idx > 0 && opt.group !== prevGroup;
                              return (
                                <React.Fragment key={opt.value}>
                                  {showDivider && <div className="my-1 border-t border-slate-100" />}
                                  <button
                                    onClick={() => { setFilterPeriod(opt.value); setShowPeriodMenu(false); }}
                                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                                      isSelected
                                        ? "font-bold text-teal-700"
                                        : opt.group === "quarter"
                                          ? "text-teal-600 hover:bg-teal-50"
                                          : "text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {isSelected ? <span className="shrink-0 text-teal-600">✓</span> : <span className="w-3.5 shrink-0" />}
                                    {opt.label}
                                  </button>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Tickets pendientes: {ticketsPendientes}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Margen bruto: {fmtEur(margenBruto)}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Presupuestado: {fmtEur(totalPresupuestado)}</span>
                    </div>
                  </div>

                  {/* ── Resumen financiero (layout exacto Quipu) ── */}
                  {(() => {
                    const ivaRep  = totalFacturado - totalFacturado / 1.21;
                    const ivaSop  = gastosMensuales - gastosMensuales / 1.21;
                    const ivaLiq  = ivaRep - ivaSop;
                    const irpfRet = 0; // IRPF retenido (no calculable sin líneas de factura)
                    const irpfDed = 0;
                    const irpfLiq = irpfRet - irpfDed;
                    return (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                          <p className="text-sm font-bold text-slate-700">Resumen financiero</p>
                        </div>
                        {/* Fila 1: Ingresos | Gastos */}
                        <div className="grid grid-cols-2 border-b border-slate-100">
                          <div className="px-6 py-4 border-r border-slate-100">
                            <p className="text-xs text-slate-500 font-medium">Ingresos</p>
                            <p className="mt-1 text-2xl font-black text-emerald-600">{fmtEur(totalFacturado)}</p>
                          </div>
                          <div className="px-6 py-4">
                            <p className="text-xs text-slate-500 font-medium">Gastos</p>
                            <p className="mt-1 text-2xl font-black text-red-500">{fmtEur(gastosMensuales)}</p>
                          </div>
                        </div>
                        {/* Fila 2: IVA+IRPF desglosados */}
                        <div className="grid grid-cols-4 border-b border-slate-100 text-xs">
                          <div className="px-5 py-3 border-r border-slate-100">
                            <p className="text-slate-400 font-medium">IVA</p>
                            <p className="mt-0.5 font-semibold text-slate-700">{fmtEur(ivaRep)}</p>
                          </div>
                          <div className="px-5 py-3 border-r border-slate-100">
                            <p className="text-slate-400 font-medium">IRPF</p>
                            <p className="mt-0.5 font-semibold text-slate-700">{fmtEur(irpfRet)}</p>
                          </div>
                          <div className="px-5 py-3 border-r border-slate-100">
                            <p className="text-slate-400 font-medium">IVA</p>
                            <p className="mt-0.5 font-semibold text-slate-700">{fmtEur(ivaSop)}</p>
                          </div>
                          <div className="px-5 py-3">
                            <p className="text-slate-400 font-medium">IRPF</p>
                            <p className="mt-0.5 font-semibold text-slate-700">{fmtEur(irpfDed)}</p>
                          </div>
                        </div>
                        {/* Fila 3: IVA a liquidar | IRPF a liquidar */}
                        <div className="grid grid-cols-2 bg-slate-50/60 text-xs">
                          <div className="px-5 py-3 border-r border-slate-100">
                            <p className="text-slate-400 font-medium">IVA a liquidar</p>
                            <p className={`mt-0.5 font-bold ${ivaLiq >= 0 ? "text-slate-700" : "text-red-600"}`}>{fmtEur(ivaLiq)}</p>
                          </div>
                          <div className="px-5 py-3">
                            <p className="text-slate-400 font-medium">IRPF a liquidar</p>
                            <p className={`mt-0.5 font-bold ${irpfLiq >= 0 ? "text-slate-700" : "text-red-600"}`}>{fmtEur(irpfLiq)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Ingresos y Gastos (gráfico barras tipo Quipu) ── */}
                  <OdooSection
                    title="Ingresos y Gastos"
                    action={
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                          {([['bar', BarChart2], ['line', LineChart], ['pie', PieChart]] as const).map(([type, Icon]) => (
                            <button
                              key={type}
                              onClick={() => setChartType(type)}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${chartType === type ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              <Icon size={12} />
                            </button>
                          ))}
                        </div>
                        <div className="relative" ref={yearMenuRef}>
                          <button onClick={() => setShowYearMenu(v => !v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            {filterYear} <ChevronDown size={11} />
                          </button>
                          {showYearMenu && (
                            <div className="absolute left-0 top-full z-30 mt-1 w-24 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                              {availableYears.map(y => (
                                <button key={y} onClick={() => { setFilterYear(y); setShowYearMenu(false); }} className={`flex w-full items-center gap-1.5 px-3 py-2 text-xs transition-colors ${filterYear === y ? "font-bold text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}>
                                  {filterYear === y && "✓"} {y}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="relative" ref={periodMenuRef}>
                          <button onClick={() => setShowPeriodMenu(v => !v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            {PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? "Todo el año"} <ChevronDown size={11} />
                          </button>
                          {showPeriodMenu && (
                            <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-xl max-h-60 overflow-y-auto">
                              {PERIOD_OPTIONS.map(opt => (
                                <button key={opt.value} onClick={() => { setFilterPeriod(opt.value); setShowPeriodMenu(false); }} className={`flex w-full items-center gap-1.5 px-3 py-2 text-xs transition-colors ${filterPeriod === opt.value ? "font-bold text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}>
                                  {filterPeriod === opt.value && "✓"} {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  >
                    <MonthlyBarChart
                      facturas={filteredFacturas}
                      gastos={filteredGastos}
                      year={filterYear}
                      chartType={chartType}
                    />
                  </OdooSection>

                  {/* ── Análisis de ingresos por cliente (tipo Quipu) ── */}
                  <OdooSection
                    title="Análisis de ingresos"
                    action={<span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">Clientes</span>}
                  >
                    <ClientIncomeChart facturas={filteredFacturas} />
                  </OdooSection>

                  {/* ── Cuentas bancarias en dashboard (Quipu style) ── */}
                  {quipuStatus.connected && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                        <p className="text-sm font-bold text-slate-700">Cuentas bancarias</p>
                        <button onClick={loadQuipuBankAccounts} disabled={loadingQuipu} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                          <RefreshCw size={11} className={loadingQuipu ? "animate-spin" : ""} />
                        </button>
                      </div>
                      {loadingQuipu && quipuBankAccounts.length === 0 ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                          <Loader2 size={15} className="animate-spin" /> Cargando cuentas...
                        </div>
                      ) : quipuBankAccounts.length === 0 ? (
                        <div className="px-5 py-6 text-sm text-slate-400 text-center">Sin cuentas bancarias. Sincroniza Quipu primero.</div>
                      ) : (
                        <div className="flex gap-0 divide-x divide-slate-100">
                          {/* Lista de cuentas */}
                          <div className="flex-shrink-0 w-64">
                            {/* Fila "Todos" */}
                            <button
                              onClick={() => setSelectedBankAccountId(null)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold transition-colors ${!selectedBankAccountId ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                            >
                              <span>Todos</span>
                              <span>{fmtEur(quipuBankAccounts.reduce((s, a) => s + a.balance, 0))}</span>
                            </button>
                            {quipuBankAccounts.map(acc => (
                              <button
                                key={acc.id}
                                onClick={() => setSelectedBankAccountId(acc.id)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors border-t border-slate-100 ${selectedBankAccountId === acc.id ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                              >
                                <span className="truncate mr-2 uppercase font-semibold text-[11px]">{acc.name}</span>
                                <span className="font-bold shrink-0">{fmtEur(acc.balance)}</span>
                              </button>
                            ))}
                          </div>
                          {/* Gráfico de línea */}
                          <div className="flex-1 px-4 py-3 min-h-[140px]">
                            <BankBalanceChart
                              transactions={quipuTransactions}
                              currentBalance={
                                selectedBankAccountId
                                  ? (quipuBankAccounts.find(a => a.id === selectedBankAccountId)?.balance ?? 0)
                                  : quipuBankAccounts.reduce((s, a) => s + a.balance, 0)
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Vencimiento (aging) ── */}
                  <OdooSection title="Vencimiento" subtitle="Análisis de cobros y pagos por antigüedad.">
                    {(() => {
                      const now = new Date(); now.setHours(0,0,0,0);
                      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      const endOfNext  = new Date(now.getFullYear(), now.getMonth() + 2, 0);
                      const buckets = [
                        { label: "Atrasado",      test: (d: Date) => d < now },
                        { label: "Este mes",      test: (d: Date) => d >= now && d <= endOfMonth },
                        { label: "Próximo mes",   test: (d: Date) => d > endOfMonth && d <= endOfNext },
                        { label: "Más adelante",  test: (d: Date) => d > endOfNext },
                      ];
                      const rows = buckets.map(b => {
                        const cobrar = filteredCobrosPendientes.filter(f => { const d = f.vencimiento ? new Date(f.vencimiento) : new Date(0); return b.test(d); }).reduce((s, f) => s + f.pendiente, 0);
                        const pagar  = filteredGastos.filter(g => g.estado === "pendiente" && (() => { const d = g.fecha ? new Date(g.fecha) : new Date(0); return b.test(d); })()).reduce((s, g) => s + g.total, 0);
                        return { label: b.label, cobrar, pagar, resultado: cobrar - pagar };
                      });
                      const totCobrar = rows.reduce((s, r) => s + r.cobrar, 0);
                      const totPagar  = rows.reduce((s, r) => s + r.pagar,  0);
                      return (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead><tr className="border-b border-slate-100">
                              <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pr-8">Periodo</th>
                              <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right pr-8">A cobrar</th>
                              <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right pr-8">A pagar</th>
                              <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Resultado</th>
                            </tr></thead>
                            <tbody className="divide-y divide-slate-50">
                              {rows.map(r => (
                                <tr key={r.label}>
                                  <td className="py-2.5 pr-8 font-medium text-slate-700">{r.label}</td>
                                  <td className={`py-2.5 pr-8 text-right font-semibold ${r.cobrar > 0 ? "text-emerald-600" : "text-slate-300"}`}>{fmtEur(r.cobrar)}</td>
                                  <td className={`py-2.5 pr-8 text-right font-semibold ${r.pagar  > 0 ? "text-red-500"     : "text-slate-300"}`}>{fmtEur(r.pagar)}</td>
                                  <td className={`py-2.5 text-right font-bold ${r.resultado >= 0 ? "text-slate-800" : "text-red-600"}`}>{fmtEur(r.resultado)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot><tr className="border-t-2 border-slate-200">
                              <td className="pt-2.5 pr-8 text-[11px] font-black uppercase tracking-widest text-slate-500">Total</td>
                              <td className="pt-2.5 pr-8 text-right font-black text-emerald-600">{fmtEur(totCobrar)}</td>
                              <td className="pt-2.5 pr-8 text-right font-black text-red-500">{fmtEur(totPagar)}</td>
                              <td className={`pt-2.5 text-right font-black ${totCobrar - totPagar >= 0 ? "text-slate-900" : "text-red-600"}`}>{fmtEur(totCobrar - totPagar)}</td>
                            </tr></tfoot>
                          </table>
                        </div>
                      );
                    })()}
                  </OdooSection>

                  {/* ── KPIs rápidos ── */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <KpiCard label="Cobros pendientes" value={fmtEur(totalPendiente)} sub={`${filterYear} · ${PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? ""}`} color="amber" icon={Banknote} />
                    <KpiCard label="Facturas vencidas" value={String(facturasVencidas)} sub={`${filterYear} · ${PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? ""}`} color="red" icon={AlertCircle} />
                    <KpiCard label="Presupuestos pendientes de respuesta" value={String(presupuestosPendientes)} sub={`${filterYear} · ${PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? ""}`} color="blue" icon={FileSpreadsheet} />
                    <KpiCard label="Presupuestos aprobados sin facturar" value={String(presupuestosAprobados)} sub={`${filterYear} · ${PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? ""}`} color="violet" icon={CheckCircle2} />
                    <KpiCard label="Pagos pendientes" value={fmtEur(pagosPendientes)} sub={`${filterYear} · ${PERIOD_OPTIONS.find(o => o.value === filterPeriod)?.label ?? ""}`} color="slate" icon={Clock} />
                    <KpiCard label="Gastos del periodo" value={fmtEur(gastosMensuales)} sub="Control de costes" color="green" icon={TrendingDown} />
                  </div>

                  <TableShell title="Cobros pendientes de facturas" count={`${filteredCobrosPendientes.length} registros`} headers={["Número", "Cliente", "Expediente", "Vencimiento", "Pendiente", "Estado", ""]}>
                    {filteredCobrosPendientes.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">{row.num}</td>
                        <td className="px-5 py-3 text-sm text-slate-600">
                          <ClientRecordLink clientId={row.clientId} label={row.contacto} />
                        </td>
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
                        <ClientRecordLink clientId={row.clientId} label={row.contacto} />
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
                          {quipuStatus.connected && !(row as any).quipu_id && (
                            <ActionIconButton title="Enviar a Quipu" onClick={() => pushToQuipu(row.id)}>
                              {pushingToQuipuId === row.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Upload size={13} />}
                            </ActionIconButton>
                          )}
                          {(row as any).quipu_id && (
                            <span title="Ya en Quipu" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-500">
                              <CheckCircle2 size={13} />
                            </span>
                          )}
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
                        <ClientRecordLink clientId={row.clientId} label={row.contacto} />
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

      {/* ── Editor de contacto Quipu ──────────────────────────────── */}
      {showContactEditor && (
        <ContactEditorModal
          initial={editingContact}
          saving={savingContact}
          onClose={() => { setShowContactEditor(false); setEditingContact(null); }}
          onSave={saveContact}
        />
      )}
    </div>
  );
}

type ManualBankAccount = {
  id: string; name: string; bank_name?: string; iban?: string;
  balance: number; currency: string; notes?: string;
};

// ── BankAccountsTab ───────────────────────────────────────────
function BankAccountsTab({
  connected, accounts, selectedId, transactions, loading, error, lastSyncAt,
  onSelectAccount, onRefresh, getToken,
}: {
  connected: boolean;
  accounts: QuipuBankAccount[];
  selectedId: string | null;
  transactions: QuipuTransaction[];
  loading: boolean;
  error: string | null;
  lastSyncAt?: string | null;
  onSelectAccount: (id: string | null) => void;
  onRefresh: () => void;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
}) {
  const [txSearch, setTxSearch] = useState("");
  const [txFromDate, setTxFromDate] = useState("");
  const [txToDate, setTxToDate] = useState("");
  const [txDirection, setTxDirection] = useState<"all"|"in"|"out">("all");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [manualAccounts, setManualAccounts] = useState<ManualBankAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAcc, setEditingAcc] = useState<ManualBankAccount | null>(null);
  const [form, setForm] = useState({ name: "", bank_name: "", iban: "", balance: "", currency: "EUR", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/facturacion/bank-accounts", { getToken })
      .then(r => setManualAccounts(r?.data || []))
      .catch(() => {});
  }, []);

  const openForm = (acc?: ManualBankAccount) => {
    setEditingAcc(acc || null);
    setForm(acc ? { name: acc.name, bank_name: acc.bank_name||"", iban: acc.iban||"", balance: String(acc.balance), currency: acc.currency||"EUR", notes: acc.notes||"" } : { name:"", bank_name:"", iban:"", balance:"", currency:"EUR", notes:"" });
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name, bank_name: form.bank_name||null, iban: form.iban||null, balance: Number(form.balance||0), currency: form.currency||"EUR", notes: form.notes||null };
      if (editingAcc) {
        const r = await apiFetch(`/api/facturacion/bank-accounts/${editingAcc.id}`, { method: "PUT", body: JSON.stringify(payload), getToken });
        setManualAccounts(prev => prev.map(a => a.id === editingAcc.id ? r.data : a));
      } else {
        const r = await apiFetch("/api/facturacion/bank-accounts", { method: "POST", body: JSON.stringify(payload), getToken });
        setManualAccounts(prev => [...prev, r.data]);
      }
      setShowForm(false);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const deleteAcc = async (id: string) => {
    await apiFetch(`/api/facturacion/bank-accounts/${id}`, { method: "DELETE", getToken }).catch(() => {});
    setManualAccounts(prev => prev.filter(a => a.id !== id));
  };

  const selectedAcc = accounts.find(a => a.id === selectedId) || null;
  const ibanShort = selectedAcc?.iban ? `*${selectedAcc.iban.slice(-4)}` : "";

  const filtered = transactions.filter(tx => {
    if (txSearch && !tx.description?.toLowerCase().includes(txSearch.toLowerCase())) return false;
    if (txFromDate && tx.date < txFromDate) return false;
    if (txToDate && tx.date > txToDate) return false;
    if (txDirection === "in" && tx.amount < 0) return false;
    if (txDirection === "out" && tx.amount >= 0) return false;
    return true;
  });

  const pendingCount = transactions.filter(tx => !reviewed.has(tx.id)).length;

  if (!connected) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-700">Conecta Quipu para ver cuentas bancarias.</div>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800">Bancos</h3>
        <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {/* Add account modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">{editingAcc ? "Editar cuenta" : "Nueva cuenta bancaria"}</h3>
              <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><X size={16} /></button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Nombre *</span>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Ej: Cuenta corriente Sabadell" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Banco</span>
                  <input value={form.bank_name} onChange={e => setForm(f => ({...f, bank_name: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Sabadell" /></label>
                <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">IBAN</span>
                  <input value={form.iban} onChange={e => setForm(f => ({...f, iban: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" placeholder="ES12 1234..." /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Saldo (€)</span>
                  <input type="number" step="0.01" value={form.balance} onChange={e => setForm(f => ({...f, balance: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Divisa</span>
                  <select value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option>EUR</option><option>USD</option><option>GBP</option></select></label>
              </div>
              <label className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas</span>
                <input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={saveForm} disabled={saving || !form.name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account cards */}
      {!selectedId ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Manual accounts */}
          {manualAccounts.map(acc => (
            <div key={acc.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 shrink-0">
                    <Building2 size={18} className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{acc.name}</p>
                    <p className="text-xs text-slate-500 truncate">{acc.bank_name ? `${acc.bank_name}${acc.iban ? ` *${acc.iban.slice(-4)}` : ""}` : acc.iban || "Cuenta manual"}</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openForm(acc)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"><Pencil size={12} className="text-slate-500" /></button>
                  <button onClick={() => deleteAcc(acc.id)} className="rounded-lg border border-red-200 p-1.5 hover:bg-red-50"><Trash2 size={12} className="text-red-500" /></button>
                </div>
              </div>
              <p className={`text-2xl font-black ${acc.balance >= 0 ? "text-slate-900" : "text-red-600"}`}>{fmtEur(acc.balance)}</p>
              <p className="text-[11px] text-slate-400 mt-2">{acc.currency} · Introducida manualmente</p>
            </div>
          ))}

          {/* Add account button */}
          <button onClick={() => openForm()} className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors group min-h-[140px] flex flex-col items-center justify-center">
            <Plus size={24} className="text-slate-400 group-hover:text-blue-500 mb-2" />
            <p className="text-sm font-semibold text-slate-500 group-hover:text-blue-600">Añadir cuenta bancaria</p>
            <p className="text-xs text-slate-400 mt-1">Introduce el saldo manualmente</p>
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin mr-2" />Cargando...</div>
          ) : null}
          {accounts.map(acc => (
            <button key={acc.id} onClick={() => onSelectAccount(acc.id)}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
                  <Building2 size={18} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{acc.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {acc.bankName ? `${acc.bankName}${acc.iban ? ` *${acc.iban.slice(-4)}` : ""}` : acc.iban || ""}
                  </p>
                </div>
              </div>
              <p className={`text-2xl font-black ${acc.balance >= 0 ? "text-slate-900" : "text-red-600"}`}>
                {fmtEur(acc.balance)}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-700">{transactions.filter(t => !reviewed.has(t.id)).length || "—"}</p>
                  <p className="text-[11px] text-slate-400">Movimientos por conciliar</p>
                </div>
                {lastSyncAt && (
                  <p className="text-[11px] text-slate-400 text-right">Sincronizada: {new Date(lastSyncAt).toLocaleDateString("es-ES")}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Transaction detail view */
        <div className="space-y-4">
          {/* Account header */}
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <button onClick={() => onSelectAccount(null)} className="text-slate-400 hover:text-slate-700 transition-colors">
              <X size={16} />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 shrink-0">
              <Building2 size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">{selectedAcc?.name}</p>
              <p className="text-xs text-slate-500">{selectedAcc?.bankName}{ibanShort ? ` ${ibanShort}` : ""}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xl font-black ${(selectedAcc?.balance ?? 0) >= 0 ? "text-slate-900" : "text-red-600"}`}>
                {fmtEur(selectedAcc?.balance ?? 0)}
              </p>
              {lastSyncAt && <p className="text-[11px] text-slate-400">Última sincronización {new Date(lastSyncAt).toLocaleDateString("es-ES")}</p>}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <select value={txDirection} onChange={e => setTxDirection(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              <option value="all">Cualquier estado</option>
              <option value="in">Entradas</option>
              <option value="out">Salidas</option>
            </select>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <input type="date" value={txFromDate} onChange={e => setTxFromDate(e.target.value)}
                className="text-xs text-slate-600 outline-none bg-transparent" />
              <span className="text-slate-400 text-xs">–</span>
              <input type="date" value={txToDate} onChange={e => setTxToDate(e.target.value)}
                className="text-xs text-slate-600 outline-none bg-transparent" />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative">
                <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  placeholder="Buscar por concepto..."
                  className="rounded-lg border border-slate-200 bg-white pl-3 pr-8 py-2 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-300 w-48" />
                {txSearch && (
                  <button onClick={() => setTxSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Transactions table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
              <p className="text-xs text-slate-500">Mostrando {filtered.length} de {transactions.length} movimientos</p>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  {pendingCount} por conciliar
                </span>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-400"><Loader2 size={16} className="animate-spin mr-2" />Cargando movimientos...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No existen resultados para tu búsqueda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-slate-100">
                    <tr>
                      {["Estado", "Movimientos bancarios", "Importe", "Saldo", "Acciones"].map(h => (
                        <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(tx => {
                      const isReviewed = reviewed.has(tx.id);
                      return (
                        <tr key={tx.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="px-5 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${isReviewed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {isReviewed ? "Revisado" : "Pendiente"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-slate-700">{tx.description || "Sin descripción"}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(tx.date)}</p>
                          </td>
                          <td className={`px-5 py-3 text-sm font-bold ${tx.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {tx.amount >= 0 ? "+" : ""}{fmtEur(tx.amount)}
                          </td>
                          <td className="px-5 py-3 text-sm font-semibold text-slate-800">
                            {tx.balanceAfter != null ? fmtEur(tx.balanceAfter) : "—"}
                          </td>
                          <td className="px-5 py-3">
                            <button onClick={() => setReviewed(prev => {
                              const next = new Set(prev);
                              if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id);
                              return next;
                            })}
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${isReviewed ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                              {isReviewed ? "Desmarcar" : "Marcar revisado"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MonthlyBarChart (Ingresos y Gastos, tipo Quipu) ───────────
const MONTH_LABELS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function MonthlyBarChart({ facturas, gastos, year, chartType }: { facturas: Factura[]; gastos: Gasto[]; year: number; chartType: 'bar' | 'line' | 'pie' }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; mes: string; ing: number; gas: number } | null>(null);
  const W = 600; const H = 160; const PAD_L = 36; const PAD_R = 8; const PAD_T = 10; const PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const barW   = Math.floor(chartW / 12 * 0.4);

  const monthly = MONTH_LABELS.map((label, mi) => {
    const ing = facturas.filter(f => { const d = new Date(f.fecha); return d.getFullYear() === year && d.getMonth() === mi; }).reduce((s, f) => s + f.total, 0);
    const gas = gastos.filter(g => { const d = new Date(g.fecha); return d.getFullYear() === year && d.getMonth() === mi; }).reduce((s, g) => s + g.total, 0);
    return { label, ing, gas };
  });

  const maxVal = Math.max(...monthly.flatMap(m => [m.ing, m.gas]), 1);
  const toY = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;
  const xCenter = (i: number) => PAD_L + (i + 0.5) * (chartW / 12);
  const curMonth = new Date().getMonth();

  const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal].map(v => ({
    v, label: v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0), y: toY(v),
  }));

  const legend = (
    <div className="mt-2 flex items-center justify-center gap-5">
      <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Gastos</span>
      <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Ingresos</span>
    </div>
  );

  const tooltipEl = tooltip && (
    <div className="pointer-events-none absolute z-10 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-xl"
      style={{ left: tooltip.x, top: 10, transform: "translateX(-50%)" }}>
      <p className="font-bold mb-1">{tooltip.mes}</p>
      <p className="text-emerald-400">Ingresos: {fmtEur(tooltip.ing)}</p>
      <p className="text-red-400">Gastos: {fmtEur(tooltip.gas)}</p>
    </div>
  );

  // ── Pie chart ──────────────────────────────────────────────────
  if (chartType === 'pie') {
    const totalIng = monthly.reduce((s, m) => s + m.ing, 0);
    const totalGas = monthly.reduce((s, m) => s + m.gas, 0);
    const total = totalIng + totalGas;

    if (total === 0) {
      return <p className="py-10 text-center text-sm text-slate-400">Sin datos para el periodo seleccionado.</p>;
    }

    const CX = 90; const CY = 90; const OR = 70; const IR = 40;
    const polar = (angle: number, r: number) => ({
      x: CX + r * Math.cos(angle - Math.PI / 2),
      y: CY + r * Math.sin(angle - Math.PI / 2),
    });
    const arc = (sa: number, ea: number) => {
      const os = polar(sa, OR); const oe = polar(ea, OR);
      const ie = polar(ea, IR); const is_ = polar(sa, IR);
      const lg = ea - sa > Math.PI ? 1 : 0;
      return `M${os.x.toFixed(2)} ${os.y.toFixed(2)} A${OR} ${OR} 0 ${lg} 1 ${oe.x.toFixed(2)} ${oe.y.toFixed(2)} L${ie.x.toFixed(2)} ${ie.y.toFixed(2)} A${IR} ${IR} 0 ${lg} 0 ${is_.x.toFixed(2)} ${is_.y.toFixed(2)} Z`;
    };
    const ingAngle = (totalIng / total) * 2 * Math.PI;
    const balance = totalIng - totalGas;

    return (
      <div className="flex items-center justify-center gap-10 py-2">
        <svg viewBox="0 0 180 180" style={{ width: 180, height: 180 }}>
          {totalIng > 0 && <path d={arc(0, ingAngle > 0 && ingAngle < 2 * Math.PI ? ingAngle : ingAngle - 0.001)} fill="#22c55e" />}
          {totalGas > 0 && <path d={arc(ingAngle, 2 * Math.PI - 0.001)} fill="#ef4444" />}
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize={9} fill="#64748b">Balance</text>
          <text x={CX} y={CY + 8} textAnchor="middle" fontSize={11} fill={balance >= 0 ? "#16a34a" : "#dc2626"} fontWeight="bold">
            {balance >= 0 ? "+" : ""}{Math.abs(balance) >= 1000 ? `${(balance / 1000).toFixed(1)}K€` : `${balance.toFixed(0)}€`}
          </text>
        </svg>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-500 inline-block" /><span className="text-xs text-slate-500">Ingresos</span></div>
            <p className="mt-1 text-base font-bold text-slate-800">{fmtEur(totalIng)}</p>
            <p className="text-[11px] text-slate-400">{Math.round((totalIng / total) * 100)}% del total</p>
          </div>
          <div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-500 inline-block" /><span className="text-xs text-slate-500">Gastos</span></div>
            <p className="mt-1 text-base font-bold text-slate-800">{fmtEur(totalGas)}</p>
            <p className="text-[11px] text-slate-400">{Math.round((totalGas / total) * 100)}% del total</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Line chart ─────────────────────────────────────────────────
  if (chartType === 'line') {
    const ingPts = monthly.map((m, i) => `${xCenter(i).toFixed(1)},${toY(m.ing).toFixed(1)}`).join(' ');
    const gasPts = monthly.map((m, i) => `${xCenter(i).toFixed(1)},${toY(m.gas).toFixed(1)}`).join(' ');

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} onMouseLeave={() => setTooltip(null)}>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={PAD_L - 4} y={t.y + 3.5} fontSize={9} fill="#94a3b8" textAnchor="end">{t.label}</text>
            </g>
          ))}
          <polyline points={ingPts} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={gasPts} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {monthly.map((m, i) => {
            const cx = xCenter(i);
            return (
              <g key={i} onMouseEnter={e => {
                const svgEl = e.currentTarget.ownerSVGElement as SVGSVGElement;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({ x: cx / (W / rect.width), y: 0, mes: m.label, ing: m.ing, gas: m.gas });
              }}>
                {m.ing > 0 && <circle cx={cx} cy={toY(m.ing)} r={3} fill="#22c55e" />}
                {m.gas > 0 && <circle cx={cx} cy={toY(m.gas)} r={3} fill="#ef4444" />}
                <rect x={cx - (chartW / 12) / 2} y={PAD_T} width={chartW / 12} height={chartH} fill="transparent" style={{ cursor: "pointer" }} />
              </g>
            );
          })}
          {monthly.map((m, i) => (
            <text key={i} x={xCenter(i)} y={H - 8} fontSize={9} fill="#94a3b8" textAnchor="middle">{m.label}</text>
          ))}
        </svg>
        {tooltipEl}
        {legend}
      </div>
    );
  }

  // ── Bar chart (default) ────────────────────────────────────────
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}
        onMouseLeave={() => setTooltip(null)}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#e2e8f0" strokeWidth={0.5} />
            <text x={PAD_L - 4} y={t.y + 3.5} fontSize={9} fill="#94a3b8" textAnchor="end">{t.label}</text>
          </g>
        ))}

        {monthly.map((m, i) => {
          const cx = xCenter(i);
          const isCurrent = i === curMonth && new Date().getFullYear() === year;
          const hIng = Math.max((m.ing / maxVal) * chartH, m.ing > 0 ? 1 : 0);
          const hGas = Math.max((m.gas / maxVal) * chartH, m.gas > 0 ? 1 : 0);
          return (
            <g key={i}
              onMouseEnter={e => {
                const svgEl = (e.currentTarget.ownerSVGElement as SVGSVGElement);
                const rect = svgEl.getBoundingClientRect();
                const scale = W / rect.width;
                setTooltip({ x: cx / scale, y: 0, mes: m.label, ing: m.ing, gas: m.gas });
              }}>
              {isCurrent && <rect x={cx - (chartW / 12) / 2} y={PAD_T} width={chartW / 12} height={chartH} fill="#f1f5f9" rx={2} />}
              {m.ing > 0 && <rect x={cx - barW - 1} y={toY(m.ing)} width={barW} height={hIng} fill="#22c55e" rx={2} />}
              {m.gas > 0 && <rect x={cx + 1} y={toY(m.gas)} width={barW} height={hGas} fill="#ef4444" rx={2} />}
              <rect x={cx - (chartW / 12) / 2} y={PAD_T} width={chartW / 12} height={chartH} fill="transparent" style={{ cursor: "pointer" }} />
            </g>
          );
        })}

        {monthly.map((m, i) => (
          <text key={i} x={xCenter(i)} y={H - 8} fontSize={9} fill="#94a3b8" textAnchor="middle">{m.label}</text>
        ))}
      </svg>

      {tooltipEl}
      {legend}
    </div>
  );
}

// ── ClientIncomeChart (Análisis de ingresos, tipo Quipu) ───────
function ClientIncomeChart({ facturas }: { facturas: Factura[] }) {
  // Group by client
  const byClient = new Map<string, { label: string; total: number }>();
  facturas.forEach(f => {
    const key = f.contacto || "Sin contacto";
    const cur = byClient.get(key) || { label: key, total: 0 };
    cur.total += f.total;
    byClient.set(key, cur);
  });
  const rows = Array.from(byClient.values()).sort((a, b) => b.total - a.total).slice(0, 8);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Sin datos de ingresos para el periodo seleccionado.</p>;
  }

  const maxVal = Math.max(...rows.map(r => r.total), 1);
  const W = 520; const H = rows.length * 28 + 20;
  const BAR_H = 16; const PAD_L = 8; const PAD_R = 130;
  const barMaxW = W - PAD_L - PAD_R;

  return (
    <div className="flex gap-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="flex-1" style={{ height: H }}>
        {rows.map((r, i) => {
          const bw = (r.total / maxVal) * barMaxW;
          const y = i * 28 + 6;
          const colors = ["#22c55e","#16a34a","#15803d","#166534","#4ade80","#86efac","#bbf7d0","#dcfce7"];
          return (
            <g key={r.label}>
              <rect x={PAD_L} y={y} width={Math.max(bw, 2)} height={BAR_H} fill={colors[i % colors.length]} rx={2} />
            </g>
          );
        })}
        {/* X axis line */}
        <line x1={PAD_L} x2={PAD_L} y1={0} y2={H} stroke="#e2e8f0" strokeWidth={1} />
      </svg>
      {/* Legend / amounts */}
      <div className="flex flex-col gap-1 pt-1.5 shrink-0">
        {rows.map((r, i) => {
          const colors = ["bg-emerald-500","bg-emerald-600","bg-emerald-700","bg-emerald-800","bg-green-400","bg-green-300","bg-green-200","bg-green-100"];
          return (
            <div key={r.label} className="flex items-center gap-2 text-xs" style={{ height: 28 }}>
              <span className={`inline-block h-3 w-3 rounded-sm shrink-0 ${colors[i % colors.length]}`} />
              <span className="text-slate-600 truncate max-w-[120px]">{r.label}</span>
              <span className="ml-auto font-bold text-slate-800 pl-2">{fmtEur(r.total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BankBalanceChart ───────────────────────────────────────────
function BankBalanceChart({
  transactions,
  currentBalance,
}: {
  transactions: QuipuTransaction[];
  currentBalance: number;
}) {
  const W = 420; const H = 100; const PAD = 16;

  // Build balance-over-time points from transactions (most recent last)
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const points: { label: string; balance: number }[] = [];

  // Reconstruct backwards from current balance
  let bal = currentBalance;
  const reversed = [...sorted].reverse();
  const historic = reversed.map(tx => {
    const before = bal - tx.amount;
    bal = before;
    return { label: tx.date.slice(5), balance: before }; // MM-DD label
  }).reverse();

  // Combine: historic + current point
  const allPts = [...historic.slice(-14), { label: "Hoy", balance: currentBalance }];

  if (allPts.length < 2) {
    // Just show a flat line at current balance
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-400">
        {allPts.length === 0 ? "Sin movimientos" : fmtEur(currentBalance)}
      </div>
    );
  }

  const balances = allPts.map(p => p.balance);
  const minB = Math.min(...balances);
  const maxB = Math.max(...balances);
  const range = maxB - minB || 1;

  const xStep = (W - PAD * 2) / (allPts.length - 1);
  const toX = (i: number) => PAD + i * xStep;
  const toY = (b: number) => H - PAD - ((b - minB) / range) * (H - PAD * 2);

  const pathD = allPts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.balance).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${toX(allPts.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`;

  // Y-axis labels
  const yLabels = [minB, (minB + maxB) / 2, maxB].map(v => ({
    y: toY(v),
    label: v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0),
  }));

  // X-axis labels (every ~3 pts)
  const xLabels = allPts
    .map((p, i) => ({ i, label: p.label }))
    .filter((_, i) => i % Math.ceil(allPts.length / 7) === 0 || i === allPts.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ minHeight: 100 }}>
      <defs>
        <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {yLabels.map((yl, i) => (
        <g key={i}>
          <line x1={PAD} x2={W - PAD} y1={yl.y} y2={yl.y} stroke="#e2e8f0" strokeWidth="1" />
          <text x={0} y={yl.y + 4} fontSize="9" fill="#94a3b8" textAnchor="start">{yl.label}</text>
        </g>
      ))}
      {/* Area fill */}
      <path d={areaD} fill="url(#bankGrad)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {allPts.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p.balance)} r="3" fill="#10b981" stroke="white" strokeWidth="1.5" />
      ))}
      {/* X labels */}
      {xLabels.map(xl => (
        <text key={xl.i} x={toX(xl.i)} y={H - 2} fontSize="9" fill="#94a3b8" textAnchor="middle">{xl.label}</text>
      ))}
    </svg>
  );
}

// ── ContactEditorModal ─────────────────────────────────────────
function ContactEditorModal({
  initial,
  saving,
  onClose,
  onSave,
}: {
  initial: QuipuContact | null;
  saving: boolean;
  onClose: () => void;
  onSave: (attrs: any) => void;
}) {
  const [form, setForm] = useState({
    kind: initial?.kind || "client",
    name: initial?.name || "",
    taxId: initial?.taxId || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    address: initial?.address || "",
    town: initial?.town || "",
    zipCode: initial?.zipCode || "",
    country: initial?.country || "España",
    countryCode: initial?.countryCode || "ES",
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const lbl = "block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5";
  const inp = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-300 focus:bg-white transition-colors";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/30 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center"><Users size={15} className="text-blue-600" /></div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contacto Quipu</p>
              <h3 className="text-base font-bold text-slate-900">{initial ? "Editar contacto" : "Nuevo contacto"}</h3>
            </div>
          </div>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Tipo</label>
              <select value={form.kind} onChange={e => set("kind", e.target.value)} className={inp}>
                <option value="client">Cliente</option>
                <option value="provider">Proveedor</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div>
              <label className={lbl}>NIF / CIF</label>
              <input value={form.taxId} onChange={e => set("taxId", e.target.value)} placeholder="B12345678" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>Nombre *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nombre del contacto" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Email</label>
              <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@ejemplo.com" type="email" className={inp} />
            </div>
            <div>
              <label className={lbl}>Teléfono</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+34 600 000 000" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>Dirección</label>
            <input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Calle Mayor 1, Madrid" className={inp} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Ciudad</label>
              <input value={form.town} onChange={e => set("town", e.target.value)} placeholder="Madrid" className={inp} />
            </div>
            <div>
              <label className={lbl}>Código postal</label>
              <input value={form.zipCode} onChange={e => set("zipCode", e.target.value)} placeholder="28001" className={inp} />
            </div>
            <div>
              <label className={lbl}>País</label>
              <input value={form.country} onChange={e => set("country", e.target.value)} placeholder="España" className={inp} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={() => form.name.trim() && onSave({
              ...form,
              name: form.name.trim(),
              taxId: form.taxId.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
              address: form.address.trim(),
              town: form.town.trim(),
              zipCode: form.zipCode.trim(),
              country: form.country.trim(),
              countryCode: form.countryCode.trim() || "ES",
            })}
            disabled={!form.name.trim() || saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-red-700 hover:bg-red-800 disabled:opacity-40 rounded-xl active:scale-95 transition-all">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {initial ? "Guardar cambios" : "Crear contacto"}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
