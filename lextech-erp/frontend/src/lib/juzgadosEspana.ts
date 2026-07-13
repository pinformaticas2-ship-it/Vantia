// Ayudas para el selector de Juzgado del expediente, basadas en el listado
// oficial de partidos judiciales y juzgados de España (ver juzgadosEspanaData.ts,
// generado a partir de https://demarcacion.cgpe.es). Los datos se cargan de
// forma diferida (import dinámico) para no engordar el bundle de páginas que
// no llegan a abrir el selector de juzgado.
import type { JuzgadoProvinciaData } from "./juzgadosEspanaData";

let cache: JuzgadoProvinciaData[] | null = null;
let pending: Promise<JuzgadoProvinciaData[]> | null = null;

export function loadJuzgadosEspana(): Promise<JuzgadoProvinciaData[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import("./juzgadosEspanaData").then((mod) => {
      cache = mod.JUZGADOS_ESPANA_DATA;
      return cache;
    });
  }
  return pending;
}

export function getProvincias(data: JuzgadoProvinciaData[]): string[] {
  return data.map((p) => p.n);
}

export function getPartidosJudiciales(data: JuzgadoProvinciaData[], provincia: string): string[] {
  return data.find((p) => p.n === provincia)?.ps.map((x) => x.n) ?? [];
}

export function getJuzgadosDePartido(data: JuzgadoProvinciaData[], provincia: string, partido: string): string[] {
  const prov = data.find((p) => p.n === provincia);
  return prov?.ps.find((x) => x.n === partido)?.js ?? [];
}

// Intenta deducir provincia/partido/juzgado a partir de un texto ya guardado
// (para preseleccionar el selector al editar un expediente existente).
export function detectarUbicacion(
  data: JuzgadoProvinciaData[],
  juzgadoTexto: string,
): { provincia: string; partido: string; juzgado: string } | null {
  const texto = (juzgadoTexto || "").trim();
  if (!texto) return null;
  for (const prov of data) {
    for (const partido of prov.ps) {
      const match = partido.js.find((j) => j === texto || `${j} de ${partido.n}` === texto);
      if (match) return { provincia: prov.n, partido: partido.n, juzgado: match };
    }
  }
  return null;
}
