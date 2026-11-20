import { idioma, locale } from "./i18n";

// «hace 5 min», «hace 14h», «hace 2d» en el idioma de la app (20/11/2026).
// Antes cada pantalla lo escribía a mano en español y en inglés salía igual.

type Opciones = {
  /** Texto para menos de un minuto: «ahora mismo» (por defecto), «ahora» o «hace un momento». */
  reciente?: "ahora mismo" | "ahora" | "hace un momento";
  /** «Hace…» con mayúscula (listas donde va al principio de la línea). */
  mayuscula?: boolean;
  /** Separar la unidad: «hace 14 h» en vez de «hace 14h». */
  espacio?: boolean;
};

const RECIENTE_EN: Record<NonNullable<Opciones["reciente"]>, string> = {
  "ahora mismo": "just now", ahora: "now", "hace un momento": "a moment ago",
};

export function haceTiempo(fecha: string | number | Date, o: Opciones = {}): string {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  const en = idioma() === "en";
  const reciente = o.reciente || "ahora mismo";
  let texto: string;
  if (min < 1) texto = en ? RECIENTE_EN[reciente] : reciente;
  else {
    const h = Math.floor(min / 60);
    const [n, u] = min < 60 ? [min, "min"] : h < 24 ? [h, "h"] : [Math.floor(h / 24), "d"];
    const cifra = u === "min" || o.espacio ? `${n} ${u}` : `${n}${u}`;
    texto = en ? `${cifra} ago` : `hace ${cifra}`;
  }
  return o.mayuscula ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Locale para fechas según el idioma de la app (el mismo que usa i18n). */
export const localeApp = locale;
