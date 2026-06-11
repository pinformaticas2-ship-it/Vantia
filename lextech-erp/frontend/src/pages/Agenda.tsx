import React, {
  useDeferredValue, useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Calendar, ChevronLeft, ChevronRight, Plus,
  Loader2, Clock, MapPin, Briefcase, Users,
  Trash2, Edit3, CheckCircle2, AlertCircle,
  Phone, Video, FileText, Flag, Circle,
  RefreshCw, ExternalLink, Link2, Unlink,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { createPortal } from "react-dom";
import BackButton from "../components/BackButton";

// ── Google Calendar Types ─────────────────────────────────────────────────────
interface GCalEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  htmlLink: string;
  status: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const GCAL_SCOPES   = "https://www.googleapis.com/auth/calendar";
const GCAL_TOKEN_KEY = "lextech-gcal-token-v1";
const GCAL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface AgendaEvent {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  type: string;
  status: string;
  expediente_id: string | null;
  cliente_id: string | null;
  related_user_id?: string | null;
  related_user_name?: string | null;
  organization_context?: string | null;
  location: string | null;
  color: string | null;
  source?: string | null;
  external_provider?: string | null;
  external_id?: string | null;
  external_url?: string | null;
}

interface AgendaOrganizationUser {
  user_id: string;
  user_name: string;
  avatar_url?: string | null;
}

interface AgendaOrganizationExpediente {
  id: string;
  ref_expediente?: string | null;
  ref_propia?: string | null;
  descripcion?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  related_users?: AgendaOrganizationUser[];
}

// ── Config de tipos de evento ─────────────────────────────────────────────────
const EVENT_TYPES: Record<string, { label: string; color: string; bg: string; dot: string; icon: any }> = {
  cita:    { label: "Cita",       color: "text-blue-700",   bg: "bg-blue-500",   dot: "bg-blue-500",   icon: Users },
  vista:   { label: "Vista oral", color: "text-red-700",    bg: "bg-red-500",    dot: "bg-red-500",    icon: Flag },
  reunion: { label: "Reunión",    color: "text-violet-700", bg: "bg-violet-500", dot: "bg-violet-500", icon: Users },
  plazo:   { label: "Plazo",      color: "text-amber-700",  bg: "bg-amber-500",  dot: "bg-amber-500",  icon: AlertCircle },
  llamada: { label: "Llamada",    color: "text-green-700",  bg: "bg-green-500",  dot: "bg-green-500",  icon: Phone },
  video:   { label: "Videollamada", color: "text-cyan-700", bg: "bg-cyan-500",   dot: "bg-cyan-500",   icon: Video },
  otro:    { label: "Otro",       color: "text-slate-700",  bg: "bg-slate-400",  dot: "bg-slate-400",  icon: Circle },
};

const STATUS_OPTS = [
  { value: "pendiente",  label: "Pendiente",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "completado", label: "Completado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelado",  label: "Cancelado",  cls: "bg-slate-100 text-slate-500 border-slate-200" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const DIAS    = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localDateKey(dateStr: string): string {
  return isoDate(new Date(dateStr));
}
function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function localDatetimeInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function inputToISO(val: string): string {
  if (!val) return "";
  return new Date(val).toISOString();
}

function moveIsoToDateKeepingTime(iso: string, targetDateKey: string) {
  const original = new Date(iso);
  const [year, month, day] = targetDateKey.split("-").map(Number);
  const moved = new Date(original);
  moved.setFullYear(year, month - 1, day);
  return moved.toISOString();
}

function stripHtml(value?: string | null) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

function buildGooglePayload(data: any) {
  const payload: Record<string, any> = {
    summary: data.title,
    description: data.description || "",
    location: data.location || "",
  };

  if (data.all_day) {
    const startDate = data.start_at.slice(0, 10);
    const endDate = data.end_at
      ? data.end_at.slice(0, 10)
      : startDate;
    const endDateObj = new Date(`${endDate}T12:00:00`);
    endDateObj.setDate(endDateObj.getDate() + 1);
    payload.start = { date: startDate };
    payload.end = { date: isoDate(endDateObj) };
  } else {
    payload.start = { dateTime: data.start_at };
    payload.end = { dateTime: data.end_at || data.start_at };
  }

  return payload;
}

// Generar días del calendario para un mes dado
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  // lunes = 0, domingo = 6
  let startDow = firstDay.getDay() - 1; // JS: 0=dom → ajustar a lunes=0
  if (startDow < 0) startDow = 6;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  // completar hasta múltiplo de 7
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

// ── Time-grid helpers ─────────────────────────────────────────────────────────
const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtHour(h: number): string {
  if (h === 0)  return "12 AM";
  if (h < 12)   return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// ── Formulario vacío ──────────────────────────────────────────────────────────
const emptyForm = (date?: string) => {
  // date puede ser "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm" (cuando se hace clic en una franja horaria)
  const hasTime = (date || "").length > 10;
  const startAt = date
    ? (hasTime ? date : `${date}T09:00`)
    : localDatetimeInput(new Date().toISOString());
  const endAt = !date
    ? localDatetimeInput(new Date(Date.now() + 3600000).toISOString())
    : hasTime
      ? `${date.slice(0, 10)}T${String(Math.min(parseInt(date.slice(11, 13), 10) + 1, 23)).padStart(2, "0")}:00`
      : `${date}T10:00`;
  return {
    title: "",
    description: "",
    start_at: startAt,
    end_at: endAt,
    all_day: false,
    type: "cita",
    status: "pendiente",
    location: "",
    expediente_id: "",
    cliente_id: "",
    related_user_id: "",
    related_user_name: "",
    organization_context: "",
  };
};

// ── Modal de evento ───────────────────────────────────────────────────────────
function EventModal({
  event,
  defaultDate,
  organizationExpedientes,
  organizationUsers,
  onClose,
  onSave,
  onDelete,
  saving,
  errorMsg,
}: {
  event: AgendaEvent | null;
  defaultDate: string | null;
  organizationExpedientes: AgendaOrganizationExpediente[];
  organizationUsers: AgendaOrganizationUser[];
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  errorMsg: string | null;
}) {
  const [form, setForm] = useState(event
    ? {
        title:        event.title,
        description:  event.description || "",
        start_at:     localDatetimeInput(event.start_at),
        end_at:       localDatetimeInput(event.end_at),
        all_day:      event.all_day,
        type:         event.type,
        status:       event.status,
        location:     event.location || "",
        expediente_id: event.expediente_id || "",
        cliente_id:   event.cliente_id || "",
        related_user_id: event.related_user_id || "",
        related_user_name: event.related_user_name || "",
        organization_context: event.organization_context || "",
      }
    : emptyForm(defaultDate || undefined)
  );

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const typeConf = EVENT_TYPES[form.type] || EVENT_TYPES.otro;
  const statusConf = STATUS_OPTS.find(s => s.value === form.status) || STATUS_OPTS[0];
  const [activeTab, setActiveTab] = useState<"details" | "organization">(
    event?.expediente_id || event?.cliente_id ? "organization" : "details"
  );
  const selectedExpediente = useMemo(
    () => organizationExpedientes.find((item) => item.id === form.expediente_id) || null,
    [organizationExpedientes, form.expediente_id]
  );
  const usersForSelectedExpediente = useMemo(() => {
    const related = selectedExpediente?.related_users || [];
    if (!related.length) return organizationUsers;
    const allowedIds = new Set(related.map((item) => item.user_id));
    return organizationUsers.filter((item) => allowedIds.has(item.user_id));
  }, [organizationUsers, selectedExpediente]);
  const expedientesForSelectedUser = useMemo(() => {
    if (!form.related_user_id) return organizationExpedientes;
    const filtered = organizationExpedientes.filter((item) =>
      (item.related_users || []).some((user) => user.user_id === form.related_user_id)
    );
    return filtered.length ? filtered : organizationExpedientes;
  }, [organizationExpedientes, form.related_user_id]);
  const missingTitle = !form.title.trim();
  const saveDisabledReason = saving
    ? "Guardando..."
    : missingTitle
      ? "Añade un título para poder guardar"
      : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      start_at: inputToISO(form.start_at),
      end_at:   form.end_at ? inputToISO(form.end_at) : null,
      expediente_id: activeTab === "organization" ? (form.expediente_id || null) : null,
      cliente_id:    activeTab === "organization" ? (form.cliente_id || null) : null,
      related_user_id: activeTab === "organization" ? (form.related_user_id || null) : null,
      related_user_name: activeTab === "organization" ? (form.related_user_name || null) : null,
      organization_context: activeTab === "organization" ? (form.organization_context || null) : null,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-[#fbfcfe] shadow-[0_40px_100px_rgba(15,23,42,0.22)] animate-in zoom-in-95 duration-200">
        {/* cabecera */}
        <div className="border-b border-slate-200 bg-white px-6 pb-5 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <BackButton onClick={onClose} />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  <typeConf.icon size={14} className="text-red-600" />
                  {event ? "Editar evento" : "Nuevo evento"}
                </div>
                <input
                  value={form.title}
                  onChange={e => set("title", e.target.value)}
                  placeholder="Añade un titulo"
                  required
                  className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 pb-3 text-3xl font-semibold text-slate-900 placeholder:text-slate-400 focus:border-red-400 focus:outline-none"
                />
                {missingTitle && <p className="mt-2 text-xs font-medium text-amber-600">Escribe un título para poder guardar el evento.</p>}
              </div>
            </div>
            <button
              type="submit"
              form="agenda-event-form"
              disabled={saving || missingTitle}
              title={saveDisabledReason}
              className="flex shrink-0 items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input
              type={form.all_day ? "date" : "datetime-local"}
              value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
              onChange={e => set("start_at", form.all_day ? e.target.value + "T00:00" : e.target.value)}
              required
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm focus:border-red-400 focus:outline-none"
            />
            {!form.all_day && (
              <>
                <span className="px-1 text-sm font-semibold text-slate-500">a</span>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={e => set("end_at", e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm focus:border-red-400 focus:outline-none"
                />
              </>
            )}
            <label className="ml-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={e => set("all_day", e.target.checked)}
                className="rounded border-slate-300 text-red-600 focus:ring-red-400"
              />
              Todo el dia
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">
            {errorMsg}
          </div>
        )}

        <form id="agenda-event-form" onSubmit={handleSubmit} className="grid gap-6 overflow-y-auto max-h-[72vh] px-6 py-6 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          {/* Título */}
          <div className="hidden">
            <label className="block text-xs font-bold text-slate-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Ej: Reunión cliente García, Vista oral J1ª…"
              required
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
            />
          </div>

          {/* Tipo + Estado */}
          <div className={`rounded-[28px] border p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:col-start-1 ${activeTab === "details" ? "border-red-100 bg-gradient-to-br from-white to-red-50/40" : "border-red-100 bg-white"}`}>
            <div className="mb-5 flex items-center gap-6 border-b border-slate-200 pb-3 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className={`pb-2 ${activeTab === "details" ? "border-b-2 border-red-500 text-red-600" : "text-slate-400"}`}
              >
                Detalles del evento
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("organization")}
                className={`pb-2 ${activeTab === "organization" ? "border-b-2 border-red-500 text-red-600" : "text-slate-400"}`}
              >
                Organizacion
              </button>
            </div>
            <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
              activeTab === "details"
                ? "border-slate-200 bg-slate-50 text-slate-600"
                : "border-red-100 bg-red-50/70 text-slate-700"
            }`}>
              {activeTab === "details"
                ? "Usa esta pestaña para eventos generales que no estén vinculados a ningún expediente."
                : "Usa esta pestaña cuando el evento esté relacionado con un expediente o con un cliente del despacho."}
            </div>
            <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => set("type", e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              >
                {Object.entries(EVENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
              <select
                value={form.status}
                onChange={e => set("status", e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              >
                {STATUS_OPTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            </div>
          </div>

          {/* Todo el día */}
          <label className="hidden">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={e => set("all_day", e.target.checked)}
              className="rounded border-slate-300 text-red-600 focus:ring-red-400"
            />
            <span className="text-sm text-slate-700 font-medium">Todo el día</span>
          </label>

          {/* Fechas */}
          <div className="hidden">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {form.all_day ? "Fecha" : "Inicio"} <span className="text-red-500">*</span>
              </label>
              <input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
                onChange={e => set("start_at", form.all_day ? e.target.value + "T00:00" : e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400"
              />
            </div>
            {!form.all_day && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fin</label>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={e => set("end_at", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400"
                />
              </div>
            )}
          </div>

          {/* Lugar */}
          <div className={`rounded-[28px] border p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:col-start-1 ${activeTab === "details" ? "border-red-100 bg-white" : "hidden"}`}>
            <label className="block text-xs font-bold text-slate-700 mb-1">Lugar / ubicación</label>
            <input
              value={form.location}
              onChange={e => set("location", e.target.value)}
              placeholder="Ej: Sala A, Juzgado nº3, Online…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Descripción */}
          <div className={`rounded-[28px] border p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:col-start-1 ${activeTab === "details" ? "border-red-100 bg-white" : "hidden"}`}>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notas</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Notas adicionales sobre el evento…"
              rows={8}
              className="w-full rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none resize-none"
            />
          </div>

          <div className={`rounded-[28px] border p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:col-start-1 ${activeTab === "organization" ? "border-red-100 bg-gradient-to-br from-white to-red-50/40" : "hidden"}`}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contexto</label>
                <textarea
                  value={form.organization_context}
                  onChange={e => set("organization_context", e.target.value)}
                  placeholder="Escribe el contexto del evento dentro del expediente..."
                  rows={4}
                  className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 focus:border-red-400 focus:outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Expediente existente</label>
                  <select
                    value={form.expediente_id}
                    onChange={e => {
                      const nextId = e.target.value;
                      const expediente = organizationExpedientes.find((item) => item.id === nextId);
                      set("expediente_id", nextId);
                      set("cliente_id", expediente?.cliente_id || "");
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:outline-none"
                  >
                    <option value="">Seleccionar expediente...</option>
                    {expedientesForSelectedUser.map((item) => (
                      <option key={item.id} value={item.id}>
                        {(item.ref_expediente || item.ref_propia || item.id)} · {item.descripcion || "Sin descripcion"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Usuario existente</label>
                  <select
                    value={form.related_user_id}
                    onChange={e => {
                      const nextId = e.target.value;
                      const selectedUser = organizationUsers.find((item) => item.user_id === nextId);
                      set("related_user_id", nextId);
                      set("related_user_name", selectedUser?.user_name || "");
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:outline-none"
                  >
                    <option value="">Seleccionar usuario...</option>
                    {usersForSelectedExpediente.map((item) => (
                      <option key={item.user_id} value={item.user_id}>
                        {item.user_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cliente vinculado</label>
                  <input
                    value={selectedExpediente?.cliente_nombre || form.cliente_id || ""}
                    onChange={e => set("cliente_id", e.target.value)}
                    placeholder="Cliente del expediente"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Usuario seleccionado</label>
                  <input
                    value={form.related_user_name || ""}
                    onChange={e => set("related_user_name", e.target.value)}
                    placeholder="Nombre del usuario relacionado"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-red-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-4 text-sm text-slate-600">
                <div className="font-semibold text-red-700">Contexto del ERP</div>
                <p className="mt-1">Puedes seleccionar un expediente existente, un usuario existente vinculado a ese expediente y dejar por escrito el contexto del evento.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-start-2">
            <div className="rounded-[28px] border border-red-100 bg-gradient-to-br from-white to-red-50/40 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users size={16} className="text-red-600" />
                Resumen
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-2xl border border-red-100 bg-white px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Tipo</div>
                  <div className="mt-1 font-semibold text-slate-700">{typeConf.label}</div>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Estado</div>
                  <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusConf.cls}`}>
                    {statusConf.label}
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Sincronizacion</div>
                  <div className="mt-1 text-slate-600">
                    {event?.external_provider === "google"
                      ? "Este evento esta vinculado con Google Calendar."
                      : "Si Google esta conectado, se sincronizara al guardar."}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Relacion</div>
                  <div className="mt-1 text-slate-700">
                    {activeTab === "organization"
                      ? "Relacionado con expediente"
                      : "Evento independiente"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <div className="mb-3 text-sm font-semibold text-slate-800">Acciones</div>
              <div className="space-y-2">
                {event ? (
                  <button
                    type="button"
                    onClick={() => onDelete(event.id)}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Eliminar evento
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function GoogleEventModal({
  event,
  importing,
  onClose,
  onImport,
}: {
  event: GCalEvent;
  importing: boolean;
  onClose: () => void;
  onImport: (event: GCalEvent) => Promise<void>;
}) {
  const startDate = event.start.dateTime
    ? new Date(event.start.dateTime)
    : (event.start.date ? new Date(`${event.start.date}T12:00:00`) : null);
  const endDate = event.end.dateTime
    ? new Date(event.end.dateTime)
    : (event.end.date ? new Date(`${event.end.date}T12:00:00`) : null);
  const isAllDay = !event.start.dateTime;

  const readOnlyField =
    "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 bg-slate-50/80";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 flex items-center justify-between bg-blue-600 text-white">
          <div className="flex items-center gap-2.5">
            <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="Google Calendar" className="w-5 h-5" />
            <span className="font-bold text-sm">Evento de Google Calendar</span>
          </div>
          <BackButton onClick={onClose} variant="dark" />
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Titulo</label>
            <input value={event.summary || "(Sin titulo)"} readOnly className={readOnlyField} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo</label>
              <input value="Google Calendar" readOnly className={readOnlyField} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
              <input value={event.status || "confirmado"} readOnly className={readOnlyField} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Todo el dia</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-700">
              <CheckCircle2 size={15} className={isAllDay ? "text-emerald-500" : "text-slate-300"} />
              <span>{isAllDay ? "Si" : "No"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{isAllDay ? "Fecha" : "Inicio"}</label>
              <input
                value={startDate ? startDate.toLocaleString("es-ES") : ""}
                readOnly
                className={readOnlyField}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{isAllDay ? "Fin" : "Fin"}</label>
              <input
                value={endDate ? endDate.toLocaleString("es-ES") : (isAllDay ? "Todo el dia" : "")}
                readOnly
                className={readOnlyField}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Lugar / ubicacion</label>
            <input value={event.location || "Sin ubicacion"} readOnly className={readOnlyField} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notas</label>
            <textarea
              value={stripHtml(event.description) || "Sin descripcion"}
              readOnly
              rows={3}
              className={`${readOnlyField} resize-none`}
            />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
            <div className="flex items-center gap-2 text-blue-700 text-sm font-semibold">
              <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="" className="w-4 h-4" />
              Acciones de Google Calendar
            </div>
            <p className="text-xs text-blue-600 mt-1">
              Este evento viene de Google. Puedes abrirlo alli o traerlo al ERP manteniendo el vinculo.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-400">Evento externo vinculado con Google</span>
            <div className="flex gap-2">
              <a
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
              >
                <ExternalLink size={12} /> Abrir en Google
              </a>
              <button
                type="button"
                onClick={() => onImport(event)}
                disabled={importing}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {importing ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                Importar al ERP
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Vista de rejilla horaria (Semana / Día) ───────────────────────────────────
function TimeGridView({
  days,
  eventsByDay,
  gcalEventsByDay,
  selectedDay,
  todayStr,
  movingEventId,
  onSlotClick,
  onEventClick,
  onGcalEventClick,
  onDayHeaderClick,
  onResizeEvent,
  onMoveEvent,
}: {
  days: string[];
  eventsByDay: Record<string, AgendaEvent[]>;
  gcalEventsByDay: Record<string, GCalEvent[]>;
  selectedDay: string;
  todayStr: string;
  movingEventId: string | null;
  onSlotClick: (dateStr: string, hour: number) => void;
  onEventClick: (ev: AgendaEvent) => void;
  onGcalEventClick: (ev: GCalEvent) => void;
  onDayHeaderClick: (dateStr: string) => void;
  onResizeEvent: (id: string, newEndAt: string) => Promise<void>;
  onMoveEvent: (id: string, newStartAt: string, newEndAt: string | null, allDay?: boolean) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Drag-to-move state ───────────────────────────────────────────────────────
  const [draggingId,    setDraggingId]    = useState<string | null>(null);
  const [dragOverSlot,  setDragOverSlot]  = useState<{ dateStr: string; mins: number } | null>(null);
  const dragOffsetMinsRef = useRef<number>(0); // minutes from top of event where user grabbed
  const dragDurationRef   = useRef<number>(60); // duration of dragged event in minutes

  const calcMinsFromMouseY = (e: React.DragEvent, colEl: HTMLDivElement): number => {
    const scroll = scrollRef.current?.scrollTop ?? 0;
    const containerTop = scrollRef.current?.getBoundingClientRect().top ?? 0;
    const rawY = (e.clientY - containerTop) + scroll - dragOffsetMinsRef.current * (HOUR_HEIGHT / 60);
    const totalMins = Math.max(0, Math.min((rawY / HOUR_HEIGHT) * 60, 24 * 60 - dragDurationRef.current));
    return Math.round(totalMins / 15) * 15;
  };

  // ── Resize de eventos ────────────────────────────────────────────────────────
  const resizingRef = useRef<{ id: string; startAt: string; endAt: string } | null>(null);
  const [resizingDisplay, setResizingDisplay] = useState<{ id: string; endAt: string } | null>(null);
  const onResizeEventRef = useRef(onResizeEvent);
  onResizeEventRef.current = onResizeEvent;

  // ── Drag para mover eventos ───────────────────────────────────────────────────
  const draggingRef = useRef<{
    id: string; startAt: string; endAt: string | null;
    durationMs: number; grabOffsetMins: number;
  } | null>(null);
  const [dragDisplay, setDragDisplay] = useState<{
    id: string; dateStr: string; startAt: string; endAt: string | null;
    droppingToAllDay?: boolean;
  } | null>(null);
  const columnRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const onMoveEventRef = useRef(onMoveEvent);
  onMoveEventRef.current = onMoveEvent;

  // ── Drag de eventos de todo el día ────────────────────────────────────────────
  const draggingAllDayRef = useRef<{
    id: string; origDateStr: string; startAt: string; endAt: string | null;
    title: string; colorBg: string;
  } | null>(null);
  const [allDayDragDisplay, setAllDayDragDisplay] = useState<{
    id: string; targetDateStr: string; title: string; colorBg: string;
    timedStartAt?: string;
  } | null>(null);

  // Función para encontrar la columna bajo el cursor
  const findDateStrAtX = useCallback((clientX: number): string => {
    let best = days[0];
    for (const [dateStr, el] of columnRefsMap.current) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) { best = dateStr; break; }
    }
    return best;
  }, [days]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Drag todo el día
      if (draggingAllDayRef.current) {
        const targetDateStr = findDateStrAtX(e.clientX);
        let timedStartAt: string | undefined;
        if (scrollRef.current) {
          const gridRect = scrollRef.current.getBoundingClientRect();
          if (e.clientY >= gridRect.top && e.clientY <= gridRect.bottom) {
            const rawY = e.clientY - gridRect.top + scrollRef.current.scrollTop;
            const snapped = Math.round(Math.max(0, Math.min((rawY / HOUR_HEIGHT) * 60, 24 * 60 - 60)) / 15) * 15;
            const base = new Date(targetDateStr + "T00:00:00");
            base.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
            timedStartAt = base.toISOString();
          }
        }
        setAllDayDragDisplay(prev => {
          const next = { id: draggingAllDayRef.current!.id, targetDateStr, title: draggingAllDayRef.current!.title, colorBg: draggingAllDayRef.current!.colorBg, timedStartAt };
          if (prev?.targetDateStr === next.targetDateStr && prev?.timedStartAt === next.timedStartAt) return prev;
          return next;
        });
        return;
      }
      // Resize
      if (resizingRef.current && scrollRef.current) {
        const rect = scrollRef.current.getBoundingClientRect();
        const rawY = e.clientY - rect.top + scrollRef.current.scrollTop;
        const totalMins = Math.max(0, Math.min((rawY / HOUR_HEIGHT) * 60, 24 * 60 - 1));
        const snapped = Math.round(totalMins / 15) * 15;
        const start = new Date(resizingRef.current.startAt);
        const startMins = start.getHours() * 60 + start.getMinutes();
        const newEndMins = Math.max(snapped, startMins + 15);
        const end = new Date(resizingRef.current.startAt);
        end.setHours(Math.floor(newEndMins / 60), newEndMins % 60, 0, 0);
        const newEndAt = end.toISOString();
        resizingRef.current = { ...resizingRef.current, endAt: newEndAt };
        setResizingDisplay(prev => prev ? { ...prev, endAt: newEndAt } : null);
        return;
      }
      // Drag
      if (draggingRef.current && scrollRef.current) {
        const gridRect = scrollRef.current.getBoundingClientRect();
        const targetDateStr = findDateStrAtX(e.clientX);
        // Si el cursor está sobre la banda de todo el día
        if (e.clientY < gridRect.top) {
          setDragDisplay({ id: draggingRef.current.id, dateStr: targetDateStr, startAt: draggingRef.current.startAt, endAt: draggingRef.current.endAt, droppingToAllDay: true });
          return;
        }
        const rawY = e.clientY - gridRect.top + scrollRef.current.scrollTop;
        const rawMins = (rawY / HOUR_HEIGHT) * 60 - draggingRef.current.grabOffsetMins;
        const snapped = Math.round(rawMins / 15) * 15;
        const clampedStart = Math.max(0, Math.min(snapped, 24 * 60 - 15));
        const base = new Date(targetDateStr + "T00:00:00");
        const newStart = new Date(base);
        newStart.setHours(Math.floor(clampedStart / 60), clampedStart % 60, 0, 0);
        const newEnd = draggingRef.current.durationMs > 0
          ? new Date(newStart.getTime() + draggingRef.current.durationMs)
          : null;
        setDragDisplay({ id: draggingRef.current.id, dateStr: targetDateStr, startAt: newStart.toISOString(), endAt: newEnd?.toISOString() ?? null });
      }
    };
    const handleMouseUp = async () => {
      // Drag todo el día
      if (draggingAllDayRef.current) {
        const drag = draggingAllDayRef.current;
        draggingAllDayRef.current = null;
        const display = allDayDragDisplay;
        setAllDayDragDisplay(null);
        if (display?.timedStartAt) {
          // Convertir a evento con hora
          const newEndAt = new Date(new Date(display.timedStartAt).getTime() + 3600000).toISOString();
          await onMoveEventRef.current(drag.id, display.timedStartAt, newEndAt, false);
        } else if (display && display.targetDateStr !== drag.origDateStr) {
          // Mover a otro día (sigue siendo todo el día)
          const newStartAt = display.targetDateStr + "T00:00:00";
          let newEndAt: string | null = null;
          if (drag.endAt) {
            const origMs = new Date(drag.startAt.slice(0, 10) + "T00:00:00").getTime();
            const endMs = new Date(drag.endAt.slice(0, 10) + "T00:00:00").getTime();
            newEndAt = new Date(new Date(newStartAt).getTime() + (endMs - origMs)).toISOString();
          }
          await onMoveEventRef.current(drag.id, newStartAt, newEndAt);
        }
        return;
      }
      // Resize
      if (resizingRef.current) {
        const ev = resizingRef.current;
        resizingRef.current = null;
        setResizingDisplay(null);
        await onResizeEventRef.current(ev.id, ev.endAt);
        return;
      }
      // Drag
      if (draggingRef.current) {
        const drag = draggingRef.current;
        draggingRef.current = null;
        const display = dragDisplay;
        setDragDisplay(null);
        if (display?.droppingToAllDay) {
          await onMoveEventRef.current(drag.id, display.dateStr + "T00:00:00", null, true);
        } else if (display && (display.startAt !== drag.startAt || display.dateStr !== drag.startAt.slice(0, 10))) {
          await onMoveEventRef.current(drag.id, display.startAt, display.endAt);
        }
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragDisplay, allDayDragDisplay, findDateStrAtX]);

  const [nowMins, setNowMins] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMins(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(id);
  }, []);
  const nowTopPx = (nowMins / 60) * HOUR_HEIGHT;

  useEffect(() => {
    if (scrollRef.current) {
      const n = new Date();
      const mins = n.getHours() * 60 + n.getMinutes();
      scrollRef.current.scrollTop = Math.max(0, (mins / 60 - 1.5) * HOUR_HEIGHT);
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
      {/* Overlay de cursor durante resize o drag */}
      {resizingDisplay && (
        <div className="fixed inset-0 cursor-s-resize" style={{ zIndex: 9999 }} />
      )}
      {allDayDragDisplay && (
        <div className="fixed inset-0 cursor-grabbing" style={{ zIndex: 9999 }} />
      )}
      {dragDisplay && (
        <div className="fixed inset-0 cursor-grabbing select-none" style={{ zIndex: 9999 }} />
      )}
      {/* Cabecera de días */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white">
        <div className="w-16 shrink-0" />
        {days.map(dateStr => {
          const d = new Date(dateStr + "T12:00:00");
          const dow = d.getDay();
          const dayLabel = DIAS[dow === 0 ? 6 : dow - 1];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className="flex-1 py-3 text-center border-l border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => onDayHeaderClick(dateStr)}
            >
              <div className={`text-[11px] font-medium uppercase tracking-wider ${isToday ? "text-blue-600" : "text-gray-500"}`}>
                {dayLabel}
              </div>
              <div className={`mx-auto mt-1 h-10 w-10 flex items-center justify-center rounded-full text-xl font-normal ${
                isToday ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
              }`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Banda de eventos de todo el día */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white min-h-[28px]">
        <div className="w-16 shrink-0 border-r border-gray-100 flex items-end justify-end pr-2 pb-1">
          <span className="text-[9px] text-gray-400 select-none">Todo el día</span>
        </div>
        {days.map(dateStr => {
          const allDayLex = (eventsByDay[dateStr] || []).filter(ev => ev.all_day);
          const allDayGcal = (gcalEventsByDay[dateStr] || []).filter(ev => !ev.start.dateTime);
          return (
            <div key={dateStr} className="flex-1 border-l border-gray-100 px-0.5 py-0.5 space-y-0.5">
              {allDayLex.map(ev => {
                const tc = EVENT_TYPES[ev.type] || EVENT_TYPES.otro;
                const isBeingDragged = allDayDragDisplay?.id === ev.id;
                return (
                  <div
                    key={ev.id}
                    onClick={e => { if (allDayDragDisplay) return; e.stopPropagation(); onEventClick(ev); }}
                    onMouseDown={e => {
                      if (e.button !== 0) return;
                      e.stopPropagation(); e.preventDefault();
                      draggingAllDayRef.current = { id: ev.id, origDateStr: dateStr, startAt: ev.start_at, endAt: ev.end_at, title: ev.title, colorBg: tc.bg };
                      setAllDayDragDisplay({ id: ev.id, targetDateStr: dateStr, title: ev.title, colorBg: tc.bg });
                    }}
                    className={`text-[11px] font-medium truncate px-2 py-0.5 rounded text-white select-none ${tc.bg} ${isBeingDragged ? "opacity-30 cursor-grabbing" : "cursor-grab"}`}
                  >
                    {ev.title}
                  </div>
                );
              })}
              {/* Ghost en columna destino (drag todo-el-día entre columnas) */}
              {allDayDragDisplay?.targetDateStr === dateStr && !allDayLex.some(e => e.id === allDayDragDisplay.id) && (
                <div className={`text-[11px] font-medium truncate px-2 py-0.5 rounded text-white pointer-events-none ring-2 ring-white/50 opacity-80 ${allDayDragDisplay.colorBg}`}>
                  {allDayDragDisplay.title}
                </div>
              )}
              {/* Ghost al arrastrar evento temporizado a la banda de todo el día */}
              {dragDisplay?.droppingToAllDay && dragDisplay.dateStr === dateStr && (() => {
                const draggedEv = Object.values(eventsByDay).flat().find(e => e.id === dragDisplay.id);
                if (!draggedEv) return null;
                const tc2 = EVENT_TYPES[draggedEv.type] || EVENT_TYPES.otro;
                return (
                  <div className={`text-[11px] font-medium truncate px-2 py-0.5 rounded text-white pointer-events-none ring-2 ring-white/50 opacity-80 ${tc2.bg}`}>
                    {draggedEv.title}
                  </div>
                );
              })()}
              {allDayGcal.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => onGcalEventClick(ev)}
                  className="text-[11px] font-medium truncate px-2 py-0.5 rounded cursor-pointer bg-blue-500 text-white"
                >
                  {ev.summary}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Rejilla horaria con scroll */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto bg-white scroll-smooth">
        {/* Columna de horas (estilo Google AM/PM) */}
        <div className="w-16 shrink-0 relative bg-white" style={{ height: 24 * HOUR_HEIGHT }}>
          {HOURS.map(h => (
            <div
              key={h}
              className="absolute right-2 text-[10px] text-gray-400 select-none -translate-y-[7px] text-right"
              style={{ top: h * HOUR_HEIGHT }}
            >
              {h > 0 ? fmtHour(h) : ""}
            </div>
          ))}
        </div>

        {/* Columnas de días */}
        <div className="flex flex-1 border-l border-gray-200" style={{ height: 24 * HOUR_HEIGHT }}>
          {days.map(dateStr => {
            const isToday = dateStr === todayStr;
            const timedEvs = (eventsByDay[dateStr] || []).filter(ev => !ev.all_day);
            const timedGcal = (gcalEventsByDay[dateStr] || []).filter(ev => !!ev.start.dateTime);
            return (
              <div key={dateStr} ref={el => { columnRefsMap.current.set(dateStr, el); }} className="flex-1 border-r border-gray-200 relative">
                {/* Celdas de hora (clic para crear) */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full cursor-pointer group/slot hover:bg-blue-50/40 transition-colors duration-75"
                    style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    onClick={() => onSlotClick(dateStr, h)}
                  >
                    {h > 0 && <div className="border-t border-gray-100 w-full" />}
                    <span className="absolute left-1 top-0.5 text-[9px] text-blue-400 opacity-0 group-hover/slot:opacity-100 transition-opacity duration-75 select-none pointer-events-none font-medium">
                      {fmtHour(h)}
                    </span>
                  </div>
                ))}
                {/* Líneas de media hora */}
                {HOURS.map(h => (
                  <div
                    key={`half-${h}`}
                    className="absolute w-full pointer-events-none"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  >
                    <div className="border-t border-dashed border-gray-100 w-full" />
                  </div>
                ))}
                {/* Línea de hora actual (solo en la columna de hoy) */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none flex items-center"
                    style={{ top: nowTopPx, zIndex: 20 }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 -ml-1" />
                    <div className="flex-1 border-t-2 border-red-500" />
                  </div>
                )}
                {/* Ghost de drop (preview) */}
                {dragOverSlot?.dateStr === dateStr && draggingId && (() => {
                  const ghostTopPx = (dragOverSlot.mins / 60) * HOUR_HEIGHT;
                  const ghostH = Math.max((dragDurationRef.current / 60) * HOUR_HEIGHT - 2, 20);
                  return (
                    <div
                      className="absolute left-1 right-1 rounded border-2 border-dashed border-white/70 bg-white/20 pointer-events-none"
                      style={{ top: ghostTopPx, height: ghostH, zIndex: 25 }}
                    />
                  );
                })()}

                {/* Eventos LexTech con hora */}
                {/* Ghost de drag en esta columna */}
                {dragDisplay && dragDisplay.dateStr === dateStr && (() => {
                  const ghStart = new Date(dragDisplay.startAt);
                  const ghEnd = dragDisplay.endAt ? new Date(dragDisplay.endAt) : new Date(ghStart.getTime() + 3600000);
                  const ghTop = (ghStart.getHours() + ghStart.getMinutes() / 60) * HOUR_HEIGHT;
                  const ghDur = Math.max((ghEnd.getTime() - ghStart.getTime()) / 3600000, 0.25);
                  const ghHeight = ghDur * HOUR_HEIGHT - 2;
                  const allEvs = Object.values(eventsByDay).flat();
                  const origEv = allEvs.find(e => e.id === dragDisplay.id);
                  const tc = EVENT_TYPES[origEv?.type || "otro"] || EVENT_TYPES.otro;
                  return (
                    <div
                      className={`absolute left-1 right-1 rounded px-2 py-1 text-[11px] font-medium text-white pointer-events-none shadow-lg ring-2 ring-white/60 ${tc.bg} opacity-90`}
                      style={{ top: ghTop, height: ghHeight, zIndex: 50 }}
                    >
                      <div className="font-semibold truncate leading-tight">{origEv?.title}</div>
                      <div className="text-white/80 text-[10px] leading-tight">
                        {fmtTime(dragDisplay.startAt)}{dragDisplay.endAt ? ` – ${fmtTime(dragDisplay.endAt)}` : ""}
                      </div>
                    </div>
                  );
                })()}


                {/* Ghost al arrastrar evento de todo-el-día a la rejilla horaria */}
                {allDayDragDisplay?.timedStartAt && allDayDragDisplay.targetDateStr === dateStr && (() => {
                  const start = new Date(allDayDragDisplay.timedStartAt!);
                  const end = new Date(start.getTime() + 3600000);
                  const topPx = (start.getHours() + start.getMinutes() / 60) * HOUR_HEIGHT;
                  return (
                    <div
                      className={`absolute left-1 right-1 rounded px-2 py-1 text-[11px] font-medium text-white pointer-events-none ring-2 ring-white/50 opacity-80 ${allDayDragDisplay.colorBg}`}
                      style={{ top: topPx, height: HOUR_HEIGHT - 2, zIndex: 20 }}
                    >
                      <div className="font-semibold truncate leading-tight">{allDayDragDisplay.title}</div>
                      <div className="text-[10px] leading-tight text-white/80">
                        {fmtTime(allDayDragDisplay.timedStartAt!)} – {fmtTime(end.toISOString())}
                      </div>
                    </div>
                  );
                })()}

                {timedEvs.map(ev => {
                  const isResizing = resizingDisplay?.id === ev.id;
                  const isDragging = dragDisplay?.id === ev.id;
                  const effectiveEndAt = isResizing ? resizingDisplay!.endAt : ev.end_at;
                  const start = new Date(ev.start_at);
                  const end = effectiveEndAt ? new Date(effectiveEndAt) : new Date(start.getTime() + 3600000);
                  const topPx = (start.getHours() + start.getMinutes() / 60) * HOUR_HEIGHT;
                  const durationH = Math.max((end.getTime() - start.getTime()) / 3600000, 0.25);
                  const heightPx = durationH * HOUR_HEIGHT - 2;
                  const tc = EVENT_TYPES[ev.type] || EVENT_TYPES.otro;
                  return (
                    <div
                      key={ev.id}
                      onClick={e => { if (isResizing || isDragging) return; e.stopPropagation(); onEventClick(ev); }}
                      onMouseDown={e => {
                        if (e.button !== 0 || resizingRef.current) return;
                        const target = e.target as HTMLElement;
                        if (target.closest("[data-resize-handle]")) return;
                        e.stopPropagation(); e.preventDefault();
                        const endMs = ev.end_at ? new Date(ev.end_at).getTime() : start.getTime() + 3600000;
                        const gridRect = scrollRef.current?.getBoundingClientRect() ?? { top: 0 };
                        const rawY = e.clientY - gridRect.top + (scrollRef.current?.scrollTop ?? 0);
                        const mouseTimeMins = (rawY / HOUR_HEIGHT) * 60;
                        const eventStartMins = start.getHours() * 60 + start.getMinutes();
                        draggingRef.current = {
                          id: ev.id, startAt: ev.start_at, endAt: ev.end_at,
                          durationMs: endMs - start.getTime(),
                          grabOffsetMins: mouseTimeMins - eventStartMins,
                        };
                        setDragDisplay({ id: ev.id, dateStr, startAt: ev.start_at, endAt: ev.end_at });
                      }}
                      className={`absolute left-1 right-1 rounded px-2 py-1 text-[11px] font-medium text-white overflow-visible shadow-sm group/ev ${tc.bg} ${movingEventId === ev.id || isDragging ? "opacity-40" : isResizing ? "brightness-110 shadow-lg" : "hover:brightness-110 hover:shadow-md"} transition-all duration-150 select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                      style={{ top: topPx, height: heightPx, zIndex: isResizing ? 30 : 10 }}
                    >
                      {isResizing ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                          <span className="bg-black/30 text-white text-[10px] font-bold rounded px-1.5 py-0.5 truncate max-w-full">
                            {fmtTime(ev.start_at)} – {fmtTime(resizingDisplay!.endAt)}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="font-semibold truncate leading-tight">{ev.title}</div>
                          <div className="text-[10px] leading-tight text-white/80">
                            {fmtTime(ev.start_at)}{effectiveEndAt ? ` – ${fmtTime(effectiveEndAt)}` : ""}
                          </div>
                        </>
                      )}
                      {/* Handle de resize */}
                      <div
                        data-resize-handle="true"
                        className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-end justify-center pb-0.5 rounded-b opacity-0 group-hover/ev:opacity-100 transition-opacity duration-150"
                        onMouseDown={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          resizingRef.current = { id: ev.id, startAt: ev.start_at, endAt: ev.end_at || new Date(start.getTime() + 3600000).toISOString() };
                          setResizingDisplay({ id: ev.id, endAt: ev.end_at || new Date(start.getTime() + 3600000).toISOString() });
                        }}
                      >
                        <div className="w-8 h-1 rounded-full bg-white/50 hover:bg-white/90 transition-colors" />
                      </div>
                    </div>
                  );
                })}
                {/* Eventos Google Calendar con hora */}
                {timedGcal.map(ev => {
                  const start = new Date(ev.start.dateTime as string);
                  const end = ev.end.dateTime ? new Date(ev.end.dateTime) : new Date(start.getTime() + 3600000);
                  const topPx = (start.getHours() + start.getMinutes() / 60) * HOUR_HEIGHT;
                  const durationH = Math.max((end.getTime() - start.getTime()) / 3600000, 0.33);
                  const heightPx = durationH * HOUR_HEIGHT - 2;
                  return (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onGcalEventClick(ev); }}
                      className="absolute left-1 right-1 rounded px-2 py-1 text-[11px] font-medium text-white cursor-pointer overflow-hidden shadow-sm bg-blue-500 hover:bg-blue-600 hover:shadow-md transition-all duration-150"
                      style={{ top: topPx, height: heightPx, zIndex: 10 }}
                    >
                      <div className="font-semibold truncate leading-tight">{ev.summary}</div>
                      <div className="text-white/80 text-[10px] leading-tight">
                        {start.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal Agenda ───────────────────────────────────────────────
export default function Agenda() {
  const { getToken } = useAuth();

  // Estado del calendario
  const today = useMemo(() => new Date(), []);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string>(isoDate(today));
  const [view, setView] = useState<"month" | "week" | "day">("week");

  // Datos LexTech
  const [events,   setEvents]   = useState<AgendaEvent[]>([]);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [movingEventId, setMovingEventId] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);

  // ── Google Calendar ──────────────────────────────────────────────────────────
  const [gcalToken,    setGcalToken]    = useState<string | null>(() => {
    try { return sessionStorage.getItem(GCAL_TOKEN_KEY); } catch { return null; }
  });
  const [gcalEvents,   setGcalEvents]   = useState<GCalEvent[]>([]);
  const [gcalLoading,  setGcalLoading]  = useState(false);
  const [gcalError,    setGcalError]    = useState<string | null>(null);
  const [gcalEnabled,  setGcalEnabled]  = useState(!!gcalToken);
  const [gcalNotice,   setGcalNotice]   = useState<string | null>(null);
  const [gcalImporting, setGcalImporting] = useState(false);

  const fetchGcalEvents = useCallback(async (token: string, year: number, month: number) => {
    setGcalLoading(true);
    setGcalError(null);
    try {
      const from = new Date(year, month - 1, 15).toISOString();
      const to   = new Date(year, month + 2, 15).toISOString();
      const res  = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}` +
        `&maxResults=250&orderBy=startTime&singleEvents=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) {
        // Token expirado
        setGcalToken(null);
        setGcalEnabled(false);
        try { sessionStorage.removeItem(GCAL_TOKEN_KEY); } catch {}
        setGcalError("Sesión de Google expirada. Reconecta.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setGcalError(data?.error?.message || "No se pudieron leer los eventos de Google Calendar.");
        return;
      }
      setGcalEvents(data.items || []);
    } catch {
      setGcalError("Error al obtener eventos de Google Calendar.");
    } finally {
      setGcalLoading(false);
    }
  }, []);

  const connectGcal = useCallback(() => {
    if (!GCAL_CLIENT_ID || GCAL_CLIENT_ID === "TU_CLIENT_ID.apps.googleusercontent.com") {
      setGcalError("Configura VITE_GOOGLE_CLIENT_ID en el archivo .env del frontend.");
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setGcalError("El script de Google aún no está cargado. Recarga la página.");
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: GCAL_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          setGcalError("Error al autenticar con Google: " + (resp.error || "desconocido"));
          return;
        }
        const token = resp.access_token;
        setGcalToken(token);
        setGcalEnabled(true);
        setGcalError(null);
        setGcalNotice("Google Calendar conectado correctamente.");
        try { sessionStorage.setItem(GCAL_TOKEN_KEY, token); } catch {}
        fetchGcalEvents(token, viewYear, viewMonth);
      },
    });
    client.requestAccessToken();
  }, [fetchGcalEvents, viewMonth, viewYear]);

  const disconnectGcal = useCallback(() => {
    setGcalToken(null);
    setGcalEnabled(false);
    setGcalEvents([]);
    setGcalError(null);
    setGcalNotice("Google Calendar desconectado.");
    try { sessionStorage.removeItem(GCAL_TOKEN_KEY); } catch {}
  }, []);

  const requestGoogleCalendar = useCallback(async (
    path: string,
    options: RequestInit = {},
  ) => {
    if (!gcalToken) {
      throw new Error("Conecta Google Calendar para sincronizar este evento.");
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${gcalToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await safeJson(res);

    if (!res.ok) {
      const message =
        data?.error?.message ||
        data?.error_description ||
        data?.error ||
        "Error al sincronizar con Google Calendar.";
      throw new Error(message);
    }

    return data;
  }, [gcalToken]);

  const createGoogleCalendarEvent = useCallback(async (data: any) => {
    return requestGoogleCalendar("/events", {
      method: "POST",
      body: JSON.stringify(buildGooglePayload(data)),
    });
  }, [requestGoogleCalendar]);

  const updateGoogleCalendarEvent = useCallback(async (externalId: string, data: any) => {
    return requestGoogleCalendar(`/events/${externalId}`, {
      method: "PUT",
      body: JSON.stringify(buildGooglePayload(data)),
    });
  }, [requestGoogleCalendar]);

  const deleteGoogleCalendarEvent = useCallback(async (externalId: string) => {
    await requestGoogleCalendar(`/events/${externalId}`, {
      method: "DELETE",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
  }, [requestGoogleCalendar]);

  // Re-fetch gcal events cuando cambia el mes o el token
  useEffect(() => {
    if (gcalToken && gcalEnabled) {
      fetchGcalEvents(gcalToken, viewYear, viewMonth);
    }
  }, [gcalToken, gcalEnabled, viewYear, viewMonth, fetchGcalEvents]);

  // Convertir GCalEvent → estructura compatible para mostrar en el calendario
  const gcalEventsByDay = useMemo(() => {
    const map: Record<string, GCalEvent[]> = {};
    for (const ev of gcalEvents) {
      const alreadyImported = events.some(
        (agendaEv) => agendaEv.external_provider === "google" && agendaEv.external_id === ev.id
      );
      if (alreadyImported) continue;
      const dateStr = ev.start.dateTime
        ? localDateKey(ev.start.dateTime)
        : ev.start.date || "";
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(ev);
    }
    return map;
  }, [gcalEvents, events]);

  const importedGoogleEventMap = useMemo(() => {
    const map = new Map<string, AgendaEvent>();
    for (const ev of events) {
      if (ev.external_provider === "google" && ev.external_id) {
        map.set(ev.external_id, ev);
      }
    }
    return map;
  }, [events]);

  const visiblePendingGcalEvents = useMemo(
    () => gcalEvents.filter((ev) => !importedGoogleEventMap.has(ev.id)),
    [gcalEvents, importedGoogleEventMap]
  );

  const importedVisibleGcalCount = useMemo(
    () => gcalEvents.filter((ev) => importedGoogleEventMap.has(ev.id)).length,
    [gcalEvents, importedGoogleEventMap]
  );
  const smoothVisiblePendingGcalCount = useDeferredValue(visiblePendingGcalEvents.length);
  const smoothImportedVisibleGcalCount = useDeferredValue(importedVisibleGcalCount);
  const smoothGcalVisibleCount = useDeferredValue(gcalEvents.length);
  const smoothGcalError = useDeferredValue(gcalError);
  const smoothGcalNotice = useDeferredValue(gcalNotice);

  // Modal
  const [showModal,    setShowModal]    = useState(false);
  const [editEvent,    setEditEvent]    = useState<AgendaEvent | null>(null);
  const [defaultDate,  setDefaultDate]  = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Modal Google Calendar event (solo lectura)
  const [gcalModal,    setGcalModal]    = useState<GCalEvent | null>(null);
  const [organizationExpedientes, setOrganizationExpedientes] = useState<AgendaOrganizationExpediente[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<AgendaOrganizationUser[]>([]);

  // Cargar eventos del mes visible + buffer
  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      // Cargar todo el mes más un buffer de 2 semanas
      const from = new Date(viewYear, viewMonth - 1, 15).toISOString();
      const to   = new Date(viewYear, viewMonth + 2, 15).toISOString();
      const res  = await fetch(
        `/api/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await safeJson(res);
      if (res.ok) setEvents(data.data || []);
    } catch (_e) {}
    finally { if (!silent) setLoading(false); }
  }, [getToken, viewYear, viewMonth]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useAutoRefresh(() => fetchEvents(true), { intervalMs: 30_000 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const [optionsRes, usersRes] = await Promise.all([
          fetch("/api/agenda/options", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/chat/usuarios", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [optionsJson, usersJson] = await Promise.all([safeJson(optionsRes), safeJson(usersRes)]);
        if (cancelled) return;
        if (optionsRes.ok) {
          setOrganizationExpedientes(optionsJson?.data?.expedientes || []);
        }
        if (usersRes.ok) {
          setOrganizationUsers(usersJson?.data || []);
        }
      } catch (_e) {}
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const importGoogleEventsToAgenda = useCallback(async (items: GCalEvent[]) => {
    if (!items.length) {
      setGcalNotice("No hay eventos nuevos de Google para importar en este periodo.");
      return;
    }

    setGcalImporting(true);
    setGcalError(null);
    setGcalNotice(null);

    try {
      const token = await getToken({ skipCache: true });
      const payload = items.map((ev) => ({
        id: ev.id,
        summary: ev.summary,
        description: ev.description,
        location: ev.location,
        start: ev.start,
        end: ev.end,
        htmlLink: ev.htmlLink,
        status: ev.status,
      }));

      const res = await fetch("/api/agenda/import-google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events: payload }),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        setGcalError(data?.error || "No se pudieron importar los eventos de Google.");
        return;
      }

      const summary = data?.data?.summary;
      const imported = Number(summary?.imported || 0);
      const skipped = Number(summary?.skipped || 0);
      const errors = Number(summary?.errors || 0);
      const firstError = data?.data?.errors?.[0]?.error as string | undefined;

      if (errors > 0 && firstError) {
        setGcalError(`Error al importar desde Google: ${firstError}`);
      }

      setGcalNotice(
        `Sincronizacion completada: ${imported} importados, ${skipped} ya vinculados y ${errors} con error.`
      );
      await fetchEvents(true);
    } catch (_e) {
      setGcalError("Error de conexion al importar eventos de Google.");
    } finally {
      setGcalImporting(false);
    }
  }, [fetchEvents, getToken]);

  const syncGoogleEventsToErp = useCallback(async (items: GCalEvent[]) => {
    if (!gcalEnabled || !gcalToken) return;

    try {
      const token = await getToken({ skipCache: true });
      const from = new Date(viewYear, viewMonth - 1, 15).toISOString();
      const to = new Date(viewYear, viewMonth + 2, 15).toISOString();
      const payload = items.map((ev) => ({
        id: ev.id,
        summary: ev.summary,
        description: stripHtml(ev.description),
        location: ev.location,
        start: ev.start,
        end: ev.end,
        htmlLink: ev.htmlLink,
        status: ev.status,
      }));

      const res = await fetch("/api/agenda/sync-google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events: payload, from, to }),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        setGcalError(data?.error || "No se pudo sincronizar Google Calendar con el ERP.");
        return;
      }

      const summary = data?.data?.summary;
      const changed = Number(summary?.created || 0) + Number(summary?.updated || 0) + Number(summary?.deleted || 0);
      if (changed > 0) {
        setGcalNotice(
          `Google sincronizado: ${summary?.created || 0} creados, ${summary?.updated || 0} actualizados y ${summary?.deleted || 0} eliminados en ERP.`
        );
      }
      await fetchEvents(true);
    } catch (_e) {
      setGcalError("Error al sincronizar automaticamente Google Calendar con el ERP.");
    }
  }, [fetchEvents, getToken, gcalEnabled, gcalToken, viewMonth, viewYear]);

  useEffect(() => {
    if (!gcalEnabled || !gcalToken || gcalEvents.length === 0) return;
    syncGoogleEventsToErp(gcalEvents);
  }, [gcalEnabled, gcalToken, gcalEvents, syncGoogleEventsToErp]);

  // Navegar mes
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(isoDate(today));
  };

  const navigatePrev = () => {
    if (view === "month") { prevMonth(); return; }
    const n = view === "week" ? -7 : -1;
    const nd = addDays(selectedDay, n);
    setSelectedDay(nd);
    const d = new Date(nd + "T12:00:00");
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const navigateNext = () => {
    if (view === "month") { nextMonth(); return; }
    const n = view === "week" ? 7 : 1;
    const nd = addDays(selectedDay, n);
    setSelectedDay(nd);
    const d = new Date(nd + "T12:00:00");
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const openNewAtSlot = (dateStr: string, hour: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditEvent(null);
    setDefaultDate(`${dateStr}T${pad(hour)}:00`);
    setErrorMsg(null);
    setShowModal(true);
  };

  // Índice de eventos por día
  const eventsByDay = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    for (const ev of events) {
      const key = localDateKey(ev.start_at);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  // Eventos del día seleccionado
  const dayEvents = useMemo(() =>
    (eventsByDay[selectedDay] || []).sort((a, b) =>
      a.start_at.localeCompare(b.start_at)
    ), [eventsByDay, selectedDay]);

  // Días del calendario
  const calDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Días de la semana activa (para vista semana)
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(selectedDay);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return isoDate(d);
    });
  }, [selectedDay]);

  // Etiqueta de navegación según vista
  const navLabel = useMemo(() => {
    if (view === "month") return `${MESES[viewMonth]} ${viewYear}`;
    if (view === "week") {
      const first = new Date(weekDays[0] + "T12:00:00");
      const last  = new Date(weekDays[6] + "T12:00:00");
      const firstFmt = first.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      const lastFmt  = last.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
      return `${firstFmt} – ${lastFmt}`;
    }
    return new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }, [view, viewMonth, viewYear, weekDays, selectedDay]);

  // Guardar evento (crear o editar)
  const handleSave = async (data: any) => {
    setSaving(true); setErrorMsg(null);
    try {
      const token = await getToken({ skipCache: true });
      const url    = editEvent ? `/api/agenda/${editEvent.id}` : "/api/agenda";
      const method = editEvent ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...data,
          source: editEvent?.source || data.source,
          external_provider: editEvent?.external_provider || data.external_provider,
          external_id: editEvent?.external_id || data.external_id,
          external_url: editEvent?.external_url || data.external_url,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) { setErrorMsg(json?.error || "Error al guardar"); return; }
      const savedEvent = json?.data as AgendaEvent | undefined;
      let syncWarning: string | null = null;
      if (savedEvent && gcalEnabled) {
        try {
          if (savedEvent.external_provider === "google" && savedEvent.external_id) {
            const googleUpdated = await updateGoogleCalendarEvent(savedEvent.external_id, {
              ...data,
              start_at: savedEvent.start_at,
              end_at: savedEvent.end_at,
            });

            const syncRes = await fetch(`/api/agenda/${savedEvent.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                ...savedEvent,
                external_url: googleUpdated?.htmlLink || savedEvent.external_url,
                source: savedEvent.source || "manual",
                external_provider: "google",
                external_id: savedEvent.external_id,
              }),
            });

            if (!syncRes.ok) {
              const syncJson = await safeJson(syncRes);
              syncWarning = syncJson?.error || "El evento se guardo en el ERP, pero no se pudo actualizar en Google.";
            } else {
              setGcalNotice("Evento actualizado en el ERP y en Google Calendar.");
            }
          } else {
            const googleCreated = await createGoogleCalendarEvent({
              ...data,
              start_at: savedEvent.start_at,
              end_at: savedEvent.end_at,
            });

            const syncRes = await fetch(`/api/agenda/${savedEvent.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                ...savedEvent,
                source: savedEvent.source || "manual",
                external_provider: "google",
                external_id: googleCreated?.id,
                external_url: googleCreated?.htmlLink,
              }),
            });

            if (!syncRes.ok) {
              const syncJson = await safeJson(syncRes);
              syncWarning = syncJson?.error || "El evento se guardo en el ERP, pero no se pudo registrar en Google.";
            } else {
              setGcalNotice("Evento sincronizado tambien con Google Calendar.");
            }
          }
        } catch (syncError: any) {
          syncWarning = syncError?.message || "El evento se guardo en el ERP, pero fallo la sincronizacion con Google.";
        }
      } else if (savedEvent?.external_provider === "google" && !gcalEnabled) {
        syncWarning = "El evento esta vinculado con Google, pero no hay una sesion activa para actualizarlo alli.";
      }

      setShowModal(false);
      setEditEvent(null);
      await fetchEvents(true);
      if (syncWarning) setGcalError(syncWarning);
    } catch (_e) {
      setErrorMsg("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  // Eliminar evento
  const handleDelete = async (id: string) => {
    setSaving(true); setErrorMsg(null);
    try {
      const deletingEvent = events.find((ev) => ev.id === id) || editEvent;
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/agenda/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const j = await safeJson(res); setErrorMsg(j?.error || "Error al eliminar"); return; }

      if (deletingEvent?.external_provider === "google" && deletingEvent.external_id) {
        try {
          if (!gcalEnabled) {
            setGcalError("El evento se elimino del ERP, pero sigue en Google porque no hay una sesion activa para borrarlo alli.");
          } else {
            await deleteGoogleCalendarEvent(deletingEvent.external_id);
            setGcalNotice("Evento eliminado en el ERP y en Google Calendar.");
          }
        } catch (syncError: any) {
          setGcalError(syncError?.message || "El evento se elimino del ERP, pero no se pudo borrar de Google.");
        }
      }

      setShowModal(false);
      setEditEvent(null);
      setDeleteConfirm(null);
      await fetchEvents(true);
    } catch (_e) {
      setErrorMsg("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickMoveEvent = async (ev: AgendaEvent, targetDateKey: string) => {
    const originalDateKey = localDateKey(ev.start_at);
    if (originalDateKey === targetDateKey) return;

    const nextStart = moveIsoToDateKeepingTime(ev.start_at, targetDateKey);
    const nextEnd = ev.end_at ? moveIsoToDateKeepingTime(ev.end_at, targetDateKey) : null;
    const previousEvents = events;
    const optimisticEvent = { ...ev, start_at: nextStart, end_at: nextEnd };

    try {
      setErrorMsg(null);
      setMovingEventId(ev.id);
      setSelectedDay(targetDateKey);
      setEvents((prev) => prev.map((item) => item.id === ev.id ? optimisticEvent : item));
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/agenda/${ev.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...ev,
          start_at: nextStart,
          end_at: nextEnd,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        setEvents(previousEvents);
        setErrorMsg(json?.error || "No se pudo mover el evento");
        return;
      }
      const savedEvent = json?.data as AgendaEvent | undefined;
      let syncWarning: string | null = null;

      if (savedEvent && gcalEnabled) {
        try {
          if (savedEvent.external_provider === "google" && savedEvent.external_id) {
            const googleUpdated = await updateGoogleCalendarEvent(savedEvent.external_id, {
              ...savedEvent,
              start_at: savedEvent.start_at,
              end_at: savedEvent.end_at,
            });

            const syncRes = await fetch(`/api/agenda/${savedEvent.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                ...savedEvent,
                external_url: googleUpdated?.htmlLink || savedEvent.external_url,
                source: savedEvent.source || "manual",
                external_provider: "google",
                external_id: savedEvent.external_id,
              }),
            });

            if (!syncRes.ok) {
              const syncJson = await safeJson(syncRes);
              syncWarning = syncJson?.error || "El evento se movio en el ERP, pero no se pudo actualizar en Google.";
            } else {
              setGcalNotice("Evento movido en el ERP y en Google Calendar.");
            }
          } else if (!savedEvent.external_provider) {
            const googleCreated = await createGoogleCalendarEvent({
              ...savedEvent,
              start_at: savedEvent.start_at,
              end_at: savedEvent.end_at,
            });

            const syncRes = await fetch(`/api/agenda/${savedEvent.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                ...savedEvent,
                source: savedEvent.source || "manual",
                external_provider: "google",
                external_id: googleCreated?.id,
                external_url: googleCreated?.htmlLink,
              }),
            });

            if (!syncRes.ok) {
              const syncJson = await safeJson(syncRes);
              syncWarning = syncJson?.error || "El evento se movio en el ERP, pero no se pudo registrar en Google.";
            } else {
              setGcalNotice("Evento movido y sincronizado tambien con Google Calendar.");
            }
          }
        } catch (syncError: any) {
          syncWarning = syncError?.message || "El evento se movio en el ERP, pero fallo la sincronizacion con Google.";
        }
      } else if (savedEvent?.external_provider === "google" && !gcalEnabled) {
        syncWarning = "El evento se movio en el ERP, pero no hay una sesion activa para actualizarlo en Google.";
      }

      await fetchEvents(true);
      if (gcalEnabled && gcalToken) {
        await fetchGcalEvents(gcalToken, viewYear, viewMonth);
      }
      if (syncWarning) setGcalError(syncWarning);
    } catch (_e) {
      setEvents(previousEvents);
      setErrorMsg("Error al mover el evento");
    } finally {
      setMovingEventId(null);
      setDraggingEventId(null);
      setDragOverDay(null);
    }
  };

  const openNew = (date?: string) => {
    setEditEvent(null);
    setDefaultDate(date || selectedDay);
    setErrorMsg(null);
    setShowModal(true);
  };
  const openEdit = (ev: AgendaEvent) => {
    setEditEvent(ev);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleResizeEvent = useCallback(async (id: string, newEndAt: string) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    setEvents(prev => prev.map(e => e.id === id ? { ...e, end_at: newEndAt } : e));
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/agenda/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...ev, end_at: newEndAt }),
      });
      if (res.ok) await fetchEvents(true);
      else setEvents(prev => prev.map(e => e.id === id ? ev : e));
    } catch {
      setEvents(prev => prev.map(e => e.id === id ? ev : e));
    }
  }, [events, getToken, fetchEvents]);

  const handleMoveEventToDateTime = useCallback(async (id: string, newStartAt: string, newEndAt: string | null, allDay?: boolean) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    const previousEvents = events;
    setMovingEventId(id);
    const updatedEv = { ...ev, start_at: newStartAt, end_at: newEndAt, ...(allDay !== undefined ? { all_day: allDay } : {}) };
    setEvents(prev => prev.map(e => e.id === id ? updatedEv : e));
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/agenda/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updatedEv),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        setEvents(previousEvents);
        setErrorMsg(json?.error || "No se pudo mover el evento");
      } else {
        await fetchEvents(true);
      }
    } catch {
      setEvents(previousEvents);
    } finally {
      setMovingEventId(null);
    }
  }, [events, getToken, fetchEvents]);

  const todayStr = isoDate(today);

  return (
    <div className="agenda-google-shell flex flex-col animate-in fade-in duration-500 -mx-6 -mt-6 h-[calc(100vh-80px)]">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="agenda-google-topbar flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-red-50 rounded-xl flex items-center justify-center">
            <Calendar size={18} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Agenda</h1>
            <p className="text-xs text-slate-400">Calendario y eventos del despacho</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de vista */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${view === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/60"}`}
            >
              Mes
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${view === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/60"}`}
            >
              Semana
            </button>
            <button
              onClick={() => setView("day")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${view === "day" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/60"}`}
            >
              Día
            </button>
          </div>
          {/* Navegación */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-1">
            <button onClick={navigatePrev} className="p-2 hover:text-red-600 rounded-lg transition-colors text-slate-500">
              <ChevronLeft size={15} />
            </button>
            <span className="font-bold text-slate-800 text-sm px-1 min-w-[150px] text-center">
              {navLabel}
            </span>
            <button onClick={navigateNext} className="p-2 hover:text-red-600 rounded-lg transition-colors text-slate-500">
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Hoy
          </button>

          {/* ── Google Calendar ── */}
          {gcalEnabled ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex min-w-[280px] items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-sm transition-all duration-300">
                <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-4 h-4" />
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-emerald-700">Google Calendar vinculado</div>
                  <div className="hidden text-[10px] text-slate-500 tabular-nums">
                    {gcalEvents.length} visibles · {visiblePendingGcalEvents.length} por importar · {importedVisibleGcalCount} ya en ERP
                  </div>
                  <div className="text-[10px] text-slate-500 tabular-nums">
                    <span key={`visible-${smoothGcalVisibleCount}`} className="inline-block animate-in fade-in slide-in-from-top-1 duration-300">
                      {smoothGcalVisibleCount} visibles
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span key={`pending-${smoothVisiblePendingGcalCount}`} className="inline-block animate-in fade-in slide-in-from-top-1 duration-300">
                      {smoothVisiblePendingGcalCount} por importar
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span key={`imported-${smoothImportedVisibleGcalCount}`} className="inline-block animate-in fade-in slide-in-from-top-1 duration-300">
                      {smoothImportedVisibleGcalCount} ya en ERP
                    </span>
                  </div>
                </div>
                <div className={`ml-auto transition-all duration-300 ${gcalLoading ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
                  <Loader2 size={11} className="animate-spin text-emerald-500" />
                </div>
              </div>
              <button
                onClick={() => gcalToken && fetchGcalEvents(gcalToken, viewYear, viewMonth)}
                disabled={gcalLoading || gcalImporting}
                title="Refrescar Google Calendar"
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={`text-slate-500 ${gcalLoading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => importGoogleEventsToAgenda(visiblePendingGcalEvents)}
                disabled={gcalLoading || gcalImporting || visiblePendingGcalEvents.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-red-600 border border-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {gcalImporting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                Importar a agenda
              </button>
              <button
                onClick={disconnectGcal}
                title="Desconectar Google Calendar"
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                <Unlink size={13} className="text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ) : (
            <button
              onClick={connectGcal}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-4 h-4" />
              Conectar Google Calendar
            </button>
          )}

          <div className="flex min-h-[32px] items-center gap-2">
            <span className={`max-w-xs overflow-hidden rounded-lg border px-2 py-1 text-xs text-red-600 transition-all duration-300 ${smoothGcalError ? "translate-y-0 border-red-200 bg-red-50 opacity-100" : "pointer-events-none -translate-y-1 border-transparent bg-transparent opacity-0"}`} title={smoothGcalError || ""}>
              ⚠ {gcalError}
            </span>
            <span className={`max-w-sm overflow-hidden rounded-lg border px-2 py-1 text-xs text-emerald-700 transition-all duration-300 ${smoothGcalNotice ? "translate-y-0 border-emerald-200 bg-emerald-50 opacity-100" : "pointer-events-none -translate-y-1 border-transparent bg-transparent opacity-0"}`} title={smoothGcalNotice || ""}>
              {smoothGcalNotice || " "}
            </span>
          </div>

          <button
            onClick={() => openNew()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-colors"
          >
            <Plus size={13} /> Nuevo evento
          </button>
        </div>
      </div>

      {/* ── Cuerpo ────────────────────────────────────────────── */}
      {view !== "month" ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex flex-1 justify-center items-center">
              <Loader2 size={22} className="animate-spin text-slate-300" />
            </div>
          ) : (
            <TimeGridView
              days={view === "week" ? weekDays : [selectedDay]}
              eventsByDay={eventsByDay}
              gcalEventsByDay={gcalEventsByDay}
              selectedDay={selectedDay}
              todayStr={todayStr}
              movingEventId={movingEventId}
              onSlotClick={openNewAtSlot}
              onEventClick={openEdit}
              onGcalEventClick={ev => setGcalModal(ev)}
              onDayHeaderClick={dateStr => { setSelectedDay(dateStr); setView("day"); }}
              onResizeEvent={handleResizeEvent}
              onMoveEvent={handleMoveEventToDateTime}
            />
          )}
        </div>
      ) : (
      <div className="agenda-google-body flex flex-1 min-h-0 overflow-hidden">

        {/* ── Rejilla calendario ─────────────────────────────── */}
        <div className="agenda-google-grid flex-1 min-w-0 flex flex-col overflow-hidden border-r border-slate-100">
          {/* Días de la semana */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 shrink-0">
            {DIAS.map(d => (
              <div key={d} className="py-2.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Celdas */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 size={22} className="animate-spin text-slate-300" />
              </div>
            ) : (
              <div className="grid grid-cols-7 auto-rows-fr min-h-full">
                {calDays.map((date, idx) => {
                  if (!date) {
                    return <div key={`empty-${idx}`} className="border-b border-r border-slate-50 bg-slate-50/40 min-h-[90px]" />;
                  }
                  const key  = isoDate(date);
                  const isToday  = key === todayStr;
                  const isSel    = key === selectedDay;
                  const dayEvs   = eventsByDay[key] || [];
                  const dayGcal  = gcalEventsByDay[key] || [];
                  const totalEvs = dayEvs.length + dayGcal.length;
                  const maxShow  = 3;
                  const lexShow  = dayEvs.slice(0, maxShow);
                  const gcalShow = dayGcal.slice(0, Math.max(0, maxShow - lexShow.length));
                  const overflow = totalEvs - lexShow.length - gcalShow.length;

                  return (
                    <div
                      key={key}
                      onDragOver={e => {
                        if (!draggingEventId) return;
                        e.preventDefault();
                        if (dragOverDay !== key) setDragOverDay(key);
                      }}
                      onDragLeave={() => {
                        if (dragOverDay === key) setDragOverDay(null);
                      }}
                      onDrop={async e => {
                        e.preventDefault();
                        const eventId = e.dataTransfer.getData("text/plain");
                        const draggedEvent = events.find((item) => item.id === eventId);
                        if (!draggedEvent) {
                          setDraggingEventId(null);
                          setDragOverDay(null);
                          return;
                        }
                        await handleQuickMoveEvent(draggedEvent, key);
                      }}
                      onClick={() => {
                        if (draggingEventId) return;
                        setSelectedDay(key);
                      }}
                      onDoubleClick={() => {
                        if (draggingEventId) return;
                        setSelectedDay(key);
                        openNew(key);
                      }}
                      className={`border-b border-r border-slate-100 min-h-[90px] p-1.5 cursor-pointer transition-all ${
                        dragOverDay === key ? "bg-emerald-50/90 ring-2 ring-inset ring-emerald-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]"
                        : isSel   ? "bg-red-50/60"
                        : isToday ? "bg-amber-50/40"
                        : "hover:bg-slate-50"
                      }`}
                    >
                      {/* Número día */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? "bg-red-600 text-white"
                          : isSel  ? "text-red-600"
                          : "text-slate-600"
                        }`}>
                          {date.getDate()}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); openNew(key); }}
                          className="opacity-0 hover:opacity-100 p-0.5 text-slate-300 hover:text-red-500 transition-opacity"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Eventos LexTech */}
                      <div className="space-y-0.5">
                        {lexShow.map(ev => {
                          const tc = EVENT_TYPES[ev.type] || EVENT_TYPES.otro;
                          return (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.setData("text/plain", ev.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingEventId(ev.id);
                                setDragOverDay(key);
                              }}
                              onDragEnd={() => {
                                setDraggingEventId(null);
                                setDragOverDay(null);
                              }}
                              onClick={e => { e.stopPropagation(); setSelectedDay(key); }}
                              onDoubleClick={e => { e.stopPropagation(); setSelectedDay(key); openEdit(ev); }}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold truncate cursor-move transition-all ${
                                movingEventId === ev.id ? "opacity-70 scale-[0.98] shadow-sm ring-1 ring-emerald-200 bg-emerald-50/70" :
                                ev.status === "cancelado" ? "opacity-40 line-through" : "hover:opacity-80"
                              }`}
                              title="Arrastra para mover a otro día"
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tc.dot}`} />
                              <span className="truncate text-slate-700">
                                {!ev.all_day && <span className="text-slate-400 mr-0.5">{fmtTime(ev.start_at)}</span>}
                                {ev.title}
                              </span>
                              {ev.external_provider === "google" && (
                                <img
                                  src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png"
                                  alt="Google Calendar"
                                  className="w-2.5 h-2.5 shrink-0"
                                />
                              )}
                            </div>
                          );
                        })}
                        {/* Eventos Google Calendar */}
                        {gcalShow.map(ev => {
                          const timeStr = ev.start.dateTime
                            ? new Date(ev.start.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                            : null;
                          return (
                            <div
                              key={`gcal-${ev.id}`}
                              onClick={e => { e.stopPropagation(); setSelectedDay(key); }}
                              onDoubleClick={e => { e.stopPropagation(); setSelectedDay(key); setGcalModal(ev); }}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold truncate cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="" className="w-2 h-2 shrink-0" />
                              <span className="truncate text-blue-700">
                                {timeStr && <span className="text-blue-400 mr-0.5">{timeStr}</span>}
                                {ev.summary}
                              </span>
                            </div>
                          );
                        })}
                        {overflow > 0 && (
                          <div className="text-[10px] text-slate-400 font-semibold px-1.5">
                            +{overflow} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Panel día seleccionado ──────────────────────────── */}
        <aside className="agenda-google-sidebar w-64 shrink-0 flex flex-col overflow-hidden bg-white">
          {/* cabecera panel */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800 capitalize">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", {
                    weekday: "long", day: "numeric", month: "long"
                  })}
                </p>
                {selectedDay === todayStr && (
                  <span className="text-[10px] font-bold text-red-500">Hoy</span>
                )}
              </div>
              <button
                onClick={() => openNew(selectedDay)}
                className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                title="Añadir evento en este día"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* lista de eventos del día */}
          <div className="flex-1 overflow-y-auto py-2">
            {dayEvents.length === 0 && (gcalEventsByDay[selectedDay] || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                <Calendar size={24} className="opacity-30" />
                <p className="text-xs text-slate-400 text-center">Sin eventos<br />en este día</p>
              </div>
            ) : (
              <div className="space-y-1 px-3">
                {/* Eventos LexTech */}
                {dayEvents.map(ev => {
                  const tc = EVENT_TYPES[ev.type] || EVENT_TYPES.otro;
                  const stConf = STATUS_OPTS.find(s => s.value === ev.status) || STATUS_OPTS[0];
                  return (
                    <button
                      key={ev.id}
                      onClick={() => openEdit(ev)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border hover:shadow-sm transition-all group ${
                        ev.status === "cancelado"
                          ? "opacity-50 border-slate-100 bg-slate-50"
                          : "border-slate-100 bg-white hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${tc.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold text-slate-800 truncate ${ev.status === "cancelado" ? "line-through" : ""}`}>
                            {ev.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {!ev.all_day && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                <Clock size={9} /> {fmtTime(ev.start_at)}
                                {ev.end_at && <> – {fmtTime(ev.end_at)}</>}
                              </span>
                            )}
                            {ev.all_day && (
                              <span className="text-[10px] text-slate-400">Todo el día</span>
                            )}
                          </div>
                          {ev.location && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5 truncate">
                              <MapPin size={9} /> {ev.location}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold text-slate-500">{tc.label}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${stConf.cls}`}>
                              {stConf.label}
                            </span>
                            {ev.external_provider === "google" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                                Google
                              </span>
                            )}
                          </div>
                        </div>
                        <Edit3 size={11} className="text-slate-200 group-hover:text-slate-400 shrink-0 mt-0.5 transition-colors" />
                      </div>
                    </button>
                  );
                })}

                {/* Eventos Google Calendar */}
                {(gcalEventsByDay[selectedDay] || []).map(ev => {
                  const startTime = ev.start.dateTime
                    ? new Date(ev.start.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                    : null;
                  const endTime = ev.end.dateTime
                    ? new Date(ev.end.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                    : null;
                  return (
                    <button
                      key={`gcal-${ev.id}`}
                      onClick={() => setGcalModal(ev)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start gap-2">
                        <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-blue-800 truncate">{ev.summary}</p>
                          {(startTime || !ev.start.dateTime) && (
                            <span className="text-[10px] text-blue-500 flex items-center gap-0.5 mt-0.5">
                              <Clock size={9} />
                              {startTime ? <>{startTime}{endTime && <> – {endTime}</>}</> : "Todo el día"}
                            </span>
                          )}
                          {ev.location && (
                            <p className="text-[10px] text-blue-400 flex items-center gap-0.5 mt-0.5 truncate">
                              <MapPin size={9} /> {ev.location}
                            </p>
                          )}
                          <span className="text-[10px] font-semibold text-blue-400 mt-1 block">Google Calendar</span>
                        </div>
                        <ExternalLink size={10} className="text-blue-200 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
      )}

      {/* ── Modal crear/editar LexTech ────────────────────────── */}
      {showModal && (
        <EventModal
          event={editEvent}
          defaultDate={defaultDate}
          organizationExpedientes={organizationExpedientes}
          organizationUsers={organizationUsers}
          onClose={() => { setShowModal(false); setEditEvent(null); setErrorMsg(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          errorMsg={errorMsg}
        />
      )}

      {gcalModal && (
        <GoogleEventModal
          event={gcalModal}
          importing={gcalImporting}
          onClose={() => setGcalModal(null)}
          onImport={async (event) => {
            await importGoogleEventsToAgenda([event]);
            setGcalModal(null);
          }}
        />
      )}
    </div>
  );
}
