import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Loader2, Download, X, FileText, FileSpreadsheet, FileImage, FileVideo,
  FileAudio, FileCode, FileArchive, File as FileIcon, type LucideIcon,
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════════════════
// PREVISUALIZACIÓN DE ARCHIVO ADJUNTO -- compartida por Chat, Expedientes y
// Clientes (ver FilesTabPanel.tsx). Antes, pulsar un adjunto lo descargaba
// directamente sin avisar. Esto abre una vista previa a pantalla completa:
// PDF, imágenes, vídeo, audio y texto/código se ven directamente; .docx/.xlsx
// se convierten enteramente en el navegador (mammoth / SheetJS, ver más
// abajo) sin mandar el archivo a ningún visor externo -- descartado a
// propósito: filtraría documentos potencialmente confidenciales de un
// cliente fuera de Vantia. El resto de tipos muestra un aviso claro con el
// botón de descarga, en vez de disparar la descarga a ciegas nada más hacer
// clic.
// ══════════════════════════════════════════════════════════════════════════════

export function getFileTypeIcon(fileName?: string | null, mime?: string | null): { Icon: LucideIcon; iconBg: string; iconColor: string } {
  const ext = (fileName?.split(".").pop() || "").toLowerCase();
  const m = (mime || "").toLowerCase();

  if (ext === "pdf" || m.includes("pdf"))
    return { Icon: FileText, iconBg: "bg-red-100 group-hover/file:bg-red-200", iconColor: "text-red-600" };
  if (["doc", "docx", "odt", "rtf"].includes(ext) || m.includes("word") || m.includes("wordprocessingml"))
    return { Icon: FileText, iconBg: "bg-blue-100 group-hover/file:bg-blue-200", iconColor: "text-blue-600" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || m.includes("sheet") || m.includes("excel") || m.includes("csv"))
    return { Icon: FileSpreadsheet, iconBg: "bg-emerald-100 group-hover/file:bg-emerald-200", iconColor: "text-emerald-600" };
  if (["ppt", "pptx", "odp"].includes(ext) || m.includes("presentation"))
    return { Icon: FileText, iconBg: "bg-orange-100 group-hover/file:bg-orange-200", iconColor: "text-orange-600" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || m.includes("zip") || m.includes("compressed"))
    return { Icon: FileArchive, iconBg: "bg-amber-100 group-hover/file:bg-amber-200", iconColor: "text-amber-600" };
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext) || m.startsWith("image/"))
    return { Icon: FileImage, iconBg: "bg-pink-100 group-hover/file:bg-pink-200", iconColor: "text-pink-600" };
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext) || m.startsWith("video/"))
    return { Icon: FileVideo, iconBg: "bg-purple-100 group-hover/file:bg-purple-200", iconColor: "text-purple-600" };
  if (["mp3", "wav", "ogg", "m4a"].includes(ext) || m.startsWith("audio/"))
    return { Icon: FileAudio, iconBg: "bg-indigo-100 group-hover/file:bg-indigo-200", iconColor: "text-indigo-600" };
  if (["txt", "md", "json", "xml", "html", "css", "js", "ts", "tsx"].includes(ext) || m.startsWith("text/"))
    return { Icon: FileCode, iconBg: "bg-slate-200 group-hover/file:bg-slate-300", iconColor: "text-slate-600" };
  return { Icon: FileIcon, iconBg: "bg-slate-200 group-hover/file:bg-slate-300", iconColor: "text-slate-600" };
}

