import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import {
  Save, X, ScanLine, Upload, Image as ImageIcon,
  Loader2, Sparkles, RotateCcw, AlertTriangle, CheckCircle2,
  Camera, Edit3, Users, MapPin, Phone, Briefcase, BarChart2,
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
          : ((isEdit ? id : data.data?.id) ? `/dashboard/clientes/${isEdit ? id : data.data?.id}` : "/dashboard/clientes");
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
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm animate-pulse">Cargando datos del cliente...</p>
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

  if (isDniFlow) return (
    <div className="animate-in fade-in duration-500 bg-slate-50 -m-6 min-h-screen p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1440px] space-y-6">
        <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Link to="/dashboard/clientes">
                <BackButton />
              </Link>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-600">
                  <ScanLine size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Alta de clientes</p>
                  <h1 className="mt-1 text-[18px] font-bold leading-tight text-slate-900">Dar de alta clientes con DNI</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {dniStep === "scan"
                      ? "Sube anverso y reverso del DNI, revisa la identidad detectada y continúa al alta asistida."
                      : "Completa los datos de contacto y administración. La identidad personal ya viene preparada desde el escaneo."}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/dashboard/clientes">
                <button type="button" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100">
                  <X size={14} /> Cancelar
                </button>
              </Link>
              {dniStep === "scan" ? (
                <button
                  type="button"
                  onClick={() => setDniStep("complete")}
                  disabled={!scanDone || !!scanError || !form.first_name || !form.nif_cif}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm shadow-red-200 transition-all hover:bg-red-700 disabled:opacity-60"
                >
                  <Save size={13} /> Continuar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDniStep("scan")}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Edit3 size={13} /> Volver a revisión
                  </button>
                  <button
                    type="submit"
                    disabled={loading || showSuccess || !form.first_name || !form.nif_cif}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm shadow-red-200 transition-all hover:bg-red-700 disabled:opacity-60"
                  >
                    {loading
                      ? <><Loader2 size={13} className="animate-spin" /> Guardando...</>
                      : <><Save size={13} /> Guardar cliente</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {showSuccess && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 size={18} className="shrink-0" />
            ¡Cliente registrado! Redirigiendo...
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle size={18} className="shrink-0" /> {error}
          </div>
        )}

        <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h2 className="text-[15px] font-bold text-slate-900">
            {dniStep === "scan" ? "Paso 1 · Lectura inteligente del DNI" : "Paso 2 · Completar alta del cliente"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {dniStep === "scan"
              ? "Primero importa el DNI y verifica los datos personales detectados. Cuando estén bien, pulsa Continuar."
              : "Ahora completa solo los datos que faltan para el alta. La identidad personal detectada se conserva arriba."}
          </p>
        </section>

        <input
          ref={frontInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleDniFile("front", e.target.files[0])}
        />
        <input
          ref={backInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleDniFile("back", e.target.files[0])}
        />

        {dniStep === "scan" && (
        <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">Importar DNI</h2>
              <p className="mt-1 text-sm text-slate-500">
                Carga anverso y reverso para detectar identidad, fecha de nacimiento y datos de domicilio.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
              {scanMeta?.source || "OpenAI / Gemini + Tesseract"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.85fr)]">
            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => frontInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                className={`group relative min-h-[260px] overflow-hidden rounded-[28px] border-2 text-left transition-all ${
                  dniFrontImage
                    ? "border-slate-200 bg-slate-950"
                    : isDragOver
                    ? "scale-[1.01] border-[#ab0433]/45 bg-red-50"
                    : "border-dashed border-slate-200 bg-slate-50 hover:border-[#ab0433]/35 hover:bg-red-50/40"
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
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-4 px-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                      <ImageIcon size={28} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-800">Subir anverso del DNI</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Foto frontal, completa, sin reflejos y con buena luz.
                      </p>
                    </div>
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => backInputRef.current?.click()}
                className={`group relative min-h-[260px] overflow-hidden rounded-[28px] border-2 text-left transition-all ${
                  dniBackImage
                    ? "border-slate-200 bg-slate-950"
                    : "border-dashed border-slate-200 bg-slate-50 hover:border-[#ab0433]/35 hover:bg-red-50/40"
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
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-4 px-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                      <ImageIcon size={28} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-800">Subir reverso del DNI</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Recomendado para domicilio, código postal y provincia.
                      </p>
                    </div>
                  </div>
                )}
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
              <p className="text-base font-bold text-slate-900">
                {dniFrontImage || dniBackImage ? "Fotos listas para procesar" : "Añade las fotos para comenzar"}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                El anverso aporta la identidad básica. El reverso ayuda con domicilio, población, código postal y provincia.
              </p>

              {scanError && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              {scanDone && !scanError && (
                <div className="mt-4 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles size={13} />
                    <span className="font-semibold">{filledFields.size} campos aplicados al alta.</span>
                    {typeof scanMeta?.fieldCount === "number" && scanMeta.fieldCount > filledFields.size && (
                      <span className="text-emerald-700/90">Detectados {scanMeta.fieldCount}, pero algunos ya tenían valor.</span>
                    )}
                    {typeof scanMeta?.confidence === "number" && (
                      <span className="text-emerald-700/90">Confianza OCR {scanMeta.confidence}%</span>
                    )}
                  </div>
                  {scanMeta?.model && (
                    <div className="text-[11px] text-emerald-700/90">Modelo usado: {scanMeta.model}</div>
                  )}
                  {Array.isArray(scanMeta?.detectedFields) && scanMeta.detectedFields.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {scanMeta.detectedFields.map((field) => (
                        <span
                          key={field.key}
                          className={`rounded-full border px-2 py-1 ${
                            filledFields.has(field.key)
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {OCR_FIELD_LABELS[field.key] || field.key}: {String(field.value)}
                          {field.source ? ` · ${field.source}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Anverso + reverso recomendado</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Sin reflejos</span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Documento recto y completo</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {!dniFrontImage && !dniBackImage ? (
                  <button
                    type="button"
                    onClick={() => frontInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#ab0433] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-200 transition-colors hover:bg-[#92042c]"
                  >
                    <Upload size={15} />
                    Subir anverso
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleScanDNI}
                      disabled={scanning || scanDone}
                      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                        scanning || scanDone
                          ? "cursor-not-allowed bg-slate-200 text-slate-500"
                          : "bg-[#ab0433] text-white shadow-lg shadow-red-200 hover:bg-[#92042c]"
                      }`}
                    >
                      {scanning ? <><Loader2 size={15} className="animate-spin" /> Leyendo...</> : scanDone ? <><CheckCircle2 size={15} /> Completado</> : <><ScanLine size={15} /> Escanear DNI</>}
                    </button>
                    {!dniBackImage && (
                      <button
                        type="button"
                        onClick={() => backInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <Upload size={15} />
                        Añadir reverso
                      </button>
                    )}
                    {scanDone && (
                      <button
                        type="button"
                        onClick={handleScanDNI}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <RotateCcw size={15} />
                        Re-escanear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearDni}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100"
                    >
                      <X size={15} />
                      Limpiar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
        )}

        <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Datos detectados</p>
              <h2 className="mt-1 text-[15px] font-bold text-slate-900">
                {dniStep === "scan"
                  ? dniReviewEditable ? "Verificación editable del cliente" : "Resumen del cliente"
                  : "Identidad personal detectada"}
              </h2>
            </div>
            {dniStep === "scan" ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {dniReviewEditable
                    ? "Corrige o completa cualquier campo antes de continuar."
                    : "Si algo no está bien, abre la verificación editable."}
                </span>
                {scanDone && !scanError && (
                  <button
                    type="button"
                    onClick={() => setDniReviewEditable((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors ${
                      dniReviewEditable
                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-[#ab0433] text-white shadow-lg shadow-red-200 hover:bg-[#92042c]"
                    }`}
                  >
                    <Edit3 size={15} />
                    {dniReviewEditable ? "Cerrar verificación" : "Editar y verificar"}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                Los datos personales vienen del escáner y aquí ya no necesitas volver a rellenarlos.
              </div>
            )}
          </div>

          {dniStep === "scan" ? (
            !dniReviewEditable ? (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="Tipo documento" value={form.document_type} highlight={h("document_type")} />
                  <SummaryCard label="NIF / CIF" value={form.nif_cif} highlight={h("nif_cif")} />
                  <SummaryCard label="Nombre" value={form.first_name} highlight={h("first_name")} />
                  <SummaryCard label="Apellidos" value={form.last_name} highlight={h("last_name")} />
                  <SummaryCard label="Fecha nacimiento" value={form.birth_date} highlight={h("birth_date")} />
                  <SummaryCard label="Sexo" value={form.gender === "M" ? "Masculino" : form.gender === "F" ? "Femenino" : form.gender === "O" ? "Otro" : ""} highlight={h("gender")} />
                  <SummaryCard label="Nacionalidad" value={form.nationality} highlight={h("nationality")} />
                  <SummaryCard label="País expedición" value={form.expedition_country} highlight={h("expedition_country")} />
                  <SummaryCard label="Dirección" value={form.address_street} highlight={h("address_street")} />
                  <SummaryCard label="Población" value={form.address_town} highlight={h("address_town")} />
                  <SummaryCard label="Código postal" value={form.address_cp} highlight={h("address_cp")} />
                  <SummaryCard label="Provincia" value={form.address_province} highlight={h("address_province")} />
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  El siguiente paso no te pedirá de nuevo los datos personales. Si necesitas corregirlos antes, pulsa <span className="font-semibold text-slate-700">Editar y verificar</span>.
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 grid gap-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <F label="Tipo documento" required invalid={isInvalid("document_type")}>
                      <S name="document_type" value={form.document_type} onChange={handleChange} highlight={h("document_type")} invalid={isInvalid("document_type")}>
                        <option>DNI</option><option>NIE</option><option>Pasaporte</option><option>CIF</option><option>Otro</option>
                      </S>
                    </F>
                    <F label="NIF / CIF" required invalid={isInvalid("nif_cif")}>
                      <I name="nif_cif" value={form.nif_cif} onChange={handleChange} placeholder="12345678Z" highlight={h("nif_cif")} invalid={isInvalid("nif_cif")} required />
                      {nifDupEntity && (
                        <Link to={`/dashboard/clientes/${nifDupEntity.id}`} className="mt-1.5 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
                          <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                          <span>Ya existe: <span className="underline">{nifDupEntity.first_name} {nifDupEntity.last_name || nifDupEntity.commercial_name || ""}</span> · Ver ficha →</span>
                        </Link>
                      )}
                    </F>
                    <F label="Nombre" required invalid={isInvalid("first_name")}>
                      <I name="first_name" value={form.first_name} onChange={handleChange} placeholder="Nombre" highlight={h("first_name")} invalid={isInvalid("first_name")} required />
                    </F>
                    <F label="Apellidos" required invalid={isInvalid("last_name")}>
                      <I name="last_name" value={form.last_name} onChange={handleChange} placeholder="Apellidos" highlight={h("last_name")} invalid={isInvalid("last_name")} required />
                    </F>

                    <F label="Fecha nacimiento">
                      <I type="date" name="birth_date" value={form.birth_date} onChange={handleChange} highlight={h("birth_date")} />
                    </F>
                    <F label="Sexo">
                      <S name="gender" value={form.gender} onChange={handleChange} highlight={h("gender")}>
                        <option value="">—</option><option value="M">Masculino</option><option value="F">Femenino</option><option value="O">Otro</option>
                      </S>
                    </F>
                    <F label="Nacionalidad">
                      <I name="nationality" value={form.nationality} onChange={handleChange} highlight={h("nationality")} />
                    </F>
                    <F label="País expedición">
                      <S name="expedition_country" value={form.expedition_country} onChange={handleChange} highlight={h("expedition_country")}>
                        {PAISES.map((p) => <option key={p}>{p}</option>)}
                      </S>
                    </F>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  Revisa solo la identidad personal antes de continuar. Los campos con <span className="font-semibold text-slate-700">*</span> son obligatorios. El resto del alta se completará en el siguiente paso.
                </div>
              </>
            )
          ) : (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Tipo documento" value={form.document_type} highlight={h("document_type")} />
                <SummaryCard label="NIF / CIF" value={form.nif_cif} highlight={h("nif_cif")} />
                <SummaryCard label="Nombre" value={form.first_name} highlight={h("first_name")} />
                <SummaryCard label="Apellidos" value={form.last_name} highlight={h("last_name")} />
                <SummaryCard label="Fecha nacimiento" value={form.birth_date} highlight={h("birth_date")} />
                <SummaryCard label="Sexo" value={form.gender === "M" ? "Masculino" : form.gender === "F" ? "Femenino" : form.gender === "O" ? "Otro" : ""} highlight={h("gender")} />
                <SummaryCard label="Nacionalidad" value={form.nationality} highlight={h("nationality")} />
                <SummaryCard label="País expedición" value={form.expedition_country} highlight={h("expedition_country")} />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Estos datos personales vienen del lector y ya se mantendrán al guardar el cliente.
              </div>
            </>
          )}
        </section>

        {dniStep === "complete" && (
          <>
            <Section title="Dirección" icon={MapPin}>
              <div className="col-span-2 md:col-span-2">
                <F label="Dirección"><I name="address_street" value={form.address_street} onChange={handleChange} placeholder="Calle, número, piso..." highlight={h("address_street")} /></F>
              </div>
              <F label="Población">
                <I name="address_town" value={form.address_town} onChange={handleChange} placeholder="Ciudad" highlight={h("address_town")} />
              </F>
              <F label="Código postal">
                <I name="address_cp" value={form.address_cp} onChange={handleChange} placeholder="28000" highlight={h("address_cp")} />
              </F>
              <F label="Provincia">
                <S name="address_province" value={form.address_province} onChange={handleChange} highlight={h("address_province")}>
                  <option value="">— Selecciona —</option>
                  {PROVINCIAS.map((p) => <option key={p}>{p}</option>)}
                </S>
              </F>
              <F label="País">
                <S name="address_country" value={form.address_country} onChange={handleChange} highlight={h("address_country")}>
                  {PAISES.map((p) => <option key={p}>{p}</option>)}
                </S>
              </F>
            </Section>

            <Section title="Contacto" icon={Phone}>
              <div className="col-span-2 md:col-span-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Debes indicar al menos <span className="font-semibold text-slate-700">un móvil, teléfono o correo electrónico</span> para poder guardar el cliente.
              </div>
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

            <Section title="Administración" icon={Briefcase}>
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
              <F label="Nombre comercial">
                <I name="commercial_name" value={form.commercial_name} onChange={handleChange} placeholder="Ej: Transportes S.L." />
              </F>
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
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
                <Sparkles size={14} className="shrink-0 text-emerald-500" />
                Los campos resaltados en verde vienen del escáner del DNI. Aquí solo completas o corriges el resto antes de guardar.
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );

  return (
    <div className="flex gap-6 animate-in fade-in duration-500 bg-slate-50 -m-6 p-6 min-h-screen">

      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ COLUMNA PRINCIPAL ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
      <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-4">

        {/* Cabecera */}
        <div className={`bg-white border border-slate-200 rounded-xl ${isDniFlow || isLinkFlow ? "px-5 py-5" : "px-4 py-3"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Link to={isEdit ? `/dashboard/clientes/${id}` : "/dashboard/clientes"} className="shrink-0">
                <BackButton />
              </Link>
              <div className="flex min-w-0 items-center gap-2.5">
                <div className={`shrink-0 flex items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 ${isDniFlow || isLinkFlow ? "h-10 w-10" : "h-8 w-8"}`}>
                  {isDniFlow ? <ScanLine size={18} /> : <Users size={isDniFlow || isLinkFlow ? 18 : 15} className="text-red-600" />}
                </div>
                <div className="min-w-0">
                  <h1 className={`${isDniFlow || isLinkFlow ? "text-[17px]" : "text-sm"} font-bold text-slate-800 leading-tight truncate`}>
                    {isEdit
                      ? "Editar cliente"
                      : isDniFlow
                      ? "Dar de alta clientes con DNI"
                      : isLinkFlow
                      ? "Dar de alta clientes con enlace"
                      : "Nuevo cliente"}
                  </h1>
                  <p className={`${isDniFlow || isLinkFlow ? "text-sm mt-1" : "text-[11px]"} text-slate-400`}>
                    {isEdit
                      ? "Modifica los datos y pulsa Guardar cambios"
                      : isDniFlow
                      ? "Sube anverso y reverso del DNI para detectar automáticamente la identidad y revisar los datos del cliente."
                      : isLinkFlow
                      ? "Usa una referencia web para iniciar la ficha y completa después la información del cliente."
                      : "Ficha de alta · todos los campos son editables"}
                  </p>
                </div>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Link to={isEdit ? `/dashboard/clientes/${id}` : "/dashboard/clientes"}>
                <button type="button" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100">
                  <X size={14} /> Cancelar
                </button>
              </Link>
              <button
                type="submit"
                disabled={loading || showSuccess}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm shadow-red-200 transition-all hover:bg-red-700 disabled:opacity-60 active:scale-95"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Guardando...</>
                  : <><Save size={13} /> {isEdit ? "Guardar cambios" : "Guardar"}</>
                }
              </button>
            </div>
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

        {isDniFlow && (
          <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <h2 className="text-[15px] font-bold text-slate-900">Lectura inteligente del DNI</h2>
            <p className="mt-1 text-sm text-slate-500">
              Esta pantalla está orientada a importar primero la identidad del cliente desde su DNI y después revisar manualmente la ficha antes de guardar.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Anverso + reverso recomendado</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Mejor con buena luz</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Revisa los datos antes de guardar</span>
            </div>
          </div>
        )}

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ SCANNER DNI (solo en alta) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        {!isEdit && createMode !== "manual" && (
          <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
            {createMode === "dni" && (
              <div>
                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleDniFile("front", e.target.files[0])}
                />
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleDniFile("back", e.target.files[0])}
                />

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-6 py-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-[15px] font-bold text-slate-900">Importar datos desde DNI</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Vista asistida de lectura, similar a la importación de expedientes, pero centrada en anverso y reverso del DNI.
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {scanMeta?.source || "OpenAI / Gemini + Tesseract"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
                    <div className="grid gap-4 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => frontInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        className={`group relative min-h-[220px] overflow-hidden rounded-[24px] border-2 text-left transition-all ${
                          dniFrontImage
                            ? "border-slate-200 bg-slate-950"
                            : isDragOver
                            ? "scale-[1.01] border-[#ab0433]/45 bg-red-50"
                            : "border-dashed border-slate-200 bg-white hover:border-[#ab0433]/35 hover:bg-red-50/40"
                        }`}
                      >
                        {dniFrontImage ? (
                          <>
                            <img src={dniFrontImage} alt="DNI anverso" className="absolute inset-0 h-full w-full object-cover" />
                            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/35 to-transparent px-3 py-3">
                              <span className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white">Anverso</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void rotateDniSide("front"); }}
                                className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#ab0433]"
                              >
                                Girar
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 shadow-sm">
                              <ImageIcon size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">Subir anverso del DNI</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                Foto frontal, completa y con buena luz.
                              </p>
                            </div>
                          </div>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => backInputRef.current?.click()}
                        className={`group relative min-h-[220px] overflow-hidden rounded-[24px] border-2 text-left transition-all ${
                          dniBackImage
                            ? "border-slate-200 bg-slate-950"
                            : "border-dashed border-slate-200 bg-white hover:border-[#ab0433]/35 hover:bg-red-50/40"
                        }`}
                      >
                        {dniBackImage ? (
                          <>
                            <img src={dniBackImage} alt="DNI reverso" className="absolute inset-0 h-full w-full object-cover" />
                            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/35 to-transparent px-3 py-3">
                              <span className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white">Reverso</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void rotateDniSide("back"); }}
                                className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#ab0433]"
                              >
                                Girar
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 shadow-sm">
                              <ImageIcon size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">Subir reverso del DNI</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                Recomendado para domicilio, código postal y provincia.
                              </p>
                            </div>
                          </div>
                        )}
                      </button>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {dniFrontImage || dniBackImage ? "Fotos listas para procesar" : "Añade las fotos para comenzar"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        El anverso aporta la identidad básica. El reverso ayuda con domicilio, población, código postal y provincia.
                      </p>

                      {scanError && (
                        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <span>{scanError}</span>
                        </div>
                      )}

                      {scanDone && !scanError && (
                        <div className="mt-4 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                          <div className="flex flex-wrap items-center gap-2">
                            <Sparkles size={13} />
                            <span className="font-semibold">{filledFields.size} campos aplicados al formulario.</span>
                            {typeof scanMeta?.fieldCount === "number" && scanMeta.fieldCount > filledFields.size && (
                              <span className="text-emerald-700/90">Detectados {scanMeta.fieldCount}, pero algunos ya tenían valor.</span>
                            )}
                            {typeof scanMeta?.confidence === "number" && (
                              <span className="text-emerald-700/90">Confianza OCR {scanMeta.confidence}%</span>
                            )}
                          </div>
                          {scanMeta?.usedAi === false && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                              Este intento se ha hecho solo con Tesseract. Si no entra la capa de IA, la detección de nombre, sexo y fecha suele ser bastante peor.
                            </div>
                          )}
                          {scanMeta?.model && (
                            <div className="text-[11px] text-emerald-700/90">Modelo usado: {scanMeta.model}</div>
                          )}
                          {Array.isArray(scanMeta?.detectedFields) && scanMeta.detectedFields.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {scanMeta.detectedFields.map((field) => (
                                <span
                                  key={field.key}
                                  className={`rounded-full border px-2 py-1 ${
                                    filledFields.has(field.key)
                                      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                      : "border-slate-200 bg-white text-slate-600"
                                  }`}
                                  title={`${String(field.value)}${field.source ? ` • ${field.source}` : ""}`}
                                >
                                  {OCR_FIELD_LABELS[field.key] || field.key}: {String(field.value)}
                                  {field.source ? ` · ${field.source}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="text-[11px] text-emerald-700/90">
                            Cada chip indica de dónde sale el dato: OCR, OCR / MRZ, OpenAI vision o Gemini vision.
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Mejor con fondo liso</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Sin reflejos ni sombras</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Documento recto y completo</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Anverso + reverso recomendado</span>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {!dniFrontImage && !dniBackImage ? (
                          <button
                            type="button"
                            onClick={() => frontInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[#ab0433] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-200 transition-colors hover:bg-[#92042c]"
                          >
                            <Upload size={15} />
                            Subir anverso
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handleScanDNI}
                              disabled={scanning || scanDone}
                              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                                scanning || scanDone
                                  ? "cursor-not-allowed bg-slate-200 text-slate-500"
                                  : "bg-[#ab0433] text-white shadow-lg shadow-red-200 hover:bg-[#92042c]"
                              }`}
                            >
                              {scanning ? <><Loader2 size={15} className="animate-spin" /> Leyendo...</> : scanDone ? <><CheckCircle2 size={15} /> Completado</> : <><ScanLine size={15} /> Escanear DNI</>}
                            </button>
                            {!dniBackImage && (
                              <button
                                type="button"
                                onClick={() => backInputRef.current?.click()}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                              >
                                <Upload size={15} />
                                Añadir reverso
                              </button>
                            )}
                            {scanDone && (
                              <button
                                type="button"
                                onClick={handleScanDNI}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                              >
                                <RotateCcw size={15} />
                                Re-escanear
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={clearDni}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100"
                            >
                              <X size={15} />
                              Limpiar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {createMode === "link" && (
              <div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-6 py-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-[15px] font-bold text-slate-900">Crear cliente desde enlace</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Usa este modo cuando quieras iniciar la ficha a partir de una URL de referencia, formulario externo o enlace de contacto.
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                      Referencia web
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                    <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-amber-600">
                          <Upload size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Pega el enlace de referencia</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Lo guardaremos en el campo de página web para que puedas completar manualmente el resto de la ficha.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <F label="Enlace">
                          <I
                            type="url"
                            name="website"
                            value={form.website}
                            onChange={handleChange}
                            placeholder="https://..."
                          />
                        </F>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">Qué hace este modo</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Inicio rápido</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Referencia compartible</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Completar después</span>
                      </div>
                      <p className="mt-4 text-xs leading-6 text-slate-500">
                        Después podrás seguir rellenando la ficha del cliente manualmente. Este modo está pensado para no perder la referencia inicial.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {isDniFlow && (
          <div className="px-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Datos del cliente</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800">Revisión de la ficha detectada</h3>
          </div>
        )}

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ FOTO DE PERFIL + IDENTIFICACIÃƒÆ’Ã¢â‚¬Å“N ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <Users size={13} className="text-slate-400" />
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Identificación</h3>
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
              <F label="Tipo documento" required invalid={isInvalid("document_type")}>
                <S name="document_type" value={form.document_type} onChange={handleChange} highlight={h("document_type")} invalid={isInvalid("document_type")}>
                  <option>DNI</option><option>NIE</option><option>Pasaporte</option><option>CIF</option><option>Otro</option>
                </S>
              </F>
              <F label="NIF / CIF" required invalid={isInvalid("nif_cif")}>
                <I name="nif_cif" value={form.nif_cif} onChange={handleChange} placeholder="12345678Z" highlight={h("nif_cif")} invalid={isInvalid("nif_cif")} required />
                {nifDupEntity && (
                  <Link to={`/dashboard/clientes/${nifDupEntity.id}`} className="mt-1.5 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
                    <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                    <span>Ya existe: <span className="underline">{nifDupEntity.first_name} {nifDupEntity.last_name || nifDupEntity.commercial_name || ""}</span> · Ver ficha →</span>
                  </Link>
                )}
              </F>
              <F label="Tipo cliente" required invalid={isInvalid("type")}>
                <S name="type" value={form.type} onChange={handleChange} invalid={isInvalid("type")}>
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

              <F label="Nombre / Razón social" required invalid={isInvalid("first_name")}>
                <I name="first_name" value={form.first_name} onChange={handleChange} placeholder="Nombre" highlight={h("first_name")} invalid={isInvalid("first_name")} required className="md:col-span-2" />
              </F>
              <F label="Apellidos" required invalid={isInvalid("last_name")}>
                <I name="last_name" value={form.last_name} onChange={handleChange} placeholder="Apellidos" highlight={h("last_name")} invalid={isInvalid("last_name")} required />
              </F>
              <F label="Nombre comercial">
                <I name="commercial_name" value={form.commercial_name} onChange={handleChange} placeholder="Ej: Transportes S.L." />
              </F>
              <F label="Sexo">
                <S name="gender" value={form.gender} onChange={handleChange} highlight={h("gender")}>
                  <option value="">—</option><option value="M">Masculino</option><option value="F">Femenino</option><option value="O">Otro</option>
                </S>
              </F>

              <F label="Fecha nacimiento">
                <I type="date" name="birth_date" value={form.birth_date} onChange={handleChange} highlight={h("birth_date")} />
              </F>
              <F label="Edad">
                <I value={age !== null ? `${age} años` : ""} readOnly className="bg-slate-50 text-slate-400 cursor-default border-slate-100" />
              </F>
              <F label="Nacionalidad">
                <I name="nationality" value={form.nationality} onChange={handleChange} highlight={h("nationality")} />
              </F>
              <F label="País de expedición">
                <S name="expedition_country" value={form.expedition_country} onChange={handleChange} highlight={h("expedition_country")}>
                  {PAISES.map(p => <option key={p}>{p}</option>)}
                </S>
              </F>
            </div>
          </div>
        </div>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ DIRECCIÃƒÆ’Ã¢â‚¬Å“N ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Section title="Dirección" icon={MapPin}>
          <div className="col-span-2 md:col-span-2">
            <F label="Dirección"><I name="address_street" value={form.address_street} onChange={handleChange} placeholder="Calle, número, piso..." highlight={h("address_street")} /></F>
          </div>
          <F label="Población">
            <I name="address_town" value={form.address_town} onChange={handleChange} placeholder="Ciudad" highlight={h("address_town")} />
          </F>
          <F label="Código postal">
            <I name="address_cp" value={form.address_cp} onChange={handleChange} placeholder="28000" highlight={h("address_cp")} />
          </F>
          <F label="Provincia">
            <S name="address_province" value={form.address_province} onChange={handleChange} highlight={h("address_province")}>
              <option value="">— Selecciona —</option>
              {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
            </S>
          </F>
          <F label="País">
            <S name="address_country" value={form.address_country} onChange={handleChange} highlight={h("address_country")}>
              {PAISES.map(p => <option key={p}>{p}</option>)}
            </S>
          </F>
        </Section>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ CONTACTO ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Section title="Contacto" icon={Phone}>
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
        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ ADMINISTRACIÃƒÆ’Ã¢â‚¬Å“N ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Section title="Administración" icon={Briefcase}>
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

      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ PANEL INDICADORES ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
      <aside className="w-52 shrink-0 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-6">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <BarChart2 size={13} className="text-slate-400" />
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</h3>
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
