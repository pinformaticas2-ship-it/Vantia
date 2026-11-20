import { apiFetch } from "./api";

// ══════════════════════════════════════════════════════════════════════════════
// Fuentes del editor de Documentos (20/11/2026):
//  · las habituales de Word/Office (están en cualquier equipo con Word);
//  · todo Google Fonts (el catálogo lo da el servidor: GET /api/documentos/fuentes),
//    que se cargan en el navegador al usarlas y se incrustan en el .docx;
//  · las instaladas en este ordenador (Local Font Access API, Chrome/Edge,
//    con permiso de la persona). Esas no se pueden incrustar.
// A Google solo se le piden fuentes por nombre: nunca va texto del documento.
// ══════════════════════════════════════════════════════════════════════════════

export type Categoria = "s" | "n" | "d" | "h" | "m";
export type Fuente = { n: string; c: Categoria; v: string; origen: "office" | "google" | "local" };

export const FUENTES_OFFICE: Fuente[] = ([
  ["Times New Roman", "s"], ["Arial", "n"], ["Calibri", "n"], ["Cambria", "s"], ["Garamond", "s"], ["Georgia", "s"],
  ["Book Antiqua", "s"], ["Palatino Linotype", "s"], ["Century Gothic", "n"], ["Helvetica", "n"], ["Verdana", "n"],
  ["Tahoma", "n"], ["Trebuchet MS", "n"], ["Segoe UI", "n"], ["Aptos", "n"], ["Courier New", "m"], ["Consolas", "m"],
] as [string, Categoria][]).map(([n, c]) => ({ n, c, v: "rbix", origen: "office" as const }));

let catalogo: Promise<Fuente[]> | null = null;
let catalogoListo: Fuente[] = [];

export function cargarCatalogo(getToken: () => Promise<string | null>): Promise<Fuente[]> {
  catalogo ||= apiFetch("/api/documentos/fuentes", { getToken })
    .then((r: any) => {
      const lista: Fuente[] = String(r?.data?.fuentes || "").split("\n").filter(Boolean).map((l) => {
        const [n, c, v] = l.split("|");
        return { n, c: c as Categoria, v: v || "", origen: "google" as const };
      });
      catalogoListo = lista;
      return lista;
    })
    .catch(() => { catalogo = null; return []; });
  return catalogo;
}

/** Valor CSS de font-family: entre comillas si el nombre lo necesita («M PLUS 1p»). */
export function valorCss(nombre: string): string {
  return /^[A-Za-z][A-Za-z -]*$/.test(nombre) && !/(^|\s)-?\d/.test(nombre) ? nombre : `"${nombre.replace(/"/g, "")}"`;
}
export function nombreDeCss(valor: string | undefined | null): string {
  return String(valor || "").split(",")[0].replace(/["']/g, "").trim();
}

const enlaces = new Map<string, HTMLLinkElement>();
function enlazar(clave: string, href: string) {
  if (enlaces.has(clave) || typeof document === "undefined") return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
  enlaces.set(clave, l);
}
const familiaUrl = (n: string) => encodeURIComponent(n).replace(/%20/g, "+");

/** Carga la fuente de Google entera (normal, negrita, cursiva) para usarla en el documento. */
export function cargarFuenteGoogle(f: Pick<Fuente, "n" | "v">) {
  const ejes = [["r", "0,400"], ["b", "0,700"], ["i", "1,400"], ["x", "1,700"]].filter(([k]) => f.v.includes(k)).map(([, e]) => e);
  // Sin las variantes estándar (fuentes solo finas, p. ej.) se pide la familia tal cual.
  const q = ejes.length ? `${familiaUrl(f.n)}:ital,wght@${ejes.join(";")}` : familiaUrl(f.n);
  enlazar(`f:${f.n}`, `https://fonts.googleapis.com/css2?family=${q}&display=swap`);
}

/** Solo las letras del nombre, para enseñarlo con su fuente en la lista (muy ligero). */
export function cargarMuestraGoogle(nombre: string) {
  if (enlaces.has(`f:${nombre}`)) return;
  enlazar(`m:${nombre}`, `https://fonts.googleapis.com/css2?family=${familiaUrl(nombre)}&text=${encodeURIComponent(nombre)}&display=block`);
}

/** Carga las fuentes de Google que use un documento (al abrirlo y al cambiarlo). */
export function asegurarFuentes(nombres: Iterable<string>) {
  if (!catalogoListo.length) return;
  for (const n of nombres) {
    const f = catalogoListo.find((x) => x.n.toLowerCase() === n.toLowerCase());
    if (f) cargarFuenteGoogle(f);
  }
}

// ── Recientes (por persona, en este navegador) ─────────────────────────────

const CLAVE_RECIENTES = "vantia.editor.fuentesRecientes";
export function fuentesRecientes(): string[] {
  try { return (JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || "[]") as string[]).slice(0, 8); } catch { return []; }
}
export function anotarReciente(nombre: string) {
  try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify([nombre, ...fuentesRecientes().filter((x) => x !== nombre)].slice(0, 8))); } catch { /* sin almacenamiento */ }
}

// ── Fuentes de este ordenador ──────────────────────────────────────────────

export const puedeLeerFuentesLocales = () => typeof window !== "undefined" && "queryLocalFonts" in window;
export async function fuentesLocales(): Promise<Fuente[]> {
  const datos: { family: string }[] = await (window as any).queryLocalFonts();
  const familias = [...new Set(datos.map((d) => d.family).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return familias.map((n) => ({ n, c: "n" as Categoria, v: "rbix", origen: "local" as const }));
}
