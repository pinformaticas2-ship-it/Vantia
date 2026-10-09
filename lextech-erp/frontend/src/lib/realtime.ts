import { useEffect, useState } from "react";
import { resolveApiUrl } from "./api";

// Conexión de eventos en tiempo real del servidor (SSE), UNA para toda la app.
// El servidor avisa cuando algo cambia (p.ej. { type: 'chat', kind, canalId },
// ver backend utils/chatRealtime.ts) y cada pantalla vuelve a pedir lo que
// necesite. Si la conexión se corta (o caduca el token), se reabre sola con
// un token nuevo; mientras tanto, las pantallas siguen con su sondeo de respaldo.

type Handler = (data: any) => void;
const handlers = new Set<Handler>();
const oyentesEstado = new Set<(conectado: boolean) => void>();
let es: EventSource | null = null;
let conectado = false;
let getTokenFn: (() => Promise<string | null>) | null = null;
let reintento: number | null = null;
let iniciado = false;

function ponerEstado(v: boolean) {
  if (conectado === v) return;
  conectado = v;
  oyentesEstado.forEach((f) => f(v));
}

function programarReintento(ms = 5000) {
  if (reintento) return;
  reintento = window.setTimeout(() => { reintento = null; void abrir(); }, ms);
}

async function abrir() {
  if (!getTokenFn) return;
  let token: string | null = null;
  try { token = await getTokenFn(); } catch { /* sin sesión */ }
  if (!token) { programarReintento(10_000); return; }
  try { es?.close(); } catch { /* ya cerrada */ }
  es = new EventSource(resolveApiUrl(`/api/email/events?token=${encodeURIComponent(token)}`));
  es.onmessage = (e) => {
    let data: any;
    try { data = JSON.parse(e.data); } catch { return; }
    if (data?.type === "connected") ponerEstado(true);
    handlers.forEach((h) => { try { h(data); } catch { /* un oyente no rompe a los demás */ } });
  };
  es.onerror = () => {
    ponerEstado(false);
    try { es?.close(); } catch { /* ya cerrada */ }
    es = null;
    programarReintento();
  };
}

/** Arranca la conexión (idempotente). Se llama una vez con el getToken de Clerk. */
export function iniciarTiempoReal(getToken: () => Promise<string | null>) {
  getTokenFn = getToken;
  if (iniciado) return;
  iniciado = true;
  void abrir();
  // Al volver a la pestaña, si se había caído, reconectar ya.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !es) { if (reintento) { clearTimeout(reintento); reintento = null; } void abrir(); }
  });
}

export function suscribirTiempoReal(h: Handler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}

/** ¿Está llegando el tiempo real? (para espaciar el sondeo de respaldo). */
export function useTiempoRealConectado(): boolean {
  const [v, setV] = useState(conectado);
  useEffect(() => {
    oyentesEstado.add(setV);
    setV(conectado);
    return () => { oyentesEstado.delete(setV); };
  }, []);
  return v;
}
