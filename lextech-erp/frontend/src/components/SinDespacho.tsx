import { useState, type ReactNode } from "react";
import { useAuth, useClerk, useUser } from "@clerk/clerk-react";
import { Building2, Copy, LogOut, Plus } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useOrganizacion } from "../lib/useOrganizacion";

// Un usuario recién registrado no entra en ningún despacho por su cuenta (el
// backend le bloquea todos los datos con 403 "sin_organizacion"). Hasta que un
// propietario/admin lo añada por su email, o cree su propio despacho, ve esto
// en lugar de la aplicación.
export function ConDespacho({ children }: { children: ReactNode }) {
  const { isLoaded, sinOrganizacion } = useOrganizacion();
  if (isLoaded && sinOrganizacion) return <SinDespacho />;
  return <>{children}</>;
}

function SinDespacho() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(email); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
  };

  const crear = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await apiFetch("/api/organizacion", { getToken, method: "POST", body: JSON.stringify({ nombre: nombre.trim() }) });
      if (!r?.success) throw new Error(r?.error || "No se pudo crear el despacho.");
      window.location.assign("/dashboard");
    } catch (e: any) {
      setError(e?.message || "No se pudo crear el despacho.");
      setGuardando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Building2 className="h-7 w-7 text-slate-500" />
        </div>
        <h1 className="text-center text-lg font-semibold text-slate-900">Todavía no perteneces a ningún despacho</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Si trabajas en un despacho que ya usa Vantia, pide a su propietario o a un administrador que te añada desde
          Configuración → Miembros con este correo:
        </p>

        {email && (
          <button type="button" onClick={copiar}
            className="mt-4 flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100">
            <span className="truncate">{email}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><Copy className="h-3.5 w-3.5" />{copiado ? "Copiado" : "Copiar"}</span>
          </button>
        )}
        <p className="mt-2 text-center text-xs text-slate-400">Cuando te añadan, recarga esta página.</p>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> o <span className="h-px flex-1 bg-slate-200" />
        </div>

        {!creando ? (
          <button type="button" onClick={() => setCreando(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Crear mi despacho
          </button>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="nombre-despacho">Nombre del despacho</label>
            <input id="nombre-despacho" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
              placeholder="Ej.: García & Asociados"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            <p className="text-xs text-slate-500">Se crea vacío y serás su propietario. Después podrás invitar a tu equipo.</p>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCreando(false); setError(null); }}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => void crear()} disabled={!nombre.trim() || guardando}
                className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                {guardando ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        )}

        <button type="button" onClick={() => void signOut({ redirectUrl: "/" })}
          className="mx-auto mt-6 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
          <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
