import pool from '../config/database';
import { claveCanonica } from './plantillasWord';

// ── Datos de Vantia para los campos de MN Program (15/10/2026) ───────────────
// Traduce cada campo de las plantillas («Contrario_Principal_Nombre»,
// «Juzgados_Núm_Autos», «Empresa_NIF/CIF»...) al dato que Vantia tiene del
// expediente, su cliente, la otra parte, el juzgado, los profesionales y el
// despacho. Lo que Vantia no guarda (campos propios de MN como WIZINK_*,
// CLÁUSULAS_*...) se rellena a mano al generar el documento y se recuerda en
// plantillas_valores: por expediente, o para todo el despacho los de Empresa.
//
// MN corta los nombres a 40 caracteres ("..._Descripción_Expedie"), así que
// los campos se comparan por el principio de su nombre.

export type GrupoCampo = 'Despacho' | 'Expediente' | 'Cliente' | 'Contrario' | 'Juzgado'
  | 'Procurador' | 'Procurador contrario' | 'Abogado' | 'Abogado contrario' | 'Otros';

type Persona = Partial<{
  nombre: string; nif: string; direccion: string; cp: string; poblacion: string; provincia: string;
  telefono: string; movil: string; email: string; colegiado: string; tipo: string; pais: string; nacimiento: string;
}>;

interface Contexto {
  org: Persona & { nombre?: string };
  exp: any | null;
  cliente: Persona;
  contrario: Persona;
  juzgado: Persona & { autos?: string };
  procurador: Persona;
  procuradorContrario: Persona;
  abogado: Persona;
  abogadoContrario: Persona;
}

// Prefijos de MN (ya en clave canónica) → a quién se refieren. Los más
// largos primero: "CONTRARIO_PRINCIPAL" antes que "CONTRARIO".
const PREFIJOS: [string, GrupoCampo][] = ([
  ['EMPRESA', 'Despacho'],
  ['DATOS_DEL_EXPEDIENTE', 'Expediente'], ['EXPEDIENTES', 'Expediente'],
  ['TIPOS_DE_PROCEDIMIENTO', 'Expediente'],
  ['CLIENTE_PRINCIPAL', 'Cliente'], ['CLIENTE_LINEA', 'Cliente'], ['LISTADO_DE_CLIENTES', 'Cliente'], ['CLIENTES', 'Cliente'], ['CLIENTE', 'Cliente'],
  ['CONTRARIO_PRINCIPAL', 'Contrario'], ['CONTRARIOS_LINEA', 'Contrario'], ['TODOS_LOS_CONTRARIOS', 'Contrario'], ['CONTRARIOS', 'Contrario'], ['CONTRARIO', 'Contrario'],
  ['JUZGADO_PRINCIPAL', 'Juzgado'], ['JUZGADOS_POR_LINEAS', 'Juzgado'], ['JUZGADOS', 'Juzgado'], ['JUZGADO', 'Juzgado'],
  ['PROCURADOR_PROPIO_PRINCIPAL', 'Procurador'], ['LISTADO_DE_PROCURADORES_PROPIOS', 'Procurador'], ['PROCURADORES_PROPIOS_POR_LINEA', 'Procurador'], ['PROCURADORES_PROPIOS', 'Procurador'],
  ['PROCURADOR_CONTRARIO_PRINCIPAL', 'Procurador contrario'], ['LISTADO_DE_PROCURADORES_CONTRARIOS', 'Procurador contrario'], ['PROCURADORES_CONTRARIOS_POR_LINEA', 'Procurador contrario'], ['PROCURADORES_CONTRARIOS', 'Procurador contrario'],
  ['ABOGADO_PROPIO_PRINCIPAL', 'Abogado'], ['LISTADO_DE_ABOGADOS_PROPIOS', 'Abogado'], ['ABOGADOS_PROPIOS_POR_LINEA', 'Abogado'], ['ABOGADOS_PROPIOS', 'Abogado'],
  ['ABOGADO_CONTRARIO_PRINCIPAL', 'Abogado contrario'], ['LISTADO_DE_ABOGADOS_CONTRARIOS', 'Abogado contrario'], ['ABOGADOS_CONTRARIOS_POR_LINEA', 'Abogado contrario'], ['ABOGADOS_CONTRARIOS', 'Abogado contrario'],
  ['PROCURADORES', 'Procurador'], ['PROCURADOR', 'Procurador'],
  ['ABOGADOS', 'Abogado'], ['ABOGADO', 'Abogado'],
] as [string, GrupoCampo][]).sort((a, b) => b[0].length - a[0].length);

