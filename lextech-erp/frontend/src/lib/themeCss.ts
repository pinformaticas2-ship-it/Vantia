// Generador de hojas de estilo de tema para Vantia.
//
// El mecanismo de temas de la app (ver index.css, bloque [data-theme="azul"]) funciona
// sobreescribiendo con !important las clases Tailwind literales (bg-red-600, text-red-700...)
// y los hex de marca hardcodeados (#ab0433...) que aparecen por todo el código. No usa
// variables CSS de forma generalizada, así que un tema nuevo (predefinido o personalizado)
// se genera reproduciendo ese mismo bloque de reglas con los colores de una rampa distinta.
//
// Este módulo centraliza esa plantilla de reglas para que:
//  - las paletas predefinidas nuevas (verde, violeta...) se generen sin copiar/pegar a mano
//  - el selector de color personalizado pueda construir su propio <style> en tiempo real

export interface ColorRamp {
  50: string; 100: string; 200: string; 300: string; 400: string; 500: string;
  600: string; 700: string; 800: string; 900: string; 950: string;
}

// ── Rampas oficiales de Tailwind, para las paletas predefinidas ──
export const TAILWIND_RAMPS: Record<string, ColorRamp> = {
  blue: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
    500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
  },
  emerald: {
    50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399',
    500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22',
  },
  violet: {
    50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa',
    500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
  },
};

