import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Brush, FileText, ListChecks, Loader2, MessageSquare, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Modal } from "../components/Modal";

// Ajustes → Skills (30/10/2026): instrucciones propias del despacho que la IA
// sigue al redactar, en Documentos y en Chat IA. Backend: skillsController.ts.

type Categoria = "documento" | "estilo" | "tarea";
interface Skill {
  id: string;
  nombre: string;
  descripcion: string | null;
  instrucciones: string;
  categoria: Categoria;
  activa: boolean;
  en_chat: boolean;
  updated_by_name: string | null;
  updated_at: string;
}

const CATEGORIAS: { key: Categoria; titulo: string; ayuda: string; icon: any }[] = [
  { key: "estilo", titulo: "Estilo del despacho", ayuda: "Se aplican siempre que la IA redacta: tono, formato, cómo citar, cómo poner las fechas...", icon: Brush },
  { key: "documento", titulo: "Documentos", ayuda: "Cómo redactar cada tipo de escrito. Salen en Documentos para empezar con un clic.", icon: FileText },
  { key: "tarea", titulo: "Otras tareas", ayuda: "Formas de trabajar: resumir un expediente, revisar un contrato, preparar una reunión...", icon: ListChecks },
];

const VACIA = { nombre: "", descripcion: "", instrucciones: "", categoria: "documento" as Categoria, activa: true, en_chat: true };

