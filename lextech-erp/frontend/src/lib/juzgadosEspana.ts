// Provincias de España (+ Ceuta y Melilla) con su capital de provincia.
// Se usa para sugerir juzgados habituales al crear/editar un expediente
// manualmente. No es un directorio oficial de órganos judiciales (no existe
// una fuente fiable de eso embebida en la app) — es una ayuda con los tipos
// de juzgado más comunes en la capital de cada provincia. El campo sigue
// permitiendo texto libre para cualquier partido judicial o número concreto
// que no aparezca aquí.
export const PROVINCIAS_ESPANA: { nombre: string; capital: string }[] = [
  { nombre: "Álava",              capital: "Vitoria-Gasteiz" },
  { nombre: "Albacete",           capital: "Albacete" },
  { nombre: "Alicante",           capital: "Alicante" },
  { nombre: "Almería",            capital: "Almería" },
  { nombre: "Asturias",           capital: "Oviedo" },
  { nombre: "Ávila",              capital: "Ávila" },
  { nombre: "Badajoz",            capital: "Badajoz" },
  { nombre: "Baleares",           capital: "Palma" },
  { nombre: "Barcelona",          capital: "Barcelona" },
  { nombre: "Burgos",             capital: "Burgos" },
  { nombre: "Cáceres",            capital: "Cáceres" },
  { nombre: "Cádiz",              capital: "Cádiz" },
  { nombre: "Cantabria",          capital: "Santander" },
  { nombre: "Castellón",          capital: "Castellón de la Plana" },
  { nombre: "Ciudad Real",        capital: "Ciudad Real" },
  { nombre: "Córdoba",            capital: "Córdoba" },
  { nombre: "A Coruña",           capital: "A Coruña" },
  { nombre: "Cuenca",             capital: "Cuenca" },
  { nombre: "Girona",             capital: "Girona" },
  { nombre: "Granada",            capital: "Granada" },
  { nombre: "Guadalajara",        capital: "Guadalajara" },
  { nombre: "Gipuzkoa",           capital: "San Sebastián" },
  { nombre: "Huelva",             capital: "Huelva" },
  { nombre: "Huesca",             capital: "Huesca" },
  { nombre: "Jaén",               capital: "Jaén" },
  { nombre: "La Rioja",           capital: "Logroño" },
  { nombre: "Las Palmas",         capital: "Las Palmas de Gran Canaria" },
  { nombre: "León",               capital: "León" },
  { nombre: "Lleida",             capital: "Lleida" },
  { nombre: "Lugo",               capital: "Lugo" },
  { nombre: "Madrid",             capital: "Madrid" },
  { nombre: "Málaga",             capital: "Málaga" },
  { nombre: "Murcia",             capital: "Murcia" },
  { nombre: "Navarra",            capital: "Pamplona" },
  { nombre: "Ourense",            capital: "Ourense" },
  { nombre: "Palencia",           capital: "Palencia" },
  { nombre: "Pontevedra",         capital: "Pontevedra" },
  { nombre: "Salamanca",          capital: "Salamanca" },
  { nombre: "Segovia",            capital: "Segovia" },
  { nombre: "Sevilla",            capital: "Sevilla" },
  { nombre: "Soria",              capital: "Soria" },
  { nombre: "Tarragona",          capital: "Tarragona" },
  { nombre: "Santa Cruz de Tenerife", capital: "Santa Cruz de Tenerife" },
  { nombre: "Teruel",             capital: "Teruel" },
  { nombre: "Toledo",             capital: "Toledo" },
  { nombre: "Valencia",           capital: "Valencia" },
  { nombre: "Valladolid",         capital: "Valladolid" },
  { nombre: "Bizkaia",            capital: "Bilbao" },
  { nombre: "Zamora",             capital: "Zamora" },
  { nombre: "Zaragoza",           capital: "Zaragoza" },
  { nombre: "Ceuta",              capital: "Ceuta" },
  { nombre: "Melilla",            capital: "Melilla" },
];

const TIPOS_JUZGADO = [
  "Juzgado de Primera Instancia",
  "Juzgado de Instrucción",
  "Juzgado de lo Mercantil",
  "Juzgado de lo Social",
  "Juzgado de lo Penal",
  "Juzgado de lo Contencioso-Administrativo",
  "Juzgado de Violencia sobre la Mujer",
  "Juzgado de Familia",
  "Juzgado de Menores",
  "Juzgado de Vigilancia Penitenciaria",
  "Audiencia Provincial",
];

// Lista de juzgados "habituales" para la capital de una provincia. Son tipos
// de órgano genéricos (sin número de juzgado concreto, porque ese dato sí
// varía y no se puede garantizar sin una fuente oficial) — sirven como punto
// de partida rápido, no como listado exhaustivo del partido judicial.
export function getJuzgadosComunes(provinciaNombre: string): string[] {
  const prov = PROVINCIAS_ESPANA.find((p) => p.nombre === provinciaNombre);
  if (!prov) return [];
  return TIPOS_JUZGADO.map((tipo) => `${tipo} de ${prov.capital}`);
}

// Intenta deducir la provincia a partir de un texto de juzgado ya guardado
// (p.ej. "Juzgado de Primera Instancia nº 3 de Madrid" -> "Madrid"), para
// preseleccionar el desplegable al editar un expediente existente.
export function detectarProvincia(juzgadoTexto: string): string | null {
  const texto = (juzgadoTexto || "").toLowerCase();
  if (!texto) return null;
  const match = PROVINCIAS_ESPANA.find((p) => texto.includes(p.capital.toLowerCase()));
  return match?.nombre ?? null;
}
