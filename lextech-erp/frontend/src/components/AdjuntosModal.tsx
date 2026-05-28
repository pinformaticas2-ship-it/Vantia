import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  X, Upload, FolderOpen, FilePlus2, Sparkles, Loader2,
  Eye, Download, Trash2, Edit3, ExternalLink, FileText,
  Search, ChevronDown, ChevronRight, Paperclip,
  Star, Mail, MessageCircle, FileOutput, Table2, Settings2,
  ChevronLeft, LayoutList, Grid3X3, Folder, AlertTriangle,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { UndoToast } from "./UndoToast";
import { useUndoDelete } from "../lib/useUndoDelete";

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
function openMailDraft(subject: string, body?: string) {
  const params = new URLSearchParams({ subject });
  if (body?.trim()) params.set("body", body);
  window.open(`mailto:?${params.toString()}`);
}

// ── Props ────────────────────────────────────────────────────
interface AdjuntosModalProps {
  entityId: string;
  entityName: string;
  onClose: () => void;
  inline?: boolean;
  autoOpenAfterAttach?: boolean;
}

// ── Component ─────────────────────────────────────────────────
export default function AdjuntosModal({
  entityId,
  entityName,
  onClose,
  inline = false,
  autoOpenAfterAttach = false,
}: AdjuntosModalProps) {
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

  // Delete confirmation + undo
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const { pending: pendingFileDelete, startDelete: startFileDelete, undo: undoFileDelete, dismiss: dismissFileDelete } = useUndoDelete<any>({
    onDelete: async (fileId: string) => {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/files/${entityId}/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      window.dispatchEvent(new CustomEvent("historial-changed"));
    },
  });

  // Template pending
  const [pendingTemplate, setPendingTemplate] = useState<{ filePath: string; fileName: string } | null>(null);

  // Upload queue
  const [uploadQueue, setUploadQueue]         = useState<File[]>([]);
  const [uploadQueueTotal, setUploadQueueTotal] = useState(0);
  const pendingUploadFile                     = useRef<File | null>(null);

  // UI state – new toolbar/sidebar layout
  const [selectedFileId, setSelectedFileId]   = useState<string | null>(null);
  const [searchText, setSearchText]           = useState("");
  const [sidebarSection, setSidebarSection]   = useState<string>("Sin archivar");
  const [viewMode, setViewMode]               = useState<"list" | "grid">("list");
  const [favs, setFavs]                       = useState<Set<string>>(new Set());
  const [filterTipo, setFilterTipo]           = useState<string>("Todos");
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);

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
      } else {
        setErrorMsg(data?.error || `Error al cargar archivos (${res.status})`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Error de conexión al cargar archivos");
    }
    finally { if (!silent) setLoadingFiles(false); }
  }, [entityId, loadThumb, getToken]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Upload queue ──────────────────────────────────────────
  // Tipos concretos de adjunto (excluye "Sin archivar", "Todos", "Favoritos" que son filtros de UI)
  const CONCRETE_TYPES = ["Sin clasificar","AUTO","ESCRITO PROCESAL","FACTURAS","PODER","EVIDENCIA"] as const;

  const openNextUploadModal = useCallback((file: File, queue: File[], total: number) => {
    pendingUploadFile.current = file;
    setUploadQueue(queue);
    setUploadQueueTotal(total);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    // Heredar el tipo de la sección activa del sidebar si es un tipo concreto
    const inheritedType = CONCRETE_TYPES.includes(sidebarSection as any)
      ? sidebarSection
      : "Sin clasificar";
    setEditDocName(baseName);
    setEditAttachmentType(inheritedType);
    setEditingFile({ id: "PENDING_UPLOAD", document_name: baseName, attachment_type: inheritedType });
  }, [sidebarSection]);

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
        if (autoOpenAfterAttach && fileId && (isWord || isExcel)) {
          const ext = file.name.match(/\.[^/.]+$/)?.[0] ?? (isExcel ? ".xlsx" : ".docx");
          const displayName = editDocName.trim() ? `${editDocName}${ext}` : file.name;
          await openInWord({ id: fileId, original_name: displayName });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(`Error al subir "${file.name}": ${errData?.error || `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      setErrorMsg(`Error al subir "${file?.name}": ${e?.message || "Error de conexión"}`);
    }
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
  const handleDelete = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    setConfirmDeleteFileId(null);
    setFiles(prev => prev.filter(f => f.id !== fileId));
    previewCache.current.delete(fileId);
    if (preview?.fileId === fileId) setPreview(null);
    startFileDelete(fileId, file);
  };

  const handleUndoFile = () => {
    const item = undoFileDelete();
    if (item) setFiles(prev => [...prev, item]);
  };

  // ── Open in Word/Excel ─────────────────────────────────────
  const openInWord = useCallback(async (f: any) => {
    const token = await getToken({ skipCache: true });
    try {
      const res = await fetch(`/api/files/${entityId}/${f.id}/open-local`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err?.error || "No se pudo abrir el documento en local");
      }
    } catch (_err) {
      setErrorMsg("No se pudo abrir el documento en local");
    }
  }, [entityId, getToken]);

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
    let res: Response | null = null;
    let mode: "pdf" | "html" | "file" = "file";

    if (isWord) {
      res = await fetch(`/api/files/${entityId}/${f.id}/preview-pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        mode = "pdf";
      } else {
        res = await fetch(`/api/files/${entityId}/${f.id}/preview-html`, { headers: { Authorization: `Bearer ${token}` } });
        mode = "html";
      }
    } else if (isExcel) {
      res = await fetch(`/api/files/${entityId}/${f.id}/preview-excel`, { headers: { Authorization: `Bearer ${token}` } });
      mode = "html";
    } else {
      res = await fetch(`/api/files/${entityId}/${f.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      mode = "file";
    }

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

    if (mode === "html") {
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime: "text/html", fileId: f.id, appType: (isExcel ? "excel" : "word") as "word" | "excel" };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    } else if (mode === "pdf") {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime: "application/pdf", fileId: f.id, appType: "word" as const };
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
    const inheritedType = CONCRETE_TYPES.includes(sidebarSection as any) ? sidebarSection : "Sin clasificar";
    setEditingFile({ id: "NEW_BLANK", document_name: "", attachment_type: inheritedType });
    setEditDocName("");
    setEditAttachmentType(inheritedType);
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
    const inheritedType = CONCRETE_TYPES.includes(sidebarSection as any) ? sidebarSection : "Sin clasificar";
    setPendingTemplate({ filePath, fileName });
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    setEditingFile({ id: "PENDING_TEMPLATE", document_name: "", attachment_type: inheritedType });
    setEditDocName(baseName);
    setEditAttachmentType(inheritedType);
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
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(`Error al guardar: ${errData?.error || `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      setErrorMsg(`Error al guardar: ${e?.message || "Error de conexión"}`);
    }
    finally { setSavingMetadata(false); }
  };

  // ── Render ─────────────────────────────────────────────────
  // Compute filtered files
  const tipoOptions = ["Todos", "Sin clasificar", "AUTO", "ESCRITO PROCESAL", "FACTURAS", "PODER", "EVIDENCIA"];

  const visibleFiles = files.filter(f => {
    const matchSearch = !searchText ||
      (f.original_name || "").toLowerCase().includes(searchText.toLowerCase()) ||
      (f.document_name  || "").toLowerCase().includes(searchText.toLowerCase());
    const matchTipo = filterTipo === "Todos" || (f.attachment_type || "Sin clasificar") === filterTipo;
    const matchSection =
      sidebarSection === "Todos"       ? true :
      sidebarSection === "Sin archivar" ? (!f.attachment_type || f.attachment_type === "Sin clasificar") :
      sidebarSection === "Favoritos"   ? favs.has(f.id) :
      (f.attachment_type || "Sin clasificar") === sidebarSection;
    return matchSearch && matchTipo && matchSection;
  });

  const selectedFile = files.find(f => f.id === selectedFileId) ?? null;
  const mailTargetName = selectedFile?.document_name || selectedFile?.original_name || entityName;
  const mailSubject = selectedFile
    ? `Adjunto: ${mailTargetName}`
    : `Adjuntos de ${entityName}`;
  const mailBody = selectedFile
    ? [
        "Hola,",
        "",
        `Te escribo en relación con el adjunto "${mailTargetName}".`,
        `Tipo: ${selectedFile.attachment_type || "Sin clasificar"}`,
        `Formato: ${selectedFile.original_name || "Archivo"}`,
        selectedFile.created_at ? `Fecha: ${new Date(selectedFile.created_at).toLocaleDateString("es-ES")}` : "",
        "",
        `Puedes revisarlo dentro del apartado de adjuntos de ${entityName} en el ERP.`,
      ].filter(Boolean).join("\n")
    : [
        "Hola,",
        "",
        `Te escribo en relación con los adjuntos vinculados a ${entityName}.`,
        "",
        "Puedes revisarlos directamente desde el ERP.",
      ].join("\n");

  const innerContent = (
    <>
    <div
      className={inline
        ? "bg-slate-50 w-full h-full rounded-xl flex flex-col overflow-hidden border border-slate-200"
        : "bg-slate-50 w-full max-w-[1540px] mx-4 my-4 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      }
      onClick={(e) => e.stopPropagation()}
      style={inline ? undefined : { maxHeight: "calc(100vh - 32px)" }}
    >
        {/* ── Title bar ── */}
        <div className="flex items-start justify-between px-5 py-4 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-rose-100 shadow-sm">
              <Paperclip size={16} className="text-red-600" />
            </div>
            {/*
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Adjuntos</h2>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {loadingFiles ? "Cargando…" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
                </span>
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                  {sidebarSection}
                </span>
              </div>
              <p className="mt-1 max-w-[440px] truncate text-xs text-slate-500">
                Organiza, previsualiza y clasifica los documentos vinculados a {entityName}.
              </p>
            </div>
            {/*
              {loadingFiles ? "Cargando…" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
            
            */}
          </div>
          {!inline && (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <X size={14} />
            Cerrar
          </button>
          )}
        </div>

        {/* ── Error banner ── */}
        {errorMsg && (
          <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b border-red-200 shrink-0">
            <span className="text-xs text-red-700 font-medium flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-3 text-red-400 hover:text-red-700 shrink-0">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-100 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
            >
              <Upload size={15} />
              Subir archivo
            </button>
            <button
              onClick={showCreateBlankModal}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FilePlus2 size={15} className="text-indigo-500" />
              Nuevo documento
            </button>
            <button
              onClick={() => openTemplatesModal()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Sparkles size={15} className="text-amber-500" />
              Plantillas
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FolderOpen size={15} className="text-emerald-600" />
              Importar carpeta
            </button>
            <button
              onClick={() => openMailDraft(mailSubject, mailBody)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Mail size={15} className="text-blue-500" />
              Enviar correo
            </button>
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${viewMode === "list" ? "bg-white text-red-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <LayoutList size={13} />
              Lista
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${viewMode === "grid" ? "bg-white text-red-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Grid3X3 size={13} />
              Cuadrícula
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar por archivo o nombre de documento…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</span>
            <select
              value={filterTipo}
              onChange={e => setFilterTipo(e.target.value)}
              className="min-w-[180px] text-sm border border-slate-200 bg-white rounded-xl px-3 py-2 focus:outline-none focus:border-red-400 text-slate-600"
            >
              {tipoOptions.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {selectedFile && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seleccionado</span>
              {(isPreviewable(selectedFile.mimetype) || isWordFile(selectedFile.mimetype, selectedFile.original_name) || isExcelFile(selectedFile.mimetype, selectedFile.original_name)) && (
                <button
                  onClick={() => openPreview(selectedFile)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Eye size={14} />
                  Vista previa
                </button>
              )}
              {(isWordFile(selectedFile.mimetype, selectedFile.original_name) || isExcelFile(selectedFile.mimetype, selectedFile.original_name)) ? (
                <button
                  onClick={() => openInWord(selectedFile)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink size={14} />
                  Abrir
                </button>
              ) : (
                <button
                  onClick={() => downloadWithAuth(selectedFile.id, selectedFile.original_name)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download size={14} />
                  Descargar
                </button>
              )}
              <button
                onClick={() => {
                  setEditingFile({ id: selectedFile.id, document_name: selectedFile.document_name || "", attachment_type: selectedFile.attachment_type || "Sin clasificar" });
                  setEditDocName(selectedFile.document_name || "");
                  setEditAttachmentType(selectedFile.attachment_type || "Sin clasificar");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit3 size={14} />
                Editar
              </button>
              <button
                onClick={() => openMailDraft(mailSubject, mailBody)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Mail size={14} />
                Enviar correo
              </button>
              <button
                onClick={() => setConfirmDeleteFileId(selectedFile.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        {false && (
        <>
        <div className="flex items-center gap-0.5 px-3 py-2 bg-white border-b border-slate-100 shrink-0 flex-wrap">
          {/* Alta */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[52px] uppercase tracking-wide"
          >
            <Upload size={15} className="text-emerald-600" />
            Alta
          </button>
          {/* Baja */}
          <button
            onClick={() => selectedFile && handleDelete(selectedFile.id)}
            disabled={!selectedFileId}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[52px] uppercase tracking-wide disabled:opacity-30"
          >
            <Trash2 size={15} className="text-red-500" />
            Baja
          </button>
          {/* Modificar */}
          <button
            onClick={() => {
              if (!selectedFile) return;
              setEditingFile({ id: selectedFile.id, document_name: selectedFile.document_name || "", attachment_type: selectedFile.attachment_type || "Sin clasificar" });
              setEditDocName(selectedFile.document_name || "");
              setEditAttachmentType(selectedFile.attachment_type || "Sin clasificar");
            }}
            disabled={!selectedFileId}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[60px] uppercase tracking-wide disabled:opacity-30"
          >
            <Edit3 size={15} className="text-blue-500" />
            Modificar
          </button>

          <div className="w-px h-7 bg-slate-200 mx-1.5" />

          {/* Correo */}
          <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[52px] uppercase tracking-wide">
            <Mail size={15} className="text-blue-500" />
            Correo
          </button>
          {/* Whatsapp */}
          <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[60px] uppercase tracking-wide">
            <MessageCircle size={15} className="text-green-500" />
            Whatsapp
          </button>

          <div className="w-px h-7 bg-slate-200 mx-1.5" />

          {/* Herramientas PDF */}
          <button
            onClick={() => selectedFile && openInBrowser(selectedFile)}
            disabled={!selectedFile || selectedFile?.mimetype !== "application/pdf"}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[72px] uppercase tracking-wide disabled:opacity-30"
          >
            <FileOutput size={15} className="text-red-600" />
            Herram. PDF
          </button>
          {/* Excel */}
          <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[48px] uppercase tracking-wide">
            <Table2 size={15} className="text-emerald-700" />
            Excel
          </button>

          <div className="w-px h-7 bg-slate-200 mx-1.5" />

          {/* Nuevo documento */}
          <button
            onClick={showCreateBlankModal}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[52px] uppercase tracking-wide"
          >
            <FilePlus2 size={15} className="text-indigo-500" />
            Nuevo
          </button>
          {/* Plantillas */}
          <button
            onClick={() => openTemplatesModal()}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[60px] uppercase tracking-wide"
          >
            <Sparkles size={15} className="text-amber-500" />
            Plantillas
          </button>
          {/* Carpeta */}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[60px] uppercase tracking-wide"
          >
            <FolderOpen size={15} className="text-amber-500" />
            Importar
          </button>

          <div className="flex-1" />

          {/* Opciones */}
          <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors min-w-[56px] uppercase tracking-wide">
            <Settings2 size={15} className="text-slate-400" />
            Opciones
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar adjunto…"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <select className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-slate-600">
            <option>Nombre Adjunto</option>
            <option>Tipo Adjunto</option>
            <option>Fecha Adjunto</option>
          </select>
          <div className="w-px h-5 bg-slate-200" />
          <span className="text-xs text-slate-500 font-medium">Tipo:</span>
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
            className="text-xs border border-slate-200 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-slate-600"
          >
            {tipoOptions.map(t => <option key={t}>{t}</option>)}
          </select>
          <div className="flex-1" />
          {/* View mode */}
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-red-600 text-white" : "text-slate-400 hover:bg-slate-200"}`}
          ><LayoutList size={13} /></button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-red-600 text-white" : "text-slate-400 hover:bg-slate-200"}`}
          ><Grid3X3 size={13} /></button>
        </div>

        {/* ── Hidden inputs ── */}
        </>
        )}
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ""; } }}
        />
        <input ref={folderInputRef} type="file" multiple className="hidden"
          {...({ webkitdirectory: "true", directory: "true" } as any)}
          onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ""; } }}
        />

        {/* ── Main area: sidebar + content ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <div className="w-52 shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
            {/* Storage folder */}
            <div className="px-3 pt-4 pb-2">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <Folder size={13} className="text-amber-500 shrink-0" />
                <span className="truncate">Almacenamiento</span>
              </div>
              <p className="px-2 text-[11px] leading-5 text-slate-400">
                Organiza los documentos por tipo para encontrarlos más rápido.
              </p>
            </div>
            <div className="px-3 pb-4 space-y-1">
              {[
                { label: "Todos", count: files.length, indent: false },
                { label: "Sin archivar", count: files.filter(f => !f.attachment_type || f.attachment_type === "Sin clasificar").length, indent: true },
                { label: "Favoritos", count: favs.size, indent: true },
                { label: "AUTO", count: files.filter(f => f.attachment_type === "AUTO").length, indent: true },
                { label: "ESCRITO PROCESAL", count: files.filter(f => f.attachment_type === "ESCRITO PROCESAL").length, indent: true },
                { label: "FACTURAS", count: files.filter(f => f.attachment_type === "FACTURAS").length, indent: true },
                { label: "PODER", count: files.filter(f => f.attachment_type === "PODER").length, indent: true },
                { label: "EVIDENCIA", count: files.filter(f => f.attachment_type === "EVIDENCIA").length, indent: true },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => setSidebarSection(item.label)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-xl transition-colors text-left ${
                    sidebarSection === item.label
                      ? "bg-red-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 font-medium"
                  } ${item.indent ? "ml-2 w-[calc(100%-8px)]" : ""}`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ml-2 ${
                      sidebarSection === item.label ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500"
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content area */}
          <div
            className="flex-1 overflow-hidden flex flex-col relative"
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragLeave={e => {
              // Solo desactivar si salimos completamente del contenedor
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
            }}
          >
            {/* Drag overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-50/95 border-2 border-dashed border-red-400 rounded-lg pointer-events-none">
                <Upload size={40} className="text-red-500 mb-3 animate-bounce" />
                <p className="text-base font-bold text-red-600">Suelta los archivos para subirlos</p>
                <p className="text-xs text-red-400 mt-1">Se guardarán en «{sidebarSection}»</p>
              </div>
            )}

            {loadingFiles ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-red-500" />
              </div>
            ) : viewMode === "list" ? (
              /* ── Table view ── */
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-8 text-center">Fav.</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nombre Adjunto</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Nombre Documento</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tipo</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tamaño</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Usuario</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visibleFiles.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          {/* Empty state con zona de drop visual */}
                          <div
                            className="flex flex-col items-center justify-center py-16 text-slate-400 cursor-pointer group"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <div className="w-20 h-20 rounded-2xl bg-slate-100 group-hover:bg-red-50 flex items-center justify-center mb-4 transition-colors border-2 border-dashed border-slate-200 group-hover:border-red-300">
                              <Upload size={28} className="text-slate-300 group-hover:text-red-500 transition-colors" />
                            </div>
                            <p className="text-sm font-semibold text-slate-500 group-hover:text-red-600 transition-colors">
                              {files.length === 0
                                ? "No hay documentos adjuntos"
                                : `Sin archivos en «${sidebarSection}»`}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Haz clic aquí o arrastra archivos para subir</p>
                            <button
                              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                              className="mt-4 flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
                            >
                              <Upload size={13} /> Subir archivo
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : visibleFiles.map((f: any) => {
                      const fi = fileIcon(f.mimetype, f.original_name);
                      const canPreview = isPreviewable(f.mimetype);
                      const canWord    = isWordFile(f.mimetype, f.original_name);
                      const canExcel   = isExcelFile(f.mimetype, f.original_name);
                      const isSelected = selectedFileId === f.id;
                      return (
                        <tr
                          key={f.id}
                          onClick={() => setSelectedFileId(isSelected ? null : f.id)}
                          onDoubleClick={() => { if (canPreview || canWord || canExcel) openPreview(f); }}
                          className={`cursor-pointer transition-colors group ${
                            isSelected
                              ? "bg-red-50 border-l-2 border-l-red-500"
                              : "bg-white hover:bg-slate-50/60"
                          }`}
                        >
                          {/* Fav */}
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={e => { e.stopPropagation(); setFavs(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; }); }}
                              className="text-slate-200 hover:text-amber-400 transition-colors"
                            >
                              <Star size={12} fill={favs.has(f.id) ? "#fbbf24" : "none"} className={favs.has(f.id) ? "text-amber-400" : ""} />
                            </button>
                          </td>
                          {/* Fecha */}
                          <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(f.created_at).toLocaleDateString("es-ES")}
                          </td>
                          {/* Nombre archivo — click abre previsualización si es posible */}
                          <td className="px-3 py-2.5 max-w-[200px]">
                            <div
                              className="flex items-center gap-2"
                              onClick={e => {
                                e.stopPropagation();
                                if (canPreview || canWord || canExcel) openPreview(f);
                              }}
                            >
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-sm shrink-0 ${fi.color}`}>{fi.icon}</span>
                              <span
                                className={`truncate text-sm font-medium ${(canPreview || canWord || canExcel) ? "text-red-600 hover:underline cursor-pointer" : "text-slate-700"}`}
                                title={f.original_name}
                              >{f.original_name}</span>
                            </div>
                          </td>
                          {/* Nombre documento */}
                          <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[170px] hidden lg:table-cell">
                            <span className="truncate block" title={f.document_name}>{f.document_name || <span className="italic text-slate-300">—</span>}</span>
                          </td>
                          {/* Tipo */}
                          <td className="px-3 py-2.5 hidden md:table-cell">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fi.color}`}>
                              {f.attachment_type || "Sin clasificar"}
                            </span>
                          </td>
                          {/* Tamaño */}
                          <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap hidden md:table-cell">{fmtSize(f.size_bytes)}</td>
                          {/* Usuario */}
                          <td className="px-3 py-2.5 text-xs text-slate-400 max-w-[110px] hidden xl:table-cell">
                            <span className="truncate block">{f.created_by || "—"}</span>
                          </td>
                          {/* Acciones — visibles en hover o cuando está seleccionado */}
                          <td className="px-3 py-2.5">
                            <div className={`flex items-center gap-1 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={e => e.stopPropagation()}>
                              {(canPreview || canWord || canExcel) && (
                                <button onClick={() => openPreview(f)} title="Vista previa"
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Eye size={13} />
                                </button>
                              )}
                              {(canWord || canExcel) && (
                                <button title={canWord ? "Abrir en Word" : "Abrir en Excel"}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                  onClick={() => openInWord(f)}>
                                  <ExternalLink size={13} />
                                </button>
                              )}
                              {!canWord && !canExcel && (
                                <button title="Descargar"
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                  onClick={() => downloadWithAuth(f.id, f.original_name)}>
                                  <Download size={13} />
                                </button>
                              )}
                              <button
                                title="Editar nombre/tipo"
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                onClick={() => {
                                  setEditingFile({ id: f.id, document_name: f.document_name || "", attachment_type: f.attachment_type || "Sin clasificar" });
                                  setEditDocName(f.document_name || "");
                                  setEditAttachmentType(f.attachment_type || "Sin clasificar");
                                }}
                              >
                                <Edit3 size={13} />
                              </button>
                              <button onClick={() => setConfirmDeleteFileId(f.id)} title="Eliminar"
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ── Grid view ── */
              <div className="flex-1 overflow-auto p-4">
                {visibleFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <FileText size={36} className="opacity-20 mb-2" />
                    <p className="text-sm font-medium">No hay documentos adjuntos en esta sección</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {visibleFiles.map((f: any) => {
                      const fi = fileIcon(f.mimetype, f.original_name);
                      const canPreview = isPreviewable(f.mimetype);
                      const canWord    = isWordFile(f.mimetype, f.original_name);
                      const canExcel   = isExcelFile(f.mimetype, f.original_name);
                      const isSelected = selectedFileId === f.id;
                      return (
                        <div
                          key={f.id}
                          onClick={() => setSelectedFileId(isSelected ? null : f.id)}
                          onDoubleClick={() => { if (canPreview || canWord || canExcel) openPreview(f); }}
                          className={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "border-red-400 bg-red-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-red-300 hover:shadow-sm"
                          }`}
                        >
                          {f.mimetype?.startsWith("image/") && thumbs[f.id]
                            ? <img src={thumbs[f.id]} alt="" className="w-12 h-12 object-cover rounded-lg" />
                            : <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${fi.color}`}>{fi.icon}</span>
                          }
                          <span className="text-[10px] text-slate-700 text-center font-medium truncate w-full" title={f.document_name || f.original_name}>
                            {f.document_name || f.original_name}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${fi.color}`}>{fi.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white border-t border-slate-200 text-[11px] text-slate-500">
              <span className="font-medium">{visibleFiles.length} elemento(s)</span>
              {selectedFile && (
                <span className="truncate max-w-xs text-slate-600">
                  <strong className="text-slate-700">{selectedFile.document_name || selectedFile.original_name}</strong> — {fmtSize(selectedFile.size_bytes)}
                </span>
              )}
              <span className="font-medium">{loadingFiles ? "Cargando…" : `Total: ${files.length}`}</span>
            </div>
          </div>

          {/* Preview panel */}
          {preview && (
            <div className="w-[520px] shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
                <span className="text-xs font-bold text-slate-700 truncate flex-1">{preview.name}</span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {preview.mime === "text/html" && preview.fileId && (
                    <button
                      onClick={() => openInWord({ id: preview.fileId!, original_name: preview.name })}
                      className="text-[11px] font-semibold text-slate-700 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 transition-colors"
                    >
                      {preview.appType === "excel" ? "Abrir Excel" : "Abrir Word"}
                    </button>
                  )}
                  <button
                    onClick={() => { if (previewBlobUrl.current) { URL.revokeObjectURL(previewBlobUrl.current); previewBlobUrl.current = null; } setPreview(null); }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                  ><X size={13} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {preview.mime === "application/pdf" && (
                  <object data={preview.url} type="application/pdf" className="w-full h-full" style={{ minHeight: 0 }}>
                    <iframe src={`${preview.url}#toolbar=1`} className="w-full h-full border-0" title={preview.name} />
                  </object>
                )}
                {preview.mime.startsWith("image/") && (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 overflow-auto p-3">
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

      {/* ── Templates modal ── */}
      {showTemplates && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40" onClick={() => setShowTemplates(false)}>
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
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40" onClick={() => setEditingFile(null)}>
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
    </>
  );

  const overlays = (
    <>
      {confirmDeleteFileId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar este archivo?</h3>
                <p className="text-xs text-slate-500 mt-1">Tendrás 15 segundos para deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteFileId(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => handleDelete(confirmDeleteFileId!)} className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Eliminar</button>
            </div>
          </div>
        </div>
      )}
      {pendingFileDelete && (
        <UndoToast
          message="Archivo eliminado"
          startedAt={pendingFileDelete.startedAt}
          onUndo={handleUndoFile}
          onDismiss={dismissFileDelete}
        />
      )}
    </>
  );

  if (inline) return <>{innerContent}{overlays}</>;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
        {innerContent}
      </div>
      {overlays}
    </>,
    document.body
  );
}