export default function SkillsPanel() {
  const { getToken } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<(typeof VACIA & { id?: string }) | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch("/api/skills", { getToken });
      if (r?.success === false) throw new Error(r.error);
      setSkills(r.data.skills);
      setPuedeEditar(Boolean(r.data.puedeEditar));
    } catch (e: any) {
      setError(e.message || "No se pudieron cargar las skills.");
    } finally {
      setCargando(false);
    }
  }, [getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  const cambiar = async (s: Skill, cambios: Partial<Skill>) => {
    setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...cambios } : x)));
    const r = await apiFetch(`/api/skills/${s.id}`, { getToken, method: "PUT", body: JSON.stringify(cambios) }).catch((e) => ({ success: false, error: e.message }));
    if (!r?.success) { setError(r?.error || "No se pudo guardar."); void cargar(); }
  };

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    try {
      const { id, ...cuerpo } = editando;
      const r = await apiFetch(id ? `/api/skills/${id}` : "/api/skills", { getToken, method: id ? "PUT" : "POST", body: JSON.stringify(cuerpo) });
      if (r?.success === false) throw new Error(r.error);
      setEditando(null);
      await cargar();
    } catch (e: any) {
      setError(e.message || "No se pudo guardar la skill.");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    const r = await apiFetch(`/api/skills/${id}`, { getToken, method: "DELETE" }).catch((e) => ({ success: false, error: e.message }));
    setBorrando(null);
    if (!r?.success) { setError(r?.error || "No se pudo borrar."); return; }
    setSkills((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-extrabold text-slate-800">Skills</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Instrucciones del despacho que la IA sigue al redactar, en{" "}
            <Link to="/dashboard/documentos" className="font-semibold text-[#ab0433] hover:underline">Documentos</Link> y en{" "}
            <Link to="/dashboard/chat-ia" className="font-semibold text-[#ab0433] hover:underline">Chat IA</Link>.
            Escríbelas como se lo explicarías a un compañero nuevo: qué estructura lleva el escrito, qué no puede faltar y cómo os gusta.
          </p>
        </div>
        {puedeEditar && (
          <button type="button" onClick={() => setEditando({ ...VACIA })} className="inline-flex items-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#92042c]">
            <Plus size={15} /> Nueva skill
          </button>
        )}
      </div>

      {!puedeEditar && !cargando && (
        <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">Puedes usarlas todas; crearlas o cambiarlas solo puede el propietario o un administrador.</p>
      )}
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-300" size={22} /></div>
      ) : (
        <div className="space-y-8">
          {CATEGORIAS.map((cat) => {
            const deEsta = skills.filter((s) => s.categoria === cat.key);
            return (
              <section key={cat.key}>
                <div className="mb-3 flex items-center gap-2">
                  <cat.icon size={16} className="text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-800">{cat.titulo}</h2>
                  <span className="text-xs text-slate-400">· {cat.ayuda}</span>
                </div>
                {!deEsta.length ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">Ninguna todavía.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {deEsta.map((s) => (
                      <div key={s.id} className={`flex flex-col rounded-2xl border bg-white p-4 transition ${s.activa ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Sparkles size={13} className="shrink-0 text-[#ab0433]" /> {s.nombre}</p>
                            {s.descripcion && <p className="mt-0.5 text-xs text-slate-500">{s.descripcion}</p>}
                          </div>
                          {puedeEditar && (
                            <label className="relative inline-flex shrink-0 cursor-pointer items-center" title={s.activa ? "Activa" : "Desactivada"}>
                              <input type="checkbox" className="peer sr-only" checked={s.activa} onChange={(e) => cambiar(s, { activa: e.target.checked })} />
                              <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-emerald-500" />
                              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                            </label>
                          )}
                        </div>
                        <p className="mt-3 line-clamp-3 flex-1 whitespace-pre-line text-xs leading-5 text-slate-500">{s.instrucciones}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px]">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${s.en_chat ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
                            <MessageSquare size={10} /> {s.en_chat ? "También en Chat IA" : "Solo en Documentos"}
                          </span>
                          {puedeEditar && (
                            <span className="ml-auto flex items-center gap-1">
                              <button type="button" onClick={() => setEditando({ id: s.id, nombre: s.nombre, descripcion: s.descripcion || "", instrucciones: s.instrucciones, categoria: s.categoria, activa: s.activa, en_chat: s.en_chat })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100">
                                <Pencil size={11} /> Editar
                              </button>
                              {borrando === s.id ? (
                                <>
                                  <button type="button" onClick={() => borrar(s.id)} className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white">Borrar</button>
                                  <button type="button" onClick={() => setBorrando(null)} className="rounded-lg px-2 py-1 font-semibold text-slate-500">No</button>
                                </>
                              ) : (
                                <button type="button" onClick={() => setBorrando(s.id)} className="rounded-lg p-1 text-slate-400 hover:text-red-600" title="Borrar"><Trash2 size={12} /></button>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editando && (
        <Modal
          open
          onClose={() => !guardando && setEditando(null)}
          title={editando.id ? "Editar skill" : "Nueva skill"}
          subtitle="La IA la seguirá al pie de la letra cuando la uséis."
          icon={<Sparkles size={18} />}
          maxWidth="max-w-2xl"
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <button type="button" onClick={() => setEditando(null)} disabled={guardando} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
              <button type="button" onClick={guardar} disabled={guardando || !editando.nombre.trim() || !editando.instrucciones.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div>
                <label className="text-xs font-semibold text-slate-500">Nombre</label>
                <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej.: Recurso de apelación" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Tipo</label>
                <select value={editando.categoria} onChange={(e) => setEditando({ ...editando, categoria: e.target.value as Categoria })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="documento">Documento</option>
                  <option value="estilo">Estilo (siempre)</option>
                  <option value="tarea">Otra tarea</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Para qué sirve (una línea)</label>
              <input value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} placeholder="Ej.: Recurso contra sentencias de primera instancia (arts. 455 y ss. LEC)" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Instrucciones para la IA</label>
              <textarea
                value={editando.instrucciones}
                onChange={(e) => setEditando({ ...editando, instrucciones: e.target.value })}
                rows={12}
                placeholder={"Ej.:\n- Encabezamiento dirigido a la Audiencia Provincial, a través del juzgado que dictó la sentencia.\n- Alegaciones numeradas: una por cada motivo de impugnación, citando la página de la sentencia.\n- Plazo: 20 días desde la notificación.\n- Termina con el SUPLICO pidiendo la revocación y costas."}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-slate-400"
              />
              <p className="mt-1 text-[11px] text-slate-400">Consejo: pega un escrito vuestro que os guste y pide "sigue la estructura y el estilo de este ejemplo".</p>
            </div>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={editando.activa} onChange={(e) => setEditando({ ...editando, activa: e.target.checked })} className="h-4 w-4" /> Activa
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={editando.en_chat} onChange={(e) => setEditando({ ...editando, en_chat: e.target.checked })} className="h-4 w-4" /> Usarla también en Chat IA
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
