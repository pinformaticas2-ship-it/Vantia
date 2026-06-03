/**
 * usePasteFiles — permite pegar archivos (Ctrl+V) en cualquier zona de adjuntos.
 * Soporta:
 *   • Archivos copiados desde el explorador de archivos del SO
 *   • Imágenes/capturas de pantalla del portapapeles del sistema
 *   • Archivos copiados desde el propio ERP (portapapeles interno)
 */
import { useEffect, useRef, useCallback } from "react";

// ── Portapapeles interno del ERP ──────────────────────────────────────────────
interface ErpClipEntry { blob: Blob; name: string; type: string }
let erpClip: ErpClipEntry | null = null;

export function setErpClipboard(entry: ErpClipEntry) { erpClip = entry; }
export function getErpClipboard() { return erpClip; }
export function clearErpClipboard() { erpClip = null; }

// ── Deduplicación: si varios componentes están montados, solo procesa una vez ─
let lastPasteId = "";

function getFileFromClipboardItem(item: DataTransferItem): File | null {
  if (item.kind !== "file") return null;
  const file = item.getAsFile();
  if (!file) return null;
  // Renombrar capturas de pantalla que llegan sin nombre útil
  const hasGoodName =
    file.name &&
    file.name !== "image.png" &&
    file.name !== "image.jpeg" &&
    !file.name.startsWith("screenshot") &&
    file.name.length > 4;
  if (hasGoodName) return file;
  const ext = file.type.split("/")[1] || "png";
  const ts = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
  return new File([file], `imagen_pegada_${ts}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
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

    // No interceptar si el usuario está escribiendo en un campo de texto
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) return;

    // Deduplicar si múltiples componentes escuchan el mismo evento
    const pasteId = `${Date.now()}-${Math.random()}`;
    const items = e.clipboardData?.items;
    const files: File[] = [];

    if (items) {
      for (const item of Array.from(items)) {
        const f = getFileFromClipboardItem(item);
        if (f) files.push(f);
      }
    }

    // Portapapeles interno del ERP (si no hay archivos del sistema)
    if (files.length === 0 && erpClip) {
      files.push(new File([erpClip.blob], erpClip.name, { type: erpClip.type }));
      erpClip = null; // consume el portapapeles interno
    }

    if (files.length === 0) return;

    // Evitar doble procesado si dos handlers responden al mismo evento
    if (lastPasteId === pasteId) return;
    lastPasteId = pasteId;

    e.preventDefault();
    onFilesRef.current(files);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste, enabled]);
}
