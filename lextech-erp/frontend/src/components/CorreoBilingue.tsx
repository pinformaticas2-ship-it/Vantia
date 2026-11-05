import { useEffect, useState, type RefObject } from "react";
import { Globe2, Loader2, Check } from "lucide-react";
import { apiFetch } from "../lib/api";

// Aviso del redactor de Correo: si algún destinatario es un cliente que
// prefiere otro idioma (ficha del cliente → Idioma de comunicación), ofrece
// convertir el correo en bilingüe -- el texto en español arriba y debajo su
// traducción; la firma se queda al final, sin traducir.

type Destinatario = { email: string; nombre: string; idioma: string; idiomaNombre: string; idiomaNativo?: string };

// Separador que el redactor pone antes de la firma (ver insertSignature).
const MARCA_FIRMA = '<hr style="border:none;border-top:1px solid #e5e7eb';

export function CorreoBilingue({ destinatarios, getToken, bodyRef, subject, setSubject }: {
  destinatarios: string;
  getToken: () => Promise<string | null>;
  bodyRef: RefObject<HTMLDivElement>;
  subject: string;
  setSubject: (s: string) => void;
}) {
  const [clientes, setClientes] = useState<Destinatario[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [estado, setEstado] = useState<"" | "traduciendo" | "hecho">("");
  const [error, setError] = useState("");

  // Consulta (con pausa) cada vez que cambian los destinatarios.
  useEffect(() => {
    const emails = destinatarios.match(/[^\s,;<>"]+@[^\s,;<>"]+/g) || [];
    if (!emails.length) { setClientes([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/email/idiomas-destinatarios?emails=${encodeURIComponent(emails.join(","))}`, { getToken: getToken as any });
        if (r?.success) { setClientes(r.data || []); setDisponible(r.traduccionDisponible !== false); }
      } catch { /* sin aviso: el correo se puede mandar igual */ }
    }, 500);
    return () => clearTimeout(t);
  }, [destinatarios, getToken]);

  if (!clientes.length) return null;
  // Si hay varios idiomas se usa el del primero; se avisa de los demás.
  const idioma = clientes[0].idioma;
  const idiomaNombre = clientes[0].idiomaNombre;
  const idiomaNativo = clientes[0].idiomaNativo || idiomaNombre;
  const otros = clientes.filter((c) => c.idioma !== idioma);

  const hacerBilingue = async () => {
    const el = bodyRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const corte = html.indexOf(MARCA_FIRMA);
    let cuerpo = corte >= 0 ? html.slice(0, corte) : html;
    const firma = corte >= 0 ? html.slice(corte) : "";
    // Los <br> que separan el texto de la firma se quedan con la firma.
    const colaBr = cuerpo.match(/(?:<br\s*\/?>\s*)+$/i)?.[0] || "";
    cuerpo = cuerpo.slice(0, cuerpo.length - colaBr.length);
    if (!cuerpo.replace(/<[^>]+>/g, "").trim()) { setError("Escribe primero el correo en español."); return; }
    setEstado("traduciendo"); setError("");
    try {
      const pedir = (texto: string, esHtml: boolean) =>
        apiFetch("/api/email/traducir", { getToken: getToken as any, method: "POST", body: JSON.stringify({ texto, idioma, html: esHtml }) });
      const [rc, ra] = await Promise.all([pedir(cuerpo, true), subject.trim() ? pedir(subject, false) : Promise.resolve(null)]);
      if (!rc?.success) throw new Error(rc?.error || "No se pudo traducir.");
      el.innerHTML = `<div lang="es">${cuerpo}</div>`
        + `<hr style="border:none;border-top:1px dashed #cbd5e1;margin:20px 0 10px"/>`
        + `<p style="font-size:11px;color:#94a3b8;margin:0 0 8px;letter-spacing:.06em">${idiomaNativo.toUpperCase()}</p>`
        + `<div lang="${idioma}"${idioma === "ar" ? ' dir="rtl"' : ""}>${rc.data.traduccion}</div>`
        + colaBr + firma;
      if (ra?.success && ra.data?.traduccion) setSubject(`${subject.trim()} / ${ra.data.traduccion}`);
      setEstado("hecho");
    } catch (e: any) {
      setError(e?.message || "No se pudo traducir.");
      setEstado("");
    }
  };

  const nombres = clientes.filter((c) => c.idioma === idioma).map((c) => c.nombre).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sky-100 bg-sky-50/70 px-4 py-2 text-xs text-sky-900">
      <Globe2 size={14} className="shrink-0 text-sky-600" />
      <span className="min-w-0 flex-1">
        <strong>{nombres}</strong> prefiere que se le escriba en <strong>{idiomaNombre}</strong>.
        {otros.length > 0 && <> ({otros.map((o) => `${o.nombre}: ${o.idiomaNombre}`).join(", ")} — se traduce solo al {idiomaNombre}.)</>}
        {error && <span className="ml-1 text-red-700">{error}</span>}
        {!disponible && <span className="ml-1 text-slate-500">La traducción automática no está configurada.</span>}
      </span>
      {estado === "hecho" ? (
        <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-semibold text-emerald-700"><Check size={13} /> Correo bilingüe</span>
      ) : (
        <button type="button" disabled={estado === "traduciendo" || !disponible} onClick={() => void hacerBilingue()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
          {estado === "traduciendo" ? <><Loader2 size={13} className="animate-spin" /> Traduciendo…</> : <>Hacer bilingüe (español + {idiomaNombre})</>}
        </button>
      )}
    </div>
  );
}
