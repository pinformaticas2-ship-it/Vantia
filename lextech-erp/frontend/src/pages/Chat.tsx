import { suscribirTiempoReal, useTiempoRealConectado } from "../lib/realtime";
import React, {
  useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo,
} from "react";
import { Spinner } from "../components/Spinner";
import { FilePreviewModal, getFileTypeIcon, isPdfFile, isImageFile } from "../components/FilePreviewModal";
import { useAuth, useUser } from "@clerk/clerk-react";
import {
  Hash, Lock, Plus, X, Search, Pin, PinOff, Smile, Send,
  Trash2, Edit3, CornerDownRight, Users, Loader2, ChevronDown,
  Check, MessageSquare, Settings, LogOut, UserPlus, Crown,
  Globe, ChevronRight, MoreHorizontal, AtSign, Gavel,
  Image as ImageIcon, Bell, BellOff, Bold, Italic, Underline, Strikethrough,
  Link2, List, ListOrdered, Code, AlignLeft, Paperclip, Mic,
  Video, Pencil, ChevronUp, Layers, MessagesSquare, Star, Download,
  Share2, ExternalLink, Copy, Minus, RotateCcw, Sparkles, Clock3, Eye,
  PawPrint, UtensilsCrossed, Trophy, Flag, User, FileText, Briefcase, type LucideIcon,
  ArrowLeft, Camera, MessageSquareText, Keyboard, CheckCheck, Quote, CornerUpLeft,
} from "lucide-react";
import { safeJson, resolveUploadUrl, getActiveOrganizacionId } from "../lib/api";
import { createPortal } from "react-dom";
import { useChatUnread } from "../contexts/ChatUnreadContext";
import BackButton from "../components/BackButton";
import { useIsMobile } from "../lib/useIsMobile";
import { LinkPreviewCard, firstUrlIn } from "../components/LinkPreviewCard";
import { useOrganizacion } from "../lib/useOrganizacion";
import { aviso, confirmar } from "../lib/avisos";
import { abrirPaleta } from "../components/PaletaComandos";
import { t, t as tr } from '../lib/i18n';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════
interface Canal {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: "publico" | "privado" | "directo" | "expediente";
  no_leidos: number;
  total_miembros: number;
  archivado: boolean;
  ultimo_mensaje: string | null;
  ultimo_mensaje_autor: string | null;
  ultimo_mensaje_at: string | null;
  dm_target_user_id?: string | null;
  dm_target_user_name?: string | null;
  dm_target_avatar_url?: string | null;
  foto_url?: string | null;
  /** Silenciado por mí: sin avisos salvo menciones, atenuado en la lista. */
  silenciado?: boolean;
}
interface CanalBuscado {
  id: string; nombre: string; descripcion: string | null;
  tipo: string; total_miembros: number; ya_unido: boolean;
}
interface Mensaje {
  id: string; canal_id: string; user_id: string; user_name: string;
  avatar_url: string | null; contenido: string; tipo: string;
  gif_url: string | null; image_url?: string | null;
  file_url?: string | null; file_name?: string | null; file_mime?: string | null;
  reply_to_id: string | null;
  reply_to: Mensaje | null;
  reacciones: { emoji: string; user_id: string; user_name: string }[] | null;
  editado: boolean; deleted_at: string | null; created_at: string;
  /** Respuesta en hilo: id del mensaje principal (no sale en la conversación). */
  hilo_id?: string | null;
  /** Resumen del hilo de un mensaje principal (lo manda el servidor). */
  respuestas?: number | null;
  ultima_respuesta_at?: string | null;
  hilo_autores?: { user_id: string; user_name: string; avatar_url: string | null }[] | null;
  /** Solo en mensajes propios que aún no ha confirmado el servidor. */
  _envio?: "enviando" | "error";
}
/** Un mensaje que se acaba de escribir (sale en pantalla al instante). */
interface EnvioNuevo {
  texto: string;
  gifUrl?: string;
  replyId?: string;
  imagen?: { file: File; previewUrl: string };
  archivo?: File;
  /** Respuesta dentro de un hilo (id del mensaje principal). */
  hiloId?: string;
}
/** Quita los mensajes provisionales que ya han llegado de verdad (mismo
 *  autor y mismo texto) -- por si el aviso en tiempo real o el sondeo traen
 *  el mensaje antes que la respuesta del envío. */
function quitarProvisionalesConfirmados(lista: Mensaje[], reales: Mensaje[], currentUserId: string): Mensaje[] {
  const mios = reales.filter((r) => r.user_id === currentUserId);
  if (!mios.length || !lista.some((m) => m._envio === "enviando")) return lista;
  const quitar = new Set<string>();
  for (const r of mios) {
    const t = lista.find((m) => m._envio === "enviando" && !quitar.has(m.id) && m.contenido === r.contenido && !!m.gif_url === !!r.gif_url);
    if (t) quitar.add(t.id);
  }
  return quitar.size ? lista.filter((m) => !quitar.has(m.id)) : lista;
}
interface SesionExpediente {
  id: string; canal_id: string; expediente_id: string;
  expediente_ref: string | null; iniciado_por: string;
  iniciado_at: string; cerrado_at: string | null;
}
interface SysUser {
  user_id: string; user_name: string; avatar_url: string | null;
  email: string | null; role_label: string; status?: string;
}
interface Miembro {
  user_id: string; user_name: string; avatar_url: string | null;
  role: string; role_label: string; status: string; last_read_at?: string | null;
}
interface TypingUser {
  user_id: string;
  user_name: string;
  avatar_url: string | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════
const EMOJI_CATS = [
  { label:"Frecuentes", icon:"⏱️", emojis:["👍","❤️","😂","🎉","👀","🙏","🔥","✅","⚠️","📌","👋","🤝","💯","🎯","⚖️","📋","💼","🚀","🌟","💪"] },
  { label:"Caras",   icon:"😀", emojis:["😀","😃","😄","😁","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","🤑","🤗","🤔","😐","🙄","😬","😌","😔","😴","😷","🤒","🤕","🥵","🥶","🤯","🤠","🥳","😎","🤓","😕","😟","😮","😲","😳","🥺","😢","😭","😱","😤","😡","🤬","😈"] },
  { label:"Gestos",  icon:"👏", emojis:["👍","👎","👌","✌️","🤞","🤟","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐","🖖","👋","💪","🦾","✍️","🤝","🙌","👐","🤲","🙏","✊","👊","🤛","🤜","🤏","👏"] },
  { label:"Objetos", icon:"💼", emojis:["💼","📋","📌","📍","📎","🖇","📏","📐","✂️","🗃","🗂","🗑","🔒","🔓","🔑","🗝","🔨","⚖️","🔭","📡","💡","🔦","📱","💻","🖥","🖨","⌨️","🖱","💾","💿","📀","📸","📹","📽","🎥"] },
  { label:"Legal",   icon:"⚖️", emojis:["⚖️","🏛","📜","📝","🖊","📋","🔏","🔐","🗂","📂","📁","🔍","🔎","💰","🏦","🤝","👔","🎓","📚","📖","🖋","✒️","📄","📃","📑","🗒","🗓","📅","📆","🗑","📬","📯","📢","📣","🔔","🔕"] },
  { label:"Nat.",    icon:"🌿", emojis:["🌿","🍃","🌱","🌳","🌲","🌴","🌵","🌾","🍀","☘","🌺","🌸","🌼","🌻","🌹","🥀","🌷","🌏","🌍","🌎","🌙","⭐","🌟","✨","⚡","🔥","💧","🌊","❄","🌈","☀","🌤","⛅","☁","🌦","🌧","⛈","🌩","🌨","🌪","🌀"] },
  { label:"Símb.",   icon:"✅", emojis:["✅","❌","⭕","🔴","🟡","🟢","🔵","🟣","⚫","⚪","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔲","🔳","▪️","▫️","◾","◽","◼","◻","⬛","⬜","🔃","🔄","🔙","🔚","🔛","🔜","🔝","🆕","🆙","🆒","🆓","🆗","🆘","🆔","🆚","💯","🔞","📵","🚫","⛔","✳","❇"] },
];
const STATUS_CFG: Record<string, { label: string; color: string }> = {
  disponible:   { label:"Disponible",   color:"bg-green-500"  },
  ocupado:      { label:"Ocupado",      color:"bg-yellow-500" },
  en_juicio:    { label:"En Juicio",    color:"bg-red-600"    },
  en_reunion:   { label:"En Reunión",   color:"bg-blue-500"   },
  ausente:      { label:"Ausente",      color:"bg-slate-400"  },
  no_molestar:  { label:"No molestar",  color:"bg-red-900"    },
  // No seleccionable a mano -- solo sale del cálculo de presencia real (ver
  // computeEffectiveStatus), cuando no ha llegado un latido reciente.
  desconectado: { label:"Desconectado", color:"bg-slate-300"  },
};
// Estos 4 son señales deliberadas ("estoy en juicio", "no molestar"...) que la
// persona eligió a mano -- se respetan tal cual mientras siga conectada. Fuera
// de esos casos (incluido si nunca se ha tocado el selector, o si eligió
// "Disponible"/"Ausente") el estado real que se muestra sale de si ha
// mandado un latido hace poco, no de lo último que pulsó en el desplegable.
const STATUS_OVERRIDE_LIST = ["ocupado", "no_molestar", "en_juicio", "en_reunion"] as const;
// "Ausente" también puede ponerse a mano (botón aparte en el selector).
const STATUS_OVERRIDES = new Set<string>([...STATUS_OVERRIDE_LIST, "ausente"]);
const PRESENCE_ONLINE_MS = 45_000;      // latido con la pestaña visible -> disponible
const PRESENCE_AWAY_MS   = 3 * 60_000;  // ni la app abierta en segundo plano -> desconectado

/** Lo que se sabe de cada persona (organización activa): cuándo usó la app
 *  con la pestaña visible, cuándo la tenía abierta aunque fuera en segundo
 *  plano, y el estado que eligió (09/10/2026: antes el personalizado solo lo
 *  veía uno mismo). Los instantes son epoch-ms ya anclados al reloj de ESTE
 *  navegador (ver fetchPresence), así no depende de si el reloj del servidor
 *  o el de otro equipo están bien puestos. */
interface Presencia {
  activoAt: number;
  vistoAt: number;
  estado: string | null;
  texto: string | null;
  emoji: string | null;
  color: string | null;
}
type MapaPresencia = Record<string, Presencia>;
interface EstadoPropio { status: string | null; texto: string; emoji: string; color: string }

/** Estado real de una persona: lo que eligió a mano (si es un aviso
 *  deliberado) combinado con su presencia. `manualStatus` solo se pasa para
 *  uno mismo (lo local es más reciente); si no, se usa lo del servidor. */
function computeEffectiveStatus(
  userId: string | null | undefined,
  presence: MapaPresencia,
  manualStatus?: string | null,
): string {
  const p = userId ? presence[userId] : undefined;
  const manual = manualStatus !== undefined ? manualStatus : (p?.estado ?? null);
  const hasOverride = !!manual && STATUS_OVERRIDES.has(manual);
  if (!userId) return hasOverride ? manual! : "disponible";
  if (!p || Date.now() - p.vistoAt > PRESENCE_AWAY_MS) return "desconectado";
  // Desconectado de verdad pisa cualquier aviso manual -- si alguien puso
  // "En juicio" y luego cerró el portátil y se fue a casa, mejor mostrar
  // que está desconectado que dejar "En juicio" para siempre.
  if (hasOverride) return manual!;
  return Date.now() - p.activoAt > PRESENCE_ONLINE_MS ? "ausente" : "disponible";
}

/** Punto de color y texto del estado de una persona, con su estado
 *  personalizado si tiene uno ("⚖️ En sala 3"). `elegido` = lo eligió ella
 *  (aviso manual o personalizado), no es solo su presencia. */
function estadoVisible(
  userId: string | null | undefined,
  presence: MapaPresencia,
  propio?: EstadoPropio,
): { key: string; label: string; color: string; elegido: boolean } {
  const p = userId ? presence[userId] : undefined;
  const manual = propio ? propio.status : (p?.estado ?? null);
  const key = computeEffectiveStatus(userId, presence, manual);
  const cfg = STATUS_CFG[key] || STATUS_CFG.disponible;
  const texto = (propio ? propio.texto : p?.texto || "").trim();
  if (texto && key !== "desconectado") {
    const emoji = (propio ? propio.emoji : p?.emoji) || "💬";
    const colorKey = propio ? propio.color : p?.color;
    const color = key === "ausente" ? cfg.color : (CUSTOM_STATUS_COLORS.find((c) => c.key === colorKey)?.className || cfg.color);
    return { key, label: key === "ausente" ? `${emoji} ${texto} · Ausente` : `${emoji} ${texto}`, color, elegido: true };
  }
  return { key, label: cfg.label, color: cfg.color, elegido: key !== "desconectado" && !!manual && STATUS_OVERRIDES.has(manual) };
}

const DURACIONES_ESTADO = [
  { k: "", label: "No quitar" },
  { k: "30", label: "30 minutos" },
  { k: "60", label: "1 hora" },
  { k: "240", label: "4 horas" },
  { k: "hoy", label: "Hoy" },
] as const;
function hastaDeDuracion(k: string): string | null {
  if (!k) return null;
  const d = new Date();
  if (k === "hoy") d.setHours(23, 59, 0, 0);
  else d.setMinutes(d.getMinutes() + Number(k));
  return d.toISOString();
}
function horaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === hoy.toDateString() ? hora : `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${hora}`;
}

/** Foto del grupo recortada al centro en cuadrado y reducida (pesa poco y
 *  se ve igual en todos los sitios). */
async function recortarFotoCuadrada(file: File, lado = 256): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error(t("No se pudo leer la imagen")));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = lado; canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("No se pudo procesar la imagen"));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, lado, lado);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error(t("No se pudo procesar la imagen")))), "image/jpeg", 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}
const CHAT_CANALES_CACHE_KEY = "chat-canales-cache-v1";
const CHAT_USERS_CACHE_KEY = "chat-users-cache-v1";
const CHAT_DM_ORDER_CACHE_KEY = "chat-dm-order-cache-v1";
// El chat ahora está aislado por organización (antes era global) -- estas
// cachés locales tienen que ir con la organización activa a cuestas, si no,
// al cambiar de organización (que recarga la página) se vería un instante
// los canales/contactos de la organización anterior hasta que la petición
// de verdad responda y los pisara. Mismo patrón ya usado para no filtrar
// datos entre usuarios que comparten navegador.
//
// IMPORTANTE: `orgId` se pasa explícito (capturado una sola vez al montar el
// componente, ver `orgIdRef` en Chat()) en vez de leer getActiveOrganizacionId()
// aquí dentro. Ese valor vive en localStorage global y cambia en el instante
// en que se pulsa "cambiar de organización" (switchOrganizacion hace
// setActiveOrganizacionId(id) y LUEGO location.reload()) -- cualquier fetch/
// poll de canales que ya estuviera en vuelo en ese momento terminaba
// resolviendo *después* del cambio de id, y escribía los canales de la
// organización VIEJA bajo la clave de caché de la organización NUEVA. Ese
// canal fantasma (ej. un DM) sobrevivía para siempre porque mergeCanales
// conserva cualquier entrada que no venga en la respuesta más reciente del
// servidor, dando lugar al bug de "el mismo chat aparece dos veces".
const orgScopedCacheKey = (base: string, orgId: string | null) => {
  return orgId ? `${base}::${orgId}` : base;
};
const CHAT_EMOJI_RECENTS_KEY = "chat-emoji-recents-v1";
const CHAT_GIF_CACHE_KEY = "chat-gif-cache-v1";
const CHAT_CUSTOM_STATUS_KEY = "chat-custom-status-v1";
const CHAT_CUSTOM_STATUS_EMOJI_KEY = "chat-custom-status-emoji-v1";
const CHAT_CUSTOM_STATUS_COLOR_KEY = "chat-custom-status-color-v1";
const CHAT_NOTIFICATIONS_PAUSED_KEY = "chat-notifications-paused-v1";
const CHAT_BORRADORES_KEY = "vantia.chat.borradores";
const API_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const MAX_RECENT_EMOJIS = 24;
const EMOJI_API_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GIF_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const IMAGE_PLACEHOLDER_TEXT = "Imagen";
const AVALENTIA_RED = "#ab0433";
const AVALENTIA_RED_DARK = "#92042c";
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY?.trim() || "";
const GIPHY_RATING = "g";
const EMOJI_API_ACCESS_KEY = import.meta.env.VITE_EMOJI_API_KEY?.trim() || "";
const EMOJI_API_URL = "https://emoji-api.com/emojis";
const CUSTOM_STATUS_EMOJIS = ["💼", "⚖️", "🧠", "☕", "🏛️", "📞", "📝", "🚗"];
const CUSTOM_STATUS_COLORS = [
  { key: "emerald", className: "bg-emerald-500" },
  { key: "blue", className: "bg-blue-500" },
  { key: "amber", className: "bg-amber-500" },
  { key: "violet", className: "bg-violet-500" },
  { key: "rose", className: "bg-rose-500" },
  { key: "slate", className: "bg-slate-500" },
] as const;

interface GiphyGif {
  id: string;
  title?: string;
  slug?: string;
  images: {
    fixed_height_small?: { url: string };
    fixed_height?: { url: string };
    downsized_medium?: { url: string };
    original?: { url: string };
  };
}

interface EmojiApiEntry {
  slug?: string;
  character?: string;
  unicodeName?: string;
  codePoint?: string;
  group?: string;
  subGroup?: string;
}

const CHAT_EMOJI_API_CACHE_KEY = "chat-emoji-api-cache-v2";
const EMOJI_GROUP_META = [
  { key: "smileys", label: "Caritas y emociones", icon: "😀" },
  { key: "people", label: "Personas y cuerpo", icon: "👋" },
  { key: "animals", label: "Animales y naturaleza", icon: "🐶" },
  { key: "food", label: "Comida y bebida", icon: "🍔" },
  { key: "activities", label: "Actividades", icon: "⚽" },
  { key: "travel", label: "Viajes y lugares", icon: "✈️" },
  { key: "objects", label: "Objetos", icon: "💡" },
  { key: "symbols", label: "Símbolos", icon: "🔣" },
  { key: "flags", label: "Banderas", icon: "🏁" },
] as const;
const EMOJI_API_GROUP_MAP: Record<string, typeof EMOJI_GROUP_META[number]["key"] | null> = {
  "smileys-emotion": "smileys",
  "people-body": "people",
  "component": null,
  "animals-nature": "animals",
  "food-drink": "food",
  "activities": "activities",
  "travel-places": "travel",
  "objects": "objects",
  "symbols": "symbols",
  "flags": "flags",
};

const EMOJI_FONT_STACK = "\"Noto Color Emoji\", \"Segoe UI Emoji\", \"Apple Color Emoji\", sans-serif";
const TWEMOJI_CDN_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg";
const EMOJI_TEXT_SEGMENT_REGEX = /((?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*))/gu;
const EMOJI_TEXT_SEGMENT_TEST_REGEX = /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)$/u;

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getEmojiCodepoints(emoji: string) {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16).toLowerCase())
    .filter((codepoint): codepoint is string => !!codepoint && codepoint !== "fe0f");
}

function isFlagEmoji(emoji: string) {
  const codepoints = getEmojiCodepoints(emoji);
  if (codepoints.length === 0) return false;
  return codepoints.some((codepoint) => {
    const value = Number.parseInt(codepoint, 16);
    return (
      (value >= 0x1f1e6 && value <= 0x1f1ff) ||
      value === 0x1f3c1 ||
      value === 0x1f6a9 ||
      value === 0x1f38c ||
      value === 0x1f3f3 ||
      value === 0x1f3f4
    );
  });
}

const EMOJI_CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: Sparkles,
  recent: Clock3,
  smileys: Smile,
  people: Users,
  animals: PawPrint,
  food: UtensilsCrossed,
  activities: Trophy,
  travel: Globe,
  objects: Paperclip,
  symbols: Layers,
  flags: Flag,
};

function EmojiCategoryIcon({
  categoryKey,
  size = 18,
  className = "",
}: {
  categoryKey: string;
  size?: number | string;
  className?: string;
}) {
  const Icon = EMOJI_CATEGORY_ICONS[categoryKey];
  if (Icon) return <Icon size={size} className={className} />;
  return <Sparkles size={size} className={className} />;
}

