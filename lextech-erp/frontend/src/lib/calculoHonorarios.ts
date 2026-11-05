// Cálculos de la Calculadora de honorarios, costas y jura de cuentas.
// Funciones puras (sin React) para poder probarlas aparte.

export type Tramo = { hasta: number | null; pct: number };
export type Escala = { tramos: Tramo[]; minimo: number; nombre: string };

// Escala de EJEMPLO para que la calculadora funcione desde el primer día.
// No es la de ningún Colegio: cada despacho debe sustituirla por los criterios
// orientativos de su Colegio de Abogados (botón "Escala" de la calculadora).
export const ESCALA_EJEMPLO: Escala = {
  nombre: "Escala de ejemplo (sustitúyela por la de tu Colegio)",
  minimo: 600,
  tramos: [
    { hasta: 3000, pct: 20 },
    { hasta: 6000, pct: 16 },
    { hasta: 15000, pct: 12 },
    { hasta: 30000, pct: 10 },
    { hasta: 60000, pct: 8 },
    { hasta: 150000, pct: 6 },
    { hasta: 300000, pct: 4 },
    { hasta: 600000, pct: 3 },
    { hasta: null, pct: 2 },
  ],
};

// Art. 394.3 LEC: a efectos del límite de costas, las pretensiones
// inestimables se valoran en 18.000 € (salvo que el tribunal disponga otra cosa).
export const CUANTIA_INDETERMINADA = 18000;
export const IVA_PCT = 21;
export const IRPF_PCT = 15;

export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type TramoAplicado = { desde: number; hasta: number | null; pct: number; base: number; importe: number };

/** Honorarios por escala acumulativa: cada tramo de la cuantía a su porcentaje. */
export function honorariosPorEscala(cuantia: number, escala: Escala): { importe: number; detalle: TramoAplicado[]; aplicadoMinimo: boolean } {
  const c = Math.max(0, cuantia || 0);
  const detalle: TramoAplicado[] = [];
  let desde = 0;
  let suma = 0;
  for (const t of escala.tramos) {
    if (c <= desde) break;
    const tope = t.hasta === null ? c : Math.min(c, t.hasta);
    const base = tope - desde;
    if (base > 0) {
      const importe = redondear((base * t.pct) / 100);
      detalle.push({ desde, hasta: t.hasta, pct: t.pct, base: redondear(base), importe });
      suma += importe;
    }
    if (t.hasta === null) break;
    desde = t.hasta;
  }
  suma = redondear(suma);
  const aplicadoMinimo = escala.minimo > 0 && suma < escala.minimo;
  return { importe: aplicadoMinimo ? escala.minimo : suma, detalle, aplicadoMinimo };
}

export type Minuta = {
  base: number; iva: number; irpf: number; suplidos: number;
  total: number;          // base + IVA − IRPF + suplidos
  provisiones: number;
  pendiente: number;      // total − provisiones
};

/** Minuta del abogado: base + IVA − retención IRPF + suplidos − provisiones. */
export function calcularMinuta(o: { base: number; conIva: boolean; conIrpf: boolean; suplidos?: number; provisiones?: number }): Minuta {
  const base = redondear(Math.max(0, o.base || 0));
  const iva = o.conIva ? redondear((base * IVA_PCT) / 100) : 0;
  const irpf = o.conIrpf ? redondear((base * IRPF_PCT) / 100) : 0;
  const suplidos = redondear(Math.max(0, o.suplidos || 0));
  const total = redondear(base + iva - irpf + suplidos);
  const provisiones = redondear(Math.max(0, o.provisiones || 0));
  return { base, iva, irpf, suplidos, total, provisiones, pendiente: redondear(total - provisiones) };
}

export type Costas = {
  honorariosPedidos: number;
  limite: number | null;          // tope del art. 394.3 LEC (null si no aplica)
  honorariosReconocidos: number;  // tras aplicar el límite
  recortado: boolean;
  ivaHonorarios: number;
  derechosProcurador: number;
  ivaProcurador: number;
  suplidos: number;
  total: number;
};

/**
 * Tasación de costas. El límite de un tercio de la cuantía (art. 394.3 LEC)
 * afecta a los honorarios de abogados y demás profesionales no sujetos a
 * arancel -- no a los derechos del procurador (arancel) ni a los suplidos -- y
 * no se aplica si el tribunal declara temeridad. Se aplica sobre los
 * honorarios sin IVA; el IVA se suma después si la parte vencedora no puede
 * deducírselo.
 */
