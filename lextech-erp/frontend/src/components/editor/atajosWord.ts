import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { idioma } from "../../lib/i18n";

// ══════════════════════════════════════════════════════════════════════════════
// Atajos de teclado de Word (20/11/2026). Los mismos que Word:
//  · Word en español (Windows): sacados del propio Word instalado
//    (Application.FindKey de cada combinación): Ctrl+N negrita, Ctrl+K
//    cursiva, Ctrl+S subrayado, Ctrl+T centrar, Ctrl+G guardar, Ctrl+B
//    buscar, Ctrl+L reemplazar, Ctrl+E seleccionar todo…
//  · Word en inglés (y Word para Mac en cualquier idioma, con ⌘): Ctrl+B,
//    Ctrl+I, Ctrl+U, Ctrl+E centrar, Ctrl+S guardar, Ctrl+F buscar…
// Se usa la tabla del idioma de Vantia (o la de Mac). Los atajos propios de
// TipTap que Word no tiene se anulan, para que no hagan nada inesperado.
// Ojo: Chrome y Edge no dejan a ninguna web usar Ctrl+N, Ctrl+T ni Ctrl+W
// (ventana, pestaña, cerrar) salvo en pantalla completa con el teclado
// bloqueado (ver modoWord en EditorTexto).
// ══════════════════════════════════════════════════════════════════════════════

export type Accion =
  | "negrita" | "cursiva" | "subrayado" | "subindice" | "superindice" | "resaltar"
  | "centrar" | "izquierda" | "derecha" | "justificar" | "sangria" | "quitarSangria"
  | "interlineado1" | "interlineado2" | "interlineado15" | "borrarFormatoCaracter" | "borrarFormatoParrafo"
  | "agrandar" | "achicar" | "agrandar1" | "achicar1" | "titulo1" | "titulo2" | "titulo3" | "normal" | "vinetas"
  | "enlace" | "copiarFormato" | "pegarFormato" | "saltoPagina" | "seleccionarTodo"
  | "buscar" | "reemplazar" | "guardar" | "imprimir" | "nuevo" | "abrir"
  | "zoomMas" | "zoomMenos" | "zoom100" | "contarPalabras" | "fuente" | "tamano" | "deshacer" | "rehacer";

