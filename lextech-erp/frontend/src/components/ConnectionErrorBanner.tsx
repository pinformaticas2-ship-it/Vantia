import { useState } from "react";
import { WifiOff, RefreshCw, ChevronDown } from "lucide-react";

// ── Aviso de "no se pudo cargar" reutilizable ────────────────────────────────
// Antes cada listado (Clientes, Expedientes, Directorio...) tenía su propia
// copia de este bloque, mostrando el error técnico en crudo tal cual llegaba
// del fetch ("Failed to fetch", ilegible para quien no programa). Este
// componente centraliza el aviso: un mensaje claro por defecto, con el
// detalle técnico oculto detrás de un desplegable para quien sí lo necesite.

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
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    onRetry();
    window.setTimeout(() => setRetrying(false), 900);
  };

  return (
    <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-rose-100 bg-white p-7 text-center shadow-[0_24px_60px_-32px_rgba(190,18,60,0.45)] animate-modal-in">
      <style>{`
        @keyframes cebPulseRing { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes cebSpin { to { transform: rotate(360deg); } }
        .ceb-spin { animation: cebSpin .7s cubic-bezier(.4,0,.2,1); }
      `}</style>

      {/* Halo de fondo, puramente decorativo */}
      <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-rose-100/60 blur-2xl" />

      <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-rose-500/25" style={{ animation: "cebPulseRing 2.2s cubic-bezier(0.16,1,0.3,1) infinite" }} />
        <span className="absolute inset-0 rounded-full bg-rose-500/25" style={{ animation: "cebPulseRing 2.2s cubic-bezier(0.16,1,0.3,1) infinite 1.1s" }} />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-500/30">
          <WifiOff size={22} strokeWidth={2.25} />
        </div>
      </div>

      <p className="relative text-[15px] font-bold text-slate-800">{title}</p>
      <p className="relative mt-1.5 text-[13px] leading-relaxed text-slate-500">{friendlyConnectionError(error)}</p>

      <button
        onClick={handleRetry}
        className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-500/25 transition-colors hover:bg-rose-700 active:scale-95"
      >
        <RefreshCw size={13} className={retrying ? "ceb-spin" : ""} /> Reintentar
      </button>

      {error && (
        <div className="relative mt-4">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 transition-colors hover:text-slate-500"
          >
            <ChevronDown size={11} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
            Detalles técnicos
          </button>
          {showDetails && (
            <p className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-left font-mono text-[11px] text-slate-400 break-all">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