function fileExt(fileName?: string | null): string {
  return (fileName?.split(".").pop() || "").toLowerCase();
}
export function isPdfFile(fileName?: string | null, mime?: string | null): boolean {
  return fileExt(fileName) === "pdf" || (mime || "").toLowerCase().includes("pdf");
}
export function isImageFile(fileName?: string | null, mime?: string | null): boolean {
  const ext = fileExt(fileName);
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext) || (mime || "").toLowerCase().startsWith("image/");
}
export function isVideoFile(fileName?: string | null, mime?: string | null): boolean {
  const ext = fileExt(fileName);
  return ["mp4", "mov", "webm", "ogv"].includes(ext) || (mime || "").toLowerCase().startsWith("video/");
}
export function isAudioFile(fileName?: string | null, mime?: string | null): boolean {
  const ext = fileExt(fileName);
  return ["mp3", "wav", "ogg", "m4a", "aac"].includes(ext) || (mime || "").toLowerCase().startsWith("audio/");
}
export function isTextFile(fileName?: string | null, mime?: string | null): boolean {
  const ext = fileExt(fileName);
  const m = (mime || "").toLowerCase();
  // OJO: nada de m.includes("xml") ni m.includes("json") -- el mime de un
  // .docx/.xlsx/.pptx es "application/vnd.openxmlformats-officedocument...",
  // que contiene literalmente "xml" dentro de "openXMLformats" y colaba como
  // texto plano, volcando el ZIP binario del documento como si fuera texto.
  return ["txt", "md", "csv", "log", "json", "xml", "html", "htm", "css", "js", "ts", "tsx", "jsx", "yml", "yaml", "sql", "sh"].includes(ext)
    || m.startsWith("text/")
    || m === "application/json" || m.endsWith("+json")
    || m === "application/xml" || m.endsWith("+xml");
}
// Previsualizar un archivo de texto muy grande sería lento y poco útil.
const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// Solo .docx (Office Open XML) -- mammoth no soporta el binario .doc antiguo.
export function isWordFile(fileName?: string | null, mime?: string | null): boolean {
  return fileExt(fileName) === "docx" || (mime || "").toLowerCase().includes("wordprocessingml");
}

// .xlsx/.xls -- usa SheetJS (xlsx en npm), con vulnerabilidades conocidas y
// sin parchear en el registro (prototype pollution + ReDoS), aceptado a
// propósito para poder previsualizar Excel (ver memoria del proyecto);
// solo procesa archivos ya subidos por miembros de la organización, y corre
// aislado en la pestaña de quien abre la vista previa, no en el servidor.
export function isExcelFile(fileName?: string | null, mime?: string | null): boolean {
  return ["xlsx", "xls"].includes(fileExt(fileName)) || (mime || "").toLowerCase().includes("spreadsheetml") || (mime || "").toLowerCase().includes("ms-excel");
}

