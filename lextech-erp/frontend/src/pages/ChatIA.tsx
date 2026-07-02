import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Plus, Trash2, Copy, RotateCcw, ThumbsUp, ThumbsDown,
  Paperclip, Link2, Send, MessageSquare, Sparkles, MoreHorizontal,
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

interface Message {
  role: 'user' | 'model';
  text: string;
  ts: Date;
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

// ─── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-6">
        {/* Spinning ring + logo */}
        <div className="relative flex items-center justify-center">
          <div className="absolute h-24 w-24 rounded-full border-4 border-red-100" />
          <div
            className="absolute h-24 w-24 rounded-full border-4 border-transparent border-t-red-600 cia-spin"
            style={{ animationDuration: '1s' }}
          />
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-xl shadow-red-200">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Text */}
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-800">VantIA</p>
          <p className="text-sm text-slate-400 mt-0.5">Iniciando asistente legal…</p>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-red-500 to-red-700 rounded-full cia-loadbar" />
        </div>
      </div>
    </div>
  );
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function ShimmerLine({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded-lg cia-shimmer`} />;
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
  const [ready,          setReady]          = useState(false);   // controls entrance animation

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      setTimeout(() => setReady(true), 80);   // tiny delay so CSS transition fires
    }
  }, [getToken]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    let moduleId = activeModuleId;
    if (!moduleId) { moduleId = `chat-ia:${crypto.randomUUID()}`; setActiveModuleId(moduleId); }

    const isNew         = messages.length === 0;
    const historyToSend = messages.map(m => ({ role: m.role, text: m.text }));

    setMessages(prev => [...prev, { role: 'user', text, ts: new Date() }]);
    setInput('');
    setSending(true);

    try {
      const token = await getToken();
      const res   = await fetch(resolveApiUrl('/api/vantia/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history: historyToSend, moduleId }),
      });
      const data = await res.json();

      if (data.success) {
        setMessages(prev => [...prev, { role: 'model', text: data.reply, ts: new Date() }]);

        if (isNew) {
          const stub: Conversation = {
            id: '', module_id: moduleId!, title: text.slice(0,100),
            first_message: text, updated_at: new Date().toISOString(),
          };
          setConversations(prev => [stub, ...prev]);
          setTimeout(async () => {
            const tok = await getToken();
            const r   = await fetch(resolveApiUrl('/api/vantia/conversations'), { headers: { Authorization: `Bearer ${tok}` } });
            const d   = await r.json();
            if (d.success) {
              setConversations(d.conversations);
              const found = (d.conversations as Conversation[]).find(c => c.module_id === moduleId);
              if (found) setActiveId(found.id);
            }
          }, 700);
        } else {
          setConversations(prev => prev.map(c =>
            c.module_id === moduleId ? { ...c, updated_at: new Date().toISOString() } : c
          ));
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'model',
          text: `⚠️ Error: ${data.error || 'No se pudo obtener respuesta.'}`,
          ts: new Date(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'model',
        text: '⚠️ Error de conexión. Comprueba tu red e inténtalo de nuevo.',
        ts: new Date(),
      }]);
    } finally { setSending(false); }
  };

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
    if (messages.length < 2 || sending) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    const histWoLast = messages.slice(0,-2).map(m => ({role:m.role, text:m.text}));
    setMessages(prev => prev.slice(0,-1));
    setSending(true);
    try {
      const token = await getToken();
      const res   = await fetch(resolveApiUrl('/api/vantia/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: lastUser.text, history: histWoLast, moduleId: activeModuleId }),
      });
      const data = await res.json();
      if (data.success)
        setMessages(prev => [...prev, { role: 'model', text: data.reply, ts: new Date() }]);
    } catch { /**/ } finally { setSending(false); }
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

        {/* ── Initial loading screen ─────────────────────────────────────── */}
        {initialLoading && <LoadingScreen />}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside
          className="w-64 shrink-0 flex flex-col border-r border-slate-100 bg-slate-50 cia-sidebar"
          style={{ opacity: ready ? 1 : 0, transition: 'opacity .35s ease' }}
        >
          {/* Brand header */}
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shrink-0 shadow-md shadow-red-200">
                <Sparkles className="h-3.5 w-3.5 text-white" />
                {/* green online dot */}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-tight tracking-tight">VantIA</p>
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
        <div
          className="flex-1 flex flex-col relative overflow-hidden bg-white"
          style={{ opacity: ready ? 1 : 0, transition: 'opacity .4s ease' }}
        >

          {/* Topbar */}
          <div className="cia-topbar shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-md shadow-red-100">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 leading-tight">VantIA Legal Pro</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="relative h-1.5 w-1.5 inline-block cia-ring">
                    <span className="block h-1.5 w-1.5 rounded-full bg-green-500" />
                  </span>
                  <span className="text-[10px] text-slate-400">En línea · Gemini 2.5 Flash</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeModuleId && messages.length > 0 && (
                <button
                  onClick={() => navigator.clipboard.writeText(
                    messages.map(m => `${m.role==='user'?'Tú':'VantIA'}: ${m.text}`).join('\n\n')
                  )}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all hover:bg-slate-50 active:scale-95"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar chat
                </button>
              )}
              <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all hover:bg-slate-50 active:scale-95">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
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
                      <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-slate-100/80 text-sm">
                        {renderMd(msg.text)}
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-red-600 to-red-700 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    )}

                    {/* Hover actions */}
                    <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${msg.role==='user'?'flex-row-reverse':''}`}>
                      <button onClick={() => copyText(msg.text, idx)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors active:scale-95"
                        title="Copiar">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {msg.role === 'model' && idx === messages.length - 1 && (
                        <button onClick={regenerate}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors active:scale-95"
                          title="Regenerar">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {msg.role === 'model' && (
                        <>
                          <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-green-500 transition-colors active:scale-95" title="Útil">
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-red-400 transition-colors active:scale-95" title="No útil">
                            <ThumbsDown className="h-3.5 w-3.5" />
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

              {/* ── Typing indicator ────────────────────────────────── */}
              {sending && (
                <div className="flex gap-3 mb-5 cia-msg-ai">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-red-500 to-red-900 flex items-center justify-center shrink-0 shadow-sm shadow-red-200 mt-1">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-slate-100/80">
                    <div className="flex items-center gap-1.5 h-5">
                      {[0,1,2].map(i => (
                        <span
                          key={i}
                          className="cia-wave-dot h-2 w-2 rounded-full bg-gradient-to-b from-red-400 to-red-600 inline-block"
                          style={{ animationDelay: `${i*180}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Input bar ─────────────────────────────────────────────────── */}
          <div className="cia-input-bar shrink-0 px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white/95 to-transparent">
            <div className="max-w-3xl mx-auto">
              <div className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm ${
                input ? 'border-red-300 shadow-red-100/50' : 'border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-end gap-2 px-4 py-3">
                  <button className="p-2 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors active:scale-95 shrink-0 mb-0.5">
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
                      : 'Inicia una conversación con VantIA…'}
                    className="flex-1 resize-none bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-300 leading-relaxed py-0.5"
                    style={{ maxHeight: 152, overflowY: 'auto' }}
                    disabled={sending}
                  />

                  <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
                    <button className="p-2 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors active:scale-95" title="Vincular expediente">
                      <Link2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || sending}
                      className={`p-2.5 rounded-xl text-white transition-all duration-150 active:scale-90 ${
                        input.trim() && !sending
                          ? 'bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-sm shadow-red-200 hover:shadow-md'
                          : 'bg-slate-200 cursor-not-allowed'
                      }`}
                    >
                      {sending
                        ? <span className="block h-4 w-4 rounded-full border-2 border-white/40 border-t-white cia-spin" />
                        : <Send className="h-4 w-4" />
                      }
                    </button>
                  </div>
                </div>

                <div className="px-4 pb-2.5">
                  <p className="text-[10px] text-slate-300 text-center">
                    VantIA puede cometer errores · Verifica información crítica antes de actuar
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
