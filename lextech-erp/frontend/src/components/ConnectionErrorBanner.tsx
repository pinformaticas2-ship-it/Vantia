import { useState } from "react";
import { AlertCircle, RefreshCw, ChevronDown } from "lucide-react";

// ── Aviso de "no se pudo cargar" reutilizable ────────────────────────────────
// Antes cada listado (Clientes, Expedientes, Directorio...) tenía su propia
// copia de este bloque, mostrando el error técnico en crudo tal cual llegaba
// del fetch ("Failed to fetch", "NetworkError"...) -- ilegible para quien no
// sea programador. Este componente centraliza el aviso: un mensaje claro por
// defecto, con el detalle técnico oculto detrás de un desplegable para quien
// sí lo necesite (soporte, o para copiarlo al pedir ayuda).

function friendlyConnectionError(raw?: string): string {
  const msg = (raw || "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed") || msg.includes("network request failed")) {
    return "No se ha podido conectar con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "El servidor está tardando demasiado en responder. Inténtalo de nuevo en unos segundos.";
  }
  if (msg.includes("401") || msg.includes("unauthorized")) {
    return "Tu sesión ha caducado. Recarga la página para volver a iniciar sesión.";
  }
  if (msg.includes("403") || msg.includes("forbidden") || msg.includes("permiso")) {
    return "No tienes permiso para ver esto.";
  }
  return raw?.trim() || "Ha ocurrido un error inesperado.";
}

export function ConnectionErrorBanner({
  error,
  onRetry,
  title = "No se ha podido cargar",
}: {
  error: string;
  onRetry: () => void;
  title?: string;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="w-full max-w-md flex items-start gap-3.5 p-5 rounded-2xl border border-rose-100 bg-white shadow-[0_8px_28px_-16px_rgba(190,18,60,0.35)]">
      <div className="shrink-0 h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
        <AlertCircle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-slate-800">{title}</p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{friendlyConnectionError(error)}</p>

        {error && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown size={11} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
            Detalles técnicos
          </button>
        )}
        {showDetails && (
          <p className="mt-1.5 text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 break-all">
            {error}
          </p>
        )}

        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
        >
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    </div>
  );
}
