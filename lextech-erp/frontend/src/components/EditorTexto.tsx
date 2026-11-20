import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, CaseSensitive, ChevronDown, ChevronUp,
  Highlighter, ImagePlus, Indent as IndentIncrease, Outdent as IndentDecrease, Italic, Link2, List, ListTree, ListOrdered, Minus, Sigma as Omega, Paintbrush, Pilcrow,
  Quote, Redo2, RemoveFormatting, Replace, Search, SeparatorHorizontal, Strikethrough, Subscript as SubIcon,
  Superscript as SupIcon, Table as TableIcon, Underline as UnderlineIcon, Undo2, WrapText, X, ZoomIn,
} from "lucide-react";
import "./editorTexto.css";
import { t, idioma } from "../lib/i18n";
import { aviso } from "../lib/avisos";
import { Buscar, FormatoParrafo, Indice, SaltoPagina, type BuscarStorage } from "./editor/extensiones";
import { SelectorFuente } from "./editor/SelectorFuente";
import { useAuth } from "@clerk/clerk-react";
import { asegurarFuentes, cargarCatalogo } from "../lib/fuentesWeb";

// Editor de texto de Vantia (Documentos). TipTap guarda y devuelve HTML con
// estilos en línea (fuente, tamaño, color, interlineado, sangrías…), que es
// lo que el backend exporta a Word (htmlADocx) y lo que la IA devuelve al
// redactar. Desde el 20/11/2026 con las opciones habituales de Word.

export function useEditorTexto(opts: { contenido: string; onChange: (html: string) => void; placeholder?: string; editable?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TextStyleKit,
      Subscript,
      Superscript,
      Image.configure({
        allowBase64: true,
        resize: { enabled: true, directions: ["top-left", "top-right", "bottom-left", "bottom-right"], minWidth: 40, minHeight: 20, alwaysPreserveAspectRatio: true },
      }),
      TableKit.configure({ table: { resizable: false } }),
      FormatoParrafo,
      SaltoPagina,
      Indice.configure({
        textoVacio: t("Añade títulos (Título, Subtítulo o Apartado) y aparecerán aquí."),
        aviso: t("Se actualiza solo. Los números de página se ponen al descargarlo en Word."),
      }),
      Buscar,
      CharacterCount,
      Placeholder.configure({ placeholder: opts.placeholder || t("Empieza a escribir, o pide a la IA que lo redacte…") }),
    ],
    editorProps: { attributes: { spellcheck: "true", lang: idioma() === "en" ? "en" : "es" } },
    content: opts.contenido,
    editable: opts.editable ?? true,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => opts.onChange(editor.getHTML()),
  });
  useEffect(() => { editor?.setEditable(opts.editable ?? true); }, [editor, opts.editable]);
  return editor;
}

// ── Listas de opciones (como en Word) ──────────────────────────────────────

const TAMANOS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72];
const INTERLINEADOS = ["1", "1.15", "1.5", "2", "2.5", "3"];
const COLORES_TEXTO = [
  "#000000", "#404040", "#7f7f7f", "#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0",
  "#ab0433", "#e36c09", "#9c6500", "#4f6228", "#215868", "#1f497d", "#5f497a",
];
const COLORES_RESALTADO = ["#fef08a", "#bbf7d0", "#a5f3fc", "#fbcfe8", "#bfdbfe", "#fed7aa", "#fecaca", "#e2e8f0"];
const SIMBOLOS = ["§", "¶", "€", "º", "ª", "«", "»", "“", "”", "—", "–", "…", "©", "®", "™", "±", "×", "÷", "½", "¼", "¾", "→", "≤", "≥", "✓", "✗", "•", "†"];
const ZOOMS = [50, 75, 90, 100, 110, 125, 150, 200];

// ── Zoom de la hoja (por persona, se recuerda en este navegador) ───────────

