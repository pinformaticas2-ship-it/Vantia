import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";

export const SidebarContext = createContext({ isCollapsed: false });
export function useSidebar() { return useContext(SidebarContext); }
import { Spinner } from "../components/Spinner";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, Users, Settings,
  Menu, Search, X, Bell, ShieldCheck, Calendar,
  MessageCircle, Bot, Send, ChevronRight, ChevronLeft, Loader2, History, CheckCircle2,
  MessageSquare, LogOut, Mail, Library, Receipt, Mic, Sparkles, ChevronsUpDown,
  MoreVertical, RotateCcw, Copy, Check,
  Pen, AlertTriangle, RefreshCw, Link2, Plus, Trash2, Scale, Gavel, ChevronDown,
  Wallet, CreditCard, Building2, BarChart3, FileText, Calculator,
} from "lucide-react";
import { UserButton, useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { getDeviceId, safeJson, waitForClientIp } from "../lib/api";
import { useChatUnread } from "../contexts/ChatUnreadContext";
import { useEmailUnread } from "../contexts/EmailUnreadContext";
import { useWhatsAppUnread, WA_LAST_SEEN_KEY } from "../contexts/WhatsAppUnreadContext";
import { useDocumentProcessing } from "../contexts/DocumentProcessingContext";

// ── Módulos buscables ────────────────────────────────────────────────────────
const MODULES = [
  { name: "Dashboard",      path: "/dashboard",              icon: LayoutDashboard, desc: "Panel de control" },
  { name: "Expedientes",    path: "/dashboard/expedientes",  icon: Briefcase,       desc: "Gestión de expedientes" },
  { name: "Clientes",       path: "/dashboard/clientes",     icon: Users,           desc: "Base de datos de clientes" },
  { name: "Nuevo Cliente",  path: "/dashboard/clientes/new", icon: Users,           desc: "Alta de nuevo cliente" },
  { name: "Procuradores",   path: "/dashboard/procuradores", icon: Scale,           desc: "Directorio de procuradores" },
  { name: "Abogados",       path: "/dashboard/abogados",     icon: Gavel,           desc: "Directorio de abogados" },
  { name: "Trazabilidad",   path: "/dashboard/trazabilidad", icon: History,         desc: "Historial de acciones por usuario" },
  { name: "Agenda",         path: "/dashboard/agenda",       icon: Calendar,        desc: "Calendario y citas" },
  { name: "Tareas",         path: "/dashboard/tareas",       icon: CheckCircle2,    desc: "Tareas y plazos del usuario" },
  { name: "Chat",           path: "/dashboard/chat",         icon: MessageSquare,   desc: "Chat de equipo" },
  { name: "WhatsApp",       path: "/dashboard/whatsapp",     icon: MessageCircle,   desc: "Mensajería y comunicación por WhatsApp" },
  { name: "Correo",         path: "/dashboard/correo",       icon: Mail,            desc: "Gestor de correo electrónico" },
  { name: "Documental",     path: "/dashboard/documental",   icon: Library,         desc: "Cendoj, BOE y Lexnet" },
  { name: "Facturación",    path: "/dashboard/facturacion",  icon: Receipt,         desc: "Vista general de tesorería" },
  { name: "Analítica",      path: "/dashboard/facturacion?tab=analitica",     icon: BarChart3,  desc: "Analítica financiera" },
  { name: "Facturas",       path: "/dashboard/facturacion?tab=facturas",      icon: FileText,   desc: "Facturas emitidas" },
  { name: "Gastos",         path: "/dashboard/facturacion?tab=gastos",        icon: Wallet,     desc: "Gastos del despacho" },
  { name: "Presupuestos",   path: "/dashboard/facturacion?tab=presupuestos",  icon: Calculator, desc: "Presupuestos" },
  { name: "Pagos y Cobros", path: "/dashboard/facturacion?tab=receipts",      icon: CreditCard, desc: "Cobros pendientes y realizados" },
  { name: "Contactos",      path: "/dashboard/facturacion?tab=contacts",      icon: Users,      desc: "Contactos de facturación (Quipu)" },
  { name: "Cuentas",        path: "/dashboard/facturacion?tab=bank_accounts", icon: Building2,  desc: "Cuentas bancarias" },
  { name: "Conexión Quipu", path: "/dashboard/facturacion?tab=config",        icon: Settings,   desc: "Configuración de la conexión con Quipu" },
  { name: "Plaud IA",       path: "/dashboard/plaud-ia",     icon: Mic,             desc: "Grabación y asistencia con IA" },
  { name: "Chat IA",        path: "/dashboard/chat-ia",      icon: Sparkles,        desc: "Asistente IA con herramientas e historial" },
  { name: "Configuración",  path: "/dashboard/config",       icon: Settings,        desc: "Ajustes del sistema" },
];

type NavChild = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavItem  = { name: string; href?: string; icon: React.ComponentType<{ className?: string }>; children?: NavChild[] };

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard",    href: "/dashboard",             icon: LayoutDashboard },
  { name: "Expedientes",  href: "/dashboard/expedientes", icon: Briefcase },
  {
    name: "Directorio",
    icon: Users,
    children: [
      { name: "Clientes",     href: "/dashboard/clientes",     icon: Users },
      { name: "Procuradores", href: "/dashboard/procuradores", icon: Scale },
      { name: "Abogados",     href: "/dashboard/abogados",     icon: Gavel },
    ],
  },
  { name: "Trazabilidad", href: "/dashboard/trazabilidad", icon: History },
  { name: "Agenda",       href: "/dashboard/agenda",      icon: Calendar },
  { name: "Tareas",       href: "/dashboard/tareas",      icon: CheckCircle2 },
  { name: "Chat",         href: "/dashboard/chat",        icon: MessageSquare },
  { name: "WhatsApp",     href: "/dashboard/whatsapp",    icon: MessageCircle },
  { name: "Correo",       href: "/dashboard/correo",      icon: Mail },
  { name: "Documental",   href: "/dashboard/documental",  icon: Library },
  {
    name: "Tesorería",
    icon: Receipt,
    children: [
      { name: "Facturación",    href: "/dashboard/facturacion",                   icon: Receipt },
      { name: "Analítica",      href: "/dashboard/facturacion?tab=analitica",     icon: BarChart3 },
      { name: "Facturas",       href: "/dashboard/facturacion?tab=facturas",      icon: FileText },
      { name: "Gastos",         href: "/dashboard/facturacion?tab=gastos",        icon: Wallet },
      { name: "Presupuestos",   href: "/dashboard/facturacion?tab=presupuestos",  icon: Calculator },
      { name: "Pagos y Cobros", href: "/dashboard/facturacion?tab=receipts",      icon: CreditCard },
      { name: "Contactos",      href: "/dashboard/facturacion?tab=contacts",      icon: Users },
      { name: "Cuentas",        href: "/dashboard/facturacion?tab=bank_accounts", icon: Building2 },
      { name: "Conexión Quipu", href: "/dashboard/facturacion?tab=config",        icon: Settings },
    ],
  },
  { name: "Plaud IA",     href: "/dashboard/plaud-ia",    icon: Mic },
  { name: "Chat IA",      href: "/dashboard/chat-ia",     icon: Sparkles },
];