export function grupoDe(clave: string): { grupo: GrupoCampo; resto: string } {
  if (clave.startsWith('FECHA_IMPRESION')) return { grupo: 'Despacho', resto: clave };
  // "General_Expedientes_NIG", "General_Clientes_Nombre": lo mismo sin "General".
  // (General_Facturas / General_Proformas son de facturación: se quedan en Otros.)
  if (clave.startsWith('GENERAL_') && !/^GENERAL_(FACTURAS|PROFORMAS)/.test(clave)) {
    const r = grupoDe(clave.slice('GENERAL_'.length));
    if (r.grupo !== 'Otros') return r;
  }
  for (const [p, g] of PREFIJOS) {
    if (clave === p) return { grupo: g, resto: '' };
    if (clave.startsWith(p + '_')) return { grupo: g, resto: clave.slice(p.length + 1) };
  }
  return { grupo: 'Otros', resto: clave };
}

/** Nombre legible de un campo: «Contrario_Principal_Núm_Colegiado» → "Núm Colegiado". */
export function etiquetaDe(nombreOriginal: string): string {
  const clave = claveCanonica(nombreOriginal);
  const { grupo, resto } = grupoDe(clave);
  if (grupo === 'Otros' || !resto) return nombreOriginal.replace(/_+/g, ' ').trim();
  // Se quita del nombre original el mismo número de "palabras" que el prefijo.
  const palabrasPrefijo = clave.split('_').length - resto.split('_').length;
  return nombreOriginal.split(/_+/).slice(palabrasPrefijo).join(' ').trim() || nombreOriginal;
}

const fechaCorta = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const fechaLarga = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const euros = (n: any) => (n == null || n === '' ? '' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }));

/** Campo de una persona (cliente, contrario, procurador...). */
function campoPersona(p: Persona, resto: string): string | undefined {
  // "Clientes_Principal_Nombre", "Contrarios_Línea_NIF/CIF": el principal o el de la línea es el mismo dato.
  const r = resto.replace(/^(PRINCIPAL|LINEA)_/, '');
  if (!r || r === 'NOMBRE' || r.startsWith('NOMBRE')) return p.nombre;
  if (r.startsWith('NIF')) return p.nif;
  if (r.startsWith('DIRECCION') || r.startsWith('DOMICILIO')) return p.direccion;
  if (r.startsWith('CODIGO_POSTAL') || r === 'CP') return p.cp;
  if (r.startsWith('POBLACION') || r.startsWith('MUNICIPIO') || r.startsWith('LOCALIDAD')) return p.poblacion;
  if (r.startsWith('PROVINCIA')) return p.provincia;
  // (MN escribe a veces "Télefono": sin tildes queda igual)
  if (r.startsWith('TELEFON')) return p.telefono || p.movil;
  if (r.startsWith('MOVIL')) return p.movil;
  if (r.startsWith('CORREO') || r.startsWith('EMAIL') || r.startsWith('E_MAIL')) return p.email;
  if (r.startsWith('NUM_COLEGIADO') || r.startsWith('COLEGIADO')) return p.colegiado;
  if (r.startsWith('TIPO')) return p.tipo;
  if (r.startsWith('PAIS')) return p.pais;
  if (r.startsWith('FECHA_NACIMIENTO')) return p.nacimiento ? fechaCorta(p.nacimiento) : p.nacimiento;
  if (r === 'EDAD' && p.nacimiento) { const n = new Date(p.nacimiento), h = new Date(); let e = h.getFullYear() - n.getFullYear(); if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) e--; return String(e); }
  return undefined;
}

function campoExpediente(exp: any, resto: string): string | undefined {
  if (!exp) return undefined;
  const r = resto;
  if (r.startsWith('ANO')) return exp.anio ? String(exp.anio) : '';
  if (r.startsWith('NUM_EXPEDIENTE') || r === 'NUMERO') return exp.num_exp ? `${exp.anio}/${exp.num_exp}` : '';
  if (r.startsWith('NUM_ASUNTO')) return exp.num_exp ? String(exp.num_exp) : '';
  if (r.startsWith('NUM_AUTOS')) return exp.num_autos || '';
  if (r.startsWith('NIG')) return exp.nig || '';
  if (r.startsWith('REF_EXPEDIENTE')) return exp.ref_expediente || '';
  if (r.startsWith('REF_PROPIA')) return exp.ref_propia || '';
  if (r.startsWith('DESCRIPCION')) return exp.descripcion || '';
  if (r.startsWith('ESTADO')) return exp.estado || '';
  if (r.startsWith('FECHA_ALTA')) return fechaCorta(exp.fecha_inicio || exp.created_at);
  if (r.startsWith('FECHA_CIERRE') && !r.includes('OBRA')) return fechaCorta(exp.fecha_cierre);
  if (r.startsWith('CUANTIA')) return euros(exp.cuantia_total ?? exp.cuantia_principal ?? exp.importe);
  if (r.startsWith('TIPO_DE_PROCEDIMIEN') || r.startsWith('TIPO_PROCEDIMIENT')) return exp.tipo_proc || '';
  if (r.startsWith('TIPO_DE_EXPEDIENTE')) return exp.tipo || '';
  if (r.startsWith('TIPO_DE_ASUNTO')) return exp.tipos_asunto || '';
  if (r.startsWith('TODOS_LOS_CLIENTES')) return exp.demandantes || exp.cliente_nombre || '';
  if (r.startsWith('TODOS_LOS_CONTRARIO')) return exp.demandados || exp.contrario || '';
  if (r.startsWith('ETAPA') || r.startsWith('FASE_PROCEDIMIENTO')) return exp.etapa || '';
  if (r.startsWith('USUARIO')) return exp.abogado_propio || '';
  if (r === 'NOTAS' || r.startsWith('COMENTARIOS') || r.startsWith('OBSERVACIONES')) return exp.observaciones || '';
  return undefined;
}

