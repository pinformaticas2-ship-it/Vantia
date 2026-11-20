import { Extension, Node, mergeAttributes, type Editor } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

// ══════════════════════════════════════════════════════════════════════════════
// Extensiones del editor de Documentos (20/11/2026) para acercarlo a Word.
// Todo lo que añaden se guarda como HTML con estilos en línea que html-to-docx
// sabe pasar a Word (comprobado en tests/documentos.test.ts del backend):
//   · line-height, margin-left (sangría) y text-indent (primera línea) en
//     párrafos y títulos;
//   · salto de página como <div class="page-break" style="page-break-after">.
// ══════════════════════════════════════════════════════════════════════════════

const PASO_SANGRIA = 48; // px ≈ 1,27 cm, el tabulador de Word
const MAX_SANGRIA = PASO_SANGRIA * 8;
const TIPOS = ["paragraph", "heading"];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    formatoParrafo: {
      setInterlineado: (valor: string | null) => ReturnType;
      cambiarSangria: (sentido: 1 | -1) => ReturnType;
      setPrimeraLinea: (px: number | null) => ReturnType;
      quitarFormatoParrafo: () => ReturnType;
    };
    saltoPagina: { insertarSaltoPagina: () => ReturnType };
    buscar: {
      setBusqueda: (termino: string, mayusculas?: boolean) => ReturnType;
      irAResultado: (indice: number) => ReturnType;
      reemplazarActual: (texto: string) => ReturnType;
      reemplazarTodo: (texto: string) => ReturnType;
    };
  }
}

const px = (v: string | null | undefined) => {
  const m = /^(-?[\d.]+)px$/.exec(String(v || "").trim());
  return m ? Math.round(Number(m[1])) : null;
};

/** Párrafos y títulos que toca la selección. */
function bloquesSeleccionados(editor: Editor) {
  const { from, to } = editor.state.selection;
  const out: { pos: number; node: PMNode }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (TIPOS.includes(node.type.name)) out.push({ pos, node });
  });
  return out;
}

export const FormatoParrafo = Extension.create({
  name: "formatoParrafo",

  addGlobalAttributes() {
    return [{
      types: TIPOS,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}),
        },
        sangria: {
          default: null,
          parseHTML: (el) => px(el.style.marginLeft),
          renderHTML: (a) => (a.sangria ? { style: `margin-left: ${a.sangria}px` } : {}),
        },
        primeraLinea: {
          default: null,
          parseHTML: (el) => px(el.style.textIndent),
          renderHTML: (a) => (a.primeraLinea ? { style: `text-indent: ${a.primeraLinea}px` } : {}),
        },
      },
    }];
  },

  addCommands() {
    const cambiar = (attrs: Record<string, unknown>) => ({ editor, tr, dispatch }: any) => {
      const bloques = bloquesSeleccionados(editor);
      if (!bloques.length) return false;
      if (dispatch) for (const b of bloques) tr.setNodeMarkup(b.pos, undefined, { ...b.node.attrs, ...attrs });
      return true;
    };
    return {
      setInterlineado: (valor) => cambiar({ lineHeight: valor }),
      setPrimeraLinea: (v) => cambiar({ primeraLinea: v }),
      quitarFormatoParrafo: () => cambiar({ lineHeight: null, sangria: null, primeraLinea: null }),
      cambiarSangria: (sentido) => ({ editor, tr, dispatch, commands }: any) => {
        // En una lista, la sangría sube o baja de nivel (como en Word).
        if (editor.isActive("listItem")) return sentido > 0 ? commands.sinkListItem("listItem") : commands.liftListItem("listItem");
        const bloques = bloquesSeleccionados(editor);
        if (!bloques.length) return false;
        if (dispatch) {
          for (const b of bloques) {
            const actual = Number(b.node.attrs.sangria) || 0;
            const nueva = Math.max(0, Math.min(MAX_SANGRIA, actual + sentido * PASO_SANGRIA));
            tr.setNodeMarkup(b.pos, undefined, { ...b.node.attrs, sangria: nueva || null });
          }
        }
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    const enTextoNormal = () => !this.editor.isActive("listItem") && !this.editor.isActive("table");
    return {
      // Tab al principio de un párrafo: sangría de primera línea (lo habitual
      // en escritos); en medio del texto, un espacio de tabulación.
      Tab: () => {
        if (!enTextoNormal()) return false;
        const { $from, empty } = this.editor.state.selection;
        if (empty && $from.parentOffset === 0 && !$from.parent.attrs.primeraLinea) {
          return this.editor.commands.setPrimeraLinea(PASO_SANGRIA);
        }
        return this.editor.commands.insertContent("  ");
      },
      "Shift-Tab": () => {
        if (!enTextoNormal()) return false;
        const { $from } = this.editor.state.selection;
        if ($from.parent.attrs.primeraLinea) return this.editor.commands.setPrimeraLinea(null);
        return this.editor.commands.cambiarSangria(-1);
      },
      // Borrar al principio de un párrafo con sangría: primero quita la sangría.
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || !TIPOS.includes($from.parent.type.name)) return false;
        if ($from.parent.attrs.primeraLinea) return this.editor.commands.setPrimeraLinea(null);
        return false;
      },
      "Mod-Shift-m": () => this.editor.commands.cambiarSangria(-1),
      "Mod-m": () => this.editor.commands.cambiarSangria(1),
    };
  },
});