// ── Utilidades de color ──────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbTriplet(hex: string): string {
  return hexToRgb(hex).join(', ');
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbSlash(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToHslCss(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return `${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%`;
}

// Lightness aproximada, por escalón, de una rampa Tailwind típica muy saturada
// (blue/emerald/violet siguen esta curva con bastante fidelidad). Se usa para
// derivar el resto de la rampa a partir de un único color elegido por el usuario,
// preservando ESE color exacto como el escalón 600 (el que se usa en botones/acentos).
const REFERENCE_L: Record<keyof ColorRamp, number> = {
  50: 97, 100: 93, 200: 87, 300: 78, 400: 67, 500: 58, 600: 50, 700: 42, 800: 35, 900: 28, 950: 20,
};

/** Genera una rampa de 11 tonos a partir de un único color (tratado como el escalón 600). */
export function rampFromAccent(hex: string): ColorRamp {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const ramp = {} as ColorRamp;
  (Object.keys(REFERENCE_L) as unknown as (keyof ColorRamp)[]).forEach((shade) => {
    const delta = REFERENCE_L[shade] - REFERENCE_L[600];
    const targetL = Math.min(98, Math.max(2, l + delta));
    ramp[shade] = shade === 600 ? hex : hslToHex(h, s, targetL);
  });
  return ramp;
}

/** Tono muy claro (casi blanco) con matiz del acento — para fondos degradados sutiles. */
function veryLightTint(hex: string, lightness: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  return hslToHex(h, Math.min(s, 60), lightness);
}

// ── Plantilla de reglas (mismo alcance que el bloque manual [data-theme="azul"]) ──

export function buildThemeCss(themeId: string, ramp: ColorRamp): string {
  const t = `[data-theme="${themeId}"]`;
  const hsl600 = hexToHslCss(ramp[600]);
  const bgTint1 = veryLightTint(ramp[600], 97);
  const bgTint2 = veryLightTint(ramp[600], 95);

  return `
/* ═══ TEMA ${themeId.toUpperCase()} — generado por themeCss.ts ═══ */
${t} {
  --primary: ${hsl600};
  --ring: ${hsl600};
  --accent: ${hsl600};
  --destructive: ${hsl600};
  --accent-from: ${ramp[500]};
  --accent-to: ${ramp[600]};
  --accent-glow: ${rgbTriplet(ramp[600])};
}
${t} input:focus, ${t} textarea:focus, ${t} select:focus {
  box-shadow: 0 0 0 4px ${rgba(ramp[600], 0.08)} !important;
}
${t} .bg-red-50  { background-color: ${ramp[50]} !important; }
${t} .bg-red-100 { background-color: ${ramp[100]} !important; }
${t} .bg-red-200 { background-color: ${ramp[200]} !important; }
${t} .bg-red-300 { background-color: ${ramp[300]} !important; }
${t} .bg-red-400 { background-color: ${ramp[400]} !important; }
${t} .bg-red-500 { background-color: ${ramp[500]} !important; }
${t} .bg-red-600 { background-color: ${ramp[600]} !important; }
${t} .bg-red-700 { background-color: ${ramp[700]} !important; }
${t} .bg-red-800 { background-color: ${ramp[800]} !important; }
${t} .bg-red-900 { background-color: ${ramp[900]} !important; }
${t} .bg-red-500\\/10 { background-color: ${rgbSlash(ramp[500], 0.1)} !important; }
${t} .bg-red-500\\/20 { background-color: ${rgbSlash(ramp[500], 0.2)} !important; }
${t} .bg-red-600\\/10 { background-color: ${rgbSlash(ramp[600], 0.1)} !important; }
${t} .bg-red-600\\/20 { background-color: ${rgbSlash(ramp[600], 0.2)} !important; }
${t} .text-red-100 { color: ${ramp[100]} !important; }
${t} .text-red-200 { color: ${ramp[200]} !important; }
${t} .text-red-300 { color: ${ramp[300]} !important; }
${t} .text-red-400 { color: ${ramp[400]} !important; }
${t} .text-red-500 { color: ${ramp[500]} !important; }
${t} .text-red-600 { color: ${ramp[600]} !important; }
${t} .text-red-700 { color: ${ramp[700]} !important; }
${t} .text-red-800 { color: ${ramp[800]} !important; }
${t} .border-red-100 { border-color: ${ramp[100]} !important; }
${t} .border-red-200 { border-color: ${ramp[200]} !important; }
${t} .border-red-300 { border-color: ${ramp[300]} !important; }
${t} .border-red-400 { border-color: ${ramp[400]} !important; }
${t} .border-red-500 { border-color: ${ramp[500]} !important; }
${t} .border-red-600 { border-color: ${ramp[600]} !important; }
${t} .border-red-700 { border-color: ${ramp[700]} !important; }
${t} .hover\\:bg-red-50:hover  { background-color: ${ramp[50]} !important; }
${t} .hover\\:bg-red-100:hover { background-color: ${ramp[100]} !important; }
${t} .hover\\:bg-red-200:hover { background-color: ${ramp[200]} !important; }
${t} .hover\\:bg-red-500:hover { background-color: ${ramp[500]} !important; }
${t} .hover\\:bg-red-600:hover { background-color: ${ramp[600]} !important; }
${t} .hover\\:bg-red-700:hover { background-color: ${ramp[800]} !important; }
${t} .hover\\:text-red-400:hover { color: ${ramp[400]} !important; }
${t} .hover\\:text-red-500:hover { color: ${ramp[500]} !important; }
${t} .hover\\:text-red-600:hover { color: ${ramp[600]} !important; }
${t} .hover\\:text-red-700:hover { color: ${ramp[700]} !important; }
${t} .hover\\:border-red-100:hover { border-color: ${ramp[100]} !important; }
${t} .hover\\:border-red-200:hover { border-color: ${ramp[200]} !important; }
${t} .hover\\:border-red-300:hover { border-color: ${ramp[300]} !important; }
${t} .hover\\:border-red-400:hover { border-color: ${ramp[400]} !important; }
${t} .hover\\:border-red-500:hover { border-color: ${ramp[500]} !important; }
${t} .focus\\:ring-red-400:focus { --tw-ring-color: ${rgba(ramp[400], 0.5)} !important; }
${t} .focus\\:ring-red-500:focus { --tw-ring-color: ${rgba(ramp[500], 0.5)} !important; }
${t} .focus\\:border-red-400:focus { border-color: ${ramp[400]} !important; }
${t} .focus\\:border-red-500:focus { border-color: ${ramp[500]} !important; }
${t} .ring-red-400 { --tw-ring-color: ${rgba(ramp[400], 0.5)} !important; }
${t} .ring-red-500 { --tw-ring-color: ${rgba(ramp[500], 0.5)} !important; }
${t} .from-red-300 { --tw-gradient-from: ${ramp[300]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[300], 0)}) !important; }
${t} .from-red-400 { --tw-gradient-from: ${ramp[400]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[400], 0)}) !important; }
${t} .from-red-500 { --tw-gradient-from: ${ramp[500]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[500], 0)}) !important; }
${t} .from-red-600 { --tw-gradient-from: ${ramp[600]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[600], 0)}) !important; }
${t} .from-red-700 { --tw-gradient-from: ${ramp[700]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[700], 0)}) !important; }
${t} .from-red-800 { --tw-gradient-from: ${ramp[800]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[800], 0)}) !important; }
${t} .to-red-400   { --tw-gradient-to: ${ramp[400]} !important; }
${t} .to-red-500   { --tw-gradient-to: ${ramp[500]} !important; }
${t} .to-red-600   { --tw-gradient-to: ${ramp[600]} !important; }
${t} .to-red-700   { --tw-gradient-to: ${ramp[700]} !important; }
${t} .to-red-800   { --tw-gradient-to: ${ramp[800]} !important; }
${t} .to-red-900   { --tw-gradient-to: ${ramp[900]} !important; }
${t} .via-red-600  { --tw-gradient-via: ${ramp[600]} !important; }
${t} .via-red-700  { --tw-gradient-via: ${ramp[700]} !important; }
${t} .border-t-red-400 { border-top-color: ${ramp[400]} !important; }
${t} .border-t-red-500 { border-top-color: ${ramp[500]} !important; }
${t} .border-t-red-600 { border-top-color: ${ramp[600]} !important; }
${t} .border-t-red-700 { border-top-color: ${ramp[700]} !important; }
${t} .border-b-red-200 { border-bottom-color: ${ramp[200]} !important; }
${t} .border-b-red-500 { border-bottom-color: ${ramp[500]} !important; }
${t} .border-b-red-600 { border-bottom-color: ${ramp[600]} !important; }
${t} .border-l-red-300 { border-left-color: ${ramp[300]} !important; }
${t} .border-l-red-400 { border-left-color: ${ramp[400]} !important; }
${t} .border-l-red-500 { border-left-color: ${ramp[500]} !important; }
${t} .border-r-red-200 { border-right-color: ${ramp[200]} !important; }
${t} .shadow-red-100  { --tw-shadow-color: ${ramp[100]} !important; }
${t} .shadow-red-200  { --tw-shadow-color: ${ramp[200]} !important; }
${t} .shadow-red-300  { --tw-shadow-color: ${ramp[300]} !important; }
${t} .shadow-red-500\\/20 { --tw-shadow-color: ${rgba(ramp[500], 0.2)} !important; }
${t} .shadow-red-700\\/30 { --tw-shadow-color: ${rgba(ramp[700], 0.3)} !important; }
${t} .shadow-red-700\\/50 { --tw-shadow-color: ${rgba(ramp[700], 0.5)} !important; }
${t} .shadow-\\[0_0_6px_rgba\\(239\\,68\\,68\\,0\\.7\\)\\] { box-shadow: 0 0 6px ${rgba(ramp[600], 0.7)} !important; }
${t} .modules-scrollbar::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, ${rgba(ramp[600], 0.32)}, ${rgba(ramp[700], 0.75)});
  background-clip: padding-box;
}
${t} .erp-shell { background: linear-gradient(180deg, ${bgTint1} 0%, ${bgTint2} 58%, ${bgTint1} 100%); }
${t} .agenda-google-topbar .bg-red-600 { background: ${ramp[600]} !important; border-color: ${ramp[600]} !important; }
${t} .agenda-google-topbar .bg-red-50 { background: ${ramp[50]} !important; border-color: ${ramp[200]} !important; color: ${ramp[600]} !important; }
${t} .agenda-google-topbar > div:first-child > div:first-child {
  background: ${rgba(ramp[600], 0.06)} !important;
  border-color: ${rgba(ramp[600], 0.12)} !important;
  box-shadow: 0 10px 30px ${rgba(ramp[600], 0.08)} !important;
}
${t} .agenda-google-topbar > div:first-child > div:first-child svg { color: ${ramp[600]} !important; }
${t} .erp-sidebar { background-color: #ffffff !important; border-right-color: #e2e8f0 !important; }
${t} .erp-sidebar-logo-border { border-bottom-color: #e2e8f0 !important; }
${t} .erp-sidebar-group-label { color: #94a3b8 !important; }
${t} .erp-sidebar-divider { background-color: #e2e8f0 !important; }
${t} .erp-sidebar-nav-inactive { color: #475569 !important; border-color: transparent !important; }
${t} .erp-sidebar-nav-inactive:hover { background-color: ${ramp[50]} !important; color: ${ramp[700]} !important; }
${t} .erp-sidebar-nav-active { background-color: ${ramp[50]} !important; color: ${ramp[700]} !important; border-color: ${ramp[600]} !important; }
${t} .erp-sidebar-icon-active { color: ${ramp[600]} !important; }
${t} .erp-sidebar-icon-inactive { color: #94a3b8 !important; }
${t} .erp-sidebar-badge { background-color: ${ramp[600]} !important; }
${t} .erp-sidebar-badge-dot { background-color: ${ramp[500]} !important; --tw-ring-color: #ffffff !important; }
${t} .erp-sidebar-collapse { color: #94a3b8 !important; }
${t} .erp-sidebar-collapse:hover { background-color: #f1f5f9 !important; color: #475569 !important; }
${t} .erp-sidebar-user { background-color: #f8fafc !important; border-color: #e2e8f0 !important; }
${t} .erp-sidebar-user:hover { background-color: #f1f5f9 !important; }
${t} .erp-sidebar-username { color: #1e293b !important; }
${t} .erp-sidebar-active-dot { background-color: ${ramp[600]} !important; }
${t} .erp-company-btn { background-color: #f8fafc !important; border-color: #e2e8f0 !important; }
${t} .erp-company-btn:hover { background-color: ${ramp[50]} !important; border-color: ${ramp[200]} !important; }
${t} .erp-company-logo { background-color: #ffffff !important; border-color: #e2e8f0 !important; }
${t} .erp-company-icon { background-color: #f1f5f9 !important; border-color: #e2e8f0 !important; }
${t} .erp-company-icon:hover { background-color: ${ramp[50]} !important; }
${t} .erp-company-name { color: #1e293b !important; }
${t} .erp-company-sub  { color: #94a3b8 !important; }
${t} .erp-company-chevron { color: #cbd5e1 !important; }
${t} .erp-sidebar .bg-emerald-900\\/20 { background-color: rgb(236 253 245 / 0.8) !important; }
${t} .erp-sidebar .border-emerald-800\\/30 { border-color: rgb(167 243 208 / 0.6) !important; }
${t} .bg-\\[\\#ab0433\\]       { background-color: ${ramp[600]} !important; }
${t} .bg-\\[\\#92042c\\]       { background-color: ${ramp[700]} !important; }
${t} .bg-\\[\\#8f022a\\]       { background-color: ${ramp[700]} !important; }
${t} .text-\\[\\#ab0433\\]     { color: ${ramp[600]} !important; }
${t} .border-\\[\\#ab0433\\]   { border-color: ${ramp[600]} !important; }
${t} .hover\\:bg-\\[\\#92042c\\]:hover { background-color: ${ramp[700]} !important; }
${t} .hover\\:bg-\\[\\#8f022a\\]:hover { background-color: ${ramp[800]} !important; }
${t} .focus\\:ring-\\[\\#ab0433\\]\\/20:focus { --tw-ring-color: ${rgba(ramp[600], 0.2)} !important; }
${t} .focus\\:border-\\[\\#ab0433\\]\\/30:focus { border-color: ${rgba(ramp[600], 0.3)} !important; }
${t} .hover\\:text-\\[\\#ab0433\\]:hover { color: ${ramp[600]} !important; }
${t} .bg-\\[\\#ab0433\\]\\/20      { background-color: ${rgba(ramp[600], 0.2)} !important; }
${t} .bg-\\[\\#ab0433\\]\\/\\[0\\.06\\] { background-color: ${rgba(ramp[600], 0.06)} !important; }
${t} .shadow-red-950\\/40 { --tw-shadow-color: ${rgba(ramp[950], 0.4)} !important; }
${t} .focus\\:ring-red-500\\/20:focus { --tw-ring-color: ${rgba(ramp[500], 0.2)} !important; }
${t} .from-\\[\\#ab0433\\] { --tw-gradient-from: ${ramp[600]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[600], 0)}) !important; }
${t} .to-\\[\\#cc184e\\]   { --tw-gradient-to: ${ramp[500]} !important; }
${t} .hover\\:from-\\[\\#c01040\\]:hover { --tw-gradient-from: ${ramp[700]} !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, ${rgbSlash(ramp[700], 0)}) !important; }
${t} .hover\\:to-\\[\\#ab0433\\]:hover { --tw-gradient-to: ${ramp[600]} !important; }
${t} .bg-\\[\\#f4f6f8\\] { background-color: ${bgTint1} !important; }
${t} .erp-orb-top-right, ${t} .erp-orb-bottom-left {
  background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.8), ${rgba(ramp[600], 0.06)});
}
${t} .erp-panel-bottom-right { border-color: ${rgba(ramp[600], 0.08)}; }
`.trim();
}
