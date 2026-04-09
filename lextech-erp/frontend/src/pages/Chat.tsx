import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import {
  Hash, Lock, Plus, X, Search, Pin, PinOff, Smile, Send,
  Trash2, Edit3, CornerDownRight, Users, Loader2, ChevronDown,
  Check, MessageSquare, Settings, LogOut, UserPlus, Crown,
  Globe, ChevronRight, MoreHorizontal, AtSign, Gavel,
  Image as ImageIcon, Bell, Bold, Italic, Underline, Strikethrough,
  Link2, List, ListOrdered, Code, AlignLeft, Paperclip, Mic,
  Video, Pencil, ChevronUp, Layers, MessagesSquare, Star, Download,
  Share2, ExternalLink, Copy, Minus, RotateCcw,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { createPortal } from "react-dom";
import { useChatUnread } from "../contexts/ChatUnreadContext";
import BackButton from "../components/BackButton";

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
}
interface CanalBuscado {
  id: string; nombre: string; descripcion: string | null;
  tipo: string; total_miembros: number; ya_unido: boolean;
}
interface Mensaje {
  id: string; canal_id: string; user_id: string; user_name: string;
  avatar_url: string | null; contenido: string; tipo: string;
  gif_url: string | null; image_url?: string | null; reply_to_id: string | null;
  reply_to: Mensaje | null;
  reacciones: { emoji: string; user_id: string; user_name: string }[] | null;
  editado: boolean; deleted_at: string | null; created_at: string;
}
interface SysUser {
  user_id: string; user_name: string; avatar_url: string | null;
  email: string | null; role_label: string;
}
interface Miembro {
  user_id: string; user_name: string; avatar_url: string | null;
  role: string; role_label: string; status: string;
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
  disponible:  { label:"Disponible",  color:"bg-green-500"  },
  ocupado:     { label:"Ocupado",     color:"bg-yellow-500" },
  en_juicio:   { label:"En Juicio",   color:"bg-red-600"    },
  en_reunion:  { label:"En Reunión",  color:"bg-blue-500"   },
  ausente:     { label:"Ausente",     color:"bg-slate-400"  },
  no_molestar: { label:"No molestar", color:"bg-red-900"    },
};
const GIPHY_KEY = "dc6zaTOxFJmzC";
const CHAT_CANALES_CACHE_KEY = "chat-canales-cache-v1";
const CHAT_USERS_CACHE_KEY = "chat-users-cache-v1";
const CHAT_DM_ORDER_CACHE_KEY = "chat-dm-order-cache-v1";
const CHAT_EMOJI_RECENTS_KEY = "chat-emoji-recents-v1";
const API_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const MAX_RECENT_EMOJIS = 24;
const IMAGE_PLACEHOLDER_TEXT = "Imagen";
const AVALENTIA_RED = "#ab0433";
const AVALENTIA_RED_DARK = "#92042c";
const EMOJI_SKIN_TONES = ["🏻", "🏼", "🏽", "🏾", "🏿"] as const;

function withSkinToneVariants(emojis: string[]) {
  return emojis.flatMap((emoji) => [emoji, ...EMOJI_SKIN_TONES.map((tone) => `${emoji}${tone}`)]);
}

