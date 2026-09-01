import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Plus, Trash2, Copy, RotateCcw, ThumbsUp, ThumbsDown,
  Paperclip, Link2, Send, MessageSquare, Sparkles, MoreHorizontal, Loader2,
  Check, X, Search, StopCircle, Download, FileText, ChevronDown,
} from 'lucide-react';
import { resolveApiUrl } from '../lib/api';

// ─── Keyframe styles ──────────────────────────────────────────────────────────

const STYLES = `
  @keyframes cia-slideLeft  { from { opacity:0; transform:translateX(-18px) } to { opacity:1; transform:none } }
  @keyframes cia-slideRight { from { opacity:0; transform:translateX(18px)  } to { opacity:1; transform:none } }
  @keyframes cia-fadeUp     { from { opacity:0; transform:translateY(14px)  } to { opacity:1; transform:none } }
  @keyframes cia-scaleIn    { from { opacity:0; transform:scale(0.82)       } to { opacity:1; transform:scale(1) } }
  @keyframes cia-spin       { to { transform:rotate(360deg) } }
  @keyframes cia-shimmer    { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
  @keyframes cia-wave       { 0%,60%,100%{transform:translateY(0);opacity:.35} 30%{transform:translateY(-7px);opacity:1} }
  @keyframes cia-ring       { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.4);opacity:0} }
  @keyframes cia-fadeIn     { from{opacity:0} to{opacity:1} }
  @keyframes cia-loadbar    { 0%{width:8%} 40%{width:55%} 70%{width:78%} 100%{width:92%} }

  .cia-msg-ai   { animation: cia-slideLeft  .3s cubic-bezier(.25,.46,.45,.94) both }
  .cia-msg-user { animation: cia-slideRight .3s cubic-bezier(.25,.46,.45,.94) both }
  .cia-fade-up  { animation: cia-fadeUp     .4s cubic-bezier(.25,.46,.45,.94) both }
  .cia-scale-in { animation: cia-scaleIn    .5s cubic-bezier(.34,1.56,.64,1)  both }
  .cia-fade-in  { animation: cia-fadeIn     .5s ease both }
  .cia-spin     { animation: cia-spin 1.5s linear infinite }
  .cia-shimmer  {
    background: linear-gradient(90deg,#e2e8f0 25%,#f8fafc 50%,#e2e8f0 75%);
    background-size: 1200px 100%;
    animation: cia-shimmer 1.6s ease-in-out infinite;
  }
  .cia-wave-dot { animation: cia-wave 1.3s infinite }
  .cia-loadbar  { animation: cia-loadbar 4s ease-out forwards }
  .cia-ring::after {
    content:'';position:absolute;inset:0;border-radius:50%;
    background:#22c55e;animation:cia-ring 1.8s ease-out infinite;
  }
  .cia-conv { animation: cia-fadeUp .32s cubic-bezier(.25,.46,.45,.94) both }
  .cia-prompt-card { animation: cia-fadeUp .5s cubic-bezier(.25,.46,.45,.94) both }
  .cia-topbar { animation: cia-fadeIn .4s ease both }
  .cia-input-bar { animation: cia-fadeUp .4s .15s cubic-bezier(.25,.46,.45,.94) both }
  .cia-sidebar { animation: cia-slideLeft .4s cubic-bezier(.25,.46,.45,.94) both }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  module_id: string;
  title: string | null;
  first_message: string | null;
  updated_at: string;
}

interface ToolEvent {
  name: string;
  label: string;
  done: boolean;
}

interface LinkedExpedienteRef {
  id: string;
  ref: string;
  descripcion?: string | null;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  ts: Date;
  toolEvents?: ToolEvent[];       // solo mensajes de Vantia en curso/recién generados
  attachmentName?: string;        // solo mensajes de usuario con archivo adjunto
  linkedExpediente?: LinkedExpedienteRef; // solo mensajes de usuario con expediente vinculado
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function inline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-semibold text-slate-900">{p.slice(2,-2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1,-1)}</em>;
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="bg-slate-100 text-red-600 px-1 py-0.5 rounded text-[.82em] font-mono">{p.slice(1,-1)}</code>;
    return p;
  });
}

function renderMd(text: string): React.ReactNode {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      out.push(<pre key={i} className="bg-slate-900 text-slate-100 rounded-xl p-4 my-3 overflow-x-auto text-sm font-mono leading-relaxed"><code>{code.join('\n')}</code></pre>);
      i++; continue;
    }
    if (l.startsWith('### ')) { out.push(<h3 key={i} className="text-sm font-semibold text-slate-800 mt-3.5 mb-1">{inline(l.slice(4))}</h3>); i++; continue; }
    if (l.startsWith('## '))  { out.push(<h2 key={i} className="text-base font-semibold text-slate-800 mt-4 mb-1.5">{inline(l.slice(3))}</h2>); i++; continue; }
    if (l.startsWith('# '))   { out.push(<h1 key={i} className="text-lg font-bold text-slate-900 mt-4 mb-2">{inline(l.slice(2))}</h1>); i++; continue; }
    if (/^[-*•]\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s/,'')); i++; }
      out.push(<ul key={i} className="my-2 space-y-1">{items.map((it,j) => <li key={j} className="flex gap-2 text-slate-700 leading-relaxed"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"/><span>{inline(it)}</span></li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/,'')); i++; }
      out.push(<ol key={i} className="my-2 space-y-1">{items.map((it,j) => <li key={j} className="flex gap-2 text-slate-700 leading-relaxed"><span className="shrink-0 text-red-500 font-semibold text-sm">{j+1}.</span><span>{inline(it)}</span></li>)}</ol>);
      continue;
    }
    if (l.startsWith('> ')) {
      out.push(<blockquote key={i} className="border-l-4 border-red-300 pl-4 py-1.5 my-2 text-slate-600 italic bg-red-50/60 rounded-r-lg">{inline(l.slice(2))}</blockquote>);
      i++; continue;
    }
    if (/^[-*_]{3,}$/.test(l.trim())) { out.push(<hr key={i} className="border-slate-200 my-4"/>); i++; continue; }
    if (l.trim()==='') { i++; continue; }
    out.push(<p key={i} className="text-slate-700 leading-relaxed mb-0.5">{inline(l)}</p>);
    i++;
  }
  return <>{out}</>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Traduce mensajes de error técnicos (los que llegan tal cual del fetch/red,
// como "Failed to fetch") a algo que un usuario sin conocimientos técnicos
// entienda. Los que ya vienen del backend (p.ej. "Vantia no está
// configurada...") se dejan tal cual porque ya son claros.
function friendlyVantiaError(raw?: string): string {
  const msg = (raw || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed')) {
    return 'No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'El servidor está tardando demasiado en responder. Inténtalo de nuevo en unos segundos.';
  }
  return raw?.trim() || 'No se pudo obtener respuesta.';
}

function groupByDate(convs: Conversation[]) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yest  = new Date(today.getTime()-86400000);
  const week  = new Date(today.getTime()-7*86400000);
  const g = (label: string, items: Conversation[]) => items.length ? [{label,items}] : [];
  return [
    ...g('Hoy',            convs.filter(c=>new Date(c.updated_at)>=today)),
    ...g('Ayer',           convs.filter(c=>new Date(c.updated_at)>=yest  && new Date(c.updated_at)<today)),
    ...g('Últimos 7 días', convs.filter(c=>new Date(c.updated_at)>=week  && new Date(c.updated_at)<yest)),
    ...g('Anteriores',     convs.filter(c=>new Date(c.updated_at)<week)),
  ];
}

const convTitle = (c: Conversation) =>
  c.title || c.first_message?.slice(0,60) || 'Nueva conversación';

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function ShimmerLine({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded-lg cia-shimmer`} />;
}

