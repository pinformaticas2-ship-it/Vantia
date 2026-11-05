import { useState, type ReactNode } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { Building2, KeyRound, LogOut, Plus } from "lucide-react";
import { apiFetch, setActiveOrganizacionId } from "../lib/api";
import { useOrganizacion } from "../lib/useOrganizacion";

// Un usuario recién registrado no entra en ningún despacho por su cuenta (el
// backend le bloquea todos los datos con 403 "sin_organizacion"). Hasta que se
// una a uno con un código que le da alguien del despacho, o cree el suyo, ve
// esto en lugar de la aplicación.
export function ConDespacho({ children }: { children: ReactNode }) {
  const { isLoaded, sinOrganizacion } = useOrganizacion();
  if (isLoaded && sinOrganizacion) return <SinDespacho />;
  return <>{children}</>;
}

function SinDespacho() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [modo, setModo] = useState<"elegir" | "codigo" | "crear">("elegir");
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrar = (organizacionId: string) => {
    setActiveOrganizacionId(organizacionId);
    window.location.assign("/dashboard");
  };

  const enviar = async () => {
    if (!valor.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = modo === "codigo"
        ? await apiFetch("/api/organizacion/unirse", { getToken, method: "POST", body: JSON.stringify({ codigo: valor }) })
        : await apiFetch("/api/organizacion", { getToken, method: "POST", body: JSON.stringify({ nombre: valor.trim() }) });
      if (!r?.success) throw new Error(r?.error || "No se ha podido completar.");
      entrar(modo === "codigo" ? r.data.organizacionId : r.data.id);
    } catch (e: any) {
      setError(e?.message || "No se ha podido completar.");
      setGuardando(false);
    }
  };

  const cambiar = (m: typeof modo) => { setModo(m); setValor(""); setError(null); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Building2 className="h-7 w-7 text-slate-500" />
        </div>
        <h1 className="text-center text-lg font-semibold text-slate-900">Todavía no perteneces a ningún despacho</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Únete al de tu equipo con el código que te den, o crea uno nuevo.
        </p>

        {modo === "elegir" ? (
          <div className="mt-6 space-y-3">
            <button type="button" onClick={() => cambiar("codigo")}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-left hover:bg-slate-50">
              <KeyRound className="h-5 w-5 shrink-0 text-slate-500" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Tengo un código</span>
                <span className="block text-xs text-slate-500">Te lo da el propietario o un administrador del despacho desde Configuración → Gestión de Usuarios.</span>
              </span>
            </button>
            <button type="button" onClick={() => cambiar("crear")}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-left hover:bg-slate-50">
              <Plus className="h-5 w-5 shrink-0 text-slate-500" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Crear mi despacho</span>
                <span className="block text-xs text-slate-500">Empieza vacío y serás su propietario. Después podrás invitar a tu equipo.</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="sin-despacho-valor">
              {modo === "codigo" ? "Código del despacho" : "Nombre del despacho"}
            </label>
            <input id="sin-despacho-valor" autoFocus value={valor}
              onChange={(e) => setValor(modo === "codigo" ? e.target.value.toUpperCase() : e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void enviar(); }}
              placeholder={modo === "codigo" ? "XXXX-XXXX" : "Ej.: García & Asociados"}
              maxLength={modo === "codigo" ? 12 : 200}
              autoComplete="off"
              className={`w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 ${modo === "codigo" ? "text-center font-mono text-lg tracking-[0.3em]" : ""}`} />
            {modo === "codigo" && <p className="text-xs text-slate-500">El código caduca a los 10 minutos y solo sirve una vez.</p>}
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => cambiar("elegir")}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">Volver</button>
              <button type="button" onClick={() => void enviar()} disabled={!valor.trim() || guardando}
                className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                {guardando ? "Un momento…" : modo === "codigo" ? "Unirme" : "Crear"}
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
