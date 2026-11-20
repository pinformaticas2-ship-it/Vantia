import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import type { Editor } from "@tiptap/react";
import { Check, ChevronDown, Laptop, Loader2, Search } from "lucide-react";
import { t } from "../../lib/i18n";
import {
  FUENTES_OFFICE, anotarReciente, cargarCatalogo, cargarFuenteGoogle, cargarMuestraGoogle, fuentesLocales,
  fuentesRecientes, puedeLeerFuentesLocales, valorCss, type Categoria, type Fuente,
} from "../../lib/fuentesWeb";

// Selector de fuente del editor (20/11/2026): busca entre las de Word, todo
// Google Fonts y las instaladas en el ordenador; cada una se ve con su letra.

const CATEGORIAS: { id: Categoria | ""; texto: string }[] = [
  { id: "", texto: "Todas" }, { id: "s", texto: "Con serifa" }, { id: "n", texto: "Sin serifa" },
  { id: "h", texto: "Manuscrita" }, { id: "d", texto: "Decorativa" }, { id: "m", texto: "Monoespaciada" },
];
const MAX_FILAS = 120;

export function SelectorFuente({ editor, actual }: { editor: Editor; actual: string }) {
  const { getToken } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<Categoria | "">("");
  const [google, setGoogle] = useState<Fuente[] | null>(null);
  const [locales, setLocales] = useState<Fuente[] | null>(null);
  const [errorLocales, setErrorLocales] = useState("");
  const refBoton = useRef<HTMLButtonElement>(null);
  const refPanel = useRef<HTMLDivElement>(null);
  const ANCHO = 330;

  useLayoutEffect(() => {
    if (!abierto || !refBoton.current) return;
    const r = refBoton.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - ANCHO - 8)) });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    void cargarCatalogo(getToken).then(setGoogle);
    const fuera = (e: MouseEvent) => {
      const n = e.target as globalThis.Node;
      if (!refPanel.current?.contains(n) && !refBoton.current?.contains(n)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    const cerrar = () => setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", cerrar);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); window.removeEventListener("resize", cerrar); };
  }, [abierto, getToken]);

  const todas = useMemo(() => {
    const vistas = new Set<string>();
    const out: Fuente[] = [];
    for (const f of [...FUENTES_OFFICE, ...(google || []), ...(locales || [])]) {
      const k = f.n.toLowerCase();
      if (!vistas.has(k)) { vistas.add(k); out.push(f); }
    }
    return out;
  }, [google, locales]);

  const q = busca.trim().toLowerCase();
  const filtrar = (lista: Fuente[]) => lista.filter((f) => (!cat || f.c === cat || f.origen === "local") && (!q || f.n.toLowerCase().includes(q)));
  const recientes = useMemo(() => {
    const nombres = fuentesRecientes();
    return nombres.map((n) => todas.find((f) => f.n === n) || { n, c: "n" as Categoria, v: "rbix", origen: "local" as const });
  }, [todas, abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (f: Fuente | null) => {
    if (!f) editor.chain().focus().unsetFontFamily().run();
    else {
      if (f.origen === "google") cargarFuenteGoogle(f);
      editor.chain().focus().setFontFamily(valorCss(f.n)).run();
      anotarReciente(f.n);
    }
    setAbierto(false);
    setBusca("");
  };

  const pedirLocales = async () => {
    setErrorLocales("");
    try { setLocales(await fuentesLocales()); }
    catch { setErrorLocales(t("El navegador no ha dado permiso para ver las fuentes de este ordenador.")); }
  };

  const seccion = (titulo: string, lista: Fuente[], pie?: string) => lista.length ? (
    <div className="py-1">
      <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{titulo}</p>
      {lista.slice(0, MAX_FILAS).map((f) => <Fila key={`${titulo}:${f.n}`} f={f} actual={actual} onElegir={elegir} />)}
      {pie && <p className="px-2.5 py-1.5 text-[11px] text-slate-400">{pie}</p>}
    </div>
  ) : null;

  const googleFiltradas = filtrar((google || []).filter((f) => !FUENTES_OFFICE.some((o) => o.n === f.n)));

  return (
    <>
      <button ref={refBoton} type="button" title={t("Fuente")} aria-label={t("Fuente")} aria-expanded={abierto}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setAbierto((v) => !v)}
        className="flex h-8 w-[160px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-left text-xs font-semibold text-slate-700 outline-none hover:border-slate-300">
        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ fontFamily: actual ? valorCss(actual) : "Times New Roman" }}>{actual || "Times New Roman"}</span>
        <ChevronDown size={12} className="shrink-0 opacity-50" />
      </button>
      {abierto && createPortal(
        <div ref={refPanel} role="dialog" aria-label={t("Fuente")}
          className="fixed z-[200] flex max-h-[min(480px,calc(100vh-120px))] flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          style={{ top: pos.top, left: pos.left, width: ANCHO }}>
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("Buscar fuente…")}
                onKeyDown={(e) => { if (e.key === "Enter") { const f = filtrar(todas)[0]; if (f) elegir(f); } }}
                className="h-8 w-full rounded-lg border border-slate-200 pl-7 pr-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CATEGORIAS.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cat === c.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {t(c.texto)}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-1">
            {!q && !cat && (
              <button type="button" onClick={() => elegir(null)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50">
                <span className="w-3.5">{!actual ? <Check size={13} /> : null}</span>{t("Times New Roman (predeterminada)")}
              </button>
            )}
            {!q && !cat && seccion(t("Recientes"), recientes)}
            {seccion(t("Habituales de Word"), filtrar(FUENTES_OFFICE))}
            {locales && seccion(t("En este ordenador"), filtrar(locales), t("Solo se verán igual en ordenadores que también la tengan instalada."))}
            {google === null ? (
              <p className="flex items-center gap-2 px-2.5 py-3 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" />{t("Cargando Google Fonts…")}</p>
            ) : seccion(
              `Google Fonts · ${googleFiltradas.length.toLocaleString()}`,
              googleFiltradas,
              googleFiltradas.length > MAX_FILAS ? t("Escribe para buscar entre todas.") : t("Se incrustan en el Word: se ven igual en cualquier ordenador."),
            )}
            {q && !filtrar(todas).length && <p className="px-2.5 py-3 text-xs text-slate-400">{t("Ninguna fuente se llama así.")}</p>}
            {!locales && puedeLeerFuentesLocales() && (
              <div className="border-t border-slate-100 p-2">
                <button type="button" onClick={() => void pedirLocales()} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  <Laptop size={14} />{t("Ver también las fuentes de este ordenador")}
                </button>
                {errorLocales && <p className="px-2 pt-1 text-[11px] text-red-500">{errorLocales}</p>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Una fila: el nombre con su propia fuente (de Google se pide solo esa muestra, al verse). */
function Fila({ f, actual, onElegir }: { f: Fuente; actual: string; onElegir: (f: Fuente) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (f.origen !== "google" || !ref.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { cargarMuestraGoogle(f.n); io.disconnect(); } });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [f]);
  const sel = actual.toLowerCase() === f.n.toLowerCase();
  return (
    <button ref={ref} type="button" onClick={() => onElegir(f)} title={f.n}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 ${sel ? "bg-slate-50" : ""}`}>
      <span className="w-3.5 shrink-0 text-slate-700">{sel ? <Check size={13} /> : null}</span>
      <span className="min-w-0 flex-1 truncate text-[16px] leading-6 text-slate-800" style={{ fontFamily: `${valorCss(f.n)}, system-ui` }}>{f.n}</span>
    </button>
  );
}