/** Valor que Vantia tiene para un campo, o undefined si no lo guarda. */
export function valorVantia(nombre: string, ctx: Contexto): string | undefined {
  const clave = claveCanonica(nombre);
  if (clave.endsWith('FECHA_IMPRESION_LARGA')) return fechaLarga(new Date());
  if (clave.endsWith('FECHA_IMPRESION')) return fechaCorta(new Date());
  const { grupo, resto } = grupoDe(clave);
  switch (grupo) {
    case 'Despacho':
      if (resto.startsWith('LOGO')) return undefined; // imagen: pendiente
      return campoPersona(ctx.org, resto);
    case 'Expediente': return clave.startsWith('TIPOS_DE_PROCEDIMIENTO') ? (ctx.exp?.tipo_proc || '') : campoExpediente(ctx.exp, resto);
    case 'Cliente': return campoPersona(ctx.cliente, resto);
    case 'Contrario': return campoPersona(ctx.contrario, resto);
    case 'Juzgado':
      if (resto.startsWith('NUM_AUTOS')) return ctx.juzgado.autos;
      if (resto.startsWith('NIG')) return ctx.exp?.nig || '';
      if (resto.startsWith('FASE')) return ctx.exp?.etapa || '';
      return campoPersona(ctx.juzgado, resto);
    case 'Procurador': return campoPersona(ctx.procurador, resto);
    case 'Procurador contrario': return campoPersona(ctx.procuradorContrario, resto);
    case 'Abogado': return campoPersona(ctx.abogado, resto);
    case 'Abogado contrario': return campoPersona(ctx.abogadoContrario, resto);
    default: return undefined;
  }
}

// ── Lectura de datos ────────────────────────────────────────────────────────

/** "C/ Mayor 12, 07001 Palma, Illes Balears" → dirección, CP, población, provincia. */
function partirDireccion(txt?: string | null): Persona {
  if (!txt) return {};
  const limpio = txt.replace(/\s+/g, ' ').trim();
  const m = limpio.match(/^(.*?)[,\s]+(\d{5})\s+([^,(]+?)(?:\s*[,(]\s*([^,)]+)\)?)?\s*$/);
  if (!m) return { direccion: limpio };
  return { direccion: m[1].replace(/,\s*$/, ''), cp: m[2], poblacion: m[3].trim(), provincia: (m[4] || '').trim() };
}

/** "Juzgado de lo Social nº 3 de Palma" → "Palma". */
function poblacionJuzgado(nombre?: string | null): string {
  const n = (nombre || '').trim();
  // "... nº 3 de Palma de Mallorca" → lo que sigue al número
  const tras = n.match(/n[º°o.]\s*\d+\s+de\s+(.+)$/i);
  if (tras) return tras[1].trim();
  // si no, lo que sigue al último "de" con mayúscula: "Audiencia Provincial de Palma"
  const m = n.match(/.*\bde\s+([A-ZÁÉÍÓÚÑ][^,]*)$/);
  return m ? m[1].trim() : '';
}

const nombreDe = (r: any) => [r?.first_name, r?.last_name].filter(Boolean).join(' ').trim() || r?.commercial_name || '';

function personaDe(r: any, nombreTexto?: string | null): Persona {
  if (!r) return { nombre: nombreTexto || '' };
  return {
    nombre: nombreDe(r) || nombreTexto || '',
    nif: r.nif_cif || '', direccion: r.address_street || '', cp: r.address_cp || '',
    poblacion: r.address_town || '', provincia: r.address_province || '',
    telefono: r.phone_1 || '', movil: r.phone_mobile || r.mobile || '', email: r.email || '',
    colegiado: r.num_colegiado || '', tipo: r.type || r.tipo || '',
    pais: r.address_country || '', nacimiento: r.birth_date || '',
  };
}