const NAV_GROUPS = [
  {
    label: "Principal",
    items: ["Dashboard", "Expedientes", "Directorio", "Trazabilidad"],
  },
  {
    label: "Productividad",
    items: ["Agenda", "Tareas", "Chat", "WhatsApp", "Correo", "Tesorería"],
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
    return "Eres VantIA, asistente documental del despacho. Ayudas con búsquedas en el BOE, resúmenes normativos y localización de documentación jurídica. CENDOJ y LexNET solo están disponibles como enlace directo al portal oficial, no tienes acceso a búsqueda automática sobre ellos. Responde siempre en español.";
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

// Markdown ligero para las respuestas de VantIA: negrita, cursiva, código
// inline, listas con guion/asterisco y listas numeradas. No es un parser
// completo de Markdown (no hay tablas, enlaces ni bloques de código) — solo
// lo que el modelo usa realmente, para no arrastrar una librería entera.
function renderInlineMd(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w*])\*([^*\n]+)\*(?!\w)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    if (m[1] !== undefined) parts.push(<strong key={`${keyPrefix}-${k++}`} className="font-semibold text-slate-900">{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<code key={`${keyPrefix}-${k++}`} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[12px] font-mono text-red-700">{m[2]}</code>);
    else if (m[3] !== undefined) parts.push(<em key={`${keyPrefix}-${k++}`}>{m[3]}</em>);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderMarkdownLite(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
  const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push(
        <ul key={`b-${key++}`} className="list-disc pl-5 space-y-1 my-1.5">
          {items.map((it, idx) => <li key={idx}>{renderInlineMd(it, `u${key}-${idx}`)}</li>)}
        </ul>
      );
      continue;
    }
    if (isNumbered(line)) {
      const items: string[] = [];
      while (i < lines.length && isNumbered(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push(
        <ol key={`b-${key++}`} className="list-decimal pl-5 space-y-1 my-1.5">
          {items.map((it, idx) => <li key={idx}>{renderInlineMd(it, `o${key}-${idx}`)}</li>)}
        </ol>
      );
      continue;
    }
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBullet(lines[i]) && !isNumbered(lines[i])) { paraLines.push(lines[i]); i++; }
    blocks.push(
      <p key={`b-${key++}`} className="mb-2 last:mb-0">
        {paraLines.map((l, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInlineMd(l, `p${key}-${idx}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }
  return <>{blocks}</>;
}

function VantIAWidget({ pathname, getToken }: { pathname: string; getToken: (opts?: { skipCache?: boolean }) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryText, setRetryText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  // Efecto "máquina de escribir": revela el texto ya recibido poco a poco en
  // vez de volcarlo de golpe, para que se vea como si VantIA lo fuera
  // escribiendo (igual que Gemini), sin depender de streaming real del backend.
  useEffect(() => () => { if (revealTimerRef.current) clearInterval(revealTimerRef.current); }, []);
  const streamReveal = (idx: number, fullText: string): Promise<void> =>
    new Promise((resolve) => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      let pos = 0;
      revealTimerRef.current = setInterval(() => {
        pos = Math.min(pos + 3, fullText.length);
        setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, text: fullText.slice(0, pos) } : m)));
        if (pos >= fullText.length) {
          if (revealTimerRef.current) { clearInterval(revealTimerRef.current); revealTimerRef.current = null; }
          resolve();
        }
      }, 18);
    });

  useEffect(() => {
    if (!showMenu) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  const greeting = (): ChatMsg => ({ role: "model", text: `¡Hola! Soy VantIA — ${getVantIALabel(pathname)}. ¿En qué puedo ayudarte?` });

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
          setMessages([greeting()]);
        }
      } catch (err) {
        setMessages([{ role: "model", text: `❌ No pude cargar el historial. ${err instanceof Error ? err.message : ""}` }]);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathname, getToken]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open]);

  useEffect(() => {
    // "auto" (instantáneo) en vez de "smooth": con la revelación tipo máquina
    // de escribir el contenido crece varias veces por segundo y un scroll
    // suave repetido se nota a tirones.
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, loading]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  };

  const callApi = async (text: string, history: ChatMsg[]): Promise<string> => {
    const token = await getToken({ skipCache: true });
    const historyForApi = history.length === 1 && history[0].role === "model" ? [] : history;
    const res = await fetch("/api/vantia/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, history: historyForApi, systemPrompt: getVantIAContext(pathname), moduleId: pathname }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || "Error en la API de VantIA");
    return data.reply as string;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "44px"; }
    const newHistory: ChatMsg[] = [...messages, { role: "user", text }];
    setMessages(newHistory);
    setLoading(true);
    try {
      const reply = await callApi(text, messages);
      const idx = newHistory.length;
      setMessages([...newHistory, { role: "model", text: "" }]);
      setLoading(false);
      await streamReveal(idx, reply);
      setRetryText("");
    } catch (err: any) {
      setRetryText(text);
      setMessages([...newHistory, { role: "model", text: `❌ ${err.message}` }]);
      setLoading(false);
    }
  };

  const retryLast = async () => {
    if (!retryText || loading) return;
    const text = retryText;
    const prevMessages = messages.slice(0, -2);
    const withUser: ChatMsg[] = [...prevMessages, { role: "user", text }];
    setMessages(withUser);
    setLoading(true);
    setRetryText("");
    try {
      const reply = await callApi(text, prevMessages);
      const idx = withUser.length;
      setMessages([...withUser, { role: "model", text: "" }]);
      setLoading(false);
      await streamReveal(idx, reply);
    } catch (err: any) {
      setRetryText(text);
      setMessages([...withUser, { role: "model", text: `❌ ${err.message}` }]);
      setLoading(false);
    }
  };

  // Regenera una respuesta concreta del asistente: reenvía el mensaje de
  // usuario justo anterior y sustituye solo esa respuesta.
  const regenerate = async (idx: number) => {
    if (loading || regeneratingIdx !== null) return;
    const userMsg = messages[idx - 1];
    if (!userMsg || userMsg.role !== "user") return;
    const prevMessages = messages.slice(0, idx - 1);
    setRegeneratingIdx(idx);
    try {
      const reply = await callApi(userMsg.text, prevMessages);
      setMessages((prev) => prev.map((m, i) => (i === idx ? { role: "model", text: "" } : m)));
      setRegeneratingIdx(null);
      await streamReveal(idx, reply);
    } catch (err: any) {
      setMessages((prev) => prev.map((m, i) => (i === idx ? { role: "model", text: `❌ ${err.message}` } : m)));
      setRegeneratingIdx(null);
    }
  };

  const copyMessage = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
  };

  const clearConversation = async () => {
    if (clearing) return;
    setClearing(true);
    setShowMenu(false);
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/vantia/chat/history?moduleId=${pathname}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages([greeting()]);
      setRetryText("");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Panel de chat — se mantiene montado tras abrirse la primera vez, para
          poder animar también el cierre en vez de desaparecer de golpe */}
      {everOpened && (
        <div
          className={`w-[360px] bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden border border-slate-200/60 origin-bottom-right transition-all duration-200 ease-out ${
            open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-3 pointer-events-none"
          }`}
          style={{ height: "580px" }}
        >

          {/* Header */}
          <div className="bg-gradient-to-r from-red-700 to-red-600 px-5 py-4 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Bot size={18} className="text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-red-600 rounded-full" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">VantIA</h2>
                <p className="text-[11px] text-red-100 font-medium tracking-wide">{getVantIALabel(pathname)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="relative" ref={menuRef}>
                <button onClick={() => setShowMenu((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none">
                  <MoreVertical size={14} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-10 animate-fade-in">
                    <button
                      onClick={clearConversation}
                      disabled={clearing}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      {clearing ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} className="rotate-45" />}
                      Nueva conversación
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Mensajes */}
          <div
            className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 bg-[#f8fafc]"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}
          >
            <div className="flex justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100/80 px-3 py-1 rounded-full border border-slate-200/50">
                Hoy
              </span>
            </div>

            {messages.map((msg, i) => {
              const isError = msg.text.startsWith("❌");

              if (msg.role === "model" && isError) {
                return (
                  <div key={i} className="flex justify-center animate-fade-in">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3 shadow-sm max-w-[95%]">
                      <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-semibold text-red-800 leading-snug">Error al conectar con el motor de IA.</p>
                        <p className="text-[10px] text-red-600/80 leading-snug">{msg.text.replace(/^❌\s*/, "")}</p>
                        {retryText && (
                          <button
                            onClick={retryLast}
                            className="mt-1 w-max text-[10px] font-bold uppercase tracking-wider text-red-600 hover:text-red-800 bg-white border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-md shadow-sm transition-all focus:outline-none flex items-center gap-1.5"
                          >
                            <RefreshCw size={10} /> Reintentar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.role === "model") {
                const isRegenerating = regeneratingIdx === i;
                return (
                  <div key={i} className="flex items-start gap-3 group animate-fade-in">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <Bot size={13} />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0 pt-0.5">
                      <div className={`text-slate-700 text-[13px] leading-relaxed break-words transition-opacity ${isRegenerating ? "opacity-40" : ""}`}>
                        {renderMarkdownLite(msg.text)}
                      </div>
                      <div className={`flex items-center gap-3.5 transition-opacity duration-200 ${isRegenerating ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        <button
                          onClick={() => regenerate(i)}
                          disabled={isRegenerating || loading}
                          className="text-slate-400 hover:text-slate-700 transition-colors focus:outline-none disabled:opacity-60"
                          title="Regenerar respuesta"
                        >
                          <RotateCcw size={11} className={isRegenerating ? "animate-spin" : ""} />
                        </button>
                        <button onClick={() => copyMessage(i, msg.text)} className="text-slate-400 hover:text-slate-700 transition-colors focus:outline-none" title="Copiar">
                          {copiedIdx === i ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className="flex flex-col items-end gap-1.5 max-w-[85%] self-end group animate-fade-in">
                  <div className="bg-red-600 text-white px-4 py-2.5 rounded-[20px] shadow-md shadow-red-500/20 text-[13px] font-medium whitespace-pre-wrap break-words">
                    {msg.text}
                  </div>
                  <div className="flex items-center gap-3.5 mr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onClick={() => copyMessage(i, msg.text)} className="text-slate-400 hover:text-slate-700 transition-colors focus:outline-none" title="Copiar">
                      {copiedIdx === i ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-start gap-3 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Bot size={13} />
                </div>
                <div className="flex items-center pt-2.5">
                  <Loader2 size={16} className="text-red-400 animate-spin" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Footer / Input */}
          <div className="bg-white px-4 py-4 border-t border-slate-200/80 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
            <div className="flex items-end gap-3">
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl transition-all duration-150 focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-100 focus-within:bg-white shadow-sm">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Escribe tu consulta..."
                  className="w-full bg-transparent text-[13px] text-slate-800 placeholder-slate-400 px-4 py-3 focus:outline-none resize-none overflow-hidden"
                  style={{ minHeight: "44px", maxHeight: "100px" }}
                />
              </div>
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-500/20 transition-all mb-0.5 active:scale-95 focus:outline-none"
              >
                <Send size={13} className="-translate-x-[1px] translate-y-[1px]" />
              </button>
            </div>
            <p className="text-center text-[9px] text-slate-400 font-medium mt-3">
              La IA puede cometer errores. Verifica la información.
            </p>
          </div>
        </div>
      )}

      {/* Botón flotante VantIA */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${
          open
            ? "bg-neutral-800 shadow-neutral-900/30 rotate-90"
            : "bg-red-600 shadow-red-700/30 hover:shadow-red-700/50 hover:scale-105"
        }`}
        title="VantIA — Asistente IA"
      >
        {!open && <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping [animation-duration:2.5s]" />}
        <span className={`relative transition-transform duration-200 ${open ? "-rotate-90" : ""}`}>
          {open ? <X size={18} className="text-white" /> : <Bot size={22} className="text-white" />}
        </span>
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

// ── Links de interés (por usuario) ────────────────────────────────────────────
interface QuickLink { id: string; label: string; url: string; sort_order: number; created_at: string; }

function QuickLinksPanel({ getToken, onClose }: { getToken: () => Promise<string | null | undefined>; onClose: () => void }) {
  const [links, setLinks]         = useState<QuickLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel]         = useState("");
  const [url, setUrl]             = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/quick-links", { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) setLinks(d.data || []);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setShowForm(false); setEditingId(null); setLabel(""); setUrl(""); setError(""); };
  const openNewForm = () => { setEditingId(null); setLabel(""); setUrl(""); setError(""); setShowForm(true); };
  const startEdit = (l: QuickLink) => { setEditingId(l.id); setLabel(l.label); setUrl(l.url); setError(""); setShowForm(true); };

  const handleSave = async () => {
    if (!label.trim() || !url.trim()) { setError("Nombre y URL son obligatorios"); return; }
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(editingId ? `/api/quick-links/${editingId}` : "/api/quick-links", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: label.trim(), url: url.trim() }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo guardar el enlace");
      resetForm();
      load();
    } catch (e: any) {
      setError(e.message || "No se pudo guardar el enlace");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const token = await getToken();
      await fetch(`/api/quick-links/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setLinks(prev => prev.filter(l => l.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="absolute right-0 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm">Links de interés</h3>
        <div className="flex items-center gap-1">
          <button onClick={showForm ? resetForm : openNewForm} className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors" title="Añadir enlace">
            <Plus size={14} className={`transition-transform ${showForm ? "rotate-45" : ""}`} />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={14} /></button>
        </div>
      </div>

      {showForm && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Nombre (ej. Portal LexNET)"
            autoFocus
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="URL (ej. lexnet.justicia.es)"
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-1.5 pt-0.5">
            <button onClick={resetForm} className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-60">
              {saving && <Loader2 size={10} className="animate-spin" />} {editingId ? "Guardar" : "Añadir"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Spinner size="sm" muted /></div>
        ) : links.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs px-6">
            Aún no tienes enlaces guardados. Pulsa <Plus size={10} className="inline" /> para añadir uno.
          </div>
        ) : links.map(l => (
          <div key={l.id} className="group flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2.5">
              <Link2 size={13} className="text-slate-300 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 truncate group-hover:text-red-700">{l.label}</span>
            </a>
            <button onClick={() => startEdit(l)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-600 p-1 transition-opacity shrink-0" title="Editar">
              <Pen size={11} />
            </button>
            <button onClick={() => handleDelete(l.id)} disabled={deletingId === l.id} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-600 p-1 transition-opacity shrink-0" title="Eliminar">
              {deletingId === l.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Search Dropdown ──────────────────────────────────────────────────────────
function SearchDropdown({ query, onSelect }: { query: string; onSelect: () => void }) {
  const navigate  = useNavigate();
  const { user }  = useUser();
  const isAdmin   = (user?.publicMetadata as any)?.role === "admin";
  const filtered  = MODULES
    .filter((m) => isAdmin || !m.path.startsWith("/dashboard/facturacion"))
    .filter(
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

// Compara la ruta actual (pathname + query) contra un href de nav que puede
// llevar su propio query string (p.ej. "/dashboard/facturacion?tab=gastos"),
// para que cada sub-opción con el mismo pathname pero distinto tab se
// resalte solo cuando corresponde exactamente.
function hrefMatches(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefQuery = ""] = href.split("?");
  if (pathname !== hrefPath && !pathname.startsWith(hrefPath + "/")) return false;
  const currentQuery = search.startsWith("?") ? search.slice(1) : search;
  return currentQuery === hrefQuery;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function SidebarContent({ pathname, search, onClose, onSignOut, collapsed, onToggleCollapse }: {
  pathname: string;
  search?: string;
  onClose?: () => void;
  onSignOut?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { user } = useUser();
  const { totalUnread } = useChatUnread();
  const { unreadCount: emailUnreadCount } = useEmailUnread();
  const { unreadCount: waUnreadCount } = useWhatsAppUnread();
  const { isProcessing: isDocProcessing } = useDocumentProcessing();
  const currentSearch = search || "";
  // Tesorería (facturación/Quipu) es solo para administradores -- se oculta
  // del sidebar para el resto (el backend ya lo bloquea aparte, esto es solo UI).
  const isAdmin = (user?.publicMetadata as any)?.role === "admin";

  const isGroupActive = useCallback((item: NavItem) =>
    !!item.children?.some((c) => hrefMatches(pathname, currentSearch, c.href)),
  [pathname, currentSearch]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    NAV_ITEMS.forEach((item) => { if (isGroupActive(item)) initial.add(item.name); });
    return initial;
  });
  useEffect(() => {
    NAV_ITEMS.forEach((item) => {
      if (isGroupActive(item)) setOpenGroups((prev) => (prev.has(item.name) ? prev : new Set(prev).add(item.name)));
    });
  }, [pathname, isGroupActive]);
  const toggleGroup = (name: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  return (
    <div className="erp-sidebar flex flex-col h-full bg-slate-900 border-r border-slate-800 overflow-hidden">

      {/* Logo / selector empresa */}
      <div className={`erp-sidebar-logo-border border-b border-slate-800 shrink-0 transition-all duration-300 ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <div className="erp-company-icon w-10 h-10 rounded-xl border border-slate-700/60 bg-slate-800/50 flex items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors">
              <img src="/vantia-sidebar-slate.png" alt="Vantia Legis" className="h-6 w-6 object-contain" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            title="Seleccionar empresa"
            className="erp-company-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-700/50 hover:border-slate-600 transition-all duration-200 group"
          >
            <div className="erp-company-logo w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0 overflow-hidden">
              <img src="/vantia-sidebar-slate.png" alt="Vantia Legis" className="h-7 w-7 object-contain" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="erp-company-name text-[11px] font-bold text-slate-200 truncate leading-tight">Avalentia Abogados</p>
              <p className="erp-company-sub text-[10px] text-slate-500 truncate mt-0.5">Despacho principal</p>
            </div>
            <ChevronsUpDown size={13} className="erp-company-chevron text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`modules-scrollbar flex-1 overflow-y-auto transition-all duration-300 ${collapsed ? "px-2 pt-2" : "px-4"}`}>
        {NAV_GROUPS.map((group) => {
          const items = group.items
            .map((name) => NAV_ITEMS.find((item) => item.name === name))
            .filter((item): item is (typeof NAV_ITEMS)[number] => !!item)
            .filter((item) => item.name !== "Tesorería" || isAdmin);
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="erp-sidebar-group-label px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="erp-sidebar-divider h-px bg-slate-800 mb-2 mx-1" />}
              <div className="space-y-1">
                {items.map((item) => {
                  if (item.children) {
                    const childActive = isGroupActive(item);
                    const GroupIcon = item.icon;

                    if (collapsed) {
                      return (
                        <Link key={item.name} to={item.children[0].href} onClick={onClose} title={item.name}
                          className={`relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors border-l-4 ${
                            childActive ? "erp-sidebar-nav-active bg-red-500/10 text-white border-red-500"
                                     : "erp-sidebar-nav-inactive text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
                          }`}>
                          <GroupIcon className={`h-5 w-5 ${childActive ? "text-red-400" : "text-slate-500"}`} />
                        </Link>
                      );
                    }

                    // Si hay una sub-opción activa (estás dentro de ese grupo), se queda
                    // desplegado aunque el ratón se vaya, para no perder el sitio al navegar.
                    const isOpen = openGroups.has(item.name) || childActive;
                    return (
                      <div
                        key={item.name}
                        onMouseEnter={() => setOpenGroups((prev) => (prev.has(item.name) ? prev : new Set(prev).add(item.name)))}
                        onMouseLeave={() => setOpenGroups((prev) => {
                          if (!prev.has(item.name)) return prev;
                          const next = new Set(prev);
                          next.delete(item.name);
                          return next;
                        })}
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(item.name)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-4 ${
                            childActive ? "erp-sidebar-nav-active bg-red-500/10 text-white border-red-500"
                                     : "erp-sidebar-nav-inactive text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
                          }`}
                        >
                          <GroupIcon className={`h-4 w-4 shrink-0 ${childActive ? "text-red-400" : "text-slate-500"}`} />
                          <span className="flex-1 truncate text-left">{item.name}</span>
                          <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${childActive ? "text-red-400" : "text-slate-500"}`} />
                        </button>
                        <div
                          className={`grid transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                        >
                          <div className="overflow-hidden">
                            <div className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-1 pb-0.5">
                              {item.children.map((child) => {
                                const isChildActive = hrefMatches(pathname, currentSearch, child.href);
                                const ChildIcon = child.icon;
                                return (
                                  <Link key={child.name} to={child.href} onClick={onClose}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                      isChildActive ? "bg-red-500/10 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                                    }`}
                                  >
                                    <ChildIcon className={`h-3.5 w-3.5 shrink-0 ${isChildActive ? "text-red-400" : "text-slate-500"}`} />
                                    <span className="flex-1 truncate">{child.name}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const href = item.href!;
                  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + '/'));
                  const Icon = item.icon;
                  const isChat        = href === "/dashboard/chat";
                  const isEmail       = href === "/dashboard/correo";
                  const isWA          = href === "/dashboard/whatsapp";
                  const isExpedientes = href === "/dashboard/expedientes";
                  const chatBadge  = isChat  && !isActive && totalUnread > 0;
                  const emailBadge = isEmail && !isActive && emailUnreadCount > 0;
                  const waBadge    = isWA    && !isActive && waUnreadCount > 0;
                  const badgeCount = chatBadge ? totalUnread : emailBadge ? emailUnreadCount : waUnreadCount;
                  const hasBadge   = chatBadge || emailBadge || waBadge;
                  // Expedientes: mientras se procesa un ZIP de documentos (cédula ->
                  // expediente) en segundo plano, el icono muestra un spinner para que
                  // quede claro que hay algo trabajando, se esté viendo esa pantalla o no.
                  const showProcessingSpinner = isExpedientes && isDocProcessing;

                  if (collapsed) {
                    return (
                      <Link key={item.name} to={href} onClick={onClose} title={showProcessingSpinner ? `${item.name} — procesando documentos…` : item.name}
                        className={`relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors border-l-4 ${
                          isActive ? "erp-sidebar-nav-active bg-red-500/10 text-white border-red-500"
                                   : "erp-sidebar-nav-inactive text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
                        }`}>
                        <Icon className={`erp-sidebar-icon-${isActive ? "active" : "inactive"} h-5 w-5 ${isActive ? "text-red-400" : "text-slate-500"}`} />
                        {showProcessingSpinner && (
                          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-900 ring-1 ring-slate-900">
                            <Loader2 size={10} className="text-red-400 animate-spin" />
                          </span>
                        )}
                        {!showProcessingSpinner && hasBadge && (
                          <span className="erp-sidebar-badge-dot absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full ring-1 ring-slate-900" />
                        )}
                      </Link>
                    );
                  }

                  return (
                    <Link key={item.name} to={href} onClick={onClose}
                      title={showProcessingSpinner ? "Procesando documentos en segundo plano…" : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-4 ${
                        isActive ? "erp-sidebar-nav-active bg-red-500/10 text-white border-red-500"
                                 : "erp-sidebar-nav-inactive text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
                      }`}>
                      <span className="relative shrink-0 flex items-center justify-center h-4 w-4">
                        <Icon className={`erp-sidebar-icon-${isActive ? "active" : "inactive"} h-4 w-4 ${isActive ? "text-red-400" : "text-slate-500"} ${showProcessingSpinner ? "opacity-0" : ""}`} />
                        {showProcessingSpinner && (
                          <Loader2 size={14} className="absolute inset-0 m-auto text-red-400 animate-spin" />
                        )}
                      </span>
                      <span className="flex-1 truncate">{item.name}</span>
                      {showProcessingSpinner && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-red-400/80 shrink-0">Procesando</span>
                      )}
                      {!showProcessingSpinner && hasBadge && (
                        <span className="erp-sidebar-badge ml-auto min-w-[20px] h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
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
          className={`erp-sidebar-collapse flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors ${
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
              pathname === "/dashboard/config" ? "erp-sidebar-nav-active bg-red-500/10 text-white border-red-500" : "erp-sidebar-nav-inactive text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
            }`}>
            <Settings className="erp-sidebar-icon-inactive h-5 w-5 text-slate-500" />
          </Link>
        ) : (
          <Link to="/dashboard/config" onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-4 ${
              pathname === "/dashboard/config" ? "erp-sidebar-nav-active bg-red-500/10 text-white border-red-500" : "erp-sidebar-nav-inactive text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent"
            }`}>
            <Settings className="erp-sidebar-icon-inactive h-4 w-4 shrink-0 text-slate-500" /> Configuración
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
          <div className="erp-sidebar-user flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
            <UserButton afterSignOutUrl="/" />
            <div className="flex-1 min-w-0">
              <p className="erp-sidebar-username text-sm font-bold text-slate-200 truncate leading-tight">{user?.fullName || user?.firstName || "Usuario"}</p>
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
  const [isLinksOpen,     setIsLinksOpen]     = useState(false);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [notifications,   setNotifications]   = useState<UnifiedNotification[]>([]);
  const [notifLoading,    setNotifLoading]    = useState(false);
  const [latestChatToast, setLatestChatToast] = useState<{ title: string; meta?: string; onClick?: () => void } | null>(null);

  const searchRef          = useRef<HTMLDivElement>(null);
  const notifRef           = useRef<HTMLDivElement>(null);
  const linksRef           = useRef<HTMLDivElement>(null);
  const loginFiredRef      = useRef<string | null>(null);
  const notifBusyRef       = useRef(false);
  const prevChatUnreadRef  = useRef(-1);
  const activeUserIdRef    = useRef<string | null>(null);

  const getModuleBase = (p: string) => {
    const parts = p.split('/').filter(Boolean);
    return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : p;
  };

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
      if (linksRef.current && !linksRef.current.contains(e.target as Node)) setIsLinksOpen(false);
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

  const isFullPage = useMemo(() => (
    [
      '/dashboard/correo',
      '/dashboard/clientes',
      '/dashboard/expedientes',
      '/dashboard/procuradores',
      '/dashboard/abogados',
      '/dashboard/trazabilidad',
      '/dashboard/agenda',
      '/dashboard/chat',
      '/dashboard/chat-ia',
      '/dashboard/whatsapp',
      '/dashboard/config',
    ].includes(location.pathname) ||
    location.pathname.startsWith('/dashboard/facturacion') ||
    location.pathname.startsWith('/dashboard/expedientes/') ||
    location.pathname.startsWith('/dashboard/clientes/') ||
    location.pathname.startsWith('/dashboard/procuradores/') ||
    location.pathname.startsWith('/dashboard/abogados/')
  ), [location.pathname]);

  return (
    <SidebarContext.Provider value={{ isCollapsed }}>
    <div className="erp-shell flex h-screen overflow-hidden font-sans antialiased text-neutral-900">

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

      {/* VantIA flotante — oculto en módulos con su propio chat o con controles fijos en la esquina inferior (Correo: barra de "Responder a...") */}
      {!location.pathname.startsWith('/dashboard/chat') && !location.pathname.startsWith('/dashboard/correo') && (
        <VantIAWidget pathname={location.pathname} getToken={getToken} />
      )}

      {/* Sidebar Desktop */}
      <aside className={`hidden md:flex flex-col fixed inset-y-0 z-30 transition-all duration-300 ${isCollapsed ? "w-16" : "w-64"}`}>
        <SidebarContent pathname={location.pathname} search={location.search} onSignOut={handleSignOut} collapsed={isCollapsed} onToggleCollapse={toggleSidebar} />
      </aside>

      {/* Menú Móvil */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/80" onClick={() => setIsMobileOpen(false)} />
          <div className="relative w-64 h-full shadow-2xl">
            <button onClick={() => setIsMobileOpen(false)} className="absolute right-4 top-6 text-slate-400 hover:text-white z-10">
              <X className="h-6 w-6" />
            </button>
            <SidebarContent pathname={location.pathname} search={location.search} onClose={() => setIsMobileOpen(false)} onSignOut={handleSignOut} />
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

          {/* Links de interés (por usuario) */}
          <div ref={linksRef} className="relative shrink-0">
            <button
              onClick={() => setIsLinksOpen(v => !v)}
              className="relative p-2.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              title="Links de interés"
            >
              <Link2 className="h-5 w-5" />
            </button>
            {isLinksOpen && (
              <QuickLinksPanel getToken={getToken} onClose={() => setIsLinksOpen(false)} />
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
        <div id="dashboard-content" className={`relative z-10 flex-1 min-h-0 erp-content-glow-bg ${isFullPage ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div
            key={getModuleBase(location.pathname)}
            className={
              isFullPage ? 'h-full min-h-0 w-full module-page'
              : location.pathname === '/dashboard/tareas' ? 'w-full p-4 md:p-8 module-page'
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
