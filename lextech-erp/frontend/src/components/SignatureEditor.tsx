import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Image as ImageIcon, Loader2, Palette, Code2, Upload, X, AlertTriangle } from "lucide-react";
import { resolveApiUrl } from "../lib/api";

// Editor de firmas de correo (Correo → Firmas). Tres formas de hacerla:
//  · Diseñar: logo + texto en dos columnas, colores y fondo (como las firmas
//    corporativas habituales). Se genera HTML con tablas y estilos en línea,
//    que es lo único que respetan Outlook, Gmail, Apple Mail...
//  · Imagen: la firma entera es una imagen (se ve idéntica en todas partes).
//  · Pegar / HTML: pegar una firma copiada de Outlook o de una web, o el código.
// Las imágenes se suben a Vantia (routes/firmaImagenes.ts) para que quien
// recibe el correo pueda verlas.

export interface FirmaDiseno {
  logo: string; anchoLogo: number;
  linea1: string; linea2: string;
  direccion: string; email: string; telefono: string; web: string;
  color: string; fuente: string; fondo: string; separador: boolean; aviso: string;
}
export interface FirmaImagen { src: string; ancho: number; enlace: string; alt: string }
export interface FirmaData { modo: "disenar" | "imagen" | "html"; diseno?: FirmaDiseno; imagen?: FirmaImagen }
export interface SignatureValue { id: string; name: string; html: string; isDefault?: boolean; design?: FirmaData }

const FUENTES: Record<string, string> = {
  Arial: "Arial, Helvetica, sans-serif",
  Calibri: "Calibri, Carlito, Arial, sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
  Georgia: "Georgia, serif",
  "Times New Roman": "'Times New Roman', Times, serif",
};

const DISENO_INICIAL: FirmaDiseno = {
  logo: "", anchoLogo: 180, linea1: "", linea2: "", direccion: "", email: "", telefono: "", web: "",
  color: "#1d5f99", fuente: "Arial", fondo: "", separador: false, aviso: "",
};

const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const urlWeb = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

export function buildFirmaDisenoHtml(d: FirmaDiseno): string {
  const font = FUENTES[d.fuente] || FUENTES.Arial;
  const fondo = d.fondo
    ? ` background="${esc(d.fondo)}" style="border-collapse:collapse;background-color:#ffffff;background-image:url('${esc(d.fondo)}');background-repeat:repeat;font-family:${font}"`
    : ` style="border-collapse:collapse;font-family:${font}"`;
  const lineas: string[] = [];
  if (d.linea1) lineas.push(`<span style="color:${d.color};font-weight:bold;font-size:15px">${esc(d.linea1)}</span>`);
  if (d.linea2) lineas.push(`<span style="color:#111111;font-weight:bold;font-size:15px">${esc(d.linea2)}</span>`);
  const datos: string[] = [];
  d.direccion.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => datos.push(esc(l)));
  if (d.email) datos.push(`<a href="mailto:${esc(d.email)}" style="color:#222222;text-decoration:none">${esc(d.email)}</a>`);
  if (d.telefono) datos.push(esc(d.telefono));
  if (d.web) datos.push(`<a href="${esc(urlWeb(d.web))}" style="color:#111111;font-weight:bold;text-decoration:none">${esc(d.web)}</a>`);
  const texto = [lineas.join("<br>"), datos.join("<br>")].filter(Boolean).join(`<br><span style="font-size:8px;line-height:8px">&nbsp;</span><br>`);
  const logo = d.logo
    ? `<td style="padding:18px 28px 18px 18px;vertical-align:middle${d.separador ? `;border-right:2px solid ${d.color}` : ""}"><img src="${esc(d.logo)}" width="${d.anchoLogo}" alt="${esc(d.linea2 || "Logo")}" style="display:block;border:0;outline:none;width:${d.anchoLogo}px;max-width:${d.anchoLogo}px;height:auto"></td>`
    : "";
  const aviso = d.aviso.trim()
    ? `<tr><td colspan="${d.logo ? 2 : 1}" style="padding:8px 18px 4px 18px;font-size:10px;line-height:1.35;color:#8a8a8a;font-family:${font}">${esc(d.aviso.trim()).replace(/\r?\n/g, "<br>")}</td></tr>`
    : "";
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation"${fondo}><tr>${logo}<td style="padding:18px ${d.logo ? "24px" : "18px"} 18px ${d.logo ? "12px" : "18px"};vertical-align:middle;font-size:14px;line-height:1.5;color:#222222;font-family:${font}">${texto}</td></tr>${aviso}</table>`;
}