// ─── Puntos de "escribiendo…" (se usan mientras el streaming aún no ha
// entregado el primer fragmento de texto) ──────────────────────────────────
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-red-300 cia-wave-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// ─── Aviso en vivo de que Vantia está usando una herramienta (consultando
// datos reales del despacho) — pasa de "en curso" a "hecho" según llegan los
// eventos tool_start/tool_end del streaming ─────────────────────────────────
function ToolPill({ label, done }: { label: string; done: boolean }) {
  return (
    <div
      className={`cia-fade-up inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 w-fit transition-colors duration-300 ${
        done ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
      }`}
    >
      {done ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 cia-spin" />}
      {label}
    </div>
  );
}

// ─── Suggestion prompts ───────────────────────────────────────────────────────

const PROMPTS = [
  { icon: '📋', label: 'Expediente reciente',   text: 'Resume el expediente más reciente del despacho' },
  { icon: '✍️', label: 'Redactar contrato',     text: 'Redacta un contrato de arrendamiento de vivienda' },
  { icon: '📊', label: 'Estadísticas',           text: 'Muéstrame las estadísticas actuales del despacho' },
  { icon: '⚖️', label: 'Proceso monitorio',     text: 'Explícame paso a paso el proceso monitorio' },
  { icon: '📝', label: 'Escrito de demanda',    text: 'Ayúdame a redactar un escrito de demanda ordinaria' },
  { icon: '🔍', label: 'Jurisprudencia',        text: 'Busca jurisprudencia del TS sobre cláusulas abusivas' },
];

// ─── Modelos ──────────────────────────────────────────────────────────────────
// Solo las variantes de Gemini están conectadas de verdad (misma API, mismo
// backend, solo cambia el id del modelo). ChatGPT, Claude y Vincent AI (el
// asistente de vLex) se muestran como opciones del selector a petición del
// usuario, pero sin backend detrás todavía -- hace falta su API key
// correspondiente antes de poder activarlas.
const MODEL_STORAGE_KEY = 'vantia_model_v1';

interface AiModelOption {
  id: string;
  label: string;
  provider: string;
  desc: string;
  available: boolean;
}

const AI_MODELS: AiModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google',    desc: 'Rápido, el que usa Vantia hoy',                   available: true },
  // gemini-2.5-pro ya no existe (Google lo retiró) y su sustituto,
  // gemini-3.1-pro-preview, necesita un plan de pago -- con la cuenta
  // gratuita actual da error 429 (cuota 0), comprobado a mano contra la API.
  { id: 'gemini-2.5-pro',   label: 'Gemini Pro',       provider: 'Google',    desc: 'Necesita plan de pago de Google', available: false },
  { id: 'chatgpt',          label: 'ChatGPT',          provider: 'OpenAI',    desc: 'Próximamente',                   available: false },
  { id: 'claude',           label: 'Claude',           provider: 'Anthropic', desc: 'Próximamente',                   available: false },
  { id: 'vincent',          label: 'Vincent AI',       provider: 'vLex',      desc: 'Próximamente',                   available: false },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ChatIA() {
  const { getToken } = useAuth();
  const { user }     = useUser();

  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeId,       setActiveId]       = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState('');
  const [sending,        setSending]        = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedIdx,      setCopiedIdx]      = useState<number | null>(null);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [feedback,       setFeedback]       = useState<Record<number, 'up' | 'down'>>({});

  // Adjuntar archivo de texto a la conversación
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [attachError,  setAttachError]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vincular un expediente a la conversación (le da a Vantia su contexto real)
  const [linkedExpediente, setLinkedExpediente] = useState<LinkedExpedienteRef | null>(null);
  const [showLinkPicker,   setShowLinkPicker]   = useState(false);
  const [linkQuery,        setLinkQuery]        = useState('');
  const [linkResults,      setLinkResults]      = useState<LinkedExpedienteRef[]>([]);
  const [linkSearching,    setLinkSearching]    = useState(false);
  const linkPickerRef = useRef<HTMLDivElement>(null);

  // Menú "···" del topbar
  const [showTopMenu, setShowTopMenu] = useState(false);
  const topMenuRef = useRef<HTMLDivElement>(null);

  // Selector de modelo/agente de IA
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    return AI_MODELS.some(m => m.id === saved && m.available) ? saved! : AI_MODELS[0].id;
  });
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const activeModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];

  useEffect(() => {
    if (!showModelPicker) return;
    const onClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showModelPicker]);

  const chooseModel = (id: string) => {
    const opt = AI_MODELS.find(m => m.id === id);
    if (!opt || !opt.available) return;
    setSelectedModel(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
    setShowModelPicker(false);
  };

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  // ── Streaming real ──────────────────────────────────────────────────────────
  // Consume el SSE de /api/vantia/chat/stream y va actualizando en vivo el
  // mensaje en `targetIdx`: texto según llega token a token, y una pill por
  // cada herramienta que Vantia use mientras consulta datos reales.
  const streamChat = async (
    text: string,
    historyToSend: { role: string; text: string }[],
    moduleId: string,
    targetIdx: number,
    expedienteId?: string,
  ): Promise<string> => {
    const token = await getToken();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    const res = await fetch(resolveApiUrl('/api/vantia/chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, history: historyToSend, moduleId, linkedExpedienteId: expedienteId, model: selectedModel }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // Revelado suave: Gemini no manda el texto letra a letra, sino en trozos de
    // tamaño variable (a veces frases enteras de golpe), lo que se veía como
    // saltos bruscos en vez de una máquina de escribir. El texto que llega se
    // guarda en un buffer (`pending`) y un intervalo aparte lo va soltando
    // poco a poco, desacoplando "cuándo llega del servidor" de "cuándo se ve
    // en pantalla" -- mismo ritmo que usaba el antiguo efecto simulado.
    let pending = '';
    let networkDone = false;
    let revealTimer: ReturnType<typeof setInterval> | null = null;
    let resolveReveal: () => void = () => {};
    const revealFinished = new Promise<void>(resolve => { resolveReveal = resolve; });
    revealTimer = setInterval(() => {
      if (pending.length > 0) {
        const take = pending.slice(0, 3);
        pending = pending.slice(3);
        setMessages(prev => prev.map((m, i) => (i === targetIdx ? { ...m, text: m.text + take } : m)));
      } else if (networkDone) {
        resolveReveal();
      }
    }, 18);

    try {
      const reader  = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let finalReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = rawEvent.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          const jsonStr = dataLine.slice(5).trim();
          if (!jsonStr) continue;
          let evt: any;
          try { evt = JSON.parse(jsonStr); } catch { continue; }

          if (evt.type === 'text') {
            pending += evt.delta;
          } else if (evt.type === 'tool_start') {
            setMessages(prev => prev.map((m, i) => (i === targetIdx
              ? { ...m, toolEvents: [...(m.toolEvents || []), { name: evt.name, label: evt.label, done: false }] }
              : m)));
          } else if (evt.type === 'tool_end') {
            setMessages(prev => prev.map((m, i) => (i === targetIdx
              ? { ...m, toolEvents: (m.toolEvents || []).map(te => (te.name === evt.name && !te.done ? { ...te, done: true } : te)) }
              : m)));
          } else if (evt.type === 'done') {
            finalReply = evt.reply;
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'Error al generar la respuesta.');
          }
        }
      }
      networkDone = true;
      await revealFinished; // espera a que el buffer termine de soltarse en pantalla
      return finalReply;
    } finally {
      if (revealTimer) clearInterval(revealTimer);
    }
  };

  // ── Load conversations ──────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const token = await getToken();
      const res   = await fetch(resolveApiUrl('/api/vantia/conversations'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data  = await res.json();
      if (data.success) setConversations(data.conversations);
    } catch { /**/ } finally {
      setInitialLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  useEffect(() => {
    // "auto" en vez de "smooth": con la revelación tipo máquina de escribir
    // el contenido crece varias veces por segundo y un scroll suave repetido
    // se nota a tirones.
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, sending]);

  // ── Auto-resize textarea ────────────────────────────────────────────────────

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 152) + 'px';
  };
  useEffect(() => { if (textareaRef.current) autoResize(textareaRef.current); }, [input]);

  // ── Open conversation ───────────────────────────────────────────────────────

  const openConversation = async (conv: Conversation) => {
    if (activeModuleId === conv.module_id) return;
    setActiveModuleId(conv.module_id);
    setActiveId(conv.id);
    setMessages([]);
    setFeedback({});
    setLinkedExpediente(null);
    setAttachedFile(null);
    setHistoryLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(
        resolveApiUrl(`/api/vantia/chat/history?moduleId=${encodeURIComponent(conv.module_id)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data  = await res.json();
      if (data.success) {
        setMessages((data.history as {role:string;text:string}[]).map(h => ({
          role: h.role as 'user'|'model', text: h.text, ts: new Date(),
        })));
      }
    } catch { /**/ } finally { setHistoryLoading(false); }
  };

  // ── New conversation ────────────────────────────────────────────────────────

  const newConversation = (prefillText?: string) => {
    const moduleId = `chat-ia:${crypto.randomUUID()}`;
    setActiveModuleId(moduleId);
    setActiveId(null);
    setMessages([]);
    setFeedback({});
    setLinkedExpediente(null);
    setAttachedFile(null);
    if (prefillText) setInput(prefillText);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── Delete conversation ─────────────────────────────────────────────────────

  const handleDelete = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(conv.id);
    try {
      const token = await getToken();
      await fetch(resolveApiUrl(`/api/vantia/conversations/${conv.id}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (activeId === conv.id) { setActiveModuleId(null); setActiveId(null); setMessages([]); }
    } catch { /**/ } finally { setDeletingId(null); }
  };

  // ── Attach text file ────────────────────────────────────────────────────────

  const ATTACHMENT_ACCEPT = '.txt,.md,.markdown,.csv,.json,.log,.yml,.yaml';
  const MAX_ATTACHMENT_BYTES = 200_000; // de sobra para dar contexto de texto plano

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!file) return;
    setAttachError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError(`"${file.name}" pesa demasiado (máx. ${Math.round(MAX_ATTACHMENT_BYTES / 1000)} KB de texto).`);
      setTimeout(() => setAttachError(null), 4000);
      return;
    }
    try {
      const content = await file.text();
      setAttachedFile({ name: file.name, content });
    } catch {
      setAttachError(`No se pudo leer "${file.name}".`);
      setTimeout(() => setAttachError(null), 4000);
    }
  };

  // ── Link an expediente to the conversation ──────────────────────────────────

  useEffect(() => {
    if (!showLinkPicker) return;
    const h = (e: MouseEvent) => { if (linkPickerRef.current && !linkPickerRef.current.contains(e.target as Node)) setShowLinkPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showLinkPicker]);

  useEffect(() => {
    if (!showLinkPicker) return;
    const t = setTimeout(async () => {
      setLinkSearching(true);
      try {
        const token = await getToken();
        const q     = linkQuery.trim();
        const res   = await fetch(
          resolveApiUrl(`/api/expedientes?limit=8${q ? `&q=${encodeURIComponent(q)}` : ''}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data  = await res.json();
        setLinkResults((data.data || []).map((e: any) => ({
          id: e.id, ref: `${e.anio}/${e.num_exp}`, descripcion: e.descripcion,
        })));
      } catch { setLinkResults([]); } finally { setLinkSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [linkQuery, showLinkPicker, getToken]);

  const selectLinkedExpediente = (exp: LinkedExpedienteRef) => {
    setLinkedExpediente(exp);
    setShowLinkPicker(false);
    setLinkQuery('');
  };

  // ── Feedback (👍/👎) ─────────────────────────────────────────────────────────

  const rateMessage = async (idx: number, rating: 'up' | 'down') => {
    const next: 'up' | 'down' | null = feedback[idx] === rating ? null : rating;
    setFeedback(prev => {
      const copy = { ...prev };
      if (next) copy[idx] = next; else delete copy[idx];
      return copy;
    });
    try {
      const token = await getToken();
      await fetch(resolveApiUrl('/api/vantia/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ moduleId: activeModuleId, messageIndex: idx, rating: next, messageExcerpt: messages[idx]?.text.slice(0, 300) }),
      });
    } catch { /* mejor esfuerzo -- no bloquea la UI si falla */ }
  };

  // ── Topbar menu: export / delete current conversation ───────────────────────

  useEffect(() => {
    if (!showTopMenu) return;
    const h = (e: MouseEvent) => { if (topMenuRef.current && !topMenuRef.current.contains(e.target as Node)) setShowTopMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showTopMenu]);

  const exportConversation = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'Tú' : 'Vantia'}: ${m.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `vantia-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowTopMenu(false);
  };

  const deleteCurrentConversation = async () => {
    setShowTopMenu(false);
    if (!activeId) { setActiveModuleId(null); setMessages([]); return; }
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    await handleDelete(conv, { stopPropagation() {} } as React.MouseEvent);
  };

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && !attachedFile) || sending) return;

    let moduleId = activeModuleId;
    if (!moduleId) { moduleId = `chat-ia:${crypto.randomUUID()}`; setActiveModuleId(moduleId); }

    // Si el intento anterior falló y se escribe uno nuevo sin regenerar, se
    // quita esa tarjeta de error vieja en vez de dejarla ahí -- si no, cada
    // fallo apila otro mensaje de error debajo del anterior y la
    // conversación se vuelve confusa. Como mucho se ve un error a la vez.
    const lastMsg = messages[messages.length - 1];
    const cleanMessages = lastMsg?.role === 'model' && lastMsg.text.startsWith('⚠️ Error:')
      ? messages.slice(0, -2)
      : messages;

    const isNew         = cleanMessages.length === 0;
    const historyToSend = cleanMessages.map(m => ({ role: m.role, text: m.text }));

    // Lo que se manda a Vantia puede incluir el contenido del archivo adjunto;
    // el usuario en pantalla solo ve su texto + una chip con el nombre del fichero.
    const messageForApi = attachedFile
      ? `Archivo adjunto "${attachedFile.name}":\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${text || 'Analiza este archivo.'}`
      : text;

    const userMsg: Message = {
      role: 'user',
      text: text || `Archivo adjunto: ${attachedFile?.name}`,
      ts: new Date(),
      attachmentName: attachedFile?.name,
      linkedExpediente: linkedExpediente || undefined,
    };
    const newHistory: Message[] = [...cleanMessages, userMsg];
    const targetIdx = newHistory.length;

    setMessages([...newHistory, { role: 'model', text: '', ts: new Date(), toolEvents: [] }]);
    setInput('');
    setAttachedFile(null);
    setSending(true);

    try {
      const reply = await streamChat(messageForApi, historyToSend, moduleId, targetIdx, linkedExpediente?.id);
      setSending(false);
      if (reply) setMessages(prev => prev.map((m, i) => (i === targetIdx ? { ...m, text: reply } : m)));

      if (isNew) {
        const stub: Conversation = {
          id: '', module_id: moduleId!, title: text.slice(0,100) || attachedFile?.name || 'Nueva conversación',
          first_message: text, updated_at: new Date().toISOString(),
        };
        setConversations(prev => [stub, ...prev]);
        const refreshConversations = async () => {
          const tok = await getToken();
          const r   = await fetch(resolveApiUrl('/api/vantia/conversations'), { headers: { Authorization: `Bearer ${tok}` } });
          const d   = await r.json();
          if (d.success) {
            setConversations(d.conversations);
            const found = (d.conversations as Conversation[]).find(c => c.module_id === moduleId);
            if (found) setActiveId(found.id);
          }
        };
        // Primer refresco: recoge el id real de la conversación ya guardada.
        // Segundo refresco (más tarde): recoge el título-resumen generado por
        // IA, que se calcula aparte y tarda un poco más en estar listo.
        setTimeout(refreshConversations, 700);
        setTimeout(refreshConversations, 3500);
      } else {
        setConversations(prev => prev.map(c =>
          c.module_id === moduleId ? { ...c, updated_at: new Date().toISOString() } : c
        ));
      }
    } catch (err: any) {
      setSending(false);
      if (err?.name === 'AbortError') return; // detenido a mano: se deja el texto parcial tal cual
      setMessages(prev => prev.map((m, i) => (i === targetIdx
        ? { ...m, text: `⚠️ Error: ${friendlyVantiaError(err?.message)}`, toolEvents: [] }
        : m)));
    }
  };

  const abortStreaming = () => streamAbortRef.current?.abort();

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1600);
    });
  };

  const regenerate = async () => {
    if (messages.length < 2 || sending || !activeModuleId) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    const histWoLast = messages.slice(0,-2).map(m => ({role:m.role, text:m.text}));
    const base = messages.slice(0,-1);
    const targetIdx = base.length;
    setMessages([...base, { role: 'model', text: '', ts: new Date(), toolEvents: [] }]);
    setSending(true);
    try {
      const reply = await streamChat(lastUser.text, histWoLast, activeModuleId, targetIdx, lastUser.linkedExpediente?.id);
      setSending(false);
      if (reply) setMessages(prev => prev.map((m, i) => (i === targetIdx ? { ...m, text: reply } : m)));
    } catch (err: any) {
      setSending(false);
      if (err?.name === 'AbortError') return;
      setMessages(prev => prev.map((m, i) => (i === targetIdx
        ? { ...m, text: `⚠️ Error: ${friendlyVantiaError(err?.message)}`, toolEvents: [] }
        : m)));
    }
  };

  const userInitials = user?.firstName
    ? (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase()
    : (user?.emailAddresses?.[0]?.emailAddress?.[0] || 'U').toUpperCase();

  const groups = groupByDate(conversations);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{STYLES}</style>

      <div className="flex h-full bg-white overflow-hidden relative">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-slate-100 bg-slate-50 cia-sidebar">
          {/* Brand header */}
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shrink-0 shadow-md shadow-red-200">
                <Sparkles className="h-3.5 w-3.5 text-white" />
                {/* green online dot */}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-tight tracking-tight">Vantia</p>
                <p className="text-[10px] text-slate-400 leading-tight">Legal Pro · Gemini 2.5</p>
              </div>
            </div>

            <button
              onClick={() => newConversation()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 active:scale-[.97] text-white text-sm font-medium rounded-xl py-2.5 px-4 transition-all duration-150 shadow-sm shadow-red-200"
            >
              <Plus className="h-4 w-4" />
              Nuevo Chat
            </button>
          </div>

          <div className="h-px bg-slate-100 mx-4" />

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            {initialLoading ? (
              <div className="space-y-2 px-1">
                {[80,65,90,55,72].map((w,i) => (
                  <div key={i} className="flex flex-col gap-1.5 px-2 py-2.5 rounded-xl">
                    <ShimmerLine w={`w-[${w}%]`} h="h-3" />
                    <ShimmerLine w="w-16" h="h-2.5" />
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 cia-fade-up">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MessageSquare className="h-5 w-5 opacity-40" />
                </div>
                <p className="text-xs font-medium">Sin conversaciones</p>
                <p className="text-[10px] text-slate-300 mt-0.5">Empieza un nuevo chat</p>
              </div>
            ) : (
              groups.map(group => (
                <div key={group.label}>
                  <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">
                    {group.label}
                  </p>
                  {group.items.map((conv, idx) => {
                    const active = activeModuleId === conv.module_id;
                    return (
                      <button
                        key={conv.module_id}
                        onClick={() => openConversation(conv)}
                        className={`cia-conv group w-full text-left px-3 py-2.5 rounded-xl mb-0.5 transition-all duration-150 flex items-center justify-between gap-2 ${
                          active
                            ? 'bg-white shadow-sm border border-slate-200'
                            : 'hover:bg-white/70 hover:shadow-sm border border-transparent'
                        }`}
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {active && (
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className={`text-[13px] truncate leading-tight font-medium ${
                              active ? 'text-red-700' : 'text-slate-600'
                            }`}>
                              {convTitle(conv)}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(conv.updated_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short' })}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={e => handleDelete(conv, e)}
                          disabled={deletingId === conv.id}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-300 transition-all shrink-0"
                        >
                          {deletingId === conv.id
                            ? <span className="block h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-red-500 cia-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Main chat panel ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-white">

          {/* Topbar */}
          <div className="cia-topbar shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-md shadow-red-100">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 leading-tight">Vantia Legal Pro</h1>
                <div className="relative mt-0.5" ref={modelPickerRef}>
                  <button
                    onClick={() => setShowModelPicker(v => !v)}
                    className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="relative h-1.5 w-1.5 inline-block cia-ring">
                      <span className="block h-1.5 w-1.5 rounded-full bg-green-500" />
                    </span>
                    En línea · {activeModel.label}
                    <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                  </button>
                  {showModelPicker && (
                    <div className="cia-fade-up absolute left-0 top-6 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30">
                      <p className="px-3.5 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">Modelo / agente de IA</p>
                      {AI_MODELS.map(m => (
                        <button
                          key={m.id}
                          onClick={() => chooseModel(m.id)}
                          disabled={!m.available}
                          className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left transition-colors ${
                            m.id === selectedModel ? 'bg-red-50' : m.available ? 'hover:bg-slate-50' : 'cursor-not-allowed'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${m.available ? 'text-slate-700' : 'text-slate-400'}`}>{m.label}</p>
                            <p className="text-[10px] text-slate-400 truncate">{m.provider} · {m.desc}</p>
                          </div>
                          {m.id === selectedModel ? (
                            <Check className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          ) : !m.available ? (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-300 bg-slate-100 rounded-full px-1.5 py-0.5">Próx.</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeModuleId && messages.length > 0 && (
                <button
                  onClick={() => navigator.clipboard.writeText(
                    messages.map(m => `${m.role==='user'?'Tú':'Vantia'}: ${m.text}`).join('\n\n')
                  )}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all hover:bg-slate-50 active:scale-95"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar chat
                </button>
              )}
              <div className="relative" ref={topMenuRef}>
                <button
                  onClick={() => setShowTopMenu(v => !v)}
                  disabled={!activeModuleId}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {showTopMenu && (
                  <div className="cia-fade-up absolute right-0 top-10 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-20">
                    <button
                      onClick={exportConversation}
                      disabled={messages.length === 0}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Exportar conversación (.txt)
                    </button>
                    <button
                      onClick={deleteCurrentConversation}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar esta conversación
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Messages scroll area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">

              {/* ── Welcome ──────────────────────────────────────────────── */}
              {!activeModuleId && !initialLoading && (
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-260px)] text-center">
                  {/* Animated logo */}
                  <div className="relative mb-7 cia-scale-in">
                    <div className="absolute inset-0 rounded-3xl bg-red-500/10 blur-2xl scale-150" />
                    <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-red-500 to-red-900 flex items-center justify-center shadow-2xl shadow-red-300/40">
                      <Sparkles className="h-9 w-9 text-white" />
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold text-slate-800 mb-2 cia-fade-up" style={{animationDelay:'.12s'}}>
                    ¿En qué puedo ayudarte?
                  </h2>
                  <p className="text-sm text-slate-400 max-w-xs mb-8 cia-fade-up" style={{animationDelay:'.2s'}}>
                    Tu asistente jurídico con acceso real a los datos del despacho.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full max-w-xl">
                    {PROMPTS.map(({ icon, label, text }, i) => (
                      <button
                        key={text}
                        onClick={() => { newConversation(text); }}
                        className="cia-prompt-card text-left px-4 py-3.5 rounded-2xl border border-slate-200 hover:border-red-200 hover:bg-red-50/50 hover:shadow-sm bg-white transition-all duration-150 active:scale-[.97] group"
                        style={{ animationDelay: `${.24 + i*.05}s` }}
                      >
                        <span className="text-xl block mb-1.5">{icon}</span>
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-red-700 transition-colors leading-tight block">
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── History loading skeletons ─────────────────────────── */}
              {historyLoading && (
                <div className="space-y-5 mt-2">
                  {[{r:false,w:'72%'},{r:true,w:'55%'},{r:false,w:'80%'},{r:true,w:'45%'}].map(({r,w},i) => (
                    <div key={i} className={`flex gap-3 ${r?'flex-row-reverse':''}`}>
                      <div className="h-8 w-8 rounded-xl cia-shimmer shrink-0 mt-1" />
                      <div className={`rounded-2xl cia-shimmer h-16`} style={{width:w}} />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Messages ─────────────────────────────────────────── */}
              {!historyLoading && messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 mb-5 group ${msg.role==='user'?'flex-row-reverse':''} ${
                    msg.role==='user'?'cia-msg-user':'cia-msg-ai'
                  }`}
                >
                  {/* Avatar */}
                  {msg.role === 'model' ? (
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-red-500 to-red-900 flex items-center justify-center shrink-0 shadow-sm shadow-red-200 mt-1">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-xl bg-slate-700 flex items-center justify-center shrink-0 text-white text-[11px] font-bold mt-1">
                      {userInitials}
                    </div>
                  )}

                  {/* Bubble + actions */}
                  <div className={`flex flex-col gap-1 max-w-[76%] ${msg.role==='user'?'items-end':''}`}>
                    {msg.role === 'model' ? (
                      <div className="text-sm px-1 pt-1">
                        {msg.toolEvents && msg.toolEvents.length > 0 && (
                          <div className="flex flex-col gap-1.5 mb-2.5">
                            {msg.toolEvents.map((te, ti) => <ToolPill key={ti} label={te.label} done={te.done} />)}
                          </div>
                        )}
                        {msg.text
                          ? renderMd(msg.text)
                          : (sending && idx === messages.length - 1 ? <TypingDots /> : null)}
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-red-600 to-red-700 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm max-w-full">
                        {(msg.attachmentName || msg.linkedExpediente) && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {msg.attachmentName && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium bg-white/15 text-white px-2 py-0.5 rounded-full">
                                <FileText className="h-3 w-3" /> {msg.attachmentName}
                              </span>
                            )}
                            {msg.linkedExpediente && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium bg-white/15 text-white px-2 py-0.5 rounded-full">
                                <Link2 className="h-3 w-3" /> {msg.linkedExpediente.ref}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Si no escribió nada, el texto es el mismo "Archivo adjunto: X"
                            que ya dice la pastilla de arriba -- repetirlo debajo es
                            redundante, se omite para que solo se vea la pastilla. */}
                        {!(msg.attachmentName && msg.text === `Archivo adjunto: ${msg.attachmentName}`) && (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        )}
                      </div>
                    )}

                    {/* Hover actions */}
                    <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${msg.role==='user'?'flex-row-reverse':''}`}>
                      <button onClick={() => copyText(msg.text, idx)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors active:scale-95"
                        title="Copiar">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {msg.role === 'model' && idx === messages.length - 1 && !sending && (
                        <button onClick={regenerate}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors active:scale-95"
                          title="Regenerar">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {msg.role === 'model' && msg.text && (
                        <>
                          <button onClick={() => rateMessage(idx, 'up')}
                            className={`p-1.5 rounded-lg transition-colors active:scale-95 ${
                              feedback[idx] === 'up' ? 'text-green-600 bg-green-50' : 'text-slate-300 hover:bg-slate-100 hover:text-green-500'
                            }`} title="Útil">
                            <ThumbsUp className="h-3.5 w-3.5" fill={feedback[idx] === 'up' ? 'currentColor' : 'none'} />
                          </button>
                          <button onClick={() => rateMessage(idx, 'down')}
                            className={`p-1.5 rounded-lg transition-colors active:scale-95 ${
                              feedback[idx] === 'down' ? 'text-red-600 bg-red-50' : 'text-slate-300 hover:bg-slate-100 hover:text-red-400'
                            }`} title="No útil">
                            <ThumbsDown className="h-3.5 w-3.5" fill={feedback[idx] === 'down' ? 'currentColor' : 'none'} />
                          </button>
                        </>
                      )}
                      {copiedIdx === idx && (
                        <span className="text-[10px] text-green-600 font-medium px-1.5 py-0.5 bg-green-50 rounded-md">
                          ¡Copiado!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Input bar ─────────────────────────────────────────────────── */}
          <div className="cia-input-bar shrink-0 px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white/95 to-transparent">
            <div className="max-w-3xl mx-auto">

              {/* Chips: archivo adjunto / expediente vinculado / error de adjunto */}
              {(attachedFile || linkedExpediente || attachError) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {attachedFile && (
                    <span className="cia-fade-up inline-flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-600 pl-2.5 pr-1.5 py-1 rounded-full">
                      <FileText className="h-3.5 w-3.5" /> {attachedFile.name}
                      <button onClick={() => setAttachedFile(null)} className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {linkedExpediente && (
                    <span className="cia-fade-up inline-flex items-center gap-1.5 text-xs font-medium bg-red-50 text-red-600 pl-2.5 pr-1.5 py-1 rounded-full max-w-xs">
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{linkedExpediente.ref}{linkedExpediente.descripcion ? ` · ${linkedExpediente.descripcion}` : ''}</span>
                      <button onClick={() => setLinkedExpediente(null)} className="p-0.5 rounded-full hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {attachError && (
                    <span className="text-[11px] text-red-500 font-medium">{attachError}</span>
                  )}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-100 transition-all duration-200 shadow-sm relative">
                <div className="flex items-end gap-2 px-4 py-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    onChange={onFileSelected}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors active:scale-95 shrink-0 mb-0.5"
                    title="Adjuntar archivo de texto"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>

                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                    onKeyDown={handleKey}
                    placeholder={activeModuleId
                      ? 'Escribe un mensaje… (↵ enviar · ⇧↵ nueva línea)'
                      : 'Inicia una conversación con Vantia…'}
                    className="flex-1 resize-none bg-transparent outline-none focus:shadow-none text-sm text-slate-700 placeholder:text-slate-300 leading-relaxed py-0.5"
                    style={{ maxHeight: 152, overflowY: 'auto' }}
                    disabled={sending}
                  />

                  <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
                    <div className="relative" ref={linkPickerRef}>
                      <button
                        onClick={() => setShowLinkPicker(v => !v)}
                        className={`p-2 rounded-xl transition-colors active:scale-95 ${
                          linkedExpediente ? 'text-red-600 bg-red-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                        }`}
                        title="Vincular expediente"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      {showLinkPicker && (
                        <div className="cia-fade-up absolute bottom-11 right-0 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-20">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 mb-1.5">
                            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <input
                              autoFocus
                              value={linkQuery}
                              onChange={e => setLinkQuery(e.target.value)}
                              placeholder="Buscar expediente…"
                              className="flex-1 min-w-0 bg-transparent outline-none focus:shadow-none text-xs text-slate-700 placeholder:text-slate-400"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {linkSearching ? (
                              <div className="px-2.5 py-3 text-center"><Loader2 className="h-4 w-4 mx-auto text-slate-300 cia-spin" /></div>
                            ) : linkResults.length === 0 ? (
                              <p className="px-2.5 py-3 text-center text-xs text-slate-400">Sin resultados</p>
                            ) : (
                              linkResults.map(exp => (
                                <button
                                  key={exp.id}
                                  onClick={() => selectLinkedExpediente(exp)}
                                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                  <p className="text-xs font-semibold text-slate-700">{exp.ref}</p>
                                  {exp.descripcion && <p className="text-[11px] text-slate-400 truncate">{exp.descripcion}</p>}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={sending ? abortStreaming : sendMessage}
                      disabled={!sending && !input.trim() && !attachedFile}
                      className={`p-2.5 rounded-xl text-white transition-all duration-150 active:scale-90 ${
                        sending
                          ? 'bg-slate-700 hover:bg-slate-800'
                          : (input.trim() || attachedFile)
                            ? 'bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-sm shadow-red-200 hover:shadow-md'
                            : 'bg-slate-200 cursor-not-allowed'
                      }`}
                      title={sending ? 'Detener' : 'Enviar'}
                    >
                      {sending ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="px-4 pb-2.5">
                  <p className="text-[10px] text-slate-300 text-center">
                    Vantia puede cometer errores · Verifica información crítica antes de actuar
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
