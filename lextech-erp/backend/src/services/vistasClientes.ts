// ── Cliente del expediente que se crea al aceptar una vista (26/11/2026) ─────
// Antes el expediente nuevo se creaba siempre sin cliente. Ahora, al aceptar,
// se puede elegir un cliente que ya exista en el despacho, y Vantia propone los
// que aparecen en el correo (por NIF o por nombre). Nunca se crea un cliente
// nuevo a partir del correo: saldrían clientes sin datos y duplicados.
import pool from '../config/database';
import { fold } from './vistasAutomation';

export interface ClienteSugerido {
  id: string;
  nombre: string;
  nif: string | null;
  /** Por qué se propone: su NIF sale en el correo, es el cliente que leyó la IA, sale entre las partes o en el texto. */
  motivo: 'nif' | 'cliente' | 'partes' | 'correo';
}

export interface ClienteFila { id: string; first_name: string | null; last_name: string | null; commercial_name: string | null; nif_cif: string | null }

/** Minúsculas, sin tildes ni signos, con espacios simples y un espacio a cada lado. */
const plano = (s: string | null | undefined) => ` ${fold(String(s || '')).replace(/[^a-z0-9ñ]+/g, ' ').trim()} `;
const nifPlano = (s: string | null | undefined) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const nombreCliente = (c: ClienteFila) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || String(c.commercial_name || '').trim();

/** Formas del nombre que se buscan en el texto: «Nombre Apellidos», «Apellidos Nombre» y el nombre comercial. */
function formas(c: ClienteFila): string[] {
  const out = new Set<string>();
  const nombre = plano(c.first_name).trim(), apellidos = plano(c.last_name).trim(), comercial = plano(c.commercial_name).trim();
  // Un nombre suelto («Juan») coincide con cualquier cosa: hacen falta dos palabras o un nombre comercial largo.
  if (nombre && apellidos) { out.add(`${nombre} ${apellidos}`); out.add(`${apellidos} ${nombre}`); }
  else if ((nombre || apellidos).split(' ').length >= 2) out.add(nombre || apellidos);
  if (comercial && (comercial.split(' ').length >= 2 || comercial.length >= 6)) out.add(comercial);
  return [...out].filter((f) => f.length >= 6);
}

/**
 * Propone clientes del despacho que aparecen en el correo de la vista.
 * Función pura (sin base de datos) para poder probarla.
 */
export function puntuarClientes(
  clientes: ClienteFila[],
  datos: { cliente?: string | null; partes?: string | null; contrario?: string | null } | null | undefined,
  correo: { subject?: string | null; body_text?: string | null },
  max = 5,
): ClienteSugerido[] {
  const tCliente = plano(datos?.cliente), tPartes = plano(datos?.partes), tContrario = plano(datos?.contrario);
  const tCorreo = plano(`${correo.subject || ''} ${String(correo.body_text || '').slice(0, 30000)}`);
  const nifsTexto = nifPlano(`${datos?.cliente || ''} ${datos?.partes || ''} ${correo.subject || ''} ${String(correo.body_text || '').slice(0, 30000)}`);
  // Filtro rápido: todas las palabras del nombre tienen que estar en el texto.
  const palabras = new Set(`${tCliente} ${tPartes} ${tCorreo}`.split(' ').filter(Boolean));
  const puntos: { c: ClienteFila; p: number; motivo: ClienteSugerido['motivo'] }[] = [];
  for (const c of clientes) {
    const nif = nifPlano(c.nif_cif);
    let p = 0; let motivo: ClienteSugerido['motivo'] = 'correo';
    // Los NIF de relleno de importaciones («IMP-xxxx») no cuentan.
    if (nif.length >= 8 && !nif.startsWith('IMP') && nifsTexto.includes(nif)) { p = 100; motivo = 'nif'; }
    const fs = formas(c).filter((f) => f.split(' ').every((w) => palabras.has(w)));
    if (fs.length) {
      const en = (t: string) => fs.some((f) => t.includes(` ${f} `));
      // Es la parte contraria según el correo (y no el cliente): no se propone.
      if (p < 100 && en(tContrario) && !en(tCliente)) continue;
      if (en(tCliente)) { if (p < 80) { p = 80; motivo = 'cliente'; } }
      else if (en(tPartes)) { if (p < 50) { p = 50; motivo = 'partes'; } }
      else if (en(tCorreo)) { if (p < 30) { p = 30; motivo = 'correo'; } }
    }
    if (p > 0) puntos.push({ c, p, motivo });
  }
  return puntos
    .sort((a, b) => b.p - a.p || nombreCliente(a.c).localeCompare(nombreCliente(b.c)))
    .slice(0, max)
    .map(({ c, motivo }) => ({ id: c.id, nombre: nombreCliente(c), nif: c.nif_cif && !c.nif_cif.startsWith('IMP-') ? c.nif_cif : null, motivo }));
}

/** Clientes del despacho que aparecen en el correo de la solicitud. */
export async function sugerirClientes(organizacionId: string, sol: any): Promise<ClienteSugerido[]> {
  const { rows } = await pool.query<ClienteFila>(
    `SELECT id, first_name, last_name, commercial_name, nif_cif FROM entities WHERE organizacion_id = $1 LIMIT 50000`,
    [organizacionId],
  );
  return puntuarClientes(rows, sol?.datos, { subject: sol?.subject, body_text: sol?.body_text });
}

/** Buscador de clientes del despacho (nombre, apellidos, nombre comercial o NIF). */
export async function buscarClientes(organizacionId: string, q: string): Promise<ClienteSugerido[]> {
  const texto = q.trim().slice(0, 100);
  if (texto.length < 2) return [];
  const { rows } = await pool.query<ClienteFila>(
    `SELECT id, first_name, last_name, commercial_name, nif_cif
       FROM entities
      WHERE organizacion_id = $1
        AND (TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) ILIKE $2
             OR TRIM(COALESCE(last_name,'') || ' ' || COALESCE(first_name,'')) ILIKE $2
             OR commercial_name ILIKE $2 OR nif_cif ILIKE $2)
      ORDER BY first_name NULLS LAST, last_name NULLS LAST
      LIMIT 10`,
    [organizacionId, `%${texto.replace(/[%_\\]/g, (m) => `\\${m}`)}%`],
  );
  return rows.map((c) => ({ id: c.id, nombre: nombreCliente(c), nif: c.nif_cif && !c.nif_cif.startsWith('IMP-') ? c.nif_cif : null, motivo: 'correo' as const }));
}
