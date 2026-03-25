import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  X, Upload, FolderOpen, FilePlus2, Sparkles, Loader2,
  Eye, Download, Trash2, Edit3, ExternalLink, FileText,
  Search, ChevronDown, ChevronRight, Paperclip,
} from "lucide-react";
import { safeJson } from "../lib/api";

// ── helpers ───────────────────────────────────────────────────
function fileIcon(mime: string, name: string) {
  const n = name.toLowerCase();
  if (mime.startsWith("image/"))
    return { icon: "🖼️", color: "bg-emerald-100 text-emerald-600", label: "Imagen" };
  if (mime === "application/pdf")
    return { icon: "📄", color: "bg-red-100 text-red-600", label: "PDF" };
  if (mime.includes("word") || n.endsWith(".doc") || n.endsWith(".docx"))
    return { icon: "📝", color: "bg-blue-100 text-blue-600", label: "Word" };
  if (mime.includes("excel") || mime.includes("spreadsheet") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv"))
    return { icon: "📊", color: "bg-green-100 text-green-600", label: "Excel" };
  if (mime.includes("presentation") || mime.includes("powerpoint") || n.endsWith(".pptx") || n.endsWith(".ppt"))
    return { icon: "📑", color: "bg-orange-100 text-orange-600", label: "PPT" };
  if (mime.startsWith("audio/"))
    return { icon: "🎵", color: "bg-purple-100 text-purple-600", label: "Audio" };
  if (mime.startsWith("video/"))
    return { icon: "🎬", color: "bg-pink-100 text-pink-600", label: "Video" };
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("compress") || n.endsWith(".zip") || n.endsWith(".rar") || n.endsWith(".7z"))
    return { icon: "🗜️", color: "bg-amber-100 text-amber-600", label: "ZIP" };
  if (n.endsWith(".eml") || n.endsWith(".msg"))
    return { icon: "✉️", color: "bg-cyan-100 text-cyan-600", label: "Email" };
  if (mime.startsWith("text/"))
    return { icon: "📃", color: "bg-slate-100 text-slate-600", label: "Texto" };
  if (mime.includes("xml") || mime.includes("json"))
    return { icon: "📋", color: "bg-indigo-100 text-indigo-600", label: "Datos" };
  return { icon: "📎", color: "bg-slate-100 text-slate-500", label: "Archivo" };
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mime: string) {
  return mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/");
}

function isWordFile(mime: string, name: string) {
  const n = name.toLowerCase();
  return (
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml") ||
    n.endsWith(".doc") ||
    n.endsWith(".docx")
  );
}

function isExcelFile(mime: string, name: string) {
  const n = name.toLowerCase();
  return (
    mime.includes("excel") ||
    mime.includes("spreadsheetml") ||
    mime.includes("spreadsheet") ||
    n.endsWith(".xlsx") ||
    n.endsWith(".xls") ||
    n.endsWith(".xlsm") ||
    n.endsWith(".xlsb") ||
    n.endsWith(".csv")
  );
}

// ── Props ────────────────────────────────────────────────────
interface AdjuntosModalProps {
  entityId: string;
  entityName: string;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────
export default function AdjuntosModal({ entityId, entityName, onClose }: AdjuntosModalProps) {
  const { getToken } = useAuth();

  const [files, setFiles]               = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading]       = useState(false);
  const [isDragOver, setIsDragOver]     = useState(false);
  const [preview, setPreview]           = useState<{ url: string; name: string; mime: string; fileId?: string; appType?: "word" | "excel" } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // DocPlant
  const [docPlantFolders, setDocPlantFolders]   = useState<{ name: string; files: { name: string; path: string; ext: string }[] }[]>([]);
  const [docPlantLoading, setDocPlantLoading]   = useState(false);
  const [docPlantError, setDocPlantError]       = useState<string | null>(null);
  const [templateSearch, setTemplateSearch]     = useState("");
  const [expandedFolders, setExpandedFolders]   = useState<Set<string>>(new Set());
  const [selectedTpl, setSelectedTpl]           = useState<{ path: string; name: string; ext: string } | null>(null);
  const [tplPreviewHtml, setTplPreviewHtml]     = useState<string | null>(null);
  const [tplPreviewLoading, setTplPreviewLoading] = useState(false);