const CLAVE_ZOOM = "vantia.editor.zoom";
let zoomActual = (() => { try { const z = Number(localStorage.getItem(CLAVE_ZOOM)); return ZOOMS.includes(z) ? z : 100; } catch { return 100; } })();
const oyentesZoom = new Set<() => void>();
function setZoom(z: number) {
  zoomActual = z;
  try { localStorage.setItem(CLAVE_ZOOM, String(z)); } catch { /* sin almacenamiento */ }
  oyentesZoom.forEach((f) => f());
}
function useZoom() {
  return useSyncExternalStore((f) => { oyentesZoom.add(f); return () => { oyentesZoom.delete(f); }; }, () => zoomActual);
}

// ── Piezas de la barra ──────────────────────────────────────────────────────

const btn = (activo: boolean) =>
  `inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-lg px-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent ${activo ? "bg-slate-200/80 text-slate-900" : ""}`;
const selectCls = "h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-slate-400";

function Separador() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />;
}

/** Botón que abre un panel flotante (en un portal: la barra tiene scroll horizontal en el móvil y lo cortaría). */
function Desplegable({ titulo, boton, activo = false, ancho = 220, children }: {
  titulo: string;
  boton: ReactNode;
  activo?: boolean;
  ancho?: number;
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const refBoton = useRef<HTMLButtonElement>(null);
  const refPanel = useRef<HTMLDivElement>(null);
  const cerrar = () => setAbierto(false);

  useLayoutEffect(() => {
    if (!abierto || !refBoton.current) return;
    const r = refBoton.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) });
  }, [abierto, ancho]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const n = e.target as globalThis.Node;
      if (!refPanel.current?.contains(n) && !refBoton.current?.contains(n)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", cerrar);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); window.removeEventListener("resize", cerrar); };
  }, [abierto]);

  return (
    <>
      <button ref={refBoton} type="button" title={titulo} aria-label={titulo} aria-expanded={abierto}
        className={btn(activo || abierto)} onMouseDown={(e) => e.preventDefault()} onClick={() => setAbierto((v) => !v)}>
        {boton}<ChevronDown size={11} className="opacity-50" />
      </button>
      {abierto && createPortal(
        <div ref={refPanel} role="dialog" aria-label={titulo}
          className="fixed z-[200] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          style={{ top: pos.top, left: pos.left, width: ancho }}>
          {children(cerrar)}
        </div>,
        document.body,
      )}
    </>
  );
}

function Paleta({ colores, onElegir, onQuitar, textoQuitar, personalizado }: {
  colores: string[]; onElegir: (c: string) => void; onQuitar: () => void; textoQuitar: string; personalizado?: boolean;
}) {
  return (
    <div>
      <button type="button" onClick={onQuitar} className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100">
        <span className="h-4 w-4 rounded border border-slate-300 bg-[linear-gradient(135deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]" />{textoQuitar}
      </button>
      <div className="grid grid-cols-7 gap-1.5">
        {colores.map((c) => (
          <button key={c} type="button" title={c} aria-label={c} onClick={() => onElegir(c)}
            className="h-6 w-6 rounded-md border border-black/10 transition hover:scale-110" style={{ background: c }} />
        ))}
      </div>
      {personalizado && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          <input type="color" className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" onChange={(e) => onElegir(e.target.value)} />
          {t("Más colores…")}
        </label>
      )}
    </div>
  );
}

