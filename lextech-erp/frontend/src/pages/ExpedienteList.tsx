import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { Spinner } from "../components/Spinner";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FolderOpen, Plus, Loader2, AlertCircle, RefreshCw,
  X, ChevronUp, ChevronDown, ListFilter, ExternalLink,
  Edit3, Trash2, FileSpreadsheet, Printer, MoreHorizontal,
  Users, Activity, Mail, MessageSquare, MessageCircle, Paperclip,
  AlertTriangle, ClipboardList, ChevronRight, ChevronLeft, Star,
  Palette, Zap, Bell, Copy, GitMerge, Smartphone,
  Bug, History, TrendingUp, UserMinus, Pencil, PenLine, Bookmark, BarChart2,
  AlignJustify, LayoutList, ListChecks, Upload, Eye, Settings2, SlidersHorizontal, Check, Search, CheckCircle2,
  Download, FileCode2, FileText, ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft,
  Scale, Link2, Lock, Unlock, Hash,
} from "lucide-react";
import { AtajosButton } from "../components/AtajosSystem";
import AdjuntosModal from "../components/AdjuntosModal";
import ColumnVisibilityModal from "../components/ColumnVisibilityModal";
import BackButton from "../components/BackButton";
import { UndoToast } from "../components/UndoToast";
import { useUndoDelete } from "../lib/useUndoDelete";

type ViewMode = "list" | "detail" | "multiselect" | "csvImport" | "csvImportConfigure" | "csvImportReview" | "csvImportComplete" | "csvImportHistory" | "csvImportErrorDetail" | "documentImport" | "documentImportVerify";
import { safeJson, resolveApiUrl, resolveUploadUrl } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { TIPOS, ESTADOS, EXP_EMPTY, ExpedienteModal, lbl, inp } from "../components/ExpedienteModal";
import AppSelect from "../components/AppSelect";

type SortKey = "anio" | "num_exp" | "descripcion" | "tipo" | "cliente_nombre" | "contrario" | "juzgado" | "estado" | "fecha_inicio";
type SortDir = "asc" | "desc";

interface ActiveFilter { id: number; field: string; value: string; }
let nextId = 1;

interface ImportBatch {
  id: string;
  file_name: string;
  status: string;
  total_count: number;
  completed_count: number;
  error_count: number;
  pending_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  user_name: string;
}

interface DocumentImportItem {
  id: string;
  row_number: number;
  reference: string | null;
  status: string;
  error_message: string | null;
  payload?: {
    fileName?: string;
    extractedData?: Record<string, unknown>;
    draft?: Record<string, unknown>;
    previewUrl?: string;
    mimeType?: string;
    textPreview?: string;
    userError?: string | null;
    developerError?: string | null;
  } | null;
  created_expediente_id?: string | null;
  anio?: number | null;
  num_exp?: number | null;
  descripcion?: string | null;
  tipo?: string | null;
  cliente_nombre?: string | null;
}

interface CsvFieldMapping {
  id: string;
  label: string;
  help: string;
  required?: boolean;
  selected: string;
  sample: string;
}

type CsvPreviewRow = Record<string, string>;

interface CsvFieldDefinition {
  id: string;
  label: string;
  help: string;
  required?: boolean;
  aliases: string[];
}

interface CsvImportIssue {
  rowNumber: number;
  fieldId: string;
  fieldLabel: string;
  message: string;
}

interface CsvImportSummary {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  issues: CsvImportIssue[];
}

interface CsvRowImportResult {
  rowNumber: number;
  status: "completed" | "failed";
  reference: string | null;
  error_message: string | null;
  payload: Record<string, unknown>;
  created_expediente_id?: string | null;
}

const CSV_UNASSIGNED = "Sin asignar";

const CSV_FIELD_DEFINITIONS: CsvFieldDefinition[] = [
  { id: "anio",             label: "Año",                    help: "Año del expediente",                                         aliases: ["año", "anio", "ejercicio"] },
  { id: "ref_propia",       label: "Referencia interna",     help: "Código único del caso (ID interno del despacho)",            aliases: ["referencia", "ref. propia", "ref propia", "referencia propia", "id expediente", "id del expediente", "expediente", "ref"] },
  { id: "num_proc",         label: "Nº Procedimiento",       help: "Número del procedimiento judicial (num. autos)",             aliases: ["num.", "numero", "numero procedimiento", "n procedimiento", "procedimiento", "num procedimiento", "num. autos", "num autos", "autos", "numero autos"] },
  { id: "descripcion",      label: "Descripción",            help: "Resumen o asunto del expediente",                            aliases: ["descripcion", "descripción", "detalle", "asunto", "observacion", "observación", "concepto"] },
  { id: "tipo_procedimiento", label: "Tipo de Procedimiento", help: "Tipo de procedimiento (ej: Procedimiento ordinario)",       aliases: ["tipo", "tipo proc.", "tipo proc", "tipo procedimiento", "procedimiento tipo", "clase procedimiento"] },
  { id: "juzgado",          label: "Juzgado / Tribunal",     help: "Nombre completo del juzgado o tribunal (texto libre)",       aliases: ["juzgado", "tribunal", "organo judicial", "sede", "organo", "juzgado tribunal"] },
  { id: "tipo_juzgado",     label: "Tipo de Juzgado",        help: "Tipo de órgano judicial si viene en columna separada",       aliases: ["tipo juzgado", "clase juzgado", "tipo organo"] },
  { id: "numero_juzgado",   label: "Nº Juzgado",             help: "Número del juzgado si viene en columna separada",            aliases: ["numero juzgado", "n juzgado", "num juzgado", "numero del juzgado"] },
  { id: "poblacion",        label: "Población",              help: "Municipio/sede del juzgado si viene en columna separada",    aliases: ["poblacion", "población", "municipio", "localidad", "partido judicial", "ciudad"] },
  { id: "cliente",          label: "Cliente",                help: "Nombre del cliente asociado",                                aliases: ["cliente", "demandante", "parte actora", "actor"] },
  { id: "contrario",        label: "Parte contraria",        help: "Nombre del demandado o parte contraria",                     aliases: ["contrario", "demandado", "parte contraria", "demandados"] },
  { id: "procurador",       label: "Procurador",             help: "Procurador vinculado al asunto",                             aliases: ["procurador"] },
  { id: "nig",              label: "NIG",                    help: "Número de identificación general",                           aliases: ["nig", "numero identificacion general", "n.i.g"] },
  { id: "estado",           label: "Estado",                 help: "Estado del expediente (abierto/cerrado/suspendido)",         aliases: ["estado", "situacion", "situación", "status"] },
  { id: "fecha_inicio",     label: "Fecha de alta",          help: "Fecha de alta del expediente (DD/MM/YYYY o YYYY-MM-DD)",     aliases: ["fecha inicio", "fecha alta", "fecha apertura", "inicio", "fecha", "alta"] },
  { id: "observaciones",    label: "Observaciones",          help: "Notas adicionales",                                          aliases: ["observaciones", "notas", "comentarios", "nota"] },
];

function normalizeCsvHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectCsvDelimiter(line: string) {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter = ";") {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (insideQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvContent(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { headers: [], rows: [] as CsvPreviewRow[] };
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((header, index) => header || `Columna ${index + 1}`);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    return headers.reduce<CsvPreviewRow>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });

  return { headers, rows };
}

function buildCsvMappings(headers: string[], rows: CsvPreviewRow[]) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeCsvHeader(header),
  }));
  const firstRow = rows[0] || {};
  const usedHeaders = new Set<string>();

  return CSV_FIELD_DEFINITIONS.map((field) => {
    const matchedHeader = normalizedHeaders.find((header) => (
      field.aliases.some((alias) => {
        const normalizedAlias = normalizeCsvHeader(alias);
        return header.normalized === normalizedAlias
          || header.normalized.includes(normalizedAlias)
          || normalizedAlias.includes(header.normalized);
      })
    ) && !usedHeaders.has(header.original));

    const selected = matchedHeader?.original || CSV_UNASSIGNED;
    if (matchedHeader) usedHeaders.add(matchedHeader.original);

    return {
      id: field.id,
      label: field.label,
      help: field.help,
      required: field.required,
      selected,
      sample: selected === CSV_UNASSIGNED ? "Sin detectar" : (firstRow[selected] || "Sin valor"),
    };
  });
}

function validateCsvImport(mappings: CsvFieldMapping[], rows: CsvPreviewRow[]): CsvImportSummary {
  const issues: CsvImportIssue[] = [];

  // Only warn about duplicate ref_propia within the CSV (informational, doesn't block)
  const refMapping = mappings.find(m => m.id === "ref_propia");
  if (refMapping && refMapping.selected !== CSV_UNASSIGNED) {
    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      const val = (row[refMapping.selected] || "").trim().toLowerCase();
      if (!val) return;
      if (seen.has(val)) {
        issues.push({
          rowNumber: index + 1,
          fieldId: "ref_propia",
          fieldLabel: "Referencia interna",
          message: `Referencia duplicada en el CSV (ya aparece en fila ${seen.get(val)})`,
        });
      } else {
        seen.set(val, index + 1);
      }
    });
  }

  return {
    totalProcessed: rows.length,
    successCount: rows.length,
    errorCount: 0,
    successRate: 100,
    issues,
  };
}

function buildCsvSummary(totalProcessed: number, issues: CsvImportIssue[]): CsvImportSummary {
  const rowsWithErrors = new Set(issues.map((issue) => issue.rowNumber));
  const errorCount = rowsWithErrors.size;
  const successCount = Math.max(totalProcessed - errorCount, 0);
  const successRate = totalProcessed > 0 ? Math.round((successCount / totalProcessed) * 100) : 0;

  return {
    totalProcessed,
    successCount,
    errorCount,
    successRate,
    issues,
  };
}

function getCsvMappedValue(row: CsvPreviewRow, mappings: CsvFieldMapping[], fieldId: string) {
  const mapping = mappings.find((item) => item.id === fieldId);
  if (!mapping || mapping.selected === CSV_UNASSIGNED) return "";
  return (row[mapping.selected] || "").trim();
}

function normalizeExpedienteEstado(value: string) {
  const normalized = normalizeCsvHeader(value);
  if (normalized.includes("cerr")) return "cerrado";
  if (normalized.includes("suspend")) return "suspendido";
  if (normalized.includes("archiv")) return "archivado";
  return "abierto";
}

function inferExpedienteTipo(value: string) {
  const normalized = normalizeCsvHeader(value);
  if (normalized.includes("monitor")) return "monitorio";
  if (normalized.includes("obligacion")) return "obligacion_hacer";
  if (normalized.includes("prejud")) return "prejudicial";
  if (normalized.includes("dilig")) return "diligencias";
  if (normalized.includes("penal")) return "penal";
  if (normalized.includes("labor")) return "laboral";
  if (normalized.includes("contenc")) return "contencioso";
  if (normalized.includes("extrajud")) return "extrajudicial";
  return "judicial";
}

function parseCsvDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  // MM/DD/YYYY
  const mdyMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mdyMatch) return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, "0")}-${mdyMatch[2].padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function buildExpedientePayload(row: CsvPreviewRow, mappings: CsvFieldMapping[]) {
  const anioRaw = getCsvMappedValue(row, mappings, "anio");
  const referencia = getCsvMappedValue(row, mappings, "ref_propia");
  const numeroProcedimiento = getCsvMappedValue(row, mappings, "num_proc");
  const tipoJuzgado = getCsvMappedValue(row, mappings, "tipo_juzgado");
  const numeroJuzgado = getCsvMappedValue(row, mappings, "numero_juzgado");
  const poblacion = getCsvMappedValue(row, mappings, "poblacion");
  const tipoProcedimiento = getCsvMappedValue(row, mappings, "tipo_procedimiento");
  const juzgadoDireto = getCsvMappedValue(row, mappings, "juzgado");
  const descripcionRaw = getCsvMappedValue(row, mappings, "descripcion");
  const cliente = getCsvMappedValue(row, mappings, "cliente");
  const contrario = getCsvMappedValue(row, mappings, "contrario");
  const procurador = getCsvMappedValue(row, mappings, "procurador");
  const nig = getCsvMappedValue(row, mappings, "nig");
  const estado = normalizeExpedienteEstado(getCsvMappedValue(row, mappings, "estado"));
  const observaciones = getCsvMappedValue(row, mappings, "observaciones");
  const fechaInicioRaw = getCsvMappedValue(row, mappings, "fecha_inicio");

  // Juzgado: prefer direct column, fallback to assembled parts
  const juzgadoAssembled = [tipoJuzgado, numeroJuzgado ? `Nº ${numeroJuzgado}` : "", poblacion].filter(Boolean).join(" · ");
  const juzgado = juzgadoDireto || juzgadoAssembled || null;

  // Descripción: CSV value → "tipoProcedimiento – ref/num" → generic
  const descripcion = descripcionRaw
    || (tipoProcedimiento ? `${tipoProcedimiento}${referencia ? ` — ${referencia}` : ""}` : null)
    || (referencia || numeroProcedimiento || "Expediente importado");

  const parsedYear = Number.parseInt(anioRaw, 10);
  const today = new Date().toISOString().slice(0, 10);

  // Si la referencia tiene el patrón "YYYY/NNN", extraer año y número de expediente
  let numExpFromRef: number | null = null;
  let anioFromRef: number | null = null;
  if (referencia) {
    const m = referencia.trim().match(/^(\d{4})[\/\-](\d+)$/);
    if (m) {
      anioFromRef = Number.parseInt(m[1], 10);
      numExpFromRef = Number.parseInt(m[2], 10);
    }
  }

  const finalAnio = anioFromRef ?? (Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear());

  return {
    anio: finalAnio,
    num_exp: numExpFromRef ?? undefined,
    ref_propia: referencia || null,
    descripcion,
    tipo: inferExpedienteTipo(tipoProcedimiento),
    cliente_nombre: cliente || null,
    contrario: contrario || null,
    procurador: procurador || null,
    juzgado,
    tipo_proc: tipoProcedimiento || null,
    num_autos: numeroProcedimiento || null,
    nig: nig || null,
    estado,
    observaciones: observaciones || null,
    fecha_inicio: parseCsvDate(fechaInicioRaw) ?? today,
    color: "ninguno",
  };
}

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
  if (!d) return "?";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "?";
  return new Date(d).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function importStatusMeta(status: string) {
  switch (status) {
    case "completed":
      return { label: "Completada", className: "bg-emerald-100 text-emerald-700" };
    case "failed":
      return { label: "Con errores", className: "bg-red-100 text-red-700" };
    case "processing":
      return { label: "Procesando", className: "bg-amber-100 text-amber-700" };
    case "reviewing":
      return { label: "Revisando", className: "bg-blue-100 text-blue-700" };
    case "configuring":
      return { label: "Configurando", className: "bg-violet-100 text-violet-700" };
    default:
      return { label: "Subido", className: "bg-slate-100 text-slate-700" };
  }
}

type ExportFormat = "excel" | "xml" | "word";
type ExportFieldDef = { id: string; label: string; getValue: (row: any) => string };
type ExportTemplate = { id: string; name: string; format: ExportFormat; fields: string[]; builtIn?: boolean };

const EXPEDIENTE_EXPORT_STORAGE_KEY = "expedientes-export-templates-v1";

const EXPEDIENTE_EXPORT_FIELDS: ExportFieldDef[] = [
  { id: "abogado_propio", label: "Abogado Propio", getValue: (row) => row.procurador || "" },
  { id: "estado", label: "Estado", getValue: (row) => ESTADOS[row.estado]?.label || row.estado || "" },
  { id: "num_exp", label: "Núm. Exp", getValue: (row) => String(row.num_exp || "") },
  { id: "anio", label: "Año", getValue: (row) => String(row.anio || "") },
  { id: "ref_propia", label: "Ref. Propia", getValue: (row) => row.ref_propia || "" },
  { id: "ref_expediente", label: "Ref. Expediente", getValue: (row) => row.ref_expediente || "" },
  { id: "tipo_expediente", label: "Tipo de Expediente", getValue: (row) => TIPOS[row.tipo]?.label || row.tipo || "" },
  { id: "descripcion", label: "Descripción Expediente", getValue: (row) => row.descripcion || "" },
  { id: "cliente", label: "Cliente", getValue: (row) => row.cliente_nombre || "" },
  { id: "contrario", label: "Contrario", getValue: (row) => row.contrario || "" },
  { id: "juzgado", label: "Juzgado Principal", getValue: (row) => row.juzgado || "" },
  { id: "nig", label: "NIG", getValue: (row) => row.nig || "" },
  { id: "num_autos", label: "Núm. Autos", getValue: (row) => row.num_autos || "" },
  { id: "tipo_proc", label: "Tipo de Procedimiento", getValue: (row) => row.tipo_proc || "" },
  { id: "fecha_alta", label: "Fecha Alta", getValue: (row) => row.fecha_inicio ? fmtDate(row.fecha_inicio) : "" },
  { id: "fecha_cierre", label: "Fecha Cierre", getValue: (row) => row.fecha_cierre ? fmtDate(row.fecha_cierre) : "" },
  { id: "importe", label: "Importe", getValue: (row) => row.importe != null ? String(row.importe) : "" },
  { id: "cuantia_principal", label: "Imp. Cobros Vencidos Pdtes.", getValue: (row) => row.cuantia_principal != null ? String(row.cuantia_principal) : "" },
  { id: "intereses", label: "Intereses", getValue: (row) => row.intereses != null ? String(row.intereses) : "" },
  { id: "costas", label: "Costas", getValue: (row) => row.costas != null ? String(row.costas) : "" },
  { id: "usuario", label: "Usuario", getValue: (row) => row.created_by || "" },
  { id: "observaciones", label: "Descripción Última Act. Rzda.", getValue: (row) => row.observaciones || "" },
];

const CURRENT_EXPEDIENTE_LIST_EXPORT_FIELDS = [
  "anio",
  "num_exp",
  "ref_propia",
  "descripcion",
  "tipo_expediente",
  "cliente",
  "contrario",
  "abogado_propio",
  "juzgado",
  "tipo_proc",
  "num_autos",
  "nig",
  "estado",
] as const;

const DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE: ExportTemplate = {
  id: "default-excel",
  name: "Listado actual",
  format: "excel",
  builtIn: true,
  fields: [...CURRENT_EXPEDIENTE_LIST_EXPORT_FIELDS],
};

const EXPEDIENTE_LIST_COLUMNS = [
  { key: "anio", label: "Año", defaultVisible: true },
  { key: "num_exp", label: "Núm. Exp", defaultVisible: true },
  { key: "ref_propia", label: "Ref. Propia", defaultVisible: true },
  { key: "ref_expediente", label: "Ref. expediente", defaultVisible: false },
  { key: "descripcion", label: "Descripción Expediente", defaultVisible: true },
  { key: "tipo", label: "Tipo de Expediente", defaultVisible: true },
  { key: "cliente_nombre", label: "Cliente", defaultVisible: true },
  { key: "contrario", label: "Contrario", defaultVisible: true },
  { key: "procurador", label: "Procurador Propio", defaultVisible: true },
  { key: "juzgado", label: "Juzgado Principal", defaultVisible: true },
  { key: "tipo_proc", label: "Tipo Procedimiento", defaultVisible: true },
  { key: "num_autos", label: "Núm. Autos", defaultVisible: true },
  { key: "nig", label: "NIG", defaultVisible: true },
  { key: "estado", label: "Estado", defaultVisible: true },
  { key: "observaciones", label: "Observaciones", defaultVisible: false },
  { key: "fecha_inicio", label: "Fecha alta", defaultVisible: false },
  { key: "fecha_cierre", label: "Fecha cierre", defaultVisible: false },
  { key: "fecha_notificacion", label: "Fecha notificación", defaultVisible: false },
  { key: "importe", label: "Importe", defaultVisible: false },
  { key: "tipos_asunto", label: "Tipo de asunto", defaultVisible: false },
  { key: "cuantia_principal", label: "Cuantía principal", defaultVisible: false },
  { key: "intereses", label: "Intereses", defaultVisible: false },
  { key: "costas", label: "Costas", defaultVisible: false },
  { key: "cuantia_total", label: "Cuantía total", defaultVisible: false },
  { key: "indeterminado", label: "Indeterminado", defaultVisible: false },
  { key: "etapa", label: "Etapa", defaultVisible: false },
  { key: "persona_contacto", label: "Persona contacto", defaultVisible: false },
  { key: "contacto", label: "Contacto", defaultVisible: false },
  { key: "centro", label: "Centro", defaultVisible: false },
] as const;

type ExpedienteListColumnKey = typeof EXPEDIENTE_LIST_COLUMNS[number]["key"];

const DEFAULT_VISIBLE_EXPEDIENTE_COLUMNS: Record<ExpedienteListColumnKey, boolean> = EXPEDIENTE_LIST_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column.defaultVisible;
  return acc;
}, {} as Record<ExpedienteListColumnKey, boolean>);

const EXPEDIENTE_ROW_COLOR_STYLES: Record<string, {
  row: string;
  rowSelected: string;
  year: string;
  yearSelected: string;
  number: string;
  numberSelected: string;
  descriptionSelected: string;
  card: string;
  cardSelected: string;
  cardNumber: string;
  cardNumberSelected: string;
  cardDescriptionSelected: string;
}> = {
  ninguno: {
    row: "hover:bg-slate-50/80",
    rowSelected: "bg-red-50 border-l-2 border-l-red-500",
    year: "text-slate-400",
    yearSelected: "text-red-400",
    number: "text-red-600",
    numberSelected: "text-red-700",
    descriptionSelected: "text-red-700",
    card: "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
    cardSelected: "border-red-300 bg-red-50 shadow-sm",
    cardNumber: "text-red-500",
    cardNumberSelected: "text-red-600",
    cardDescriptionSelected: "text-red-800",
  },
  azul: {
    row: "bg-sky-50/45 hover:bg-sky-100/70",
    rowSelected: "bg-sky-100 border-l-2 border-l-sky-500",
    year: "text-sky-500",
    yearSelected: "text-sky-700",
    number: "text-sky-700",
    numberSelected: "text-sky-800",
    descriptionSelected: "text-sky-900",
    card: "border-sky-200 bg-sky-50/60 hover:border-sky-300 hover:shadow-sm",
    cardSelected: "border-sky-400 bg-sky-100 shadow-sm",
    cardNumber: "text-sky-600",
    cardNumberSelected: "text-sky-800",
    cardDescriptionSelected: "text-sky-950",
  },
  verde: {
    row: "bg-emerald-50/45 hover:bg-emerald-100/70",
    rowSelected: "bg-emerald-100 border-l-2 border-l-emerald-500",
    year: "text-emerald-500",
    yearSelected: "text-emerald-700",
    number: "text-emerald-700",
    numberSelected: "text-emerald-800",
    descriptionSelected: "text-emerald-900",
    card: "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:shadow-sm",
    cardSelected: "border-emerald-400 bg-emerald-100 shadow-sm",
    cardNumber: "text-emerald-600",
    cardNumberSelected: "text-emerald-800",
    cardDescriptionSelected: "text-emerald-950",
  },
  amarillo: {
    row: "bg-amber-50/50 hover:bg-amber-100/70",
    rowSelected: "bg-amber-100 border-l-2 border-l-amber-500",
    year: "text-amber-500",
    yearSelected: "text-amber-700",
    number: "text-amber-700",
    numberSelected: "text-amber-800",
    descriptionSelected: "text-amber-900",
    card: "border-amber-200 bg-amber-50/60 hover:border-amber-300 hover:shadow-sm",
    cardSelected: "border-amber-400 bg-amber-100 shadow-sm",
    cardNumber: "text-amber-600",
    cardNumberSelected: "text-amber-800",
    cardDescriptionSelected: "text-amber-950",
  },
  naranja: {
    row: "bg-orange-50/50 hover:bg-orange-100/70",
    rowSelected: "bg-orange-100 border-l-2 border-l-orange-500",
    year: "text-orange-500",
    yearSelected: "text-orange-700",
    number: "text-orange-700",
    numberSelected: "text-orange-800",
    descriptionSelected: "text-orange-900",
    card: "border-orange-200 bg-orange-50/60 hover:border-orange-300 hover:shadow-sm",
    cardSelected: "border-orange-400 bg-orange-100 shadow-sm",
    cardNumber: "text-orange-600",
    cardNumberSelected: "text-orange-800",
    cardDescriptionSelected: "text-orange-950",
  },
  rojo: {
    row: "bg-rose-50/45 hover:bg-rose-100/70",
    rowSelected: "bg-rose-100 border-l-2 border-l-rose-500",
    year: "text-rose-500",
    yearSelected: "text-rose-700",
    number: "text-rose-700",
    numberSelected: "text-rose-800",
    descriptionSelected: "text-rose-900",
    card: "border-rose-200 bg-rose-50/60 hover:border-rose-300 hover:shadow-sm",
    cardSelected: "border-rose-400 bg-rose-100 shadow-sm",
    cardNumber: "text-rose-600",
    cardNumberSelected: "text-rose-800",
    cardDescriptionSelected: "text-rose-950",
  },
  morado: {
    row: "bg-violet-50/45 hover:bg-violet-100/70",
    rowSelected: "bg-violet-100 border-l-2 border-l-violet-500",
    year: "text-violet-500",
    yearSelected: "text-violet-700",
    number: "text-violet-700",
    numberSelected: "text-violet-800",
    descriptionSelected: "text-violet-900",
    card: "border-violet-200 bg-violet-50/60 hover:border-violet-300 hover:shadow-sm",
    cardSelected: "border-violet-400 bg-violet-100 shadow-sm",
    cardNumber: "text-violet-600",
    cardNumberSelected: "text-violet-800",
    cardDescriptionSelected: "text-violet-950",
  },
};

