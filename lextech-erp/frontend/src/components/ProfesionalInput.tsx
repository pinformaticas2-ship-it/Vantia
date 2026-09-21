import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { Plus } from "lucide-react";
import { safeJson } from "../lib/api";

const inputCls = "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors";
const miniInputCls = "w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500";

// Campo de abogado/procurador con desplegable propio de sugerencias del
// Directorio de Profesionales y alta rápida ("Crear nuevo ...") sin salir del
// formulario. Mismo comportamiento que en "Importar expediente desde documento".
export function ProfesionalInput({ tipo, value, onChange, options, onCreated, placeholder }: {
  tipo: "ABOGADO" | "PROCURADOR";
  value: string;
  onChange: (v: string) => void;
  options: string[];
  onCreated: (nombreCompleto: string) => void;
  placeholder: string;
}) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  // El desplegable se pinta en un portal (position: fixed) para que no lo
  // recorte el overflow-hidden de la tarjeta/modal que contiene el campo.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const t = event.target as Node;
      if (ref.current && !ref.current.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const label = tipo === "ABOGADO" ? "abogado" : "procurador";
  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query)) : options;

  const closeCreate = () => { setCreating(false); setNombre(""); setApellidos(""); setError(""); };

  const create = async () => {
    if (!nombre.trim()) return;
    setSaving(true); setError("");
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/directorio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, first_name: nombre.trim(), last_name: apellidos.trim() }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo crear el registro");
      const full = `${d.data.first_name || ""} ${d.data.last_name || ""}`.trim();
      onCreated(full);
      onChange(full);
      closeCreate();
    } catch (e: any) {
      setError(e.message || "No se pudo crear el registro");
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
        <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" className={miniInputCls} />
        <input value={apellidos} onChange={e => setApellidos(e.target.value)} placeholder="Apellidos" className={miniInputCls} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-1.5">
          <button type="button" disabled={saving || !nombre.trim()} onClick={create}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Creando…" : `Crear ${label}`}
          </button>
          <button type="button" onClick={closeCreate}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-white">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={inputCls}
      />
      {open && rect && createPortal(
        <div ref={menuRef} style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 10000 }}
          className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)]">
          {filtered.length > 0 ? (
            filtered.map(o => (
              <button
                key={o}
                type="button"
                onMouseDown={() => { onChange(o); setOpen(false); }}
                className="block w-[calc(100%-12px)] mx-1.5 truncate rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {o}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-400">Sin coincidencias en el Directorio.</p>
          )}
          <button
            type="button"
            onMouseDown={() => { setCreating(true); setOpen(false); }}
            className="mt-1 flex w-[calc(100%-12px)] mx-1.5 items-center gap-1.5 rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <Plus size={13} /> Crear nuevo {label}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// Carga los nombres de abogados y procuradores del Directorio (para el desplegable).
export function useProfesionalesOptions() {
  const { getToken } = useAuth();
  const [abogados, setAbogados] = useState<string[]>([]);
  const [procuradores, setProcuradores] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const headers = { Authorization: `Bearer ${token}` };
        const [aRes, pRes] = await Promise.all([
          fetch("/api/directorio?tipo=ABOGADO", { headers }),
          fetch("/api/directorio?tipo=PROCURADOR", { headers }),
        ]);
        const [aData, pData] = await Promise.all([safeJson(aRes), safeJson(pRes)]);
        const toNames = (rows: any[]) => (rows || [])
          .map((p: any) => `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.despacho || "")
          .filter(Boolean);
        if (aRes.ok) setAbogados(toNames(aData.data));
        if (pRes.ok) setProcuradores(toNames(pData.data));
      } catch { /* las sugerencias son opcionales */ }
    })();
  }, [getToken]);
  return {
    abogados, procuradores,
    addAbogado: (n: string) => setAbogados(p => [...p, n]),
    addProcurador: (n: string) => setProcuradores(p => [...p, n]),
  };
}