function OpcionMenu({ onClick, children, peligro = false, disabled = false }: { onClick: () => void; children: ReactNode; peligro?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold disabled:opacity-35 ${peligro ? "peligro text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100"}`}>
      {children}
    </button>
  );
}

// ── Imagen: se reduce y comprime en el navegador antes de meterla ──────────

const ANCHO_HOJA = 672; // px útiles de la hoja (816 − 2 × 72 de margen)
async function prepararImagen(file: File): Promise<{ src: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.src = url;
    await img.decode();
    const escala = Math.min(1, 1600 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const transparente = /png|gif|webp|svg/.test(file.type);
    if (!transparente) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    let src = canvas.toDataURL(transparente ? "image/png" : "image/jpeg", 0.85);
    if (transparente && src.length > 900_000) {
      // PNG muy pesado (una foto guardada como PNG): a JPEG sobre blanco.
      ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      src = canvas.toDataURL("image/jpeg", 0.85);
    }
    const ancho = Math.min(w, ANCHO_HOJA);
    return { src, width: ancho, height: Math.round(h * (ancho / w)) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Barra de herramientas ───────────────────────────────────────────────────

export function BarraEditor({ editor }: { editor: Editor | null }) {
  const [buscador, setBuscador] = useState<null | { reemplazar: boolean }>(null);
  const [pincel, setPincel] = useState<{ type: string; attrs: Record<string, unknown> }[] | null>(null);
  const refBarra = useRef<HTMLDivElement>(null);
  const refImagen = useRef<HTMLInputElement>(null);
  const zoom = useZoom();

  // Ctrl+F / Ctrl+H dentro del editor abren el panel de búsqueda.
  useEffect(() => {
    if (!editor) return;
    const st = (editor.storage as any).buscar as BuscarStorage;
    st.onAbrir = (reemplazar) => setBuscador({ reemplazar });
    return () => { st.onAbrir = null; };
  }, [editor]);

  // Copiar formato: el siguiente texto que se seleccione con el ratón recibe
  // los formatos copiados (como la brocha de Word). Esc lo cancela.
  useEffect(() => {
    if (!editor || !pincel) return;
    const dom = editor.view.dom as HTMLElement;
    dom.classList.add("vt-pincel");
    const aplicar = () => window.setTimeout(() => {
      if (editor.state.selection.empty) return;
      let cadena = editor.chain().focus().unsetAllMarks();
      for (const m of pincel) cadena = cadena.setMark(m.type, m.attrs);
      cadena.run();
      setPincel(null);
    }, 0);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPincel(null); };
    dom.addEventListener("mouseup", aplicar);
    document.addEventListener("keydown", esc);
    return () => { dom.classList.remove("vt-pincel"); dom.removeEventListener("mouseup", aplicar); document.removeEventListener("keydown", esc); };
  }, [editor, pincel]);

  if (!editor) return null;
  const c = () => editor.chain().focus();
  const estilo = editor.isActive("heading", { level: 1 }) ? "h1"
    : editor.isActive("heading", { level: 2 }) ? "h2"
    : editor.isActive("heading", { level: 3 }) ? "h3" : "p";
  const enTabla = editor.isActive("table");
  const ts = editor.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string };
  const fuente = (ts.fontFamily || "").replace(/["']/g, "").split(",")[0].trim();
  const tamanoBase = estilo === "h1" ? 18 : estilo === "h2" ? 15 : estilo === "h3" ? 12.5 : 12;
  const tamano = ts.fontSize ? Number.parseFloat(ts.fontSize) : tamanoBase;
  const parrafo = editor.getAttributes(estilo === "p" ? "paragraph" : "heading") as { lineHeight?: string; primeraLinea?: number };
  const colorResaltado = (editor.getAttributes("highlight") as { color?: string }).color;

  const cambiarTamano = (paso: 1 | -1) => {
    const sig = paso > 0 ? TAMANOS.find((s) => s > tamano) : [...TAMANOS].reverse().find((s) => s < tamano);
    if (sig) c().setFontSize(`${sig}pt`).run();
  };

  const insertarImagen = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { aviso.error(t("Ese archivo no es una imagen.")); return; }
    try {
      const img = await prepararImagen(file);
      if (img.src.length > 3_000_000) { aviso.error(t("La imagen es demasiado grande. Prueba con una más pequeña.")); return; }
      // Imagen + párrafo detrás, con el cursor en él: si la imagen quedara
      // seleccionada, lo siguiente que se escribiera o insertara la sustituiría.
      c().insertContent([{ type: "image", attrs: img }, { type: "paragraph" }]).run();
    } catch {
      aviso.error(t("No se ha podido leer la imagen."));
    }
  };

  return (
    <>
      <div ref={refBarra} className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5 sm:flex-wrap sm:gap-y-1" role="toolbar" aria-label={t("Formato del texto")}>
        {/* Deshacer / estilos */}
        <button type="button" title={t("Deshacer (Ctrl+Z)")} className={btn(false)} onClick={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 size={15} /></button>
        <button type="button" title={t("Rehacer (Ctrl+Y)")} className={btn(false)} onClick={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 size={15} /></button>
        <button type="button" title={t("Copiar formato (brocha). Selecciona después el texto al que aplicarlo.")} className={btn(!!pincel)}
          onClick={() => setPincel(pincel ? null : editor.state.selection.$from.marks().map((m) => ({ type: m.type.name, attrs: m.attrs })))}>
          <Paintbrush size={15} />
        </button>
        <Separador />
        <select value={estilo} aria-label={t("Estilo de párrafo")} className={selectCls}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") c().setParagraph().run();
            else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}>
          <option value="p">{t("Texto normal")}</option>
          <option value="h1">{t("Título")}</option>
          <option value="h2">{t("Subtítulo")}</option>
          <option value="h3">{t("Apartado")}</option>
        </select>
        <SelectorFuente editor={editor} actual={fuente} />
        <select value={TAMANOS.includes(tamano) ? String(tamano) : ""} aria-label={t("Tamaño de fuente")} title={t("Tamaño de fuente")} className={`${selectCls} w-[62px]`}
          onChange={(e) => (e.target.value ? c().setFontSize(`${e.target.value}pt`).run() : c().unsetFontSize().run())}>
          {!TAMANOS.includes(tamano) && <option value="">{Number.isFinite(tamano) ? tamano : ""}</option>}
          {TAMANOS.map((s) => <option key={s} value={String(s)}>{s}</option>)}
        </select>
        <button type="button" title={t("Aumentar tamaño")} className={btn(false)} onClick={() => cambiarTamano(1)}>
          <span className="font-serif text-[15px] font-bold leading-none">A<sup className="text-[9px]">+</sup></span></button>
        <button type="button" title={t("Reducir tamaño")} className={btn(false)} onClick={() => cambiarTamano(-1)}>
          <span className="font-serif text-[12px] font-bold leading-none">A<sup className="text-[9px]">−</sup></span></button>
        <Separador />
        {/* Fuente */}
        <button type="button" title={t("Negrita (Ctrl+B)")} className={btn(editor.isActive("bold"))} onClick={() => c().toggleBold().run()}><Bold size={15} /></button>
        <button type="button" title={t("Cursiva (Ctrl+I)")} className={btn(editor.isActive("italic"))} onClick={() => c().toggleItalic().run()}><Italic size={15} /></button>
        <button type="button" title={t("Subrayado (Ctrl+U)")} className={btn(editor.isActive("underline"))} onClick={() => c().toggleUnderline().run()}><UnderlineIcon size={15} /></button>
        <button type="button" title={t("Tachado")} className={btn(editor.isActive("strike"))} onClick={() => c().toggleStrike().run()}><Strikethrough size={15} /></button>
        <button type="button" title={t("Subíndice (Ctrl+,)")} className={btn(editor.isActive("subscript"))} onClick={() => c().unsetSuperscript().toggleSubscript().run()}><SubIcon size={15} /></button>
        <button type="button" title={t("Superíndice (Ctrl+.)")} className={btn(editor.isActive("superscript"))} onClick={() => c().unsetSubscript().toggleSuperscript().run()}><SupIcon size={15} /></button>
        <Desplegable titulo={t("Color del texto")} ancho={236}
          boton={<span className="flex flex-col items-center leading-none"><Baseline size={15} /><span className="mt-px h-[3px] w-4 rounded-full" style={{ background: ts.color || "#0f172a" }} /></span>}>
          {(cerrar) => <Paleta colores={COLORES_TEXTO} personalizado textoQuitar={t("Automático")}
            onElegir={(col) => { c().setColor(col).run(); cerrar(); }} onQuitar={() => { c().unsetColor().run(); cerrar(); }} />}
        </Desplegable>
        <Desplegable titulo={t("Color de resaltado")} activo={editor.isActive("highlight")} ancho={236}
          boton={<span className="flex flex-col items-center leading-none"><Highlighter size={15} /><span className="mt-px h-[3px] w-4 rounded-full" style={{ background: colorResaltado || "#fef08a" }} /></span>}>
          {(cerrar) => <Paleta colores={COLORES_RESALTADO} textoQuitar={t("Sin resaltado")}
            onElegir={(col) => { c().setHighlight({ color: col }).run(); cerrar(); }} onQuitar={() => { c().unsetHighlight().run(); cerrar(); }} />}
        </Desplegable>
        <button type="button" title={t("Borrar formato")} className={btn(false)}
          onClick={() => c().unsetAllMarks().quitarFormatoParrafo().unsetTextAlign().run()}><RemoveFormatting size={15} /></button>
        <Separador />
        {/* Párrafo */}
        <button type="button" title={t("Alinear a la izquierda (Ctrl+Mayús+L)")} className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => c().setTextAlign("left").run()}><AlignLeft size={15} /></button>
        <button type="button" title={t("Centrar (Ctrl+Mayús+E)")} className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => c().setTextAlign("center").run()}><AlignCenter size={15} /></button>
        <button type="button" title={t("Alinear a la derecha (Ctrl+Mayús+R)")} className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => c().setTextAlign("right").run()}><AlignRight size={15} /></button>
        <button type="button" title={t("Justificar (Ctrl+Mayús+J)")} className={btn(editor.isActive({ textAlign: "justify" }))} onClick={() => c().setTextAlign("justify").run()}><AlignJustify size={15} /></button>
        <Desplegable titulo={t("Interlineado")} activo={!!parrafo.lineHeight} ancho={170} boton={<WrapText size={15} />}>
          {(cerrar) => (
            <div>
              {INTERLINEADOS.map((v) => (
                <OpcionMenu key={v} onClick={() => { c().setInterlineado(v).run(); cerrar(); }}>
                  <span className="w-4 text-center">{parrafo.lineHeight === v ? "✓" : ""}</span>{v.replace(".", idioma() === "en" ? "." : ",")}
                </OpcionMenu>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <OpcionMenu onClick={() => { c().setInterlineado(null).run(); cerrar(); }}>
                <span className="w-4 text-center">{!parrafo.lineHeight ? "✓" : ""}</span>{t("Predeterminado")}
              </OpcionMenu>
            </div>
          )}
        </Desplegable>
        <button type="button" title={t("Reducir sangría (Ctrl+Mayús+M)")} className={btn(false)} onClick={() => c().cambiarSangria(-1).run()}><IndentDecrease size={15} /></button>
        <button type="button" title={t("Aumentar sangría (Ctrl+M)")} className={btn(false)} onClick={() => c().cambiarSangria(1).run()}><IndentIncrease size={15} /></button>
        <button type="button" title={t("Sangría de primera línea (Tab al principio del párrafo)")} className={btn(!!parrafo.primeraLinea)}
          onClick={() => c().setPrimeraLinea(parrafo.primeraLinea ? null : 48).run()}><Pilcrow size={15} /></button>
        <button type="button" title={t("Lista con viñetas")} className={btn(editor.isActive("bulletList"))} onClick={() => c().toggleBulletList().run()}><List size={15} /></button>
        <button type="button" title={t("Lista numerada")} className={btn(editor.isActive("orderedList"))} onClick={() => c().toggleOrderedList().run()}><ListOrdered size={15} /></button>
        <button type="button" title={t("Cita")} className={btn(editor.isActive("blockquote"))} onClick={() => c().toggleBlockquote().run()}><Quote size={15} /></button>
        <Separador />
        {/* Insertar */}
        <Desplegable titulo={t("Enlace")} activo={editor.isActive("link")} ancho={300} boton={<Link2 size={15} />}>
          {(cerrar) => <PanelEnlace editor={editor} cerrar={cerrar} />}
        </Desplegable>
        <button type="button" title={t("Insertar imagen")} className={btn(false)} onClick={() => refImagen.current?.click()}><ImagePlus size={15} /></button>
        <input ref={refImagen} type="file" accept="image/*" className="hidden" onChange={(e) => { void insertarImagen(e.target.files?.[0]); e.target.value = ""; }} />
        {enTabla ? (
          <Desplegable titulo={t("Tabla")} activo ancho={220} boton={<TableIcon size={15} />}>
            {(cerrar) => {
              const hacer = (f: () => void) => () => { f(); cerrar(); };
              return (
                <div>
                  <OpcionMenu onClick={hacer(() => c().addRowBefore().run())}>{t("Insertar fila encima")}</OpcionMenu>
                  <OpcionMenu onClick={hacer(() => c().addRowAfter().run())}>{t("Insertar fila debajo")}</OpcionMenu>
                  <OpcionMenu onClick={hacer(() => c().addColumnBefore().run())}>{t("Insertar columna a la izquierda")}</OpcionMenu>
                  <OpcionMenu onClick={hacer(() => c().addColumnAfter().run())}>{t("Insertar columna a la derecha")}</OpcionMenu>
                  <div className="my-1 border-t border-slate-100" />
                  <OpcionMenu disabled={!editor.can().mergeCells()} onClick={hacer(() => c().mergeCells().run())}>{t("Combinar celdas")}</OpcionMenu>
                  <OpcionMenu disabled={!editor.can().splitCell()} onClick={hacer(() => c().splitCell().run())}>{t("Dividir celda")}</OpcionMenu>
                  <OpcionMenu onClick={hacer(() => c().toggleHeaderRow().run())}>{t("Fila de encabezado")}</OpcionMenu>
                  <div className="my-1 border-t border-slate-100" />
                  <OpcionMenu onClick={hacer(() => c().deleteRow().run())}>{t("Eliminar fila")}</OpcionMenu>
                  <OpcionMenu onClick={hacer(() => c().deleteColumn().run())}>{t("Eliminar columna")}</OpcionMenu>
                  <OpcionMenu peligro onClick={hacer(() => c().deleteTable().run())}>{t("Eliminar tabla")}</OpcionMenu>
                </div>
              );
            }}
          </Desplegable>
        ) : (
          <Desplegable titulo={t("Insertar tabla")} ancho={212} boton={<TableIcon size={15} />}>
            {(cerrar) => <SelectorTabla onElegir={(filas, cols) => { c().insertTable({ rows: filas, cols, withHeaderRow: true }).run(); cerrar(); }} />}
          </Desplegable>
        )}
        <button type="button" title={t("Insertar índice")} className={btn(false)}
          onClick={() => { if (!c().insertarIndice(t("Índice")).run()) aviso.info(t("El documento ya tiene un índice.")); }}><ListTree size={15} /></button>
        <button type="button" title={t("Salto de página (Ctrl+Intro)")} className={btn(false)} onClick={() => c().insertarSaltoPagina().run()}><SeparatorHorizontal size={15} /></button>
        <button type="button" title={t("Línea separadora")} className={btn(false)} onClick={() => c().setHorizontalRule().run()}><Minus size={15} /></button>
        <Desplegable titulo={t("Símbolo")} ancho={244} boton={<Omega size={15} />}>
          {(cerrar) => (
            <div className="grid grid-cols-7 gap-1">
              {SIMBOLOS.map((s) => (
                <button key={s} type="button" onClick={() => { c().insertContent(s).run(); cerrar(); }}
                  className="flex h-8 items-center justify-center rounded-md text-base text-slate-700 hover:bg-slate-100">{s}</button>
              ))}
            </div>
          )}
        </Desplegable>
        <Separador />
        {/* Herramientas */}
        <button type="button" title={t("Buscar (Ctrl+F)")} className={btn(!!buscador && !buscador.reemplazar)} onClick={() => setBuscador(buscador ? null : { reemplazar: false })}><Search size={15} /></button>
        <button type="button" title={t("Reemplazar (Ctrl+H)")} className={btn(!!buscador?.reemplazar)} onClick={() => setBuscador({ reemplazar: true })}><Replace size={15} /></button>
        <label className="ml-1 flex shrink-0 items-center gap-1 text-slate-500" title={t("Zoom")}>
          <ZoomIn size={14} />
          <select value={String(zoom)} onChange={(e) => setZoom(Number(e.target.value))} aria-label={t("Zoom")} className={`${selectCls} w-[70px]`}>
            {ZOOMS.map((z) => <option key={z} value={z}>{z} %</option>)}
          </select>
        </label>
      </div>
      {buscador && <PanelBuscar editor={editor} reemplazarInicial={buscador.reemplazar} ancla={refBarra} onCerrar={() => { editor.commands.setBusqueda(""); setBuscador(null); editor.commands.focus(); }} />}
    </>
  );
}

function SelectorTabla({ onElegir }: { onElegir: (filas: number, cols: number) => void }) {
  const [sobre, setSobre] = useState({ f: 0, c: 0 });
  return (
    <div>
      <p className="mb-1.5 px-0.5 text-xs font-semibold text-slate-600">{sobre.f ? `${sobre.c} × ${sobre.f}` : t("Elige el tamaño")}</p>
      <div className="grid grid-cols-8 gap-[3px]" onMouseLeave={() => setSobre({ f: 0, c: 0 })}>
        {Array.from({ length: 64 }, (_, i) => {
          const f = Math.floor(i / 8) + 1, col = (i % 8) + 1;
          const dentro = f <= sobre.f && col <= sobre.c;
          return (
            <button key={i} type="button" aria-label={`${col} × ${f}`} onMouseEnter={() => setSobre({ f, c: col })} onClick={() => onElegir(f, col)}
              className={`h-5 w-5 rounded-[3px] border ${dentro ? "border-[var(--tema-500,#ab0433)] bg-[rgba(var(--accent-glow),0.18)]" : "border-slate-200 bg-white"}`} />
          );
        })}
      </div>
    </div>
  );
}

function PanelEnlace({ editor, cerrar }: { editor: Editor; cerrar: () => void }) {
  const actual = (editor.getAttributes("link") as { href?: string }).href || "";
  const [url, setUrl] = useState(actual);
  const aplicar = () => {
    let href = url.trim();
    if (!href) return;
    if (!/^(https?:|mailto:|tel:)/i.test(href)) href = href.includes("@") && !href.includes("/") ? `mailto:${href}` : `https://${href}`;
    const ch = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      ch.insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      ch.extendMarkRange("link").setLink({ href }).run();
    }
    cerrar();
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
      <label className="mb-1 block px-0.5 text-xs font-semibold text-slate-600">{t("Dirección del enlace")}</label>
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://"
        className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-slate-400" />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        {actual && (
          <button type="button" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); cerrar(); }}
            className="mr-auto rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">{t("Quitar enlace")}</button>
        )}
        <button type="submit" disabled={!url.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{t("Aplicar")}</button>
      </div>
    </form>
  );
}

