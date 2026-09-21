import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Cloud, X } from "lucide-react";
import { useOrganizacion } from "../lib/useOrganizacion";
import { startGoogleDriveConnect } from "../lib/googleDriveConnect";

// Aviso al entrar cuando la organización no tiene almacenamiento en la nube
// vinculado (nunca se vinculó, o la conexión caducó/fue revocada). Sin él, los
// documentos de expedientes se quedan solo en el disco del servidor, que se
// borra en cada despliegue. Solo lo ve quien puede vincularlo (propietario/admin).
export default function DriveConnectPrompt() {
  const { getToken } = useAuth();
  const { organizacion, rol, isLoaded } = useOrganizacion();
  const dismissKey = organizacion ? `vantia.driveprompt.dismissed.${organizacion.id}` : "";
  const [dismissedNow, setDismissedNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isLoaded || !organizacion || organizacion.googleDriveConnected) return null;
  if (rol !== "propietario" && rol !== "admin") return null;
  let dismissedBefore = false;
  try { dismissedBefore = sessionStorage.getItem(dismissKey) === "1"; } catch { /* sin sessionStorage */ }
  if (dismissedNow || dismissedBefore) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(dismissKey, "1"); } catch { /* sin sessionStorage */ }
    setDismissedNow(true);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><Cloud size={20} /></div>
            <h2 className="text-base font-bold text-slate-800">Vincula tu almacenamiento en la nube</h2>
          </div>
          <button type="button" onClick={dismiss} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Google Drive no está vinculado. Sin él, los documentos de los expedientes se guardan solo en el servidor y
          pueden perderse con una actualización de la app. Vincúlalo para que cada expediente tenga su carpeta en tu nube.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setError(""); startGoogleDriveConnect({ getToken, onError: setError, onBusy: setBusy, onConnected: () => window.location.reload() }); }}
            className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Vinculando…" : "Vincular Google Drive"}
          </button>
          <button type="button" disabled className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed">
            Vincular OneDrive <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">Próximamente</span>
          </button>
          <button type="button" disabled className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed">
            Vincular Dropbox <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">Próximamente</span>
          </button>
          <button type="button" onClick={dismiss} className="w-full px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600">Ahora no</button>
        </div>
      </div>
    </div>
  );
}
