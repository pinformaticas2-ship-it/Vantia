// Ayudas para el selector de Colegio del formulario de Abogado, basadas en el
// listado oficial de colegios (ver colegiosAbogadosData.ts, generado a partir
// de abogacia.es). Carga diferida (import dinámico) para no engordar el
// bundle de páginas que no llegan a abrir el selector.
import type { ColegioAbogadosProvinciaData } from "./colegiosAbogadosData";

let cache: ColegioAbogadosProvinciaData[] | null = null;
let pending: Promise<ColegioAbogadosProvinciaData[]> | null = null;

export function loadColegiosAbogados(): Promise<ColegioAbogadosProvinciaData[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import("./colegiosAbogadosData").then((mod) => {
      cache = mod.COLEGIOS_ABOGADOS_ESPANA_DATA;
      return cache;
    });
  }
  return pending;
}

export function getProvincias(data: ColegioAbogadosProvinciaData[]): string[] {
  return data.map((p) => p.n);
}

export function getColegiosDeProvincia(data: ColegioAbogadosProvinciaData[], provincia: string): string[] {
  return data.find((p) => p.n === provincia)?.cs ?? [];
}

// Intenta deducir la provincia a partir de un colegio ya guardado (para
// preseleccionar el selector al editar un registro existente).
export function detectarProvinciaDeColegio(
  data: ColegioAbogadosProvinciaData[],
  colegioTexto: string,
): { provincia: string; colegio: string } | null {
  const texto = (colegioTexto || "").trim();
  if (!texto) return null;
  for (const prov of data) {
    const match = prov.cs.find((c) => c === texto);
    if (match) return { provincia: prov.n, colegio: match };
  }
  return null;
}
