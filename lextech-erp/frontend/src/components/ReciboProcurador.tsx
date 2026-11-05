import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { CheckCircle2, Mail, Printer, RotateCcw } from "lucide-react";
import { apiFetch } from "../lib/api";
import { aviso } from "../lib/avisos";

// Pago al procurador en efectivo: el despacho necesita su recibo firmado.
// Aquí vive todo lo de ese recibo -- la etiqueta de estado, pedirlo por
// correo, imprimir uno para que lo firme en el momento y marcarlo recibido.

export type ReciboEstado = "pendiente" | "solicitado" | "recibido" | null;

export type PagoProcurador = {
  id: string;
  total: number;
  fecha: string;
  concepto?: string;
  procuradorNombre?: string;
  procuradorEmail?: string;
  expedienteRef?: string;
  reciboEstado: ReciboEstado;
};

const ETIQUETA: Record<Exclude<ReciboEstado, null>, { texto: string; clase: string }> = {
  pendiente:  { texto: "Recibo pendiente",  clase: "bg-amber-100 text-amber-800" },
  solicitado: { texto: "Recibo solicitado", clase: "bg-sky-100 text-sky-800" },
  recibido:   { texto: "Recibo recibido",   clase: "bg-emerald-100 text-emerald-800" },
};

export function ReciboBadge({ estado }: { estado: ReciboEstado }) {
  if (!estado) return null;
  const e = ETIQUETA[estado];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${e.clase}`}>{e.texto}</span>;
}

const botonClase = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40";

export function ReciboAcciones({ pago, despacho, onActualizado, compacto }: {
  compacto?: boolean;
  pago: PagoProcurador;
  despacho: string;
  onActualizado: (fila: any) => void;
}) {
  const { getToken } = useAuth();
  const [enviando, setEnviando] = useState(false);
  if (!pago.reciboEstado) return null;
  const boton = compacto ? botonClase.replace("h-8 w-8", "h-6 w-6") : botonClase;
  const icono = compacto ? 12 : 14;

  const solicitar = async () => {
    setEnviando(true);
    try {
      const r = await apiFetch(`/api/facturacion/gastos/${pago.id}/solicitar-recibo`, { getToken, method: "POST", body: "{}" });
      if (!r?.success) throw new Error(r?.error || "No se pudo enviar.");
      onActualizado(r.data);
      aviso.ok(`Recibo solicitado a ${r.enviadoA}`);
    } catch (e: any) {
      aviso.error(e?.message || "No se pudo enviar el correo al procurador.");
    } finally {
      setEnviando(false);
    }
  };

  const marcar = async (recibido: boolean) => {
    try {
      const r = await apiFetch(`/api/facturacion/gastos/${pago.id}/recibo`, { getToken, method: "POST", body: JSON.stringify({ recibido }) });
      if (!r?.success) throw new Error(r?.error || "No se pudo guardar.");
      onActualizado(r.data);
    } catch (e: any) {
      aviso.error(e?.message || "No se pudo guardar.");
    }
  };

  return (
    <>
      {pago.reciboEstado !== "recibido" && (
        <button type="button" className={boton} disabled={enviando}
          title={pago.procuradorEmail ? `Pedir el recibo por correo a ${pago.procuradorEmail}` : "El procurador no tiene correo en el Directorio"}
          onClick={() => void solicitar()}>
          <Mail size={icono} />
        </button>
      )}
      <button type="button" className={boton} title="Imprimir recibo para que lo firme" onClick={() => imprimirRecibo(pago, despacho)}>
        <Printer size={icono} />
      </button>
      {pago.reciboEstado === "recibido" ? (
        <button type="button" className={boton} title="Volver a marcar como pendiente" onClick={() => void marcar(false)}>
          <RotateCcw size={icono} />
        </button>
      ) : (
        <button type="button" className={`${boton} border-emerald-200 text-emerald-600 hover:bg-emerald-50`} title="Ya tenemos el recibo firmado" onClick={() => void marcar(true)}>
          <CheckCircle2 size={icono} />
        </button>
      )}
    </>
  );
}

// ── Importe en letras (para el recibo) ────────────────────────────
const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
  "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function menorDeMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  let txt = CENTENAS[c];
  if (r) {
    const resto = r < 30 ? UNIDADES[r] : DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : "");
    txt = txt ? `${txt} ${resto}` : resto;
  }
  return txt;
}

export function numeroALetras(n: number): string {
  const entero = Math.floor(n);
  if (entero === 0) return "cero";
  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const resto = entero % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "un millón" : `${menorDeMil(millones).replace(/uno$/, "un")} millones`);
  if (miles) partes.push(miles === 1 ? "mil" : `${menorDeMil(miles).replace(/uno$/, "un")} mil`);
  if (resto) partes.push(menorDeMil(resto));
  return partes.join(" ");
}

export function importeEnLetras(total: number): string {
  const euros = Math.floor(total + 1e-9);
  const cent = Math.round((total - euros) * 100);
  const e = `${numeroALetras(euros).replace(/uno$/, "un")} ${euros === 1 ? "euro" : "euros"}`;
  return cent ? `${e} con ${numeroALetras(cent).replace(/uno$/, "un")} ${cent === 1 ? "céntimo" : "céntimos"}` : e;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Abre una ventana con el "recibí" listo para imprimir y firmar.
export function imprimirRecibo(pago: PagoProcurador, despacho: string) {
  const fmt = pago.total.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = pago.fecha ? new Date(`${pago.fecha}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo · ${esc(pago.procuradorNombre)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:680px;margin:48px auto;padding:0 24px;line-height:1.7}
  h1{font-size:22px;letter-spacing:.2em;text-align:center;margin:0 0 32px}
  .importe{font-size:20px;font-weight:bold;text-align:right;border:1px solid #111;padding:8px 14px;display:inline-block;float:right;margin:0 0 16px 16px}
  .firma{margin-top:80px;display:flex;justify-content:space-between;gap:32px}
  .firma div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:13px;text-align:center}
  @media print{body{margin:24px auto}button{display:none}}
</style></head><body>
<h1>RECIBÍ</h1>
<div class="importe">${esc(fmt)} €</div>
<p>D./Dña. <strong>${esc(pago.procuradorNombre || "________________________")}</strong>, Procurador/a de los Tribunales,
declara haber recibido de <strong>${esc(despacho)}</strong>, <strong>en efectivo</strong>, la cantidad de
<strong>${esc(importeEnLetras(pago.total))} (${esc(fmt)} €)</strong>${pago.concepto ? `, en concepto de ${esc(pago.concepto)}` : ""}${pago.expedienteRef ? `, correspondiente al expediente ${esc(pago.expedienteRef)}` : ""}.</p>
<p>Y para que así conste, firma el presente recibo${fecha ? ` el ${esc(fecha)}` : ""}.</p>
<div class="firma"><div>Firma del procurador/a</div><div>DNI</div></div>
<p style="text-align:center;margin-top:40px"><button onclick="print()" style="font:inherit;padding:8px 20px;cursor:pointer">Imprimir</button></p>
</body></html>`;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { aviso.error("El navegador ha bloqueado la ventana del recibo. Permite las ventanas emergentes para Vantia."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
