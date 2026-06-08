import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
  ChevronRight, Bug, History, TrendingUp, Pencil, Smartphone, ScanLine,
  FileCode2, FileText, Download, ArrowLeft, ChevronsLeft, ChevronsRight, CheckCircle2, Check,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { AtajosButton } from "../components/AtajosSystem";
import AdjuntosModal from "../components/AdjuntosModal";
import { EtapaSelect } from "../components/EtapaSelect";
import ColumnVisibilityModal from "../components/ColumnVisibilityModal";
import { UndoToast } from "../components/UndoToast";
import { useUndoDelete } from "../lib/useUndoDelete";

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

function fmtGender(g: string | null | undefined) {
  if (!g) return "—";
  if (g === "M") return "Masculino";
  if (g === "F") return "Femenino";
  return g;
}

function calcAge(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

type SortKey =
  | "internal_number"
  | "first_name"
  | "document_type"
  | "last_name"
  | "nif_cif"
  | "commercial_name"
  | "legal_nature"
  | "gender"
  | "birth_date"
  | "nationality"
  | "expedition_country"
  | "address"
  | "address_town"
  | "address_cp"
  | "address_province"
  | "address_country"
  | "phone_mobile"
  | "phone_1"
  | "phone_2"
  | "phone_3"
  | "phone_fax"
  | "email"
  | "website"
  | "type"
  | "lopd"
  | "date_alta"
  | "date_baja"
  | "center"
  | "commercial_communications"
  | "client_status";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "detail" | "multiselect";

interface QuickTaskFormData {
  titulo: string;
  descripcion: string;
  plazo: string;
  fecha_aviso: string;
  estado: string;
  prioridad: string;
  tipo: string;
  expediente: string;
  juzgado: string;
  num_proc: string;
  importe: string;
  notas: string;
  etapa: string;
}

const QUICK_TASK_EMPTY = (): QuickTaskFormData => ({
  titulo: "",
  descripcion: "",
  plazo: "",
  fecha_aviso: "",
  estado: "pendiente",
  prioridad: "media",
  tipo: "plazo_procesal",
  expediente: "",
  juzgado: "",
  num_proc: "",
  importe: "",
  notas: "",
  etapa: "",
});

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

const CLIENT_LIST_COLUMNS = [
  { key: "internal_number", label: "Nº", defaultVisible: true },
  { key: "name", label: "Nombre y apellidos", defaultVisible: true },
  { key: "document_type", label: "Tipo documento", defaultVisible: false },
  { key: "nif_cif", label: "NIF / CIF", defaultVisible: true },
  { key: "last_name", label: "Apellidos", defaultVisible: false },
  { key: "commercial_name", label: "Nombre comercial", defaultVisible: false },
  { key: "legal_nature", label: "Naturaleza jurídica", defaultVisible: false },
  { key: "gender", label: "Sexo", defaultVisible: false },
  { key: "birth_date", label: "Fecha nacimiento", defaultVisible: false },
  { key: "age", label: "Edad", defaultVisible: false },
  { key: "nationality", label: "Nacionalidad", defaultVisible: false },
  { key: "expedition_country", label: "País expedición", defaultVisible: false },
  { key: "address", label: "Dirección", defaultVisible: false },
  { key: "address_town", label: "Población", defaultVisible: false },
  { key: "address_cp", label: "Código postal", defaultVisible: false },
  { key: "address_province", label: "Provincia", defaultVisible: false },
  { key: "address_country", label: "País", defaultVisible: false },
  { key: "phone_mobile", label: "Móvil", defaultVisible: true },
  { key: "phone_1", label: "Teléfono", defaultVisible: true },
  { key: "email", label: "Correo electrónico", defaultVisible: true },
  { key: "phone_2", label: "Teléfono 2", defaultVisible: false },
  { key: "phone_3", label: "Teléfono 3", defaultVisible: false },
  { key: "phone_fax", label: "Fax", defaultVisible: false },
  { key: "website", label: "Página web", defaultVisible: false },
  { key: "type", label: "Tipo", defaultVisible: true },
  { key: "lopd", label: "LOPD", defaultVisible: true },
  { key: "date_alta", label: "Fecha alta", defaultVisible: true },
  { key: "date_baja", label: "Fecha baja", defaultVisible: false },
  { key: "center", label: "Centro", defaultVisible: false },
  { key: "commercial_communications", label: "Com. comerciales", defaultVisible: false },
  { key: "client_status", label: "Estado", defaultVisible: true },
  { key: "total_actuaciones", label: "Actuac.", defaultVisible: true },
  { key: "total_expedientes", label: "Exp.", defaultVisible: true },
] as const;

type ClientListColumnKey = typeof CLIENT_LIST_COLUMNS[number]["key"];
type ExportFormat = "excel" | "xml" | "word";
type ExportTemplate = {
  id: string;
  name: string;
  format: ExportFormat;
  fields: string[];
  builtIn?: boolean;
};
type ClientExportFieldDef = {
  id: string;
  label: string;
  getValue: (row: any) => string;
};

const DEFAULT_VISIBLE_CLIENT_COLUMNS: Record<ClientListColumnKey, boolean> = CLIENT_LIST_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column.defaultVisible;
  return acc;
}, {} as Record<ClientListColumnKey, boolean>);