export function buildFirmaImagenHtml(i: FirmaImagen): string {
  if (!i.src) return "";
  const img = `<img src="${esc(i.src)}" width="${i.ancho}" alt="${esc(i.alt || "Firma")}" style="display:block;border:0;outline:none;width:${i.ancho}px;max-width:100%;height:auto">`;
  return i.enlace ? `<a href="${esc(urlWeb(i.enlace))}" style="text-decoration:none">${img}</a>` : img;
}

// ── Subida de imágenes ──────────────────────────────────────────────────────

/** Reduce imágenes muy grandes (fotos del móvil...) antes de subirlas. */
async function prepararImagen(blob: Blob): Promise<Blob> {
  if (!/^image\/(png|jpeg)$/.test(blob.type) || blob.size < 800 * 1024) return blob;
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1400 / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || blob), blob.type, 0.88));
}

function urlAbsoluta(p: string) {
  const r = resolveApiUrl(p);
  return /^https?:\/\//i.test(r) ? r : `${window.location.origin}${r}`;
}

export function useFirmaUpload() {
  const { getToken } = useAuth();
  return async (input: Blob): Promise<string> => {
    let blob = input;
    if (!["image/png", "image/jpeg", "image/gif"].includes(blob.type)) {
      // WebP, SVG...: se convierte a PNG (Outlook no muestra WebP).
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo convertir la imagen"))), "image/png"));
    }
    blob = await prepararImagen(blob);
    const token = await getToken();
    const res = await fetch("/api/firma-imagenes", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type }, body: blob });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) throw new Error(j?.error || "No se pudo subir la imagen");
    return urlAbsoluta(j.data.path);
  };
}

/** Imágenes de una firma que nadie más podrá ver: rutas de tu ordenador
 *  (Firma_archivos/image001.png, file:, cid: de Outlook...). Incluye fondos. */
