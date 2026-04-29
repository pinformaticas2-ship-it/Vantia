import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, Users, Settings,
  Menu, Search, X, Bell, ShieldCheck, Calendar,
  MessageCircle, Bot, Send, ChevronRight, Loader2, History, CheckCircle2,
  MessageSquare, LogOut, Mail, Library, Receipt, Mic, Sparkles,
} from "lucide-react";
import { UserButton, useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { getDeviceId, safeJson, waitForClientIp } from "../lib/api";
import { useChatUnread } from "../contexts/ChatUnreadContext";
import { useEmailUnread } from "../contexts/EmailUnreadContext";

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
  if (pathname.startsWith("/dashboard/chat-ia"))
    return "Eres VantIA, asistente IA avanzado del despacho. Ayudas con consultas complejas, uso de herramientas, recuperación de historial y apoyo transversal a todos los módulos. Responde siempre en español.";
  if (pathname.startsWith("/dashboard/config"))
    return "Eres VantIA, asistente de configuración de VANTIA Legis ERP. Ayudas con ajustes del sistema, usuarios, permisos y personalización. Responde siempre en español.";
  return "Eres VantIA, el asistente inteligente de VANTIA Legis ERP, un ERP para despachos de abogados. Tienes conocimientos generales de derecho español, gestión de despachos, expedientes, clientes y documentación. Eres útil, conciso y profesional. Responde siempre en español.";
}

