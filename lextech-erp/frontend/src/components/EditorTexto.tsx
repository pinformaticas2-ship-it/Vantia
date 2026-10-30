import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Highlighter, Italic, List, ListOrdered,
  Minus, Quote, Redo2, Strikethrough, Table as TableIcon, Underline as UnderlineIcon, Undo2,
} from "lucide-react";
import "./editorTexto.css";

// Editor de texto de Vantia (Documentos). TipTap guarda y devuelve HTML
// sencillo (p, h1-h3, listas, tablas, cita...), que es lo que el backend
// exporta a Word y lo que la IA devuelve al redactar.

export function useEditorTexto(opts: { contenido: string; onChange: (html: string) => void; placeholder?: string; editable?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight,
      TableKit.configure({ table: { resizable: false } }),
      CharacterCount,
      Placeholder.configure({ placeholder: opts.placeholder || "Empieza a escribir, o pide a la IA que lo redacte…" }),
    ],
    content: opts.contenido,
    editable: opts.editable ?? true,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => opts.onChange(editor.getHTML()),
  });
  useEffect(() => { editor?.setEditable(opts.editable ?? true); }, [editor, opts.editable]);
  return editor;
}

const btn = (activo: boolean) =>
  `inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent ${activo ? "bg-slate-200/80 text-slate-900" : ""}`;

function Separador() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />;
}

export function BarraEditor({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const estilo = editor.isActive("heading", { level: 1 }) ? "h1"
    : editor.isActive("heading", { level: 2 }) ? "h2"
    : editor.isActive("heading", { level: 3 }) ? "h3" : "p";
  const enTabla = editor.isActive("table");

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5" role="toolbar" aria-label="Formato del texto">
      <button type="button" title="Deshacer (Ctrl+Z)" className={btn(false)} onClick={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 size={15} /></button>
      <button type="button" title="Rehacer (Ctrl+Y)" className={btn(false)} onClick={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 size={15} /></button>
      <Separador />
      <select
        value={estilo}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") c().setParagraph().run();
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
        className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
        aria-label="Estilo de párrafo"
      >
        <option value="p">Texto normal</option>
        <option value="h1">Título</option>
        <option value="h2">Subtítulo</option>
        <option value="h3">Apartado</option>
      </select>
      <Separador />
      <button type="button" title="Negrita (Ctrl+B)" className={btn(editor.isActive("bold"))} onClick={() => c().toggleBold().run()}><Bold size={15} /></button>
      <button type="button" title="Cursiva (Ctrl+I)" className={btn(editor.isActive("italic"))} onClick={() => c().toggleItalic().run()}><Italic size={15} /></button>
      <button type="button" title="Subrayado (Ctrl+U)" className={btn(editor.isActive("underline"))} onClick={() => c().toggleUnderline().run()}><UnderlineIcon size={15} /></button>
      <button type="button" title="Tachado" className={btn(editor.isActive("strike"))} onClick={() => c().toggleStrike().run()}><Strikethrough size={15} /></button>
      <button type="button" title="Resaltar" className={btn(editor.isActive("highlight"))} onClick={() => c().toggleHighlight().run()}><Highlighter size={15} /></button>
      <Separador />
      <button type="button" title="Alinear a la izquierda" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => c().setTextAlign("left").run()}><AlignLeft size={15} /></button>
      <button type="button" title="Centrar" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => c().setTextAlign("center").run()}><AlignCenter size={15} /></button>
      <button type="button" title="Alinear a la derecha" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => c().setTextAlign("right").run()}><AlignRight size={15} /></button>
      <button type="button" title="Justificar" className={btn(editor.isActive({ textAlign: "justify" }))} onClick={() => c().setTextAlign("justify").run()}><AlignJustify size={15} /></button>
      <Separador />
      <button type="button" title="Lista con viñetas" className={btn(editor.isActive("bulletList"))} onClick={() => c().toggleBulletList().run()}><List size={15} /></button>
      <button type="button" title="Lista numerada" className={btn(editor.isActive("orderedList"))} onClick={() => c().toggleOrderedList().run()}><ListOrdered size={15} /></button>
      <button type="button" title="Cita" className={btn(editor.isActive("blockquote"))} onClick={() => c().toggleBlockquote().run()}><Quote size={15} /></button>
      <button type="button" title="Línea separadora" className={btn(false)} onClick={() => c().setHorizontalRule().run()}><Minus size={15} /></button>
      <Separador />
      {enTabla ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={`${btn(false)} text-[11px] font-semibold`} onClick={() => c().addRowAfter().run()}>+ Fila</button>
          <button type="button" className={`${btn(false)} text-[11px] font-semibold`} onClick={() => c().addColumnAfter().run()}>+ Columna</button>
          <button type="button" className={`${btn(false)} text-[11px] font-semibold`} onClick={() => c().deleteRow().run()}>− Fila</button>
          <button type="button" className={`${btn(false)} text-[11px] font-semibold`} onClick={() => c().deleteColumn().run()}>− Columna</button>
          <button type="button" className={`${btn(false)} text-[11px] font-semibold text-red-600`} onClick={() => c().deleteTable().run()}>Quitar tabla</button>
        </span>
      ) : (
        <button type="button" title="Insertar tabla" className={btn(false)} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></button>
      )}
    </div>
  );
}

/** La hoja: tamaño A4 con márgenes, como en Word. */
export function HojaEditor({ editor }: { editor: Editor | null }) {
  return (
    <div className="vt-hoja mx-auto w-full max-w-[816px] rounded-sm bg-white px-6 py-8 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_8px_24px_rgba(15,23,42,0.06)] sm:min-h-[1056px] sm:px-[72px] sm:py-[64px]">
      <EditorContent editor={editor} className="vt-editor" />
    </div>
  );
}

export function contarPalabras(editor: Editor | null): number {
  return editor ? (editor.storage as any).characterCount?.words?.() ?? 0 : 0;
}