const EMOJI_GROUPS = [
  { key: "recent", label: "Recientes", icon: "🕘", emojis: [] as string[] },
  { key: "smileys", label: "Caritas y emociones", icon: "😀", emojis: [
    "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","🫠","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🫗","🤭","🫢","🫣","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😶‍🌫️","🙄","😬","🤥","🫨","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","😵‍💫","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","☹️","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖",
    "😺","😸","😹","😻","😼","😽","🙀","😿","😾",
    "💋","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣️","💔","❤️‍🔥","❤️‍🩹","❤️","🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤","🩶","🤍",
    "💯","💢","💥","💫","💦","💨","🕳️","💬","💭","💤"
  ]},
  { key: "people", label: "Personas y cuerpo", icon: "👋", emojis: [
    ...withSkinToneVariants(["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","🫷","🫸","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦵","🦶","👂","🦻","👃","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷","👮","🕵️","💂","🥷","👷","🫅","🤴","👸","👳","👲","🧕","🤵","👰","🤰","🫃","🫄","🤱","👼","🎅","🤶","🦸","🦹","🧙","🧝","🧛","🧟","🧞","🧜","🧚","💆","💇","🚶","🧍","🧎","🏃","💃","🕺","👯","🧖","🧗","🏋️","🤼","🤸","🤾","🏌️","🏄","🚣","🧘"]),
    "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","🫷","🫸","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🫀","🫁","🧠","🦷","🦴","👀","👁️","👅","👄","🫦","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵",
    "🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷",
    "👮","🕵️","💂","🥷","👷","🫅","🤴","👸","👳","👲","🧕","🤵","👰","🤰","🫃","🫄","🤱","👼","🎅","🤶","🧑‍🎄","🦸","🦹","🧙","🧝","🧛","🧟","🧌","🧞","🧜","🧚","🧑‍🦰","🧑‍🦱","🧑‍🦳","🧑‍🦲",
    "🧑‍⚕️","🧑‍🎓","🧑‍🏫","🧑‍⚖️","🧑‍🌾","🧑‍🍳","🧑‍🔧","🧑‍🏭","🧑‍💼","🧑‍🔬","🧑‍🎨","🧑‍🚒","🧑‍✈️","🧑‍🚀","🧑‍💻","🧑‍🎤","🧑‍🎨","🧑‍🦯","🧑‍🦼","🧑‍🦽",
    "💆","💇","🚶","🧍","🧎","🏃","💃","🕺","🕴️","👯","🧖","🧗","🏇","🏋️","🤼","🤸","🤺","⛹️","🤾","🏌️","🏄","🚣","🧘","🛀","🛌","🧑‍🤝‍🧑","👫","👬","👭","💑","💏","👨‍👩‍👦","👨‍👩‍👧","👨‍👩‍👧‍👦","👨‍👦","👩‍👦","👨‍👧","👩‍👧",
    "🗣️","👤","👥","🫂","🐾","👣"
  ]},
  { key: "animals", label: "Animales y naturaleza", icon: "🐶", emojis: [
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪲","🦟","🦗","🪳","🕷️","🦂","🐢","🐍","🦎","🐊","🦕","🦖","🦏","🦛","🦍","🦧","🐘","🦣","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐈","🐈‍⬛","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔",
    "🌵","🎄","🌲","🌳","🌴","🪵","🌱","🌿","☘️","🍀","🎍","🪴","🎋","🍃","🍂","🍁","🪺","🪹","🍄","🌾","💐","🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌟","⭐","🌠","🌌","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨","🌀","🌈","🌂","☂️","☔","⛱️","⚡","❄️","🌊","🌫️","🌁"
  ]},
  { key: "food", label: "Comida y bebida", icon: "🍔", emojis: [
    "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🫒","🥦","🥬","🥒","🌶️","🫑","🥑","🧄","🧅","🥔","🍠","🫚","🫛","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯",
    "🍼","🥛","☕","🫖","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊","🥄","🍴","🍽️","🥣","🥗","🥘","🫕","🧂"
  ]},
  { key: "activities", label: "Actividades", icon: "⚽", emojis: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤼","🤸","🤺","⛹️","🤾","🏌️","🏇","🧘","🏄","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🎻","🪕","🎲","♟️","🎯","🎳","🎮","🕹️","🎰","🧩",
    "🎠","🎡","🎢","🎪","🎭","🎆","🎇","🧨","✨","🎉","🎊","🎈","🎋","🎍","🎎","🎏","🎐","🎑","🎃","🎄","🎆","🎇","🧧","🎀","🎁","🎗️","🎟️","🎫"
  ]},
  { key: "travel", label: "Viajes y lugares", icon: "✈️", emojis: [
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏗️","🛵","🦽","🦼","🛺","🚲","🛴","🛹","🛼","🚏","🛣️","🛤️","⛽","🚨","🚥","🚦","🛑","🚧","⚓","🛟","⛵","🚤","🛥️","🛳️","⛴️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸",
    "🌍","🌎","🌏","🗺️","🧭","🏔️","⛰️","🌋","🗻","🏕️","🏖️","🏜️","🏝️","🏞️","🏟️","🏛️","🏗️","🧱","🪨","🪵","🛖","🏘️","🏚️","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩️","🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","🌌","🌠","🎇","🎆","🌇","🌆","🗾","🌐"
  ]},
  { key: "objects", label: "Objetos", icon: "💡", emojis: [
    "⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","💽","💾","💿","📀","🧮","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🪫","🔌","💡","🔦","🕯️","🪔","🧯","🛢️","💸","💵","💴","💶","💷","🪙","💰","💳","💹","📈","📉","📊",
    "📦","📫","📪","📬","📭","📮","🗳️","✏️","✒️","🖊️","🖋️","📝","📁","📂","🗂️","🗒️","🗓️","📆","📅","🗑️","📇","📋","📌","📍","🗺️","📏","📐","✂️","🗃️","🗄️","🗑️","🔒","🔓","🔏","🔐","🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","🛡️","🪚","🔧","🪛","🔩","⚙️","🗜️","⚖️","🦯","🔗","⛓️","🪝","🧰","🪜","🧲","🪜",
    "🧪","🧫","🧬","🔭","🔬","🩺","🩻","🩹","💊","💉","🩸","🧴","🧷","🧹","🧺","🧻","🪣","🧼","🫧","🪥","🧽","🧯","🛒","🚪","🪞","🪟","🛏️","🛋️","🪑","🚽","🪠","🚿","🛁","🪤","🪒","🧸","🪆","🖼️","🧵","🪡","🧶","🪢","🎀","🎁","🛍️","🎊","🎉","🪅","🪩"
  ]},
  { key: "symbols", label: "Símbolos", icon: "🔣", emojis: [
    "❤️","🩷","🧡","💛","💚","💙","🩵","💜","🖤","🩶","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟",
    "☮️","✝️","☪️","🕉️","☸️","🪯","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🔕",
    "🔇","📢","📣","🔔","🔕","🎵","🎶","⚠️","🚸","⚡","🌀","🔱","⚜️","♻️","✅","🈳","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🛗","🈂️","🛂","🛃","🛄","🛅",
    "🚹","🚺","🚻","🚼","🚾","⚠️","🚧","🔃","🔄","🔙","🔚","🛛","🔜","🔝","🆕","🆙","🆒","🆓","🆗","🆖","🅰️","🅱️","🆎","🆑","🅾️","🆘","✔️","☑️","🔘","🔵","🟤","⚫","⚪","🟣","🔴","🟠","🟡","🟢","🔷","🔹","🔶","🔸","🔺","🔻","💠","🔲","🔳","▪️","▫️","◾","◽","◼️","◻️","⬛","⬜","⬆️","↗️","➡️","↘️","⬇️","↙️","⬅️","↖️","↕️","↔️","↩️","↪️","⤴️","⤵️","🔃","🔄","🔙","🔚","🔛","🔜","🔝","🛐","⚛️","🕉️","✡️","☸️","☯️","✝️","☦️","☪️","☮️","🕎","🔯","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","⛎",
    "#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔠","🔡","🔢","🔣","🔤","🅰️","🆎","🅱️","🆑","🆒","🆓","ℹ️","🆔","Ⓜ️","🆕","🆖","🅾️","🆗","🅿️","🆘","🆙","🆚"
  ]},
  { key: "flags", label: "Banderas", icon: "🏁", emojis: [
    "🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️",
    "🇦🇨","🇦🇩","🇦🇪","🇦🇫","🇦🇬","🇦🇮","🇦🇱","🇦🇲","🇦🇴","🇦🇶","🇦🇷","🇦🇸","🇦🇹","🇦🇺","🇦🇼","🇦🇽","🇦🇿",
    "🇧🇦","🇧🇧","🇧🇩","🇧🇪","🇧🇫","🇧🇬","🇧🇭","🇧🇮","🇧🇯","🇧🇱","🇧🇲","🇧🇳","🇧🇴","🇧🇶","🇧🇷","🇧🇸","🇧🇹","🇧🇻","🇧🇼","🇧🇾","🇧🇿",
    "🇨🇦","🇨🇨","🇨🇩","🇨🇫","🇨🇬","🇨🇭","🇨🇮","🇨🇰","🇨🇱","🇨🇲","🇨🇳","🇨🇴","🇨🇵","🇨🇷","🇨🇺","🇨🇻","🇨🇼","🇨🇽","🇨🇾","🇨🇿",
    "🇩🇪","🇩🇬","🇩🇯","🇩🇰","🇩🇲","🇩🇴","🇩🇿",
    "🇪🇦","🇪🇨","🇪🇪","🇪🇬","🇪🇭","🇪🇷","🇪🇸","🇪🇹","🇪🇺",
    "🇫🇮","🇫🇯","🇫🇰","🇫🇲","🇫🇴","🇫🇷",
    "🇬🇦","🇬🇧","🇬🇩","🇬🇪","🇬🇫","🇬🇬","🇬🇭","🇬🇮","🇬🇱","🇬🇲","🇬🇳","🇬🇵","🇬🇶","🇬🇷","🇬🇸","🇬🇹","🇬🇺","🇬🇼","🇬🇾",
    "🇭🇰","🇭🇲","🇭🇳","🇭🇷","🇭🇹","🇭🇺",
    "🇮🇨","🇮🇩","🇮🇪","🇮🇱","🇮🇲","🇮🇳","🇮🇴","🇮🇶","🇮🇷","🇮🇸","🇮🇹",
    "🇯🇪","🇯🇲","🇯🇴","🇯🇵",
    "🇰🇪","🇰🇬","🇰🇭","🇰🇮","🇰🇲","🇰🇳","🇰🇵","🇰🇷","🇰🇼","🇰🇾","🇰🇿",
    "🇱🇦","🇱🇧","🇱🇨","🇱🇮","🇱🇰","🇱🇷","🇱🇸","🇱🇹","🇱🇺","🇱🇻","🇱🇾",
    "🇲🇦","🇲🇨","🇲🇩","🇲🇪","🇲🇫","🇲🇬","🇲🇭","🇲🇰","🇲🇱","🇲🇲","🇲🇳","🇲🇴","🇲🇵","🇲🇶","🇲🇷","🇲🇸","🇲🇹","🇲🇺","🇲🇻","🇲🇼","🇲🇽","🇲🇾","🇲🇿",
    "🇳🇦","🇳🇨","🇳🇪","🇳🇫","🇳🇬","🇳🇮","🇳🇱","🇳🇴","🇳🇵","🇳🇷","🇳🇺","🇳🇿",
    "🇴🇲","🇵🇦","🇵🇪","🇵🇫","🇵🇬","🇵🇭","🇵🇰","🇵🇱","🇵🇲","🇵🇳","🇵🇷","🇵🇸","🇵🇹","🇵🇼","🇵🇾",
    "🇶🇦","🇷🇪","🇷🇴","🇷🇸","🇷🇺","🇷🇼",
    "🇸🇦","🇸🇧","🇸🇨","🇸🇩","🇸🇪","🇸🇬","🇸🇭","🇸🇮","🇸🇯","🇸🇰","🇸🇱","🇸🇲","🇸🇳","🇸🇴","🇸🇷","🇸🇸","🇸🇹","🇸🇻","🇸🇽","🇸🇾","🇸🇿",
    "🇹🇦","🇹🇨","🇹🇩","🇹🇫","🇹🇬","🇹🇭","🇹🇯","🇹🇰","🇹🇱","🇹🇲","🇹🇳","🇹🇴","🇹🇷","🇹🇹","🇹🇻","🇹🇼","🇹🇿",
    "🇺🇦","🇺🇬","🇺🇲","🇺🇳","🇺🇸","🇺🇾","🇺🇿",
    "🇻🇦","🇻🇨","🇻🇪","🇻🇬","🇻🇮","🇻🇳","🇻🇺",
    "🇼🇫","🇼🇸","🇽🇰","🇾🇪","🇾🇹","🇿🇦","🇿🇲","🇿🇼",
    "🏴󠁧󠁢󠁥󠁮󠁧󠁿","🏴󠁧󠁢󠁳󠁣󠁴󠁿","🏴󠁧󠁢󠁷󠁬󠁳󠁿"
  ]},
];
const EMOJI_FONT_STACK = "\"Noto Color Emoji\", \"Segoe UI Emoji\", \"Apple Color Emoji\", sans-serif";
const EMOJI_SEARCH_TAGS: Record<string, string[]> = {
  "😀":["cara","feliz","sonrisa","smile","happy"],
  "😃":["cara","feliz","sonrisa"],
  "😄":["cara","feliz","sonrisa"],
  "😁":["cara","feliz","risa"],
  "😅":["cara","nervios","sudor","alivio"],
  "😂":["cara","risa","llorar","gracioso","laugh"],
  "🤣":["cara","risa","gracioso"],
  "🙂":["cara","ok","bien"],
  "😊":["cara","agradable","contento"],
  "😉":["cara","guiño"],
  "😍":["cara","amor","ojos","corazon"],
  "😘":["cara","beso","amor"],
  "😎":["cara","gafas","cool"],
  "🤓":["cara","friki","gafas"],
  "🤩":["cara","estrellas","wow"],
  "🥳":["cara","fiesta","celebrar"],
  "😇":["cara","angel"],
  "🙃":["cara","vuelta"],
  "😌":["cara","calma","relax"],
  "😴":["cara","sueño","dormir"],
  "🤔":["cara","pensando","duda"],
  "🫡":["cara","saludo","respeto"],
  "😬":["cara","incomodo"],
  "😮":["cara","sorpresa"],
  "😢":["cara","triste","llorar"],
  "😭":["cara","llorar","triste"],
  "😡":["cara","enfado","rabia"],
  "🤯":["cara","mente","explota"],
  "🥲":["cara","emocion"],
  "👍":["gesto","ok","bien","like"],
  "👎":["gesto","mal","dislike"],
  "👏":["gesto","aplauso","bravo"],
  "🙌":["gesto","celebrar"],
  "🙏":["gesto","gracias","rezar"],
  "🤝":["gesto","trato","acuerdo","saludo"],
  "👋":["gesto","hola","saludo"],
  "💪":["gesto","fuerza"],
  "✍️":["gesto","escribir","firma"],
  "🫶":["gesto","amor","corazon"],
  "👌":["gesto","perfecto"],
  "✌️":["gesto","paz","victoria"],
  "🤞":["gesto","suerte"],
  "☝️":["gesto","arriba","idea"],
  "👀":["ojos","mirar","atento"],
  "💯":["simbolo","cien","perfecto"],
  "✅":["simbolo","check","hecho","ok"],
  "⚠️":["simbolo","aviso","alerta","warning"],
  "🚀":["objeto","cohete","lanzamiento"],
  "🎯":["objetivo","meta","target"],
  "🔥":["fuego","top","urgente"],
  "💡":["idea","bombilla"],
  "📌":["trabajo","pin","marcar"],
  "❤️":["amor","corazon","love"],
  "💼":["trabajo","maletin","oficina"],
  "📁":["trabajo","carpeta"],
  "📂":["trabajo","carpeta","abrir"],
  "📎":["trabajo","clip","adjunto"],
  "🗂️":["trabajo","archivo","organizar"],
  "📝":["trabajo","nota","escribir"],
  "📊":["trabajo","grafico","datos"],
  "📈":["trabajo","sube","crecimiento"],
  "📉":["trabajo","baja","caida"],
  "🧠":["trabajo","mente","pensar"],
  "⚖️":["trabajo","legal","ley","justicia"],
  "🏛️":["trabajo","juzgado","institucion"],
  "📚":["trabajo","libros","estudiar"],
  "📖":["trabajo","leer","libro"],
  "🖋️":["trabajo","firma","pluma"],
  "🧾":["trabajo","recibo","factura"],
  "🔍":["trabajo","buscar","lupa"],
  "💬":["chat","mensaje","hablar"],
  "📣":["trabajo","anuncio","comunicar"],
  "💻":["trabajo","ordenador"],
  "⌨️":["trabajo","teclado"],
  "📅":["trabajo","fecha","calendario"],
  "🕒":["trabajo","hora","reloj"],
  "✈️":["viaje","avion"],
  "🚗":["viaje","coche"],
  "🚕":["viaje","taxi"],
  "🚆":["viaje","tren"],
  "🛫":["viaje","salida"],
  "🛬":["viaje","llegada"],
  "🧳":["viaje","maleta"],
  "🌍":["viaje","mundo"],
  "🌎":["viaje","mundo"],
  "🌏":["viaje","mundo"],
  "🗺️":["viaje","mapa"],
  "🏖️":["viaje","playa"],
  "🏔️":["viaje","montaña"],
  "🏨":["viaje","hotel"],
  "📍":["viaje","ubicacion","pin"],
  "🧭":["viaje","brujula"],
  "☀️":["tiempo","sol"],
  "🌤️":["tiempo","sol","nubes"],
  "🌧️":["tiempo","lluvia"],
  "⛅":["tiempo","nubes"],
  "🌙":["tiempo","noche","luna"],
  "⭐":["simbolo","estrella","favorito"],
  "🎉":["fiesta","celebrar"],
  "🎊":["fiesta","celebrar"],
  "❌":["simbolo","error","cerrar"],
  "❗":["simbolo","importante"],
  "❓":["simbolo","pregunta"],
  "➕":["simbolo","sumar","mas"],
  "➖":["simbolo","menos","restar"],
  "➗":["simbolo","dividir"],
  "✖️":["simbolo","multiplicar","cerrar"],
  "🔁":["simbolo","repetir","refresh"],
  "🔒":["simbolo","bloquear","cerrado"],
  "🔓":["simbolo","abrir","desbloquear"],
  "🔵":["simbolo","azul"],
  "🔴":["simbolo","rojo"],
  "🟡":["simbolo","amarillo"],
  "🟢":["simbolo","verde"],
  "⚪":["simbolo","blanco"],
  "⚫":["simbolo","negro"],
  "⬆️":["simbolo","arriba"],
  "⬇️":["simbolo","abajo"],
  "➡️":["simbolo","derecha"],
  "⬅️":["simbolo","izquierda"],
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const EmojiImg = React.memo(function EmojiImg({
  emoji,
  size = 24,
  className = "",
}: {
  emoji: string;
  size?: number;
  className?: string;
}) {
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

const mediaUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return `${API_ORIGIN}${url}`;
};

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
      canal.ultimo_mensaje === other.ultimo_mensaje &&
      canal.ultimo_mensaje_at === other.ultimo_mensaje_at &&
      canal.total_miembros === other.total_miembros &&
      canal.dm_target_user_id === other.dm_target_user_id &&
      canal.dm_target_user_name === other.dm_target_user_name &&
      canal.dm_target_avatar_url === other.dm_target_avatar_url;
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
      if (!response.ok) throw new Error("download");
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
      if (!copied) throw new Error("copy");
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
      if (!copied) throw new Error("share");
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
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 backdrop-blur-md">
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
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2 py-2 shadow-lg shadow-black/10 backdrop-blur-xl">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDownload(); }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <Download size={16} />
            Descargar
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleShare(); }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <Share2 size={16} />
            Compartir
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowOptions((v) => !v); }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              <MoreHorizontal size={16} />
              Opciones
            </button>
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
                  <ExternalLink size={15} />
                  Abrir original
                </button>
                <button
                  type="button"
                  onClick={() => { void copyLink(); }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/10"
                >
                  <Copy size={15} />
                  Copiar enlace
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Cerrar visor"
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
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2 py-2 text-xs text-slate-300 backdrop-blur-md">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomOut(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Reducir imagen"
            disabled={zoom <= 0.6}
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
            className="rounded-full px-3 py-2 font-semibold text-white transition hover:bg-white/10"
            aria-label="Restablecer zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomIn(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Ampliar imagen"
            disabled={zoom >= 4}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Reiniciar zoom"
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 backdrop-blur-md">
          Usa `+`, `-`, rueda o `0` para el zoom
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2 py-2 backdrop-blur-md">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDownload(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Descargar imagen"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleShare(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Compartir imagen"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openOriginal(); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Abrir imagen original"
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
    a.ultimo_mensaje === b.ultimo_mensaje &&
    a.ultimo_mensaje_autor === b.ultimo_mensaje_autor &&
    a.ultimo_mensaje_at === b.ultimo_mensaje_at &&
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

function renderText(s: string): React.ReactNode {
  const renderEmojiRichText = (text: string, keyPrefix: string) => text
    .split(/(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu)
    .filter(Boolean)
    .map((segment, index) => (
      /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u.test(segment)
        ? <EmojiImg key={`${keyPrefix}-emoji-${index}`} emoji={segment} size={18} className="mx-[1px] inline-block align-[-0.2em]" />
        : <React.Fragment key={`${keyPrefix}-text-${index}`}>{segment}</React.Fragment>
    ));

  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/\S+|@\S+)/g)
    .map((p, i) => {
      if (p.startsWith("**")&&p.endsWith("**")) return <strong key={i}>{renderEmojiRichText(p.slice(2,-2), `strong-${i}`)}</strong>;
      if (p.startsWith("*") &&p.endsWith("*"))  return <em key={i}>{renderEmojiRichText(p.slice(1,-1), `em-${i}`)}</em>;
      if (p.startsWith("`") &&p.endsWith("`"))  return <code key={i} className="bg-slate-100 text-red-700 px-1 rounded font-mono text-[13px]">{renderEmojiRichText(p.slice(1,-1), `code-${i}`)}</code>;
      if (p.startsWith("http")) return <a key={i} href={p} target="_blank" rel="noreferrer" className="text-blue-500 underline hover:text-blue-600">{renderEmojiRichText(p, `link-${i}`)}</a>;
      if (p.startsWith("@")) return <span key={i} className="text-blue-600 font-semibold bg-blue-50 px-0.5 rounded">{renderEmojiRichText(p, `mention-${i}`)}</span>;
      return <React.Fragment key={i}>{renderEmojiRichText(p, `plain-${i}`)}</React.Fragment>;
    });
}

function buildTypingLabel(names: string[]) {
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} está escribiendo...`;
  if (names.length === 2) return `${names[0]} y ${names[1]} están escribiendo...`;
  return `${names[0]}, ${names[1]} y ${names.length - 2} más están escribiendo...`;
}

function normalizeEmojiSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function emojiSearchScore(emoji: string, query: string, groupLabel?: string) {
  const normalizedQuery = normalizeEmojiSearch(query);
  if (!normalizedQuery) return 1;
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  const tags = (EMOJI_SEARCH_TAGS[emoji] || []).map(normalizeEmojiSearch);
  const haystacks = [normalizeEmojiSearch(groupLabel || ""), ...tags, normalizeEmojiSearch(emoji)];
  let score = 0;
  for (const word of words) {
    const exact = haystacks.some(item => item === word);
    const starts = haystacks.some(item => item.startsWith(word));
    const includes = haystacks.some(item => item.includes(word));
    if (!includes) return 0;
    score += exact ? 5 : starts ? 3 : 1;
  }
  return score;
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
  onClose,
  anchorRef,
  align = "left",
}: {
  onPick:(e:string)=>void;
  onClose:()=>void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  align?: "left" | "right";
}) {
  const [cat, setCat] = useState(0);
  const [query, setQuery] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
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

  const groups = useMemo(() => {
    const baseGroups = EMOJI_GROUPS.map(group => (
      group.key === "recent" ? { ...group, emojis: recentEmojis } : group
    ));
    const allEmojis = [...new Set(baseGroups.filter(group => group.key !== "recent").flatMap(group => group.emojis))];
    return [{ key: "all", label: "Todos", icon: "✨", emojis: allEmojis }, ...baseGroups];
  }, [recentEmojis]);

  const activeGroup = groups[cat] ?? groups[0];
  const visibleEmojis = useMemo(() => {
    const normalizedQuery = normalizeEmojiSearch(query);
    const candidates = query.trim()
      ? groups.flatMap(group => group.emojis.map(emoji => ({ emoji, label: group.label })))
      : activeGroup.emojis.map(emoji => ({ emoji, label: activeGroup.label }));

    return candidates
      .filter((item, index, arr) => arr.findIndex(other => other.emoji === item.emoji) === index)
      .map(item => ({ ...item, score: emojiSearchScore(item.emoji, normalizedQuery, item.label) }))
      .filter(item => !normalizedQuery || item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.emoji);
  }, [activeGroup.emojis, groups, query]);

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
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-blue-200 bg-slate-50 px-3 py-2.5 shadow-sm">
          <Search size={15} className="text-slate-400" />
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Buscar todos los emojis"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-3">
          {groups.map((c,i)=>(
          <button key={c.key} onClick={()=>setCat(i)} title={c.label}
            className={`flex h-10 min-w-10 items-center justify-center rounded-full border transition-all ${
              cat===i
                ? "border-blue-200 bg-blue-50 shadow-sm"
                : "border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50"
            }`}>
            <EmojiImg emoji={c.icon} size={20} />
          </button>
        ))}
        </div>
      </div>
      <div className="max-h-[26rem] overflow-y-auto px-3 pb-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="pt-3 text-sm font-semibold text-slate-700">
            {query.trim() ? "Resultados" : activeGroup.label}
          </p>
          {!query.trim() && activeGroup.key === "recent" && recentEmojis.length === 0 && (
            <span className="pt-3 text-xs text-slate-400">Se llenará con tu uso</span>
          )}
        </div>
        {visibleEmojis.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            No hay emojis para mostrar
          </div>
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
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GIF PICKER
// ══════════════════════════════════════════════════════════════════════════════
function GifPicker({ onPick, onClose }: { onPick:(url:string)=>void; onClose:()=>void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const url = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=18&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=18&rating=g`;
      const d = await (await fetch(url)).json();
      setGifs(d.data || []);
    } catch { setGifs([]); }
    setLoading(false);
  }, []);
  useEffect(() => { search(""); }, [search]);
  useEffect(() => { const t = setTimeout(()=>search(q),400); return ()=>clearTimeout(t); }, [q, search]);
  return (
    <div ref={ref} className="absolute bottom-full mb-2 left-0 z-50 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-80 overflow-hidden">
      <div className="p-2 border-b border-slate-700">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar GIFs…"
          className="w-full bg-slate-700 text-white text-sm px-3 py-1.5 rounded-lg outline-none placeholder-slate-400"/>
      </div>
      <div className="grid grid-cols-3 gap-1 p-2 max-h-52 overflow-y-auto">
        {loading?<div className="col-span-3 flex justify-center py-4"><Loader2 className="animate-spin text-slate-400" size={20}/></div>
          :gifs.map(g=>(
          <button key={g.id} onClick={()=>onPick(g.images.fixed_height_small.url)}
            className="rounded-lg overflow-hidden hover:ring-2 hover:ring-red-500 transition-all">
            <img src={g.images.fixed_height_small.url} alt={g.title} className="w-full object-cover"/>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MENTION DROPDOWN
// ══════════════════════════════════════════════════════════════════════════════
function MentionDropdown({ miembros, query, onSelect }: { miembros: Miembro[]; query: string; onSelect:(n:string)=>void }) {
  const filtered = miembros.filter(m=>m.user_name.toLowerCase().includes(query.toLowerCase())).slice(0,6);
  if (!filtered.length) return null;
  return (
    <div className="absolute bottom-full mb-1 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl w-56 overflow-hidden">
      {filtered.map(m=>(
        <button key={m.user_id} onClick={()=>onSelect(m.user_name)}
          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-slate-50 text-left transition-colors">
          <Av url={m.avatar_url} name={m.user_name} size={6}/>
          <div><p className="text-slate-800 text-sm font-medium">{m.user_name}</p><p className="text-slate-400 text-xs">{m.role_label}</p></div>
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STATUS SELECTOR
// ══════════════════════════════════════════════════════════════════════════════
function StatusSelector({ current, onSelect, onClose }: { current: string; onSelect:(s:string)=>void; onClose:()=>void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full mb-2 left-0 z-50 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-52 overflow-hidden">
      <p className="text-xs text-slate-500 px-3 pt-2 pb-1 font-semibold uppercase tracking-wider">Mi estado</p>
      {Object.entries(STATUS_CFG).map(([k,v])=>(
        <button key={k} onClick={()=>onSelect(k)}
          className={`flex items-center gap-2.5 w-full px-3 py-2 hover:bg-slate-700 transition-colors ${current===k?"bg-slate-700":""}`}>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${v.color}`}/>
          <span className="text-slate-200 text-sm">{v.label}</span>
          {current===k&&<Check size={12} className="ml-auto text-green-400"/>}
        </button>
      ))}
    </div>
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
}: {
  canal: Canal;
  onMembers: ()=>void;
  onPinned: ()=>void;
  onFavorites: ()=>void;
  onRefresh: ()=>void;
  onLeave: ()=>void;
  onClose: ()=>void;
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
        <Users size={14} className="text-slate-400" />
        Ver miembros
      </button>
      <button onClick={() => { onPinned(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Pin size={14} className="text-slate-400" />
        Ver fijados
      </button>
      <button onClick={() => { onFavorites(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Star size={14} className="text-amber-400" />
        Ver favoritos
      </button>
      <button onClick={() => { onRefresh(); onClose(); }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50">
        <Loader2 size={14} className="text-slate-400" />
        Actualizar
      </button>
      {canal.tipo !== "directo" && (
        <button onClick={() => { onLeave(); onClose(); }}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50">
          <LogOut size={14} />
          Salir del canal
        </button>
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
    if (!nombreClean) { setErrorMsg("El nombre es obligatorio"); return; }
    setSaving(true); setErrorMsg("");
    try {
      const token = await getToken({ skipCache: true });
      const h = { "Content-Type":"application/json", Authorization:`Bearer ${token}` };
      const res = await fetch("/api/chat/canales", {
        method:"POST", headers: h,
        body: JSON.stringify({ nombre: nombreClean, descripcion: desc.trim()||null, tipo }),
      });
      const d = await safeJson(res);
      if (!res.ok) { setErrorMsg(d.error||"Error al crear"); setSaving(false); return; }
      const canal: Canal = d.data;
      await Promise.all(invitados.map(u =>
        fetch(`/api/chat/canales/${canal.id}/miembros`, {
          method:"POST", headers: h,
          body: JSON.stringify({ target_user_id:u.user_id, target_user_name:u.user_name, target_avatar_url:u.avatar_url }),
        })
      ));
      onCreate({ ...canal, no_leidos:0, total_miembros: 1+invitados.length, archivado:false,
        ultimo_mensaje:null, ultimo_mensaje_autor:null, ultimo_mensaje_at:null });
    } catch { setErrorMsg("Error de red"); setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] border border-slate-200 overflow-hidden">

        {/* ── PASO 1: Nombre ── */}
        {step === 1 && (
          <>
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-slate-900 font-bold text-xl">Crear un canal</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18}/>
              </button>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Nombre</label>
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
                    placeholder="ej. expedientes-urgentes"
                    className="flex-1 bg-transparent text-slate-800 text-sm py-2.5 outline-none placeholder-slate-400"
                  />
                  <span className="text-slate-400 text-xs shrink-0">{MAX_NOMBRE - nombre.length}</span>
                </div>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                  Los canales son el lugar donde se producen las conversaciones sobre un tema.<br/>
                  Usa un nombre que sea fácil de encontrar y comprender.
                </p>
              </div>

              {/* Visibilidad */}
              <div className="flex items-start gap-3 py-1">
                <input type="checkbox" id="privado" checked={tipo==="privado"}
                  onChange={e=>setTipo(e.target.checked?"privado":"publico")}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-slate-700 cursor-pointer shrink-0"/>
                <label htmlFor="privado" className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-slate-700 font-medium">Canal privado</span>
                  <span className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 cursor-help" title="Los canales privados solo son visibles para sus miembros">
                    <Lock size={12}/>
                  </span>
                </label>
              </div>

              {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

              {/* Footer paso 1 */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => { if (!nombreClean) { setErrorMsg("Escribe un nombre para el canal"); return; } setErrorMsg(""); setStep(2); }}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                  disabled={!nombre.trim()}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── PASO 2: Miembros + descripción ── */}
        {step === 2 && (
          <>
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <h2 className="text-slate-900 font-bold text-xl">Añadir miembros</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  <span className={tipo==="privado"?"text-slate-400":"text-slate-400"}>
                    {tipo==="privado"?<Lock size={11} className="inline mr-1"/>:<Hash size={11} className="inline mr-1"/>}
                  </span>
                  <span className="font-semibold text-slate-700">{nombreClean}</span>
                  <span className="text-slate-400 ml-2 text-xs">({tipo==="privado"?"privado":"público"})</span>
                </p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18}/>
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Descripción opcional */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input value={desc} onChange={e=>setDesc(e.target.value)}
                  placeholder="¿De qué trata este canal?"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 text-sm outline-none placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"/>
              </div>

              {/* Buscar miembros */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Añadir personas
                  {invitados.length>0 && (
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
                    placeholder="Buscar por nombre o email…"
                    className="w-full border border-slate-200 rounded-lg bg-slate-50 pl-8 pr-3 py-2.5 text-slate-800 text-sm outline-none placeholder-slate-400 focus:border-blue-400 transition-all"/>
                </div>
                {buscarUser.trim() && (
                  <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm max-h-44 overflow-y-auto">
                    {opciones.length === 0
                      ? <p className="text-slate-400 text-sm px-3 py-2.5">Sin resultados</p>
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

              {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
            </div>

            {/* Footer paso 2 */}
            <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <BackButton onClick={()=>setStep(1)} />
              <div className="flex gap-2.5">
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={saving}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : null}
                  {saving ? "Creando…" : "Crear canal"}
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
function PanelMiembros({ canal, sysUsers, getToken, currentUserId, onClose, onDM, onRefresh }: {
  canal: Canal; sysUsers: SysUser[]; getToken: ()=>Promise<string|null>;
  currentUserId: string; onClose:()=>void; onDM:(m:Miembro)=>void; onRefresh:()=>void;
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
    <aside className="w-72 shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2">
          <Users size={15} className="text-red-500"/>
          Miembros
          <span className="bg-slate-200 text-slate-600 text-xs px-1.5 py-0.5 rounded-full font-semibold">{miembros.length}</span>
        </h3>
        <BackButton onClick={onClose} />
      </div>
      {/* Tabs */}
      <div className="flex border-b border-slate-100 shrink-0">
        {(["ver","añadir"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${t===tab?"text-red-600 border-b-2 border-red-500":"text-slate-500 hover:text-slate-700"}`}>
            {t==="ver"?"Lista":"+ Añadir"}
          </button>
        ))}
      </div>
      {/* Buscador */}
      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={buscar} onChange={e=>setBuscar(e.target.value)} placeholder="Buscar…"
            className="w-full bg-slate-100 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-700 outline-none placeholder-slate-400"/>
        </div>
      </div>
      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        {loading&&<div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-300" size={18}/></div>}
        {!loading&&tab==="ver"&&(
          <>
            {admins.length>0&&(
              <>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-4 pt-3 pb-1.5">Administradores</p>
                {admins.map(m=><MiembroRow key={m.user_id} m={m} isMe={m.user_id===currentUserId} canAdmin={myRole==="admin"&&m.user_id!==currentUserId} acting={acting} onDM={()=>onDM(m)} onRemove={()=>removeM(m.user_id)}/>)}
              </>
            )}
            {members.length>0&&(
              <>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-4 pt-3 pb-1.5">Miembros — {members.length}</p>
                {members.map(m=><MiembroRow key={m.user_id} m={m} isMe={m.user_id===currentUserId} canAdmin={myRole==="admin"&&m.user_id!==currentUserId} acting={acting} onDM={()=>onDM(m)} onRemove={()=>removeM(m.user_id)}/>)}
              </>
            )}
            {miembrosFilt.length===0&&<p className="text-slate-400 text-sm text-center py-6">Sin resultados</p>}
          </>
        )}
        {!loading&&tab==="añadir"&&(
          <>
            <p className="text-xs text-slate-400 px-4 pt-3 pb-1.5">Usuarios del sistema ({noMiembros.length} disponibles)</p>
            {noMiembros.length===0
              ?<p className="text-slate-400 text-sm text-center py-6">Todos son miembros</p>
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

function MiembroRow({ m, isMe, canAdmin, acting, onDM, onRemove }: {
  m: Miembro; isMe: boolean; canAdmin: boolean; acting: string|null;
  onDM:()=>void; onRemove:()=>void;
}) {
  const st = STATUS_CFG[m.status]||STATUS_CFG.disponible;
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
        {!isMe&&<button onClick={onDM} title="Mensaje directo" className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"><MessageSquare size={12}/></button>}
        {canAdmin&&(
          <button onClick={onRemove} disabled={acting===m.user_id} title="Eliminar del canal"
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50">
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
function PanelFijados({ canalId, getToken, onClose, onGoTo, resolveDisplayName }: {
  canalId: string; getToken:()=>Promise<string|null>;
  onClose:()=>void; onGoTo:(id:string)=>void;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
}) {
  const [fijados, setFijados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async()=>{
      const token = await getToken();
      const res = await fetch(`/api/chat/canales/${canalId}/fijados`, { headers:{Authorization:`Bearer ${token}`} });
      const d = await safeJson(res);
      if (res.ok) setFijados(d.data||[]);
      setLoading(false);
    })();
  }, [canalId, getToken]);
  const unpin = async (msgId: string) => {
    const token = await getToken();
    await fetch(`/api/chat/canales/${canalId}/fijar/${msgId}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} });
    setFijados(p=>p.filter(f=>f.mensaje_id!==msgId));
  };
  return (
    <aside className="w-64 shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2"><Pin size={14} className="text-red-500"/>Mensajes fijados</h3>
        <BackButton onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading&&<div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-300" size={18}/></div>}
        {!loading&&fijados.length===0&&(
          <div className="flex flex-col items-center justify-center h-full py-12 text-slate-300">
            <Pin size={32} className="mb-2 opacity-40"/>
            <p className="text-sm text-slate-400">Sin mensajes fijados</p>
          </div>
        )}
        {fijados.map(f=>(
          <div key={f.mensaje_id} className="group px-3 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5"><Av url={f.avatar_url} name={resolveDisplayName(f.user_id, f.user_name)} size={6}/></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{resolveDisplayName(f.user_id, f.user_name)}</p>
                {f.image_url ? <img src={mediaUrl(f.image_url) || undefined} alt="Imagen" className="w-28 rounded mt-1 border border-slate-200 object-cover"/>
                  : f.gif_url ? <img src={f.gif_url} alt="GIF" className="w-28 rounded mt-1"/>
                  :<p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{f.contenido}</p>}
                <p className="text-slate-300 text-xs mt-1">{fmtTime(f.msg_created_at)}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={()=>onGoTo(f.mensaje_id)} className="text-xs text-blue-500 hover:underline font-medium">Ver</button>
              <button onClick={()=>unpin(f.mensaje_id)} className="text-xs text-red-400 hover:underline flex items-center gap-0.5 font-medium"><PinOff size={10}/>Desfijar</button>
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
    <aside className="w-64 shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-amber-50/70">
        <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2"><Star size={14} className="text-amber-500 fill-amber-300"/>Favoritos</h3>
        <BackButton onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading&&<div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-300" size={18}/></div>}
        {!loading&&favoritos.length===0&&(
          <div className="flex flex-col items-center justify-center h-full py-12 text-slate-300">
            <Star size={32} className="mb-2 opacity-40"/>
            <p className="text-sm text-slate-400">Sin favoritos en este chat</p>
          </div>
        )}
        {favoritos.map(f=>(
          <div key={f.mensaje_id} className="group px-3 py-3 border-b border-slate-100 hover:bg-amber-50/40 transition-colors">
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5"><Av url={f.avatar_url} name={resolveDisplayName(f.user_id, f.user_name)} size={6}/></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{resolveDisplayName(f.user_id, f.user_name)}</p>
                {f.image_url ? <img src={mediaUrl(f.image_url) || undefined} alt="Imagen" className="w-28 rounded mt-1 border border-slate-200 object-cover"/>
                  : f.gif_url ? <img src={f.gif_url} alt="GIF" className="w-28 rounded mt-1"/>
                  :<p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{f.contenido}</p>}
                <p className="text-slate-300 text-xs mt-1">{fmtTime(f.msg_created_at)}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={()=>onGoTo(f.mensaje_id)} className="text-xs text-blue-500 hover:underline font-medium">Ver</button>
              <button onClick={()=>removeFavorite(f.mensaje_id)} className="text-xs text-amber-500 hover:underline flex items-center gap-0.5 font-medium"><Star size={10} className="fill-amber-300"/>Quitar</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function MensajeItem({ msg, prevMsg, currentUserId, isHighlighted, isFreshIncoming = false, onReply, onReact, onEdit, onDelete, onPin, onFavorite, isFavorite, resolveDisplayName, resolveAvatarUrl }: {
  msg: Mensaje; prevMsg: Mensaje|null; currentUserId: string; isHighlighted: boolean; isFreshIncoming?: boolean;
  onReply:(m:Mensaje)=>void; onReact:(id:string,e:string)=>void;
  onEdit:(m:Mensaje)=>void; onDelete:(id:string)=>void; onPin:(id:string)=>void; onFavorite:(id:string)=>void;
  isFavorite?: boolean;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
  resolveAvatarUrl?:(userId?: string | null, avatarUrl?: string | null, isSelf?: boolean)=>string|null;
}) {
  const [hover, setHover] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const isMe = msg.user_id === currentUserId;
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
  const imageSrc = mediaUrl(msg.image_url);

  if (msg.deleted_at) return (
    <div className={`px-4 py-0.5 text-slate-400 italic text-xs ${!sameAuthor?"mt-2":""}`}>
      Mensaje eliminado
    </div>
  );

  return (
    <div id={`msg-${msg.id}`}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>{ if (!showEmoji) setHover(false); }}
      className={`relative group px-4 transition-all duration-300 ${isHighlighted?"bg-yellow-50":"hover:bg-slate-50"} ${!sameAuthor?"mt-3 pt-1":""} ${
        isFreshIncoming ? "animate-in fade-in slide-in-from-bottom-2" : ""
      }`}>
      <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
        <div className={`flex max-w-[min(42rem,85%)] flex-col ${isMe ? "items-end" : "items-start"}`}>
          {/* Author row */}
          {!sameAuthor&&(
            <div className={`flex items-center gap-2.5 mb-0.5 ${isMe ? "flex-row-reverse" : ""}`}>
              <Av
                url={resolveAvatarUrl?.(msg.user_id, msg.avatar_url, isMe) ?? msg.avatar_url}
                name={resolveDisplayName(msg.user_id, msg.user_name, isMe)}
                size={9}
              />
              <span className="font-bold text-slate-800 text-sm">{resolveDisplayName(msg.user_id, msg.user_name, isMe)}</span>
              {isMe&&<span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">{"T\u00FA"}</span>}
              <span className="text-xs text-slate-400">{fmtTime(msg.created_at)}</span>
              {msg.editado&&<span className="text-[10px] text-slate-400 italic">(editado)</span>}
            </div>
          )}

          {/* Message body */}
          <div className={isMe ? "pr-[46px]" : "pl-[46px]"}>
        {/* Reply quote */}
        {msg.reply_to&&(
          <div className="flex items-start gap-1.5 mb-1 pl-2 border-l-2 border-slate-300 bg-slate-100/60 rounded-r py-1 pr-2">
            <CornerDownRight size={10} className="text-slate-400 mt-0.5 shrink-0"/>
            <span className="text-xs font-semibold text-slate-500">{resolveDisplayName(msg.reply_to.user_id, msg.reply_to.user_name, msg.reply_to.user_id === currentUserId)}</span>
            <span className="text-xs text-slate-400 line-clamp-1 ml-1">{msg.reply_to.contenido}</span>
          </div>
        )}
        <div
          className={`rounded-2xl transition-all duration-500 ${
            isFreshIncoming && !isMe
              ? "translate-y-0 scale-[1.01] bg-gradient-to-br from-red-50 via-white to-white ring-1 ring-red-100 shadow-[0_14px_40px_-22px_rgba(220,38,38,0.45)]"
              : ""
          }`}
        >
          {/* Content */}
          {imageSrc && (
            <>
              <button
                type="button"
                onClick={() => setShowImageLightbox(true)}
                className="group/image mt-1 block overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition hover:shadow-md"
                aria-label="Ampliar imagen adjunta"
              >
                <img
                  src={imageSrc}
                  alt="Imagen adjunta"
                  className="max-w-[320px] rounded-2xl object-cover transition duration-200 group-hover/image:scale-[1.01]"
                  loading="lazy"
                />
              </button>
              {showImageLightbox && (
                <ImageLightbox
                  src={imageSrc}
                  alt="Imagen adjunta"
                  authorName={resolveDisplayName(msg.user_id, msg.user_name, isMe)}
                  authorAvatarUrl={resolveAvatarUrl?.(msg.user_id, msg.avatar_url, isMe) ?? msg.avatar_url}
                  createdAt={msg.created_at}
                  fileName={msg.image_url?.split("/").pop()?.split("?")[0] || undefined}
                  onClose={() => setShowImageLightbox(false)}
                />
              )}
            </>
          )}
          {msg.gif_url
            ?<img src={msg.gif_url} alt="GIF" className="max-w-[240px] rounded-xl mt-1 border border-slate-200 shadow-sm"/>
            : msg.contenido !== IMAGE_PLACEHOLDER_TEXT && <p className="text-slate-700 text-sm leading-relaxed break-words px-0.5 py-0.5">{renderText(msg.contenido)}</p>
          }
          {/* Reactions */}
          {reactions.length>0&&(
            <div className="flex flex-wrap gap-1 mt-1.5">
              {reactions.map(r=>(
                <button key={r.emoji} onClick={()=>onReact(msg.id,r.emoji)} title={r.names.join(", ")}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-all font-medium ${r.mine?"bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200":"bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
                  <EmojiImg emoji={r.emoji} size={16} />
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
          </div>
        </div>
      </div>

      {/* Hover toolbar */}
      {(hover || showEmoji)&&(
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl shadow-lg px-1 py-0.5 z-10">
          <div className="relative">
            <button ref={emojiButtonRef} onClick={()=>setShowEmoji(v=>!v)} title="Reaccionar"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Smile size={14}/></button>
            {showEmoji&&<EmojiPicker anchorRef={emojiButtonRef} align="right" onPick={e=>{onReact(msg.id,e);setShowEmoji(false);setHover(false);}} onClose={()=>{setShowEmoji(false);setHover(false);}}/>}
          </div>
          <button onClick={()=>onReply(msg)} title="Responder"
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><CornerDownRight size={14}/></button>
          <button onClick={()=>onFavorite(msg.id)} title={isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
            className={`p-1.5 rounded-lg transition-colors ${isFavorite ? "bg-amber-50 text-amber-500 hover:bg-amber-100" : "text-slate-400 hover:bg-slate-100 hover:text-amber-500"}`}><Star size={14} className={isFavorite ? "fill-amber-300" : ""}/></button>
          <button onClick={()=>onPin(msg.id)} title="Fijar"
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Pin size={14}/></button>
          {isMe&&(
            <>
              <button onClick={()=>onEdit(msg)} title="Editar"
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Edit3 size={14}/></button>
              <button onClick={()=>onDelete(msg.id)} title="Eliminar"
                className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
function MessageInput({ canalId, canalNombre, replyTo, editingMsg, miembros, currentUserId, resolveDisplayName, onTypingChange, onSend, onCancelReply, onCancelEdit }: {
  canalId: string; canalNombre: string; replyTo: Mensaje|null; editingMsg: Mensaje|null; miembros: Miembro[]; currentUserId: string;
  resolveDisplayName:(userId?: string | null, name?: string | null, isSelf?: boolean)=>string;
  onTypingChange:(canalId: string, typing: boolean)=>void;
  onSend:(text:string,gifUrl?:string,replyId?:string,editId?:string,imageUrl?:string)=>Promise<void>;
  onCancelReply:()=>void; onCancelEdit:()=>void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [mentionQ, setMentionQ] = useState<string|null>(null);
  const [selectedImage, setSelectedImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const typingActiveRef = useRef(false);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragCounterRef = useRef(0);
  const { getToken } = useAuth();

  useEffect(() => {
    if (editingMsg) { setText(editingMsg.contenido); taRef.current?.focus(); }
  }, [editingMsg?.id]);

  useEffect(() => () => {
    if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
  }, [selectedImage]);

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

  const autoResize = () => {
    const t = taRef.current;
    if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160)+"px"; }
  };

  const syncSelection = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    selectionRef.current = {
      start: ta.selectionStart ?? text.length,
      end: ta.selectionEnd ?? text.length,
    };
  }, [text.length]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
    if (e.key==="Escape") { onCancelReply(); onCancelEdit(); setText(""); stopTypingSignal(); }
  };

  const doSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !editingMsg && !selectedImage) return;
    stopTypingSignal();
    setSending(true);
    if (editingMsg && !selectedImage) {
      await onSend(trimmed||editingMsg.contenido, undefined, undefined, editingMsg.id);
      setText(""); setSending(false); return;
    }
    let imageUrl: string | undefined;
    if (selectedImage) {
      const form = new FormData();
      form.append("image", selectedImage.file);
      const token = await getToken();
      const res = await fetch("/api/chat/uploads/image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setSending(false);
        return;
      }
      imageUrl = data.data?.image_url;
    }
    await onSend(trimmed || (imageUrl ? IMAGE_PLACEHOLDER_TEXT : ""), undefined, replyTo?.id, undefined, imageUrl);
    setText("");
    if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
    setSelectedImage(null);
    if (fileRef.current) fileRef.current.value = "";
    taRef.current && (taRef.current.style.height="auto");
    setSending(false);
  };

  const insertFmt = (wrap: string) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    const sel = text.slice(s,e2)||"texto";
    const n = text.slice(0,s)+wrap+sel+wrap+text.slice(e2);
    setText(n);
    setTimeout(()=>{ ta.focus(); ta.setSelectionRange(s+wrap.length, s+wrap.length+sel.length); },0);
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
    selectionRef.current = { start: cursor, end: cursor };
    setText(nextText);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(cursor, cursor);
      autoResize();
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value); autoResize();
    const cursor = e.target.selectionStart;
    selectionRef.current = {
      start: e.target.selectionStart ?? e.target.value.length,
      end: e.target.selectionEnd ?? e.target.value.length,
    };
    const m = e.target.value.slice(0,cursor).match(/@(\w[\w ]*)$/);
    setMentionQ(m?m[1]:null);
    if (e.target.value.trim()) startTypingSignal();
    else stopTypingSignal();
  };

  const insertMention = (name: string) => {
    const ta = taRef.current; if (!ta) return;
    const cur = ta.selectionStart;
    const before = text.slice(0,cur).replace(/@(\w[\w ]*)$/, `@${name} `);
    const after = text.slice(cur);
    setText(before+after); setMentionQ(null);
    setTimeout(()=>{ ta.focus(); ta.setSelectionRange(before.length, before.length); },0);
  };

  const sendGif = async (url: string) => {
    setShowGif(false);
    stopTypingSignal();
    await onSend("GIF", url, replyTo?.id);
  };

  const chooseImage = (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    stopTypingSignal();
    setSelectedImage(prev => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
    setShowGif(false);
    setShowEmoji(false);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    const hasImage = [...e.dataTransfer.items].some((item) => item.type.startsWith("image/"));
    if (!hasImage) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingImage(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const hasImage = [...e.dataTransfer.items].some((item) => item.type.startsWith("image/"));
    if (!hasImage) return;
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
    const imageFile = [...e.dataTransfer.files].find((file) => file.type.startsWith("image/"));
    dragCounterRef.current = 0;
    setIsDraggingImage(false);
    if (!imageFile) return;
    e.preventDefault();
    chooseImage(imageFile);
  };

  const canSend = !!text.trim() || !!editingMsg || !!selectedImage;

  return (
    <div className="px-4 pb-4 pt-3 shrink-0">
      {(replyTo||editingMsg)&&(
        <div className="flex items-center gap-2 mb-3 px-3 py-2.5 bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-2xl text-xs text-blue-700 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CornerDownRight size={11} className="shrink-0"/>
          {replyTo&&<span>Respondiendo a <strong>{resolveDisplayName(replyTo.user_id, replyTo.user_name, replyTo.user_id === currentUserId)}</strong>: <span className="opacity-70">{replyTo.contenido.slice(0,60)}{replyTo.contenido.length>60?"...":""}</span></span>}
          {editingMsg&&<span className="font-semibold">Editando mensaje</span>}
          <button onClick={()=>{onCancelReply();onCancelEdit();setText("");}} className="ml-auto hover:text-red-500 transition-colors"><X size={12}/></button>
        </div>
      )}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative bg-white/95 backdrop-blur rounded-[1.35rem] border focus-within:border-red-300 focus-within:shadow-[0_12px_40px_-18px_rgba(220,38,38,0.45)] transition-all overflow-hidden shadow-lg shadow-slate-200/60 ${
          isDraggingImage
            ? "border-red-300 bg-red-50/80 shadow-[0_18px_50px_-22px_rgba(220,38,38,0.45)]"
            : "border-slate-200"
        }`}
      >
        {isDraggingImage && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-red-50/75 backdrop-blur-[1px]">
            <div className="rounded-3xl border border-red-200 bg-white/95 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-500">
                <ImageIcon size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-800">Suelta la imagen para adjuntarla</p>
              <p className="mt-1 text-xs text-slate-500">Se cargará en la vista previa antes de enviarla</p>
            </div>
          </div>
        )}
        {/* Formatting toolbar — top row */}
        <div className="flex items-center gap-px px-2.5 pt-2.5 pb-1.5 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
          {/* Text format */}
          <button onClick={()=>insertFmt("**")} title="Negrita (Ctrl+B)"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <Bold size={14}/>
          </button>
          <button onClick={()=>insertFmt("`")} title="Código"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <Italic size={14}/>
          </button>
          <button title="Subrayado"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <Underline size={14}/>
          </button>
          <button title="Tachado"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <Strikethrough size={14}/>
          </button>
          {/* Divider */}
          <span className="w-px h-4 bg-slate-200 mx-1 shrink-0"/>
          <button title="Enlace"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <Link2 size={14}/>
          </button>
          <span className="w-px h-4 bg-slate-200 mx-1 shrink-0"/>
          <button title="Lista con viñetas"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <List size={14}/>
          </button>
          <button title="Lista numerada"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors">
            <ListOrdered size={14}/>
          </button>
          <span className="w-px h-4 bg-slate-200 mx-1 shrink-0"/>
          <button onClick={()=>insertFmt("`")} title="Código"
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors font-mono">
            <Code size={14}/>
          </button>
        </div>

        {/* Textarea */}
        <div className="relative px-1">
          {mentionQ!==null&&<MentionDropdown miembros={miembros} query={mentionQ} onSelect={insertMention}/>}
          {selectedImage && (
            <div className="mx-3 mt-3 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5 shadow-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="relative overflow-hidden rounded-xl">
                <img src={selectedImage.previewUrl} alt="Vista previa" className="max-h-52 w-full object-cover" />
                <button onClick={()=>{ if (selectedImage.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl); setSelectedImage(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white transition-colors hover:bg-black">
                  <X size={14}/>
                </button>
              </div>
              <p className="mt-2 truncate text-xs font-medium text-slate-500">{selectedImage.file.name}</p>
            </div>
          )}
          <textarea ref={taRef} value={text} onChange={handleChange} onKeyDown={handleKey}
            onClick={syncSelection}
            onKeyUp={syncSelection}
            onSelect={syncSelection}
            placeholder={editingMsg ? `Editar mensaje...` : `Escribe en ${canalNombre.startsWith("DM") ? "" : "#"}${canalNombre}...`}
            rows={1}
            className="w-full bg-transparent resize-none px-3.5 py-3 text-slate-700 text-sm outline-none placeholder-slate-400 max-h-40 overflow-y-auto leading-relaxed"
            style={{ minHeight:"42px" }}
          />
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1.5 bg-white">
          <div className="flex items-center gap-px relative">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e=>chooseImage(e.target.files?.[0] || null)}
            />
            <button
              ref={emojiButtonRef}
              onMouseDown={(event)=>event.preventDefault()}
              onClick={()=>{syncSelection();setShowEmoji(v=>!v);setShowGif(false);}}
              title="Emoji"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <Smile size={16}/>
            </button>
            <button title="Texto alternativo"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors text-[11px] font-bold">
              Aa
            </button>
            <button onClick={()=>{ const ta=taRef.current; if(!ta) return; const s=ta.selectionStart; setText(t=>t.slice(0,s)+"@"+t.slice(s)); setTimeout(()=>{ta.focus(); ta.setSelectionRange(s+1,s+1);},0); }} title="Mencionar"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <AtSign size={16}/>
            </button>
            <button onClick={()=>{setShowGif(v=>!v);setShowEmoji(false);}} title="GIF"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <ImageIcon size={16}/>
            </button>
            <button title="Añadir imagen" onClick={()=>fileRef.current?.click()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <Paperclip size={16}/>
            </button>
            <button title="Subir foto" onClick={()=>fileRef.current?.click()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <ImageIcon size={16}/>
            </button>
            <button title="Nota de voz"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <Mic size={16}/>
            </button>
            {showEmoji&&<EmojiPicker anchorRef={emojiButtonRef} onPick={insertEmojiAtCursor} onClose={()=>setShowEmoji(false)}/>}
            {showGif&&<GifPicker onPick={sendGif} onClose={()=>setShowGif(false)}/>}
          </div>
          <button onClick={doSend} disabled={!canSend||sending}
            className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-bold transition-all ${
              canSend&&!sending
                ? "bg-[#ab0433] hover:bg-[#92042c] text-white shadow-lg shadow-red-200"
                : "bg-slate-100 text-slate-300 cursor-not-allowed"
            }`}>
            {sending
              ? <Loader2 size={14} className="animate-spin"/>
              : editingMsg ? <Check size={14}/> : <Send size={14}/>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR ITEMS
// ══════════════════════════════════════════════════════════════════════════════
function CanalItem({ canal, activo, onClick, unreadCount = 0 }: { canal: Canal; activo: boolean; onClick:()=>void; unreadCount?: number }) {
  const hasUnread = unreadCount > 0 && !activo;
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all duration-200 text-xs ${
        activo ? "bg-[#ab0433] text-white shadow-lg shadow-red-950/30 font-semibold -translate-y-[1px]" :
        hasUnread ? "text-white bg-slate-800/70 hover:bg-slate-700/80 shadow-sm" :
        "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 font-medium"
      }`}>
      {canal.tipo==="privado"
        ? <Lock size={12} className={`shrink-0 ${hasUnread?"text-white":"text-slate-500"}`}/>
        : <Hash size={12} className={`shrink-0 ${hasUnread?"text-white":"text-slate-500"}`}/>
      }
      <span className={`flex-1 truncate ${hasUnread?"font-bold":"font-medium"}`}>{canal.nombre}</span>
      {hasUnread&&(
        <span className="shrink-0 bg-[#ab0433] text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold">
          {unreadCount>99?"99+":unreadCount}
        </span>
      )}
    </button>
  );
}

// UserDMItem — muestra un usuario del sistema en la sección DMs
function UserDMItem({ user: u, dmCanal, activo, loading, onClick, unreadCount = 0 }: {
  user: SysUser; dmCanal?: Canal; activo: boolean; loading: boolean; onClick:()=>void; unreadCount?: number;
}) {
  const st = STATUS_CFG.disponible; // status por defecto
  const safeUnreadCount = loading ? 0 : unreadCount;
  const hasUnread = safeUnreadCount > 0 && !activo;
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all duration-200 text-xs group ${
        activo ? "bg-[#ab0433] text-white shadow-lg shadow-red-950/30 -translate-y-[1px]" :
        hasUnread ? "text-white bg-slate-800/70 hover:bg-slate-700/80 shadow-sm" :
        "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
      }`}>
      <div className="relative shrink-0">
        <Av url={u.avatar_url} name={u.user_name} size={6}/>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${activo?"border-red-600":"border-slate-900"} ${st.color}`}/>
      </div>
      <span className={`flex-1 truncate ${hasUnread ? "font-bold text-white" : "font-medium"}`}>{u.user_name}</span>
      {loading && <Loader2 size={10} className="animate-spin shrink-0 opacity-60"/>}
      {hasUnread && (
        <div className="shrink-0 flex items-center gap-1">
          <MessageSquare size={11} className={activo ? "text-white" : "text-red-400"} />
          <span className={`rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold ${
            activo ? "bg-white text-[#ab0433]" : "bg-[#ab0433] text-white"
          }`}>
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
    <div className="flex items-center gap-2 px-2 py-2 hover:bg-slate-800/60 rounded-lg transition-colors">
      <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
        <Hash size={13} className="text-slate-400"/>
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={c.ya_unido?onSelect:undefined}>
        <p className="text-slate-200 text-xs font-semibold truncate">#{c.nombre}</p>
        <p className="text-slate-500 text-[10px] truncate">{c.total_miembros} miembros{c.descripcion?` · ${c.descripcion}`:""}</p>
      </div>
      {c.ya_unido
        ?<button onClick={onSelect} className="shrink-0 text-[10px] text-slate-400 hover:text-slate-200 font-semibold px-2 py-0.5 rounded hover:bg-slate-700 transition-colors">Abrir</button>
        :<button onClick={onJoin} disabled={joining}
          className="shrink-0 flex items-center gap-0.5 text-[10px] bg-[#ab0433]/90 hover:bg-[#ab0433] text-white font-bold px-2 py-0.5 rounded transition-colors disabled:opacity-50">
          {joining?<Loader2 size={10} className="animate-spin"/>:<Plus size={10}/>}
          Unirse
        </button>
      }
    </div>
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

  // Estado principal
  const [canales, setCanales]             = useState<Canal[]>([]);
  const [canalActivo, setCanalActivo]     = useState<Canal|null>(null);
  const [mensajes, setMensajes]           = useState<Mensaje[]>([]);
  const [miembros, setMiembros]           = useState<Miembro[]>([]);
  const [sysUsers, setSysUsers]           = useState<SysUser[]>([]);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [rightPanel, setRightPanel]       = useState<"members"|"pinned"|"favorites"|null>(null);
  const [favoriteIds, setFavoriteIds]     = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo]             = useState<Mensaje|null>(null);
  const [editingMsg, setEditingMsg]       = useState<Mensaje|null>(null);
  const [highlightId, setHighlightId]     = useState<string|null>(null);
  const [myStatus, setMyStatus]           = useState("disponible");
  const [showStatus, setShowStatus]       = useState(false);
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

  // Búsqueda de canales en sidebar
  const [canalQ, setCanalQ]               = useState("");
  const [canalResults, setCanalResults]   = useState<CanalBuscado[]>([]);
  const [canalSearching, setCanalSearching] = useState(false);
  const [joiningId, setJoiningId]         = useState<string|null>(null);
  const [dmLoadingId, setDmLoadingId]     = useState<string|null>(null);
  const [dmOrder, setDmOrder]             = useState<string[]>([]);

  const listRef          = useRef<HTMLDivElement>(null);
  const composerRef      = useRef<HTMLDivElement>(null);
  const pollRef          = useRef<ReturnType<typeof setInterval>|null>(null);
  const typingPollRef    = useRef<ReturnType<typeof setInterval>|null>(null);
  const sidebarPollRef   = useRef<ReturnType<typeof setInterval>|null>(null);
  const fetchCanalesRef  = useRef<()=>Promise<void>>(async ()=>{});
  const fetchSysUsersRef = useRef<()=>Promise<void>>(async ()=>{});
  const fetchMensajesRef = useRef<(canal: Canal)=>Promise<void>>(async ()=>{});
  const fetchMiembrosRef = useRef<(canalId: string)=>Promise<void>>(async ()=>{});
  const fetchTypingUsersRef = useRef<(canalId: string)=>Promise<void>>(async ()=>{});
  const pollMensajesRef = useRef<()=>Promise<void>>(async ()=>{});
  const lastAt           = useRef<string|null>(null);
  const atBottom         = useRef(true);
  const sidebarFailCountRef = useRef(0);
  const canalesRequestRef = useRef<Promise<void> | null>(null);
  const usersRequestRef = useRef<Promise<void> | null>(null);
  const prevUnreadDMsRef = useRef<Record<string, number>>({});
  const mensajesCountRef = useRef(0);
  const fetchMensajesInFlightRef = useRef(false);
  const pollMensajesInFlightRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const activePollMs = isPageVisible ? 1800 : 4500;
  const sidebarPollMs = isPageVisible ? 3000 : 6500;
  const typingPollMs = isPageVisible ? 1800 : 4000;
  const canalActivoId = canalActivo?.id ?? null;
  const canalActivoDmTargetId = canalActivo?.dm_target_user_id ?? null;

  useEffect(() => {
    try {
      const rawCanales = window.localStorage.getItem(CHAT_CANALES_CACHE_KEY);
      if (rawCanales) {
        const cachedCanales = JSON.parse(rawCanales) as Canal[];
        if (Array.isArray(cachedCanales)) setCanales(cachedCanales);
      }
    } catch {
      // ignorar cache corrupta
    }

    try {
      const rawUsers = window.localStorage.getItem(CHAT_USERS_CACHE_KEY);
      if (rawUsers) {
        const cachedUsers = JSON.parse(rawUsers) as SysUser[];
        if (Array.isArray(cachedUsers)) setSysUsers(cachedUsers);
      }
    } catch {
      // ignorar cache corrupta
    }

    try {
      const rawDmOrder = window.localStorage.getItem(CHAT_DM_ORDER_CACHE_KEY);
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
      window.localStorage.setItem(CHAT_CANALES_CACHE_KEY, JSON.stringify(canales));
    } catch {
      // ignorar errores de persistencia
    }
  }, [canales]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_USERS_CACHE_KEY, JSON.stringify(sysUsers));
    } catch {
      // ignorar errores de persistencia
    }
  }, [sysUsers]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_DM_ORDER_CACHE_KEY, JSON.stringify(dmOrder));
    } catch {
      // ignorar errores de persistencia
    }
  }, [dmOrder]);

  useEffect(() => {
    mensajesCountRef.current = mensajes.length;
  }, [mensajes.length]);

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

  const fetchTypingUsers = useCallback(async (canalId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalId}/typing`, { headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    const nextTyping = d.data || [];
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
      if (!res.ok) throw new Error("canales");
      const list: Canal[] = d.data||[];
        setCanales(prev => {
          const merged = mergeCanales(prev, list);
          try {
            window.localStorage.setItem(CHAT_CANALES_CACHE_KEY, JSON.stringify(merged));
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
        if (!res.ok) throw new Error("usuarios");
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
        try {
          window.localStorage.setItem(CHAT_USERS_CACHE_KEY, JSON.stringify(list));
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
    setLoadingMsgs(mensajesCountRef.current === 0);
    setHasMore(true); lastAt.current=null;
    try {
      const h = await hdr();
      const res = await fetch(`/api/chat/canales/${canal.id}/mensajes`, { headers: h });
      const d = await safeJson(res);
      if (res.ok) {
        const msgs: Mensaje[] = d.data||[];
        setMensajes(msgs);
        setFirstUnreadMarkerId(() => {
          if (initialUnreadCount <= 0 || initialUnreadCount > msgs.length) return null;
          return msgs[msgs.length - initialUnreadCount]?.id ?? null;
        });
        if (msgs.length) lastAt.current = msgs[msgs.length-1].created_at;
        if (msgs.length<60) setHasMore(false);
        setTimeout(() => scrollToBottom("instant"), 80);
        await fetch(`/api/chat/canales/${canal.id}/leido`, { method:"PUT", headers: h });
        clearUnread(canal.id, canal.dm_target_user_id);
        void refreshUnread();
      }
    } finally {
      fetchMensajesInFlightRef.current = false;
      setLoadingMsgs(false);
    }
  }, [clearUnread, hdr, initialUnreadCount, refreshUnread]);

  // ── Fetch miembros canal
  const fetchMiembros = useCallback(async (canalId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/canales/${canalId}/miembros`, { headers: h });
    const d = await safeJson(res);
    if (res.ok) setMiembros(d.data||[]);
  }, [hdr]);

  // ── Poll mensajes
  const pollMensajes = useCallback(async () => {
    if (!canalActivoId || !lastAt.current || fetchMensajesInFlightRef.current || pollMensajesInFlightRef.current) return;
    pollMensajesInFlightRef.current = true;
    try {
      const h = await hdr();
      const since = encodeURIComponent(lastAt.current);
      const res = await fetch(`/api/chat/canales/${canalActivoId}/mensajes?since=${since}`, { headers: h });
      const d = await safeJson(res);
      if (!res.ok || !d.data?.length) return;
      const nuevos: Mensaje[] = d.data;
      let freshCount = 0;
      setMensajes(prev => {
        const ids = new Set(prev.map(m=>m.id));
        const fresh = nuevos.filter(m=>!ids.has(m.id));
        freshCount = fresh.length;
        const incomingFreshIds = fresh.filter(m => m.user_id !== currentUserId).map(m => m.id);
        if (incomingFreshIds.length) markFreshIncomingMessages(incomingFreshIds);
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      if (freshCount === 0) return;
      const latestMsg = nuevos[nuevos.length-1];
      lastAt.current = latestMsg.created_at;
      setCanales(prev => prev.map(c => c.id === canalActivoId ? {
        ...c,
        ultimo_mensaje: latestMsg.contenido,
        ultimo_mensaje_autor: latestMsg.user_name,
        ultimo_mensaje_at: latestMsg.created_at,
      } : c));
      if (atBottom.current) {
        setTimeout(() => scrollToBottom("smooth"), 60);
        await fetch(`/api/chat/canales/${canalActivoId}/leido`, { method:"PUT", headers: h });
        clearUnread(canalActivoId, canalActivoDmTargetId);
        void refreshUnread();
      } else {
        setNewMsgCount(c=>c+freshCount);
      }
    } finally {
      pollMensajesInFlightRef.current = false;
    }
  }, [canalActivoDmTargetId, canalActivoId, clearUnread, currentUserId, hdr, markFreshIncomingMessages, refreshUnread]);

  // ── Scroll helpers
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    if (behavior === "instant") {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    atBottom.current = true;
    setNewMsgCount(0);
  };
  const onScroll = () => {
    const el = listRef.current; if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom.current) setNewMsgCount(0);
    if (el.scrollTop < 100 && hasMore && !loadingMore) loadMore();
  };
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
          const el = listRef.current;
          const prevH = el?.scrollHeight||0;
          setMensajes(prev=>[...older,...prev]);
          setTimeout(()=>{ if(el) el.scrollTop = el.scrollHeight-prevH; },0);
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
  useEffect(() => { fetchMensajesRef.current = fetchMensajes; }, [fetchMensajes]);
  useEffect(() => { fetchMiembrosRef.current = fetchMiembros; }, [fetchMiembros]);
  useEffect(() => { fetchTypingUsersRef.current = fetchTypingUsers; }, [fetchTypingUsers]);
  useEffect(() => { pollMensajesRef.current = pollMensajes; }, [pollMensajes]);

  // ── Effects: carga inicial — usa los refs para no depender de fetchCanales (estable con hdr)
  useEffect(() => {
    if (!authLoaded || !userLoaded || !currentUserId) return;
    void Promise.all([fetchCanalesRef.current(), fetchSysUsersRef.current()]);
  }, [authLoaded, userLoaded, currentUserId]); // fetchCanales/fetchSysUsers ya NO son deps — los refs son estables
  // El intervalo de polling de canales se monta UNA sola vez y nunca se resetea
  // Los no-leídos se sincronizan desde ChatUnreadContext (App.tsx) — sin poll duplicado aquí
  useEffect(() => {
    if (!canalActivo) {
      setTypingUsers([]);
      return;
    }
    void fetchMensajesRef.current(canalActivo);
    void fetchMiembrosRef.current(canalActivo.id);
    void fetchTypingUsersRef.current(canalActivo.id);
    if (pollRef.current) clearInterval(pollRef.current);
    if (typingPollRef.current) clearInterval(typingPollRef.current);
    pollRef.current = setInterval(() => { void pollMensajesRef.current(); }, activePollMs);
    typingPollRef.current = setInterval(() => { void fetchTypingUsersRef.current(canalActivo.id); }, typingPollMs);
    return ()=>{
      if(pollRef.current) clearInterval(pollRef.current);
      if(typingPollRef.current) clearInterval(typingPollRef.current);
    };
  }, [canalActivoId, activePollMs, typingPollMs]);
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => { void pollMensajesRef.current(); }, activePollMs);
    }
  }, [activePollMs]);
  useEffect(() => {
    if (!canalActivo || !typingPollRef.current) return;
    clearInterval(typingPollRef.current);
    typingPollRef.current = setInterval(() => { void fetchTypingUsersRef.current(canalActivo.id); }, typingPollMs);
  }, [canalActivoId, typingPollMs]);
  useEffect(() => {
    if (rightPanel === "members" && canalActivo) void fetchMiembros(canalActivo.id);
  }, [rightPanel, canalActivo, fetchMiembros]);
  useEffect(() => {
    if (!authLoaded || !userLoaded || !currentUserId) return;
    const handleForegroundRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([
        fetchCanalesRef.current(),
        fetchSysUsersRef.current(),
        refreshUnread(),
        canalActivo ? fetchTypingUsersRef.current(canalActivo.id) : Promise.resolve(),
        canalActivo ? (lastAt.current ? pollMensajesRef.current() : fetchMensajesRef.current(canalActivo)) : Promise.resolve(),
      ]);
    };
    window.addEventListener("focus", handleForegroundRefresh);
    document.addEventListener("visibilitychange", handleForegroundRefresh);
    return () => {
      window.removeEventListener("focus", handleForegroundRefresh);
      document.removeEventListener("visibilitychange", handleForegroundRefresh);
    };
  }, [authLoaded, userLoaded, currentUserId, refreshUnread, canalActivoId]);

  // Cuando el contexto detecta un canal con no-leídos que no está en la lista local
  // (caso DM recibido antes de que fetchCanales corra) → refrescar inmediatamente
  useEffect(() => {
    if (!canalActivo) return;
    const syncInterval = window.setInterval(() => {
      if (!document.hidden && !fetchMensajesInFlightRef.current && !loadMoreInFlightRef.current) {
        void fetchMensajesRef.current(canalActivo);
      }
    }, 15000);
    return () => window.clearInterval(syncInterval);
  }, [canalActivoId]);

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
    setIsSwitchingChat(true);
    setFreshIncomingMessageIds(new Set());
    const unreadAtOpen = getUnreadCountForCanal(c);
    setInitialUnreadCount(unreadAtOpen);
    setFirstUnreadMarkerId(null);
    setShowChannelMenu(false);
    clearUnread(c.id, c.dm_target_user_id);                 // badge desaparece al instante
    setCanales(prev => prev.map(x => x.id===c.id ? {...x, no_leidos:0} : x));
    setCanalActivo(c);
    setMensajes([]); setReplyTo(null); setEditingMsg(null);
    setRightPanel(null); setNewMsgCount(0);
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
      return;
    }
    void fetchFavorites(canalActivo.id);
  }, [canalActivoId, fetchFavorites]);

  const handleSend = async (text: string, gifUrl?: string, replyId?: string, editId?: string, imageUrl?: string) => {
    if (editId) {
      const h = await hdr();
      const res = await fetch(`/api/chat/mensajes/${editId}`, {
        method:"PUT", headers: h, body: JSON.stringify({ contenido: text }),
      });
      const d = await safeJson(res);
      if (res.ok) setMensajes(prev=>prev.map(m=>m.id===editId?{...m,...d.data,editado:true}:m));
      setEditingMsg(null); return;
    }
    if (!canalActivo) return;
    const h = await hdr();
    const body: Record<string,any> = { contenido: text || (gifUrl ? "GIF" : imageUrl ? IMAGE_PLACEHOLDER_TEXT : "") };
    if (gifUrl) body.gif_url = gifUrl;
    if (imageUrl) body.image_url = imageUrl;
    if (replyId) body.reply_to_id = replyId;
    const res = await fetch(`/api/chat/canales/${canalActivo.id}/mensajes`, {
      method:"POST", headers: h, body: JSON.stringify(body),
    });
    const d = await safeJson(res);
    if (res.ok) {
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
      setTimeout(() => scrollToBottom("smooth"), 60);
      setReplyTo(null);
      clearUnread(canalActivo.id, canalActivo.dm_target_user_id);
      void refreshUnread();
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/mensajes/${msgId}/reacciones`, {
      method:"POST", headers: h, body: JSON.stringify({ emoji }),
    });
    const d = await safeJson(res);
    if (!res.ok) return;
    setMensajes(prev=>prev.map(m=>{
      if (m.id!==msgId) return m;
      const reac = m.reacciones||[];
      if (d.data.action==="removed") {
        return {...m, reacciones: reac.filter(r=>!(r.emoji===emoji&&r.user_id===currentUserId))};
      }
      const alreadyExists = reac.some(r => r.emoji === emoji && r.user_id === currentUserId);
      if (alreadyExists) return m;
      return {
        ...m,
        reacciones:[...reac,{emoji, user_id:currentUserId, user_name: user?.fullName||user?.username||"Tú"}],
      };
    }));
  };

  const handleDelete = async (msgId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/mensajes/${msgId}`, { method:"DELETE", headers: h });
    if (res.ok) setMensajes(prev=>prev.map(m=>m.id===msgId?{...m,deleted_at:new Date().toISOString()}:m));
  };

  const handlePin = async (msgId: string) => {
    if (!canalActivo) return;
    const h = await hdr();
    await fetch(`/api/chat/canales/${canalActivo.id}/fijar/${msgId}`, { method:"POST", headers: h });
  };

  const handleFavorite = async (msgId: string) => {
    const h = await hdr();
    const res = await fetch(`/api/chat/mensajes/${msgId}/favorito`, { method:"POST", headers: h });
    const d = await safeJson(res);
    if (!res.ok) return;
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (d.data?.action === "removed") next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

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

  const handleStatusChange = async (s: string) => {
    setMyStatus(s); setShowStatus(false);
    const h = await hdr();
    await fetch("/api/chat/me/status", { method:"PUT", headers: h, body: JSON.stringify({ status:s }) });
  };

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
  const statusCfg         = STATUS_CFG[myStatus]||STATUS_CFG.disponible;
  const getUnreadCountForCanal = useCallback((canal?: Canal) => {
    if (!canal) return 0;
    if (!unreadLoaded) return canal.no_leidos ?? 0;
    return unreadByCanal[canal.id] ?? 0;
  }, [unreadByCanal, unreadLoaded]);

  useEffect(() => {
    const dmUserIds = canalDMs
      .map(c => c.dm_target_user_id || c.id)
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
      .map(c => {
        const dmUserId = c.dm_target_user_id || c.id;
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

  const mensajesConSep = useMemo(()=>{
    const r: (Mensaje|{__sep:true;key:string;date:string})[] = [];
    let lastD = "";
    for (const m of mensajes) {
      const d = new Date(m.created_at).toDateString();
      if (d!==lastD) { r.push({__sep:true, key:`s${m.id}`, date:m.created_at}); lastD=d; }
      r.push(m);
    }
    return r;
  }, [mensajes]);

  const firstUnreadMessageId = firstUnreadMarkerId;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-[calc(100vh-72px)] overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] animate-in fade-in duration-300">

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside className="w-64 shrink-0 flex flex-col bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.2),_transparent_28%),linear-gradient(180deg,_#0f172a_0%,_#111827_46%,_#020617_100%)] rounded-l-[1.6rem] overflow-hidden border-r border-white/10">

        {/* Workspace header — estilo Slack */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 shrink-0 backdrop-blur-sm">
          <button className="flex items-center gap-2 min-w-0 flex-1 hover:bg-white/5 rounded-xl px-2.5 py-2 transition-all duration-200 group">
            <div className="w-9 h-9 rounded-2xl bg-[#ab0433] flex items-center justify-center shrink-0 shadow-lg shadow-red-950/30 text-white font-black text-sm">
              V
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1">
                <span className="text-white font-bold text-sm truncate leading-none">Despacho</span>
                <ChevronDown size={13} className="text-slate-400 group-hover:text-slate-300 shrink-0"/>
              </div>
              {totalUnread > 0 && (
                <p className="text-slate-400 text-[10px] leading-none mt-0.5">{totalUnread} sin leer</p>
              )}
            </div>
          </button>
          <button title="Nuevo mensaje" onClick={()=>setShowCrear(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-200 shrink-0 border border-white/10">
            <Pencil size={15}/>
          </button>
        </div>
        {/* Buscador de canales + crear */}
        <div className="px-3 py-3 border-b border-white/10 shrink-0 backdrop-blur-sm">
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              {canalSearching
                ?<Loader2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 animate-spin"/>
                :<Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
              }
              <input
                value={canalQ}
                onChange={e=>setCanalQ(e.target.value)}
                placeholder="Buscar canales…"
              className="w-full bg-white/5 hover:bg-white/[0.07] border border-white/10 text-slate-200 text-xs pl-7 pr-2 py-2.5 rounded-xl outline-none placeholder-slate-500 focus:ring-2 focus:ring-[#ab0433]/30 focus:border-[#ab0433]/30 transition-all"
              />
              {canalQ&&<button onClick={()=>{setCanalQ("");setCanalResults([]);}} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={11}/></button>}
            </div>
            <button onClick={()=>setShowCrear(true)} title="Crear canal"
              className="w-9 h-9 flex items-center justify-center bg-[#ab0433] hover:bg-[#92042c] text-white rounded-xl transition-all duration-200 shrink-0 shadow-lg shadow-red-950/30">
              <Plus size={14}/>
            </button>
          </div>
          {/* Resultados de búsqueda */}
          {canalQ.trim()&&(
            <div className="mt-2 space-y-0.5">
              {canalResults.length===0&&!canalSearching&&(
                <p className="text-slate-500 text-xs px-2 py-1.5">Sin resultados</p>
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
          <nav className="flex-1 overflow-y-auto py-1 px-2 space-y-0.5">

            {/* ── Canales ── */}
            <div className="pt-2">
              {(() => {
                const totalUnreadCanales = [...canalesPublicos,...canalesPrivados].reduce((acc,c)=>acc+getUnreadCountForCanal(c),0);
                return (
                  <button onClick={()=>setSecOpen(s=>({...s,canales:!s.canales}))}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-slate-400 hover:text-slate-200 text-[11px] font-semibold transition-colors rounded-md hover:bg-slate-800/50 group">
                    <ChevronDown size={13} className={`transition-transform shrink-0 ${secOpen.canales?"":"−rotate-90"}`}/>
                    <Layers size={12} className="shrink-0 text-slate-500 group-hover:text-slate-300"/>
                    <span className="flex-1 text-left">Canales</span>
                    {!secOpen.canales && totalUnreadCanales>0 && (
                      <span className="shrink-0 bg-[#ab0433] text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold">
                        {totalUnreadCanales>99?"99+":totalUnreadCanales}
                      </span>
                    )}
                  </button>
                );
              })()}
              {secOpen.canales&&(
                <div className="mt-0.5 space-y-px">
                  {[...canalesPublicos,...canalesPrivados].map(c=>(
                    <CanalItem
                      key={c.id}
                      canal={c}
                      activo={canalActivo?.id===c.id}
                      unreadCount={getUnreadCountForCanal(c)}
                      onClick={()=>seleccionar(c)}
                    />
                  ))}
                  {canalesPublicos.length+canalesPrivados.length===0&&(
                    <p className="text-slate-600 text-xs px-4 py-1">Sin canales aún</p>
                  )}
                  {/* Añadir canales */}
                  <button onClick={()=>setShowCrear(true)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors text-xs group">
                    <div className="w-5 h-5 rounded-md bg-slate-700 group-hover:bg-slate-600 flex items-center justify-center shrink-0 transition-colors">
                      <Plus size={11} className="text-slate-400 group-hover:text-slate-200"/>
                    </div>
                    Añadir canales
                  </button>
                </div>
              )}
            </div>

            {/* ── Mensajes directos ── */}
            <div className="pt-1">
              {(() => {
                const totalUnreadDMs = dmConversationEntries.reduce((acc, entry) => acc + entry.unreadCount, 0);
                return (
                  <button onClick={()=>setSecOpen(s=>({...s,dms:!s.dms}))}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-slate-400 hover:text-slate-200 text-[11px] font-semibold transition-colors rounded-md hover:bg-slate-800/50 group">
                    <ChevronDown size={13} className={`transition-transform shrink-0 ${secOpen.dms?"":"−rotate-90"}`}/>
                    <MessagesSquare size={12} className="shrink-0 text-slate-500 group-hover:text-slate-300"/>
                    <span className="flex-1 text-left">Mensajes directos</span>
                    {!secOpen.dms && totalUnreadDMs>0 && (
                      <span className="shrink-0 bg-[#ab0433] text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold">
                        {totalUnreadDMs>99?"99+":totalUnreadDMs}
                      </span>
                    )}
                  </button>
                );
              })()}
              {secOpen.dms&&(
                <div className="mt-0.5 space-y-px">
                  {dmConversationEntries.length===0 && dmProspectUsers.length===0 && (
                    <p className="text-slate-600 text-xs px-4 py-1">Cargando usuarios…</p>
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
                        onClick={()=>{ if (dmCanal) seleccionar(dmCanal); else handleDMUser(u); }}
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
                    />
                  ))}
                  {/* Invitar a otros */}
                  <button className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors text-xs group">
                    <div className="w-5 h-5 rounded-md bg-slate-700 group-hover:bg-slate-600 flex items-center justify-center shrink-0 transition-colors">
                      <UserPlus size={11} className="text-slate-400 group-hover:text-slate-200"/>
                    </div>
                    Invitar a otros
                  </button>
                </div>
              )}
            </div>
          </nav>
        )}

        {/* Footer usuario */}
        <div className="px-3 py-3 border-t border-slate-700/50 shrink-0 relative">
          <button onClick={()=>setShowStatus(v=>!v)}
            className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800 transition-colors group">
            <div className="relative shrink-0">
              <Av url={user?.imageUrl} name={user?.fullName||"Tú"} size={8}/>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${statusCfg.color}`}/>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-semibold truncate">{user?.fullName||"Tú"}</p>
              <p className="text-slate-400 text-[10px] truncate">{statusCfg.label}</p>
            </div>
            <Settings size={13} className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0"/>
          </button>
          {showStatus&&<StatusSelector current={myStatus} onSelect={handleStatusChange} onClose={()=>setShowStatus(false)}/>}
        </div>
      </aside>

      {/* ══ MAIN AREA ════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(248,250,252,0.96)_100%)] backdrop-blur-sm">
        {!canalActivo?(
          <div className="flex flex-col items-center justify-center flex-1 gap-5 bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.15),_transparent_30%),linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(241,245,249,0.9))]">
            <div className="w-20 h-20 rounded-[1.7rem] bg-white shadow-lg border border-slate-200 flex items-center justify-center">
              <MessageSquare size={30} className="text-[#ab0433]"/>
            </div>
            <div className="text-center">
              <p className="text-slate-800 font-bold text-xl">Selecciona un chat</p>
              <p className="text-slate-500 text-sm mt-1">Cambia de canal, revisa un DM o crea uno nuevo para empezar</p>
            </div>
            <button onClick={()=>setShowCrear(true)}
              className="flex items-center gap-2 px-5 py-3 bg-[#ab0433] hover:bg-[#92042c] text-white rounded-2xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-red-200">
              <Plus size={16}/> Crear canal
            </button>
          </div>
        ):(
          <>
            {/* Canal header */}
            <div className={`flex items-center gap-3 px-5 py-3.5 border-b border-slate-200/80 shrink-0 bg-white/75 backdrop-blur transition-all duration-200 ${isSwitchingChat ? "translate-y-1 opacity-70" : "translate-y-0 opacity-100"}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {canalActivo.tipo==="privado"
                  ?<Lock size={16} className="text-slate-400 shrink-0"/>
                  :canalActivo.tipo==="directo"
                  ?<MessageSquare size={16} className="text-slate-400 shrink-0"/>
                  :<Hash size={16} className="text-slate-400 shrink-0"/>}
                <span className="font-bold text-slate-800 text-sm">{canalActivo.nombre}</span>
                {canalActivo.tipo!=="directo"&&(
                  <span className="hidden sm:flex items-center gap-0.5 text-slate-400 text-xs bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                    <Users size={10}/> {canalActivo.total_miembros}
                  </span>
                )}
                {canalActivo.descripcion&&(
                  <>
                    <span className="text-slate-200 hidden md:block">·</span>
                    <span className="text-slate-400 text-xs truncate hidden md:block">{canalActivo.descripcion}</span>
                  </>
                )}
              </div>
              <div className="relative flex items-center gap-0.5 shrink-0">
                <button onClick={()=>setRightPanel(v=>v==="pinned"?null:"pinned")} title="Mensajes fijados"
                  className={`p-2 rounded-xl transition-all duration-200 ${rightPanel==="pinned"?"bg-red-50 text-red-500 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                  <Pin size={15}/>
                </button>
                <button onClick={()=>setRightPanel(v=>v==="favorites"?null:"favorites")} title="Favoritos"
                  className={`p-2 rounded-xl transition-all duration-200 ${rightPanel==="favorites"?"bg-amber-50 text-amber-500 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-amber-500"}`}>
                  <Star size={15} className={rightPanel==="favorites" ? "fill-amber-300" : ""}/>
                </button>
                <button onClick={()=>setRightPanel(v=>v==="members"?null:"members")} title="Miembros"
                  className={`p-2 rounded-xl transition-all duration-200 ${rightPanel==="members"?"bg-slate-100 text-slate-700 shadow-sm":"text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                  <Users size={15}/>
                </button>
                <button onClick={()=>setShowChannelMenu(v=>!v)} title="Acciones del canal"
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
                  />
                )}
              </div>
            </div>

            {/* Messages + right panels */}
            <div className={`flex flex-1 overflow-hidden transition-all duration-200 ${isSwitchingChat ? "opacity-70 translate-y-2" : "opacity-100 translate-y-0"}`}>
              {/* Messages list */}
              <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
                <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto pb-1 bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.08),_transparent_22%),linear-gradient(180deg,_transparent,_rgba(248,250,252,0.75))]">
                  {loadingMore&&<div className="flex justify-center py-2"><Loader2 className="animate-spin text-slate-300" size={16}/></div>}
                  {!hasMore&&mensajes.length>0&&(
                    <p className="text-center text-xs text-slate-300 py-3 select-none">
                      ― Inicio de #{canalActivo.nombre} ―
                    </p>
                  )}
                  {loadingMsgs?(
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                      <div className="rounded-2xl bg-white/90 px-5 py-4 shadow-sm border border-slate-200 flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin text-slate-300" size={24}/>
                        <p className="text-xs text-slate-400">Cargando mensajes…</p>
                      </div>
                    </div>
                  ):mensajes.length===0?(
                    <div className="flex flex-col items-center justify-center h-full py-16 px-8 gap-4 text-center animate-in fade-in zoom-in-95 duration-300">
                      <div className="w-20 h-20 rounded-[1.7rem] bg-white border border-slate-200 shadow-lg flex items-center justify-center text-4xl">💬</div>
                      <p className="font-bold text-slate-800 text-lg">
                        ¡Empieza la conversación en <span className="text-[#ab0433]">#{canalActivo.nombre}</span>!
                      </p>
                      {canalActivo.descripcion&&<p className="text-slate-500 text-sm max-w-md">{canalActivo.descripcion}</p>}
                      <p className="text-slate-400 text-xs">Sé el primero en escribir ✨</p>
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
                            <div className="sticky top-0 z-10 px-4 py-2 bg-gradient-to-b from-white/95 via-white/90 to-transparent backdrop-blur-sm">
                              <div className="flex items-center gap-3">
                                <div className="h-px flex-1 bg-red-200" />
                                <span className="shrink-0 rounded-full bg-[#ab0433]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#ab0433] border border-[#ab0433]/20">
                                  Mensajes nuevos
                                </span>
                                <div className="h-px flex-1 bg-red-200" />
                              </div>
                            </div>
                          )}
                          <MensajeItem msg={m} prevMsg={prevMsg}
                            currentUserId={currentUserId} isHighlighted={highlightId===m.id}
                            isFreshIncoming={freshIncomingMessageIds.has(m.id)}
                            onReply={setReplyTo} onReact={handleReact}
                            onEdit={setEditingMsg} onDelete={handleDelete} onPin={handlePin} onFavorite={handleFavorite}
                            isFavorite={favoriteIds.has(m.id)}
                            resolveDisplayName={resolveDisplayName}
                            resolveAvatarUrl={resolveAvatarUrl}
                          />
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

                {newMsgCount>0&&(
                  <button
                    onClick={() => scrollToBottom("smooth")}
                    style={{ bottom: composerHeight + 16 }}
                    className="absolute left-1/2 z-20 -translate-x-1/2 flex items-center gap-2 bg-[#ab0433] hover:bg-[#92042c] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl shadow-red-200 transition-all animate-in fade-in zoom-in-95 duration-200"
                  >
                    <ChevronDown size={13}/>
                    {newMsgCount} nuevo{newMsgCount!==1?"s":""} mensaje{newMsgCount!==1?"s":""}
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
                    canalId={canalActivo.id}
                    canalNombre={canalActivo.nombre}
                    replyTo={replyTo}
                    editingMsg={editingMsg}
                    miembros={miembros}
                    currentUserId={currentUserId}
                    resolveDisplayName={resolveDisplayName}
                    onTypingChange={updateTypingStatus}
                    onSend={handleSend}
                    onCancelReply={()=>setReplyTo(null)}
                    onCancelEdit={()=>setEditingMsg(null)}
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
                />
              )}
              {rightPanel==="pinned"&&(
                <PanelFijados
                  canalId={canalActivo.id}
                  getToken={getToken}
                  onClose={()=>setRightPanel(null)}
                  onGoTo={goToMsg}
                  resolveDisplayName={resolveDisplayName}
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
    </div>
  );
}