const CLIENT_ROW_COLOR_STYLES: Record<string, {
  row: string;
  rowSelected: string;
  nameSelected: string;
  number: string;
  numberSelected: string;
  avatar: string;
  avatarSelected: string;
  card: string;
  cardSelected: string;
  cardNameSelected: string;
  multi: string;
  multiSelected: string;
}> = {
  ninguno: {
    row: "hover:bg-slate-50/80",
    rowSelected: "bg-red-50 border-l-2 border-l-red-500",
    nameSelected: "text-red-700",
    number: "text-slate-400",
    numberSelected: "text-red-400",
    avatar: "bg-slate-100 text-slate-500",
    avatarSelected: "bg-red-200 text-red-700",
    card: "border-slate-150 bg-white hover:border-slate-300 hover:shadow-sm",
    cardSelected: "border-red-300 bg-red-50 shadow-md shadow-red-100",
    cardNameSelected: "text-red-700",
    multi: "border-slate-200 bg-white hover:border-red-200 hover:shadow-sm hover:bg-slate-50/60",
    multiSelected: "border-red-400 bg-red-50 shadow-md shadow-red-100 scale-[0.98]",
  },
  azul: {
    row: "bg-sky-50/45 hover:bg-sky-100/70",
    rowSelected: "bg-sky-100 border-l-2 border-l-sky-500",
    nameSelected: "text-sky-900",
    number: "text-sky-500",
    numberSelected: "text-sky-700",
    avatar: "bg-sky-100 text-sky-600",
    avatarSelected: "bg-sky-200 text-sky-800",
    card: "border-sky-200 bg-sky-50/60 hover:border-sky-300 hover:shadow-sm",
    cardSelected: "border-sky-400 bg-sky-100 shadow-md shadow-sky-100",
    cardNameSelected: "text-sky-900",
    multi: "border-sky-200 bg-sky-50/50 hover:border-sky-300 hover:shadow-sm",
    multiSelected: "border-sky-400 bg-sky-100 shadow-md shadow-sky-100 scale-[0.98]",
  },
  verde: {
    row: "bg-emerald-50/45 hover:bg-emerald-100/70",
    rowSelected: "bg-emerald-100 border-l-2 border-l-emerald-500",
    nameSelected: "text-emerald-900",
    number: "text-emerald-500",
    numberSelected: "text-emerald-700",
    avatar: "bg-emerald-100 text-emerald-600",
    avatarSelected: "bg-emerald-200 text-emerald-800",
    card: "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:shadow-sm",
    cardSelected: "border-emerald-400 bg-emerald-100 shadow-md shadow-emerald-100",
    cardNameSelected: "text-emerald-900",
    multi: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:shadow-sm",
    multiSelected: "border-emerald-400 bg-emerald-100 shadow-md shadow-emerald-100 scale-[0.98]",
  },
  amarillo: {
    row: "bg-amber-50/55 hover:bg-amber-100/70",
    rowSelected: "bg-amber-100 border-l-2 border-l-amber-500",
    nameSelected: "text-amber-900",
    number: "text-amber-500",
    numberSelected: "text-amber-700",
    avatar: "bg-amber-100 text-amber-700",
    avatarSelected: "bg-amber-200 text-amber-900",
    card: "border-amber-200 bg-amber-50/60 hover:border-amber-300 hover:shadow-sm",
    cardSelected: "border-amber-400 bg-amber-100 shadow-md shadow-amber-100",
    cardNameSelected: "text-amber-900",
    multi: "border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:shadow-sm",
    multiSelected: "border-amber-400 bg-amber-100 shadow-md shadow-amber-100 scale-[0.98]",
  },
  naranja: {
    row: "bg-orange-50/55 hover:bg-orange-100/70",
    rowSelected: "bg-orange-100 border-l-2 border-l-orange-500",
    nameSelected: "text-orange-900",
    number: "text-orange-500",
    numberSelected: "text-orange-700",
    avatar: "bg-orange-100 text-orange-700",
    avatarSelected: "bg-orange-200 text-orange-900",
    card: "border-orange-200 bg-orange-50/60 hover:border-orange-300 hover:shadow-sm",
    cardSelected: "border-orange-400 bg-orange-100 shadow-md shadow-orange-100",
    cardNameSelected: "text-orange-900",
    multi: "border-orange-200 bg-orange-50/50 hover:border-orange-300 hover:shadow-sm",
    multiSelected: "border-orange-400 bg-orange-100 shadow-md shadow-orange-100 scale-[0.98]",
  },
  rojo: {
    row: "bg-rose-50/55 hover:bg-rose-100/70",
    rowSelected: "bg-rose-100 border-l-2 border-l-rose-500",
    nameSelected: "text-rose-900",
    number: "text-rose-500",
    numberSelected: "text-rose-700",
    avatar: "bg-rose-100 text-rose-700",
    avatarSelected: "bg-rose-200 text-rose-900",
    card: "border-rose-200 bg-rose-50/60 hover:border-rose-300 hover:shadow-sm",
    cardSelected: "border-rose-400 bg-rose-100 shadow-md shadow-rose-100",
    cardNameSelected: "text-rose-900",
    multi: "border-rose-200 bg-rose-50/50 hover:border-rose-300 hover:shadow-sm",
    multiSelected: "border-rose-400 bg-rose-100 shadow-md shadow-rose-100 scale-[0.98]",
  },
  morado: {
    row: "bg-violet-50/55 hover:bg-violet-100/70",
    rowSelected: "bg-violet-100 border-l-2 border-l-violet-500",
    nameSelected: "text-violet-900",
    number: "text-violet-500",
    numberSelected: "text-violet-700",
    avatar: "bg-violet-100 text-violet-700",
    avatarSelected: "bg-violet-200 text-violet-900",
    card: "border-violet-200 bg-violet-50/60 hover:border-violet-300 hover:shadow-sm",
    cardSelected: "border-violet-400 bg-violet-100 shadow-md shadow-violet-100",
    cardNameSelected: "text-violet-900",
    multi: "border-violet-200 bg-violet-50/50 hover:border-violet-300 hover:shadow-sm",
    multiSelected: "border-violet-400 bg-violet-100 shadow-md shadow-violet-100 scale-[0.98]",
  },
};

const CLIENT_EXPORT_STORAGE_KEY = "client-export-templates-v1";

const CLIENT_EXPORT_FIELDS: ClientExportFieldDef[] = [
  { id: "internal_number", label: "Nº", getValue: (row) => row.internal_number != null ? String(row.internal_number) : "" },
  { id: "name", label: "Nombre y apellidos", getValue: (row) => `${row.first_name || ""} ${row.last_name || ""}`.trim() },
  { id: "document_type", label: "Tipo documento", getValue: (row) => row.document_type || "" },
  { id: "nif_cif", label: "NIF / CIF", getValue: (row) => row.nif_cif || "" },
  { id: "last_name", label: "Apellidos", getValue: (row) => row.last_name || "" },
  { id: "commercial_name", label: "Nombre comercial", getValue: (row) => row.commercial_name || "" },
  { id: "legal_nature", label: "Naturaleza jurídica", getValue: (row) => row.legal_nature || "" },
  { id: "gender", label: "Sexo", getValue: (row) => fmtGender(row.gender).replace("—", "") },
  { id: "birth_date", label: "Fecha nacimiento", getValue: (row) => row.birth_date ? fmtDate(row.birth_date) : "" },
  { id: "age", label: "Edad", getValue: (row) => calcAge(row.birth_date) != null ? `${calcAge(row.birth_date)} años` : "" },
  { id: "nationality", label: "Nacionalidad", getValue: (row) => row.nationality || "" },
  { id: "expedition_country", label: "País expedición", getValue: (row) => row.expedition_country || "" },
  { id: "address", label: "Dirección", getValue: (row) => row.address || "" },
  { id: "address_town", label: "Población", getValue: (row) => row.address_town || "" },
  { id: "address_cp", label: "Código postal", getValue: (row) => row.address_cp || "" },
  { id: "address_province", label: "Provincia", getValue: (row) => row.address_province || "" },
  { id: "address_country", label: "País", getValue: (row) => row.address_country || "" },
  { id: "phone_mobile", label: "Móvil", getValue: (row) => row.phone_mobile || "" },
  { id: "phone_1", label: "Teléfono", getValue: (row) => row.phone_1 || "" },
  { id: "email", label: "Correo electrónico", getValue: (row) => row.email || "" },
  { id: "phone_2", label: "Teléfono 2", getValue: (row) => row.phone_2 || "" },
  { id: "phone_3", label: "Teléfono 3", getValue: (row) => row.phone_3 || "" },
  { id: "phone_fax", label: "Fax", getValue: (row) => row.phone_fax || "" },
  { id: "website", label: "Página web", getValue: (row) => row.website || "" },
  { id: "type", label: "Tipo", getValue: (row) => row.type || "" },
  { id: "lopd", label: "LOPD", getValue: (row) => row.lopd || "" },
  { id: "date_alta", label: "Fecha alta", getValue: (row) => fmtDate(row.date_alta ?? row.created_at).replace("—", "") },
  { id: "date_baja", label: "Fecha baja", getValue: (row) => row.date_baja ? fmtDate(row.date_baja) : "" },
  { id: "center", label: "Centro", getValue: (row) => row.center || "" },
  { id: "commercial_communications", label: "Com. comerciales", getValue: (row) => row.commercial_communications || "" },
  { id: "client_status", label: "Estado", getValue: (row) => row.client_status || "" },
  { id: "total_actuaciones", label: "Actuac.", getValue: (row) => row.total_actuaciones != null ? String(row.total_actuaciones) : "" },
  { id: "total_expedientes", label: "Exp.", getValue: (row) => row.total_expedientes != null ? String(row.total_expedientes) : "" },
];

const CLIENT_LIST_EXPORT_FIELD_BY_COLUMN: Record<ClientListColumnKey, string> = {
  internal_number: "internal_number",
  name: "name",
  document_type: "document_type",
  nif_cif: "nif_cif",
  last_name: "last_name",
  commercial_name: "commercial_name",
  legal_nature: "legal_nature",
  gender: "gender",
  birth_date: "birth_date",
  age: "age",
  nationality: "nationality",
  expedition_country: "expedition_country",
  address: "address",
  address_town: "address_town",
  address_cp: "address_cp",
  address_province: "address_province",
  address_country: "address_country",
  phone_mobile: "phone_mobile",
  phone_1: "phone_1",
  email: "email",
  phone_2: "phone_2",
  phone_3: "phone_3",
  phone_fax: "phone_fax",
  website: "website",
  type: "type",
  lopd: "lopd",
  date_alta: "date_alta",
  date_baja: "date_baja",
  center: "center",
  commercial_communications: "commercial_communications",
  client_status: "client_status",
  total_actuaciones: "total_actuaciones",
  total_expedientes: "total_expedientes",
};

