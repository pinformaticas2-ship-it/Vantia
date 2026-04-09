import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FolderOpen, Plus, Loader2, AlertCircle, RefreshCw,
  X, ChevronUp, ChevronDown, ListFilter, ExternalLink,
  Edit3, Trash2, FileSpreadsheet, Printer, MoreHorizontal,
  Users, Activity, Mail, MessageSquare, Paperclip,
  AlertTriangle, ClipboardList, ChevronRight, Star,
  Palette, Zap, Bell, Copy, GitMerge, Smartphone,
  Bug, History, TrendingUp, UserMinus, Pencil, Bookmark,
  AlignJustify, LayoutList, ListChecks, Upload, Eye, Settings2, SlidersHorizontal, Check,
} from "lucide-react";
import { AtajosButton } from "../components/AtajosSystem";
import AdjuntosModal from "../components/AdjuntosModal";
import BackButton from "../components/BackButton";

type ViewMode = "list" | "detail" | "multiselect" | "csvImport" | "csvImportConfigure" | "csvImportReview" | "csvImportComplete" | "csvImportHistory" | "csvImportErrorDetail";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { TIPOS, ESTADOS, EXP_EMPTY, ExpedienteModal } from "../components/ExpedienteModal";

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
  { id: "anio", label: "Año", help: "Año del expediente si viene informado en el CSV", aliases: ["año", "anio", "ejercicio"] },
  { id: "ref_propia", label: "Referencia", help: "Codigo unico del caso (ID del expediente)", required: true, aliases: ["referencia", "ref. propia", "ref propia", "referencia propia", "id expediente", "id del expediente", "expediente"] },
  { id: "num_proc", label: "Numero de Procedimiento", help: "Numero del procedimiento judicial", required: true, aliases: ["num.", "numero", "numero procedimiento", "n procedimiento", "procedimiento", "num procedimiento"] },
  { id: "tipo_juzgado", label: "Tipo de Juzgado", help: "Tipo de juzgado (ej: Juzgado de Primera Instancia)", required: true, aliases: ["tipo juzgado", "clase juzgado", "organo judicial"] },
  { id: "numero_juzgado", label: "Numero de Juzgado", help: "Numero del juzgado", required: true, aliases: ["num. autos", "num autos", "numero juzgado", "n juzgado", "autos"] },
  { id: "poblacion", label: "Poblacion", help: "Municipio donde se tramita el procedimiento", required: true, aliases: ["poblacion", "población", "municipio", "localidad", "partido judicial"] },
  { id: "tipo_procedimiento", label: "Tipo de Procedimiento", help: "Tipo de procedimiento judicial", required: true, aliases: ["tipo", "tipo proc.", "tipo proc", "tipo procedimiento", "procedimiento tipo"] },
  { id: "descripcion", label: "Descripcion", help: "Resumen interno del expediente", aliases: ["descripcion", "descripción", "detalle", "asunto", "observacion", "observación"] },
  { id: "cliente", label: "Cliente", help: "Cliente asociado al expediente", aliases: ["cliente", "demandante", "parte actora"] },
  { id: "estado", label: "Estado", help: "Estado inicial del expediente", aliases: ["estado", "situacion", "situación"] },
  { id: "nig", label: "NIG", help: "Numero de identificacion general", aliases: ["nig", "numero identificacion general"] },
  { id: "contrario", label: "Contrario", help: "Parte contraria del procedimiento", aliases: ["contrario", "demandado", "parte contraria"] },
  { id: "procurador", label: "Procurador", help: "Procurador vinculado al asunto", aliases: ["procurador"] },
  { id: "observaciones", label: "Observaciones", help: "Notas adicionales de la importacion", aliases: ["observaciones", "notas", "comentarios"] },
];

const CSV_ALLOWED_COURT_TYPES = [
  "juzgado de primera instancia",
  "juzgado de instruccion",
  "juzgado de primera instancia e instruccion",
  "juzgado de lo penal",
  "juzgado de lo social",
  "juzgado de lo mercantil",
  "juzgado contencioso administrativo",
  "juzgado de violencia sobre la mujer",
  "juzgado de menores",
  "juzgado de vigilancia penitenciaria",
  "juzgado de familia",
  "juzgado de paz",
  "juzgado central de instruccion",
  "juzgado central de lo penal",
  "audiencia provincial",
  "tribunal supremo",
  "tribunal superior de justicia",
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

function validateRequiredCsvValue(fieldId: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "No tiene valor informado";
  }

  if (fieldId === "num_proc") {
    const compact = trimmed.replace(/\s+/g, "");
    if (!/\d/.test(compact)) {
      return "El numero de procedimiento debe contener digitos";
    }
    if (!/^[A-Za-z0-9./-]+$/.test(compact)) {
      return "El numero de procedimiento contiene caracteres no validos";
    }
    const digitsOnly = compact.replace(/\D/g, "");
    if (!digitsOnly || /^0+$/.test(digitsOnly)) {
      return "El numero de procedimiento no puede ser cero ni vacio";
    }
  }

  if (fieldId === "numero_juzgado") {
    const digitsOnly = trimmed.replace(/\D/g, "");
    if (!digitsOnly) {
      return "El numero de juzgado debe contener digitos";
    }
    if (/^0+$/.test(digitsOnly)) {
      return "El numero de juzgado no puede ser cero";
    }
  }

  if (fieldId === "tipo_juzgado") {
    const normalized = normalizeCsvHeader(trimmed);
    const isKnownCourtType = CSV_ALLOWED_COURT_TYPES.some((type) => (
      normalized === type || normalized.includes(type) || type.includes(normalized)
    ));
    if (!isKnownCourtType) {
      return "Tipo de juzgado invalido o no reconocido";
    }
  }

  if ((fieldId === "tipo_juzgado" || fieldId === "tipo_procedimiento") && trimmed.length < 3) {
    return "El valor es demasiado corto para considerarlo valido";
  }

  if (fieldId === "poblacion" && trimmed.length < 2) {
    return "La poblacion o municipio no parece valido";
  }

  return null;
}

