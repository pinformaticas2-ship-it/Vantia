import { t } from "./i18n";

// ══════════════════════════════════════════════════════════════════════════════
// Registro de actividad en el idioma de la app (20/11/2026). El servidor guarda
// cada acción como una frase en español («Documento creado: Contrato»); aquí se
// traduce lo que es de Vantia (la frase o su prefijo) y se deja tal cual lo que
// es dato del despacho (el título, el nombre, la referencia…).
// Las traducciones están en i18n/en/actividad.ts.
// ══════════════════════════════════════════════════════════════════════════════

const tiene = (k: string) => t(k) !== k;

/** Frases con datos en medio: [patrón, clave del diccionario, qué grupos se traducen]. */
const PLANTILLAS: [RegExp, string, number[]?][] = [
  [/^Inicio de sesión desde (.+)$/, "Inicio de sesión desde {a}"],
  [/^Cierre de sesión desde (.+)$/, "Cierre de sesión desde {a}"],
  [/^Acceso completo a la trazabilidad concedido a (.+) durante (\d+) h$/, "Acceso completo a la trazabilidad concedido a {a} durante {b} h"],
  [/^Acceso completo a la trazabilidad retirado a (.+)$/, "Acceso completo a la trazabilidad retirado a {a}"],
  [/^Recibo solicitado al procurador (.+)$/, "Recibo solicitado al procurador {a}"],
  [/^Dosier para Claude del expediente (.+)$/, "Dosier para Claude del expediente {a}"],
  [/^Documento traducido \((.+?)\): (.+)$/, "Documento traducido ({a}): {b}"],
  [/^Trazabilidad: se guarda (\d+) meses$/, "Trazabilidad: se guarda {a} meses"],
  [/^Alta masiva iniciada: (.+) \((\d+) filas?\)$/, "Alta masiva iniciada: {a} ({b} filas)"],
  [/^Importacion CSV deshecha: (.+) \((\d+) clientes eliminados\)$/, "Importacion CSV deshecha: {a} ({b} clientes eliminados)"],
  [/^Factura (.+) enviada a Quipu \(id: (.+)\)$/, "Factura {a} enviada a Quipu (id: {b})"],
  [/^Expediente actualizado \((.+)\): (.+)$/, "Expediente actualizado ({a}): {b}"],
  [/^Cliente actualizado \((.+)\)$/, "Cliente actualizado ({a})"],
  [/^Plantillas del despacho: carpeta conectada en (.+)$/, "Plantillas del despacho: carpeta conectada en {a}"],
  [/^Automatización «(.+)» guardada \(activa\)$/, "Automatización «{a}» guardada (activa)"],
  [/^(Procurador|Abogado|Parte contraria) (creado|actualizado|eliminado): (.+)$/, "{a} {b}: {c}", [1, 2]],
];

export function traducirActividad(s?: string | null): string {
  const texto = String(s || "");
  if (!texto) return "";
  if (tiene(texto)) return t(texto);
  for (const [re, clave, traducir] of PLANTILLAS) {
    const m = re.exec(texto);
    if (!m) continue;
    const vars: Record<string, string> = {};
    m.slice(1).forEach((v, i) => { vars["abc"[i]] = traducir?.includes(i + 1) ? t(v) : v; });
    return t(clave, vars);
  }
  // Un nombre entre «» (automatización, oportunidad…): «{n}».
  const nombre = /«([^»]*)»/.exec(texto);
  if (nombre) {
    const clave = texto.replace(nombre[0], "«{n}»");
    if (tiene(clave)) return t(clave, { n: nombre[1] });
  }
  // «Prefijo: dato» → el prefijo traducido y el dato tal cual.
  const i = texto.indexOf(": ");
  if (i > 0) {
    const pre = texto.slice(0, i);
    const resto = texto.slice(i + 2);
    // El dato se deja tal cual, salvo que sea un texto de la propia app («Documento sin título»).
    if (tiene(pre)) return `${t(pre)}: ${tiene(resto) ? t(resto) : resto}`;
    const r = traducirActividad(resto);
    if (r !== resto) return `${t(pre)}: ${r}`;
  }
  return texto;
}