// Claves: modificadores (Ctrl, Mayús, Alt) + tecla. Letras y números por su
// posición; los símbolos, por el carácter que sale (con Mayús, el de arriba).
const ES: Record<string, Accion> = {
  "Ctrl+N": "negrita", "Ctrl+Mayús+N": "negrita", "Ctrl+K": "cursiva", "Ctrl+Mayús+K": "cursiva",
  "Ctrl+S": "subrayado", "Ctrl+Mayús+S": "subrayado",
  "Ctrl+Mayús+-": "subindice", "Ctrl+Mayús+=": "subindice", "Ctrl+Mayús++": "superindice", "Ctrl+Alt+H": "resaltar",
  "Ctrl+T": "centrar", "Ctrl+Q": "izquierda", "Ctrl+D": "derecha", "Ctrl+J": "justificar",
  "Ctrl+H": "sangria", "Ctrl+Mayús+R": "quitarSangria",
  "Ctrl+1": "interlineado1", "Ctrl+2": "interlineado2", "Ctrl+5": "interlineado15",
  "Ctrl+Espacio": "borrarFormatoCaracter", "Ctrl+Mayús+Z": "borrarFormatoCaracter", "Ctrl+W": "borrarFormatoParrafo",
  "Ctrl+Mayús+<": "agrandar", "Ctrl+<": "achicar", "Ctrl+Alt+<": "achicar1",
  "Ctrl+Mayús+1": "titulo1", "Ctrl+Mayús+2": "titulo2", "Ctrl+Mayús+3": "titulo3", "Ctrl+Mayús+A": "normal", "Ctrl+Mayús+I": "vinetas",
  "Ctrl+Alt+K": "enlace", "Ctrl+Alt+C": "copiarFormato", "Ctrl+Alt+V": "pegarFormato", "Ctrl+Intro": "saltoPagina",
  "Ctrl+E": "seleccionarTodo", "Ctrl+B": "buscar", "Ctrl+I": "buscar", "Ctrl+L": "reemplazar",
  "Ctrl+G": "guardar", "Ctrl+P": "imprimir", "Ctrl+Alt+I": "imprimir", "Ctrl+U": "nuevo", "Ctrl+A": "abrir",
  "Ctrl++": "zoomMas", "Ctrl+-": "zoomMenos", "Ctrl+0": "zoom100",
  "Ctrl+Mayús+G": "contarPalabras", "Ctrl+M": "fuente", "Ctrl+Mayús+F": "fuente", "Ctrl+Mayús+M": "tamano",
  "Ctrl+Z": "deshacer", "Ctrl+Y": "rehacer",
};
const EN: Record<string, Accion> = {
  "Ctrl+B": "negrita", "Ctrl+I": "cursiva", "Ctrl+U": "subrayado",
  "Ctrl+=": "subindice", "Ctrl+Mayús++": "superindice", "Ctrl+Mayús+=": "superindice", "Ctrl+Alt+H": "resaltar",
  "Ctrl+E": "centrar", "Ctrl+L": "izquierda", "Ctrl+R": "derecha", "Ctrl+J": "justificar",
  "Ctrl+M": "sangria", "Ctrl+Mayús+M": "quitarSangria",
  "Ctrl+1": "interlineado1", "Ctrl+2": "interlineado2", "Ctrl+5": "interlineado15",
  "Ctrl+Espacio": "borrarFormatoCaracter", "Ctrl+Q": "borrarFormatoParrafo",
  "Ctrl+Mayús+.": "agrandar", "Ctrl+Mayús+,": "achicar", "Ctrl+]": "agrandar1", "Ctrl+[": "achicar1",
  "Ctrl+Alt+1": "titulo1", "Ctrl+Alt+2": "titulo2", "Ctrl+Alt+3": "titulo3", "Ctrl+Mayús+N": "normal", "Ctrl+Mayús+L": "vinetas",
  "Ctrl+K": "enlace", "Ctrl+Mayús+C": "copiarFormato", "Ctrl+Mayús+V": "pegarFormato", "Ctrl+Intro": "saltoPagina",
  "Ctrl+F": "buscar", "Ctrl+G": "buscar", "Ctrl+H": "reemplazar",
  "Ctrl+S": "guardar", "Ctrl+P": "imprimir", "Ctrl+N": "nuevo", "Ctrl+O": "abrir",
  "Ctrl+Mayús+G": "contarPalabras", "Ctrl+D": "fuente", "Ctrl+Mayús+F": "fuente", "Ctrl+Mayús+P": "tamano",
  "Ctrl+Z": "deshacer", "Ctrl+Y": "rehacer",
};
// Atajos de TipTap que Word no tiene: se anulan dentro del documento.
const DE_TIPTAP = [
  "Ctrl+B", "Ctrl+I", "Ctrl+U", "Ctrl+E", "Ctrl+Mayús+S", "Ctrl+Mayús+X", "Ctrl+Mayús+H", "Ctrl+,", "Ctrl+.", "Ctrl+Mayús+B",
  "Ctrl+Mayús+7", "Ctrl+Mayús+8", "Ctrl+Mayús+9", "Ctrl+Alt+0", "Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3", "Ctrl+Alt+4",
  "Ctrl+Alt+5", "Ctrl+Alt+6", "Ctrl+Alt+C", "Ctrl+Mayús+L", "Ctrl+Mayús+E", "Ctrl+Mayús+R", "Ctrl+Mayús+J",
  "Ctrl+F", "Ctrl+M", "Ctrl+Mayús+M",
];

export const esMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const tabla = () => (esMac() || idioma() === "en" ? EN : ES);
/** Teclas que Chrome/Edge se quedan siempre (salvo pantalla completa con teclado bloqueado). */
export const RESERVADAS_NAVEGADOR = new Set(["Ctrl+N", "Ctrl+T", "Ctrl+W", "Ctrl+Mayús+N", "Ctrl+Mayús+T", "Ctrl+Mayús+W"]);

