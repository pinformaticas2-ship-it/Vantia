import { useEffect, useState, type RefObject } from "react";
import { Globe2, Loader2, Check, Undo2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { IDIOMAS, nombreEspanol } from "../lib/idiomas";

// Barra de traducción del redactor de Correo. Escribes en tu idioma, eliges
// a cuál traducirlo y pulsas «Traducir»: el mensaje (y el asunto) se cambian
// por la traducción para que la revises antes de enviarlo. Opcionalmente se
// conserva también el original debajo (correo bilingüe). La firma no se toca.
// Si algún destinatario es un cliente con otro idioma en su ficha, ese idioma
// sale ya elegido.

type Destinatario = { email: string; nombre: string; idioma: string; idiomaNombre: string; idiomaNativo?: string };

// Separador que el redactor pone antes de la firma (ver insertSignature).
const MARCA_FIRMA = '<hr style="border:none;border-top:1px solid #e5e7eb';
const CLAVE_IDIOMA = "vantia.correo.idiomaEnvio";

export function CorreoBilingue({ destinatarios, getToken, bodyRef, subject, setSubject }: {
  destinatarios: string;
  getToken: () => Promise<string | null>;
  bodyRef: RefObject<HTMLDivElement>;
  subject: string;
  setSubject: (s: string) => void;
}) {
  const [clientes, setClientes] = useState<Destinatario[]>([]);
  const [idioma, setIdioma] = useState<string>(() => {
    try { return localStorage.getItem(CLAVE_IDIOMA) || "en"; } catch { return "en"; }
  });
  const [elegidoAMano, setElegidoAMano] = useState(false);
  const [mantenerOriginal, setMantenerOriginal] = useState(false);
  const [estado, setEstado] = useState<"" | "traduciendo" | "hecho">("");
  const [error, setError] = useState("");
  const [deshacer, setDeshacer] = useState<{ html: string; asunto: string; idioma: string } | null>(null);

  // ¿Algún destinatario es un cliente con otro idioma en su ficha?
  useEffect(() => {
    const emails = destinatarios.match(/[^\s,;<>"]+@[^\s,;<>"]+/g) || [];
    if (!emails.length) { setClientes([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/email/idiomas-destinatarios?emails=${encodeURIComponent(emails.join(","))}`, { getToken: getToken as any });
        if (r?.success) setClientes(r.data || []);
      } catch { /* sin sugerencia: se puede traducir igual */ }
    }, 500);
    return () => clearTimeout(t);
  }, [destinatarios, getToken]);

  // Si el cliente tiene idioma en su ficha, se propone (salvo que ya se haya elegido otro a mano).
  useEffect(() => {
    if (!elegidoAMano && clientes[0]?.idioma) setIdioma(clientes[0].idioma);
  }, [clientes, elegidoAMano]);

  const elegir = (codigo: string) => {
    setIdioma(codigo); setElegidoAMano(true); setError("");
    try { localStorage.setItem(CLAVE_IDIOMA, codigo); } catch { /* sin almacenamiento */ }
  };

  const traducir = async () => {
    const el = bodyRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const corte = html.indexOf(MARCA_FIRMA);
    let cuerpo = corte >= 0 ? html.slice(0, corte) : html;
    const firma = corte >= 0 ? html.slice(corte) : "";
    // Los <br> que separan el texto de la firma se quedan con la firma.
    const colaBr = cuerpo.match(/(?:<br\s*\/?>\s*)+$/i)?.[0] || "";
    cuerpo = cuerpo.slice(0, cuerpo.length - colaBr.length);
    if (!cuerpo.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()) { setError("Escribe primero el mensaje."); return; }
    setEstado("traduciendo"); setError("");
    try {
      const pedir = (texto: string, esHtml: boolean) =>
        apiFetch("/api/email/traducir", { getToken: getToken as any, method: "POST", body: JSON.stringify({ texto, idioma, html: esHtml }) });
      const [rc, ra] = await Promise.all([pedir(cuerpo, true), subject.trim() ? pedir(subject, false) : Promise.resolve(null)]);
      if (!rc?.success) throw new Error(rc?.error || "No se pudo traducir.");
      const traducido = `<div lang="${idioma}"${idioma === "ar" ? ' dir="rtl"' : ""}>${rc.data.traduccion}</div>`;
      setDeshacer({ html, asunto: subject, idioma });
      el.innerHTML = mantenerOriginal
        ? traducido
          + `<hr style="border:none;border-top:1px dashed #cbd5e1;margin:20px 0 10px"/>`
          + `<p style="font-size:11px;color:#94a3b8;margin:0 0 8px;letter-spacing:.06em">ORIGINAL</p>`
          + `<div>${cuerpo}</div>`
          + colaBr + firma
        : traducido + colaBr + firma;
      const asuntoT = ra?.success ? String(ra.data?.traduccion || "").trim() : "";
      if (asuntoT) setSubject(mantenerOriginal ? `${asuntoT} / ${subject.trim()}` : asuntoT);
      setEstado("hecho");
    } catch (e: any) {
      setError(e?.message || "No se pudo traducir.");
      setEstado("");
    }
  };

  const volverAlOriginal = () => {
    if (!deshacer || !bodyRef.current) return;
    bodyRef.current.innerHTML = deshacer.html;
    setSubject(deshacer.asunto);
    setDeshacer(null);
    setEstado("");
  };

  const sugerido = clientes.find((c) => c.idioma === idioma);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-gray-100 bg-sky-50/50 px-4 py-1.5 text-xs text-slate-600">
      <Globe2 size={14} className="shrink-0 text-sky-600" />
      {estado === "hecho" && deshacer ? (
        <>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <Check size={13} /> Traducido al {nombreEspanol(deshacer.idioma)}{mantenerOriginal ? " (con el original debajo)" : ""} — revísalo antes de enviar
          </span>
          <button type="button" onClick={volverAlOriginal}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-500 hover:bg-white">
            <Undo2 size={13} /> Deshacer
          </button>
        </>
      ) : (
        <>
          <span>Traducir mi mensaje al</span>
          <select value={idioma} onChange={(e) => elegir(e.target.value)} disabled={estado === "traduciendo"}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 outline-none">
            {IDIOMAS.map((i) => <option key={i.codigo} value={i.codigo}>{nombreEspanol(i.codigo)}</option>)}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={mantenerOriginal} onChange={(e) => setMantenerOriginal(e.target.checked)} />
            mantener también el original
          </label>
          {sugerido && <span className="text-sky-700">· {sugerido.nombre} prefiere {sugerido.idiomaNombre}</span>}
          <button type="button" disabled={estado === "traduciendo"} onClick={() => void traducir()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {estado === "traduciendo" ? <><Loader2 size={13} className="animate-spin" /> Traduciendo…</> : <>Traducir</>}
          </button>
        </>
      )}
      {error && <span className="w-full text-red-600">{error}</span>}
    </div>
  );
}