  // Thumbnails
  const [thumbs, setThumbs]             = useState<Record<string, string>>({});
  const loadingThumbIds                 = useRef<Set<string>>(new Set());
  const previewBlobUrl                  = useRef<string | null>(null);
  const previewCache                    = useRef<Map<string, { url: string; name: string; mime: string; appType?: "word" | "excel" }>>(new Map());

  // File inputs
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Metadata modal
  const [editingFile, setEditingFile]               = useState<{ id: string; document_name: string; attachment_type: string } | null>(null);
  const [editDocName, setEditDocName]               = useState("");
  const [editAttachmentType, setEditAttachmentType] = useState("Sin clasificar");
  const [savingMetadata, setSavingMetadata]         = useState(false);

  // Template pending
  const [pendingTemplate, setPendingTemplate] = useState<{ filePath: string; fileName: string } | null>(null);

  // Upload queue
  const [uploadQueue, setUploadQueue]         = useState<File[]>([]);
  const [uploadQueueTotal, setUploadQueueTotal] = useState(0);
  const pendingUploadFile                     = useRef<File | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Thumbnails ────────────────────────────────────────────
  const loadThumb = useCallback(async (fileId: string) => {
    if (loadingThumbIds.current.has(fileId)) return;
    loadingThumbIds.current.add(fileId);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setThumbs(prev => ({ ...prev, [fileId]: url }));
    } catch (_e) {
      loadingThumbIds.current.delete(fileId);
    }
  }, [entityId, getToken]);

  // ── Download with auth ─────────────────────────────────────
  const downloadWithAuth = useCallback(async (fileId: string, fileName: string) => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Error al descargar: ${err.error || res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (_e) {
      alert("Error al descargar el archivo");
    }
  }, [entityId, getToken]);

  // ── Load files ────────────────────────────────────────────
  const loadFiles = useCallback(async (silent = false) => {
    if (!silent) setLoadingFiles(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) {
        setFiles(data.data || []);
        for (const f of (data.data || [])) {
          if (f.mimetype?.startsWith("image/")) loadThumb(f.id);
        }
      }
    } catch (_e) {}
    finally { if (!silent) setLoadingFiles(false); }
  }, [entityId, loadThumb, getToken]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Upload queue ──────────────────────────────────────────
  const openNextUploadModal = useCallback((file: File, queue: File[], total: number) => {
    pendingUploadFile.current = file;
    setUploadQueue(queue);
    setUploadQueueTotal(total);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setEditDocName(baseName);
    setEditAttachmentType("Sin clasificar");
    setEditingFile({ id: "PENDING_UPLOAD", document_name: baseName, attachment_type: "Sin clasificar" });
  }, []);

  const enqueueFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const [first, ...rest] = arr;
    openNextUploadModal(first, rest, arr.length);
  }, [openNextUploadModal]);

  const uploadSingleFile = async () => {
    const file = pendingUploadFile.current;
    if (!file) return;
    setSavingMetadata(true);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch(`/api/files/${entityId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        const fileId = data.data?.[0]?.id;
        if (fileId) {
          await fetch(`/api/files/${entityId}/${fileId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              document_name: editDocName.trim() || null,
              attachment_type: editAttachmentType,
            }),
          });
        }
        await loadFiles();
        window.dispatchEvent(new CustomEvent("historial-changed"));
        const isWord  = file.type.includes("wordprocessingml") || file.name.match(/\.docx?$/i);
        const isExcel = file.type.includes("spreadsheet") || file.type.includes("excel") || file.name.match(/\.xlsx?$|\.xlsm$|\.xlsb$/i);
        if (fileId && (isWord || isExcel)) {
          const ext = file.name.match(/\.[^/.]+$/)?.[0] ?? (isExcel ? ".xlsx" : ".docx");
          const displayName = editDocName.trim() ? `${editDocName}${ext}` : file.name;
          await openInWord({ id: fileId, original_name: displayName });
        }
      }
    } catch (_e) {}
    finally {
      setSavingMetadata(false);
      setEditingFile(null);
      pendingUploadFile.current = null;
      if (uploadQueue.length > 0) {
        const [next, ...rest] = uploadQueue;
        openNextUploadModal(next, rest, uploadQueueTotal);
      } else {
        setUploadQueueTotal(0);
      }
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const fileArr: File[] = [];
    for (const item of Array.from(e.dataTransfer.items)) {
      const f = item.getAsFile();
      if (f) fileArr.push(f);
    }
    enqueueFiles(fileArr);
  }, [enqueueFiles]);

  // ── Delete file ───────────────────────────────────────────
  const handleDelete = async (fileId: string) => {
    if (!confirm("¿Eliminar este archivo?")) return;
    const token = await getToken({ skipCache: true });
    await fetch(`/api/files/${entityId}/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setFiles(prev => prev.filter(f => f.id !== fileId));
    previewCache.current.delete(fileId);
    if (preview?.fileId === fileId) setPreview(null);
    window.dispatchEvent(new CustomEvent("historial-changed"));
  };

  // ── Open in Word/Excel ─────────────────────────────────────
  const openInWord = useCallback(async (f: any) => {
    const token = await getToken({ skipCache: true });
    try {
      const res = await fetch(`/api/files/${entityId}/${f.id}/open-local`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) await downloadWithAuth(f.id, f.original_name || "documento.docx");
    } catch (_err) {
      await downloadWithAuth(f.id, f.original_name || "documento.docx");
    }
  }, [entityId, getToken, downloadWithAuth]);

  // ── Open PDF in browser ────────────────────────────────────
  const openInBrowser = useCallback(async (f: any) => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${f.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (_e) {}
  }, [entityId, getToken]);

  // ── Preview ────────────────────────────────────────────────
  const openPreview = async (f: any) => {
    const cached = previewCache.current.get(f.id);
    if (cached) { setPreview(cached); return; }

    const token = await getToken({ skipCache: true });
    const isWord  = f.mimetype?.includes("wordprocessingml") || f.original_name?.match(/\.docx?$/i);
    const isExcel = isExcelFile(f.mimetype || "", f.original_name || "");
    const endpoint = isWord
      ? `/api/files/${entityId}/${f.id}/preview-html`
      : isExcel
        ? `/api/files/${entityId}/${f.id}/preview-excel`
        : `/api/files/${entityId}/${f.id}/download`;

    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.error || `Error ${res.status}`;
      const errorHtml = `<html><body style="font-family:Arial;margin:20px;color:#d32f2f"><h2>Error al cargar vista previa</h2><p>${errorMsg}</p></body></html>`;
      const blob = new Blob([errorHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      setPreview({ url, name: f.original_name, mime: "text/html", fileId: f.id });
      return;
    }

    if (isWord || isExcel) {
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime: "text/html", fileId: f.id, appType: (isExcel ? "excel" : "word") as "word" | "excel" };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    } else {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime: f.mimetype, fileId: f.id };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    }
  };

  // ── Blank doc ──────────────────────────────────────────────
  const showCreateBlankModal = () => {
    setEditingFile({ id: "NEW_BLANK", document_name: "", attachment_type: "Sin clasificar" });
    setEditDocName("");
    setEditAttachmentType("Sin clasificar");
  };

  const createBlankDoc = async () => {
    if (!editingFile || editingFile.id !== "NEW_BLANK") return;
    setSavingMetadata(true);
    const token = await getToken({ skipCache: true });
    try {
      const res = await fetch(`/api/files/${entityId}/create-blank`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_name: editDocName, attachment_type: editAttachmentType }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        setEditingFile(null);
        await loadFiles();
        await downloadWithAuth(data.data.id, data.data.original_name);
      }
    } catch (_e) {}
    finally { setSavingMetadata(false); }
  };

  // ── Template preview ───────────────────────────────────────
  const loadTplPreview = async (file: { path: string; name: string; ext: string }) => {
    setSelectedTpl(file);
    setTplPreviewHtml(null);
    setTplPreviewLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/templates/preview?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const html = await res.text();
      setTplPreviewHtml(html);
    } catch (e: any) {
      setTplPreviewHtml(`<html><body style="padding:20px;font-family:sans-serif;color:#dc2626"><p>Error al cargar vista previa</p><p style="font-size:11px;color:#999">${e.message}</p></body></html>`);
    } finally { setTplPreviewLoading(false); }
  };

  const openTemplatesModal = async (forceReload = false) => {
    setShowTemplates(true);
    setTemplateSearch("");
    setSelectedTpl(null);
    setTplPreviewHtml(null);
    if (docPlantFolders.length > 0 && !forceReload) return;
    setDocPlantLoading(true);
    setDocPlantError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/files/templates", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success) {
        setDocPlantFolders(data.data || []);
        if (data.data && data.data.length > 0) {
          setExpandedFolders(new Set([data.data[0].name]));
        } else {
          setDocPlantError(data.warning || "No se encontraron plantillas en la carpeta DocPlant.");
        }
      } else {
        setDocPlantError(data.error || "Error al cargar plantillas.");
      }
    } catch (e: any) {
      setDocPlantError(e.message || "Error de conexión al cargar plantillas.");
    } finally { setDocPlantLoading(false); }
  };

  const showTemplateModal = (filePath: string, fileName: string) => {
    setPendingTemplate({ filePath, fileName });
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    setEditingFile({ id: "PENDING_TEMPLATE", document_name: "", attachment_type: "Sin clasificar" });
    setEditDocName(baseName);
    setEditAttachmentType("Sin clasificar");
  };

  const downloadDocPlantTemplate = async () => {
    if (!pendingTemplate) return;
    setSavingMetadata(true);
    const token = await getToken({ skipCache: true });
    try {
      const res = await fetch(`/api/files/templates/download?path=${encodeURIComponent(pendingTemplate.filePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const finalFileName = editDocName.trim()
        ? `${editDocName}.${pendingTemplate.fileName.split(".").pop()}`
        : pendingTemplate.fileName;
      const file = new File([blob], finalFileName, { type: blob.type });
      const fd = new FormData();
      fd.append("files", file);
      const uploadRes = await fetch(`/api/files/${entityId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        const fileId = data.data?.[0]?.id;
        if (fileId) {
          if (editDocName.trim() || editAttachmentType !== "Sin clasificar") {
            await fetch(`/api/files/${entityId}/${fileId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ document_name: editDocName.trim() || null, attachment_type: editAttachmentType }),
            });
          }
          await loadFiles();
          await downloadWithAuth(fileId, finalFileName);
        }
        setShowTemplates(false);
        setEditingFile(null);
        setPendingTemplate(null);
      }
    } catch (_e) {}
    finally { setSavingMetadata(false); }
  };

  // ── Save metadata ──────────────────────────────────────────
  const saveFileMetadata = async () => {
    if (!editingFile) return;
    setSavingMetadata(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${editingFile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_name: editDocName, attachment_type: editAttachmentType }),
      });
      if (res.ok) {
        previewCache.current.delete(editingFile.id);
        await loadFiles();
        setEditingFile(null);
      }
    } catch (_e) {}
    finally { setSavingMetadata(false); }
  };

  // ── Render ─────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-slate-50 w-full max-w-7xl mx-4 my-4 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "calc(100vh - 32px)" }}
      >
        {/* ── Modal header ── */}
        <div className="flex items-center gap-3 px-6 py-3.5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-100">
            <Paperclip size={17} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Adjuntos</h2>
            <p className="text-[11px] text-slate-500 truncate">{entityName}</p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {loadingFiles ? "Cargando…" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
          </span>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors ml-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
            >
              <FolderOpen size={13} /> Importar carpeta
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
            >
              <Upload size={13} /> Subir archivo
            </button>
            <button
              onClick={showCreateBlankModal}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
            >
              <FilePlus2 size={13} /> Nuevo
            </button>
            <button
              onClick={() => openTemplatesModal()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <Sparkles size={13} /> Usar plantilla
            </button>
          </div>

          {/* Hidden inputs */}
          <input
            ref={fileInputRef} type="file" multiple className="hidden"
            onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ""; } }}
          />
          <input
            ref={folderInputRef} type="file" multiple className="hidden"
            {...({ webkitdirectory: "true", directory: "true" } as any)}
            onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ""; } }}
          />

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all
              ${isDragOver ? "border-red-400 bg-red-50/50 scale-[1.01]" : "border-slate-200 hover:border-red-300 hover:bg-red-50/20"}`}
          >
            {uploading
              ? <><Loader2 size={24} className="text-red-500 animate-spin" /><p className="text-sm font-medium text-red-600">Subiendo archivos…</p></>
              : <><Upload size={24} className={isDragOver ? "text-red-500" : "text-slate-400"} />
                  <p className={`text-sm font-medium ${isDragOver ? "text-red-600" : "text-slate-500"}`}>Arrastra archivos o carpetas aquí</p>
                  <p className="text-xs text-slate-400">PDF, Word, Excel, imágenes — máx. 50 MB por archivo</p>
                </>
            }
          </div>

          {/* File list + preview */}
          <div className="flex gap-3 items-start">
            {/* List */}
            <div className={`${preview ? "w-[42%] shrink-0" : "w-full"} transition-all duration-300`}>
              {loadingFiles ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 flex justify-center">
                  <Loader2 size={24} className="animate-spin text-red-500" />
                </div>
              ) : files.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-2 text-slate-400">
                  <FileText size={36} className="opacity-20" />
                  <p className="text-sm font-medium">No hay documentos adjuntos</p>
                  <p className="text-xs text-slate-300">Sube archivos o crea documentos con las plantillas</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivo</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Documento</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tipo</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tamaño</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Fecha</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {files.map((f: any) => {
                        const fi = fileIcon(f.mimetype, f.original_name);
                        const canPreview = isPreviewable(f.mimetype);
                        const canWord    = isWordFile(f.mimetype, f.original_name);
                        const canExcel   = isExcelFile(f.mimetype, f.original_name);
                        const handleNameClick = (canPreview || canWord || canExcel) ? () => openPreview(f) : undefined;
                        return (
                          <tr key={f.id} className="hover:bg-slate-50/60 transition-colors group">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {f.mimetype?.startsWith("image/") && thumbs[f.id]
                                  ? (
                                    <img
                                      src={thumbs[f.id]}
                                      alt=""
                                      className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-100 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                      onClick={() => openPreview(f)}
                                    />
                                  ) : (
                                    <span
                                      className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${fi.color} ${f.mimetype?.startsWith("image/") ? "animate-pulse" : ""} cursor-pointer hover:scale-105 transition-transform`}
                                      onClick={() => { if (f.mimetype?.startsWith("image/")) loadThumb(f.id); else if (canPreview || canWord || canExcel) handleNameClick?.(); }}
                                    >
                                      {fi.icon}
                                    </span>
                                  )
                                }
                                <div className="min-w-0">
                                  <button
                                    onClick={handleNameClick}
                                    className={`text-sm font-medium text-slate-700 text-left truncate block max-w-[180px] ${(canPreview || canWord || canExcel) ? "hover:text-red-600 hover:underline cursor-pointer" : ""}`}
                                    title={canWord ? "Abrir en Word" : canExcel ? "Abrir en Excel" : f.original_name}
                                  >
                                    {f.original_name}
                                  </button>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fi.color}`}>
                                    {fi.label}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 hidden lg:table-cell max-w-[150px] truncate" title={f.document_name || "Sin nombre"}>
                              {f.document_name || <span className="text-slate-400 italic">Sin nombre</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">
                              <span className={`px-2 py-1 rounded text-[10px] font-medium ${fi.color}`}>
                                {f.attachment_type || "Sin clasificar"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">{fmtSize(f.size_bytes)}</td>
                            <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                              {new Date(f.created_at).toLocaleDateString("es-ES")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                {(canPreview || canWord || canExcel) && (
                                  <button onClick={() => openPreview(f)} title="Vista previa"
                                    className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                                    <Eye size={14} />
                                  </button>
                                )}
                                <button
                                  title="Editar"
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                  onClick={() => {
                                    setEditingFile({ id: f.id, document_name: f.document_name || "", attachment_type: f.attachment_type || "Sin clasificar" });
                                    setEditDocName(f.document_name || "");
                                    setEditAttachmentType(f.attachment_type || "Sin clasificar");
                                  }}
                                >
                                  <Edit3 size={14} />
                                </button>
                                {f.mimetype === "application/pdf" && (
                                  <button title="Abrir en navegador"
                                    className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                    onClick={() => openInBrowser(f)}>
                                    <ExternalLink size={14} />
                                  </button>
                                )}
                                {canWord && (
                                  <button title="Abrir en Word"
                                    className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                                    onClick={() => openInWord(f)}>
                                    <Download size={14} />
                                  </button>
                                )}
                                {canExcel && (
                                  <button title="Abrir en Excel"
                                    className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                                    onClick={() => openInWord(f)}>
                                    <Download size={14} />
                                  </button>
                                )}
                                {!f.mimetype?.includes("pdf") && !canWord && !canExcel && (
                                  <button title="Descargar"
                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                    onClick={() => downloadWithAuth(f.id, f.original_name)}>
                                    <Download size={14} />
                                  </button>
                                )}
                                <button onClick={() => handleDelete(f.id)} title="Eliminar"
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Preview panel */}
            {preview && (
              <div
                className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-lg"
                style={{ position: "sticky", top: 0, height: "calc(100vh - 260px)" }}
              >
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">
                      {preview.mime === "application/pdf" ? "📄"
                        : preview.mime.startsWith("image/") ? "🖼️"
                        : preview.appType === "excel" ? "📊"
                        : "📝"}
                    </span>
                    <p className="text-xs font-bold text-slate-700 truncate" title={preview.name}>
                      {preview.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {preview.mime === "text/html" && preview.fileId && preview.appType === "word" && (
                      <button
                        onClick={() => openInWord({ id: preview.fileId!, original_name: preview.name })}
                        className="flex items-center gap-1 text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1 rounded-lg transition-colors border border-neutral-200"
                      >
                        Abrir en Word
                      </button>
                    )}
                    {preview.mime === "text/html" && preview.fileId && preview.appType === "excel" && (
                      <button
                        onClick={() => openInWord({ id: preview.fileId!, original_name: preview.name })}
                        className="flex items-center gap-1 text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1 rounded-lg transition-colors border border-neutral-200"
                      >
                        Abrir en Excel
                      </button>
                    )}
                    <a href={preview.url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Abrir en nueva pestaña">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                    <button
                      onClick={() => {
                        if (previewBlobUrl.current) { URL.revokeObjectURL(previewBlobUrl.current); previewBlobUrl.current = null; }
                        setPreview(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Cerrar vista previa"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                  {preview.mime === "application/pdf" && (
                    <object data={preview.url} type="application/pdf" className="w-full h-full" style={{ minHeight: 0 }}>
                      <iframe src={`${preview.url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`} className="w-full h-full border-0" title={preview.name} />
                    </object>
                  )}
                  {preview.mime.startsWith("image/") && (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 overflow-auto p-3">
                      <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain rounded shadow-2xl" />
                    </div>
                  )}
                  {preview.mime === "text/html" && (
                    <iframe src={preview.url} className="w-full h-full border-0 bg-white" title={preview.name} sandbox="allow-same-origin allow-scripts" style={{ minHeight: 0 }} />
                  )}
                  {preview.mime.startsWith("text/") && preview.mime !== "text/html" && (
                    <iframe src={preview.url} className="w-full h-full border-0 bg-white" title={preview.name} style={{ minHeight: 0 }} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Templates modal ── */}
      {showTemplates && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTemplates(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 overflow-hidden flex flex-col" style={{ height: "88vh" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-3">
                <Sparkles size={16} className="text-red-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Plantillas del despacho</h2>
                  <p className="text-[11px] text-slate-400">Selecciona una plantilla para previsualizarla</p>
                </div>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* LEFT: file tree */}
              <div className="w-72 shrink-0 border-r border-slate-100 flex flex-col overflow-hidden bg-white">
                <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={templateSearch}
                      onChange={e => setTemplateSearch(e.target.value)}
                      placeholder="Buscar plantilla…"
                      className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {docPlantLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                      <Loader2 size={22} className="animate-spin text-red-500" />
                      <p className="text-xs">Cargando plantillas…</p>
                    </div>
                  ) : docPlantError ? (
                    <div className="p-3">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                        <p className="text-xs font-bold text-amber-700 mb-1">Error al cargar</p>
                        <p className="text-[11px] text-amber-600">{docPlantError}</p>
                      </div>
                      <button
                        onClick={() => openTemplatesModal(true)}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
                      >
                        <Loader2 size={11} /> Reintentar
                      </button>
                    </div>
                  ) : docPlantFolders.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-8">No se encontraron plantillas</p>
                  ) : (() => {
                    const q = templateSearch.toLowerCase().trim();
                    const filteredFolders = docPlantFolders.map(folder => ({
                      ...folder,
                      files: q ? folder.files.filter(f => f.name.toLowerCase().includes(q)) : folder.files,
                    })).filter(f => f.files.length > 0);

                    if (filteredFolders.length === 0) return <p className="text-center text-xs text-slate-400 py-6">Sin resultados</p>;

                    return filteredFolders.map(folder => {
                      const isOpen = q ? true : expandedFolders.has(folder.name);
                      return (
                        <div key={folder.name}>
                          <button
                            onClick={() => setExpandedFolders(prev => {
                              const next = new Set(prev);
                              if (next.has(folder.name)) next.delete(folder.name);
                              else next.add(folder.name);
                              return next;
                            })}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                              <FolderOpen size={13} className="text-amber-500 shrink-0" />
                              <span className="truncate">{folder.name}</span>
                              <span className="text-[10px] font-normal text-slate-400 shrink-0">({folder.files.length})</span>
                            </span>
                            {isOpen ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronRight size={12} className="text-slate-400 shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="ml-3 border-l border-slate-100 pl-2 space-y-0.5 mt-0.5 mb-1">
                              {folder.files.map(f => {
                                const isSelected = selectedTpl?.path === f.path;
                                return (
                                  <button
                                    key={f.path}
                                    onClick={() => loadTplPreview(f)}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${isSelected ? "bg-red-50 text-red-700" : "hover:bg-neutral-50 text-neutral-600"}`}
                                  >
                                    <span className="shrink-0 text-xs">{f.ext === ".docx" ? "📝" : "📄"}</span>
                                    <span className="text-xs truncate flex-1" title={f.name}>{f.name.replace(/\.[^.]+$/, "")}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* RIGHT: preview */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                {!selectedTpl ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-30"><rect x="8" y="4" width="32" height="40" rx="3" fill="#94a3b8"/><rect x="13" y="14" width="22" height="2" rx="1" fill="white"/><rect x="13" y="20" width="22" height="2" rx="1" fill="white"/><rect x="13" y="26" width="14" height="2" rx="1" fill="white"/></svg>
                    <p className="text-sm">Selecciona una plantilla para previsualizar</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{selectedTpl.ext === ".docx" ? "📝" : "📄"}</span>
                        <span className="text-xs font-semibold text-slate-700 truncate">{selectedTpl.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0">{selectedTpl.ext}</span>
                      </div>
                      <button
                        onClick={() => showTemplateModal(selectedTpl.path, selectedTpl.name)}
                        className="shrink-0 ml-3 flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg active:scale-95 transition-all"
                      >
                        <Download size={12} /> Seleccionar
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                      {tplPreviewLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                          <Loader2 size={28} className="animate-spin text-red-500" />
                          <p className="text-sm">Cargando vista previa…</p>
                        </div>
                      ) : tplPreviewHtml ? (
                        <iframe srcDoc={tplPreviewHtml} className="w-full h-full border-0" title="Vista previa de plantilla" sandbox="allow-same-origin" />
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Metadata / upload modal ── */}
      {editingFile && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingFile(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingFile.id === "NEW_BLANK"
                    ? "Nuevo documento"
                    : editingFile.id === "PENDING_TEMPLATE"
                    ? "Usar plantilla"
                    : editingFile.id === "PENDING_UPLOAD"
                    ? "Adjuntar archivo"
                    : "Editar documento"}
                </h2>
                {editingFile.id === "PENDING_UPLOAD" && uploadQueueTotal > 1 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Archivo {uploadQueueTotal - uploadQueue.length} de {uploadQueueTotal}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingFile(null);
                  if (editingFile.id === "PENDING_UPLOAD") { setUploadQueue([]); setUploadQueueTotal(0); pendingUploadFile.current = null; }
                }}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Nombre del documento</label>
                <input
                  type="text"
                  value={editDocName}
                  onChange={e => setEditDocName(e.target.value)}
                  placeholder="Ej: 1. - Consentimiento"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  autoFocus
                />
                {editingFile.id === "PENDING_UPLOAD" && pendingUploadFile.current && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Archivo: <span className="font-medium text-slate-500">{pendingUploadFile.current.name}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tipo de adjunto</label>
                <select
                  value={editAttachmentType}
                  onChange={e => setEditAttachmentType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                >
                  <option value="Sin clasificar">Sin clasificar</option>
                  <option value="AUTO">AUTO</option>
                  <option value="ESCRITO PROCESAL">ESCRITO PROCESAL</option>
                  <option value="FACTURAS">FACTURAS</option>
                  <option value="PODER">PODER</option>
                  <option value="EVIDENCIA">EVIDENCIA</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setEditingFile(null);
                  if (editingFile.id === "PENDING_UPLOAD") { setUploadQueue([]); setUploadQueueTotal(0); pendingUploadFile.current = null; }
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {editingFile.id === "PENDING_UPLOAD" && uploadQueueTotal > 1 ? "Cancelar todo" : "Cancelar"}
              </button>
              <button
                onClick={() => {
                  if (editingFile.id === "NEW_BLANK") createBlankDoc();
                  else if (editingFile.id === "PENDING_TEMPLATE") downloadDocPlantTemplate();
                  else if (editingFile.id === "PENDING_UPLOAD") uploadSingleFile();
                  else saveFileMetadata();
                }}
                disabled={savingMetadata || (editingFile.id !== "PENDING_UPLOAD" && !editDocName.trim())}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {savingMetadata
                  ? "Subiendo..."
                  : editingFile.id === "NEW_BLANK"
                  ? "Crear"
                  : editingFile.id === "PENDING_TEMPLATE"
                  ? "Usar"
                  : editingFile.id === "PENDING_UPLOAD"
                  ? (uploadQueue.length > 0 ? `Adjuntar (${uploadQueueTotal - uploadQueue.length}/${uploadQueueTotal})` : "Adjuntar")
                  : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
