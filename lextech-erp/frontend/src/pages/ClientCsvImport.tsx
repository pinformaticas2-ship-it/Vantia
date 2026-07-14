/**
 * Importar Clientes desde CSV — asistente de 3 pasos (subir → mapear columnas → revisar e importar),
 * mas historial de lotes y detalle de errores. Replica el mismo patron ya usado para Expedientes
 * (ver ExpedienteList.tsx), adaptado a los campos de un cliente (`entities`).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet, Upload, Download, ListChecks, AlertCircle, Check, CheckCircle2,
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight,
  Eye, RefreshCw, History, Loader2, X,
} from "lucide-react";
import BackButton from "../components/BackButton";
import { safeJson } from "../lib/api";

// ─── Tipos ──────────────────────────────────────────────────────────────────

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
  created_entity_id?: string | null;
}

type ClientCsvViewMode =
  | "upload" | "configure" | "review" | "complete" | "errorDetail" | "history" | "historyDetail";

interface ImportBatchItem {
  id: string;
  row_number: number | null;
  reference: string | null;
  status: "uploaded" | "processing" | "completed" | "failed";
  error_message: string | null;
  payload: Record<string, any> | null;
  created_entity_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ImportBatchDetail extends ImportBatch {
  items: ImportBatchItem[];
}

// ─── Definicion de campos + plantilla ──────────────────────────────────────

const CSV_UNASSIGNED = "Sin asignar";

const CSV_FIELD_DEFINITIONS: CsvFieldDefinition[] = [
  { id: "first_name",       label: "Nombre",             help: "Nombre de pila del cliente",                    required: true,  aliases: ["nombre", "first name", "first_name", "nombre cliente"] },
  { id: "last_name",        label: "Apellidos",          help: "Apellidos del cliente",                                          aliases: ["apellidos", "apellido", "last name", "last_name"] },
  { id: "commercial_name",  label: "Nombre comercial",   help: "Razón social o nombre de la empresa",                            aliases: ["nombre comercial", "empresa", "razon social", "razón social", "compania", "compañía"] },
  { id: "nif_cif",          label: "NIF / CIF",          help: "Documento de identificación fiscal",            required: true,  aliases: ["nif", "cif", "nif cif", "nif/cif", "dni", "documento", "identificacion"] },
  { id: "email",            label: "Email",              help: "Correo electrónico de contacto",                                 aliases: ["email", "correo", "correo electronico", "correo electrónico", "e-mail"] },
  { id: "phone_mobile",     label: "Teléfono móvil",     help: "Número de móvil de contacto",                                    aliases: ["telefono", "teléfono", "movil", "móvil", "celular", "phone", "telefono movil"] },
  { id: "phone_1",          label: "Teléfono fijo",      help: "Número de teléfono fijo",                                        aliases: ["telefono fijo", "teléfono fijo", "fijo"] },
  { id: "address_street",   label: "Dirección",          help: "Calle y número",                                                 aliases: ["direccion", "dirección", "calle", "domicilio"] },
  { id: "address_town",     label: "Población",          help: "Municipio o ciudad",                                             aliases: ["poblacion", "población", "ciudad", "municipio", "localidad"] },
  { id: "address_cp",       label: "Código postal",      help: "Código postal",                                                  aliases: ["cp", "codigo postal", "código postal", "postal"] },
  { id: "address_province", label: "Provincia",          help: "Provincia",                                                      aliases: ["provincia"] },
  { id: "client_status",    label: "Estado",             help: "Estado del cliente (Alta/Baja)",                                 aliases: ["estado", "situacion", "situación", "status"] },
  { id: "date_alta",        label: "Fecha de alta",      help: "Fecha de alta (DD/MM/YYYY o YYYY-MM-DD)",                        aliases: ["fecha alta", "fecha de alta", "alta", "fecha"] },
  { id: "website",          label: "Web",                help: "Página web",                                                     aliases: ["web", "website", "sitio web", "pagina web", "página web"] },
];

function downloadCsvTemplate() {
  const SEP = ";";
  const BOM = "﻿";

  type TemplateRow = { header: string; s1: string; s2: string; s3: string };

  const fields: TemplateRow[] = [
    { header: "Nombre",           s1: "Juan",                    s2: "María",                    s3: "Empresa Ejemplo" },
    { header: "Apellidos",        s1: "García López",            s2: "Fernández Ruiz",            s3: "" },
    { header: "NIF / CIF",        s1: "12345678A",               s2: "87654321B",                 s3: "B12345678" },
    { header: "Email",            s1: "juan@ejemplo.com",        s2: "maria@ejemplo.com",         s3: "info@empresa.com" },
    { header: "Teléfono móvil",   s1: "612345678",                s2: "699887766",                 s3: "911234567" },
    { header: "Población",        s1: "Madrid",                   s2: "Barcelona",                  s3: "Valencia" },
    { header: "Fecha de alta",    s1: "01/01/2026",               s2: "15/02/2026",                 s3: "10/03/2026" },
  ];

  const header = fields.map(f => f.header).join(SEP);
  const row1   = fields.map(f => f.s1).join(SEP);
  const row2   = fields.map(f => f.s2).join(SEP);
  const row3   = fields.map(f => f.s3).join(SEP);

  const csv = BOM + [header, row1, row2, row3].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_clientes.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Parseo de CSV (generico, sin dependencias de clientes/expedientes) ────

function normalizeCsvHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
    .replace(/^﻿/, "")
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

function getCsvMappedValue(row: CsvPreviewRow, mappings: CsvFieldMapping[], fieldId: string) {
  const mapping = mappings.find((item) => item.id === fieldId);
  if (!mapping || mapping.selected === CSV_UNASSIGNED) return "";
  return (row[mapping.selected] || "").trim();
}

function parseCsvDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeClientStatus(value: string) {
  const normalized = normalizeCsvHeader(value);
  if (normalized.includes("baja") || normalized.includes("inactiv")) return "Baja";
  return "Alta";
}

function buildClientPayload(row: CsvPreviewRow, mappings: CsvFieldMapping[]) {
  const firstName        = getCsvMappedValue(row, mappings, "first_name");
  const lastName          = getCsvMappedValue(row, mappings, "last_name");
  const commercialName    = getCsvMappedValue(row, mappings, "commercial_name");
  const nifCif             = getCsvMappedValue(row, mappings, "nif_cif");
  const email              = getCsvMappedValue(row, mappings, "email");
  const phoneMobile        = getCsvMappedValue(row, mappings, "phone_mobile");
  const phone1             = getCsvMappedValue(row, mappings, "phone_1");
  const addressStreet      = getCsvMappedValue(row, mappings, "address_street");
  const addressTown        = getCsvMappedValue(row, mappings, "address_town");
  const addressCp          = getCsvMappedValue(row, mappings, "address_cp");
  const addressProvince    = getCsvMappedValue(row, mappings, "address_province");
  const statusRaw          = getCsvMappedValue(row, mappings, "client_status");
  const dateAltaRaw        = getCsvMappedValue(row, mappings, "date_alta");
  const website            = getCsvMappedValue(row, mappings, "website");

  const today = new Date().toISOString().slice(0, 10);

  return {
    type: "CLIENTE",
    client_status: statusRaw ? normalizeClientStatus(statusRaw) : "Alta",
    document_type: "DNI",
    first_name: firstName || "Sin nombre",
    last_name: lastName || null,
    commercial_name: commercialName || null,
    nif_cif: nifCif,
    email: email || null,
    phone_1: phone1 || null,
    phone_mobile: phoneMobile || null,
    address_street: addressStreet || null,
    address_town: addressTown || null,
    address_cp: addressCp || null,
    address_province: addressProvince || null,
    website: website || null,
    date_alta: parseCsvDate(dateAltaRaw) ?? today,
  };
}

function validateCsvImport(mappings: CsvFieldMapping[], rows: CsvPreviewRow[]): CsvImportSummary {
  const issues: CsvImportIssue[] = [];

  const nifMapping = mappings.find(m => m.id === "nif_cif");
  if (nifMapping && nifMapping.selected !== CSV_UNASSIGNED) {
    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      const val = (row[nifMapping.selected] || "").trim().toLowerCase();
      if (!val) return;
      if (seen.has(val)) {
        issues.push({
          rowNumber: index + 1,
          fieldId: "nif_cif",
          fieldLabel: "NIF / CIF",
          message: `NIF/CIF duplicado en el CSV (ya aparece en fila ${seen.get(val)})`,
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

  return { totalProcessed, successCount, errorCount, successRate, issues };
}

function fmtDateTime(d: string | null) {
  if (!d) return "?";
  return new Date(d).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function importStatusMeta(status: string) {
  switch (status) {
    case "completed":   return { label: "Completada",  className: "bg-emerald-100 text-emerald-700" };
    case "failed":       return { label: "Con errores", className: "bg-red-100 text-red-700" };
    case "processing":   return { label: "Procesando",  className: "bg-amber-100 text-amber-700" };
    case "reviewing":    return { label: "Revisando",   className: "bg-blue-100 text-blue-700" };
    case "configuring":  return { label: "Configurando", className: "bg-violet-100 text-violet-700" };
    default:              return { label: "Subido",      className: "bg-slate-100 text-slate-700" };
  }
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function ImportStep({ step, label, active = false, completed = false, first = false, last = false }: {
  step: number; label: string; active?: boolean; completed?: boolean; first?: boolean; last?: boolean;
}) {
  return (
    <div className={`relative z-10 flex items-center gap-3 bg-white ${first ? "pr-4" : last ? "pl-4" : "px-4"}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        completed ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
        : active ? "bg-red-600 text-white shadow-md shadow-red-500/30"
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

function CsvFieldRow({ field, options, invalid = false, onChange }: {
  field: CsvFieldMapping; options: string[]; invalid?: boolean; onChange: (id: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [openUpward, setOpenUpward] = useState(false);
  const isMapped = field.selected !== CSV_UNASSIGNED;

  useEffect(() => {
    if (!open) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const MENU_MAX_H = 248;
      const spaceBelow = window.innerHeight - r.bottom;
      const goUp = spaceBelow < MENU_MAX_H && r.top > MENU_MAX_H;
      setOpenUpward(goUp);
      setPos({ top: goUp ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width });
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
            style={{
              position: "fixed", left: pos.left, width: pos.width, zIndex: 9999,
              ...(openUpward ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
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
                      isSelected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
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

// ─── Paso 1: Subir archivo ──────────────────────────────────────────────────

function CsvImportUploadView({
  fileName, onBack, onOpenHistory, onSelectFile, onFileChange, inputRef,
}: {
  fileName: string | null;
  onBack: () => void;
  onOpenHistory: () => void;
  onSelectFile: () => void;
  onFileChange: (file?: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />

      <div className="px-6 sm:px-8 py-5 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-100 flex-shrink-0">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 leading-none tracking-tight mb-1">Importar clientes</h1>
            <p className="text-xs font-medium text-slate-500">Carga masiva desde archivo CSV (Paso 1 de 3)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onOpenHistory}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
            <History size={13} className="text-slate-400" /> Historial
          </button>
          <button onClick={onBack}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
            <ArrowLeft size={13} /> Volver
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 py-4 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-10">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 z-0" />
          <ImportStep step={1} label="Subir archivo" active first />
          <ImportStep step={2} label="Configurar columnas" />
          <ImportStep step={3} label="Revisar e Importar" last />
        </div>
      </div>

      <div className="modules-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1500px] mx-auto w-full flex flex-col xl:flex-row gap-6 items-stretch">

          <div className="flex-1 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
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
                  isDragging ? "border-red-400 bg-red-50/50"
                  : fileName ? "border-emerald-300 bg-emerald-50/20"
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
                  El archivo no debe superar los 10MB. Asegúrate de haber rellenado los datos utilizando la plantilla.
                </p>
                {!fileName && (
                  <div className="mt-8 px-6 py-2 bg-white border border-slate-200 rounded-md text-sm font-semibold text-slate-700 shadow-sm group-hover:border-red-300 group-hover:text-red-600 transition-colors">
                    Explorar archivos
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full xl:w-[450px] flex flex-col gap-6 flex-shrink-0">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/80">
                <FileSpreadsheet size={14} className="text-emerald-600" />
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Plantilla para Excel</h3>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-xs text-slate-500">Descarga, rellena en Excel y sube el archivo en el panel izquierdo. Borra las filas de ejemplo antes de importar.</p>
                <button onClick={() => downloadCsvTemplate()}
                  className="group flex items-start gap-4 p-4 rounded-lg border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all shadow-sm text-left">
                  <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                    <Download size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Plantilla de clientes</span>
                    <span className="text-[11px] text-slate-500 mt-1 leading-relaxed">Nombre, NIF/CIF, email, teléfono, población, fecha de alta.</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex-1">
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
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> <strong>Nombre</strong> y <strong>NIF/CIF</strong> (obligatorios)</li>
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> Email y teléfono</li>
                  <li className="flex items-center gap-2.5"><Check size={10} className="text-emerald-500 shrink-0" /> Dirección, población, provincia</li>
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

      <div className="bg-white border-t border-slate-200 px-6 sm:px-10 py-4 flex items-center justify-between flex-shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
        <button onClick={onBack} className="px-5 py-2.5 text-sm font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors">
          Cancelar
        </button>
        <button disabled={!fileName} onClick={onSelectFile}
          className="px-6 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-black rounded-md shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          Siguiente paso: Configurar <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Paso 2: Mapear columnas ────────────────────────────────────────────────

function CsvImportConfigureView({
  fileName, csvHeaders, mappings, onBack, onContinue, onOpenHistory, onSelectFile, onChangeMapping, onFileChange, inputRef,
}: {
  fileName: string | null;
  csvHeaders: string[];
  mappings: CsvFieldMapping[];
  onBack: () => void;
  onContinue: () => void;
  onOpenHistory: () => void;
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
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />

      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Importar clientes</h1>
              <p className="text-sm text-slate-500">Configuración y mapeo de las columnas del archivo subido</p>
            </div>
          </div>
          <button onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 flex-shrink-0">
            <ChevronLeft size={16} /> Volver a inicio
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-b border-slate-200 py-4 shadow-sm">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-10">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 z-0" />
          <ImportStep step={1} label="Subir archivo" completed first />
          <ImportStep step={2} label="Configurar columnas" active />
          <ImportStep step={3} label="Revisar e Importar" last />
        </div>
      </div>

      <div className="flex-shrink-0 bg-slate-50 border-b border-slate-200 px-6 lg:px-8 py-3">
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
          <button onClick={onSelectFile}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white">
            <RefreshCw size={13} /> Cambiar archivo
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 flex flex-col gap-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Conecta las columnas de tu archivo</h2>
            <p className="mt-2 text-sm text-slate-500 max-w-2xl">
              Indica qué columna de tu CSV corresponde a cada campo del sistema. Los campos obligatorios deben estar asignados para poder continuar. Hemos detectado automáticamente las columnas que mejor coinciden.
            </p>
          </div>

          <div>
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
                <div className="col-span-5">Campo en Vantia</div>
                <div className="col-span-4">Columna en tu CSV</div>
                <div className="col-span-3 text-right">Ejemplo de tus datos</div>
              </div>
              {requiredFields.map((field) => (
                <CsvFieldRow key={field.id} field={field} options={mappingOptions} invalid={field.selected === CSV_UNASSIGNED} onChange={onChangeMapping} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Campos opcionales</h3>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {assignedOptional} de {optionalFields.length} asignados
              </span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 gap-6 py-3 border-b border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-5">Campo en Vantia</div>
                <div className="col-span-4">Columna en tu CSV</div>
                <div className="col-span-3 text-right">Ejemplo de tus datos</div>
              </div>
              {visibleOptional.map((field) => (
                <CsvFieldRow key={field.id} field={field} options={mappingOptions} onChange={onChangeMapping} />
              ))}
              {!showAllOptional && hiddenOptionalCount > 0 && (
                <button type="button" onClick={() => setShowAllOptional(true)}
                  className="w-full py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-100 flex items-center justify-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold leading-none">+</span>
                  Mostrar {hiddenOptionalCount} campos opcionales más
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 lg:px-8 py-4 shadow-sm">
        <div className="flex items-center justify-between max-w-[1200px] mx-auto">
          <button type="button" onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
            <ChevronLeft size={16} /> Atrás
          </button>
          <button type="button" onClick={onContinue} disabled={!canContinue}
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold shadow-sm transition-all ${
              canContinue ? "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md" : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
            }`}>
            Siguiente paso: Revisar <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Paso 3: Revisar e importar ─────────────────────────────────────────────

function CsvImportReviewView({
  fileName, mappings, previewRows, validationSummary, importProgress, onBack, onImport,
}: {
  fileName: string | null;
  mappings: CsvFieldMapping[];
  previewRows: CsvPreviewRow[];
  validationSummary: CsvImportSummary;
  importProgress: { done: number; total: number } | null;
  onBack: () => void;
  onImport: () => void;
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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Importar clientes</h1>
              <p className="text-sm text-slate-500">Revisa los datos mapeados antes de confirmar la importación final</p>
            </div>
          </div>
          <button onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 flex-shrink-0">
            <ChevronLeft size={16} /> Volver a inicio
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-b border-slate-200 py-4 shadow-sm">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-10">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-slate-100 z-0" />
          <ImportStep step={1} label="Subir archivo" completed first />
          <ImportStep step={2} label="Configurar columnas" completed />
          <ImportStep step={3} label="Revisar e Importar" active last />
        </div>
      </div>

      <div className={`flex-shrink-0 border-b px-6 lg:px-8 py-5 ${hasIssues ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"}`}>
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
            {hasIssues ? <AlertTriangle size={14} className="text-amber-500" /> : <Check size={14} className="text-emerald-500" />}
            <span className={`text-sm font-bold ${hasIssues ? "text-amber-700" : "text-emerald-700"}`}>
              {hasIssues
                ? `${previewRows.length} registros — ${validationSummary.issues.length} ${validationSummary.issues.length === 1 ? "aviso" : "avisos"}`
                : `${previewRows.length} registros listos para importar`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 lg:px-8 py-4 bg-white border-b border-slate-100 flex items-center gap-2">
          <Eye size={15} className="text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Vista previa de los primeros registros</h3>
        </div>
        <div className="flex-1 overflow-auto bg-slate-50/30">
          <table className="w-full min-w-[1100px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <tr>
                <th className="pl-6 lg:pl-8 pr-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">NIF / CIF</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Email</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Teléfono</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Población</th>
                <th className="pr-6 lg:pr-8 pl-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Fecha alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {previewRows.map((row, idx) => {
                const rowHasError = validationSummary.issues.some((i) => i.rowNumber === idx + 1);
                const nombre = [getMappedValue(row, "first_name"), getMappedValue(row, "last_name")].filter(v => v !== "-").join(" ") || "-";
                return (
                  <tr key={idx} className={`transition-colors ${rowHasError ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-slate-50"}`}>
                    <td className="pl-6 lg:pl-8 pr-4 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">{nombre}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "nif_cif")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "email")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "phone_mobile") !== "-" ? getMappedValue(row, "phone_mobile") : getMappedValue(row, "phone_1")}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "address_town")}</td>
                    <td className="pr-6 lg:pr-8 pl-4 py-4 whitespace-nowrap text-sm text-slate-700">{getMappedValue(row, "date_alta")}</td>
                  </tr>
                );
              })}
              {previewRows.length === 0 && (
                <tr><td colSpan={6} className="py-14 text-center text-sm text-slate-400">Sin registros para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 lg:px-8 py-4 shadow-sm">
        {importProgress ? (
          <div>
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2 text-blue-700">
                <Loader2 size={15} className="animate-spin" />
                <span className="text-sm font-semibold">Importando clientes…</span>
              </div>
              <span className="text-sm font-bold text-blue-700">{importProgress.done} / {importProgress.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
              <ChevronLeft size={16} /> Volver
            </button>
            <button type="button" onClick={onImport}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 text-sm font-bold shadow-md shadow-red-500/20 transition-all border border-red-700">
              <Upload size={15} /> Importar clientes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pantalla de resultado ───────────────────────────────────────────────────

function CsvImportCompleteView({
  fileName, summary, onBack, onViewDetails, onRestart, onFinish,
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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0">
        <BackButton onClick={onBack} />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-900 leading-tight">Importar clientes</h1>
          <p className="text-xs text-slate-400 truncate">{fileName || "archivo.csv"}</p>
        </div>
        <button type="button" onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 shrink-0">
          <RefreshCw size={14} /> Nueva importación
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className={`relative overflow-hidden rounded-2xl px-6 py-5 text-white ${
          hasErrors ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-emerald-500 to-teal-600"
        }`}>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 h-28 w-28 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {hasErrors ? <AlertCircle size={22} strokeWidth={2.5} /> : <Check size={22} strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold leading-tight">{hasErrors ? "Importación con incidencias" : "Importación completada"}</h2>
              <p className="mt-0.5 text-sm text-white/80 truncate">{totalProcessed} registros procesados</p>
            </div>
            <div className="shrink-0 rounded-xl bg-white/20 px-4 py-2 text-center">
              <p className="text-xl font-bold leading-none">{successRate}%</p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/80 uppercase tracking-wide">éxito</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/70 transition-all duration-700" style={{ width: `${successRate}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center"><Check size={14} className="text-emerald-600" /></div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Importados</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{successCount}</p>
            <p className="mt-1 text-xs text-slate-500">clientes correctos</p>
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
              <button type="button" onClick={onViewDetails}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50">
                <Eye size={12} /> Ver detalles
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-sky-100 flex items-center justify-center"><FileSpreadsheet size={14} className="text-sky-600" /></div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{totalProcessed}</p>
            <p className="mt-1 text-xs text-slate-500">registros revisados</p>
          </div>
        </div>

        {hasErrors && (
          <div className="rounded-2xl border border-red-100 bg-white p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm font-bold text-slate-900">Detalle de errores</p>
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 border border-red-100">{issues.length} incidencias</span>
            </div>
            <div className="space-y-2">
              {visibleIssues.map((issue, index) => (
                <div key={`${issue.rowNumber}-${issue.fieldId}-${index}`} className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2.5">
                  <p className="text-xs font-semibold text-slate-700">Fila {issue.rowNumber} · {issue.fieldLabel}</p>
                  <p className="mt-0.5 text-xs text-red-600">{issue.message}</p>
                </div>
              ))}
              {issues.length > visibleIssues.length && (
                <p className="text-xs text-slate-400 pt-1">+{issues.length - visibleIssues.length} incidencias adicionales — usa "Ver detalles" para verlas todas.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700">
            <RefreshCw size={14} /> Nueva importación
          </button>
          <button type="button" onClick={onFinish}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700">
            <Check size={14} /> Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detalle de errores ──────────────────────────────────────────────────────

function CsvImportErrorDetailView({
  fileName, batchId, summary, previewRows, mappings, onBack,
}: {
  fileName: string | null;
  batchId: string | null;
  summary: CsvImportSummary;
  previewRows: CsvPreviewRow[];
  mappings: CsvFieldMapping[];
  onBack: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | "error" | "ok">("all");
  const { totalProcessed, successCount, errorCount, issues } = summary;
  const completedPct = totalProcessed > 0 ? Math.round((successCount / totalProcessed) * 100) : 0;
  const errorPct = totalProcessed > 0 ? Math.round((errorCount / totalProcessed) * 100) : 0;

  const records = previewRows.map((row, index) => {
    const rowNumber = index + 1;
    const rowIssues = issues.filter((issue) => issue.rowNumber === rowNumber);
    const nombre = [getCsvMappedValue(row, mappings, "first_name"), getCsvMappedValue(row, mappings, "last_name")].filter(Boolean).join(" ") || "-";
    return {
      rowNumber,
      status: rowIssues.length ? "error" : "ok",
      nombre,
      nif: getCsvMappedValue(row, mappings, "nif_cif") || "-",
      email: getCsvMappedValue(row, mappings, "email") || "-",
      errors: rowIssues.map((issue) => `${issue.fieldLabel}: ${issue.message}`).join(" · "),
    };
  });
  const filteredRecords = records.filter((record) => (statusFilter === "all" ? true : record.status === statusFilter));

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900">Detalles de importación</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              Lote {batchId ? `${batchId.slice(0, 8)}...` : "Temporal"}
            </span>
            <span>{fileName || "archivo.csv"}</span>
          </div>
        </div>
        <BackButton onClick={onBack} label="Volver" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Estado del lote</p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">Importación con incidencias</h2>
              </div>
              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">Error</span>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-900">Tasa de éxito</span>
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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Resumen numérico</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completados</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{successCount}</p>
              </div>
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errores</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{errorCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{totalProcessed}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="rounded-[24px] border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-900">Registros</p>
            <div className="flex items-center gap-1.5">
              {(["all", "error", "ok"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setStatusFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    statusFilter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {f === "all" ? "Todos" : f === "error" ? "Con error" : "Correctos"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Fila</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">NIF/CIF</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => (
                  <tr key={r.rowNumber} className={r.status === "error" ? "bg-red-50/50" : ""}>
                    <td className="px-4 py-3 text-sm text-slate-500">{r.rowNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{r.nombre}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.nif}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.email}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.status === "error" ? (
                        <span className="text-red-600 font-medium">{r.errors}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><Check size={11} /> Correcto</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">Sin registros que mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Histórico de lotes ──────────────────────────────────────────────────────

function CsvImportHistoryView({ rows, loading, error, onBack, onReload, onSelectBatch }: {
  rows: ImportBatch[]; loading: boolean; error: string | null; onBack: () => void; onReload: () => void;
  onSelectBatch: (batchId: string) => void;
}) {
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
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold ${importStatusMeta(row.status).className}`}>
        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" /> {importStatusMeta(row.status).label}
      </span>
    );
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 lg:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 leading-tight">Historial de importaciones</h1>
          <p className="text-sm text-slate-500 mt-1">Historial de todas las importaciones de clientes realizadas</p>
        </div>
        <button onClick={onBack}
          className="w-max px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm flex items-center gap-2">
          <ArrowLeft size={14} /> Volver
        </button>
      </div>

      <div className="px-6 lg:px-8 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 flex-shrink-0">
        <h3 className="text-sm font-bold text-slate-800">Importaciones recientes</h3>
        <button onClick={onReload}
          className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
          <RefreshCw size={13} className="text-slate-400" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="px-6 lg:px-8 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700 flex-shrink-0">{error}</div>
      )}

      <div className="modules-scrollbar flex-1 min-h-0 overflow-auto">
        <table className="w-full min-w-[900px] text-left border-collapse">
          <thead className="sticky top-0 bg-white border-b border-slate-200 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <tr>
              <th className="pl-6 lg:pl-8 pr-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Completados</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Errores</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Archivo</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-20 text-center text-slate-400">
                <div className="flex items-center justify-center gap-3"><Loader2 size={18} className="animate-spin" /><span>Cargando importaciones...</span></div>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-20 text-center text-slate-400">No hay importaciones registradas</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} onClick={() => onSelectBatch(row.id)}
                  className={`group cursor-pointer transition-colors ${row.error_count > 0 ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/80"}`}>
                  <td className="pl-6 lg:pl-8 pr-6 py-4 whitespace-nowrap text-[13px] text-slate-700 font-medium">{fmtDateTime(row.created_at)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{statusBadge(row)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-[13px] text-slate-600 font-semibold">{row.total_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-[13px] text-emerald-600 font-semibold">{row.completed_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {row.error_count > 0 ? (
                      <span className="text-[13px] text-red-600 font-bold flex items-center gap-1.5">{row.error_count} <AlertCircle size={11} /></span>
                    ) : (
                      <span className="text-[13px] text-slate-400 font-medium">0</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[13px] text-slate-500 max-w-[220px] truncate" title={row.notes || row.file_name}>{row.file_name}</td>
                  <td className="pr-6 lg:pr-8 pl-2 py-4 text-slate-300 group-hover:text-red-500 transition-colors"><ChevronRight size={15} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detalle de un lote del historial (ver filas, reintentar, deshacer) ─────
function CsvImportHistoryDetailView({
  batch, loading, error, retrying, retryProgress, undoing, onBack, onRetryFailed, onUndo,
}: {
  batch: ImportBatchDetail | null;
  loading: boolean;
  error: string | null;
  retrying: boolean;
  retryProgress: { done: number; total: number } | null;
  undoing: boolean;
  onBack: () => void;
  onRetryFailed: () => void;
  onUndo: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | "error" | "ok">("all");

  const failedCount = batch?.items.filter((it) => it.status === "failed").length ?? 0;
  const completedItems = batch?.items.filter((it) => it.status === "completed" && it.created_entity_id) ?? [];
  const canUndo = completedItems.length > 0;

  const itemName = (it: ImportBatchItem) => {
    const p = it.payload || {};
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || it.reference || "-";
  };

  const filteredItems = (batch?.items ?? []).filter((it) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "error") return it.status === "failed";
    return it.status === "completed";
  });

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-900">Detalle de la importación</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{batch?.file_name || "archivo.csv"}</span>
            {batch && <span>· {fmtDateTime(batch.created_at)}</span>}
          </div>
        </div>
        <BackButton onClick={onBack} label="Volver al historial" />
      </div>

      {error && (
        <div className="flex-shrink-0 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-slate-400 py-20">
          <Loader2 size={18} className="animate-spin" /> Cargando detalle...
        </div>
      ) : batch ? (
        <>
          <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{batch.total_count}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completados</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{batch.completed_count}</p>
            </div>
            <div className="rounded-2xl bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errores</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{batch.error_count}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{importStatusMeta(batch.status).label}</p>
            </div>
          </div>

          {batch.notes && (
            <p className="flex-shrink-0 text-xs text-slate-400 italic">{batch.notes}</p>
          )}

          <div className="flex-shrink-0 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onRetryFailed} disabled={failedCount === 0 || retrying}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-bold shadow-sm transition-colors">
              {retrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {retrying && retryProgress ? `Reintentando ${retryProgress.done}/${retryProgress.total}...` : `Reintentar fallidas (${failedCount})`}
            </button>
            <button type="button" onClick={onUndo} disabled={!canUndo || undoing}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed text-red-600 px-4 py-2.5 text-sm font-bold transition-colors">
              {undoing ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Deshacer importación ({completedItems.length})
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col rounded-[24px] border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Filas ({filteredItems.length})</p>
              <div className="flex items-center gap-1.5">
                {(["all", "error", "ok"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setStatusFilter(f)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {f === "all" ? "Todas" : f === "error" ? "Con error" : "Correctas"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Fila</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">NIF/CIF</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((it) => (
                    <tr key={it.id} className={it.status === "failed" ? "bg-red-50/50" : ""}>
                      <td className="px-4 py-3 text-sm text-slate-500">{it.row_number ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 font-medium">{itemName(it)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{it.reference || "-"}</td>
                      <td className="px-4 py-3 text-xs">
                        {it.status === "failed" ? (
                          <span className="text-red-600 font-medium">{it.error_message}</span>
                        ) : it.status === "completed" && !it.created_entity_id ? (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-semibold"><AlertTriangle size={11} /> Deshecha</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><Check size={11} /> Correcto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-400">Sin filas que mostrar</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function ClientCsvImport() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<ClientCsvViewMode>("upload");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [csvFieldMappings, setCsvFieldMappings] = useState<CsvFieldMapping[]>([]);
  const [csvImportBatchId, setCsvImportBatchId] = useState<string | null>(null);
  const [csvImportProgress, setCsvImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvImportSummary, setCsvImportSummary] = useState<CsvImportSummary>({
    totalProcessed: 0, successCount: 0, errorCount: 0, successRate: 0, issues: [],
  });
  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [loadingImportHistory, setLoadingImportHistory] = useState(false);
  const [importHistoryError, setImportHistoryError] = useState<string | null>(null);

  const [historyDetailBatch, setHistoryDetailBatch] = useState<ImportBatchDetail | null>(null);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [retryingFailedItems, setRetryingFailedItems] = useState(false);
  const [retryProgress, setRetryProgress] = useState<{ done: number; total: number } | null>(null);
  const [undoingBatch, setUndoingBatch] = useState(false);

  const fetchImportHistory = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoadingImportHistory(true); setImportHistoryError(null); }
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/entities/imports?limit=100", { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "Error al cargar el historial de importaciones");
      setImportHistory(d.data || []);
    } catch (e: any) {
      if (!silent) setImportHistoryError(e.message || "Error al cargar el historial de importaciones");
    } finally {
      if (!silent) setLoadingImportHistory(false);
    }
  }, [getToken]);

  const handleCsvSelected = async (file?: File | null) => {
    if (!file) return;

    setCsvFileName(file.name);
    const rawText = await file.text();
    const { headers, rows } = parseCsvContent(rawText);
    setCsvHeaders(headers);
    setCsvPreviewRows(rows);
    setCsvFieldMappings(buildCsvMappings(headers, rows));
    setCsvImportSummary({ totalProcessed: 0, successCount: 0, errorCount: 0, successRate: 0, issues: [] });
    setCsvImportBatchId(null);

    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/entities/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          file_name: file.name, status: "uploaded",
          pending_count: 0, total_count: 0, completed_count: 0, error_count: 0,
          notes: "Archivo CSV subido y pendiente de configuracion.",
        }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo registrar la importacion");
      setCsvImportBatchId(d.data?.id || null);
      setImportHistory((prev) => [d.data, ...prev]);
      setViewMode("configure");
    } catch (e: any) {
      alert(e.message || "No se pudo registrar la importacion.");
    }
  };

  const handleCsvMappingChange = (id: string, value: string) => {
    setCsvFieldMappings((prev) => prev.map((field) => (
      field.id === id ? { ...field, selected: value, sample: value === CSV_UNASSIGNED ? "Sin detectar" : (csvPreviewRows[0]?.[value] || "Sin valor") } : field
    )));
  };

  // CSVs grandes (1000+ filas) pueden tardar varios minutos: concurrencia
  // moderada + pausa entre lotes para no saturar la instancia de backend,
  // token renovado en cada lote (el de Clerk caduca en ~60s), y reintento
  // automatico de errores que parecen un fallo transitorio del servidor en
  // vez de marcar la fila como fallida a la primera. Se reutiliza tanto para
  // la importacion inicial como para "Reintentar fallidas" desde el historial.
  const isTransientImportError = (message: string) =>
    /Failed to fetch|Backend no disponible|Ruta no encontrada|Metodo no permitido|Error del servidor \(5\d\d\)/i.test(message);

  const runResilientImport = useCallback(async (
    items: { rowNumber: number; payload: Record<string, unknown> }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<CsvRowImportResult[]> => {
    const CONCURRENCY = 4;
    const BATCH_DELAY_MS = 200;
    const MAX_RETRIES = 2;
    const results: CsvRowImportResult[] = [];
    let doneCount = 0;

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const token = await getToken({ skipCache: true });
      await Promise.all(batch.map(async ({ rowNumber, payload }) => {
        const reference = (payload.nif_cif as string) || null;
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await fetch("/api/entities", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(payload),
            });
            const data = await safeJson(res);
            if (!res.ok) {
              const message = data.error || "No se pudo crear el cliente";
              if (attempt < MAX_RETRIES && isTransientImportError(message)) {
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
                continue;
              }
              results.push({ rowNumber, status: "failed", reference, error_message: message, payload });
            } else {
              results.push({ rowNumber, status: "completed", reference, error_message: null, payload, created_entity_id: data.data?.id || null });
            }
          } catch (e: any) {
            const message = e.message || "No se pudo crear el cliente";
            if (attempt < MAX_RETRIES && isTransientImportError(message)) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }
            results.push({ rowNumber, status: "failed", reference, error_message: message, payload });
          }
          break;
        }
        doneCount += 1;
        onProgress?.(doneCount, items.length);
      }));
      if (i + CONCURRENCY < items.length) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    return results;
  }, [getToken]);

  const handleImportCsv = async () => {
    const items = csvPreviewRows.map((row, index) => ({
      rowNumber: index + 1,
      payload: buildClientPayload(row, csvFieldMappings),
    }));

    setCsvImportProgress({ done: 0, total: items.length });
    const results = await runResilientImport(items, (done, total) => setCsvImportProgress({ done, total }));
    setCsvImportProgress(null);

    const issues: CsvImportIssue[] = [...validateCsvImport(csvFieldMappings, csvPreviewRows).issues];
    for (const r of results) {
      if (r.status === "failed") {
        issues.push({ rowNumber: r.rowNumber, fieldId: "cliente", fieldLabel: "Cliente", message: r.error_message || "No se pudo crear el cliente" });
      }
    }
    const summary = buildCsvSummary(csvPreviewRows.length, issues);
    setCsvImportSummary(summary);

    if (csvImportBatchId) {
      try {
        const finalToken = await getToken({ skipCache: true });
        await fetch(`/api/entities/imports/${csvImportBatchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${finalToken}` },
          body: JSON.stringify({
            status: summary.successCount > 0 ? "completed" : "failed",
            total_count: summary.totalProcessed,
            completed_count: summary.successCount,
            error_count: summary.errorCount,
            pending_count: 0,
            notes: summary.errorCount > 0
              ? `Importación finalizada: ${summary.successCount} correctos, ${summary.errorCount} con errores.`
              : "Importación completada correctamente.",
            items: results.map((r) => ({
              row_number: r.rowNumber, reference: r.reference, status: r.status,
              error_message: r.error_message, payload: r.payload, created_entity_id: r.created_entity_id || null,
            })),
          }),
        });
      } catch {}
    }

    const completedCount = results.filter(item => item?.status === "completed").length;
    if (completedCount > 0) fetchImportHistory(true);

    setViewMode("complete");
  };

  // ── Detalle de un lote del historial: ver filas, reintentar fallidas, deshacer ──
  const openHistoryDetail = useCallback(async (batchId: string) => {
    setViewMode("historyDetail");
    setLoadingHistoryDetail(true);
    setHistoryDetailError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/entities/imports/${batchId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo cargar el detalle de la importación");
      setHistoryDetailBatch(d.data);
    } catch (e: any) {
      setHistoryDetailError(e.message || "Error al cargar el detalle de la importación");
    } finally {
      setLoadingHistoryDetail(false);
    }
  }, [getToken]);

  const handleRetryFailedInBatch = useCallback(async () => {
    if (!historyDetailBatch) return;
    const failedItems = historyDetailBatch.items.filter((it) => it.status === "failed");
    if (failedItems.length === 0) return;
    setRetryingFailedItems(true);
    setRetryProgress({ done: 0, total: failedItems.length });
    try {
      const toRetry = failedItems.map((it) => ({ rowNumber: it.row_number ?? 0, payload: it.payload || {} }));
      const results = await runResilientImport(toRetry, (done, total) => setRetryProgress({ done, total }));

      const retriedRowNumbers = new Set(failedItems.map((it) => it.row_number));
      const untouched = historyDetailBatch.items.filter((it) => !retriedRowNumbers.has(it.row_number));
      const mergedItems = [
        ...untouched.map((it) => ({
          row_number: it.row_number, reference: it.reference, status: it.status,
          error_message: it.error_message, payload: it.payload, created_entity_id: it.created_entity_id,
        })),
        ...results.map((r) => ({
          row_number: r.rowNumber, reference: r.reference, status: r.status,
          error_message: r.error_message, payload: r.payload, created_entity_id: r.created_entity_id || null,
        })),
      ];
      const completedTotal = mergedItems.filter((it) => it.status === "completed").length;
      const errorTotal = mergedItems.filter((it) => it.status === "failed").length;
      const recovered = results.filter((r) => r.status === "completed").length;

      const token = await getToken({ skipCache: true });
      const patchRes = await fetch(`/api/entities/imports/${historyDetailBatch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: errorTotal > 0 ? "completed" : "completed",
          total_count: mergedItems.length,
          completed_count: completedTotal,
          error_count: errorTotal,
          pending_count: 0,
          notes: `Reintento: ${recovered} de ${failedItems.length} filas recuperadas.`,
          items: mergedItems,
        }),
      });
      const patchData = await safeJson(patchRes);
      if (patchRes.ok) {
        openHistoryDetail(historyDetailBatch.id);
        fetchImportHistory(true);
      } else {
        setHistoryDetailError(patchData.error || "No se pudo guardar el resultado del reintento");
      }
    } catch (e: any) {
      setHistoryDetailError(e.message || "No se pudieron reintentar las filas fallidas");
    } finally {
      setRetryingFailedItems(false);
      setRetryProgress(null);
    }
  }, [historyDetailBatch, runResilientImport, getToken, fetchImportHistory, openHistoryDetail]);

  const handleUndoBatch = useCallback(async () => {
    if (!historyDetailBatch) return;
    const confirmed = window.confirm(
      `¿Deshacer esta importación? Se eliminarán los ${historyDetailBatch.completed_count} clientes que se crearon en este lote. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    setUndoingBatch(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/entities/imports/${historyDetailBatch.id}/undo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo deshacer la importación");
      window.alert(`Se eliminaron ${d.data.deletedCount} cliente(s) creados por esta importación.`);
      openHistoryDetail(historyDetailBatch.id);
      fetchImportHistory(true);
    } catch (e: any) {
      setHistoryDetailError(e.message || "No se pudo deshacer la importación");
    } finally {
      setUndoingBatch(false);
    }
  }, [historyDetailBatch, getToken, openHistoryDetail, fetchImportHistory]);

  useEffect(() => { fetchImportHistory(); }, [fetchImportHistory]);

  const handleFinish = () => navigate("/dashboard/clientes");

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-white">
      {viewMode === "upload" && (
        <CsvImportUploadView
          fileName={csvFileName}
          onBack={handleFinish}
          onOpenHistory={() => setViewMode("history")}
          onSelectFile={() => csvInputRef.current?.click()}
          onFileChange={(file) => handleCsvSelected(file)}
          inputRef={csvInputRef}
        />
      )}
      {viewMode === "configure" && (
        <CsvImportConfigureView
          fileName={csvFileName}
          csvHeaders={csvHeaders}
          mappings={csvFieldMappings}
          onBack={() => setViewMode("upload")}
          onContinue={() => setViewMode("review")}
          onOpenHistory={() => setViewMode("history")}
          onSelectFile={() => csvInputRef.current?.click()}
          onChangeMapping={handleCsvMappingChange}
          onFileChange={(file) => handleCsvSelected(file)}
          inputRef={csvInputRef}
        />
      )}
      {viewMode === "review" && (
        <CsvImportReviewView
          fileName={csvFileName}
          mappings={csvFieldMappings}
          previewRows={csvPreviewRows}
          validationSummary={validateCsvImport(csvFieldMappings, csvPreviewRows)}
          importProgress={csvImportProgress}
          onBack={() => setViewMode("configure")}
          onImport={handleImportCsv}
        />
      )}
      {viewMode === "complete" && (
        <CsvImportCompleteView
          fileName={csvFileName}
          summary={csvImportSummary}
          onBack={() => setViewMode("review")}
          onViewDetails={() => setViewMode("errorDetail")}
          onRestart={() => setViewMode("upload")}
          onFinish={handleFinish}
        />
      )}
      {viewMode === "errorDetail" && (
        <CsvImportErrorDetailView
          fileName={csvFileName}
          batchId={csvImportBatchId}
          summary={csvImportSummary}
          previewRows={csvPreviewRows}
          mappings={csvFieldMappings}
          onBack={() => setViewMode("complete")}
        />
      )}
      {viewMode === "history" && (
        <CsvImportHistoryView
          rows={importHistory}
          loading={loadingImportHistory}
          error={importHistoryError}
          onBack={() => setViewMode("upload")}
          onReload={() => fetchImportHistory()}
          onSelectBatch={openHistoryDetail}
        />
      )}
      {viewMode === "historyDetail" && (
        <CsvImportHistoryDetailView
          batch={historyDetailBatch}
          loading={loadingHistoryDetail}
          error={historyDetailError}
          retrying={retryingFailedItems}
          retryProgress={retryProgress}
          undoing={undoingBatch}
          onBack={() => setViewMode("history")}
          onRetryFailed={handleRetryFailedInBatch}
          onUndo={handleUndoBatch}
        />
      )}
    </div>
  );
}
