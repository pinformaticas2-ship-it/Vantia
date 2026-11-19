import { useEffect, useRef, useState } from "react";
import { getFileTypeIcon, isPdfFile, isImageFile, isWordFile, isExcelFile, isTextFile } from "./FilePreviewModal";

// ══════════════════════════════════════════════════════════════════════════════
// MINIATURA DE UN ARCHIVO ADJUNTO (19/11/2026) -- la primera página del propio
// documento en pequeño, como en Drive/WhatsApp: PDF (pdf.js), Word (mammoth),
// Excel (SheetJS, solo las primeras filas) y texto. Todo en el navegador, sin
// mandar el archivo fuera (mismo criterio que FilePreviewModal).
//  · Solo se genera cuando la tarjeta entra en pantalla (un chat largo no
//    descarga todos sus adjuntos al abrirse) y como mucho 2 a la vez.
//  · Se guarda en memoria por URL: volver a la conversación no repite trabajo.
//  · Archivos muy grandes o que fallan → icono del tipo, como antes.
// ══════════════════════════════════════════════════════════════════════════════

type Miniatura =
  | { tipo: "imagen"; url: string }
  | { tipo: "html"; html: string; clase: "word" | "excel" }
  | { tipo: "texto"; texto: string }
  | null;

const MAX_BYTES = 15 * 1024 * 1024;
const cache = new Map<string, Promise<Miniatura>>();

// Cola sencilla: como mucho 2 miniaturas generándose a la vez.
let activas = 0;
const cola: (() => void)[] = [];
function enCola<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const lanzar = () => {
      activas++;
      fn().then(resolve, reject).finally(() => { activas--; cola.shift()?.(); });
    };
    if (activas < 2) lanzar(); else cola.push(lanzar);
  });
}

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function descargar(src: string): Promise<ArrayBuffer | null> {
  const res = await fetch(src);
  if (!res.ok) return null;
  const largo = Number(res.headers.get("content-length") || 0);
  if (largo > MAX_BYTES) { res.body?.cancel().catch(() => {}); return null; }
  const buf = await res.arrayBuffer();
  return buf.byteLength > MAX_BYTES ? null : buf;
}

// Se queda con los primeros bloques del documento: la miniatura solo enseña el
// principio y así no se pinta (ni se guarda) un documento entero de 80 páginas.
function recortarHtml(html: string, maxBloques: number): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const raiz = doc.body.firstElementChild as HTMLElement | null;
  if (!raiz) return "";
  [...raiz.children].slice(maxBloques).forEach((n) => n.remove());
  return raiz.innerHTML;
}

async function generar(src: string, fileName?: string | null, mime?: string | null): Promise<Miniatura> {
  if (isPdfFile(fileName, mime)) {
    const buf = await descargar(src);
    if (!buf) return null;
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    try {
      const pagina = await doc.getPage(1);
      const base = pagina.getViewport({ scale: 1 });
      const vp = pagina.getViewport({ scale: 400 / base.width }); // 2× el ancho de la tarjeta
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(Math.min(vp.height, vp.width * 1.5));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
      return { tipo: "imagen", url: canvas.toDataURL("image/jpeg", 0.82) };
    } finally {
      doc.destroy?.();
    }
  }
  if (isWordFile(fileName, mime)) {
    const [buf, mammoth] = await Promise.all([descargar(src), import("mammoth")]);
    if (!buf) return null;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
    const html = recortarHtml(value, 25);
    return html.trim() ? { tipo: "html", html, clase: "word" } : null;
  }
  if (isExcelFile(fileName, mime)) {
    const [buf, XLSX] = await Promise.all([descargar(src), import("xlsx")]);
    if (!buf) return null;
    // sheetRows: SheetJS deja de leer a partir de la fila 25 → rápido aunque
    // la hoja tenga miles de filas.
    const libro = XLSX.read(buf, { type: "array", sheetRows: 25 });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    if (!hoja) return null;
    return { tipo: "html", html: XLSX.utils.sheet_to_html(hoja, { header: "", footer: "" }), clase: "excel" };
  }
  if (isTextFile(fileName, mime)) {
    const buf = await descargar(src);
    if (!buf) return null;
    const texto = new TextDecoder().decode(buf.slice(0, 3000));
    return texto.trim() ? { tipo: "texto", texto } : null;
  }
  return null;
}

export function admiteMiniatura(fileName?: string | null, mime?: string | null): boolean {
  return isPdfFile(fileName, mime) || isWordFile(fileName, mime) || isExcelFile(fileName, mime) || isTextFile(fileName, mime);
}

function obtener(src: string, fileName?: string | null, mime?: string | null): Promise<Miniatura> {
  let p = cache.get(src);
  if (!p) {
    p = enCola(() => generar(src, fileName, mime)).catch(() => null);
    cache.set(src, p);
  }
  return p;
}