function getExportFieldLabel(fieldId: string) {
  return EXPEDIENTE_EXPORT_FIELDS.find((field) => field.id === fieldId)?.label || fieldId;
}

function loadStoredExpedienteExportTemplates(): ExportTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXPEDIENTE_EXPORT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.name && Array.isArray(item.fields));
  } catch {
    return [];
  }
}

function saveStoredExpedienteExportTemplates(templates: ExportTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXPEDIENTE_EXPORT_STORAGE_KEY, JSON.stringify(templates));
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
  const bodyRows = rows.map((row, rowIndex) => `<tr><th class="row-number">${rowIndex + 1}</th>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join("")}</tr>`).join("");
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

function exportFormatMeta(format: ExportFormat) {
  switch (format) {
    case "xml":
      return {
        label: "XML",
        icon: FileCode2,
        description: "Estructurado para integraciones y otros sistemas.",
        iconColor: "text-amber-500",
        labelColor: "text-amber-700",
        activeBorder: "border-amber-300",
        activeBg: "bg-[#fffdf5]",
        inactiveBorder: "border-amber-100",
        inactiveBg: "bg-[#fffdf5]",
      };
    case "word":
      return {
        label: "Word",
        icon: FileText,
        description: "Documento editable con apariencia de tabla.",
        iconColor: "text-blue-500",
        labelColor: "text-blue-700",
        activeBorder: "border-blue-300",
        activeBg: "bg-[#f5f9ff]",
        inactiveBorder: "border-blue-100",
        inactiveBg: "bg-[#f5f9ff]",
      };
    default:
      return {
        label: "Excel",
        icon: FileSpreadsheet,
        description: "Listado tipo hoja de cálculo con la plantilla por defecto.",
        iconColor: "text-green-600",
        labelColor: "text-green-700",
        activeBorder: "border-green-300",
        activeBg: "bg-[#f4fcf5]",
        inactiveBorder: "border-green-100",
        inactiveBg: "bg-[#f4fcf5]",
      };
  }
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
        flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
        transition-all active:scale-[0.98] shadow-sm
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

function DropdownToolBtn({
  icon: Icon,
  label,
  disabled = false,
  items,
}: {
  icon: any;
  label: string;
  disabled?: boolean;
  items: {
    label: string;
    icon?: any;
    onClick?: () => void;
    divider?: boolean;
    children?: { label: string; icon?: any; onClick: () => void }[];
  }[];
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (disabled || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.left });
    setOpen(v => !v);
  };

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

  const menu = (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
      className="min-w-[220px] max-w-[280px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
    >
      {items.map((item, index) =>
        item.divider ? (
          <div key={`divider-${index}`} className="my-1 h-px bg-slate-100" />
        ) : item.children?.length ? (
          <div key={`${item.label}-${index}`} className="group relative">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <span className="flex items-center gap-2.5">
                {item.icon && <item.icon size={13} className="shrink-0 text-slate-400" />}
                {item.label}
              </span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>
            <div className="invisible absolute left-full top-0 ml-1 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
              {item.children.map((child, childIndex) => (
                <button
                  key={`${child.label}-${childIndex}`}
                  type="button"
                  onClick={() => { child.onClick(); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {child.icon && <child.icon size={13} className="shrink-0 text-slate-400" />}
                  {child.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            onClick={() => { item.onClick?.(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {item.icon && <item.icon size={13} className="shrink-0 text-slate-400" />}
            {item.label}
          </button>
        )
      )}
    </div>
  );

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border shadow-sm active:scale-[0.98]
          ${open && !disabled ? "bg-red-50 border-red-300 text-red-700" : ""}
          ${disabled ? "text-slate-300 cursor-not-allowed border-slate-100 bg-white" : !open ? "text-slate-600 bg-white hover:bg-slate-100 border-slate-200" : ""}
        `}
      >
        <Icon size={13} />
        <span className="hidden sm:inline whitespace-nowrap">{label}</span>
        <ChevronDown size={10} />
      </button>
      {open && typeof document !== "undefined" && createPortal(menu, document.body)}
    </div>
  );
}

// ── Cabecera columna ordenable ─────────────────────────────────
function AltaOption({
  icon: Icon,
  title,
  description,
  iconClassName,
  onClick,
}: {
  icon: any;
  title: string;
  description: string;
  iconClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </button>
  );
}

function PrettyAssignSelect({
  label,
  placeholder,
  value,
  options,
  emptyMessage,
  searchablePlaceholder,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string; meta?: string }[];
  emptyMessage: string;
  searchablePlaceholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      option.label.toLowerCase().includes(query)
      || option.value.toLowerCase().includes(query)
      || (option.meta || "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="relative" ref={ref}>
      <span className="mb-2 block text-[15px] font-semibold text-slate-900">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-11 w-full items-center justify-between rounded-2xl border bg-white px-4 text-left text-[15px] shadow-sm outline-none transition-all ${
          open
            ? "border-[#ab0433]/35 ring-4 ring-[#ab0433]/10"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className={selectedOption ? "text-slate-700" : "text-slate-400"}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchablePlaceholder}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-700 outline-none transition-all focus:border-[#ab0433]/35 focus:bg-white focus:ring-4 focus:ring-[#ab0433]/10"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-2">
            {!filteredOptions.length ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">{emptyMessage}</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`mx-2 flex w-[calc(100%-16px)] items-center justify-between rounded-xl px-3 py-3 text-left transition-colors ${
                      isSelected ? "bg-amber-100/80" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${isSelected ? "text-slate-900" : "text-slate-700"}`}>
                        {option.label}
                      </p>
                      {option.meta && (
                        <p className="mt-0.5 truncate text-xs text-slate-400">{option.meta}</p>
                      )}
                    </div>
                    {isSelected ? <Check size={16} className="ml-3 shrink-0 text-slate-700" /> : <span className="ml-3 w-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function downloadCsvTemplate(type: "basica" | "completa") {
  const SEP = ";";
  const BOM = "﻿";

  type TemplateRow = { header: string; s1: string; s2: string; s3: string };

  const fields: TemplateRow[] = [
    { header: "Referencia",              s1: "2026/001",                      s2: "2026/002",               s3: "2026/003" },
    { header: "Número de procedimiento", s1: "123/2026",                      s2: "456/2026",               s3: "789/2026" },
    { header: "Tipo de juzgado",         s1: "Juzgado de Primera Instancia",  s2: "Juzgado de lo Social",   s3: "Audiencia Provincial" },
    { header: "Nº Juzgado",             s1: "1",                             s2: "3",                      s3: "2" },
    { header: "Población",              s1: "Madrid",                        s2: "Barcelona",              s3: "Valencia" },
    { header: "Tipo de procedimiento",  s1: "Procedimiento Ordinario",       s2: "Verbal",                 s3: "Monitorio" },
    { header: "Cliente",                s1: "Juan García López",             s2: "Empresa S.L.",           s3: "María Fernández" },
    { header: "Parte contraria",        s1: "Pedro Martínez",                s2: "Otra Empresa S.A.",      s3: "Carlos Ruiz" },
    { header: "Fecha de alta",          s1: "01/01/2026",                    s2: "15/02/2026",             s3: "10/03/2026" },
  ];

  const extraFields: TemplateRow[] = [
    { header: "Año",            s1: "2026",                               s2: "2026",                         s3: "2026" },
    { header: "Descripción",    s1: "Reclamación de cantidad por impago", s2: "Despido improcedente",         s3: "Reclamación de herencia" },
    { header: "Juzgado completo", s1: "",                                 s2: "",                             s3: "" },
    { header: "Procurador",     s1: "Ana Sánchez Pérez",                  s2: "",                             s3: "Luis Torres" },
    { header: "NIG",            s1: "28079-41-1-2026-0001234",            s2: "",                             s3: "" },
    { header: "Estado",         s1: "abierto",                            s2: "abierto",                      s3: "abierto" },
    { header: "Observaciones",  s1: "Asunto urgente",                     s2: "",                             s3: "Pendiente documentación" },
  ];

  const all = type === "basica" ? fields : [...fields, ...extraFields];
  const header = all.map(f => f.header).join(SEP);
  const row1   = all.map(f => f.s1).join(SEP);
  const row2   = all.map(f => f.s2).join(SEP);
  const row3   = all.map(f => f.s3).join(SEP);

  const csv = BOM + [header, row1, row2, row3].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plantilla_expedientes_${type}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function CsvImportView({
  fileName,
  onBack,
  onOpenHistory,
  onOpenSettings,
  onSelectFile,
  onFileChange,
  inputRef,
  clientes,
  onSaveNew,
  savingNew,
}: {
  fileName: string | null;
  onBack: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onSelectFile: () => void;
  onFileChange: (file?: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  clientes: any[];
  onSaveNew: (form: typeof EXP_EMPTY) => Promise<void>;
  savingNew: boolean;
}) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-page-in">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {/* Module header */}
      <div className="px-6 sm:px-8 py-5 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-100 flex-shrink-0">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 leading-none tracking-tight mb-1">Importar expedientes</h1>
            <p className="text-xs font-medium text-slate-500">Carga masiva desde archivo CSV (Paso 1 de 3)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenHistory}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            <History size={13} className="text-slate-400" /> Historial
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            <ArrowLeft size={13} /> Volver
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b border-slate-200 py-4 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-10">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 z-0" />
          <ImportStep step={1} label="Subir archivo" active first />
          <ImportStep step={2} label="Configurar columnas" />
          <ImportStep step={3} label="Revisar e Importar" last />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1500px] mx-auto w-full flex flex-col xl:flex-row gap-6 items-stretch">

          {/* LEFT: Dropzone card */}
          <div className="flex-1 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden min-h-[400px] animate-card-in-1">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/80">
              <Upload size={14} className="text-slate-400" />
              <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Cargar Archivo de Datos</h3>
            </div>
            <div className="flex-1 p-6 flex items-center justify-center">
              <div
                onClick={onSelectFile}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) onFileChange(file);
                }}
                className={`relative flex flex-col items-center justify-center w-full h-full min-h-[300px] border-2 border-dashed rounded-lg cursor-pointer transition-colors group ${
                  isDragging
                    ? "border-red-400 bg-red-50/50"
                    : fileName
                    ? "border-emerald-300 bg-emerald-50/20"
                    : "border-slate-300 bg-slate-50 hover:border-red-300 hover:bg-red-50/40"
                }`}
              >
                <div className={`w-20 h-20 mb-6 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-100 transition-all group-hover:scale-110 ${
                  fileName ? "text-emerald-500" : "text-red-500 group-hover:text-red-600"
                }`}>
                  <FileSpreadsheet size={32} />
                </div>
                <h3 className="mb-2 text-xl font-bold text-slate-800 text-center">
                  {fileName ? fileName : "Selecciona o arrastra aquí tu CSV"}
                </h3>
                <p className="text-sm text-slate-500 text-center max-w-md">
                  El archivo no debe superar los 10MB. Asegúrate de haber rellenado los datos utilizando alguna de nuestras plantillas.
                </p>
                {!fileName && (
                  <div className="mt-8 px-6 py-2 bg-white border border-slate-200 rounded-md text-sm font-semibold text-slate-700 shadow-sm group-hover:border-red-300 group-hover:text-red-600 transition-colors">
                    Explorar archivos
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Templates + Format */}
          <div className="w-full xl:w-[450px] flex flex-col gap-6 flex-shrink-0">

            {/* Plantillas */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden animate-card-in-2">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/80">
                <FileSpreadsheet size={14} className="text-emerald-600" />
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Plantillas para Excel</h3>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-xs text-slate-500">Descarga, rellena en Excel y sube el archivo en el panel izquierdo. Borra las filas de ejemplo antes de importar.</p>
                <button
                  onClick={() => downloadCsvTemplate("basica")}
                  className="group flex items-start gap-4 p-4 rounded-lg border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all shadow-sm text-left"
                >
                  <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                    <Download size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Plantilla básica</span>
                    <span className="text-[11px] text-slate-500 mt-1 leading-relaxed">Campos esenciales: ref., juzgado, procedimiento, cliente, contrario.</span>
                  </div>
                </button>
                <button
                  onClick={() => downloadCsvTemplate("completa")}
                  className="group flex items-start gap-4 p-4 rounded-lg border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all shadow-sm text-left"
                >
                  <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                    <Download size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Plantilla completa</span>
                    <span className="text-[11px] text-slate-500 mt-1 leading-relaxed">Todos los campos disponibles del expediente listos para importar.</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Formato Esperado */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex-1 animate-card-in-3">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/80">
                <ListChecks size={14} className="text-slate-400" />
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Formato Esperado</h3>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  El separador de columnas puede ser coma{" "}
                  <code className="bg-slate-100 border border-slate-200 px-1 rounded text-slate-800 font-bold">,</code>{" "}
                  o punto y coma{" "}
                  <code className="bg-slate-100 border border-slate-200 px-1 rounded text-slate-800 font-bold">;</code>.
                </p>
                <ul className="flex flex-col gap-3 text-xs text-slate-600">
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> <strong>Referencia</strong> (ID interno)</li>
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> Número de procedimiento</li>
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> Tipo y Número de juzgado</li>
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> Población / Municipio</li>
                </ul>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-md flex items-start gap-2.5">
                  <AlertCircle size={12} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-blue-700 leading-snug">Podrás revisar y vincular las columnas manualmente en el <strong>Paso 2</strong>.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 px-6 sm:px-10 py-4 flex items-center justify-between flex-shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
        >
          Cancelar
        </button>
        <button
          disabled={!fileName}
          onClick={onSelectFile}
          className="px-6 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-black rounded-md shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Siguiente paso: Configurar <ArrowRight size={13} />
        </button>
      </div>

      {showNewModal && (
        <ExpedienteModal
          initial={EXP_EMPTY}
          clientes={clientes}
          onSave={async (form) => { await onSaveNew(form); setShowNewModal(false); }}
          onClose={() => setShowNewModal(false)}
          saving={savingNew}
        />
      )}
    </div>
  );
}

function CsvImportHistoryView({
  rows,
  loading,
  error,
  onBack,
  onReload,
}: {
  rows: ImportBatch[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onReload: () => void;
}) {
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);
  const goToPage = (p: number) => { setPage(p); tableRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const from = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, rows.length);

  const statusBadge = (row: ImportBatch) => {
    const hasErrors = row.error_count > 0;
    if (hasErrors && row.completed_count > 0) return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Parcial
      </span>
    );
    if (hasErrors) return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Con errores
      </span>
    );
    if (row.status === "processing" || row.status === "reviewing" || row.status === "configuring") return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> {importStatusMeta(row.status).label}
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completada
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-page-in">

      {/* Header */}
      <div className="px-6 lg:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 border-b border-slate-200 animate-card-in">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 leading-tight">Historial de importaciones</h1>
          <p className="text-sm text-slate-500 mt-1">Historial de todas las importaciones de expedientes realizadas</p>
        </div>
        <button
          onClick={onBack}
          className="w-max px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm flex items-center gap-2"
        >
          <ArrowLeft size={14} /> Volver
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-6 lg:px-8 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 flex-shrink-0 animate-card-in-1">
        <h3 className="text-sm font-bold text-slate-800">Importaciones recientes</h3>
        <button
          onClick={onReload}
          className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
        >
          <RefreshCw size={13} className="text-slate-400" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="px-6 lg:px-8 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Table */}
      <div ref={tableRef} className="flex-1 overflow-auto animate-card-in-2">
        <table className="w-full min-w-[1000px] text-left border-collapse">
          <thead className="sticky top-0 bg-white border-b border-slate-200 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <tr>
              <th className="pl-6 lg:pl-8 pr-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Completados</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Errores</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pendientes</th>
              <th className="pr-6 lg:pr-8 pl-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Cargando importaciones...</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center text-slate-400">
                  No hay importaciones registradas
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const hasErrors = row.error_count > 0;
                return (
                  <tr key={row.id} className={`group transition-colors ${
                    hasErrors ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/80"
                  }`}>
                    <td className="pl-6 lg:pl-8 pr-6 py-4 whitespace-nowrap text-[13px] text-slate-700 font-medium">
                      {fmtDateTime(row.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[13px] text-slate-500 font-mono">
                      {row.id.slice(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(row)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[13px] text-slate-600 font-semibold">
                      {row.total_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[13px] text-emerald-600 font-semibold">
                      {row.completed_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.error_count > 0 ? (
                        <span className="text-[13px] text-red-600 font-bold flex items-center gap-1.5">
                          {row.error_count} <AlertCircle size={11} />
                        </span>
                      ) : (
                        <span className="text-[13px] text-slate-400 font-medium">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[13px] text-slate-400 font-medium">
                      {row.pending_count}
                    </td>
                    <td className="pr-6 lg:pr-8 pl-6 py-4 whitespace-nowrap">
                      <button
                        className="flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-red-600 transition-colors"
                        title={row.notes || row.file_name}
                      >
                        <Eye size={13} /> {row.file_name}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 lg:px-8 py-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0 animate-card-in-3">
        <span className="text-sm text-slate-500">
          Mostrando <span className="font-bold text-slate-700">{from}</span> a{" "}
          <span className="font-bold text-slate-700">{to}</span> de{" "}
          <span className="font-bold text-slate-700">{rows.length}</span> resultados
        </span>
        <div className="flex items-center gap-1 sm:mr-16">
          <button
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 bg-white shadow-sm hover:bg-slate-50 transition-colors disabled:text-slate-300 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={13} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<(number | "…")[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p as number)}
                  className={`w-8 h-8 flex items-center justify-center rounded-md border font-bold text-xs shadow-sm transition-colors ${
                    p === page
                      ? "border-red-600 bg-red-600 text-white shadow-red-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p}
                </button>
              )
            )}
          <button
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 bg-white shadow-sm hover:bg-slate-50 transition-colors disabled:text-slate-300 disabled:cursor-not-allowed"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

    </div>
  );
}

function CsvFieldRow({
  field,
  options,
  invalid = false,
  onChange,
}: {
  field: CsvFieldMapping;
  options: string[];
  invalid?: boolean;
  onChange: (id: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const isMapped = field.selected !== CSV_UNASSIGNED;

  useEffect(() => {
    if (!open) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className="grid grid-cols-12 gap-6 items-center py-3.5 border-b border-slate-100 last:border-0 px-4 hover:bg-slate-50/50 transition-colors">
      <div className="col-span-5 flex flex-col">
        <span className="text-sm font-semibold text-slate-800">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5"> *</span>}
        </span>
        {field.help && <span className="text-xs text-slate-500 mt-0.5">{field.help}</span>}
      </div>
      <div className="col-span-4">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`w-full flex items-center justify-between pl-3.5 pr-3 py-2 rounded-lg text-sm transition-all text-left ${
            isMapped
              ? "bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold hover:border-emerald-400"
              : invalid
              ? "bg-white border border-amber-300 text-slate-700 hover:border-amber-400"
              : "bg-white border border-slate-300 text-slate-600 hover:border-slate-400"
          } ${open ? "ring-2 ring-slate-900/10" : ""}`}
        >
          <span className="truncate">{field.selected}</span>
          <ChevronDown size={13} className={`ml-2 flex-shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
            className="bg-white rounded-xl border border-slate-200 shadow-[0_8px_32px_rgba(15,23,42,0.14)] overflow-hidden py-1"
          >
            <div className="max-h-60 overflow-y-auto">
              {options.map((opt) => {
                const isSelected = field.selected === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { onChange(field.id, opt); setOpen(false); }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm text-left transition-colors ${
                      isSelected
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && <Check size={13} className="flex-shrink-0 opacity-90" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
      <div className="col-span-3 text-right">
        {field.sample && field.sample !== "Sin detectar" ? (
          <span className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
            {field.sample}
          </span>
        ) : (
          <span className="text-xs font-mono text-slate-400 italic">Sin detectar</span>
        )}
      </div>
    </div>
  );
}

function CsvImportConfigureView({
  fileName,
  csvHeaders,
  mappings,
  onBack,
  onContinue,
  onOpenHistory,
  onOpenSettings,
  onSelectFile,
  onChangeMapping,
  onFileChange,
  inputRef,
}: {
  fileName: string | null;
  csvHeaders: string[];
  mappings: CsvFieldMapping[];
  onBack: () => void;
  onContinue: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onSelectFile: () => void;
  onChangeMapping: (id: string, value: string) => void;
  onFileChange: (file?: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [showAllOptional, setShowAllOptional] = useState(false);
  const OPTIONAL_PREVIEW = 4;

  const requiredFields = mappings.filter((item) => item.required);
  const optionalFields = mappings.filter((item) => !item.required);
  const assignedRequired = requiredFields.filter((item) => item.selected !== CSV_UNASSIGNED).length;
  const assignedOptional = optionalFields.filter((item) => item.selected !== CSV_UNASSIGNED).length;
  const canContinue = assignedRequired === requiredFields.length;
  const mappingOptions = [CSV_UNASSIGNED, ...csvHeaders];

  const visibleOptional = showAllOptional ? optionalFields : optionalFields.slice(0, OPTIONAL_PREVIEW);
  const hiddenOptionalCount = optionalFields.length - OPTIONAL_PREVIEW;

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-page-in">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white animate-card-in">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Importar expedientes</h1>
              <p className="text-sm text-slate-500">Configuración y mapeo de las columnas del archivo subido</p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 flex-shrink-0"
          >
            <ChevronLeft size={16} />
            Volver a inicio
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 py-4 shadow-sm animate-card-in-1">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-10">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 z-0" />
          <ImportStep step={1} label="Subir archivo" completed first />
          <ImportStep step={2} label="Configurar columnas" active />
          <ImportStep step={3} label="Revisar e Importar" last />
        </div>
      </div>

      {/* File banner */}
      <div className="flex-shrink-0 bg-slate-50 border-b border-slate-200 px-6 lg:px-8 py-3 animate-card-in-2">
        <div className="flex items-center justify-between gap-4 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm">
              <FileSpreadsheet size={15} className="text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{fileName || "Sin archivo"}</p>
              <p className="text-xs text-slate-500">Archivo seleccionado</p>
            </div>
          </div>
          <button
            onClick={onSelectFile}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white"
          >
            <RefreshCw size={13} />
            Cambiar archivo
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 flex flex-col gap-10">

          {/* Intro */}
          <div className="animate-card-in">
            <h2 className="text-xl font-bold text-slate-900">Conecta las columnas de tu archivo</h2>
            <p className="mt-2 text-sm text-slate-500 max-w-2xl">
              Indica qué columna de tu CSV corresponde a cada campo del sistema. Los campos obligatorios deben estar asignados para poder continuar. Hemos detectado automáticamente las columnas que mejor coinciden.
            </p>
          </div>

          {/* Required fields */}
          <div className="animate-card-in-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-slate-900">Campos obligatorios</h3>
                <span className="text-red-500 font-bold">*</span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                assignedRequired === requiredFields.length
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}>
                {assignedRequired} de {requiredFields.length} asignados
              </span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 gap-6 py-3 border-b border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-5">Campo en Avalentia</div>
                <div className="col-span-4">Columna en tu CSV</div>
                <div className="col-span-3 text-right">Ejemplo de tus datos</div>
              </div>
              {requiredFields.map((field) => (
                <CsvFieldRow
                  key={field.id}
                  field={field}
                  options={mappingOptions}
                  invalid={field.selected === CSV_UNASSIGNED}
                  onChange={onChangeMapping}
                />
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div className="animate-card-in-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Campos opcionales</h3>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {assignedOptional} de {optionalFields.length} asignados
              </span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 gap-6 py-3 border-b border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-5">Campo en Avalentia</div>
                <div className="col-span-4">Columna en tu CSV</div>
                <div className="col-span-3 text-right">Ejemplo de tus datos</div>
              </div>
              {visibleOptional.map((field) => (
                <CsvFieldRow key={field.id} field={field} options={mappingOptions} onChange={onChangeMapping} />
              ))}
              {!showAllOptional && hiddenOptionalCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllOptional(true)}
                  className="w-full py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-100 flex items-center justify-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold leading-none">+</span>
                  Mostrar {hiddenOptionalCount} campos opcionales más
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 lg:px-8 py-4 shadow-sm">
        <div className="flex items-center justify-between max-w-[1200px] mx-auto">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
            Atrás
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold shadow-sm transition-all ${
              canContinue
                ? "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md"
                : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
            }`}
          >
            Siguiente paso: Revisar
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CsvImportReviewView({
  fileName,
  mappings,
  previewRows,
  validationSummary,
  importProgress,
  onBack,
  onImport,
  onOpenHistory,
  onOpenSettings,
}: {
  fileName: string | null;
  mappings: CsvFieldMapping[];
  previewRows: CsvPreviewRow[];
  validationSummary: CsvImportSummary;
  importProgress: { done: number; total: number } | null;
  onBack: () => void;
  onImport: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const getMappedValue = (row: CsvPreviewRow, fieldId: string) => {
    const mapping = mappings.find((item) => item.id === fieldId);
    if (!mapping || mapping.selected === CSV_UNASSIGNED) return "-";
    return row[mapping.selected] || "-";
  };

  const hasIssues = validationSummary.issues.length > 0;
  const pct = importProgress && importProgress.total > 0
    ? Math.round((importProgress.done / importProgress.total) * 100)
    : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-page-in">

      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white animate-card-in">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Importar expedientes</h1>
              <p className="text-sm text-slate-500">Revisa los datos mapeados antes de confirmar la importación final</p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 flex-shrink-0"
          >
            <ChevronLeft size={16} />
            Volver a inicio
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 py-4 shadow-sm animate-card-in-1">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-10">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 z-0" />
          <ImportStep step={1} label="Subir archivo" completed first />
          <ImportStep step={2} label="Configurar columnas" completed />
          <ImportStep step={3} label="Revisar e Importar" active last />
        </div>
      </div>

      {/* Status banner */}
      <div className={`flex-shrink-0 border-b px-6 lg:px-8 py-5 animate-card-in-2 ${hasIssues ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm border flex-shrink-0 ${hasIssues ? "bg-amber-100 text-amber-600 border-amber-200" : "bg-emerald-100 text-emerald-600 border-emerald-200"}`}>
              {hasIssues ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
            </div>
            <div>
              <h2 className={`text-lg font-extrabold leading-tight ${hasIssues ? "text-amber-800" : "text-emerald-800"}`}>
                {hasIssues ? "Revisión con avisos" : "Listo para importar"}
              </h2>
              <p className={`text-sm font-medium mt-0.5 ${hasIssues ? "text-amber-600" : "text-emerald-600"}`}>
                {fileName || "archivo.csv"}
                <span className="opacity-50 mx-2">|</span>
                {previewRows.length} registros analizados
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-2 bg-white/60 px-4 py-2 rounded-lg border shadow-sm flex-shrink-0 ${hasIssues ? "border-amber-200" : "border-emerald-200"}`}>
            {hasIssues
              ? <AlertTriangle size={14} className="text-amber-500" />
              : <Check size={14} className="text-emerald-500" />}
            <span className={`text-sm font-bold ${hasIssues ? "text-amber-700" : "text-emerald-700"}`}>
              {hasIssues
                ? `${previewRows.length} registros — ${validationSummary.issues.length} ${validationSummary.issues.length === 1 ? "aviso" : "avisos"}`
                : `${previewRows.length} registros listos para importar`}
            </span>
          </div>
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 lg:px-8 py-4 bg-white border-b border-slate-100 flex items-center gap-2">
          <Eye size={15} className="text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Vista previa de los primeros registros</h3>
        </div>
        <div className="flex-1 overflow-auto bg-slate-50/30">
          <table className="w-full min-w-[1200px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <tr>
                <th className="pl-6 lg:pl-8 pr-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Referencia</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Nº Procedimiento</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Juzgado / Tribunal</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Tipo Procedimiento</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Fecha alta</th>
                <th className="pr-6 lg:pr-8 pl-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {previewRows.map((row, idx) => {
                const rowHasError = validationSummary.issues.some((i) => i.rowNumber === idx + 1);
                return (
                  <tr key={idx} className={`transition-colors ${rowHasError ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-slate-50"}`}>
                    <td className="pl-6 lg:pl-8 pr-4 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">{getMappedValue(row, "ref_propia")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "descripcion")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "num_proc")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                      {getMappedValue(row, "juzgado") !== "-"
                        ? getMappedValue(row, "juzgado")
                        : [getMappedValue(row, "tipo_juzgado"), getMappedValue(row, "numero_juzgado"), getMappedValue(row, "poblacion")].filter(v => v !== "-").join(" · ") || "-"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "tipo_procedimiento")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "cliente")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "fecha_inicio")}</td>
                    <td className="pr-6 lg:pr-8 pl-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "estado")}</td>
                  </tr>
                );
              })}
              {previewRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-sm text-slate-400">Sin registros para mostrar</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 lg:px-8 py-4 shadow-sm">
        {importProgress ? (
          <div>
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2 text-blue-700">
                <Loader2 size={15} className="animate-spin" />
                <span className="text-sm font-semibold">Importando expedientes…</span>
              </div>
              <span className="text-sm font-bold text-blue-700">{importProgress.done} / {importProgress.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
              Volver
            </button>
            <button
              type="button"
              onClick={onImport}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 text-sm font-bold shadow-md shadow-red-500/20 transition-all border border-red-700"
            >
              <Upload size={15} />
              Importar expedientes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CsvImportCompleteView({
  fileName,
  summary,
  onBack,
  onViewDetails,
  onRestart,
  onFinish,
}: {
  fileName: string | null;
  summary: CsvImportSummary;
  onBack: () => void;
  onViewDetails: () => void;
  onRestart: () => void;
  onFinish: () => void;
}) {
  const { totalProcessed, successCount, errorCount, successRate, issues } = summary;
  const hasErrors = errorCount > 0;
  const visibleIssues = issues.slice(0, 6);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* ── Cabecera ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0">
        <BackButton onClick={onBack} />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-900 leading-tight">Importar expedientes</h1>
          <p className="text-xs text-slate-400 truncate">{fileName || "archivo.csv"}</p>
        </div>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433] shrink-0"
        >
          <RefreshCw size={14} />
          Nueva importacion
        </button>
      </div>

      {/* ── Contenido ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Hero compacto */}
        <div className={`relative overflow-hidden rounded-2xl px-6 py-5 text-white ${
          hasErrors
            ? "bg-gradient-to-r from-amber-500 to-orange-500"
            : "bg-gradient-to-r from-emerald-500 to-teal-600"
        }`}>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 h-28 w-28 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {hasErrors
                ? <AlertCircle size={22} strokeWidth={2.5} />
                : <Check size={22} strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold leading-tight">
                {hasErrors ? "Importacion con incidencias" : "Importacion completada"}
              </h2>
              <p className="mt-0.5 text-sm text-white/80 truncate">
                {totalProcessed} registros procesados con validacion estricta
              </p>
            </div>
            <div className="shrink-0 rounded-xl bg-white/20 px-4 py-2 text-center">
              <p className="text-xl font-bold leading-none">{successRate}%</p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/80 uppercase tracking-wide">éxito</p>
            </div>
          </div>

          {/* Barra de progreso integrada */}
          <div className="mt-4 h-1.5 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white/70 transition-all duration-700"
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>

        {/* Tarjetas de estadísticas */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Check size={14} className="text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Importados</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{successCount}</p>
            <p className="mt-1 text-xs text-slate-500">registros correctos</p>
          </div>

          <div className={`rounded-2xl p-4 border ${hasErrors ? "border-red-100 bg-red-50/60" : "border-slate-100 bg-slate-50/60"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${hasErrors ? "bg-red-100" : "bg-slate-100"}`}>
                <AlertCircle size={14} className={hasErrors ? "text-red-500" : "text-slate-400"} />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Con errores</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{errorCount}</p>
            <p className="mt-1 text-xs text-slate-500">filas bloqueadas</p>
            {hasErrors && (
              <button
                type="button"
                onClick={onViewDetails}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <Eye size={12} /> Ver detalles
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-sky-100 flex items-center justify-center">
                <FileSpreadsheet size={14} className="text-sky-600" />
              </div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{totalProcessed}</p>
            <p className="mt-1 text-xs text-slate-500">registros revisados</p>
          </div>
        </div>

        {/* Detalle de errores (solo si hay) */}
        {hasErrors && (
          <div className="rounded-2xl border border-red-100 bg-white p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm font-bold text-slate-900">Detalle de errores</p>
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 border border-red-100">
                {issues.length} incidencias
              </span>
            </div>
            <div className="space-y-2">
              {visibleIssues.map((issue, index) => (
                <div key={`${issue.rowNumber}-${issue.fieldId}-${index}`} className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2.5">
                  <p className="text-xs font-semibold text-slate-700">Fila {issue.rowNumber} · {issue.fieldLabel}</p>
                  <p className="mt-0.5 text-xs text-red-600">{issue.message}</p>
                </div>
              ))}
              {issues.length > visibleIssues.length && (
                <p className="text-xs text-slate-400 pt-1">
                  +{issues.length - visibleIssues.length} incidencias adicionales — usa "Ver detalles" para verlas todas.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
          >
            <RefreshCw size={14} />
            Nueva importacion
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#ab0433] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#92042c]"
          >
            <Check size={14} />
            Finalizar
          </button>
        </div>

      </div>
    </div>
  );
}

function CsvImportErrorDetailView({
  fileName,
  batchId,
  summary,
  previewRows,
  mappings,
  onBack,
}: {
  fileName: string | null;
  batchId: string | null;
  summary: CsvImportSummary;
  previewRows: CsvPreviewRow[];
  mappings: CsvFieldMapping[];
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"errors" | "records">("errors");
  const [statusFilter, setStatusFilter] = useState<"all" | "error" | "ok">("all");
  const { totalProcessed, successCount, errorCount, issues } = summary;
  const completedPct = totalProcessed > 0 ? Math.round((successCount / totalProcessed) * 100) : 0;
  const errorPct = totalProcessed > 0 ? Math.round((errorCount / totalProcessed) * 100) : 0;
  const groupedIssues = issues.reduce<Record<string, CsvImportIssue[]>>((acc, issue) => {
    const key = `${issue.fieldId}-${issue.message}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {});
  const records = previewRows.map((row, index) => {
    const rowNumber = index + 1;
    const rowIssues = issues.filter((issue) => issue.rowNumber === rowNumber);
    const tipoJuzgado = getCsvMappedValue(row, mappings, "tipo_juzgado");
    const numeroJuzgado = getCsvMappedValue(row, mappings, "numero_juzgado");
    const poblacion = getCsvMappedValue(row, mappings, "poblacion");
    return {
      rowNumber,
      status: rowIssues.length ? "error" : "ok",
      nig: getCsvMappedValue(row, mappings, "nig") || "-",
      proceedingNumber: getCsvMappedValue(row, mappings, "num_proc") || "-",
      juzgado: [tipoJuzgado, numeroJuzgado ? `Nº ${numeroJuzgado}` : "", poblacion].filter(Boolean).join(" · ") || "-",
      party: getCsvMappedValue(row, mappings, "cliente") ? `Demandante: ${getCsvMappedValue(row, mappings, "cliente")}` : "-",
      errors: rowIssues.map((issue) => `${issue.fieldId}: ${issue.message}`).join(" · "),
    };
  });
  const filteredRecords = records.filter((record) => (
    statusFilter === "all" ? true : record.status === statusFilter
  ));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900">Detalles de importacion</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              Lote {batchId ? `${batchId.slice(0, 8)}...` : "Temporal"}
            </span>
            <span>{fileName || "archivo.csv"}</span>
          </div>
        </div>
        <BackButton onClick={onBack} label="Volver al historial" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Estado del lote</p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">Importacion con incidencias</h2>
              </div>
              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                Error
              </span>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-500">Archivo</span>
                <span className="max-w-[180px] truncate font-semibold text-slate-800">{fileName || "archivo.csv"}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-500">ID del lote</span>
                <span className="font-semibold text-slate-800">{batchId || "Temporal"}</span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-900">Tasa de exito</span>
                  <span className="font-semibold text-slate-700">{completedPct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completedPct}%` }} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-900">Impacto de errores</span>
                  <span className="font-semibold text-slate-700">{errorPct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(errorPct, 8)}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Resumen numerico</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completados</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{successCount}</p>
                <p className="text-xs text-slate-500">({completedPct.toFixed(2)}%)</p>
              </div>
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errores</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{errorCount}</p>
                <p className="text-xs text-slate-500">({errorPct.toFixed(2)}%)</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pendientes</p>
                <p className="mt-2 text-xl font-bold text-slate-900">0</p>
                <p className="text-xs text-slate-500">(0.00%)</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{totalProcessed}</p>
                <p className="text-xs text-slate-500">registros</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Analisis</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Incidencias detectadas</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  La informacion es la misma, pero distribuida para leer mas rapido el lote y los errores agrupados.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-600">
                  {issues.length} incidencias
                </div>
                <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                  {Object.keys(groupedIssues).length} grupos
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("errors")}
              className={`border-b-2 px-2 py-3 text-sm font-semibold ${
                activeTab === "errors" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"
              }`}
            >
              Analisis de errores
              <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{issues.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("records")}
              className={`border-b-2 px-2 py-3 text-sm font-semibold ${
                activeTab === "records" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"
              }`}
            >
              Registros
            </button>
          </div>

          {activeTab === "errors" ? (
            <div className="space-y-5">
              {Object.entries(groupedIssues).map(([key, group], index) => (
                <div key={key} className="overflow-hidden rounded-[24px] border border-red-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-red-100 bg-gradient-to-r from-red-50 to-white px-6 py-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-500">Incidencia {index + 1}</p>
                      <h3 className="mt-2 text-xl font-bold text-slate-900">Error en {group.length} registros</h3>
                    </div>
                    <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">{group.length}</span>
                  </div>

                  <div className="space-y-5 px-6 py-6">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="rounded-2xl border border-red-200 bg-red-50/70 px-4 py-4 text-sm text-red-700">
                        <span className="font-semibold text-red-800">{group[0].fieldId}:</span> {group[0].message}
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Impacto</p>
                        <p className="mt-2 text-xl font-bold text-slate-900">{group.length}</p>
                        <p className="text-sm text-slate-500">registros afectados</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
                      >
                        Ver registros para editar
                      </button>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                        >
                          Descartar todos
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
                        >
                          Reintentar todos
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                    <FileSpreadsheet size={18} className="text-[#ffcf26]" />
                    Detalle de registros
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-500">Vista detallada de todos los registros importados</p>
                </div>
                <p className="text-sm text-slate-500">Mostrando {filteredRecords.length} de {records.length} registros</p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Filtrar por estado:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "all" | "error" | "ok")}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition-colors hover:border-slate-300"
                >
                  <option value="all">Todos los estados</option>
                  <option value="error">Error</option>
                  <option value="ok">Correcto</option>
                </select>
              </div>

              <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-sm font-semibold text-slate-800">
                    <tr>
                      <th className="px-4 py-4">Estado</th>
                      <th className="px-4 py-4">NIG</th>
                      <th className="px-4 py-4">Num. Procedimiento</th>
                      <th className="px-4 py-4">Juzgado</th>
                      <th className="px-4 py-4">Demandante/Demandado</th>
                      <th className="px-4 py-4">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredRecords.map((record) => (
                      <tr key={record.rowNumber} className="bg-white">
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            record.status === "error" ? "bg-red-600 text-white" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {record.status === "error" ? "Error" : "Correcto"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{record.nig}</td>
                        <td className="px-4 py-3 text-slate-700">{record.proceedingNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{record.juzgado}</td>
                        <td className="px-4 py-3 text-slate-700">{record.party}</td>
                        <td className="px-4 py-3 text-red-600">
                          {record.errors ? (
                            <div className="max-w-[520px] space-y-1 whitespace-normal break-words">
                              {record.errors.split(" · ").map((error, index) => (
                                <p key={`${record.rowNumber}-error-${index}`} className="leading-6">
                                  {error}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                          No hay registros para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── ZipUploadIllustration ─────────────────────────────────────────────────────
// Ilustración 3D reactiva al ratón para el área de subida de ZIP
function ZipUploadIllustration({ hasFile, clicked }: { hasFile: boolean; clicked: boolean }) {
  const ref    = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const x    = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width  / 2)));
      const y    = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
      setTilt({ x, y, active: true });
    });
  }, []);

  const onMouseLeave = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setTilt({ x: 0, y: 0, active: false });
  }, []);

  // Factores de paralaje
  const rotY   =  tilt.x * 14;
  const rotX   = -tilt.y * 10;
  const shiftX =  tilt.x * 6;
  const shiftY =  tilt.y * 4;

  // Sheets: se abren más al hover, y EXPLOSIÓN al click
  const fanL   = clicked ? -62 : tilt.active ? -18 + tilt.x * -14 : -14;
  const fanR   = clicked ?  62 : tilt.active ?  18 + tilt.x *  14 :  14;
  const sheetsY = clicked ? -22 : tilt.active ? tilt.y * -8 : 0;
  const sheetsScale = clicked ? 1.12 : tilt.active ? 1.04 : 1;

  // Glow sigue al ratón
  const glowX = 50 + tilt.x * 30;
  const glowY = 50 + tilt.y * 30;

  const ease = clicked
    ? '350ms cubic-bezier(.34,1.56,.64,1)'   // resorte al explotar
    : tilt.active
      ? '80ms linear'
      : '500ms cubic-bezier(.22,1,.36,1)';   // snap-back suave

  return (
    <div
      ref={ref}
      className="relative flex h-40 w-40 items-center justify-center select-none"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        perspective: '700px',
        filter: 'drop-shadow(0 14px 28px rgba(15,23,42,0.08))',
      }}
    >
      {/* Contenedor 3D */}
      <div style={{
        width: '100%', height: '100%',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `perspective(700px) rotateY(${rotY}deg) rotateX(${rotX}deg) translate(${shiftX}px,${shiftY}px)`,
        transition: ease,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}>
        {/* Glow de fondo */}
        <div style={{
          position: 'absolute', inset: '-20%', borderRadius: '50%',
          background: `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(171,4,51,0.12) 0%, transparent 65%)`,
          opacity: tilt.active ? 1 : 0.4,
          transition: ease,
          pointerEvents: 'none',
        }} />

        {/* Hoja izquierda */}
        <div style={{
          position: 'absolute', left: 14, top: 28, width: 60, height: 76,
          borderRadius: 18, border: '1px solid #d7deea',
          background: 'linear-gradient(160deg,#fff 0%,#f8fafc 100%)',
          boxShadow: '0 16px 32px -20px rgba(15,23,42,0.18)',
          transform: `translateY(${sheetsY - 2}px) rotate(${fanL}deg) scale(${sheetsScale})`,
          transition: ease,
          overflow: 'hidden',
        }}>
          {/* Líneas simuladas */}
          {[14, 26, 38, 50].map(top => (
            <div key={top} style={{
              position: 'absolute', left: 10, right: 10, top,
              height: 2, borderRadius: 99,
              background: `rgba(203,213,225,${0.9 - top * 0.008})`,
            }} />
          ))}
        </div>

        {/* Hoja derecha */}
        <div style={{
          position: 'absolute', right: 14, top: 28, width: 60, height: 76,
          borderRadius: 18, border: '1px solid #d7deea',
          background: 'linear-gradient(160deg,#fff 0%,#f8fafc 100%)',
          boxShadow: '0 16px 32px -20px rgba(15,23,42,0.18)',
          transform: `translateY(${sheetsY - 2}px) rotate(${fanR}deg) scale(${sheetsScale})`,
          transition: ease,
          overflow: 'hidden',
        }}>
          {[14, 26, 38, 50].map(top => (
            <div key={top} style={{
              position: 'absolute', left: 10, right: 10, top,
              height: 2, borderRadius: 99,
              background: `rgba(203,213,225,${0.9 - top * 0.008})`,
            }} />
          ))}
        </div>

        {/* Tarjeta central */}
        <div style={{
          position: 'relative', width: 76, height: 92,
          borderRadius: 18, border: '1px solid #d8dee8',
          background: 'linear-gradient(180deg,#fff 0%,#fbfcfe 100%)',
          boxShadow: `0 ${tilt.active ? 28 : 22}px ${tilt.active ? 56 : 40}px -24px rgba(15,23,42,${tilt.active ? 0.3 : 0.2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: `translateY(${tilt.active ? -3 : 0}px) scale(${tilt.active ? 1.03 : 1})`,
          transition: ease,
          zIndex: 2,
        }}>
          {/* Borde interior */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 18,
            border: '1px solid rgba(203,213,225,0.72)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 5px rgba(248,250,252,0.9)',
          }} />

          {/* Icono */}
          <div style={{
            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${tilt.active ? 1.1 : 1})`,
            transition: ease,
          }}>
            {hasFile
              ? <CheckCircle2 size={22} style={{ color: '#10b981' }} strokeWidth={2.1} />
              : <Plus size={22} style={{ color: '#c7ced9', transition: ease, opacity: tilt.active ? 1 : 0.78 }} strokeWidth={2.05} />
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function batchStatusLabel(status: string) {
  if (status === "completed")  return "Completada";
  if (status === "failed")     return "Fallida";
  if (status === "processing") return "Procesando";
  if (status === "reviewing")  return "En revisión";
  return status;
}

// ── ZipDropArea ───────────────────────────────────────────────────────────────
// Área de drag-and-drop para ZIP — hooks correctamente en componente propio
function ZipDropArea({ zipFileName, onSelectFile, onFileChange }: {
  zipFileName: string | null;
  onSelectFile: () => void;
  onFileChange: (file: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isClicked,  setIsClicked]  = useState(false);

  const handleClick = useCallback(() => {
    setIsClicked(true);
    setTimeout(() => { setIsClicked(false); onSelectFile(); }, 320);
  }, [onSelectFile]);

  return (
    <button
      onClick={handleClick}
      onDragOver={e  => { e.preventDefault(); setIsDragging(true); }}
      onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFileChange(file);
      }}
      className={`mt-6 flex min-h-[390px] w-full flex-col items-center justify-center rounded-[24px] border-2 px-6 py-10 text-center transition-all duration-200 ${
        isDragging
          ? 'border-[#ab0433] bg-red-50/40 scale-[1.01]'
          : isClicked
            ? 'border-[#ab0433]/40 bg-red-50/20 scale-[0.995]'
            : 'border-slate-200 bg-white hover:border-[#ab0433]/30 hover:bg-red-50/10'
      }`}
    >
      <div className="mb-8">
        <ZipUploadIllustration hasFile={!!zipFileName} clicked={isClicked} />
      </div>

      <p className={`text-2xl font-semibold transition-colors duration-200 ${
        isDragging || isClicked ? 'text-[#ab0433]' : 'text-slate-700'
      }`}>
        {isDragging ? '¡Suelta el archivo aquí!'
          : isClicked ? 'Abriendo selector...'
          : zipFileName ?? 'Añade un archivo ZIP con documentos'}
      </p>
      <p className="mt-3 max-w-xl text-base leading-7 text-slate-400">
        {zipFileName
          ? 'Haz click para cambiar el archivo'
          : 'Arrastra un ZIP aquí, o haz click para seleccionarlo'}
      </p>
      {zipFileName && (
        <div className="mt-4 flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5">
          <CheckCircle2 size={14} className="text-green-500" />
          <span className="text-sm font-medium text-green-700">Archivo listo para procesar</span>
        </div>
      )}
    </button>
  );
}

function DocumentImportView({
  zipFile,
  zipFileName,
  autoAssignOrganizations,
  selectedClientId,
  selectedProcurador,
  clients,
  importBusy,
  uploadProgress,
  uploadStage,
  importError,
  activeBatch,
  activeItems,
  history,
  loadingHistory,
  historyError,
  successNotice,
  onBack,
  onToggleAutoAssign,
  onChangeClient,
  onChangeProcurador,
  onSelectFile,
  onFileChange,
  onStartImport,
  onReloadHistory,
  onVerifyItem,
  onDeleteBatch,
  onReviewBatch,
  inputRef,
}: {
  zipFile: File | null;
  zipFileName: string | null;
  autoAssignOrganizations: boolean;
  selectedClientId: string;
  selectedProcurador: string;
  clients: any[];
  importBusy: boolean;
  uploadProgress: number;
  uploadStage: "idle" | "uploading" | "processing";
  importError: string | null;
  activeBatch: ImportBatch | null;
  activeItems: DocumentImportItem[];
  history: ImportBatch[];
  loadingHistory: boolean;
  historyError: string | null;
  successNotice: string | null;
  onBack: () => void;
  onToggleAutoAssign: () => void;
  onChangeClient: (value: string) => void;
  onChangeProcurador: (value: string) => void;
  onSelectFile: () => void;
  onFileChange: (file?: File | null) => void;
  onStartImport: () => void;
  onReloadHistory: () => void;
  onVerifyItem: (item: DocumentImportItem) => void;
  onDeleteBatch: (batchId: string) => void;
  onReviewBatch: (batch: ImportBatch) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const navigate = useNavigate();
  const procuradorOptions = Array.from(
    new Set(
      clients
        .map((client) => [client.procurador, client.procurador_name, client.contacto].find(Boolean))
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es"));
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: `${client.first_name || ""} ${client.last_name || ""}`.trim()
      || client.commercial_name
      || client.nif_cif
      || "Cliente sin nombre",
    meta: client.nif_cif || client.email || undefined,
  }));

  return (
    <div className="p-5 space-y-4 animate-in fade-in duration-300">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center gap-4">
        <BackButton label="Volver a Expedientes" onClick={onBack} />
      </div>

      <div>
        <h1 className="text-base font-bold text-slate-900">Importar Expedientes desde Documentos</h1>
        <p className="mt-0.5 text-xs text-slate-500">Sube tus archivos para crear nuevos expedientes automáticamente.</p>
      </div>

      <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Configuración de Asignación (Opcional)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Puedes asignar automáticamente los expedientes creados a otras organizaciones.
        </p>

        <button
          type="button"
          onClick={onToggleAutoAssign}
          className="mt-4 inline-flex items-center gap-3 text-left"
        >
          <span
            className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${
              autoAssignOrganizations ? "bg-[#ab0433]" : "bg-slate-200"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                autoAssignOrganizations ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </span>
          <span className="text-sm font-semibold text-slate-900">Asignar automáticamente organizaciones</span>
        </button>

        {autoAssignOrganizations && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <PrettyAssignSelect
              label="Cliente"
              placeholder="Seleccionar cliente..."
              value={selectedClientId}
              options={clientOptions}
              emptyMessage="No hay clientes disponibles"
              searchablePlaceholder="Buscar por nombre o ID..."
              onChange={onChangeClient}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-900">Procurador</span>
              <input
                type="text"
                value={selectedProcurador}
                onChange={(e) => onChangeProcurador(e.target.value)}
                placeholder="Escribir procurador..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#ab0433]/35 focus:ring-4 focus:ring-[#ab0433]/10"
              />
            </label>
          </div>
        )}
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Importar Expedientes</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Sube un archivo ZIP que contenga documentos del expediente. Cada documento se procesará como un nuevo expediente.
        </p>

        <ZipDropArea
          zipFileName={zipFileName}
          onSelectFile={onSelectFile}
          onFileChange={onFileChange}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {zipFile ? "Archivo listo para importar" : "Selecciona un ZIP para comenzar"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {zipFile
                ? `${zipFile.name} · ${(zipFile.size / (1024 * 1024)).toFixed(2)} MB`
                : "El sistema extraerá texto de cada documento y creará un expediente por archivo."}
            </p>
            {importError && (
              <p className="mt-2 text-xs font-medium text-red-600">{importError}</p>
            )}
            {importBusy && (
              <div className="mt-3 w-full max-w-md">
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>{uploadStage === "uploading" ? "Subiendo ZIP..." : "Procesando documentos..."}</span>
                  <span>{uploadStage === "uploading" ? `${uploadProgress}%` : "Servidor trabajando"}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${uploadStage === "uploading" ? "bg-[#ab0433]" : "bg-amber-500 animate-pulse"}`}
                    style={{ width: `${uploadStage === "uploading" ? Math.max(uploadProgress, 6) : 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onStartImport}
            disabled={!zipFile || importBusy}
            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all ${
              !zipFile || importBusy
                ? "cursor-not-allowed bg-slate-200 text-slate-400"
                : "bg-[#ab0433] text-white shadow-lg shadow-red-200 hover:bg-[#92042c]"
            }`}
          >
            {importBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importBusy ? "Importando documentos..." : "Procesar ZIP e importar"}
          </button>
        </div>
      </section>

      {successNotice && (
        <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 size={18} />
            <span>{successNotice}</span>
          </div>
        </section>
      )}

      {(activeBatch || activeItems.length > 0) && (
        <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Última importación</h2>
                {activeBatch && (activeBatch.pending_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    {activeBatch.pending_count} pendiente{(activeBatch.pending_count ?? 0) !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Estado del lote y expedientes creados a partir de tus documentos.
              </p>
            </div>
            {activeBatch && (
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                activeBatch.status === "completed"
                  ? "bg-emerald-50 text-emerald-700"
                  : activeBatch.status === "failed"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }`}>
                {batchStatusLabel(activeBatch.status)}
              </span>
            )}
          </div>

          {activeBatch && (
            <div className="mt-4 grid gap-2.5 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Archivo</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-900 break-all">{activeBatch.file_name}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                <p className="mt-0.5 text-base font-bold text-slate-900">{activeBatch.total_count || 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Creados</p>
                <p className="mt-0.5 text-base font-bold text-emerald-600">{activeBatch.completed_count || 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Errores</p>
                <p className="mt-0.5 text-base font-bold text-red-600">{activeBatch.error_count || 0}</p>
              </div>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[88px_minmax(0,1.3fr)_120px_minmax(0,1.2fr)_120px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <span>Fila</span>
              <span>Documento</span>
              <span>Estado</span>
              <span>Resultado</span>
              <span>Acción</span>
            </div>

            {activeItems.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400">Todavía no hay elementos para mostrar.</div>
            ) : (
              activeItems.map((item) => {
                const fileName = item.payload?.fileName || item.reference || `Documento ${item.row_number}`;
                const expedienteLabel = item.anio && item.num_exp
                  ? `${item.anio}/${item.num_exp}`
                  : item.descripcion || "Expediente creado";
                return (
                  <div key={item.id} className="grid grid-cols-[88px_minmax(0,1.3fr)_120px_minmax(0,1.2fr)_120px] gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                    <span className="font-mono text-slate-500">{item.row_number}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{fileName}</p>
                      {item.descripcion && <p className="truncate text-xs text-slate-400">{item.descripcion}</p>}
                    </div>
                    <span className={`inline-flex h-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : item.status === "uploaded"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {item.status === "completed" ? "Creado" : item.status === "uploaded" ? "Pendiente" : "Error"}
                    </span>
                    <div className="min-w-0">
                      {item.status === "completed" ? (
                        <p className="truncate text-slate-700">{expedienteLabel}</p>
                      ) : item.status === "uploaded" ? (
                        <p className="truncate text-amber-700">Documento listo para revisión y verificación</p>
                      ) : (
                        <p className="truncate text-red-600">{item.payload?.userError || item.error_message || "No se pudo procesar"}</p>
                      )}
                    </div>
                    <div>
                      {(item.status === "uploaded" || item.status === "failed") && (
                        <button
                          type="button"
                          onClick={() => onVerifyItem(item)}
                          className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-[#ab0433] hover:text-[#92042c]"
                        >
                          <Eye size={12} />
                          {item.status === "uploaded" ? "Verificar" : "Revisar"}
                        </button>
                      )}
                      {item.created_expediente_id ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/expedientes/${item.created_expediente_id}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#ab0433] hover:text-[#92042c]"
                        >
                          <ExternalLink size={12} />
                          Abrir
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Historial reciente</h2>
            <p className="mt-0.5 text-xs text-slate-500">Últimos lotes importados desde documentos.</p>
          </div>
          <button
            type="button"
            onClick={onReloadHistory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={12} />
            Recargar
          </button>
        </div>

        {historyError && <p className="mt-4 text-sm text-red-600">{historyError}</p>}
        {loadingHistory ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Cargando historial...
          </div>
        ) : history.length === 0 ? (
          <p className="mt-5 text-sm text-slate-400">Aún no hay importaciones documentales registradas.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {history.map((batch) => (
              <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{batch.file_name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(batch.created_at).toLocaleString("es-ES")} · {batch.completed_count}/{batch.total_count} creados
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(batch.status === "reviewing" || batch.status === "processing") && (
                    <button
                      onClick={() => onReviewBatch(batch)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <Eye size={12} />
                      Revisar
                    </button>
                  )}
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    batch.status === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : batch.status === "failed"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                  }`}>
                    {batchStatusLabel(batch.status)}
                  </span>
                  <button
                    onClick={() => onDeleteBatch(batch.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar este lote"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Helpers para días hábiles ──────────────────────────────────────────────────
function addWorkingDays(startStr: string, days: number): Date | null {
  if (!startStr) return null;
  const start = new Date(startStr + "T12:00:00");
  if (isNaN(start.getTime())) return null;
  const cur = new Date(start);
  let count = 0;
  while (count < days) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return cur;
}

function buildCalendarStrip(startStr: string, deadline: Date) {
  if (!startStr) return [];
  const start = new Date(startStr + "T12:00:00");
  if (isNaN(start.getTime())) return [];
  const items: { day: number; month: number; isWeekend: boolean; isDeadline: boolean }[] = [];
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= deadline) {
    const dow = cur.getDay();
    const isLast = cur.toDateString() === deadline.toDateString();
    items.push({ day: cur.getDate(), month: cur.getMonth(), isWeekend: dow === 0 || dow === 6, isDeadline: isLast });
    cur.setDate(cur.getDate() + 1);
  }
  return items;
}

function fmtDateObj(d: Date) {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateHuman(str: string) {
  if (!str) return "";
  const d = new Date(str + "T12:00:00");
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

// ── Sección del panel derecho ──────────────────────────────────────────────────
function PanelSection({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-bold text-slate-800">{title}</span>
        {onAdd && (
          <button type="button" onClick={onAdd}
            className="flex items-center justify-center w-5 h-5 rounded-full border border-slate-300 text-slate-500 hover:border-[#ab0433] hover:text-[#ab0433] transition-colors">
            <Plus size={11} />
          </button>
        )}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

// ── PartyRow: fila de parte con selector persona física/jurídica ───────────────
function PartyRow({ color, value, onChange, onRemove }: {
  color: "blue" | "red"; value: string;
  onChange: (v: string) => void; onRemove?: () => void;
}) {
  const dot = color === "blue" ? "bg-blue-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-white"
      />
      <select className="shrink-0 border border-slate-200 rounded-lg px-1.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:border-red-400 max-w-[82px]">
        <option value="fisica">Persona fisi...</option>
        <option value="juridica">Persona jur...</option>
      </select>
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="shrink-0 p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ── DocumentImportVerifyView ─────────────────────────────────────────────
function DocumentImportVerifyView({
  item,
  clients,
  form,
  representaA,
  saving,
  error,
  onBack,
  onChange,
  onChangeRepresentaA,
  onAccept,
}: {
  item: DocumentImportItem;
  clients: any[];
  form: typeof EXP_EMPTY;
  representaA: "demandantes" | "demandados";
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onChange: (key: keyof typeof EXP_EMPTY, value: any) => void;
  onChangeRepresentaA: (value: "demandantes" | "demandados") => void;
  onAccept: () => void;
}) {
  const normalizeImportedName = (value: unknown): string => {
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      return normalized === "[object Object]" ? "" : normalized;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const candidate = obj.nombre ?? obj.name ?? obj.label ?? obj.razon_social ?? obj.value;
      if (typeof candidate === "string" || typeof candidate === "number") {
        const normalized = String(candidate).trim();
        return normalized === "[object Object]" ? "" : normalized;
      }
    }
    return "";
  };
  const normalizeImportedList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((entry) => normalizeImportedName(entry)).filter(Boolean) : [];

  const previewUrl    = resolveUploadUrl(item.payload?.previewUrl) || "";
  const mimeType      = item.payload?.mimeType || "";
  const textPreview   = String(item.payload?.textPreview || "").trim();
  const userError     = item.payload?.userError || item.error_message;
  const developerError = item.payload?.developerError || null;
  const fileName      = item.payload?.fileName || item.reference || `Documento ${item.row_number}`;

  const safeClienteId        = String(form.cliente_id ?? "");
  const safeClienteNombre    = normalizeImportedName(form.cliente_nombre);
  const safeDescripcion      = String(form.descripcion ?? "");
  const safeContrario           = normalizeImportedName(form.contrario);
  const safeProcurador          = normalizeImportedName(form.procurador);
  const safeAbogadoPropio       = String((form as any).abogado_propio ?? "");
  const safeAbogadoContrario    = String((form as any).abogado_contrario ?? "");
  const safeProcuradorContrario = String((form as any).procurador_contrario ?? "");

  const ABOGADOS_DESPACHO = [
    "REBECA RODRIGUEZ PANIAGUA",
    "FRANCISCO JAVIER FERRÁNDEZ PINA",
  ];
  const safeJuzgado          = String(form.juzgado ?? "");
  const safeTipoProc         = String(form.tipo_proc ?? "");
  const safeTipoAsunto       = String(form.tipos_asunto ?? "");
  const safeNumAutos         = String(form.num_autos ?? "");
  const safeNig              = String(form.nig ?? "");
  const safeRefExpediente    = String(form.ref_expediente ?? "");
  const safeFechaInicio      = String(form.fecha_inicio ?? "");
  const safeCentro           = String(form.centro ?? "");
  const safeObservaciones    = String(form.observaciones ?? "");
  const safeCuantiaPrincipal = form.cuantia_principal == null ? "" : String(form.cuantia_principal);
  const extractedDemandantes = normalizeImportedList((item.payload?.extractedData as any)?.demandantes);
  const extractedDemandados = normalizeImportedList((item.payload?.extractedData as any)?.demandados);

  const clientOptions = clients.map(c => ({
    value: c.id,
    label: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.commercial_name || c.nif_cif || "Cliente sin nombre",
  }));
  const selectedClientLabel = clientOptions.find(o => o.value === safeClienteId)?.label || "";
  const clientInputValue    = selectedClientLabel || safeClienteNombre || "";

  const handleClientInputChange = (value: string) => {
    const norm = value.trim().toLowerCase();
    const match = clientOptions.find(o => o.label.trim().toLowerCase() === norm);
    if (match) { onChange("cliente_id", match.value); onChange("cliente_nombre", match.label); return; }
    onChange("cliente_id", "");
    onChange("cliente_nombre", value);
  };

  const demandantesList: string[] = (() => {
    if (Array.isArray(form.demandantes) && form.demandantes.length > 0) return form.demandantes as string[];
    return clientInputValue ? [clientInputValue] : [];
  })();

  const demandadosList: string[] = (() => {
    if (Array.isArray(form.demandados) && form.demandados.length > 0) return form.demandados as string[];
    return safeContrario ? safeContrario.split(" | ").filter(Boolean) : [];
  })();

  const handleDemandanteChange = (index: number, value: string) => {
    const next = [...demandantesList];
    next[index] = value;
    onChange("demandantes", next);
    if (index === 0) {
      const norm = value.trim().toLowerCase();
      const match = clientOptions.find(o => o.label.trim().toLowerCase() === norm);
      if (match) { onChange("cliente_id", match.value); onChange("cliente_nombre", match.label); }
      else { onChange("cliente_id", ""); onChange("cliente_nombre", value); }
    }
  };

  const addDemandante = () => {
    const next = demandantesList.length ? [...demandantesList, ""] : [clientInputValue, ""];
    onChange("demandantes", next);
  };

  const removeDemandante = (index: number) => {
    const next = demandantesList.filter((_, i) => i !== index);
    onChange("demandantes", next);
    if (index === 0) {
      const first = next[0] ?? "";
      const norm = first.trim().toLowerCase();
      const match = clientOptions.find(o => o.label.trim().toLowerCase() === norm);
      if (match) { onChange("cliente_id", match.value); onChange("cliente_nombre", match.label); }
      else { onChange("cliente_id", ""); onChange("cliente_nombre", first); }
    }
  };

  const handleDemandadoChange = (index: number, value: string) => {
    const next = [...demandadosList];
    next[index] = value;
    onChange("demandados", next);
    onChange("contrario", next.filter(Boolean).join(" | "));
  };

  const addDemandado = () => {
    onChange("demandados", [...demandadosList, ""]);
  };

  const removeDemandado = (index: number) => {
    const next = demandadosList.filter((_, i) => i !== index);
    onChange("demandados", next);
    onChange("contrario", next.filter(Boolean).join(" | "));
  };

  // Auto-rellenar abogado/procurador contrario al cambiar representaA
  useEffect(() => {
    const ext = (item.payload?.extractedData as any) || {};
    const aboD  = normalizeImportedName(ext.abogado_demandante);
    const aboDem = normalizeImportedName(ext.abogado_demandado);
    const procD  = normalizeImportedName(ext.procurador_demandante);
    const procDem = normalizeImportedName(ext.procurador_demandado);

    if (representaA === "demandantes") {
      if (procD)   onChange("procurador" as any,           procD);
      if (aboDem)  onChange("abogado_contrario" as any,    aboDem);
      if (procDem) onChange("procurador_contrario" as any, procDem);
    } else {
      if (procDem) onChange("procurador" as any,           procDem);
      if (aboD)    onChange("abogado_contrario" as any,    aboD);
      if (procD)   onChange("procurador_contrario" as any, procD);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [representaA]);

  // Cálculo fecha límite (20 días hábiles)
  const deadlineDate   = addWorkingDays(safeFechaInicio, 20);
  const calendarStrip  = deadlineDate ? buildCalendarStrip(safeFechaInicio, deadlineDate) : [];

  const canAccept = !saving && safeDescripcion.trim() && (safeClienteId || safeClienteNombre.trim());

  // Visor del documento
  const renderPreview = () => {
    if (mimeType === "application/pdf" && previewUrl) {
      return <iframe title={fileName} src={previewUrl} className="w-full h-full rounded-none border-0 bg-white" />;
    }
    if (mimeType.startsWith("image/") && previewUrl) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-100 p-6">
          <img src={previewUrl} alt={fileName} className="max-h-full max-w-full rounded-xl object-contain shadow-xl" />
        </div>
      );
    }
    return (
      <div className="h-full overflow-auto p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-slate-900">{fileName}</p>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ab0433]">
              <ExternalLink size={12} /> Abrir archivo
            </a>
          )}
        </div>
        <pre className="whitespace-pre-wrap rounded-2xl bg-white border border-slate-200 p-4 text-xs text-slate-700">
          {textPreview || "No hay previsualización disponible para este documento."}
        </pre>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">

      {/* ── Cabecera ──────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 p-2 bg-red-50 rounded-xl">
            <FolderOpen size={15} className="text-red-600" />
          </div>
          <span className="text-sm font-bold text-slate-900 truncate">{fileName}</span>
        </div>
        <button type="button" onClick={onBack}
          className="shrink-0 p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
          <X size={18} />
        </button>
      </div>

      {/* ── Contenido principal ────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Visor PDF */}
        <div className="min-w-0 basis-[56%] overflow-hidden bg-slate-200">
          {renderPreview()}
        </div>

        {/* Panel de detalles */}
        <div className="min-w-[520px] basis-[44%] shrink-0 border-l border-slate-200 bg-white overflow-y-auto flex flex-col">

          {/* Detalles del documento */}
          <PanelSection title="Detalles del documento">
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
              <FolderOpen size={13} className="text-slate-400 shrink-0" />
              <span className="truncate font-medium text-slate-800">{fileName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
              <span className="shrink-0">Recibido el</span>
              <input
                type="date"
                value={safeFechaInicio}
                onChange={e => onChange("fecha_inicio", e.target.value)}
                className="ml-auto border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-700 focus:outline-none focus:border-red-400 bg-white"
              />
            </div>
            {safeFechaInicio && (
              <p className="mt-1 text-xs text-slate-400">{fmtDateHuman(safeFechaInicio)}</p>
            )}
          </PanelSection>

          {/* Fecha límite de respuesta */}
          {deadlineDate && (
            <PanelSection title="Fecha límite de respuesta">
              <div className="flex items-center justify-between mt-1">
                <span className="text-base font-bold text-slate-900">{fmtDateObj(deadlineDate)}</span>
                <span className="text-xs text-slate-400">20 días hábiles</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {calendarStrip.map((d, i) => (
                  <div key={i}
                    title={d.isDeadline ? "Fecha límite" : d.isWeekend ? "Fin de semana" : "Día hábil"}
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-semibold select-none ${
                      d.isDeadline  ? "bg-[#ab0433] text-white shadow-sm" :
                      d.isWeekend   ? "bg-slate-50 text-slate-300"        :
                                      "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {d.day}
                  </div>
                ))}
              </div>
            </PanelSection>
          )}

          {/* Detalles del procedimiento */}
          <PanelSection title="Detalles del procedimiento">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-1">
              <div>
                <p className={lbl}>Tipo procedimiento</p>
                <input value={safeTipoProc} onChange={e => onChange("tipo_proc", e.target.value)} className={inp} />
              </div>
              <div>
                <p className={lbl}>Juzgado</p>
                <input value={safeJuzgado} onChange={e => onChange("juzgado", e.target.value)} className={inp} />
              </div>
              <div>
                <p className={lbl}>Tipo expediente</p>
                <AppSelect value={String(form.tipo ?? "judicial")} onChange={e => onChange("tipo", e.target.value)}>
                  {Object.entries(TIPOS).map(([v, info]) => <option key={v} value={v}>{info.label}</option>)}
                </AppSelect>
              </div>
              <div>
                <p className={lbl}>Tipo asunto</p>
                <input value={safeTipoAsunto} onChange={e => onChange("tipos_asunto", e.target.value)} className={inp} placeholder="Civil, Penal…" />
              </div>
              <div>
                <p className={lbl}>NIG</p>
                <input value={safeNig} onChange={e => onChange("nig", e.target.value)} className={inp} />
              </div>
              <div>
                <p className={lbl}>Núm. procedimiento</p>
                <input value={safeNumAutos} onChange={e => onChange("num_autos", e.target.value)} className={inp} />
              </div>
            </div>
          </PanelSection>

          {/* Descripción */}
          <PanelSection title="Descripción del expediente">
            <div className="mt-1">
              <input value={safeDescripcion} onChange={e => onChange("descripcion", e.target.value)} className={inp}
                placeholder="Resumen del expediente…" />
            </div>
          </PanelSection>

          <PanelSection title="Representación del despacho">
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => onChangeRepresentaA("demandantes")}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  representaA === "demandantes"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold">Representamos a demandantes</p>
                <p className="mt-1 text-xs opacity-80">
                  {extractedDemandantes.length ? extractedDemandantes.join(" | ") : "Sin demandantes detectados"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onChangeRepresentaA("demandados")}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  representaA === "demandados"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold">Representamos a demandados</p>
                <p className="mt-1 text-xs opacity-80">
                  {extractedDemandados.length ? extractedDemandados.join(" | ") : "Sin demandados detectados"}
                </p>
              </button>
            </div>
          </PanelSection>

          {/* Demandantes */}
          <PanelSection title="Demandantes" onAdd={addDemandante}>
            <datalist id={`doc-import-clients-${item.id}`}>
              {clientOptions.map(o => <option key={o.value} value={o.label} />)}
            </datalist>
            {demandantesList.length === 0 ? (
              <PartyRow color="blue" value={clientInputValue} onChange={handleClientInputChange} />
            ) : (
              demandantesList.map((name, i) => (
                <PartyRow
                  key={i}
                  color="blue"
                  value={name}
                  onChange={v => handleDemandanteChange(i, v)}
                  onRemove={demandantesList.length > 1 ? () => removeDemandante(i) : undefined}
                />
              ))
            )}
          </PanelSection>

          {/* Demandados */}
          <PanelSection title="Demandados" onAdd={addDemandado}>
            {demandadosList.length === 0 ? (
              <PartyRow
                color="red"
                value={safeContrario}
                onChange={v => { onChange("contrario", v); onChange("demandados", v ? [v] : []); }}
              />
            ) : (
              demandadosList.map((name, i) => (
                <PartyRow
                  key={i}
                  color="red"
                  value={name}
                  onChange={v => handleDemandadoChange(i, v)}
                  onRemove={demandadosList.length > 1 ? () => removeDemandado(i) : undefined}
                />
              ))
            )}
          </PanelSection>

          {/* Abogados y Procuradores */}
          <PanelSection title="Abogados y Procuradores">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 mt-2">

              {/* Abogado propio — siempre del despacho */}
              <div>
                <p className={`${lbl} flex items-center gap-1`}>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  Abogado propio
                </p>
                <select
                  value={safeAbogadoPropio}
                  onChange={e => onChange("abogado_propio" as any, e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                >
                  <option value="">— Seleccionar —</option>
                  {ABOGADOS_DESPACHO.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              {/* Abogado contrario */}
              <div>
                <p className={`${lbl} flex items-center gap-1`}>
                  <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  Abogado contrario
                </p>
                <input
                  value={safeAbogadoContrario}
                  onChange={e => onChange("abogado_contrario" as any, e.target.value)}
                  placeholder="Nombre del abogado contrario…"
                  className={`mt-1 ${inp}`}
                />
              </div>

              {/* Procurador propio */}
              <div>
                <p className={`${lbl} flex items-center gap-1`}>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  Procurador propio
                </p>
                <input
                  value={safeProcurador}
                  onChange={e => onChange("procurador", e.target.value)}
                  placeholder="Nombre del procurador propio…"
                  className={`mt-1 ${inp}`}
                />
              </div>

              {/* Procurador contrario */}
              <div>
                <p className={`${lbl} flex items-center gap-1`}>
                  <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  Procurador contrario
                </p>
                <input
                  value={safeProcuradorContrario}
                  onChange={e => onChange("procurador_contrario" as any, e.target.value)}
                  placeholder="Nombre del procurador contrario…"
                  className={`mt-1 ${inp}`}
                />
              </div>

            </div>
          </PanelSection>

          {/* Campos adicionales */}
          <PanelSection title="Más datos">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-1">
              <div>
                <p className={lbl}>Ref. expediente</p>
                <input value={safeRefExpediente} onChange={e => onChange("ref_expediente", e.target.value)} className={inp} />
              </div>
              <div>
                <p className={lbl}>Cuantía principal</p>
                <input type="number" value={safeCuantiaPrincipal} onChange={e => onChange("cuantia_principal", e.target.value)} className={inp} />
              </div>
              <div>
                <p className={lbl}>Centro</p>
                <input value={safeCentro} onChange={e => onChange("centro", e.target.value)} className={inp} />
              </div>
              <div>
                <p className={lbl}>Estado</p>
                <AppSelect value={String(form.estado ?? "abierto")} onChange={e => onChange("estado", e.target.value)}>
                  {Object.entries(ESTADOS).map(([v, info]) => <option key={v} value={v}>{info.label}</option>)}
                </AppSelect>
              </div>
              <div className="col-span-2">
                <p className={lbl}>Observaciones</p>
                <textarea value={safeObservaciones} onChange={e => onChange("observaciones", e.target.value)}
                  className={`${inp} min-h-[72px] resize-y`} />
              </div>
            </div>
          </PanelSection>

          {/* Errores de lectura */}
          {(userError || developerError || error) && (
            <div className="border-t border-amber-200 bg-amber-50 p-4 space-y-3">
              {(error || userError) && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Aviso de lectura</p>
                  <p className="text-xs text-amber-900">{error || userError}</p>
                </div>
              )}
              {developerError && (
                <details className="text-xs">
                  <summary className="font-semibold text-slate-500 cursor-pointer">Detalle técnico</summary>
                  <pre className="mt-1 whitespace-pre-wrap text-slate-600 bg-white rounded-lg p-2 border border-slate-200">{developerError}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Barra inferior ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 bg-white border-t border-slate-200">
        <button type="button" onClick={onBack}
          className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={onAccept} disabled={!canAccept}
          className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl transition-all ${
            canAccept
              ? "bg-[#ab0433] text-white shadow-md shadow-red-200 hover:bg-[#8f0329] active:scale-[0.98]"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {saving ? "Creando expediente…" : "Crear expediente"}
        </button>
      </div>
    </div>
  , document.body);
}


function ImportStep({
  step,
  label,
  active = false,
  completed = false,
  first = false,
  last = false,
  icon: _icon,
  connector: _connector,
}: {
  step: number;
  label: string;
  active?: boolean;
  completed?: boolean;
  first?: boolean;
  last?: boolean;
  icon?: any;
  connector?: boolean;
}) {
  return (
    <div className={`relative z-10 flex items-center gap-3 bg-white ${
      first ? "pr-4" : last ? "pl-4" : "px-4"
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        completed
          ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
          : active
          ? "bg-red-600 text-white shadow-md shadow-red-500/30"
          : "bg-slate-50 border-2 border-slate-200 text-slate-400"
      }`}>
        {completed ? <Check size={13} /> : step}
      </div>
      <span className={`text-sm font-bold hidden sm:block whitespace-nowrap ${
        completed ? "text-emerald-600" : active ? "text-slate-800" : "text-slate-400"
      }`}>{label}</span>
    </div>
  );
}

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

// ── Dropdown de campo de filtro ──────────────────────────────
function FieldDropdown({ value, onChange, options }: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 min-w-[160px] hover:border-slate-300 focus:outline-none focus:border-red-400 transition-colors select-none"
      >
        <span className="flex-1 text-left truncate">{selected?.label ?? "Elegir…"}</span>
        <ChevronDown size={11} className={`shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute left-0 top-full mt-1 z-50 w-52 rounded-2xl border border-slate-100 bg-white shadow-2xl py-1.5 overflow-hidden">
          {options.map(o => (
            <li
              key={o.value}
              onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }}
              className={`px-3.5 py-1.5 text-xs cursor-pointer transition-colors ${o.value === value ? "bg-red-50 text-red-600 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <FieldDropdown
        value={filter.field}
        onChange={val => onChange(filter.id, { field: val, value: "" })}
        options={FILTER_FIELDS}
      />
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




// ── Modal Configuración de Numeración ─────────────────────────
function CounterConfigModal({ onClose, getToken }: { onClose: () => void; getToken: () => Promise<string | null> }) {
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([currentYear]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [selectedAnio, setSelectedAnio] = useState<number>(currentYear);
  // Keep a stable ref so effects don't re-fire when the parent re-renders
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Datos del año seleccionado (cargados on demand)
  const [yearData, setYearData] = useState<any | null>(null);
  const [yearLoading, setYearLoading] = useState(false);

  const [autoFill,    setAutoFill]    = useState(true);
  const [generalNum,  setGeneralNum]  = useState("1");
  const [useOverride, setUseOverride] = useState(false);
  const [overrideNum, setOverrideNum] = useState("");
  const [formError,   setFormError]   = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Carga rápida de la lista de años
  useEffect(() => {
    (async () => {
      setYearsLoading(true);
      try {
        const token = await getTokenRef.current();
        const res = await fetch("/api/expedientes/counter-config", { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (res.ok && d.data?.length) setYears(d.data);
      } finally { setYearsLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carga de datos del año seleccionado (lazy)
  useEffect(() => {
    setYearData(null);
    setFormError("");
    setYearLoading(true);
    (async () => {
      try {
        const token = await getTokenRef.current();
        const res = await fetch(`/api/expedientes/counter-config/${selectedAnio}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (res.ok && d.data) {
          setYearData(d.data);
          setAutoFill(d.data.auto_fill !== false);
          setGeneralNum(String(d.data.min_num ?? 1));
          setUseOverride(d.data.override_next != null);
          setOverrideNum(d.data.override_next != null ? String(d.data.override_next) : "");
        } else {
          setAutoFill(true); setGeneralNum("1"); setUseOverride(false); setOverrideNum("");
        }
      } finally { setYearLoading(false); }
    })();
  }, [selectedAnio]); // getToken omitted intentionally — stable via ref

  const handleAccept = async () => {
    setFormError("");
    const mn = Number(generalNum);
    if (!Number.isInteger(mn) || mn < 1) { setFormError("El número mínimo debe ser un entero >= 1"); return; }
    if (useOverride) {
      const ov = Number(overrideNum);
      if (!Number.isInteger(ov) || ov < 1) { setFormError("El número específico debe ser un entero >= 1"); return; }
    }
    setSaving(true);
    try {
      const token = await getTokenRef.current();
      const res = await fetch("/api/expedientes/counter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ anio: selectedAnio, min_num: mn, auto_fill: autoFill, override_next: useOverride ? Number(overrideNum) : null }),
      });
      if (!res.ok) { const d = await res.json(); setFormError(d.error || "Error al guardar"); return; }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      // Refrescar datos del año
      const token2 = await getTokenRef.current();
      const res2 = await fetch(`/api/expedientes/counter-config/${selectedAnio}`, { headers: { Authorization: `Bearer ${token2}` } });
      const d2 = await res2.json();
      if (res2.ok && d2.data) setYearData(d2.data);
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden">

        {/* Header VantIA */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <Hash size={15} className="text-[#ab0433]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Configurar numeración</h2>
              <p className="text-xs text-slate-400">Gestión de contadores de expedientes por ejercicio</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo: panel izquierdo + contenido */}
        <div className="flex" style={{ minHeight: 360 }}>

          {/* Panel izquierdo — años */}
          <div className="w-36 shrink-0 border-r border-slate-100 bg-slate-50 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
              Ejercicio
            </div>
            {yearsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={14} className="animate-spin text-slate-300" />
              </div>
            ) : years.map(yr => (
              <button key={yr} type="button" onClick={() => setSelectedAnio(yr)}
                className={`text-left px-4 py-3 text-sm font-semibold border-b border-slate-100 transition-colors ${
                  selectedAnio === yr
                    ? "bg-[#ab0433] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}>
                {yr}
              </button>
            ))}
          </div>

          {/* Panel derecho — configuración */}
          <div className="flex-1 p-6 space-y-5">
            <div>
              <p className="text-sm font-bold text-slate-800">Contadores</p>
              <p className="text-xs text-slate-500 mt-1">
                Establece la numeración automática para los expedientes del ejercicio <strong>{selectedAnio}</strong>.
              </p>
            </div>

            {yearLoading ? (
              <div className="flex items-center gap-2 text-slate-400 py-4">
                <Loader2 size={15} className="animate-spin" />
                <span className="text-sm">Cargando...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stats del año */}
                {yearData && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium">
                      {yearData.used_count} expediente{yearData.used_count !== 1 ? "s" : ""} en {selectedAnio}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                      Próximo: {yearData.next_num}
                    </span>
                    {yearData.gaps?.length > 0 ? (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                        {yearData.gaps.length} hueco{yearData.gaps.length !== 1 ? "s" : ""}: {yearData.gaps.slice(0, 6).join(", ")}{yearData.gaps.length > 6 ? "…" : ""}
                      </span>
                    ) : yearData.used_count > 0 ? (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-400 border border-slate-200">Sin huecos</span>
                    ) : null}
                  </div>
                )}

                {/* Checkbox automático */}
                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={autoFill} onChange={e => setAutoFill(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#ab0433] cursor-pointer shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Calcular los Contadores de Forma Automática</span>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      (El contador busca el <strong>primer número libre</strong>, rellenando huecos si se han borrado expedientes)
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Esta opción afecta al contador de expedientes de este ejercicio.</p>
                  </div>
                </label>

                {/* Contador de Expedientes */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-[11px] font-bold text-[#ab0433] uppercase tracking-widest">Contador de Expedientes</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                        <input type="radio" name={`mode-${selectedAnio}`} checked={!useOverride} onChange={() => setUseOverride(false)}
                          className="w-4 h-4 accent-[#ab0433]" />
                        <span className="text-sm text-slate-700 font-medium">General</span>
                      </label>
                      <input type="number" min="1" step="1" value={generalNum}
                        onChange={e => setGeneralNum(e.target.value)}
                        className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-right focus:outline-none focus:ring-1 focus:ring-[#ab0433] shadow-sm" />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                        <input type="radio" name={`mode-${selectedAnio}`} checked={useOverride} onChange={() => setUseOverride(true)}
                          className="w-4 h-4 accent-[#ab0433]" />
                        <span className="text-sm text-slate-700 font-medium">Número específico</span>
                      </label>
                      <input type="number" min="1" step="1" value={overrideNum}
                        onChange={e => setOverrideNum(e.target.value)}
                        disabled={!useOverride} placeholder="—"
                        className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-right focus:outline-none focus:ring-1 focus:ring-[#ab0433] shadow-sm disabled:bg-slate-50 disabled:text-slate-300" />
                    </div>
                    {useOverride && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg border border-amber-200 px-3 py-2">
                        El próximo expediente usará este número exacto (uso único — después vuelve al modo automático).
                      </p>
                    )}
                  </div>
                </div>

                {formError && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
                    <AlertCircle size={12} /> {formError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer con botones */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-400">Los cambios se aplican al siguiente expediente creado</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleAccept} disabled={saving || yearLoading}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#ab0433] text-white text-sm font-bold hover:bg-[#92042c] disabled:opacity-50 transition-colors shadow-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : savedOk ? <CheckCircle2 size={13} /> : null}
              {savedOk ? "Guardado" : "Aceptar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Componente principal ───────────────────────────────────────
export default function ExpedienteList() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Abrir vista correspondiente si la URL contiene ?nuevo=1 / ?mode=csv / ?mode=docs
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (searchParams.get("nuevo") === "1") {
      setEditItem(null);
      setShowModal(true);
      setSearchParams(prev => { prev.delete("nuevo"); return prev; }, { replace: true });
    } else if (mode === "csv") {
      setViewMode("csvImport");
      setSearchParams(prev => { prev.delete("mode"); return prev; }, { replace: true });
    } else if (mode === "docs") {
      setViewMode("documentImport");
      setSearchParams(prev => { prev.delete("mode"); return prev; }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Confirmación borrado + undo
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { pending: pendingDelete, startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete<any>({
    onDelete: async (id: string) => {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/expedientes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  });

  // Vistas
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const switchView = (v: ViewMode) => { setViewMode(v); if (v !== "multiselect") setSelectedIds(new Set()); };

  const PAGE_SIZE = 12;
  const [currentPage, setCurrentPage] = useState(1);

  // Multiselect
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStateLoading, setBulkStateLoading] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  useEffect(() => {
    const open = !!deleteId || bulkDeleteConfirm;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [deleteId, bulkDeleteConfirm]);
  const [showBulkStateMenu, setShowBulkStateMenu] = useState(false);
  const bulkStateMenuRef = useRef<HTMLDivElement>(null);

  const toggleSelectId = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelectedIds(new Set(filtered.map(e => e.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setBulkDeleteConfirm(false);
    setExpedientes(prev => prev.filter(e => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
    for (const id of ids) {
      try {
        const token = await getToken({ skipCache: true });
        await fetch(`/api/expedientes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      } catch { /* ignore individual failures */ }
    }
  };

  const handleBulkChangeState = async (estado: string) => {
    const ids = Array.from(selectedIds);
    setShowBulkStateMenu(false);
    setBulkStateLoading(true);
    setExpedientes(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, estado } : e));
    setSelectedIds(new Set());
    try {
      const token = await getToken({ skipCache: true });
      await Promise.all(ids.map(id =>
        fetch(`/api/expedientes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ estado }),
        })
      ));
    } catch { /* ignore */ } finally { setBulkStateLoading(false); }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkStateMenuRef.current && !bulkStateMenuRef.current.contains(e.target as Node)) setShowBulkStateMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const documentImportInputRef = useRef<HTMLInputElement>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [documentImportZipFile, setDocumentImportZipFile] = useState<File | null>(null);
  const [documentImportZipFileName, setDocumentImportZipFileName] = useState<string | null>(null);
  const [documentImportAutoAssignOrganizations, setDocumentImportAutoAssignOrganizations] = useState(false);
  const [documentImportAssignedClientId, setDocumentImportAssignedClientId] = useState("");
  const [documentImportAssignedProcurador, setDocumentImportAssignedProcurador] = useState("");
  const [documentImportSubmitting, setDocumentImportSubmitting] = useState(false);
  const [documentImportUploadProgress, setDocumentImportUploadProgress] = useState(0);
  const [documentImportUploadStage, setDocumentImportUploadStage] = useState<"idle" | "uploading" | "processing">("idle");
  const [documentImportError, setDocumentImportError] = useState<string | null>(null);
  const [documentImportActiveBatch, setDocumentImportActiveBatch] = useState<ImportBatch | null>(null);
  const [documentImportItems, setDocumentImportItems] = useState<DocumentImportItem[]>([]);
  const [documentImportHistory, setDocumentImportHistory] = useState<ImportBatch[]>([]);
  const [documentImportHistoryLoading, setDocumentImportHistoryLoading] = useState(false);
  const [documentImportHistoryError, setDocumentImportHistoryError] = useState<string | null>(null);
  const [documentImportSuccessNotice, setDocumentImportSuccessNotice] = useState<string | null>(null);
  const [documentImportVerifyItem, setDocumentImportVerifyItem] = useState<DocumentImportItem | null>(null);
  const [documentImportVerifyForm, setDocumentImportVerifyForm] = useState<typeof EXP_EMPTY>(EXP_EMPTY);
  const [documentImportRepresentaA, setDocumentImportRepresentaA] = useState<"demandantes" | "demandados">("demandantes");
  const [documentImportVerifySaving, setDocumentImportVerifySaving] = useState(false);
  const [documentImportVerifyError, setDocumentImportVerifyError] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [csvFieldMappings, setCsvFieldMappings] = useState<CsvFieldMapping[]>(() => buildCsvMappings([], []));
  const [csvImportBatchId, setCsvImportBatchId] = useState<string | null>(null);
  const [csvImportProgress, setCsvImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvImportSummary, setCsvImportSummary] = useState<CsvImportSummary>({
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    successRate: 0,
    issues: [],
  });
  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [loadingImportHistory, setLoadingImportHistory] = useState(false);
  const [importHistoryError, setImportHistoryError] = useState<string | null>(null);

  // Adjuntos modal
  const [showAdjuntos, setShowAdjuntos] = useState(false);
  const [showRelacionarModal, setShowRelacionarModal] = useState(false);
  const [relatedExpedientes, setRelatedExpedientes] = useState<any[]>([]);
  const [loadingRelatedExpedientes, setLoadingRelatedExpedientes] = useState(false);
  const [relacionarQuery, setRelacionarQuery] = useState("");
  const [relacionarSearching, setRelacionarSearching] = useState(false);
  const [relacionarResults, setRelacionarResults] = useState<any[]>([]);
  const [relacionarHasSearched, setRelacionarHasSearched] = useState(false);
  const [relacionarSavingId, setRelacionarSavingId] = useState<string | null>(null);
  const [relacionarSearchError, setRelacionarSearchError] = useState("");
  const [relacionarAssociateError, setRelacionarAssociateError] = useState("");
  const relacionarDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportTemplateEditor, setShowExportTemplateEditor] = useState(false);
  const [exportEditorMode, setExportEditorMode] = useState<"create" | "edit">("create");
  const [customExportTemplates, setCustomExportTemplates] = useState<ExportTemplate[]>(() => loadStoredExpedienteExportTemplates());
  const [selectedExportTemplateId, setSelectedExportTemplateId] = useState<string>(DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE.id);
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>("excel");
  const [exportTemplateName, setExportTemplateName] = useState("");
  const [exportVisibleFields, setExportVisibleFields] = useState<string[]>(DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE.fields);
  const [exportAvailableSelected, setExportAvailableSelected] = useState<string[]>([]);
  const [exportVisibleSelected, setExportVisibleSelected] = useState<string[]>([]);
  const [exportError, setExportError] = useState("");
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const [formatDropdownPos, setFormatDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const formatDropdownBtnRef = useRef<HTMLButtonElement>(null);
  const formatDropdownMenuRef = useRef<HTMLDivElement>(null);

  // Modal contador
  const [showCounterModal, setShowCounterModal] = useState(false);

  // Dropdowns click-based
  const [showOpciones, setShowOpciones] = useState(false);
  const [opcionesMenuPos, setOpcionesMenuPos] = useState({ top: 0, left: 0 });
  const opcionesRef = useRef<HTMLDivElement>(null);
  const opcionesBtnRef = useRef<HTMLButtonElement>(null);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showAltaMenu, setShowAltaMenu] = useState(false);
  const [altaMenuPos, setAltaMenuPos] = useState({ top: 0, left: 0 });
  const altaMenuRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<ExpedienteListColumnKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem("expediente-list-visible-columns");
      if (!raw) return DEFAULT_VISIBLE_EXPEDIENTE_COLUMNS;
      const parsed = JSON.parse(raw) as Partial<Record<ExpedienteListColumnKey, boolean>>;
      return { ...DEFAULT_VISIBLE_EXPEDIENTE_COLUMNS, ...parsed };
    } catch {
      return DEFAULT_VISIBLE_EXPEDIENTE_COLUMNS;
    }
  });

  // Cerrar dropdown Opciones al clicar fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (opcionesRef.current && !opcionesRef.current.contains(e.target as Node)) setShowOpciones(false);
      if (altaMenuRef.current && !altaMenuRef.current.contains(e.target as Node) && !(e.target as Element).closest?.('[data-alta-menu]')) setShowAltaMenu(false);
      if (
        formatDropdownBtnRef.current && !formatDropdownBtnRef.current.contains(e.target as Node) &&
        formatDropdownMenuRef.current && !formatDropdownMenuRef.current.contains(e.target as Node)
      ) setShowFormatDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    localStorage.setItem("expediente-list-visible-columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const openManualCreate = () => {
    setShowAltaMenu(false);
    setEditItem(null);
    setShowModal(true);
  };

  const openCsvImport = () => {
    setShowAltaMenu(false);
    setViewMode("csvImport");
  };

  const openDocumentImport = () => {
    setShowAltaMenu(false);
    setViewMode("documentImport");
  };

  const handleDocumentImportZipSelected = (file?: File | null) => {
    if (!file) {
      setDocumentImportZipFile(null);
      setDocumentImportZipFileName(null);
      return;
    }
    const isZip = file.name.toLowerCase().endsWith(".zip");
    if (!isZip) {
      setDocumentImportError("Selecciona un archivo ZIP válido.");
      return;
    }
    setDocumentImportError(null);
    setDocumentImportZipFile(file);
    setDocumentImportZipFileName(file.name);
    if (documentImportInputRef.current) documentImportInputRef.current.value = "";
  };

  const fetchDocumentImportBatch = useCallback(async (batchId: string) => {
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/expedientes/documents/batch/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle de la importación");
    setDocumentImportActiveBatch(data.data?.batch || null);
    setDocumentImportItems(data.data?.items || []);
  }, [getToken]);

  const fetchDocumentImportHistory = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setDocumentImportHistoryLoading(true);
        setDocumentImportHistoryError(null);
      }
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/expedientes/documents/batches", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el historial de importación documental");
      setDocumentImportHistory(data.data || []);
    } catch (e: any) {
      if (!silent) setDocumentImportHistoryError(e.message || "No se pudo cargar el historial de importación documental");
    } finally {
      if (!silent) setDocumentImportHistoryLoading(false);
    }
  }, [getToken]);

  const openDocumentImportVerify = useCallback((item: DocumentImportItem) => {
    const draft = (item.payload?.draft || {}) as Partial<typeof EXP_EMPTY>;
    const normalizeImportedName = (value: unknown): string => {
      if (typeof value === "string" || typeof value === "number") {
        const normalized = String(value).trim();
        return normalized === "[object Object]" ? "" : normalized;
      }
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const candidate = obj.nombre ?? obj.name ?? obj.label ?? obj.razon_social ?? obj.value;
        if (typeof candidate === "string" || typeof candidate === "number") {
          const normalized = String(candidate).trim();
          return normalized === "[object Object]" ? "" : normalized;
        }
      }
      return "";
    };
    const normalizeImportedList = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((entry) => normalizeImportedName(entry)).filter(Boolean) : [];
    const extractedDemandantes = normalizeImportedList((item.payload?.extractedData as any)?.demandantes);
    const extractedDemandados = normalizeImportedList((item.payload?.extractedData as any)?.demandados);
    const inferredRepresentaA = String((item.payload?.draft as any)?.representa_a || "").trim() === "demandados"
      ? "demandados"
      : extractedDemandados.length && !extractedDemandantes.length
        ? "demandados"
        : "demandantes";
    const ext = (item.payload?.extractedData as any) || {};
    const procuradorDemandante = normalizeImportedName(ext.procurador_demandante || (draft as any).procurador_demandante);
    const procuradorDemandado  = normalizeImportedName(ext.procurador_demandado  || (draft as any).procurador_demandado);
    const procuradorPropio    = inferredRepresentaA === "demandados" ? procuradorDemandado  : procuradorDemandante;
    const procuradorContrario = inferredRepresentaA === "demandados" ? procuradorDemandante : procuradorDemandado;
    setDocumentImportVerifyItem(item);
    setDocumentImportVerifyError(null);
    setDocumentImportRepresentaA(inferredRepresentaA);
    setDocumentImportVerifyForm({
      ...EXP_EMPTY,
      ...draft,
      cliente_nombre: normalizeImportedName(draft.cliente_nombre),
      contrario: normalizeImportedName(draft.contrario),
      procurador: procuradorPropio || normalizeImportedName(draft.procurador),
      procurador_contrario: procuradorContrario,
      cuantia_principal: draft.cuantia_principal != null ? String(draft.cuantia_principal) : "",
    } as typeof EXP_EMPTY);
    setViewMode("documentImportVerify");
  }, []);

  const handleAcceptDocumentImportItem = useCallback(async () => {
    if (!documentImportActiveBatch || !documentImportVerifyItem) return;
    if (!String(documentImportVerifyForm.descripcion ?? "").trim()) {
      setDocumentImportVerifyError("Añade una descripción antes de aceptar el expediente.");
      return;
    }
    if (!String(documentImportVerifyForm.cliente_id ?? "").trim() && !String(documentImportVerifyForm.cliente_nombre ?? "").trim()) {
      setDocumentImportVerifyError("Indica un cliente escribiendo el nombre o seleccionando uno existente antes de aceptar el expediente.");
      return;
    }

    setDocumentImportVerifySaving(true);
    setDocumentImportVerifyError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/documents/batch/${documentImportActiveBatch.id}/items/${documentImportVerifyItem.id}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ draft: documentImportVerifyForm, representa_a: documentImportRepresentaA }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudo crear el expediente desde el documento verificado");

      await Promise.all([
        fetchDocumentImportBatch(documentImportActiveBatch.id),
        fetchDocumentImportHistory(true),
      ]);

      setDocumentImportSuccessNotice(`Se creó el expediente correctamente desde "${documentImportVerifyItem.payload?.fileName || documentImportVerifyItem.reference || `Documento ${documentImportVerifyItem.row_number}`}".`);
      setDocumentImportVerifyItem(null);
      setViewMode("documentImport");
    } catch (e: any) {
      setDocumentImportVerifyError(e.message || "No se pudo aceptar el documento");
    } finally {
      setDocumentImportVerifySaving(false);
    }
  }, [
    documentImportActiveBatch,
    documentImportVerifyForm,
    documentImportVerifyItem,
    documentImportRepresentaA,
    fetchDocumentImportBatch,
    fetchDocumentImportHistory,
    getToken,
  ]);

  const handleDeleteBatch = useCallback(async (batchId: string) => {
    setDocumentImportHistory(prev => prev.filter(b => b.id !== batchId));
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/expedientes/documents/batch/${batchId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
  }, [getToken]);

  const handleReviewBatch = useCallback(async (batch: ImportBatch) => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/documents/batch/${batch.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los elementos del lote");
      setDocumentImportActiveBatch(data.data?.batch || batch);
      setDocumentImportItems(data.data?.items || []);
      setViewMode("documentImport");
    } catch (e: any) {
      alert(e.message || "Error al cargar el lote");
    }
  }, [getToken]);

  async function handleStartDocumentImport() {
    if (!documentImportZipFile) {
      setDocumentImportError("Selecciona primero un archivo ZIP.");
      return;
    }
    if (documentImportAutoAssignOrganizations && !documentImportAssignedClientId) {
      setDocumentImportError("Selecciona un cliente para la asignación automática.");
      return;
    }

    setDocumentImportSubmitting(true);
    setDocumentImportUploadProgress(0);
    setDocumentImportUploadStage("uploading");
    setDocumentImportError(null);
    setDocumentImportSuccessNotice(null);
    try {
      const token = await getToken({ skipCache: true });
      const formData = new FormData();
      formData.append("zip", documentImportZipFile);
      formData.append("auto_assign", String(documentImportAutoAssignOrganizations));
      if (documentImportAssignedClientId) formData.append("cliente_id", documentImportAssignedClientId);
      if (documentImportAssignedProcurador.trim()) formData.append("procurador", documentImportAssignedProcurador.trim());

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", resolveApiUrl("/api/expedientes/documents/upload"));
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setDocumentImportUploadStage("uploading");
            setDocumentImportUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
          }
        };
        xhr.onload = async () => {
          setDocumentImportUploadStage("processing");
          setDocumentImportUploadProgress(100);
          try {
            const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error(parsed.error || "No se pudo importar el ZIP"));
              return;
            }
            resolve(parsed);
          } catch (parseError: any) {
            reject(new Error(parseError?.message || "No se pudo interpretar la respuesta de la importación"));
          }
        };
        xhr.onerror = () => reject(new Error("No se pudo subir el ZIP al servidor"));
        xhr.send(formData);
      });

      const batchId = data.data?.batchId;
      if (batchId) await fetchDocumentImportBatch(batchId);
      await Promise.all([
        fetchDocumentImportHistory(true),
        fetchExpedientes(true),
      ]);
    } catch (e: any) {
      setDocumentImportError(e.message || "No se pudo importar el ZIP");
    } finally {
      setDocumentImportUploadStage("idle");
      setDocumentImportSubmitting(false);
    }
  }

  const handleCsvSelected = async (file?: File | null) => {
    if (!file) return;

    setCsvFileName(file.name);
    const rawText = await file.text();
    const { headers, rows } = parseCsvContent(rawText);
    setCsvHeaders(headers);
    setCsvPreviewRows(rows);
    setCsvFieldMappings(buildCsvMappings(headers, rows));
    setCsvImportSummary({
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      successRate: 0,
      issues: [],
    });
    setCsvImportBatchId(null);

    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/expedientes/imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_name: file.name,
          status: "uploaded",
          pending_count: 0,
          total_count: 0,
          completed_count: 0,
          error_count: 0,
          notes: "Archivo CSV subido y pendiente de configuracion.",
        }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo registrar la importacion");
      setCsvImportBatchId(d.data?.id || null);
      setImportHistory((prev) => [d.data, ...prev]);
      switchView("csvImportConfigure");
    } catch (e: any) {
      alert(e.message || "No se pudo registrar la importacion.");
    }
  };

  const handleCsvMappingChange = (id: string, value: string) => {
    setCsvFieldMappings((prev) => prev.map((field) => (
      field.id === id ? {
        ...field,
        selected: value,
        sample: value === CSV_UNASSIGNED ? "Sin detectar" : (csvPreviewRows[0]?.[value] || "Sin valor"),
      } : field
    )));
  };

  const handleImportCsv = async () => {
    const token = await getToken({ skipCache: true });
    const issues: CsvImportIssue[] = [...validateCsvImport(csvFieldMappings, csvPreviewRows).issues];
    const results: CsvRowImportResult[] = new Array(csvPreviewRows.length);

    // All rows go to the API — no client-side pre-filtering
    const toProcess = csvPreviewRows.map((row, index) => ({ index, row }));

    const CONCURRENCY = 8;
    let doneCount = 0;
    setCsvImportProgress({ done: 0, total: toProcess.length });

    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      const batch = toProcess.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ index, row }) => {
        const rowNumber = index + 1;
        const payload = buildExpedientePayload(row, csvFieldMappings);
        const reference = (payload.ref_propia as string) || null;
        try {
          const res = await fetch("/api/expedientes", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
          const data = await safeJson(res);
          if (!res.ok) {
            const message = data.error || "No se pudo crear el expediente";
            issues.push({ rowNumber, fieldId: "expediente", fieldLabel: "Expediente", message });
            results[index] = { rowNumber, status: "failed", reference, error_message: message, payload };
          } else {
            results[index] = { rowNumber, status: "completed", reference, error_message: null, payload, created_expediente_id: data.data?.id || null };
          }
        } catch (e: any) {
          const message = e.message || "No se pudo crear el expediente";
          issues.push({ rowNumber, fieldId: "expediente", fieldLabel: "Expediente", message });
          results[index] = { rowNumber, status: "failed", reference, error_message: message, payload };
        }
        doneCount += 1;
        setCsvImportProgress({ done: doneCount, total: toProcess.length });
      }));
    }

    setCsvImportProgress(null);
    const summary = buildCsvSummary(csvPreviewRows.length, issues);
    setCsvImportSummary(summary);

    if (csvImportBatchId) {
      try {
        await fetch(`/api/expedientes/imports/${csvImportBatchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            status: summary.successCount > 0 ? "completed" : "failed",
            total_count: summary.totalProcessed,
            completed_count: summary.successCount,
            error_count: summary.errorCount,
            pending_count: 0,
            notes: summary.errorCount > 0
              ? `Importación finalizada: ${summary.successCount} correctos, ${summary.errorCount} con errores.`
              : "Importación completada correctamente.",
          }),
        });
      } catch {}
    }

    const completedCount = results.filter(item => item?.status === "completed").length;
    if (completedCount > 0) {
      fetchExpedientes(true);
      fetchImportHistory(true);
    }

    switchView("csvImportComplete");
  };

  // ── Carga de expedientes ──────────────────────────────────────
  const fetchExpedientes = useCallback(async (silent = false, _retry = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/expedientes?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Backend recien arrancado: si devuelve 401, esperar y reintentar una vez
      if (res.status === 401 && !_retry) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchExpedientes(silent, true);
      }
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

  const fetchImportHistory = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoadingImportHistory(true);
        setImportHistoryError(null);
      }
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/expedientes/imports?limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Error al cargar el historial de importaciones");
      setImportHistory(d.data || []);
    } catch (e: any) {
      if (!silent) setImportHistoryError(e.message || "Error al cargar el historial de importaciones");
    } finally {
      if (!silent) setLoadingImportHistory(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (viewMode === "csvImportHistory") fetchImportHistory();
  }, [viewMode, fetchImportHistory]);

  useEffect(() => {
    if (viewMode === "documentImport") void fetchDocumentImportHistory();
  }, [viewMode, fetchDocumentImportHistory]);

  useEffect(() => {
    if (documentImportActiveBatch?.status !== "processing") return undefined;
    const interval = window.setInterval(() => {
      void fetchDocumentImportBatch(documentImportActiveBatch.id);
      void fetchDocumentImportHistory(true);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [documentImportActiveBatch?.id, documentImportActiveBatch?.status, fetchDocumentImportBatch, fetchDocumentImportHistory]);

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

  // Reset page when filter/sort changes
  useEffect(() => { setCurrentPage(1); }, [filters, sort, dir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

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
      const payload = { ...form, color: form.color || "ninguno" };
      const res = await fetch(isEdit ? `/api/expedientes/${editItem.id}` : "/api/expedientes", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await safeJson(res);
      if (!res.ok) { alert(d.error || "Error al guardar"); return; }
      setShowModal(false); setEditItem(null);
      fetchExpedientes(true);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    const item = expedientes.find(x => x.id === id);
    if (!item) return;
    setExpedientes(prev => prev.filter(x => x.id !== id));
    setDeleteId(null);
    if (selected === id) setSelected(null);
    startDelete(id, item);
  };

  const handleUndoDelete = () => {
    const item = undoDelete();
    if (item) setExpedientes(prev => [...prev, item]);
  };

  // ── Acciones toolbar ──────────────────────────────────────────
  const selectedExp = useMemo(() => expedientes.find(e => e.id === selected), [expedientes, selected]);
  const expedienteAvailableColumnItems = useMemo(
    () => EXPEDIENTE_LIST_COLUMNS.filter((column) => !visibleColumns[column.key]).map((column) => ({ key: column.key, label: column.label })),
    [visibleColumns]
  );
  const expedienteVisibleColumnItems = useMemo(
    () => EXPEDIENTE_LIST_COLUMNS.filter((column) => visibleColumns[column.key]).map((column) => ({ key: column.key, label: column.label })),
    [visibleColumns]
  );
  const moveExpedienteColumnsToVisible = useCallback((keys: string[]) => {
    setVisibleColumns((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key as ExpedienteListColumnKey] = true;
      });
      return next;
    });
  }, []);
  const moveExpedienteColumnsToAvailable = useCallback((keys: string[]) => {
    setVisibleColumns((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key as ExpedienteListColumnKey] = false;
      });
      return next;
    });
  }, []);
  const showAllExpedienteColumns = useCallback(() => {
    setVisibleColumns(EXPEDIENTE_LIST_COLUMNS.reduce((acc, column) => {
      acc[column.key] = true;
      return acc;
    }, {} as Record<ExpedienteListColumnKey, boolean>));
  }, []);
  const moveAllExpedienteColumnsToAvailable = useCallback(() => {
    setVisibleColumns(EXPEDIENTE_LIST_COLUMNS.reduce((acc, column) => {
      acc[column.key] = false;
      return acc;
    }, {} as Record<ExpedienteListColumnKey, boolean>));
  }, []);
  const visibleExpedienteColumnCount = useMemo(
    () => EXPEDIENTE_LIST_COLUMNS.filter((column) => visibleColumns[column.key]).length + 1,
    [visibleColumns]
  );
  const assignExpedienteColor = useCallback(async (color: string) => {
    if (!selectedExp) return;
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${selectedExp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...selectedExp, color }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo asignar el color");
      setExpedientes((prev) => prev.map((item) => (item.id === selectedExp.id ? { ...item, color } : item)));
      setShowOpciones(false);
    } catch (e: any) {
      alert(e?.message || "No se pudo asignar el color");
    }
  }, [getToken, selectedExp]);
  const toggleExpedienteEstado = useCallback(async () => {
    if (!selectedExp) return;
    const newEstado = selectedExp.estado === "cerrado" ? "abierto" : "cerrado";
    // Optimistic update
    setExpedientes((prev) => prev.map((e) => e.id === selectedExp.id ? { ...e, estado: newEstado } : e));
    setShowOpciones(false);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${selectedExp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...selectedExp, estado: newEstado }),
      });
      const d = await safeJson(res);
      if (!res.ok) {
        // Revert on failure
        setExpedientes((prev) => prev.map((e) => e.id === selectedExp.id ? { ...e, estado: selectedExp.estado } : e));
        alert(d.error || "No se pudo cambiar el estado del expediente");
      }
    } catch {
      setExpedientes((prev) => prev.map((e) => e.id === selectedExp.id ? { ...e, estado: selectedExp.estado } : e));
    }
  }, [getToken, selectedExp]);

  const relatedExpedienteIds = useMemo(() => new Set(relatedExpedientes.map((item) => item.id)), [relatedExpedientes]);

  const loadRelatedExpedientes = useCallback(async (expedienteId: string, silent = false) => {
    try {
      if (!silent) setLoadingRelatedExpedientes(true);
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${expedienteId}/related`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los expedientes relacionados");
      setRelatedExpedientes(data.data || []);
    } catch (_e) {
      if (!silent) setRelatedExpedientes([]);
    } finally {
      if (!silent) setLoadingRelatedExpedientes(false);
    }
  }, [getToken]);

  const searchRelacionarExpedientes = useCallback(async (searchValue: string) => {
    if (!selected) return;
    try {
      setRelacionarSearching(true);
      setRelacionarSearchError("");
      const token = await getToken({ skipCache: true });
      const term = searchValue.trim();
      const url = term
        ? `/api/expedientes?limit=100&q=${encodeURIComponent(term)}`
        : "/api/expedientes?limit=25";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron buscar expedientes");
      setRelacionarResults((data.data || []).filter((item: any) => item.id !== selected && !relatedExpedienteIds.has(item.id)));
    } catch (e: any) {
      setRelacionarResults([]);
      setRelacionarSearchError(e?.message || "No se pudieron buscar expedientes");
    } finally {
      setRelacionarSearching(false);
    }
  }, [getToken, relatedExpedienteIds, selected]);

  const openRelacionarModal = useCallback(async () => {
    if (!selected || !selectedExp) return;
    setShowRelacionarModal(true);
    setRelacionarQuery("");
    setRelacionarResults([]);
    setRelacionarHasSearched(true);
    setRelacionarSearchError("");
    setRelacionarAssociateError("");
    await loadRelatedExpedientes(selectedExp.id);
    await searchRelacionarExpedientes("");
  }, [loadRelatedExpedientes, searchRelacionarExpedientes, selected, selectedExp]);

  const handleRelacionarSearchSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = relacionarQuery.trim();
    if (!term) {
      setRelacionarHasSearched(false);
      setRelacionarResults([]);
      return;
    }
    setRelacionarHasSearched(true);
    await searchRelacionarExpedientes(term);
  }, [relacionarQuery, searchRelacionarExpedientes]);

  const associateExpedienteFromList = useCallback(async (relatedId: string) => {
    if (!selected) return;
    try {
      setRelacionarSavingId(relatedId);
      setRelacionarAssociateError("");
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${selected}/related`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ related_expediente_id: relatedId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudo asociar el expediente");
      setShowRelacionarModal(false);
      setRelacionarQuery("");
      setRelacionarResults([]);
      setRelacionarHasSearched(false);
      await loadRelatedExpedientes(selected, true);
    } catch (e: any) {
      setRelacionarAssociateError(e?.message || "No se pudo asociar el expediente");
    } finally {
      setRelacionarSavingId(null);
    }
  }, [getToken, loadRelatedExpedientes, selected]);

  useEffect(() => {
    if (!showRelacionarModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showRelacionarModal]);

  useEffect(() => {
    if (!showRelacionarModal) return;
    if (relacionarDebounceRef.current) clearTimeout(relacionarDebounceRef.current);
    const term = relacionarQuery.trim();
    if (term.length >= 2) {
      relacionarDebounceRef.current = setTimeout(() => {
        setRelacionarHasSearched(true);
        searchRelacionarExpedientes(term);
      }, 380);
    } else if (!term) {
      setRelacionarHasSearched(true);
      searchRelacionarExpedientes("");
    }
    return () => { if (relacionarDebounceRef.current) clearTimeout(relacionarDebounceRef.current); };
  }, [relacionarQuery, showRelacionarModal, searchRelacionarExpedientes]);

  const handleRefresh = async () => {
    setRefreshSpin(true);
    await fetchExpedientes(false);
    setTimeout(() => setRefreshSpin(false), 600);
  };

  const exportTemplates = useMemo(
    () => [DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE, ...customExportTemplates],
    [customExportTemplates]
  );

  const selectedExportTemplate = useMemo(
    () => exportTemplates.find((template) => template.id === selectedExportTemplateId) || DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE,
    [exportTemplates, selectedExportTemplateId]
  );

  const exportPreviewRows = useMemo(() => filtered.slice(0, 12), [filtered]);

  useEffect(() => {
    saveStoredExpedienteExportTemplates(customExportTemplates);
  }, [customExportTemplates]);

  useEffect(() => {
    if (!exportTemplates.some((template) => template.id === selectedExportTemplateId)) {
      setSelectedExportTemplateId(DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE.id);
      setSelectedExportFormat(DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE.format);
    }
  }, [exportTemplates, selectedExportTemplateId]);

  const availableExportFields = useMemo(
    () => EXPEDIENTE_EXPORT_FIELDS.filter((field) => !exportVisibleFields.includes(field.id)),
    [exportVisibleFields]
  );

  useEffect(() => {
    if (!showExportModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showExportModal]);

  const openExportModal = () => {
    setShowExportModal(true);
    setExportError("");
  };

  const openCreateExportTemplate = () => {
    setExportEditorMode("create");
    setExportTemplateName(`Nueva plantilla ${new Date().toLocaleDateString("es-ES")}`);
    setSelectedExportFormat(selectedExportTemplate?.format || "excel");
    setExportVisibleFields(selectedExportTemplate?.fields?.length ? selectedExportTemplate.fields : DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE.fields);
    setExportAvailableSelected([]);
    setExportVisibleSelected([]);
    setExportError("");
    setShowExportTemplateEditor(true);
  };

  const openEditExportTemplate = () => {
    setExportEditorMode("edit");
    setExportTemplateName(selectedExportTemplate.name);
    setSelectedExportFormat(selectedExportTemplate.format);
    setExportVisibleFields(selectedExportTemplate.fields);
    setExportAvailableSelected([]);
    setExportVisibleSelected([]);
    setExportError("");
    setShowExportTemplateEditor(true);
  };

  const moveFieldsToVisible = (fieldIds: string[]) => {
    if (!fieldIds.length) return;
    setExportVisibleFields((prev) => [...prev, ...fieldIds.filter((fieldId) => !prev.includes(fieldId))]);
    setExportAvailableSelected([]);
  };

  const moveFieldsToAvailable = (fieldIds: string[]) => {
    if (!fieldIds.length) return;
    setExportVisibleFields((prev) => prev.filter((fieldId) => !fieldIds.includes(fieldId)));
    setExportVisibleSelected([]);
  };

  const saveExportTemplate = () => {
    const trimmedName = exportTemplateName.trim();
    if (!trimmedName) {
      setExportError("Escribe un nombre para la plantilla.");
      return;
    }
    if (!exportVisibleFields.length) {
      setExportError("Selecciona al menos un campo visible.");
      return;
    }
    if (exportEditorMode === "edit" && selectedExportTemplate.builtIn) {
      const copyId = `template-${Date.now()}`;
      const nextTemplate: ExportTemplate = {
        id: copyId,
        name: trimmedName,
        format: selectedExportFormat,
        fields: exportVisibleFields,
      };
      setCustomExportTemplates((prev) => [nextTemplate, ...prev]);
      setSelectedExportTemplateId(copyId);
    } else if (exportEditorMode === "edit") {
      setCustomExportTemplates((prev) => prev.map((template) => (
        template.id === selectedExportTemplate.id
          ? { ...template, name: trimmedName, format: selectedExportFormat, fields: exportVisibleFields }
          : template
      )));
    } else {
      const nextTemplate: ExportTemplate = {
        id: `template-${Date.now()}`,
        name: trimmedName,
        format: selectedExportFormat,
        fields: exportVisibleFields,
      };
      setCustomExportTemplates((prev) => [nextTemplate, ...prev]);
      setSelectedExportTemplateId(nextTemplate.id);
    }
    setShowExportTemplateEditor(false);
    setExportError("");
  };

  const deleteSelectedTemplate = () => {
    if (selectedExportTemplate.builtIn) return;
    setCustomExportTemplates((prev) => prev.filter((template) => template.id !== selectedExportTemplate.id));
    setSelectedExportTemplateId(DEFAULT_EXPEDIENTE_EXPORT_TEMPLATE.id);
  };

  const runExport = () => {
    const fields = selectedExportTemplate.fields;
    if (!fields.length) {
      setExportError("La plantilla seleccionada no tiene campos configurados.");
      return;
    }
    const resolvedFields = fields
      .map((fieldId) => EXPEDIENTE_EXPORT_FIELDS.find((field) => field.id === fieldId))
      .filter(Boolean) as ExportFieldDef[];
    const headers = resolvedFields.map((field) => field.label);
    const rows = filtered.map((row) => resolvedFields.map((field) => field.getValue(row)));
    const filenameBase = `expedientes_${new Date().toISOString().slice(0, 10)}`;

    if (selectedExportFormat === "xml") {
      const xmlRows = filtered.map((row) => (
        `<expediente>${resolvedFields.map((field) => `<${field.id}>${escapeXml(field.getValue(row))}</${field.id}>`).join("")}</expediente>`
      )).join("");
      downloadTextFile(`<?xml version="1.0" encoding="UTF-8"?><expedientes>${xmlRows}</expedientes>`, `${filenameBase}.xml`, "application/xml;charset=utf-8");
    } else if (selectedExportFormat === "word") {
      const html = buildExcelLikeHtml(headers, rows, "Exportación de expedientes");
      downloadTextFile(html, `${filenameBase}.doc`, "application/msword;charset=utf-8");
    } else {
      const html = buildExcelLikeHtml(headers, rows, "Exportación de expedientes");
      downloadTextFile(html, `${filenameBase}.xls`, "application/vnd.ms-excel;charset=utf-8");
    }

    setShowExportModal(false);
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
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Spinner size="xl" label="Cargando expedientes..." />
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

  if (viewMode === "csvImport") {
    return (
      <CsvImportView
        fileName={csvFileName}
        onBack={() => switchView("list")}
        onOpenHistory={() => switchView("csvImportHistory")}
        onOpenSettings={() => alert("La configuracion de importacion la dejamos preparada para la siguiente fase.")}
        onSelectFile={() => csvInputRef.current?.click()}
        onFileChange={(file) => handleCsvSelected(file)}
        inputRef={csvInputRef}
        clientes={clientes}
        onSaveNew={async (form) => { await handleSave(form); }}
        savingNew={saving}
      />
    );
  }

  if (viewMode === "csvImportConfigure") {
    return (
      <CsvImportConfigureView
        fileName={csvFileName}
        csvHeaders={csvHeaders}
        mappings={csvFieldMappings}
        onBack={() => switchView("csvImport")}
        onContinue={() => switchView("csvImportReview")}
        onOpenHistory={() => switchView("csvImportHistory")}
        onOpenSettings={() => alert("La configuracion avanzada de importacion la dejamos preparada para la siguiente fase.")}
        onSelectFile={() => csvInputRef.current?.click()}
        onChangeMapping={handleCsvMappingChange}
        onFileChange={(file) => handleCsvSelected(file)}
        inputRef={csvInputRef}
      />
    );
  }

  if (viewMode === "csvImportReview") {
    return (
      <CsvImportReviewView
        fileName={csvFileName}
        mappings={csvFieldMappings}
        previewRows={csvPreviewRows}
        validationSummary={validateCsvImport(csvFieldMappings, csvPreviewRows)}
        importProgress={csvImportProgress}
        onBack={() => switchView("csvImportConfigure")}
        onImport={handleImportCsv}
        onOpenHistory={() => switchView("csvImportHistory")}
        onOpenSettings={() => alert("La configuracion avanzada de importacion la dejamos preparada para la siguiente fase.")}
      />
    );
  }

  if (viewMode === "csvImportComplete") {
    return (
      <CsvImportCompleteView
        fileName={csvFileName}
        summary={csvImportSummary}
        onBack={() => switchView("csvImportReview")}
        onViewDetails={() => switchView("csvImportErrorDetail")}
        onRestart={() => switchView("csvImport")}
        onFinish={() => switchView("list")}
      />
    );
  }

  if (viewMode === "csvImportErrorDetail") {
    return (
      <CsvImportErrorDetailView
        fileName={csvFileName}
        batchId={csvImportBatchId}
        summary={csvImportSummary}
        previewRows={csvPreviewRows}
        mappings={csvFieldMappings}
        onBack={() => switchView("csvImportComplete")}
      />
    );
  }

  if (viewMode === "csvImportHistory") {
    return (
      <CsvImportHistoryView
        rows={importHistory}
        loading={loadingImportHistory}
        error={importHistoryError}
        onBack={() => switchView("csvImport")}
        onReload={() => fetchImportHistory()}
      />
    );
  }

  if (viewMode === "documentImport") {
    return (
      <DocumentImportView
        zipFile={documentImportZipFile}
        zipFileName={documentImportZipFileName}
        autoAssignOrganizations={documentImportAutoAssignOrganizations}
        selectedClientId={documentImportAssignedClientId}
        selectedProcurador={documentImportAssignedProcurador}
        clients={clientes}
        importBusy={documentImportSubmitting}
        uploadProgress={documentImportUploadProgress}
        uploadStage={documentImportUploadStage}
        importError={documentImportError}
        activeBatch={documentImportActiveBatch}
        activeItems={documentImportItems}
        history={documentImportHistory}
        loadingHistory={documentImportHistoryLoading}
        historyError={documentImportHistoryError}
        successNotice={documentImportSuccessNotice}
        onBack={() => switchView("list")}
        onToggleAutoAssign={() => {
          setDocumentImportAutoAssignOrganizations((prev) => {
            const next = !prev;
            if (!next) {
              setDocumentImportAssignedClientId("");
              setDocumentImportAssignedProcurador("");
            }
            return next;
          });
        }}
        onChangeClient={setDocumentImportAssignedClientId}
        onChangeProcurador={setDocumentImportAssignedProcurador}
        onSelectFile={() => documentImportInputRef.current?.click()}
        onFileChange={(file) => handleDocumentImportZipSelected(file)}
        onStartImport={handleStartDocumentImport}
        onReloadHistory={() => fetchDocumentImportHistory()}
        onVerifyItem={openDocumentImportVerify}
        onDeleteBatch={handleDeleteBatch}
        onReviewBatch={handleReviewBatch}
        inputRef={documentImportInputRef}
      />
    );
  }

  if (viewMode === "documentImportVerify" && documentImportVerifyItem) {
    return (
      <DocumentImportVerifyView
        item={documentImportVerifyItem}
        clients={clientes}
        form={documentImportVerifyForm}
        representaA={documentImportRepresentaA}
        saving={documentImportVerifySaving}
        error={documentImportVerifyError}
        onBack={() => {
          setDocumentImportVerifyError(null);
          setViewMode("documentImport");
        }}
        onChange={(key, value) => setDocumentImportVerifyForm((prev) => ({ ...prev, [key]: value }))}
        onChangeRepresentaA={(value) => {
          setDocumentImportRepresentaA(value);
        }}
        onAccept={handleAcceptDocumentImportItem}
      />
    );
  }

  // ── Render principal ──────────────────────────────────────────
  return (
    <>
      {/* ── Modal Adjuntos ──────────────────────────────────── */}
      {showAdjuntos && selected && (
        <AdjuntosModal
          entityId={selected}
          autoOpenAfterAttach={false}
          entityName={selectedExp ? `${selectedExp.ref_expediente || selectedExp.ref_propia || "Exp."} — ${selectedExp.descripcion || ""}` : "Expediente"}
          onClose={() => setShowAdjuntos(false)}
        />
      )}

      <ColumnVisibilityModal
        open={showColumnModal}
        title="Modificar columnas del listado"
        sourceLabel="Expedientes"
        targetLabel="Columnas visibles"
        availableItems={expedienteAvailableColumnItems}
        visibleItems={expedienteVisibleColumnItems}
        onMoveToVisible={moveExpedienteColumnsToVisible}
        onMoveToAvailable={moveExpedienteColumnsToAvailable}
        onMoveAllToVisible={showAllExpedienteColumns}
        onMoveAllToAvailable={moveAllExpedienteColumnsToAvailable}
        onClose={() => setShowColumnModal(false)}
      />

      {showRelacionarModal && selectedExp && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-transparent px-4"
          onClick={() => setShowRelacionarModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Relacionar expediente</p>
                <h3 className="text-lg font-bold text-slate-900">
                  Asociar expedientes a {selectedExp.ref_expediente || `${selectedExp.anio}/${selectedExp.num_exp}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRelacionarModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleRelacionarSearchSubmit} className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    value={relacionarQuery}
                    onChange={(e) => setRelacionarQuery(e.target.value)}
                    placeholder="Buscar por referencia, descripción, NIG, juzgado..."
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-colors focus:border-slate-300 focus:bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!relacionarQuery.trim() || relacionarSearching}
                  className="inline-flex items-center gap-2 px-4 py-3 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {relacionarSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Buscar
                </button>
              </form>

              {relacionarSearchError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {relacionarSearchError}
                </div>
              )}

              {relacionarAssociateError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {relacionarAssociateError}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                {!relacionarHasSearched ? (
                  <div className="flex flex-col items-center justify-center px-6 py-12 bg-slate-50/60 text-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                      <Search size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Busca un expediente</p>
                      <p className="mt-0.5 text-xs text-slate-400">Escribe la referencia, descripción, NIG o juzgado</p>
                    </div>
                  </div>
                ) : relacionarSearching || loadingRelatedExpedientes ? (
                  <div className="flex items-center justify-center gap-2.5 px-5 py-12 bg-slate-50/60 text-sm text-slate-400">
                    <Loader2 size={16} className="animate-spin" />
                    Buscando expedientes...
                  </div>
                ) : relacionarResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-12 bg-slate-50/60 text-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                      <AlertCircle size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Sin resultados</p>
                      <p className="mt-0.5 text-xs text-slate-400">Prueba con otra búsqueda o revisa si ya están relacionados.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        {relacionarResults.length} {relacionarResults.length === 1 ? "expediente encontrado" : "expedientes encontrados"}
                      </span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                      {relacionarResults.map((item) => {
                        const ref = item.ref_expediente || `${item.anio}/${item.num_exp}`;
                        const tipoConf = TIPOS[item.tipo] || TIPOS.otro;
                        const estadoConf = ESTADOS[item.estado] || ESTADOS.abierto;
                        const meta = [item.cliente_nombre, item.juzgado, item.tipo_proc].filter(Boolean).join(" · ");
                        return (
                          <div key={item.id} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-blue-50/40 transition-colors bg-white">
                            <div className="shrink-0 h-9 w-9 rounded-xl bg-slate-100 group-hover:bg-white group-hover:border group-hover:border-slate-200 flex items-center justify-center text-slate-400 transition-all">
                              <Scale size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                                  {ref}
                                </span>
                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase ${tipoConf.color}`}>
                                  {tipoConf.short}
                                </span>
                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase ${estadoConf.color}`}>
                                  {estadoConf.label}
                                </span>
                              </div>
                              {item.descripcion && (
                                <p className="mt-1 text-sm font-semibold text-slate-800 truncate">{item.descripcion}</p>
                              )}
                              {meta && (
                                <p className="mt-0.5 text-[11px] text-slate-400 truncate">{meta}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => associateExpedienteFromList(item.id)}
                              disabled={relacionarSavingId === item.id}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                            >
                              {relacionarSavingId === item.id ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                              Asociar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showExportModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-overlay-in" onClick={() => setShowExportModal(false)}>
          <div className="flex h-[92vh] w-full max-w-[95vw] flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-modal-in" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 flex-shrink-0 bg-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 mb-0.5">Exportar expedientes</p>
                <h3 className="text-xl font-bold text-slate-800">Plantillas de exportación</h3>
              </div>
              <button type="button" onClick={() => setShowExportModal(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors shadow-sm">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* Left sidebar: plantilla selector */}
              <div className="w-72 border-r border-slate-200 bg-white p-6 flex flex-col gap-6 flex-shrink-0 shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Selecciona una plantilla de exportación o configura una nueva con los campos que quieras exportar.
                </p>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Plantilla</span>
                  <div className="space-y-2">
                    {exportTemplates.map((template) => {
                      const active = selectedExportTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => { setSelectedExportTemplateId(template.id); setSelectedExportFormat(template.format); }}
                          className={`w-full p-4 rounded-xl border text-left transition-all ${active ? "bg-gradient-to-r from-lime-100 to-lime-50 border-lime-300 shadow-sm" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-sm text-slate-800">{template.name}</p>
                              <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mt-0.5">{template.format}</p>
                            </div>
                            {active && <CheckCircle2 size={16} className="text-red-500 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right area */}
              <div className="flex-1 flex flex-col p-6 bg-[#f8fafc] gap-6 min-w-0 overflow-y-auto">

                {/* Top: format cards + action buttons */}
                <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-4 flex-shrink-0">
                  <div className="flex flex-wrap items-center gap-4">
                    {(["excel", "xml", "word"] as ExportFormat[]).map((format) => {
                      const meta = exportFormatMeta(format);
                      const Icon = meta.icon;
                      const active = selectedExportFormat === format;
                      return (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setSelectedExportFormat(format)}
                          className={`relative flex items-start gap-3 p-3.5 rounded-xl text-left transition-all w-[220px] shadow-sm hover:shadow-md ${active ? `border-2 ${meta.activeBorder} ${meta.activeBg}` : `border border-slate-200 bg-white hover:bg-slate-50`}`}
                        >
                          <Icon size={20} className={`mt-0.5 shrink-0 ${meta.iconColor}`} />
                          <div className="flex-1 pr-5">
                            <p className={`font-bold text-sm block ${meta.labelColor}`}>{meta.label}</p>
                            <p className="text-[10px] text-slate-500 leading-tight block mt-1">{meta.description}</p>
                          </div>
                          {active && <CheckCircle2 size={15} className="text-red-500 absolute top-3 right-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={openCreateExportTemplate} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">Alta</button>
                    <button type="button" onClick={deleteSelectedTemplate} disabled={selectedExportTemplate.builtIn} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">Baja</button>
                    <button type="button" onClick={openEditExportTemplate} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">Modificar</button>
                    <button type="button" onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm ml-2">Cancelar</button>
                    <button type="button" onClick={runExport} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors">
                      <Download size={13} /> Exportar
                    </button>
                  </div>
                </div>

                {/* Bottom: campos + vista previa */}
                <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">

                  {/* Campos a exportar */}
                  <div className="w-full xl:w-[280px] bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden flex-shrink-0">
                    <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Campos a exportar</span>
                      <span className="px-3 py-1 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">{selectedExportTemplate.fields.length} columnas</span>
                    </div>
                    <div className="flex-1 overflow-y-auto py-2">
                      {selectedExportTemplate.fields.map((fieldId) => (
                        <div key={fieldId} className="px-5 py-1.5 text-[13px] text-slate-700">{getExportFieldLabel(fieldId)}</div>
                      ))}
                    </div>
                  </div>

                  {/* Vista previa */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden min-w-0">
                    <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0 bg-white shadow-sm">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Vista previa</span>
                      <span className="px-3 py-1 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">{exportPreviewRows.length} filas</span>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <table className="border-collapse text-[11px] text-slate-700 w-max min-w-full">
                        <thead className="sticky top-0 z-20">
                          <tr className="bg-slate-50">
                            <th className="w-12 border border-slate-200 bg-slate-50 px-2 py-2 text-center font-bold text-slate-400" />
                            {selectedExportTemplate.fields.map((fieldId, index) => (
                              <th key={`${fieldId}-letter`} className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-500">
                                {toExcelColumnLabel(index)}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            <th className="w-12 border border-slate-200 bg-slate-100 px-2 py-2 text-center font-bold text-slate-500 sticky top-[37px] z-10">1</th>
                            {selectedExportTemplate.fields.map((fieldId) => (
                              <th key={fieldId} className="whitespace-nowrap border border-slate-200 bg-[#dbe5f1] px-3 py-2 text-center font-semibold text-slate-700 sticky top-[37px] z-10">
                                {getExportFieldLabel(fieldId)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {exportPreviewRows.map((row, rowIndex) => (
                            <tr key={row.id} className={rowIndex % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-[#fbfcfe] hover:bg-slate-50"}>
                              <td className="w-12 border border-slate-200 bg-slate-50 px-2 py-2 text-center font-medium text-slate-500 sticky left-0 z-10">{rowIndex + 2}</td>
                              {selectedExportTemplate.fields.map((fieldId) => {
                                const field = EXPEDIENTE_EXPORT_FIELDS.find((item) => item.id === fieldId);
                                return (
                                  <td key={`${row.id}-${fieldId}`} className="border border-slate-200 px-3 py-2 whitespace-nowrap">
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

                {exportError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex-shrink-0">
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
        <div className="fixed inset-0 z-[126] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-overlay-in" onClick={() => setShowExportTemplateEditor(false)}>
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-bold text-slate-800">{exportEditorMode === "create" ? "Nueva plantilla de exportación" : "Modificar plantilla de exportación"}</h3>
              <button type="button" onClick={() => setShowExportTemplateEditor(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors shadow-sm">
                <X size={14} />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_64px_1fr]">
                {/* Campos disponibles */}
                <div className="flex flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Campos disponibles</span>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide select-none">
                      Expedientes
                    </span>
                  </div>
                  <div className="h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {availableExportFields.map((field) => (
                      <label key={field.id} className="flex cursor-pointer items-center gap-2.5 px-4 py-2 transition-colors hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded border-slate-300 text-red-600"
                          checked={exportAvailableSelected.includes(field.id)}
                          onChange={(e) => setExportAvailableSelected((prev) => e.target.checked ? [...prev, field.id] : prev.filter((id) => id !== field.id))}
                        />
                        <span className="text-sm text-slate-700">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Botones de movimiento */}
                <div className="flex flex-col items-center justify-center gap-2.5">
                  <button type="button" onClick={() => moveFieldsToVisible(exportAvailableSelected)} className="w-10 h-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:shadow-sm transition-all flex items-center justify-center"><ArrowRight size={16} /></button>
                  <button type="button" onClick={() => moveFieldsToAvailable(exportVisibleSelected)} className="w-10 h-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:shadow-sm transition-all flex items-center justify-center"><ArrowLeft size={16} /></button>
                  <button type="button" onClick={() => moveFieldsToVisible(availableExportFields.map((f) => f.id))} className="w-10 h-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:shadow-sm transition-all flex items-center justify-center"><ChevronsRight size={16} /></button>
                  <button type="button" onClick={() => moveFieldsToAvailable([...exportVisibleFields])} className="w-10 h-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:shadow-sm transition-all flex items-center justify-center"><ChevronsLeft size={16} /></button>
                </div>

                {/* Campos visibles */}
                <div className="flex flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Campos visibles</span>
                    <div className="relative">
                      <button
                        ref={formatDropdownBtnRef}
                        type="button"
                        onClick={() => {
                          if (formatDropdownBtnRef.current) {
                            const r = formatDropdownBtnRef.current.getBoundingClientRect();
                            setFormatDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
                          }
                          setShowFormatDropdown(v => !v);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors min-w-[80px] justify-between shadow-sm ${showFormatDropdown ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                      >
                        <span>{selectedExportFormat === "excel" ? "Excel" : selectedExportFormat === "xml" ? "XML" : "Word"}</span>
                        <ChevronDown size={11} className="text-slate-400 shrink-0" />
                      </button>
                      {showFormatDropdown && typeof document !== "undefined" && createPortal(
                        <div
                          ref={formatDropdownMenuRef}
                          style={{ position: "fixed", top: formatDropdownPos.top, left: formatDropdownPos.left, minWidth: formatDropdownPos.width, zIndex: 9999 }}
                          className="rounded-xl border border-slate-200 bg-white shadow-xl py-1"
                        >
                          {(["excel", "xml", "word"] as ExportFormat[]).map((fmt) => (
                            <button
                              key={fmt}
                              type="button"
                              onClick={() => { setSelectedExportFormat(fmt); setShowFormatDropdown(false); }}
                              className={`w-full flex items-center gap-2 px-3.5 py-2 text-left text-xs font-medium transition-colors ${selectedExportFormat === fmt ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                            >
                              {fmt === "excel" ? "Excel" : fmt === "xml" ? "XML" : "Word"}
                            </button>
                          ))}
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>
                  <div className="h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {exportVisibleFields.map((fieldId) => (
                      <label key={fieldId} className="flex cursor-pointer items-center gap-2.5 px-4 py-2 transition-colors hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded border-slate-300 text-red-600"
                          checked={exportVisibleSelected.includes(fieldId)}
                          onChange={(e) => setExportVisibleSelected((prev) => e.target.checked ? [...prev, fieldId] : prev.filter((id) => id !== fieldId))}
                        />
                        <span className="text-sm text-slate-700">{getExportFieldLabel(fieldId)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Nombre de la plantilla</label>
                <input
                  value={exportTemplateName}
                  onChange={(e) => setExportTemplateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
                  placeholder="Ej. Listado actual"
                />
              </div>

              {exportError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {exportError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowExportTemplateEditor(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                <button type="button" onClick={saveExportTemplate} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors shadow-sm">Guardar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
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

      {/* ── Modal configurar numeración ─────────────────────── */}
      {showCounterModal && (
        <CounterConfigModal onClose={() => setShowCounterModal(false)} getToken={() => getToken({ skipCache: true })} />
      )}

      {/* ── Confirmar borrado ───────────────────────────────── */}
      {deleteId && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar expediente?</h3>
                <p className="text-xs text-slate-500 mt-1">Tendrás 15 segundos para deshacer la eliminación.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Eliminar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Undo toast ──────────────────────────────────────── */}
      {pendingDelete && (
        <UndoToast
          message="Expediente eliminado"
          startedAt={pendingDelete.startedAt}
          onUndo={handleUndoDelete}
          onDismiss={dismissDelete}
        />
      )}

      <div className="flex flex-col h-full animate-in fade-in duration-300">

        {/* ── Cabecera ──────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <FolderOpen size={20} className="text-red-600" />
            <h1 className="text-xl font-bold text-slate-800">Gestión de Expedientes</h1>
          </div>
          <button onClick={() => fetchExpedientes(true)} title="Refrescar"
            className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
            <RefreshCw size={14} className={refreshSpin ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="bg-white flex flex-col overflow-hidden flex-1 min-h-0">

          {/* ── Toolbar 1: Acciones ──────────────────────────── */}
          <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center flex-shrink-0 z-10 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-max pb-0.5">

              {/* Alta */}
              <div ref={altaMenuRef}>
                <button
                  onClick={() => {
                    if (altaMenuRef.current) {
                      const r = altaMenuRef.current.getBoundingClientRect();
                      setAltaMenuPos({ top: r.bottom + 8, left: r.left });
                    }
                    setShowAltaMenu(v => !v);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors shadow-sm">
                  <Plus size={12} /> Alta <ChevronDown size={10} />
                </button>
              </div>
              {showAltaMenu && typeof document !== "undefined" && createPortal(
                <div data-alta-menu style={{ position: "fixed", top: altaMenuPos.top, left: altaMenuPos.left, zIndex: 9999 }}
                  className="w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-slate-600">Elige cómo quieres agregar expedientes</p>
                  </div>
                  <div className="p-1">
                    <AltaOption icon={Plus} title="Crear manualmente" description="Crea un expediente desde cero introduciendo los datos" iconClassName="bg-green-100 text-green-600" onClick={openManualCreate} />
                    <AltaOption icon={FileSpreadsheet} title="Importar desde CSV" description="Sube un archivo CSV con múltiples expedientes" iconClassName="bg-blue-100 text-blue-600" onClick={openCsvImport} />
                    <AltaOption icon={ClipboardList} title="Desde documentos" description="Procesa documentos para crear expedientes" iconClassName="bg-amber-100 text-amber-700" onClick={openDocumentImport} />
                  </div>
                </div>,
                document.body
              )}

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Baja, Modificar */}
              <ToolBtn icon={Trash2} label="Baja" danger disabled={!selected} onClick={() => selected && setDeleteId(selected)} />
              <ToolBtn icon={Edit3} label="Modificar" disabled={!selected || selectedExp?.estado === "cerrado"} onClick={() => selected && selectedExp?.estado !== "cerrado" && navigate(`/dashboard/expedientes/${selected}?edit=1`)} />

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Correo, WhatsApp */}
              <DropdownToolBtn icon={Mail} label="Enviar Correo" disabled={!selected} items={[
                { label: "Nuevo", icon: Mail, onClick: () => { if (!selectedExp) return; const params = new URLSearchParams({ compose: '1', subject: `Expediente ${selectedExp.anio}/${selectedExp.num_exp} - ${selectedExp.descripcion || ''}`, ...(selectedExp.cliente_email ? { to: selectedExp.cliente_email } : {}), expediente_id: selectedExp.id }); navigate(`/dashboard/correo?${params.toString()}`); } },
                { label: "Con Plantilla", icon: FileText, onClick: () => { if (!selectedExp) return; const params = new URLSearchParams({ compose: '1', subject: `Expediente ${selectedExp.anio}/${selectedExp.num_exp} - ${selectedExp.descripcion || ''}`, ...(selectedExp.cliente_email ? { to: selectedExp.cliente_email } : {}), expediente_id: selectedExp.id, open_templates: '1' }); navigate(`/dashboard/correo?${params.toString()}`); } },
                { divider: true, label: '' },
                { label: "Con Adjuntos", icon: Paperclip, children: [
                  { label: "Nuevo", icon: Mail, onClick: () => { if (!selectedExp) return; const params = new URLSearchParams({ compose: '1', subject: `Expediente ${selectedExp.anio}/${selectedExp.num_exp} - ${selectedExp.descripcion || ''} (con adjuntos)`, ...(selectedExp.cliente_email ? { to: selectedExp.cliente_email } : {}), expediente_id: selectedExp.id, open_attachments: '1' }); navigate(`/dashboard/correo?${params.toString()}`); } },
                  { label: "Con Plantilla", icon: FileText, onClick: () => { if (!selectedExp) return; const params = new URLSearchParams({ compose: '1', subject: `Expediente ${selectedExp.anio}/${selectedExp.num_exp} - ${selectedExp.descripcion || ''}`, ...(selectedExp.cliente_email ? { to: selectedExp.cliente_email } : {}), expediente_id: selectedExp.id, open_templates: '1', open_attachments: '1' }); navigate(`/dashboard/correo?${params.toString()}`); } },
                ]},
                { divider: true, label: '' },
                { label: "MN Sign", icon: Pencil, onClick: () => selected && navigate(`/dashboard/expedientes/${selected}#firma`) },
              ]} />
              <DropdownToolBtn icon={MessageCircle} label="Enviar WhatsApp" disabled={!selectedExp?.cliente_id} items={[
                { label: "Nuevo", icon: MessageCircle, onClick: () => { if (!selectedExp?.cliente_id) return; navigate(`/dashboard/whatsapp?clientId=${selectedExp.cliente_id}&mode=new`); } },
                { label: "Con Plantilla", icon: FileSpreadsheet, onClick: () => { if (!selectedExp?.cliente_id) return; navigate(`/dashboard/whatsapp?clientId=${selectedExp.cliente_id}&mode=template`); } },
                { label: "Programar WhatsApp", icon: Bell, onClick: () => { if (!selectedExp?.cliente_id) return; navigate(`/dashboard/whatsapp?clientId=${selectedExp.cliente_id}&mode=schedule`); } },
                { label: "Sign", icon: Pencil, onClick: () => selected && navigate(`/dashboard/expedientes/${selected}#firma`) },
                { label: "Ver Conversación", icon: ExternalLink, onClick: () => { if (!selectedExp?.cliente_id) return; navigate(`/dashboard/whatsapp?clientId=${selectedExp.cliente_id}&mode=thread`); } },
              ]} />

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Sign, Tareas, Asociar, Adjuntos */}
              <ToolBtn icon={PenLine} label="Sign" disabled={!selected} onClick={() => selected && navigate(`/dashboard/expedientes/${selected}#firma`)} />
              <DropdownToolBtn icon={ClipboardList} label="Tareas" disabled={!selected || selectedExp?.estado === "cerrado"} items={[
                { label: "Nueva actuación", icon: Activity, onClick: () => selected && navigate(`/dashboard/expedientes/${selected}?tab=actuacion&newActuacion=1`) },
                { label: "Crear obligaciones", icon: ClipboardList, onClick: () => selected && navigate(`/dashboard/expedientes/${selected}?tab=tareas&newTarea=1&type=plazo_procesal`) },
              ]} />
              <ToolBtn icon={GitMerge} label="Asociar" disabled={!selectedExp} onClick={openRelacionarModal} />
              <ToolBtn icon={Paperclip} label="Adjuntos" disabled={!selected || selectedExp?.estado === "cerrado"} onClick={() => selected && selectedExp?.estado !== "cerrado" && setShowAdjuntos(true)} />

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Excel, Imprimir, Informes */}
              <ToolBtn icon={FileSpreadsheet} label="Excel" onClick={openExportModal} />
              <ToolBtn icon={Printer} label="Imprimir" onClick={() => window.print()} />
              <ToolBtn icon={BarChart2} label="Informes" onClick={() => navigate("/dashboard")} />

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Atajos, Opciones */}
              <AtajosButton modulo="Expedientes" />
              <div className="relative" ref={opcionesRef}>
                <button
                  ref={opcionesBtnRef}
                  onClick={() => {
                    if (opcionesBtnRef.current) {
                      const r = opcionesBtnRef.current.getBoundingClientRect();
                      setOpcionesMenuPos({ top: r.bottom + 4, left: r.right - 230 });
                    }
                    setShowOpciones(v => !v);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border shadow-sm ${showOpciones ? "bg-red-50 border-red-300 text-red-700" : "text-slate-600 hover:bg-slate-100 border-slate-200 bg-white"}`}>
                  <MoreHorizontal size={13} /> Opciones <ChevronDown size={10} />
                </button>
                {showOpciones && typeof document !== "undefined" && createPortal(
                  <div style={{ position: "fixed", top: opcionesMenuPos.top, left: opcionesMenuPos.left, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-xl min-w-[230px] py-1 overflow-visible">
                    <button onClick={() => alert("Seleccionar opciones favoritas")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      <Star size={13} className="text-slate-400 shrink-0" /> Seleccionar Opciones Favoritas
                    </button>
                    <button type="button" onClick={() => { setShowColumnModal(true); setShowOpciones(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
                      <span className="flex items-center gap-2.5"><LayoutList size={13} className="text-slate-400 shrink-0" /> Elegir columnas</span>
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                    <div className="relative group/sub">
                      <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                        <span className="flex items-center gap-2.5"><ExternalLink size={13} className="text-slate-400 shrink-0" /> Ir a</span>
                        <ChevronRight size={11} className="text-slate-300" />
                      </button>
                      <div className="absolute right-full -mr-px top-[-1px] z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[180px] py-1 hidden group-hover/sub:block">
                        <button onClick={() => selectedExp?.cliente_id && navigate(`/dashboard/clientes/${selectedExp.cliente_id}`)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Users size={13} className="text-slate-400 shrink-0" /> Ir a Cliente</button>
                        <button onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><FolderOpen size={13} className="text-slate-400 shrink-0" /> Ir a Expediente</button>
                        <button onClick={() => alert("Ir a Juzgado")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><ClipboardList size={13} className="text-slate-400 shrink-0" /> Ir a Juzgado</button>
                      </div>
                    </div>
                    <div className="relative group/color">
                      <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                        <span className="flex items-center gap-2.5"><Palette size={13} className="text-slate-400 shrink-0" /> Asignar Color</span>
                        <ChevronRight size={11} className="text-slate-300" />
                      </button>
                      <div className="absolute right-full -mr-px top-[-1px] z-50 hidden min-w-[190px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl group-hover/color:block">
                        {[
                          { value: "ninguno", label: "Sin color", dot: "bg-slate-300" },
                          { value: "azul",    label: "Azul suave",    dot: "bg-sky-400" },
                          { value: "verde",   label: "Verde suave",   dot: "bg-emerald-400" },
                          { value: "amarillo",label: "Amarillo suave",dot: "bg-amber-400" },
                          { value: "naranja", label: "Naranja suave", dot: "bg-orange-400" },
                          { value: "rojo",    label: "Rojo suave",    dot: "bg-rose-400" },
                          { value: "morado",  label: "Morado suave",  dot: "bg-violet-400" },
                        ].map((option) => (
                          <button key={option.value} type="button" onClick={() => assignExpedienteColor(option.value)}
                            className="flex w-full items-center justify-between gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50">
                            <span className="flex items-center gap-2.5"><span className={`h-2.5 w-2.5 rounded-full ${option.dot}`} />{option.label}</span>
                            {selectedExp?.color === option.value && <Check size={11} className="text-red-500" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-px bg-slate-100 my-1" />
                    <button disabled={!selectedExp} onClick={toggleExpedienteEstado}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {selectedExp?.estado === "cerrado"
                        ? <><Unlock size={13} className="text-slate-400 shrink-0" /> Reabrir expediente</>
                        : <><Lock size={13} className="text-slate-400 shrink-0" /> Cerrar expediente</>}
                    </button>
                    <button onClick={() => alert("Alta Acción")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Zap size={13} className="text-slate-400 shrink-0" /> Alta Acción</button>
                    <button onClick={() => alert("Crear Recall")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Bell size={13} className="text-slate-400 shrink-0" /> Crear Recall</button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button onClick={() => { setShowCounterModal(true); setShowOpciones(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Hash size={13} className="text-slate-400 shrink-0" /> Configurar numeración</button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button onClick={() => alert("Duplicar expediente")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Copy size={13} className="text-slate-400 shrink-0" /> Duplicar</button>
                    <button onClick={() => alert("Fusionar expedientes")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><GitMerge size={13} className="text-slate-400 shrink-0" /> Fusionar</button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button onClick={() => selectedExp && window.open(`https://wa.me/?text=Expediente ${selectedExp.anio}/${selectedExp.num_exp}`, "_blank")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Smartphone size={13} className="text-slate-400 shrink-0" /> Enviar SMS</button>
                    <div className="relative group/ver">
                      <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                        <span className="flex items-center gap-2.5"><History size={13} className="text-slate-400 shrink-0" /> Versión Antigua</span>
                        <ChevronRight size={11} className="text-slate-300" />
                      </button>
                      <div className="absolute right-full -mr-px top-[-1px] z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[180px] py-1 hidden group-hover/ver:block">
                        <button onClick={() => alert("Restaurar versión anterior")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><History size={13} className="text-slate-400 shrink-0" /> Ver historial versiones</button>
                        <button onClick={() => alert("Comparar con versión")} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"><RefreshCw size={13} className="text-slate-400 shrink-0" /> Comparar versión</button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>

            </div>
          </div>

          {/* ── Toolbar 2: Filtros y Vistas ──────────────────── */}
          <div className="px-6 py-2.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 z-10">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              {filters.map((filter, idx) => (
                <FilterRow
                  key={filter.id}
                  filter={filter}
                  onChange={updateFilter}
                  onRemove={removeFilter}
                  canRemove={filters.length > 1}
                  inputRef={idx === 0 ? firstInputRef : undefined}
                />
              ))}
              <button onClick={addFilter} title="Añadir filtro"
                className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 shadow-sm transition-colors">
                <Plus size={13} />
              </button>
              <button onClick={clearAllFilters} title="Limpiar filtros"
                className={`flex items-center justify-center w-7 h-7 rounded-md border bg-white shadow-sm transition-colors ${hasActiveFilters || filters.length > 1 ? "border-red-300 text-red-500 hover:bg-red-50" : "border-slate-200 text-slate-300"}`}>
                <ListFilter size={12} />
              </button>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                {filtered.length !== expedientes.length
                  ? <span className="text-amber-600 font-medium">{filtered.length} de {expedientes.length}</span>
                  : <>{expedientes.length} {expedientes.length === 1 ? "registro" : "registros"}</>}
              </span>
              <div className="flex items-center bg-white rounded-md border border-slate-200 shadow-sm p-0.5">
                <button onClick={() => switchView("list")} title="Vista listado"
                  className={`px-2 py-1 rounded transition-all ${viewMode === "list" ? "bg-red-50 text-red-600 border border-red-100" : "text-slate-400 hover:text-slate-600"}`}>
                  <AlignJustify size={12} />
                </button>
                <button onClick={() => switchView("detail")} title="Vista detalle"
                  className={`px-2 py-1 transition-all ${viewMode === "detail" ? "text-red-600 bg-red-50" : "text-slate-400 hover:text-slate-600"}`}>
                  <LayoutList size={12} />
                </button>
                <button onClick={() => switchView("multiselect")} title="Selección múltiple"
                  className={`px-2 py-1 transition-all ${viewMode === "multiselect" ? "text-red-600 bg-red-50" : "text-slate-400 hover:text-slate-600"}`}>
                  <ListChecks size={12} />
                </button>
              </div>
              <button onClick={handleRefresh} title="Refrescar datos"
                className="p-1.5 border border-slate-200 rounded-md text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all bg-white shadow-sm w-8 h-8 flex items-center justify-center">
                <RefreshCw size={13} className={refreshSpin ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              VISTA LISTA — tabla densa compacta
          ══════════════════════════════════════════════════ */}
          {viewMode === "list" && (
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  {visibleColumns.anio && <Th label="Año"                    sk="anio"          sort={sort} dir={dir} onSort={handleSort} className="w-14 pl-4" />}
                  {visibleColumns.num_exp && <Th label="Núm. Exp"               sk="num_exp"        sort={sort} dir={dir} onSort={handleSort} className="w-16" />}
                  {visibleColumns.ref_propia && <Th label="Ref. Propia"                                 sort={sort} dir={dir} onSort={handleSort} className="w-24" />}
                  {visibleColumns.descripcion && <Th label="Descripción Expediente" sk="descripcion"    sort={sort} dir={dir} onSort={handleSort} className="min-w-[180px]" />}
                  {visibleColumns.tipo && <Th label="Tipo de Expediente"     sk="tipo"           sort={sort} dir={dir} onSort={handleSort} className="w-40" />}
                  {visibleColumns.cliente_nombre && <Th label="Cliente"                sk="cliente_nombre" sort={sort} dir={dir} onSort={handleSort} className="w-36" />}
                  {visibleColumns.contrario && <Th label="Contrario"              sk="contrario"      sort={sort} dir={dir} onSort={handleSort} className="w-36" />}
                  {visibleColumns.procurador && <Th label="Procurador Propio"                          sort={sort} dir={dir} onSort={handleSort} className="w-32" />}
                  {visibleColumns.juzgado && <Th label="Juzgado Principal"      sk="juzgado"        sort={sort} dir={dir} onSort={handleSort} className="w-44" />}
                  {visibleColumns.tipo_proc && <Th label="Tipo Procedimiento"                         sort={sort} dir={dir} onSort={handleSort} className="w-28" />}
                  {visibleColumns.num_autos && <Th label="Núm. Autos"                                 sort={sort} dir={dir} onSort={handleSort} className="w-24" />}
                  {visibleColumns.nig && <Th label="NIG"                                        sort={sort} dir={dir} onSort={handleSort} className="w-28" />}
                  {visibleColumns.estado && <Th label="Estado"                 sk="estado"         sort={sort} dir={dir} onSort={handleSort} className="w-24" />}
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={visibleExpedienteColumnCount} className="py-20 text-center">
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
                  const colorStyle = EXPEDIENTE_ROW_COLOR_STYLES[exp.color || "ninguno"] || EXPEDIENTE_ROW_COLOR_STYLES.ninguno;
                  return (
                    <tr
                      key={exp.id}
                      onClick={() => setSelected(isSel ? null : exp.id)}
                      onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors group
                        ${isSel ? colorStyle.rowSelected : colorStyle.row}`}
                    >
                      {/* Año */}
                      {visibleColumns.anio && <td className={`pl-4 pr-3 py-3 font-mono relative ${isSel ? colorStyle.yearSelected : colorStyle.year}`}>
                        {exp.estado === "cerrado" && (
                          <span className="absolute top-0 left-0 w-4 h-4 bg-amber-500" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} title="Expediente cerrado" />
                        )}
                        {exp.anio}
                      </td>}

                      {/* Núm */}
                      {visibleColumns.num_exp && <td className="px-3 py-3">
                        <span className={`font-extrabold text-base ${isSel ? colorStyle.numberSelected : colorStyle.number}`}>{exp.num_exp}</span>
                      </td>}

                      {/* Ref */}
                      {visibleColumns.ref_propia && <td className="px-3 py-3 font-mono text-slate-400">
                        {exp.ref_propia || <span className="text-slate-200">—</span>}
                      </td>}

                      {/* Descripción */}
                      {visibleColumns.descripcion && <td className="px-3 py-3">
                        <span className={`font-semibold truncate block max-w-[220px] ${isSel ? colorStyle.descriptionSelected : "text-slate-800"}`}>
                          {exp.descripcion || <span className="text-slate-300 font-normal">Sin descripción</span>}
                        </span>
                      </td>}

                      {/* Tipo */}
                      {visibleColumns.tipo && <td className="px-3 py-3 text-xs text-slate-600 uppercase whitespace-nowrap font-medium">
                        {tipoConf.label}
                      </td>}

                      {/* Cliente */}
                      {visibleColumns.cliente_nombre && <td className="px-3 py-3">
                        {exp.cliente_id ? (
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/dashboard/clientes/${exp.cliente_id}`); }}
                            className="appearance-none p-0 leading-normal text-blue-600 hover:text-blue-800 hover:underline font-semibold text-left truncate block max-w-[130px]">
                            {exp.cliente_nombre || "Ver"}
                          </button>
                        ) : (
                          <span className="text-slate-400 truncate block max-w-[130px]">
                            {exp.cliente_nombre || <span className="text-slate-200">—</span>}
                          </span>
                        )}
                      </td>}

                      {/* Contrario */}
                      {visibleColumns.contrario && <td className="px-3 py-3 text-slate-500 truncate max-w-[130px]">
                        {exp.contrario || <span className="text-slate-200">—</span>}
                      </td>}

                      {/* Procurador */}
                      {visibleColumns.procurador && <td className="px-3 py-3 text-slate-400 truncate max-w-[120px]">
                        {exp.procurador || <span className="text-slate-200">—</span>}
                      </td>}

                      {/* Juzgado */}
                      {visibleColumns.juzgado && <td className="px-3 py-3 text-slate-400 truncate max-w-[150px]">
                        {exp.juzgado || <span className="text-slate-200">—</span>}
                      </td>}

                      {/* Tipo proc */}
                      {visibleColumns.tipo_proc && <td className="px-3 py-3 text-slate-400 uppercase whitespace-nowrap">
                        {exp.tipo_proc || <span className="text-slate-200">—</span>}
                      </td>}

                      {/* Núm. Autos */}
                      {visibleColumns.num_autos && <td className="px-3 py-3 font-mono text-slate-400">
                        {exp.num_autos || <span className="text-slate-200">—</span>}
                      </td>}

                      {/* NIG */}
                      {visibleColumns.nig && <td className="px-3 py-3 font-mono text-slate-300">
                        {exp.nig ? <span title={exp.nig}>{exp.nig.slice(0,12)}{exp.nig.length > 12 ? "…" : ""}</span> : <span className="text-slate-200">—</span>}
                      </td>}

                      {/* Estado */}
                      {visibleColumns.estado && <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {estadoConf.label}
                      </td>}

                      {/* Abrir */}
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/dashboard/expedientes/${exp.id}`); }}
                          className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex opacity-0 group-hover:opacity-100"
                          title="Abrir expediente">
                          <ExternalLink size={14} />
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
          \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */}
          {/* ── VISTA MULTISELECT ─────────────────────────────── */}
          {viewMode === "multiselect" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Barra de acciones masivas */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                    onChange={e => e.target.checked ? selectAll() : deselectAll()}
                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-600">
                    {selectedIds.size > 0
                      ? `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? "s" : ""}`
                      : "Seleccionar todo"}
                  </span>
                </label>

                {selectedIds.size > 0 && (
                  <>
                    <div className="w-px h-4 bg-slate-200" />
                    <div className="relative" ref={bulkStateMenuRef}>
                      <button
                        onClick={() => setShowBulkStateMenu(v => !v)}
                        disabled={bulkStateLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Activity size={12} />
                        Cambiar estado
                        <ChevronDown size={10} className={showBulkStateMenu ? "rotate-180" : ""} />
                      </button>
                      {showBulkStateMenu && (
                        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                          {Object.entries(ESTADOS).map(([key, conf]) => (
                            <button key={key} onClick={() => handleBulkChangeState(key)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-left hover:bg-slate-50 transition-colors">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${conf.color}`}>{conf.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setBulkDeleteConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                      <Trash2 size={12} />
                      Dar de baja {selectedIds.size}
                    </button>
                    <button onClick={deselectAll}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                      <X size={11} /> Limpiar
                    </button>
                  </>
                )}
              </div>

              {/* Lista con checkboxes */}
              <div className="overflow-auto flex-1">
                <table className="w-full text-left text-sm min-w-[600px]">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="pl-4 pr-2 py-2.5 w-10">
                        <input type="checkbox"
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                          onChange={e => e.target.checked ? selectAll() : deselectAll()}
                          className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer" />
                      </th>
                      <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide w-20">Exp.</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Descripción</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide w-32 hidden sm:table-cell">Tipo</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide w-32 hidden md:table-cell">Cliente</th>
                      <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide w-24">Estado</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-3">
                          <FolderOpen size={36} className="opacity-15" />
                          <p className="font-medium text-sm">No hay expedientes</p>
                        </div>
                      </td></tr>
                    ) : filtered.map(exp => {
                      const isSel = selectedIds.has(exp.id);
                      const tipoConf   = TIPOS[exp.tipo]   || TIPOS.otro;
                      const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                      return (
                        <tr key={exp.id} onClick={() => toggleSelectId(exp.id)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors group ${isSel ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"}`}>
                          <td className="pl-4 pr-2 py-3">
                            <input type="checkbox" checked={isSel}
                              onChange={() => toggleSelectId(exp.id)} onClick={e => e.stopPropagation()}
                              className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer" />
                          </td>
                          <td className="px-3 py-3 relative">
                            {exp.estado === "cerrado" && (
                              <span className="absolute top-0 left-0 w-4 h-4 bg-amber-500" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} title="Expediente cerrado" />
                            )}
                            <span className={`font-extrabold text-base ${isSel ? "text-red-700" : "text-slate-700"}`}>{exp.anio}/{exp.num_exp}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-slate-800 truncate block max-w-[280px]">
                              {exp.descripcion || <span className="text-slate-300 font-normal">Sin descripción</span>}
                            </span>
                            {exp.cliente_nombre && <span className="text-xs text-slate-400 block md:hidden truncate">{exp.cliente_nombre}</span>}
                          </td>
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tipoConf.color}`}>{tipoConf.short}</span>
                          </td>
                          <td className="px-3 py-3 hidden md:table-cell">
                            <span className="text-xs text-slate-600 truncate block max-w-[120px]">{exp.cliente_nombre || "—"}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${estadoConf.color}`}>{estadoConf.label}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button onClick={e => { e.stopPropagation(); navigate(`/dashboard/expedientes/${exp.id}`); }}
                              className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex opacity-0 group-hover:opacity-100" title="Abrir">
                              <ExternalLink size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Confirmar borrado masivo ── */}
          {bulkDeleteConfirm && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-xl shrink-0">
                    <AlertTriangle size={18} className="text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">¿Dar de baja {selectedIds.size} expediente{selectedIds.size !== 1 ? "s" : ""}?</h3>
                    <p className="text-xs text-slate-500 mt-1">Se eliminarán permanentemente. Esta acción no se puede deshacer.</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setBulkDeleteConfirm(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button onClick={handleBulkDelete} className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Dar de baja</button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {viewMode === "detail" && (
            <div className="overflow-auto flex-1 p-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                  <FolderOpen size={36} className="opacity-15" />
                  <p className="font-medium text-sm">{(hasActiveFilters || filters.length > 1) ? "No hay expedientes con esos filtros" : "No hay expedientes"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(exp => {
                    const tipoConf   = TIPOS[exp.tipo]   || TIPOS.otro;
                    const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                    const isSel = selected === exp.id;
                    const colorStyle = EXPEDIENTE_ROW_COLOR_STYLES[exp.color || "ninguno"] || EXPEDIENTE_ROW_COLOR_STYLES.ninguno;
                    return (
                      <div
                        key={exp.id}
                        onClick={() => setSelected(isSel ? null : exp.id)}
                        onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                        className={`rounded-xl border cursor-pointer transition-all ${isSel ? colorStyle.cardSelected : colorStyle.card}`}
                      >
                        <div className="px-4 py-3 flex items-center gap-4">
                          <div className="shrink-0 w-20 text-right">
                            <span className={`font-extrabold text-base ${isSel ? colorStyle.cardNumberSelected : colorStyle.cardNumber}`}>{exp.anio}/{exp.num_exp}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${isSel ? colorStyle.cardDescriptionSelected : "text-slate-800"}`}>
                              {exp.descripcion || <span className="text-slate-300 font-normal">Sin descripci\u00f3n</span>}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tipoConf.color}`}>{tipoConf.short}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${estadoConf.color}`}>{estadoConf.label}</span>
                              {exp.cliente_nombre && <span className="text-xs text-slate-500 truncate max-w-[160px]">{exp.cliente_nombre}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {exp.juzgado && <span className="text-xs text-slate-400 hidden sm:block truncate max-w-[120px]">{exp.juzgado}</span>}
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/dashboard/expedientes/${exp.id}`); }}
                              className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Abrir expediente">
                              <ExternalLink size={14} />
                            </button>
                          </div>
                        </div>
                        {isSel && (
                          <div className="px-4 pb-3 pt-2 border-t border-red-100 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                            {exp.contrario  && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Contrario</p><p className="text-xs text-slate-700 truncate">{exp.contrario}</p></div>}
                            {exp.juzgado    && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Juzgado</p><p className="text-xs text-slate-700 truncate">{exp.juzgado}</p></div>}
                            {exp.num_autos  && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Núm. autos</p><p className="text-xs text-slate-700 font-mono">{exp.num_autos}</p></div>}
                            {exp.nig        && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">NIG</p><p className="text-xs text-slate-700 font-mono truncate">{exp.nig}</p></div>}
                            {exp.procurador && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Procurador</p><p className="text-xs text-slate-700 truncate">{exp.procurador}</p></div>}
                            {exp.tipo_proc  && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Tipo proc.</p><p className="text-xs text-slate-700 uppercase">{exp.tipo_proc}</p></div>}
                            {exp.fecha_inicio && <div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Inicio</p><p className="text-xs text-slate-700">{fmtDateHuman(exp.fecha_inicio)}</p></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
