/**
 * usePasteFiles — permite pegar archivos (Ctrl+V) en cualquier zona de adjuntos.
 * Soporta:
 *   • Imágenes/capturas de pantalla del portapapeles del sistema (Ctrl+V)
 *   • Archivos copiados desde el propio ERP (portapapeles interno del ERP)
 *
 * NOTA: Los archivos copiados del Explorador de Windows (Ctrl+C sobre archivos)
 * no son accesibles desde el navegador por limitaciones del API Clipboard del browser.
 * Para esos casos, usar arrastrar y soltar (drag & drop) sobre la zona de adjuntos.
 */
import { useEffect, useRef, useCallback } from "react";

// ── Portapapeles interno del ERP ──────────────────────────────────────────────
export interface ErpClipEntry { blob: Blob; name: string; type: string }
let erpClip: ErpClipEntry | null = null;

export function setErpClipboard(entry: ErpClipEntry) { erpClip = entry; }
export function getErpClipboard(): ErpClipEntry | null { return erpClip; }
export function clearErpClipboard() { erpClip = null; }

// ── Deduplicación: timestamp para evitar doble procesado ─────────────────────
let lastPasteTs = 0;

function buildFileFromItem(item: DataTransferItem): File | null {
  if (item.kind !== "file") return null;
  const file = item.getAsFile();
  if (!file) return null;
  // Dar nombre útil a capturas de pantalla
  const isGeneric =
    !file.name ||
    file.name === "image.png" ||
    file.name === "image.jpeg" ||
    file.name === "image.jpg" ||
    /^screenshot/i.test(file.name);
  if (!isGeneric) return file;
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const ts = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
  return new File([file], `captura_${ts}.${ext}`, { type: file.type, lastModified: Date.now() });
}

// ── Hook principal ─────────────────────────────────────────────────────────────
export function usePasteFiles(
  onFiles: (files: File[]) => void,
  enabled = true,
) {
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!enabled) return;

    // Sólo bloquear si hay un campo de texto con contenido activo (formulario en uso)
    const active = document.activeElement as HTMLElement | null;
    if (active) {
      const tag = active.tagName;
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT") {
        const inputType = (active as HTMLInputElement).type || "text";
        const textTypes = ["text", "search", "email", "url", "password", "tel", "number"];
        if (textTypes.includes(inputType)) return;
      }
      if (active.isContentEditable) return;
    }

    const now = Date.now();
    if (now - lastPasteTs < 200) return; // deduplicar eventos muy seguidos
    lastPasteTs = now;

    const items = e.clipboardData?.items;
    const files: File[] = [];

    if (items) {
      for (const item of Array.from(items)) {
        const f = buildFileFromItem(item);
        if (f) files.push(f);
      }
    }

    // Portapapeles interno del ERP (si no hay archivos del sistema)
    if (files.length === 0 && erpClip) {
      files.push(new File([erpClip.blob], erpClip.name, { type: erpClip.type }));
      erpClip = null;
    }

    if (files.length === 0) return;

    e.preventDefault();
    onFilesRef.current(files);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste, enabled]);
}