/** Busca en el directorio del despacho a un profesional por su nombre. */
async function delDirectorio(organizacionId: string, tipos: string[], nombre?: string | null) {
  const n = (nombre || '').trim();
  if (!n) return null;
  const { rows } = await pool.query(
    `SELECT * FROM directorio_profesionales
      WHERE organizacion_id = $1 AND UPPER(tipo) = ANY($2::text[])
        AND LOWER(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))) = LOWER($3)
      LIMIT 1`,
    [organizacionId, tipos, n],
  ).catch(() => ({ rows: [] as any[] }));
  return rows[0] || null;
}

export async function contextoPlantilla(organizacionId: string, expedienteId?: string | null): Promise<Contexto> {
  const { rows: org } = await pool.query(`SELECT nombre, nif_cif, direccion_fiscal FROM organizaciones WHERE id = $1`, [organizacionId]);
  const o = org[0] || {};
  const ctx: Contexto = {
    org: { nombre: o.nombre || '', nif: o.nif_cif || '', ...partirDireccion(o.direccion_fiscal) },
    exp: null, cliente: {}, contrario: {}, juzgado: {}, procurador: {}, procuradorContrario: {}, abogado: {}, abogadoContrario: {},
  };
  if (!expedienteId) return ctx;
  const { rows } = await pool.query(`SELECT * FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [expedienteId, organizacionId]);
  const exp = rows[0];
  if (!exp) return ctx;
  ctx.exp = exp;
  if (exp.cliente_id) {
    const { rows: c } = await pool.query(`SELECT * FROM entities WHERE id = $1 AND organizacion_id = $2`, [exp.cliente_id, organizacionId]);
    ctx.cliente = personaDe(c[0], exp.cliente_nombre);
  } else ctx.cliente = { nombre: exp.cliente_nombre || '' };
  ctx.contrario = personaDe(await delDirectorio(organizacionId, ['CONTRARIO'], exp.contrario), exp.contrario);
  ctx.procurador = personaDe(await delDirectorio(organizacionId, ['PROCURADOR'], exp.procurador), exp.procurador);
  ctx.procuradorContrario = personaDe(await delDirectorio(organizacionId, ['PROCURADOR'], exp.procurador_contrario), exp.procurador_contrario);
  ctx.abogado = personaDe(await delDirectorio(organizacionId, ['ABOGADO'], exp.abogado_propio), exp.abogado_propio);
  ctx.abogadoContrario = personaDe(await delDirectorio(organizacionId, ['ABOGADO'], exp.abogado_contrario), exp.abogado_contrario);
  ctx.juzgado = { nombre: exp.juzgado || '', poblacion: poblacionJuzgado(exp.juzgado), autos: exp.num_autos || '' };
  return ctx;
}

// ── Valores escritos a mano (se recuerdan) ──────────────────────────────────

/** Los de "Despacho" valen para todo el despacho; el resto, para ese expediente. */
export const esDeDespacho = (nombre: string) => grupoDe(claveCanonica(nombre)).grupo === 'Despacho';

export async function valoresGuardados(organizacionId: string, expedienteId?: string | null): Promise<Map<string, string>> {
  const { rows } = await pool.query(
    `SELECT clave, valor, expediente_id FROM plantillas_valores
      WHERE organizacion_id = $1 AND (expediente_id IS NULL OR expediente_id = $2)
      ORDER BY (expediente_id IS NULL) DESC`,
    [organizacionId, expedienteId || null],
  ).catch(() => ({ rows: [] as any[] }));
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.clave, r.valor); // los del expediente, después: mandan
  return m;
}

export async function guardarValores(organizacionId: string, expedienteId: string | null, userId: string, valores: Record<string, string>) {
  for (const [nombre, valorBruto] of Object.entries(valores)) {
    const clave = claveCanonica(nombre);
    if (!clave) continue;
    const valor = String(valorBruto ?? '').slice(0, 5000);
    const exp = esDeDespacho(nombre) ? null : expedienteId;
    if (!valor.trim()) {
      await pool.query(
        `DELETE FROM plantillas_valores WHERE organizacion_id = $1 AND clave = $2 AND expediente_id IS NOT DISTINCT FROM $3`,
        [organizacionId, clave, exp],
      );
      continue;
    }
    await pool.query(
      `INSERT INTO plantillas_valores (organizacion_id, expediente_id, clave, valor, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organizacion_id, (COALESCE(expediente_id, '00000000-0000-0000-0000-000000000000'::uuid)), clave)
       DO UPDATE SET valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [organizacionId, exp, clave, valor, userId],
    );
  }
}
