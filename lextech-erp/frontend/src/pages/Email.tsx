/**
 * Módulo de Correo — interfaz estilo Thunderbird / Outlook
 * Tres paneles: carpetas | lista | lector/compositor
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Inbox, Star, Send, FileText, Trash2, RefreshCw, Plus,
  Search, ChevronDown, ChevronRight, Mail, MailOpen,
  Reply, ReplyAll, Forward, Edit3, Paperclip, X,
  Settings, AlertCircle, Loader2, CheckCircle2, Eye,
  MoreVertical, Trash, Archive, Tag, User, AtSign,
  ServerCrash, Wifi, WifiOff, Maximize2, Minimize2,
  Circle, ChevronLeft, Info, ExternalLink,
} from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import BackButton from '../components/BackButton';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  label: string;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  active: boolean;
  last_sync_at: string | null;
}

interface EmailMessage {
  id: string;
  account_id: string;
  folder: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  snippet: string | null;
  body_html: string | null;
  body_text: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  has_attachments: boolean;
  sent_at: string | null;
}

interface EmailStats {
  inbox_unread: number;
  starred: number;
  drafts: number;
  sent: number;
  trash: number;
}

interface ComposeData {
  id?: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  replyToMsgId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString('es-ES', { weekday: 'short' });
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function initials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function avatarColor(email: string): string {
  const colors = [
    'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
    'bg-orange-500', 'bg-rose-500', 'bg-cyan-500', 'bg-amber-500',
  ];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % colors.length;
  return colors[h];
}

// ── Carpetas virtuales ────────────────────────────────────────────────────────

const VIRTUAL_FOLDERS = [
  { id: 'INBOX',   label: 'Bandeja de entrada', icon: Inbox,    badgeKey: 'inbox_unread' as keyof EmailStats },
  { id: 'STARRED', label: 'Destacados',          icon: Star,     badgeKey: 'starred'      as keyof EmailStats },
  { id: 'SENT',    label: 'Enviados',            icon: Send,     badgeKey: null },
  { id: 'DRAFTS',  label: 'Borradores',          icon: FileText, badgeKey: 'drafts'       as keyof EmailStats },
  { id: 'TRASH',   label: 'Papelera',            icon: Trash2,   badgeKey: null },
];

// ── Modal Añadir Cuenta ───────────────────────────────────────────────────────

interface AccountFormProps {
  onClose: () => void;
  onSaved: () => void;
  getToken: () => Promise<string | null>;
  defaultEmail?: string;
  defaultLabel?: string;
}

function AccountForm({ onClose, onSaved, getToken, defaultEmail = '', defaultLabel = 'Mi cuenta' }: AccountFormProps) {
  const [step, setStep] = useState(1); // 1=basic 2=imap 3=smtp
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    label: defaultLabel,
    email: defaultEmail,
    username: '',
    password: '',
    imap_host: '',
    imap_port: 993,
    imap_secure: true,
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
  });

  function set(k: string, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // Auto-fill common providers
  function autoFill(email: string) {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    set('username', email);
    if (domain.includes('gmail')) {
      set('imap_host', 'imap.gmail.com'); set('imap_port', 993); set('imap_secure', true);
      set('smtp_host', 'smtp.gmail.com'); set('smtp_port', 587); set('smtp_secure', false);
    } else if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
      set('imap_host', 'outlook.office365.com'); set('imap_port', 993); set('imap_secure', true);
      set('smtp_host', 'smtp.office365.com'); set('smtp_port', 587); set('smtp_secure', false);
    } else if (domain.includes('yahoo')) {
      set('imap_host', 'imap.mail.yahoo.com'); set('imap_port', 993); set('imap_secure', true);
      set('smtp_host', 'smtp.mail.yahoo.com'); set('smtp_port', 465); set('smtp_secure', true);
    } else if (domain) {
      set('imap_host', `imap.${domain}`); set('imap_port', 993); set('imap_secure', true);
      set('smtp_host', `smtp.${domain}`); set('smtp_port', 587); set('smtp_secure', false);
    }
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar la cuenta');
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const labelCls = "block text-xs font-medium text-slate-500 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Añadir cuenta de correo</h2>
            <p className="text-xs text-slate-400 mt-0.5">Paso {step} de 3</p>
          </div>
          <BackButton onClick={onClose} />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-blue-500 transition-all rounded-full" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        <div className="p-6 space-y-4">
          {/* Step 1: Básico */}
          {step === 1 && (
            <>
              <div>
                <label className={labelCls}>Nombre de la cuenta</label>
                <input className={inputCls} value={form.label} onChange={e => set('label', e.target.value)} placeholder="Trabajo, Personal..." />
              </div>
              <div>
                <label className={labelCls}>Dirección de correo</label>
                <input className={inputCls} type="email" value={form.email}
                  onChange={e => { set('email', e.target.value); autoFill(e.target.value); }}
                  placeholder="usuario@empresa.com" />
              </div>
              <div>
                <label className={labelCls}>Usuario / Login</label>
                <input className={inputCls} value={form.username} onChange={e => set('username', e.target.value)} placeholder="Normalmente igual al correo" />
              </div>
              <div>
                <label className={labelCls}>Contraseña</label>
                <input className={inputCls} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Contraseña de la cuenta" />
              </div>
              <p className="text-xs text-slate-400 flex gap-1.5 items-start">
                <Info size={12} className="mt-0.5 shrink-0 text-blue-400" />
                Para Gmail necesitas una "Contraseña de aplicación" (Cuenta Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicación)
              </p>
            </>
          )}

          {/* Step 2: IMAP */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
                <Inbox size={16} className="text-blue-500" />
                <span className="text-sm font-medium text-blue-700">Configuración IMAP (recepción)</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Servidor IMAP</label>
                  <input className={inputCls} value={form.imap_host} onChange={e => set('imap_host', e.target.value)} placeholder="imap.ejemplo.com" />
                </div>
                <div>
                  <label className={labelCls}>Puerto</label>
                  <input className={inputCls} type="number" value={form.imap_port} onChange={e => set('imap_port', parseInt(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => set('imap_secure', !form.imap_secure)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.imap_secure ? 'bg-blue-500' : 'bg-slate-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.imap_secure ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-slate-600">SSL/TLS directo (puerto 993)</span>
              </div>
              <p className="text-xs text-slate-400">Si tu servidor usa STARTTLS (587), desactiva SSL y cambia el puerto.</p>
            </>
          )}

          {/* Step 3: SMTP */}
          {step === 3 && (
            <>
              <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
                <Send size={16} className="text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700">Configuración SMTP (envío)</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Servidor SMTP</label>
                  <input className={inputCls} value={form.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.ejemplo.com" />
                </div>
                <div>
                  <label className={labelCls}>Puerto</label>
                  <input className={inputCls} type="number" value={form.smtp_port} onChange={e => set('smtp_port', parseInt(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => set('smtp_secure', !form.smtp_secure)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.smtp_secure ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.smtp_secure ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-slate-600">SSL/TLS directo (puerto 465)</span>
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl text-red-600 text-sm">
                  <AlertCircle size={15} />
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <ChevronLeft size={15} /> Atrás
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Cancelar
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && (!form.email || !form.password)}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 transition-colors">
              Siguiente <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving || !form.smtp_host}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 transition-colors">
              {saving ? <><Loader2 size={15} className="animate-spin" /> Conectando...</> : <><CheckCircle2 size={15} /> Guardar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ventana Redactar ──────────────────────────────────────────────────────────

interface ComposeWindowProps {
  data: ComposeData;
  accounts: EmailAccount[];
  onClose: () => void;
  onSent: () => void;
  getToken: () => Promise<string | null>;
}

function ComposeWindow({ data, accounts, onClose, onSent, getToken }: ComposeWindowProps) {
  const [form, setForm] = useState<ComposeData>(data);
  const [showCc, setShowCc] = useState(!!data.cc);
  const [showBcc, setShowBcc] = useState(!!data.bcc);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [minimized, setMinimized] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  function set(k: keyof ComposeData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSend() {
    if (!form.to.trim()) { setError('El campo Para es obligatorio'); return; }
    setSending(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          from: form.from,
          to: form.to.split(',').map(s => s.trim()).filter(Boolean),
          cc: form.cc ? form.cc.split(',').map(s => s.trim()).filter(Boolean) : [],
          bcc: form.bcc ? form.bcc.split(',').map(s => s.trim()).filter(Boolean) : [],
          subject: form.subject,
          body: bodyRef.current?.innerHTML || form.body,
          draft_id: form.id,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Error al enviar');
      setSuccess('¡Correo enviado!');
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch (e: any) {
      setError(e.message);
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch('/api/email/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: form.id,
          from: form.from,
          to: form.to,
          cc: form.cc,
          subject: form.subject,
          body: bodyRef.current?.innerHTML || form.body,
        }),
      });
      setSuccess('Borrador guardado');
      setTimeout(() => setSuccess(''), 2000);
    } catch (_e) {
    } finally {
      setSaving(false);
    }
  }

  if (minimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 w-64 bg-slate-800 rounded-t-xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer" onClick={() => setMinimized(false)}>
          <span className="text-sm font-medium text-white truncate">{form.subject || 'Sin asunto'}</span>
          <div className="flex gap-1">
            <button className="p-1 hover:bg-white/10 rounded"><Maximize2 size={13} className="text-slate-300" /></button>
            <button onClick={e => { e.stopPropagation(); onClose(); }} className="p-1 hover:bg-white/10 rounded"><X size={13} className="text-slate-300" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-6 z-50 w-[640px] bg-white rounded-t-2xl shadow-2xl border border-slate-200 flex flex-col"
      style={{ maxHeight: '80vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-t-2xl">
        <span className="text-sm font-medium text-white">
          {data.replyToMsgId ? 'Responder' : (form.id ? 'Borrador' : 'Nuevo mensaje')}
        </span>
        <div className="flex gap-1">
          <button onClick={() => setMinimized(true)} className="p-1.5 hover:bg-white/10 rounded-lg"><Minimize2 size={14} className="text-slate-300" /></button>
          <button onClick={handleSaveDraft} disabled={saving}
            className="px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            {saving ? 'Guardando...' : 'Guardar borrador'}
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={14} className="text-slate-300" /></button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Fields */}
        <div className="border-b border-slate-100">
          {/* From */}
          {accounts.length > 1 && (
            <div className="flex items-center px-4 py-2 border-b border-slate-100">
              <span className="text-xs text-slate-400 w-14 shrink-0">De:</span>
              <select value={form.from} onChange={e => set('from', e.target.value)}
                className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none">
                {accounts.map(a => <option key={a.id} value={a.email}>{a.label} &lt;{a.email}&gt;</option>)}
              </select>
            </div>
          )}
          {/* To */}
          <div className="flex items-center px-4 py-2 border-b border-slate-100">
            <span className="text-xs text-slate-400 w-14 shrink-0">Para:</span>
            <input value={form.to} onChange={e => set('to', e.target.value)}
              className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none placeholder-slate-300"
              placeholder="destinatario@email.com, otro@email.com..." />
            <div className="flex gap-2 ml-2">
              {!showCc && <button onClick={() => setShowCc(true)} className="text-xs text-blue-500 hover:text-blue-700">CC</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="text-xs text-blue-500 hover:text-blue-700">CCO</button>}
            </div>
          </div>
          {showCc && (
            <div className="flex items-center px-4 py-2 border-b border-slate-100">
              <span className="text-xs text-slate-400 w-14 shrink-0">CC:</span>
              <input value={form.cc} onChange={e => set('cc', e.target.value)}
                className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none" />
            </div>
          )}
          {showBcc && (
            <div className="flex items-center px-4 py-2 border-b border-slate-100">
              <span className="text-xs text-slate-400 w-14 shrink-0">CCO:</span>
              <input value={form.bcc} onChange={e => set('bcc', e.target.value)}
                className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none" />
            </div>
          )}
          {/* Subject */}
          <div className="flex items-center px-4 py-2">
            <span className="text-xs text-slate-400 w-14 shrink-0">Asunto:</span>
            <input value={form.subject} onChange={e => set('subject', e.target.value)}
              className="flex-1 text-sm font-medium text-slate-800 bg-transparent focus:outline-none placeholder-slate-300"
              placeholder="Sin asunto" />
          </div>
        </div>

        {/* Body - contenteditable */}
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: form.body || '' }}
          className="flex-1 p-4 text-sm text-slate-700 overflow-y-auto focus:outline-none"
          style={{ minHeight: 200 }}
          onInput={() => {}} // controlled via ref
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50 rounded-b-none">
        <div className="flex gap-2">
          <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500" title="Adjuntar archivo">
            <Paperclip size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-500">{error}</span>}
          {success && <span className="text-xs text-emerald-600 font-medium">{success}</span>}
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-2 px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors shadow-sm">
            {sending ? <><Loader2 size={15} className="animate-spin" />Enviando...</> : <><Send size={15} />Enviar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email List Item ───────────────────────────────────────────────────────────

interface EmailListItemProps {
  msg: EmailMessage;
  selected: boolean;
  onSelect: () => void;
  onStar: (e: React.MouseEvent) => void;
}

function EmailListItem({ msg, selected, onSelect, onStar }: EmailListItemProps) {
  const senderName = msg.from_name || msg.from_address.split('@')[0];
  const av = initials(msg.from_name, msg.from_address);
  const bg = avatarColor(msg.from_address);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 transition-colors border-b border-slate-100 last:border-0 group
        ${selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}
        ${!msg.is_read ? 'bg-white' : 'bg-white/60'}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 ${bg}`}>
          {av}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: name + date + star */}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-sm truncate flex-1 ${!msg.is_read ? 'font-semibold text-slate-800' : 'font-normal text-slate-600'}`}>
              {senderName}
            </span>
            {msg.has_attachments && <Paperclip size={11} className="text-slate-300 shrink-0" />}
            <span className="text-[10px] text-slate-400 shrink-0">{formatDate(msg.sent_at)}</span>
            <button onClick={onStar}
              className={`shrink-0 transition-colors ${msg.is_starred ? 'text-amber-400' : 'text-slate-200 group-hover:text-slate-300'}`}>
              <Star size={13} fill={msg.is_starred ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Row 2: subject */}
          <div className={`text-xs truncate mb-0.5 ${!msg.is_read ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
            {msg.subject || '(Sin asunto)'}
          </div>

          {/* Row 3: snippet */}
          <div className="text-[11px] text-slate-400 truncate">
            {msg.snippet || ''}
          </div>
        </div>

        {/* Unread dot */}
        {!msg.is_read && (
          <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2" />
        )}
      </div>
    </button>
  );
}

// ── Email Reader ──────────────────────────────────────────────────────────────

interface EmailReaderProps {
  msg: EmailMessage;
  accounts: EmailAccount[];
  onReply: (all?: boolean) => void;
  onForward: () => void;
  onDelete: () => void;
  onStar: () => void;
  onClose: () => void;
}

function EmailReader({ msg, accounts, onReply, onForward, onDelete, onStar, onClose }: EmailReaderProps) {
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Write HTML to iframe for safe rendering
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const html = msg.body_html || `<pre style="font-family:inherit;font-size:14px;white-space:pre-wrap">${msg.body_text || ''}</pre>`;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <style>
        body { margin:0; padding:16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; line-height:1.6; color:#374151; }
        a { color:#3b82f6; }
        img { max-width:100%; height:auto; }
        blockquote { border-left:3px solid #e2e8f0; margin:0;padding-left:12px;color:#94a3b8; }
        pre { white-space:pre-wrap; background:#f8fafc; padding:12px; border-radius:8px; }
      </style>
    </head><body>${html}</body></html>`);
    doc.close();
    // Auto-height
    const resize = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
      }
    };
    iframe.onload = resize;
    setTimeout(resize, 300);
  }, [msg.id, msg.body_html, msg.body_text]);

  return (
    <div className="flex flex-col h-full">
      {/* Reader header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex-1 leading-tight">
            {msg.subject || '(Sin asunto)'}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onStar} title={msg.is_starred ? 'Quitar destacado' : 'Destacar'}
              className={`p-2 rounded-xl transition-colors ${msg.is_starred ? 'text-amber-400 bg-amber-50' : 'text-slate-400 hover:bg-slate-100'}`}>
              <Star size={16} fill={msg.is_starred ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => onReply()} title="Responder"
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
              <Reply size={16} />
            </button>
            <button onClick={() => onReply(true)} title="Responder a todos"
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
              <ReplyAll size={16} />
            </button>
            <button onClick={onForward} title="Reenviar"
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
              <Forward size={16} />
            </button>
            <button onClick={onDelete} title="Eliminar"
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash size={16} />
            </button>
          </div>
        </div>

        {/* Sender info */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${avatarColor(msg.from_address)}`}>
            {initials(msg.from_name, msg.from_address)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-800">
                {msg.from_name || msg.from_address.split('@')[0]}
              </span>
              <span className="text-xs text-slate-400">&lt;{msg.from_address}&gt;</span>
            </div>
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors mt-0.5">
              {expanded ? (
                <>
                  Para: {msg.to_addresses.join(', ')}
                  {msg.cc_addresses.length > 0 && <> · CC: {msg.cc_addresses.join(', ')}</>}
                  <ChevronDown size={12} />
                </>
              ) : (
                <>
                  Para: {msg.to_addresses.slice(0, 2).join(', ')}
                  {msg.to_addresses.length > 2 && ` y ${msg.to_addresses.length - 2} más`}
                  <ChevronRight size={12} />
                </>
              )}
            </button>
          </div>
          <span className="text-xs text-slate-400 shrink-0">{formatFullDate(msg.sent_at)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-white px-2">
        <iframe
          ref={iframeRef}
          className="w-full border-0"
          style={{ minHeight: 200 }}
          sandbox="allow-same-origin"
          title="email-body"
        />
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Email() {
  const { getToken } = useAuth();

  // ── State ──
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null); // null = todos
  const [selectedFolder, setSelectedFolder] = useState('INBOX');
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<EmailMessage | null>(null);
  const [stats, setStats] = useState<EmailStats>({ inbox_unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [compose, setCompose] = useState<ComposeData | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');

  // ── Auth header ──
  const authHeaders = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [getToken]);

  const tokenGetter = useCallback(() => getToken({ skipCache: true }), [getToken]);

  // ── Fetch accounts ──
  const fetchAccounts = useCallback(async () => {
    try {
      const h = await authHeaders();
      const res = await fetch('/api/email/accounts', { headers: h });
      if (!res.ok) return;
      const data = await res.json();
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 0 && !selectedAccount) {
        setAccountsExpanded(prev => ({ ...prev, [data.accounts[0].id]: true }));
      }
    } catch (_e) {}
  }, [authHeaders, selectedAccount]);

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const h = await authHeaders();
      const params = new URLSearchParams();
      if (selectedAccount) params.set('account_id', selectedAccount);
      const res = await fetch(`/api/email/stats?${params}`, { headers: h });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch (_e) {}
  }, [authHeaders, selectedAccount]);

  // ── Fetch messages ──
  const fetchMessages = useCallback(async (resetPage = false) => {
    setLoading(true);
    setError('');
    try {
      const h = await authHeaders();
      const p = resetPage ? 1 : page;
      if (resetPage) setPage(1);
      const params = new URLSearchParams({
        folder: selectedFolder,
        page: String(p),
        limit: '30',
      });
      if (selectedAccount) params.set('account_id', selectedAccount);
      if (search) params.set('search', search);

      const res = await fetch(`/api/email/messages?${params}`, { headers: h });
      if (!res.ok) throw new Error('Error al cargar mensajes');
      const data = await res.json();
      setMessages(data.messages || []);
      setTotalPages(data.pages || 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, selectedAccount, selectedFolder, search, page]);

  // ── Initial load ──
  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { fetchStats(); }, [selectedAccount, selectedFolder]);
  useEffect(() => { fetchMessages(true); setSelectedMsg(null); }, [selectedAccount, selectedFolder, search]);
  useEffect(() => { fetchMessages(); }, [page]);

  // ── Select message (lazy body load) ──
  async function handleSelectMsg(msg: EmailMessage) {
    setSelectedMsg(msg);
    // Mark read optimistically
    if (!msg.is_read) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
      setStats(prev => ({ ...prev, inbox_unread: Math.max(0, prev.inbox_unread - 1) }));
      try {
        const h = await authHeaders();
        await fetch(`/api/email/messages/${msg.id}/read`, { method: 'PATCH', headers: h, body: JSON.stringify({ read: true }) });
      } catch (_e) {}
    }
    // Fetch full body if needed
    if (!msg.body_html && !msg.body_text) {
      try {
        const h = await authHeaders();
        const res = await fetch(`/api/email/messages/${msg.id}`, { headers: h });
        if (res.ok) {
          const data = await res.json();
          setSelectedMsg(data.message);
          setMessages(prev => prev.map(m => m.id === msg.id ? data.message : m));
        }
      } catch (_e) {}
    }
  }

  // ── Star toggle ──
  async function handleStar(msg: EmailMessage, e?: React.MouseEvent) {
    e?.stopPropagation();
    const next = !msg.is_starred;
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_starred: next } : m));
    if (selectedMsg?.id === msg.id) setSelectedMsg(m => m ? { ...m, is_starred: next } : null);
    try {
      const h = await authHeaders();
      await fetch(`/api/email/messages/${msg.id}/star`, { method: 'PATCH', headers: h, body: JSON.stringify({ starred: next }) });
      fetchStats();
    } catch (_e) {}
  }

  // ── Delete ──
  async function handleDelete(msg: EmailMessage) {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    if (selectedMsg?.id === msg.id) setSelectedMsg(null);
    try {
      const h = await authHeaders();
      await fetch(`/api/email/messages/${msg.id}`, { method: 'DELETE', headers: h });
      fetchStats();
    } catch (_e) {}
  }

  // ── Sync ──
  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncSuccess('');
    try {
      const h = await authHeaders();
      const accountsToSync = selectedAccount
        ? accounts.filter(a => a.id === selectedAccount)
        : accounts;
      for (const acc of accountsToSync) {
        await fetch(`/api/email/accounts/${acc.id}/sync`, { method: 'POST', headers: h });
      }
      await fetchMessages(true);
      await fetchStats();
      setSyncSuccess('Bandeja actualizada');
      setTimeout(() => setSyncSuccess(''), 3000);
    } catch (_e) {
    } finally {
      setSyncing(false);
    }
  }

  // ── Compose helpers ──
  function startCompose(prefill?: Partial<ComposeData>) {
    const fromEmail = accounts.find(a => a.id === selectedAccount)?.email || accounts[0]?.email || '';
    setCompose({
      from: fromEmail,
      to: '', cc: '', bcc: '', subject: '', body: '',
      ...prefill,
    });
  }

  function handleReply(all = false) {
    if (!selectedMsg) return;
    const toList = all
      ? [selectedMsg.from_address, ...selectedMsg.to_addresses].join(', ')
      : selectedMsg.from_address;
    const subject = selectedMsg.subject?.startsWith('Re:')
      ? selectedMsg.subject
      : `Re: ${selectedMsg.subject || ''}`;
    const quote = `<br><br><hr style="border:none;border-top:1px solid #e2e8f0"><p style="color:#94a3b8;font-size:12px">El ${formatFullDate(selectedMsg.sent_at)}, ${selectedMsg.from_name || selectedMsg.from_address} escribió:</p><blockquote style="border-left:3px solid #e2e8f0;padding-left:12px;color:#64748b">${selectedMsg.body_html || selectedMsg.body_text || ''}</blockquote>`;
    startCompose({ to: toList, subject, body: quote, replyToMsgId: selectedMsg.id });
  }

  function handleForward() {
    if (!selectedMsg) return;
    const subject = selectedMsg.subject?.startsWith('Fwd:')
      ? selectedMsg.subject
      : `Fwd: ${selectedMsg.subject || ''}`;
    const quote = `<br><br><hr style="border:none;border-top:1px solid #e2e8f0"><p style="color:#94a3b8;font-size:12px">---------- Mensaje reenviado ----------</p>${selectedMsg.body_html || selectedMsg.body_text || ''}`;
    startCompose({ subject, body: quote });
  }

  // ── Search ──
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  function handleSearchChange(v: string) {
    setSearchInput(v);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearch(v), 400);
  }

  // ── UI ──
  const hasAccounts = accounts.length > 0;

  return (
    <div className="h-full flex overflow-hidden bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
      {/* ── Panel izquierdo: cuentas y carpetas ── */}
      <div className="w-56 shrink-0 flex flex-col bg-white border-r border-slate-100 rounded-l-2xl overflow-hidden">
        {/* Compose button */}
        <div className="p-3 border-b border-slate-100">
          <button onClick={() => startCompose()}
            disabled={!hasAccounts}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm disabled:opacity-40">
            <Edit3 size={15} />
            Redactar
          </button>
        </div>

        {/* Folders / Accounts */}
        <div className="flex-1 overflow-y-auto py-2">
          {!hasAccounts ? (
            <div className="px-4 py-6 text-center">
              <Mail size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Sin cuentas configuradas</p>
            </div>
          ) : (
            <>
              {/* Virtual folders (todas las cuentas) */}
              <div className="px-2 mb-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">Todas las cuentas</p>
                {VIRTUAL_FOLDERS.map(f => {
                  const badge = f.badgeKey ? stats[f.badgeKey] : 0;
                  const isActive = selectedAccount === null && selectedFolder === f.id;
                  const Icon = f.icon;
                  return (
                    <button key={f.id}
                      onClick={() => { setSelectedAccount(null); setSelectedFolder(f.id); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors mb-0.5
                        ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <Icon size={15} className={isActive ? 'text-blue-500' : 'text-slate-400'} />
                      <span className="flex-1 text-left truncate">{f.label}</span>
                      {badge > 0 && (
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Per-account folders */}
              {accounts.map(acc => (
                <div key={acc.id} className="px-2 mt-3">
                  <button
                    onClick={() => setAccountsExpanded(prev => ({ ...prev, [acc.id]: !prev[acc.id] }))}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors">
                    {accountsExpanded[acc.id] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <span className="truncate flex-1 text-left">{acc.label}</span>
                    <span className="normal-case text-[9px]">{acc.email.split('@')[0]}</span>
                  </button>

                  {accountsExpanded[acc.id] && (
                    <div className="ml-1 mt-0.5">
                      {VIRTUAL_FOLDERS.map(f => {
                        const isActive = selectedAccount === acc.id && selectedFolder === f.id;
                        const Icon = f.icon;
                        return (
                          <button key={f.id}
                            onClick={() => { setSelectedAccount(acc.id); setSelectedFolder(f.id); }}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors mb-0.5
                              ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <Icon size={13} className={isActive ? 'text-blue-500' : 'text-slate-400'} />
                            <span className="flex-1 text-left truncate">{f.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Add account */}
        <div className="p-2 border-t border-slate-100">
          <button onClick={() => setShowAccountForm(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
            <Plus size={13} />
            Añadir cuenta
          </button>
        </div>
      </div>

      {/* ── Panel central: lista de mensajes ── */}
      <div className="w-72 shrink-0 flex flex-col bg-white border-r border-slate-100 overflow-hidden">
        {/* Search bar */}
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="flex-1 text-sm bg-transparent focus:outline-none text-slate-700 placeholder-slate-400"
              placeholder="Buscar correos..."
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); }}
                className="text-slate-300 hover:text-slate-500"><X size={13} /></button>
            )}
          </div>
        </div>

        {/* Folder header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              {VIRTUAL_FOLDERS.find(f => f.id === selectedFolder)?.label || selectedFolder}
            </h3>
            {selectedAccount && (
              <p className="text-[10px] text-slate-400">
                {accounts.find(a => a.id === selectedAccount)?.email}
              </p>
            )}
          </div>
          <button onClick={handleSync} disabled={syncing || !hasAccounts}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
            title="Sincronizar">
            <RefreshCw size={14} className={`text-slate-400 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Sync success */}
        {syncSuccess && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-50 text-emerald-600 text-xs">
            <CheckCircle2 size={12} />
            {syncSuccess}
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-blue-400" />
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
              <p className="text-xs text-red-500">{error}</p>
            </div>
          ) : !hasAccounts ? (
            <div className="p-6 text-center">
              <ServerCrash size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500 mb-1">Sin cuentas</p>
              <p className="text-xs text-slate-400">Añade una cuenta para empezar</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="p-6 text-center">
              <MailOpen size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {search ? 'Sin resultados para esta búsqueda' : 'No hay mensajes'}
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <EmailListItem
                key={msg.id}
                msg={msg}
                selected={selectedMsg?.id === msg.id}
                onSelect={() => handleSelectMsg(msg)}
                onStar={e => handleStar(msg, e)}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-slate-100">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">
              <ChevronLeft size={14} className="text-slate-500" />
            </button>
            <span className="text-xs text-slate-500">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">
              <ChevronRight size={14} className="text-slate-500" />
            </button>
          </div>
        )}
      </div>

      {/* ── Panel derecho: lector / estado vacío ── */}
      <div className="flex-1 overflow-hidden flex flex-col rounded-r-2xl">
        {selectedMsg ? (
          <EmailReader
            msg={selectedMsg}
            accounts={accounts}
            onReply={handleReply}
            onForward={handleForward}
            onDelete={() => handleDelete(selectedMsg)}
            onStar={() => handleStar(selectedMsg)}
            onClose={() => setSelectedMsg(null)}
          />
        ) : !hasAccounts ? (
          // Pantalla de bienvenida — sin cuentas
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
              <Mail size={36} className="text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">Módulo de Correo</h2>
            <p className="text-slate-400 text-sm max-w-xs mb-8 leading-relaxed">
              Conecta tu cuenta de correo para gestionar tus emails directamente desde el ERP.
              Compatible con Gmail, Outlook, Yahoo y cualquier servidor IMAP/SMTP.
            </p>
            <button onClick={() => setShowAccountForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-2xl font-medium hover:bg-blue-600 transition-colors shadow-sm">
              <Plus size={16} />
              Añadir cuenta de correo
            </button>
            <div className="mt-10 grid grid-cols-3 gap-4 text-left max-w-sm">
              {[
                { icon: Wifi, t: 'IMAP / SMTP nativo', d: 'Sin dependencias externas' },
                { icon: ShieldCheck, t: 'Contraseñas cifradas', d: 'AES-256 en base de datos' },
                { icon: Briefcase, t: 'Integrado con ERP', d: 'Vincula emails a expedientes' },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-1.5 p-3 bg-slate-50 rounded-xl">
                  <item.icon size={18} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-600">{item.t}</p>
                  <p className="text-[10px] text-slate-400">{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Pantalla vacía — selecciona un mensaje
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
              <MailOpen size={28} className="text-slate-300" />
            </div>
            <p className="text-base font-semibold text-slate-400">Selecciona un mensaje</p>
            <p className="text-sm text-slate-300 mt-1">para leerlo aquí</p>
          </div>
        )}
      </div>

      {/* ── Modales ── */}
      {showAccountForm && (
        <AccountForm
          getToken={tokenGetter}
          onClose={() => setShowAccountForm(false)}
          onSaved={async () => {
            setShowAccountForm(false);
            await fetchAccounts();
            await handleSync();
          }}
        />
      )}

      {compose && (
        <ComposeWindow
          data={compose}
          accounts={accounts}
          getToken={tokenGetter}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            fetchStats();
            if (selectedFolder === 'SENT') fetchMessages(true);
          }}
        />
      )}
    </div>
  );
}

// Needed icon used in empty state
function ShieldCheck({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function Briefcase({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