/** «Ctrl+Mayús+R» → cómo se escribe en este equipo/idioma (⌘⇧R en Mac, Ctrl+Shift+R en inglés). */
function mostrar(clave: string): string {
  if (esMac()) return clave.replace("Ctrl+", "⌘").replace("Mayús+", "⇧").replace("Alt+", "⌥").replace("Intro", "↩").replace("Espacio", "Space");
  return idioma() === "en" ? clave.replace("Mayús", "Shift").replace("Intro", "Enter").replace("Espacio", "Space") : clave;
}

/** El atajo de una acción en el Word que corresponde (el primero si hay varios). */
export function teclaDe(accion: Accion): string | null {
  const clave = Object.keys(tabla()).find((k) => tabla()[k] === accion);
  return clave ? mostrar(clave) : null;
}

const SHIFT_ES: Record<string, string> = { ">": "<", "_": "-", "*": "+", "!": "1", '"': "2", "·": "3", "$": "4", "%": "5", "&": "6", "/": "7", "(": "8", ")": "9", "=": "=" };
const SHIFT_EN: Record<string, string> = { ">": ".", "<": ",", "_": "-", "+": "+", "{": "[", "}": "]", "!": "1", "@": "2", "#": "3" };

/** Las claves con las que puede ir esta pulsación (por la tecla física y por el carácter). */
export function clavesDe(e: KeyboardEvent): string[] {
  const mod = esMac() ? e.metaKey : e.ctrlKey;
  if (!mod) return [];
  // AltGr en Windows llega como Ctrl+Alt: si escribe un carácter (€, @, #, |…), no es un atajo.
  if (!esMac() && e.ctrlKey && e.altKey && e.key.length === 1 && !/^[a-z0-9<]$/i.test(e.key)) return [];
  const pre = `Ctrl+${e.shiftKey ? "Mayús+" : ""}${e.altKey ? "Alt+" : ""}`;
  const out: string[] = [];
  const m = /^(Key([A-Z])|Digit(\d))$/.exec(e.code || "");
  if (m) out.push(pre + (m[2] || m[3]));
  if (e.code === "Space") out.push(pre + "Espacio");
  if (e.key === "Enter") out.push(pre + "Intro");
  if (e.key.length === 1) {
    const k = e.key;
    out.push(pre + k.toUpperCase());
    // Con Mayús, el carácter de arriba de la tecla → el de abajo (Ctrl+Mayús+< llega como «>»).
    const base = e.shiftKey ? (esMac() || idioma() === "en" ? SHIFT_EN : SHIFT_ES)[k] : undefined;
    if (base) out.push(pre + base);
  }
  return [...new Set(out)];
}

export function accionDe(e: KeyboardEvent): { accion: Accion | null; anular: boolean; clave: string | null } {
  const claves = clavesDe(e);
  const t = tabla();
  for (const c of claves) if (t[c]) return { accion: t[c], anular: true, clave: c };
  return { accion: null, anular: claves.some((c) => DE_TIPTAP.includes(c)), clave: null };
}

// ── Lo que hace cada acción ────────────────────────────────────────────────

export interface AtajosStorage {
  /** Acciones que pone la página o la barra (guardar, imprimir, buscar, fuente…). */
  acciones: Partial<Record<Accion, () => void>>;
  formatoCopiado: { type: string; attrs: Record<string, unknown> }[] | null;
}

const TAMANOS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72];
function tamanoActual(editor: Editor): number {
  const fs = (editor.getAttributes("textStyle") as { fontSize?: string }).fontSize;
  if (fs) return Number.parseFloat(fs);
  const h = editor.isActive("heading", { level: 1 }) ? 18 : editor.isActive("heading", { level: 2 }) ? 15 : editor.isActive("heading", { level: 3 }) ? 12.5 : 12;
  return h;
}

