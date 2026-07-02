import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Plus, Trash2, Copy, RotateCcw, ThumbsUp, ThumbsDown,
  Paperclip, Mic, Link2, Send, MessageSquare, Sparkles,
  ChevronDown, MoreHorizontal,
} from 'lucide-react';
import { resolveApiUrl } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Simple markdown renderer ──────────────────────────────────────────────────

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-slate-100 text-red-600 px-1 py-0.5 rounded text-[0.8em] font-mono">{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={`code-${i}`} className="bg-slate-900 text-slate-100 rounded-xl p-4 my-3 overflow-x-auto text-sm font-mono leading-relaxed">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} className="text-base font-semibold text-slate-800 mt-4 mb-1.5">{inlineMarkdown(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} className="text-lg font-semibold text-slate-800 mt-5 mb-2">{inlineMarkdown(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(<h1 key={i} className="text-xl font-bold text-slate-900 mt-5 mb-2">{inlineMarkdown(line.slice(2))}</h1>);
      i++; continue;
    }

    // Bullet list
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ''));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1 ml-1">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2 text-slate-700 leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              <span>{inlineMarkdown(it)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      let num = 1;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++; num++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1 ml-1">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2 text-slate-700 leading-relaxed">
              <span className="shrink-0 text-red-500 font-medium text-sm">{j + 1}.</span>
              <span>{inlineMarkdown(it)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={i} className="border-l-4 border-red-300 pl-4 my-2 text-slate-600 italic bg-red-50 py-2 rounded-r-lg">
          {inlineMarkdown(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      nodes.push(<hr key={i} className="border-slate-200 my-4" />);
      i++; continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++; continue;
    }

    // Paragraph
    nodes.push(
      <p key={i} className="text-slate-700 leading-relaxed mb-1">
        {inlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return <>{nodes}</>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByDate(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const week = new Date(today.getTime() - 7 * 86400000);

  const todayItems    = convs.filter(c => new Date(c.updated_at) >= today);
  const yesterItems   = convs.filter(c => new Date(c.updated_at) >= yesterday && new Date(c.updated_at) < today);
  const weekItems     = convs.filter(c => new Date(c.updated_at) >= week      && new Date(c.updated_at) < yesterday);
  const olderItems    = convs.filter(c => new Date(c.updated_at) < week);

  const groups: { label: string; items: Conversation[] }[] = [];
  if (todayItems.length)  groups.push({ label: 'Hoy',             items: todayItems });
  if (yesterItems.length) groups.push({ label: 'Ayer',            items: yesterItems });
  if (weekItems.length)   groups.push({ label: 'Últimos 7 días',  items: weekItems });
  if (olderItems.length)  groups.push({ label: 'Anteriores',      items: olderItems });
  return groups;
}

function convTitle(c: Conversation): string {
  return c.title || c.first_message?.slice(0, 60) || 'Nueva conversación';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatIA() {
  const { getToken }  = useAuth();
  const { user }      = useUser();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null); // DB row id
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // ── Load conversations list ───────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    setSidebarLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(resolveApiUrl('/api/vantia/conversations'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setConversations(data.conversations);
    } catch { /* ignore */ } finally {
      setSidebarLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  useEffect(() => {
    if (textareaRef.current) autoResize(textareaRef.current);
  }, [input]);

  // ── Load conversation history ─────────────────────────────────────────────

  const openConversation = async (conv: Conversation) => {
    setActiveModuleId(conv.module_id);
    setActiveId(conv.id);
    setMessages([]);
    setHistoryLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        resolveApiUrl(`/api/vantia/chat/history?moduleId=${encodeURIComponent(conv.module_id)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) {
        setMessages((data.history as { role: string; text: string }[]).map(h => ({
          role: h.role as 'user' | 'model',
          text: h.text,
          ts: new Date(),
        })));
      }
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  };

  // ── New conversation ──────────────────────────────────────────────────────

  const newConversation = () => {
    const uuid = crypto.randomUUID();
    const moduleId = `chat-ia:${uuid}`;
    setActiveModuleId(moduleId);
    setActiveId(null);
    setMessages([]);
    setInput('');
    textareaRef.current?.focus();
  };

  // ── Delete conversation ───────────────────────────────────────────────────

  const deleteConversation = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(conv.id);
    try {
      const token = await getToken();
      await fetch(resolveApiUrl(`/api/vantia/conversations/${conv.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (activeId === conv.id) {
        setActiveModuleId(null);
        setActiveId(null);
        setMessages([]);
      }
    } catch { /* ignore */ } finally {
      setDeletingId(null);
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    let moduleId = activeModuleId;
    if (!moduleId) {
      const uuid = crypto.randomUUID();
      moduleId = `chat-ia:${uuid}`;
      setActiveModuleId(moduleId);
    }

    const isNewConv = messages.length === 0;
    const userMsg: Message = { role: 'user', text, ts: new Date() };
    const historyToSend = messages.map(m => ({ role: m.role, text: m.text }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const token = await getToken();
      const res = await fetch(resolveApiUrl('/api/vantia/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history: historyToSend, moduleId }),
      });
      const data = await res.json();

      if (data.success) {
        const aiMsg: Message = { role: 'model', text: data.reply, ts: new Date() };
        setMessages(prev => [...prev, aiMsg]);

        // Update or add to conversations list
        if (isNewConv) {
          const newConv: Conversation = {
            id: '',
            module_id: moduleId,
            title: text.slice(0, 100),
            first_message: text,
            updated_at: new Date().toISOString(),
          };
          setConversations(prev => [newConv, ...prev]);
          // Refresh to get the real id
          setTimeout(async () => {
            const tok = await getToken();
            const r = await fetch(resolveApiUrl('/api/vantia/conversations'), {
              headers: { Authorization: `Bearer ${tok}` },
            });
            const d = await r.json();
            if (d.success) {
              setConversations(d.conversations);
              const found = (d.conversations as Conversation[]).find(c => c.module_id === moduleId);
              if (found) setActiveId(found.id);
            }
          }, 500);
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
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'model',
        text: '⚠️ Error de conexión. Comprueba tu conexión a internet e inténtalo de nuevo.',
        ts: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const regenerate = async () => {
    if (messages.length < 2 || sending) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    const historyWithoutLast = messages.slice(0, -2).map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => prev.slice(0, -1));
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(resolveApiUrl('/api/vantia/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: lastUser.text, history: historyWithoutLast, moduleId: activeModuleId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { role: 'model', text: data.reply, ts: new Date() }]);
      }
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  };

  // ── User avatar ───────────────────────────────────────────────────────────

  const userInitials = user?.firstName
    ? (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase()
    : (user?.emailAddresses?.[0]?.emailAddress?.[0] || 'U').toUpperCase();

  const groups = groupByDate(conversations);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-white overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Left Sidebar ────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-slate-200 bg-slate-50">

        {/* Header */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">VantIA</p>
              <p className="text-[10px] text-slate-400 leading-tight">Legal Pro</p>
            </div>
          </div>

          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-medium rounded-xl py-2.5 px-4 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sidebarLoading ? (
            <div className="flex flex-col gap-2 px-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Sin conversaciones aún</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label} className="mb-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1">
                  {group.label}
                </p>
                {group.items.map(conv => (
                  <button
                    key={conv.module_id}
                    onClick={() => openConversation(conv)}
                    className={`group w-full text-left px-3 py-2.5 rounded-xl mb-0.5 transition-all flex items-start justify-between gap-2 ${
                      activeModuleId === conv.module_id
                        ? 'bg-red-50 border border-red-100 shadow-sm'
                        : 'hover:bg-white hover:shadow-sm border border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate leading-tight ${
                        activeModuleId === conv.module_id ? 'text-red-700 font-medium' : 'text-slate-700'
                      }`}>
                        {convTitle(conv)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(conv.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <button
                      onClick={e => deleteConversation(conv, e)}
                      disabled={deletingId === conv.id}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-100 hover:text-red-600 text-slate-400 transition-all shrink-0 mt-0.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Right Panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative overflow-hidden">

        {/* Topbar */}
        <div className="absolute top-0 left-0 right-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-800">VantIA Legal Pro</h1>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-slate-400">En línea · Gemini 2.5 Flash</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeModuleId && messages.length > 0 && (
              <button
                onClick={() => {
                  const text = messages.map(m => `${m.role === 'user' ? 'Tú' : 'VantIA'}: ${m.text}`).join('\n\n');
                  navigator.clipboard.writeText(text);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar todo
              </button>
            )}
            <button className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5">
              <MoreHorizontal className="h-3.5 w-3.5" />
              Más
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto pt-20 pb-44 px-4">
          <div className="max-w-3xl mx-auto">

            {/* Welcome screen */}
            {!activeModuleId && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center mb-6 shadow-xl shadow-red-200">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">¿En qué puedo ayudarte?</h2>
                <p className="text-slate-500 text-sm max-w-sm mb-8">
                  Soy VantIA, tu asistente jurídico inteligente. Puedo redactar documentos, analizar expedientes, resolver dudas legales y mucho más.
                </p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                  {[
                    { icon: '📋', text: 'Resume el expediente más reciente' },
                    { icon: '✍️', text: 'Redacta un contrato de arrendamiento' },
                    { icon: '📊', text: 'Muéstrame las estadísticas del despacho' },
                    { icon: '⚖️', text: 'Explica el proceso monitorio' },
                  ].map(({ icon, text }) => (
                    <button
                      key={text}
                      onClick={() => { setInput(text); newConversation(); textareaRef.current?.focus(); }}
                      className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 text-sm text-slate-600 hover:text-red-700 transition-all bg-white shadow-sm"
                    >
                      <span className="mr-2">{icon}</span>{text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* History loading */}
            {historyLoading && (
              <div className="space-y-4 mt-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`flex gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                    <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse shrink-0" />
                    <div className={`h-16 rounded-2xl bg-slate-100 animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-72'}`} />
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            {!historyLoading && messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 mb-6 group ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

                {/* Avatar */}
                {msg.role === 'model' ? (
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shrink-0 shadow-md shadow-red-200 mt-1">
                    <Sparkles className="h-4.5 w-4.5 text-white" />
                  </div>
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-slate-700 flex items-center justify-center shrink-0 text-white text-xs font-bold mt-1">
                    {userInitials}
                  </div>
                )}

                {/* Bubble */}
                <div className="flex flex-col gap-1.5 max-w-[75%]">
                  {msg.role === 'model' ? (
                    <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-slate-100">
                      <div className="prose-ai text-sm">{renderMarkdown(msg.text)}</div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-br from-red-600 to-red-700 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <button
                      onClick={() => copyText(msg.text, idx)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Copiar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {msg.role === 'model' && (
                      <>
                        <button
                          onClick={regenerate}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Regenerar"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-green-600 transition-colors" title="Buena respuesta">
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors" title="Mala respuesta">
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {copiedIdx === idx && (
                      <span className="text-[10px] text-green-600 font-medium px-1">¡Copiado!</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex gap-3 mb-6">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shrink-0 shadow-md shadow-red-200 mt-1">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-slate-100">
                  <div className="flex items-center gap-1.5 h-5">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full bg-red-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Floating input bar ────────────────────────────────────────── */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-3 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="flex items-end gap-2 px-4 py-3">
                <button className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0 mb-0.5">
                  <Paperclip className="h-4.5 w-4.5" />
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                  onKeyDown={handleKeyDown}
                  placeholder={activeModuleId ? 'Escribe un mensaje… (Intro para enviar, Mayús+Intro para salto de línea)' : 'Escribe para iniciar una conversación…'}
                  className="flex-1 resize-none outline-none text-sm text-slate-700 placeholder:text-slate-400 leading-relaxed bg-transparent py-0.5"
                  style={{ maxHeight: 160, overflowY: 'auto' }}
                  disabled={sending}
                />

                <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
                  <button className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Vincular a expediente">
                    <Link2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    className="p-2.5 rounded-xl bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Footer disclaimer */}
              <div className="px-4 pb-2 flex items-center justify-center">
                <p className="text-[10px] text-slate-400 text-center">
                  VantIA puede cometer errores. Verifica la información importante antes de actuar.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
