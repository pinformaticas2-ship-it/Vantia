import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Languages, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { apiFetch } from "../lib/api";
import { aviso } from "../lib/avisos";
import { IDIOMAS, nombreEspanol } from "../lib/idiomas";

// Traducir un documento entero (adjunto de un cliente/expediente o documento
// del editor). El servidor lo hace en segundo plano (puede tardar minutos) y
// aquí se pregunta por el estado; si se cierra la ventana, sigue y avisa al
// terminar.

export type ResultadoTraduccion =
  | { tipo: "archivo"; archivoId: string; entidadId: string; nombre: string; parcial: boolean }
  | { tipo: "documento"; documentoId: string; url: string; titulo: string; parcial: boolean };

type Modo = "traduccion" | "bilingue";
const CLAVE_IDIOMA = "vantia.docs.idiomaTraduccion";
const CLAVE_MODO = "vantia.docs.modoTraduccion";
const leer = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };

/** Extensiones que se pueden traducir (Word, PDF —también escaneado—, imágenes, texto). */
export const traducible = (nombre: string, mime?: string | null) =>
  /\.(docx?|odt|rtf|pdf|jpe?g|png|webp|txt|html?)$/i.test(nombre) || /pdf|wordprocessing|msword|image\/(jpeg|png|webp)|text\//i.test(mime || "");

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TraducirDocumento({ nombre, url, idiomaSugerido, onClose, onHecho }: {
  nombre: string;
  /** Endpoint POST que lanza la traducción ({ idioma, modo } → { trabajoId }). */
  url: string;
  idiomaSugerido?: string | null;
  onClose: () => void;
  onHecho: (r: ResultadoTraduccion) => void;
}) {
  const { getToken } = useAuth();
  const sugerido = idiomaSugerido && idiomaSugerido !== "es" ? idiomaSugerido : "";
  const [idioma, setIdioma] = useState(sugerido || leer(CLAVE_IDIOMA) || "en");
  const [modo, setModo] = useState<Modo>(leer(CLAVE_MODO) === "bilingue" ? "bilingue" : "traduccion");
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const abierta = useRef(true);
  useEffect(() => () => { abierta.current = false; }, []);

  const empezar = async () => {
    setError("");
    guardar(CLAVE_IDIOMA, idioma); guardar(CLAVE_MODO, modo);
    const r = await apiFetch(url, { getToken, method: "POST", body: JSON.stringify({ idioma, modo }) }).catch((e: any) => ({ success: false, error: e?.message }));
    if (!r?.success || !r.data?.trabajoId) { setError(r?.error || "No se pudo empezar la traducción."); return; }
    setProgreso({ hechos: 0, total: 0 });
    const id = r.data.trabajoId as string;
    // Sigue aunque se cierre la ventana: al terminar, aviso con acceso al resultado.
    for (let fallos = 0; ;) {
      await espera(2500);
      const e = await apiFetch(`/api/traducciones/${id}`, { getToken }).catch(() => null);
      if (!e?.success) {
        if (++fallos < 4 && e?.error === undefined) continue; // red caída un momento
        const msg = e?.error || "Se perdió el seguimiento de la traducción.";
        if (abierta.current) { setProgreso(null); setError(msg); } else aviso.error(msg);
        return;
      }
      fallos = 0;
      const d = e.data;
      if (d.estado === "en_curso") { if (abierta.current) setProgreso({ hechos: d.hechos, total: d.total }); continue; }
      if (d.estado === "error") {
        if (abierta.current) { setProgreso(null); setError(d.error || "No se pudo traducir el documento."); } else aviso.error(`Traducción de «${nombre}»: ${d.error || "no se pudo hacer"}`);
        return;
      }
      if (d.resultado?.parcial) aviso.info("El documento era muy largo: solo se ha traducido el principio.", { duracion: 10000 });
      onHecho(d.resultado);
      if (abierta.current) onClose();
      return;
    }
  };

  const enCurso = progreso !== null;
  const pct = progreso && progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0;
  return (
    <Modal open onClose={onClose} title="Traducir documento" subtitle={nombre} maxWidth="max-w-lg"
      footer={enCurso ? (
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Seguir trabajando (te aviso al terminar)
        </button>
      ) : (<>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={empezar} className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800">
          <Languages size={15} /> Traducir
        </button>
      </>)}>
      {enCurso ? (
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Loader2 size={16} className="animate-spin text-red-700" />
            {progreso.total > 1 ? `Traduciendo… parte ${Math.min(progreso.hechos + 1, progreso.total)} de ${progreso.total}` : "Traduciendo…"}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-red-700 transition-all duration-500" style={{ width: `${Math.max(pct, 6)}%` }} />
          </div>
          <p className="text-xs text-slate-500">Un documento largo tarda unos minutos. Puedes cerrar esta ventana: se guardará igualmente y te avisaré.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Traducir al</span>
            <select value={idioma} onChange={(e) => setIdioma(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400">
              {IDIOMAS.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo === "es" ? "Español (de un documento en otro idioma)" : i.nombre}{i.codigo === sugerido ? " · idioma del cliente" : ""}</option>)}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Formato</span>
            <div className="grid grid-cols-2 gap-2">
              {([["traduccion", "Solo la traducción", `Documento en ${nombreEspanol(idioma)}`], ["bilingue", "Original y traducción", "A dos columnas, párrafo a párrafo"]] as const).map(([v, t, s]) => (
                <button key={v} type="button" onClick={() => setModo(v)}
                  className={`rounded-xl border px-3 py-2.5 text-left ${modo === v ? "border-red-700 bg-red-50/60 ring-1 ring-red-700" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className="block text-sm font-semibold text-slate-800">{t}</span>
                  <span className="block text-xs text-slate-500">{s}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Se guarda como un documento nuevo junto al original, con el aviso «traducción automática, no jurada». Conserva títulos, listas y tablas. Los PDF escaneados y las fotos también se leen.
          </p>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