function validateCsvImport(mappings: CsvFieldMapping[], rows: CsvPreviewRow[]): CsvImportSummary {
  const requiredMappings = mappings.filter((field) => field.required);
  const issues: CsvImportIssue[] = [];

  rows.forEach((row, index) => {
    requiredMappings.forEach((field) => {
      if (field.selected === CSV_UNASSIGNED) {
        issues.push({
          rowNumber: index + 1,
          fieldId: field.id,
          fieldLabel: field.label,
          message: "El campo obligatorio no esta asignado a ninguna columna del CSV",
        });
        return;
      }

      const rawValue = row[field.selected] || "";
      const validationError = validateRequiredCsvValue(field.id, rawValue);
      if (validationError) {
        issues.push({
          rowNumber: index + 1,
          fieldId: field.id,
          fieldLabel: field.label,
          message: validationError,
        });
      }
    });
  });

  const rowsWithErrors = new Set(issues.map((issue) => issue.rowNumber));
  const totalProcessed = rows.length;
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

function buildExpedientePayload(row: CsvPreviewRow, mappings: CsvFieldMapping[]) {
  const anioRaw = getCsvMappedValue(row, mappings, "anio");
  const referencia = getCsvMappedValue(row, mappings, "ref_propia");
  const numeroProcedimiento = getCsvMappedValue(row, mappings, "num_proc");
  const tipoJuzgado = getCsvMappedValue(row, mappings, "tipo_juzgado");
  const numeroJuzgado = getCsvMappedValue(row, mappings, "numero_juzgado");
  const poblacion = getCsvMappedValue(row, mappings, "poblacion");
  const tipoProcedimiento = getCsvMappedValue(row, mappings, "tipo_procedimiento");
  const descripcion = getCsvMappedValue(row, mappings, "descripcion") || `${tipoProcedimiento} - ${referencia || numeroProcedimiento}`;
  const cliente = getCsvMappedValue(row, mappings, "cliente");
  const contrario = getCsvMappedValue(row, mappings, "contrario");
  const procurador = getCsvMappedValue(row, mappings, "procurador");
  const nig = getCsvMappedValue(row, mappings, "nig");
  const estado = normalizeExpedienteEstado(getCsvMappedValue(row, mappings, "estado"));
  const observaciones = getCsvMappedValue(row, mappings, "observaciones");
  const juzgado = [tipoJuzgado, numeroJuzgado ? `Nº ${numeroJuzgado}` : "", poblacion].filter(Boolean).join(" · ");
  const parsedYear = Number.parseInt(anioRaw, 10);

  return {
    anio: Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear(),
    ref_propia: referencia || null,
    descripcion,
    tipo: inferExpedienteTipo(tipoProcedimiento),
    cliente_nombre: cliente || null,
    contrario: contrario || null,
    procurador: procurador || null,
    juzgado: juzgado || null,
    tipo_proc: tipoProcedimiento || null,
    num_autos: numeroProcedimiento || null,
    nig: nig || null,
    estado,
    observaciones: observaciones || null,
    fecha_inicio: new Date().toISOString().slice(0, 10),
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
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
        transition-all select-none whitespace-nowrap
        ${disabled
          ? "text-slate-300 cursor-not-allowed"
          : primary
            ? "bg-red-700 text-white hover:bg-red-800 shadow-sm active:scale-95"
            : danger
              ? "text-red-500 hover:bg-red-50 hover:text-red-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
        }
      `}
    >
      <Icon size={13} />
      {label}
    </button>
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

function CsvImportView({
  fileName,
  onBack,
  onOpenHistory,
  onOpenSettings,
  onSelectFile,
  onFileChange,
  inputRef,
}: {
  fileName: string | null;
  onBack: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onSelectFile: () => void;
  onFileChange: (file?: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
            title="Configuracion"
          >
            <Settings2 size={16} />
          </button>
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
          >
            <History size={16} />
            Historial de importaciones
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-black text-slate-900">Importar expedientes</h1>
        <p className="mt-2 text-lg text-slate-500">Importa expedientes judiciales desde un archivo CSV</p>
      </div>

      <div className="flex items-center justify-center gap-6 py-4">
        <ImportStep
          icon={Upload}
          label="Subir archivo"
          active
          connector
        />
        <ImportStep
          icon={SlidersHorizontal}
          label="Configurar"
          connector
        />
        <ImportStep
          icon={Eye}
          label="Revisar"
        />
      </div>

      <button
        onClick={onSelectFile}
        className="group flex min-h-[165px] w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-center shadow-sm transition-all hover:border-[#ab0433]/35 hover:bg-white"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#ab0433] transition-colors group-hover:bg-red-100 group-hover:text-[#92042c]">
          <Upload size={24} />
        </div>
        <p className="text-xl font-semibold text-slate-900">
          {fileName ? fileName : "Haz click para seleccionar o arrastra tu archivo CSV"}
        </p>
        <p className="mt-3 text-sm text-slate-500">Maximo 10MB</p>
      </button>

      <div className="rounded-[22px] border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle size={16} className="text-[#ab0433]" />
          <h2 className="text-xl font-bold text-slate-900">Formato esperado</h2>
        </div>
        <p className="text-base text-slate-600">
          Tu archivo CSV debe contener las siguientes columnas obligatorias:
        </p>
        <ul className="mt-3 space-y-1.5 text-base text-slate-600">
          <li>• Referencia (ID del expediente)</li>
          <li>• Número de procedimiento</li>
          <li>• Tipo de juzgado</li>
          <li>• Número de juzgado</li>
          <li>• Población/Municipio</li>
          <li>• Tipo de procedimiento</li>
        </ul>
        <p className="mt-5 text-base text-slate-500">
          Las columnas se detectarán automáticamente y podrás ajustarlas en el siguiente paso.
        </p>
      </div>
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
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Historial de importaciones</h1>
          <p className="mt-1.5 text-base text-slate-500">
            Historial de todas las importaciones de expedientes realizadas
          </p>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Importaciones recientes</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Lista de todas las importaciones realizadas en el sistema
            </p>
          </div>
          <button
            onClick={onReload}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-900">
                <th className="px-4 py-4 font-semibold">Fecha</th>
                <th className="px-4 py-4 font-semibold">ID</th>
                <th className="px-4 py-4 font-semibold">Estado</th>
                <th className="px-4 py-4 font-semibold">Total</th>
                <th className="px-4 py-4 font-semibold">Completados</th>
                <th className="px-4 py-4 font-semibold">Errores</th>
                <th className="px-4 py-4 font-semibold">Pendientes</th>
                <th className="px-4 py-4 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 size={18} className="animate-spin" />
                      <span>Cargando importaciones...</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                    No hay importaciones registradas
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const meta = importStatusMeta(row.status);
                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-4 text-sm text-slate-600">{fmtDateTime(row.created_at)}</td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-800">{row.id.slice(0, 8)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">{row.total_count}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{row.completed_count}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{row.error_count}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{row.pending_count}</td>
                      <td className="px-4 py-4">
                        <button
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#ab0433] transition-colors hover:bg-red-50"
                          title={row.notes || row.file_name}
                        >
                          <Eye size={13} />
                          {row.file_name}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Se muestran los ultimos {rows.length} lotes de importacion
        </p>
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
      invalid
        ? "border border-red-200 bg-red-50/70"
        : "border border-slate-200 bg-white"
    } ${open ? "z-40" : "z-0"}`}>
      <div className="flex min-w-0 items-start gap-4">
        <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          invalid
            ? "bg-red-100 text-red-600"
            : field.required ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
        }`}>
          {field.required ? <Check size={15} /> : <span className="text-xs">+</span>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-900">{field.label}</p>
            {field.required && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Obligatorio
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">{field.help}</p>
        </div>
      </div>

      <div className="flex min-w-[320px] items-center justify-end gap-3">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className={`flex h-10 w-[180px] items-center justify-between rounded-xl px-3.5 text-sm font-medium shadow-sm outline-none transition-all ${
              invalid
                ? "border border-red-300 bg-white text-red-700 hover:border-red-400"
                : "border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow"
            }`}
          >
            <span>{field.selected}</span>
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[180px] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
              {options.map((option) => {
                const isSelected = field.selected === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      onChange(field.id, option);
                      setOpen(false);
                    }}
                    className={`mx-1 flex w-[calc(100%-8px)] items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-amber-100/80 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{option}</span>
                    {isSelected ? <Check size={16} className="text-slate-700" /> : <span className="w-4" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="min-w-[120px] text-right">
          <span className={`text-sm ${invalid ? "font-semibold text-red-600" : "text-slate-500"}`}>{field.sample}</span>
          {invalid && <p className="mt-1 text-xs font-semibold text-red-600">Campo obligatorio sin asignar</p>}
        </div>
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
  const requiredFields = mappings.filter((item) => item.required);
  const optionalFields = mappings.filter((item) => !item.required);
  const assignedRequired = requiredFields.filter((item) => item.selected !== CSV_UNASSIGNED).length;
  const canContinue = assignedRequired === requiredFields.length;
  const missingRequiredFields = requiredFields.filter((item) => item.selected === CSV_UNASSIGNED);
  const selectedHeaders = mappings
    .map((item) => item.selected)
    .filter((selected) => selected !== CSV_UNASSIGNED);
  const unassignedHeaders = csvHeaders.filter((header) => !selectedHeaders.includes(header));
  const assignedOptional = optionalFields.filter((item) => item.selected !== CSV_UNASSIGNED).length;
  const mappingOptions = [CSV_UNASSIGNED, ...csvHeaders];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
            title="Configuracion"
          >
            <Settings2 size={16} />
          </button>
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
          >
            <History size={16} />
            Historial de importaciones
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-black text-slate-900">Importar expedientes</h1>
        <p className="mt-1.5 text-base text-slate-500">Importa expedientes judiciales desde un archivo CSV</p>
      </div>

      <div className="flex items-center justify-center gap-5 py-3">
        <ImportStep icon={Check} label="Subir archivo" completed connector />
        <ImportStep icon={SlidersHorizontal} label="Configurar" active connector />
        <ImportStep icon={Eye} label="Revisar" />
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-slate-900">Archivo seleccionado</p>
            <p className="mt-1.5 text-sm text-slate-500">{fileName || "Sin archivo"} (0.00 MB)</p>
          </div>
          <button
            onClick={onSelectFile}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
          >
            <RefreshCw size={15} />
            Cambiar archivo
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-bold text-slate-900">Campos Obligatorios</h2>
            <p className="mt-1.5 text-base text-slate-500">
              Estos campos son necesarios para crear los expedientes. Verifica que las columnas detectadas sean correctas.
            </p>
          </div>
          <p className="text-base text-slate-500">{assignedRequired} de {requiredFields.length} asignados</p>
        </div>

        <div className="space-y-2">
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

      <details className="overflow-visible rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-4">
        <summary className="cursor-pointer list-none text-xl font-semibold text-slate-900">
          Columnas del CSV sin asignar <span className="ml-2 text-base font-normal text-slate-500">({unassignedHeaders.length} columnas)</span>
        </summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {unassignedHeaders.map((item) => (
            <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {item}
            </span>
          ))}
          {!unassignedHeaders.length && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Todas las columnas del CSV estan asignadas
            </span>
          )}
        </div>
      </details>

      <details className="overflow-visible rounded-2xl border border-slate-200 bg-white/80 px-5 py-4" open>
        <summary className="cursor-pointer list-none text-xl font-semibold text-slate-900">
          Campos Opcionales <span className="ml-2 text-base font-normal text-slate-500">({assignedOptional} de {optionalFields.length} asignados)</span>
        </summary>
        <div className="mt-4 space-y-2 overflow-visible">
          {optionalFields.map((field) => (
            <CsvFieldRow key={field.id} field={field} options={mappingOptions} onChange={onChangeMapping} />
          ))}
        </div>
      </details>

      {!canContinue && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Faltan campos obligatorios por asignar antes de continuar
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Debes revisar estos campos: {missingRequiredFields.map((field) => field.label).join(", ")}.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-5">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm transition-all ${
            canContinue
              ? "bg-[#ab0433] text-white hover:bg-[#92042c] hover:shadow"
              : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
          }`}
        >
          Continuar
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function CsvImportReviewView({
  fileName,
  mappings,
  previewRows,
  validationSummary,
  onBack,
  onImport,
  onOpenHistory,
  onOpenSettings,
}: {
  fileName: string | null;
  mappings: CsvFieldMapping[];
  previewRows: CsvPreviewRow[];
  validationSummary: CsvImportSummary;
  onBack: () => void;
  onImport: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const firstRow = previewRows[0] || {};
  const getMappedValue = (fieldId: string) => {
    const mapping = mappings.find((item) => item.id === fieldId);
    if (!mapping || mapping.selected === CSV_UNASSIGNED) return "-";
    return firstRow[mapping.selected] || "-";
  };
  const hasPreviewError = (fieldId: string) => validationSummary.issues.some((issue) => issue.rowNumber === 1 && issue.fieldId === fieldId);
  const cellClassName = (fieldId: string) => hasPreviewError(fieldId)
    ? "px-4 py-4 bg-red-50 text-red-700 font-semibold"
    : "px-4 py-4";

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
            title="Configuracion"
          >
            <Settings2 size={16} />
          </button>
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
          >
            <History size={16} />
            Historial de importaciones
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-black text-slate-900">Importar expedientes</h1>
        <p className="mt-1.5 text-base text-slate-500">Importa expedientes judiciales desde un archivo CSV</p>
      </div>

      <div className="flex items-center justify-center gap-5 py-3">
        <ImportStep icon={Check} label="Subir archivo" completed connector />
        <ImportStep icon={Check} label="Configurar" completed connector />
        <ImportStep icon={Eye} label="Revisar" active />
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-[#ffcf26]">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Listo para importar</p>
              <p className="mt-1 text-sm text-slate-500">{fileName || "archivo.csv"} - {previewRows.length} registros</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-emerald-600">
            {validationSummary.errorCount === 0 ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span className={`text-sm font-medium ${validationSummary.errorCount === 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {validationSummary.errorCount === 0
                ? "Todos los campos obligatorios estan validados"
                : `${validationSummary.errorCount} registros tienen errores obligatorios`}
            </span>
          </div>
        </div>
      </div>

      {validationSummary.errorCount > 0 && (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-base font-bold text-amber-900">
                Se han detectado errores en campos obligatorios
              </p>
              <p className="mt-1 text-sm text-amber-800">
                El sistema validara estrictamente estas columnas: Referencia, Numero de procedimiento, Tipo de juzgado, Numero de juzgado, Poblacion/Municipio y Tipo de procedimiento.
              </p>
              <p className="mt-2 text-sm text-amber-800">
                Al finalizar se mostraran los registros correctos, los errores y el porcentaje real de exito.
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-2xl font-bold text-slate-900">Vista previa de los primeros registros</p>
        <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-sm font-semibold text-slate-800">
                <th className="px-4 py-4">Referencia</th>
                <th className="px-4 py-4">Nº Procedimiento</th>
                <th className="px-4 py-4">Tipo de Juzgado</th>
                <th className="px-4 py-4">Nº Juzgado</th>
                <th className="px-4 py-4">Población</th>
                <th className="px-4 py-4">Tipo Procedimiento</th>
                <th className="px-4 py-4">NIG</th>
                <th className="px-4 py-4">Cliente</th>
                <th className="px-4 py-4">Contrario</th>
                <th className="px-4 py-4">Procurador</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-base text-slate-900">
                <td className={cellClassName("ref_propia")}>{getMappedValue("ref_propia")}</td>
                <td className={cellClassName("num_proc")}>{getMappedValue("num_proc")}</td>
                <td className={cellClassName("tipo_juzgado")}>{getMappedValue("tipo_juzgado")}</td>
                <td className={cellClassName("numero_juzgado")}>{getMappedValue("numero_juzgado")}</td>
                <td className={cellClassName("poblacion")}>{getMappedValue("poblacion")}</td>
                <td className={cellClassName("tipo_procedimiento")}>{getMappedValue("tipo_procedimiento")}</td>
                <td className={cellClassName("nig")}>{getMappedValue("nig")}</td>
                <td className={cellClassName("cliente")}>{getMappedValue("cliente")}</td>
                <td className={cellClassName("contrario")}>{getMappedValue("contrario")}</td>
                <td className={cellClassName("procurador")}>{getMappedValue("procurador")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-5">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ab0433] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#92042c] hover:shadow"
        >
          <Upload size={16} />
          Importar expedientes
        </button>
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
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
        >
          <RefreshCw size={16} />
          Nueva importacion
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-black text-slate-900">Importar expedientes</h1>
        <p className="mt-1.5 text-base text-slate-500">Importa expedientes judiciales desde un archivo CSV</p>
      </div>

      <div className={`relative overflow-hidden rounded-[28px] px-8 py-10 text-white shadow-xl ${
        hasErrors
          ? "bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 shadow-orange-100"
          : "bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 shadow-emerald-100"
      }`}>
        <div className="absolute -left-10 top-20 h-28 w-28 rounded-full bg-white/10" />
        <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute bottom-4 right-16 h-20 w-20 rounded-full bg-white/8" />

        <div className="relative flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <div className="flex h-14 w-14 animate-bounce items-center justify-center rounded-full bg-white/20">
              <Check size={32} strokeWidth={3} />
            </div>
          </div>

          <h3 className="mt-6 text-4xl font-black">{hasErrors ? "Importacion revisada con incidencias" : "Importacion completada"}</h3>
          <p className="mt-3 text-lg text-white/90">
            <span className="font-semibold">{fileName || "archivo.csv"}</span> se ha procesado con validacion estricta de campos obligatorios.
          </p>
          <div className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white/95">
            {totalProcessed} registros procesados - {successRate}% de exito
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-emerald-100/70" />
          <div className="relative">
            <div className="flex items-center gap-2 text-emerald-600">
              <Check size={18} />
              <p className="text-lg font-semibold text-slate-900">Importados con exito</p>
            </div>
            <p className="mt-4 text-5xl font-black text-slate-900">{successCount}</p>
            <p className="mt-1 text-sm text-slate-500">registros correctos</p>
            <p className="mt-3 text-sm text-slate-500">{successCount} filas cumplen todos los campos obligatorios</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-red-100/70" />
          <div className="relative">
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle size={18} />
              <p className="text-lg font-semibold text-slate-900">Registros con errores</p>
            </div>
            <p className="mt-4 text-5xl font-black text-slate-900">{errorCount}</p>
            <p className="mt-1 text-sm text-slate-500">filas bloqueadas por validacion obligatoria</p>
            <p className="mt-3 text-sm text-slate-500">Referencia, Numero de procedimiento, Tipo de juzgado, Numero de juzgado, Poblacion/Municipio y Tipo de procedimiento son obligatorios.</p>
            {hasErrors && (
              <button
                type="button"
                onClick={onViewDetails}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <Eye size={15} />
                Ver detalles
              </button>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-blue-100/70" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sky-600">
              <FileSpreadsheet size={18} />
              <p className="text-lg font-semibold text-slate-900">Total procesados</p>
            </div>
            <p className="mt-4 text-5xl font-black text-slate-900">{totalProcessed}</p>
            <p className="mt-1 text-sm text-slate-500">registros revisados</p>
            <p className="mt-3 text-sm text-slate-500">{issues.length} incidencias de validacion detectadas</p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-bold text-slate-900">Tasa de exito</p>
            <p className="mt-1.5 text-sm text-slate-500">Porcentaje de registros importados correctamente</p>
          </div>
          <div className="rounded-full bg-emerald-50 px-4 py-2 text-lg font-bold text-emerald-600">
            {successRate}%
          </div>
        </div>

        <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>

      {hasErrors && (
        <div className="rounded-[22px] border border-red-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xl font-bold text-slate-900">Detalle de errores</p>
              <p className="mt-1.5 text-sm text-slate-500">
                Se muestran las primeras incidencias detectadas en los campos obligatorios.
              </p>
            </div>
            <div className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-600">
              {issues.length} incidencias
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {visibleIssues.map((issue, index) => (
              <div key={`${issue.rowNumber}-${issue.fieldId}-${index}`} className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  Fila {issue.rowNumber} - {issue.fieldLabel}
                </p>
                <p className="mt-1 text-sm text-red-700">{issue.message}</p>
              </div>
            ))}
            {issues.length > visibleIssues.length && (
              <p className="text-sm text-slate-500">
                Hay {issues.length - visibleIssues.length} incidencias adicionales no mostradas en este resumen.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#ab0433]/30 hover:bg-red-50 hover:text-[#ab0433]"
        >
          <RefreshCw size={16} />
          Nueva importacion
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ab0433] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#92042c] hover:shadow"
        >
          <Check size={16} />
          Finalizar
        </button>
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
          <h1 className="text-3xl font-black text-slate-900">Detalles de importacion</h1>
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
                <p className="mt-2 text-3xl font-black text-slate-900">{successCount}</p>
                <p className="text-xs text-slate-500">({completedPct.toFixed(2)}%)</p>
              </div>
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errores</p>
                <p className="mt-2 text-3xl font-black text-slate-900">{errorCount}</p>
                <p className="text-xs text-slate-500">({errorPct.toFixed(2)}%)</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pendientes</p>
                <p className="mt-2 text-3xl font-black text-slate-900">0</p>
                <p className="text-xs text-slate-500">(0.00%)</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total</p>
                <p className="mt-2 text-3xl font-black text-slate-900">{totalProcessed}</p>
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
                        <p className="mt-2 text-3xl font-black text-slate-900">{group.length}</p>
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

function ImportStep({
  icon: Icon,
  label,
  active = false,
  completed = false,
  connector = false,
}: {
  icon: any;
  label: string;
  active?: boolean;
  completed?: boolean;
  connector?: boolean;
}) {
  return (
    <div className="flex items-center gap-5">
      <div className="flex flex-col items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${
          completed
            ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200"
            : active
            ? "border-[#ab0433] bg-[#ab0433] text-white shadow-lg shadow-red-200"
            : "border-slate-300 bg-white text-slate-500"
        }`}>
          <Icon size={18} />
        </div>
        <span className={`text-sm font-semibold ${
          completed ? "text-emerald-600" : active ? "text-[#ab0433]" : "text-slate-500"
        }`}>{label}</span>
      </div>
      {connector && <div className={`h-px w-32 ${completed ? "bg-emerald-500" : "bg-slate-300"}`} />}
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
      <select
        value={filter.field}
        onChange={e => onChange(filter.id, { field: e.target.value, value: "" })}
        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 bg-white focus:outline-none focus:border-red-400 h-7"
      >
        {FILTER_FIELDS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
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

  // Abrir modal de alta automáticamente si la URL contiene ?nuevo=1
  useEffect(() => {
    if (searchParams.get("nuevo") === "1") {
      setEditItem(null);
      setShowModal(true);
      // Limpiar el parámetro de la URL sin recargar
      setSearchParams(prev => { prev.delete("nuevo"); return prev; }, { replace: true });
    }
  }, []); // solo al montar

  // Confirmación borrado
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Vistas
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const switchView = (v: ViewMode) => setViewMode(v);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [csvFieldMappings, setCsvFieldMappings] = useState<CsvFieldMapping[]>(() => buildCsvMappings([], []));
  const [csvImportBatchId, setCsvImportBatchId] = useState<string | null>(null);
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

  // Dropdowns click-based
  const [showOpciones, setShowOpciones] = useState(false);
  const opcionesRef = useRef<HTMLDivElement>(null);
  const [showAltaMenu, setShowAltaMenu] = useState(false);
  const altaMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown Opciones al clicar fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (opcionesRef.current && !opcionesRef.current.contains(e.target as Node)) setShowOpciones(false);
      if (altaMenuRef.current && !altaMenuRef.current.contains(e.target as Node)) setShowAltaMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openManualCreate = () => {
    setShowAltaMenu(false);
    setEditItem(null);
    setShowModal(true);
  };

  const openCsvImport = () => {
    setShowAltaMenu(false);
    setViewMode("csvImport");
  };

  const openDemandImport = () => {
    setShowAltaMenu(false);
    alert("La creacion desde cedulas o demandas la dejamos preparada en el menu, pero aun no esta implementada.");
  };

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
    const baseSummary = validateCsvImport(csvFieldMappings, csvPreviewRows);
    const issues = [...baseSummary.issues];
    const results: CsvRowImportResult[] = [];

    for (let index = 0; index < csvPreviewRows.length; index += 1) {
      const row = csvPreviewRows[index];
      const rowNumber = index + 1;
      const rowHasBlockingErrors = issues.some((issue) => issue.rowNumber === rowNumber);
      const payload = buildExpedientePayload(row, csvFieldMappings);
      const reference = String(payload.ref_propia || "") || null;

      if (rowHasBlockingErrors) {
        results.push({
          rowNumber,
          status: "failed",
          reference,
          error_message: "La fila tiene errores en campos obligatorios",
          payload,
        });
        continue;
      }

      try {
        const res = await fetch("/api/expedientes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          const message = data.error || "No se pudo crear el expediente";
          issues.push({
            rowNumber,
            fieldId: "expediente",
            fieldLabel: "Expediente",
            message,
          });
          results.push({
            rowNumber,
            status: "failed",
            reference,
            error_message: message,
            payload,
          });
          continue;
        }

        results.push({
          rowNumber,
          status: "completed",
          reference,
          error_message: null,
          payload,
          created_expediente_id: data.data?.id || null,
        });
      } catch (e: any) {
        const message = e.message || "No se pudo crear el expediente";
        issues.push({
          rowNumber,
          fieldId: "expediente",
          fieldLabel: "Expediente",
          message,
        });
        results.push({
          rowNumber,
          status: "failed",
          reference,
          error_message: message,
          payload,
        });
      }
    }

    const summary = buildCsvSummary(csvPreviewRows.length, issues);
    setCsvImportSummary(summary);

    if (csvImportBatchId) {
      try {
        await fetch(`/api/expedientes/imports/${csvImportBatchId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: summary.errorCount > 0 ? "failed" : "completed",
            total_count: summary.totalProcessed,
            completed_count: summary.successCount,
            error_count: summary.errorCount,
            pending_count: 0,
            notes: summary.errorCount > 0
              ? "Importacion finalizada con incidencias en campos obligatorios o creacion de expedientes."
              : "Importacion completada correctamente.",
          }),
        });
      } catch {}
    }

    if (results.some((item) => item.status === "completed")) {
      fetchExpedientes(true);
      fetchImportHistory(true);
    }

    switchView("csvImportComplete");
  };

  // ── Carga de expedientes ──────────────────────────────────────
  const fetchExpedientes = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/expedientes?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const res = await fetch(isEdit ? `/api/expedientes/${editItem.id}` : "/api/expedientes", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await safeJson(res);
      if (!res.ok) { alert(d.error || "Error al guardar"); return; }
      setShowModal(false); setEditItem(null);
      fetchExpedientes(true);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/expedientes/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setExpedientes(prev => prev.filter(x => x.id !== id));
      setDeleteId(null);
      if (selected === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
  };

  // ── Acciones toolbar ──────────────────────────────────────────
  const selectedExp = useMemo(() => expedientes.find(e => e.id === selected), [expedientes, selected]);

  const handleRefresh = async () => {
    setRefreshSpin(true);
    await fetchExpedientes(false);
    setTimeout(() => setRefreshSpin(false), 600);
  };

  const exportCSV = () => {
    const headers = ["Año","Núm.","Ref. Propia","Descripción","Tipo","Cliente","Contrario","Procurador","Juzgado","Tipo Proc.","Núm. Autos","NIG","Estado"];
    const rows = filtered.map(e => [
      e.anio, e.num_exp, e.ref_propia ?? "", e.descripcion ?? "",
      TIPOS[e.tipo]?.label ?? e.tipo, e.cliente_nombre ?? "",
      e.contrario ?? "", e.procurador ?? "", e.juzgado ?? "",
      e.tipo_proc ?? "", e.num_autos ?? "", e.nig ?? "", e.estado ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv);
    a.download = `expedientes_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
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
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm font-medium animate-pulse">Cargando expedientes...</p>
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

  // ── Render principal ──────────────────────────────────────────
  return (
    <>
      {/* ── Modal Adjuntos ──────────────────────────────────── */}
      {showAdjuntos && selected && (
        <AdjuntosModal
          entityId={selected}
          entityName={selectedExp ? `${selectedExp.ref_expediente || selectedExp.ref_propia || "Exp."} — ${selectedExp.descripcion || ""}` : "Expediente"}
          onClose={() => setShowAdjuntos(false)}
        />
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

      {/* ── Confirmar borrado ───────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar expediente?</h3>
                <p className="text-xs text-slate-500 mt-1">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0 animate-in fade-in duration-300" style={{ height: "calc(100vh - 96px)" }}>

        {/* ── Cabecera ──────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderOpen size={20} className="text-red-600" /> Gestión de Expedientes
          </h1>
          <button onClick={() => fetchExpedientes(true)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Actualizar">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">

          {/* ── Toolbar de acciones ─────────────────────────── */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex-wrap">

            {/* — Alta / Baja / Modificar / Abrir ficha — misma posición que ClientList */}
            <div className="relative" ref={altaMenuRef}>
              <button
                onClick={() => setShowAltaMenu(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all select-none whitespace-nowrap ${
                  showAltaMenu
                    ? "bg-red-800 text-white shadow-sm"
                    : "bg-red-700 text-white hover:bg-red-800 shadow-sm active:scale-95"
                }`}
              >
                <Plus size={13} />
                Alta
                <ChevronDown size={10} className={`transition-transform ${showAltaMenu ? "rotate-180" : ""}`} />
              </button>

              {showAltaMenu && (
                <div className="absolute left-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-600">Elige cómo quieres agregar expedientes</p>
                  </div>

                  <div className="p-2">
                    <AltaOption
                      icon={Plus}
                      title="Crear manualmente"
                      description="Crea un expediente desde cero introduciendo los datos"
                      iconClassName="bg-green-100 text-green-600"
                      onClick={openManualCreate}
                    />
                    <AltaOption
                      icon={FileSpreadsheet}
                      title="Importar desde CSV"
                      description="Sube un archivo CSV con múltiples expedientes"
                      iconClassName="bg-blue-100 text-blue-600"
                      onClick={openCsvImport}
                    />
                    <AltaOption
                      icon={ClipboardList}
                      title="Desde cédulas o demandas"
                      description="Procesa documentos judiciales para crear expedientes"
                      iconClassName="bg-amber-100 text-amber-700"
                      onClick={openDemandImport}
                    />
                  </div>
                </div>
              )}
            </div>
            <ToolBtn icon={Trash2}       label="Baja"       danger   disabled={!selected} onClick={() => selected && setDeleteId(selected)} />
            <ToolBtn icon={Edit3}        label="Modificar"           disabled={!selected} onClick={() => { setEditItem(selectedExp); setShowModal(true); }} />
            <ToolBtn icon={ExternalLink} label="Abrir ficha"         disabled={!selected} onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <ToolBtn icon={Mail}         label="Enviar Correo"  disabled={!selected} onClick={() => {}} />
            <ToolBtn icon={MessageSquare}label="WhatsApp"       disabled={!selected} onClick={() => {}} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <ToolBtn icon={ClipboardList}label="Actuación"     disabled={!selected} onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)} />
            <ToolBtn icon={Paperclip}    label="Adjuntos"      disabled={!selected} onClick={() => selected && setShowAdjuntos(true)} />
            <ToolBtn icon={Users}        label="Ir a cliente"  disabled={!selectedExp?.cliente_id} onClick={() => selectedExp?.cliente_id && navigate(`/dashboard/clientes/${selectedExp.cliente_id}`)} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <ToolBtn icon={FileSpreadsheet} label="Excel"    onClick={exportCSV} />
            <ToolBtn icon={Printer}         label="Imprimir" onClick={() => window.print()} />

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* ── Atajos ── */}
            <AtajosButton modulo="Expedientes" />

            {/* ── Opciones ── */}
            <div className="relative" ref={opcionesRef}>
              <button
                onClick={() => setShowOpciones(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${showOpciones ? "bg-red-50 border-red-300 text-red-700" : "text-slate-600 hover:bg-slate-100 border-slate-200"}`}>
                <MoreHorizontal size={13} /> Opciones <ChevronDown size={10} />
              </button>
              {showOpciones && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[230px] py-1.5">

                {/* Grupo 1: acciones principales */}
                <button onClick={exportCSV}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <FileSpreadsheet size={12} className="text-slate-400" /> Excel
                </button>
                <button onClick={() => selected && alert("Dar de baja: " + selected)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <UserMinus size={12} className="text-slate-400" /> Baja
                </button>
                <button onClick={() => selected && selectedExp && (setEditItem(selectedExp), setShowModal(true))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Pencil size={12} className="text-slate-400" /> Modificar
                </button>
                <button onClick={() => alert("Seleccionar opciones favoritas")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Star size={12} className="text-slate-400" /> Seleccionar Opciones Favoritas
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 2: navegación y color */}
                {/* Ir a → submenú */}
                <div className="relative group/sub">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <ExternalLink size={12} className="text-slate-400" /> Ir a
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/sub:block">
                    <button onClick={() => selectedExp?.cliente_id && navigate(`/dashboard/clientes/${selectedExp.cliente_id}`)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Users size={12} className="text-slate-400" /> Ir a Cliente
                    </button>
                    <button onClick={() => selected && navigate(`/dashboard/expedientes/${selected}`)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <FolderOpen size={12} className="text-slate-400" /> Ir a Expediente
                    </button>
                    <button onClick={() => alert("Ir a Juzgado")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <ClipboardList size={12} className="text-slate-400" /> Ir a Juzgado
                    </button>
                  </div>
                </div>

                <button onClick={() => alert("Asignar color al expediente")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Palette size={12} className="text-slate-400" /> Asignar Color
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 3: acciones especiales */}
                <button onClick={() => alert("Alta Acción")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Zap size={12} className="text-slate-400" /> Alta Acción
                </button>
                <button onClick={() => alert("Crear Recall")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Bell size={12} className="text-slate-400" /> Crear Recall
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 4: duplicar / fusionar */}
                <button onClick={() => alert("Duplicar expediente")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Copy size={12} className="text-slate-400" /> Duplicar
                </button>
                <button onClick={() => alert("Fusionar expedientes")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <GitMerge size={12} className="text-slate-400" /> Fusionar
                </button>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 5: comunicación + debug */}
                <button onClick={() => selectedExp && window.open(`https://wa.me/?text=Expediente ${selectedExp.anio}/${selectedExp.num_exp}`, "_blank")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Smartphone size={12} className="text-slate-400" /> Enviar SMS
                </button>

                {/* Depurar → submenú */}
                <div className="relative group/dep">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <Bug size={12} className="text-slate-400" /> Depurar
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/dep:block">
                    <button onClick={() => console.log("Expediente:", selectedExp)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <Bug size={12} className="text-slate-400" /> Ver en consola
                    </button>
                    <button onClick={() => alert(JSON.stringify(selectedExp, null, 2))}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <ClipboardList size={12} className="text-slate-400" /> Mostrar datos crudos
                    </button>
                  </div>
                </div>

                {/* Versión Antigua → submenú */}
                <div className="relative group/ver">
                  <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                    <span className="flex items-center gap-2.5">
                      <History size={12} className="text-slate-400" /> Versión Antigua
                    </span>
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                  <div className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[180px] py-1.5 hidden group-hover/ver:block">
                    <button onClick={() => alert("Restaurar versión anterior")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <History size={12} className="text-slate-400" /> Ver historial versiones
                    </button>
                    <button onClick={() => alert("Comparar con versión")}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                      <RefreshCw size={12} className="text-slate-400" /> Comparar versión
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-1.5" />

                {/* Grupo 6: recalcular */}
                <button onClick={() => alert("Recalcular intereses")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <TrendingUp size={12} className="text-slate-400" /> Recalcular Intereses
                </button>
                <button onClick={() => fetchExpedientes(false)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Activity size={12} className="text-slate-400" /> Recalcular Indicadores
                </button>

              </div>
              )}
            </div>

            {/* Expediente seleccionado */}
            {selectedExp && (
              <div className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-lg shrink-0">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-xs text-red-700 font-medium max-w-[200px] truncate">
                  {selectedExp.anio}/{selectedExp.num_exp} — {selectedExp.descripcion}
                </span>
                <button onClick={() => setSelected(null)} className="text-red-300 hover:text-red-600 ml-0.5">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>

          {/* ── Barra de filtros ────────────────────────────── */}
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
                  {idx === filters.length - 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={addFilter}
                        className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm font-bold">
                        +
                      </button>
                      {filters.length > 1 && (
                        <button onClick={() => removeFilter(filter.id)}
                          className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors text-xs font-bold">
                          −
                        </button>
                      )}
                      <button onClick={clearAllFilters}
                        className={`flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${hasActiveFilters || filters.length > 1 ? "border-red-300 text-red-500 hover:bg-red-50" : "border-slate-200 text-slate-300 cursor-default"}`}>
                        <ListFilter size={12} />
                      </button>
                    </div>
                  )}
                  {idx === filters.length - 1 && (
                    <div className="ml-auto flex items-center gap-2">
                      {/* Contador */}
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {filtered.length !== expedientes.length
                          ? <span className="text-amber-600 font-medium">{filtered.length} de {expedientes.length}</span>
                          : <>{expedientes.length} {expedientes.length === 1 ? "registro" : "registros"}</>
                        }
                      </span>

                      <div className="w-px h-4 bg-slate-200" />

                      {/* Controles de vista */}
                      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                        <button
                          onClick={() => switchView("list")}
                          title="Vista listado"
                          className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <AlignJustify size={13} />
                        </button>
                        <button
                          onClick={() => switchView("detail")}
                          title="Vista listado con detalle"
                          className={`p-1.5 rounded-md transition-all ${viewMode === "detail" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <LayoutList size={13} />
                        </button>
                        <button
                          onClick={() => switchView("multiselect")}
                          title="Selección múltiple"
                          className={`p-1.5 rounded-md transition-all ${viewMode === "multiselect" ? "bg-white shadow-sm text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <ListChecks size={13} />
                        </button>
                      </div>

                      {/* Refrescar */}
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

          {/* ══════════════════════════════════════════════════
              VISTA LISTA — tabla densa compacta
          ══════════════════════════════════════════════════ */}
          {viewMode === "list" && (
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <Th label="Año"                    sk="anio"          sort={sort} dir={dir} onSort={handleSort} className="w-14 pl-4" />
                  <Th label="Núm. Exp"               sk="num_exp"        sort={sort} dir={dir} onSort={handleSort} className="w-16" />
                  <Th label="Ref. Propia"                                 sort={sort} dir={dir} onSort={handleSort} className="w-24" />
                  <Th label="Descripción Expediente" sk="descripcion"    sort={sort} dir={dir} onSort={handleSort} className="min-w-[180px]" />
                  <Th label="Tipo de Expediente"     sk="tipo"           sort={sort} dir={dir} onSort={handleSort} className="w-40" />
                  <Th label="Cliente"                sk="cliente_nombre" sort={sort} dir={dir} onSort={handleSort} className="w-36" />
                  <Th label="Contrario"              sk="contrario"      sort={sort} dir={dir} onSort={handleSort} className="w-36" />
                  <Th label="Procurador Propio"                          sort={sort} dir={dir} onSort={handleSort} className="w-32 hidden xl:table-cell" />
                  <Th label="Juzgado Principal"      sk="juzgado"        sort={sort} dir={dir} onSort={handleSort} className="w-44 hidden lg:table-cell" />
                  <Th label="Tipo Procedimiento"                         sort={sort} dir={dir} onSort={handleSort} className="w-28 hidden xl:table-cell" />
                  <Th label="Núm. Autos"                                 sort={sort} dir={dir} onSort={handleSort} className="w-24 hidden lg:table-cell" />
                  <Th label="NIG"                                        sort={sort} dir={dir} onSort={handleSort} className="w-28 hidden xl:table-cell" />
                  <Th label="Estado"                 sk="estado"         sort={sort} dir={dir} onSort={handleSort} className="w-24" />
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-20 text-center">
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
                  return (
                    <tr
                      key={exp.id}
                      onClick={() => setSelected(isSel ? null : exp.id)}
                      onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors group
                        ${isSel ? "bg-red-50 border-l-2 border-l-red-500" : "hover:bg-slate-50/80"}`}
                    >
                      {/* Año */}
                      <td className={`pl-4 pr-3 py-3 font-mono ${isSel ? "text-red-400" : "text-slate-400"}`}>{exp.anio}</td>

                      {/* Núm */}
                      <td className="px-3 py-3">
                        <span className={`font-extrabold text-base ${isSel ? "text-red-700" : "text-red-600"}`}>{exp.num_exp}</span>
                      </td>

                      {/* Ref */}
                      <td className="px-3 py-3 font-mono text-slate-400">
                        {exp.ref_propia || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Descripción */}
                      <td className="px-3 py-3">
                        <span className={`font-semibold truncate block max-w-[220px] ${isSel ? "text-red-700" : "text-slate-800"}`}>
                          {exp.descripcion || <span className="text-slate-300 font-normal">Sin descripción</span>}
                        </span>
                      </td>

                      {/* Tipo */}
                      <td className="px-3 py-3 text-xs text-slate-600 uppercase whitespace-nowrap font-medium">
                        {tipoConf.label}
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-3">
                        {exp.cliente_id ? (
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/dashboard/clientes/${exp.cliente_id}`); }}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-left truncate block max-w-[130px]">
                            {exp.cliente_nombre || "Ver"}
                          </button>
                        ) : (
                          <span className="text-slate-400 truncate block max-w-[130px]">
                            {exp.cliente_nombre || <span className="text-slate-200">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Contrario */}
                      <td className="px-3 py-3 text-slate-500 truncate max-w-[130px]">
                        {exp.contrario || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Procurador */}
                      <td className="px-3 py-3 text-slate-400 hidden xl:table-cell truncate max-w-[120px]">
                        {exp.procurador || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Juzgado */}
                      <td className="px-3 py-3 text-slate-400 hidden lg:table-cell truncate max-w-[150px]">
                        {exp.juzgado || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Tipo proc */}
                      <td className="px-3 py-3 text-slate-400 uppercase hidden xl:table-cell whitespace-nowrap">
                        {exp.tipo_proc || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Núm. Autos */}
                      <td className="px-3 py-3 font-mono text-slate-400 hidden lg:table-cell">
                        {exp.num_autos || <span className="text-slate-200">—</span>}
                      </td>

                      {/* NIG */}
                      <td className="px-3 py-3 font-mono text-slate-300 hidden xl:table-cell">
                        {exp.nig ? <span title={exp.nig}>{exp.nig.slice(0,12)}{exp.nig.length > 12 ? "…" : ""}</span> : <span className="text-slate-200">—</span>}
                      </td>

                      {/* Estado */}
                      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {estadoConf.label}
                      </td>

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
          ══════════════════════════════════════════════════ */}
          {viewMode === "detail" && (
            <div className="overflow-auto flex-1 p-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                  <FolderOpen size={36} className="opacity-15" />
                  <p className="font-medium text-sm">{hasActiveFilters || filters.length > 1 ? "No hay expedientes con esos filtros" : "No hay expedientes todavía"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(exp => {
                    const tipoConf   = TIPOS[exp.tipo]   || TIPOS.otro;
                    const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                    const isSel = selected === exp.id;
                    return (
                      <div
                        key={exp.id}
                        onClick={() => setSelected(isSel ? null : exp.id)}
                        onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                        className={`rounded-xl border cursor-pointer transition-all ${isSel ? "border-red-300 bg-red-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}
                      >
                        <div className="px-4 py-3 flex items-center gap-4">
                          <div className="shrink-0 w-20 text-right">
                            <span className={`font-extrabold text-base ${isSel ? "text-red-600" : "text-red-500"}`}>{exp.anio}/{exp.num_exp}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${isSel ? "text-red-800" : "text-slate-800"}`}>{exp.descripcion || "Sin descripción"}</p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {exp.cliente_nombre && <span className="text-emerald-600 font-medium">{exp.cliente_nombre}</span>}
                              {exp.contrario && <><span className="mx-1 text-slate-300">vs</span><span className="text-red-500">{exp.contrario}</span></>}
                              {exp.juzgado && <><span className="mx-1 text-slate-200">·</span><span>{exp.juzgado}</span></>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tipoConf.color}`}>{tipoConf.short}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${estadoConf.color}`}>{estadoConf.label}</span>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/dashboard/expedientes/${exp.id}`); }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              VISTA MULTISELECT — cuadrícula de tarjetas
          ══════════════════════════════════════════════════ */}
          {viewMode === "multiselect" && (
            <div className="overflow-auto flex-1 p-4">
              <div className="mb-3 px-1">
                <span className="text-xs text-slate-400">{filtered.length} expedientes</span>
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                  <FolderOpen size={36} className="opacity-15" />
                  <p className="font-medium text-sm">{hasActiveFilters || filters.length > 1 ? "No hay expedientes con esos filtros" : "No hay expedientes todavía"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filtered.map(exp => {
                    const isSel = selected === exp.id;
                    const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
                    return (
                      <div
                        key={exp.id}
                        onClick={() => setSelected(isSel ? null : exp.id)}
                        onDoubleClick={() => navigate(`/dashboard/expedientes/${exp.id}`)}
                        className={`rounded-xl border cursor-pointer p-3 flex flex-col gap-1.5 transition-all ${isSel ? "border-red-300 bg-red-50 shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}
                      >
                        <div className={`text-xs font-extrabold ${isSel ? "text-red-600" : "text-red-500"}`}>{exp.anio}/{exp.num_exp}</div>
                        <p className="text-xs font-semibold text-slate-700 line-clamp-2 leading-snug">{exp.descripcion || "Sin descripción"}</p>
                        {exp.cliente_nombre && <p className="text-[10px] text-emerald-600 truncate font-medium">{exp.cliente_nombre}</p>}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full self-start mt-auto ${estadoConf.color}`}>{estadoConf.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Barra de estado inferior ─────────────────────── */}
          <div className="flex items-center gap-6 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 shrink-0">
            <span><span className="font-semibold text-slate-700">Total expedientes:</span> <span className="font-mono">{stats.total.toLocaleString("es-ES")}</span></span>
            <span><span className="font-semibold text-emerald-600">Abiertos:</span> <span className="font-mono">{stats.abiertos}</span></span>
            <span><span className="font-semibold text-slate-500">Cerrados:</span> <span className="font-mono">{stats.cerrados}</span></span>
            <span><span className="font-semibold text-amber-500">Suspendidos:</span> <span className="font-mono">{stats.suspendidos}</span></span>
            <span><span className="font-semibold text-red-600">Año {new Date().getFullYear()}:</span> <span className="font-mono">{stats.esteAnio}</span></span>
            {hasActiveFilters && (
              <span className="text-amber-600 font-medium">↳ Mostrando {filtered.length} de {expedientes.length} con filtros activos</span>
            )}
            <span className="ml-auto text-slate-300">Doble clic para abrir · Enter abre seleccionado · Ctrl+F para filtrar</span>
          </div>

        </div>
      </div>
    </>
  );
}