function getClientExportFieldLabel(fieldId: string) {
  return CLIENT_EXPORT_FIELDS.find((field) => field.id === fieldId)?.label || fieldId;
}

function loadStoredClientExportTemplates(): ExportTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CLIENT_EXPORT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.name && Array.isArray(item.fields));
  } catch {
    return [];
  }
}

function saveStoredClientExportTemplates(templates: ExportTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLIENT_EXPORT_STORAGE_KEY, JSON.stringify(templates));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toExcelColumnLabel(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function buildExcelLikeHtml(headers: string[], rows: string[][], title: string) {
  const columnLetters = headers.map((_, index) => `<th class="col-letter">${toExcelColumnLabel(index)}</th>`).join("");
  const headerCells = headers.map((header) => `<th>${escapeXml(header)}</th>`).join("");
  const bodyRows = rows.map((row, rowIndex) => `<tr><th class="row-number">${rowIndex + 2}</th>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join("")}</tr>`).join("");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title)}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; background: #f3f6fb; margin: 0; padding: 18px; }
      .sheet { background: #ffffff; border: 1px solid #cfd8e3; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); overflow: hidden; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      th, td { border: 1px solid #d9e1ea; padding: 6px 8px; font-size: 11px; color: #111827; vertical-align: top; word-wrap: break-word; line-height: 1.35; }
      .corner, .col-letter, .row-number { background: #eef2f6; color: #5b6878; font-weight: 700; text-align: center; }
      .corner, .row-number { width: 44px; }
      .col-letter { padding: 5px 0; }
      thead .header-title { background: #dbe5f1; font-weight: 700; text-align: center; color: #233247; }
      tbody tr:nth-child(even) td { background: #fbfcfe; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <table>
        <thead>
          <tr><th class="corner"></th>${columnLetters}</tr>
          <tr><th class="row-number">1</th>${headerCells.replace(/<th>/g, '<th class="header-title">')}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportFormatMeta(format: ExportFormat) {
  switch (format) {
    case "xml":
      return {
        label: "XML",
        icon: FileCode2,
        className: "from-amber-50 to-orange-50 border-amber-200 text-amber-700",
        badgeClassName: "bg-amber-100 text-amber-700",
        description: "Estructurado para integraciones y otros sistemas.",
      };
    case "word":
      return {
        label: "Word",
        icon: FileText,
        className: "from-blue-50 to-sky-50 border-blue-200 text-blue-700",
        badgeClassName: "bg-blue-100 text-blue-700",
        description: "Documento editable con apariencia de tabla.",
      };
    default:
      return {
        label: "Excel",
        icon: FileSpreadsheet,
        className: "from-emerald-50 to-lime-50 border-emerald-200 text-emerald-700",
        badgeClassName: "bg-emerald-100 text-emerald-700",
        description: "Listado tipo hoja de cálculo con la plantilla por defecto.",
      };
  }
}

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
        flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.98] shadow-sm
        ${disabled
          ? "text-slate-300 cursor-not-allowed bg-white border border-slate-100"
          : primary
            ? "bg-red-600 text-white hover:bg-red-700 border border-red-600 shadow-red-100"
            : danger
              ? "text-red-600 bg-white hover:bg-red-50 border border-red-200"
              : "text-slate-600 bg-white hover:bg-slate-50 border border-slate-200"
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

  const handleOpen = () => {
    if (disabled) return;
    setOpen(o => !o);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={disabled}
        title={label}
        className={`
          flex items-center gap-0 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.98] border overflow-hidden shadow-sm
          ${disabled ? "text-slate-300 cursor-not-allowed border-slate-100 bg-white" : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200"}
        `}
      >
        <span className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Icon size={13} />
          <span className="hidden sm:inline whitespace-nowrap">{label}</span>
        </span>
        <span className={`px-1.5 py-1.5 border-l ${disabled ? "border-slate-100" : "border-slate-200 hover:bg-slate-100"}`}>
          <ChevronDownSmall size={10} />
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-[9999] mt-2 min-w-[220px] max-w-[280px] bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-300/40 py-1.5 max-h-[72vh] overflow-y-auto"
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
    </div>
  );
}

function AltaOptionsBtn({
  onManual,
  onDni,
  onLink,
}: {
  onManual: () => void;
  onDni: () => void;
  onLink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const options = [
    {
      title: "Crear manualmente",
      description: "Crea un cliente desde cero introduciendo sus datos manualmente.",
      icon: Plus,
      iconWrap: "bg-green-100 text-green-600",
      onClick: onManual,
    },
    {
      title: "Con DNI",
      description: "Sube anverso y reverso del DNI para rellenar la ficha inicial automáticamente.",
      icon: ScanLine,
      iconWrap: "bg-blue-100 text-blue-600",
      onClick: onDni,
    },
    {
      title: "Con enlace",
      description: "Genera un enlace para que el cliente rellene sus datos directamente.",
      icon: ExternalLink,
      iconWrap: "bg-amber-100 text-amber-700",
      onClick: onLink,
    },
  ];

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all select-none whitespace-nowrap shadow-sm ${
          open
            ? "bg-red-800 text-white shadow-sm"
            : "bg-red-700 text-white hover:bg-red-800 active:scale-[0.98]"
        }`}
      >
        <Plus size={13} />
        <span className="hidden sm:inline">Alta</span>
        <ChevronDownSmall size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-50 mt-2 w-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <p className="text-sm font-semibold text-slate-600">Elige cómo quieres agregar clientes</p>
          </div>
          <div className="p-2">
            {options.map((option) => (
              <button
                key={option.title}
                onClick={() => { option.onClick(); setOpen(false); }}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${option.iconWrap}`}>
                  <option.icon size={15} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-slate-800">{option.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-slate-500">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent">
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

function QuickTaskModal({
  client,
  form,
  setForm,
  saving,
  errorMsg,
  onClose,
  onSave,
  getToken,
}: {
  client: any;
  form: QuickTaskFormData;
  setForm: React.Dispatch<React.SetStateAction<QuickTaskFormData>>;
  saving: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSave: () => void;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
}) {
  const set = (k: keyof QuickTaskFormData, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-transparent p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Tareas del cliente</p>
            <h3 className="text-sm font-bold text-slate-800 mt-1">Crear obligación / plazo</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {errorMsg && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium">{errorMsg}</div>
        )}

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cliente seleccionado</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {(client?.first_name || "").trim()} {(client?.last_name || "").trim()}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{client?.nif_cif || client?.email || "Sin dato principal"}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input
              value={form.titulo}
              onChange={e => set("titulo", e.target.value)}
              placeholder="Descripción breve de la tarea..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => set("descripcion", e.target.value)}
              rows={2}
              placeholder="Instrucciones o contexto adicional..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                <option value="plazo_procesal">Plazo procesal</option>
                <option value="vista_juicio">Vista / Juicio</option>
                <option value="notificacion">Notificación</option>
                <option value="reunion">Reunión</option>
                <option value="escrito">Escrito</option>
                <option value="gestion">Gestión</option>
                <option value="pago">Pago</option>
                <option value="llamada">Llamada</option>
                <option value="diligencia">Diligencia</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fecha límite</label>
              <input type="date" value={form.plazo} onChange={e => set("plazo", e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
              <select value={form.estado} onChange={e => set("estado", e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                <option value="pendiente">Pendiente</option>
                <option value="urgente">Urgente</option>
                <option value="completada">Completada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Prioridad</label>
              <select value={form.prioridad} onChange={e => set("prioridad", e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expediente</label>
              <input value={form.expediente} onChange={e => set("expediente", e.target.value)} placeholder="EXP-2024-001" className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Juzgado / Tribunal</label>
              <input value={form.juzgado} onChange={e => set("juzgado", e.target.value)} placeholder="Juzgado nº..." className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nº procedimiento</label>
              <input value={form.num_proc} onChange={e => set("num_proc", e.target.value)} placeholder="123/2024" className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de aviso</label>
              <input type="date" value={form.fecha_aviso} onChange={e => set("fecha_aviso", e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Importe (€)</label>
              <input type="number" step="0.01" min="0" value={form.importe} onChange={e => set("importe", e.target.value)} placeholder="0,00" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Etapa</label>
              <EtapaSelect value={form.etapa} onChange={v => set("etapa", v)} getToken={getToken} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notas internas</label>
              <textarea
                value={form.notas}
                onChange={e => set("notas", e.target.value)}
                rows={2}
                placeholder="Observaciones internas..."
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.titulo.trim()}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg active:scale-95 transition-all"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Guardar tarea
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
  const [showColumnModal, setShowColumnModal] = useState(false);
  const opcionesRef = useRef<HTMLDivElement>(null);
  const [showAdjuntos, setShowAdjuntos] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ClientListColumnKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem("client-list-visible-columns");
      if (!raw) return DEFAULT_VISIBLE_CLIENT_COLUMNS;
      const parsed = JSON.parse(raw) as Partial<Record<ClientListColumnKey, boolean>>;
      return { ...DEFAULT_VISIBLE_CLIENT_COLUMNS, ...parsed };
    } catch {
      return DEFAULT_VISIBLE_CLIENT_COLUMNS;
    }
  });

  // Cerrar Opciones al clicar fuera
  React.useEffect(() => {
    function outside(e: MouseEvent) {
      if (opcionesRef.current && !opcionesRef.current.contains(e.target as Node)) {
        setShowOpciones(false);
      }
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  useEffect(() => {
    localStorage.setItem("client-list-visible-columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const visibleColumnCount = useMemo(() => {
    const base = CLIENT_LIST_COLUMNS.filter(column => visibleColumns[column.key]).length;
    return base + 1; // columna de acción final
  }, [visibleColumns]);
  const clientAvailableColumnItems = useMemo(
    () => CLIENT_LIST_COLUMNS.filter((column) => !visibleColumns[column.key]).map((column) => ({ key: column.key, label: column.label })),
    [visibleColumns]
  );
  const clientVisibleColumnItems = useMemo(
    () => CLIENT_LIST_COLUMNS.filter((column) => visibleColumns[column.key]).map((column) => ({ key: column.key, label: column.label })),
    [visibleColumns]
  );
  const moveClientColumnsToVisible = useCallback((keys: string[]) => {
    setVisibleColumns((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key as ClientListColumnKey] = true;
      });
      return next;
    });
  }, []);
  const moveClientColumnsToAvailable = useCallback((keys: string[]) => {
    setVisibleColumns((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key as ClientListColumnKey] = false;
      });
      return next;
    });
  }, []);
  const showAllClientColumns = useCallback(() => {
    setVisibleColumns(CLIENT_LIST_COLUMNS.reduce((acc, column) => {
      acc[column.key] = true;
      return acc;
    }, {} as Record<ClientListColumnKey, boolean>));
  }, []);
  const moveAllClientColumnsToAvailable = useCallback(() => {
    setVisibleColumns(CLIENT_LIST_COLUMNS.reduce((acc, column) => {
      acc[column.key] = false;
      return acc;
    }, {} as Record<ClientListColumnKey, boolean>));
  }, []);
  const [refreshSpin, setRefreshSpin] = useState(false);                     // animación refresco
  const [bajaConfirm, setBajaConfirm] = useState(false);                     // modal confirmar baja
  const [bajaLoading, setBajaLoading] = useState(false);                     // spinner baja

  const { pending: pendingClientDelete, startDelete: startClientDelete, undo: undoClientDelete, dismiss: dismissClientDelete } = useUndoDelete<any>({
    onDelete: async (id: string) => {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/entities/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    },
  });
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [quickTaskSaving, setQuickTaskSaving] = useState(false);
  const [quickTaskError, setQuickTaskError] = useState<string | null>(null);
  const [quickTaskForm, setQuickTaskForm] = useState<QuickTaskFormData>(QUICK_TASK_EMPTY);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportTemplateEditor, setShowExportTemplateEditor] = useState(false);
  const [exportEditorMode, setExportEditorMode] = useState<"create" | "edit">("create");
  const [customExportTemplates, setCustomExportTemplates] = useState<ExportTemplate[]>(() => loadStoredClientExportTemplates());
  const [selectedExportTemplateId, setSelectedExportTemplateId] = useState<string>("default-client-excel");
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("excel");
  const [exportTemplateName, setExportTemplateName] = useState("");
  const [exportVisibleFields, setExportVisibleFields] = useState<string[]>([]);
  const [exportAvailableSelected, setExportAvailableSelected] = useState<string[]>([]);
  const [exportVisibleSelected, setExportVisibleSelected] = useState<string[]>([]);
  const [exportError, setExportError] = useState("");
  const currentClientListExportFields = useMemo(
    () =>
      CLIENT_LIST_COLUMNS
        .filter((column) => visibleColumns[column.key])
        .map((column) => CLIENT_LIST_EXPORT_FIELD_BY_COLUMN[column.key]),
    [visibleColumns]
  );
  const defaultClientExportTemplate = useMemo<ExportTemplate>(
    () => ({
      id: "default-client-excel",
      name: "Listado actual",
      format: "excel",
      builtIn: true,
      fields: currentClientListExportFields,
    }),
    [currentClientListExportFields]
  );
  const exportTemplates = useMemo(
    () => [defaultClientExportTemplate, ...customExportTemplates],
    [defaultClientExportTemplate, customExportTemplates]
  );
  const selectedExportTemplate = useMemo(
    () => exportTemplates.find((template) => template.id === selectedExportTemplateId) || defaultClientExportTemplate,
    [exportTemplates, selectedExportTemplateId, defaultClientExportTemplate]
  );
  const availableExportFields = useMemo(
    () => CLIENT_EXPORT_FIELDS.filter((field) => !exportVisibleFields.includes(field.id)),
    [exportVisibleFields]
  );

  // Sistema de filtros multicriteria
  const [filters, setFilters] = useState<ActiveFilter[]>([
    { id: nextId++, field: "any", value: "" },
  ]);

  useEffect(() => {
    saveStoredClientExportTemplates(customExportTemplates);
  }, [customExportTemplates]);

  useEffect(() => {
    if (!exportTemplates.some((template) => template.id === selectedExportTemplateId)) {
      setSelectedExportTemplateId(defaultClientExportTemplate.id);
    }
  }, [exportTemplates, selectedExportTemplateId, defaultClientExportTemplate.id]);

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

  const exportPreviewRows = useMemo(() => filtered.slice(0, 12), [filtered]);

  // ── Estadísticas barra inferior ────────────────────────────
  const stats = useMemo(() => {
    const total   = clients.length;
    const activos = clients.filter(c => c.client_status === "Alta").length;
    const bajas   = clients.filter(c => c.client_status === "Baja").length;
    const pctBaja = total > 0 ? ((bajas / total) * 100).toFixed(2) : "0,00";
    return { total, activos, bajas, pctBaja };
  }, [clients]);

  useEffect(() => {
    saveStoredClientExportTemplates(customExportTemplates);
  }, [customExportTemplates]);

  useEffect(() => {
    if (!exportTemplates.some((template) => template.id === selectedExportTemplateId)) {
      setSelectedExportTemplateId(defaultClientExportTemplate.id);
    }
  }, [exportTemplates, selectedExportTemplateId, defaultClientExportTemplate.id]);

  // ── Ordenación ─────────────────────────────────────────────
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  // ── Acciones toolbar ───────────────────────────────────────
  const selectedClient = useMemo(() => clients.find(c => c.id === selected), [clients, selected]);
  const assignClientColor = useCallback(async (color: string) => {
    if (!selected || !selectedClient) return;
    try {
      const token = await getToken({ skipCache: true });
      const r = await fetch(`/api/entities/${selected}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ color }),
      });
      const j = await safeJson(r);
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error || "No se pudo asignar el color al cliente.");
      }
      const updatedColor = j?.data?.color || color;
      setClients((prev) => prev.map((client) => client.id === selected ? { ...client, color: updatedColor } : client));
      setShowOpciones(false);
    } catch (e: any) {
      alert(e?.message || "No se pudo asignar el color al cliente.");
    }
  }, [getToken, selected, selectedClient]);

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
  const handleBaja = () => {
    if (!selected) return;
    const client = clients.find(c => c.id === selected);
    if (!client) return;
    setClients(prev => prev.filter(c => c.id !== selected));
    setBajaConfirm(false);
    setSelected(null);
    startClientDelete(selected, client);
  };

  const handleUndoClient = () => {
    const item = undoClientDelete();
    if (item) setClients(prev => [...prev, item]);
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

  const openQuickTaskModal = () => {
    setQuickTaskForm(QUICK_TASK_EMPTY());
    setQuickTaskError(null);
    setShowQuickTaskModal(true);
  };

  const handleQuickTaskSave = async () => {
    if (!selected || !quickTaskForm.titulo.trim()) return;
    setQuickTaskSaving(true);
    setQuickTaskError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/client/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(quickTaskForm),
      });
      const result = await safeJson(res);
      if (!res.ok) {
        setQuickTaskError(result?.error || "No se pudo crear la tarea");
        return;
      }
      setShowQuickTaskModal(false);
      setQuickTaskForm(QUICK_TASK_EMPTY());
      window.dispatchEvent(new CustomEvent("historial-changed"));
    } catch (err: any) {
      setQuickTaskError(err.message || "Error de conexión");
    } finally {
      setQuickTaskSaving(false);
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

  const openExportModal = () => {
    setSelectedExportTemplateId(defaultClientExportTemplate.id);
    setSelectedExportFormat(defaultClientExportTemplate.format);
    setExportError("");
    setShowExportModal(true);
  };

  const openCreateExportTemplate = () => {
    setExportEditorMode("create");
    setExportTemplateName("");
    setSelectedExportFormat("excel");
    setExportVisibleFields([...defaultClientExportTemplate.fields]);
    setExportAvailableSelected([]);
    setExportVisibleSelected([]);
    setExportError("");
    setShowExportTemplateEditor(true);
  };

  const openEditExportTemplate = () => {
    setExportEditorMode("edit");
    setExportTemplateName(selectedExportTemplate.builtIn ? "" : selectedExportTemplate.name);
    setSelectedExportFormat(selectedExportTemplate.format);
    setExportVisibleFields([...selectedExportTemplate.fields]);
    setExportAvailableSelected([]);
    setExportVisibleSelected([]);
    setExportError("");
    setShowExportTemplateEditor(true);
  };

  const moveFieldsToVisible = (fieldIds: string[]) => {
    setExportVisibleFields((prev) => [...prev, ...fieldIds.filter((fieldId) => !prev.includes(fieldId))]);
    setExportAvailableSelected([]);
  };

  const moveFieldsToAvailable = (fieldIds: string[]) => {
    setExportVisibleFields((prev) => prev.filter((fieldId) => !fieldIds.includes(fieldId)));
    setExportVisibleSelected([]);
  };

  const saveExportTemplate = () => {
    if (!exportVisibleFields.length) {
      setExportError("Selecciona al menos una columna para la plantilla.");
      return;
    }
    const trimmedName = exportTemplateName.trim();
    if (exportEditorMode === "create" && !trimmedName) {
      setExportError("Escribe un nombre para la plantilla.");
      return;
    }
    if (exportEditorMode === "edit" && selectedExportTemplate.builtIn) {
      setExportError("Listado actual no se modifica desde aquí; refleja siempre las columnas visibles del listado.");
      return;
    }

    if (exportEditorMode === "edit") {
      setCustomExportTemplates((prev) =>
        prev.map((template) =>
          template.id === selectedExportTemplate.id
            ? { ...template, name: trimmedName, format: selectedExportFormat, fields: exportVisibleFields }
            : template
        )
      );
      setSelectedExportTemplateId(selectedExportTemplate.id);
    } else {
      const template: ExportTemplate = {
        id: crypto.randomUUID(),
        name: trimmedName,
        format: selectedExportFormat,
        fields: exportVisibleFields,
      };
      setCustomExportTemplates((prev) => [...prev, template]);
      setSelectedExportTemplateId(template.id);
    }

    setShowExportTemplateEditor(false);
    setExportError("");
  };

  const deleteSelectedTemplate = () => {
    if (selectedExportTemplate.builtIn) return;
    setCustomExportTemplates((prev) => prev.filter((template) => template.id !== selectedExportTemplate.id));
    setSelectedExportTemplateId(defaultClientExportTemplate.id);
  };

  const runExport = () => {
    const template = selectedExportTemplate;
    const fields = template.fields;
    if (!fields.length) {
      setExportError("La plantilla no tiene columnas para exportar.");
      return;
    }

    const headers = fields.map((fieldId) => getClientExportFieldLabel(fieldId));
    const rows = filtered.map((client) =>
      fields.map((fieldId) => CLIENT_EXPORT_FIELDS.find((field) => field.id === fieldId)?.getValue(client) || "")
    );
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeName = (template.name || "clientes").replace(/[^\w\d-_]+/g, "_");

    if (selectedExportFormat === "xml") {
      const xmlRows = filtered.map((client) => `  <cliente>\n${fields.map((fieldId) => `    <${fieldId}>${escapeXml(CLIENT_EXPORT_FIELDS.find((field) => field.id === fieldId)?.getValue(client) || "")}</${fieldId}>`).join("\n")}\n  </cliente>`).join("\n");
      downloadTextFile(`<?xml version="1.0" encoding="UTF-8"?>\n<clientes>\n${xmlRows}\n</clientes>\n`, `${safeName}_${dateStamp}.xml`, "application/xml;charset=utf-8");
    } else if (selectedExportFormat === "word") {
      const html = buildExcelLikeHtml(headers, rows, template.name);
      downloadTextFile(html, `${safeName}_${dateStamp}.doc`, "application/msword;charset=utf-8");
    } else {
      const html = buildExcelLikeHtml(headers, rows, template.name);
      downloadTextFile(html, `${safeName}_${dateStamp}.xls`, "application/vnd.ms-excel;charset=utf-8");
    }

    setShowExportModal(false);
    setExportError("");
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
        message={`Se borrará el cliente de la base de datos. Tendrás 15 segundos para deshacer.`}
        confirmLabel="Eliminar cliente"
        danger
        onConfirm={handleBaja}
        onCancel={() => setBajaConfirm(false)}
      />
    )}

    {pendingClientDelete && (
      <UndoToast
        message={`Cliente eliminado`}
        startedAt={pendingClientDelete.startedAt}
        onUndo={handleUndoClient}
        onDismiss={dismissClientDelete}
      />
    )}
    {showQuickTaskModal && selectedClient && (
      <QuickTaskModal
        client={selectedClient}
        form={quickTaskForm}
        setForm={setQuickTaskForm}
        saving={quickTaskSaving}
        errorMsg={quickTaskError}
        onClose={() => {
          setShowQuickTaskModal(false);
          setQuickTaskError(null);
          setQuickTaskForm(QUICK_TASK_EMPTY());
        }}
        onSave={handleQuickTaskSave}
        getToken={getToken}
      />
    )}
    {showExportModal && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[125] flex items-center justify-center bg-transparent p-3 sm:p-4 animate-in fade-in duration-200" onClick={() => setShowExportModal(false)}>
        <div className="flex h-[min(860px,calc(100vh-24px))] w-full max-w-[min(1380px,calc(100vw-24px))] flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Exportar clientes</p>
              <h3 className="text-[17px] font-bold text-slate-900">Plantillas de exportación</h3>
            </div>
            <button type="button" onClick={() => setShowExportModal(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>

          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="grid gap-2 md:grid-cols-3">
                {(["excel", "xml", "word"] as ExportFormat[]).map((format) => {
                  const meta = exportFormatMeta(format);
                  const Icon = meta.icon;
                  const active = selectedExportFormat === format;
                  return (
                    <button
                      key={format}
                      type="button"
                      onClick={() => setSelectedExportFormat(format)}
                      className={`group rounded-2xl border bg-gradient-to-br px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${meta.className} ${active ? "ring-2 ring-red-500/70 shadow-md scale-[1.01]" : "opacity-90 hover:opacity-100"}`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${meta.badgeClassName}`}>
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-[13px] font-bold leading-none">{meta.label}</p>
                            <p className="mt-1 text-[10px] leading-4 text-slate-500">{meta.description}</p>
                          </div>
                        </div>
                        {active && <CheckCircle2 size={16} className="text-red-500 shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <button type="button" onClick={openCreateExportTemplate} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm">Alta</button>
                <button type="button" onClick={deleteSelectedTemplate} disabled={selectedExportTemplate.builtIn} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40">Baja</button>
                <button type="button" onClick={openEditExportTemplate} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm">Modificar</button>
                <button type="button" onClick={() => setShowExportModal(false)} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm">Cancelar</button>
                <button type="button" onClick={runExport} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg">
                  <Download size={13} />
                  Exportar
                </button>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)] gap-0">
            <div className="border-r border-slate-200 p-3">
              <p className="mb-3 text-[13px] leading-5 text-slate-500">Selecciona una plantilla de exportación o configura una nueva con los campos que quieras exportar.</p>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Plantilla</div>
                <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
                  {exportTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        setSelectedExportTemplateId(template.id);
                        setSelectedExportFormat(template.format);
                      }}
                      className={`w-full border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 transition-all duration-150 ${selectedExportTemplateId === template.id ? "bg-gradient-to-r from-lime-300 via-lime-200 to-white text-slate-900 shadow-inner" : "hover:bg-slate-50 text-slate-700 hover:translate-x-1"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold leading-5">{template.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-wide opacity-70">{template.format}</p>
                        </div>
                        {selectedExportTemplateId === template.id && <CheckCircle2 size={16} className="text-red-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 p-3">
              <div className="grid min-h-0 gap-3 xl:grid-cols-[250px_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <span>Campos a exportar</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 normal-case">{selectedExportTemplate.fields.length} columnas</span>
                  </div>
                  <div className="max-h-[calc(100vh-360px)] overflow-y-auto px-4 py-3 text-[13px] text-slate-700">
                    {selectedExportTemplate.fields.map((fieldId) => (
                      <div key={fieldId} className="py-0.5">{getClientExportFieldLabel(fieldId)}</div>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <span>Vista previa</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 normal-case">{exportPreviewRows.length} filas</span>
                  </div>
                  <div className="h-[calc(100vh-360px)] overflow-auto bg-[#f3f6fb] p-3">
                    <div className="inline-block min-w-full overflow-hidden border border-[#cfd8e3] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                      <table className="min-w-max border-collapse text-[10px] text-slate-800">
                        <thead>
                          <tr>
                            <th className="w-10 border border-[#d9e1ea] bg-[#eef2f6] px-2 py-1 text-center font-bold text-slate-500" />
                            {selectedExportTemplate.fields.map((fieldId, index) => (
                              <th key={`${fieldId}-letter`} className="whitespace-nowrap border border-[#d9e1ea] bg-[#eef2f6] px-2 py-1 text-center font-bold text-slate-500">
                                {toExcelColumnLabel(index)}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            <th className="w-10 border border-[#d9e1ea] bg-[#eef2f6] px-2 py-1 text-center font-bold text-slate-500">1</th>
                            {selectedExportTemplate.fields.map((fieldId) => (
                              <th key={fieldId} className="whitespace-nowrap border border-[#d9e1ea] bg-[#dbe5f1] px-2.5 py-2 text-center font-semibold tracking-wide text-slate-700">
                                {getClientExportFieldLabel(fieldId)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {exportPreviewRows.map((row, rowIndex) => (
                            <tr key={row.id} className={rowIndex % 2 === 0 ? "bg-white" : "bg-[#fbfcfe]"}>
                              <td className="border border-[#d9e1ea] bg-[#eef2f6] px-2 py-2 text-center font-semibold text-slate-500">{rowIndex + 2}</td>
                              {selectedExportTemplate.fields.map((fieldId) => {
                                const field = CLIENT_EXPORT_FIELDS.find((item) => item.id === fieldId);
                                return (
                                  <td key={`${row.id}-${fieldId}`} className="border border-[#d9e1ea] px-2.5 py-2 align-top leading-5">
                                    {field ? field.getValue(row) : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              {exportError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {exportError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    {showExportTemplateEditor && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[126] flex items-center justify-center bg-transparent px-4 animate-in fade-in duration-200" onClick={() => setShowExportTemplateEditor(false)}>
        <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-900">{exportEditorMode === "create" ? "Nueva plantilla de exportación" : "Modificar plantilla de exportación"}</h3>
            <button type="button" onClick={() => setShowExportTemplateEditor(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>
          <div className="p-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_84px_1fr]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-800">Campos disponibles</h4>
                  <div className="relative">
                    <select value="clientes" disabled className="appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2 pr-9 text-sm text-slate-700 outline-none disabled:opacity-100">
                      <option>Clientes</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div className="h-[340px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
                  {availableExportFields.map((field) => (
                    <label key={field.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-all hover:bg-white hover:shadow-sm">
                      <input
                        type="checkbox"
                        checked={exportAvailableSelected.includes(field.id)}
                        onChange={(e) => setExportAvailableSelected((prev) => e.target.checked ? [...prev, field.id] : prev.filter((id) => id !== field.id))}
                      />
                      <span className="text-sm text-slate-700">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-3">
                <button type="button" onClick={() => moveFieldsToVisible(exportAvailableSelected)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"><ArrowRight size={18} /></button>
                <button type="button" onClick={() => moveFieldsToAvailable(exportVisibleSelected)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"><ArrowLeft size={18} /></button>
                <button type="button" onClick={() => moveFieldsToVisible(availableExportFields.map((field) => field.id))} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"><ChevronsRight size={18} /></button>
                <button type="button" onClick={() => moveFieldsToAvailable([...exportVisibleFields])} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"><ChevronsLeft size={18} /></button>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-800">Campos visibles</h4>
                  <div className="relative">
                    <select value={selectedExportFormat} onChange={(e) => setSelectedExportFormat(e.target.value as ExportFormat)} className="appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2 pr-9 text-sm text-slate-700 outline-none">
                      <option value="excel">Excel</option>
                      <option value="xml">XML</option>
                      <option value="word">Word</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div className="h-[340px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
                  {exportVisibleFields.map((fieldId) => (
                    <label key={fieldId} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-all hover:bg-white hover:shadow-sm">
                      <input
                        type="checkbox"
                        checked={exportVisibleSelected.includes(fieldId)}
                        onChange={(e) => setExportVisibleSelected((prev) => e.target.checked ? [...prev, fieldId] : prev.filter((id) => id !== fieldId))}
                      />
                      <span className="text-sm text-slate-700">{getClientExportFieldLabel(fieldId)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Nombre de la plantilla</label>
              <input
                type="text"
                value={exportTemplateName}
                onChange={(e) => setExportTemplateName(e.target.value)}
                placeholder="Ej. Clientes para seguimiento"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-red-300"
              />
            </div>

            {exportError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {exportError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowExportTemplateEditor(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={saveExportTemplate} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Guardar plantilla</button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    {showQuickTaskModal && selectedClient && (
      <QuickTaskModal
        client={selectedClient}
        form={quickTaskForm}
        setForm={setQuickTaskForm}
        saving={quickTaskSaving}
        errorMsg={quickTaskError}
        onClose={() => {
          setShowQuickTaskModal(false);
          setQuickTaskError(null);
          setQuickTaskForm(QUICK_TASK_EMPTY());
        }}
        onSave={handleQuickTaskSave}
        getToken={getToken}
      />
    )}
    <ColumnVisibilityModal
      open={showColumnModal}
      title="Modificar columnas del listado"
      sourceLabel="Clientes"
      targetLabel="Columnas visibles"
      availableItems={clientAvailableColumnItems}
      visibleItems={clientVisibleColumnItems}
      onMoveToVisible={moveClientColumnsToVisible}
      onMoveToAvailable={moveClientColumnsToAvailable}
      onMoveAllToVisible={showAllClientColumns}
      onMoveAllToAvailable={moveAllClientColumnsToAvailable}
      onClose={() => setShowColumnModal(false)}
    />
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
        <div className="flex items-center gap-1 px-2.5 py-2 border-b border-slate-100 bg-slate-50/80 flex-wrap">

          {/* ─ Alta ─ */}
          <AltaOptionsBtn
            onManual={() => navigate("/dashboard/clientes/new?mode=manual")}
            onDni={() => navigate("/dashboard/clientes/new?mode=dni")}
            onLink={() => navigate("/dashboard/clientes/new?mode=link")}
          />

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
            onClick={() => selected && navigate(`/dashboard/clientes/${selected}?edit=1`)}
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
                label: "Sign",
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
                  if (!selected) return;
                  navigate(`/dashboard/whatsapp?clientId=${selected}&mode=new`);
                },
              },
              {
                label: "Con Plantilla",
                icon: FileSpreadsheet,
                onClick: () => {
                  if (!selected) return;
                  navigate(`/dashboard/whatsapp?clientId=${selected}&mode=template`);
                },
              },
              {
                label: "Programar WhatsApp",
                icon: Bell,
                onClick: () => {
                  if (!selected) return;
                  navigate(`/dashboard/whatsapp?clientId=${selected}&mode=schedule`);
                },
              },
              {
                label: "Sign",
                icon: PenLine,
                onClick: () => selected && navigate(`/dashboard/clientes/${selected}#firma`),
              },
              {
                label: "Ver Conversación",
                icon: ExternalLink,
                onClick: () => {
                  if (!selected) return;
                  navigate(`/dashboard/whatsapp?clientId=${selected}&mode=thread`);
                },
              },
            ]}
          />

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* ─ Sign ─ */}
          <ToolBtn
            icon={PenLine} label="Sign"
            disabled={!selected}
            onClick={() => selected && navigate(`/dashboard/clientes/${selected}#firma`)}
          />

          {/* ─ Tareas ─ */}
          <DropdownBtn
            icon={ClipboardList} label="Tareas"
            disabled={!selected}
            items={[
              { label: "Nueva actuación", icon: Activity, onClick: () => selected && navigate(`/dashboard/clientes/${selected}#notas`) },
              { label: "Crear obligaciones", icon: ClipboardList, onClick: openQuickTaskModal },
              { label: "Ver historial", icon: History, onClick: () => selected && navigate(`/dashboard/clientes/${selected}`) },
              { divider: true, label: "", onClick: () => {} },
              { label: "Reactivar cliente (Alta)", icon: Plus, onClick: handleAlta },
            ]}
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
          <ToolBtn icon={FileSpreadsheet} label="Excel" onClick={openExportModal} />

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
              className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all shadow-sm border ${showOpciones ? "bg-red-50 border-red-300 text-red-700" : "text-slate-600 hover:bg-slate-50 border-slate-200 bg-white"}`}>
              <MoreHorizontal size={13} /> Opciones <ChevronDown size={10} />
            </button>
            {showOpciones && (
              <div className="absolute right-0 top-full mt-2 z-50 w-[290px] bg-white border border-slate-200 rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] py-1.5 overflow-visible">

                {/* Grupo 1 */}
                <button onClick={() => { alert("Seleccionar opciones favoritas"); setShowOpciones(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Star size={12} className="text-slate-400" /> Seleccionar Opciones Favoritas
                </button>
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowColumnModal(true);
                      setShowOpciones(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <LayoutList size={12} className="text-slate-400" /> Elegir columnas
                    </span>
                  </button>
                </div>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Ir a → submenú */}
                <div className="relative group/ira">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5"><ExternalLink size={12} className="text-slate-400" /> Ir a</span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full -ml-px top-[-1px] z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/ira:block">
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

                <div className="relative group/color">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <Palette size={12} className="text-slate-400" /> Asignar Color
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute right-full -mr-px top-[-1px] z-50 hidden min-w-[190px] rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl group-hover/color:block">
                    {[
                      { value: "ninguno", label: "Sin color", dot: "bg-slate-300" },
                      { value: "azul", label: "Azul suave", dot: "bg-sky-400" },
                      { value: "verde", label: "Verde suave", dot: "bg-emerald-400" },
                      { value: "amarillo", label: "Amarillo suave", dot: "bg-amber-400" },
                      { value: "naranja", label: "Naranja suave", dot: "bg-orange-400" },
                      { value: "rojo", label: "Rojo suave", dot: "bg-rose-400" },
                      { value: "morado", label: "Morado suave", dot: "bg-violet-400" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => assignClientColor(option.value)}
                        className="flex w-full items-center justify-between gap-2.5 px-3.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${option.dot}`} />
                          {option.label}
                        </span>
                        {(selectedClient?.color || "ninguno") === option.value && <Check size={11} className="text-red-500" />}
                      </button>
                    ))}
                  </div>
                </div>

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

                {/* Versión Antigua → submenú */}
                <div className="relative group/ver">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5"><History size={12} className="text-slate-400" /> Versión Antigua</span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full -ml-px top-[-1px] z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/ver:block">
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

              </div>
            )}
          </div>

          {/* ─ Indicador cliente seleccionado ─ */}
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
            <table className="w-full text-left text-sm min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  {visibleColumns.internal_number && <Th label="Nº"                 sortKey="internal_number" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="w-14 pl-4" />}
                  {visibleColumns.name && <Th label="Nombre y Apellidos" sortKey="first_name"      currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />}
                  {visibleColumns.document_type && <Th label="Tipo documento" sortKey="document_type" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.nif_cif && <Th label="NIF / CIF"          sortKey="nif_cif"         currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />}
                  {visibleColumns.last_name && <Th label="Apellidos" sortKey="last_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.commercial_name && <Th label="Nombre comercial" sortKey="commercial_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.legal_nature && <Th label="Naturaleza jurídica" sortKey="legal_nature" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.gender && <Th label="Sexo" sortKey="gender" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.birth_date && <Th label="Fecha nacimiento" sortKey="birth_date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.age && <Th label="Edad" sortKey="birth_date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.nationality && <Th label="Nacionalidad" sortKey="nationality" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.expedition_country && <Th label="País expedición" sortKey="expedition_country" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.address && <Th label="Dirección" sortKey="address" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.address_town && <Th label="Población" sortKey="address_town" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.address_cp && <Th label="Código postal" sortKey="address_cp" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.address_province && <Th label="Provincia" sortKey="address_province" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.address_country && <Th label="País" sortKey="address_country" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.phone_mobile && <Th label="Móvil"              sortKey="phone_mobile"    currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
                  {visibleColumns.phone_1 && <Th label="Teléfono"           sortKey="phone_1"         currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.email && <Th label="Correo Electrónico" sortKey="email"           currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
                  {visibleColumns.phone_2 && <Th label="Teléfono 2" sortKey="phone_2" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.phone_3 && <Th label="Teléfono 3" sortKey="phone_3" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.phone_fax && <Th label="Fax" sortKey="phone_fax" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.website && <Th label="Página web" sortKey="website" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.type && <Th label="Tipo"               sortKey="type"            currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />}
                  {visibleColumns.lopd && <Th label="LOPD"               sortKey="lopd"            currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.date_alta && <Th label="Fecha Alta"         sortKey="date_alta"       currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />}
                  {visibleColumns.date_baja && <Th label="Fecha baja" sortKey="date_baja" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.center && <Th label="Centro" sortKey="center" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  {visibleColumns.commercial_communications && <Th label="Com. comerciales" sortKey="commercial_communications" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden 2xl:table-cell" />}
                  {visibleColumns.client_status && <Th label="Estado"             sortKey="client_status"   currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />}
                  {visibleColumns.total_actuaciones && <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Actuac.</th>}
                  {visibleColumns.total_expedientes && <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Exp.</th>}
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="py-20 text-center">
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
                  const colorStyle = CLIENT_ROW_COLOR_STYLES[client.color || "ninguno"] || CLIENT_ROW_COLOR_STYLES.ninguno;
                  return (
                    <tr
                      key={client.id}
                      onClick={() => setSelected(isSelected ? null : client.id)}
                      onDoubleClick={() => navigate(`/dashboard/clientes/${client.id}`)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors group ${isSelected ? colorStyle.rowSelected : colorStyle.row}`}
                    >
                      {visibleColumns.internal_number && <td className={`pl-4 pr-3 py-3 font-mono ${isSelected ? colorStyle.numberSelected : colorStyle.number}`}>{client.internal_number || "—"}</td>}
                      {visibleColumns.name && <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          {client.photo_url
                            ? <img src={client.photo_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0 border border-slate-100" />
                            : <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? colorStyle.avatarSelected : colorStyle.avatar}`}>{((client.first_name || "?")[0] || "?").toUpperCase()}</div>
                          }
                          <div className="min-w-0">
                            <p className={`font-semibold leading-tight truncate ${isSelected ? colorStyle.nameSelected : "text-slate-800"}`}>{client.first_name} {client.last_name}</p>
                            {client.commercial_name && <p className="text-xs text-slate-400 truncate leading-tight">{client.commercial_name}</p>}
                          </div>
                        </div>
                      </td>}
                      {visibleColumns.document_type && <td className="px-3 py-3 hidden xl:table-cell text-slate-500">{client.document_type || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.nif_cif && <td className="px-3 py-3 font-mono text-slate-500">{client.nif_cif || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.last_name && <td className="px-3 py-3 hidden xl:table-cell text-slate-500">{client.last_name || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.commercial_name && <td className="px-3 py-3 hidden xl:table-cell text-slate-500 truncate max-w-[160px]">{client.commercial_name || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.legal_nature && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500">{client.legal_nature || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.gender && <td className="px-3 py-3 hidden xl:table-cell text-slate-500">{fmtGender(client.gender)}</td>}
                      {visibleColumns.birth_date && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500 whitespace-nowrap">{client.birth_date ? fmtDate(client.birth_date) : <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.age && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500 whitespace-nowrap">{calcAge(client.birth_date) !== null ? `${calcAge(client.birth_date)} años` : <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.nationality && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500">{client.nationality || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.expedition_country && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500">{client.expedition_country || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.address && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500 truncate max-w-[220px]">{client.address || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.address_town && <td className="px-3 py-3 hidden xl:table-cell text-slate-500">{client.address_town || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.address_cp && <td className="px-3 py-3 hidden xl:table-cell text-slate-500 whitespace-nowrap">{client.address_cp || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.address_province && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500">{client.address_province || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.address_country && <td className="px-3 py-3 hidden 2xl:table-cell text-slate-500">{client.address_country || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.phone_mobile && <td className="px-3 py-3 text-slate-500 hidden lg:table-cell">{client.phone_mobile || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.phone_1 && <td className="px-3 py-3 text-slate-500 hidden xl:table-cell">{client.phone_1 || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.phone_2 && <td className="px-3 py-3 text-slate-500 hidden 2xl:table-cell">{client.phone_2 || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.phone_3 && <td className="px-3 py-3 text-slate-500 hidden 2xl:table-cell">{client.phone_3 || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.phone_fax && <td className="px-3 py-3 text-slate-500 hidden 2xl:table-cell">{client.phone_fax || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.email && <td className="px-3 py-3 text-slate-500 hidden lg:table-cell truncate max-w-[160px]">{client.email || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.website && <td className="px-3 py-3 text-slate-500 hidden 2xl:table-cell truncate max-w-[180px]">{client.website || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.type && <td className="px-3 py-3 hidden md:table-cell"><span className={`font-semibold ${tipoColor[client.type] || "text-slate-600"}`}>{client.type || "—"}</span></td>}
                      {visibleColumns.lopd && <td className="px-3 py-3 hidden xl:table-cell">
                        {client.lopd ? <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${lopdColor[client.lopd] || "bg-slate-50 text-slate-500"}`}>{client.lopd}</span> : <span className="text-slate-300">—</span>}
                      </td>}
                      {visibleColumns.date_alta && <td className="px-3 py-3 text-slate-500 hidden md:table-cell whitespace-nowrap">{fmtDate(client.date_alta ?? client.created_at)}</td>}
                      {visibleColumns.date_baja && <td className="px-3 py-3 text-slate-500 hidden xl:table-cell whitespace-nowrap">{client.date_baja ? fmtDate(client.date_baja) : <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.center && <td className="px-3 py-3 text-slate-500 hidden xl:table-cell">{client.center || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.commercial_communications && <td className="px-3 py-3 text-slate-500 hidden 2xl:table-cell">{client.commercial_communications || <span className="text-slate-300">—</span>}</td>}
                      {visibleColumns.client_status && <td className="px-3 py-3">
                        {client.client_status ? <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusColor[client.client_status] || "bg-slate-100 text-slate-600"}`}>{client.client_status}</span> : <span className="text-slate-300">—</span>}
                      </td>}
                      {visibleColumns.total_actuaciones && <td className="px-3 py-3 hidden xl:table-cell text-center">
                        {(client.total_actuaciones ?? 0) > 0
                          ? <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{client.total_actuaciones}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>}
                      {visibleColumns.total_expedientes && <td className="px-3 py-3 hidden xl:table-cell text-center">
                        {(client.total_expedientes ?? 0) > 0
                          ? <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{client.total_expedientes}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>}
                      <td className="px-3 py-3 text-right">
                        <Link to={`/dashboard/clientes/${client.id}`} onClick={e => e.stopPropagation()} className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex opacity-0 group-hover:opacity-100" title="Abrir ficha">
                          <ExternalLink size={14} />
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
                  const colorStyle = CLIENT_ROW_COLOR_STYLES[client.color || "ninguno"] || CLIENT_ROW_COLOR_STYLES.ninguno;
                  return (
                    <div
                      key={client.id}
                      onClick={() => setSelected(isSelected ? null : client.id)}
                      onDoubleClick={() => navigate(`/dashboard/clientes/${client.id}`)}
                      className={`
                        flex items-center gap-4 px-4 py-3 rounded-xl border cursor-pointer transition-all group
                        ${isSelected ? colorStyle.cardSelected : colorStyle.card}
                      `}
                    >
                      {/* Avatar grande */}
                      <div className="shrink-0">
                        {client.photo_url
                          ? <img src={client.photo_url} alt="" className="h-11 w-11 rounded-xl object-cover border border-slate-100 shadow-sm" />
                          : (
                            <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-base font-bold shadow-sm ${isSelected ? colorStyle.avatarSelected : colorStyle.avatar}`}>
                              {((client.first_name || "?")[0] || "?").toUpperCase()}
                            </div>
                          )
                        }
                      </div>

                      {/* Nombre + número */}
                      <div className="w-52 shrink-0">
                        <p className={`font-bold text-sm leading-tight truncate ${isSelected ? colorStyle.cardNameSelected : "text-slate-800"}`}>
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
                          to={`/dashboard/clientes/${client.id}?edit=1`}
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
                  const colorStyle = CLIENT_ROW_COLOR_STYLES[client.color || "ninguno"] || CLIENT_ROW_COLOR_STYLES.ninguno;
                  return (
                    <div
                      key={client.id}
                      onClick={() => toggleId(client.id)}
                      className={`
                        relative flex flex-col items-center gap-2 px-3 pt-4 pb-3 rounded-xl border cursor-pointer
                        transition-all select-none group
                        ${isChecked ? colorStyle.multiSelected : colorStyle.multi}
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
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-bold transition-all ${isChecked ? `${colorStyle.avatarSelected} shadow-md` : colorStyle.avatar}`}>
                            {((client.first_name || "?")[0] || "?").toUpperCase()}
                          </div>
                        )
                      }

                      {/* Nombre */}
                      <div className="text-center min-w-0 w-full">
                        <p className={`text-[11px] font-bold leading-tight truncate ${isChecked ? colorStyle.cardNameSelected : "text-slate-800"}`}>
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
