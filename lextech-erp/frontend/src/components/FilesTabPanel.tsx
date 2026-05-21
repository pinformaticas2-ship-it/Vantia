import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Upload, FolderOpen, FilePlus2, Sparkles, Loader2,
  Eye, Download, Trash2, Edit3, ExternalLink, FileText,
  ChevronDown, ChevronRight, X, Search,
} from "lucide-react";
import { safeJson, resolveApiUrl } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";

function fileIcon(mime: string, name: string) {
  const n = name.toLowerCase();
  if (mime.startsWith("image/"))   return { icon: "🖼️", color: "bg-emerald-100 text-emerald-600", label: "Imagen" };
  if (mime === "application/pdf")  return { icon: "📄", color: "bg-red-100 text-red-600", label: "PDF" };
  if (mime.includes("word") || n.endsWith(".doc") || n.endsWith(".docx")) return { icon: "📝", color: "bg-blue-100 text-blue-600", label: "Word" };
  if (mime.includes("excel") || mime.includes("spreadsheet") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return { icon: "📊", color: "bg-green-100 text-green-600", label: "Excel" };
  if (mime.includes("presentation") || n.endsWith(".pptx")) return { icon: "📑", color: "bg-orange-100 text-orange-600", label: "PPT" };
  if (mime.startsWith("audio/"))  return { icon: "🎵", color: "bg-purple-100 text-purple-600", label: "Audio" };
  if (mime.startsWith("video/"))  return { icon: "🎬", color: "bg-pink-100 text-pink-600", label: "Video" };
  if (mime.includes("zip") || n.endsWith(".zip") || n.endsWith(".rar") || n.endsWith(".7z")) return { icon: "🗄️", color: "bg-amber-100 text-amber-600", label: "ZIP" };
  if (n.endsWith(".eml") || n.endsWith(".msg")) return { icon: "✉️", color: "bg-cyan-100 text-cyan-600", label: "Email" };
  if (mime.startsWith("text/"))   return { icon: "📃", color: "bg-slate-100 text-slate-600", label: "Texto" };
  return { icon: "📎", color: "bg-slate-100 text-slate-500", label: "Archivo" };
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isPreviewable(mime: string) { return mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/"); }
function isWordFile(mime: string, name: string) {
  const n = name.toLowerCase();
  return mime.includes("wordprocessingml") || mime.includes("msword") || mime.includes("opendocument.text") ||
    ['.docx','.doc','.odt','.rtf','.dot','.dotx'].some(e => n.endsWith(e));
}
function isExcelFile(mime: string, name: string) { const n = name.toLowerCase(); return mime.includes("excel") || mime.includes("spreadsheetml") || mime.includes("spreadsheet") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm") || n.endsWith(".csv"); }
const PLANTILLAS: any[] = [];

function launchOfficeUrl(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function encodeVantiaPayload(payload: unknown) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function FilesTabPanel({ entityId, entity, alwaysShowPreview = false }: { entityId: string; entity?: any; alwaysShowPreview?: boolean }) {
  const { getToken } = useAuth();

  const [files, setFiles]           = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview]       = useState<{ url: string; name: string; mime: string; fileId?: string; appType?: 'word' | 'excel' } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [genLoading, setGenLoading] = useState<string | null>(null);
  // DocPlant templates
  const [docPlantFolders, setDocPlantFolders] = useState<{ name: string; files: { name: string; path: string; ext: string }[] }[]>([]);
  const [docPlantLoading, setDocPlantLoading] = useState(false);
  const [docPlantError, setDocPlantError]     = useState<string | null>(null);
  const [templateTab, setTemplateTab] = useState<'docplant' | 'generated'>('docplant');
  const [templateSearch, setTemplateSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Preview panel de plantillas
  const [selectedTpl, setSelectedTpl] = useState<{ path: string; name: string; ext: string } | null>(null);
  const [tplPreviewHtml, setTplPreviewHtml] = useState<string | null>(null);
  const [tplPreviewUrl, setTplPreviewUrl] = useState<string | null>(null);
  const [tplPreviewMime, setTplPreviewMime] = useState<string | null>(null);
  const [tplPreviewLoading, setTplPreviewLoading] = useState(false);
  // Thumbnails de imágenes (blobURL por fileId)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const loadingThumbIds = useRef<Set<string>>(new Set());
  const previewBlobUrl  = useRef<string | null>(null);
  const tplPreviewBlobUrl = useRef<string | null>(null);
  const tplPreviewAbort  = useRef<AbortController | null>(null);
  // Cache de URLs temporales para abrir en Word/Excel (pre-fetched on hover)
  const openUrlCache     = useRef<Map<string, string>>(new Map());
  // Cache de vistas previas: evita re-fetch del mismo archivo
  const previewCache = useRef<Map<string, { url: string; name: string; mime: string; appType?: 'word' | 'excel' }>>(new Map());
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Modal para editar nombre y tipo de adjunto
  const [editingFile, setEditingFile] = useState<{ id: string; document_name: string; attachment_type: string } | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editAttachmentType, setEditAttachmentType] = useState('Sin clasificar');
  const [savingMetadata, setSavingMetadata] = useState(false);
  // Plantilla pendiente de guardar
  const [pendingTemplate, setPendingTemplate] = useState<{ filePath: string; fileName: string } | null>(null);
  // Cola de archivos pendientes de adjuntar (mostrar modal uno a uno)
  const [uploadQueue, setUploadQueue]       = useState<File[]>([]);
  const [uploadQueueTotal, setUploadQueueTotal] = useState(0);
  const pendingUploadFile = useRef<File | null>(null);
  // Vista previa de Word
  const [wordPreview, setWordPreview] = useState<{ id: string; name: string; mime: string } | null>(null);

  const revokePreviewEntry = useCallback((fileId: string) => {
    const cached = previewCache.current.get(fileId);
    if (cached?.url?.startsWith('blob:')) {
      try { URL.revokeObjectURL(cached.url); } catch (_) {}
    }
    previewCache.current.delete(fileId);
    if (previewBlobUrl.current === cached?.url) {
      previewBlobUrl.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const entry of previewCache.current.values()) {
        if (entry.url?.startsWith('blob:')) {
          try { URL.revokeObjectURL(entry.url); } catch (_) {}
        }
      }
      previewCache.current.clear();
      if (previewBlobUrl.current) {
        try { URL.revokeObjectURL(previewBlobUrl.current); } catch (_) {}
        previewBlobUrl.current = null;
      }
    };
  }, []);

  // ── Cargar thumbnails de imágenes ─────────────────────────────
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // ── Descargar archivo con autenticación ──────────────────────
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
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (_e) {
      alert('Error al descargar el archivo');
    }
  }, [entityId, getToken]);

  // ── Cargar archivos ──────────────────────────────────────────
  // silent=true: refresco en segundo plano — no muestra spinner
  const loadFiles = useCallback(async (silent = false) => {
    if (!silent) setLoadingFiles(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) {
        const fileList: any[] = data.data || [];
        setFiles(fileList);
        for (const f of fileList) {
          if (f.mimetype?.startsWith('image/')) loadThumb(f.id);
          if (f.open_token) {
            const resolved = resolveApiUrl(`/api/files/dl/${f.open_token}`);
            const abs = /^https?:\/\//i.test(resolved) ? resolved : `${window.location.origin}${resolved}`;
            openUrlCache.current.set(f.id, abs);
          }
        }
      }
    } catch (_e) {}
    finally { if (!silent) setLoadingFiles(false); }
  }, [entityId, loadThumb]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Auto-refrescar adjuntos cada 45s y al volver a la pestaña — silencioso (sin spinner)
  useAutoRefresh(() => loadFiles(true), { intervalMs: 45_000, enabled: !!entityId });

  // ── Abrir modal para el primer archivo de la cola ────────────
  const openNextUploadModal = useCallback((file: File, queue: File[], total: number) => {
    pendingUploadFile.current = file;
    setUploadQueue(queue);
    setUploadQueueTotal(total);
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setEditDocName(baseName);
    setEditAttachmentType('Sin clasificar');
    setEditingFile({ id: 'PENDING_UPLOAD', document_name: baseName, attachment_type: 'Sin clasificar' });
  }, []);

  // ── Interceptar selección: mostrar modal en lugar de subir directo ──
  const enqueueFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const [first, ...rest] = arr;
    openNextUploadModal(first, rest, arr.length);
  }, [openNextUploadModal]);

  // ── Subir UN archivo con nombre y tipo ya confirmados ────────
  const uploadSingleFile = async () => {
    const file = pendingUploadFile.current;
    if (!file) return;
    setSavingMetadata(true);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      fd.append('files', file);
      const res = await fetch(`/api/files/${entityId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        const fileId = data.data?.[0]?.id;
        if (fileId) {
          // Aplicar nombre y tipo seleccionados
          await fetch(`/api/files/${entityId}/${fileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              document_name: editDocName.trim() || null,
              attachment_type: editAttachmentType,
            }),
          });
        }
        await loadFiles();
        window.dispatchEvent(new CustomEvent('historial-changed'));
      }
    } catch (_e) {}
    finally {
      setSavingMetadata(false);
      setEditingFile(null);
      pendingUploadFile.current = null;
      // Procesar siguiente archivo de la cola
      if (uploadQueue.length > 0) {
        const [next, ...rest] = uploadQueue;
        openNextUploadModal(next, rest, uploadQueueTotal);
      } else {
        setUploadQueueTotal(0);
      }
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const items = e.dataTransfer.items;
    const fileArr: File[] = [];
    for (const item of Array.from(items)) {
      const f = item.getAsFile();
      if (f) fileArr.push(f);
    }
    enqueueFiles(fileArr);
  }, [enqueueFiles]);

  // ── Borrar archivo ───────────────────────────────────────────
  const handleDelete = async (fileId: string) => {
    const token = await getToken({ skipCache: true });
    await fetch(`/api/files/${entityId}/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setFiles(prev => prev.filter(f => f.id !== fileId));
    revokePreviewEntry(fileId);
    if (preview?.fileId === fileId) setPreview(null);
    window.dispatchEvent(new CustomEvent('historial-changed'));
  };

  const openWithApp = useCallback(async (f: any) => {
    const ext = (f.original_name || '').split('.').pop()?.toLowerCase() ?? '';
    const wordExts  = ['doc','docx','odt','rtf','dot','dotx'];
    const excelExts = ['xls','xlsx','xlsm','xlsb','ods','csv'];
    const pptExts   = ['ppt','pptx','odp'];
    const isOffice  = wordExts.includes(ext) || excelExts.includes(ext) || pptExts.includes(ext);

    if (isOffice) {
      const tempUrl = openUrlCache.current.get(f.id);
      openUrlCache.current.delete(f.id);
      void loadFiles(true);

      if (tempUrl) {
        const b64 = encodeVantiaPayload({
          url: tempUrl,
          syncUrl: `${tempUrl}/sync`,
          name: f.original_name || `documento.${ext || 'bin'}`,
        });
        window.location.href = `vantia:${b64}`;
        return;
      }
      await downloadWithAuth(f.id, f.original_name);
      return;
    }

    await downloadWithAuth(f.id, f.original_name);
  }, [downloadWithAuth, loadFiles]);

  const openInWord = openWithApp;

  // ── Vista previa ─────────────────────────────────────────────
  const openPreview = async (f: any) => {
    // Servir desde caché si ya fue cargado antes
    const cached = previewCache.current.get(f.id);
    if (cached) {
      setPreview(cached);
      return;
    }

    const token = await getToken({ skipCache: true });

    // Para cualquier tipo no PDF/imagen: intentar conversión a PDF via LibreOffice
    const isPdf = f.mimetype === 'application/pdf';
    const isImage = f.mimetype?.startsWith('image/');
    if (!isPdf && !isImage) {
      const pdfRes = await fetch(`/api/files/${entityId}/${f.id}/preview-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = pdfRes.headers.get('content-type') || '';
      if (pdfRes.ok && contentType.includes('application/pdf')) {
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        previewBlobUrl.current = url;
        const entry = { url, name: f.original_name, mime: 'application/pdf', fileId: f.id };
        previewCache.current.set(f.id, entry);
        setPreview(entry);
        return;
      }
      setPreview({ url: '', name: f.original_name, mime: 'unsupported', fileId: f.id });
      return;
    }

    const endpoint = `/api/files/${entityId}/${f.id}/download`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      setPreview({ url: '', name: f.original_name, mime: 'error', fileId: f.id });
      return;
    }

    if (isExcelFile(f.mimetype, f.original_name)) {
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime: 'text/html', fileId: f.id, appType: 'excel' as const };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    } else {
      const mime = f.mimetype || 'application/octet-stream';
      if (!isPreviewable(mime)) {
        setPreview({ url: '', name: f.original_name, mime: 'unsupported', fileId: f.id });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime, fileId: f.id };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    }
  };

  // ── Mostrar modal para crear documento en blanco ──────────────
  const showCreateBlankModal = () => {
    setEditingFile({ id: 'NEW_BLANK', document_name: '', attachment_type: 'Sin clasificar' });
    setEditDocName('');
    setEditAttachmentType('Sin clasificar');
  };

  // ── Documento en blanco (después de ingresar nombre y tipo) ────
  const createBlankDoc = async () => {
    if (!editingFile || editingFile.id !== 'NEW_BLANK') return;
    setSavingMetadata(true);
    const token = await getToken({ skipCache: true });
    try {
      // POST a nueva ruta que guarda directamente en BD con metadatos
      const res = await fetch(`/api/files/${entityId}/create-blank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_name: editDocName,
          attachment_type: editAttachmentType,
        }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        setEditingFile(null);
        await loadFiles();
      }
    } catch (_e) {
      // Error al crear documento
    } finally {
      setSavingMetadata(false);
    }
  };

  // ── Cargar preview de una plantilla en el panel derecho ───────
  const loadTplPreview = async (file: { path: string; name: string; ext: string }) => {
    if (tplPreviewAbort.current) tplPreviewAbort.current.abort();
    const abort = new AbortController();
    tplPreviewAbort.current = abort;

    setSelectedTpl(file);
    setTplPreviewHtml(null);
    if (tplPreviewBlobUrl.current) {
      URL.revokeObjectURL(tplPreviewBlobUrl.current);
      tplPreviewBlobUrl.current = null;
    }
    setTplPreviewUrl(null);
    setTplPreviewMime(null);
    setTplPreviewLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      if (abort.signal.aborted) return;
      const isWordTemplate = file.ext === '.doc' || file.ext === '.docx';

      if (isWordTemplate) {
        const pdfRes = await fetch(`/api/files/templates/preview-pdf?path=${encodeURIComponent(file.path)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        const contentType = pdfRes.headers.get('content-type') || '';
        if (pdfRes.ok && contentType.includes('application/pdf')) {
          const blob = await pdfRes.blob();
          if (abort.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          tplPreviewBlobUrl.current = url;
          setTplPreviewUrl(url);
          setTplPreviewMime('application/pdf');
          return;
        }
      }

      const res = await fetch(`/api/files/templates/preview?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      const html = await res.text();
      if (abort.signal.aborted) return;
      setTplPreviewHtml(html);
      setTplPreviewMime('text/html');
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setTplPreviewHtml(`<html><body style="padding:20px;font-family:sans-serif;color:#dc2626"><p>Error al cargar vista previa</p><p style="font-size:11px;color:#999">${e.message}</p></body></html>`);
      setTplPreviewMime('text/html');
    } finally {
      if (!abort.signal.aborted) setTplPreviewLoading(false);
    }
  };

  // ── Abrir modal plantillas y cargar DocPlant ──────────────────
  const openTemplatesModal = async (forceReload = false) => {
    setShowTemplates(true);
    setTemplateTab('docplant');
    setTemplateSearch('');
    setSelectedTpl(null);
    setTplPreviewHtml(null);
    if (tplPreviewBlobUrl.current) {
      URL.revokeObjectURL(tplPreviewBlobUrl.current);
      tplPreviewBlobUrl.current = null;
    }
    setTplPreviewUrl(null);
    setTplPreviewMime(null);
    if (docPlantFolders.length > 0 && !forceReload) return; // ya cargado
    setDocPlantLoading(true);
    setDocPlantError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch('/api/files/templates', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success) {
        setDocPlantFolders(data.data || []);
        if (data.data && data.data.length > 0) {
          setExpandedFolders(new Set([data.data[0].name]));
        } else {
          setDocPlantError(data.warning || 'No se encontraron plantillas en la carpeta DocPlant.');
        }
      } else {
        setDocPlantError(data.error || 'Error al cargar plantillas.');
      }
    } catch (e: any) {
      setDocPlantError(e.message || 'Error de conexión al cargar plantillas.');
    } finally {
      setDocPlantLoading(false);
    }
  };

  // ── Mostrar modal para adjuntar plantilla ──────────────────────
  const showTemplateModal = (filePath: string, fileName: string) => {
    setPendingTemplate({ filePath, fileName });
    // Extraer nombre sin extensión para usar como nombre de documento
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    setEditingFile({ id: 'PENDING_TEMPLATE', document_name: '', attachment_type: 'Sin clasificar' });
    setEditDocName(baseName);
    setEditAttachmentType('Sin clasificar');
  };

  // ── Adjuntar plantilla de DocPlant (después de ingresar nombre y tipo) ────
  const downloadDocPlantTemplate = async () => {
    if (!pendingTemplate) return;
    setSavingMetadata(true);
    const token = await getToken({ skipCache: true });
    try {
      const res = await fetch(`/api/files/templates/download?path=${encodeURIComponent(pendingTemplate.filePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      // Usar documento_name si se proporcionó, si no usar fileName
      const finalFileName = editDocName.trim() ? `${editDocName}.${pendingTemplate.fileName.split('.').pop()}` : pendingTemplate.fileName;
      const file = new File([blob], finalFileName, { type: blob.type });
      const fd = new FormData();
      fd.append('files', file);
      const uploadRes = await fetch(`/api/files/${entityId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        const fileId = data.data?.[0]?.id;
        if (fileId) {
          // Actualizar metadatos si se proporcionó nombre diferente
          if (editDocName.trim() || editAttachmentType !== 'Sin clasificar') {
            await fetch(`/api/files/${entityId}/${fileId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                document_name: editDocName.trim() || null,
                attachment_type: editAttachmentType,
              }),
            });
          }
          await loadFiles();
        }
        setShowTemplates(false); // Cerrar modal de plantillas
        setEditingFile(null); // Cerrar modal de edición
        setPendingTemplate(null);
      }
    } catch (_e) {
      // Error al descargar plantilla
    } finally {
      setSavingMetadata(false);
    }
  };

  // ── Guardar metadatos del archivo (nombre y tipo) ──────────────
  const saveFileMetadata = async () => {
    if (!editingFile) return;
    setSavingMetadata(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}/${editingFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_name: editDocName,
          attachment_type: editAttachmentType,
        }),
      });
      if (res.ok) {
        previewCache.current.delete(editingFile.id); // invalidar caché (nombre puede haber cambiado)
        await loadFiles(); // Recargar lista
        setEditingFile(null);
      }
    } catch (_e) {}
    finally { setSavingMetadata(false); }
  };

  // ── Generar documento desde plantilla — guardar como adjunto ──
  const generateDoc = async (plantilla: typeof PLANTILLAS[0]) => {
    setGenLoading(plantilla.id);
    try {
      const html = plantilla.generate(entity ?? {});
      const fileName = `${plantilla.id}_${entity?.first_name ?? ""}_${entity?.last_name ?? ""}_${new Date().toISOString().split("T")[0]}.html`;
      const file = new File([new Blob([html], { type: "text/html;charset=utf-8" })], fileName, { type: "text/html" });
      const fd = new FormData();
      fd.append("files", file);
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${entityId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) await loadFiles();
      setShowTemplates(false);
    } catch (_e) {
    } finally {
      setGenLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-sm text-slate-500">
          {loadingFiles ? "Cargando…" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Importar carpeta */}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <FolderOpen size={13} /> Importar carpeta
          </button>
          {/* Subir archivos */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <Upload size={13} /> Subir archivo
          </button>
          {/* Nuevo documento en blanco */}
          <button
            onClick={showCreateBlankModal}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <FilePlus2 size={13} /> Nuevo
          </button>
          {/* Crear desde plantilla */}
          <button
            onClick={() => openTemplatesModal()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
          >
            <Sparkles size={13} /> Usar plantilla
          </button>
        </div>
      </div>

      {/* Inputs ocultos */}
      <input
        ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ''; } }}
      />
      <input
        ref={folderInputRef} type="file" multiple className="hidden"
        {...({ webkitdirectory: "true", directory: "true" } as any)}
        onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ''; } }}
      />

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-all
          ${isDragOver ? "border-red-400 bg-red-50/50 scale-[1.01]" : "border-slate-200 hover:border-red-300 hover:bg-red-50/20"}`}
      >
        {uploading
          ? <><Loader2 size={26} className="text-red-500 animate-spin" /><p className="text-sm font-medium text-red-600">Subiendo archivos…</p></>
          : <><Upload size={26} className={isDragOver ? "text-red-500" : "text-slate-400"} />
              <p className={`text-sm font-medium ${isDragOver ? "text-red-600" : "text-slate-500"}`}>Arrastra archivos o carpetas aquí</p>
              <p className="text-xs text-slate-400">PDF, Word, Excel, imágenes — máx. 50 MB por archivo</p></>
        }
      </div>

      {/* Layout: lista + preview */}
      <div className="flex gap-3 items-start">
        {/* Lista de archivos */}
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
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Modificado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {files.map((f: any) => {
                    const fi = fileIcon(f.mimetype, f.original_name);
                    const canPreview = isPreviewable(f.mimetype);
                    const canWord    = isWordFile(f.mimetype, f.original_name);
                    const canExcel   = isExcelFile(f.mimetype, f.original_name);
                    const canOpenPreview = alwaysShowPreview || canPreview || canWord || canExcel;
                    const handleNameClick = canWord || canExcel
                      ? () => openWithApp(f)
                      : canOpenPreview
                        ? () => openPreview(f)
                        : undefined;
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {/* Thumbnail para imágenes, icono con color para el resto */}
                            {f.mimetype?.startsWith('image/') && thumbs[f.id]
                              ? (
                                <img
                                  src={thumbs[f.id]}
                                  alt=""
                                  className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-100 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                  onClick={handleNameClick}
                                />
                              ) : (
                                <span
                                  className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${fi.color} ${f.mimetype?.startsWith('image/') ? 'animate-pulse' : ''} cursor-pointer hover:scale-105 transition-transform`}
                                  onClick={() => { if (f.mimetype?.startsWith('image/')) loadThumb(f.id); else if (canOpenPreview) handleNameClick?.(); }}
                                >
                                  {fi.icon}
                                </span>
                              )
                            }
                            <div className="min-w-0">
                              <button
                                onClick={handleNameClick}
                                className={`text-sm font-medium text-slate-700 text-left truncate block max-w-[180px] ${canOpenPreview ? "hover:text-red-600 hover:underline cursor-pointer" : ""}`}
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
                            {f.attachment_type || 'Sin clasificar'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">{fmtSize(f.size_bytes)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                          {new Date(f.created_at).toLocaleDateString("es-ES")}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden xl:table-cell">
                          {f.updated_at && f.updated_at !== f.created_at
                            ? new Date(f.updated_at).toLocaleDateString("es-ES")
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Vista previa — no se toca */}
                            {canOpenPreview && (
                              <button onClick={() => openPreview(f)} title="Vista previa"
                                className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                                <Eye size={14} />
                              </button>
                            )}
                            {/* Editar metadatos */}
                            <button
                              title="Editar"
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              onClick={() => {
                                setEditingFile({ id: f.id, document_name: f.document_name || '', attachment_type: f.attachment_type || 'Sin clasificar' });
                                setEditDocName(f.document_name || '');
                                setEditAttachmentType(f.attachment_type || 'Sin clasificar');
                              }}
                            >
                              <Edit3 size={14} />
                            </button>
                            {/* Abrir / descargar */}
                            <button
                              title={canWord ? "Abrir en Word" : canExcel ? "Abrir en Excel" : "Descargar"}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              onClick={() => openWithApp(f)}
                            >
                              <ExternalLink size={14} />
                            </button>
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

        {/* ── Panel de vista previa ── */}
        {preview && (
          <div
            className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-lg"
            style={{ position: "sticky", top: 16, height: "calc(100vh - 200px)" }}
          >
            {/* Cabecera del panel */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Icono según tipo */}
                <span className="text-base shrink-0">
                  {preview.mime === "application/pdf" ? "📄"
                    : preview.mime.startsWith("image/") ? "🖼️"
                    : preview.appType === 'excel' ? "📊"
                    : "📝"}
                </span>
                <p className="text-xs font-bold text-slate-700 truncate" title={preview.name}>
                  {preview.name}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Abrir / descargar */}
                {preview.fileId && (
                  <button
                    onClick={() => openWithApp({ id: preview.fileId!, original_name: preview.name })}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1 rounded-lg transition-colors border border-neutral-200"
                  >
                    <ExternalLink size={11} /> Abrir
                  </button>
                )}
                {/* Abrir en pestaña nueva */}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Abrir en nueva pestaña"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                {/* Cerrar */}
                <button
                  onClick={() => {
                    setPreview(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Cerrar vista previa"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Contenido de la preview */}
            <div className="flex-1 overflow-hidden relative">

              {/* ── PDF: visor iframe ── */}
              {preview.mime === "application/pdf" && (
                <iframe
                  src={`${preview.url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                  className="w-full h-full border-0"
                  title={preview.name}
                  style={{ minHeight: 0 }}
                />
              )}

              {/* ── Imágenes: visor con fondo oscuro y tamaño completo ── */}
              {preview.mime.startsWith("image/") && (
                <div className="w-full h-full flex items-center justify-center bg-slate-800 overflow-auto p-3">
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="max-w-full max-h-full object-contain rounded shadow-2xl"
                    style={{ maxHeight: "calc(100vh - 260px)" }}
                  />
                </div>
              )}

              {/* ── Word / HTML: iframe con estilos completos ── */}
              {preview.mime === "text/html" && (
                <iframe
                  src={preview.url}
                  className="w-full h-full border-0 bg-white"
                  title={preview.name}
                  sandbox="allow-same-origin allow-scripts"
                  style={{ minHeight: 0 }}
                />
              )}

              {/* ── Texto plano ── */}
              {preview.mime.startsWith("text/") && preview.mime !== "text/html" && (
                <iframe
                  src={preview.url}
                  className="w-full h-full border-0 bg-white"
                  title={preview.name}
                  style={{ minHeight: 0 }}
                />
              )}

              {/* ── Error / Sin preview ── */}
              {(preview.mime === "error" || preview.mime === "unsupported") && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 p-8">
                  <span className="text-5xl">📎</span>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600 mb-1">Vista previa no disponible</p>
                    <p className="text-xs text-slate-400">Este formato no se puede mostrar directamente.</p>
                  </div>
                  {preview.fileId && (
                    <button
                      onClick={() => downloadWithAuth(preview.fileId!, preview.name)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Download size={14} />
                      Descargar archivo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal plantillas */}
      {showTemplates && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => {
          if (tplPreviewBlobUrl.current) {
            URL.revokeObjectURL(tplPreviewBlobUrl.current);
            tplPreviewBlobUrl.current = null;
          }
          setTplPreviewUrl(null);
          setTplPreviewMime(null);
          setShowTemplates(false);
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 overflow-hidden flex flex-col" style={{ height: '88vh' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-3">
                <Sparkles size={16} className="text-red-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Plantillas del despacho</h2>
                  <p className="text-[11px] text-slate-400">Selecciona una plantilla para previsualizarla</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Tabs inline en el header */}
                <button
                  onClick={() => setTemplateTab('docplant')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${templateTab === 'docplant' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  📁 Plantillas
                </button>
                <button
                  onClick={() => setTemplateTab('generated')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${templateTab === 'generated' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  ✨ Generar
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => {
                  if (tplPreviewBlobUrl.current) {
                    URL.revokeObjectURL(tplPreviewBlobUrl.current);
                    tplPreviewBlobUrl.current = null;
                  }
                  setTplPreviewUrl(null);
                  setTplPreviewMime(null);
                  setShowTemplates(false);
                }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Tab: DocPlant — split layout */}
            {templateTab === 'docplant' && (
              <div className="flex flex-1 overflow-hidden">

                {/* LEFT: árbol de carpetas/archivos */}
                <div className="w-72 shrink-0 border-r border-slate-100 flex flex-col overflow-hidden bg-white">
                  {/* Search */}
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

                  {/* File tree */}
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
                            {/* Folder header */}
                            <button
                              onClick={() => {
                                setExpandedFolders(prev => {
                                  const next = new Set(prev);
                                  if (next.has(folder.name)) next.delete(folder.name);
                                  else next.add(folder.name);
                                  return next;
                                });
                              }}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                            >
                              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                <FolderOpen size={13} className="text-amber-500 shrink-0" />
                                <span className="truncate">{folder.name}</span>
                                <span className="text-[10px] font-normal text-slate-400 shrink-0">({folder.files.length})</span>
                              </span>
                              {isOpen ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronRight size={12} className="text-slate-400 shrink-0" />}
                            </button>
                            {/* Files */}
                            {isOpen && (
                              <div className="ml-3 border-l border-slate-100 pl-2 space-y-0.5 mt-0.5 mb-1">
                                {folder.files.map(f => {
                                  const isSelected = selectedTpl?.path === f.path;
                                  return (
                                    <button
                                      key={f.path}
                                      onClick={() => loadTplPreview(f)}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${isSelected ? 'bg-red-50 text-red-700' : 'hover:bg-neutral-50 text-neutral-600'}`}
                                    >
                                      <span className="shrink-0 text-xs">{f.ext === '.docx' ? '📝' : '📄'}</span>
                                      <span className="text-xs truncate flex-1" title={f.name}>{f.name.replace(/\.[^.]+$/, '')}</span>
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

                {/* RIGHT: preview panel */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                  {!selectedTpl ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-30"><rect x="8" y="4" width="32" height="40" rx="3" fill="#94a3b8"/><rect x="13" y="14" width="22" height="2" rx="1" fill="white"/><rect x="13" y="20" width="22" height="2" rx="1" fill="white"/><rect x="13" y="26" width="14" height="2" rx="1" fill="white"/></svg>
                      <p className="text-sm">Selecciona una plantilla para previsualizar</p>
                    </div>
                  ) : (
                    <>
                      {/* Preview toolbar */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{selectedTpl.ext === '.docx' ? '📝' : '📄'}</span>
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
                      {/* Preview content */}
                      <div className="flex-1 overflow-hidden relative">
                        {tplPreviewLoading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <Loader2 size={28} className="animate-spin text-red-500" />
                            <p className="text-sm">Cargando vista previa…</p>
                          </div>
                        ) : tplPreviewMime === 'application/pdf' && tplPreviewUrl ? (
                          <iframe
                            key={tplPreviewUrl}
                            src={`${tplPreviewUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                            className="w-full h-full border-0"
                            title="Vista previa de plantilla"
                          />
                        ) : tplPreviewHtml ? (
                          <iframe
                            key={selectedTpl?.path}
                            srcDoc={tplPreviewHtml}
                            className="w-full h-full border-0"
                            title="Vista previa de plantilla"
                            sandbox="allow-same-origin"
                          />
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}

            {/* Tab: Generated */}
            {templateTab === 'generated' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 grid grid-cols-2 gap-3">
                  {PLANTILLAS.map(p => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => generateDoc(p)}
                        disabled={genLoading === p.id}
                        className={`flex items-start gap-3 p-4 border rounded-xl text-left hover:shadow-md active:scale-[0.98] transition-all ${p.color} hover:opacity-90`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {genLoading === p.id ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold leading-snug">{p.label}</p>
                          <p className="text-[11px] opacity-70 mt-0.5">{p.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
                  Documentos pre-rellenados con datos de <strong>{entity?.first_name ?? ""} {entity?.last_name ?? ""}</strong> · Se generan como HTML apto para Word
                </div>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}

      {/* Modal vista previa de Word */}
      {wordPreview && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setWordPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-neutral-700" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Vista previa</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{wordPreview.name}</p>
                </div>
              </div>
              <button onClick={() => setWordPreview(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Este es un documento Word. Vamos a intentar abrirlo directamente en Microsoft Word.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setWordPreview(null);
                    openInWord({ id: wordPreview.id, original_name: wordPreview.name });
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-700 text-white font-medium text-sm rounded-lg hover:bg-red-800 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} />
                  Abrir en Word
                </button>
                <button
                  onClick={() => setWordPreview(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal editar metadatos del archivo */}
      {editingFile && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingFile(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingFile.id === 'NEW_BLANK'
                    ? 'Nuevo documento'
                    : editingFile.id === 'PENDING_TEMPLATE'
                    ? 'Usar plantilla'
                    : editingFile.id === 'PENDING_UPLOAD'
                    ? 'Adjuntar archivo'
                    : 'Editar documento'}
                </h2>
                {editingFile.id === 'PENDING_UPLOAD' && uploadQueueTotal > 1 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Archivo {uploadQueueTotal - uploadQueue.length} de {uploadQueueTotal}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingFile(null);
                  if (editingFile.id === 'PENDING_UPLOAD') {
                    setUploadQueue([]); setUploadQueueTotal(0); pendingUploadFile.current = null;
                  }
                }}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-6 space-y-4">
              {/* Nombre del documento */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Nombre del documento</label>
                <input
                  type="text"
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  placeholder="Ej: 1. - Consentimiento"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  autoFocus
                />
                {editingFile.id === 'PENDING_UPLOAD' && pendingUploadFile.current && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Archivo: <span className="font-medium text-slate-500">{pendingUploadFile.current.name}</span>
                  </p>
                )}
              </div>

              {/* Tipo de adjunto */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tipo de adjunto</label>
                <select
                  value={editAttachmentType}
                  onChange={(e) => setEditAttachmentType(e.target.value)}
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

            {/* Footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setEditingFile(null);
                  if (editingFile.id === 'PENDING_UPLOAD') {
                    setUploadQueue([]); setUploadQueueTotal(0); pendingUploadFile.current = null;
                  }
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {editingFile.id === 'PENDING_UPLOAD' && uploadQueueTotal > 1 ? 'Cancelar todo' : 'Cancelar'}
              </button>
              <button
                onClick={() => {
                  if (editingFile.id === 'NEW_BLANK') createBlankDoc();
                  else if (editingFile.id === 'PENDING_TEMPLATE') downloadDocPlantTemplate();
                  else if (editingFile.id === 'PENDING_UPLOAD') uploadSingleFile();
                  else saveFileMetadata();
                }}
                disabled={savingMetadata || (editingFile.id !== 'PENDING_UPLOAD' && !editDocName.trim())}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {savingMetadata
                  ? 'Subiendo...'
                  : editingFile.id === 'NEW_BLANK'
                  ? 'Crear'
                  : editingFile.id === 'PENDING_TEMPLATE'
                  ? 'Usar'
                  : editingFile.id === 'PENDING_UPLOAD'
                  ? (uploadQueue.length > 0 ? `Adjuntar (${uploadQueueTotal - uploadQueue.length}/${uploadQueueTotal})` : 'Adjuntar')
                  : 'Guardar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


