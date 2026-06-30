import React, { useState, useRef, useCallback, useEffect } from "react";
import { Spinner } from "../components/Spinner";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import {
  Save, X, ScanLine, Upload, Image as ImageIcon,
  Loader2, Sparkles, RotateCcw, AlertTriangle, CheckCircle2,
  Camera, Edit3, Users, MapPin, Phone, Briefcase, MessageSquare, ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { safeJson } from "../lib/api";
import BackButton from "../components/BackButton";

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ UI helpers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
const F = ({ label, required, invalid, children }: { label: string; required?: boolean; invalid?: boolean; children: React.ReactNode }) => (
  <div className="flex flex-col">
    <label className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${invalid ? "text-red-500" : "text-slate-400"}`}>
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const I = ({ highlight = false, invalid = false, className = "", ...props }: any) => (
  <input
    className={`w-full rounded-lg border px-2.5 py-1.5 text-sm text-slate-700 outline-none transition-all
      ${invalid
        ? "border-red-400 ring-2 ring-red-100 bg-red-50/40"
        : highlight
        ? "border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/40"
        : "border-slate-200 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100"
      } ${className}`}
    {...props}
  />
);

const S = ({ highlight = false, invalid = false, className = "", children, ...props }: any) => (
  <select
    className={`w-full rounded-lg border px-2.5 py-1.5 text-sm text-slate-700 outline-none transition-all
      ${invalid
        ? "border-red-400 ring-2 ring-red-100 bg-red-50/40"
        : highlight
        ? "border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/40"
        : "border-slate-200 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100"
      } ${className}`}
    {...props}
  >
    {children}
  </select>
);

const Section = ({ title, icon: Icon, children, cols = 4 }: { title: string; icon?: any; children: React.ReactNode; cols?: number }) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      {Icon && <Icon size={13} className="text-slate-400" />}
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
    </div>
    <div className={`p-4 grid gap-3 ${cols === 2 ? "grid-cols-1 md:grid-cols-2" : cols === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
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

const SummaryCard = ({ label, value, highlight = false }: { label: string; value?: string | null; highlight?: boolean }) => (
  <div className={`rounded-2xl border px-4 py-3 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{label}</p>
    <p className={`mt-2 text-sm font-semibold ${value ? "text-slate-800" : "text-slate-400"}`}>{value || "Pendiente de detectar"}</p>
  </div>
);

type FilledFields = Set<string>;
type ScanMeta = {
  source?: string;
  confidence?: number;
  fieldCount?: number;
  usedGemini?: boolean;
  usedAi?: boolean;
  model?: string | null;
  detectedFields?: Array<{ key: string; value: string; source?: string }>;
} | null;

const DEFAULT_OCR_OVERWRITABLE_VALUES = new Set(["", "DNI", "Española", "España"]);
const OCR_FIELD_LABELS: Record<string, string> = {
  first_name: "Nombre",
  last_name: "Apellidos",
  nif_cif: "NIF / CIF",
  birth_date: "Fecha nacimiento",
  gender: "Sexo",
  document_type: "Tipo documento",
  nationality: "Nacionalidad",
  expedition_country: "País de expedición",
  address_street: "Dirección",
  address_town: "Población",
  address_cp: "Código postal",
  address_province: "Provincia",
  address_country: "País",
};

const CLIENT_ERROR_LABELS: Record<string, string> = {
  document_type: "Tipo documento",
  nif_cif: "NIF / CIF",
  type: "Tipo cliente",
  first_name: "Nombre / Razón social",
  last_name: "Apellidos",
  address_cp: "Código postal",
  phone_1: "Teléfono",
  phone_2: "Teléfono 2",
  phone_3: "Teléfono 3",
  phone_mobile: "Móvil",
  phone_fax: "Fax",
};

const REQUIRED_CLIENT_FIELDS = ["document_type", "nif_cif", "type", "first_name", "last_name"] as const;

const PROVINCIAS = ["Álava","Albacete","Alicante","Almería","Asturias","Ávila","Badajoz","Barcelona","Burgos","Cáceres","Cádiz","Cantabria","Castellón","Ciudad Real","Córdoba","Cuenca","Girona","Granada","Guadalajara","Guipúzcoa","Huelva","Huesca","Illes Balears","Jaén","La Coruña","La Rioja","Las Palmas","León","Lleida","Lugo","Madrid","Málaga","Murcia","Navarra","Ourense","Palencia","Pontevedra","Salamanca","Santa Cruz de Tenerife","Segovia","Sevilla","Soria","Tarragona","Teruel","Toledo","Valencia","Valladolid","Vizcaya","Zamora","Zaragoza","Ceuta","Melilla"];
const PAISES = ["España","Francia","Portugal","Italia","Alemania","Reino Unido","Países Bajos","Bélgica","Suiza","Estados Unidos","México","Argentina","Colombia","Venezuela","Otro"];

// Redimensiona y comprime la foto a base64 (max 200px, JPEG 80%)
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

function transformImageForOcr(file: File, rotateDegrees = 0): Promise<{ file: File; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    if (!rotateDegrees) {
      resolve({ file, previewUrl: URL.createObjectURL(file) });
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const totalRotation = ((rotateDegrees % 360) + 360) % 360;
      const radians = totalRotation * Math.PI / 180;
      const swapSides = totalRotation === 90 || totalRotation === 270;
      const maxSide = 2200;
      const scale = Math.min(maxSide / Math.max(img.width, img.height), 1);
      const baseWidth = Math.round(img.width * scale);
      const baseHeight = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = swapSides ? baseHeight : baseWidth;
      canvas.height = swapSides ? baseWidth : baseHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo preparar la imagen"));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(radians);
      ctx.drawImage(img, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          reject(new Error("No se pudo convertir la imagen"));
          return;
        }
        const processedFile = new File(
          [blob],
          file.name.replace(/\.(\w+)$/, "") + "-ocr.jpg",
          { type: "image/jpeg" },
        );
        const previewUrl = URL.createObjectURL(blob);
        resolve({ file: processedFile, previewUrl });
      }, "image/jpeg", 0.92);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };

    img.src = url;
  });
}

function cleanOptionalValue(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return !normalized || normalized === "—" || normalized === "-" ? null : normalized;
}

function cleanNumericLikeValue(value: string | null | undefined) {
  const normalized = (value || "").replace(/\s+/g, "").trim();
  return !normalized || normalized === "—" || normalized === "-" ? null : normalized;
}

function normalizeDateInput(value: string | null | undefined) {
  const normalized = (value || "").trim();
  if (!normalized) return null;
  const esDate = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (esDate) return `${esDate[3]}-${esDate[2]}-${esDate[1]}`;
  return normalized;
}

function normalizeNullableMoney(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  if (!normalized || normalized === "-" || normalized === "—") return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
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
  observaciones: "",
};

export default function ClientForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();

  const { getToken } = useAuth();
  const navigate = useNavigate();
  const frontInputRef  = useRef<HTMLInputElement>(null);
  const backInputRef   = useRef<HTMLInputElement>(null);
  const photoInputRef  = useRef<HTMLInputElement>(null);

  const [loadingData, setLoadingData] = useState(isEdit);
  const [loadError, setLoadError]     = useState("");

  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [filledFields, setFilledFields] = useState<FilledFields>(new Set());
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [dniFrontImage, setDniFrontImage] = useState<string | null>(null);
  const [dniBackImage, setDniBackImage] = useState<string | null>(null);
  const [dniFrontFile, setDniFrontFile] = useState<File | null>(null);
  const [dniBackFile, setDniBackFile] = useState<File | null>(null);
  const [scanning, setScanning]   = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanDone, setScanDone]   = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scanMeta, setScanMeta]   = useState<ScanMeta>(null);
  const [dniReviewEditable, setDniReviewEditable] = useState(false);
  const [cpSuggestions, setCpSuggestions] = useState<string[]>([]);
  const [dniStep, setDniStep] = useState<"scan" | "complete">("scan");
  const [createMode, setCreateMode] = useState<"manual" | "dni" | "link">(() => {
    const mode = searchParams.get("mode");
    return mode === "dni" || mode === "link" ? mode : "manual";
  });
  const isDniFlow = !isEdit && createMode === "dni";
  const isLinkFlow = !isEdit && createMode === "link";
  const linkedExpedienteId = searchParams.get("expediente_id") || "";

  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    if (isEdit) return;
    const firstName = (searchParams.get("first_name") || "").trim();
    const lastName = (searchParams.get("last_name") || "").trim();
    const commercialName = (searchParams.get("commercial_name") || "").trim();
    const nif = (searchParams.get("nif_cif") || "").trim();
    if (!firstName && !lastName && !commercialName && !nif) return;

    setForm((prev) => ({
      ...prev,
      first_name: firstName || prev.first_name,
      last_name: lastName || prev.last_name,
      commercial_name: commercialName || prev.commercial_name,
      nif_cif: nif || prev.nif_cif,
    }));
  }, [isEdit, searchParams]);

  // Cargar datos cuando es edición
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

  const validateClientForm = () => {
    const missing = new Set<string>();
    if (!form.document_type.trim()) missing.add("document_type");
    if (!form.nif_cif.trim()) missing.add("nif_cif");
    if (!form.type.trim()) missing.add("type");
    if (!form.first_name.trim()) missing.add("first_name");
    if (!form.last_name.trim()) missing.add("last_name");
    setInvalidFields(missing);

    if (missing.size) {
      const labels = Array.from(missing).map((key) => CLIENT_ERROR_LABELS[key] || key);
      return `Completa los campos obligatorios marcados en rojo: ${labels.join(", ")}.`;
    }

    return "";
  };

  const buildClientPayload = useCallback(() => ({
    ...form,
    type: cleanOptionalValue(form.type) || "CLIENTE",
    client_status: cleanOptionalValue(form.client_status) || "Alta",
    document_type: cleanOptionalValue(form.document_type) || "DNI",
    first_name: form.first_name.trim(),
    last_name: cleanOptionalValue(form.last_name),
    commercial_name: cleanOptionalValue(form.commercial_name),
    nif_cif: form.nif_cif.trim(),
    gender: cleanOptionalValue(form.gender),
    birth_date: normalizeDateInput(form.birth_date),
    nationality: cleanOptionalValue(form.nationality) || "Española",
    expedition_country: cleanOptionalValue(form.expedition_country) || "España",
    legal_nature: cleanOptionalValue(form.legal_nature),
    address_street: cleanOptionalValue(form.address_street),
    address_town: cleanOptionalValue(form.address_town),
    address_cp: cleanNumericLikeValue(form.address_cp),
    address_province: cleanOptionalValue(form.address_province),
    address_country: cleanOptionalValue(form.address_country) || "España",
    email: cleanOptionalValue(form.email),
    phone_1: cleanNumericLikeValue(form.phone_1),
    phone_2: cleanNumericLikeValue(form.phone_2),
    phone_3: cleanNumericLikeValue(form.phone_3),
    phone_mobile: cleanNumericLikeValue(form.phone_mobile),
    phone_fax: cleanNumericLikeValue(form.phone_fax),
    website: cleanOptionalValue(form.website),
    date_alta: normalizeDateInput(form.date_alta) || new Date().toISOString().split("T")[0],
    date_baja: normalizeDateInput(form.date_baja),
    lopd: cleanOptionalValue(form.lopd) || "Pendiente",
    commercial_communications: cleanOptionalValue(form.commercial_communications) || "No",
    center: cleanOptionalValue(form.center),
    photo_url: cleanOptionalValue(form.photo_url),
  }), [form]);

  const mapClientSaveError = useCallback((message: string, payload: ReturnType<typeof buildClientPayload>) => {
    if (/invalid input syntax for type numeric/i.test(message)) {
      const likelyFields = ["address_cp", "phone_1", "phone_2", "phone_3", "phone_mobile", "phone_fax"]
        .filter((key) => payload[key as keyof typeof payload] == null)
        .map((key) => CLIENT_ERROR_LABELS[key]);

      if (likelyFields.length) {
        return `No se pudo guardar el cliente porque uno de estos campos no tiene un formato válido o está llegando vacío a la base de datos: ${likelyFields.join(", ")}.`;
      }

      return "No se pudo guardar el cliente porque algún campo numérico no tiene un formato válido. Revisa código postal y teléfonos.";
    }

    if (/date/i.test(message)) {
      return "No se pudo guardar el cliente porque alguna fecha no tiene un formato válido.";
    }

    return message;
  }, [buildClientPayload]);

  const linkCreatedClientToExpediente = useCallback(async (clientId: string, clientName: string) => {
    if (!linkedExpedienteId) return;
    const token = await getToken({ skipCache: true });
    const expRes = await fetch(`/api/expedientes/${linkedExpedienteId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const expJson = await safeJson(expRes);
    if (!expRes.ok || !expJson?.data) {
      throw new Error(expJson?.error || "No se pudo cargar el expediente para vincularlo al cliente.");
    }

    const current = expJson.data;
    const payload = {
      ref_propia: current.ref_propia || "",
      ref_expediente: current.ref_expediente || "",
      descripcion: current.descripcion || "",
      tipo: current.tipo || "judicial",
      cliente_id: clientId,
      cliente_nombre: clientName,
      contrario: current.contrario || "",
      procurador: current.procurador || "",
      juzgado: current.juzgado || "",
      tipo_proc: current.tipo_proc || "",
      num_autos: current.num_autos || "",
      nig: current.nig || "",
      estado: current.estado || "abierto",
      observaciones: current.observaciones || "",
      fecha_inicio: current.fecha_inicio ? String(current.fecha_inicio).slice(0, 10) : "",
      fecha_cierre: current.fecha_cierre ? String(current.fecha_cierre).slice(0, 10) : "",
      importe: normalizeNullableMoney(current.importe),
      tipos_asunto: current.tipos_asunto || "",
      cuantia_principal: normalizeNullableMoney(current.cuantia_principal),
      intereses: normalizeNullableMoney(current.intereses),
      costas: normalizeNullableMoney(current.costas),
      cuantia_total: normalizeNullableMoney(current.cuantia_total),
      indeterminado: Boolean(current.indeterminado),
      etapa: current.etapa || "",
      persona_contacto: current.persona_contacto || "",
      contacto: current.contacto || "",
      centro: current.centro || "",
      color: current.color || "ninguno",
    };

    const updateRes = await fetch(`/api/expedientes/${linkedExpedienteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const updateJson = await safeJson(updateRes);
    if (!updateRes.ok) {
      throw new Error(updateJson?.error || "No se pudo vincular el cliente al expediente.");
    }
  }, [getToken, linkedExpedienteId]);

  // ── NIF/CIF deduplication ────────────────────────────────────
  const [nifDupEntity, setNifDupEntity] = useState<any>(null);
  const nifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const nif = form.nif_cif.trim();
    // On edit mode skip check for own NIF
    if (!nif || nif.length < 5) { setNifDupEntity(null); return; }
    if (nifTimerRef.current) clearTimeout(nifTimerRef.current);
    nifTimerRef.current = setTimeout(async () => {
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/entities/check-nif?nif=${encodeURIComponent(nif)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          // If editing, ignore if it's the same entity
          if (d.exists && d.entity?.id !== id) {
            setNifDupEntity(d.entity);
          } else {
            setNifDupEntity(null);
          }
        }
      } catch { setNifDupEntity(null); }
    }, 600);
    return () => { if (nifTimerRef.current) clearTimeout(nifTimerRef.current); };
  }, [form.nif_cif, getToken, id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setFilledFields(p => { const n = new Set(p); n.delete(name); return n; });
    setInvalidFields((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      if ((value || "").trim()) next.delete(name);
      return next;
    });
  };

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Photo ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const handlePhoto = async (file: File) => {
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const base64 = await resizeImageToBase64(file);
      setForm(p => ({ ...p, photo_url: base64 }));
    } catch (_e) { /* ignorar error de conversión */ }
  };

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ DNI scanner ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const handleDniFile = async (side: "front" | "back", file: File, rotateDegrees = 0) => {
    setScanDone(false); setScanError("");
    setScanMeta(null);
    try {
      const processed = await transformImageForOcr(file, rotateDegrees);
      if (side === "front") {
        setDniFrontFile(processed.file);
        setDniFrontImage(processed.previewUrl);
        return;
      }
      setDniBackFile(processed.file);
      setDniBackImage(processed.previewUrl);
    } catch (err: any) {
      setScanError(err.message || "No se pudo preparar la imagen");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) void handleDniFile("front", file);
  }, []);

  const rotateDniSide = async (side: "front" | "back") => {
    const targetFile = side === "front" ? dniFrontFile : dniBackFile;
    if (!targetFile) return;
    await handleDniFile(side, targetFile, 90);
  };

  const handleScanDNI = async () => {
    if (!dniFrontFile && !dniBackFile) return;
    setScanning(true); setScanError("");
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      if (dniFrontFile) fd.append("dni_front_image", dniFrontFile);
      if (dniBackFile) fd.append("dni_back_image", dniBackFile);
      if (!dniFrontFile && dniBackFile) fd.append("dni_image", dniBackFile);
      const response = await fetch("/api/ocr/dni", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const result = await safeJson(response);
      if (!response.ok) throw new Error(result.error);

      const data = result.data;
      const meta = result.meta || null;
      const filled = new Set<string>();
      const canApply = (currentValue: string | null | undefined) =>
        DEFAULT_OCR_OVERWRITABLE_VALUES.has((currentValue || "").trim());
      const shouldApply = (nextValue: string | null | undefined, currentValue: string | null | undefined) => {
        const normalizedNext = (nextValue || "").trim();
        const normalizedCurrent = (currentValue || "").trim();
        return Boolean(normalizedNext) && canApply(currentValue) && normalizedNext !== normalizedCurrent;
      };

      setForm(prev => {
        const u = { ...prev };
        if (shouldApply(data.first_name, prev.first_name)) {
          u.first_name = data.first_name;
          filled.add("first_name");
        }
        if (shouldApply(data.last_name, prev.last_name)) {
          u.last_name = data.last_name;
          filled.add("last_name");
        }
        if (shouldApply(data.nif_cif, prev.nif_cif)) {
          u.nif_cif = data.nif_cif;
          filled.add("nif_cif");
        }
        if (shouldApply(data.birth_date, prev.birth_date)) {
          u.birth_date = data.birth_date;
          filled.add("birth_date");
        }
        if (shouldApply(data.address_town, prev.address_town)) {
          u.address_town = data.address_town;
          filled.add("address_town");
        }
        if (shouldApply(data.address_street, prev.address_street)) {
          u.address_street = data.address_street;
          filled.add("address_street");
        }
        if (shouldApply(data.address_cp, prev.address_cp)) {
          u.address_cp = data.address_cp;
          filled.add("address_cp");
        }
        if (shouldApply(data.address_province, prev.address_province)) {
          u.address_province = data.address_province;
          filled.add("address_province");
        }
        if (shouldApply(data.address_country, prev.address_country)) {
          u.address_country = data.address_country;
          filled.add("address_country");
        }
        if (shouldApply(data.gender, prev.gender)) {
          u.gender = data.gender;
          filled.add("gender");
        }
        if (shouldApply(data.nationality, prev.nationality)) {
          u.nationality = data.nationality;
          filled.add("nationality");
        }
        if (shouldApply(data.expedition_country, prev.expedition_country)) {
          u.expedition_country = data.expedition_country;
          filled.add("expedition_country");
        }
        if (shouldApply(data.document_type, prev.document_type)) {
          u.document_type = data.document_type;
          filled.add("document_type");
        }
        return u;
      });
      setFilledFields(filled);
      setScanMeta(meta);
      setCpSuggestions(Array.isArray(meta?.address_cp_suggestions) ? meta.address_cp_suggestions : []);
      setScanDone(true);
    } catch (err: any) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const clearDni = () => {
    setDniFrontImage(null); setDniBackImage(null);
    setDniFrontFile(null); setDniBackFile(null);
    setScanDone(false); setScanError("");
    setScanMeta(null);
    setDniStep("scan");
    setDniReviewEditable(false);
    setFilledFields(new Set());
    if (frontInputRef.current) frontInputRef.current.value = "";
    if (backInputRef.current) backInputRef.current.value = "";
  };

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Submit (POST crear / PUT editar) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateClientForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    const payload = buildClientPayload();
    setLoading(true); setError("");
    try {
      const token = await getToken({ skipCache: true });
      const url    = isEdit ? `/api/entities/${id}` : "/api/entities";
      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        });
        const data = await safeJson(response);
        if (!response.ok) throw new Error(data.error || "Error al guardar");

        if (!isEdit && linkedExpedienteId && data.data?.id) {
          const fullName = [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() || String(payload.commercial_name || "").trim();
          try {
            await linkCreatedClientToExpediente(data.data.id, fullName);
          } catch (linkErr: any) {
            throw new Error(
              linkErr?.message
                ? `El cliente se ha creado, pero no se ha podido vincular al expediente: ${linkErr.message}`
                : "El cliente se ha creado, pero no se ha podido vincular al expediente."
            );
          }
        }

        setShowSuccess(true);
        const returnPath = !isEdit && linkedExpedienteId
          ? `/dashboard/expedientes/${linkedExpedienteId}?tab=clientes`
          : isEdit
          ? `/dashboard/clientes/${id}`
          : "/dashboard/clientes";
        setTimeout(() => navigate(returnPath), 1200);
    } catch (err: any) {
      setError(mapClientSaveError(err.message || "Error al guardar", payload));
    } finally {
      setLoading(false);
    }
  };

  const h = (name: string) => filledFields.has(name);
  const isInvalid = (name: string) => invalidFields.has(name);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Loading skeleton al cargar datos de ediciÃƒÆ’Ã‚Â³n ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  if (loadingData) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Spinner size="xl" label="Cargando datos del cliente..." />
    </div>
  );

  if (loadError) return (
    <div className="space-y-4">
      <Link to="/dashboard/clientes">
        <BackButton />
      </Link>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertTriangle size={20} className="shrink-0" />
        <span className="text-sm">{loadError}</span>
      </div>
    </div>
  );


  if (isDniFlow) {
    const inputClsDni = (field: string) =>
      `w-full px-3.5 py-2.5 bg-white border rounded-md text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors ${
        isInvalid(field) ? "border-red-400 ring-1 ring-red-100 bg-red-50/30" : h(field) ? "border-emerald-400 ring-1 ring-emerald-100 bg-emerald-50/30" : "border-slate-300"
      }`;
    const lblDni = "text-xs font-bold text-slate-500 uppercase tracking-wider";

    return (
      <div className="animate-in fade-in duration-500 bg-white flex flex-col h-full overflow-hidden">
        <form onSubmit={handleSubmit} className="h-full flex flex-col overflow-hidden">

          {/* HEADER */}
          <div className="px-6 sm:px-8 py-5 bg-white border-b border-slate-200 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link to="/dashboard/clientes" className="shrink-0">
                <button type="button" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold px-3 py-2 rounded-md bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all">
                  <ChevronLeft size={13} /> Volver
                </button>
              </Link>
              <div className="w-px h-6 bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 shrink-0">
                  <ScanLine size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Alta de clientes</p>
                  <h1 className="text-xl font-bold text-slate-900">Lectura inteligente de DNI</h1>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/dashboard/clientes">
                <button type="button" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold px-3 py-2 rounded-md bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all">
                  <X size={13} /> Cancelar
                </button>
              </Link>
              {dniStep === "scan" ? (
                <button
                  type="button"
                  onClick={() => setDniStep("complete")}
                  disabled={!scanDone || !!scanError || !form.first_name || !form.nif_cif}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-red-200 transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuar <ChevronRight size={14} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDniStep("scan")}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <ChevronLeft size={14} /> Volver a revisión
                  </button>
                  <button
                    type="submit"
                    disabled={loading || showSuccess || !form.first_name || !form.nif_cif}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-red-200 transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Save size={14} /> Guardar cliente</>}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* HIDDEN FILE INPUTS */}
          <input ref={frontInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleDniFile("front", e.target.files[0])} />
          <input ref={backInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleDniFile("back", e.target.files[0])} />

          {/* BODY */}
          <main className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 lg:p-12 bg-white">
            <div className="max-w-[1400px] mx-auto space-y-10">

              {showSuccess && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={18} className="shrink-0" /> ¡Cliente registrado! Redirigiendo...
                </div>
              )}
              {error && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle size={18} className="shrink-0" /> {error}
                </div>
              )}

              {/* Step header */}
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {dniStep === "scan" ? "Paso 1 · Importación de documento" : "Paso 2 · Completar alta del cliente"}
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  {dniStep === "scan"
                    ? "Sube las imágenes del anverso y reverso del DNI. El sistema leerá automáticamente los datos de identidad y domicilio."
                    : "Los datos de identidad ya están cargados. Completa la información de contacto y administración para finalizar el alta."}
                </p>
              </div>

              {dniStep === "scan" && (
                <>
                  {/* SUBIR IMÁGENES */}
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Subir imágenes</h3>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
                        <Sparkles size={11} /> {scanMeta?.source || "OpenAI / Gemini + Tesseract"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Anverso */}
                      <button
                        type="button"
                        onClick={() => frontInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        className={`relative min-h-[280px] overflow-hidden rounded-2xl border-2 text-left transition-all ${
                          dniFrontImage
                            ? "border-slate-200 bg-slate-950"
                            : isDragOver
                            ? "scale-[1.01] border-indigo-300 bg-indigo-50/50"
                            : "border-dashed border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50"
                        }`}
                      >
                        {dniFrontImage ? (
                          <>
                            <img src={dniFrontImage} alt="DNI anverso" className="absolute inset-0 h-full w-full object-cover" />
                            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/35 to-transparent px-4 py-4">
                              <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white">Anverso</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void rotateDniSide("front"); }}
                                className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#ab0433]"
                              >
                                Girar
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-8 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                              <ImageIcon size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">Anverso del DNI</p>
                              <p className="mt-1.5 text-xs leading-5 text-slate-500">Foto frontal, completa, sin reflejos</p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                              <Upload size={12} /> Seleccionar archivo
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Reverso */}
                      <button
                        type="button"
                        onClick={() => backInputRef.current?.click()}
                        className={`relative min-h-[280px] overflow-hidden rounded-2xl border-2 text-left transition-all ${
                          dniBackImage
                            ? "border-slate-200 bg-slate-950"
                            : "border-dashed border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50"
                        }`}
                      >
                        {dniBackImage ? (
                          <>
                            <img src={dniBackImage} alt="DNI reverso" className="absolute inset-0 h-full w-full object-cover" />
                            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/35 to-transparent px-4 py-4">
                              <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white">Reverso</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void rotateDniSide("back"); }}
                                className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#ab0433]"
                              >
                                Girar
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-8 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                              <ImageIcon size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">Reverso del DNI</p>
                              <p className="mt-1.5 text-xs leading-5 text-slate-500">Recomendado para domicilio y código postal</p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                              <Upload size={12} /> Seleccionar archivo
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Panel de consejos */}
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-6 py-6 flex flex-col gap-4">
                        <p className="text-sm font-bold text-slate-800">Consejos para mejores resultados</p>
                        <ul className="space-y-3 text-xs text-slate-600">
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 h-4 w-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                            Fotografía el DNI sobre un fondo oscuro y uniforme
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 h-4 w-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                            Evita reflejos de luz o destello sobre el documento
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 h-4 w-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                            El texto debe ser completamente legible y nítido
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 h-4 w-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
                            Incluye los 4 bordes del documento en la imagen
                          </li>
                        </ul>

                        <div className="mt-auto pt-2 flex flex-col gap-2">
                          {!dniFrontImage && !dniBackImage ? (
                            <button
                              type="button"
                              onClick={() => frontInputRef.current?.click()}
                              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-red-200 transition-colors hover:bg-[#92042c]"
                            >
                              <Upload size={14} /> Comenzar con el anverso
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={handleScanDNI}
                                disabled={scanning || scanDone}
                                className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                                  scanning || scanDone
                                    ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                    : "bg-[#ab0433] text-white shadow-sm shadow-red-200 hover:bg-[#92042c]"
                                }`}
                              >
                                {scanning
                                  ? <><Loader2 size={14} className="animate-spin" /> Leyendo DNI...</>
                                  : scanDone
                                  ? <><CheckCircle2 size={14} /> Lectura completada</>
                                  : <><ScanLine size={14} /> Escanear DNI</>}
                              </button>
                              <div className="flex gap-2">
                                {!dniBackImage && (
                                  <button
                                    type="button"
                                    onClick={() => backInputRef.current?.click()}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <Upload size={12} /> Añadir reverso
                                  </button>
                                )}
                                {scanDone && (
                                  <button
                                    type="button"
                                    onClick={handleScanDNI}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <RotateCcw size={12} /> Re-escanear
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={clearDni}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                                >
                                  <X size={12} /> Limpiar
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {scanError && (
                          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <span>{scanError}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RESUMEN DEL CLIENTE */}
                  <div className="pt-8 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Resumen del cliente</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {scanDone ? "Datos detectados por el lector IA. Revisa antes de continuar." : "Los datos aparecerán aquí tras el escaneo del documento."}
                        </p>
                      </div>
                      {scanDone && !scanError && (
                        <button
                          type="button"
                          onClick={() => setDniReviewEditable((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Edit3 size={13} />
                          {dniReviewEditable ? "Cerrar verificación" : "Abrir verificación editable"}
                        </button>
                      )}
                    </div>

                    {!dniReviewEditable ? (
                      <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-0">
                          {[
                            { label: "Tipo documento", key: "document_type", value: form.document_type },
                            { label: "NIF / CIF", key: "nif_cif", value: form.nif_cif },
                            { label: "Nombre", key: "first_name", value: form.first_name },
                            { label: "Apellidos", key: "last_name", value: form.last_name },
                            { label: "Fecha nacimiento", key: "birth_date", value: form.birth_date },
                            { label: "Sexo", key: "gender", value: form.gender === "M" ? "Masculino" : form.gender === "F" ? "Femenino" : form.gender === "O" ? "Otro" : form.gender },
                            { label: "Nacionalidad", key: "nationality", value: form.nationality },
                            { label: "País expedición", key: "expedition_country", value: form.expedition_country },
                            { label: "Dirección", key: "address_street", value: form.address_street },
                            { label: "Población", key: "address_town", value: form.address_town },
                            { label: "Código postal", key: "address_cp", value: form.address_cp },
                            { label: "Provincia", key: "address_province", value: form.address_province },
                          ].map(({ label, key, value }) => (
                            <div key={key} className="flex flex-col gap-1 border-b border-slate-200/60 py-3">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                              {value ? (
                                <span className={`text-sm font-semibold ${h(key) ? "text-emerald-700" : "text-slate-800"}`}>{value}</span>
                              ) : (
                                <span className="text-sm italic text-slate-400">Pendiente de detectar</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-6">
                        <div>
                          <label className={lblDni}>Tipo documento *</label>
                          <select name="document_type" value={form.document_type} onChange={handleChange} className={`${inputClsDni("document_type")} mt-2`}>
                            <option>DNI</option><option>NIE</option><option>Pasaporte</option><option>CIF</option><option>Otro</option>
                          </select>
                        </div>
                        <div>
                          <label className={lblDni}>NIF / CIF *</label>
                          <input name="nif_cif" value={form.nif_cif} onChange={handleChange} placeholder="12345678Z" className={`${inputClsDni("nif_cif")} mt-2`} />
                          {nifDupEntity && (
                            <Link to={`/dashboard/clientes/${nifDupEntity.id}`} className="mt-1.5 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
                              <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                              <span>Ya existe: <span className="underline">{nifDupEntity.first_name} {nifDupEntity.last_name || nifDupEntity.commercial_name || ""}</span> · Ver ficha →</span>
                            </Link>
                          )}
                        </div>
                        <div>
                          <label className={lblDni}>Nombre *</label>
                          <input name="first_name" value={form.first_name} onChange={handleChange} placeholder="Nombre" className={`${inputClsDni("first_name")} mt-2`} />
                        </div>
                        <div>
                          <label className={lblDni}>Apellidos *</label>
                          <input name="last_name" value={form.last_name} onChange={handleChange} placeholder="Apellidos" className={`${inputClsDni("last_name")} mt-2`} />
                        </div>
                        <div>
                          <label className={lblDni}>Fecha nacimiento</label>
                          <input type="date" name="birth_date" value={form.birth_date} onChange={handleChange} className={`${inputClsDni("birth_date")} mt-2`} />
                        </div>
                        <div>
                          <label className={lblDni}>Sexo</label>
                          <select name="gender" value={form.gender} onChange={handleChange} className={`${inputClsDni("gender")} mt-2`}>
                            <option value="">—</option><option value="M">Masculino</option><option value="F">Femenino</option><option value="O">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label className={lblDni}>Nacionalidad</label>
                          <input name="nationality" value={form.nationality} onChange={handleChange} className={`${inputClsDni("nationality")} mt-2`} />
                        </div>
                        <div>
                          <label className={lblDni}>País expedición</label>
                          <select name="expedition_country" value={form.expedition_country} onChange={handleChange} className={`${inputClsDni("expedition_country")} mt-2`}>
                            {PAISES.map((p) => <option key={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    {scanDone && !scanError && filledFields.size > 0 && (
                      <div className="mt-6 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                        <Sparkles size={13} className="shrink-0 text-emerald-500" />
                        <span>{filledFields.size} campos aplicados automáticamente.{typeof scanMeta?.confidence === "number" ? ` Confianza OCR: ${scanMeta.confidence}%.` : ""}</span>
                      </div>
                    )}

                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs text-slate-500">
                      <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
                      <span>El siguiente paso no te pedirá de nuevo los datos personales. Si necesitas corregirlos, usa <span className="font-semibold text-slate-700">Abrir verificación editable</span> antes de continuar.</span>
                    </div>
                  </div>
                </>
              )}

              {dniStep === "complete" && (
                <>
                  {/* Identity summary read-only */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Identidad personal detectada</h3>
                      <p className="text-xs text-slate-500">Los datos personales vienen del escáner y ya están listos.</p>
                    </div>
                    <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-0">
                        {[
                          { label: "Tipo documento", key: "document_type", value: form.document_type },
                          { label: "NIF / CIF", key: "nif_cif", value: form.nif_cif },
                          { label: "Nombre", key: "first_name", value: form.first_name },
                          { label: "Apellidos", key: "last_name", value: form.last_name },
                          { label: "Fecha nacimiento", key: "birth_date", value: form.birth_date },
                          { label: "Sexo", key: "gender", value: form.gender === "M" ? "Masculino" : form.gender === "F" ? "Femenino" : form.gender === "O" ? "Otro" : form.gender },
                          { label: "Nacionalidad", key: "nationality", value: form.nationality },
                          { label: "País expedición", key: "expedition_country", value: form.expedition_country },
                        ].map(({ label, key, value }) => (
                          <div key={key} className="flex flex-col gap-1 border-b border-slate-200/60 py-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                            {value ? (
                              <span className={`text-sm font-semibold ${h(key) ? "text-emerald-700" : "text-slate-800"}`}>{value}</span>
                            ) : (
                              <span className="text-sm italic text-slate-400">—</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="pt-8 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Dirección</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-6">
                      <div className="md:col-span-2">
                        <label className={lblDni}>Dirección</label>
                        <input name="address_street" value={form.address_street} onChange={handleChange} placeholder="Calle, número, piso..." className={`${inputClsDni("address_street")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Población</label>
                        <input name="address_town" value={form.address_town} onChange={handleChange} placeholder="Ciudad" className={`${inputClsDni("address_town")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Código postal</label>
                        <input
                          name="address_cp"
                          value={form.address_cp}
                          onChange={handleChange}
                          placeholder="28000"
                          list={cpSuggestions.length > 0 ? "cp-suggestions-list" : undefined}
                          className={`${inputClsDni("address_cp")} mt-2`}
                        />
                        {cpSuggestions.length > 0 && (
                          <datalist id="cp-suggestions-list">
                            {cpSuggestions.map(cp => <option key={cp} value={cp} />)}
                          </datalist>
                        )}
                        {cpSuggestions.length > 1 && !form.address_cp && (
                          <p className="mt-1 text-[11px] text-slate-500">Selecciona el CP de la lista o escríbelo manualmente</p>
                        )}
                      </div>
                      <div>
                        <label className={lblDni}>Provincia</label>
                        <select name="address_province" value={form.address_province} onChange={handleChange} className={`${inputClsDni("address_province")} mt-2`}>
                          <option value="">— Selecciona —</option>
                          {PROVINCIAS.map((p) => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lblDni}>País</label>
                        <select name="address_country" value={form.address_country} onChange={handleChange} className={`${inputClsDni("address_country")} mt-2`}>
                          {PAISES.map((p) => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Contacto */}
                  <div className="pt-8 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Contacto</h3>
                    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-xs text-amber-700">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                      <span>Debes indicar al menos <strong>un móvil, teléfono o correo electrónico</strong> para poder guardar el cliente.</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-6">
                      <div className="md:col-span-2">
                        <label className={lblDni}>Correo electrónico</label>
                        <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="cliente@email.com" className={`${inputClsDni("email")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Teléfono</label>
                        <input name="phone_1" value={form.phone_1} onChange={handleChange} placeholder="900 000 000" className={`${inputClsDni("phone_1")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Móvil</label>
                        <input name="phone_mobile" value={form.phone_mobile} onChange={handleChange} placeholder="600 000 000" className={`${inputClsDni("phone_mobile")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Teléfono 2</label>
                        <input name="phone_2" value={form.phone_2} onChange={handleChange} placeholder="—" className={`${inputClsDni("phone_2")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Teléfono 3</label>
                        <input name="phone_3" value={form.phone_3} onChange={handleChange} placeholder="—" className={`${inputClsDni("phone_3")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Fax</label>
                        <input name="phone_fax" value={form.phone_fax} onChange={handleChange} placeholder="—" className={`${inputClsDni("phone_fax")} mt-2`} />
                      </div>
                      <div className="md:col-span-3">
                        <label className={lblDni}>Página web</label>
                        <input name="website" value={form.website} onChange={handleChange} placeholder="https://www.empresa.com" className={`${inputClsDni("website")} mt-2`} />
                      </div>
                    </div>
                  </div>

                  {/* Administración */}
                  <div className="pt-8 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Administración</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-6">
                      <div>
                        <label className={lblDni}>Tipo cliente</label>
                        <select name="type" value={form.type} onChange={handleChange} className={`${inputClsDni("type")} mt-2`}>
                          <option value="CLIENTE">Cliente</option>
                          <option value="CONTRARIO">Contrario</option>
                          <option value="JUZGADO">Juzgado</option>
                          <option value="PERITO">Perito</option>
                          <option value="PROVEEDOR">Proveedor</option>
                        </select>
                      </div>
                      <div>
                        <label className={lblDni}>Naturaleza jurídica</label>
                        <select name="legal_nature" value={form.legal_nature} onChange={handleChange} className={`${inputClsDni("legal_nature")} mt-2`}>
                          <option value="">—</option>
                          <option>Física</option><option>Jurídica</option><option>Autónomo</option>
                        </select>
                      </div>
                      <div>
                        <label className={lblDni}>Nombre comercial</label>
                        <input name="commercial_name" value={form.commercial_name} onChange={handleChange} placeholder="Ej: Transportes S.L." className={`${inputClsDni("commercial_name")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Estado</label>
                        <select name="client_status" value={form.client_status} onChange={handleChange} className={`${inputClsDni("client_status")} mt-2`}>
                          <option>Alta</option><option>Baja</option><option>Suspendido</option><option>Potencial</option>
                        </select>
                      </div>
                      <div>
                        <label className={lblDni}>Fecha alta</label>
                        <input type="date" name="date_alta" value={form.date_alta} onChange={handleChange} className={`${inputClsDni("date_alta")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Fecha baja</label>
                        <input type="date" name="date_baja" value={form.date_baja} onChange={handleChange} className={`${inputClsDni("date_baja")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>Centro</label>
                        <input name="center" value={form.center} onChange={handleChange} placeholder="—" className={`${inputClsDni("center")} mt-2`} />
                      </div>
                      <div>
                        <label className={lblDni}>LOPD</label>
                        <select name="lopd" value={form.lopd} onChange={handleChange} className={`${inputClsDni("lopd")} mt-2`}>
                          <option>Pendiente</option><option>Firmado</option><option>Rechazado</option><option>No aplica</option>
                        </select>
                      </div>
                      <div>
                        <label className={lblDni}>Comunicaciones comerciales</label>
                        <select name="commercial_communications" value={form.commercial_communications} onChange={handleChange} className={`${inputClsDni("commercial_communications")} mt-2`}>
                          <option>No</option><option>Sí</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {filledFields.size > 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-700">
                      <Sparkles size={14} className="shrink-0 text-emerald-500" />
                      Los campos resaltados en verde vienen del escáner del DNI. Aquí solo completas o corriges el resto antes de guardar.
                    </div>
                  )}
                </>
              )}

            </div>
          </main>
        </form>
      </div>
    );
  }

  const inputCls = (field: string) =>
    `w-full px-3.5 py-2.5 bg-white border rounded-md text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors ${
      isInvalid(field) ? "border-red-400 ring-1 ring-red-100 bg-red-50/30" : h(field) ? "border-emerald-400 ring-1 ring-emerald-100 bg-emerald-50/30" : "border-slate-300"
    }`;
  const lbl = "text-xs font-bold text-slate-500 uppercase tracking-wider";

  return (
    <form onSubmit={handleSubmit} className="h-full flex flex-col overflow-hidden animate-page-in">

      {/* HEADER */}
      <div className="px-6 sm:px-8 py-5 bg-white border-b border-slate-200 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-card-in">
        <div className="flex items-center gap-4">
          <Link to={isEdit ? `/dashboard/clientes/${id}` : "/dashboard/clientes"} className="shrink-0">
            <button type="button" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold px-3 py-2 rounded-md bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all">
              <ChevronLeft size={13} /> Volver
            </button>
          </Link>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-100 flex-shrink-0">
            <Users size={18} />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-extrabold text-slate-800 leading-none tracking-tight mb-0.5">
              {isEdit ? "Editar cliente" : "Nuevo cliente"}
            </h1>
            <p className="text-[11px] font-medium text-slate-500">
              {isEdit ? "Modifica los datos y pulsa Guardar cambios" : "Rellena la ficha de alta del cliente"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showSuccess && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
              <CheckCircle2 size={14} /> {isEdit ? "¡Cambios guardados!" : "¡Cliente registrado!"}
            </span>
          )}
          {error && (
            <span className="max-w-xs truncate flex items-center gap-1.5 text-red-600 text-xs">
              <AlertTriangle size={14} className="shrink-0" /> {error}
            </span>
          )}
          <Link to={isEdit ? `/dashboard/clientes/${id}` : "/dashboard/clientes"}>
            <button type="button" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-md shadow-sm transition-colors">
              <X size={14} className="text-slate-400" /> Cancelar
            </button>
          </Link>
          <button type="submit" disabled={loading || showSuccess}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 border border-red-700 rounded-md shadow-sm transition-all active:scale-[0.98]">
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> Guardando...</>
              : <><Save size={13} /> {isEdit ? "Guardar cambios" : "Guardar"}</>}
          </button>
        </div>
      </div>

      {/* BODY */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 lg:p-12 bg-white animate-card-in-1">
        <div className="max-w-[1600px] mx-auto flex flex-col xl:flex-row gap-12 lg:gap-16 items-start">

          {/* SECCIONES */}
          <div className="flex-1 flex flex-col gap-10 w-full xl:pr-12 xl:border-r border-slate-200">

            {/* IDENTIFICACION */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Users size={16} className="text-slate-400" /> Identificación
              </h3>

              <div className="flex flex-col md:flex-row gap-6 lg:gap-8 mb-6">
                <div className="flex-shrink-0">
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-slate-400 cursor-pointer transition-all group overflow-hidden"
                  >
                    {photoPreview
                      ? <img src={photoPreview} alt="Foto" className="w-full h-full object-cover" />
                      : <>
                          <Camera size={22} className="text-slate-300 group-hover:text-slate-500 mb-1.5 transition-colors" />
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-600 transition-colors uppercase tracking-wide">Foto</span>
                        </>
                    }
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                  <div className="flex flex-col gap-2">
                    <label className={`${lbl}${isInvalid("document_type") ? " text-red-500" : ""}`}>Tipo Documento <span className="text-red-500">*</span></label>
                    <select name="document_type" value={form.document_type} onChange={handleChange} className={inputCls("document_type")}>
                      <option>DNI</option><option>NIE</option><option>Pasaporte</option><option>CIF</option><option>Otro</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`${lbl}${isInvalid("nif_cif") ? " text-red-500" : ""}`}>NIF / CIF <span className="text-red-500">*</span></label>
                    <input name="nif_cif" value={form.nif_cif} onChange={handleChange} placeholder="12345678Z" className={`${inputCls("nif_cif")} font-mono`} />
                    {nifDupEntity && (
                      <Link to={`/dashboard/clientes/${nifDupEntity.id}`} className="mt-1 flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
                        <AlertTriangle size={11} className="shrink-0 text-amber-500" /> Ya existe · Ver ficha →
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`${lbl}${isInvalid("type") ? " text-red-500" : ""}`}>Tipo Cliente <span className="text-red-500">*</span></label>
                    <select name="type" value={form.type} onChange={handleChange} className={inputCls("type")}>
                      <option value="CLIENTE">Cliente</option>
                      <option value="CONTRARIO">Contrario</option>
                      <option value="JUZGADO">Juzgado</option>
                      <option value="PERITO">Perito</option>
                      <option value="PROVEEDOR">Proveedor</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                <div className="flex flex-col gap-2">
                  <label className={`${lbl}${isInvalid("first_name") ? " text-red-500" : ""}`}>Nombre / Razón Social <span className="text-red-500">*</span></label>
                  <input name="first_name" value={form.first_name} onChange={handleChange} placeholder="Nombre" className={inputCls("first_name")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={`${lbl}${isInvalid("last_name") ? " text-red-500" : ""}`}>Apellidos <span className="text-red-500">*</span></label>
                  <input name="last_name" value={form.last_name} onChange={handleChange} placeholder="Apellidos" className={inputCls("last_name")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Nombre Comercial</label>
                  <input name="commercial_name" value={form.commercial_name} onChange={handleChange} placeholder="Ej: Transportes S.L." className={inputCls("commercial_name")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Naturaleza Jurídica</label>
                  <select name="legal_nature" value={form.legal_nature} onChange={handleChange} className={inputCls("legal_nature")}>
                    <option value="">— Seleccionar —</option>
                    <option>Física</option><option>Jurídica</option><option>Autónomo</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Sexo</label>
                  <select name="gender" value={form.gender} onChange={handleChange} className={inputCls("gender")}>
                    <option value="">— Seleccionar —</option>
                    <option value="M">Masculino</option><option value="F">Femenino</option><option value="O">Otro</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Fecha Nacimiento</label>
                  <input type="date" name="birth_date" value={form.birth_date} onChange={handleChange} className={inputCls("birth_date")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Edad</label>
                  <input value={age !== null ? `${age} años` : ""} readOnly className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-500 cursor-not-allowed" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Nacionalidad</label>
                  <input name="nationality" value={form.nationality} onChange={handleChange} className={inputCls("nationality")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>País de Expedición</label>
                  <select name="expedition_country" value={form.expedition_country} onChange={handleChange} className={inputCls("expedition_country")}>
                    {PAISES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* DIRECCION */}
            <div className="pt-8 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                <MapPin size={16} className="text-slate-400" /> Dirección Principal
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                <div className="flex flex-col gap-2 md:col-span-3">
                  <label className={lbl}>Dirección</label>
                  <input name="address_street" value={form.address_street} onChange={handleChange} placeholder="Calle, número, piso, puerta..." className={inputCls("address_street")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Población</label>
                  <input name="address_town" value={form.address_town} onChange={handleChange} placeholder="Ciudad" className={inputCls("address_town")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Código Postal</label>
                  <input name="address_cp" value={form.address_cp} onChange={handleChange} placeholder="28000" className={`${inputCls("address_cp")} font-mono`} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Provincia</label>
                  <select name="address_province" value={form.address_province} onChange={handleChange} className={inputCls("address_province")}>
                    <option value="">— Selecciona —</option>
                    {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2 md:col-span-3">
                  <label className={lbl}>País</label>
                  <select name="address_country" value={form.address_country} onChange={handleChange} className={inputCls("address_country")}>
                    {PAISES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* CONTACTO */}
            <div className="pt-8 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Phone size={16} className="text-slate-400" /> Contacto
              </h3>
              <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                Indica al menos <span className="font-semibold text-slate-700">un móvil, teléfono o correo electrónico</span> para guardar el cliente.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                <div className="flex flex-col gap-2 md:col-span-3">
                  <label className={lbl}>Correo Electrónico</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="cliente@email.com" className={inputCls("email")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Teléfono</label>
                  <input name="phone_1" value={form.phone_1} onChange={handleChange} placeholder="900 000 000" className={inputCls("phone_1")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Móvil</label>
                  <input name="phone_mobile" value={form.phone_mobile} onChange={handleChange} placeholder="600 000 000" className={inputCls("phone_mobile")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Fax</label>
                  <input name="phone_fax" value={form.phone_fax} onChange={handleChange} placeholder="—" className={inputCls("phone_fax")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Teléfono 2</label>
                  <input name="phone_2" value={form.phone_2} onChange={handleChange} placeholder="—" className={inputCls("phone_2")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Teléfono 3</label>
                  <input name="phone_3" value={form.phone_3} onChange={handleChange} placeholder="—" className={inputCls("phone_3")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Página Web</label>
                  <input name="website" value={form.website} onChange={handleChange} placeholder="https://www.empresa.com" className={inputCls("website")} />
                </div>
              </div>
            </div>

            {/* ADMINISTRACION */}
            <div className="pt-8 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Briefcase size={16} className="text-slate-400" /> Administración
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Estado</label>
                  <select name="client_status" value={form.client_status} onChange={handleChange} className={inputCls("client_status")}>
                    <option>Alta</option><option>Baja</option><option>Suspendido</option><option>Potencial</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Fecha Alta</label>
                  <input type="date" name="date_alta" value={form.date_alta} onChange={handleChange} className={inputCls("date_alta")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Fecha Baja</label>
                  <input type="date" name="date_baja" value={form.date_baja} onChange={handleChange} className={inputCls("date_baja")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Centro</label>
                  <input name="center" value={form.center} onChange={handleChange} placeholder="—" className={inputCls("center")} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>LOPD</label>
                  <select name="lopd" value={form.lopd} onChange={handleChange} className={inputCls("lopd")}>
                    <option>Pendiente</option><option>Firmado</option><option>Rechazado</option><option>No aplica</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={lbl}>Comunicaciones Comerciales</label>
                  <select name="commercial_communications" value={form.commercial_communications} onChange={handleChange} className={inputCls("commercial_communications")}>
                    <option>No</option><option>Sí</option>
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* PANEL DERECHO */}
          <div className="w-full xl:w-[400px] flex-shrink-0 flex flex-col gap-10 xl:sticky xl:top-6 animate-card-in-2">

            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                <MessageSquare size={16} className="text-slate-400" /> Observaciones / Notas
              </h3>
              <div className="flex flex-col gap-2">
                <textarea
                  name="observaciones"
                  value={(form as any).observaciones || ""}
                  onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))}
                  rows={14}
                  placeholder="Añade notas internas o información relevante sobre este cliente..."
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-md text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors resize-none"
                />
                <p className="text-[10px] text-slate-400 text-right">Estas notas son privadas y solo visibles internamente.</p>
              </div>
            </div>

            {invalidFields.size > 0 && (
              <div className="rounded-md border border-red-100 bg-red-50 p-3.5 text-xs text-red-600">
                <p className="font-bold mb-1">{invalidFields.size} campo{invalidFields.size !== 1 ? "s" : ""} requerido{invalidFields.size !== 1 ? "s" : ""}</p>
                {Array.from(invalidFields).slice(0, 4).map(f => (
                  <p key={f} className="text-red-500">· {CLIENT_ERROR_LABELS[f] || f}</p>
                ))}
              </div>
            )}
            {filledFields.size > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 p-3.5 text-xs text-emerald-700">
                <Sparkles size={11} className="text-emerald-500 shrink-0" />
                {filledFields.size} campos detectados por el escáner OCR
              </div>
            )}

          </div>

        </div>
      </main>

      <style>{`
        @keyframes scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-scan { animation: scan 1.2s linear infinite; }
      `}</style>
    </form>
  );
}