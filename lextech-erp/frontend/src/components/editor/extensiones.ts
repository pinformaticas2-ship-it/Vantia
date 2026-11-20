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
    indice: { insertarIndice: (titulo: string) => ReturnType };
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
  /** Lo pone la barra de herramientas para abrir el panel (atajos de Word: ver atajosWord.ts). */
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

// ── Índice ──────────────────────────────────────────────────────────────────
// Un bloque que lista los títulos del documento (Título, Subtítulo, Apartado)
// y se actualiza solo. Se guarda como <nav data-indice> con las entradas (así
// se imprime y la IA lo entiende); al exportar a Word se convierte en un campo
// TOC de Word con números de página (documentosController.extraerIndice).

export type EntradaIndice = { nivel: number; texto: string };

function titulosDe(doc: PMNode): { entrada: EntradaIndice; pos: number }[] {
  const out: { entrada: EntradaIndice; pos: number }[] = [];
  doc.descendants((n, pos) => {
    if (n.type.name === "heading" && n.attrs.level <= 3 && n.textContent.trim()) {
      out.push({ entrada: { nivel: n.attrs.level, texto: n.textContent.trim() }, pos });
    }
    return n.type.name !== "indice";
  });
  return out;
}

export const Indice = Node.create<{ textoVacio: string; aviso: string }>({
  name: "indice",
  group: "block",
  atom: true,
  selectable: true,

  addOptions() {
    return { textoVacio: "", aviso: "" };
  },

  addAttributes() {
    return {
      titulo: { default: "Índice", parseHTML: (el) => el.getAttribute("data-titulo") || "Índice", renderHTML: () => ({}) },
      entradas: {
        default: [] as EntradaIndice[],
        parseHTML: (el) => [...el.querySelectorAll("[data-nivel]")].map((e) => ({ nivel: Number(e.getAttribute("data-nivel")) || 1, texto: e.textContent || "" })),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "nav[data-indice]" }];
  },

  renderHTML({ node }) {
    const entradas = (node.attrs.entradas || []) as EntradaIndice[];
    return ["nav", { class: "vt-indice", "data-indice": "", "data-titulo": node.attrs.titulo },
      ["p", { class: "vt-indice-titulo" }, node.attrs.titulo],
      ...entradas.map((e) => ["p", { class: `vt-indice-n${e.nivel}`, "data-nivel": String(e.nivel) }, e.texto])];
  },

  addNodeView() {
    const opciones = this.options;
    return ({ node, editor }) => {
      const dom = document.createElement("nav");
      dom.className = "vt-indice";
      dom.contentEditable = "false";
      const pintar = (n: PMNode) => {
        dom.replaceChildren();
        const cab = document.createElement("p");
        cab.className = "vt-indice-titulo";
        cab.textContent = n.attrs.titulo;
        dom.appendChild(cab);
        const entradas = (n.attrs.entradas || []) as EntradaIndice[];
        if (!entradas.length) {
          const vacio = document.createElement("p");
          vacio.className = "vt-indice-vacio";
          vacio.textContent = opciones.textoVacio;
          dom.appendChild(vacio);
        }
        entradas.forEach((e, i) => {
          const fila = document.createElement("button");
          fila.type = "button";
          fila.className = `vt-indice-n${e.nivel}`;
          fila.textContent = e.texto;
          // Ir al título (el i-ésimo título del documento).
          fila.addEventListener("click", (ev) => {
            ev.preventDefault();
            const t = titulosDe(editor.state.doc)[i];
            if (!t) return;
            editor.chain().focus().setTextSelection(t.pos + 1).scrollIntoView().run();
            (editor.view.domAtPos(t.pos + 1).node as HTMLElement)?.parentElement?.scrollIntoView?.({ block: "center", behavior: "smooth" });
          });
          dom.appendChild(fila);
        });
        if (opciones.aviso) {
          const pie = document.createElement("p");
          pie.className = "vt-indice-aviso";
          pie.textContent = opciones.aviso;
          dom.appendChild(pie);
        }
      };
      pintar(node);
      return {
        dom,
        update: (n) => { if (n.type.name !== "indice") return false; pintar(n); return true; },
        ignoreMutation: () => true,
        stopEvent: (e) => e.type === "click" && (e.target as HTMLElement).tagName === "BUTTON",
      };
    };
  },

  addCommands() {
    return {
      insertarIndice: (titulo) => ({ state, chain }) => {
        let hay = false;
        state.doc.descendants((n) => { if (n.type.name === "indice") hay = true; return !hay; });
        if (hay) return false; // uno por documento, como en Word
        return chain().insertContent([
          { type: this.name, attrs: { titulo, entradas: titulosDe(state.doc).map((t) => t.entrada) } },
          { type: "paragraph" },
        ]).run();
      },
    };
  },

  // Mantiene las entradas al día cada vez que cambian los títulos.
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("vtIndice"),
      appendTransaction: (trs, _viejo, state) => {
        if (!trs.some((t) => t.docChanged)) return null;
        const entradas = titulosDe(state.doc).map((t) => t.entrada);
        const json = JSON.stringify(entradas);
        let tr: ReturnType<typeof state.tr.setNodeMarkup> | null = null;
        state.doc.descendants((n, pos) => {
          if (n.type.name === "indice" && JSON.stringify(n.attrs.entradas) !== json) {
            tr = (tr || state.tr).setNodeMarkup(pos, undefined, { ...n.attrs, entradas });
          }
          return n.type.name !== "indice";
        });
        // Sin entrada propia en el historial: deshacer deshace el título, no esto.
        if (tr) (tr as any).setMeta("addToHistory", false);
        return tr;
      },
    })];
  },
});