export function calcularCostas(o: {
  honorarios: number; derechosProcurador: number; suplidos: number;
  cuantia: number; indeterminada: boolean; litigantes: number;
  temeridad: boolean; incluirIva: boolean; aplicarLimite: boolean;
}): Costas {
  const honorariosPedidos = redondear(Math.max(0, o.honorarios || 0));
  const cuantia = o.indeterminada ? CUANTIA_INDETERMINADA : Math.max(0, o.cuantia || 0);
  const limite = o.aplicarLimite && !o.temeridad && cuantia > 0
    ? redondear((cuantia / 3) * Math.max(1, Math.floor(o.litigantes || 1)))
    : null;
  const honorariosReconocidos = limite !== null ? Math.min(honorariosPedidos, limite) : honorariosPedidos;
  const derechosProcurador = redondear(Math.max(0, o.derechosProcurador || 0));
  const suplidos = redondear(Math.max(0, o.suplidos || 0));
  const ivaHonorarios = o.incluirIva ? redondear((honorariosReconocidos * IVA_PCT) / 100) : 0;
  const ivaProcurador = o.incluirIva ? redondear((derechosProcurador * IVA_PCT) / 100) : 0;
  return {
    honorariosPedidos, limite, honorariosReconocidos, recortado: honorariosReconocidos < honorariosPedidos,
    ivaHonorarios, derechosProcurador, ivaProcurador, suplidos,
    total: redondear(honorariosReconocidos + ivaHonorarios + derechosProcurador + ivaProcurador + suplidos),
  };
}

export const fmtEur = (n: number) =>
  `${(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as Intl.NumberFormatOptions)} €`;

/** Borrador del escrito de jura de cuentas (arts. 34 y 35 LEC). */
export function borradorJuraDeCuentas(o: {
  profesional: "abogado" | "procurador";
  nombreProfesional: string; deudor: string; juzgado: string; procedimiento: string;
  minuta: Minuta;
}): string {
  const art = o.profesional === "abogado" ? "35" : "34";
  const quien = o.profesional === "abogado" ? "Abogado/a" : "Procurador/a de los Tribunales";
  const concepto = o.profesional === "abogado" ? "honorarios" : "derechos y suplidos";
  const m = o.minuta;
  const lineas = [
    `AL ${o.juzgado || "[JUZGADO]"}`,
    "",
    `${o.nombreProfesional || "[NOMBRE]"}, ${quien}, en el procedimiento ${o.procedimiento || "[Nº DE PROCEDIMIENTO]"}, ante el Juzgado comparezco y, como mejor proceda en Derecho, DIGO:`,
    "",
    `PRIMERO.- Que he intervenido como ${quien.toLowerCase()} de ${o.deudor || "[CLIENTE]"} en el procedimiento de referencia, devengando los ${concepto} que se detallan en la cuenta que se acompaña.`,
    "",
    `SEGUNDO.- Que dichos ${concepto} no me han sido satisfechos, por lo que, al amparo del artículo ${art} de la Ley de Enjuiciamiento Civil, presento cuenta detallada y justificada por el siguiente importe:`,
    "",
    `   ${o.profesional === "abogado" ? "Honorarios" : "Derechos"} ............ ${fmtEur(m.base)}`,
    ...(m.iva ? [`   IVA (${IVA_PCT} %) ............... ${fmtEur(m.iva)}`] : []),
    ...(m.irpf ? [`   Retención IRPF (${IRPF_PCT} %) .... −${fmtEur(m.irpf)}`] : []),
    ...(m.suplidos ? [`   Suplidos .................. ${fmtEur(m.suplidos)}`] : []),
    ...(m.provisiones ? [`   Provisiones recibidas ..... −${fmtEur(m.provisiones)}`] : []),
    `   IMPORTE RECLAMADO ......... ${fmtEur(m.pendiente)}`,
    "",
    "Por lo expuesto,",
    "",
    `SUPLICO AL JUZGADO: Que tenga por presentado este escrito con la cuenta que se acompaña y, previos los trámites del artículo ${art} LEC, requiera a ${o.deudor || "[CLIENTE]"} para que en el plazo de diez días pague la cantidad de ${fmtEur(m.pendiente)}, con las costas, o impugne la cuenta, con apercibimiento de apremio si no pagare ni formulare impugnación.`,
    "",
    "Es justicia que pido en [LUGAR], a [FECHA].",
  ];
  return lineas.join("\n");
}