const EmojiImg = React.memo(function EmojiImg({
  emoji,
  size = 24,
  className = "",
}: {
  emoji: string;
  size?: number;
  className?: string;
}) {
  if (isFlagEmoji(emoji)) {
    const codepoints = getEmojiCodepoints(emoji).join("-");
    return (
      <img
        src={`${TWEMOJI_CDN_BASE}/${codepoints}.svg`}
        alt={emoji}
        draggable={false}
        className={`inline-block select-none object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={emoji}
      className={`inline-flex select-none items-center justify-center ${className}`}
      style={{ fontFamily: EMOJI_FONT_STACK, fontSize: size, lineHeight: 1 }}
    >
      {emoji}
    </span>
  );
});

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" });

/** "hace 5 min", "ayer a las 18:20", "el 3 nov." */
function haceRato(iso: string): string {
  const t = new Date(iso).getTime();
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const d = new Date(t);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return tr("hoy a las {hora}", { hora: fmtTime(iso) });
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return tr("ayer a las {hora}", { hora: fmtTime(iso) });
  return tr("el {fecha}", { fecha: d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) });
}

/** Reacciones de un clic en la barra de cada mensaje. */
const REACCIONES_RAPIDAS = ["✅", "👀", "👍"];

const mediaUrl = (url?: string | null) => resolveUploadUrl(url);

function fmtDateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoy";
  const y = new Date(); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long" });
}

const initials = (s: string) =>
  s.split(" ").slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("");

function avatarBg(id: string) {
  const p = ["bg-red-600","bg-violet-600","bg-blue-600","bg-teal-600",
             "bg-green-600","bg-orange-500","bg-pink-600","bg-indigo-600"];
  let h = 0; for (const c of id) h = (h*31 + c.charCodeAt(0)) % p.length;
  return p[Math.abs(h) % p.length];
}

function areCanalesEquivalent(a: Canal[], b: Canal[]) {
  if (a.length !== b.length) return false;
  return a.every((canal, index) => {
    const other = b[index];
    return !!other &&
      canal.id === other.id &&
      canal.nombre === other.nombre &&
      canal.tipo === other.tipo &&
      canal.no_leidos === other.no_leidos &&
      canal.ultimo_mensaje === other.ultimo_mensaje &&
      canal.ultimo_mensaje_at === other.ultimo_mensaje_at &&
      canal.total_miembros === other.total_miembros &&
      canal.dm_target_user_id === other.dm_target_user_id &&
      canal.dm_target_user_name === other.dm_target_user_name &&
      canal.dm_target_avatar_url === other.dm_target_avatar_url;
  });
}

function areMensajesEquivalent(a: Mensaje[], b: Mensaje[]) {
  if (a.length !== b.length) return false;
  return a.every((mensaje, index) => {
    const other = b[index];
    return !!other &&
      mensaje.id === other.id &&
      mensaje.created_at === other.created_at &&
      mensaje.deleted_at === other.deleted_at &&
      mensaje.contenido === other.contenido &&
      mensaje.tipo === other.tipo &&
      mensaje.editado === other.editado &&
      mensaje.user_id === other.user_id &&
      mensaje.reply_to_id === other.reply_to_id &&
      JSON.stringify(mensaje.reacciones || []) === JSON.stringify(other.reacciones || []);
  });
}

function ImageLightbox({
  src,
  alt,
  authorName,
  authorAvatarUrl,
  createdAt,
  fileName,
  onClose,
}: {
  src: string;
  alt: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  createdAt?: string;
  fileName?: string;
  onClose: () => void;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [zoom, setZoom] = useState(1);

  const clampZoom = useCallback((value: number) => Math.min(4, Math.max(0.6, value)), []);
  const zoomIn = useCallback(() => setZoom((prev) => clampZoom(Number((prev + 0.2).toFixed(2)))), [clampZoom]);
  const zoomOut = useCallback(() => setZoom((prev) => clampZoom(Number((prev - 0.2).toFixed(2)))), [clampZoom]);
  const resetZoom = useCallback(() => setZoom(1), []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "+" || event.key === "=") zoomIn();
      if (event.key === "-") zoomOut();
      if (event.key === "0") resetZoom();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, resetZoom, zoomIn, zoomOut]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const suggestedName = fileName || src.split("/").pop()?.split("?")[0] || "imagen-chat";
  const createdLabel = createdAt
    ? `${new Date(createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${fmtTime(createdAt)}`
    : null;

  const openOriginal = useCallback(() => {
    const newWindow = window.open(src, "_blank", "noopener,noreferrer");
    if (!newWindow) setFeedback("No se pudo abrir la imagen");
    setShowOptions(false);
  }, [src]);

  const copyText = useCallback(async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(src, { credentials: "same-origin" });
      if (!response.ok) throw new Error(t("download"));
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1200);
      setFeedback("Descarga iniciada");
    } catch {
      openOriginal();
    }
  }, [openOriginal, src, suggestedName]);

  const copyLink = useCallback(async () => {
    try {
      const copied = await copyText(src);
      if (!copied) throw new Error(t("copy"));
      setFeedback("Enlace copiado");
      setShowOptions(false);
    } catch {
      setFeedback("No se pudo copiar");
    }
  }, [copyText, src]);

  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: suggestedName || alt, text: alt, url: src });
        setFeedback("Compartido");
        return;
      }
      const copied = await copyText(src);
      if (!copied) throw new Error(t("share"));
      setFeedback("Enlace copiado para compartir");
    } catch {
      openOriginal();
    }
  }, [alt, copyText, openOriginal, src, suggestedName]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] overflow-hidden transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <div className="absolute inset-0 bg-slate-950/88" />
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-3xl transition-transform duration-500"
        style={{ backgroundImage: `url(${src})`, transform: isVisible ? "scale(1.06)" : "scale(1.14)" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(15,23,42,0.2)_42%,_rgba(2,6,23,0.8)_100%)]" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <Av url={authorAvatarUrl} name={authorName} size={10} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{authorName}</p>
            <p className="truncate text-xs text-slate-300">
              {createdLabel ? `${createdLabel} · ` : ""}
              {suggestedName}
            </p>
            {feedback && <p className="mt-0.5 text-[11px] text-slate-300">{feedback}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2 py-2 shadow-lg shadow-black/10">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDownload(); }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <Download size={16} />{t("Descargar")}</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleShare(); }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <Share2 size={16} />{t("Compartir")}</button>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowOptions((v) => !v); }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              <MoreHorizontal size={16} />{t("Opciones")}</button>
            {showOptions && (
              <div
                className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/95 p-1 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => { openOriginal(); }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
                >
                  <ExternalLink size={15} />{t("Abrir original")}</button>
                <button
                  type="button"
                  onClick={() => { void copyLink(); }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
                >
                  <Copy size={15} />{t("Copiar enlace")}</button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
            aria-label={t("Cerrar visor")}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex h-full w-full items-center justify-center px-4 pb-6 pt-24 sm:px-8">
        <div
          className={`flex max-h-full max-w-full items-center justify-center transition-all duration-300 ease-out ${
            isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-[0.94] opacity-0"
          }`}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (e.deltaY < 0) zoomIn();
            else zoomOut();
          }}
        >
          <div className="relative">
            <div
              className="absolute inset-0 -z-10 scale-[1.03] rounded-[2rem] opacity-35 blur-2xl"
              style={{ backgroundImage: `url(${src})`, backgroundPosition: "center", backgroundSize: "cover" }}
            />
            <img
              src={src}
              alt={alt}
              className="max-h-[82vh] max-w-[94vw] rounded-[2rem] object-contain shadow-[0_28px_100px_-26px_rgba(15,23,42,0.98)]"
              style={{ imageRendering: "auto", transform: `scale(${zoom})`, transition: "transform 180ms ease-out" }}
            />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2 py-2 text-xs text-slate-300">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomOut(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-40"
            aria-label={t("Reducir imagen")}
            disabled={zoom <= 0.6}
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
            className="rounded-full px-3 py-2 font-semibold text-white transition hover:bg-white/10"
            aria-label={t("Restablecer zoom")}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomIn(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-40"
            aria-label={t("Ampliar imagen")}
            disabled={zoom >= 4}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label={t("Reiniciar zoom")}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">{t("Usa `+`, `-`, rueda o `0` para el zoom")}</div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2 py-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDownload(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label={t("Descargar imagen")}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleShare(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label={t("Compartir imagen")}
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openOriginal(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label={t("Abrir imagen original")}
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function mergeCanales(prev: Canal[], next: Canal[]) {
  const nextIds = new Set(next.map(c => c.id));
  const preserved = prev.filter(c => !nextIds.has(c.id));
  return [...next, ...preserved];
}

function areCanalDetailsEquivalent(a: Canal | null, b: Canal | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.nombre === b.nombre &&
    a.descripcion === b.descripcion &&
    a.tipo === b.tipo &&
    a.total_miembros === b.total_miembros &&
    a.archivado === b.archivado &&
    a.dm_target_user_id === b.dm_target_user_id &&
    a.dm_target_user_name === b.dm_target_user_name &&
    a.dm_target_avatar_url === b.dm_target_avatar_url
  );
}

function sortByDmOrder<T extends { user: { user_id: string; user_name: string } }>(items: T[], dmOrder: string[]) {
  const indexMap = new Map(dmOrder.map((userId, index) => [userId, index]));
  return [...items].sort((a, b) => {
    const aIndex = indexMap.get(a.user.user_id);
    const bIndex = indexMap.get(b.user.user_id);
    if (aIndex != null && bIndex != null && aIndex !== bIndex) return aIndex - bIndex;
    if (aIndex != null) return -1;
    if (bIndex != null) return 1;
    return a.user.user_name.localeCompare(b.user.user_name, "es");
  });
}

// ── Texto de los mensajes (11/11/2026, formato como en Slack) ──────────────
// En línea: **negrita**, *cursiva* o _cursiva_, ~tachado~, `código`,
// [texto](enlace), enlaces sueltos y @menciones (el nombre entero, aunque
// tenga apellidos). Por líneas: ```bloque de código```, > cita, listas con
// "- " y numeradas con "1. ".
interface ContextoTexto { nombres: string[]; miNombre: string }
const ContextoTextoChat = React.createContext<ContextoTexto>({ nombres: [], miNombre: "" });
const MENCIONES_GRUPO = ["canal", "todos", "aqui"];

function sinTildes(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ¿Este texto me menciona? (@mi nombre, @canal, @todos o @aquí) */
function mencionaA(texto: string | null | undefined, miNombre: string): boolean {
  if (!texto || !texto.includes("@")) return false;
  const t = sinTildes(texto);
  if (/(^|[^\p{L}\p{N}])@(canal|todos|aqui)(?![\p{L}\p{N}])/u.test(t)) return true;
  const yo = sinTildes(miNombre || "").trim();
  return !!yo && t.includes(`@${yo}`);
}

function conEmojis(text: string, keyPrefix: string): React.ReactNode[] {
  return text
    .split(EMOJI_TEXT_SEGMENT_REGEX)
    .filter(Boolean)
    .map((segment, index) => (
      EMOJI_TEXT_SEGMENT_TEST_REGEX.test(segment)
        ? <EmojiImg key={`${keyPrefix}-emoji-${index}`} emoji={segment} size={18} className="mx-[1px] inline-block align-[-0.2em]" />
        : <React.Fragment key={`${keyPrefix}-text-${index}`}>{segment}</React.Fragment>
    ));
}

const TROZOS_EN_LINEA = /(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}])|~[^~\n]+~|https?:\/\/[^\s<]+|@[\p{L}\p{N}_.-]+(?: [\p{L}\p{N}_.-]+){0,3})/gu;

function renderEnLinea(s: string, ctx: ContextoTexto, kp: string): React.ReactNode[] {
  return s.split(TROZOS_EN_LINEA).filter((p) => p !== "").map((p, i) => {
    const key = `${kp}-${i}`;
    const enlace = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (enlace) return <a key={key} href={enlace[2]} target="_blank" rel="noreferrer" className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700">{conEmojis(enlace[1], key)}</a>;
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={key} className="rounded border border-slate-200 bg-slate-100 px-1 py-px font-mono text-[13px] text-rose-700">{p.slice(1, -1)}</code>;
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={key} className="font-semibold text-slate-900">{renderEnLinea(p.slice(2, -2), ctx, key)}</strong>;
    if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) return <em key={key}>{renderEnLinea(p.slice(1, -1), ctx, key)}</em>;
    if (p.length > 2 && p.startsWith("_") && p.endsWith("_")) return <em key={key}>{renderEnLinea(p.slice(1, -1), ctx, key)}</em>;
    if (p.length > 2 && p.startsWith("~") && p.endsWith("~")) return <s key={key} className="text-slate-500">{renderEnLinea(p.slice(1, -1), ctx, key)}</s>;
    if (/^https?:\/\//.test(p)) {
      // Un punto o paréntesis al final suele ser de la frase, no del enlace.
      const m = p.match(/^(.*?)([.,;:!?)\]]*)$/)!;
      return (
        <React.Fragment key={key}>
          <a href={m[1]} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700">{m[1]}</a>{m[2]}
        </React.Fragment>
      );
    }
    if (p.startsWith("@") && p.length > 1) {
      const cuerpo = p.slice(1);
      const n = sinTildes(cuerpo);
      // El nombre conocido más largo con el que empieza ("@Ana López García").
      let largo = 0;
      for (const nombre of ctx.nombres) {
        const nn = sinTildes(nombre);
        if (nn && (n === nn || n.startsWith(`${nn} `)) && nn.length > largo) largo = nn.length;
      }
      const grupo = !largo && MENCIONES_GRUPO.find((g) => n === g || n.startsWith(`${g} `));
      if (!largo) largo = grupo ? grupo.length : cuerpo.split(" ")[0].length;
      const nombre = cuerpo.slice(0, largo);
      const resto = cuerpo.slice(largo);
      const mia = !!grupo || (!!ctx.miNombre && sinTildes(nombre) === sinTildes(ctx.miNombre));
      return (
        <React.Fragment key={key}>
          <span className={`rounded px-0.5 font-semibold ${mia ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}>@{nombre}</span>
          {resto && renderEnLinea(resto, ctx, `${key}r`)}
        </React.Fragment>
      );
    }
    return <React.Fragment key={key}>{conEmojis(p, key)}</React.Fragment>;
  });
}

function renderTexto(s: string, ctx: ContextoTexto): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const lineas = (s || "").replace(/\r\n/g, "\n").split("\n");
  let parrafo: string[] = [];
  let k = 0;
  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    const n = k++;
    out.push(<span key={n} className="block whitespace-pre-wrap">{renderEnLinea(parrafo.join("\n"), ctx, `p${n}`)}</span>);
    parrafo = [];
  };
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    // ```bloque de código``` (también en una sola línea)
    if (/^\s*```/.test(l)) {
      cerrarParrafo();
      const cod: string[] = [];
      const primera = l.replace(/^\s*```/, "");
      if (primera.length > 3 && /```\s*$/.test(primera)) {
        cod.push(primera.replace(/```\s*$/, ""));
        i++;
      } else {
        if (primera.trim()) cod.push(primera);
        i++;
        while (i < lineas.length && !/```\s*$/.test(lineas[i])) { cod.push(lineas[i]); i++; }
        if (i < lineas.length) { const ultima = lineas[i].replace(/```\s*$/, ""); if (ultima.trim()) cod.push(ultima); i++; }
      }
      out.push(<pre key={k++} className="my-1 overflow-x-auto whitespace-pre rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] leading-snug text-slate-700">{cod.join("\n")}</pre>);
      continue;
    }
    if (/^>\s?/.test(l)) {
      cerrarParrafo();
      const cita: string[] = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) { cita.push(lineas[i].replace(/^>\s?/, "")); i++; }
      const n = k++;
      out.push(<blockquote key={n} className="my-0.5 whitespace-pre-wrap border-l-[3px] border-slate-300 pl-3 text-slate-600">{renderEnLinea(cita.join("\n"), ctx, `q${n}`)}</blockquote>);
      continue;
    }
    if (/^\s*[-•*]\s+\S/.test(l)) {
      cerrarParrafo();
      const items: string[] = [];
      while (i < lineas.length && /^\s*[-•*]\s+\S/.test(lineas[i])) { items.push(lineas[i].replace(/^\s*[-•*]\s+/, "")); i++; }
      const n = k++;
      out.push(<ul key={n} className="my-0.5 list-disc space-y-0.5 pl-5 marker:text-slate-400">{items.map((it, j) => <li key={j}>{renderEnLinea(it, ctx, `u${n}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+\S/.test(l)) {
      cerrarParrafo();
      const items: string[] = [];
      const inicio = parseInt(l.trim(), 10) || 1;
      while (i < lineas.length && /^\s*\d+[.)]\s+\S/.test(lineas[i])) { items.push(lineas[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      const n = k++;
      out.push(<ol key={n} start={inicio} className="my-0.5 list-decimal space-y-0.5 pl-6 marker:text-slate-400">{items.map((it, j) => <li key={j}>{renderEnLinea(it, ctx, `o${n}-${j}`)}</li>)}</ol>);
      continue;
    }
    parrafo.push(l);
    i++;
  }
  cerrarParrafo();
  return out;
}

function TextoMensaje({ texto }: { texto: string }) {
  const ctx = React.useContext(ContextoTextoChat);
  const nodos = useMemo(() => renderTexto(texto, ctx), [texto, ctx]);
  return <>{nodos}</>;
}

function buildTypingLabel(names: string[]) {
  if (!names.length) return "";
  if (names.length === 1) return t("{a} está escribiendo...", { a: names[0] });
  if (names.length === 2) return t("{a} y {b} están escribiendo...", { a: names[0], b: names[1] });
  return t("{a}, {b} y {n} más están escribiendo...", { a: names[0], b: names[1], n: names.length - 2 });
}

function normalizeEmojiSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeGifCacheKey(query: string) {
  return query.trim().toLowerCase() || "__trending__";
}

function htmlToComposerText(html: string, plainTextFallback: string) {
  if (typeof window === "undefined") return plainTextFallback;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const visit = (node: Node, olDepth = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (!(node instanceof HTMLElement)) return "";

    const tag = node.tagName.toLowerCase();
    const childText = Array.from(node.childNodes).map((child) => visit(child, olDepth)).join("");
    const normalizedChild = childText.replace(/\u00a0/g, " ");

    switch (tag) {
      case "strong":
      case "b":
        return `**${normalizedChild.trim() || ""}**`;
      case "em":
      case "i":
        return `*${normalizedChild.trim() || ""}*`;
      case "code":
        return `\`${normalizedChild.trim() || ""}\``;
      case "br":
        return "\n";
      case "a": {
        const href = node.getAttribute("href")?.trim() || "";
        const label = normalizedChild.trim();
        if (!href) return label;
        if (!label || label === href) return href;
        return `[${label}](${href})`;
      }
      case "li": {
        const prefix = node.parentElement?.tagName.toLowerCase() === "ol" ? `${olDepth + 1}. ` : "- ";
        return `${prefix}${normalizedChild.trim()}\n`;
      }
      case "ul":
        return `\n${Array.from(node.childNodes).map((child) => visit(child, olDepth)).join("")}\n`;
      case "ol":
        return `\n${Array.from(node.children).map((child, index) => visit(child, index)).join("")}\n`;
      case "p":
      case "div":
      case "section":
      case "article":
      case "blockquote":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return `${normalizedChild.trim()}\n`;
      default:
        return normalizedChild;
    }
  };

  const converted = Array.from(doc.body.childNodes).map((child) => visit(child)).join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return converted || plainTextFallback;
}


function buildEmojiApiGroups(entries: EmojiApiEntry[]) {
  const buckets = new Map<string, { key: string; label: string; icon: string; emojis: string[] }>();
  EMOJI_GROUP_META.forEach((meta) => {
    buckets.set(meta.key, { ...meta, emojis: [] });
  });

  const searchIndex: Record<string, string[]> = {};

  entries.forEach((entry) => {
    const emoji = entry.character?.trim();
    const mappedGroupKey = entry.group ? EMOJI_API_GROUP_MAP[entry.group] : null;
    if (!emoji || !mappedGroupKey) return;

    const bucket = buckets.get(mappedGroupKey);
    if (!bucket) return;
    if (!bucket.emojis.includes(emoji)) bucket.emojis.push(emoji);

    const tags = [entry.unicodeName || "", entry.slug || "", entry.subGroup || "", entry.group || ""].filter(Boolean);
    searchIndex[emoji] = [...new Set([...(searchIndex[emoji] || []), ...tags])];
  });

  return {
    groups: EMOJI_GROUP_META.map((meta) => buckets.get(meta.key)!).filter((group) => group.emojis.length > 0),
    searchIndex,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AVATAR
// ══════════════════════════════════════════════════════════════════════════════
function Av({ url, name, size=8 }: { url?: string|null; name: string; size?: number }) {
  const [fail, setFail] = useState(false);
  const sz = `w-${size} h-${size}`;
  const avatarUrl = mediaUrl(url);
  if (avatarUrl && !fail)
    return <img src={avatarUrl} alt={name} className={`${sz} rounded-full object-cover shrink-0`} onError={()=>setFail(true)}/>;
  return (
    <div className={`${sz} rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold select-none ${avatarBg(name)}`}>
      {initials(name)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMOJI PICKER
// ══════════════════════════════════════════════════════════════════════════════
function EmojiPicker({
  onPick,
  onPickGif,
  onClose,
  anchorRef,
  align = "left",
  defaultTab = "emoji",
  enableGifs = !!onPickGif,
}: {
  onPick:(e:string)=>void;
  onPickGif?:(url:string)=>void;
  onClose:()=>void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  align?: "left" | "right";
  defaultTab?: "emoji" | "gif";
  enableGifs?: boolean;
}) {
  const [mediaTab, setMediaTab] = useState<"emoji" | "gif">(defaultTab);
  const [cat, setCat] = useState(0);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [apiGroups, setApiGroups] = useState<Array<{ key: string; label: string; icon: string; emojis: string[] }> | null>(null);
  const [apiSearchTags, setApiSearchTags] = useState<Record<string, string[]>>({});
  const [emojiApiLoading, setEmojiApiLoading] = useState(true);
  const [emojiApiError, setEmojiApiError] = useState<string | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [gifCategories, setGifCategories] = useState<string[]>([]);
  const [gifSuggestions, setGifSuggestions] = useState<string[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const gifCacheRef = useRef<Map<string, GiphyGif[]>>(new Map());
  const gifSearchSeqRef = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({
    position: "fixed",
    left: 12,
    top: 12,
    transformOrigin: "bottom left",
  });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsidePicker = !!ref.current && ref.current.contains(target);
      const clickedAnchorButton = !!anchorRef?.current && anchorRef.current.contains(target);
      if (!clickedInsidePicker && !clickedAnchorButton) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorRef, onClose]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    setMediaTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 376;
      const estimatedHeight = 520;
      const left = align === "right"
        ? Math.max(12, rect.right - width)
        : Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
      if (rect.top > window.innerHeight / 2) {
        setPickerStyle({
          position: "fixed",
          left,
          bottom: Math.max(12, window.innerHeight - rect.top + 10),
          width,
          maxHeight: Math.min(540, window.innerHeight - 24),
          transformOrigin: align === "right" ? "bottom right" : "bottom left",
        });
        return;
      }
      const top = Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 10);
      setPickerStyle({
        position: "fixed",
        left,
        top,
        width,
        maxHeight: Math.min(540, window.innerHeight - 24),
        transformOrigin: align === "right" ? "top right" : "top left",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, anchorRef]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_EMOJI_RECENTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) setRecentEmojis(parsed.filter(Boolean));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_GIF_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt?: number; items?: Record<string, GiphyGif[]> };
      if (!parsed?.savedAt || !parsed.items) return;
      if (Date.now() - parsed.savedAt > GIF_CACHE_TTL_MS) return;
      gifCacheRef.current = new Map(
        Object.entries(parsed.items).filter(([, value]) => Array.isArray(value))
      );
    } catch {
      // ignore cache errors
    }
  }, []);

  const buildGiphyUrl = useCallback((endpoint: string, params: Record<string, string | number>) => {
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    url.searchParams.set("api_key", GIPHY_API_KEY);
    url.searchParams.set("rating", GIPHY_RATING);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }, []);

  const resolveGifPreview = useCallback((gif: GiphyGif) => (
    gif.images.fixed_height_small?.url ||
    gif.images.fixed_height?.url ||
    gif.images.downsized_medium?.url ||
    gif.images.original?.url ||
    ""
  ), []);

  const resolveGifUrl = useCallback((gif: GiphyGif) => (
    gif.images.fixed_height?.url ||
    gif.images.downsized_medium?.url ||
    gif.images.original?.url ||
    gif.images.fixed_height_small?.url ||
    ""
  ), []);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromEntries = (entries: EmojiApiEntry[]) => {
      const next = buildEmojiApiGroups(entries);
      if (cancelled) return;
      setApiGroups(next.groups);
      setApiSearchTags(next.searchIndex);
      setEmojiApiError(null);
    };

    const loadEmojiApi = async () => {
      setEmojiApiLoading(true);
      let hasFreshCache = false;
      try {
        const rawCache = window.localStorage.getItem(CHAT_EMOJI_API_CACHE_KEY);
        if (rawCache) {
          const parsed = JSON.parse(rawCache) as { savedAt?: number; entries?: EmojiApiEntry[] };
          if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
            hydrateFromEntries(parsed.entries);
            hasFreshCache = !!parsed.savedAt && Date.now() - parsed.savedAt < EMOJI_API_CACHE_TTL_MS;
          }
        }
      } catch {
        // ignore cache errors
      }

      if (hasFreshCache) {
        if (!cancelled) setEmojiApiLoading(false);
        return;
      }

      try {
        if (!EMOJI_API_ACCESS_KEY) {
          if (!cancelled) setEmojiApiError(t("Configura VITE_EMOJI_API_KEY para cargar los emojis."));
          return;
        }
        const url = new URL(EMOJI_API_URL);
        url.searchParams.set("access_key", EMOJI_API_ACCESS_KEY);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(t("emoji-api {status}", { status: res.status }));
        const data = await res.json();
        if (!Array.isArray(data) || cancelled) return;
        try {
          window.localStorage.setItem(
            CHAT_EMOJI_API_CACHE_KEY,
            JSON.stringify({ savedAt: Date.now(), entries: data })
          );
        } catch {
          // ignore cache errors
        }
        hydrateFromEntries(data);
      } catch {
        if (!cancelled) {
          setEmojiApiError(t("No se pudieron cargar los emojis desde la API."));
        }
      } finally {
        if (!cancelled) setEmojiApiLoading(false);
      }
    };

    loadEmojiApi();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const sourceGroups = apiGroups && apiGroups.length ? apiGroups : [];
    const recentGroup = { key: "recent", label: "Recientes", icon: "🕘", emojis: recentEmojis };
    const baseGroups = [recentGroup, ...sourceGroups];
    const allEmojis = [...new Set(baseGroups.filter(group => group.key !== "recent").flatMap(group => group.emojis))];
    return [{ key: "all", label: "Todos", icon: "✨", emojis: allEmojis }, ...baseGroups];
  }, [apiGroups, recentEmojis]);

  const activeGroup = groups[cat] ?? groups[0];
  const visibleEmojis = useMemo(() => {
    const normalizedQuery = normalizeEmojiSearch(emojiQuery);
    const candidates = emojiQuery.trim()
      ? groups.flatMap(group => group.emojis.map(emoji => ({ emoji, label: group.label })))
      : activeGroup.emojis.map(emoji => ({ emoji, label: activeGroup.label }));

    return candidates
      .filter((item, index, arr) => arr.findIndex(other => other.emoji === item.emoji) === index)
      .map(item => {
        const mergedTags = [...new Set(apiSearchTags[item.emoji] || [])];
        const score = !normalizedQuery
          ? 1
          : (() => {
              const haystacks = [normalizeEmojiSearch(item.label), ...mergedTags.map(normalizeEmojiSearch), normalizeEmojiSearch(item.emoji)];
              let computed = 0;
              for (const word of normalizedQuery.split(" ").filter(Boolean)) {
                const exact = haystacks.some((value) => value === word);
                const starts = haystacks.some((value) => value.startsWith(word));
                const includes = haystacks.some((value) => value.includes(word));
                if (!includes) return 0;
                computed += exact ? 5 : starts ? 3 : 1;
              }
              return computed;
            })();
        return { ...item, score };
      })
      .filter(item => !normalizedQuery || item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.emoji);
  }, [activeGroup.emojis, apiSearchTags, groups, emojiQuery]);

  const pickEmoji = (emoji: string) => {
    setRecentEmojis(prev => {
      const next = [emoji, ...prev.filter(item => item !== emoji)].slice(0, MAX_RECENT_EMOJIS);
      try {
        window.localStorage.setItem(CHAT_EMOJI_RECENTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    onPick(emoji);
  };

  const loadGifCategories = useCallback(async () => {
    setGifCategories(["Legal", "Tribunales", "Contrato", "Equipo", "Celebración", "Urgente"]);
  }, []);

  const loadGifSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setGifSuggestions([]);
      return;
    }
    const seed = ["gracias", "perfecto", "celebración", "tribunal", "contrato", "equipo", "aprobado", "urgente", "documentos"];
    const normalized = query.trim().toLowerCase();
    setGifSuggestions(seed.filter((item) => item.includes(normalized)).slice(0, 5));
  }, []);

  const searchGifs = useCallback(async (query: string) => {
    if (!GIPHY_API_KEY) {
      setGifError(t("Configura VITE_GIPHY_API_KEY para activar los GIFs del chat."));
      setGifs([]);
      setGifLoading(false);
      return;
    }
    const cacheKey = normalizeGifCacheKey(query);
    const cached = gifCacheRef.current.get(cacheKey);
    if (cached) {
      setGifError(null);
      setGifs(cached);
      setGifLoading(false);
      return;
    }
    setGifLoading(true);
    setGifError(null);
    const requestSeq = ++gifSearchSeqRef.current;
    try {
      const endpoint = query.trim() ? "search" : "trending";
      const url = query.trim()
        ? buildGiphyUrl(endpoint, { q: query.trim(), limit: 18, lang: "es" })
        : buildGiphyUrl(endpoint, { limit: 18 });
      const res = await fetch(url);
      const data = await res.json();
      if (requestSeq !== gifSearchSeqRef.current) return;
      const nextGifs = Array.isArray(data.data) ? data.data : [];
      gifCacheRef.current.set(cacheKey, nextGifs);
      try {
        window.localStorage.setItem(
          CHAT_GIF_CACHE_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            items: Object.fromEntries(gifCacheRef.current.entries()),
          })
        );
      } catch {
        // ignore cache errors
      }
      setGifs(nextGifs);
    } catch {
      if (requestSeq !== gifSearchSeqRef.current) return;
      setGifs([]);
      setGifError(t("No se pudieron cargar los GIFs de GIPHY."));
    }
    if (requestSeq !== gifSearchSeqRef.current) return;
    setGifLoading(false);
  }, [buildGiphyUrl]);

  useEffect(() => {
    if (!enableGifs) return;
    loadGifCategories();
    searchGifs("");
  }, [enableGifs, loadGifCategories, searchGifs]);

  useEffect(() => {
    if (!enableGifs) return;
    const t = setTimeout(() => {
      loadGifSuggestions(gifQuery);
      searchGifs(gifQuery);
    }, 350);
    return () => clearTimeout(t);
  }, [enableGifs, gifQuery, loadGifSuggestions, searchGifs]);

  return createPortal(
    <div
      ref={ref}
      style={pickerStyle}
      onMouseDown={(event) => event.stopPropagation()}
      className={`z-[80] overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_28px_90px_-35px_rgba(15,23,42,0.5)] transition-[opacity,transform] duration-200 ease-out ${
        isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[0.97] opacity-0"
      }`}
    >
      <div className="border-b border-slate-200 bg-white px-3 pt-3">
        {enableGifs ? (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setMediaTab("emoji")}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${mediaTab === "emoji" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >{t("Emojis")}</button>
            <button
              onClick={() => setMediaTab("gif")}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${mediaTab === "gif" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >{t("GIFs")}</button>
          </div>
        ) : (
          <div className="mb-3 border-b border-slate-200 px-1">
            <div className="inline-flex border-b-2 border-slate-900 px-1 pb-2 text-base font-semibold text-slate-900">{t("Emojis")}</div>
          </div>
        )}
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-blue-200 bg-slate-50 px-3 py-2.5 shadow-sm">
          <Search size={15} className="text-slate-400" />
          <input
            value={mediaTab === "emoji" ? emojiQuery : gifQuery}
            onChange={e=> mediaTab === "emoji" ? setEmojiQuery(e.target.value) : setGifQuery(e.target.value)}
            placeholder={mediaTab === "emoji" ? t("Buscar todos los emojis") : t("Buscar GIFs en GIPHY")}
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400"
          />
        </div>
        {mediaTab === "emoji" ? (
          emojiApiLoading && !apiGroups ? (
            <div className="flex items-center justify-center pb-3 pt-1">
              <Spinner size="sm" muted />
            </div>
          ) : emojiApiError && (!apiGroups || apiGroups.length === 0) ? (
            <div className="pb-3 text-xs text-red-600">
              {emojiApiError}
            </div>
          ) : <div className="flex items-center gap-1.5 overflow-x-auto pb-3">
            {groups.map((c,i)=>(
            <button key={c.key} onClick={()=>setCat(i)} title={c.label}
              className={`flex h-10 min-w-10 items-center justify-center rounded-2xl border transition-all ${
                cat===i
                  ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-transparent bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700"
              }`}>
              <EmojiCategoryIcon categoryKey={c.key} size={18} />
            </button>
          ))}
          </div>
        ) : <div className="flex flex-wrap gap-1.5 pb-3">
          {(gifSuggestions.length > 0 ? gifSuggestions : gifCategories).slice(0, 6).map((item, index) => (
            <button
              key={`${item}-${index}`}
              onClick={() => setGifQuery(item)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              {item}
            </button>
          ))}
        </div>}
      </div>
      <div className="max-h-[26rem] overflow-y-auto px-3 pb-3">
        {mediaTab === "gif" ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="pt-3 text-sm font-semibold text-slate-700">
                {gifQuery.trim() ? t("Resultados GIF") : t("GIFs populares")}
              </p>
              {!gifLoading && !gifError && (
                <span className="pt-3 text-xs text-slate-400">{t("GIPHY")}</span>
              )}
            </div>
            {gifError ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600">
                {gifError}
              </div>
            ) : gifLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="sm" muted />
              </div>
            ) : gifs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">{t("No hay GIFs para mostrar")}</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pb-1">
                {gifs.map((gif) => {
                  const previewUrl = resolveGifPreview(gif);
                  const fullUrl = resolveGifUrl(gif);
                  if (!previewUrl || !fullUrl) return null;
                  return (
                    <button
                      key={gif.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onPickGif?.(fullUrl);
                      }}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left transition-all hover:border-red-200 hover:bg-white hover:shadow-sm"
                    >
                      <img src={previewUrl} alt={gif.title || gif.slug || t("GIF")} className="h-24 w-full object-cover" />
                      <div className="px-2.5 py-2 text-[11px] font-medium text-slate-500 transition-colors group-hover:text-red-700">
                        {gif.title || gif.slug || t("GIF")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
        <>
        <div className="mb-2 flex items-center justify-between">
          <p className="pt-3 text-sm font-semibold text-slate-700">
            {emojiQuery.trim() ? t("Resultados") : activeGroup.label}
          </p>
          {!emojiQuery.trim() && activeGroup.key === "recent" && recentEmojis.length === 0 && (
            <span className="pt-3 text-xs text-slate-400">{t("Se llenará con tu uso")}</span>
          )}
        </div>
        {emojiApiLoading && (!apiGroups || apiGroups.length === 0) ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="sm" muted />
          </div>
        ) : emojiApiError && (!apiGroups || apiGroups.length === 0) ? (
          <div className="rounded-xl border border-dashed border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600">
            {emojiApiError}
          </div>
        ) : visibleEmojis.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">{t("No hay emojis para mostrar")}</div>
        ) : (
          <div className="grid grid-cols-8 gap-1.5 pb-1">
            {visibleEmojis.map(emoji=>(
              <button key={`${activeGroup.key}-${emoji}`} onMouseDown={(event)=>{ event.preventDefault(); pickEmoji(emoji); }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl transition-colors hover:bg-slate-100 focus:bg-blue-50 focus:outline-none">
                <EmojiImg emoji={emoji} size={23} />
              </button>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GIF PICKER
// ══════════════════════════════════════════════════════════════════════════════
function GifPicker({
  onPick,
  onClose,
  anchorRef,
}: {
  onPick:(url:string)=>void;
  onClose:()=>void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const gifCacheRef = useRef<Map<string, GiphyGif[]>>(new Map());
  const gifSearchSeqRef = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({
    position: "fixed",
    left: 12,
    top: 12,
    width: 416,
    maxHeight: 520,
    transformOrigin: "bottom left",
  });
  const buildGiphyUrl = useCallback((endpoint: string, params: Record<string, string | number>) => {
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    url.searchParams.set("api_key", GIPHY_API_KEY);
    url.searchParams.set("rating", GIPHY_RATING);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }, []);

  const resolveGifPreview = useCallback((gif: GiphyGif) => {
    return (
      gif.images.fixed_height_small?.url ||
      gif.images.fixed_height?.url ||
      gif.images.downsized_medium?.url ||
      gif.images.original?.url ||
      ""
    );
  }, []);

  const resolveGifUrl = useCallback((gif: GiphyGif) => {
    return (
      gif.images.fixed_height?.url ||
      gif.images.downsized_medium?.url ||
      gif.images.original?.url ||
      gif.images.fixed_height_small?.url ||
      ""
    );
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsidePicker = !!ref.current && ref.current.contains(target);
      const clickedAnchorButton = !!anchorRef?.current && anchorRef.current.contains(target);
      if (!clickedInsidePicker && !clickedAnchorButton) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorRef, onClose]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 416;
      const estimatedHeight = 470;
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left - 24));

      if (rect.top > window.innerHeight / 2) {
        setPickerStyle({
          position: "fixed",
          left,
          bottom: Math.max(12, window.innerHeight - rect.top + 12),
          width,
          maxHeight: Math.min(520, window.innerHeight - 24),
          transformOrigin: "bottom left",
        });
        return;
      }

      const top = Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 12);
      setPickerStyle({
        position: "fixed",
        left,
        top,
        width,
        maxHeight: Math.min(520, window.innerHeight - 24),
        transformOrigin: "top left",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_GIF_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt?: number; items?: Record<string, GiphyGif[]> };
      if (!parsed?.savedAt || !parsed.items) return;
      if (Date.now() - parsed.savedAt > GIF_CACHE_TTL_MS) return;
      gifCacheRef.current = new Map(
        Object.entries(parsed.items).filter(([, value]) => Array.isArray(value))
      );
    } catch {
      // ignore cache errors
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCategories(["Legal", "Tribunales", "Contrato", "Equipo", "Celebración", "Urgente"]);
  }, []);

  const loadSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const seed = [
      "gracias",
      "perfecto",
      "celebración",
      "tribunal",
      "contrato",
      "equipo",
      "aprobado",
      "urgente",
      "documentos",
    ];
    const normalized = query.trim().toLowerCase();
    setSuggestions(seed.filter((item) => item.includes(normalized)).slice(0, 5));
  }, []);

  const search = useCallback(async (query: string) => {
    if (!GIPHY_API_KEY) {
      setError(t("Configura VITE_GIPHY_API_KEY para activar los GIFs del chat."));
      setGifs([]);
      setLoading(false);
      return;
    }
    const cacheKey = normalizeGifCacheKey(query);
    const cached = gifCacheRef.current.get(cacheKey);
    if (cached) {
      setError(null);
      setGifs(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const requestSeq = ++gifSearchSeqRef.current;
    try {
      const endpoint = query.trim() ? "search" : "trending";
      const url = query.trim()
        ? buildGiphyUrl(endpoint, { q: query.trim(), limit: 18, lang: "es" })
        : buildGiphyUrl(endpoint, { limit: 18 });
      const res = await fetch(url);
      const data = await res.json();
      if (requestSeq !== gifSearchSeqRef.current) return;
      const nextGifs = Array.isArray(data.data) ? data.data : [];
      gifCacheRef.current.set(cacheKey, nextGifs);
      try {
        window.localStorage.setItem(
          CHAT_GIF_CACHE_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            items: Object.fromEntries(gifCacheRef.current.entries()),
          })
        );
      } catch {
        // ignore cache errors
      }
      setGifs(nextGifs);
    } catch {
      if (requestSeq !== gifSearchSeqRef.current) return;
      setGifs([]);
      setError(t("No se pudieron cargar los GIFs de GIPHY."));
    }
    if (requestSeq !== gifSearchSeqRef.current) return;
    setLoading(false);
  }, [buildGiphyUrl]);

  useEffect(() => {
    search("");
    loadCategories();
  }, [loadCategories, search]);

  useEffect(() => {
    const t = setTimeout(() => {
      search(q);
      loadSuggestions(q);
    }, 350);
    return () => clearTimeout(t);
  }, [q, search, loadSuggestions]);

  return createPortal(
    <div
      ref={ref}
      style={pickerStyle}
      onMouseDown={(event) => event.stopPropagation()}
      className={`z-[80] overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_28px_90px_-35px_rgba(15,23,42,0.45)] transition-[opacity,transform] duration-200 ease-out ${
        isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0"
      }`}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-white to-red-50/40 p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Search size={15} className="text-slate-400" />
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder={t("Buscar GIFs en GIPHY")}
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((item) => (
              <button
                key={item}
                onClick={() => setQ(item)}
                className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {!q.trim() && categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.slice(0, 6).map((category, index) => {
              return (
                <button
                  key={`${category}-${index}`}
                  onClick={() => setQ(category)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  {category}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="max-h-[23rem] overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" muted />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 px-4 py-5 text-center">
            <p className="text-sm font-medium text-rose-700">{error}</p>
            <p className="peligro mt-1 text-xs text-red-500">{t("Añade la clave en `frontend/.env` y reinicia Vite.")}</p>
          </div>
        ) : gifs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">{t("No he encontrado GIFs para esa búsqueda")}</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gifs.map((gif) => {
              const previewUrl = resolveGifPreview(gif);
              const fullUrl = resolveGifUrl(gif);
              if (!previewUrl || !fullUrl) return null;
              return (
                <button
                  key={gif.id}
                  onClick={() => onPick(fullUrl)}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition-all hover:-translate-y-0.5 hover:border-red-200 hover:ring-2 hover:ring-red-100"
                >
                  <img src={previewUrl} alt={gif.title || gif.slug || t("GIF")} className="h-24 w-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
        <span>{t("GIFs con GIPHY")}</span>
        <span className="font-medium text-slate-500">{q.trim() ? t("Resultados de búsqueda") : t("Tendencias")}</span>
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MENTION DROPDOWN
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// STATUS SELECTOR
// ══════════════════════════════════════════════════════════════════════════════
function StatusSelector({
  anchorRef,
  current,
  hasta,
  currentLabel,
  currentColorClass,
  customStatusText,
  customStatusEmoji,
  customStatusColor,
  userName,
  userAvatar,
  notificationsPaused,
  onSelect,
  onSaveCustomStatus,
  onClearCustomStatus,
  onToggleNotifications,
  onProfile,
  onPreferences,
  onDownloads,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  current: string | null;
  hasta: string | null;
  currentLabel: string;
  currentColorClass: string;
  customStatusText: string;
  customStatusEmoji: string;
  customStatusColor: (typeof CUSTOM_STATUS_COLORS)[number]["key"];
  userName: string;
  userAvatar?: string | null;
  notificationsPaused: boolean;
  onSelect:(s:string|null, hasta?:string|null)=>void;
  onSaveCustomStatus:(value:string, emoji:string, colorKey:string, hasta?:string|null)=>void;
  onClearCustomStatus:()=>void;
  onToggleNotifications:()=>void;
  onProfile:()=>void;
  onPreferences:()=>void;
  onDownloads:()=>void;
  onClose:()=>void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draftStatus, setDraftStatus] = useState(customStatusText || "");
  const [draftEmoji, setDraftEmoji] = useState(customStatusEmoji || CUSTOM_STATUS_EMOJIS[0]);
  const [draftColor, setDraftColor] = useState<(typeof CUSTOM_STATUS_COLORS)[number]["key"]>(customStatusColor || "emerald");
  const [duracion, setDuracion] = useState<string>("");
  const [isVisible, setIsVisible] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({
    position: "fixed",
    left: 24,
    top: 24,
    width: 340,
    maxHeight: Math.min(760, typeof window !== "undefined" ? window.innerHeight - 32 : 760),
  });
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsidePicker = !!ref.current && ref.current.contains(target);
      const clickedAnchorButton = !!anchorRef?.current && anchorRef.current.contains(target);
      if (!clickedInsidePicker && !clickedAnchorButton) onClose();
    };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", h);
    };
  }, [anchorRef, onClose]);

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 340;
      const margin = 12;
      const gap = 12;
      let left = rect.right + gap;
      if (left + width > window.innerWidth - margin) {
        left = rect.left - width - gap;
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      const maxHeight = Math.min(760, window.innerHeight - 32);
      let top = rect.bottom - maxHeight;
      top = Math.max(16, Math.min(top, window.innerHeight - maxHeight - 16));
      setPickerStyle({
        position: "fixed",
        left,
        top,
        width,
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    setDraftStatus(customStatusText || "");
    setDraftEmoji(customStatusEmoji || CUSTOM_STATUS_EMOJIS[0]);
    setDraftColor(customStatusColor || "emerald");
  }, [customStatusColor, customStatusEmoji, customStatusText]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return createPortal(
    <div
      ref={ref}
      style={pickerStyle}
      className={`z-[120] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-180 ${
        isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-4">
        <Av url={userAvatar || null} name={userName} size={10}/>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">{userName}</p>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
            <span className={`h-2.5 w-2.5 rounded-full ${currentColorClass}`}/>
            <span className="truncate">{currentLabel}</span>
            {hasta && (current || customStatusText) && <span className="shrink-0 text-xs text-slate-400">{t("· hasta")}{" "}{horaCorta(hasta)}</span>}
            {notificationsPaused ? (
              <BellOff size={13} className="shrink-0 text-slate-400" />
            ) : (
              <Bell size={13} className="shrink-0 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t("Estado")}</p>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 size={12} className="text-slate-400"/>
              <span className="hidden min-[360px]:inline">{t("Quitar")}</span>
              <select value={duracion} onChange={(e) => setDuracion(e.target.value)} title={t("Cuándo se quita solo el estado que elijas")}
                className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-[#ab0433]/35">
                {DURACIONES_ESTADO.map((d) => <option key={d.k} value={d.k}>{d.k ? t("en {toLowerCase}", { toLowerCase: d.label.toLowerCase() }) : d.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>onSelect(null)}
              className={`col-span-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150 active:scale-[0.985] ${
                !current
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-green-500"/>
              <span className="truncate">{t("Automático (según uso real)")}</span>
              {!current&&<Check size={12} className="ml-auto shrink-0 text-emerald-500"/>}
            </button>
            {STATUS_OVERRIDE_LIST.map(k=>{
              const v = STATUS_CFG[k];
              return (
                <button type="button" key={k} onClick={()=>onSelect(k, hastaDeDuracion(duracion))}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150 active:scale-[0.985] ${
                    current===k
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${v.color}`}/>
                  <span className="truncate">{v.label}</span>
                  {current===k&&<Check size={12} className="ml-auto shrink-0 text-emerald-500"/>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">{t("Crear estado personalizado")}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {CUSTOM_STATUS_EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setDraftEmoji(emoji)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition-all duration-150 active:scale-95 ${
                    draftEmoji === emoji
                      ? "border-[#ab0433]/25 bg-red-50 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {CUSTOM_STATUS_COLORS.map((color) => (
                <button
                  type="button"
                  key={color.key}
                  onClick={() => setDraftColor(color.key)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-150 active:scale-95 ${
                    draftColor === color.key ? "border-slate-900 scale-105" : "border-transparent"
                  }`}
                >
                  <span className={`h-5 w-5 rounded-full ${color.className}`} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={draftStatus}
                onChange={(e)=>setDraftStatus(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && draftStatus.trim()) { onSaveCustomStatus(draftStatus.trim(), draftEmoji, draftColor, hastaDeDuracion(duracion)); setDraftStatus(""); } }}
                maxLength={100}
                placeholder={t("Ej. En audiencia, revisando demanda...")}
                className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-[#ab0433]/35 focus:ring-2 focus:ring-[#ab0433]/10"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!draftStatus.trim()) return;
                onSaveCustomStatus(draftStatus.trim(), draftEmoji, draftColor, hastaDeDuracion(duracion));
                setDraftStatus("");
              }}
              className="mt-3 w-full rounded-xl bg-[#ab0433] px-3 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#92042c] active:scale-[0.985]"
            >{t("Guardar estado personalizado")}</button>
            <button
              type="button"
              onClick={onClearCustomStatus}
              className="mt-2 text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >{t("Quitar estado personalizado")}</button>
          </div>
          <button
            type="button"
            onClick={() => (current === "ausente" ? onSelect(null) : onSelect("ausente", hastaDeDuracion(duracion)))}
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition-all duration-150 hover:bg-slate-100 active:scale-[0.985]"
          >
            {current === "ausente"
              ? <span>{t("Volver a estar")}{" "}<span className="font-semibold">{t("disponible")}</span></span>
              : <span>{t("Cambiar tu estado a")}{" "}<span className="font-semibold">{t("ausente")}</span></span>}
            <ChevronRight size={14} className="text-slate-400"/>
          </button>
          <button
            type="button"
            onClick={onToggleNotifications}
            className="mt-2 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition-all duration-150 hover:bg-slate-100 active:scale-[0.985]"
          >
            <span>{notificationsPaused ? t("Reanudar notificaciones") : t("Pausar las notificaciones")}</span>
            <ChevronRight size={14} className="text-slate-400"/>
          </button>
        </div>
      </div>

      <div className="border-t border-slate-200 py-1">
        <button type="button" onClick={onProfile} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">
          <User size={15} className="text-slate-400"/>{t("Perfil")}</button>
        <button type="button" onClick={onPreferences} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">
          <Settings size={15} className="text-slate-400"/>{t("Preferencias")}</button>
      </div>

      <div className="border-t border-slate-200 py-1">
        <button type="button" onClick={onDownloads} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">
          <Download size={15} className="text-slate-400"/>{t("Descargas")}</button>
      </div>
    </div>,
    document.body
  );
}

function ChannelMenu({
  canal,
  onMembers,
  onPinned,
  onFavorites,
  onRefresh,
  onLeave,
  onClose,
  onToggleSilencio,
  onAtajos,
}: {
  canal: Canal;
  onMembers: ()=>void;
  onPinned: ()=>void;
  onFavorites: ()=>void;
  onRefresh: ()=>void;
  onLeave: ()=>void;
  onClose: ()=>void;
  onToggleSilencio: ()=>void;
  onAtajos: ()=>void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <button onClick={() => { onMembers(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Users size={14} className="text-slate-400" />{t("Ver miembros")}</button>
      <button onClick={() => { onPinned(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Pin size={14} className="text-slate-400" />{t("Ver fijados")}</button>
      <button onClick={() => { onFavorites(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Star size={14} className="text-amber-400" />{t("Ver favoritos")}</button>
      <button onClick={() => { onToggleSilencio(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        {canal.silenciado ? <Bell size={14} className="text-slate-400" /> : <BellOff size={14} className="text-slate-400" />}
        {canal.silenciado
          ? (canal.tipo === "directo" ? t("Volver a avisarme") : t("Quitar silencio"))
          : (canal.tipo === "directo" ? t("Silenciar conversación") : t("Silenciar canal"))}
      </button>
      <button onClick={() => { onAtajos(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Keyboard size={14} className="text-slate-400" />{t("Atajos de teclado")}</button>
      <button onClick={() => { onRefresh(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <RotateCcw size={14} className="text-slate-400" />{t("Actualizar")}</button>
      {canal.tipo !== "directo" && (
        <button onClick={() => { onLeave(); onClose(); }}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50">
          <LogOut size={14} />{t("Salir del canal")}</button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL CREAR CANAL — wizard 2 pasos (estilo Slack)
// ══════════════════════════════════════════════════════════════════════════════
const MAX_NOMBRE = 80;

function ModalCrearCanal({ sysUsers, getToken, onClose, onCreate }: {
  sysUsers: SysUser[];
  getToken: (opts?: { skipCache?: boolean })=>Promise<string|null>;
  onClose: ()=>void;
  onCreate: (c: Canal)=>void;
}) {
  const [step, setStep]         = useState<1|2>(1);
  const [nombre, setNombre]     = useState("");
  const [desc, setDesc]         = useState("");
  const [tipo, setTipo]         = useState<"publico"|"privado">("publico");
  const [invitados, setInvitados] = useState<SysUser[]>([]);
  const [buscarUser, setBuscarUser] = useState("");
  const [saving, setSaving]     = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const nombreClean = nombre.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");

  const opciones = sysUsers.filter(u =>
    !invitados.find(i=>i.user_id===u.user_id) &&
    (u.user_name.toLowerCase().includes(buscarUser.toLowerCase()) ||
     u.email?.toLowerCase().includes(buscarUser.toLowerCase()))
  ).slice(0, 8);

  const toggle = (u: SysUser) =>
    setInvitados(prev => prev.find(i=>i.user_id===u.user_id)
      ? prev.filter(i=>i.user_id!==u.user_id) : [...prev, u]);

  const handleCreate = async () => {
    if (!nombreClean) { setErrorMsg(t("El nombre es obligatorio")); return; }
    setSaving(true); setErrorMsg("");
    try {
      const token = await getToken({ skipCache: true });
      const h = { "Content-Type":"application/json", Authorization:`Bearer ${token}` };
      const res = await fetch("/api/chat/canales", {
        method:"POST", headers: h,
        body: JSON.stringify({ nombre: nombreClean, descripcion: desc.trim()||null, tipo }),
      });
      const d = await safeJson(res);
      if (!res.ok) { setErrorMsg(d.error||t("Error al crear")); setSaving(false); return; }
      const canal: Canal = d.data;
      await Promise.all(invitados.map(u =>
        fetch(`/api/chat/canales/${canal.id}/miembros`, {
          method:"POST", headers: h,
          body: JSON.stringify({ target_user_id:u.user_id, target_user_name:u.user_name, target_avatar_url:u.avatar_url }),
        })
      ));
      onCreate({ ...canal, no_leidos:0, total_miembros: 1+invitados.length, archivado:false,
        ultimo_mensaje:null, ultimo_mensaje_autor:null, ultimo_mensaje_at:null });
    } catch { setErrorMsg(t("Error de red")); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] border border-slate-200 overflow-hidden">

        {/* ── PASO 1: Nombre ── */}
        {step === 1 && (
          <>
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-slate-900 font-bold text-xl">{t("Crear un canal")}</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18}/>
              </button>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">{t("Nombre")}</label>
                <div className={`flex items-center border-2 rounded-lg px-3 gap-2 transition-all ${
                  nombre.length > 0 ? "border-blue-500" : "border-slate-300"
                } focus-within:border-blue-500`}>
                  <Hash size={15} className="text-slate-500 shrink-0"/>
                  <input
                    autoFocus
                    value={nombre}
                    maxLength={MAX_NOMBRE}
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && nombreClean && setStep(2)}
                    placeholder={t("ej. expedientes-urgentes")}
                    className="flex-1 bg-transparent text-slate-800 text-sm py-2.5 outline-none placeholder-slate-400"
                  />
                  <span className="text-slate-400 text-xs shrink-0">{MAX_NOMBRE - nombre.length}</span>
                </div>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">{t("Los canales son el lugar donde se producen las conversaciones sobre un tema.")}<br/>{t("Usa un nombre que sea fácil de encontrar y comprender.")}</p>
              </div>

              {/* Visibilidad */}
              <div className="flex items-start gap-3 py-1">
                <input type="checkbox" id="privado" checked={tipo==="privado"}
                  onChange={e=>setTipo(e.target.checked?"privado":"publico")}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-slate-700 cursor-pointer shrink-0"/>
                <label htmlFor="privado" className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-slate-700 font-medium">{t("Canal privado")}</span>
                  <span className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 cursor-help" title={t("Los canales privados solo son visibles para sus miembros")}>
                    <Lock size={12}/>
                  </span>
                </label>
              </div>

              {errorMsg && <p className="text-rose-500 text-sm">{errorMsg}</p>}

              {/* Footer paso 1 */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => { if (!nombreClean) { setErrorMsg(t("Escribe un nombre para el canal")); return; } setErrorMsg(""); setStep(2); }}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                  disabled={!nombre.trim()}
                >{t("Siguiente")}</button>
              </div>
            </div>
          </>
        )}

        {/* ── PASO 2: Miembros + descripción ── */}
        {step === 2 && (
          <>
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <h2 className="text-slate-900 font-bold text-xl">{t("Añadir miembros")}</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  <span className={tipo==="privado"?"text-slate-400":"text-slate-400"}>
                    {tipo==="privado"?<Lock size={11} className="inline mr-1"/>:<Hash size={11} className="inline mr-1"/>}
                  </span>
                  <span className="font-semibold text-slate-700">{nombreClean}</span>
                  <span className="text-slate-400 ml-2 text-xs">({tipo==="privado"?t("privado"):t("público")})</span>
                </p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18}/>
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Descripción opcional */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t("Descripción")}{" "}<span className="font-normal normal-case">{t("(opcional)")}</span>
                </label>
                <input value={desc} onChange={e=>setDesc(e.target.value)}
                  placeholder={t("¿De qué trata este canal?")}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 text-sm outline-none placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"/>
              </div>

              {/* Buscar miembros */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{t("Añadir personas")}{invitados.length>0 && (
                    <span className="ml-2 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs font-bold normal-case">{invitados.length}</span>
                  )}
                </label>

                {/* Chips de invitados */}
                {invitados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {invitados.map(u=>(
                      <span key={u.user_id} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs px-2.5 py-1.5 rounded-full">
                        <Av url={u.avatar_url} name={u.user_name} size={4}/>
                        {u.user_name}
                        <button onClick={()=>toggle(u)} className="hover:text-red-600 ml-0.5"><X size={10}/></button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input value={buscarUser} onChange={e=>setBuscarUser(e.target.value)}
                    placeholder={t("Buscar por nombre o email…")}
                    className="w-full border border-slate-200 rounded-lg bg-slate-50 pl-8 pr-3 py-2.5 text-slate-800 text-sm outline-none placeholder-slate-400 focus:border-blue-400 transition-all"/>
                </div>
                {buscarUser.trim() && (
                  <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm max-h-44 overflow-y-auto">
                    {opciones.length === 0
                      ? <p className="text-slate-400 text-sm px-3 py-2.5">{t("Sin resultados")}</p>
                      : opciones.map(u=>(
                        <button key={u.user_id} onClick={()=>{ toggle(u); setBuscarUser(""); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0 transition-colors">
                          <Av url={u.avatar_url} name={u.user_name} size={7}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-800 text-sm font-medium truncate">{u.user_name}</p>
                            <p className="text-slate-400 text-xs truncate">{u.email||u.role_label}</p>
                          </div>
                          <Plus size={13} className="text-slate-400 shrink-0"/>
                        </button>
                    ))}
                  </div>
                )}
              </div>

              {errorMsg && <p className="text-rose-500 text-sm">{errorMsg}</p>}
            </div>

            {/* Footer paso 2 */}
            <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <BackButton onClick={()=>setStep(1)} />
              <div className="flex gap-2.5">
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors">{t("Cancelar")}</button>
                <button onClick={handleCreate} disabled={saving}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : null}
                  {saving ? t("Creando…") : t("Crear canal")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PANEL MIEMBROS (derecha)
// ══════════════════════════════════════════════════════════════════════════════
function PanelMiembros({ canal, sysUsers, getToken, currentUserId, onClose, onDM, onRefresh, presenceByUserId }: {
  canal: Canal; sysUsers: SysUser[]; getToken: ()=>Promise<string|null>;
  currentUserId: string; onClose:()=>void; onDM:(m:Miembro)=>void; onRefresh:()=>void;
  presenceByUserId: MapaPresencia;
}) {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [tab, setTab] = useState<"ver"|"añadir">("ver");
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string|null>(null);

  const fetch_ = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`/api/chat/canales/${canal.id}/miembros`, { headers:{Authorization:`Bearer ${token}`} });
    const d = await safeJson(res);
    if (res.ok) setMiembros(d.data||[]);
    setLoading(false);
  }, [canal.id, getToken]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const addM = async (u: SysUser) => {
    setActing(u.user_id);
    const token = await getToken();
    await fetch(`/api/chat/canales/${canal.id}/miembros`, {
      method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
      body: JSON.stringify({ target_user_id:u.user_id, target_user_name:u.user_name, target_avatar_url:u.avatar_url }),
    });
    await fetch_(); onRefresh(); setActing(null);
  };
  const removeM = async (uid: string) => {
    setActing(uid);
    const token = await getToken();
    await fetch(`/api/chat/canales/${canal.id}/miembros/${uid}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} });
    await fetch_(); onRefresh(); setActing(null);
  };

  const sysUsersById = useMemo(
    () => new Map(sysUsers.map(u => [u.user_id, u])),
    [sysUsers]
  );
  const miembrosNormalizados = useMemo(() => miembros.map((m) => {
    const knownUser = sysUsersById.get(m.user_id);
    const isMe = m.user_id === currentUserId;
    return {
      ...m,
      user_name: isMe ? "Tú" : (knownUser?.user_name?.trim() || m.user_name?.trim() || "Sin nombre"),
      avatar_url: knownUser?.avatar_url || m.avatar_url,
    };
  }), [currentUserId, miembros, sysUsersById]);

  const ids = new Set(miembros.map(m=>m.user_id));
  const noMiembros = sysUsers.filter(u =>
    !ids.has(u.user_id) && u.user_id!==currentUserId &&
    (u.user_name.toLowerCase().includes(buscar.toLowerCase()) || u.email?.toLowerCase().includes(buscar.toLowerCase()))
  );
  const miembrosFilt = miembrosNormalizados.filter(m => m.user_name.toLowerCase().includes(buscar.toLowerCase()));
  const admins = miembrosFilt.filter(m=>m.role==="admin");
  const members = miembrosFilt.filter(m=>m.role!=="admin");
  const myRole = miembrosNormalizados.find(m=>m.user_id===currentUserId)?.role;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm shadow-2xl lg:static lg:z-auto lg:shadow-none lg:max-w-none lg:w-72 shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2">
          <Users size={15} className="text-red-500"/>{t("Miembros")}<span className="bg-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded-full font-semibold">{miembros.length}</span>
        </h3>
        <BackButton onClick={onClose} />
      </div>
      {/* Tabs */}
      <div className="flex border-b border-slate-100 shrink-0">
        {(["ver","añadir"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${t===tab?"text-red-600 border-b-2 border-red-500":"text-slate-500 hover:text-slate-700"}`}>
            {t==="ver"?tr("Lista"):tr("+ Añadir")}
          </button>
        ))}
      </div>
      {/* Buscador */}
      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={buscar} onChange={e=>setBuscar(e.target.value)} placeholder={t("Buscar…")}
            className="w-full bg-slate-100 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-700 outline-none placeholder-slate-400"/>
        </div>
      </div>
      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {loading&&<div className="flex justify-center py-6"><Spinner size="sm" muted /></div>}
        {!loading&&tab==="ver"&&(
          <>
            {admins.length>0&&(
              <>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-4 pt-3 pb-1.5">{t("Administradores")}</p>
                {admins.map(m=><MiembroRow key={m.user_id} m={m} isMe={m.user_id===currentUserId} canAdmin={myRole==="admin"&&m.user_id!==currentUserId} acting={acting} onDM={()=>onDM(m)} onRemove={()=>removeM(m.user_id)} presenceByUserId={presenceByUserId}/>)}
              </>
            )}
            {members.length>0&&(
              <>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-4 pt-3 pb-1.5">{t("Miembros —")}{" "}{members.length}</p>
                {members.map(m=><MiembroRow key={m.user_id} m={m} isMe={m.user_id===currentUserId} canAdmin={myRole==="admin"&&m.user_id!==currentUserId} acting={acting} onDM={()=>onDM(m)} onRemove={()=>removeM(m.user_id)} presenceByUserId={presenceByUserId}/>)}
              </>
            )}
            {miembrosFilt.length===0&&<p className="text-slate-400 text-sm text-center py-6">{t("Sin resultados")}</p>}
          </>
        )}
        {!loading&&tab==="añadir"&&(
          <>
            <p className="text-xs text-slate-400 px-4 pt-3 pb-1.5">{t("Usuarios del sistema (")}{noMiembros.length}{" "}{t("disponibles)")}</p>
            {noMiembros.length===0
              ?<p className="text-slate-400 text-sm text-center py-6">{t("Todos son miembros")}</p>
              :noMiembros.map(u=>(
              <div key={u.user_id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors">
                <Av url={u.avatar_url} name={u.user_name} size={8}/>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 text-sm font-semibold truncate">{u.user_name}</p>
                  <p className="text-slate-400 text-xs truncate">{u.email||u.role_label}</p>
                </div>
                <button onClick={()=>addM(u)} disabled={acting===u.user_id}
                  className="shrink-0 w-7 h-7 flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50">
                  {acting===u.user_id?<Loader2 size={12} className="animate-spin"/>:<Plus size={13}/>}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

function MiembroRow({ m, isMe, canAdmin, acting, onDM, onRemove, presenceByUserId }: {
  m: Miembro; isMe: boolean; canAdmin: boolean; acting: string|null;
  onDM:()=>void; onRemove:()=>void; presenceByUserId: MapaPresencia;
}) {
  const st = estadoVisible(m.user_id, presenceByUserId);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 group transition-colors border-b border-slate-50 last:border-0">
      <div className="relative shrink-0">
        <Av url={m.avatar_url} name={m.user_name} size={8}/>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${st.color}`}/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-slate-800 text-sm font-semibold truncate">{m.user_name}</p>
          {m.role==="admin"&&<Crown size={11} className="text-yellow-500 shrink-0"/>}
        </div>
        <p className="text-slate-400 text-xs truncate">{m.role_label} · {st.label}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!isMe&&<button onClick={onDM} title={t("Mensaje directo")} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"><MessageSquare size={12}/></button>}
        {canAdmin&&(
          <button onClick={onRemove} disabled={acting===m.user_id} title={t("Eliminar del canal")}
            className="peligro w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50">
            {acting===m.user_id?<Loader2 size={11} className="animate-spin"/>:<X size={12}/>}
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PANEL FIJADOS
// ══════════════════════════════════════════════════════════════════════════════
function PanelFijados({ canalId, getToken, onClose, onGoTo, onTogglePinned, resolveDisplayName }: {
  canalId: string; getToken:()=>Promise<string|null>;
  onClose:()=>void; onGoTo:(id:string)=>void;
  onTogglePinned:(id:string)=>Promise<void>;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
}) {
  const [fijados, setFijados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async()=>{
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/chat/canales/${canalId}/fijados`, { headers:{Authorization:`Bearer ${token}`} });
      const d = await safeJson(res);
      if (!cancelled && res.ok) setFijados(d.data||[]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canalId, getToken]);
  const unpin = async (msgId: string) => {
    await onTogglePinned(msgId);
    setFijados(p=>p.filter(f=>f.mensaje_id!==msgId));
  };
  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm shadow-2xl lg:static lg:z-auto lg:shadow-none lg:max-w-none lg:w-64 shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2"><Pin size={14} className="text-red-500"/>{t("Mensajes fijados")}</h3>
        <BackButton onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading&&<div className="flex justify-center py-6"><Spinner size="sm" muted /></div>}
        {!loading&&fijados.length===0&&(
          <div className="flex flex-col items-center justify-center h-full py-12 text-slate-300">
            <Pin size={32} className="mb-2 opacity-40"/>
            <p className="text-sm text-slate-400">{t("Sin mensajes fijados")}</p>
          </div>
        )}
        {fijados.map(f=>(
          <div key={f.mensaje_id} className="group px-3 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5"><Av url={f.avatar_url} name={resolveDisplayName(f.user_id, f.user_name)} size={6}/></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{resolveDisplayName(f.user_id, f.user_name)}</p>
                {f.image_url ? <img src={mediaUrl(f.image_url) || undefined} alt={t("Imagen")} className="w-28 rounded mt-1 border border-slate-200 object-cover"/>
                  : f.gif_url ? <img src={f.gif_url} alt={t("GIF")} className="w-28 rounded mt-1"/>
                  :<p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{f.contenido}</p>}
                <p className="text-slate-300 text-xs mt-1">{fmtTime(f.msg_created_at)}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={()=>onGoTo(f.mensaje_id)} className="text-xs text-blue-500 hover:underline font-medium">{t("Ver")}</button>
              <button onClick={()=>unpin(f.mensaje_id)} className="text-xs text-red-400 hover:underline flex items-center gap-0.5 font-medium"><PinOff size={10}/>{t("Desfijar")}</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MENSAJE ITEM
// ══════════════════════════════════════════════════════════════════════════════
function PanelFavoritos({ canalId, getToken, onClose, onGoTo, onToggleFavorite, resolveDisplayName }: {
  canalId: string; getToken:()=>Promise<string|null>;
  onClose:()=>void; onGoTo:(id:string)=>void;
  onToggleFavorite:(id:string)=>Promise<void>;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
}) {
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async()=>{
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/chat/favoritos?canal_id=${canalId}`, { headers:{Authorization:`Bearer ${token}`} });
      const d = await safeJson(res);
      if (!cancelled && res.ok) setFavoritos(d.data||[]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canalId, getToken]);
  const removeFavorite = async (msgId: string) => {
    await onToggleFavorite(msgId);
    setFavoritos(p=>p.filter(f=>f.mensaje_id!==msgId));
  };
  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm shadow-2xl lg:static lg:z-auto lg:shadow-none lg:max-w-none lg:w-64 shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-amber-50/70">
        <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2"><Star size={14} className="text-amber-500 fill-amber-300"/>{t("Favoritos")}</h3>
        <BackButton onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading&&<div className="flex justify-center py-6"><Spinner size="sm" muted /></div>}
        {!loading&&favoritos.length===0&&(
          <div className="flex flex-col items-center justify-center h-full py-12 text-slate-300">
            <Star size={32} className="mb-2 opacity-40"/>
            <p className="text-sm text-slate-400">{t("Sin favoritos en este chat")}</p>
          </div>
        )}
        {favoritos.map(f=>(
          <div key={f.mensaje_id} className="group px-3 py-3 border-b border-slate-100 hover:bg-amber-50/40 transition-colors">
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5"><Av url={f.avatar_url} name={resolveDisplayName(f.user_id, f.user_name)} size={6}/></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{resolveDisplayName(f.user_id, f.user_name)}</p>
                {f.image_url ? <img src={mediaUrl(f.image_url) || undefined} alt={t("Imagen")} className="w-28 rounded mt-1 border border-slate-200 object-cover"/>
                  : f.gif_url ? <img src={f.gif_url} alt={t("GIF")} className="w-28 rounded mt-1"/>
                  :<p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{f.contenido}</p>}
                <p className="text-slate-300 text-xs mt-1">{fmtTime(f.msg_created_at)}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={()=>onGoTo(f.mensaje_id)} className="text-xs text-blue-500 hover:underline font-medium">{t("Ver")}</button>
              <button onClick={()=>removeFavorite(f.mensaje_id)} className="text-xs text-amber-500 hover:underline flex items-center gap-0.5 font-medium"><Star size={10} className="fill-amber-300"/>{t("Quitar")}</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// Envuelto en React.memo: la lista de mensajes puede tener cientos de
// elementos y el componente padre repinta con cada poll (cada ~700ms
// mientras la pestaña está visible) -- sin memo, cada mensaje se volvía a
// renderizar entero en cada ciclo aunque su contenido no hubiera cambiado.
const MensajeItem = React.memo(function MensajeItem({ msg, prevMsg, currentUserId, isHighlighted, isFreshIncoming = false, showReadReceipt = false, isReadByRecipient = false, onReintentar, onDescartar, onReply, onThread, enHilo = false, onReact, onEdit, onDelete, onPin, onFavorite, isFavorite, isPinned, resolveDisplayName, resolveAvatarUrl, getToken }: {
  msg: Mensaje; prevMsg: Mensaje|null; currentUserId: string; isHighlighted: boolean; isFreshIncoming?: boolean;
  showReadReceipt?: boolean; isReadByRecipient?: boolean;
  onReintentar?:(id:string)=>void; onDescartar?:(id:string)=>void;
  onReply:(m:Mensaje)=>void; onReact:(id:string,e:string)=>void;
  /** Abrir el hilo de este mensaje (no se pasa dentro del propio hilo). */
  onThread?:(m:Mensaje)=>void;
  /** Se pinta dentro del panel del hilo: sin resumen de respuestas. */
  enHilo?: boolean;
  onEdit:(m:Mensaje)=>void; onDelete:(id:string)=>void; onPin:(id:string)=>void; onFavorite:(id:string)=>void;
  isFavorite?: boolean; isPinned?: boolean;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
  resolveAvatarUrl?:(userId?: string | null, avatarUrl?: string | null, isSelf?: boolean)=>string|null;
  getToken:()=>Promise<string|null>;
}) {
  const [hover, setHover] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(false);
  const [showGifLightbox, setShowGifLightbox] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragReplyReady, setDragReplyReady] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const didTriggerReplyRef = useRef(false);
  const isMe = msg.user_id === currentUserId;
  const { miNombre } = React.useContext(ContextoTextoChat);
  const meMenciona = !isMe && !msg.deleted_at && mencionaA(msg.contenido, miNombre);
  const sameAuthor = !!(prevMsg &&
    prevMsg.user_id === msg.user_id &&
    (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 5*60*1000);

  const reactions = useMemo(() => {
    if (!msg.reacciones?.length) return [];
    const map = new Map<string, {count:number;names:string[];mine:boolean}>();
    for (const r of msg.reacciones) {
      const ex = map.get(r.emoji)||{count:0,names:[],mine:false};
      map.set(r.emoji, {count:ex.count+1,names:[...ex.names,r.user_name],mine:ex.mine||(r.user_id===currentUserId)});
    }
    return [...map.entries()].map(([e,v])=>({emoji:e,...v}));
  }, [msg.reacciones, currentUserId]);
  const imageSrc = msg.tipo !== 'archivo' ? mediaUrl(msg.image_url) : null;
  const fileSrc  = msg.tipo === 'archivo' ? mediaUrl(msg.file_url ?? msg.image_url) : null;
  // Enviando: no se muestra nada (el mensaje ya está en pantalla); solo si
  // tarda de verdad (>1,5 s, p.ej. una imagen grande) aparece un relojito.
  const [envioLento, setEnvioLento] = useState(false);
  useEffect(() => {
    if (msg._envio !== "enviando") { setEnvioLento(false); return; }
    const t = window.setTimeout(() => setEnvioLento(true), 1500);
    return () => clearTimeout(t);
  }, [msg._envio]);
  const previewUrl = !msg.gif_url && !fileSrc && msg.contenido !== IMAGE_PLACEHOLDER_TEXT
    ? firstUrlIn(msg.contenido || '')
    : null;
  // ?download=1 hace que el backend anada Content-Disposition: attachment
  // (server.ts) — se usa como fallback si el fetch de abajo falla.
  const fileDownloadHref = fileSrc
    ? `${fileSrc}${fileSrc.includes("?") ? "&" : "?"}download=1${msg.file_name ? `&name=${encodeURIComponent(msg.file_name)}` : ""}`
    : null;
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const handleFileDownload = useCallback(async () => {
    if (!fileSrc || downloadingFile) return;
    setDownloadingFile(true);
    try {
      // El enlace <a download> no funciona cross-origin (frontend y backend
      // viven en dominios distintos: el navegador lo ignora y solo abre el
      // archivo). Descargamos el contenido via fetch y forzamos la descarga
      // con un blob: URL, que si respeta el atributo download.
      const response = await fetch(fileSrc);
      if (!response.ok) throw new Error(t("download failed"));
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = msg.file_name || "archivo";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1200);
    } catch {
      window.open(fileDownloadHref ?? fileSrc, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingFile(false);
    }
  }, [fileSrc, fileDownloadHref, downloadingFile, msg.file_name]);
  const fileTypeIcon = msg.tipo === 'archivo' ? getFileTypeIcon(msg.file_name, msg.file_mime) : null;
  const dragDirection = isMe ? -1 : 1;
  const dragMagnitude = Math.abs(dragOffset);

  const resetDrag = useCallback(() => {
    dragStartRef.current = null;
    didTriggerReplyRef.current = false;
    setDragOffset(0);
    setDragReplyReady(false);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // El gesto de "arrastrar para responder" es solo para tactil/lápiz (estilo
    // WhatsApp) -- con ratón capturaba cualquier arrastre (incluida la
    // selección de texto dentro del mensaje) y la convertía en un swipe de
    // respuesta. En escritorio ya existe el botón "Responder" del hover.
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    dragStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    didTriggerReplyRef.current = false;
    setDragOffset(0);
    setDragReplyReady(false);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - start.x) * dragDirection;
    const deltaY = Math.abs(event.clientY - start.y);
    if (deltaY > 48) {
      resetDrag();
      return;
    }
    const clamped = Math.max(0, Math.min(deltaX, 92));
    setDragOffset(clamped * dragDirection);
    setDragReplyReady(clamped >= 68);
    if (clamped >= 68 && !didTriggerReplyRef.current) {
      didTriggerReplyRef.current = true;
      onReply(msg);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    resetDrag();
  };

  if (msg.deleted_at) return (
    <div className={`flex gap-3 items-center px-4 py-0.5 ${!sameAuthor ? "mt-3" : ""}`}>
      <div className="w-9 shrink-0" />
      <span className="text-slate-400 italic text-xs">{t("Mensaje eliminado")}</span>
    </div>
  );

  return (
    <div id={`msg-${msg.id}`}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>{ if (!showEmoji) setHover(false); }}
      className={`relative group px-4 transition-colors duration-100 ${isHighlighted?"bg-yellow-50":meMenciona?"bg-amber-50/70 hover:bg-amber-50 shadow-[inset_3px_0_0_0_#f59e0b]":"hover:bg-slate-50/80"} ${!sameAuthor?"mt-3 pt-2 pb-1":"py-0.5"} ${
        isFreshIncoming ? "animate-in fade-in slide-in-from-bottom-1" : ""
      }`}>
      {/* Drag reply hint */}
      {dragMagnitude > 6 && (
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 shadow-sm">
          <CornerDownRight size={12} className={dragReplyReady ? "text-red-700" : "text-red-400"} />
          <span>{dragReplyReady ? t("Respondiendo...") : t("Arrastra para responder")}</span>
        </div>
      )}

      <div className="flex gap-3 items-start">
        {/* Avatar o timestamp compacto */}
        <div className="w-9 shrink-0 flex items-start justify-center pt-0.5">
          {!sameAuthor ? (
            <Av
              url={resolveAvatarUrl?.(msg.user_id, msg.avatar_url, isMe) ?? msg.avatar_url}
              name={resolveDisplayName(msg.user_id, msg.user_name, isMe)}
              size={9}
            />
          ) : (
            <span className={`text-[10px] text-slate-400 leading-none mt-1.5 transition-opacity ${hover ? "opacity-100" : "opacity-0"}`}>
              {fmtTime(msg.created_at)}
            </span>
          )}
        </div>

        {/* Contenido del mensaje */}
        <div className="flex-1 min-w-0">
          {/* Fila autor */}
          {!sameAuthor && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-bold text-slate-800 text-[15px]">{resolveDisplayName(msg.user_id, msg.user_name, isMe)}</span>
              {isMe&&<span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">{t("Tú")}</span>}
              <span className="text-xs text-slate-400">{fmtTime(msg.created_at)}</span>
              {isMe && showReadReceipt && (
                <span
                  title={isReadByRecipient ? t("Leído por el destinatario") : t("Pendiente de leer")}
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 ${
                    isReadByRecipient ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Eye size={11} />
                </span>
              )}
              {msg.editado&&<span className="text-[10px] text-slate-400 italic">{t("(editado)")}</span>}
            </div>
          )}

          {/* Cita de respuesta */}
          {msg.reply_to && (
            <div className="flex items-start gap-1.5 mb-1.5 pl-2 border-l-2 border-slate-300 bg-slate-100/60 rounded-r py-1 pr-2">
              <CornerDownRight size={10} className="text-slate-400 mt-0.5 shrink-0"/>
              <span className="text-xs font-semibold text-slate-500">{resolveDisplayName(msg.reply_to.user_id, msg.reply_to.user_name, msg.reply_to.user_id === currentUserId)}</span>
              <span className="text-xs text-slate-400 line-clamp-1 ml-1">{msg.reply_to.contenido}</span>
            </div>
          )}

          {/* Cuerpo con soporte drag-to-reply */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="touch-pan-y"
            style={{ transform: `translateX(${dragOffset}px)`, transition: dragOffset === 0 ? "transform 0.15s ease" : "none" }}
          >
            {imageSrc && (
              <>
                <button type="button" onClick={() => setShowImageLightbox(true)}
                  className="group/image mt-1 block overflow-hidden rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md"
                  aria-label={t("Ampliar imagen adjunta")}>
                  <img src={imageSrc} alt={t("Imagen adjunta")} className="max-w-[320px] rounded-xl object-cover transition duration-200 group-hover/image:scale-[1.01]" loading="lazy" />
                </button>
                {showImageLightbox && (
                  <ImageLightbox src={imageSrc} alt={t("Imagen adjunta")}
                    authorName={resolveDisplayName(msg.user_id, msg.user_name, isMe)}
                    authorAvatarUrl={resolveAvatarUrl?.(msg.user_id, msg.avatar_url, isMe) ?? msg.avatar_url}
                    createdAt={msg.created_at}
                    fileName={msg.image_url?.split("/").pop()?.split("?")[0] || undefined}
                    onClose={() => setShowImageLightbox(false)} />
                )}
              </>
            )}
            {fileSrc && fileTypeIcon && (() => {
              const fIsImg = isImageFile(msg.file_name, msg.file_mime);
              const fIsPdf = isPdfFile(msg.file_name, msg.file_mime);
              return (
              <div role="button" tabIndex={0}
                onClick={() => setShowFilePreview(true)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowFilePreview(true); } }}
                className="mt-1 w-[190px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md group/file text-left cursor-pointer">
                {(fIsImg || fIsPdf) ? (
                  <div className="h-[150px] w-full overflow-hidden bg-slate-50">
                    {fIsImg ? (
                      <img src={fileSrc} alt={msg.file_name || t("Archivo")} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="pointer-events-none h-full w-full overflow-hidden bg-white">
                        <iframe src={`${fileSrc}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} title={msg.file_name || t("PDF")} tabIndex={-1}
                          className="h-[460px] w-[190px] origin-top-left border-0" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-[110px] w-full items-center justify-center bg-slate-50">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${fileTypeIcon.iconBg} ${fileTypeIcon.iconColor}`}>
                      <fileTypeIcon.Icon size={22}/>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-700">{msg.file_name || t("Archivo")}</p>
                    <p className="text-[10px] text-slate-400">{t("Ver archivo")}</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); void handleFileDownload(); }}
                    title={t("Descargar")} disabled={downloadingFile}
                    className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-70">
                    {downloadingFile
                      ? <Loader2 size={14} className="animate-spin"/>
                      : <Download size={14}/>}
                  </button>
                </div>
              </div>
              );
            })()}
            {showFilePreview && fileSrc && (
              <FilePreviewModal
                src={fileSrc}
                fileName={msg.file_name}
                mime={msg.file_mime}
                subtitle={`${resolveDisplayName(msg.user_id, msg.user_name, isMe)} · ${new Date(msg.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${fmtTime(msg.created_at)}`}
                onDownload={handleFileDownload}
                downloading={downloadingFile}
                onClose={() => setShowFilePreview(false)}
              />
            )}
            {msg.gif_url
              ? (
                <>
                  <button type="button" onClick={() => setShowGifLightbox(true)}
                    className="group/image mt-1 block overflow-hidden rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md"
                    aria-label={t("Ampliar GIF")}>
                    <img src={msg.gif_url} alt={t("GIF")} className="max-w-[240px] rounded-xl object-cover transition duration-200 group-hover/image:scale-[1.01]" loading="lazy" />
                  </button>
                  {showGifLightbox && (
                    <ImageLightbox src={msg.gif_url} alt={t("GIF")}
                      authorName={resolveDisplayName(msg.user_id, msg.user_name, isMe)}
                      authorAvatarUrl={resolveAvatarUrl?.(msg.user_id, msg.avatar_url, isMe) ?? msg.avatar_url}
                      createdAt={msg.created_at}
                      fileName={msg.gif_url?.split("/").pop()?.split("?")[0] || undefined}
                      onClose={() => setShowGifLightbox(false)} />
                  )}
                </>
              )
              : !fileSrc && msg.contenido !== IMAGE_PLACEHOLDER_TEXT && (
                <div className="text-slate-700 text-[15px] leading-relaxed break-words"><TextoMensaje texto={msg.contenido}/></div>
              )
            }
            {previewUrl && !msg._envio && <LinkPreviewCard url={previewUrl} getToken={getToken} />}
          </div>
          {msg._envio === "enviando" && envioLento && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={11}/>{" "}{t("Enviando…")}</p>
          )}
          {msg._envio === "error" && (
            <p className="peligro mt-1 flex flex-wrap items-center gap-2 text-xs text-red-600">
              <span>{t("No se ha podido enviar.")}</span>
              <button type="button" onClick={() => onReintentar?.(msg.id)} className="font-semibold underline-offset-2 hover:underline">{t("Reintentar")}</button>
              <button type="button" onClick={() => onDescartar?.(msg.id)} className="text-slate-500 underline-offset-2 hover:underline">{t("Descartar")}</button>
            </p>
          )}

          {/* Reacciones */}
          {reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {reactions.map(r=>(
                <button key={r.emoji} onClick={()=>onReact(msg.id,r.emoji)} title={r.names.join(", ")}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-all font-medium ${r.mine?"bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200":"bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
                  <EmojiImg emoji={r.emoji} size={16} />
                  <span>{r.count}</span>
                </button>
              ))}
              {!msg._envio && (
                <button onClick={()=>setShowEmoji(true)} title={t("Añadir reacción")}
                  className="flex items-center rounded-full border border-dashed border-slate-200 px-1.5 py-0.5 text-slate-400 opacity-0 transition-opacity hover:border-slate-300 hover:text-slate-600 group-hover:opacity-100">
                  <Smile size={13}/><Plus size={9} className="-ml-0.5"/>
                </button>
              )}
            </div>
          )}

          {/* Resumen del hilo (como en Slack): quién ha contestado, cuántas
              respuestas y cuándo la última. Abre el hilo al pulsar. */}
          {!enHilo && !!msg.respuestas && msg.respuestas > 0 && onThread && (
            <button type="button" onClick={()=>onThread(msg)}
              className="group/hilo mt-1.5 -ml-1 flex max-w-md items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-left transition-all hover:border-slate-200 hover:bg-white hover:shadow-sm">
              <span className="flex -space-x-1.5">
                {(msg.hilo_autores || []).slice(0, 4).map((a) => (
                  <span key={a.user_id} className="rounded-md ring-2 ring-white">
                    <Av url={resolveAvatarUrl?.(a.user_id, a.avatar_url, a.user_id === currentUserId) ?? a.avatar_url} name={resolveDisplayName(a.user_id, a.user_name, a.user_id === currentUserId)} size={5}/>
                  </span>
                ))}
              </span>
              <span className="text-xs font-bold text-blue-600 group-hover/hilo:underline">
                {msg.respuestas} {msg.respuestas === 1 ? t("respuesta") : t("respuestas")}
              </span>
              {msg.ultima_respuesta_at && (
                <span className="text-xs text-slate-400 group-hover/hilo:hidden">{t("Última")}{" "}{haceRato(msg.ultima_respuesta_at)}</span>
              )}
              <span className="hidden text-xs text-slate-400 group-hover/hilo:inline">{t("Ver hilo")}</span>
              <ChevronRight size={13} className="text-slate-300 opacity-0 transition-opacity group-hover/hilo:opacity-100"/>
            </button>
          )}
        </div>
      </div>

      {/* Hover toolbar */}
      {(hover || showEmoji) && !msg._envio && (
        <div className="absolute right-4 -top-4 flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md px-1 py-0.5 z-20 animate-in fade-in zoom-in-95 duration-100">
          {/* Reacciones rápidas (un clic, sin abrir el selector). */}
          {REACCIONES_RAPIDAS.map((e) => (
            <button key={e} onClick={()=>onReact(msg.id, e)} title={t("Reaccionar con {e}", { e: e })}
              className="hidden rounded-md p-1 transition-transform hover:scale-110 hover:bg-slate-100 sm:block">
              <EmojiImg emoji={e} size={16} />
            </button>
          ))}
          <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:block"/>
          <div className="relative">
            <button ref={emojiButtonRef} onClick={()=>setShowEmoji(v=>!v)} title={t("Reaccionar")}
              className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"><Smile size={14}/></button>
            {showEmoji&&<EmojiPicker anchorRef={emojiButtonRef} align="right" onPick={e=>{onReact(msg.id,e);setShowEmoji(false);setHover(false);}} onClose={()=>{setShowEmoji(false);setHover(false);}}/>}
          </div>
          {onThread && !enHilo && (
            <button onClick={()=>onThread(msg)} title={t("Responder en hilo")}
              className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-600 transition-colors"><MessageSquareText size={14}/></button>
          )}
          <button onClick={()=>onReply(msg)} title={t("Citar y responder")}
            className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"><CornerDownRight size={14}/></button>
          <button onClick={()=>{ void navigator.clipboard?.writeText(msg.contenido || "").then(()=>aviso.ok(t("Texto copiado")), ()=>{}); }} title={t("Copiar texto")}
            className="hidden p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors sm:block"><Copy size={14}/></button>
          <button onClick={()=>onFavorite(msg.id)} title={isFavorite ? t("Quitar de favoritos") : t("Guardar en favoritos")}
            className={`p-1.5 rounded-md transition-colors ${isFavorite ? "bg-amber-50 text-amber-500 hover:bg-amber-100" : "text-slate-400 hover:bg-slate-100 hover:text-amber-500"}`}><Star size={14} className={isFavorite ? "fill-amber-300" : ""}/></button>
          <button onClick={()=>onPin(msg.id)} title={isPinned ? t("Desfijar") : t("Fijar")}
            className={`p-1.5 rounded-md transition-colors ${isPinned ? "bg-red-50 text-red-500 hover:bg-red-100" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}><Pin size={14} className={isPinned ? "fill-red-200" : ""}/></button>
          {isMe && (
            <>
              <button onClick={()=>onEdit(msg)} title={t("Editar")}
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"><Edit3 size={14}/></button>
              <button onClick={()=>onDelete(msg.id)} title={t("Eliminar")}
                className="peligro p-1.5 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// DATE SEPARATOR
// ══════════════════════════════════════════════════════════════════════════════
function DateSep({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 select-none">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-slate-200"/>
      <span className="text-[11px] text-slate-500 font-semibold bg-white/90 px-3 py-1 rounded-full border border-slate-200 shadow-sm shrink-0">{fmtDateLabel(date)}</span>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-slate-200 to-slate-200"/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE INPUT
// ══════════════════════════════════════════════════════════════════════════════
/** Lo que se escribe tras "@" (vale con tildes y con nombre y apellidos). */
const MENCION_EN_CURSO = /(^|\s)@([\p{L}\p{N}_.-]*(?: [\p{L}\p{N}_.-]*){0,2})$/u;

interface CandidatoMencion { key: string; nombre: string; detalle: string; avatar: string | null; grupo?: boolean }

function ListaMenciones({ items, activo, onSelect, onHover }: {
  items: CandidatoMencion[]; activo: number; onSelect: (n: string) => void; onHover: (i: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="absolute bottom-full left-2 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl animate-in fade-in slide-in-from-bottom-1 duration-150">
      <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Mencionar")}</p>
      {items.map((m, i) => (
        <button key={m.key} type="button"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onSelect(m.nombre)}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${i === activo ? "bg-slate-100" : ""}`}>
          {m.grupo
            ? <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700"><AtSign size={13}/></span>
            : <Av url={m.avatar} name={m.nombre} size={6}/>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{m.grupo ? `@${m.nombre}` : m.nombre}</span>
          </span>
          <span className="shrink-0 truncate text-[11px] text-slate-400">{m.detalle}</span>
        </button>
      ))}
      <p className="border-t border-slate-100 px-3 pt-1.5 pb-1 text-[10px] text-slate-400">{t("↑↓ para elegir · Intro o Tab para mencionar · Esc para cerrar")}</p>
    </div>
  );
}

/** Botón de la barra de formato. */
function BotonFormato({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={titulo} aria-label={titulo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800">
      {children}
    </button>
  );
}

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

function MessageInput({ canalId, canalNombre, isDirect, replyTo, editingMsg, miembros, currentUserId, resolveDisplayName, onTypingChange, onSend, onSendOptimista, onCancelReply, onCancelEdit, borradorInicial = "", onBorrador, onEditarUltimo, placeholder, compacto = false }: {
  canalId: string; canalNombre: string; isDirect?: boolean; replyTo: Mensaje|null; editingMsg: Mensaje|null; miembros: Miembro[]; currentUserId: string;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
  onTypingChange:(canalId: string, typing: boolean)=>void;
  onSend:(text:string,gifUrl?:string,replyId?:string,editId?:string,imageUrl?:string,fileUrl?:string,fileName?:string,fileMime?:string)=>Promise<void>;
  onSendOptimista:(items: EnvioNuevo[])=>void;
  onCancelReply:()=>void; onCancelEdit:()=>void;
  /** Borrador guardado de esta conversación (se recupera al volver). */
  borradorInicial?: string;
  onBorrador?:(texto: string)=>void;
  /** Flecha arriba con el cuadro vacío: editar mi último mensaje. */
  onEditarUltimo?:()=>void;
  placeholder?: string;
  /** Versión del panel del hilo (más estrecha). */
  compacto?: boolean;
}) {
  const [text, setText] = useState(borradorInicial);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mentionQ, setMentionQ] = useState<string|null>(null);
  const [mencionIdx, setMencionIdx] = useState(0);
  // Arrays (antes admitían solo uno) -- cada imagen / archivo se manda como
  // su propio mensaje al pulsar enviar, ver doSend.
  const [selectedImages, setSelectedImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; name: string; size: number; mime: string }[]>([]);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const typingActiveRef = useRef(false);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragCounterRef = useRef(0);
  // Lo que había escrito antes de ponerse a editar un mensaje: vuelve al terminar.
  const textoAntesDeEditarRef = useRef<string | null>(null);
  // Al desmontar (cambiar de conversación) se guarda lo último escrito.
  const ultimoTextoRef = useRef(text);
  ultimoTextoRef.current = editingMsg ? (textoAntesDeEditarRef.current ?? "") : text;
  const onBorradorRef = useRef(onBorrador);
  onBorradorRef.current = onBorrador;
  useEffect(() => () => { onBorradorRef.current?.(ultimoTextoRef.current); }, []);

  const autoResize = useCallback(() => {
    const t = taRef.current;
    if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, compacto ? 200 : 240)+"px"; }
  }, [compacto]);

  useEffect(() => {
    if (editingMsg) {
      if (textoAntesDeEditarRef.current === null) textoAntesDeEditarRef.current = text;
      setText(editingMsg.contenido);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        autoResize();
      });
    } else if (textoAntesDeEditarRef.current !== null) {
      setText(textoAntesDeEditarRef.current);
      textoAntesDeEditarRef.current = null;
      requestAnimationFrame(autoResize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMsg?.id]);

  // El borrador se guarda solo (no mientras se edita un mensaje).
  useEffect(() => {
    if (editingMsg || !onBorrador) return;
    const t = window.setTimeout(() => onBorrador(text), 250);
    return () => clearTimeout(t);
  }, [text, editingMsg, onBorrador]);

  useEffect(() => { requestAnimationFrame(autoResize); }, [autoResize]);

  useEffect(() => () => {
    for (const img of selectedImages) URL.revokeObjectURL(img.previewUrl);
  }, [selectedImages]);

  // Al responder o citar, el cursor va al cuadro.
  useEffect(() => { if (replyTo) taRef.current?.focus(); }, [replyTo?.id]);

  const stopTypingSignal = useCallback(() => {
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    if (typingHeartbeatRef.current) {
      clearInterval(typingHeartbeatRef.current);
      typingHeartbeatRef.current = null;
    }
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    onTypingChange(canalId, false);
  }, [canalId, onTypingChange]);

  const scheduleTypingStop = useCallback(() => {
    if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    typingStopTimeoutRef.current = setTimeout(() => {
      stopTypingSignal();
    }, 3000);
  }, [stopTypingSignal]);

  const startTypingSignal = useCallback(() => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingChange(canalId, true);
      typingHeartbeatRef.current = setInterval(() => {
        onTypingChange(canalId, true);
      }, 2500);
    }
    scheduleTypingStop();
  }, [canalId, onTypingChange, scheduleTypingStop]);

  useEffect(() => stopTypingSignal, [stopTypingSignal]);
  useEffect(() => {
    stopTypingSignal();
  }, [canalId, stopTypingSignal]);

  const syncSelection = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    selectionRef.current = {
      start: ta.selectionStart ?? text.length,
      end: ta.selectionEnd ?? text.length,
    };
  }, [text.length]);

  /** Cambia el texto y deja la selección donde se diga. */
  const aplicar = (nuevo: string, selIni: number, selFin = selIni) => {
    // La selección se pone YA en el cuadro (no en el siguiente fotograma): si
    // no, lo que se teclea justo después caía fuera (p. ej. tras Ctrl+B).
    const taAhora = taRef.current;
    if (taAhora) { taAhora.value = nuevo; taAhora.setSelectionRange(selIni, selFin); }
    setText(nuevo);
    selectionRef.current = { start: selIni, end: selFin };
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selIni, selFin);
      autoResize();
    });
    if (nuevo.trim()) startTypingSignal(); else stopTypingSignal();
  };

  /** **negrita**, _cursiva_, ~tachado~, `código`: si ya estaba, lo quita. */
  const envolver = (izq: string, der = izq, relleno = "texto") => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart ?? text.length, e = ta.selectionEnd ?? text.length;
    const antes = text.slice(0, s), sel = text.slice(s, e), despues = text.slice(e);
    if (sel && antes.endsWith(izq) && despues.startsWith(der)) {
      aplicar(antes.slice(0, -izq.length) + sel + despues.slice(der.length), s - izq.length, e - izq.length);
      return;
    }
    if (sel.length > izq.length + der.length && sel.startsWith(izq) && sel.endsWith(der)) {
      const dentro = sel.slice(izq.length, sel.length - der.length);
      aplicar(antes + dentro + despues, s, s + dentro.length);
      return;
    }
    const contenido = sel || relleno;
    aplicar(antes + izq + contenido + der + despues, s + izq.length, s + izq.length + contenido.length);
  };

  /** Listas y citas: pone (o quita) el prefijo a cada línea seleccionada. */
  const prefijarLineas = (tipo: "lista" | "numerada" | "cita") => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart ?? text.length, e = ta.selectionEnd ?? text.length;
    const ini = text.lastIndexOf("\n", s - 1) + 1;
    const finIdx = text.indexOf("\n", e);
    const fin = finIdx === -1 ? text.length : finIdx;
    const lineas = text.slice(ini, fin).split("\n");
    const patron = tipo === "lista" ? /^\s*[-•*]\s+/ : tipo === "numerada" ? /^\s*\d+[.)]\s+/ : /^>\s?/;
    const todas = lineas.every((l) => patron.test(l));
    const nuevas = lineas.map((l, i) => (todas
      ? l.replace(patron, "")
      : (tipo === "lista" ? "- " : tipo === "numerada" ? `${i + 1}. ` : "> ") + l.replace(/^\s*(?:[-•*]|\d+[.)]|>)\s?/, "")));
    const bloque = nuevas.join("\n");
    aplicar(text.slice(0, ini) + bloque + text.slice(fin), ini + bloque.length);
  };

  /** [texto](enlace): deja seleccionada la parte que falta por escribir. */
  const insertarEnlace = () => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart ?? text.length, e = ta.selectionEnd ?? text.length;
    const sel = text.slice(s, e);
    if (/^https?:\/\/\S+$/.test(sel)) {
      const nuevo = `${text.slice(0, s)}[enlace](${sel})${text.slice(e)}`;
      aplicar(nuevo, s + 1, s + 7);
      return;
    }
    const etiqueta = sel || "texto";
    const nuevo = `${text.slice(0, s)}[${etiqueta}](https://)${text.slice(e)}`;
    const urlIni = s + etiqueta.length + 3;
    aplicar(nuevo, urlIni, urlIni + 8);
  };

  const codigo = () => {
    const ta = taRef.current; if (!ta) return;
    const sel = text.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0);
    if (sel.includes("\n")) envolver("```\n", "\n```", "código");
    else envolver("`", "`", "código");
  };

  const candidatosMencion = useMemo<CandidatoMencion[]>(() => {
    if (mentionQ === null) return [];
    const q = sinTildes(mentionQ.trim());
    const gente = miembros
      .filter((m) => m.user_id !== currentUserId && sinTildes(m.user_name || "").includes(q))
      .slice(0, 7)
      .map((m) => ({ key: m.user_id, nombre: m.user_name, detalle: m.role_label || "", avatar: m.avatar_url }));
    const grupos: CandidatoMencion[] = isDirect ? [] : [
      { key: "@canal", nombre: "canal", detalle: "Avisa a todo el canal", avatar: null, grupo: true },
    ].filter((g) => g.nombre.startsWith(q) || (q && "todos".startsWith(q)));
    return [...gente, ...grupos];
  }, [mentionQ, miembros, currentUserId, isDirect]);

  useEffect(() => { setMencionIdx(0); }, [mentionQ]);

  const insertMention = (name: string) => {
    const ta = taRef.current; if (!ta) return;
    const cur = ta.selectionStart ?? text.length;
    const before = text.slice(0, cur).replace(MENCION_EN_CURSO, (_m, pre) => `${pre}@${name} `);
    const after = text.slice(cur);
    setMentionQ(null);
    aplicar(before + after, before.length);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Lista de menciones abierta: se maneja con el teclado.
    if (mentionQ !== null && candidatosMencion.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMencionIdx((i) => (i + 1) % candidatosMencion.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMencionIdx((i) => (i - 1 + candidatosMencion.length) % candidatosMencion.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(candidatosMencion[mencionIdx]?.nombre || candidatosMencion[0].nombre); return; }
      if (e.key === "Escape") { e.preventDefault(); setMentionQ(null); return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (!e.shiftKey && k === "b") { e.preventDefault(); envolver("**"); return; }
      if (!e.shiftKey && k === "i") { e.preventDefault(); envolver("_"); return; }
      if (e.shiftKey && k === "x") { e.preventDefault(); envolver("~"); return; }
      if (e.shiftKey && k === "u") { e.preventDefault(); insertarEnlace(); return; }
      if (e.shiftKey && e.code === "Digit7") { e.preventDefault(); prefijarLineas("numerada"); return; }
      if (e.shiftKey && e.code === "Digit8") { e.preventDefault(); prefijarLineas("lista"); return; }
      if (e.shiftKey && e.code === "Digit9") { e.preventDefault(); prefijarLineas("cita"); return; }
    }
    if (e.key === "Enter" && e.shiftKey) {
      // En una lista, la línea nueva sigue la lista (y una vacía la termina).
      const ta = e.currentTarget;
      const pos = ta.selectionStart ?? text.length;
      if (pos !== (ta.selectionEnd ?? pos)) return;
      const ini = text.lastIndexOf("\n", pos - 1) + 1;
      const linea = text.slice(ini, pos);
      const vineta = linea.match(/^(\s*[-•*]\s+)(.*)$/);
      const numero = linea.match(/^(\s*)(\d+)([.)]\s+)(.*)$/);
      const cita = linea.match(/^(>\s?)(.*)$/);
      const vacia = (vineta && !vineta[2].trim()) || (numero && !numero[4].trim()) || (cita && !cita[2].trim());
      if (vacia) { e.preventDefault(); aplicar(text.slice(0, ini) + text.slice(pos), ini); return; }
      const prefijo = vineta ? vineta[1] : numero ? `${numero[1]}${parseInt(numero[2], 10) + 1}${numero[3]}` : cita ? cita[1] : null;
      if (prefijo) { e.preventDefault(); aplicar(`${text.slice(0, pos)}\n${prefijo}${text.slice(pos)}`, pos + 1 + prefijo.length); }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void doSend();
      return;
    }
    if (e.key === "ArrowUp" && !text && !editingMsg && !selectedImages.length && !selectedFiles.length && onEditarUltimo) {
      e.preventDefault();
      onEditarUltimo();
      return;
    }
    if (e.key === "Escape") {
      // Esc ya no borra lo escrito: solo cancela la edición o la cita.
      if (editingMsg) { e.preventDefault(); onCancelEdit(); }
      else if (replyTo) { e.preventDefault(); onCancelReply(); }
    }
  };

  const doSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !editingMsg && selectedImages.length === 0 && selectedFiles.length === 0) return;
    stopTypingSignal();
    setMentionQ(null);
    if (editingMsg && selectedImages.length === 0 && selectedFiles.length === 0) {
      // La edición también se ve al instante (handleSend la aplica antes de esperar).
      if (trimmed && trimmed !== editingMsg.contenido) void onSend(trimmed, undefined, undefined, editingMsg.id).catch(() => {});
      else onCancelEdit();
      return;
    }
    // Cada imagen y cada archivo van en su propio mensaje (el modelo de
    // datos es un adjunto por mensaje). El texto escrito y la respuesta,
    // si los hay, van con el PRIMER mensaje para que no queden sueltos.
    const items: EnvioNuevo[] = [];
    const primero = () => (items.length === 0 ? { texto: trimmed, replyId: replyTo?.id } : { texto: "" });
    for (const img of selectedImages) items.push({ ...primero(), imagen: { file: img.file, previewUrl: img.previewUrl } });
    for (const sf of selectedFiles) items.push({ ...primero(), archivo: sf.file });
    if (!items.length) items.push({ texto: trimmed, replyId: replyTo?.id });
    onSendOptimista(items);
    // Las vistas previas de las imágenes las sigue usando el mensaje
    // provisional; se liberan cuando llega la imagen de verdad.
    setText("");
    onBorrador?.("");
    setSelectedImages([]);
    setSelectedFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    if (attachFileRef.current) attachFileRef.current.value = "";
    taRef.current && (taRef.current.style.height="auto");
    taRef.current?.focus();
  };

  const insertEmojiAtCursor = (emoji: string) => {
    const ta = taRef.current;
    const hasFocus = !!ta && document.activeElement === ta;
    const start = hasFocus ? (ta.selectionStart ?? text.length) : selectionRef.current.start;
    const end = hasFocus ? (ta.selectionEnd ?? text.length) : selectionRef.current.end;
    const safeStart = Math.max(0, Math.min(start, text.length));
    const safeEnd = Math.max(safeStart, Math.min(end, text.length));
    const nextText = `${text.slice(0, safeStart)}${emoji}${text.slice(safeEnd)}`;
    const cursor = safeStart + emoji.length;
    setShowMediaPicker(false);
    aplicar(nextText, cursor);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value); autoResize();
    const cursor = e.target.selectionStart;
    selectionRef.current = {
      start: e.target.selectionStart ?? e.target.value.length,
      end: e.target.selectionEnd ?? e.target.value.length,
    };
    const m = e.target.value.slice(0,cursor).match(MENCION_EN_CURSO);
    setMentionQ(m ? m[2] : null);
    if (e.target.value.trim()) startTypingSignal();
    else stopTypingSignal();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Imagen pegada (captura de pantalla con Ctrl+V, copiar una imagen del
    // navegador...) -- va al mismo flujo que "Adjuntar imagen".
    const pastedImages = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith("image/"));
    if (pastedImages.length) {
      e.preventDefault();
      chooseImages(pastedImages);
      return;
    }
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const plain = e.clipboardData.getData("text/plain");
    // Pegar un enlace con texto seleccionado lo convierte en [texto](enlace), como en Slack.
    if (start !== end && /^https?:\/\/\S+$/.test(plain.trim()) && !/\n/.test(text.slice(start, end))) {
      e.preventDefault();
      const etiqueta = text.slice(start, end);
      const nuevo = `${text.slice(0, start)}[${etiqueta}](${plain.trim()})${text.slice(end)}`;
      aplicar(nuevo, start + etiqueta.length + plain.trim().length + 4);
      return;
    }

    const html = e.clipboardData.getData("text/html");
    if (!html) return;
    const formatted = htmlToComposerText(html, plain);
    if (!formatted || formatted === plain) return;

    e.preventDefault();
    const nextText = `${text.slice(0, start)}${formatted}${text.slice(end)}`;
    setMentionQ(null);
    aplicar(nextText, start + formatted.length);
  };

  const sendGif = (url: string) => {
    setShowMediaPicker(false);
    stopTypingSignal();
    onSendOptimista([{ texto: "GIF", gifUrl: url, replyId: replyTo?.id }]);
  };

  const chooseImages = (files: (File | null | undefined)[]) => {
    const imgs = files.filter((f): f is File => !!f && f.type.startsWith("image/"));
    if (!imgs.length) return;
    stopTypingSignal();
    setSelectedImages(prev => [...prev, ...imgs.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
    setShowMediaPicker(false);
  };

  const chooseFiles = (files: File[]) => {
    if (!files.length) return;
    setSelectedFiles(prev => [...prev, ...files.map(f => ({ file: f, name: f.name, size: f.size, mime: f.type }))]);
  };

  // Arrastrar archivos al cuadro: las imágenes van como imagen y el resto
  // (PDF, Word...) como archivo adjunto (antes solo se aceptaban imágenes).
  const hayArchivos = (e: React.DragEvent) => [...e.dataTransfer.items].some((item) => item.kind === "file");
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hayArchivos(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingImage(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hayArchivos(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDraggingImage) setIsDraggingImage(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && e.currentTarget.contains(nextTarget)) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingImage(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const todos = [...e.dataTransfer.files];
    dragCounterRef.current = 0;
    setIsDraggingImage(false);
    if (!todos.length) return;
    e.preventDefault();
    chooseImages(todos.filter((f) => f.type.startsWith("image/")));
    chooseFiles(todos.filter((f) => !f.type.startsWith("image/")));
  };

  const canSend = !!text.trim() || !!editingMsg || selectedImages.length > 0 || selectedFiles.length > 0;
  const textoPlaceholder = placeholder || (editingMsg ? "Editar mensaje..." : isDirect ? t("Escribe a {nombre}...", { nombre: canalNombre }) : t("Escribe en #{nombre}...", { nombre: canalNombre }));

  return (
    <div className={`${compacto ? "px-3 pb-3 pt-2" : "px-4 pb-4 pt-3"} shrink-0`}>
      {(replyTo||editingMsg)&&(
        <div className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200 ${editingMsg ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 text-blue-700"}`}>
          {editingMsg ? <Edit3 size={12} className="shrink-0"/> : <CornerDownRight size={12} className="shrink-0"/>}
          {replyTo && !editingMsg && <span className="min-w-0 truncate">{t("Citando a")}{" "}<strong>{resolveDisplayName(replyTo.user_id, replyTo.user_name, replyTo.user_id === currentUserId)}</strong>: <span className="opacity-70">{replyTo.contenido.slice(0,80)}{replyTo.contenido.length>80?"…":""}</span></span>}
          {editingMsg && <span><span className="font-semibold">{t("Editando mensaje")}</span> <span className="opacity-70">{t("· Intro para guardar · Esc para cancelar")}</span></span>}
          <button type="button" onClick={()=>{ if (editingMsg) onCancelEdit(); else onCancelReply(); }} title={t("Cancelar (Esc)")} className="ml-auto shrink-0 rounded p-0.5 transition-colors hover:bg-white/70 hover:text-red-500"><X size={12}/></button>
        </div>
      )}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative bg-white rounded-[1.1rem] border focus-within:border-slate-300 focus-within:shadow-[0_10px_34px_-18px_rgba(15,23,42,0.35)] transition-all shadow-sm ${
          isDraggingImage
            ? "border-red-300 bg-red-50/80 shadow-[0_18px_50px_-22px_rgba(220,38,38,0.45)]"
            : editingMsg ? "border-amber-300" : "border-slate-200"
        }`}
      >
        {isDraggingImage && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[1.1rem] bg-red-50/80">
            <div className="rounded-2xl border border-red-200 bg-white/95 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-500">
                <Paperclip size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-800">{t("Suelta para adjuntar")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("Imágenes, PDF, Word, Excel…")}</p>
            </div>
          </div>
        )}
        {/* Barra de formato */}
        <div className="flex items-center gap-px overflow-x-auto rounded-t-[1.1rem] border-b border-slate-100 bg-slate-50/70 px-2 py-1">
          <BotonFormato titulo={t("Negrita ({MOD}+B)", { MOD: MOD })} onClick={()=>envolver("**")}><Bold size={14}/></BotonFormato>
          <BotonFormato titulo={t("Cursiva ({MOD}+I)", { MOD: MOD })} onClick={()=>envolver("_")}><Italic size={14}/></BotonFormato>
          <BotonFormato titulo={t("Tachado ({MOD}+Mayús+X)", { MOD: MOD })} onClick={()=>envolver("~")}><Strikethrough size={14}/></BotonFormato>
          <span className="mx-1 h-4 w-px shrink-0 bg-slate-200"/>
          <BotonFormato titulo={t("Enlace ({MOD}+Mayús+U)", { MOD: MOD })} onClick={insertarEnlace}><Link2 size={14}/></BotonFormato>
          <span className="mx-1 h-4 w-px shrink-0 bg-slate-200"/>
          <BotonFormato titulo={t("Lista numerada ({MOD}+Mayús+7)", { MOD: MOD })} onClick={()=>prefijarLineas("numerada")}><ListOrdered size={14}/></BotonFormato>
          <BotonFormato titulo={t("Lista con viñetas ({MOD}+Mayús+8)", { MOD: MOD })} onClick={()=>prefijarLineas("lista")}><List size={14}/></BotonFormato>
          <BotonFormato titulo={t("Cita ({MOD}+Mayús+9)", { MOD: MOD })} onClick={()=>prefijarLineas("cita")}><Quote size={14}/></BotonFormato>
          <span className="mx-1 h-4 w-px shrink-0 bg-slate-200"/>
          <BotonFormato titulo={t("Código (selecciona varias líneas para un bloque)")} onClick={codigo}><Code size={14}/></BotonFormato>
        </div>

        {/* Textarea */}
        <div className="relative px-1">
          {mentionQ!==null && (
            <ListaMenciones items={candidatosMencion} activo={mencionIdx} onSelect={insertMention} onHover={setMencionIdx}/>
          )}
          {selectedImages.length > 0 && (
            <div className="mx-3 mt-3 flex flex-wrap gap-2">
              {selectedImages.map((img, i) => (
                <div key={`${img.file.name}-${i}`} className="relative rounded-xl border border-slate-200 bg-white p-1 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                  <img src={img.previewUrl} alt={t("Vista previa")} className="h-20 w-20 rounded-lg object-cover" />
                  <button type="button" title={t("Quitar")} onClick={()=>{
                    URL.revokeObjectURL(img.previewUrl);
                    setSelectedImages(prev => prev.filter((_, idx) => idx !== i));
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white transition-colors hover:bg-black">
                    <X size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}
          {selectedFiles.length > 0 && (
            <div className="mx-3 mt-3 flex flex-wrap gap-2">
              {selectedFiles.map((sf, i) => {
                const icono = getFileTypeIcon(sf.name, sf.mime);
                return (
                  <div key={`${sf.name}-${i}`} className="flex max-w-[260px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${icono.iconBg} ${icono.iconColor}`}>
                      <icono.Icon size={15}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-700">{sf.name}</p>
                      <p className="text-[10px] text-slate-400">{sf.size >= 1024 * 1024 ? t("{toFixed} MB", { toFixed: (sf.size / 1024 / 1024).toFixed(1) }) : t("{max} KB", { max: Math.max(1, Math.round(sf.size / 1024)) })}</p>
                    </div>
                    <button type="button" title={t("Quitar")} onClick={()=>{
                      setSelectedFiles(prev => prev.filter((_, idx) => idx !== i));
                      if (attachFileRef.current) attachFileRef.current.value = "";
                    }}
                      className="shrink-0 rounded-full bg-slate-200 p-1 text-slate-500 hover:bg-slate-300 transition-colors">
                      <X size={11}/>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <textarea ref={taRef} value={text} onChange={handleChange} onKeyDown={handleKey} onPaste={handlePaste}
            onClick={syncSelection}
            onKeyUp={syncSelection}
            onSelect={syncSelection}
            onBlur={() => window.setTimeout(() => setMentionQ(null), 150)}
            placeholder={textoPlaceholder}
            aria-label={textoPlaceholder}
            rows={1}
            className="w-full bg-transparent resize-none px-3 py-2.5 text-slate-700 text-[15px] outline-none placeholder-slate-400 overflow-y-auto leading-relaxed"
            style={{ minHeight:"42px", maxHeight: compacto ? 200 : 240 }}
          />
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-px relative">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e=>chooseImages(Array.from(e.target.files || []))}
            />
            <input
              ref={attachFileRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods,.rtf,.zip"
              className="hidden"
              onChange={e => chooseFiles(Array.from(e.target.files || []))}
            />
            <button type="button" title={t("Adjuntar archivos (PDF, Word, Excel...)")} onClick={()=>attachFileRef.current?.click()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <Plus size={17}/>
            </button>
            <button
              type="button"
              ref={emojiButtonRef}
              onMouseDown={(event)=>event.preventDefault()}
              onClick={() => {
                syncSelection();
                setShowMediaPicker((prev) => !prev);
              }}
              title={t("Emoji y GIF")}
              className={`p-1.5 rounded-lg transition-colors ${showMediaPicker ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}>
              <Smile size={16}/>
            </button>
            <button type="button" onMouseDown={(e)=>e.preventDefault()} onClick={()=>{
                const ta=taRef.current; if(!ta) return;
                const s=ta.selectionStart ?? text.length;
                const pre = s > 0 && !/\s/.test(text[s-1]) ? " @" : "@";
                const nuevo = text.slice(0,s)+pre+text.slice(s);
                aplicar(nuevo, s+pre.length);
                setMentionQ("");
              }} title={t("Mencionar a alguien")}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <AtSign size={16}/>
            </button>
            <button type="button" title={t("Adjuntar imagen")} onClick={()=>fileRef.current?.click()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <ImageIcon size={16}/>
            </button>
            {showMediaPicker&&(
              <EmojiPicker
                anchorRef={emojiButtonRef}
                enableGifs
                onPick={insertEmojiAtCursor}
                onPickGif={(url) => {
                  setShowMediaPicker(false);
                  sendGif(url);
                }}
                onClose={()=>setShowMediaPicker(false)}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {!compacto && canSend && (
              <span className="hidden select-none text-[11px] text-slate-400 lg:block">
                <kbd className="font-sans font-semibold">Mayús</kbd> + <kbd className="font-sans font-semibold">Intro</kbd>{" "}{t("para otra línea")}</span>
            )}
            <button type="button" onClick={()=>void doSend()} disabled={!canSend} title={editingMsg ? t("Guardar (Intro)") : t("Enviar (Intro)")}
              className={`h-8 w-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all duration-150 ${
                canSend
                  ? (editingMsg ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md" : "bg-[#ab0433] hover:bg-[#92042c] text-white shadow-md shadow-red-200 active:scale-95")
                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
              }`}>
              {editingMsg ? <Check size={14}/> : <Send size={14}/>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR ITEMS
// ══════════════════════════════════════════════════════════════════════════════
/** Foto del grupo, o su icono (# / candado) si no tiene o no carga. */
function IconoCanal({ canal, size, className = "" }: { canal: Canal; size: number; className?: string }) {
  const url = mediaUrl(canal.foto_url);
  const [fallo, setFallo] = useState(false);
  useEffect(() => { setFallo(false); }, [url]);
  if (url && !fallo) return <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFallo(true)}/>;
  return canal.tipo === "privado"
    ? <Lock size={size} className={`shrink-0 ${className}`}/>
    : <Hash size={size} className={`shrink-0 ${className}`}/>;
}

function CanalItem({ canal, activo, onClick, unreadCount = 0, borrador = false }: { canal: Canal; activo: boolean; onClick:()=>void; unreadCount?: number; borrador?: boolean }) {
  const hasUnread = unreadCount > 0 && !activo && !canal.silenciado;
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 text-sm ${
        activo ? "border border-red-200 bg-white text-slate-800 shadow-sm ring-1 ring-red-100" :
        hasUnread ? "border border-slate-200 bg-white text-slate-800 shadow-sm" :
        "border border-transparent text-slate-500 hover:bg-white hover:text-slate-800 hover:border-slate-200"
      } ${canal.silenciado && !activo ? "opacity-60" : ""}`}>
      {canal.foto_url
        ? <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100"><IconoCanal canal={canal} size={11} className="text-slate-400"/></span>
        : canal.tipo==="privado"
        ? <Lock size={13} className={`shrink-0 ${activo || hasUnread ? "text-red-500" : "text-slate-400"}`}/>
        : <Hash size={13} className={`shrink-0 ${activo || hasUnread ? "text-red-500" : "text-slate-400"}`}/>
      }
      <span className={`flex-1 truncate ${activo || hasUnread ? "font-semibold" : "font-medium"}`}>{canal.nombre}</span>
      {borrador && !activo && <span title={t("Tienes un borrador sin enviar")} className="shrink-0 text-slate-400"><Pencil size={12}/></span>}
      {canal.silenciado && <span title={t("Silenciado")} className="shrink-0 text-slate-300"><BellOff size={12}/></span>}
      {hasUnread && (
        <span className="shrink-0 bg-[#dc2626] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold">
          {unreadCount>99?"99+":unreadCount}
        </span>
      )}
    </button>
  );
}

// UserDMItem — muestra un usuario del sistema en la sección DMs
function UserDMItem({ user: u, dmCanal, activo, loading, onClick, unreadCount = 0, presenceByUserId, borrador = false }: {
  user: SysUser; dmCanal?: Canal; activo: boolean; loading: boolean; onClick:()=>void; unreadCount?: number;
  presenceByUserId: MapaPresencia; borrador?: boolean;
}) {
  const st = estadoVisible(u.user_id, presenceByUserId);
  const safeUnreadCount = loading ? 0 : unreadCount;
  const hasUnread = safeUnreadCount > 0 && !activo;
  const displayName = u.user_name?.trim() || dmCanal?.dm_target_user_name?.trim() || "Usuario";
  // Si eligió un estado ("En juicio", "⚖️ En sala 3"...), se ve en la lista.
  const displayRole = st.elegido ? st.label : (u.role_label?.trim() || "Colaborador");
  return (
    <button onClick={onClick} disabled={loading}
      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 text-xs group ${
        activo ? "bg-white text-slate-800 border border-slate-200 shadow-sm" :
        hasUnread ? "bg-white text-slate-800 border border-slate-200 shadow-sm" :
        "text-slate-500 hover:bg-white hover:text-slate-800 border border-transparent hover:border-slate-200"
      }`}>
      {activo && <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#dc2626]" />}
      <div className="relative shrink-0">
        <Av url={u.avatar_url} name={displayName} size={6}/>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${activo ? "border-white" : "border-slate-50"} ${st.color}`}/>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${activo || hasUnread ? "font-bold text-slate-800" : "font-medium"}`}>{displayName}</p>
        <p className={`truncate text-[11px] ${activo || hasUnread ? "text-slate-400" : "text-slate-400 group-hover:text-slate-500"}`}>{displayRole}</p>
      </div>
      {loading && <Loader2 size={10} className="animate-spin shrink-0 opacity-60"/>}
      {borrador && !activo && <span title={t("Tienes un borrador sin enviar")} className="shrink-0 text-slate-400"><Pencil size={12}/></span>}
      {dmCanal?.silenciado && <span title={t("Silenciado")} className="shrink-0 text-slate-300"><BellOff size={12}/></span>}
      {hasUnread && (
        <div className="shrink-0 flex items-center gap-1">
          <span className="rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-[#dc2626] text-white">
            {safeUnreadCount>99?"99+":safeUnreadCount}
          </span>
        </div>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CANAL SEARCH RESULT ITEM (en sidebar)
// ══════════════════════════════════════════════════════════════════════════════
function CanalSearchResult({ c, onJoin, onSelect, joining }: {
  c: CanalBuscado; joining: boolean;
  onJoin:()=>void; onSelect:()=>void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 hover:bg-slate-100 rounded-lg transition-colors">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Hash size={13} className="text-slate-500"/>
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={c.ya_unido?onSelect:undefined}>
        <p className="text-slate-700 text-xs font-semibold truncate">#{c.nombre}</p>
        <p className="text-slate-400 text-[10px] truncate">{c.total_miembros}{" "}{t("miembros")}{c.descripcion?` · ${c.descripcion}`:""}</p>
      </div>
      {c.ya_unido
        ?<button onClick={onSelect} className="shrink-0 text-[10px] text-slate-500 hover:text-slate-700 font-semibold px-2 py-0.5 rounded hover:bg-slate-200 transition-colors">{t("Abrir")}</button>
        :<button onClick={onJoin} disabled={joining}
          className="shrink-0 flex items-center gap-0.5 text-[10px] bg-[#ab0433]/90 hover:bg-[#ab0433] text-white font-bold px-2 py-0.5 rounded transition-colors disabled:opacity-50">
          {joining?<Loader2 size={10} className="animate-spin"/>:<Plus size={10}/>}{t("Unirse")}</button>
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HILO (panel derecho, como en Slack)
// ══════════════════════════════════════════════════════════════════════════════
function PanelHilo({ canalTitulo, isDirect, datos, cargando, isMobile, currentUserId, miembros, favoriteIds, pinnedIds,
  editandoMsg, borradorInicial, onBorrador, onClose, onReact, onEdit, onCancelEdit, onDelete, onPin, onFavorite,
  onReintentar, onDescartar, onSend, onSendOptimista, onEditarUltimo, resolveDisplayName, resolveAvatarUrl, getToken }: {
  canalTitulo: string; isDirect: boolean;
  datos: { principal: Mensaje; respuestas: Mensaje[] } | null; cargando: boolean; isMobile: boolean;
  currentUserId: string; miembros: Miembro[]; favoriteIds: Set<string>; pinnedIds: Set<string>;
  editandoMsg: Mensaje | null; borradorInicial: string; onBorrador: (t: string) => void;
  onClose: () => void; onReact: (id: string, e: string) => void; onEdit: (m: Mensaje) => void; onCancelEdit: () => void;
  onDelete: (id: string) => void; onPin: (id: string) => void; onFavorite: (id: string) => void;
  onReintentar: (id: string) => void; onDescartar: (id: string) => void;
  onSend: (text: string, gifUrl?: string, replyId?: string, editId?: string) => Promise<void>;
  onSendOptimista: (items: EnvioNuevo[]) => void; onEditarUltimo: () => void;
  resolveDisplayName: (userId?: string | null, name?: string | null, isSelf?: boolean) => string;
  resolveAvatarUrl: (userId?: string | null, avatarUrl?: string | null, isSelf?: boolean) => string | null;
  getToken: () => Promise<string | null>;
}) {
  const listaRef = useRef<HTMLDivElement>(null);
  const alFondoRef = useRef(true);
  const n = datos?.respuestas.length ?? 0;
  const noop = useCallback(() => {}, []);
  // Al llegar respuestas nuevas, el hilo baja solo (si ya estaba abajo).
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (el && alFondoRef.current) el.scrollTop = el.scrollHeight;
  }, [n, datos?.principal.id]);
  useEffect(() => { alFondoRef.current = true; }, [datos?.principal.id]);
  const principal = datos?.principal;
  return (
    <aside className={`${isMobile ? "fixed inset-0 z-40" : "w-[min(420px,40vw)] min-w-[320px] border-l border-slate-200"} flex min-h-0 shrink-0 flex-col bg-white animate-in fade-in slide-in-from-right-4 duration-200`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
        {isMobile && (
          <button type="button" onClick={onClose} title={t("Volver")} className="-ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ArrowLeft size={18}/></button>
        )}
        <MessageSquareText size={16} className="shrink-0 text-slate-400"/>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">{t("Hilo")}</p>
          <p className="truncate text-[11px] text-slate-400">{isDirect ? t("Con {canalTitulo}", { canalTitulo: canalTitulo }) : `#${canalTitulo}`}</p>
        </div>
        {!isMobile && (
          <button type="button" onClick={onClose} title={t("Cerrar (Esc)")} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><X size={16}/></button>
        )}
      </div>
      <div ref={listaRef} onScroll={(e) => { const el = e.currentTarget; alFondoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
        className="min-h-0 flex-1 overflow-y-auto pb-2 pt-1">
        {principal && (
          <MensajeItem msg={principal} prevMsg={null} currentUserId={currentUserId} isHighlighted={false}
            enHilo onReply={noop} onReact={onReact} onEdit={onEdit} onDelete={onDelete} onPin={onPin} onFavorite={onFavorite}
            isFavorite={favoriteIds.has(principal.id)} isPinned={pinnedIds.has(principal.id)}
            resolveDisplayName={resolveDisplayName} resolveAvatarUrl={resolveAvatarUrl} getToken={getToken}/>
        )}
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="shrink-0 text-xs font-semibold text-slate-500">
            {cargando && !n ? t("Cargando respuestas…") : n ? `${n} ${n === 1 ? "respuesta" : "respuestas"}` : t("Sin respuestas todavía")}
          </span>
          <div className="h-px flex-1 bg-slate-200"/>
        </div>
        {cargando && !n && <div className="flex justify-center py-4"><Spinner size="sm" muted /></div>}
        {datos?.respuestas.map((m, i) => (
          <MensajeItem key={m.id} msg={m} prevMsg={i ? datos.respuestas[i - 1] : null} currentUserId={currentUserId} isHighlighted={false}
            enHilo onReintentar={onReintentar} onDescartar={onDescartar}
            onReply={noop} onReact={onReact} onEdit={onEdit} onDelete={onDelete} onPin={onPin} onFavorite={onFavorite}
            isFavorite={favoriteIds.has(m.id)} isPinned={pinnedIds.has(m.id)}
            resolveDisplayName={resolveDisplayName} resolveAvatarUrl={resolveAvatarUrl} getToken={getToken}/>
        ))}
      </div>
      {principal && !principal.deleted_at && (
        <MessageInput
          key={`hilo-${principal.id}`}
          compacto
          canalId={principal.canal_id}
          canalNombre={canalTitulo}
          isDirect={isDirect}
          replyTo={null}
          editingMsg={editandoMsg}
          miembros={miembros}
          currentUserId={currentUserId}
          resolveDisplayName={resolveDisplayName}
          onTypingChange={noop}
          onSend={onSend}
          onSendOptimista={onSendOptimista}
          onCancelReply={noop}
          onCancelEdit={onCancelEdit}
          borradorInicial={borradorInicial}
          onBorrador={onBorrador}
          onEditarUltimo={onEditarUltimo}
          placeholder={editandoMsg ? t("Editar respuesta...") : t("Responder en el hilo...")}
        />
      )}
    </aside>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SALTAR A (Ctrl+K dentro del chat, como en Slack)
// ══════════════════════════════════════════════════════════════════════════════
interface DestinoSalto {
  key: string; tipo: "canal" | "dm" | "persona";
  titulo: string; detalle: string; noLeidos: number; reciente: number;
  canal?: Canal; persona?: SysUser; avatar?: string | null; estadoColor?: string;
}

function SaltarA({ destinos, onElegir, onClose, onBuscarEnApp }: {
  destinos: DestinoSalto[]; onElegir: (d: DestinoSalto) => void; onClose: () => void; onBuscarEnApp: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [foco, setFoco] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const filtrados = useMemo(() => {
    const t = sinTildes(q.trim());
    const lista = t
      ? destinos.filter((d) => sinTildes(d.titulo).includes(t) || sinTildes(d.detalle).includes(t))
      : destinos;
    return [...lista].sort((a, b) => {
      if (t) {
        const pa = sinTildes(a.titulo).startsWith(t) ? 0 : 1;
        const pb = sinTildes(b.titulo).startsWith(t) ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      if (!!a.noLeidos !== !!b.noLeidos) return a.noLeidos ? -1 : 1;
      return b.reciente - a.reciente;
    }).slice(0, 12);
  }, [destinos, q]);
  useEffect(() => { setFoco(0); }, [q]);
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-idx="${foco}"]`)?.scrollIntoView({ block: "nearest" });
  }, [foco]);
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(f + 1, filtrados.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (foco < filtrados.length) onElegir(filtrados[foco]); else onBuscarEnApp(q);
    } else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-[2px] animate-in fade-in duration-150" onMouseDown={onClose}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-top-2 duration-150" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search size={17} className="shrink-0 text-slate-400"/>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas}
            placeholder={t("Saltar a un canal o a una persona…")} aria-label={t("Saltar a una conversación")}
            className="w-full bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400"/>
          <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Esc</kbd>
        </div>
        <div ref={listaRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {!q.trim() && <p className="px-4 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Recientes")}</p>}
          {filtrados.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">{t("Nadie ni ningún canal se llama así.")}</p>
          )}
          {filtrados.map((d, i) => (
            <button key={d.key} type="button" data-idx={i}
              onMouseEnter={() => setFoco(i)} onClick={() => onElegir(d)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${foco === i ? "bg-slate-100" : ""}`}>
              {d.tipo === "canal" && d.canal
                ? <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100"><IconoCanal canal={d.canal} size={13} className="text-slate-500"/></span>
                : (
                  <span className="relative shrink-0">
                    <Av url={d.avatar ?? null} name={d.titulo} size={7}/>
                    {d.estadoColor && <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${d.estadoColor}`}/>}
                  </span>
                )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${d.noLeidos ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>{d.titulo}</span>
                {d.detalle && <span className="block truncate text-[11px] text-slate-400">{d.detalle}</span>}
              </span>
              {d.noLeidos > 0 && (
                <span className="shrink-0 rounded-full bg-[#dc2626] px-1.5 text-[10px] font-bold leading-[18px] text-white">{d.noLeidos > 99 ? "99+" : d.noLeidos}</span>
              )}
              {foco === i && <CornerDownRight size={13} className="shrink-0 text-slate-400"/>}
            </button>
          ))}
          <button type="button" data-idx={filtrados.length}
            onMouseEnter={() => setFoco(filtrados.length)} onClick={() => onBuscarEnApp(q)}
            className={`mt-1 flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-500 transition-colors ${foco === filtrados.length ? "bg-slate-100" : ""}`}>
            <Sparkles size={15} className="shrink-0 text-slate-400"/>
            <span className="min-w-0 flex-1 truncate">{q.trim() ? <>{t("Buscar «")}{q.trim()}{t("» en toda la aplicación")}</> : t("Buscar en toda la aplicación (expedientes, clientes…)")}</span>
          </button>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
          <span><kbd className="font-sans font-semibold">↑↓</kbd>{" "}{t("moverse")}</span>
          <span><kbd className="font-sans font-semibold">Intro</kbd>{" "}{t("abrir")}</span>
          <span className="ml-auto"><kbd className="font-sans font-semibold">Alt + ↑↓</kbd>{" "}{t("conversación anterior / siguiente")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATAJOS DEL CHAT
// ══════════════════════════════════════════════════════════════════════════════
const ATAJOS_CHAT: { grupo: string; items: [string, string][] }[] = [
  { grupo: "Moverse", items: [
    [`${MOD} + K`, "Saltar a un canal o a una persona"],
    ["Alt + ↑ / ↓", "Conversación anterior / siguiente"],
    ["Alt + Mayús + ↑ / ↓", "Siguiente conversación sin leer"],
    ["Esc", "Cerrar el hilo o el panel abierto"],
  ] },
  { grupo: "Escribir", items: [
    ["Intro", "Enviar"],
    ["Mayús + Intro", "Otra línea (en una lista, sigue la lista)"],
    ["↑ (cuadro vacío)", "Editar tu último mensaje"],
    ["@", "Mencionar a alguien (@canal avisa a todos)"],
    ["Esc", "Cancelar la edición o la cita"],
  ] },
  { grupo: "Formato", items: [
    [`${MOD} + B`, "**Negrita**"],
    [`${MOD} + I`, "_Cursiva_"],
    [t("{mod} + Mayús + X", { mod: MOD }), "~Tachado~"],
    [t("{mod} + Mayús + U", { mod: MOD }), "Enlace (o pega un enlace sobre el texto seleccionado)"],
    [t("{mod} + Mayús + 7 / 8", { mod: MOD }), "Lista numerada / con viñetas"],
    [t("{mod} + Mayús + 9", { mod: MOD }), "> Cita"],
    ["` y ```", "Código y bloque de código"],
  ] },
];

function AyudaAtajosChat({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-[2px] animate-in fade-in duration-150" onMouseDown={onClose}>
      <div className="max-h-[85vh] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <Keyboard size={18} className="text-slate-500"/>
          <h2 className="flex-1 text-base font-bold text-slate-800">{t("Atajos de teclado del chat")}</h2>
          <button type="button" onClick={onClose} title={t("Cerrar")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16}/></button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {ATAJOS_CHAT.map((g) => (
            <section key={g.grupo} className={g.grupo === "Formato" ? "sm:col-span-2" : ""}>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.grupo}</h3>
              <ul className={`grid gap-1.5 ${g.grupo === "Formato" ? "sm:grid-cols-2 sm:gap-x-6" : ""}`}>
                {g.items.map(([tecla, que]) => (
                  <li key={tecla + que} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">{que}</span>
                    <kbd className="shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-500">{tecla}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN CHAT
// ══════════════════════════════════════════════════════════════════════════════
export default function Chat() {
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { totalUnread, unreadByCanal, unreadDMs, unreadLoaded, clearUnread, refreshUnread } = useChatUnread();
  const currentUserId = user?.id || "";
  const isMobile = useIsMobile();
  // Capturado UNA vez al montar: ver la explicación en orgScopedCacheKey más
  // arriba -- no releer getActiveOrganizacionId() en cada efecto, porque
  // cambia de valor antes de que la recarga de página por cambio de
  // organización realmente ocurra.
  const orgIdRef = useRef(getActiveOrganizacionId());
  const cacheKey = useCallback((base: string) => orgScopedCacheKey(base, orgIdRef.current), []);

  // Estado principal
  const [canales, setCanales]             = useState<Canal[]>([]);
  const [canalActivo, setCanalActivo]     = useState<Canal|null>(null);
  const [mensajes, setMensajes]           = useState<Mensaje[]>([]);
  const [miembros, setMiembros]           = useState<Miembro[]>([]);
  const [sysUsers, setSysUsers]           = useState<SysUser[]>([]);
  // true cuando el servidor ya ha devuelto la lista (aunque esté vacía: despacho de una sola persona).
  const [sysUsersCargados, setSysUsersCargados] = useState(false);
  const { organizacion } = useOrganizacion();
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [rightPanel, setRightPanel]       = useState<"members"|"pinned"|"favorites"|"hilo"|null>(null);
  const [sesionExpediente, setSesionExpediente] = useState<SesionExpediente|null>(null);
  const [showExpSearchModal, setShowExpSearchModal] = useState(false);
  const [favoriteIds, setFavoriteIds]     = useState<Set<string>>(new Set());
  // A diferencia de favoriteIds (por usuario), los mensajes fijados son
  // compartidos por todo el canal -- se refresca también en el poll
  // periódico (ver pollCycleRef más abajo) para que si otra persona fija/
  // desfija algo, se refleje aquí sin tener que recargar.
  const [pinnedIds, setPinnedIds]         = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo]             = useState<Mensaje|null>(null);
  const [editingMsg, setEditingMsg]       = useState<Mensaje|null>(null);
  // Hilo abierto en el panel derecho (como en Slack): su mensaje principal y
  // las respuestas. Se edita aparte de la conversación.
  const [hilo, setHilo]                   = useState<{ principal: Mensaje; respuestas: Mensaje[] } | null>(null);
  const [hiloCargando, setHiloCargando]   = useState(false);
  const [editandoHilo, setEditandoHilo]   = useState<Mensaje|null>(null);
  const hiloRef = useRef<{ principal: Mensaje; respuestas: Mensaje[] } | null>(null);
  const hiloIdRef = useRef<string | null>(null);
  useEffect(() => { hiloRef.current = hilo; }, [hilo]);
  const [saltarAbierto, setSaltarAbierto] = useState(false);
  const [ayudaAtajos, setAyudaAtajos]     = useState(false);
  const [menuEspacio, setMenuEspacio]     = useState(false);
  // Borradores por conversación (y por hilo): lo escrito y no enviado se
  // recupera al volver, y la lista lo marca con un lápiz (como en Slack).
  const [borradores, setBorradores]       = useState<Record<string, string>>({});
  const [highlightId, setHighlightId]     = useState<string|null>(null);
  // null = sin aviso manual puesto (el estado se calcula solo a partir de la
  // presencia real). Solo tiene un valor no-null si elegiste a propósito
  // Ocupado/No molestar/En juicio/En reunión.
  const [myStatus, setMyStatus]           = useState<string | null>(null);
  // Cuándo se quita solo el estado elegido (null = no caduca).
  const [myStatusHasta, setMyStatusHasta] = useState<string | null>(null);
  // user_id → ISO timestamp del último latido de esa persona (organización
  // activa). Se usa junto con el status manual para calcular quién está
  // realmente conectado/ausente/desconectado -- ver computeEffectiveStatus.
  const [presenceByUserId, setPresenceByUserId] = useState<MapaPresencia>({});
  const [showStatus, setShowStatus]       = useState(false);
  // El estado personalizado se guarda en el servidor (lo ven todos); se
  // carga en fetchMyStatus.
  const [customStatusLabel, setCustomStatusLabel] = useState("");
  const [customStatusEmoji, setCustomStatusEmoji] = useState("");
  const [customStatusColor, setCustomStatusColor] = useState<(typeof CUSTOM_STATUS_COLORS)[number]["key"]>("emerald");
  const [notificationsPaused, setNotificationsPaused] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(CHAT_NOTIFICATIONS_PAUSED_KEY) === "1" : false)
  );
  const [showCrear, setShowCrear]         = useState(false);
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );
  const [newMsgCount, setNewMsgCount]     = useState(0);
  const [hasMore, setHasMore]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [secOpen, setSecOpen]             = useState<Record<string,boolean>>({ canales:true, dms:true });
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [firstUnreadMarkerId, setFirstUnreadMarkerId] = useState<string | null>(null);
  const [isSwitchingChat, setIsSwitchingChat] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [freshIncomingMessageIds, setFreshIncomingMessageIds] = useState<Set<string>>(new Set());
  const [composerHeight, setComposerHeight] = useState(112);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQ, setMessageSearchQ] = useState("");

  // Búsqueda de canales en sidebar
  const [canalQ, setCanalQ]               = useState("");
  const [canalResults, setCanalResults]   = useState<CanalBuscado[]>([]);
  const [canalSearching, setCanalSearching] = useState(false);
  const [joiningId, setJoiningId]         = useState<string|null>(null);
  const [dmLoadingId, setDmLoadingId]     = useState<string|null>(null);
  const [dmOrder, setDmOrder]             = useState<string[]>([]);

  const listRef          = useRef<HTMLDivElement>(null);
  const listContentRef   = useRef<HTMLDivElement>(null);
  const composerRef      = useRef<HTMLDivElement>(null);
  const statusButtonRef  = useRef<HTMLButtonElement>(null);
  const pollRef          = useRef<ReturnType<typeof setInterval>|null>(null);
  const typingPollRef    = useRef<ReturnType<typeof setInterval>|null>(null);
  const sidebarPollRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const fetchCanalesRef  = useRef<()=>Promise<void>>(async ()=>{});
  // La primera respuesta real del servidor tras montar sustituye la caché local
  // en vez de fusionarla (ver mergeCanales) -- así se autocura cualquier canal
  // fantasma que hubiera quedado grabado en localStorage por el bug de carrera
  // al cambiar de organización (ver orgScopedCacheKey más arriba). A partir de
  // esa primera sincronización sí interesa fusionar, para no perder un canal
  // recién creado en esta misma sesión que aún no le haya dado tiempo a
  // aparecer en la respuesta del servidor.
  const firstCanalesSyncDoneRef = useRef(false);
  const fetchSysUsersRef = useRef<()=>Promise<void>>(async ()=>{});
  const fetchPresenceRef = useRef<()=>Promise<void>>(async ()=>{});
  const presencePollRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const fetchMensajesRef = useRef<(canal: Canal)=>Promise<void>>(async ()=>{});
  const fetchMiembrosRef = useRef<(canalId: string)=>Promise<void>>(async ()=>{});
  const fetchPinnedRef   = useRef<(canalId: string)=>Promise<void>>(async ()=>{});
  const fetchTypingUsersRef = useRef<(canalId: string)=>Promise<void>>(async ()=>{});
  const pollMensajesRef = useRef<()=>Promise<void>>(async ()=>{});
  const lastAt           = useRef<string|null>(null);
  const atBottom         = useRef(true);
  const sidebarFailCountRef = useRef(0);
  const canalesRequestRef = useRef<Promise<void> | null>(null);
  const usersRequestRef = useRef<Promise<void> | null>(null);
  const prevUnreadDMsRef = useRef<Record<string, number>>({});
  const mensajesCountRef = useRef(0);
  const mensajesIdsRef = useRef<Set<string>>(new Set());
  const mensajesRef = useRef<Mensaje[]>([]);
  // Mensajes propios aún sin confirmar (tmpId → datos para enviarlo). Se
  // vuelven a poner tras cada recarga completa de la conversación.
  const enviosRef = useRef(new Map<string, { canalId: string; item: EnvioNuevo; msg: Mensaje }>());
  const colaEnvioRef = useRef<Promise<void>>(Promise.resolve());
  const conProvisionales = useCallback((canalId: string, msgs: Mensaje[]): Mensaje[] => {
    const pend = [...enviosRef.current.values()].filter((e) => e.canalId === canalId && !e.item.hiloId).map((e) => e.msg);
    if (!pend.length) return msgs;
    const pendientes = quitarProvisionalesConfirmados(pend, msgs, currentUserId);
    return pendientes.length ? [...msgs, ...pendientes] : msgs;
  }, [currentUserId]);
  const fetchMensajesInFlightRef = useRef(false);
  const pollMensajesInFlightRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const pollCycleRef = useRef(0);
  // Refs que siempre reflejan el canal activo actual (para stale-closure checks en polls async)
  const canalActivoIdRef = useRef<string | null>(null);
  const canalActivoRef   = useRef<Canal | null>(null);
  // Scroll: restaurar posición tras loadMore (guardamos scrollHeight previo)
  const scrollRestoreRef = useRef<number | null>(null);
  // Scroll al fondo tras la carga inicial de mensajes (o si ya se estaba al
  // fondo) -- se marca aquí y se ejecuta en un useLayoutEffect keyed en
  // `mensajes`, para que corra DESPUÉS de que React haya pintado la lista
  // nueva y no antes (un setTimeout(fn, 0) podía disparar el scroll con el
  // DOM todavía mostrando la conversación anterior, aterrizando en un punto
  // que no era el fondo real de la conversación nueva).
  const pendingScrollToBottomRef = useRef(false);
  // Con el tiempo real conectado (lib/realtime.ts) el servidor avisa en cuanto
  // algo cambia; el sondeo queda solo de respaldo. Sin él, como antes.
  const tiempoReal = useTiempoRealConectado();
  const activePollMs = tiempoReal ? 10_000 : (isPageVisible ? 700 : 1800);
  const sidebarPollMs = tiempoReal ? 20_000 : (isPageVisible ? 1400 : 3200);
  const typingPollMs = tiempoReal ? 8_000 : (isPageVisible ? 1200 : 2600);
  const canalActivoId = canalActivo?.id ?? null;
  const canalActivoDmTargetId = canalActivo?.dm_target_user_id ?? null;

  useEffect(() => {
    try {
      const rawCanales = window.localStorage.getItem(cacheKey(CHAT_CANALES_CACHE_KEY));
      if (rawCanales) {
        const cachedCanales = JSON.parse(rawCanales) as Canal[];
        if (Array.isArray(cachedCanales)) setCanales(cachedCanales);
      }
    } catch {
      // ignorar cache corrupta
    }

    try {
      const rawUsers = window.localStorage.getItem(cacheKey(CHAT_USERS_CACHE_KEY));
      if (rawUsers) {
        const cachedUsers = JSON.parse(rawUsers) as SysUser[];
        if (Array.isArray(cachedUsers)) setSysUsers(cachedUsers);
      }
    } catch {
      // ignorar cache corrupta
    }

    try {
      const rawDmOrder = window.localStorage.getItem(cacheKey(CHAT_DM_ORDER_CACHE_KEY));
      if (rawDmOrder) {
        const cachedDmOrder = JSON.parse(rawDmOrder) as string[];
        if (Array.isArray(cachedDmOrder)) setDmOrder(cachedDmOrder.filter(Boolean));
      }
    } catch {
      // ignorar cache corrupta
    }
  }, []);

  useEffect(() => {
    const handleVisibility = () => setIsPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(cacheKey(CHAT_CANALES_CACHE_KEY), JSON.stringify(canales));
    } catch {
      // ignorar errores de persistencia
    }
  }, [canales]);

  useEffect(() => {
    try {
      window.localStorage.setItem(cacheKey(CHAT_USERS_CACHE_KEY), JSON.stringify(sysUsers));
    } catch {
      // ignorar errores de persistencia
    }
  }, [sysUsers]);

  useEffect(() => {
    try {
      window.localStorage.setItem(cacheKey(CHAT_DM_ORDER_CACHE_KEY), JSON.stringify(dmOrder));
    } catch {
      // ignorar errores de persistencia
    }
  }, [dmOrder]);

  useEffect(() => {
    setMessageSearchOpen(false);
    setMessageSearchQ("");
  }, [canalActivoId]);

  useEffect(() => {
    mensajesCountRef.current = mensajes.length;
    mensajesIdsRef.current = new Set(mensajes.map(m => m.id));
    mensajesRef.current = mensajes;
  }, [mensajes]);

  useEffect(() => {
    const node = composerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const syncHeight = () => setComposerHeight(node.offsetHeight || 112);
    syncHeight();
    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(node);
    return () => observer.disconnect();
  }, [canalActivoId, replyTo, editingMsg]);

  // ── headers helper
  const getAuthToken = useCallback(async () => {
    let token = await getToken();
    if (!token) token = await getToken({ skipCache: true });
    return token;
  }, [getToken]);

  const hdr = useCallback(async () => {
    const t = await getAuthToken();
    return { "Content-Type":"application/json", Authorization:`Bearer ${t}` };
  }, [getAuthToken]);

  const fetchFavorites = useCallback(async (canalId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/favoritos?canal_id=${canalId}`, { headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    setFavoriteIds(new Set((d.data || []).map((item: { mensaje_id: string }) => item.mensaje_id)));
  }, [hdr]);

  const fetchPinned = useCallback(async (canalId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalId}/fijados`, { headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    setPinnedIds(new Set((d.data || []).map((item: { mensaje_id: string }) => item.mensaje_id)));
  }, [hdr]);

  const fetchTypingUsers = useCallback(async (canalId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalId}/typing`, { headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    const nextTyping = (d.data || []).filter((u: TypingUser) => u.user_id !== currentUserId);
    setTypingUsers(prev => {
      if (
        prev.length === nextTyping.length &&
        prev.every((item, index) => {
          const other = nextTyping[index];
          return !!other &&
            item.user_id === other.user_id &&
            item.user_name === other.user_name &&
            item.avatar_url === other.avatar_url;
        })
      ) return prev;
      return nextTyping;
    });
  }, [hdr]);

  // ── Presencia real (conectado/ausente/desconectado) ─────────────────────────
  // El servidor manda la antigüedad ya calculada (age_seconds), no una fecha
  // en bruto -- así el reloj de este navegador solo se usa para medir un
  // desplazamiento LOCAL (fetchedAtMs - age), nunca para restar contra la
  // hora de otro equipo. Si el reloj de este ordenador está descuadrado, el
  // error se cancela solo (se usa el mismo reloj para anclar y para leer).
  const fetchPresence = useCallback(async () => {
    const h = await hdr();
    const res = await fetch(`/api/chat/presence`, { headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    const fetchedAtMs = Date.now();
    const map: MapaPresencia = {};
    for (const row of (d.data || [])) {
      if (row?.user_id && typeof row?.age_seconds === "number") {
        const visto = typeof row.seen_age_seconds === "number" ? row.seen_age_seconds : row.age_seconds;
        map[row.user_id] = {
          activoAt: fetchedAtMs - row.age_seconds * 1000,
          vistoAt: fetchedAtMs - visto * 1000,
          estado: row.estado ?? null,
          texto: row.estado_texto ?? null,
          emoji: row.estado_emoji ?? null,
          color: row.estado_color ?? null,
        };
      }
    }
    setPresenceByUserId(map);
  }, [hdr]);

  // El aviso manual (ocupado, en juicio...) se guarda en el servidor -- se
  // lee aquí al entrar para no perderlo en cada recarga. null = ninguno
  // puesto (estado automático).
  const aplicarMiEstado = useCallback((e: any) => {
    setMyStatus(e?.status ?? null);
    setCustomStatusLabel(e?.texto || "");
    setCustomStatusEmoji(e?.emoji || "");
    setCustomStatusColor((CUSTOM_STATUS_COLORS.some((c) => c.key === e?.color) ? e.color : "emerald") as (typeof CUSTOM_STATUS_COLORS)[number]["key"]);
    setMyStatusHasta(e?.hasta ?? null);
  }, []);
  const fetchMyStatus = useCallback(async () => {
    const h = await hdr();
    const res = await fetch(`/api/chat/me/status`, { headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    let e = d.data || {};
    // Antes el estado personalizado vivía solo en este navegador: si había uno
    // guardado aquí y en el servidor no, se sube una vez para que lo vean todos.
    try {
      const local = (localStorage.getItem(CHAT_CUSTOM_STATUS_KEY) || "").trim();
      if (local && !e.texto) {
        const r2 = await fetch("/api/chat/me/status", { method: "PUT", headers: h, body: JSON.stringify({
          status: e.status ?? null, texto: local,
          emoji: localStorage.getItem(CHAT_CUSTOM_STATUS_EMOJI_KEY) || null,
          color: localStorage.getItem(CHAT_CUSTOM_STATUS_COLOR_KEY) || null,
          hasta: e.hasta ?? null,
        }) });
        const d2 = await safeJson(r2);
        if (r2.ok && d2?.data) e = d2.data;
      }
      [CHAT_CUSTOM_STATUS_KEY, CHAT_CUSTOM_STATUS_EMOJI_KEY, CHAT_CUSTOM_STATUS_COLOR_KEY].forEach((k) => localStorage.removeItem(k));
    } catch { /* sin almacenamiento local: nada que migrar */ }
    aplicarMiEstado(e);
  }, [hdr, aplicarMiEstado]);
  const fetchMyStatusRef = useRef(fetchMyStatus);
  useEffect(() => { fetchMyStatusRef.current = fetchMyStatus; }, [fetchMyStatus]);
  // Al llegar la hora elegida, el estado se quita solo.
  useEffect(() => {
    if (!myStatusHasta) return;
    const ms = new Date(myStatusHasta).getTime() - Date.now() + 1000;
    if (!(ms > 0) || ms > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => { void fetchMyStatusRef.current(); void fetchPresenceRef.current(); }, ms);
    return () => clearTimeout(t);
  }, [myStatusHasta]);

  const updateTypingStatus = useCallback(async (canalId: string, typing: boolean) => {
    const h = await hdr();
    try {
      await fetch(`/api/chat/canales/${canalId}/typing`, {
        method:"POST",
        headers: h,
        body: JSON.stringify({ typing }),
      });
    } catch {
      // ignore typing pulse errors
    }
  }, [hdr]);

  const markFreshIncomingMessages = useCallback((messageIds: string[]) => {
    if (!messageIds.length) return;
    setFreshIncomingMessageIds(prev => {
      const next = new Set(prev);
      messageIds.forEach(id => next.add(id));
      return next;
    });
    window.setTimeout(() => {
      setFreshIncomingMessageIds(prev => {
        const next = new Set(prev);
        messageIds.forEach(id => next.delete(id));
        return next;
      });
    }, 650);
  }, []);

  // ── Fetch canales
  const fetchCanales = useCallback(async () => {
    if (canalesRequestRef.current) { return canalesRequestRef.current; }
    canalesRequestRef.current = (async () => {
      try {
        const h = await hdr();
      const res = await fetch("/api/chat/canales", { headers: h });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(t("canales"));
      const list: Canal[] = d.data||[];
        setCanales(prev => {
          // La primera vez tras montar, el servidor manda: no conservar nada
          // de lo que hubiera en localStorage que él no confirme (limpia
          // cualquier canal fantasma de una organización distinta).
          const merged = firstCanalesSyncDoneRef.current ? mergeCanales(prev, list) : list;
          firstCanalesSyncDoneRef.current = true;
          try {
            window.localStorage.setItem(cacheKey(CHAT_CANALES_CACHE_KEY), JSON.stringify(merged));
          } catch {
            // ignorar errores de persistencia
          }
          return areCanalesEquivalent(prev, merged) ? prev : merged;
        });
        setCanalActivo(prev => {
          if (!prev) return null;
          const nextActive = list.find(c=>c.id===prev.id) || null;
          if (!nextActive) return prev;
          return areCanalDetailsEquivalent(prev, nextActive) ? prev : nextActive;
        });
        sidebarFailCountRef.current = 0;
      } catch {
        sidebarFailCountRef.current += 1;
      } finally {
        canalesRequestRef.current = null;
      }
    })();
    return canalesRequestRef.current;
  }, [hdr]); // canales.length eliminado: setCanales usa prev => ..., no necesita leer estado actual

  // ── Fetch usuarios del sistema (Clerk)
  const fetchSysUsers = useCallback(async () => {
    if (usersRequestRef.current) return usersRequestRef.current;
    usersRequestRef.current = (async () => {
      try {
        const h = await hdr();
        const res = await fetch("/api/chat/usuarios", { headers: h });
        const d = await safeJson(res);
        if (!res.ok) throw new Error(t("usuarios"));
        const list: SysUser[] = d.data||[];
        setSysUsers(prev => {
          if (prev.length === list.length && prev.every((u, i) => {
            const other = list[i];
            return other && u.user_id === other.user_id && u.user_name === other.user_name && u.avatar_url === other.avatar_url;
          })) {
            return prev;
          }
          return list;
        });
        setSysUsersCargados(true);
        try {
          window.localStorage.setItem(cacheKey(CHAT_USERS_CACHE_KEY), JSON.stringify(list));
        } catch {
          // ignorar errores de persistencia
        }
        sidebarFailCountRef.current = 0;
      } catch {
        sidebarFailCountRef.current += 1;
      } finally {
        usersRequestRef.current = null;
      }
    })();
    return usersRequestRef.current;
  }, [hdr]); // sysUsers.length eliminado: setSysUsers usa prev => ..., no necesita leer estado actual

  // ── Buscar canales (sidebar)
  const searchCanales = useCallback(async (q: string) => {
    if (!q.trim()) { setCanalResults([]); return; }
    setCanalSearching(true);
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/buscar?q=${encodeURIComponent(q)}`, { headers: h });
    const d = await safeJson(res);
    if (res.ok) setCanalResults(d.data||[]);
    setCanalSearching(false);
  }, [hdr]);

  useEffect(() => {
    const t = setTimeout(()=>searchCanales(canalQ), 350);
    return ()=>clearTimeout(t);
  }, [canalQ, searchCanales]);

  // ── Fetch mensajes
  const fetchMensajes = useCallback(async (canal: Canal) => {
    if (fetchMensajesInFlightRef.current) return;
    fetchMensajesInFlightRef.current = true;
    const isFirstLoad = mensajesCountRef.current === 0;
    const expectedCanalId = canal.id;
    setLoadingMsgs(isFirstLoad);
    // Solo resetear hasMore en la primera carga; en full-syncs no mover el indicador "sin mensajes anteriores"
    if (isFirstLoad) setHasMore(true);
    lastAt.current = null;
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canal.id}/mensajes`, { headers: h });
      const d = await safeJson(res);
      // Si el canal cambió durante el await, descartar (evita contaminar el canal nuevo con mensajes del anterior)
      if (canalActivoIdRef.current !== expectedCanalId) return;
      if (res.ok) {
        const msgs: Mensaje[] = d.data||[];
        const conPend = conProvisionales(canal.id, msgs);
        setMensajes(prev => (areMensajesEquivalent(prev, conPend) ? prev : conPend));
        // firstUnreadMarkerId solo se fija en la primera carga del canal (no en full-syncs)
        if (isFirstLoad) {
          setFirstUnreadMarkerId(() => {
            if (initialUnreadCount <= 0 || initialUnreadCount > msgs.length) return null;
            return msgs[msgs.length - initialUnreadCount]?.id ?? null;
          });
        }
        // Canal vacío: sin fecha de referencia el sondeo no arrancaba y el primer
        // mensaje de otro no aparecía hasta volver a entrar. "Desde siempre" = todo.
        if (msgs.length) lastAt.current = msgs[msgs.length-1].created_at;
        else if (isFirstLoad) lastAt.current = new Date(0).toISOString();
        if (msgs.length<60) setHasMore(false);
        // Scroll evaluado DESPUÉS del fetch: si el usuario subió mientras cargaba, atBottom es false → no se fuerza
        if (isFirstLoad || atBottom.current) {
          pendingScrollToBottomRef.current = true;
        }
        await fetch(`/api/chat/canales/${canal.id}/leido`, { method:"PUT", headers: h });
        clearUnread(canal.id, canal.dm_target_user_id);
        void refreshUnread();
      }
    } finally {
      fetchMensajesInFlightRef.current = false;
      if (canalActivoIdRef.current === expectedCanalId) setLoadingMsgs(false);
    }
  }, [clearUnread, hdr, initialUnreadCount, refreshUnread]);

  // ── Fetch miembros canal
  const fetchMiembros = useCallback(async (canalId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalId}/miembros`, { headers: h });
    const d = await safeJson(res);
    if (res.ok) setMiembros(d.data||[]);
  }, [hdr]);

  const readReceiptByMessageId = useMemo(() => {
    const next = new Map<string, boolean>();
    const otherMembers = miembros.filter((member) => member.user_id !== currentUserId);
    if (!otherMembers.length) return next;

    for (const message of mensajes) {
      if (message.user_id !== currentUserId) continue;
      const messageAt = new Date(message.created_at).getTime();
      if (Number.isNaN(messageAt)) continue;

      const readByAllOthers = otherMembers.every((member) => {
        if (!member.last_read_at) return false;
        const readAt = new Date(member.last_read_at).getTime();
        return !Number.isNaN(readAt) && readAt >= messageAt;
      });

      next.set(message.id, readByAllOthers);
    }

    return next;
  }, [currentUserId, miembros, mensajes]);

  // ── Poll mensajes
  const pollMensajes = useCallback(async () => {
    if (!canalActivoId || !lastAt.current || fetchMensajesInFlightRef.current || pollMensajesInFlightRef.current) return;
    // Capturar el canal esperado al inicio para detectar cambios durante el await
    const expectedCanalId = canalActivoId;
    pollMensajesInFlightRef.current = true;
    try {
      const h = await hdr();
      const since = encodeURIComponent(lastAt.current);
      const res = await fetch(`/api/chat/canales/${expectedCanalId}/mensajes?since=${since}`, { headers: h });
      const d = await safeJson(res);
      // Si el canal cambió durante el await, descartar resultados (evita BUG-2: contaminación entre canales)
      if (canalActivoIdRef.current !== expectedCanalId) return;
      if (!res.ok || !d.data?.length) return;
      const nuevos: Mensaje[] = d.data;
      // Calcular mensajes realmente nuevos usando el ref (sincrono) — NO dentro del updater
      // porque los updaters de useState se ejecutan de forma asíncrona en React 18 y
      // no se puede leer una variable local seteada dentro del updater inmediatamente después.
      const fresh = nuevos.filter(m => !mensajesIdsRef.current.has(m.id));
      if (fresh.length === 0) return;
      // Capturar atBottom ANTES de setMensajes para no leer un valor potencialmente stale
      const wasAtBottom = atBottom.current;
      // Actualizar el ref de IDs inmediatamente para evitar doble-proceso en polls concurrentes
      fresh.forEach(m => mensajesIdsRef.current.add(m.id));
      setMensajes(prev => {
        const prevIds = new Set(prev.map(m=>m.id));
        const actualFresh = nuevos.filter(m=>!prevIds.has(m.id));
        const incomingFreshIds = notificationsPaused
          ? []
          : actualFresh.filter(m => m.user_id !== currentUserId).map(m => m.id);
        if (incomingFreshIds.length) markFreshIncomingMessages(incomingFreshIds);
        return actualFresh.length ? [...quitarProvisionalesConfirmados(prev, actualFresh, currentUserId), ...actualFresh] : prev;
      });
      const latestMsg = nuevos[nuevos.length-1];
      lastAt.current = latestMsg.created_at;
      setCanales(prev => prev.map(c => c.id === expectedCanalId ? {
        ...c,
        ultimo_mensaje: latestMsg.contenido,
        ultimo_mensaje_autor: latestMsg.user_name,
        ultimo_mensaje_at: latestMsg.created_at,
      } : c));
      if (wasAtBottom) {
        setTimeout(() => scrollToBottom("instant"), 0);
        await fetch(`/api/chat/canales/${expectedCanalId}/leido`, { method:"PUT", headers: h });
        clearUnread(expectedCanalId, canalActivoDmTargetId);
        void refreshUnread();
      } else if (!notificationsPaused) {
        setNewMsgCount(c=>c + fresh.length);
      }
    } finally {
      pollMensajesInFlightRef.current = false;
    }
  }, [canalActivoDmTargetId, canalActivoId, clearUnread, currentUserId, hdr, markFreshIncomingMessages, notificationsPaused, refreshUnread]);

  // ── Ediciones, borrados y reacciones de los demás (09/10/2026: "since" solo
  // trae mensajes nuevos, así que esto no se veía hasta cambiar de conversación).
  const cambiosDesdeRef = useRef<string | null>(null);
  const pollCambios = useCallback(async () => {
    const canalId = canalActivoIdRef.current;
    if (!canalId) return;
    const desde = cambiosDesdeRef.current || new Date(Date.now() - 5 * 60_000).toISOString();
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canalId}/cambios?desde=${encodeURIComponent(desde)}`, { headers: h });
      const d = await safeJson(res);
      if (!res.ok || canalActivoIdRef.current !== canalId || !d?.data) return;
      cambiosDesdeRef.current = d.data.ahora;
      const cambiados: Mensaje[] = d.data.cambiados || [];
      const borrados = new Set<string>(d.data.borrados || []);
      if (!cambiados.length && !borrados.size) return;
      const porId = new Map(cambiados.map((m) => [m.id, m]));
      setMensajes((prev) => {
        let cambio = false;
        const next = prev
          .filter((m) => { if (borrados.has(m.id)) { cambio = true; mensajesIdsRef.current.delete(m.id); return false; } return true; })
          .map((m) => { const c = porId.get(m.id); if (c) { cambio = true; return { ...m, ...c }; } return m; });
        return cambio ? next : prev;
      });
    } catch { /* el sondeo de respaldo lo reintentará */ }
  }, [hdr]);
  const pollCambiosRef = useRef(pollCambios);
  useEffect(() => { pollCambiosRef.current = pollCambios; }, [pollCambios]);

  // ── Avisos en tiempo real del servidor (backend utils/chatRealtime.ts) ──
  useEffect(() => {
    let sidebarTimer: number | null = null;
    const refrescarSidebar = () => {
      if (sidebarTimer) return;
      sidebarTimer = window.setTimeout(() => { sidebarTimer = null; void fetchCanalesRef.current(); }, 250);
    };
    const traerMensajes = (intento = 0) => {
      // Si ya hay una consulta en curso, se repite en un momento (si no, el aviso se perdería).
      if (pollMensajesInFlightRef.current || fetchMensajesInFlightRef.current) {
        if (intento < 6) window.setTimeout(() => traerMensajes(intento + 1), 300);
        return;
      }
      void pollMensajesRef.current();
    };
    const off = suscribirTiempoReal((ev) => {
      if (ev?.type !== "chat") return;
      const activo = canalActivoIdRef.current;
      const esActivo = !!activo && (!ev.canalId || ev.canalId === activo);
      switch (ev.kind) {
        case "mensajes":
          if (esActivo) {
            traerMensajes();
            void pollCambiosRef.current();
            if (hiloIdRef.current) void fetchHiloRef.current(hiloIdRef.current);
          }
          refrescarSidebar();
          break;
        case "typing":
          if (esActivo && activo) void fetchTypingUsersRef.current(activo);
          break;
        case "fijados":
          if (esActivo && activo) void fetchPinnedRef.current(activo);
          break;
        case "miembros":
          if (esActivo && activo) void fetchMiembrosRef.current(activo);
          refrescarSidebar();
          break;
        case "presencia":
          void fetchPresenceRef.current();
          void fetchMyStatusRef.current();
          break;
        default:
          refrescarSidebar();
      }
    });
    return () => { off(); if (sidebarTimer) clearTimeout(sidebarTimer); };
  }, []);

  // ── Scroll helpers
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    if (behavior === "instant") {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
      setNewMsgCount(0);
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      atBottom.current = true;
      setNewMsgCount(0);
    }
  };
  const onScroll = () => {
    const el = listRef.current; if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom.current) setNewMsgCount(0);
    if (el.scrollTop < 100 && hasMore && !loadingMore) loadMore();
  };

  // Al abrir una conversación (o al llegar mensajes nuevos) se manda al fondo
  // con un scrollTop fijo, pero si el contenido sigue creciendo después
  // (imágenes/adjuntos que tardan en cargar y expanden la altura de la
  // lista) ese scrollTop ya no llega al final real. Este observer reengancha
  // el scroll al fondo mientras atBottom siga siendo true, para que abrir
  // una conversación siempre termine mostrando el último mensaje de verdad.
  //
  // OJO: hay que observar listContentRef (el div que envuelve los mensajes),
  // NO listRef (el contenedor con scroll). listRef tiene altura fija por el
  // layout flex del padre -- su propio tamaño nunca cambia aunque su
  // contenido crezca, así que un ResizeObserver sobre él no se disparaba
  // nunca por mensajes/imágenes nuevas (solo por un resize de ventana real).
  // Esto era la causa real de "el chat se abre en un punto random" / "se
  // mueve solo": el scroll-to-bottom inicial se calculaba bien, pero nunca
  // se corregía después según terminaban de cargar avatares/adjuntos.
  useEffect(() => {
    const el = listRef.current;
    const content = listContentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [canalActivoId]);
  const loadMore = useCallback(async () => {
    if (!canalActivo || !mensajes.length || loadingMore || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const first = mensajes[0].id;
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canalActivo.id}/mensajes?before=${first}`, { headers: h });
      const d = await safeJson(res);
      if (res.ok) {
        const older: Mensaje[] = d.data||[];
        if (!older.length) setHasMore(false);
        else {
          // Guardar scrollHeight antes de añadir mensajes; useLayoutEffect lo restaurará tras el commit
          scrollRestoreRef.current = listRef.current?.scrollHeight ?? null;
          setMensajes(prev=>[...older,...prev]);
        }
      }
    } finally {
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [canalActivo, mensajes, loadingMore, hdr]);

  // Sincronizar no_leidos del contexto global → estado local de canales

  // Mantener siempre la versión más reciente de fetchCanales en el ref
  useEffect(() => { fetchCanalesRef.current = fetchCanales; }, [fetchCanales]);
  useEffect(() => { fetchSysUsersRef.current = fetchSysUsers; }, [fetchSysUsers]);
  useEffect(() => { fetchPresenceRef.current = fetchPresence; }, [fetchPresence]);
  useEffect(() => { fetchMensajesRef.current = fetchMensajes; }, [fetchMensajes]);
  useEffect(() => { fetchMiembrosRef.current = fetchMiembros; }, [fetchMiembros]);
  useEffect(() => { fetchPinnedRef.current = fetchPinned; }, [fetchPinned]);
  useEffect(() => { fetchTypingUsersRef.current = fetchTypingUsers; }, [fetchTypingUsers]);
  useEffect(() => { pollMensajesRef.current = pollMensajes; }, [pollMensajes]);
  // Mantener refs del canal activo actualizadas para stale-closure checks en polls async
  useEffect(() => { canalActivoIdRef.current = canalActivoId; }, [canalActivoId]);
  useEffect(() => { canalActivoRef.current   = canalActivo;   }, [canalActivo]);

  // ── Restaurar posición de scroll tras loadMore (antes de pintar, para evitar salto visible)
  useLayoutEffect(() => {
    if (scrollRestoreRef.current === null) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight - scrollRestoreRef.current;
    scrollRestoreRef.current = null;
  }, [mensajes]);

  // ── Scroll al fondo tras carga inicial (ver pendingScrollToBottomRef) --
  // useLayoutEffect corre después de que React haya commiteado el DOM con
  // los mensajes nuevos pero antes de que el navegador pinte, así que
  // scrollHeight ya refleja la conversación de verdad, no la anterior.
  useLayoutEffect(() => {
    if (!pendingScrollToBottomRef.current) return;
    pendingScrollToBottomRef.current = false;
    scrollToBottom("instant");
  }, [mensajes]);

  // ── Effects: carga inicial — usa los refs para no depender de fetchCanales (estable con hdr)
  useEffect(() => {
    if (!authLoaded || !userLoaded || !currentUserId) return;
    void Promise.all([fetchCanalesRef.current(), fetchSysUsersRef.current(), fetchPresenceRef.current(), fetchMyStatus()]);
  }, [authLoaded, userLoaded, currentUserId]); // fetchCanales/fetchSysUsers ya NO son deps — los refs son estables

  // Poll de presencia (conectado/ausente/desconectado): cada 20s mientras la
  // pestaña está visible, más lento en segundo plano -- no hace falta que sea
  // instantáneo, solo que no se quede desactualizado mucho rato.
  useEffect(() => {
    if (!authLoaded || !userLoaded || !currentUserId) return;
    const start = () => {
      if (presencePollRef.current) clearInterval(presencePollRef.current);
      const visible = document.visibilityState === "visible";
      presencePollRef.current = setInterval(() => void fetchPresenceRef.current(), visible ? 20_000 : 45_000);
    };
    start();
    const onVisibility = () => { void fetchPresenceRef.current(); start(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (presencePollRef.current) clearInterval(presencePollRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authLoaded, userLoaded, currentUserId]);
  // El intervalo de polling de canales se monta UNA sola vez y nunca se resetea
  // Los no-leídos se sincronizan desde ChatUnreadContext (App.tsx) — sin poll duplicado aquí
  useEffect(() => {
    if (!canalActivoId) {
      setTypingUsers([]);
      return;
    }
    pollCycleRef.current = 0;
    void fetchMensajesRef.current(canalActivoRef.current!);
    void fetchMiembrosRef.current(canalActivoId);
    void fetchTypingUsersRef.current(canalActivoId);
    if (pollRef.current) clearInterval(pollRef.current);
    if (typingPollRef.current) clearInterval(typingPollRef.current);
    pollRef.current = setInterval(() => {
      pollCycleRef.current += 1;
      void pollMensajesRef.current();
      if (pollCycleRef.current % 4 === 0) {
        void pollCambiosRef.current();
        if (hiloIdRef.current) void fetchHiloRef.current(hiloIdRef.current);
        void fetchMiembrosRef.current(canalActivoId);
        // Fijados es un estado compartido por todo el canal (no por usuario,
        // como favoritos) -- se refresca aquí para que si otra persona fija/
        // desfija un mensaje se vea reflejado sin recargar la página.
        void fetchPinnedRef.current(canalActivoId);
      }
    }, activePollMs);
    typingPollRef.current = setInterval(() => { void fetchTypingUsersRef.current(canalActivoId); }, typingPollMs);
    return ()=>{
      if(pollRef.current) clearInterval(pollRef.current);
      if(typingPollRef.current) clearInterval(typingPollRef.current);
    };
  }, [canalActivoId, activePollMs, typingPollMs]);
  useEffect(() => {
    if (!canalActivoId || !typingPollRef.current) return;
    clearInterval(typingPollRef.current);
    typingPollRef.current = setInterval(() => { void fetchTypingUsersRef.current(canalActivoId); }, typingPollMs);
  }, [canalActivoId, typingPollMs]);
  useEffect(() => {
    if (rightPanel === "members" && canalActivoId) void fetchMiembros(canalActivoId);
  }, [rightPanel, canalActivoId, fetchMiembros]);
  useEffect(() => {
    if (!authLoaded || !userLoaded || !currentUserId) return;
    const handleForegroundRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([
        fetchCanalesRef.current(),
        fetchSysUsersRef.current(),
        refreshUnread(),
        canalActivoId ? fetchTypingUsersRef.current(canalActivoId) : Promise.resolve(),
        canalActivoId ? (lastAt.current ? pollMensajesRef.current() : fetchMensajesRef.current(canalActivoRef.current!)) : Promise.resolve(),
      ]);
    };
    window.addEventListener("focus", handleForegroundRefresh);
    document.addEventListener("visibilitychange", handleForegroundRefresh);
    return () => {
      window.removeEventListener("focus", handleForegroundRefresh);
      document.removeEventListener("visibilitychange", handleForegroundRefresh);
    };
  }, [authLoaded, userLoaded, currentUserId, refreshUnread, canalActivoId]);

  const lastMissingFetchRef = useRef(0);
  useEffect(() => {
    if (!unreadLoaded) return;
    const knownIds = new Set(canales.map(c => c.id));
    const hasMissing = Object.entries(unreadByCanal).some(([id, n]) => n > 0 && !knownIds.has(id));
    if (!hasMissing) return;
    const now = Date.now();
    const elapsed = now - lastMissingFetchRef.current;
    if (elapsed < 2000) return;
    lastMissingFetchRef.current = now;
    void Promise.all([fetchCanalesRef.current(), fetchSysUsersRef.current()]);
  }, [unreadByCanal, canales, unreadLoaded]);

  // Poll periódico de la lista de canales (8 s) — montado UNA sola vez con patrón ref estable.
  // Garantiza que los DMs nuevos aparezcan en la barra lateral aunque hasMissing no se re-dispare.
  useEffect(() => {
    sidebarPollRef.current = setInterval(() => {
      void Promise.all([fetchCanalesRef.current(), refreshUnread()]);
    }, sidebarPollMs);
    return () => { if (sidebarPollRef.current) clearInterval(sidebarPollRef.current); };
  }, [refreshUnread, sidebarPollMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const seleccionar = (c: Canal) => {
    if (canalActivo?.id===c.id) return;
    // Resetear flags de inflight para que el nuevo canal pueda hacer su primer fetch/poll sin esperar al anterior
    fetchMensajesInFlightRef.current = false;
    pollMensajesInFlightRef.current = false;
    cambiosDesdeRef.current = new Date().toISOString();
    scrollRestoreRef.current = null;
    mensajesIdsRef.current = new Set();
    setIsSwitchingChat(true);
    setFreshIncomingMessageIds(new Set());
    atBottom.current = true;
    const unreadAtOpen = getUnreadCountForCanal(c);
    setInitialUnreadCount(unreadAtOpen);
    setFirstUnreadMarkerId(null);
    setShowChannelMenu(false);
    clearUnread(c.id, c.dm_target_user_id);                 // badge desaparece al instante
    setCanales(prev => prev.map(x => x.id===c.id ? {...x, no_leidos:0} : x));
    setCanalActivo(c);
    setMensajes([]); setReplyTo(null); setEditingMsg(null);
    setRightPanel(null); setNewMsgCount(0);
    setSesionExpediente(null);
  };

  useEffect(() => {
    if (!canalActivo) {
      setIsSwitchingChat(false);
      setFavoriteIds(new Set());
      return;
    }
    if (loadingMsgs) return;
    const timeoutId = window.setTimeout(() => setIsSwitchingChat(false), 140);
    return () => window.clearTimeout(timeoutId);
  }, [canalActivoId, loadingMsgs]);

  useEffect(() => {
    if (!canalActivo) {
      setFavoriteIds(new Set());
      setPinnedIds(new Set());
      return;
    }
    void fetchFavorites(canalActivo.id);
    void fetchPinned(canalActivo.id);
  }, [canalActivoId, fetchFavorites, fetchPinned]);

  useEffect(() => {
    if (!canalActivoId) { setSesionExpediente(null); return; }
    hdr().then(h => fetch(`/api/chat/canales/${canalActivoId}/sesion-expediente`, { headers: h }))
      .then(r => r.json())
      .then(d => setSesionExpediente(d?.data ?? null))
      .catch(() => setSesionExpediente(null));
  }, [canalActivoId]);

  const iniciarSesionExpediente = async (expId: string, expRef: string) => {
    if (!canalActivo) return;
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalActivo.id}/sesion-expediente`, {
      method: "POST", headers: h, body: JSON.stringify({ expediente_id: expId, expediente_ref: expRef }),
    });
    const d = await res.json();
    if (res.ok) setSesionExpediente(d.data);
  };

  const cerrarSesionExpediente = async () => {
    if (!canalActivo) return;
    const h = await hdr();
    await fetch(`/api/chat/canales/${canalActivo.id}/sesion-expediente`, { method: "DELETE", headers: h });
    setSesionExpediente(null);
  };

  // ── Un mensaje puede estar en la conversación o en el hilo abierto: estas
  // dos ayudas los tratan igual (reaccionar, editar, borrar, enviar...).
  const actualizarMensajes = useCallback((fn: (m: Mensaje) => Mensaje) => {
    setMensajes((prev) => {
      let cambio = false;
      const next = prev.map((m) => { const r = fn(m); if (r !== m) cambio = true; return r; });
      return cambio ? next : prev;
    });
    setHilo((h) => {
      if (!h) return h;
      const principal = fn(h.principal);
      let cambio = principal !== h.principal;
      const respuestas = h.respuestas.map((m) => { const r = fn(m); if (r !== m) cambio = true; return r; });
      return cambio ? { principal, respuestas } : h;
    });
  }, []);
  const buscarMensaje = useCallback((id: string): Mensaje | undefined => {
    const h = hiloRef.current;
    return mensajesRef.current.find((m) => m.id === id)
      || (h ? (h.principal.id === id ? h.principal : h.respuestas.find((m) => m.id === id)) : undefined);
  }, []);

  // ── Hilos ────────────────────────────────────────────────────────────────
  const fetchHilo = useCallback(async (id: string) => {
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/mensajes/${id}/hilo`, { headers: h });
      const d = await safeJson(res);
      if (hiloIdRef.current !== id) return;
      if (!res.ok || !d?.data?.principal) {
        if (res.status === 404) { aviso.error(t("Ese hilo ya no existe.")); setRightPanel((p) => (p === "hilo" ? null : p)); }
        return;
      }
      const principal: Mensaje = d.data.principal;
      const reales: Mensaje[] = d.data.respuestas || [];
      // Las respuestas mías aún sin confirmar se quedan al final.
      const pend = [...enviosRef.current.values()].filter((e) => e.item.hiloId === id).map((e) => e.msg);
      const pendientes = quitarProvisionalesConfirmados(pend, reales, currentUserId);
      setHilo({ principal, respuestas: pendientes.length ? [...reales, ...pendientes] : reales });
      // El resumen bajo el mensaje de la conversación, al día.
      setMensajes((prev) => prev.map((m) => (m.id === principal.id
        ? { ...m, respuestas: principal.respuestas, ultima_respuesta_at: principal.ultima_respuesta_at, hilo_autores: principal.hilo_autores }
        : m)));
    } catch { /* se reintenta con el siguiente aviso */ } finally {
      if (hiloIdRef.current === id) setHiloCargando(false);
    }
  }, [hdr, currentUserId]);
  const fetchHiloRef = useRef(fetchHilo);
  useEffect(() => { fetchHiloRef.current = fetchHilo; }, [fetchHilo]);

  const abrirHilo = useCallback((m: Mensaje | string) => {
    const id = typeof m === "string" ? m : (m.hilo_id || m.id);
    if (typeof m !== "string" && m.id.startsWith("tmp-")) return;
    hiloIdRef.current = id;
    setEditandoHilo(null);
    setHilo(typeof m !== "string" && !m.hilo_id ? { principal: m, respuestas: [] } : null);
    setHiloCargando(true);
    setRightPanel("hilo");
    void fetchHiloRef.current(id);
  }, []);
  // Al cerrar el panel (o cambiar de conversación) el hilo se olvida.
  useEffect(() => {
    if (rightPanel === "hilo") return;
    hiloIdRef.current = null;
    setHilo(null);
    setEditandoHilo(null);
  }, [rightPanel]);

  // ── Borradores
  const borradoresKey = currentUserId ? cacheKey(`${CHAT_BORRADORES_KEY}.${currentUserId}`) : null;
  useEffect(() => {
    if (!borradoresKey) return;
    try {
      const raw = window.localStorage.getItem(borradoresKey);
      const obj = raw ? JSON.parse(raw) : {};
      setBorradores(obj && typeof obj === "object" ? obj : {});
    } catch { setBorradores({}); }
  }, [borradoresKey]);
  const guardarBorrador = useCallback((clave: string, texto: string) => {
    setBorradores((prev) => {
      const t = texto.trim() ? texto : "";
      if ((prev[clave] || "") === t) return prev;
      const next = { ...prev };
      if (t) next[clave] = t; else delete next[clave];
      try { if (borradoresKey) window.localStorage.setItem(borradoresKey, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      return next;
    });
  }, [borradoresKey]);
  const guardarBorradorCanal = useCallback((t: string) => { if (canalActivoId) guardarBorrador(canalActivoId, t); }, [canalActivoId, guardarBorrador]);
  const hiloActivoId = hilo?.principal.id ?? null;
  const guardarBorradorHilo = useCallback((t: string) => { if (hiloActivoId) guardarBorrador(`hilo:${hiloActivoId}`, t); }, [hiloActivoId, guardarBorrador]);

  /** Flecha arriba con el cuadro vacío: editar mi último mensaje de texto. */
  const ultimoMio = (lista: Mensaje[]) => [...lista].reverse().find((m) => (
    m.user_id === currentUserId && !m.deleted_at && !m._envio && !m.id.startsWith("tmp-") && (m.tipo === "texto" || !m.tipo)
  ));
  const editarUltimo = useCallback(() => {
    const m = ultimoMio(mensajesRef.current);
    if (m) setEditingMsg(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);
  const editarUltimoHilo = useCallback(() => {
    const m = ultimoMio(hiloRef.current?.respuestas || []);
    if (m) setEditandoHilo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const handleSend = async (
    text: string, gifUrl?: string, replyId?: string, editId?: string,
    imageUrl?: string, fileUrl?: string, fileName?: string, fileMime?: string
  ) => {
    if (editId) {
      // Se ve al instante; si el servidor no lo acepta, vuelve a como estaba.
      const antes = buscarMensaje(editId);
      actualizarMensajes((m) => (m.id === editId ? { ...m, contenido: text, editado: true } : m));
      setEditingMsg(null);
      setEditandoHilo(null);
      try {
        const h = await hdr();
        const res = await fetch(`/api/chat/mensajes/${editId}`, {
          method:"PUT", headers: h, body: JSON.stringify({ contenido: text }),
        });
        const d = await safeJson(res);
        if (!res.ok) throw new Error(d?.error || t("No se pudo guardar el cambio"));
        actualizarMensajes((m) => (m.id === editId ? { ...m, contenido: d.data?.contenido ?? text, editado: true } : m));
      } catch (e: any) {
        if (antes) actualizarMensajes((m) => (m.id === editId ? antes : m));
        aviso.error(e?.message || t("No se pudo guardar el cambio"));
      }
      return;
    }
    if (!canalActivo) return;
    const h = await hdr();
    const body: Record<string,any> = { contenido: text || (gifUrl ? "GIF" : imageUrl ? IMAGE_PLACEHOLDER_TEXT : fileUrl ? (fileName || "Archivo") : "") };
    if (gifUrl) body.gif_url = gifUrl;
    if (imageUrl) body.image_url = imageUrl;
    if (fileUrl) { body.file_url = fileUrl; body.file_name = fileName; body.file_mime = fileMime; }
    if (replyId) body.reply_to_id = replyId;
    const res = await fetch(`/api/chat/canales/${canalActivo.id}/mensajes`, {
      method:"POST", headers: h, body: JSON.stringify(body),
    });
    const d = await safeJson(res);
    if (!res.ok) throw new Error(d?.error || t("Error al enviar el mensaje"));
    const newMsg: Mensaje = { ...d.data, reacciones: null, reply_to: replyId ? mensajes.find(m=>m.id===replyId)||null : null };
    setMensajes(prev=>{
      const exists = prev.find(m=>m.id===newMsg.id);
      return exists ? prev.map(m=>m.id===newMsg.id?newMsg:m) : [...prev, newMsg];
    });
    lastAt.current = newMsg.created_at;
    setCanales(prev => prev.map(c => c.id === canalActivo.id ? {
      ...c,
      ultimo_mensaje: newMsg.contenido,
      ultimo_mensaje_autor: newMsg.user_name,
      ultimo_mensaje_at: newMsg.created_at,
    } : c));
    setTimeout(() => scrollToBottom("instant"), 0);
    setReplyTo(null);
    clearUnread(canalActivo.id, canalActivo.dm_target_user_id);
    void refreshUnread();
  };

  // ── Envío optimista (09/10/2026) ──────────────────────────────────────────
  // El mensaje sale en la conversación en cuanto pulsas enviar y el cuadro
  // queda libre para el siguiente; la subida del adjunto y la petición van
  // por detrás, en cola (para que lleguen en orden). Antes había que esperar
  // a la respuesta del servidor con el texto aún en el cuadro. Lo mismo para
  // las respuestas en un hilo (11/11/2026).
  const procesarEnvio = useCallback(async (tmpId: string) => {
    const env = enviosRef.current.get(tmpId);
    if (!env) return;
    const { canalId, item } = env;
    const marcar = (estado: "enviando" | "error") => {
      env.msg = { ...env.msg, _envio: estado };
      actualizarMensajes((m) => (m.id === tmpId ? env.msg : m));
    };
    try {
      const subir = async (ruta: string, campo: string, file: File) => {
        const form = new FormData();
        form.append(campo, file);
        const token = await getAuthToken();
        const res = await fetch(ruta, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: form });
        const d = await safeJson(res);
        if (!res.ok) throw new Error(d?.error || t("No se pudo subir"));
        return d.data;
      };
      const body: Record<string, any> = {
        contenido: item.texto || (item.gifUrl ? "GIF" : item.imagen ? IMAGE_PLACEHOLDER_TEXT : item.archivo ? (item.archivo.name || "Archivo") : ""),
      };
      if (item.gifUrl) body.gif_url = item.gifUrl;
      if (item.replyId) body.reply_to_id = item.replyId;
      if (item.hiloId) body.hilo_id = item.hiloId;
      if (item.imagen) body.image_url = (await subir("/api/chat/uploads/image", "image", item.imagen.file))?.image_url;
      if (item.archivo) {
        const up = await subir("/api/chat/uploads/file", "file", item.archivo);
        body.file_url = up?.file_url; body.file_name = up?.file_name; body.file_mime = up?.file_mime;
      }
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canalId}/mensajes`, { method: "POST", headers: h, body: JSON.stringify(body) });
      const d = await safeJson(res);
      if (!res.ok || !d?.data?.id) throw new Error(d?.error || t("Error al enviar el mensaje"));
      const real: Mensaje = { ...d.data, reacciones: null, reply_to: env.msg.reply_to };
      // Imagen: se espera a que la de verdad esté cargada antes de cambiarla,
      // para que no parpadee.
      const src = mediaUrl(real.image_url);
      if (item.imagen && src) {
        await new Promise<void>((ok) => {
          const img = new Image();
          const t = window.setTimeout(ok, 4000);
          img.onload = img.onerror = () => { clearTimeout(t); ok(); };
          img.src = src;
        });
      }
      enviosRef.current.delete(tmpId);
      if (item.imagen) window.setTimeout(() => URL.revokeObjectURL(item.imagen!.previewUrl), 1000);
      if (item.hiloId) {
        setHilo((hh) => (hh && hh.principal.id === item.hiloId
          ? { ...hh, respuestas: hh.respuestas.some((m) => m.id === real.id) ? hh.respuestas.filter((m) => m.id !== tmpId) : hh.respuestas.map((m) => (m.id === tmpId ? real : m)) }
          : hh));
        return;
      }
      mensajesIdsRef.current.add(real.id);
      if (canalActivoIdRef.current === canalId) {
        setMensajes(prev => prev.some(m => m.id === real.id)
          ? prev.filter(m => m.id !== tmpId)
          : prev.map(m => m.id === tmpId ? real : m));
      }
      setCanales(prev => prev.map(c => c.id === canalId ? {
        ...c, ultimo_mensaje: real.contenido, ultimo_mensaje_autor: real.user_name, ultimo_mensaje_at: real.created_at,
      } : c));
      clearUnread(canalId, canalActivoRef.current?.id === canalId ? canalActivoRef.current?.dm_target_user_id : undefined);
      void refreshUnread();
    } catch {
      marcar("error");
    }
  }, [actualizarMensajes, clearUnread, getAuthToken, hdr, refreshUnread]);

  const enviarOptimista = useCallback((items: EnvioNuevo[], hiloId?: string) => {
    const canal = canalActivoRef.current;
    if (!canal || !items.length) return;
    const yo = user?.fullName || user?.username || "Tú";
    const base = Date.now();
    const nuevos = items.map((it, i) => {
      const item: EnvioNuevo = hiloId ? { ...it, hiloId, replyId: undefined } : it;
      const tmpId = `tmp-${base}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const msg: Mensaje = {
        id: tmpId, canal_id: canal.id, user_id: currentUserId, user_name: yo, avatar_url: user?.imageUrl || null,
        contenido: item.texto || (item.gifUrl ? "GIF" : item.imagen ? IMAGE_PLACEHOLDER_TEXT : item.archivo ? (item.archivo.name || "Archivo") : ""),
        tipo: item.archivo ? "archivo" : item.imagen ? "imagen" : item.gifUrl ? "gif" : "texto",
        gif_url: item.gifUrl || null,
        image_url: item.imagen?.previewUrl || null,
        file_url: null, file_name: item.archivo?.name || null, file_mime: item.archivo?.type || null,
        reply_to_id: item.replyId || null,
        reply_to: item.replyId ? mensajesRef.current.find(m => m.id === item.replyId) || null : null,
        hilo_id: hiloId || null,
        reacciones: null, editado: false, deleted_at: null,
        created_at: new Date(base + i).toISOString(),
        _envio: "enviando",
      };
      enviosRef.current.set(tmpId, { canalId: canal.id, item, msg });
      return msg;
    });
    if (hiloId) {
      const ahora = new Date(base).toISOString();
      setHilo((h) => (h && h.principal.id === hiloId ? { ...h, respuestas: [...h.respuestas, ...nuevos] } : h));
      // El contador del mensaje principal sube al momento.
      actualizarMensajes((m) => {
        if (m.id !== hiloId) return m;
        const autores = m.hilo_autores || [];
        return {
          ...m,
          respuestas: (m.respuestas || 0) + nuevos.length,
          ultima_respuesta_at: ahora,
          hilo_autores: autores.some((a) => a.user_id === currentUserId) ? autores : [{ user_id: currentUserId, user_name: yo, avatar_url: user?.imageUrl || null }, ...autores],
        };
      });
    } else {
      setMensajes(prev => [...prev, ...nuevos]);
      setReplyTo(null);
      setTimeout(() => scrollToBottom("instant"), 0);
    }
    for (const m of nuevos) colaEnvioRef.current = colaEnvioRef.current.then(() => procesarEnvio(m.id));
  }, [actualizarMensajes, currentUserId, procesarEnvio, user]);
  const enviarEnHilo = useCallback((items: EnvioNuevo[]) => {
    const id = hiloIdRef.current;
    if (id) enviarOptimista(items, id);
  }, [enviarOptimista]);

  const reintentarEnvio = useCallback((tmpId: string) => {
    const env = enviosRef.current.get(tmpId);
    if (!env) return;
    env.msg = { ...env.msg, _envio: "enviando" };
    actualizarMensajes((m) => (m.id === tmpId ? env.msg : m));
    colaEnvioRef.current = colaEnvioRef.current.then(() => procesarEnvio(tmpId));
  }, [actualizarMensajes, procesarEnvio]);
  const descartarEnvio = useCallback((tmpId: string) => {
    const env = enviosRef.current.get(tmpId);
    enviosRef.current.delete(tmpId);
    if (env?.item.imagen) URL.revokeObjectURL(env.item.imagen.previewUrl);
    setMensajes(prev => prev.filter(m => m.id !== tmpId));
    setHilo((h) => (h ? { ...h, respuestas: h.respuestas.filter((m) => m.id !== tmpId) } : h));
    if (env?.item.hiloId) {
      const hid = env.item.hiloId;
      actualizarMensajes((m) => (m.id === hid ? { ...m, respuestas: Math.max(0, (m.respuestas || 1) - 1) } : m));
    }
  }, [actualizarMensajes]);

  // useCallback con identidad estable: se pasan como prop a MensajeItem
  // (envuelto en React.memo), y una función recreada en cada render del
  // componente padre (que repinta cada ~700ms por el polling) invalidaría
  // el memo de cada mensaje de la lista aunque nada suyo hubiera cambiado.
  // Optimista: aplica el toggle en pantalla al instante (antes de esperar a
  // hdr()/fetch, que puede tardar si Clerk tiene que renovar el token) y solo
  // lo deshace si la petición de verdad falla. Sin esto, reaccionar/fijar/
  // marcar favorito se sentía "no funciona" cuando en realidad solo iba lento.
  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    const myName = user?.fullName || user?.username || "Tú";
    const toggle = (removed: boolean) => actualizarMensajes((m) => {
      if (m.id!==msgId) return m;
      const reac = m.reacciones||[];
      if (removed) {
        return {...m, reacciones: reac.filter(r=>!(r.emoji===emoji&&r.user_id===currentUserId))};
      }
      if (reac.some(r => r.emoji === emoji && r.user_id === currentUserId)) return m;
      return {...m, reacciones:[...reac,{emoji, user_id:currentUserId, user_name: myName}]};
    });
    const alreadyMine = buscarMensaje(msgId)?.reacciones?.some(r => r.emoji === emoji && r.user_id === currentUserId) ?? false;
    toggle(alreadyMine);
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/mensajes/${msgId}/reacciones`, {
        method:"POST", headers: h, body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error(t("reaccion"));
    } catch {
      toggle(!alreadyMine); // revertir
    }
  }, [actualizarMensajes, buscarMensaje, hdr, currentUserId, user]);

  const handleDelete = useCallback(async (msgId: string) => {
    const ok = await confirmar({ titulo: t("¿Eliminar este mensaje?"), mensaje: t("Se quitará para todos los miembros de la conversación."), confirmar: t("Eliminar"), peligro: true });
    if (!ok) return;
    const h = await hdr();
    const res = await fetch(`/api/chat/mensajes/${msgId}`, { method:"DELETE", headers: h });
    if (!res.ok) { aviso.error(t("No se pudo eliminar el mensaje")); return; }
    actualizarMensajes((m) => (m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m));
    if (hiloIdRef.current) void fetchHiloRef.current(hiloIdRef.current);
  }, [actualizarMensajes, hdr]);

  const handlePin = useCallback(async (msgId: string) => {
    const canal = canalActivoRef.current;
    if (!canal) return;
    let wasPinned = false;
    setPinnedIds(prev => {
      wasPinned = prev.has(msgId);
      const next = new Set(prev);
      if (wasPinned) next.delete(msgId); else next.add(msgId);
      return next;
    });
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canal.id}/fijar/${msgId}`, { method:"POST", headers: h });
      if (!res.ok) throw new Error(t("fijar"));
    } catch {
      setPinnedIds(prev => {
        const next = new Set(prev);
        if (wasPinned) next.add(msgId); else next.delete(msgId);
        return next;
      });
    }
  }, [hdr]);

  const handleFavorite = useCallback(async (msgId: string) => {
    let wasFavorite = false;
    setFavoriteIds(prev => {
      wasFavorite = prev.has(msgId);
      const next = new Set(prev);
      if (wasFavorite) next.delete(msgId); else next.add(msgId);
      return next;
    });
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/mensajes/${msgId}/favorito`, { method:"POST", headers: h });
      if (!res.ok) throw new Error(t("favorito"));
    } catch {
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (wasFavorite) next.add(msgId); else next.delete(msgId);
        return next;
      });
    }
  }, [hdr]);

  // Silenciar (12/11/2026): sin avisos salvo menciones; solo para mí.
  const toggleSilencio = useCallback(async (canal: Canal) => {
    const nuevo = !canal.silenciado;
    const aplicar = (v: boolean) => {
      setCanales((prev) => prev.map((c) => (c.id === canal.id ? { ...c, silenciado: v } : c)));
      setCanalActivo((prev) => (prev && prev.id === canal.id ? { ...prev, silenciado: v } : prev));
    };
    aplicar(nuevo);
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canal.id}/silenciar`, { method: "PUT", headers: h, body: JSON.stringify({ silenciado: nuevo }) });
      if (!res.ok) throw new Error();
      aviso.ok(nuevo ? t("Silenciado: solo te avisará si te mencionan.") : t("Vuelve a avisarte de todo."));
      void refreshUnread();
    } catch {
      aplicar(!nuevo);
      aviso.error(t("No se pudo cambiar el aviso de esta conversación"));
    }
  }, [hdr, refreshUnread]);

  const marcarTodoLeido = useCallback(async () => {
    setMenuEspacio(false);
    try {
      const h = await hdr();
      const res = await fetch("/api/chat/leido", { method: "PUT", headers: h });
      if (!res.ok) throw new Error();
      setCanales((prev) => prev.map((c) => ({ ...c, no_leidos: 0 })));
      await refreshUnread();
      aviso.ok(t("Todo marcado como leído"));
    } catch { aviso.error(t("No se pudo marcar todo como leído")); }
  }, [hdr, refreshUnread]);

  // El sonido de aviso (ChatUnreadContext) no suena por la conversación que
  // estás mirando.
  useEffect(() => {
    (window as any).__vantiaCanalActivo = canalActivoId;
    return () => { (window as any).__vantiaCanalActivo = null; };
  }, [canalActivoId]);

  const handleLeave = async () => {
    if (!canalActivo) return;
    setShowChannelMenu(false);
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalActivo.id}/leave`, { method:"DELETE", headers: h });
    if (res.ok) { setCanales(prev=>prev.filter(c=>c.id!==canalActivo.id)); setCanalActivo(null); }
  };

  const openDM = async (targetUserId: string, targetUserName: string, targetAvatarUrl: string|null) => {
    const h = await hdr();
    const res = await fetch("/api/chat/dm", {
      method:"POST", headers: h,
      body: JSON.stringify({ target_user_id:targetUserId, target_user_name:targetUserName, target_avatar_url:targetAvatarUrl }),
    });
    const d = await safeJson(res);
    if (res.ok) {
      const canal = d.data as Canal;
      // Actualizar lista primero, luego seleccionar
      setCanales(prev => {
        const exists = prev.find(c=>c.id===canal.id);
        if (exists) return prev;
        return [...prev, {...canal, total_miembros:2, archivado:false,
          ultimo_mensaje:null, ultimo_mensaje_autor:null, ultimo_mensaje_at:null}];
      });
      seleccionar({...canal, total_miembros:2, archivado:false,
        ultimo_mensaje:null, ultimo_mensaje_autor:null, ultimo_mensaje_at:null});
      void fetchCanales(); // sync en background
    }
  };

  const handleDM = async (m: Miembro) => openDM(m.user_id, m.user_name, m.avatar_url);

  const handleDMUser = async (u: SysUser) => {
    setDmLoadingId(u.user_id);
    await openDM(u.user_id, u.user_name, u.avatar_url);
    setDmLoadingId(null);
  };


  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CHAT_NOTIFICATIONS_PAUSED_KEY, notificationsPaused ? "1" : "0");
  }, [notificationsPaused]);

  // Guarda el estado completo (aviso + personalizado + caducidad). Se ve al
  // momento aquí y a los demás les llega por el tiempo real.
  const guardarEstado = useCallback(async (e: EstadoPropio & { hasta: string | null }) => {
    aplicarMiEstado(e);
    const h = await hdr();
    try {
      const res = await fetch("/api/chat/me/status", { method:"PUT", headers: h, body: JSON.stringify({
        status: e.status, texto: e.texto || null, emoji: e.emoji || null, color: e.color || null, hasta: e.hasta,
      }) });
      if (!res.ok) throw new Error();
      void fetchPresenceRef.current();
    } catch {
      void fetchMyStatusRef.current(); // vuelve a lo que de verdad quedó guardado
    }
  }, [aplicarMiEstado, hdr]);

  // ── Foto del grupo
  const fotoGrupoInputRef = useRef<HTMLInputElement>(null);
  const [subiendoFotoGrupo, setSubiendoFotoGrupo] = useState(false);
  const [menuFotoGrupo, setMenuFotoGrupo] = useState(false);
  const guardarFotoGrupo = useCallback(async (canalId: string, fotoUrl: string | null) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalId}`, { method:"PUT", headers: h, body: JSON.stringify({ foto_url: fotoUrl }) });
    const d = await safeJson(res);
    if (!res.ok) { aviso(d?.error || t("No se pudo guardar la foto del grupo")); return; }
    setCanales((prev) => prev.map((c) => (c.id === canalId ? { ...c, foto_url: fotoUrl } : c)));
    setCanalActivo((prev) => (prev && prev.id === canalId ? { ...prev, foto_url: fotoUrl } : prev));
  }, [hdr]);
  const subirFotoGrupo = async (canalId: string, file: File) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") { aviso(t("Elige una imagen (JPG, PNG, GIF o WebP).")); return; }
    setSubiendoFotoGrupo(true);
    try {
      const recortada = await recortarFotoCuadrada(file);
      const form = new FormData();
      form.append("image", recortada, "grupo.jpg");
      const token = await getAuthToken();
      const res = await fetch("/api/chat/uploads/image", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: form });
      const d = await safeJson(res);
      if (!res.ok || !d?.data?.image_url) throw new Error(d?.error || t("No se pudo subir la foto"));
      await guardarFotoGrupo(canalId, d.data.image_url);
    } catch (e: any) {
      aviso(e?.message || t("No se pudo subir la foto"));
    } finally {
      setSubiendoFotoGrupo(false);
    }
  };
  useEffect(() => { setMenuFotoGrupo(false); }, [canalActivoId]);

  const handleStatusChange = (s: string | null, hasta: string | null = null) => {
    setShowStatus(false);
    void guardarEstado({ status: s, texto: "", emoji: "", color: "emerald", hasta: s ? hasta : null });
  };

  const handleSaveCustomStatus = useCallback((value: string, emoji: string, colorKey: string, hasta: string | null = null) => {
    void guardarEstado({ status: myStatus, texto: value, emoji, color: colorKey, hasta });
  }, [guardarEstado, myStatus]);

  const handleClearCustomStatus = useCallback(() => {
    void guardarEstado({ status: myStatus, texto: "", emoji: "", color: "emerald", hasta: myStatus ? myStatusHasta : null });
  }, [guardarEstado, myStatus, myStatusHasta]);

  const joinFromSearch = async (c: CanalBuscado) => {
    setJoiningId(c.id);
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${c.id}/join`, { method:"POST", headers: h });
    if (res.ok) {
      // Añadir a la lista local inmediatamente para que aparezca en sidebar
      const newCanal: Canal = {
        id: c.id, nombre: c.nombre, descripcion: c.descripcion,
        tipo: c.tipo as Canal["tipo"], no_leidos: 0,
        total_miembros: c.total_miembros+1, archivado: false,
        ultimo_mensaje: null, ultimo_mensaje_autor: null, ultimo_mensaje_at: null,
      };
      setCanales(prev => prev.find(x=>x.id===c.id) ? prev : [...prev, newCanal]);
      setCanalResults(prev=>prev.map(r=>r.id===c.id?{...r,ya_unido:true}:r));
      // Auto-navegar al canal recién unido
      seleccionar(newCanal);
      setCanalQ(""); setCanalResults([]);
      void fetchCanales(); // sync en background
    }
    setJoiningId(null);
  };

  // ── Enlace directo: /dashboard/chat?canal=<id>[&hilo=<id>] (las
  // notificaciones del chat llevan aquí y antes se abría la lista sin más).
  const enlacePendienteRef = useRef<{ canal: string; hilo: string | null } | null>((() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    const canal = p.get("canal");
    return canal ? { canal, hilo: p.get("hilo") } : null;
  })());
  useEffect(() => {
    const enlace = enlacePendienteRef.current;
    if (!enlace || !canales.length) return;
    const c = canales.find((x) => x.id === enlace.canal);
    if (!c) return;
    enlacePendienteRef.current = null;
    seleccionar(c);
    if (enlace.hilo) abrirHilo(enlace.hilo);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("canal"); url.searchParams.delete("hilo");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch { /* nada */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canales]);

  const goToMsg = (id: string) => {
    setHighlightId(id);
    setTimeout(()=>{
      document.getElementById(`msg-${id}`)?.scrollIntoView({behavior:"smooth",block:"center"});
      setTimeout(()=>setHighlightId(null), 2500);
    }, 100);
  };

  // ── Computados
  const canalesPublicos   = canales.filter(c=>c.tipo==="publico");
  const canalesPrivados   = canales.filter(c=>c.tipo==="privado");
  const canalDMs          = canales.filter(c=>c.tipo==="directo");
  // Yo estoy mirando la pantalla: para mí mismo, siempre "conectado ahora".
  const miEstado = estadoVisible(
    currentUserId,
    currentUserId ? { ...presenceByUserId, [currentUserId]: { activoAt: Date.now(), vistoAt: Date.now(), estado: myStatus, texto: null, emoji: null, color: null } } : presenceByUserId,
    { status: myStatus, texto: customStatusLabel, emoji: customStatusEmoji, color: customStatusColor },
  );
  const displayedStatusLabel = miEstado.label;
  const displayedStatusColorClass = miEstado.color;
  const getUnreadCountForCanal = useCallback((canal?: Canal) => {
    if (!canal) return 0;
    if (!unreadLoaded) return canal.no_leidos ?? 0;
    return unreadByCanal[canal.id] ?? 0;
  }, [unreadByCanal, unreadLoaded]);

  useEffect(() => {
    const dmUserIds = canalDMs
      .map(c => c.dm_target_user_id)
      .filter((id): id is string => !!id);
    setDmOrder(prev => {
      const prevFiltered = prev.filter(id => dmUserIds.includes(id));
      const missing = dmUserIds.filter(id => !prevFiltered.includes(id));
      const next = missing.length ? [...prevFiltered, ...missing] : prevFiltered;
      return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
    });
  }, [canalDMs]);

  useEffect(() => {
    if (!unreadLoaded) return;
    const prevUnread = prevUnreadDMsRef.current;
    const promotedUserIds = Object.entries(unreadDMs)
      .filter(([userId, count]) => count > (prevUnread[userId] ?? 0))
      .map(([userId]) => userId);

    if (promotedUserIds.length) {
      setDmOrder(prev => {
        const next = promotedUserIds.reduceRight(
          (acc, userId) => [userId, ...acc.filter(id => id !== userId)],
          prev,
        );
        return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
      });
    }

    prevUnreadDMsRef.current = unreadDMs;
  }, [unreadDMs, unreadLoaded]);
  // Mapa: user_id → canal DM existente (para mostrar badge de no leídos)
  const dmConversationEntries = useMemo(() => {
    const sysUsersById = new Map(sysUsers.map(u => [u.user_id, u]));
    return sortByDmOrder(canalDMs
      // Un canal "directo" sin la otra persona resuelta (dm_target_user_id vacío)
      // es un dato corrupto -- usar el id del canal como si fuera un id de usuario
      // (como se hacía antes) rompía la exclusión de dmProspectUsers de más abajo
      // y esa persona podía acabar apareciendo dos veces (como conversación real
      // y también como sugerencia para iniciar chat nuevo).
      .filter(c => !!c.dm_target_user_id)
      .map(c => {
        const dmUserId = c.dm_target_user_id!;
        const knownUser = sysUsersById.get(dmUserId);
        return {
        user: {
          user_id: dmUserId,
          user_name: knownUser?.user_name || c.dm_target_user_name || "Sin nombre",
          avatar_url: knownUser?.avatar_url || c.dm_target_avatar_url || null,
          email: knownUser?.email || null,
          role_label: knownUser?.role_label || "Colaborador",
        } as SysUser,
        dmCanal: c,
        unreadCount: getUnreadCountForCanal(c),
      };
      }), dmOrder);
  }, [canalDMs, getUnreadCountForCanal, dmOrder, sysUsers]);

  const dmProspectUsers = useMemo(() => {
    const dmUserIds = new Set(dmConversationEntries.map(({ user }) => user.user_id).filter(Boolean));
    return sysUsers
      .filter(u => u.user_id !== currentUserId && !dmUserIds.has(u.user_id))
      .sort((a,b) => {
        // Usuarios con DM no-leído primero
        const ua = unreadDMs[a.user_id] ?? 0;
        const ub = unreadDMs[b.user_id] ?? 0;
        if (ua !== ub) return ub - ua;
        return a.user_name.localeCompare(b.user_name, "es");
      });
  }, [sysUsers, currentUserId, dmConversationEntries, unreadDMs]);

  const sysUsersById = useMemo(
    () => new Map(sysUsers.map(u => [u.user_id, u])),
    [sysUsers]
  );
  const activeDirectUser = useMemo(() => {
    if (!canalActivo || canalActivo.tipo !== "directo") return null;
    if (canalActivo.dm_target_user_id) {
      const knownUser = sysUsersById.get(canalActivo.dm_target_user_id);
      if (knownUser) return knownUser;
    }
    return sysUsers.find((u) => (
      !!u.user_name?.trim() &&
      !!canalActivo.dm_target_user_name?.trim() &&
      u.user_name.trim().toLowerCase() === canalActivo.dm_target_user_name.trim().toLowerCase()
    )) || null;
  }, [canalActivo, sysUsers, sysUsersById]);
  const activeChatTitle = canalActivo?.tipo === "directo"
    ? activeDirectUser?.user_name?.trim() || canalActivo?.dm_target_user_name?.trim() || canalActivo?.nombre || "Conversación"
    : canalActivo?.nombre || "";
  const activeChatSubtitle = canalActivo?.tipo === "directo"
    ? activeDirectUser?.role_label?.trim() || "Colaborador"
    : canalActivo?.descripcion || null;
  const activeChatAvatarUrl = canalActivo?.tipo === "directo"
    ? activeDirectUser?.avatar_url || canalActivo?.dm_target_avatar_url || null
    : null;
  const activeChatUserId = canalActivo?.tipo === "directo"
    ? (canalActivo?.dm_target_user_id || activeDirectUser?.user_id || null)
    : null;
  const activeChatStatusCfg = canalActivo?.tipo === "directo"
    ? estadoVisible(activeChatUserId, presenceByUserId)
    : null;
  const activeChatStatusLabel = canalActivo?.tipo === "directo"
    ? activeChatStatusCfg!.label
    : `${canalActivo?.total_miembros || 0} miembro${(canalActivo?.total_miembros || 0) === 1 ? "" : "s"}`;
  const resolveDisplayName = useCallback((userId?: string | null, name?: string | null, isSelf = false) => {
    if (isSelf || (userId && userId === currentUserId)) return "T\u00FA";
    const knownUser = userId ? sysUsersById.get(userId) : null;
    return knownUser?.user_name?.trim() || name?.trim() || userId || "Usuario";
  }, [currentUserId, sysUsersById]);
  const resolveAvatarUrl = useCallback((userId?: string | null, avatarUrl?: string | null, isSelf = false) => {
    if (avatarUrl) return avatarUrl;
    if (isSelf || (userId && userId === currentUserId)) return user?.imageUrl || null;
    const knownUser = userId ? sysUsersById.get(userId) : null;
    return knownUser?.avatar_url || null;
  }, [currentUserId, sysUsersById, user?.imageUrl]);
  const typingLabel = useMemo(() => {
    const names = typingUsers
      .map(typingUser => resolveDisplayName(typingUser.user_id, typingUser.user_name, typingUser.user_id === currentUserId));
    return buildTypingLabel(names);
  }, [currentUserId, resolveDisplayName, typingUsers]);

  const filteredMensajes = useMemo(() => {
    const term = messageSearchQ.trim().toLowerCase();
    if (!term) return mensajes;
    return mensajes.filter((m) => (
      m.contenido?.toLowerCase().includes(term) ||
      m.user_name?.toLowerCase().includes(term) ||
      m.reply_to?.contenido?.toLowerCase().includes(term)
    ));
  }, [mensajes, messageSearchQ]);

  const mensajesConSep = useMemo(()=>{
    const r: (Mensaje|{__sep:true;key:string;date:string})[] = [];
    let lastD = "";
    for (const m of filteredMensajes) {
      const d = new Date(m.created_at).toDateString();
      if (d!==lastD) { r.push({__sep:true, key:`s${m.id}`, date:m.created_at}); lastD=d; }
      r.push(m);
    }
    return r;
  }, [filteredMensajes]);

  const firstUnreadMessageId = firstUnreadMarkerId;

  // Nombres para pintar las @menciones enteras, y el mío para resaltarlas.
  const miNombre = user?.fullName?.trim() || sysUsersById.get(currentUserId)?.user_name || "";
  const contextoTexto = useMemo(() => {
    const nombres = new Set<string>();
    for (const u of sysUsers) if (u.user_name?.trim()) nombres.add(u.user_name.trim());
    for (const m of miembros) if (m.user_name?.trim()) nombres.add(m.user_name.trim());
    if (miNombre) nombres.add(miNombre);
    return { nombres: [...nombres], miNombre };
  }, [sysUsers, miembros, miNombre]);

  // Ctrl+K: canales, conversaciones y gente con la que aún no hay conversación.
  const destinosSalto = useMemo<DestinoSalto[]>(() => {
    const t = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
    return [
      ...[...canalesPublicos, ...canalesPrivados].map((c) => ({
        key: c.id, tipo: "canal" as const, titulo: c.nombre,
        detalle: c.descripcion || `${c.total_miembros} miembro${c.total_miembros === 1 ? "" : "s"}`,
        noLeidos: c.silenciado ? 0 : getUnreadCountForCanal(c), reciente: t(c.ultimo_mensaje_at), canal: c,
      })),
      ...dmConversationEntries.map(({ user: u, dmCanal, unreadCount }) => ({
        key: dmCanal.id, tipo: "dm" as const, titulo: u.user_name, detalle: estadoVisible(u.user_id, presenceByUserId).label,
        noLeidos: unreadCount, reciente: t(dmCanal.ultimo_mensaje_at), canal: dmCanal, avatar: u.avatar_url,
        estadoColor: estadoVisible(u.user_id, presenceByUserId).color,
      })),
      ...dmProspectUsers.map((u) => ({
        key: `u-${u.user_id}`, tipo: "persona" as const, titulo: u.user_name, detalle: u.role_label || "Nuevo mensaje directo",
        noLeidos: 0, reciente: 0, persona: u, avatar: u.avatar_url, estadoColor: estadoVisible(u.user_id, presenceByUserId).color,
      })),
    ];
  }, [canalesPublicos, canalesPrivados, dmConversationEntries, dmProspectUsers, getUnreadCountForCanal, presenceByUserId]);

  // Alt+↑/↓: conversación anterior/siguiente en el orden de la lista
  // (con Mayús, solo las que tienen algo sin leer).
  const moverConversacionRef = useRef<(dir: 1 | -1, soloSinLeer: boolean) => void>(() => {});
  moverConversacionRef.current = (dir, soloSinLeer) => {
    const orden = [...canalesPublicos, ...canalesPrivados, ...dmConversationEntries.map((e) => e.dmCanal)];
    if (!orden.length) return;
    const i = canalActivo ? orden.findIndex((c) => c.id === canalActivo.id) : -1;
    for (let paso = 1; paso <= orden.length; paso++) {
      const c = orden[(i + dir * paso + orden.length * 2) % orden.length];
      if (!soloSinLeer || (getUnreadCountForCanal(c) > 0 && !c.silenciado)) { seleccionar(c); return; }
    }
  };
  useEffect(() => {
    // Fase de captura: en el chat, Ctrl+K salta de conversación (como en
    // Slack) en vez de abrir la paleta general de la app.
    const captura = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault(); e.stopImmediatePropagation();
        setSaltarAbierto((v) => !v);
      } else if (mod && !e.altKey && e.key === "/") {
        e.preventDefault(); e.stopImmediatePropagation();
        setAyudaAtajos((v) => !v);
      } else if (e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moverConversacionRef.current(e.key === "ArrowUp" ? -1 : 1, e.shiftKey);
      }
    };
    // Esc (si nadie lo ha usado antes, p. ej. para cancelar una edición): cierra el panel.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[role=dialog], .fixed.inset-0.z-\\[90\\]")) return;
      setRightPanel((p) => (p ? null : p));
    };
    window.addEventListener("keydown", captura, true);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", captura, true); window.removeEventListener("keydown", esc); };
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <ContextoTextoChat.Provider value={contextoTexto}>
    <div className="flex h-full min-h-0 overflow-hidden bg-white animate-in fade-in duration-300">

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside className={`${isMobile && canalActivo ? "hidden" : "flex w-full"} md:flex md:w-72 shrink-0 min-h-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-50`}>

        {/* Workspace header — estilo Slack */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-white">
          <div className="relative min-w-0 flex-1">
          <button type="button" onClick={() => setMenuEspacio((v) => !v)} aria-expanded={menuEspacio}
            className="flex w-full items-center gap-2 min-w-0 hover:bg-slate-100 rounded-xl px-2.5 py-2 transition-all duration-200 group">
            <div className="w-8 h-8 rounded-xl bg-[#dc2626] flex items-center justify-center shrink-0 text-white font-bold text-sm">
              {(organizacion?.nombre || "V").trim().charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1">
                <span className="text-slate-800 font-bold text-sm truncate leading-none">{organizacion?.nombre || t("Despacho")}</span>
                <ChevronDown size={13} className="text-slate-400 group-hover:text-slate-600 shrink-0"/>
              </div>
              {totalUnread > 0 && (
                <p className="text-slate-400 text-[10px] leading-none mt-0.5">{totalUnread}{" "}{t("sin leer")}</p>
              )}
            </div>
          </button>
          {menuEspacio && (
            <>
              <button type="button" aria-label={t("Cerrar")} className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuEspacio(false)}/>
              <div className="absolute left-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                <button type="button" onClick={() => { setMenuEspacio(false); setSaltarAbierto(true); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <Search size={14} className="text-slate-400"/> <span className="flex-1">{t("Saltar a una conversación")}</span>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-400">{MOD} K</kbd>
                </button>
                <button type="button" onClick={() => void marcarTodoLeido()} disabled={totalUnread === 0}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  <CheckCheck size={14} className="text-slate-400"/>{" "}{t("Marcar todo como leído")}</button>
                <button type="button" onClick={() => { setMenuEspacio(false); setNotificationsPaused((v) => !v); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                  {notificationsPaused ? <Bell size={14} className="text-slate-400"/> : <BellOff size={14} className="text-slate-400"/>}
                  {notificationsPaused ? t("Reanudar avisos en pantalla") : t("Pausar avisos en pantalla")}
                </button>
                <button type="button" onClick={() => { setMenuEspacio(false); setAyudaAtajos(true); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <Keyboard size={14} className="text-slate-400"/> <span className="flex-1">{t("Atajos de teclado")}</span>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-400">{MOD} /</kbd>
                </button>
                <div className="my-1 border-t border-slate-100"/>
                <button type="button" onClick={() => { setMenuEspacio(false); window.location.assign("/dashboard/config?section=notificaciones"); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <Settings size={14} className="text-slate-400"/>{" "}{t("Preferencias de avisos")}</button>
              </div>
            </>
          )}
          </div>
          <button title={t("Nuevo mensaje")} onClick={()=>setShowCrear(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 transition-all duration-200 shrink-0 shadow-sm">
            <Pencil size={15}/>
          </button>
        </div>
        {/* Buscador de canales + crear */}
        <div className="px-4 py-4 border-b border-slate-200 shrink-0 bg-slate-50">
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              {canalSearching
                ?<Loader2 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"/>
                :<Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              }
              <input
                value={canalQ}
                onChange={e=>setCanalQ(e.target.value)}
                placeholder={t("Buscar… ({MOD} K)", { MOD: MOD })}
              className="w-full bg-white border border-slate-200 text-slate-700 text-xs pl-8 pr-3 py-2.5 rounded-md outline-none placeholder-slate-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all shadow-sm"
              />
              {canalQ&&<button onClick={()=>{setCanalQ("");setCanalResults([]);}} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={11}/></button>}
            </div>
            <button onClick={()=>setShowCrear(true)} title={t("Crear canal")}
              className="w-9 h-9 flex items-center justify-center bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-md transition-all duration-200 shrink-0 shadow-sm">
              <Plus size={14}/>
            </button>
          </div>
          {/* Resultados de búsqueda */}
          {canalQ.trim()&&(
            <div className="mt-2 space-y-0.5">
              {canalResults.length===0&&!canalSearching&&(
                <p className="text-slate-500 text-xs px-2 py-1.5">{t("Sin resultados")}</p>
              )}
              {canalResults.map(c=>(
                <CanalSearchResult key={c.id} c={c} joining={joiningId===c.id}
                  onJoin={()=>joinFromSearch(c)}
                  onSelect={()=>{
                    // Buscar en lista actual; si no está (raro), refetch y navegar
                    const found = canales.find(x=>x.id===c.id);
                    if (found) { seleccionar(found); }
                    else {
                      fetchCanales().then(()=>
                        setCanales(prev=>{ const f=prev.find(x=>x.id===c.id); if(f) seleccionar(f); return prev; })
                      );
                    }
                    setCanalQ(""); setCanalResults([]);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Lista de canales */}
        {!canalQ.trim()&&(
          <nav className="min-h-0 flex-1 overflow-y-auto py-3 px-3 space-y-5">

            {/* ── Canales ── */}
            <div className="pt-2">
              {(() => {
                const totalUnreadCanales = [...canalesPublicos,...canalesPrivados].reduce((acc,c)=>acc+getUnreadCountForCanal(c),0);
                return (
                  <button onClick={()=>setSecOpen(s=>({...s,canales:!s.canales}))}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-wider transition-colors rounded-md group">
                    <ChevronDown size={13} className={`transition-transform shrink-0 ${secOpen.canales?"":"-rotate-90"}`}/>
                    <Layers size={12} className="shrink-0 text-slate-400 group-hover:text-slate-600"/>
                    <span className="flex-1 text-left">{t("Canales")}</span>
                    {!secOpen.canales && totalUnreadCanales>0 && (
                      <span className="shrink-0 bg-[#ab0433] text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold">
                        {totalUnreadCanales>99?"99+":totalUnreadCanales}
                      </span>
                    )}
                  </button>
                );
              })()}
              {secOpen.canales&&(
                <div className="mt-1 space-y-1">
                  {[...canalesPublicos,...canalesPrivados].map(c=>(
                    <CanalItem
                      key={c.id}
                      canal={c}
                      activo={canalActivo?.id===c.id}
                      unreadCount={getUnreadCountForCanal(c)}
                      borrador={!!borradores[c.id]}
                      onClick={()=>seleccionar(c)}
                    />
                  ))}
                  {canalesPublicos.length+canalesPrivados.length===0&&(
                    <p className="text-slate-600 text-xs px-4 py-1">{t("Sin canales aún")}</p>
                  )}
                  {/* Añadir canales */}
                  <button onClick={()=>setShowCrear(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white hover:border-slate-200 border border-transparent transition-colors text-sm group">
                    <div className="w-5 h-5 rounded bg-slate-200 group-hover:bg-slate-300 flex items-center justify-center shrink-0 transition-colors">
                      <Plus size={11} className="text-slate-500 group-hover:text-slate-700"/>
                    </div>{t("Añadir canales")}</button>
                </div>
              )}
            </div>

            {/* ── Mensajes directos ── */}
            <div className="pt-1">
              {(() => {
                const totalUnreadDMs = dmConversationEntries.reduce((acc, entry) => acc + entry.unreadCount, 0);
                return (
                  <button onClick={()=>setSecOpen(s=>({...s,dms:!s.dms}))}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-wider transition-colors rounded-md group">
                    <ChevronDown size={13} className={`transition-transform shrink-0 ${secOpen.dms?"":"-rotate-90"}`}/>
                    <MessagesSquare size={12} className="shrink-0 text-slate-400 group-hover:text-slate-600"/>
                    <span className="flex-1 text-left">{t("Mensajes directos")}</span>
                    {!secOpen.dms && totalUnreadDMs>0 && (
                      <span className="shrink-0 bg-[#ab0433] text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold">
                        {totalUnreadDMs>99?"99+":totalUnreadDMs}
                      </span>
                    )}
                  </button>
                );
              })()}
              {secOpen.dms&&(
                <div className="mt-1 space-y-1">
                  {dmConversationEntries.length===0 && dmProspectUsers.length===0 && (
                    <p className="text-slate-600 text-xs px-4 py-1">{sysUsersCargados ? t("Aún no hay nadie más en el despacho.") : t("Cargando usuarios…")}</p>
                  )}
                  {dmConversationEntries.map(({ user: u, dmCanal, unreadCount })=>{
                    const isActivo = !!(dmCanal && canalActivo?.id===dmCanal.id);
                    return (
                      <UserDMItem
                        key={dmCanal.id}
                        user={u}
                        dmCanal={dmCanal}
                        activo={isActivo}
                        loading={dmLoadingId===u.user_id}
                        unreadCount={unreadCount}
                        borrador={!!(dmCanal && borradores[dmCanal.id])}
                        onClick={()=>{ if (dmCanal) seleccionar(dmCanal); else handleDMUser(u); }}
                        presenceByUserId={presenceByUserId}
                      />
                    );
                  })}
                  {dmProspectUsers.map(u=>(
                    <UserDMItem
                      key={u.user_id}
                      user={u}
                      activo={false}
                      loading={dmLoadingId===u.user_id}
                      unreadCount={unreadDMs[u.user_id] ?? 0}
                      onClick={()=>handleDMUser(u)}
                      presenceByUserId={presenceByUserId}
                    />
                  ))}
                  {/* Invitar a otros */}
                  <button type="button" onClick={() => window.location.assign("/dashboard/config?section=usuarios")}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent hover:border-slate-200 transition-colors text-sm group">
                    <div className="w-7 h-7 rounded-md bg-slate-200 group-hover:bg-slate-300 flex items-center justify-center shrink-0 transition-colors">
                      <UserPlus size={11} className="text-slate-500 group-hover:text-slate-700"/>
                    </div>{t("Invitar a otros")}</button>
                </div>
              )}
            </div>
          </nav>
        )}

        {/* Footer usuario */}
        <div className="px-3 py-3 border-t border-slate-200 shrink-0 relative bg-white">
          <button ref={statusButtonRef} onClick={()=>setShowStatus(v=>!v)}
            className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-100 transition-all duration-150 active:scale-[0.985] group">
            <div className="relative shrink-0">
              <Av url={user?.imageUrl} name={user?.fullName||"Tú"} size={8}/>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${displayedStatusColorClass}`}/>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-slate-800 text-xs font-semibold truncate">{user?.fullName||t("Tú")}</p>
              <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                <p className="truncate">{displayedStatusLabel}</p>
                {notificationsPaused ? (
                  <BellOff size={11} className="shrink-0" />
                ) : (
                  <Bell size={11} className="shrink-0" />
                )}
              </div>
            </div>
            <Settings size={13} className="text-slate-400 group-hover:text-slate-600 transition-colors shrink-0"/>
          </button>
          {showStatus&&(
            <StatusSelector
              anchorRef={statusButtonRef}
              current={myStatus}
              hasta={myStatusHasta}
              currentLabel={displayedStatusLabel}
              currentColorClass={displayedStatusColorClass}
              customStatusText={customStatusLabel}
              customStatusEmoji={customStatusEmoji}
              customStatusColor={customStatusColor}
              userName={user?.fullName || "Tú"}
              userAvatar={user?.imageUrl}
              notificationsPaused={notificationsPaused}
              onSelect={handleStatusChange}
              onSaveCustomStatus={handleSaveCustomStatus}
              onClearCustomStatus={handleClearCustomStatus}
              onToggleNotifications={() => setNotificationsPaused((prev) => !prev)}
              onProfile={() => {
                setShowStatus(false);
                window.location.assign("/dashboard/config");
              }}
              onPreferences={() => {
                setShowStatus(false);
                window.location.assign("/dashboard/config");
              }}
              onDownloads={() => {
                setShowStatus(false);
                window.location.assign("/dashboard/correo");
              }}
              onClose={()=>setShowStatus(false)}
            />
          )}
        </div>
      </aside>

      {/* ══ MAIN AREA ════════════════════════════════════════════════════════ */}
      <div className={`${isMobile && !canalActivo ? "hidden" : "flex"} flex-1 flex-col min-w-0 overflow-hidden bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(248,250,252,0.96)_100%)]`}>
        {!canalActivo?(
          <div className="flex flex-col items-center justify-center flex-1 gap-5 bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.15),_transparent_30%),linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(241,245,249,0.9))]">
            <div className="w-20 h-20 rounded-[1.7rem] bg-white shadow-lg border border-slate-200 flex items-center justify-center">
              <MessageSquare size={30} className="text-[#ab0433]"/>
            </div>
            <div className="text-center">
              <p className="text-slate-800 font-bold text-xl">{t("Selecciona un chat")}</p>
              <p className="text-slate-500 text-sm mt-1">{t("Cambia de canal, revisa un DM o crea uno nuevo para empezar")}</p>
            </div>
            <button onClick={()=>setShowCrear(true)}
              className="flex items-center gap-2 px-5 py-3 bg-[#ab0433] hover:bg-[#92042c] text-white rounded-2xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-red-200">
              <Plus size={16}/>{" "}{t("Crear canal")}</button>
          </div>
        ):(
          <>
            {/* Canal header */}
            <div className={`flex items-center gap-3 px-3 sm:px-6 py-3.5 border-b border-slate-200 shrink-0 bg-white shadow-sm transition-all duration-200 ${isSwitchingChat ? "translate-y-1 opacity-70" : "translate-y-0 opacity-100"}`}>
              {isMobile && (
                <button onClick={() => setCanalActivo(null)} title={t("Volver a la lista")}
                  className="shrink-0 -ml-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors md:hidden">
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {canalActivo.tipo==="directo" ? (
                  <div className="relative shrink-0">
                    <Av url={activeChatAvatarUrl} name={activeChatTitle} size={9} />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${activeChatStatusCfg?.color || "bg-emerald-500"}`} />
                  </div>
                ) : (
                  <div className="relative shrink-0">
                    <button type="button" disabled={subiendoFotoGrupo}
                      onClick={() => (canalActivo.foto_url ? setMenuFotoGrupo((v) => !v) : fotoGrupoInputRef.current?.click())}
                      title={canalActivo.foto_url ? t("Foto del grupo") : t("Poner foto al grupo")}
                      className="group/foto relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
                      <IconoCanal canal={canalActivo} size={16} className="text-slate-400"/>
                      <span className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity ${subiendoFotoGrupo ? "opacity-100" : "opacity-0 group-hover/foto:opacity-100"}`}>
                        {subiendoFotoGrupo ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14}/>}
                      </span>
                    </button>
                    {menuFotoGrupo && canalActivo.foto_url && (
                      <>
                        <button type="button" aria-label={t("Cerrar")} className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuFotoGrupo(false)}/>
                        <div className="absolute left-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                          <button type="button" onClick={() => { setMenuFotoGrupo(false); fotoGrupoInputRef.current?.click(); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                            <Camera size={14} className="text-slate-400"/>{" "}{t("Cambiar foto")}</button>
                          <button type="button" onClick={() => { setMenuFotoGrupo(false); void guardarFotoGrupo(canalActivo.id, null); }}
                            className="peligro flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                            <Trash2 size={14}/>{" "}{t("Quitar foto")}</button>
                        </div>
                      </>
                    )}
                    <input ref={fotoGrupoInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void subirFotoGrupo(canalActivo.id, file); }}/>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800 text-sm">{activeChatTitle}</p>
                  <div className="flex items-center gap-1.5">
                    {canalActivo.tipo === "directo" && <span className={`h-1.5 w-1.5 rounded-full ${activeChatStatusCfg?.color || "bg-emerald-500"}`} />}
                    <p className="truncate text-[11px] text-slate-400">{canalActivo.tipo==="directo" ? activeChatStatusLabel : activeChatSubtitle}</p>
                  </div>
                </div>
                {canalActivo.tipo!=="directo"&&(
                  <span className="hidden sm:flex items-center gap-0.5 text-slate-400 text-xs bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                    <Users size={10}/> {canalActivo.total_miembros}
                  </span>
                )}
                {canalActivo.tipo!=="directo" && canalActivo.descripcion&&(
                  <>
                    <span className="text-slate-200 hidden md:block">·</span>
                    <span className="text-slate-400 text-xs truncate hidden md:block">{canalActivo.descripcion}</span>
                  </>
                )}
              </div>
              <div className="relative flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => setMessageSearchOpen((prev) => !prev)}
                  title={t("Buscar en la conversación")}
                  className={`p-2 rounded-xl transition-all duration-200 ${messageSearchOpen ? "bg-slate-100 text-slate-700 shadow-sm" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                >
                  <Search size={15}/>
                </button>
                <button onClick={()=>setRightPanel(v=>v==="pinned"?null:"pinned")} title={t("Mensajes fijados")}
                  className={`p-2 rounded-xl transition-all duration-200 ${rightPanel==="pinned"?"bg-red-50 text-red-500 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                  <Pin size={15}/>
                </button>
                <button onClick={()=>setRightPanel(v=>v==="favorites"?null:"favorites")} title={t("Favoritos")}
                  className={`p-2 rounded-xl transition-all duration-200 ${rightPanel==="favorites"?"bg-amber-50 text-amber-500 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-amber-500"}`}>
                  <Star size={15} className={rightPanel==="favorites" ? "fill-amber-300" : ""}/>
                </button>
                <button onClick={()=>setRightPanel(v=>v==="members"?null:"members")} title={t("Miembros")}
                  className={`p-2 rounded-xl transition-all duration-200 ${rightPanel==="members"?"bg-slate-100 text-slate-700 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                  <Users size={15}/>
                </button>
                <button
                  onClick={() => sesionExpediente ? cerrarSesionExpediente() : setShowExpSearchModal(true)}
                  title={sesionExpediente ? t("Desasociar expediente {v}", { v: sesionExpediente.expediente_ref || "" }) : t("Asociar a expediente")}
                  className={`p-2 rounded-xl transition-all duration-200 ${sesionExpediente ? "bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-200" : "text-slate-400 hover:bg-slate-100 hover:text-amber-600"}`}>
                  <Briefcase size={15}/>
                </button>
                <button onClick={()=>setShowChannelMenu(v=>!v)} title={t("Acciones del canal")}
                  className={`p-2 rounded-xl transition-all duration-200 ${showChannelMenu?"bg-slate-100 text-slate-700 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                  <MoreHorizontal size={15}/>
                </button>
                {showChannelMenu && (
                  <ChannelMenu
                    canal={canalActivo}
                    onMembers={()=>setRightPanel("members")}
                    onPinned={()=>setRightPanel("pinned")}
                    onFavorites={()=>setRightPanel("favorites")}
                    onRefresh={()=>{ void Promise.all([fetchCanales(), fetchMiembros(canalActivo.id), lastAt.current ? pollMensajes() : fetchMensajes(canalActivo), refreshUnread()]); }}
                    onLeave={()=>{ void handleLeave(); }}
                    onClose={()=>setShowChannelMenu(false)}
                    onToggleSilencio={()=>{ void toggleSilencio(canalActivo); }}
                    onAtajos={()=>setAyudaAtajos(true)}
                  />
                )}
              </div>
            </div>
            {sesionExpediente && (
              <div className="shrink-0 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2">
                <Briefcase size={13} className="text-amber-600 shrink-0"/>
                <span className="text-xs text-amber-800 font-medium flex-1 min-w-0 truncate">{t("Registrando para")}{" "}<strong>{sesionExpediente.expediente_ref || t("expediente")}</strong>
                  {" · "}<span className="font-normal text-amber-600">{t("desde")}{" "}{new Date(sesionExpediente.iniciado_at).toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" })}</span>
                </span>
                <button onClick={cerrarSesionExpediente}
                  className="shrink-0 text-[11px] font-semibold text-amber-700 hover:text-red-600 bg-white border border-amber-200 hover:border-red-200 px-2 py-0.5 rounded-lg transition-colors">{t("Cerrar registro")}</button>
              </div>
            )}
            {messageSearchOpen && (
              <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 shadow-sm">
                  <Search size={14} className="shrink-0 text-slate-400" />
                  <input
                    value={messageSearchQ}
                    onChange={(e) => setMessageSearchQ(e.target.value)}
                    placeholder={t("Buscar en esta conversación...")}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  {messageSearchQ && (
                    <button
                      onClick={() => setMessageSearchQ("")}
                      className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {messageSearchQ.trim()
                    ? t("{length} resultado{v} en la conversación", { length: filteredMensajes.length, v: filteredMensajes.length === 1 ? "" : "s" })
                    : t("Busca por texto, autor o contenido citado")}
                </p>
              </div>
            )}

            {/* Messages + right panels */}
            <div className={`flex min-h-0 flex-1 overflow-hidden transition-all duration-200 ${isSwitchingChat ? "opacity-70 translate-y-2" : "opacity-100 translate-y-0"}`}>
              {/* Messages list */}
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div ref={listRef} onScroll={onScroll} style={{ scrollbarGutter: "stable" }} className="flex-1 overflow-y-auto pb-1 pr-2 bg-white">
                <div ref={listContentRef}>
                  {loadingMore&&<div className="flex items-center justify-center py-2"><Spinner size="sm" muted /></div>}
                  {!messageSearchQ.trim() && !hasMore && mensajes.length>0&&(
                    <div className="px-6 pb-2 pt-8 text-center">
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-100 bg-slate-50">
                        <Av url={activeChatAvatarUrl} name={activeChatTitle} size={16} />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800">{activeChatTitle}</h3>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                        {canalActivo.tipo === "directo"
                          ? t("Este es el principio del historial de mensajes directos con {activeChatTitle}.", { activeChatTitle: activeChatTitle })
                          : t("Este es el principio del historial del canal #{nombre}.", { nombre: canalActivo.nombre })}
                      </p>
                    </div>
                  )}
                  {loadingMsgs?(
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                      <div className="rounded-2xl bg-white/90 px-5 py-4 shadow-sm border border-slate-200 flex flex-col items-center gap-2">
                        <Spinner size="md" muted label={t("Cargando mensajes…")} />
                      </div>
                    </div>
                  ):filteredMensajes.length===0 && messageSearchQ.trim()?(
                    <div className="flex flex-col items-center justify-center h-full py-16 px-8 gap-3 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
                        <Search size={24} className="text-slate-400" />
                      </div>
                      <p className="text-base font-semibold text-slate-700">{t("Sin resultados en esta conversación")}</p>
                      <p className="max-w-sm text-sm text-slate-500">{t("Prueba con otro nombre, una frase distinta o limpia la búsqueda para volver al historial completo.")}</p>
                    </div>
                  ):mensajes.length===0?(
                    <div className="flex flex-col items-center justify-center h-full py-16 px-8 gap-4 text-center animate-in fade-in zoom-in-95 duration-300">
                      <div className="w-20 h-20 rounded-[1.7rem] bg-white border border-slate-200 shadow-lg flex items-center justify-center text-4xl">💬</div>
                      <p className="font-bold text-slate-800 text-lg">{t("¡Empieza la conversación en")}{" "}<span className="text-[#ab0433]">#{canalActivo.tipo === "directo" ? activeChatTitle : canalActivo.nombre}</span>!
                      </p>
                      {canalActivo.descripcion&&<p className="text-slate-500 text-sm max-w-md">{canalActivo.descripcion}</p>}
                      <p className="text-slate-400 text-xs">{t("Sé el primero en escribir ✨")}</p>
                    </div>
                  ):(
                    mensajesConSep.map((item,idx)=>{
                      if ("__sep" in item) return <DateSep key={item.key} date={item.date}/>;
                      const m = item as Mensaje;
                      const prev = mensajesConSep[idx-1];
                      const prevMsg = prev&&!("__sep" in prev) ? prev as Mensaje : null;
                      return (
                        <React.Fragment key={m.id}>
                          {firstUnreadMessageId === m.id && (
                            <div className="sticky top-0 z-10 px-4 py-2 bg-gradient-to-b from-white/95 via-white/90 to-transparent">
                              <div className="flex items-center gap-3">
                                <div className="h-px flex-1 bg-red-200" />
                                <span className="shrink-0 rounded-full bg-[#ab0433]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#ab0433] border border-[#ab0433]/20">{t("Mensajes nuevos")}</span>
                                <div className="h-px flex-1 bg-red-200" />
                              </div>
                            </div>
                          )}
                          <MensajeItem msg={m} prevMsg={prevMsg}
                            currentUserId={currentUserId} isHighlighted={highlightId===m.id}
                            isFreshIncoming={freshIncomingMessageIds.has(m.id)}
                            showReadReceipt={canalActivo.tipo==="directo"}
                            isReadByRecipient={readReceiptByMessageId.get(m.id) ?? false}
                            onReintentar={reintentarEnvio} onDescartar={descartarEnvio}
                            onReply={setReplyTo} onReact={handleReact} onThread={abrirHilo}
                            onEdit={setEditingMsg} onDelete={handleDelete} onPin={handlePin} onFavorite={handleFavorite}
                            isFavorite={favoriteIds.has(m.id)}
                            isPinned={pinnedIds.has(m.id)}
                            resolveDisplayName={resolveDisplayName}
                            resolveAvatarUrl={resolveAvatarUrl}
                            getToken={getToken}
                          />
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
                </div>

                {newMsgCount>0&&(
                  <button
                    onClick={() => scrollToBottom("smooth")}
                    style={{ bottom: composerHeight + 16 }}
                    className="absolute left-1/2 z-20 -translate-x-1/2 flex items-center gap-2 bg-[#ab0433] hover:bg-[#92042c] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl shadow-red-200 transition-all animate-in fade-in zoom-in-95 duration-200"
                  >
                    <ChevronDown size={13}/>
                    {newMsgCount}{" "}{t("nuevo")}{newMsgCount!==1?"s":""}{" "}{t("mensaje")}{newMsgCount!==1?"s":""}
                  </button>
                )}

                <div ref={composerRef} className="relative shrink-0">
                  <div className="px-5 h-10 flex items-end pointer-events-none">
                    {typingLabel && (
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-bounce [animation-delay:-0.2s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-bounce [animation-delay:-0.1s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-bounce" />
                        </span>
                        <span>{typingLabel}</span>
                      </div>
                    )}
                  </div>

                  <MessageInput
                    key={canalActivo.id}
                    canalId={canalActivo.id}
                    canalNombre={activeChatTitle}
                    isDirect={canalActivo.tipo === "directo"}
                    replyTo={replyTo}
                    editingMsg={editingMsg}
                    miembros={miembros}
                    currentUserId={currentUserId}
                    resolveDisplayName={resolveDisplayName}
                    onTypingChange={updateTypingStatus}
                    onSend={handleSend}
                    onSendOptimista={enviarOptimista}
                    onCancelReply={()=>setReplyTo(null)}
                    onCancelEdit={()=>setEditingMsg(null)}
                    borradorInicial={borradores[canalActivo.id] || ""}
                    onBorrador={guardarBorradorCanal}
                    onEditarUltimo={editarUltimo}
                  />
                </div>
              </div>

              {/* Right panels */}
              {rightPanel==="members"&&(
                <PanelMiembros
                  canal={canalActivo}
                  sysUsers={sysUsers}
                  getToken={getToken}
                  currentUserId={currentUserId}
                  onClose={()=>setRightPanel(null)}
                  onDM={m=>{ handleDM(m); setRightPanel(null); }}
                  onRefresh={fetchCanales}
                  presenceByUserId={presenceByUserId}
                />
              )}
              {rightPanel==="pinned"&&(
                <PanelFijados
                  canalId={canalActivo.id}
                  getToken={getToken}
                  onClose={()=>setRightPanel(null)}
                  onGoTo={goToMsg}
                  onTogglePinned={handlePin}
                  resolveDisplayName={resolveDisplayName}
                />
              )}
              {rightPanel==="hilo"&&(
                <PanelHilo
                  canalTitulo={activeChatTitle}
                  isDirect={canalActivo.tipo === "directo"}
                  datos={hilo}
                  cargando={hiloCargando}
                  isMobile={isMobile}
                  currentUserId={currentUserId}
                  miembros={miembros}
                  favoriteIds={favoriteIds}
                  pinnedIds={pinnedIds}
                  editandoMsg={editandoHilo}
                  borradorInicial={hilo ? (borradores[`hilo:${hilo.principal.id}`] || "") : ""}
                  onBorrador={guardarBorradorHilo}
                  onClose={()=>setRightPanel(null)}
                  onReact={handleReact}
                  onEdit={setEditandoHilo}
                  onCancelEdit={()=>setEditandoHilo(null)}
                  onDelete={handleDelete}
                  onPin={handlePin}
                  onFavorite={handleFavorite}
                  onReintentar={reintentarEnvio}
                  onDescartar={descartarEnvio}
                  onSend={handleSend}
                  onSendOptimista={enviarEnHilo}
                  onEditarUltimo={editarUltimoHilo}
                  resolveDisplayName={resolveDisplayName}
                  resolveAvatarUrl={resolveAvatarUrl}
                  getToken={getToken}
                />
              )}
              {rightPanel==="favorites"&&(
                <PanelFavoritos
                  canalId={canalActivo.id}
                  getToken={getToken}
                  onClose={()=>setRightPanel(null)}
                  onGoTo={goToMsg}
                  onToggleFavorite={handleFavorite}
                  resolveDisplayName={resolveDisplayName}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal crear canal */}
      {showCrear&&(
        <ModalCrearCanal
          sysUsers={sysUsers}
          getToken={getToken}
          onClose={()=>setShowCrear(false)}
          onCreate={async (c)=>{ await fetchCanales(); setShowCrear(false); seleccionar(c); }}
        />
      )}

      {/* Modal asociar expediente */}
      {showExpSearchModal && (
        <ExpedienteSearchModal
          getToken={getToken}
          onSelect={(id, ref) => { void iniciarSesionExpediente(id, ref); setShowExpSearchModal(false); }}
          onClose={() => setShowExpSearchModal(false)}
        />
      )}

      {saltarAbierto && (
        <SaltarA
          destinos={destinosSalto}
          onClose={() => setSaltarAbierto(false)}
          onElegir={(d) => {
            setSaltarAbierto(false);
            if (d.canal) seleccionar(d.canal);
            else if (d.persona) void handleDMUser(d.persona);
          }}
          onBuscarEnApp={(q) => { setSaltarAbierto(false); abrirPaleta(q); }}
        />
      )}
      {ayudaAtajos && <AyudaAtajosChat onClose={() => setAyudaAtajos(false)} />}
    </div>
    </ContextoTextoChat.Provider>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL BUSCAR EXPEDIENTE
// ══════════════════════════════════════════════════════════════════════════════
function ExpedienteSearchModal({ getToken, onSelect, onClose }: {
  getToken: () => Promise<string | null>;
  onSelect: (id: string, ref: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const tok = await getToken();
        const res = await fetch(`/api/expedientes?q=${encodeURIComponent(q)}&limit=20`, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
        });
        const d = await res.json();
        setResults(d?.data?.rows ?? d?.data ?? []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, getToken]);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Briefcase size={16} className="text-amber-500 shrink-0"/>
          <span className="font-bold text-slate-800 flex-1">{t("Asociar a expediente")}</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={15}/></button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0"/>
            <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
              placeholder={t("Buscar por referencia, cliente, descripción...")}
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400"/>
            {loading && <Loader2 size={13} className="animate-spin text-slate-400 shrink-0"/>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto max-h-72 px-2 pb-3">
          {results.length === 0 && q.trim() && !loading && (
            <p className="text-center text-xs text-slate-400 py-6">{t("Sin resultados para \"")}{q}"</p>
          )}
          {results.length === 0 && !q.trim() && (
            <p className="text-center text-xs text-slate-400 py-6">{t("Escribe para buscar un expediente")}</p>
          )}
          {results.map(exp => {
            const ref = exp.ref_propia || exp.ref_expediente || `${exp.anio}/${String(exp.num_exp).padStart(4,"0")}`;
            const titulo = exp.descripcion || exp.cliente_nombre || "Sin descripción";
            return (
              <button key={exp.id} onClick={() => onSelect(exp.id, ref)}
                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-50 transition-colors text-left group">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Briefcase size={14}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{ref}</p>
                  <p className="text-xs text-slate-500 truncate">{titulo}</p>
                  {exp.cliente_nombre && exp.descripcion && (
                    <p className="text-[10px] text-slate-400 truncate">{exp.cliente_nombre}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  exp.estado === "abierto" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-slate-500 bg-slate-100 border-slate-200"
                }`}>{exp.estado}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}