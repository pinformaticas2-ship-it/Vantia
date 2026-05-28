/**
 * Módulo de Correo — Gmail-style (3 paneles)
 * OAuth Google para Gmail · IMAP para otras cuentas
 * El usuario autenticado (Clerk) se usa como identidad principal
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Inbox, Star, Send, FileText, Trash2, RefreshCw, Plus,
  Search, ChevronDown, X, Mail, MailOpen,
  Reply, ReplyAll, Forward, Paperclip, Loader2, CheckCircle2,
  MoreVertical, AlertCircle, Eye, EyeOff,
  ChevronLeft, Edit3, Tag, Wifi, Zap, Pin, FolderPlus, RotateCcw, Folder, Archive,
  AtSign, Shield, Filter, LogIn, type LucideIcon,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const GMAIL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
].join(' ');
const GMAIL_TOKEN_KEY = 'lextech-gmail-token-v1';
const LOCAL_DRAFTS_KEY = 'lextech-email-drafts-v1';
// Key de pineados es por cuenta (evita que se mezclen Gmail e IMAP)
const pinnedKey = (accountKey: string) => `lextech-email-pinned-${accountKey}`;
const API = (() => {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (raw) {
    const base = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    return base.replace(/\/+$/, '') + '/api';
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
    if (!isLocal) return 'https://gallant-curiosity-production-0aad.up.railway.app/api';
  }
  return 'http://localhost:4000/api';
})();

// Extend Window for Gmail GIS (avoid conflict with Agenda's declaration)
interface GmailGIS {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (resp: { access_token?: string; error?: string; expires_in?: number }) => void;
      }) => { requestAccessToken: () => void };
    };
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedEmail {
  id: string;
  threadId?: string;
  labelIds: string[];
  from: string;
  fromName: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  bodyHtml: string;
  bodyText: string;
  hasAttachments: boolean;
  source: 'gmail' | 'imap' | 'draft';
  isPinned?: boolean;
  draftId?: string;
}

interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesUnread?: number;
  messagesTotal?: number;
}

interface PendingDeleteLabel {
  id: string;
  name: string;
}

interface PendingDeleteAccount {
  id: string;
  name: string;
  email: string;
}

type ImapSystemFolderKey = 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE';

interface ImapFolderInfo {
  path: string;
  name: string;
  specialUse?: string;
  flags: string[];
}

interface ImapAccount {
  id: string;
  label: string;
  email: string;
  imap_host: string;
  smtp_host: string;
  active: boolean;
  last_sync_at: string | null;
}

interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  replyToId?: string;
  draftId?: string;
}

interface RecipientSuggestion {
  email: string;
  name: string;
  source: string;
}

interface ComposeAttachment {
  name: string;
  type: string;
  size: number;
  dataBase64: string;
}

interface GmailProfile {
  emailAddress: string;
  messagesTotal?: number;
}

interface SavedOAuthProfile {
  id: string;
  provider: 'google' | string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  external_id?: string | null;
  last_used_at?: string | null;
}

interface LocalDraft {
  id: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  updated_at: string;
}

interface ImapApiEmail {
  id: string;
  uid?: number | null;
  folder: string;
  from_email?: string | null;
  from_name?: string | null;
  to_emails?: string | null;
  cc_emails?: string | null;
  subject?: string | null;
  snippet?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  is_read: boolean;
  is_starred: boolean;
  has_attachments?: boolean;
  sent_at?: string | null;
  account_id?: string | null;
  account_label?: string | null;
  account_email?: string | null;
}

// ─── Gmail Service ────────────────────────────────────────────────────────────

class GmailService {
  private token: string;
  private base = 'https://gmail.googleapis.com/gmail/v1/users/me';

  constructor(token: string) { this.token = token; }

  private async req<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts?.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const code = body?.error?.code || res.status;
      const msg  = body?.error?.message || `Error ${res.status}`;
      throw Object.assign(new Error(msg), { code });
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async getProfile(): Promise<GmailProfile> { return this.req('/profile'); }
  async listLabels(): Promise<{ labels: GmailLabel[] }> { return this.req('/labels'); }

  async listMessages(labelIds: string[] = ['INBOX'], pageToken?: string, q?: string, max = 50) {
    const p = new URLSearchParams({ maxResults: String(max) });
    labelIds.forEach(id => p.append('labelIds', id));
    if (pageToken) p.set('pageToken', pageToken);
    if (q) p.set('q', q);
    return this.req<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `/messages?${p}`,
    );
  }

  async getMessage(id: string, format = 'full'): Promise<any> {
    return this.req(`/messages/${id}?format=${format}`);
  }

  async sendMessage(raw: string) {
    return this.req('/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
  }

  async modifyMessage(id: string, add: string[] = [], remove: string[] = []) {
    return this.req(`/messages/${id}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    });
  }

  async markRead(id: string, read: boolean) {
    return this.modifyMessage(id, read ? [] : ['UNREAD'], read ? ['UNREAD'] : []);
  }

  async toggleStar(id: string, starred: boolean) {
    return this.modifyMessage(id, starred ? ['STARRED'] : [], starred ? [] : ['STARRED']);
  }

  async trash(id: string) { return this.req(`/messages/${id}/trash`, { method: 'POST' }); }
  async untrash(id: string) { return this.req(`/messages/${id}/untrash`, { method: 'POST' }); }
  async deleteLabel(id: string) { return this.req(`/labels/${id}`, { method: 'DELETE' }); }
  async createLabel(name: string) {
    return this.req('/labels', {
      method: 'POST',
      body: JSON.stringify({
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64d(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
  } catch { return atob(b64); }
}

function readLocalDrafts(): LocalDraft[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_DRAFTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLocalDrafts(drafts: LocalDraft[]) {
  localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts));
}

function upsertLocalDraft(draft: LocalDraft) {
  const drafts = readLocalDrafts();
  const next = [draft, ...drafts.filter((item) => item.id !== draft.id)]
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
    .slice(0, 50);
  writeLocalDrafts(next);
  return next;
}

function removeLocalDraft(id?: string | null) {
  if (!id) return readLocalDrafts();
  const next = readLocalDrafts().filter((item) => item.id !== id);
  writeLocalDrafts(next);
  return next;
}

const GMAIL_LABEL_NAMES: Record<string, string> = {
  INBOX:                'Bandeja de entrada',
  STARRED:              'Destacados',
  IMPORTANT:            'Importantes',
  SENT:                 'Enviados',
  DRAFT:                'Borradores',
  SPAM:                 'Spam',
  TRASH:                'Papelera',
  UNREAD:               'No leídos',
  CHAT:                 'Chats',
  SNOOZED:              'En espera',
  CATEGORY_PERSONAL:    'Personal',
  CATEGORY_SOCIAL:      'Redes sociales',
  CATEGORY_PROMOTIONS:  'Promociones',
  CATEGORY_UPDATES:     'Actualizaciones',
  CATEGORY_FORUMS:      'Foros',
};

function normalizeLabelName(value: unknown, fallback = 'Carpeta sin nombre') {
  const raw = (() => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const nested = record.name ?? record.label ?? record.value ?? record.id;
      if (typeof nested === 'string') return nested.trim();
    }
    return '';
  })();
  if (!raw) return fallback;
  if (GMAIL_LABEL_NAMES[raw]) return GMAIL_LABEL_NAMES[raw];
  // Quitar prefijo "Label_XXXXXXXX/" o "CATEGORY_" si no está en el mapa
  return raw.replace(/^Label_[^/]+\//, '').replace(/^CATEGORY_/, '');
}

function readPinnedEmailIds(accountKey = 'default'): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(pinnedKey(accountKey)) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function writePinnedEmailIds(ids: string[], accountKey = 'default') {
  localStorage.setItem(pinnedKey(accountKey), JSON.stringify(Array.from(new Set(ids))));
}

function hdr(headers: { name: string; value: string }[], name: string) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseNameEmail(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2] };
  return { name: '', email: raw.trim() };
}

function extractBody(payload: any): { html: string; text: string } {
  let html = '', text = '';
  const walk = (p: any) => {
    if (!p) return;
    const mt = p.mimeType || '';
    if (mt === 'text/html' && p.body?.data && !html) html = b64d(p.body.data);
    else if (mt === 'text/plain' && p.body?.data && !text) text = b64d(p.body.data);
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload);
  return { html, text };
}

function parseGmailMessage(msg: any): ParsedEmail {
  const headers = msg.payload?.headers || [];
  const from = hdr(headers, 'From');
  const { name: fromName, email: fromEmail } = parseNameEmail(from);
  const { html, text } = extractBody(msg.payload || {});
  const dateRaw = hdr(headers, 'Date');
  const date = dateRaw
    ? new Date(dateRaw).toISOString()
    : new Date(Number(msg.internalDate || 0)).toISOString();
  const hasAtt = (function chk(parts: any[]): boolean {
    return (parts || []).some(p => (p.filename && p.filename.length > 0) || chk(p.parts || []));
  })(msg.payload?.parts || []);
  return {
    id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds || [],
    from: fromEmail, fromName,
    to: hdr(headers, 'To'), cc: hdr(headers, 'Cc'),
    subject: hdr(headers, 'Subject') || '(Sin asunto)',
    snippet: msg.snippet || '', date,
    isRead: !(msg.labelIds || []).includes('UNREAD'),
    isStarred: (msg.labelIds || []).includes('STARRED'),
    bodyHtml: html, bodyText: text, hasAttachments: hasAtt,
    source: 'gmail',
    isPinned: readPinnedEmailIds().includes(String(msg.id)),
  };
}

function mapFolderToImapApi(
  folder: FolderKey,
  imapFolderMap?: Partial<Record<ImapSystemFolderKey, string>>,
): string {
  const fallback: Record<string, string> = {
    INBOX: 'INBOX',
    SENT: 'Sent',
    DRAFTS: 'Drafts',
    TRASH: 'Trash',
    SPAM: 'Spam',
    ARCHIVE: 'Archive',
  };
  return imapFolderMap?.[folder as ImapSystemFolderKey] || fallback[folder] || folder;
}

function parseImapEmail(row: ImapApiEmail): ParsedEmail {
  return {
    id: row.id,
    labelIds: row.folder ? [row.folder] : [],
    from: row.from_email || '',
    fromName: row.from_name || '',
    to: row.to_emails || '',
    cc: row.cc_emails || '',
    subject: row.subject || '(Sin asunto)',
    snippet: row.snippet || '',
    date: row.sent_at || new Date().toISOString(),
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    bodyHtml: row.body_html || '',
    bodyText: row.body_text || '',
    hasAttachments: Boolean(row.has_attachments),
    source: 'imap',
    isPinned: readPinnedEmailIds().includes(String(row.id)),
  };
}

function fmtDate(d: string | null) {
  if (!d) return '';
  const dt = new Date(d), now = new Date();
  if (dt.toDateString() === now.toDateString())
    return dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (dt.getFullYear() === now.getFullYear())
    return dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtFull(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function initials(name: string, email: string) {
  if (name?.trim()) {
    const p = name.trim().split(/\s+/);
    return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777'];
function avatarBg(str: string) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function normalizeRecipients(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function replaceLastRecipient(value: string, nextValue: string): string {
  const parts = value.split(/[;,]/);
  if (parts.length <= 1) return `${nextValue}, `;
  parts[parts.length - 1] = ` ${nextValue}`;
  return `${parts.join(',').replace(/\s+/g, ' ').trim()}, `;
}

function buildRaw({ from, fromName, to, cc, bcc, subject, body, inReplyTo, attachments = [] }: {
  from: string; fromName?: string; to: string; cc?: string; bcc?: string;
  subject: string; body: string; inReplyTo?: string;
  attachments?: ComposeAttachment[];
}): string {
  const boundaryMixed = `mix_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const boundaryAlt = `alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${fromName ? `${fromName} <${from}>` : from}`,
    `To: ${to}`,
    ...(cc  ? [`Cc: ${cc}`]   : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    '',
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()))),
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(body))),
    '',
    `--${boundaryAlt}--`,
    ...attachments.flatMap((attachment) => [
      '',
      `--${boundaryMixed}`,
      `Content-Type: ${attachment.type || 'application/octet-stream'}; name="${attachment.name.replace(/"/g, '')}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.name.replace(/"/g, '')}"`,
      '',
      attachment.dataBase64,
    ]),
    '',
    `--${boundaryMixed}--`,
  ];
  return btoa(unescape(encodeURIComponent(lines.join('\r\n'))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Avatar Component ─────────────────────────────────────────────────────────

function Avatar({
  name, email, size = 36, src,
}: { name: string; email: string; size?: number; src?: string }) {
  if (src) {
    return (
      <img
        src={src}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
        }}
        alt={name}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, background: avatarBg(email),
        borderRadius: '50%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
        color: 'white', fontSize: size * 0.38, fontWeight: 700,
      }}>
      {initials(name, email)}
    </div>
  );
}

// ─── Compose Window ───────────────────────────────────────────────────────────

function ComposeWindow({
  data, fromEmail, fromName, gmail, accountId, getToken, onClose, onSent,
}: {
  data: ComposeData;
  fromEmail: string;
  fromName: string;
  gmail: GmailService | null;
  accountId?: string | null;
  getToken: () => Promise<string>;
  onClose: (draft?: ComposeData) => void;
  onSent: (draftId?: string) => void;
}) {
  const [to, setTo]         = useState(data.to);
  const [cc, setCc]         = useState(data.cc);
  const [bcc, setBcc]       = useState(data.bcc);
  const [subject, setSubject] = useState(data.subject);
  const [showCc, setShowCc]   = useState(!!data.cc);
  const [showBcc, setShowBcc] = useState(!!data.bcc);
  const [minimized, setMinimized] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [recipientField, setRecipientField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildDraftPayload = useCallback((): ComposeData | null => {
    const body = bodyRef.current?.innerHTML || data.body || '';
    const hasContent = [to, cc, bcc, subject, body.replace(/<[^>]+>/g, '').trim()].some(Boolean);
    if (!hasContent) return null;
    return {
      draftId: data.draftId || `draft-${Date.now()}`,
      to,
      cc,
      bcc,
      subject,
      body,
      replyToId: data.replyToId,
    };
  }, [bcc, cc, data.body, data.draftId, data.replyToId, subject, to]);

  // Initialize contenteditable body
  useEffect(() => {
    if (bodyRef.current && data.body) {
      bodyRef.current.innerHTML = data.body;
    }
  }, []); // eslint-disable-line

  const activeRecipientValue = recipientField === 'to'
    ? to
    : recipientField === 'cc'
      ? cc
      : recipientField === 'bcc'
        ? bcc
        : '';

  useEffect(() => {
    if (!recipientField) {
      setSuggestions([]);
      return;
    }

    const rawTerm = activeRecipientValue.split(/[;,]/).pop()?.trim() || '';
    const handle = window.setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/email/contacts/suggestions?q=${encodeURIComponent(rawTerm)}&limit=8`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (res.ok && payload?.success) setSuggestions(payload.data || []);
      } catch {
        setSuggestions([]);
      }
    }, 180);

    return () => window.clearTimeout(handle);
  }, [activeRecipientValue, getToken, recipientField]);

  const applySuggestion = (field: 'to' | 'cc' | 'bcc', suggestion: RecipientSuggestion) => {
    const nextValue = suggestion.name && suggestion.name !== suggestion.email
      ? `${suggestion.name} <${suggestion.email}>`
      : suggestion.email;

    if (field === 'to') setTo((prev) => replaceLastRecipient(prev, nextValue));
    if (field === 'cc') setCc((prev) => replaceLastRecipient(prev, nextValue));
    if (field === 'bcc') setBcc((prev) => replaceLastRecipient(prev, nextValue));
    setSuggestions([]);
    setRecipientField(null);
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;

    const loaded = await Promise.all(
      Array.from(files).map((file) => new Promise<ComposeAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve({
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            dataBase64: result.split(',')[1] || '',
          });
        };
        reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
        reader.readAsDataURL(file);
      })),
    );

    setAttachments((prev) => [...prev, ...loaded]);
  };

  const handleSend = async () => {
    if (!to.trim())      { setError('Añade al menos un destinatario'); return; }
    if (!subject.trim()) { setError('El asunto está vacío'); return; }
    if (!gmail && !accountId) { setError('Selecciona o configura una cuenta IMAP/SMTP para enviar'); return; }
    setSending(true); setError('');
    try {
      const html = bodyRef.current?.innerHTML || '';
      if (gmail) {
        const raw = buildRaw({
          from: fromEmail, fromName, to, cc, bcc, subject, body: html,
          inReplyTo: data.replyToId,
          attachments,
        });
        await gmail.sendMessage(raw);
        const token = await getToken();
        await fetch(`${API}/email/gmail/log-sent`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            cc,
            bcc,
            subject,
            snippet: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
            has_attachments: attachments.length > 0,
          }),
        }).catch(() => {});
      } else {
        const token = await getToken();
        const res = await fetch(`${API}/email/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: accountId, to, cc, bcc, subject, html }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Error al enviar');
      }
      setSent(true);
      setTimeout(() => onSent(data.draftId), 800);
    } catch (e: any) { setError(e.message); }
    finally { setSending(false); }
  };

  if (sent) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 flex items-center gap-3">
        <CheckCircle2 className="text-green-500" size={22} />
        <span className="text-sm font-medium text-gray-700">Mensaje enviado</span>
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-0 right-6 z-50 bg-white rounded-t-2xl shadow-2xl border border-gray-200 transition-all duration-200 ${minimized ? 'h-12 w-72' : 'w-[560px]'}`}
      style={{ maxHeight: minimized ? 48 : '85vh' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-t-2xl cursor-pointer select-none"
        onClick={() => setMinimized(m => !m)}>
        <span className="text-white text-sm font-medium truncate pr-2">
          {subject || 'Nuevo mensaje'}
        </span>
        <div className="flex items-center gap-2 text-gray-300">
          <ChevronDown size={16} className={`transition-transform ${minimized ? 'rotate-180' : ''}`} />
          <button
            onClick={e => { e.stopPropagation(); onClose(buildDraftPayload() || undefined); }}
            className="hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="flex flex-col" style={{ maxHeight: 'calc(85vh - 48px)' }}>
          {/* From */}
          <div className="border-b border-gray-100 px-4 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-6 flex-shrink-0">De</span>
              <span className="text-sm text-gray-700 truncate">
                {fromName ? `${fromName} <${fromEmail}>` : fromEmail}
              </span>
            </div>
          </div>
          {/* To */}
          <div className="border-b border-gray-100 px-4">
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-xs text-gray-400 w-6 flex-shrink-0">Para</span>
              <input
                value={to}
                onFocus={() => setRecipientField('to')}
                onChange={e => { setTo(e.target.value); setRecipientField('to'); }}
                placeholder="Destinatarios"
                className="flex-1 text-sm outline-none placeholder-gray-300 min-w-0" />
              <button
                onClick={() => setShowCc(s => !s)}
                className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Cc</button>
              <button
                onClick={() => setShowBcc(s => !s)}
                className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Bcc</button>
            </div>
          </div>
          {recipientField && suggestions.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-white">
              <div className="rounded-xl border border-red-100 bg-red-50/70 overflow-hidden">
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.email}-${suggestion.source}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySuggestion(recipientField, suggestion)}
                    className="w-full px-3 py-2 text-left hover:bg-red-100 transition-colors border-b border-red-100 last:border-b-0">
                    <p className="text-sm font-medium text-gray-800">{suggestion.name || suggestion.email}</p>
                    <p className="text-xs text-gray-500">
                      {suggestion.email}
                      {suggestion.source ? ` · ${suggestion.source}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {showCc && (
            <div className="border-b border-gray-100 px-4">
              <div className="flex items-center gap-2 py-1.5">
                <span className="text-xs text-gray-400 w-6 flex-shrink-0">Cc</span>
                <input value={cc} onFocus={() => setRecipientField('cc')} onChange={e => { setCc(e.target.value); setRecipientField('cc'); }} placeholder="Copias"
                  className="flex-1 text-sm outline-none placeholder-gray-300" />
              </div>
            </div>
          )}
          {showBcc && (
            <div className="border-b border-gray-100 px-4">
              <div className="flex items-center gap-2 py-1.5">
                <span className="text-xs text-gray-400 w-6 flex-shrink-0">Bcc</span>
                <input value={bcc} onFocus={() => setRecipientField('bcc')} onChange={e => { setBcc(e.target.value); setRecipientField('bcc'); }} placeholder="Copia oculta"
                  className="flex-1 text-sm outline-none placeholder-gray-300" />
              </div>
            </div>
          )}
          {/* Subject */}
          <div className="border-b border-gray-100 px-4">
            <input
              value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Asunto"
              className="w-full text-sm outline-none py-2 placeholder-gray-300" />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-4 py-3" style={{ minHeight: 140 }}>
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              className="outline-none text-sm text-gray-800 leading-relaxed"
              style={{ fontFamily: 'inherit', minHeight: 120 }}
            />
          </div>

          {attachments.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <div
                  key={`${attachment.name}-${index}`}
                  className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs text-gray-700">
                  <Paperclip size={12} className="text-[#ab0433]" />
                  <span>{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    className="text-gray-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="px-4 pb-2">
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} /> {error}
              </p>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100">
            <button
              onClick={handleSend} disabled={sending}
              className="flex items-center gap-2 bg-[#ab0433] hover:bg-[#8f022a] text-white text-sm font-medium px-5 py-2 rounded-full transition-colors disabled:opacity-60">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Enviar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                handleFilesSelected(event.target.files).catch((e: Error) => setError(e.message));
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-[#ab0433] hover:bg-red-50 rounded-full">
              <Paperclip size={16} />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => onClose()}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-full">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type FolderKey =
  | 'INBOX'
  | 'STARRED'
  | 'PINNED'
  | 'ALL'
  | 'SNOOZED'
  | 'IMPORTANT'
  | 'SENT'
  | 'DRAFTS'
  | 'SCHEDULED'
  | 'SPAM'
  | 'TRASH'
  | string;

const SYSTEM_FOLDERS: {
  key: FolderKey; label: string; icon: LucideIcon;
}[] = [
  { key: 'INBOX',   label: 'Recibidos',        icon: Inbox    },
  { key: 'STARRED', label: 'Destacados',       icon: Star     },
  { key: 'SNOOZED', label: 'Pospuestos',       icon: RotateCcw },
  { key: 'PINNED',  label: 'Pineados',         icon: Pin      },
  { key: 'IMPORTANT', label: 'Importantes',    icon: AlertCircle },
  { key: 'SENT',    label: 'Enviados',         icon: Send     },
  { key: 'DRAFTS',  label: 'Borradores',       icon: FileText },
  { key: 'SCHEDULED', label: 'Programados',    icon: Send     },
  { key: 'ALL',     label: 'Todos',            icon: Mail     },
  { key: 'SPAM',    label: 'Spam',             icon: Shield   },
  { key: 'TRASH',   label: 'Papelera',         icon: Trash2   },
  { key: 'ARCHIVE', label: 'Archivo',          icon: Archive  },
];

// ─── Connect Account Modal ────────────────────────────────────────────────────

function ConnectAccountModal({
  savedGmailProfiles, onConnectNewGmail, onReconnectProfile, onAddImap, onClose,
}: {
  savedGmailProfiles: SavedOAuthProfile[];
  onConnectNewGmail: () => void;
  onReconnectProfile: (profile: SavedOAuthProfile) => void;
  onAddImap: () => void;
  onClose: () => void;
}) {
  const GoogleIcon = () => (
    <svg width={18} height={18} viewBox="0 0 24 24" className="flex-shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Conectar cuenta de correo</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {savedGmailProfiles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cuentas guardadas</p>
              <div className="space-y-1">
                {savedGmailProfiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => { onReconnectProfile(profile); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-left">
                    <GoogleIcon />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{profile.display_name || profile.email}</p>
                      <p className="text-xs text-gray-400 truncate">{profile.email}</p>
                    </div>
                    <RotateCcw size={14} className="text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={savedGmailProfiles.length > 0 ? 'border-t border-gray-100 pt-3' : ''}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nueva cuenta</p>
            {GMAIL_CLIENT_ID && (
              <button
                type="button"
                onClick={() => { onConnectNewGmail(); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-gray-100 hover:border-red-200 hover:bg-red-50 transition-all text-left">
                <GoogleIcon />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-800">Google / Gmail</p>
                  <p className="text-xs text-gray-400">OAuth seguro — sin contraseñas</p>
                </div>
                <Zap size={14} className="text-yellow-500 flex-shrink-0" />
              </button>
            )}
            <button
              type="button"
              onClick={() => { onAddImap(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all text-left mt-2">
              <AtSign size={18} className="text-gray-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-gray-800">IMAP / POP3</p>
                <p className="text-xs text-gray-400">Outlook, corporativo, dominio propio...</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  userEmail, userName, userAvatar, gmailProfile, gmailConnected, savedGmailProfiles, labels,
  selectedFolder, onSelectFolder, onCompose, onDisconnectGmail,
  onReconnectGoogleProfile, onDeleteGoogleProfile, onConnectAccount,
  onSync, syncing, unreadCount, draftCount, pinnedCount, imapAccounts, selectedImapAccountId,
  imapFolders, imapSystemFolderMap, onSelectGmail, onSelectImapAccount,
  onCreateLabel, onDeleteLabel,
  onCreateImapFolder, onDeleteImapAccount, canUseMailbox,
}: {
  userEmail: string; userName: string; userAvatar?: string;
  gmailProfile: GmailProfile | null; gmailConnected: boolean;
  savedGmailProfiles: SavedOAuthProfile[];
  labels: GmailLabel[]; selectedFolder: FolderKey;
  onSelectFolder: (f: FolderKey) => void; onCompose: () => void;
  onDisconnectGmail: () => void;
  onReconnectGoogleProfile: (profile: SavedOAuthProfile) => void;
  onDeleteGoogleProfile: (profileId: string) => void;
  onConnectAccount: () => void;
  onSync: () => void; syncing: boolean;
  unreadCount: number; draftCount: number; pinnedCount: number;
  imapAccounts: ImapAccount[];
  selectedImapAccountId: string | null;
  imapFolders: ImapFolderInfo[];
  imapSystemFolderMap: Partial<Record<ImapSystemFolderKey, string>>;
  onSelectGmail: () => void;
  onSelectImapAccount: (accountId: string) => void;
  onCreateLabel: () => void;
  onDeleteLabel: (labelId: string) => void;
  onCreateImapFolder: () => void;
  onDeleteImapAccount: (accountId: string) => void;
  canUseMailbox: boolean;
}) {
  const userLabels = labels.filter(l => l.type === 'user');
  const categoryLabels = labels.filter((label) =>
    label.type === 'system' &&
    ['CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS', 'CATEGORY_PERSONAL'].includes(label.id),
  );
  const extraGmailSystemLabels = labels.filter((label) =>
    label.type === 'system' &&
    !['INBOX', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'CHAT', 'SNOOZED', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS', 'CATEGORY_PERSONAL'].includes(label.id),
  );
  const isImapActive = Boolean(selectedImapAccountId);
  const isGmailActive = gmailConnected && !isImapActive;
  const visibleSystemFolders = SYSTEM_FOLDERS.filter((folder) => {
    // PINNED y SNOOZED son exclusivos de Gmail OAuth — no están disponibles via IMAP
    if (!isGmailActive && (folder.key === 'PINNED' || folder.key === 'SNOOZED')) return false;
    if (!isImapActive) return true;
    if (folder.key === 'STARRED') return true;
    if (folder.key === 'ALL' || folder.key === 'IMPORTANT') return false;
    if (folder.key === 'INBOX') return true;
    return Boolean(imapSystemFolderMap[folder.key as ImapSystemFolderKey]);
  });
  const gmailBadgeByFolder = new Map(
    labels.map((label) => [label.id, Number(label.messagesUnread ?? label.messagesTotal ?? 0)]),
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white border-r border-gray-200">
      {/* User info */}
      <div className="px-4 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar name={userName} email={userEmail} src={userAvatar} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{userName}</p>
            <p className="text-xs text-gray-400 truncate">
              {isImapActive
                ? (imapAccounts.find(a => a.id === selectedImapAccountId)?.email || userEmail)
                : (gmailProfile?.emailAddress || userEmail)}
            </p>
          </div>
        </div>
        {/* Compose */}
        <button
          onClick={onCompose}
          disabled={!canUseMailbox}
          className="mt-3 w-full flex items-center gap-2 bg-[#ab0433] hover:bg-[#8f022a] text-white text-sm font-medium px-4 py-2.5 rounded-full transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
          <Edit3 size={15} /> Redactar
        </button>
      </div>


      {/* Folder list — PINNED solo si hay Gmail activo */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleSystemFolders.map(({ key, label, icon: Icon }) => {
          const active = selectedFolder === key;
          const badge = key === 'INBOX'
            ? unreadCount
            : key === 'DRAFTS'
              ? draftCount
              : key === 'PINNED'
                ? pinnedCount
                : gmailConnected && !isImapActive
                  ? Number(gmailBadgeByFolder.get(key === 'DRAFTS' ? 'DRAFT' : key) || 0)
                  : 0;
          return (
            <button
              key={key}
              disabled={!canUseMailbox}
              onClick={() => onSelectFolder(key)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-red-50 text-[#ab0433] font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}>
              <Icon size={16} className={active ? 'text-[#ab0433]' : 'text-gray-400'} />
              <span className="flex-1 text-left">{label}</span>
              {badge > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-[#ab0433] text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}

        {/* User labels */}
        {isGmailActive && userLabels.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="px-4 pb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Carpetas
              </p>
              <button
                type="button"
                disabled={!canUseMailbox}
                onClick={() => onCreateLabel()}
                className="p-1 rounded-full text-gray-400 hover:text-[#ab0433] hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title="Crear carpeta">
                <FolderPlus size={14} />
              </button>
            </div>
            {userLabels.map(l => (
              <div
                key={l.id}
                className={`group w-full flex items-center gap-3 px-4 py-1.5 text-sm transition-colors ${
                  selectedFolder === l.id ? 'bg-red-50 text-[#ab0433]' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <button
                  type="button"
                  disabled={!canUseMailbox}
                  onClick={() => onSelectFolder(l.id)}
                  className="flex flex-1 min-w-0 items-center gap-3 text-left disabled:cursor-not-allowed">
                  <Folder size={14} className={selectedFolder === l.id ? 'text-[#ab0433]' : 'text-gray-400'} />
                  <span className="flex-1 truncate">{normalizeLabelName(l.name, l.id)}</span>
                  {l.messagesUnread ? (
                    <span className="text-xs text-gray-400">{l.messagesUnread}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={!canUseMailbox}
                  onClick={() => onDeleteLabel(l.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-[#ab0433] hover:bg-red-50 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Borrar carpeta">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {userLabels.length === 0 && isGmailActive && (
          <div className="mt-2 pt-2 border-t border-gray-100 px-4">
            <button
              type="button"
              disabled={!canUseMailbox}
              onClick={() => onCreateLabel()}
              className="w-full flex items-center gap-2 rounded-xl border border-dashed border-red-200 px-3 py-2 text-xs text-[#ab0433] hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
              <FolderPlus size={14} />
              Crear primera carpeta
            </button>
          </div>
        )}

        {isGmailActive && extraGmailSystemLabels.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="px-4 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Gmail
              </p>
            </div>
            {extraGmailSystemLabels.map((label) => (
              <button
                key={label.id}
                type="button"
                disabled={!canUseMailbox}
                onClick={() => onSelectFolder(label.id)}
                className={`w-full flex items-center gap-3 px-4 py-1.5 text-sm transition-colors ${
                  selectedFolder === label.id ? 'bg-red-50 text-[#ab0433] font-medium' : 'text-gray-600 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}>
                <Tag size={14} className={selectedFolder === label.id ? 'text-[#ab0433]' : 'text-gray-400'} />
                <span className="flex-1 truncate text-left">{normalizeLabelName(label.name, label.id)}</span>
                {Number(label.messagesUnread ?? label.messagesTotal ?? 0) > 0 && (
                  <span className="text-xs text-gray-400">
                    {Number(label.messagesUnread ?? label.messagesTotal ?? 0)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {isGmailActive && categoryLabels.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="px-4 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Categorías
              </p>
            </div>
            {categoryLabels.map((label) => (
              <button
                key={label.id}
                type="button"
                disabled={!canUseMailbox}
                onClick={() => onSelectFolder(label.id)}
                className={`w-full flex items-center gap-3 px-4 py-1.5 text-sm transition-colors ${
                  selectedFolder === label.id ? 'bg-red-50 text-[#ab0433] font-medium' : 'text-gray-600 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}>
                <Tag size={14} className={selectedFolder === label.id ? 'text-[#ab0433]' : 'text-gray-400'} />
                <span className="flex-1 truncate text-left">{normalizeLabelName(label.name, label.id)}</span>
                {Number(label.messagesUnread ?? label.messagesTotal ?? 0) > 0 && (
                  <span className="text-xs text-gray-400">
                    {Number(label.messagesUnread ?? label.messagesTotal ?? 0)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {isGmailActive && (
            <div className="mt-2 pt-2 border-t border-gray-100 px-4 space-y-1">
              <button
                type="button"
                disabled={!canUseMailbox}
                onClick={() => onSelectFolder('SCHEDULED')}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-[#ab0433] transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
                <Send size={14} />
                Gestionar suscripciones
              </button>
              <button
                type="button"
                disabled={!canUseMailbox}
                onClick={() => onCreateLabel()}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-[#ab0433] transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
                <Tag size={14} />
              Gestionar etiquetas
            </button>
            <button
              type="button"
              onClick={() => onCreateLabel()}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-[#ab0433] transition-colors">
              <Plus size={14} />
              Nueva etiqueta
            </button>
          </div>
        )}

        {/* Otras cuentas — Gmail + IMAP unificados */}
        {(savedGmailProfiles.length > 0 || imapAccounts.length > 0) && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="px-4 pb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Otras cuentas</p>
            </div>

            {/* Cuentas Gmail guardadas */}
            {savedGmailProfiles.map(profile => {
              const isActive = gmailConnected && gmailProfile?.emailAddress === profile.email && !selectedImapAccountId;
              // Token válido pero viendo otra cuenta (IMAP activo) → cambio silencioso
              const tokenOk = gmailConnected && gmailProfile?.emailAddress === profile.email;
              // Token expirado o es otra cuenta → necesita re-auth
              const needsReauth = !isActive && !tokenOk;
              return (
                <div
                  key={profile.id}
                  className={`group flex items-center gap-1 px-2 py-1 rounded-xl mx-2 transition-colors ${
                    isActive ? 'bg-red-50' : 'hover:bg-gray-50'
                  }`}>
                  <button
                    type="button"
                    onClick={() => isActive ? onSelectGmail() : onReconnectGoogleProfile(profile)}
                    title={needsReauth ? 'Sesión expirada — haz clic para volver a conectar' : undefined}
                    className="flex flex-1 items-center gap-2 min-w-0 px-2 py-1 text-left">
                    <svg width={13} height={13} viewBox="0 0 24 24" className="flex-shrink-0">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium truncate ${isActive ? 'text-[#ab0433]' : 'text-gray-700'}`}>
                        {profile.display_name || profile.email}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{profile.email}</p>
                    </div>
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
                    {needsReauth && (
                      <span title="Sesión expirada"><AlertCircle size={12} className="text-orange-400 flex-shrink-0" /></span>
                    )}
                  </button>
                  {isActive && (
                    <>
                      <button onClick={onSync} disabled={syncing} title="Sincronizar"
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#ab0433] hover:bg-red-100 rounded-md transition-all flex-shrink-0">
                        <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                      </button>
                      <button onClick={onDisconnectGmail} title="Desconectar"
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-md transition-all flex-shrink-0">
                        <LogIn size={12} className="rotate-180" />
                      </button>
                    </>
                  )}
                  {!isActive && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteGoogleProfile(profile.id); }}
                      title="Borrar cuenta guardada"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-[#ab0433] hover:bg-red-50 transition-all flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                  {!isActive && !needsReauth && (
                    <RotateCcw size={12} className="opacity-0 group-hover:opacity-100 text-gray-400 flex-shrink-0 mr-1" />
                  )}
                </div>
              );
            })}

            {/* Cuentas IMAP */}
            {imapAccounts.map(acc => (
              <div
                key={acc.id}
                className={`group flex items-center gap-1 px-2 py-1 rounded-xl mx-2 transition-colors ${
                  selectedImapAccountId === acc.id ? 'bg-red-50 text-[#ab0433]' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <button
                  type="button"
                  onClick={() => onSelectImapAccount(acc.id)}
                  className="flex flex-1 items-center gap-2 min-w-0 px-2 py-1 text-left">
                  <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{acc.label || acc.email}</p>
                    <p className="text-[11px] text-gray-400 truncate">{acc.email}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteImapAccount(acc.id); }}
                  title="Borrar cuenta"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-[#ab0433] hover:bg-red-50 transition-all flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedImapAccountId && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="px-4 pb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Carpetas IMAP
              </p>
              <button
                type="button"
                disabled={!canUseMailbox}
                onClick={onCreateImapFolder}
                className="p-1 rounded-full text-gray-400 hover:text-[#ab0433] hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title="Crear carpeta IMAP">
                <FolderPlus size={14} />
              </button>
            </div>
            {imapFolders.length > 0 ? (
              imapFolders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  disabled={!canUseMailbox}
                  onClick={() => onSelectFolder(folder.path)}
                  className={`w-full flex items-center gap-3 px-4 py-1.5 text-sm transition-colors ${
                    selectedFolder === folder.path
                      ? 'bg-red-50 text-[#ab0433]'
                      : 'text-gray-600 hover:bg-gray-50'
                  } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}>
                  <Folder size={14} className={selectedFolder === folder.path ? 'text-[#ab0433]' : 'text-gray-400'} />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-2 text-xs text-gray-400">
                No hay carpetas personalizadas en esta cuenta.
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Conectar cuenta */}
      <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={onConnectAccount}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-[#ab0433] hover:bg-red-50 rounded-lg transition-colors">
          <Plus size={14} /> Conectar cuenta
        </button>
      </div>
    </div>
  );
}

// ─── Email List Item ──────────────────────────────────────────────────────────

function EmailItem({
  email, selected, onClick, onStar,
}: {
  email: ParsedEmail; selected: boolean;
  onClick: () => void;
  onStar: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 transition-colors ${
        selected
          ? 'bg-blue-50'
          : email.isRead
          ? 'bg-white hover:bg-gray-50'
          : 'bg-white hover:bg-gray-50'
      }`}
      style={{ borderLeft: selected ? '4px solid #4f46e5' : '4px solid transparent' }}>

      {/* Avatar */}
      <div className="mt-0.5 flex-shrink-0">
        <Avatar name={email.fromName} email={email.from} size={36} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${!email.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
            {email.fromName || email.from}
          </span>
          <span className={`text-xs flex-shrink-0 ${!email.isRead ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
            {fmtDate(email.date)}
          </span>
        </div>
        <div className="flex items-center gap-1 mb-0.5">
          <span className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
            {email.subject}
          </span>
          {email.hasAttachments && (
            <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-gray-400 truncate">{email.snippet}</p>
      </div>

      {/* Star */}
      <button
        onClick={onStar}
        className={`mt-1 flex-shrink-0 transition-colors ${
          email.isStarred
            ? 'text-yellow-400'
            : hovered
            ? 'text-gray-300 hover:text-yellow-300'
            : 'text-transparent'
        }`}>
        <Star size={15} fill={email.isStarred ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

// ─── Email Reader ─────────────────────────────────────────────────────────────

function EmailReader({
  email, onReply, onReplyAll, onForward, onDelete, onStar, onBack,
  onPin, onRestore, onAssignLabel, onCreateLabel, userLabels,
}: {
  email: ParsedEmail;
  onReply: () => void; onReplyAll: () => void; onForward: () => void;
  onDelete: () => void; onStar: () => void; onBack: () => void;
  onPin: () => void;
  onRestore?: () => void;
  onAssignLabel: (labelId: string) => void;
  onCreateLabel: () => void;
  userLabels: GmailLabel[];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeH, setIframeH] = useState(300);
  const [showRaw, setShowRaw] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const bodyContent = email.bodyHtml
      || (email.bodyText
        ? `<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word">${email.bodyText.replace(/</g, '&lt;')}</pre>`
        : '<p style="color:#9ca3af">Sin contenido</p>');
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       font-size:15px;color:#1f2937;margin:0;padding:0;line-height:1.7;background:#fff}
  a{color:#ab0433}img{max-width:100%;height:auto}
  *{box-sizing:border-box}
  blockquote{border-left:3px solid #e2e8f0;margin:10px 0;padding:4px 14px;color:#64748b}
  table{max-width:100%!important}
</style></head><body>${bodyContent}</body></html>`);
    doc.close();
    const measure = () => {
      const h = doc.body?.scrollHeight;
      if (h) setIframeH(h + 24);
    };
    setTimeout(measure, 150);
    iframe.onload = measure;
  }, [email.id, email.bodyHtml, email.bodyText]);

  const statusPills = [
    !email.isRead ? { label: 'Nuevo', className: 'bg-red-50 text-[#ab0433] border-red-100' } : null,
    email.source === 'gmail'
      ? { label: 'Gmail', className: 'bg-blue-50 text-blue-700 border-blue-100' }
      : { label: 'ERP', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    email.hasAttachments
      ? { label: 'Adjuntos', className: 'bg-amber-50 text-amber-700 border-amber-100' }
      : null,
  ].filter(Boolean) as Array<{ label: string; className: string }>;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#f6f8fb]">
      <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-200 bg-white/95 backdrop-blur flex-shrink-0">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />
        <button
          onClick={onReply}
          className="p-2 rounded-full hover:bg-red-50 text-slate-500 hover:text-[#ab0433] transition-colors"
          title="Responder">
          <Reply size={17} />
        </button>
        <button
          onClick={onReplyAll}
          className="p-2 rounded-full hover:bg-red-50 text-slate-500 hover:text-[#ab0433] transition-colors"
          title="Responder a todos">
          <ReplyAll size={17} />
        </button>
        <button
          onClick={onForward}
          className="p-2 rounded-full hover:bg-red-50 text-slate-500 hover:text-[#ab0433] transition-colors"
          title="Reenviar">
          <Forward size={17} />
        </button>
        <button
          onClick={onPin}
          className={`p-2 rounded-full transition-colors ${
            email.isPinned
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
          }`}
          title={email.isPinned ? 'Despinear' : 'Pinear'}>
          <Pin size={17} />
        </button>
        <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={onStar}
            className={`p-2 rounded-full hover:bg-amber-50 transition-colors ${
              email.isStarred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
            }`}>
            <Star size={17} fill={email.isStarred ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-full hover:bg-red-50 text-slate-400 hover:text-[#ab0433] transition-colors">
            <Trash2 size={17} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMoreOpen((m) => !m)}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
              <MoreVertical size={17} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-10 z-20 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 w-56">
                <button
                  onClick={() => { setShowRaw((r) => !r); setMoreOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  {showRaw ? 'Ver HTML renderizado' : 'Ver texto plano'}
                </button>
                <button
                  onClick={() => { onPin(); setMoreOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  {email.isPinned ? 'Despinear correo' : 'Pinear correo'}
                </button>
                {onRestore && (
                  <button
                    onClick={() => { onRestore(); setMoreOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                    Restaurar desde papelera
                  </button>
                )}
                {userLabels.length > 0 && (
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    {userLabels.slice(0, 6).map((label) => (
                      <button
                        key={label.id}
                        onClick={() => { onAssignLabel(label.id); setMoreOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                        Guardar en {label.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { onCreateLabel(); setMoreOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#ab0433] hover:bg-red-50">
                  Crear carpeta nueva
                </button>
                <button
                  onClick={() => { setMoreOpen(false); window.print(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  Imprimir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1160px] mx-auto px-6 py-6 lg:px-8">
          <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] overflow-hidden">
            <div className="px-8 pt-8 pb-6 border-b border-slate-100 bg-gradient-to-br from-white via-white to-red-50/30">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {statusPills.map((pill) => (
                      <span
                        key={pill.label}
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${pill.className}`}>
                        {pill.label}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-[-0.02em]">
                    {email.subject}
                  </h1>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400 mb-1">Recibido</p>
                  <p className="text-sm text-slate-600">{fmtFull(email.date)}</p>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-4">
                <Avatar name={email.fromName} email={email.from} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-slate-900">
                      {email.fromName || email.from}
                    </span>
                    {email.fromName && (
                      <span className="text-sm text-slate-400">&lt;{email.from}&gt;</span>
                    )}
                  </div>
                  <button
                    onClick={() => setDetailsOpen((d) => !d)}
                    className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                    <span>{email.to ? `para ${email.to.split(',')[0].trim()}` : 'ver destinatarios'}</span>
                    <ChevronDown size={14} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {detailsOpen && (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 space-y-1.5">
                      <p><span className="font-medium text-slate-400 mr-2">De:</span>{email.fromName ? `${email.fromName} <${email.from}>` : email.from}</p>
                      {email.to && (
                        <p><span className="font-medium text-slate-400 mr-2">Para:</span>{email.to}</p>
                      )}
                      {email.cc && (
                        <p><span className="font-medium text-slate-400 mr-2">Cc:</span>{email.cc}</p>
                      )}
                      <p><span className="font-medium text-slate-400 mr-2">Fecha:</span>{fmtFull(email.date)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 py-8 bg-[radial-gradient(circle_at_top,_rgba(171,4,51,0.03),_transparent_42%)]">
              <div className="mx-auto max-w-[760px] rounded-[30px] border border-slate-200/80 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.05)] overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail size={16} className="text-[#ab0433]" />
                    <span>Contenido del correo</span>
                  </div>
                  {email.hasAttachments && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      <Paperclip size={13} />
                      Adjuntos detectados
                    </div>
                  )}
                </div>

                <div className="px-6 py-6">
                  {showRaw ? (
                    <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                      {email.bodyText || email.bodyHtml?.replace(/<[^>]+>/g, '') || '(Sin contenido)'}
                    </pre>
                  ) : (
                    <iframe
                      ref={iframeRef}
                      title="email-body"
                      sandbox="allow-same-origin"
                      style={{ width: '100%', height: iframeH, border: 'none', display: 'block', background: 'white' }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 flex items-center gap-2 flex-wrap">
              <button
                onClick={onReply}
                className="flex items-center gap-2 px-4 py-2.5 border border-red-200 bg-red-50 hover:bg-red-100 text-sm font-medium text-[#ab0433] rounded-full transition-colors">
                <Reply size={15} /> Responder
              </button>
              <button
                onClick={onReplyAll}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-sm text-slate-600 hover:text-[#ab0433] rounded-full transition-colors">
                <ReplyAll size={15} /> Responder a todos
              </button>
              <button
                onClick={onForward}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-sm text-slate-600 hover:text-[#ab0433] rounded-full transition-colors">
                <Forward size={15} /> Reenviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Connect Wizard ───────────────────────────────────────────────────────────

function ConnectWizard({
  onConnectGoogle, onConnectOutlook, googleClientId,
}: {
  onConnectGoogle: () => void;
  onConnectOutlook: () => void;
  googleClientId?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-8">
      <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-6">
        <Mail size={32} className="text-[#ab0433]" strokeWidth={2.2} />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Conecta tu correo</h2>
      <p className="text-sm text-gray-500 text-center mb-8 max-w-sm">
        Conecta tu cuenta con un clic. Sin introducir contraseñas.
      </p>

      <div className="w-full max-w-sm space-y-3">
        {/* Gmail */}
        {googleClientId && (
          <button onClick={onConnectGoogle}
            className="w-full flex items-center gap-3 px-5 py-3.5 border-2 border-gray-100 hover:border-red-200 bg-white hover:bg-red-50 rounded-xl transition-all shadow-sm group">
            <svg width={22} height={22} viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <div className="text-left flex-1">
              <p className="text-sm font-semibold text-gray-800">Conectar Gmail</p>
              <p className="text-xs text-gray-400">OAuth seguro — sin contraseñas</p>
            </div>
            <Zap size={16} className="text-yellow-500" />
          </button>
        )}

        {/* IMAP / POP3 genérico */}
        <button onClick={onConnectOutlook}
          className="w-full flex items-center gap-3 px-5 py-3.5 border-2 border-gray-100 hover:border-indigo-200 bg-white hover:bg-indigo-50 rounded-xl transition-all shadow-sm">
          <AtSign size={22} className="text-gray-400" />
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-gray-800">Cuenta IMAP / POP3</p>
            <p className="text-xs text-gray-400">Outlook, corporativo, dominio propio...</p>
          </div>
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center mt-6 max-w-xs">
        Tus credenciales se cifran con AES-256 y nunca se comparten.
      </p>
    </div>
  );
}

// ─── IMAP Account Form ────────────────────────────────────────────────────────

// Proveedores conocidos para autocompletado
const KNOWN_PROVIDERS: Record<string, { imap: string; pop3: string; smtp: string; inPortImap: number; inPortPop3: number; smtpPort: number }> = {
  'gmail.com':     { imap: 'imap.gmail.com',          pop3: 'pop.gmail.com',           smtp: 'smtp.gmail.com',           inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'googlemail.com':{ imap: 'imap.gmail.com',          pop3: 'pop.gmail.com',           smtp: 'smtp.gmail.com',           inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'outlook.com':   { imap: 'outlook.office365.com',   pop3: 'outlook.office365.com',   smtp: 'smtp-mail.outlook.com',    inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'hotmail.com':   { imap: 'outlook.office365.com',   pop3: 'outlook.office365.com',   smtp: 'smtp-mail.outlook.com',    inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'live.com':      { imap: 'outlook.office365.com',   pop3: 'outlook.office365.com',   smtp: 'smtp-mail.outlook.com',    inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'yahoo.com':     { imap: 'imap.mail.yahoo.com',     pop3: 'pop.mail.yahoo.com',      smtp: 'smtp.mail.yahoo.com',      inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'yahoo.es':      { imap: 'imap.mail.yahoo.com',     pop3: 'pop.mail.yahoo.com',      smtp: 'smtp.mail.yahoo.com',      inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'icloud.com':    { imap: 'imap.mail.me.com',        pop3: 'pop.mail.me.com',         smtp: 'smtp.mail.me.com',         inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
  'me.com':        { imap: 'imap.mail.me.com',        pop3: 'pop.mail.me.com',         smtp: 'smtp.mail.me.com',         inPortImap: 993, inPortPop3: 995, smtpPort: 587 },
};

function ImapForm({
  onClose, onSaved, getToken, defaultEmail, defaultName, preset,
}: {
  onClose: () => void; onSaved: (account: ImapAccount) => void | Promise<void>;
  getToken: () => Promise<string>;
  defaultEmail?: string; defaultName?: string;
  preset?: Partial<{
    label: string; email: string; imap_host: string; imap_port: number;
    imap_secure: boolean; smtp_host: string; smtp_port: number; smtp_secure: boolean;
  }> | null;
}) {
  const [step, setStep]       = useState(preset?.imap_host ? 2 : 1);
  const [protocol, setProtocol] = useState<'imap' | 'pop3'>('imap');
  const [form, setForm] = useState({
    label:       preset?.label    || defaultName   || 'Mi cuenta',
    email:       preset?.email    || defaultEmail  || '',
    imap_host:   preset?.imap_host  || '',
    imap_port:   preset?.imap_port  ?? 993,
    imap_secure: preset?.imap_secure ?? true,
    smtp_host:   preset?.smtp_host  || '',
    smtp_port:   preset?.smtp_port  ?? 587,
    smtp_secure: preset?.smtp_secure ?? false,
    username:    preset?.email    || defaultEmail  || '',
    password:    '',
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Cambia protocolo y ajusta puertos por defecto
  const switchProtocol = (proto: 'imap' | 'pop3') => {
    setProtocol(proto);
    const domain = form.email.split('@')[1] || '';
    const known  = KNOWN_PROVIDERS[domain.toLowerCase()];
    if (known) {
      set('imap_host', proto === 'pop3' ? known.pop3 : known.imap);
      set('imap_port', proto === 'pop3' ? known.inPortPop3 : known.inPortImap);
    } else {
      set('imap_port', proto === 'pop3' ? 995 : 993);
    }
  };

  const autoFill = (email: string) => {
    const domain = email.split('@')[1] || '';
    const known  = KNOWN_PROVIDERS[domain.toLowerCase()];
    if (known) {
      set('imap_host', protocol === 'pop3' ? known.pop3 : known.imap);
      set('imap_port', protocol === 'pop3' ? known.inPortPop3 : known.inPortImap);
      set('smtp_host', known.smtp);
      set('smtp_port', known.smtpPort);
      set('imap_secure', true);
    } else if (domain) {
      // Dominio personalizado: sugerir mail.DOMINIO o imap.DOMINIO
      const base = protocol === 'pop3' ? `pop3.${domain}` : `imap.${domain}`;
      set('imap_host', base);
      set('imap_port', protocol === 'pop3' ? 995 : 993);
      set('imap_secure', true);
      set('smtp_host', `smtp.${domain}`);
      set('smtp_port', 587);
    }
    set('username', email);
  };

  const handleSave = async () => {
    if (!form.email || !form.imap_host || !form.smtp_host || !form.username || !form.password) {
      setError('Completa email, servidores, usuario y contraseña antes de continuar.');
      return;
    }
    setSaving(true); setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo otra vez.');
      const res = await fetch(`${API}/email/accounts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, protocol }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.data) {
        throw new Error(data?.error || 'No se pudo guardar la cuenta de correo.');
      }
      await onSaved(data.data as ImapAccount);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Añadir cuenta de correo</h3>
            <p className="text-xs text-gray-400 mt-0.5">Paso {step} de 2</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 1 ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nombre de la cuenta
                </label>
                <input
                  value={form.label} onChange={e => set('label', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Dirección de correo
                </label>
                <input
                  value={form.email}
                  onChange={e => { set('email', e.target.value); autoFill(e.target.value); }}
                  type="email" placeholder="tucorreo@dominio.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              {form.email.toLowerCase().includes('gmail') && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <p className="font-semibold mb-1">⚡ Gmail: usa "Contraseña de aplicación"</p>
                  <p>Cuenta Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación</p>
                </div>
              )}
              <button
                onClick={() => setStep(2)} disabled={!form.email}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-50 transition-colors">
                Siguiente
              </button>
            </>
          ) : (
            <>
              {/* ── Selector protocolo ─────────────────────────────── */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['imap', 'pop3'] as const).map(p => (
                  <button key={p} type="button"
                    onClick={() => switchProtocol(p)}
                    className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                      protocol === p
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}>
                    {p.toUpperCase()}
                    <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                      {p === 'imap' ? 'Recomendado · sincroniza carpetas' : 'Descarga · sin carpetas'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Nota dominio propio */}
              {form.email && !KNOWN_PROVIDERS[form.email.split('@')[1]?.toLowerCase() || ''] && form.email.includes('@') && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  <p className="font-semibold mb-1">🏢 Dominio corporativo detectado</p>
                  <p>Los datos del servidor los proporciona tu proveedor de hosting. Comprueba en:</p>
                  <ul className="mt-1 space-y-0.5 pl-3 list-disc">
                    <li>cPanel / Plesk / DirectAdmin → <strong>Configuración de correo</strong></li>
                    <li>OVH / Ionos / GoDaddy → panel de control del dominio</li>
                    <li>Tu administrador de sistemas (si es empresa)</li>
                  </ul>
                  <p className="mt-1">Los servidores sugeridos (<strong>imap.{form.email.split('@')[1]}</strong>, <strong>smtp.{form.email.split('@')[1]}</strong>) son los más habituales pero pueden variar.</p>
                </div>
              )}

              {/* Servidor entrante */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Servidor {protocol.toUpperCase()}
                  </label>
                  <input value={form.imap_host} onChange={e => set('imap_host', e.target.value)}
                    placeholder={protocol === 'pop3' ? 'pop3.tudominio.es' : 'imap.tudominio.es'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Puerto {form.imap_secure ? '(SSL)' : '(sin SSL)'}
                  </label>
                  <input value={form.imap_port} onChange={e => set('imap_port', Number(e.target.value))}
                    type="number"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="imap_secure"
                    checked={form.imap_secure} onChange={e => set('imap_secure', e.target.checked)}
                    className="w-4 h-4 accent-indigo-600" />
                  <label htmlFor="imap_secure" className="text-xs text-gray-600 cursor-pointer">
                    Usar SSL/TLS para conexión entrante
                  </label>
                </div>

                {/* Servidor saliente SMTP */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Servidor SMTP (envío)</label>
                  <input value={form.smtp_host} onChange={e => set('smtp_host', e.target.value)}
                    placeholder="smtp.tudominio.es"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Puerto SMTP</label>
                  <input value={form.smtp_port} onChange={e => set('smtp_port', Number(e.target.value))}
                    type="number" placeholder="587"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>

              {/* Credenciales */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Usuario / Email</label>
                <input value={form.username} onChange={e => set('username', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contraseña</label>
                <div className="relative">
                  <input value={form.password} onChange={e => set('password', e.target.value)}
                    type={showPass ? 'text' : 'password'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 pr-10" />
                  <button onClick={() => setShowPass(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep(1)}
                  className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  Atrás
                </button>
                <button onClick={handleSave} disabled={saving || !form.password}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Guardar y probar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ folder }: { folder: string }) {
  const MAP: Record<string, { icon: LucideIcon; title: string; desc: string }> = {
    INBOX:   { icon: Inbox,    title: 'Bandeja vacía',    desc: 'No tienes mensajes nuevos' },
    STARRED: { icon: Star,     title: 'Sin destacados',   desc: 'Marca mensajes con ⭐ para verlos aquí' },
    PINNED:  { icon: Pin,      title: 'Sin pineados',     desc: 'Fija correos importantes para localizarlos enseguida' },
    SENT:    { icon: Send,     title: 'Sin enviados',     desc: 'Los mensajes enviados aparecerán aquí' },
    DRAFTS:  { icon: FileText, title: 'Sin borradores',   desc: 'Tus borradores aparecerán aquí' },
    TRASH:   { icon: Trash2,   title: 'Papelera vacía',   desc: 'No hay mensajes eliminados' },
    SPAM:    { icon: Shield,   title: 'Sin spam',         desc: 'No hay mensajes de spam' },
  };
  const cfg = MAP[folder] || { icon: Mail, title: 'Sin mensajes', desc: '' };
  const Icon = cfg.icon;
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={28} className="text-gray-400" />
      </div>
      <p className="text-base font-semibold text-gray-600">{cfg.title}</p>
      {cfg.desc && <p className="text-sm text-gray-400 mt-1">{cfg.desc}</p>}
    </div>
  );
}

function MailboxLockedState({
  hasConfiguredAccounts,
  onConnectAccount,
}: {
  hasConfiguredAccounts: boolean;
  onConnectAccount: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Shield size={42} className="mb-4 text-gray-200" />
      <h3 className="text-lg font-semibold text-gray-800">
        {hasConfiguredAccounts ? 'Selecciona una cuenta de correo' : 'Conecta una cuenta de correo'}
      </h3>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        {hasConfiguredAccounts
          ? 'Hay cuentas guardadas, pero no hay ninguna activa. Hasta seleccionarla o reconectarla no se podrá usar ninguna función del correo.'
          : 'No hay ninguna cuenta configurada. Conecta Gmail o una cuenta IMAP/POP3 para empezar a usar el módulo de correo.'}
      </p>
      <button
        type="button"
        onClick={onConnectAccount}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#ab0433] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#8f022a]">
        <Plus size={16} />
        {hasConfiguredAccounts ? 'Seleccionar o conectar cuenta' : 'Conectar cuenta'}
      </button>
    </div>
  );
}

// ─── Main Email Component ─────────────────────────────────────────────────────

export default function Email() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { getToken } = useAuth();
  const { user }    = useUser();

  const userEmail  = user?.primaryEmailAddress?.emailAddress || '';
  const userName   = user?.fullName || user?.firstName || userEmail.split('@')[0] || 'Usuario';
  const userAvatar = user?.imageUrl;

  const tokenGetter = useCallback(async () => {
    const t = await getToken();
    return t || '';
  }, [getToken]);

  // Fetch autenticado con reintento automático si el JWT de Clerk ha expirado
  const authFetch = useCallback(async (url: string, opts?: RequestInit): Promise<Response> => {
    const token = await getToken();
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token || ''}`, ...opts?.headers },
    });
    if (res.status !== 401) return res;
    // 401 → forzar renovación del token y reintentar una vez
    const fresh = await getToken({ skipCache: true });
    return fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${fresh || ''}`, ...opts?.headers },
    });
  }, [getToken]);

  // ── Google Identity Services ──────────────────────────────────────────────
  const [gisLoaded, setGisLoaded]   = useState(false);
  const [gmailToken, setGmailToken] = useState<string>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(GMAIL_TOKEN_KEY) || '{}');
      if (stored.expires_at && Date.now() < stored.expires_at) return stored.access_token || '';
      return '';
    } catch { return ''; }
  });
  const [gmailProfile, setGmailProfile] = useState<GmailProfile | null>(null);
  const [savedGmailProfiles, setSavedGmailProfiles] = useState<SavedOAuthProfile[]>([]);
  const [gmailLabels, setGmailLabels]   = useState<GmailLabel[]>([]);
  const [gmailExpired, setGmailExpired] = useState(false);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

  const gmail = useMemo(() => gmailToken ? new GmailService(gmailToken) : null, [gmailToken]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>('INBOX');
  const [emails, setEmails]             = useState<ParsedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<ParsedEmail | null>(null);
  const [compose, setCompose]           = useState<ComposeData | null>(null);
  const [showImapForm, setShowImapForm] = useState(false);
  const [imapPreset, setImapPreset] = useState<Partial<{
    label: string; email: string; imap_host: string; imap_port: number;
    imap_secure: boolean; smtp_host: string; smtp_port: number; smtp_secure: boolean;
  }> | null>(null);
  const [imapAccounts, setImapAccounts] = useState<ImapAccount[]>([]);
  const [selectedImapAccountId, setSelectedImapAccountId] = useState<string | null>(null);
  const [imapFolders, setImapFolders] = useState<ImapFolderInfo[]>([]);
  const [loading, setLoading]           = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [searchQ, setSearchQ]           = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [unreadCount, setUnreadCount]   = useState(0);
  const [draftCount, setDraftCount]     = useState(0);
  const [error, setError]               = useState('');
  // pinnedIds se recarga cuando cambia el provider activo
  const [pinnedIds, setPinnedIds]       = useState<string[]>([]);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<PendingDeleteLabel | null>(null);
  const [deletingLabel, setDeletingLabel] = useState(false);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<PendingDeleteAccount | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const pendingOpenEmailId = searchParams.get('openEmail');
  const selectedEmailRef = useRef<ParsedEmail | null>(null);
  const emailRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshInFlightRef = useRef(false);

  const currentImapAccount = useMemo(
    () => imapAccounts.find((account) => account.id === selectedImapAccountId) || null,
    [imapAccounts, selectedImapAccountId],
  );

  // Provider activo: IMAP tiene prioridad si hay una cuenta seleccionada
  const activeProvider: 'gmail' | 'imap' | 'none' = currentImapAccount
    ? 'imap'
    : gmail
      ? 'gmail'
      : 'none';

  // Clave de pineados por cuenta — evita mezclar Gmail con IMAP
  const activePinnedKey = activeProvider === 'gmail'
    ? (gmailProfile?.emailAddress || 'gmail')
    : activeProvider === 'imap'
      ? (currentImapAccount?.id || 'imap')
      : 'default';

  const imapSystemFolderMap = useMemo(() => {
    const findBySpecialUse = (specialUse: string) =>
      imapFolders.find((f) => f.specialUse === specialUse)?.path;

    const findByRegex = (patterns: RegExp[]) =>
      imapFolders.find(({ path }) => {
        const norm = path.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return patterns.some((p) => p.test(norm));
      })?.path;

    const map: Partial<Record<ImapSystemFolderKey, string>> = {
      INBOX: imapFolders.find((f) => f.path.toUpperCase() === 'INBOX')?.path || 'INBOX',
      SENT:    findBySpecialUse('\\Sent')    || findByRegex([/^sent$/, /^sent items$/, /^enviados?$/, /sent/, /enviad/]),
      DRAFTS:  findBySpecialUse('\\Drafts')  || findByRegex([/^drafts?$/, /^borradores?$/, /draft/, /borrad/]),
      TRASH:   findBySpecialUse('\\Trash')   || findByRegex([/^trash$/, /^papelera$/, /^deleted(?: items)?$/, /trash/, /papelera/, /deleted/, /eliminad/]),
      SPAM:    findBySpecialUse('\\Junk')    || findByRegex([/^spam$/, /^junk$/, /^correo no deseado$/, /spam/, /junk/, /no deseado/]),
      ARCHIVE: findBySpecialUse('\\Archive') || findByRegex([/^archive$/, /^archivo$/, /^all mail$/, /archiv/]),
    };

    return map;
  }, [imapFolders]);

  const imapCustomFolders = useMemo(() => {
    const reserved = new Set(
      Object.values(imapSystemFolderMap)
        .filter(Boolean)
        .map((value) => String(value).toLowerCase()),
    );

    return imapFolders
      .filter((folder) => !reserved.has(folder.path.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [imapFolders, imapSystemFolderMap]);

  const normalizedLabelName = newLabelName.trim().replace(/\s+/g, ' ');
  const applyPinnedState = useCallback((items: ParsedEmail[]) => {
    const pinned = new Set(readPinnedEmailIds(activePinnedKey));
    return items.map((item) => ({ ...item, isPinned: pinned.has(item.id) }));
  }, [activePinnedKey]);

  useEffect(() => {
    selectedEmailRef.current = selectedEmail;
  }, [selectedEmail]);

  // ── Cargar Google Identity Services ──────────────────────────────────────
  useEffect(() => {
    // Si window.google ya está disponible (cargado por Agenda u otra página), listo
    if ((window as any).google?.accounts?.oauth2) {
      setGisLoaded(true);
      return;
    }
    // Si el script ya está en el DOM, esperar su load event
    const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
    if (existing) {
      const onLoad = () => setGisLoaded(true);
      existing.addEventListener('load', onLoad);
      // Comprobar si ya cargó (raza)
      if ((window as any).google?.accounts?.oauth2) setGisLoaded(true);
      return () => existing.removeEventListener('load', onLoad);
    }
    // Inyectar el script
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => setGisLoaded(true);
    document.body.appendChild(s);
  }, []);

  // Callback separado para poder reutilizarlo en init y en reintentos
  const gmailCallback = useCallback((resp: { access_token?: string; error?: string; expires_in?: number }) => {
    if (resp.access_token) {
      const expiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
      setGmailToken(resp.access_token);
      setGmailExpired(false);
      localStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify({
        access_token: resp.access_token,
        expires_at: expiresAt,
      }));
      return;
    } else {
      setError('Error al conectar con Google: ' + (resp.error || 'Desconocido'));
    }
  }, []);

  const connectGoogle = useCallback((loginHint?: string) => {
    const goog = (window as any).google as GmailGIS | undefined;
    const currentOrigin = window.location.origin;
    const shouldNormalizeLocalOrigin =
      /^(http:\/\/127\.0\.0\.1:\d+|http:\/\/localhost:\d+)$/.test(currentOrigin) &&
      currentOrigin !== 'http://localhost:5173';

    if (shouldNormalizeLocalOrigin) {
      window.location.replace(
        `http://localhost:5173${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      return;
    }

    if (!GMAIL_CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID no está configurado en .env');
      return;
    }
    if (!goog?.accounts?.oauth2) {
      setError('Google Identity Services aún se está cargando. Espera un momento y vuelve a intentarlo.');
      return;
    }
    const clientConfig: any = {
      client_id: GMAIL_CLIENT_ID,
      scope: GMAIL_SCOPES,
      callback: gmailCallback,
    };
    if (loginHint) clientConfig.login_hint = loginHint;
    tokenClientRef.current = goog.accounts.oauth2.initTokenClient(clientConfig);
    setSelectedImapAccountId(null);
    tokenClientRef.current.requestAccessToken();
  }, [gmailCallback]);

  const reconnectGoogleProfile = useCallback((profile: SavedOAuthProfile) => {
    setSelectedImapAccountId(null);
    setSelectedFolder('INBOX');
    setSelectedEmail(null);
    setError('');
    setGmailExpired(false);

    // Si el token en memoria sigue activo para esta cuenta, volver sin OAuth
    if (gmailToken && gmailProfile?.emailAddress === profile.email) return;

    // Intentar restaurar desde localStorage sin OAuth
    try {
      const stored = JSON.parse(localStorage.getItem(GMAIL_TOKEN_KEY) || '{}');
      if (stored.access_token && stored.expires_at && Date.now() < stored.expires_at - 60_000) {
        setGmailToken(stored.access_token);
        return;
      }
    } catch { /* noop */ }

    // Token expirado → limpiar emails y lanzar OAuth directamente
    setEmails([]);
    setGmailProfile(null);
    connectGoogle(profile.email);
  }, [connectGoogle, gmailToken, gmailProfile]);

  // ── Desconectar Gmail ─────────────────────────────────────────────────────
  const disconnectGmail = useCallback(() => {
    setGmailToken('');
    setGmailProfile(null);
    setGmailLabels([]);
    setEmails([]);
    setSelectedEmail(null);
    setUnreadCount(0);
    setDraftCount(0);
    localStorage.removeItem(GMAIL_TOKEN_KEY);
    // Notificar a EmailUnreadContext para que limpie sus IDs
    window.dispatchEvent(new StorageEvent('storage', { key: GMAIL_TOKEN_KEY, newValue: null }));
  }, []);

  // ── Abrir formulario IMAP/POP3 genérico ──────────────────────────────────
  const connectOutlook = useCallback(() => {
    setImapPreset(null);   // sin preset → el formulario empieza en blanco (paso 1)
    setShowImapForm(true);
  }, []);

  // ── Handle Gmail API errors (token expiry) ────────────────────────────────
  const handleGmailError = useCallback((e: any) => {
    const code = (e as any).code;
    if (code === 401 || code === 403) {
      setGmailToken('');
      localStorage.removeItem(GMAIL_TOKEN_KEY);
      setEmails([]);
      setGmailExpired(true);
    }
  }, []);

  const refreshImapAccounts = useCallback(async () => {
    const response = await authFetch(`${API}/email/accounts`).catch(() => null);
    if (!response) return;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) return;

    const accounts: ImapAccount[] = payload.data || [];
    setImapAccounts(accounts);
    if (!gmailToken && accounts.length > 0 && !selectedImapAccountId) {
      setSelectedImapAccountId(accounts[0].id);
    }
  }, [authFetch, gmailToken, selectedImapAccountId]);

  const refreshImapFolders = useCallback(async (accountId: string) => {
    if (!accountId) return;
    const response = await authFetch(`${API}/email/accounts/${accountId}/folders`).catch(() => null);
    if (!response) return;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      setImapFolders([]);
      return;
    }

    const folders: ImapFolderInfo[] = (payload.data || []).filter(
      (f: unknown): f is ImapFolderInfo =>
        f !== null && typeof f === 'object' && typeof (f as ImapFolderInfo).path === 'string',
    );

    setImapFolders(folders);
  }, [authFetch]);

  const refreshSavedGmailProfiles = useCallback(async () => {
    const response = await authFetch(`${API}/email/profiles?provider=google`).catch(() => null);
    if (!response) return;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) return;
    setSavedGmailProfiles(Array.isArray(payload.data) ? payload.data : []);
  }, [authFetch]);

  const deleteSavedGmailProfile = useCallback(async (profileId: string) => {
    const response = await authFetch(`${API}/email/profiles/${profileId}`, { method: 'DELETE' }).catch(() => null);
    if (!response) return;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      setError(payload?.error || 'No se pudo borrar la cuenta guardada');
      return;
    }
    setSavedGmailProfiles((prev) => prev.filter((profile) => profile.id !== profileId));
  }, [authFetch]);

  const persistGoogleProfile = useCallback(async (profile: GmailProfile) => {
    if (!profile?.emailAddress) return;
    await authFetch(`${API}/email/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        email: profile.emailAddress,
        display_name: userName,
        avatar_url: userAvatar || null,
      }),
    }).catch(() => null);
    await refreshSavedGmailProfiles().catch(() => undefined);
  }, [authFetch, refreshSavedGmailProfiles, userAvatar, userName]);

  // ── Load Gmail profile & labels ───────────────────────────────────────────
  useEffect(() => {
    if (!gmail) return;
    gmail.getProfile()
      .then(async (p) => {
        setGmailProfile(p);
        await persistGoogleProfile(p);
      })
      .catch(handleGmailError);
    gmail.listLabels()
      .then(({ labels }) => {
        setGmailLabels((labels || []).map((label: any) => ({
          ...label,
          name: normalizeLabelName(label?.name, label?.id || 'Carpeta sin nombre'),
        })));
        const inbox = labels.find(l => l.id === 'INBOX');
        if (inbox?.messagesUnread !== undefined) setUnreadCount(inbox.messagesUnread);
        const draft = labels.find(l => l.id === 'DRAFT');
        const localDraftCount = readLocalDrafts().length;
        if (draft?.messagesTotal !== undefined) setDraftCount(draft.messagesTotal + localDraftCount);
        else setDraftCount(localDraftCount);
      })
      .catch(handleGmailError);
  }, [gmail, handleGmailError, persistGoogleProfile]);

  // ── Load IMAP accounts desde backend ─────────────────────────────────────
  useEffect(() => {
    void refreshImapAccounts().catch(() => undefined);
  }, [refreshImapAccounts]);

  useEffect(() => {
    void refreshSavedGmailProfiles().catch(() => undefined);
  }, [refreshSavedGmailProfiles]);

  useEffect(() => {
    if (!selectedImapAccountId) {
      setImapFolders([]);
      return;
    }
    void refreshImapFolders(selectedImapAccountId).catch(() => setImapFolders([]));
  }, [refreshImapFolders, selectedImapAccountId]);

  // ── Map folder key to Gmail label IDs ────────────────────────────────────
  const folderToGmailIds = useCallback((folder: FolderKey): string[] => {
    const MAP: Record<string, string[]> = {
      INBOX: ['INBOX'],
      STARRED: ['STARRED'],
      ALL: [],
      SNOOZED: ['SNOOZED'],
      SENT: ['SENT'],
      IMPORTANT: ['IMPORTANT'],
      DRAFTS: ['DRAFT'],
      SCHEDULED: ['SCHEDULED'],
      SPAM: ['SPAM'],
      TRASH: ['TRASH'],
    };
    return MAP[folder] || [folder];
  }, []);

  // ── Load emails from Gmail ────────────────────────────────────────────────
  const loadEmails = useCallback(async (
    reset = true,
    token?: string,
    options?: { silent?: boolean; preserveSelection?: boolean },
  ) => {
    const silent = Boolean(options?.silent);
    const preserveSelection = Boolean(options?.preserveSelection);
    const previousSelectedId = preserveSelection ? selectedEmailRef.current?.id || null : null;
    // Guardar el body del email abierto para no perderlo al refrescar la lista
    const previousSelectedBody = preserveSelection ? {
      bodyHtml: selectedEmailRef.current?.bodyHtml || '',
      bodyText: selectedEmailRef.current?.bodyText || '',
      snippet:  selectedEmailRef.current?.snippet  || '',
    } : null;
    if (!silent) setLoading(true);
    setError('');
    if (reset && !silent && !preserveSelection) { setEmails([]); setSelectedEmail(null); }
    try {
      if (currentImapAccount) {
        const folder = mapFolderToImapApi(selectedFolder, imapSystemFolderMap);
        if (reset) setNextPageToken(undefined);

        const res = await authFetch(
          `${API}/email/messages?account_id=${encodeURIComponent(currentImapAccount.id)}&folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(searchQ.trim())}&limit=100`,
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Error al cargar correos IMAP');

        const nextEmails: ParsedEmail[] = (payload.data?.emails || []).map((row: ImapApiEmail) => parseImapEmail(row));
        setEmails(nextEmails);
        if (previousSelectedId) {
          const nextSelected = nextEmails.find((item) => item.id === previousSelectedId) || null;
          if (nextSelected) setSelectedEmail(previousSelectedBody
            ? { ...nextSelected, bodyHtml: nextSelected.bodyHtml || previousSelectedBody.bodyHtml, bodyText: nextSelected.bodyText || previousSelectedBody.bodyText, snippet: nextSelected.snippet || previousSelectedBody.snippet }
            : nextSelected);
        }

        const statsRes = await authFetch(
          `${API}/email/stats?account_id=${encodeURIComponent(currentImapAccount.id)}`,
        );
        const statsPayload = await statsRes.json().catch(() => null);
        if (statsRes.ok && statsPayload?.success) {
          setUnreadCount(Number(statsPayload.data?.unread || 0));
          setDraftCount(Number(statsPayload.data?.drafts || 0));
        }
        return;
      }

      if (!gmail) return;

      if (selectedFolder === 'PINNED') {
        const pinned = readPinnedEmailIds(activePinnedKey);
        if (pinned.length === 0) {
          setEmails([]);
          setNextPageToken(undefined);
          return;
        }
        const metas = await Promise.all(
          pinned.map((id) => gmail.getMessage(id, 'metadata').catch(() => null)),
        );
        const parsedPinned = applyPinnedState(
          metas
            .filter(Boolean)
            .map((m: any) => {
              const headers = m.payload?.headers || [];
              const fromRaw = hdr(headers, 'From');
              const { name: fromName, email: fromEmail } = parseNameEmail(fromRaw);
              const dateRaw = hdr(headers, 'Date');
              const date = dateRaw
                ? new Date(dateRaw).toISOString()
                : new Date(Number(m.internalDate || 0)).toISOString();
              return {
                id: m.id,
                threadId: m.threadId,
                labelIds: m.labelIds || [],
                from: fromEmail,
                fromName,
                to: hdr(headers, 'To'),
                cc: hdr(headers, 'Cc'),
                subject: hdr(headers, 'Subject') || '(Sin asunto)',
                snippet: m.snippet || '',
                date,
                isRead: !(m.labelIds || []).includes('UNREAD'),
                isStarred: (m.labelIds || []).includes('STARRED'),
                bodyHtml: '',
                bodyText: '',
                hasAttachments: false,
                source: 'gmail' as const,
              };
            }),
        );
        setEmails(parsedPinned);
        if (previousSelectedId) {
          const nextSelected = parsedPinned.find((item) => item.id === previousSelectedId) || null;
          if (nextSelected) setSelectedEmail(previousSelectedBody
            ? { ...nextSelected, bodyHtml: nextSelected.bodyHtml || previousSelectedBody.bodyHtml, bodyText: nextSelected.bodyText || previousSelectedBody.bodyText, snippet: nextSelected.snippet || previousSelectedBody.snippet }
            : nextSelected);
        }
        setNextPageToken(undefined);
        return;
      }

      const labelIds = folderToGmailIds(selectedFolder);
      const q = searchQ.trim() || undefined;
      const listRes = await gmail.listMessages(labelIds, reset ? undefined : token, q, 50);
      const ids = listRes.messages?.map(m => m.id) || [];
      setNextPageToken(listRes.nextPageToken);

      const localDraftEmails: ParsedEmail[] = selectedFolder === 'DRAFTS'
        ? readLocalDrafts().map((draft) => ({
            id: `draft:${draft.id}`,
            draftId: draft.id,
            threadId: draft.id,
            labelIds: ['DRAFT'],
            from: userEmail,
            fromName: userName,
            to: draft.to,
            cc: draft.cc,
            subject: draft.subject || '(Borrador sin asunto)',
            snippet: draft.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
            date: draft.updated_at,
            isRead: true,
            isStarred: false,
            bodyHtml: draft.body,
            bodyText: draft.body.replace(/<[^>]+>/g, ' '),
            hasAttachments: false,
            source: 'draft' as const,
            isPinned: false,
          }))
        : [];

      if (ids.length === 0) {
        if (reset) setEmails(localDraftEmails);
        return;
      }

      // Fetch metadata in parallel (fast)
      const metas = await Promise.all(
        ids.map(id => gmail.getMessage(id, 'metadata').catch(() => null)),
      );

      const parsed: ParsedEmail[] = metas
        .filter(Boolean)
        .map((m: any) => {
          const headers = m.payload?.headers || [];
          const fromRaw = hdr(headers, 'From');
          const { name: fromName, email: fromEmail } = parseNameEmail(fromRaw);
          const dateRaw = hdr(headers, 'Date');
          const date = dateRaw
            ? new Date(dateRaw).toISOString()
            : new Date(Number(m.internalDate || 0)).toISOString();
          return {
            id: m.id, threadId: m.threadId, labelIds: m.labelIds || [],
            from: fromEmail, fromName,
            to: hdr(headers, 'To'), cc: hdr(headers, 'Cc'),
            subject: hdr(headers, 'Subject') || '(Sin asunto)',
            snippet: m.snippet || '', date,
            isRead: !(m.labelIds || []).includes('UNREAD'),
            isStarred: (m.labelIds || []).includes('STARRED'),
            bodyHtml: '', bodyText: '', hasAttachments: false,
            source: 'gmail' as const,
          };
        });

      const nextEmails = applyPinnedState(parsed);
      if (reset) {
        const mergedEmails = [...localDraftEmails, ...nextEmails];
        setEmails(mergedEmails);
        if (previousSelectedId) {
          const nextSelected = mergedEmails.find((item) => item.id === previousSelectedId) || null;
          if (nextSelected) setSelectedEmail(previousSelectedBody
            ? { ...nextSelected, bodyHtml: nextSelected.bodyHtml || previousSelectedBody.bodyHtml, bodyText: nextSelected.bodyText || previousSelectedBody.bodyText, snippet: nextSelected.snippet || previousSelectedBody.snippet }
            : nextSelected);
        }
      }
      else setEmails(prev => [...prev, ...nextEmails]);
    } catch (e: any) {
      handleGmailError(e);
      setError(e.message || 'Error al cargar correos');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applyPinnedState, currentImapAccount, folderToGmailIds, gmail, handleGmailError, imapSystemFolderMap, searchQ, selectedFolder, tokenGetter, userEmail, userName]);

  // ── Recargar pinnedIds cuando cambia el provider activo ──────────────────
  useEffect(() => {
    setPinnedIds(readPinnedEmailIds(activePinnedKey));
  }, [activePinnedKey]);

  // ── Reload when folder / provider changes ─────────────────────────────────
  useEffect(() => {
    if (gmail || currentImapAccount) loadEmails(true);
  }, [gmail, currentImapAccount, selectedFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gmail && !currentImapAccount) return;

    const silentRefresh = async (refreshStructure = false) => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      try {
        if (currentImapAccount) {
          if (refreshStructure) {
            await refreshImapFolders(currentImapAccount.id).catch(() => undefined);
          }
          const folder = mapFolderToImapApi(selectedFolder, imapSystemFolderMap);
          await authFetch(
            `${API}/email/accounts/${currentImapAccount.id}/sync?folder=${encodeURIComponent(folder)}&limit=40`,
            { method: 'POST' },
          ).catch(() => null);
        } else if (gmail && refreshStructure) {
          gmail.listLabels().then(({ labels }) => {
            setGmailLabels((labels || []).map((label: any) => ({
              ...label,
              name: normalizeLabelName(label?.name, label?.id || 'Carpeta sin nombre'),
            })));
          }).catch(() => undefined);
        }

        await loadEmails(true, undefined, { silent: true, preserveSelection: true });
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    const startPolling = () => {
      if (emailRefreshRef.current) clearInterval(emailRefreshRef.current);
      const intervalMs = document.visibilityState === 'visible'
        ? (currentImapAccount ? 12000 : 18000)
        : (currentImapAccount ? 30000 : 45000);
      emailRefreshRef.current = setInterval(() => { void silentRefresh(false); }, intervalMs);
    };

    startPolling();

    const onFocus = () => {
      void silentRefresh(true);
      startPolling();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      if (emailRefreshRef.current) clearInterval(emailRefreshRef.current);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [currentImapAccount, gmail, imapSystemFolderMap, loadEmails, mapFolderToImapApi, selectedFolder, tokenGetter]);

  // ── Open email (full body fetch) ──────────────────────────────────────────
  const openEmail = useCallback(async (email: ParsedEmail) => {
    if (email.source === 'draft') {
      setSelectedEmail(null);
      startCompose({
        draftId: email.draftId,
        to: email.to,
        cc: email.cc,
        bcc: '',
        subject: email.subject === '(Borrador sin asunto)' ? '' : email.subject,
        body: email.bodyHtml || email.bodyText,
      });
      return;
    }
    setSelectedEmail(email);
    // Optimistic mark read
    if (!email.isRead) {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    if (email.source === 'imap') {
      try {
        const res = await authFetch(`${API}/email/messages/${email.id}`);
        const payload = await res.json();
        if (!res.ok || !payload?.success) throw new Error(payload?.error || 'No se pudo abrir el correo');
        const parsed = parseImapEmail(payload.data as ImapApiEmail);
        setSelectedEmail(parsed);
        setEmails(prev => prev.map(e => e.id === email.id ? parsed : e));
      } catch (e: any) {
        setError(e.message || 'Error al abrir el correo');
      }
      return;
    }
    // Full fetch if no body
    if (!email.bodyHtml && !email.bodyText && gmail) {
      try {
        const full = await gmail.getMessage(email.id, 'full');
        const parsed = parseGmailMessage(full);
        setSelectedEmail(prev => prev?.id === email.id ? { ...parsed, isRead: true } : prev);
        setEmails(prev => prev.map(e => e.id === email.id ? { ...parsed, isRead: true } : e));
        if (!email.isRead) gmail.markRead(email.id, true).catch(() => {});
      } catch (e: any) { handleGmailError(e); }
    } else if (!email.isRead && gmail) {
      gmail.markRead(email.id, true).catch(() => {});
    }
  }, [gmail, handleGmailError, tokenGetter]);

  useEffect(() => {
    if (!pendingOpenEmailId || !gmail) return;

    const existing = emails.find((email) => email.id === pendingOpenEmailId);
    if (existing) {
      void openEmail(existing);
      const next = new URLSearchParams(searchParams);
      next.delete('openEmail');
      setSearchParams(next, { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const full = await gmail.getMessage(pendingOpenEmailId, 'full');
        if (cancelled) return;
        const parsed = parseGmailMessage(full);
        setSelectedEmail(parsed);
        setEmails((prev) => {
          if (prev.some((email) => email.id === parsed.id)) return prev;
          return [parsed, ...prev];
        });
        const next = new URLSearchParams(searchParams);
        next.delete('openEmail');
        setSearchParams(next, { replace: true });
      } catch {
        // silencioso
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [emails, gmail, openEmail, pendingOpenEmailId, searchParams, setSearchParams]);

  // ── Star ──────────────────────────────────────────────────────────────────
  const toggleStar = useCallback((id: string, starred: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEmails(prev => prev.map(em => em.id === id ? { ...em, isStarred: !starred } : em));
    setSelectedEmail(se => se?.id === id ? { ...se, isStarred: !starred } : se);
    if (selectedEmail?.source === 'imap' || emails.find((email) => email.id === id)?.source === 'imap') {
      authFetch(`${API}/email/messages/${id}/star`, { method: 'PATCH' }).catch(() => {});
      return;
    }
    if (gmail) gmail.toggleStar(id, !starred).catch(() => {});
  }, [authFetch, emails, gmail, selectedEmail?.source]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteEmail = useCallback((id: string) => {
    setEmails(prev => prev.filter(e => e.id !== id));
    setSelectedEmail(se => se?.id === id ? null : se);
    if (id.startsWith('draft:')) {
      const draftId = id.replace(/^draft:/, '');
      const nextDrafts = removeLocalDraft(draftId);
      setDraftCount((gmailLabels.find((label) => label.id === 'DRAFT')?.messagesTotal || 0) + nextDrafts.length);
      return;
    }
    if (selectedEmail?.source === 'imap' || emails.find((email) => email.id === id)?.source === 'imap') {
      authFetch(`${API}/email/messages/${id}`, { method: 'DELETE' }).catch(() => {});
      return;
    }
    if (gmail) gmail.trash(id).catch(() => {});
  }, [authFetch, emails, gmail, gmailLabels, selectedEmail?.source]);

  const togglePinned = useCallback((email: ParsedEmail) => {
    if (email.source === 'draft') return;
    const current = readPinnedEmailIds(activePinnedKey);
    const exists = current.includes(email.id);
    const next = exists ? current.filter((id) => id !== email.id) : [email.id, ...current];
    writePinnedEmailIds(next, activePinnedKey);
    setPinnedIds(next);
    setEmails((prev) => prev.map((item) => item.id === email.id ? { ...item, isPinned: !exists } : item));
    setSelectedEmail((prev) => prev?.id === email.id ? { ...prev, isPinned: !exists } : prev);
    if (selectedFolder === 'PINNED' && exists) {
      setEmails((prev) => prev.filter((item) => item.id !== email.id));
      setSelectedEmail((prev) => prev?.id === email.id ? null : prev);
    }
  }, [activePinnedKey, selectedFolder]);

  const restoreEmail = useCallback((email: ParsedEmail) => {
    if (!gmail || email.source !== 'gmail') return;
    gmail.untrash(email.id).then(() => {
      setEmails((prev) => prev.filter((item) => item.id !== email.id));
      setSelectedEmail((prev) => prev?.id === email.id ? null : prev);
    }).catch(() => {});
  }, [gmail]);

  const createUserLabel = useCallback(async (rawName?: string) => {
    if (!gmail) return;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) {
      setLabelModalOpen(true);
      return;
    }
    setCreatingLabel(true);
    try {
      await gmail.createLabel(name);
      const { labels } = await gmail.listLabels();
      setGmailLabels((labels || []).map((label: any) => ({
        ...label,
        name: normalizeLabelName(label?.name, label?.id || 'Carpeta sin nombre'),
      })));
      setNewLabelName('');
      setLabelModalOpen(false);
    } catch (e: any) {
      setError(e.message || 'No se pudo crear la carpeta');
    } finally {
      setCreatingLabel(false);
    }
  }, [gmail]);

  const createFolderForCurrentProvider = useCallback(async (rawName?: string) => {
    const name = String(rawName || newLabelName).trim().replace(/\s+/g, ' ');
    if (!name) {
      setLabelModalOpen(true);
      return;
    }

    if (currentImapAccount) {
      setCreatingLabel(true);
      try {
        const response = await authFetch(`${API}/email/accounts/${currentImapAccount.id}/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'No se pudo crear la carpeta IMAP');
        }
        await refreshImapFolders(currentImapAccount.id);
        setSelectedFolder(name);
        setNewLabelName('');
        setLabelModalOpen(false);
      } catch (e: any) {
        setError(e.message || 'No se pudo crear la carpeta IMAP');
      } finally {
        setCreatingLabel(false);
      }
      return;
    }

    await createUserLabel(name);
  }, [authFetch, createUserLabel, currentImapAccount, newLabelName]);

  const requestDeleteUserLabel = useCallback((labelId: string) => {
    const label = gmailLabels.find((item) => item.id === labelId);
    setPendingDeleteLabel({
      id: labelId,
      name: normalizeLabelName(label?.name, label?.id || 'Carpeta sin nombre'),
    });
  }, [gmailLabels]);

  const deleteUserLabel = useCallback(async () => {
    if (!gmail || !pendingDeleteLabel) return;
    setDeletingLabel(true);
    try {
      await gmail.deleteLabel(pendingDeleteLabel.id);
      const { labels } = await gmail.listLabels();
      setGmailLabels((labels || []).map((label: any) => ({
        ...label,
        name: normalizeLabelName(label?.name, label?.id || 'Carpeta sin nombre'),
      })));
      if (selectedFolder === pendingDeleteLabel.id) {
        setSelectedFolder('INBOX');
      }
      setPendingDeleteLabel(null);
    } catch (e: any) {
      setError(e.message || 'No se pudo borrar la carpeta');
    } finally {
      setDeletingLabel(false);
    }
  }, [gmail, pendingDeleteLabel, selectedFolder]);

  const requestDeleteImapAccount = useCallback((accountId: string) => {
    const account = imapAccounts.find((item) => item.id === accountId);
    if (!account) return;
    setPendingDeleteAccount({
      id: account.id,
      name: account.label || account.email,
      email: account.email,
    });
  }, [imapAccounts]);

  const deleteImapAccount = useCallback(async () => {
    if (!pendingDeleteAccount) return;
    try {
      const response = await authFetch(`${API}/email/accounts/${pendingDeleteAccount.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'No se pudo borrar la cuenta');
      }

      const remainingAccounts = imapAccounts.filter((account) => account.id !== pendingDeleteAccount.id);
      setImapAccounts(remainingAccounts);
      if (selectedImapAccountId === pendingDeleteAccount.id) {
        setSelectedImapAccountId(remainingAccounts[0]?.id || null);
        setSelectedFolder('INBOX');
        setSelectedEmail(null);
        setImapFolders([]);
      }
      setPendingDeleteAccount(null);
    } catch (e: any) {
      setError(e.message || 'No se pudo borrar la cuenta');
    }
  }, [authFetch, imapAccounts, pendingDeleteAccount, selectedImapAccountId]);

  const assignEmailToLabel = useCallback(async (email: ParsedEmail, labelId: string) => {
    if (!gmail || email.source !== 'gmail') return;
    try {
      await gmail.modifyMessage(email.id, [labelId], []);
      setSelectedEmail((prev) => prev?.id === email.id
        ? { ...prev, labelIds: Array.from(new Set([...(prev.labelIds || []), labelId])) }
        : prev);
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar en la carpeta');
    }
  }, [gmail]);

  // ── Compose ───────────────────────────────────────────────────────────────
  const startCompose = (data: Partial<ComposeData> = {}) => {
    if (activeProvider === 'none') {
      setError('Selecciona o conecta una cuenta de correo para poder redactar mensajes.');
      setShowConnectModal(true);
      return;
    }
    setCompose({ to: '', cc: '', bcc: '', subject: '', body: '', ...data });
  };

  const handleCloseCompose = (draft?: ComposeData) => {
    if (draft) {
      const nextDrafts = upsertLocalDraft({
        id: draft.draftId || `draft-${Date.now()}`,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
        updated_at: new Date().toISOString(),
      });
      setDraftCount((gmailLabels.find((label) => label.id === 'DRAFT')?.messagesTotal || 0) + nextDrafts.length);
    }
    setCompose(null);
  };

  const handleComposeSent = (draftId?: string) => {
    const nextDrafts = removeLocalDraft(draftId);
    setDraftCount((gmailLabels.find((label) => label.id === 'DRAFT')?.messagesTotal || 0) + nextDrafts.length);
    setCompose(null);
    if (selectedFolder === 'SENT') loadEmails(true);
    if (selectedFolder === 'DRAFTS') loadEmails(true);
  };

  const replyTo = (email: ParsedEmail, all = false) => {
    const quotedBody = `<br/><br/>
<blockquote style="border-left:3px solid #d1d5db;padding-left:12px;color:#6b7280;margin:8px 0">
<p style="margin:0 0 4px 0"><b>El ${fmtFull(email.date)}, ${email.fromName || email.from} escribió:</b></p>
${email.bodyHtml || `<pre>${email.bodyText}</pre>`}
</blockquote>`;
    startCompose({
      to: email.from,
      cc: all ? email.cc : '',
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: quotedBody,
      replyToId: email.id,
    });
  };

  const forwardEmail = (email: ParsedEmail) => {
    const fwdBody = `<br/><br/>
<p style="color:#9ca3af">---------- Mensaje reenviado ----------</p>
<p style="margin:2px 0"><b>De:</b> ${email.fromName || email.from} &lt;${email.from}&gt;</p>
<p style="margin:2px 0"><b>Fecha:</b> ${fmtFull(email.date)}</p>
<p style="margin:2px 0"><b>Asunto:</b> ${email.subject}</p><br/>
${email.bodyHtml || `<pre>${email.bodyText}</pre>`}`;
    startCompose({
      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
      body: fwdBody,
    });
  };

  // ── Sync ──────────────────────────────────────────────────────────────────
  const syncImapAccountFolders = useCallback(async (account: ImapAccount, preferredFolder?: string) => {
    const foldersToSync = new Set<string>();
    foldersToSync.add(imapSystemFolderMap.INBOX || 'INBOX');
    if (imapSystemFolderMap.SENT) foldersToSync.add(imapSystemFolderMap.SENT);
    if (imapSystemFolderMap.DRAFTS) foldersToSync.add(imapSystemFolderMap.DRAFTS);
    if (preferredFolder && preferredFolder !== 'PINNED' && preferredFolder !== 'STARRED') {
      foldersToSync.add(mapFolderToImapApi(preferredFolder, imapSystemFolderMap));
    }

    for (const folder of foldersToSync) {
      await authFetch(
        `${API}/email/accounts/${account.id}/sync?folder=${encodeURIComponent(folder)}&limit=${folder === 'INBOX' ? 100 : 40}`,
        { method: 'POST' },
      ).catch(() => null);
    }
  }, [authFetch, imapSystemFolderMap]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (currentImapAccount) {
        await refreshImapFolders(currentImapAccount.id);
        await syncImapAccountFolders(currentImapAccount, selectedFolder);
        await loadEmails(true);
      } else if (gmail) {
        const { labels } = await gmail.listLabels();
        setGmailLabels((labels || []).map((label: any) => ({
          ...label,
          name: normalizeLabelName(label?.name, label?.id || 'Carpeta sin nombre'),
        })));
        const inbox = labels.find(l => l.id === 'INBOX');
        if (inbox?.messagesUnread !== undefined) setUnreadCount(inbox.messagesUnread);
        await loadEmails(true);
      }
    } catch (e: any) {
      if (!currentImapAccount) handleGmailError(e);
      setError(e.message || 'No se pudo sincronizar');
    }
    finally { setSyncing(false); }
  };

  const hasConfiguredAccounts = !!gmail || savedGmailProfiles.length > 0 || imapAccounts.length > 0;
  const hasActiveMailbox = activeProvider !== 'none';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // 73px = dashboard header (h-18 = 72px + 1px border-b)
    <div
      className="flex bg-gray-50 overflow-hidden"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", height: 'calc(100vh - 73px)' }}>

      {/* ── Sidebar ── */}
      <div className="hidden lg:flex flex-col flex-shrink-0 h-full" style={{ width: 240 }}>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Sidebar
            userEmail={userEmail}
            userName={userName}
            userAvatar={userAvatar}
            gmailProfile={gmailProfile}
            gmailConnected={!!gmail}
            savedGmailProfiles={savedGmailProfiles}
            labels={gmailLabels}
            selectedFolder={selectedFolder}
            onSelectFolder={(f) => {
              setSelectedFolder(f);
              setSelectedEmail(null);
              setSearchQ('');
            }}
            onCompose={() => startCompose()}
            onDisconnectGmail={disconnectGmail}
            onReconnectGoogleProfile={reconnectGoogleProfile}
            onDeleteGoogleProfile={deleteSavedGmailProfile}
            onConnectAccount={() => setShowConnectModal(true)}
            onSync={handleSync}
            syncing={syncing}
            unreadCount={unreadCount}
            draftCount={draftCount}
            pinnedCount={pinnedIds.length}
            imapAccounts={imapAccounts}
            selectedImapAccountId={selectedImapAccountId}
            imapFolders={imapCustomFolders}
            imapSystemFolderMap={imapSystemFolderMap}
            onSelectGmail={() => setSelectedImapAccountId(null)}
            onSelectImapAccount={(accountId) => {
              setSelectedImapAccountId(accountId);
              setSelectedFolder('INBOX');
              setSelectedEmail(null);
            }}
            onCreateLabel={() => { setNewLabelName(''); setLabelModalOpen(true); }}
            onDeleteLabel={requestDeleteUserLabel}
            onCreateImapFolder={() => { setNewLabelName(''); setLabelModalOpen(true); }}
            onDeleteImapAccount={requestDeleteImapAccount}
            canUseMailbox={hasActiveMailbox}
          />
        </div>
      </div>

      {/* ── Center + Right ── */}
      <div className="flex flex-1 min-w-0 overflow-hidden h-full">

        {/* ── Email list panel: siempre 380px en desktop, full en móvil sin email ── */}
        <div
          className={`flex flex-col flex-shrink-0 h-full border-r border-gray-200 ${
            selectedEmail ? 'hidden lg:flex lg:w-[380px]' : 'flex w-full lg:w-[380px]'
          }`}>

          {/* Mobile top: folder name */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 lg:hidden">
            <span className="text-sm font-semibold text-gray-700 flex-1">
              {SYSTEM_FOLDERS.find(f => f.key === selectedFolder)?.label || selectedFolder}
            </span>
            <button
              onClick={() => startCompose()}
              disabled={!hasActiveMailbox}
              className="p-2 bg-[#ab0433] text-white rounded-full">
              <Edit3 size={15} />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-3 py-2.5 border-b border-gray-200 bg-white">
            <form
              onSubmit={e => { e.preventDefault(); loadEmails(true); }}
              className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5 transition-colors">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  disabled={!hasActiveMailbox}
                  placeholder="Buscar en correos..."
                  className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400 min-w-0" />
                {searchQ && (
                  <button
                    type="button"
                    onClick={() => { setSearchQ(''); loadEmails(true); }}>
                    <X size={13} className="text-gray-400" />
                  </button>
                )}
              </div>
              <button type="submit" className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400">
                <Filter size={15} />
              </button>
            </form>
          </div>

          {/* Folder title + refresh */}
          <div className="hidden lg:flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              {SYSTEM_FOLDERS.find(f => f.key === selectedFolder)?.label || selectedFolder}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && selectedFolder === 'INBOX' && (
                <span className="text-xs text-gray-400">{unreadCount} no leídos</span>
              )}
              <button
                onClick={() => loadEmails(true)} disabled={loading || !hasActiveMailbox}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto bg-white">
            {!hasConfiguredAccounts ? (
              <ConnectWizard
                onConnectGoogle={connectGoogle}
                onConnectOutlook={connectOutlook}
                googleClientId={GMAIL_CLIENT_ID}
              />
            ) : gmailExpired ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
                <svg width={44} height={44} viewBox="0 0 24 24" className="opacity-70">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Sesión de Gmail expirada</p>
                  <p className="mt-1 text-xs text-gray-400">Tu sesión ha expirado o fue revocada. Vuelve a iniciar sesión para ver tus correos.</p>
                </div>
                <button
                  onClick={() => connectGoogle()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ab0433] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#8f022a]">
                  <LogIn size={15} /> Reconectar Gmail
                </button>
              </div>
            ) : !hasActiveMailbox ? (
              <MailboxLockedState
                hasConfiguredAccounts={hasConfiguredAccounts}
                onConnectAccount={() => setShowConnectModal(true)}
              />
            ) : loading && emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-[#ab0433] mb-3" />
                <p className="text-sm text-gray-400">Cargando mensajes...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <AlertCircle size={32} className="text-red-300 mb-3" />
                <p className="text-sm text-red-500 mb-4">{error}</p>
                {!gmail && (
                  <button
                    onClick={() => connectGoogle()}
                    className="flex items-center gap-2 text-sm text-[#ab0433] hover:text-[#8f022a] font-medium bg-red-50 px-4 py-2 rounded-full">
                    <LogIn size={15} /> Reconectar Gmail
                  </button>
                )}
              </div>
            ) : emails.length === 0 ? (
              <EmptyState folder={selectedFolder} />
            ) : (
              <>
                {emails.map(email => (
                  <EmailItem
                    key={email.id}
                    email={email}
                    selected={selectedEmail?.id === email.id}
                    onClick={() => openEmail(email)}
                    onStar={e => toggleStar(email.id, email.isStarred, e)}
                  />
                ))}
                {nextPageToken && (
                  <div className="py-4 flex justify-center border-t border-gray-100">
                    <button
                      onClick={() => loadEmails(false, nextPageToken)}
                      disabled={loading || !hasActiveMailbox}
                      className="text-sm text-[#ab0433] hover:text-[#8f022a] font-medium flex items-center gap-1.5 px-4 py-2 rounded-full hover:bg-red-50 transition-colors">
                      {loading
                        ? <Loader2 size={14} className="animate-spin" />
                        : <ChevronDown size={14} />}
                      Cargar más mensajes
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Email reader panel: siempre visible en desktop (flex-1), móvil solo si hay email ── */}
        <div className={`flex-1 min-w-0 h-full flex-col bg-white ${
          selectedEmail ? 'flex' : 'hidden lg:flex'
        }`}>
          {selectedEmail && hasActiveMailbox ? (
            <EmailReader
              email={selectedEmail}
              onReply={() => replyTo(selectedEmail)}
              onReplyAll={() => replyTo(selectedEmail, true)}
              onForward={() => forwardEmail(selectedEmail)}
              onDelete={() => deleteEmail(selectedEmail.id)}
              onStar={() => toggleStar(selectedEmail.id, selectedEmail.isStarred)}
              onBack={() => setSelectedEmail(null)}
              onPin={() => togglePinned(selectedEmail)}
              onRestore={selectedEmail.labelIds.includes('TRASH') ? () => restoreEmail(selectedEmail) : undefined}
              onAssignLabel={(labelId) => assignEmailToLabel(selectedEmail, labelId)}
              onCreateLabel={createUserLabel}
              userLabels={gmailLabels.filter((label) => label.type === 'user')}
            />
          ) : hasActiveMailbox ? (
            <div className="flex flex-col items-center justify-center h-full select-none">
              <MailOpen size={56} className="text-gray-200 mb-4" />
              <p className="text-gray-400 text-sm">Selecciona un mensaje para leerlo</p>
            </div>
          ) : (
            <MailboxLockedState
              hasConfiguredAccounts={hasConfiguredAccounts}
              onConnectAccount={() => setShowConnectModal(true)}
            />
          )}
        </div>
      </div>

      {/* ── Compose Window ── */}
      {compose && (
        <ComposeWindow
          data={compose}
          fromEmail={
            activeProvider === 'imap'
              ? (currentImapAccount?.email || userEmail)
              : (gmailProfile?.emailAddress || userEmail)
          }
          fromName={userName}
          gmail={activeProvider === 'gmail' ? gmail : null}
          accountId={activeProvider === 'imap' ? (currentImapAccount?.id ?? null) : null}
          getToken={tokenGetter}
          onClose={handleCloseCompose}
          onSent={handleComposeSent}
        />
      )}

      {labelModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!normalizedLabelName || creatingLabel) return;
              void createFolderForCurrentProvider(normalizedLabelName);
            }}
            className="w-full max-w-md rounded-[30px] border border-slate-200 bg-white shadow-[0_40px_80px_rgba(15,23,42,0.22)] overflow-hidden">
            <div className="px-6 pt-6 pb-5 bg-gradient-to-br from-white via-white to-red-50/50 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-[20px] bg-red-50 text-[#ab0433] flex items-center justify-center shadow-inner shadow-red-100">
                  <FolderPlus size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold text-slate-900">
                    {currentImapAccount ? 'Crear carpeta IMAP' : 'Crear carpeta personalizada'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {currentImapAccount
                      ? `Organiza mejor la cuenta ${currentImapAccount.email} con una carpeta propia.`
                      : 'Organiza tus correos con una carpeta propia dentro de Gmail y del ERP.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLabelModalOpen(false)}
                  aria-label="Cerrar"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre de la carpeta
                </label>
                <input
                  autoFocus
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Ej. Clientes VIP, Juicios, Pendientes..."
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-200"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Usa un nombre claro y corto. Luego podrás guardar correos directamente dentro de esta carpeta.
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (newLabelName.trim()) {
                    setNewLabelName('');
                    return;
                  }
                  setLabelModalOpen(false);
                }}
                className="px-5 py-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                Borrar
              </button>
              <button
                type="submit"
                disabled={!normalizedLabelName || creatingLabel}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#ab0433] text-white hover:bg-[#8f022a] transition-colors disabled:opacity-60">
                {creatingLabel ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                Crear
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingDeleteLabel && (
        <div className="fixed inset-0 z-[71] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_80px_rgba(15,23,42,0.22)] overflow-hidden">
            <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-white via-white to-red-50/40 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-red-50 text-[#ab0433] flex items-center justify-center">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Borrar carpeta</h3>
                  <p className="text-sm text-slate-500">Confirma si quieres eliminar esta carpeta.</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-sm text-slate-700">
                  ¿Quieres borrar la carpeta <span className="font-semibold text-[#ab0433]">{pendingDeleteLabel.name}</span>?
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDeleteLabel(null)}
                className="px-5 py-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingLabel}
                onClick={() => void deleteUserLabel()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#ab0433] text-white hover:bg-[#8f022a] transition-colors disabled:opacity-60">
                {deletingLabel ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteAccount && (
        <div className="fixed inset-0 z-[71] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_80px_rgba(15,23,42,0.22)] overflow-hidden">
            <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-white via-white to-red-50/40 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-red-50 text-[#ab0433] flex items-center justify-center">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Borrar cuenta de correo</h3>
                  <p className="text-sm text-slate-500">Confirma si quieres quitar esta cuenta del módulo.</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-sm text-slate-700">
                  ¿Quieres borrar la cuenta <span className="font-semibold text-[#ab0433]">{pendingDeleteAccount.name}</span>?
                </p>
                <p className="mt-1 text-xs text-slate-500">{pendingDeleteAccount.email}</p>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDeleteAccount(null)}
                className="px-5 py-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void deleteImapAccount()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#ab0433] text-white hover:bg-[#8f022a] transition-colors">
                <Trash2 size={16} />
                Borrar cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Connect Account Modal ── */}
      {showConnectModal && (
        <ConnectAccountModal
          savedGmailProfiles={savedGmailProfiles}
          onConnectNewGmail={() => { setShowConnectModal(false); connectGoogle(); }}
          onReconnectProfile={(profile) => { setShowConnectModal(false); reconnectGoogleProfile(profile); }}
          onAddImap={() => { setShowConnectModal(false); setImapPreset(null); setShowImapForm(true); }}
          onClose={() => setShowConnectModal(false)}
        />
      )}

      {/* ── IMAP form ── */}
      {showImapForm && (
        <ImapForm
          onClose={() => { setShowImapForm(false); setImapPreset(null); }}
          onSaved={async (savedAccount) => {
            setError('');

            // 1. Recargar lista de cuentas
            setImapAccounts((prev) => {
              const withoutCurrent = prev.filter((account) => account.id !== savedAccount.id);
              return [...withoutCurrent, savedAccount];
            });

            // 2. Seleccionar la cuenta recién añadida
            setSelectedImapAccountId(savedAccount.id);
            setSelectedFolder('INBOX');

            // 3. Cargar carpetas y hacer sync inmediato
            setSyncing(true);
            try {
              await refreshImapFolders(savedAccount.id);
              await syncImapAccountFolders(savedAccount, 'INBOX');
              const accountsResponse = await authFetch(`${API}/email/accounts`);
              const accountsPayload = await accountsResponse.json().catch(() => null);
              if (accountsResponse.ok && accountsPayload?.success) {
                setImapAccounts(accountsPayload.data || []);
              }

              setSelectedEmail(null);
              setShowImapForm(false);
              setImapPreset(null);
            } catch (e: any) {
              setError(`La cuenta se guardó, pero la primera sincronización falló: ${e.message || 'error desconocido'}`);
            }
            finally { setSyncing(false); }
            // loadEmails se dispara solo vía el useEffect [currentImapAccount, selectedFolder]
          }}
          getToken={tokenGetter}
          defaultEmail={userEmail}
          preset={imapPreset}
          defaultName={userName}
        />
      )}
    </div>
  );
}