export function imagenesNoAccesibles(html: string): string[] {
  const srcs = new Set<string>();
  const ok = (s: string) => /^(https?:|data:image\/)/i.test(s.trim());
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi)) if (!ok(m[2])) srcs.add(m[2]);
  for (const m of html.matchAll(/\bbackground\s*=\s*(["'])(.*?)\1/gi)) if (m[2] && !ok(m[2])) srcs.add(m[2]);
  for (const m of html.matchAll(/url\(\s*(?:&quot;|["'])?([^"')&]+)(?:&quot;|["'])?\s*\)/gi)) if (!ok(m[1])) srcs.add(m[1]);
  return Array.from(srcs).filter(Boolean);
}

/** Lista de imágenes rotas con botón para subir cada una (o quitarla). */
export function ImagenesNoAccesibles({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const subir = useFirmaUpload();
  const rotas = imagenesNoAccesibles(html);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const objetivo = useRef<string>("");
  if (!rotas.length) return null;
  const reemplazar = (src: string, nuevo: string) => onChange(html.split(src).join(nuevo));
  const quitar = (src: string) => {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
    const root = doc.getElementById("r")!;
    root.querySelectorAll("img").forEach((img) => { if (img.getAttribute("src") === src) img.remove(); });
    onChange(root.innerHTML.split(src).join(""));
  };
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> {rotas.length === 1 ? "Hay una imagen" : `Hay ${rotas.length} imágenes`} que solo existe{rotas.length === 1 ? "" : "n"} en tu ordenador</p>
      <p className="mb-2 text-amber-800">Vienen de la firma de Outlook o de una carpeta local: ni Vantia ni quien reciba el correo pueden verlas. Sube el archivo de cada una para que se vea en todas partes.</p>
      <ul className="space-y-1">
        {rotas.map((src) => (
          <li key={src} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={src}>{decodeURIComponent(src.split(/[\\/]/).pop() || src)}</span>
            <button type="button" disabled={!!subiendo} onClick={() => { objetivo.current = src; inputRef.current?.click(); }}
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100 disabled:opacity-50">
              {subiendo === src ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Subir imagen
            </button>
            <button type="button" onClick={() => quitar(src)} className="text-amber-700 hover:text-red-600">Quitar</button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-red-600">{error}</p>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          const src = objetivo.current;
          if (!f || !src) return;
          setSubiendo(src); setError("");
          try { reemplazar(src, await subir(f)); } catch (err: any) { setError(err?.message || "No se pudo subir"); } finally { setSubiendo(null); }
        }} />
    </div>
  );
}

/** Sube las imágenes pegadas (data:) y avisa de las que no se podrán ver fuera. */
export async function resolverImagenesPegadas(html: string, subir: (b: Blob) => Promise<string>): Promise<{ html: string; avisos: string[] }> {
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
  const root = doc.getElementById("r")!;
  const avisos: string[] = [];
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:image/")) {
      const blob = await (await fetch(src)).blob();
      img.setAttribute("src", await subir(blob));
    }
  }
  root.querySelectorAll("script,iframe,object,embed,form").forEach((n) => n.remove());
  return { html: root.innerHTML, avisos: Array.from(new Set(avisos)) };
}

// ── Componentes ──────────────────────────────────────────────────────────────

function ImagenInput({ label, value, onChange, ayuda }: { label: string; value: string; onChange: (v: string) => void; ayuda?: string }) {
  const subir = useFirmaUpload();
  const ref = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const elegir = async (f?: File | null) => {
    if (!f) return;
    setSubiendo(true); setError("");
    try { onChange(await subir(f)); } catch (e: any) { setError(e?.message || "Error subiendo"); } finally { setSubiendo(false); }
  };
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {value ? <img src={value} alt="" className="max-h-full max-w-full" /> : <ImageIcon size={16} className="text-gray-300" />}
        </div>
        <button type="button" onClick={() => ref.current?.click()} disabled={subiendo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {subiendo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {value ? "Cambiar" : "Subir imagen"}
        </button>
        {value && <button type="button" onClick={() => onChange("")} className="text-xs text-gray-400 hover:text-red-600">Quitar</button>}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {ayuda && <p className="mt-1 text-[11px] text-gray-400">{ayuda}</p>}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300";

export default function SignatureEditor({ initial, onSave, onCancel }: {
  initial: SignatureValue;
  onSave: (s: SignatureValue) => void | Promise<void>;
  onCancel: () => void;
}) {
  const subir = useFirmaUpload();
  const [name, setName] = useState(initial.name);
  // Firmas antiguas (solo HTML) se abren en "Pegar / HTML".
  const [modo, setModo] = useState<FirmaData["modo"]>(initial.design?.modo || (initial.html ? "html" : "disenar"));
  const [diseno, setDiseno] = useState<FirmaDiseno>({ ...DISENO_INICIAL, ...(initial.design?.diseno || {}) });
  const [imagen, setImagen] = useState<FirmaImagen>({ src: "", ancho: 500, enlace: "", alt: "", ...(initial.design?.imagen || {}) });
  const [html, setHtml] = useState(initial.html || "");
  const [verCodigo, setVerCodigo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const editableRef = useRef<HTMLDivElement>(null);

  // El área de "pegar" se rellena una vez; después manda lo que se escribe.
  useEffect(() => {
    if (modo === "html" && !verCodigo && editableRef.current && editableRef.current.innerHTML !== html) editableRef.current.innerHTML = html;
  }, [modo, verCodigo]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<FirmaDiseno>) => setDiseno((d) => ({ ...d, ...p }));
  const htmlFinal = modo === "disenar" ? buildFirmaDisenoHtml(diseno) : modo === "imagen" ? buildFirmaImagenHtml(imagen) : html;

  const guardar = async () => {
    setGuardando(true); setAvisos([]);
    try {
      let out = htmlFinal;
      if (modo === "html") {
        const r = await resolverImagenesPegadas(html, subir);
        out = r.html; setHtml(r.html);
        if (editableRef.current) editableRef.current.innerHTML = r.html;
        if (r.avisos.length) { setAvisos(r.avisos); return; }
        if (imagenesNoAccesibles(r.html).length) { setAvisos(["Sube o quita las imágenes marcadas en amarillo antes de guardar."]); return; }
      }
      await onSave({ ...initial, name, html: out, design: { modo, ...(modo === "disenar" ? { diseno } : {}), ...(modo === "imagen" ? { imagen } : {}) } });
    } catch (e: any) {
      setAvisos([e?.message || "No se pudo guardar"]);
    } finally {
      setGuardando(false);
    }
  };

  const tabs: { id: FirmaData["modo"]; label: string; icon: React.ReactNode }[] = [
    { id: "disenar", label: "Diseñar", icon: <Palette size={14} /> },
    { id: "imagen", label: "Imagen", icon: <ImageIcon size={14} /> },
    { id: "html", label: "Pegar / HTML", icon: <Code2 size={14} /> },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Nombre de la firma</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Administración" className={inputCls} />
          </div>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setModo(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 ${modo === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{t.icon}{t.label}</button>
            ))}
          </div>

          {modo === "disenar" && (
            <div className="space-y-3">
              <ImagenInput label="Logo" value={diseno.logo} onChange={(logo) => set({ logo })} ayuda="PNG o JPG. Se coloca a la izquierda." />
              {diseno.logo && (
                <label className="block text-xs text-gray-500">Ancho del logo: {diseno.anchoLogo}px
                  <input type="range" min={60} max={300} value={diseno.anchoLogo} onChange={(e) => set({ anchoLogo: Number(e.target.value) })} className="w-full accent-indigo-600" />
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input value={diseno.linea1} onChange={(e) => set({ linea1: e.target.value })} placeholder="Cargo / departamento" className={inputCls} />
                <input value={diseno.linea2} onChange={(e) => set({ linea2: e.target.value })} placeholder="Nombre o despacho" className={inputCls} />
              </div>
              <textarea value={diseno.direccion} onChange={(e) => set({ direccion: e.target.value })} rows={2} placeholder="Dirección (una o varias líneas)" className={`${inputCls} resize-none`} />
              <div className="grid grid-cols-2 gap-2">
                <input value={diseno.email} onChange={(e) => set({ email: e.target.value })} placeholder="Correo" className={inputCls} />
                <input value={diseno.telefono} onChange={(e) => set({ telefono: e.target.value })} placeholder="Tel./Fax: …" className={inputCls} />
              </div>
              <input value={diseno.web} onChange={(e) => set({ web: e.target.value })} placeholder="www.tudespacho.es" className={inputCls} />
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1.5">Color <input type="color" value={diseno.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-gray-200" /></label>
                <label className="flex items-center gap-1.5">Letra
                  <select value={diseno.fuente} onChange={(e) => set({ fuente: e.target.value })} className="rounded border border-gray-200 px-2 py-1">
                    {Object.keys(FUENTES).map((f) => <option key={f}>{f}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={diseno.separador} onChange={(e) => set({ separador: e.target.checked })} className="accent-indigo-600" /> Línea entre logo y texto</label>
              </div>
              <ImagenInput label="Fondo (opcional, se repite como un mosaico)" value={diseno.fondo} onChange={(fondo) => set({ fondo })}
                ayuda="Una imagen suave, p.ej. el símbolo del logo en tono claro. Outlook de escritorio no muestra fondos: allí sale en blanco." />
              <textarea value={diseno.aviso} onChange={(e) => set({ aviso: e.target.value })} rows={2} placeholder="Aviso legal / confidencialidad (opcional, en letra pequeña)" className={`${inputCls} resize-none text-xs`} />
            </div>
          )}

          {modo === "imagen" && (
            <div className="space-y-3">
              <ImagenInput label="Firma en imagen" value={imagen.src} onChange={(src) => setImagen((i) => ({ ...i, src }))}
                ayuda="Se verá exactamente igual en todos los correos. El texto de la imagen no se puede seleccionar ni pulsar." />
              <label className="block text-xs text-gray-500">Ancho: {imagen.ancho}px
                <input type="range" min={200} max={700} value={imagen.ancho} onChange={(e) => setImagen((i) => ({ ...i, ancho: Number(e.target.value) }))} className="w-full accent-indigo-600" />
              </label>
              <input value={imagen.enlace} onChange={(e) => setImagen((i) => ({ ...i, enlace: e.target.value }))} placeholder="Enlace al pulsarla (opcional), p.ej. www.tudespacho.es" className={inputCls} />
              <input value={imagen.alt} onChange={(e) => setImagen((i) => ({ ...i, alt: e.target.value }))} placeholder="Texto alternativo (si no cargan las imágenes)" className={inputCls} />
            </div>
          )}

          {modo === "html" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{verCodigo ? "Código HTML" : "Pega aquí una firma copiada de Outlook, Gmail o una web"}</p>
                <button type="button" onClick={() => { if (!verCodigo && editableRef.current) setHtml(editableRef.current.innerHTML); setVerCodigo(!verCodigo); }}
                  className="text-xs font-medium text-indigo-600 hover:underline">{verCodigo ? "Ver como firma" : "Ver código"}</button>
              </div>
              {verCodigo ? (
                <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={12} className={`${inputCls} resize-none font-mono text-xs`} />
              ) : (
                <div ref={editableRef} contentEditable suppressContentEditableWarning onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
                  className="min-h-[180px] overflow-auto rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              )}
              <ImagenesNoAccesibles html={html} onChange={(h) => { setHtml(h); if (editableRef.current) editableRef.current.innerHTML = h; }} />
              <p className="text-[11px] text-gray-400">Las imágenes pegadas se suben a Vantia al guardar, para que el destinatario las vea.</p>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          <p className="mb-1 text-xs font-medium text-gray-500">Vista previa</p>
          <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white p-4">
            {htmlFinal
              ? <iframe title="Vista previa de la firma" sandbox="" className="h-[340px] w-full"
                  srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333"><p style="margin:0 0 12px">Un cordial saludo,</p>${htmlFinal}</body>`} />
              : <p className="py-16 text-center text-sm text-gray-300">Aquí verás la firma</p>}
          </div>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="mx-6 mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div className="flex-1">{avisos.map((a) => <p key={a}>{a}</p>)}</div>
          <button type="button" onClick={() => setAvisos([])}><X size={13} /></button>
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
        <button onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={() => void guardar()} disabled={!name.trim() || !htmlFinal.trim() || guardando}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
          {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}
