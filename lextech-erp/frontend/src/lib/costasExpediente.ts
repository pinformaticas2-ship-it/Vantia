// Datos del ERP → campos de la calculadora de tasación de costas y jura de
// cuentas (public/herramientas/costas.html). Las claves son los id de sus
// campos. Lo que no se sabe no se manda: la calculadora lo deja en blanco.

export interface ExpedienteCostas {
  id: string;
  anio?: number | null;
  num_exp?: number | null;
  ref_expediente?: string | null;
  descripcion?: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cliente_nombre_linked?: string | null;
  contrario?: string | null;
  procurador?: string | null;
  procurador_contrario?: string | null;
  abogado_contrario?: string | null;
  juzgado?: string | null;
  tipo_proc?: string | null;
  num_autos?: string | null;
  nig?: string | null;
  cuantia_principal?: string | number | null;
  indeterminado?: boolean | null;
  tipos_asunto?: string | null;
  centro?: string | null;
}

export interface ClienteCostas {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  commercial_name?: string | null;
  nif_cif?: string | null;
  document_type?: string | null;
}

export interface ProcuradorCostas {
  num_colegiado?: string | null;
  colegio?: string | null;
}

export const refExpediente = (e: Pick<ExpedienteCostas, "ref_expediente" | "anio" | "num_exp">) =>
  (e.ref_expediente || "").trim() || `${e.anio}/${e.num_exp}`;

export const nombreCliente = (c: ClienteCostas) =>
  [c.first_name, c.last_name].map((s) => (s || "").trim()).filter(Boolean).join(" ") || (c.commercial_name || "").trim();

/** Persona jurídica o profesional que deduce el IVA: CIF (letra inicial). */
export const esEmpresa = (c: ClienteCostas) =>
  /cif/i.test(c.document_type || "") || /^[ABCDEFGHJNPQRSUVW]/i.test((c.nif_cif || "").trim());

/** Tipo de procedimiento del expediente (texto libre) → opción de la calculadora. */
export function procDesdeTexto(t: string | null | undefined): string {
  const s = (t || "").toLowerCase();
  if (!s.trim()) return "";
  if (/apelaci/.test(s)) return "apel";
  if (/hipotec/.test(s) && /ejecu/.test(s)) return "ej_hip";
  if (/ejecu|etj|etnj/.test(s)) return /no judicial|extrajudicial|etnj|cambiari/.test(s) ? "ej_ext" : "ej_jud";
  if (/monitori/.test(s)) return /oposici/.test(s) ? "mon_op" : "mon_sin";
  if (/verbal/.test(s)) return "verb";
  if (/ordinari/.test(s)) return "ord";
  return "";
}

/** Materia del asunto → opción de la calculadora (si no encaja, la general). */
export function materiaDesdeTexto(t: string): string {
  const s = t.toLowerCase();
  if (/arrend|alquiler|desahucio/.test(s)) return "arrend";
  if (/propiedad horizontal|comunidad de propietarios|\blph\b/.test(s)) return "lph";
  if (/cl[aá]usula|abusiv|consum|gastos hipotec|suelo|irph|revolving|usura/.test(s)) return "consumo";
  if (/honor|intimidad|propia imagen|derechos fundamentales/.test(s)) return "honor";
  return "";
}

const numero = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : "";
};

export interface DatosCalculadora {
  campos: Record<string, string | boolean>;
  localidad?: string;
  aviso?: string;
}

export function datosCalculadora(opts: {
  expediente?: ExpedienteCostas | null;
  cliente?: ClienteCostas | null;
  procurador?: ProcuradorCostas | null;
}): DatosCalculadora {
  const { expediente: e, cliente: c, procurador: p } = opts;
  const f: Record<string, string | boolean> = {};
  const poner = (k: string, v: string | null | undefined) => { const t = (v || "").trim(); if (t) f[k] = t; };

  if (e) {
    poner("juz", e.juzgado);
    poner("autos", [e.tipo_proc, e.num_autos].map((s) => (s || "").trim()).filter(Boolean).join(" "));
    poner("nig", e.nig);
    poner("nref", refExpediente(e));
    poner("cliente", e.cliente_nombre_linked || e.cliente_nombre);
    poner("contra", e.contrario);
    poner("contraProc", e.procurador_contrario);
    poner("contraLetr", e.abogado_contrario);
    poner("procNom", e.procurador);
    const proc = procDesdeTexto(e.tipo_proc);
    if (proc) f.proc = proc;
    const mat = materiaDesdeTexto([e.tipos_asunto, e.descripcion].filter(Boolean).join(" "));
    if (mat) f.mat = mat;
    if (e.indeterminado) f.indet = true;
    else { const q = numero(e.cuantia_principal); if (q) f.cuant = q; }
  }
  if (c) {
    if (!f.cliente) poner("cliente", nombreCliente(c));
    if (esEmpresa(c)) { f.ded = true; f.irpf = true; }
  }
  if (p && f.procNom) {
    const col = [p.num_colegiado ? `nº ${p.num_colegiado.trim()}` : "", (p.colegio || "").trim()].filter(Boolean).join(" · ");
    if (col) f.procCol = col;
  }

  const falta: string[] = [];
  if (e) {
    if (!f.juz) falta.push("órgano judicial");
    if (!f.cuant && !f.indet) falta.push("cuantía");
    if (!f.proc) falta.push("tipo de procedimiento");
  }
  const origen = e ? `del expediente ${refExpediente(e)}` : c ? "del cliente" : "";
  const aviso = origen
    ? `Datos cargados ${origen}.` + (falta.length ? ` Faltan: ${falta.join(", ")}.` : "") +
      " Sube la sentencia o el decreto para completar fechas, condena y posición del cliente."
    : undefined;
  return { campos: f, localidad: e?.centro || undefined, aviso };
}