// Etiqueta de extensión (PDF, DOCX, XLSX…) en la esquina de la miniatura.
export function EtiquetaTipo({ fileName, mime }: { fileName?: string | null; mime?: string | null }) {
  const ext = (fileName?.split(".").pop() || "").slice(0, 4).toUpperCase();
  if (!ext) return null;
  // Color sólido fijo (igual en claro, oscuro y cualquier tema): va encima de
  // la hoja blanca, y un rojo de PDF no debe volverse el color del tema.
  const color = isPdfFile(fileName, mime) ? "#dc2626"
    : isWordFile(fileName, mime) || /^(DOC|ODT|RTF)$/.test(ext) ? "#2563eb"
    : isExcelFile(fileName, mime) || /^(CSV|ODS)$/.test(ext) ? "#059669"
    : /^(PPT|PPTX|ODP)$/.test(ext) ? "#ea580c"
    : "#475569";
  return (
    <span className="pointer-events-none absolute bottom-1.5 left-4 rounded px-1.5 py-[3px] text-[9px] font-bold leading-none tracking-wide shadow-sm"
      style={{ background: color, color: "#fff" }}>
      {ext}
    </span>
  );
}

export function MiniaturaArchivo({ src, fileName, mime, alto = 150 }: {
  src: string;
  fileName?: string | null;
  mime?: string | null;
  alto?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mini, setMini] = useState<Miniatura | undefined>(undefined);
  const icono = getFileTypeIcon(fileName, mime);
  const esImagen = isImageFile(fileName, mime);

  useEffect(() => {
    if (esImagen || visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [esImagen, visible]);

  useEffect(() => {
    if (!visible || esImagen || !admiteMiniatura(fileName, mime)) return;
    let vivo = true;
    obtener(src, fileName, mime).then((m) => { if (vivo) setMini(m); });
    return () => { vivo = false; };
  }, [visible, esImagen, src, fileName, mime]);

  const cargando = !esImagen && admiteMiniatura(fileName, mime) && mini === undefined;
  // La "hoja" es blanca también en modo oscuro (un documento es papel, como
  // la miniatura del PDF): colores en style/hex arbitrario para que el modo
  // oscuro generado (temasOscuroColores.css) no los invierta.
  const hoja = "absolute inset-x-3 top-3 bottom-0 overflow-hidden rounded-t-md shadow-[0_1px_4px_rgba(15,23,42,0.22)]";
  const papel = { background: "#fff", color: "#1e293b" };

  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-slate-100" style={{ height: alto }}>
      {esImagen ? (
        <img src={src} alt={fileName || ""} className="h-full w-full object-cover" loading="lazy" />
      ) : mini?.tipo === "imagen" ? (
        <div className={hoja} style={papel}>
          <img src={mini.url} alt="" className="w-full object-cover object-top" />
        </div>
      ) : mini?.tipo === "html" ? (
        <div className={hoja} style={papel}>
          {mini.clase === "word" ? (
            <div
              className="pointer-events-none origin-top-left p-8 text-[13px] leading-relaxed [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-bold [&_p]:mb-2.5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#cbd5e1] [&_td]:p-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full"
              style={{ width: 560, transform: "scale(0.3)" }}
              // HTML generado por mammoth a partir del propio docx (ver FilePreviewModal).
              dangerouslySetInnerHTML={{ __html: mini.html }}
            />
          ) : (
            <div
              className="pointer-events-none origin-top-left text-[11px] [&_table]:min-w-full [&_table]:border-collapse [&_td]:whitespace-nowrap [&_td]:border [&_td]:border-[#e2e8f0] [&_td]:px-1.5 [&_td]:py-0.5 [&_tr:first-child_td]:bg-[#ecfdf5] [&_tr:first-child_td]:font-semibold [&_tr:first-child_td]:text-[#065f46]"
              style={{ width: 372, transform: "scale(0.5)" }}
              // HTML generado por SheetJS a partir de las celdas (ver FilePreviewModal).
              dangerouslySetInnerHTML={{ __html: mini.html }}
            />
          )}
        </div>
      ) : mini?.tipo === "texto" ? (
        <div className={`${hoja} p-2`} style={papel}>
          <pre className="whitespace-pre-wrap break-words font-mono text-[7px] leading-[1.35]" style={{ color: "#475569" }}>{mini.texto}</pre>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${icono.iconBg} ${icono.iconColor} ${cargando ? "animate-pulse" : ""}`}>
            <icono.Icon size={22} />
          </div>
        </div>
      )}
      {/* Difuminado inferior: la hoja "continúa" hacia abajo. Sobre el propio
          papel (blanco en ambos modos), así que va en style, no en clases. */}
      {mini && <div className="pointer-events-none absolute inset-x-3 bottom-0 h-8" style={{ background: "linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0))" }} />}
      {!esImagen && <EtiquetaTipo fileName={fileName} mime={mime} />}
    </div>
  );
}
