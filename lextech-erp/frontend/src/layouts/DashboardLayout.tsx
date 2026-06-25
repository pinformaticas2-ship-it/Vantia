import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";

export const SidebarContext = createContext({ isCollapsed: false });
export function useSidebar() { return useContext(SidebarContext); }
import { Spinner } from "../components/Spinner";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, Users, Settings,
  Menu, Search, X, Bell, ShieldCheck, Calendar,
  MessageCircle, Bot, Send, ChevronRight, ChevronLeft, Loader2, History, CheckCircle2,
  MessageSquare, LogOut, Mail, Library, Receipt, Mic, Sparkles,
} from "lucide-react";
import { UserButton, useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { getDeviceId, safeJson, waitForClientIp } from "../lib/api";
import { useChatUnread } from "../contexts/ChatUnreadContext";
import { useEmailUnread } from "../contexts/EmailUnreadContext";
import { useWhatsAppUnread, WA_LAST_SEEN_KEY } from "../contexts/WhatsAppUnreadContext";

// ── Módulos buscables ────────────────────────────────────────────────────────
const MODULES = [
  { name: "Dashboard",      path: "/dashboard",              icon: LayoutDashboard, desc: "Panel de control" },
  { name: "Expedientes",    path: "/dashboard/expedientes",  icon: Briefcase,       desc: "Gestión de expedientes" },
  { name: "Clientes",       path: "/dashboard/clientes",     icon: Users,           desc: "Base de datos de clientes" },
  { name: "Nuevo Cliente",  path: "/dashboard/clientes/new", icon: Users,           desc: "Alta de nuevo cliente" },
  { name: "Trazabilidad",   path: "/dashboard/trazabilidad", icon: History,         desc: "Historial de acciones por usuario" },
  { name: "Agenda",         path: "/dashboard/agenda",       icon: Calendar,        desc: "Calendario y citas" },
  { name: "Tareas",         path: "/dashboard/tareas",       icon: CheckCircle2,    desc: "Tareas y plazos del usuario" },
  { name: "Chat",           path: "/dashboard/chat",         icon: MessageSquare,   desc: "Chat de equipo" },
  { name: "WhatsApp",       path: "/dashboard/whatsapp",     icon: MessageCircle,   desc: "Mensajería y comunicación por WhatsApp" },
  { name: "Correo",         path: "/dashboard/correo",       icon: Mail,            desc: "Gestor de correo electrónico" },
  { name: "Documental",     path: "/dashboard/documental",   icon: Library,         desc: "Cendoj, BOE y Lexnet" },
  { name: "Facturación",    path: "/dashboard/facturacion",  icon: Receipt,         desc: "Contabilidad y facturación" },
  { name: "Plaud IA",       path: "/dashboard/plaud-ia",     icon: Mic,             desc: "Grabación y asistencia con IA" },
  { name: "Chat IA",        path: "/dashboard/chat-ia",      icon: Sparkles,        desc: "Asistente IA con herramientas e historial" },
  { name: "Configuración",  path: "/dashboard/config",       icon: Settings,        desc: "Ajustes del sistema" },
];

const NAV_ITEMS = [
  { name: "Dashboard",    href: "/dashboard",             icon: LayoutDashboard },
  { name: "Expedientes",  href: "/dashboard/expedientes", icon: Briefcase },
  { name: "Clientes",     href: "/dashboard/clientes",    icon: Users },
  { name: "Trazabilidad", href: "/dashboard/trazabilidad", icon: History },
  { name: "Agenda",       href: "/dashboard/agenda",      icon: Calendar },
  { name: "Tareas",       href: "/dashboard/tareas",      icon: CheckCircle2 },
  { name: "Chat",         href: "/dashboard/chat",        icon: MessageSquare },
  { name: "WhatsApp",     href: "/dashboard/whatsapp",    icon: MessageCircle },
  { name: "Correo",       href: "/dashboard/correo",      icon: Mail },
  { name: "Documental",   href: "/dashboard/documental",  icon: Library },
  { name: "Facturación",  href: "/dashboard/facturacion", icon: Receipt },
  { name: "Plaud IA",     href: "/dashboard/plaud-ia",    icon: Mic },
  { name: "Chat IA",      href: "/dashboard/chat-ia",     icon: Sparkles },
];

const NAV_GROUPS = [
  {
    label: "Principal",
    items: ["Dashboard", "Expedientes", "Clientes", "Trazabilidad"],
  },
  {
    label: "Productividad",
    items: ["Agenda", "Tareas", "Chat", "WhatsApp", "Correo", "Facturación"],
  },
  {
    label: "Conocimiento",
    items: ["Documental", "Plaud IA", "Chat IA"],
  },
];

// ── Contexto VantIA por módulo ───────────────────────────────────────────────
function getVantIAContext(pathname: string): string {
  if (pathname.startsWith("/dashboard/clientes"))
    return "Eres VantIA, especializado en gestión de clientes para despachos de abogados. Ayudas con altas de clientes, consultas de datos, LOPD, NIF/CIF, tipos de documentos y todo lo relacionado con la base de clientes del despacho. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/expedientes"))
    return "Eres VantIA, especializado en gestión de expedientes judiciales. Conoces el flujo de un expediente legal, plazos procesales, tipos de procedimientos y cómo gestionar casos en un despacho. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/agenda"))
    return "Eres VantIA, especializado en gestión de agenda y citas para un despacho legal. Ayudas con vistas, reuniones, plazos judiciales, y organización del tiempo. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/chat-ia"))
    return "Eres VantIA, asistente IA avanzado del despacho. Ayudas con consultas complejas, uso de herramientas, recuperación de historial y apoyo transversal a todos los módulos. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/chat"))
    return "Eres VantIA, asistente del despacho. En este momento el usuario está en el chat de equipo. Puedes ayudar a redactar mensajes, resumir conversaciones o resolver dudas jurídicas puntuales. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/whatsapp"))
    return "Eres VantIA, asistente de WhatsApp del despacho. Ayudas con mensajería comercial y operativa, respuestas rápidas, seguimiento de conversaciones y comunicación con clientes. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/correo"))
    return "Eres VantIA, asistente de correo del despacho. Ayudas a redactar emails profesionales, responder comunicaciones, resumir correos y organizar la bandeja de entrada. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/documental"))
    return "Eres VantIA, asistente documental del despacho. Ayudas con búsquedas en CENDOJ, BOE y LexNET, resúmenes normativos y localización de documentación jurídica. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/facturacion"))
    return "Eres VantIA, asistente de contabilidad y facturación del despacho. Ayudas con honorarios, facturas, cobros, vencimientos y control económico. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/plaud-ia"))
    return "Eres VantIA, asistente de Plaud IA. Ayudas con grabaciones, transcripciones, resúmenes y extracción de tareas o acuerdos relevantes. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/config"))
    return "Eres VantIA, asistente de configuración de VANTIA Legis ERP. Ayudas con ajustes del sistema, usuarios, permisos y personalización. Responde siempre en español.";
  return "Eres VantIA, el asistente inteligente de VANTIA Legis ERP, un ERP para despachos de abogados. Tienes conocimientos generales de derecho español, gestión de despachos, expedientes, clientes y documentación. Eres útil, conciso y profesional. Responde siempre en español.";
}

