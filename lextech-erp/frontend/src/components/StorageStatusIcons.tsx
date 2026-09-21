import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Cloud, Check, X, ExternalLink, Settings, Link2, Unlink } from "lucide-react";
import { startGoogleDriveConnect } from "../lib/googleDriveConnect";
import { apiFetch } from "../lib/api";

export function DriveLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 87.3 78" aria-hidden="true">
      <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" />
      <path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
      <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

export function DropboxLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0061FF" aria-hidden="true">
      <path d="M6 1.807 0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z" />
    </svg>
  );
}

// Estado de las nubes vinculadas en la barra superior: con tick verde si está
// vinculada, y en gris con una raya si no. OneDrive y Dropbox aún no son
// funcionales, así que siempre aparecen como no vinculados.
function StatusIcon({ children, connected, hasError, title, onClick }: {
  children: React.ReactNode; connected: boolean; hasError?: boolean; title: string; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={!onClick}
      className={`relative p-2 rounded-full transition-colors ${onClick ? "hover:bg-slate-100 cursor-pointer" : "cursor-default"}`}
    >
      <span className={connected ? "" : "grayscale opacity-40"}>{children}</span>
      {connected && hasError ? (
        <span className="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white">
          <X size={9} strokeWidth={4} className="text-white" />
        </span>
      ) : connected ? (
        <span className="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
          <Check size={9} strokeWidth={4} className="text-white" />
        </span>
      ) : (
        <svg className="pointer-events-none absolute inset-0 m-auto h-5 w-5 text-slate-400" viewBox="0 0 20 20" aria-hidden="true">
          <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

type Provider = "drive" | "onedrive" | "dropbox";

function MenuItem({ icon, label, onClick, danger, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"}`}
    >
      <span className="shrink-0 text-slate-400">{icon}</span>{label}
    </button>
  );
}

export default function StorageStatusIcons({ driveConnected, driveEmail, driveHasError, driveErrorMessage, canConnect }: {
  driveConnected: boolean; driveEmail?: string | null; driveHasError?: boolean; driveErrorMessage?: string | null; canConnect: boolean;
}) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (p: Provider) => { setError(""); setOpen(o => (o === p ? null : p)); };
  const goIntegraciones = () => { setOpen(null); navigate("/dashboard/config?section=integraciones"); };

  const connect = () => {
    if (busy) return;
    setError("");
    startGoogleDriveConnect({ getToken, onError: setError, onBusy: setBusy, onConnected: () => window.location.reload() });
  };

  const disconnect = async () => {
    setBusy(true); setError("");
    try {
      const data = await apiFetch("/api/organizacion/drive", { method: "DELETE", getToken });
      if (data?.success === false) throw new Error(data.error);
      window.location.reload();
    } catch (e: any) {
      setError(e.message || "No se pudo desconectar Google Drive");
      setBusy(false);
    }
  };

  const panel = "absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl";
  const header = (name: string, status: string, ok: boolean) => (
    <div className="border-b border-slate-100 px-4 pb-2.5 pt-1.5">
      <p className="text-sm font-bold text-slate-800">{name}</p>
      <p className={`text-xs ${ok ? "text-emerald-600" : "text-slate-400"}`}>{status}</p>
    </div>
  );

  return (
    <div ref={ref} className="relative hidden sm:flex shrink-0 items-center">
      <StatusIcon
        connected={driveConnected}
        hasError={driveHasError}
        title={driveConnected ? (driveHasError ? "Google Drive vinculado, pero con un error reciente" : "Google Drive vinculado") : "Google Drive no vinculado"}
        onClick={() => toggle("drive")}
      >
        <DriveLogo />
      </StatusIcon>
      <StatusIcon connected={false} title="OneDrive no vinculado (próximamente)" onClick={() => toggle("onedrive")}>
        <Cloud size={20} className="text-[#0364B8]" fill="currentColor" />
      </StatusIcon>
      <StatusIcon connected={false} title="Dropbox no vinculado (próximamente)" onClick={() => toggle("dropbox")}>
        <DropboxLogo />
      </StatusIcon>

      {open === "drive" && (
        <div className={panel}>
          {header("Google Drive", driveConnected ? (driveHasError ? "Vinculado · con error" : `Vinculado${driveEmail ? ` · ${driveEmail}` : ""}`) : "No vinculado", driveConnected && !driveHasError)}
          {driveConnected && driveHasError && (
            <p className="border-b border-slate-100 bg-red-50 px-4 py-2 text-xs text-red-700">
              {driveErrorMessage || "Hubo un error reciente al hablar con Google Drive. Avisa a un administrador."}
            </p>
          )}
          {driveConnected ? (
            <>
              <MenuItem icon={<ExternalLink size={14} />} label="Abrir Google Drive" onClick={() => { window.open(`https://drive.google.com/drive/my-drive${driveEmail ? `?authuser=${encodeURIComponent(driveEmail)}` : ""}`, "_blank", "noopener"); setOpen(null); }} />
              <MenuItem icon={<Settings size={14} />} label="Gestionar en Integraciones" onClick={goIntegraciones} />
              {canConnect && <MenuItem icon={<Unlink size={14} />} label={busy ? "Desconectando…" : "Desconectar"} onClick={disconnect} danger disabled={busy} />}
            </>
          ) : (
            <>
              {canConnect
                ? <MenuItem icon={<Link2 size={14} />} label={busy ? "Vinculando…" : "Vincular Google Drive"} onClick={connect} disabled={busy} />
                : <p className="px-4 py-2.5 text-xs text-slate-400">Pide al propietario o a un administrador que lo vincule.</p>}
              <MenuItem icon={<Settings size={14} />} label="Ir a Integraciones" onClick={goIntegraciones} />
            </>
          )}
          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
      {(open === "onedrive" || open === "dropbox") && (
        <div className={panel}>
          {header(open === "onedrive" ? "OneDrive" : "Dropbox", "No vinculado · Próximamente", false)}
          <p className="px-4 py-2.5 text-xs text-slate-500">Esta conexión aún no está disponible.</p>
          <MenuItem icon={<Settings size={14} />} label="Ir a Integraciones" onClick={goIntegraciones} />
        </div>
      )}
    </div>
  );
}