function PanelBuscar({ editor, reemplazarInicial, ancla, onCerrar }: {
  editor: Editor; reemplazarInicial: boolean; ancla: React.RefObject<HTMLDivElement | null>; onCerrar: () => void;
}) {
  const st = (editor.storage as any).buscar as BuscarStorage;
  const seleccion = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ").slice(0, 100);
  const [termino, setTermino] = useState(seleccion.includes("\n") ? "" : seleccion);
  const [reemplazo, setReemplazo] = useState("");
  const [mayus, setMayus] = useState(false);
  const [conReemplazo, setConReemplazo] = useState(reemplazarInicial);
  const [pos, setPos] = useState({ top: 120, right: 24 });
  const refInput = useRef<HTMLInputElement>(null);

  useEffect(() => { setConReemplazo((v) => v || reemplazarInicial); refInput.current?.focus(); refInput.current?.select(); }, [reemplazarInicial]);
  useEffect(() => { editor.commands.setBusqueda(termino, mayus); }, [editor, termino, mayus]);
  useLayoutEffect(() => {
    const r = ancla.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right + 12) });
  }, [ancla]);

  const n = st.resultados.length;
  const ir = (paso: number) => editor.commands.irAResultado(st.actual + paso);

  return createPortal(
    <div role="search" className="fixed z-[150] w-[min(380px,calc(100vw-24px))] rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl" style={{ top: pos.top, right: pos.right }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCerrar(); } }}>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input ref={refInput} value={termino} onChange={(e) => setTermino(e.target.value)} placeholder={t("Buscar en el documento")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ir(e.shiftKey ? -1 : n && st.resultados[st.actual] && editor.state.selection.from === st.resultados[st.actual].from ? 1 : 0); } }}
            className="h-8 w-full rounded-lg border border-slate-200 pl-7 pr-14 text-sm outline-none focus:border-slate-400" />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
            {termino ? (n ? `${st.actual + 1}/${n}` : t("Sin resultados")) : ""}
          </span>
        </div>
        <button type="button" title={t("Distinguir mayúsculas")} className={btn(mayus)} onClick={() => setMayus((v) => !v)}><CaseSensitive size={16} /></button>
        <button type="button" title={t("Anterior (Mayús+Intro)")} className={btn(false)} disabled={!n} onClick={() => ir(-1)}><ChevronUp size={15} /></button>
        <button type="button" title={t("Siguiente (Intro)")} className={btn(false)} disabled={!n} onClick={() => ir(1)}><ChevronDown size={15} /></button>
        <button type="button" title={t("Cerrar")} className={btn(false)} onClick={onCerrar}><X size={15} /></button>
      </div>
      {conReemplazo ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input value={reemplazo} onChange={(e) => setReemplazo(e.target.value)} placeholder={t("Reemplazar por")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editor.commands.reemplazarActual(reemplazo); } }}
            className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-slate-400" />
          <button type="button" disabled={!n} onClick={() => editor.commands.reemplazarActual(reemplazo)}
            className="h-8 shrink-0 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{t("Reemplazar")}</button>
          <button type="button" disabled={!n} onClick={() => editor.commands.reemplazarTodo(reemplazo)}
            className="h-8 shrink-0 rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white disabled:opacity-40">{t("Todos")}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConReemplazo(true)} className="mt-1 px-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800">{t("Reemplazar…")}</button>
      )}
    </div>,
    document.body,
  );
}

