import { useState, useEffect, useRef } from "react";
import {
  Bookmark, Plus, X, Search, ChevronDown, Check,
  Pencil, Trash2, Settings, AlertTriangle, ChevronUp,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────
export interface Atajo {
  id: string;
  nombre: string;
  modulos: string[];
  accion: string;
  documento: string;
  formaEnvio: string;
  plantillaCorreo: string;
  carpeta: string;
  habilitado: boolean;
  enBarra: boolean;
}

// ── Constantes ─────────────────────────────────────────────────
const STORAGE_KEY = "vantia_atajos_v1";

export const ACCIONES = [
  "<Selecciona una acción>",
  "Enviar correo",
  "Enviar SMS",
  "Enviar WhatsApp",
  "Imprimir documento",
  "Generar PDF",
  "Crear tarea",
  "Alta expediente",
  "Cierre expediente",
  "Notificar cierre",
  "Solicitar documentación",
  "Solicitar provisión de fondos",
  "Valoración",
  "Firma de documento",
  "Informe detallado",
  "Comunicación novedades",
];

export const FORMAS_ENVIO = ["", "Correo", "SMS", "WhatsApp", "Impresión", "PDF"];

export const MODULOS_DISPONIBLES = ["Expedientes", "Clientes"];

export const CARPETAS_DEFAULT = ["General", "Informes", "Envío Recursos", "Comunicaciones", "Documentación"];

const ATAJO_EMPTY: Omit<Atajo, "id"> = {
  nombre: "",
  modulos: [],
  accion: "",
  documento: "",
  formaEnvio: "",
  plantillaCorreo: "",
  carpeta: "General",
  habilitado: true,
  enBarra: true,
};

// ── Helpers de storage ─────────────────────────────────────────
export function loadAtajos(): Atajo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveAtajos(atajos: Atajo[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(atajos));
}

function newId() {
  return `atajo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Modal: Nuevo / Editar Atajo ────────────────────────────────
export function NuevoAtajoModal({
  modulo,
  initial,
  onSave,
  onClose,
}: {
  modulo: string;
  initial?: Atajo | null;
  onSave: (a: Atajo) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Atajo, "id">>(
    initial
      ? { ...initial }
      : { ...ATAJO_EMPTY, modulos: [modulo] }
  );

  const set = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));

  const toggleModulo = (m: string) => {
    setForm(p => ({
      ...p,
      modulos: p.modulos.includes(m) ? p.modulos.filter(x => x !== m) : [...p.modulos, m],
    }));
  };

  const lbl = "block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5";
  const inp = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-300 focus:bg-white transition-colors";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Bookmark size={15} className="text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {initial ? "Modificar atajo" : "Nuevo atajo"} · {modulo}
              </p>
              <h3 className="text-base font-bold text-slate-900">
                {initial ? (initial.nombre || "Editar atajo") : "Crear nuevo atajo"}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">

          {/* Nombre */}
          <div>
            <label className={lbl}>Nombre del atajo</label>
            <input
              value={form.nombre}
              onChange={e => set("nombre", e.target.value)}
              placeholder="Ej: Enviar Correo de Bienvenida"
              autoFocus
              className={inp}
            />
          </div>

          <div className="h-px bg-slate-100" />

          {/* Acción */}
          <div>
            <label className={lbl}>Acción</label>
            <select value={form.accion} onChange={e => set("accion", e.target.value)} className={inp}>
              {ACCIONES.map(a => <option key={a} value={a === ACCIONES[0] ? "" : a}>{a}</option>)}
            </select>
          </div>

          {/* Documento + Forma de envío */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Documento</label>
              <select value={form.documento} onChange={e => set("documento", e.target.value)} className={inp}>
                <option value="">— Ninguno —</option>
                <option value="Carátula Expediente">Carátula Expediente</option>
                <option value="Informe Detallado">Informe Detallado</option>
                <option value="Informe Resumido">Informe Resumido</option>
                <option value="Valoración">Valoración</option>
                <option value="Solicitud Documentación">Solicitud Documentación</option>
                <option value="Provisión de Fondos">Provisión de Fondos</option>
                <option value="Firma de Documento">Firma de Documento</option>
                <option value="Comunicación Novedades">Comunicación Novedades</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Forma de envío</label>
              <select value={form.formaEnvio} onChange={e => set("formaEnvio", e.target.value)} className={inp}>
                {FORMAS_ENVIO.map(f => <option key={f} value={f}>{f || "— Seleccionar —"}</option>)}
              </select>
            </div>
          </div>

          {/* Plantilla de correo */}
          <div>
            <label className={lbl}>Plantilla de correo</label>
            <div className="relative">
              <input
                value={form.plantillaCorreo}
                onChange={e => set("plantillaCorreo", e.target.value)}
                placeholder="Buscar plantilla..."
                className={`${inp} pr-9`}
              />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          {/* Módulos + Carpeta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Módulos</label>
              <div className="flex gap-1.5 flex-wrap">
                {MODULOS_DISPONIBLES.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleModulo(m)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      form.modulos.includes(m)
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {form.modulos.includes(m) && <Check size={10} />}
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Carpeta</label>
              <select value={form.carpeta} onChange={e => set("carpeta", e.target.value)} className={inp}>
                {CARPETAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Opciones */}
          <div className="flex items-center gap-5 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.habilitado}
                onChange={e => set("habilitado", e.target.checked)}
                className="rounded border-slate-300 accent-red-600"
              />
              Habilitado
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enBarra}
                onChange={e => set("enBarra", e.target.checked)}
                className="rounded border-slate-300 accent-red-600"
              />
              Mostrar en barra de atajos
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={() => {
              if (!form.nombre.trim()) return;
              onSave({ id: initial?.id || newId(), ...form });
            }}
            disabled={!form.nombre.trim()}
            className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl active:scale-95 transition-all"
          >
            Guardar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Listado / Gestión de Atajos ─────────────────────────
export function ListadoAtajosModal({
  modulo,
  onClose,
  onChanged,
}: {
  modulo: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [atajos, setAtajos] = useState<Atajo[]>(loadAtajos());
  const [buscar, setBuscar] = useState("");
  const [moduloFiltro, setModuloFiltro] = useState(modulo);
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todos");
  const [editando, setEditando] = useState<Atajo | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);

  const persist = (list: Atajo[]) => {
    setAtajos(list);
    saveAtajos(list);
    onChanged();
  };

  const filtrados = atajos.filter(a => {
    const matchBuscar = !buscar || a.nombre.toLowerCase().includes(buscar.toLowerCase());
    const matchModulo = moduloFiltro === "Todos" || a.modulos.includes(moduloFiltro);
    const matchCat = categoriaFiltro === "Todos" || a.carpeta === categoriaFiltro;
    return matchBuscar && matchModulo && matchCat;
  });

  const carpetas = ["Todos", ...Array.from(new Set(atajos.map(a => a.carpeta)))];
  const modulosFiltroOpts = ["Todos", ...MODULOS_DISPONIBLES];

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const list = [...filtrados];
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    persist(list);
  };
  const moveDown = (idx: number) => {
    if (idx === filtrados.length - 1) return;
    const list = [...filtrados];
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
    persist(list);
  };

  const toggleHabilitado = (id: string) => {
    persist(atajos.map(a => a.id === id ? { ...a, habilitado: !a.habilitado } : a));
  };

  const handleDelete = (id: string) => {
    persist(atajos.filter(a => a.id !== id));
    setConfirmDeleteId(null);
  };

  const handleSave = (saved: Atajo) => {
    if (atajos.find(a => a.id === saved.id)) {
      persist(atajos.map(a => a.id === saved.id ? saved : a));
    } else {
      persist([...atajos, saved]);
    }
    setEditando(null);
    setShowNuevo(false);
  };

  const th = "px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left whitespace-nowrap";
  const td = "px-3 py-2.5 text-xs text-slate-700";
  const filterSel = "border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-red-400 text-slate-700";

  return (
    <>
      <div
        className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/30 px-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col"
          style={{ maxHeight: "85vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Bookmark size={15} className="text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Configuración · {modulo}</p>
                <h3 className="text-base font-bold text-slate-900">Atajos de acción</h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white shrink-0">
            <button
              onClick={() => setShowNuevo(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95 transition-all"
            >
              <Plus size={12} /> Alta
            </button>
            <button
              disabled={!filtrados.length}
              onClick={() => confirmDeleteId ? handleDelete(confirmDeleteId) : setConfirmDeleteId(filtrados[0]?.id)}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg disabled:opacity-40 transition-colors"
            >
              Baja
            </button>
            <button
              disabled={!filtrados.length}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg disabled:opacity-40 transition-colors"
              onClick={() => filtrados[0] && setEditando(filtrados[0])}
            >
              Modificar
            </button>

            <div className="flex items-center gap-0.5 ml-auto border border-slate-200 rounded-lg overflow-hidden">
              <ChevronUp size={15} className="text-slate-400 hover:text-red-600 cursor-pointer p-0.5 hover:bg-slate-50 transition-colors" />
              <ChevronDownIcon size={15} className="text-slate-400 hover:text-red-600 cursor-pointer p-0.5 hover:bg-slate-50 transition-colors" />
              <span className="w-px h-4 bg-slate-200 mx-0.5" />
              <ChevronUp size={15} className="text-slate-400 hover:text-red-600 cursor-pointer p-0.5 hover:bg-slate-50 transition-colors" style={{transform:"scaleY(2)"}} />
              <ChevronDownIcon size={15} className="text-slate-400 hover:text-red-600 cursor-pointer p-0.5 hover:bg-slate-50 transition-colors" style={{transform:"scaleY(2)"}} />
            </div>
          </div>

          {/* Barra de búsqueda / filtros */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 shrink-0 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
              <input
                value={buscar}
                onChange={e => setBuscar(e.target.value)}
                className="border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs w-44 focus:outline-none focus:border-red-400 bg-white text-slate-700"
                placeholder="Buscar atajo..."
              />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Módulo</span>
            <select value={moduloFiltro} onChange={e => setModuloFiltro(e.target.value)} className={filterSel}>
              {modulosFiltroOpts.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Carpeta</span>
            <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} className={filterSel}>
              {carpetas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Tabla */}
          <div className="overflow-auto flex-1">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <th className={th}>Nombre Atajo</th>
                  <th className={th}>Módulo</th>
                  <th className={th}>Forma de Envío</th>
                  <th className={th}>Carpeta</th>
                  <th className={`${th} text-center`}>Habilitado</th>
                  <th className={`${th} text-center`}>Barra de Atajo</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300">
                          <Bookmark size={20} />
                        </div>
                        <p className="text-sm font-semibold text-slate-500">No hay atajos todavía</p>
                        <button
                          onClick={() => setShowNuevo(true)}
                          className="text-red-600 text-xs font-bold hover:underline"
                        >
                          + Crear el primer atajo
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filtrados.map((a, idx) => (
                  <tr
                    key={a.id}
                    className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className={`${td} font-semibold`}>{a.nombre}</td>
                    <td className={td}>{a.modulos.join(", ")}</td>
                    <td className={td}>{a.formaEnvio || <span className="text-slate-300">—</span>}</td>
                    <td className={td}>{a.carpeta}</td>
                    <td className={`${td} text-center`}>
                      <button onClick={() => toggleHabilitado(a.id)}>
                        {a.habilitado
                          ? <Check size={14} className="text-emerald-500 mx-auto" />
                          : <span className="text-slate-200 mx-auto block text-center">—</span>}
                      </button>
                    </td>
                    <td className={`${td} text-center`}>
                      {a.enBarra
                        ? <Check size={14} className="text-emerald-500 mx-auto" />
                        : <span className="text-slate-200 mx-auto block text-center">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
                          title="Subir"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => moveDown(idx)}
                          disabled={idx === filtrados.length - 1}
                          className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
                          title="Bajar"
                        >
                          <ChevronDownIcon size={12} />
                        </button>
                        <button
                          onClick={() => setEditando(a)}
                          className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                          title="Modificar"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(a.id)}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Nuevo / Editar */}
      {(showNuevo || editando) && (
        <NuevoAtajoModal
          modulo={modulo}
          initial={editando}
          onSave={handleSave}
          onClose={() => { setShowNuevo(false); setEditando(null); }}
        />
      )}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/30 px-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar atajo?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl active:scale-95 transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Botón Atajos con dropdown dinámico ────────────────────────
export function AtajosButton({ modulo }: { modulo: string }) {
  const [atajos, setAtajos]           = useState<Atajo[]>(loadAtajos());
  const [open, setOpen]               = useState(false);
  const [showListado, setShowListado] = useState(false);
  const [showNuevo, setShowNuevo]     = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const reload = () => setAtajos(loadAtajos());

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const visibles = atajos.filter(a => a.modulos.includes(modulo) && a.habilitado && a.enBarra);

  const porCarpeta: Record<string, Atajo[]> = {};
  visibles.forEach(a => {
    if (!porCarpeta[a.carpeta]) porCarpeta[a.carpeta] = [];
    porCarpeta[a.carpeta].push(a);
  });

  const handleSaveNuevo = (saved: Atajo) => {
    const all = loadAtajos();
    const exist = all.find(a => a.id === saved.id);
    const updated = exist ? all.map(a => a.id === saved.id ? saved : a) : [...all, saved];
    saveAtajos(updated);
    setAtajos(updated);
    setShowNuevo(false);
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${open ? "bg-amber-50 border-amber-300 text-amber-700" : "text-slate-600 hover:bg-slate-100 border-slate-200"}`}
        >
          <Bookmark size={13} /> Atajos <ChevronDown size={10} />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[240px] py-1.5 max-h-[70vh] overflow-y-auto">

            {visibles.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bookmark size={22} className="text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">No hay atajos configurados</p>
                <p className="text-[10px] text-slate-300 mt-0.5">Crea el primero con "Añadir nuevo"</p>
              </div>
            ) : (
              Object.entries(porCarpeta).map(([carpeta, items]) => (
                <div key={carpeta}>
                  {Object.keys(porCarpeta).length > 1 && (
                    <div className="px-3.5 pt-2 pb-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{carpeta}</span>
                    </div>
                  )}
                  {items.map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setOpen(false); alert(`Ejecutando: ${a.nombre}`); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-800 transition-colors text-left"
                    >
                      <Bookmark size={11} className="text-amber-400 shrink-0" />
                      {a.nombre}
                    </button>
                  ))}
                  <div className="h-px bg-slate-100 my-1" />
                </div>
              ))
            )}

            <button
              onClick={() => { setOpen(false); setShowNuevo(true); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors italic"
            >
              <Plus size={11} className="text-slate-300" /> &lt;Añadir nuevo&gt;
            </button>
            <button
              onClick={() => { setOpen(false); setShowListado(true); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors italic"
            >
              <Settings size={11} className="text-slate-300" /> &lt;Configurar Atajos&gt;
            </button>
          </div>
        )}
      </div>

      {showListado && (
        <ListadoAtajosModal
          modulo={modulo}
          onClose={() => setShowListado(false)}
          onChanged={reload}
        />
      )}

      {showNuevo && (
        <NuevoAtajoModal
          modulo={modulo}
          initial={null}
          onSave={handleSaveNuevo}
          onClose={() => setShowNuevo(false)}
        />
      )}
    </>
  );
}
