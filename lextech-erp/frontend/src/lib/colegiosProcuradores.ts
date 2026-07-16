// Ayudas para el selector de Colegio del formulario de Procurador, basadas en
// el listado oficial de colegios (ver colegiosProcuradoresData.ts, generado a
// partir de directorio.cgpe.es). Carga diferida (import dinámico) para no
// engordar el bundle de páginas que no llegan a abrir el selector.
let cache: string[] | null = null;
let pending: Promise<string[]> | null = null;

export function loadColegiosProcuradores(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import("./colegiosProcuradoresData").then((mod) => {
      cache = mod.COLEGIOS_PROCURADORES_ESPANA;
      return cache;
    });
  }
  return pending;
}