/** La hoja: tamaño A4 con márgenes, como en Word. */
export function HojaEditor({ editor }: { editor: Editor | null }) {
  const zoom = useZoom();
  const { getToken } = useAuth();
  // Las fuentes de Google que use el documento se cargan para verlas igual.
  useEffect(() => {
    if (!editor) return;
    let vivo = true;
    const vistas = new Set<string>();
    const revisar = () => {
      const nuevas: string[] = [];
      editor.state.doc.descendants((n) => {
        for (const m of n.marks) {
          const f = String(m.attrs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
          if (f && !vistas.has(f)) { vistas.add(f); nuevas.push(f); }
        }
      });
      if (nuevas.length) void cargarCatalogo(getToken).then(() => { if (vivo) asegurarFuentes(nuevas); });
    };
    revisar();
    editor.on("update", revisar);
    return () => { vivo = false; editor.off("update", revisar); };
  }, [editor, getToken]);
  return (
    <div style={{ zoom: zoom / 100, ["--vt-salto" as string]: JSON.stringify(t("Salto de página")) }}
      className="vt-hoja mx-auto w-full max-w-[816px] rounded-sm bg-white px-6 py-8 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_8px_24px_rgba(15,23,42,0.06)] sm:min-h-[1056px] sm:px-[72px] sm:py-[64px]">
      <EditorContent editor={editor} className="vt-editor" />
    </div>
  );
}

export function contarPalabras(editor: Editor | null): number {
  return editor ? (editor.storage as any).characterCount?.words?.() ?? 0 : 0;
}