export function FilePreviewModal({
  src,
  fileName,
  mime,
  subtitle,
  onDownload,
  downloading,
  onClose,
}: {
  src: string;
  fileName?: string | null;
  mime?: string | null;
  /** Línea secundaria bajo el nombre del archivo (p.ej. autor y fecha). Opcional. */
  subtitle?: string | null;
  onDownload: () => void;
  downloading?: boolean;
  onClose: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const isPdf = isPdfFile(fileName, mime);
  const isImage = isImageFile(fileName, mime);
  const isVideo = isVideoFile(fileName, mime);
  const isAudio = isAudioFile(fileName, mime);
  const isText = isTextFile(fileName, mime);
  const isWord = isWordFile(fileName, mime);
  const isExcel = isExcelFile(fileName, mime);
  const fileTypeIcon = getFileTypeIcon(fileName, mime);
  const displayName = fileName || "Archivo";

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex flex-col bg-slate-950/88 transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${fileTypeIcon.iconBg.replace("group-hover/file:bg-", "")} ${fileTypeIcon.iconColor}`}>
            <fileTypeIcon.Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            {subtitle && <p className="truncate text-xs text-slate-300">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-2 py-2 shadow-lg shadow-black/30 shrink-0">
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {downloading ? "Descargando…" : "Descargar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-slate-700"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4 sm:px-6" onClick={(e) => e.stopPropagation()}>
        {isPdf ? (
          <iframe src={src} title={displayName} className="h-full w-full rounded-xl border border-white/10 bg-white" />
        ) : isImage ? (
          <div className="flex h-full items-center justify-center overflow-auto rounded-xl border border-white/10 bg-slate-900/40">
            <img src={src} alt={displayName} className="max-h-full max-w-full object-contain" />
          </div>
        ) : isVideo ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={src} controls autoPlay className="max-h-full max-w-full" />
          </div>
        ) : isAudio ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-slate-700 bg-slate-900 px-6">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${fileTypeIcon.iconBg} ${fileTypeIcon.iconColor}`}>
              <fileTypeIcon.Icon size={28} />
            </div>
            <p className="text-sm font-semibold text-white text-center">{displayName}</p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={src} controls autoPlay className="w-full max-w-md" />
          </div>
        ) : isText ? (
          <TextFilePreview src={src} />
        ) : isWord ? (
          <WordFilePreview src={src} />
        ) : isExcel ? (
          <ExcelFilePreview src={src} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-slate-700 bg-slate-900 text-center px-6">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${fileTypeIcon.iconBg} ${fileTypeIcon.iconColor}`}>
              <fileTypeIcon.Icon size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{displayName}</p>
              <p className="mt-1 text-xs text-slate-300">Este tipo de archivo no se puede previsualizar aquí</p>
            </div>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? "Descargando…" : "Descargar"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Vista de texto plano/código: se descarga el contenido como texto (con un
// tope de tamaño, ver TEXT_PREVIEW_MAX_BYTES) y se muestra en monoespaciada
// con scroll -- evita intentar "renderizar" el archivo y simplemente lo lee.
function TextFilePreview({ src }: { src: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; text: string } | { status: "too-big" } | { status: "error" }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch");
        const len = Number(res.headers.get("content-length") || 0);
        if (len && len > TEXT_PREVIEW_MAX_BYTES) {
          if (!cancelled) setState({ status: "too-big" });
          return;
        }
        const text = await res.text();
        if (text.length > TEXT_PREVIEW_MAX_BYTES) {
          if (!cancelled) setState({ status: "too-big" });
          return;
        }
        if (!cancelled) setState({ status: "ok", text });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (state.status === "too-big") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 text-center">
        <p className="text-sm text-slate-300">El archivo es demasiado grande para previsualizarlo aquí -- descárgalo para verlo.</p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 text-center">
        <p className="text-sm text-slate-300">No se pudo cargar el contenido del archivo.</p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-4">
      <pre className="whitespace-pre-wrap break-words text-xs text-slate-100 font-mono">{state.text}</pre>
    </div>
  );
}

// Vista de Word (.docx): se convierte a HTML enteramente en el navegador con
// mammoth (import dinámico para no engordar el bundle inicial con algo que
// solo hace falta al abrir un docx) -- el archivo nunca sale de Vantia hacia
// un visor externo, a diferencia de Google Docs Viewer/Office Online.
function WordFilePreview({ src }: { src: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; html: string } | { status: "error" }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const [res, mammoth] = await Promise.all([fetch(src), import("mammoth")]);
        if (!res.ok) throw new Error("fetch");
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setState({ status: "ok", html: result.value });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 text-center">
        <p className="text-sm text-slate-300">No se pudo generar la vista previa de este documento.</p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto rounded-xl bg-white p-6 sm:p-10">
      <div
        className="mx-auto max-w-3xl text-sm leading-relaxed text-slate-800 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2 [&_p]:mb-3 [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-300 [&_th]:p-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full"
        // El HTML lo genera mammoth a partir del propio XML del docx (estructura
        // semántica: p/h1/table/etc.), no contenido de terceros sin filtrar --
        // mismo nivel de confianza que el resto de HTML que ya generamos nosotros.
        dangerouslySetInnerHTML={{ __html: state.html }}
      />
    </div>
  );
}

// Vista de Excel (.xlsx/.xls): se lee con SheetJS (xlsx) enteramente en el
// navegador y cada hoja se convierte a una tabla HTML -- si el libro tiene
// varias hojas, se puede cambiar entre ellas con las pestañas de arriba.
function ExcelFilePreview({ src }: { src: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; sheets: { name: string; html: string }[] } | { status: "error" }>({ status: "loading" });
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setActiveSheet(0);
    (async () => {
      try {
        const [res, XLSX] = await Promise.all([fetch(src), import("xlsx")]);
        if (!res.ok) throw new Error("fetch");
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheets = workbook.SheetNames.map(name => ({
          name,
          html: XLSX.utils.sheet_to_html(workbook.Sheets[name], { header: "", footer: "" }),
        }));
        if (!cancelled) setState({ status: "ok", sheets });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-6 text-center">
        <p className="text-sm text-slate-300">No se pudo generar la vista previa de esta hoja de cálculo.</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white">
      {state.sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-1.5 shrink-0">
          {state.sheets.map((s, i) => (
            <button key={s.name} type="button" onClick={() => setActiveSheet(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${i === activeSheet ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:bg-white/60"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        className="flex-1 overflow-auto p-4 text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-50"
        // Igual que en WordFilePreview: HTML generado por la propia librería a
        // partir de las celdas del libro, no contenido de terceros sin filtrar.
        dangerouslySetInnerHTML={{ __html: state.sheets[activeSheet]?.html || "" }}
      />
    </div>
  );
}