function getVantIALabel(pathname: string): string {
  if (pathname.startsWith("/dashboard/clientes"))    return "Especialista en Clientes";
  if (pathname.startsWith("/dashboard/expedientes")) return "Especialista en Expedientes";
  if (pathname.startsWith("/dashboard/agenda"))      return "Especialista en Agenda";
  if (pathname.startsWith("/dashboard/chat"))         return "Asistente de Equipo";
  if (pathname.startsWith("/dashboard/whatsapp"))     return "Asistente de WhatsApp";
  if (pathname.startsWith("/dashboard/correo"))       return "Asistente de Correo";
  if (pathname.startsWith("/dashboard/documental"))   return "Asistente Documental";
  if (pathname.startsWith("/dashboard/facturacion"))  return "Asistente de Facturación";
  if (pathname.startsWith("/dashboard/plaud-ia"))     return "Asistente Plaud IA";
  if (pathname.startsWith("/dashboard/chat-ia"))      return "Asistente IA Avanzado";
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
  if (t.toLowerCase().includes("cliente")) return "👤";
  if (t.toLowerCase().includes("expediente")) return "📁";
  if (t.toLowerCase().includes("documento")) return "📄";
  return "⚡";
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
function NotificationsPanel({ notifs, loading, onClose }: { notifs: any[]; loading: boolean; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm">Notificaciones</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
        ) : notifs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">Sin actividad reciente</div>
        ) : notifs.map((n: any) => (
          <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
            <span className="text-base mt-0.5">{actionIcon(n.action_type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{n.action_type}</p>
              {n.entity_name && <p className="text-[11px] text-slate-500 truncate">{n.entity_name}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
          </div>
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
function SidebarContent({ pathname, onClose, onSignOut }: { pathname: string; onClose?: () => void; onSignOut?: () => void }) {
  const { user } = useUser();
  const { totalUnread } = useChatUnread();
  const { unreadCount: emailUnreadCount } = useEmailUnread();
  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Logo */}
      <div className="p-7">
        <div className="px-2 py-2">
          <img
            src="/vantia-sidebar-slate.png"
            alt="Vantia Legis"
            className="h-12 w-full object-contain"
          />
        </div>
      </div>

      {/* Nav principal */}
      <nav className="modules-scrollbar flex-1 px-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const items = group.items
            .map((name) => NAV_ITEMS.find((item) => item.name === name))
            .filter((item): item is (typeof NAV_ITEMS)[number] => !!item);

          if (!items.length) return null;

          return (
            <div key={group.label} className="mb-5">
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                {group.label}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  const isChat = item.href === "/dashboard/chat";
                  const isEmail = item.href === "/dashboard/correo";
                  const chatBadge = isChat && !isActive && totalUnread > 0;
                  const emailBadge = isEmail && !isActive && emailUnreadCount > 0;
                  return (
                    <Link key={item.name} to={item.href} onClick={onClose}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-200 ${
                        isActive ? "bg-[#ab0433] text-white shadow-xl shadow-red-900/40 translate-x-1"
                                 : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                      }`}>
                      <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-500"}`} />
                      <span className="flex-1">{item.name}</span>
                      {(chatBadge || emailBadge) && (
                        <span className="ml-auto min-w-[20px] h-5 bg-[#ab0433] text-white text-[10px] font-black rounded-full flex items-center justify-center px-1.5 shadow-lg shadow-red-900/40">
                          {chatBadge
                            ? (totalUnread > 99 ? "99+" : totalUnread)
                            : (emailUnreadCount > 99 ? "99+" : emailUnreadCount)}
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

      {/* Configuración */}
      <div className="px-4 pb-3">
        <Link to="/dashboard/config" onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
            pathname === "/dashboard/config" ? "bg-[#ab0433] text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
          }`}>
          <Settings className="h-5 w-5" /> Configuración
        </Link>
      </div>

      {/* Usuario */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-800/30 border border-slate-800/50">
          <UserButton afterSignOutUrl="/" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-200 truncate leading-tight">{user?.fullName || user?.firstName || "Usuario"}</p>
            <p className="text-[10px] text-slate-500 truncate">{user?.primaryEmailAddress?.emailAddress || ""}</p>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              title="Cerrar sesión"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Badge */}
      <div className="p-4">
        <div className="p-3 bg-slate-800/30 rounded-2xl border border-slate-800/50 flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white uppercase tracking-tighter truncate">Conexión Segura</p>
            <p className="text-[9px] text-slate-500 truncate">VANTIA Legis ERP</p>
          </div>
        </div>
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

  const [isMobileOpen,  setIsMobileOpen]  = useState(false);
  const [isNotifOpen,   setIsNotifOpen]   = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading,  setNotifLoading]  = useState(false);

  const searchRef      = useRef<HTMLDivElement>(null);
  const notifRef       = useRef<HTMLDivElement>(null);
  const loginFiredRef  = useRef<string | null>(null); // tracks which userId we've already logged-in

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

  const openNotifications = useCallback(async () => {
    setIsNotifOpen(true);
    setNotifLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res   = await fetch("/api/activity", { headers: { Authorization: `Bearer ${token}` } });
      const data  = await safeJson(res);
      if (res.ok) setNotifications(data.data || []);
    } catch (_e) {
    } finally { setNotifLoading(false); }
  }, [getToken]);

  return (
    <div className="erp-shell min-h-screen flex font-sans antialiased text-neutral-900">

      {latestUnread && (
        <EmailToast
          email={latestUnread}
          onClose={clearLatestUnread}
          onOpen={() => {
            navigate(`/dashboard/correo?openEmail=${encodeURIComponent(latestUnread.id)}`);
            clearLatestUnread();
          }}
        />
      )}

      {/* VantIA flotante — siempre visible, contextual según la ruta */}
      <VantIAWidget pathname={location.pathname} getToken={getToken} />

      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-30">
        <SidebarContent pathname={location.pathname} onSignOut={handleSignOut} />
      </aside>

      {/* Menú Móvil */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <div className="relative w-64 h-full shadow-2xl">
            <button onClick={() => setIsMobileOpen(false)} className="absolute right-4 top-6 text-slate-400 hover:text-white z-10">
              <X className="h-6 w-6" />
            </button>
            <SidebarContent pathname={location.pathname} onClose={() => setIsMobileOpen(false)} onSignOut={handleSignOut} />
          </div>
        </div>
      )}

      {/* Contenedor principal */}
      <main className="relative flex-1 md:pl-64 flex flex-col min-w-0 overflow-hidden">
        <div className="erp-ornaments pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="erp-orb erp-orb-top-right" />
          <div className="erp-orb erp-orb-bottom-left" />
          <div className="erp-panel erp-panel-top-left" />
          <div className="erp-panel erp-panel-bottom-right" />
          <div className="erp-line erp-line-top" />
          <div className="erp-line erp-line-bottom" />
        </div>

        {/* Topbar */}
        <header className="relative h-18 border-b bg-white/80 backdrop-blur-md flex items-center justify-between px-5 md:px-8 sticky top-0 z-20 py-4">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-600" onClick={() => setIsMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>

            {/* Búsqueda funcional */}
            <div ref={searchRef} className="relative hidden lg:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Buscar módulos..."
                className="pl-11 h-11 w-80 rounded-2xl border border-slate-100 bg-slate-50 text-sm focus:bg-white focus:ring-4 focus:ring-red-500/5 focus:border-slate-200 outline-none transition-all"
              />
              {searchFocused && searchQuery && (
                <SearchDropdown query={searchQuery} onSelect={() => { setSearchQuery(""); setSearchFocused(false); }} />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notificaciones */}
            <div ref={notifRef} className="relative">
              <button
                onClick={isNotifOpen ? () => setIsNotifOpen(false) : openNotifications}
                className="relative p-2.5 rounded-xl hover:bg-slate-50 text-slate-500 border border-slate-100 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {(notifications.length > 0 || emailUnreadCount > 0) && (
                  <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
              {isNotifOpen && (
                <NotificationsPanel
                  notifs={notifications.slice(0, 10)}
                  loading={notifLoading}
                  onClose={() => setIsNotifOpen(false)}
                />
              )}
            </div>

          </div>
        </header>

        {/* Contenido */}
        <div className="relative z-10 flex-1 overflow-y-auto">
          <div
            key={location.pathname}
            className={
              location.pathname === '/dashboard/correo'
                ? 'w-full h-full module-page'
                : 'max-w-[1600px] mx-auto p-4 md:p-8 module-page'
            }>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
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
          <p className="text-xs font-black tracking-[0.18em] uppercase text-[#ab0433]">Nuevo correo</p>
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