export function ejecutarAccion(editor: Editor, accion: Accion): boolean {
  const st = (editor.storage as any).atajosWord as AtajosStorage;
  const externa = st?.acciones?.[accion];
  if (externa) { externa(); return true; }
  const c = () => editor.chain().focus();
  switch (accion) {
    case "negrita": return c().toggleBold().run();
    case "cursiva": return c().toggleItalic().run();
    case "subrayado": return c().toggleUnderline().run();
    case "subindice": return c().unsetSuperscript().toggleSubscript().run();
    case "superindice": return c().unsetSubscript().toggleSuperscript().run();
    case "resaltar": return editor.isActive("highlight") ? c().unsetHighlight().run() : c().setHighlight({ color: "#fef08a" }).run();
    case "centrar": return c().setTextAlign("center").run();
    case "izquierda": return c().setTextAlign("left").run();
    case "derecha": return c().setTextAlign("right").run();
    case "justificar": return c().setTextAlign("justify").run();
    case "sangria": return c().cambiarSangria(1).run();
    case "quitarSangria": return c().cambiarSangria(-1).run();
    case "interlineado1": return c().setInterlineado("1").run();
    case "interlineado2": return c().setInterlineado("2").run();
    case "interlineado15": return c().setInterlineado("1.5").run();
    case "borrarFormatoCaracter": return c().unsetAllMarks().run();
    case "borrarFormatoParrafo": return c().quitarFormatoParrafo().unsetTextAlign().run();
    case "agrandar": case "achicar": case "agrandar1": case "achicar1": {
      const actual = tamanoActual(editor);
      let sig: number | undefined;
      if (accion === "agrandar1") sig = Math.min(1638, actual + 1);
      else if (accion === "achicar1") sig = Math.max(1, actual - 1);
      else sig = accion === "agrandar" ? TAMANOS.find((s) => s > actual) : [...TAMANOS].reverse().find((s) => s < actual);
      return sig ? c().setFontSize(`${sig}pt`).run() : true;
    }
    case "titulo1": return c().setHeading({ level: 1 }).run();
    case "titulo2": return c().setHeading({ level: 2 }).run();
    case "titulo3": return c().setHeading({ level: 3 }).run();
    case "normal": return c().setParagraph().run();
    case "vinetas": return c().toggleBulletList().run();
    case "copiarFormato":
      st.formatoCopiado = editor.state.selection.$from.marks().map((m) => ({ type: m.type.name, attrs: m.attrs }));
      return true;
    case "pegarFormato": {
      if (!st.formatoCopiado) return true;
      let cadena = c().unsetAllMarks();
      for (const m of st.formatoCopiado) cadena = cadena.setMark(m.type, m.attrs);
      return cadena.run();
    }
    case "saltoPagina": return c().insertarSaltoPagina().run();
    case "seleccionarTodo": return c().selectAll().run();
    case "deshacer": return c().undo().run() || true;
    case "rehacer": return c().redo().run() || true;
    default: return false; // acciones de la página/barra no disponibles aquí
  }
}

/** Acciones que tienen sentido aunque el cursor no esté en el documento. */
const GLOBALES = new Set<Accion>(["guardar", "imprimir", "nuevo", "abrir", "buscar", "reemplazar", "zoomMas", "zoomMenos", "zoom100", "contarPalabras"]);

/**
 * Atajos de Word fuera del documento (p. ej. con el foco en la barra o en el
 * título): solo los de documento entero (guardar, imprimir, buscar…).
 */
export function atajoGlobal(editor: Editor, e: KeyboardEvent): boolean {
  if (editor.view.dom.contains(e.target as globalThis.Node)) return false; // ya lo trata el plugin
  const { accion } = accionDe(e);
  if (!accion || !GLOBALES.has(accion)) return false;
  const objetivo = e.target as HTMLElement | null;
  const enCampo = !!objetivo?.closest?.("input, textarea, select, [contenteditable=true]");
  // En un campo de texto solo guardar e imprimir (Ctrl+B o Ctrl+E deben seguir funcionando ahí).
  if (enCampo && accion !== "guardar" && accion !== "imprimir") return false;
  return ejecutarAccion(editor, accion);
}

export const AtajosWord = Extension.create<Record<string, never>, AtajosStorage>({
  name: "atajosWord",
  // Antes que los atajos propios de TipTap (negrita en Ctrl+B, etc.).
  priority: 10000,

  addStorage() {
    return { acciones: {}, formatoCopiado: null };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      key: new PluginKey("vtAtajosWord"),
      props: {
        handleKeyDown(_view, e) {
          const { accion, anular } = accionDe(e);
          if (accion) {
            const hecho = ejecutarAccion(editor, accion);
            if (hecho || anular) e.preventDefault();
            return hecho || anular;
          }
          if (anular) { e.preventDefault(); return true; }
          return false;
        },
      },
    })];
  },
});