function getVantIALabel(pathname: string): string {
  if (pathname.startsWith("/dashboard/clientes"))    return "Especialista en Clientes";
  if (pathname.startsWith("/dashboard/expedientes")) return "Especialista en Expedientes";
  if (pathname.startsWith("/dashboard/agenda"))      return "Especialista en Agenda";
  if (pathname.startsWith("/dashboard/chat-ia"))      return "Asistente IA Avanzado";
  if (pathname.startsWith("/dashboard/chat"))         return "Asistente de Equipo";
  if (pathname.startsWith("/dashboard/whatsapp"))     return "Asistente de WhatsApp";
  if (pathname.startsWith("/dashboard/correo"))       return "Asistente de Correo";
  if (pathname.startsWith("/dashboard/documental"))   return "Asistente Documental";
  if (pathname.startsWith("/dashboard/facturacion"))  return "Asistente de Facturación";
  if (pathname.startsWith("/dashboard/plaud-ia"))     return "Asistente Plaud IA";
  return "Asistente General";
}

// ── helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}
function actionIcon(t: string) {
  const value = String(t || "").toLowerCase();
  if (value.includes("correo") || value.includes("email")) return "??";
  if (value.includes("cliente")) return "??";
  if (value.includes("expediente")) return "??";
  if (value.includes("documento")) return "??";
  return "?";
}

// ── VantIA flotante (siempre visible, contextual) ───────────────────────────
interface ChatMsg { role: "user" | "model"; text: string }

