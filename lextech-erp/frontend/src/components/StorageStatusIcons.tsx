import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Cloud, Check } from "lucide-react";
import { startGoogleDriveConnect } from "../lib/googleDriveConnect";

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
function StatusIcon({ children, connected, title, onClick }: {
  children: React.ReactNode; connected: boolean; title: string; onClick?: () => void;
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
      {connected ? (
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

export default function StorageStatusIcons({ driveConnected, canConnect }: { driveConnected: boolean; canConnect: boolean }) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);

  const connect = () => {
    if (busy) return;
    startGoogleDriveConnect({
      getToken, onError: (m) => window.alert(m), onBusy: setBusy, onConnected: () => window.location.reload(),
    });
  };

  return (
    <div className="hidden sm:flex shrink-0 items-center">
      <StatusIcon
        connected={driveConnected}
        title={driveConnected ? "Google Drive vinculado" : canConnect ? "Google Drive no vinculado — pulsa para vincular" : "Google Drive no vinculado"}
        onClick={!driveConnected && canConnect ? connect : undefined}
      >
        <DriveLogo />
      </StatusIcon>
      <StatusIcon connected={false} title="OneDrive no vinculado (próximamente)">
        <Cloud size={20} className="text-[#0364B8]" fill="currentColor" />
      </StatusIcon>
      <StatusIcon connected={false} title="Dropbox no vinculado (próximamente)">
        <DropboxLogo />
      </StatusIcon>
    </div>
  );
}
