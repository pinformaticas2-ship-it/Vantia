import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { safeJson } from "../lib/api";

// Editor de documentos en el navegador (Word, Excel, PowerPoint) con
// ONLYOFFICE Docs. El backend firma la configuración y recibe el guardado;
// aquí solo se carga el api.js del Document Server y se monta el editor.
// Backend: controllers/onlyofficeController.ts.

declare global {
  interface Window { DocsAPI?: { DocEditor: new (id: string, config: any) => { destroyEditor: () => void } } }
}

const EDITOR_EXTS = /\.(docx?|docm|dotx?|odt|rtf|txt|xlsx?|xlsm|xlsb|ods|csv|pptx?|odp)$/i;
export function isOnlyOfficeCompatible(f: { original_name?: string | null }) {
  return EDITOR_EXTS.test(f.original_name || "");
}

// ¿Está configurado el Document Server? Se pregunta una sola vez por sesión.
let statusPromise: Promise<boolean> | null = null;
export function useOnlyOfficeEnabled(): boolean {
  const { getToken } = useAuth();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (!statusPromise) {
      statusPromise = (async () => {
        try {
          const token = await getToken();
          const res = await fetch("/api/files/onlyoffice/status", { headers: { Authorization: `Bearer ${token}` } });
          const data = await safeJson(res);
          return Boolean(res.ok && data?.enabled);
        } catch {
          statusPromise = null;
          return false;
        }
      })();
    }
    statusPromise.then((v) => { if (vivo) setEnabled(v); });
    return () => { vivo = false; };
  }, [getToken]);
  return enabled;
}

const scriptPromises = new Map<string, Promise<void>>();
function loadDocsApi(documentServerUrl: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  const src = `${documentServerUrl}/web-apps/apps/api/documents/api.js`;
  let p = scriptPromises.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromises.delete(src); reject(new Error("No se pudo conectar con el servidor de documentos.")); };
      document.head.appendChild(s);
    });
    scriptPromises.set(src, p);
  }
  return p;
}

let _editorSeq = 0;

export default function OnlyOfficeEditor({ entityId, file, readOnly = false, onClose }: {
  entityId: string;
  file: { id: string; original_name: string };
  readOnly?: boolean;
  onClose: (huboEdicion: boolean) => void;
}) {
  const { getToken } = useAuth();
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const placeholderId = useRef(`onlyoffice-editor-${++_editorSeq}`).current;

  useEffect(() => {
    let editor: { destroyEditor: () => void } | null = null;
    let cancelado = false;
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/files/${entityId}/${file.id}/onlyoffice${readOnly ? "?mode=view" : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await safeJson(res);
        if (!res.ok || !data?.config) throw new Error(data?.error || "No se pudo abrir el editor.");
        await loadDocsApi(data.documentServerUrl);
        if (cancelado || !window.DocsAPI) return;
        setCanEdit(Boolean(data.canEdit));
        editor = new window.DocsAPI.DocEditor(placeholderId, {
          ...data.config,
          width: "100%",
          height: "100%",
          type: "desktop",
          events: {
            onError: (e: any) => {
              setEstado("error");
              setError(e?.data?.errorDescription || "El editor ha devuelto un error.");
            },
          },
        });
        setEstado("ok");
      } catch (e: any) {
        if (cancelado) return;
        setEstado("error");
        setError(e?.message || "No se pudo abrir el editor.");
      }
    })();
    return () => {
      cancelado = true;
      try { editor?.destroyEditor(); } catch { /* ya destruido */ }
    };
  }, [entityId, file.id, readOnly, getToken, placeholderId]);

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex flex-col bg-slate-900/40 p-2 sm:p-4">
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-extrabold text-slate-800" title={file.original_name}>{file.original_name}</h2>
            <p className="text-[11px] text-slate-500">
              {estado !== "ok" ? " "
                : canEdit
                  ? "Los cambios se guardan en el expediente al pulsar Guardar o al cerrar el editor."
                  : "Solo lectura."}
            </p>
          </div>
          <button type="button" onClick={() => onClose(canEdit)} title="Cerrar editor"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="relative flex-1">
          <div id={placeholderId} className="absolute inset-0" />
          {estado === "cargando" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Abriendo el editor…
            </div>
          )}
          {estado === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-6 text-center">
              <AlertTriangle size={28} className="text-amber-500" />
              <p className="text-sm font-semibold text-slate-700">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