function VantIAWidget({ pathname, getToken }: { pathname: string; getToken: (opts?: { skipCache?: boolean }) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cargar historial al abrir el chat o cambiar de módulo
  useEffect(() => {
    if (!open) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/vantia/chat/history?moduleId=${pathname}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await safeJson(res);
        if (res.ok && data.history && data.history.length > 0) {
          setMessages(data.history);
        } else {
          // Si no hay historial, mostrar el saludo inicial
          setMessages([
            {
              role: 'model',
              text: `¡Hola! Soy VantIA — ${getVantIALabel(pathname)}. ¿En qué puedo ayudarte?`,
            },
          ]);
        }
      } catch (err) {
        setMessages([
          {
            role: 'model',
            text: `❌ No pude cargar el historial. ${err instanceof Error ? err.message : ''}`,
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [open, pathname, getToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newHistory: ChatMsg[] = [...messages, { role: "user", text }];
    setMessages(newHistory);
    setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      // El historial que se envía a Gemini no debe contener el saludo inicial si es el único mensaje.
      const historyForApi = messages.length === 1 && messages[0].role === 'model'
        ? []
        : messages;

      const res = await fetch("/api/vantia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          history: historyForApi,
          systemPrompt: getVantIAContext(pathname),
          moduleId: pathname, // Enviar el `pathname` para que el backend sepa dónde guardar
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Error en la API de VantIA");
      setMessages([...newHistory, { role: "model", text: data.reply }]);
    } catch (err: any) {
      setMessages([...newHistory, { role: "model", text: `❌ ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">

      {/* Panel de chat */}
      {open && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
             style={{ height: "460px" }}>

          {/* Header */}
          <div className="bg-[#ab0433] px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 bg-white/20 rounded-lg flex items-center justify-center">
                <Bot size={14} className="text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-bold leading-none">VantIA</p>
                <p className="text-white/75 text-[10px]">{getVantIALabel(pathname)}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#ab0433] text-white rounded-br-sm"
                    : "bg-neutral-100 text-neutral-700 rounded-bl-sm"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-2 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Escribe tu consulta..."
              className="flex-1 text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#ab0433]/20 focus:border-[#ab0433]/30"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="h-8 w-8 bg-[#ab0433] disabled:opacity-40 text-white rounded-xl flex items-center justify-center hover:bg-[#92042c] transition-colors"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante VantIA */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`h-12 w-12 rounded-2xl shadow-xl flex items-center justify-center transition-all active:scale-95 ${
          open
            ? "bg-neutral-800 shadow-neutral-900/30"
            : "bg-[#ab0433] shadow-red-700/30 hover:shadow-red-700/50 hover:scale-105"
        }`}
        title="VantIA — Asistente IA"
      >
        {open ? <X size={18} className="text-white" /> : <Bot size={20} className="text-white" />}
      </button>
    </div>
  );
}

// ── WhatsApp mini popup ──────────────────────────────────────────────────────
function WhatsAppWidget() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const openChat = () => {
    navigate("/dashboard/whatsapp");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="WhatsApp"
        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-800/60 hover:bg-[#25D366]/20 border border-slate-700 hover:border-[#25D366]/50 transition-all group w-full"
      >
        <div className="h-7 w-7 bg-[#25D366]/10 group-hover:bg-[#25D366]/20 rounded-lg flex items-center justify-center">
          <MessageCircle size={15} className="text-[#25D366]" />
        </div>
        <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#25D366]">WhatsApp</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
          {/* Header WhatsApp */}
          <div className="bg-[#25D366] px-4 py-3 flex items-center gap-3">
            <div className="h-9 w-9 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageCircle size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">Despacho Vantia</p>
              <p className="text-white/80 text-[11px] mt-0.5">Normalmente responde en minutos</p>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            <div className="bg-[#f0f2f5] rounded-xl rounded-tl-sm px-3 py-2">
              <p className="text-xs text-slate-700">👋 ¡Hola! ¿En qué podemos ayudarte?</p>
              <p className="text-[10px] text-slate-400 mt-1 text-right">09:00 ✓✓</p>
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              Continúa la conversación en WhatsApp
            </p>
            <button
              onClick={openChat}
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
            >
              <MessageCircle size={15} />
              Abrir módulo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notifications Panel ──────────────────────────────────────────────────────
type UnifiedNotification = {
  id: string;
  kind: "chat" | "email" | "whatsapp";
  title: string;
  subtitle?: string;
  meta?: string;
  count?: number;
  created_at: string;
  onClick?: () => void;
};

function notificationIcon(kind: UnifiedNotification["kind"]) {
  if (kind === "chat") return "💬";
  if (kind === "email") return "✉️";
  return "🟢";
}

function NotificationsPanel({ notifs, loading, onClose }: { notifs: UnifiedNotification[]; loading: boolean; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm">Notificaciones</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Spinner size="sm" muted /></div>
        ) : notifs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">Sin mensajes pendientes</div>
        ) : notifs.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => { n.onClick?.(); onClose(); }}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 text-left">
            <span className="text-base mt-0.5">{notificationIcon(n.kind)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{n.title}</p>
              {n.subtitle && <p className="text-[11px] text-slate-500 truncate">{n.subtitle}</p>}
              {n.meta && <p className="text-[11px] text-slate-400 truncate mt-0.5">{n.meta}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            {!!n.count && n.count > 1 && (
              <span className="ml-2 min-w-[20px] h-5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                {n.count > 99 ? "99+" : n.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Search Dropdown ──────────────────────────────────────────────────────────
function SearchDropdown({ query, onSelect }: { query: string; onSelect: () => void }) {
  const navigate  = useNavigate();
  const filtered  = MODULES.filter(
    (m) => m.name.toLowerCase().includes(query.toLowerCase()) ||
           m.desc.toLowerCase().includes(query.toLowerCase())
  );
  if (!query || !filtered.length) return null;
  return (
    <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
      {filtered.map((m) => {
        const Icon = m.icon;
        return (
          <button key={m.path} onClick={() => { navigate(m.path); onSelect(); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left group">
            <div className="h-8 w-8 bg-neutral-100 group-hover:bg-red-50 rounded-lg flex items-center justify-center transition-colors">
              <Icon size={14} className="text-neutral-500 group-hover:text-red-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-700 group-hover:text-red-700">{m.name}</p>
              <p className="text-[11px] text-neutral-400">{m.desc}</p>
            </div>
            <ChevronRight size={14} className="text-neutral-300 group-hover:text-red-400" />
          </button>
        );
      })}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function SidebarContent({ pathname, onClose, onSignOut, collapsed, onToggleCollapse }: {
  pathname: string;
  onClose?: () => void;
  onSignOut?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { user } = useUser();
  const { totalUnread } = useChatUnread();
  const { unreadCount: emailUnreadCount } = useEmailUnread();
  const { unreadCount: waUnreadCount } = useWhatsAppUnread();

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 overflow-hidden">

      {/* Logo */}
      <div className={`flex items-center border-b border-slate-800 shrink-0 transition-all duration-300 ${collapsed ? "justify-center px-2 py-4" : "justify-center px-6 py-5"}`}>
        <img
          src="/vantia-sidebar-slate.png"
          alt="Vantia Legis"
          className={`object-contain transition-all duration-300 ${collapsed ? "h-8 w-8" : "h-12 w-full"}`}
        />
      </div>

      {/* Nav */}
      <nav className={`modules-scrollbar flex-1 overflow-y-auto transition-all duration-300 ${collapsed ? "px-2 pt-2" : "px-4"}`}>
        {NAV_GROUPS.map((group) => {
          const items = group.items
            .map((name) => NAV_ITEMS.find((item) => item.name === name))
            .filter((item): item is (typeof NAV_ITEMS)[number] => !!item);
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="h-px bg-slate-800 mb-2 mx-1" />}
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + '/'));
                  const Icon = item.icon;
                  const isChat  = item.href === "/dashboard/chat";
                  const isEmail = item.href === "/dashboard/correo";
                  const isWA    = item.href === "/dashboard/whatsapp";
                  const chatBadge  = isChat  && !isActive && totalUnread > 0;
                  const emailBadge = isEmail && !isActive && emailUnreadCount > 0;
                  const waBadge    = isWA    && !isActive && waUnreadCount > 0;
                  const badgeCount = chatBadge ? totalUnread : emailBadge ? emailUnreadCount : waUnreadCount;
                  const hasBadge   = chatBadge || emailBadge || waBadge;

                  if (collapsed) {
                    return (
                      <Link key={item.name} to={item.href} onClick={onClose} title={item.name}
                        className={`relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors border-l-4 ${
                          isActive ? "bg-red-500/10 text-white border-red-500"
                                   : "text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
                        }`}>
                        <Icon className={`h-5 w-5 ${isActive ? "text-red-400" : "text-slate-500"}`} />
                        {hasBadge && (
                          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full ring-1 ring-slate-900" />
                        )}
                      </Link>
                    );
                  }

                  return (
                    <Link key={item.name} to={item.href} onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-4 ${
                        isActive ? "bg-red-500/10 text-white border-red-500"
                                 : "text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
                      }`}>
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-red-400" : "text-slate-500"}`} />
                      <span className="flex-1 truncate">{item.name}</span>
                      {hasBadge && (
                        <span className="ml-auto min-w-[20px] h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Toggle colapsar */}
      <div className={`transition-all duration-300 ${collapsed ? "px-2 pb-2" : "px-4 pb-2"}`}>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          className={`flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors ${
            collapsed ? "h-10 w-10 mx-auto" : "w-full py-2 gap-2 text-xs font-medium px-3"
          }`}
        >
          {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={14} /><span>Colapsar</span></>}
        </button>
      </div>

      {/* Configuración */}
      <div className={`transition-all duration-300 ${collapsed ? "px-2 pb-2" : "px-4 pb-3"}`}>
        {collapsed ? (
          <Link to="/dashboard/config" onClick={onClose} title="Configuración"
            className={`flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors border-l-4 ${
              pathname === "/dashboard/config" ? "bg-red-500/10 text-white border-red-500" : "text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
            }`}>
            <Settings className="h-5 w-5 text-slate-500" />
          </Link>
        ) : (
          <Link to="/dashboard/config" onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-4 ${
              pathname === "/dashboard/config" ? "bg-red-500/10 text-white border-red-500" : "text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
            }`}>
            <Settings className="h-4 w-4 shrink-0 text-slate-500" /> Configuración
          </Link>
        )}
      </div>

      {/* Usuario */}
      <div className={`transition-all duration-300 ${collapsed ? "px-2 pb-3" : "px-4 pb-4"}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
            <UserButton afterSignOutUrl="/" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200 truncate leading-tight">{user?.fullName || user?.firstName || "Usuario"}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.primaryEmailAddress?.emailAddress || ""}</p>
            </div>
            {onSignOut && (
              <button onClick={onSignOut} title="Cerrar sesión"
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0">
                <LogOut size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Badge seguridad */}
      <div className={`transition-all duration-300 ${collapsed ? "px-2 pb-4 flex justify-center" : "px-4 pb-4"}`}>
        {collapsed ? (
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
        ) : (
          <div className="p-3 bg-emerald-900/20 rounded-lg border border-emerald-800/30 flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter truncate">Conexión Segura</p>
              <p className="text-[9px] text-slate-500 truncate">VANTIA Legis ERP</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LAYOUT PRINCIPAL ─────────────────────────────────────────────────────────
export default function DashboardLayout() {
  const location     = useLocation();
  const navigate     = useNavigate();
  const { user }     = useUser();
  const { getToken } = useAuth();
  const clerk        = useClerk();
  const { unreadCount: emailUnreadCount, latestUnread, clearLatestUnread } = useEmailUnread();
  const { totalUnread: chatTotalUnread } = useChatUnread();
  const { latestToast: latestWaToast, clearToast: clearWaToast, markSeen: markWaSeen, markAllSeen: markAllWaSeen } = useWhatsAppUnread();

  const [isMobileOpen,    setIsMobileOpen]    = useState(false);
  const [isCollapsed,     setIsCollapsed]     = useState(() => localStorage.getItem("sidebar_collapsed") === "1");
  const [isNotifOpen,     setIsNotifOpen]     = useState(false);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [notifications,   setNotifications]   = useState<UnifiedNotification[]>([]);
  const [notifLoading,    setNotifLoading]    = useState(false);
  const [latestChatToast, setLatestChatToast] = useState<{ title: string; meta?: string; onClick?: () => void } | null>(null);

  const searchRef          = useRef<HTMLDivElement>(null);
  const notifRef           = useRef<HTMLDivElement>(null);
  const loginFiredRef      = useRef<string | null>(null);
  const notifBusyRef       = useRef(false);
  const prevChatUnreadRef  = useRef(-1);
  const activeUserIdRef    = useRef<string | null>(null);

  // ── Detectar cambio de sesión Clerk (mismo navegador, cuentas distintas) ──
  useEffect(() => {
    if (!user?.id) return;
    if (activeUserIdRef.current && activeUserIdRef.current !== user.id) {
      // La sesión cambió a otro usuario — resetear al dashboard
      navigate("/dashboard", { replace: true });
    }
    activeUserIdRef.current = user.id;
  }, [user?.id, navigate]);

  // ── Registrar LOGIN en trazabilidad cuando el usuario se autentica ──────
  useEffect(() => {
    if (!user?.id) return;
    if (loginFiredRef.current === user.id) return;
    loginFiredRef.current = user.id;

    (async () => {
      try {
        // Esperar a que ipify responda (máx 5s) para tener la IP real
        const [token, ip] = await Promise.all([
          getToken({ skipCache: true }),
          waitForClientIp(),
        ]);
        if (!token) return;
        await fetch('/api/activity/login', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(ip ? { 'x-client-ip': ip } : {}),
            'x-device-id': getDeviceId(),
          },
          body: JSON.stringify({ publicIp: ip }),
        });
      } catch (_e) { /* silencioso */ }
    })();
  }, [user?.id, getToken]);

  // ── Sign-out con registro de LOGOUT en trazabilidad ─────────────────────
  const handleSignOut = useCallback(async () => {
    try {
      // Esperar IP antes de cerrar sesión (ipify responde en < 1s normalmente)
      const [token, ip] = await Promise.all([
        getToken({ skipCache: true }),
        waitForClientIp(),
      ]);
      if (token) {
        await fetch('/api/activity/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(ip ? { 'x-client-ip': ip } : {}),
            'x-device-id': getDeviceId(),
          },
          body: JSON.stringify({ publicIp: ip }),
        });
      }
    } catch (_e) { /* silencioso */ } finally {
      clerk.signOut({ redirectUrl: '/' });
    }
  }, [getToken, clerk]);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  // Cerrar paneles al clicar fuera
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false); setSearchQuery("");
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setIsNotifOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const hiddenKinds = useMemo(() => {
    const hidden = new Set<UnifiedNotification["kind"]>();
    if (location.pathname.startsWith("/dashboard/correo")) hidden.add("email");
    if (location.pathname.startsWith("/dashboard/chat")) hidden.add("chat");
    if (location.pathname.startsWith("/dashboard/whatsapp")) hidden.add("whatsapp");
    return hidden;
  }, [location.pathname]);

  const fetchNotifications = useCallback(async (showLoader = false) => {
    if (notifBusyRef.current) return;
    notifBusyRef.current = true;
    if (showLoader) setNotifLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [chatRes, emailRes, waRes] = await Promise.all([
        fetch("/api/chat/canales", { headers }),
        fetch("/api/email/messages?folder=INBOX&unread=1&page=1&pageSize=50", { headers }),
        fetch("/api/whatsapp/contacts", { headers }),
      ]);

      const [chatData, emailData, waData] = await Promise.all([
        safeJson(chatRes),
        safeJson(emailRes),
        safeJson(waRes),
      ]);

      const next: UnifiedNotification[] = [];

      if (chatRes.ok) {
        const chatItems = Array.isArray(chatData?.data) ? chatData.data : [];
        for (const item of chatItems) {
          const unread = Number(item?.no_leidos || 0);
          if (unread <= 0) continue;
          const isDM = item?.tipo === "directo";
          const channelLabel = isDM
            ? (item?.dm_target_user_name || "Chat directo")
            : `#${item?.nombre || "canal"}`;
          next.push({
            id: `chat-${item.id}`,
            kind: "chat",
            title: channelLabel,
            subtitle: isDM
              ? (unread > 1 ? `${unread} mensajes directos sin leer` : "1 mensaje directo sin leer")
              : (unread > 1 ? `${unread} mensajes sin leer` : "1 mensaje sin leer"),
            meta: item?.ultimo_mensaje || undefined,
            count: unread,
            created_at: item?.ultimo_mensaje_at || item?.created_at || new Date().toISOString(),
            onClick: () => navigate(`/dashboard/chat?canal=${encodeURIComponent(item.id)}`),
          });
        }
      }

      if (emailRes.ok) {
        const emailItems = Array.isArray(emailData?.data?.emails) ? emailData.data.emails : [];
        const groupedEmails = new Map<string, { from: string; subject: string; snippet: string; count: number; created_at: string; id: string }>();
        for (const item of emailItems) {
          const key = String(item?.from_email || item?.from_name || item?.id || "");
          if (!key) continue;
          const existing = groupedEmails.get(key);
          const createdAt = item?.sent_at || new Date().toISOString();
          if (!existing) {
            groupedEmails.set(key, {
              from: item?.from_name || item?.from_email || "Nuevo correo",
              subject: item?.subject || "(Sin asunto)",
              snippet: item?.snippet || "",
              count: 1,
              created_at: createdAt,
              id: item?.id,
            });
          } else {
            existing.count += 1;
            if (new Date(createdAt).getTime() > new Date(existing.created_at).getTime()) {
              existing.created_at = createdAt;
              existing.subject = item?.subject || existing.subject;
              existing.snippet = item?.snippet || existing.snippet;
              existing.id = item?.id || existing.id;
              existing.from = item?.from_name || item?.from_email || existing.from;
            }
          }
        }

        for (const grouped of groupedEmails.values()) {
          next.push({
            id: `email-${grouped.id}`,
            kind: "email",
            title: grouped.from,
            subtitle: grouped.count > 1 ? `${grouped.count} correos sin leer` : grouped.subject,
            meta: grouped.count > 1 ? grouped.subject : grouped.snippet,
            count: grouped.count,
            created_at: grouped.created_at,
            onClick: () => navigate(`/dashboard/correo?openEmail=${encodeURIComponent(grouped.id)}`),
          });
        }
      }

      if (waRes.ok) {
        const waItems = Array.isArray(waData?.data) ? waData.data : [];
        const waLastSeenKey = user?.id ? `${WA_LAST_SEEN_KEY}-${user.id}` : WA_LAST_SEEN_KEY;
        const waLastSeen: Record<string, string> = (() => {
          try { return JSON.parse(localStorage.getItem(waLastSeenKey) || "{}"); } catch { return {}; }
        })();
        for (const item of waItems) {
          if (String(item?.last_message_direction || "") !== "inbound") continue;
          if (!item?.last_message_at || !item?.id) continue;
          const msgTime = new Date(item.last_message_at).getTime();
          if (Date.now() - msgTime > 48 * 60 * 60 * 1000) continue; // skip if older than 48h
          const seenAt = waLastSeen[item.id];
          if (seenAt && msgTime <= new Date(seenAt).getTime()) continue;
          const contactName = item?.commercial_name || `${item?.first_name || ""} ${item?.last_name || ""}`.trim() || item?.email || "WhatsApp";
          next.push({
            id: `wa-${item.id}`,
            kind: "whatsapp",
            title: contactName,
            subtitle: "Mensaje recibido por WhatsApp",
            meta: item?.last_message_body || undefined,
            count: 1,
            created_at: item?.last_message_at,
            onClick: () => {
              markWaSeen(item.id);
              navigate(`/dashboard/whatsapp?clientId=${encodeURIComponent(item.id)}&mode=thread`);
            },
          });
        }
      }

      next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotifications(next.slice(0, 20));
    } catch (_e) {
    } finally {
      notifBusyRef.current = false;
      if (showLoader) setNotifLoading(false);
    }
  }, [getToken, navigate, markWaSeen]);

  const openNotifications = useCallback(async () => {
    setIsNotifOpen(true);
    await fetchNotifications(true);
  }, [fetchNotifications]);

  useEffect(() => {
    let interval: number | null = null;

    const handleRefresh = () => {
      void fetchNotifications(false);
    };
    const handleVisibilityChange = () => {
      handleRefresh();
      startPolling();
    };

    const startPolling = () => {
      if (interval) window.clearInterval(interval);
      interval = window.setInterval(
        handleRefresh,
        document.visibilityState === "visible" ? 3000 : 9000,
      );
    };

    handleRefresh();
    startPolling();
    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (interval) window.clearInterval(interval);
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications]);

  // Marcar WA como visto al entrar en la página de WhatsApp
  useEffect(() => {
    if (!location.pathname.startsWith("/dashboard/whatsapp")) return;
    const waItems = notifications.filter(n => n.kind === "whatsapp");
    if (waItems.length > 0) {
      markAllWaSeen(waItems.map(n => n.id.replace("wa-", "")));
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toast de chat — detectar cuando sube el total de no-leídos
  useEffect(() => {
    if (prevChatUnreadRef.current === -1) {
      prevChatUnreadRef.current = chatTotalUnread;
      return;
    }
    if (chatTotalUnread > prevChatUnreadRef.current && !location.pathname.startsWith("/dashboard/chat")) {
      const newestChat = notifications
        .filter(n => n.kind === "chat")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      setLatestChatToast(newestChat
        ? { title: newestChat.title, meta: newestChat.meta, onClick: newestChat.onClick }
        : { title: "Nuevo mensaje en Chat", onClick: () => navigate("/dashboard/chat") }
      );
    }
    prevChatUnreadRef.current = chatTotalUnread;
  }, [chatTotalUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !hiddenKinds.has(item.kind)),
    [hiddenKinds, notifications],
  );

  const totalBadge = visibleNotifications.length + (!hiddenKinds.has("email") && emailUnreadCount > 0 ? 1 : 0);

  return (
    <SidebarContext.Provider value={{ isCollapsed }}>
    <div className="erp-shell min-h-screen flex font-sans antialiased text-neutral-900">

      {latestUnread && !location.pathname.startsWith("/dashboard/correo") && (
        <EmailToast
          email={latestUnread}
          onClose={clearLatestUnread}
          onOpen={() => {
            navigate(`/dashboard/correo?openEmail=${encodeURIComponent(latestUnread.id)}`);
            clearLatestUnread();
          }}
        />
      )}

      {latestWaToast && !location.pathname.startsWith("/dashboard/whatsapp") && (
        <WaToast
          name={latestWaToast.name}
          message={latestWaToast.message}
          onClose={clearWaToast}
          onOpen={() => {
            markWaSeen(latestWaToast.contactId);
            navigate(`/dashboard/whatsapp?clientId=${encodeURIComponent(latestWaToast.contactId)}&mode=thread`);
            clearWaToast();
          }}
        />
      )}

      {latestChatToast && (
        <ChatToast
          title={latestChatToast.title}
          meta={latestChatToast.meta}
          onClose={() => setLatestChatToast(null)}
          onOpen={() => {
            latestChatToast.onClick?.();
            setLatestChatToast(null);
          }}
        />
      )}

      {/* VantIA flotante — siempre visible, contextual según la ruta */}
      <VantIAWidget pathname={location.pathname} getToken={getToken} />

      {/* Sidebar Desktop */}
      <aside className={`hidden md:flex flex-col fixed inset-y-0 z-30 transition-all duration-300 ${isCollapsed ? "w-16" : "w-64"}`}>
        <SidebarContent pathname={location.pathname} onSignOut={handleSignOut} collapsed={isCollapsed} onToggleCollapse={toggleSidebar} />
      </aside>

      {/* Menú Móvil */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/80" onClick={() => setIsMobileOpen(false)} />
          <div className="relative w-64 h-full shadow-2xl">
            <button onClick={() => setIsMobileOpen(false)} className="absolute right-4 top-6 text-slate-400 hover:text-white z-10">
              <X className="h-6 w-6" />
            </button>
            <SidebarContent pathname={location.pathname} onClose={() => setIsMobileOpen(false)} onSignOut={handleSignOut} />
          </div>
        </div>
      )}

      {/* Contenedor principal */}
      <main className={`relative flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${isCollapsed ? "md:pl-16" : "md:pl-64"}`}>

        {/* Topbar */}
        <header className="h-16 border-b border-slate-200 bg-white shadow-sm flex items-center gap-4 px-5 md:px-8 sticky top-0 z-20">
          <button className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 shrink-0" onClick={() => setIsMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>

          {/* Búsqueda */}
          <div ref={searchRef} className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Buscar módulos, clientes, expedientes..."
              className="pl-10 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-400 outline-none transition-all"
            />
            {searchFocused && searchQuery && (
              <SearchDropdown query={searchQuery} onSelect={() => { setSearchQuery(""); setSearchFocused(false); }} />
            )}
          </div>

          {/* Notificaciones */}
          <div ref={notifRef} className="relative shrink-0">
            <button
              onClick={isNotifOpen ? () => setIsNotifOpen(false) : openNotifications}
              className="relative p-2.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <Bell className="h-5 w-5" />
              {totalBadge > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>
            {isNotifOpen && (
              <NotificationsPanel
                notifs={visibleNotifications.slice(0, 10)}
                loading={notifLoading}
                onClose={() => setIsNotifOpen(false)}
              />
            )}
          </div>
        </header>

        {/* Contenido */}
        <div id="dashboard-content" className="relative z-10 flex-1 overflow-y-auto bg-slate-50">
          <div
            key={location.pathname}
            className={
              (
                [
                  '/dashboard/correo',
                  '/dashboard/clientes',
                  '/dashboard/expedientes',
                  '/dashboard/trazabilidad',
                  '/dashboard/agenda',
                  '/dashboard/chat',
                  '/dashboard/whatsapp',
                ].includes(location.pathname) ||
                location.pathname.startsWith('/dashboard/facturacion')
              )
                ? 'w-full h-full module-page'
                : (
                  location.pathname.startsWith('/dashboard/expedientes/') ||
                  location.pathname.startsWith('/dashboard/clientes/')
                )
                  ? 'w-full h-full module-page'
                  : 'max-w-[1600px] mx-auto p-4 md:p-8 module-page'
            }>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
    </SidebarContext.Provider>
  );
}

function EmailToast({
  email,
  onOpen,
  onClose,
}: {
  email: { subject: string; from: string; snippet: string };
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-6 right-24 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-red-100 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4 bg-gradient-to-r from-red-50 to-white">
        <div className="h-10 w-10 rounded-2xl bg-[#ab0433] text-white flex items-center justify-center shrink-0">
          <Mail className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#ab0433]">Nuevo correo</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{email.subject}</p>
          <p className="text-xs text-slate-500 truncate">{email.from}</p>
          {email.snippet && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{email.snippet}</p>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X size={14} />
        </button>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          Cerrar
        </button>
        <button
          onClick={onOpen}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#ab0433] text-white hover:bg-[#8f022a]"
        >
          Abrir correo
        </button>
      </div>
    </div>
  );
}

function WaToast({ name, message, onOpen, onClose }: { name: string; message: string; onOpen: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 10_000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-24 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-green-100 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4 bg-gradient-to-r from-green-50 to-white">
        <div className="h-10 w-10 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#1a9e4f]">WhatsApp</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{message}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100">Cerrar</button>
        <button onClick={onOpen} className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#25D366] text-white hover:bg-[#1ebe5d]">Ver conversación</button>
      </div>
    </div>
  );
}

function ChatToast({ title, meta, onOpen, onClose }: { title: string; meta?: string; onOpen: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8_000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-24 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-indigo-100 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4 bg-gradient-to-r from-indigo-50 to-white">
        <div className="h-10 w-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Chat interno</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
          {meta && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{meta}</p>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100">Cerrar</button>
        <button onClick={onOpen} className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700">Abrir chat</button>
      </div>
    </div>
  );
}
