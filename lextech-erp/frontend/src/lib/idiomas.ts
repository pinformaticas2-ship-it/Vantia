// Idiomas en los que un cliente puede pedir que se le escriba (mismo listado
// que backend/src/utils/idiomas.ts). Si no es español, sus correos se pueden
// mandar en los dos idiomas.
export const IDIOMAS: { codigo: string; nombre: string }[] = [
  { codigo: "es", nombre: "Español" },
  { codigo: "en", nombre: "English (inglés)" },
  { codigo: "fr", nombre: "Français (francés)" },
  { codigo: "de", nombre: "Deutsch (alemán)" },
  { codigo: "it", nombre: "Italiano" },
  { codigo: "pt", nombre: "Português (portugués)" },
  { codigo: "ca", nombre: "Català" },
  { codigo: "nl", nombre: "Nederlands (neerlandés)" },
  { codigo: "ro", nombre: "Română (rumano)" },
  { codigo: "pl", nombre: "Polski (polaco)" },
  { codigo: "uk", nombre: "Українська (ucraniano)" },
  { codigo: "ru", nombre: "Русский (ruso)" },
  { codigo: "ar", nombre: "العربية (árabe)" },
  { codigo: "zh", nombre: "中文 (chino)" },
];

export const nombreIdioma = (codigo?: string | null) =>
  IDIOMAS.find((i) => i.codigo === (codigo || "es"))?.nombre || "Español";