export const SaltoPagina = Node.create({
  name: "saltoPagina",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div.page-break" }, { tag: 'div[style*="page-break-after"]' }, { tag: 'div[style*="break-after: page"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "page-break", style: "page-break-after: always" })];
  },
  addCommands() {
    return {
      insertarSaltoPagina: () => ({ chain }) =>
        chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.insertarSaltoPagina() };
  },
});

// ── Buscar y reemplazar ─────────────────────────────────────────────────────

export type ResultadoBusqueda = { from: number; to: number };
export interface BuscarStorage {
  termino: string;
  mayusculas: boolean;
  resultados: ResultadoBusqueda[];
  actual: number;
  /** Lo pone la barra de herramientas para abrir el panel con Ctrl+F / Ctrl+H. */
  onAbrir: ((reemplazar: boolean) => void) | null;
}

const claveBuscar = new PluginKey("vtBuscar");

function buscarEn(doc: PMNode, termino: string, mayusculas: boolean): ResultadoBusqueda[] {
  if (!termino) return [];
  const aguja = mayusculas ? termino : termino.toLocaleLowerCase();
  const out: ResultadoBusqueda[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Texto del párrafo entero (aunque esté partido en trozos con formatos
    // distintos) y la posición de cada carácter en el documento.
    let texto = "";
    const posiciones: number[] = [];
    node.forEach((hijo, offset) => {
      if (hijo.isText) {
        for (let i = 0; i < hijo.text!.length; i++) posiciones.push(pos + 1 + offset + i);
        texto += hijo.text;
      } else {
        posiciones.push(pos + 1 + offset);
        texto += "￼";
      }
    });
    const pajar = mayusculas ? texto : texto.toLocaleLowerCase();
    let i = pajar.indexOf(aguja);
    while (i >= 0) {
      out.push({ from: posiciones[i], to: posiciones[i + aguja.length - 1] + 1 });
      i = pajar.indexOf(aguja, i + Math.max(1, aguja.length));
    }
    return false;
  });
  return out;
}

export const Buscar = Extension.create<Record<string, never>, BuscarStorage>({
  name: "buscar",

  addStorage() {
    return { termino: "", mayusculas: false, resultados: [], actual: 0, onAbrir: null };
  },

  addCommands() {
    const storage = this.storage;
    const refrescar = (tr: any) => tr.setMeta(claveBuscar, true);
    const seleccionar = (tr: any, r: ResultadoBusqueda | undefined) => {
      if (r) tr.setSelection(TextSelection.create(tr.doc, r.from, r.to)).scrollIntoView();
    };
    return {
      setBusqueda: (termino, mayusculas = false) => ({ tr, dispatch }) => {
        storage.termino = termino;
        storage.mayusculas = mayusculas;
        storage.resultados = buscarEn(tr.doc, termino, mayusculas);
        // Empieza por el primer resultado a partir del cursor, como Word.
        const desde = tr.selection.from;
        const i = storage.resultados.findIndex((r) => r.from >= desde);
        storage.actual = i >= 0 ? i : 0;
        if (dispatch) refrescar(tr);
        return true;
      },
      irAResultado: (indice) => ({ tr, dispatch }) => {
        const n = storage.resultados.length;
        if (!n) return false;
        storage.actual = ((indice % n) + n) % n;
        if (dispatch) { seleccionar(tr, storage.resultados[storage.actual]); refrescar(tr); }
        return true;
      },
      reemplazarActual: (texto) => ({ tr, dispatch }) => {
        const r = storage.resultados[storage.actual];
        if (!r) return false;
        if (dispatch) {
          if (texto) tr.insertText(texto, r.from, r.to); else tr.delete(r.from, r.to);
          storage.resultados = buscarEn(tr.doc, storage.termino, storage.mayusculas);
          const i = storage.resultados.findIndex((x) => x.from >= r.from + texto.length);
          storage.actual = i >= 0 ? i : 0;
          seleccionar(tr, storage.resultados[storage.actual]);
          refrescar(tr);
        }
        return true;
      },
      reemplazarTodo: (texto) => ({ tr, dispatch }) => {
        const lista = [...storage.resultados];
        if (!lista.length) return false;
        if (dispatch) {
          // De atrás hacia delante: así las posiciones anteriores no se mueven.
          for (const r of lista.reverse()) {
            if (texto) tr.insertText(texto, r.from, r.to); else tr.delete(r.from, r.to);
          }
          storage.resultados = buscarEn(tr.doc, storage.termino, storage.mayusculas);
          storage.actual = 0;
          refrescar(tr);
        }
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-f": () => { this.storage.onAbrir?.(false); return !!this.storage.onAbrir; },
      "Mod-h": () => { this.storage.onAbrir?.(true); return !!this.storage.onAbrir; },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const decorar = (doc: PMNode) => DecorationSet.create(doc, storage.resultados.map((r, i) =>
      Decoration.inline(r.from, r.to, { class: i === storage.actual ? "vt-busca vt-busca-actual" : "vt-busca" })));
    return [new Plugin({
      key: claveBuscar,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, viejo) {
          if (tr.getMeta(claveBuscar)) return decorar(tr.doc);
          if (tr.docChanged && storage.termino) {
            // Al escribir con el panel abierto, los resultados se recalculan.
            storage.resultados = buscarEn(tr.doc, storage.termino, storage.mayusculas);
            storage.actual = Math.min(storage.actual, Math.max(0, storage.resultados.length - 1));
            return decorar(tr.doc);
          }
          return viejo.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations(state) { return claveBuscar.getState(state); } },
    })];
  },
});
