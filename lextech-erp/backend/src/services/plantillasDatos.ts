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
  | 'Procurador' | 'Procurador contrario' | 'Abogado' | 'Abogado contrario' | 'Contacto' | 'Otros';

type Persona = Partial<{
  nombre: string; nif: string; direccion: string; cp: string; poblacion: string; provincia: string;
  telefono: string; movil: string; email: string; colegiado: string; tipo: string; pais: string; nacimiento: string;
  telefono2: string; telefono3: string; fax: string; web: string; nacionalidad: string; sexo: string;
  alta: string; baja: string; estado: string; numero: string; comercial: string; notas: string;
  iban: string;     // despacho: cuenta de Facturación / Quipu
  cuenta: string;   // procurador: cuenta de consignaciones (Directorio)
}>;

interface Contexto {
  org: Persona & { nombre?: string };
  exp: any | null;
  /** Última actuación del expediente (Datos_del_Expediente_Última_Actuación_*). */
  ultimaActuacion?: { titulo?: string; fecha?: any; notas?: string } | null;
  /** Suma de los abonos (lo cobrado) de los apuntes económicos del expediente. */
  totalCobrado?: number | null;
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
  ['DATOS_CLIENTES', 'Cliente'], ['DATOS_CLIENTE', 'Cliente'], ['CLIENTE_PRINCIPAL', 'Cliente'], ['CLIENTE_LINEA', 'Cliente'], ['LISTADO_DE_CLIENTES', 'Cliente'], ['CLIENTES', 'Cliente'], ['CLIENTE', 'Cliente'],
  ['CONTRARIO_PRINCIPAL', 'Contrario'], ['CONTRARIOS_LINEA', 'Contrario'], ['TODOS_LOS_CONTRARIOS', 'Contrario'], ['CONTRARIOS', 'Contrario'], ['CONTRARIO', 'Contrario'],
  ['JUZGADO_PRINCIPAL', 'Juzgado'], ['JUZGADOS_POR_LINEAS', 'Juzgado'], ['JUZGADOS', 'Juzgado'], ['JUZGADO', 'Juzgado'],
  ['PROCURADOR_PROPIO_PRINCIPAL', 'Procurador'], ['LISTADO_DE_PROCURADORES_PROPIOS', 'Procurador'], ['PROCURADORES_PROPIOS_POR_LINEA', 'Procurador'], ['PROCURADORES_PROPIOS', 'Procurador'],
  ['PROCURADOR_CONTRARIO_PRINCIPAL', 'Procurador contrario'], ['LISTADO_DE_PROCURADORES_CONTRARIOS', 'Procurador contrario'], ['PROCURADORES_CONTRARIOS_POR_LINEA', 'Procurador contrario'], ['PROCURADORES_CONTRARIOS', 'Procurador contrario'],
  ['ABOGADO_PROPIO_PRINCIPAL', 'Abogado'], ['LISTADO_DE_ABOGADOS_PROPIOS', 'Abogado'], ['ABOGADOS_PROPIOS_POR_LINEA', 'Abogado'], ['ABOGADOS_PROPIOS', 'Abogado'],
  ['ABOGADO_CONTRARIO_PRINCIPAL', 'Abogado contrario'], ['LISTADO_DE_ABOGADOS_CONTRARIOS', 'Abogado contrario'], ['ABOGADOS_CONTRARIOS_POR_LINEA', 'Abogado contrario'], ['ABOGADOS_CONTRARIOS', 'Abogado contrario'],
  ['CONTACTOS_ASOCIADOS', 'Contacto'], ['PERSONAS_DE_CONTACTO', 'Contacto'], ['CONTACTOS', 'Contacto'], ['CONTACTO', 'Contacto'],
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
  if (/FECHA_IMPRESION/.test(clave)) return clave.endsWith('LARGA') ? 'Fecha de hoy (larga)' : 'Fecha de hoy';
  const { grupo, resto } = grupoDe(clave);
  if (grupo === 'Otros' || !resto) return nombreOriginal.replace(/_+/g, ' ').trim();
  // Se quita del nombre original el mismo número de "palabras" que el prefijo.
  const palabrasPrefijo = clave.split('_').length - resto.split('_').length;
  return nombreOriginal.split(/_+/).slice(palabrasPrefijo).join(' ').trim() || nombreOriginal;
}

// Los mismos nombres que ve el despacho (frontend: ExpedienteModal TIPOS).
const TIPOS_EXPEDIENTE: Record<string, string> = {
  judicial: 'Expediente Judicial', extrajudicial: 'Expediente Extrajudicial', monitorio: 'Monitorio',
  obligacion_hacer: 'Obligación de Hacer', prejudicial: 'Prejudicial', diligencias: 'Diligencias Previas',
  penal: 'Penal', laboral: 'Laboral', contencioso: 'Contencioso-Administrativo', otro: 'Otro',
};

const fechaCorta = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const fechaLarga = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
const euros = (n: any) => (n == null || n === '' ? '' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }));

/** Campo de una persona (cliente, contrario, procurador...). */
/** ¿El resto del campo es este dato? Admite que MN lo haya cortado
 *  ("CODIGO_POSTA", "NUM_COLEGIAD", "NOMBR") y variantes con sufijo ("TELEFONO_1"). */
function es(r: string, ...nombres: string[]): boolean {
  return nombres.some((n) => r === n || r.startsWith(n + '_') || r.startsWith(n) || (r.length >= 4 && n.startsWith(r)));
}

function campoPersona(p: Persona, resto: string): string | undefined {
  // "Clientes_Principal_Nombre", "Contrarios_Línea_NIF/CIF": el principal o el de la línea es el mismo dato.
  const r = resto.replace(/^(PRINCIPAL|LINEA|POR_LINEA)_/, '');
  if (!r || es(r, 'NOMBRE_COMERCIAL')) return r ? (p.comercial || p.nombre) : p.nombre;
  if (es(r, 'NOMBRE', 'NOMBRE_Y_APELLIDOS', 'RAZON_SOCIAL')) return p.nombre;
  if (es(r, 'NIF', 'NIF_CIF', 'DNI', 'NIE', 'CIF')) return p.nif;
  if (es(r, 'DIRECCION', 'DOMICILIO')) return p.direccion;
  if (es(r, 'CODIGO_POSTAL', 'CP', 'C_P')) return p.cp;
  if (es(r, 'POBLACION', 'MUNICIPIO', 'LOCALIDAD', 'CIUDAD')) return p.poblacion;
  if (es(r, 'PROVINCIA')) return p.provincia;
  if (es(r, 'PAIS')) return p.pais;
  // (MN escribe a veces "Télefono": sin tildes queda igual)
  // Solo con el número entero: "TELEF" cortado es el teléfono principal.
  if (r.startsWith('TELEFONO_2')) return p.telefono2;
  if (r.startsWith('TELEFONO_3')) return p.telefono3;
  if (es(r, 'TELEFONO')) return p.telefono || p.movil;
  if (es(r, 'MOVIL')) return p.movil;
  if (es(r, 'FAX')) return p.fax;
  if (es(r, 'CORREO_ELECTRONICO', 'CORREO', 'EMAIL', 'E_MAIL')) return p.email;
  if (es(r, 'PAGINA_WEB', 'WEB')) return p.web;
  if (es(r, 'NUM_COLEGIADO', 'COLEGIADO', 'N_COLEGIADO')) return p.colegiado;
  if (es(r, 'NACIONALIDAD')) return p.nacionalidad;
  if (es(r, 'SEXO')) return p.sexo;
  if (es(r, 'FECHA_DE_ALTA', 'FECHA_ALTA')) return p.alta ? fechaCorta(p.alta) : p.alta;
  if (es(r, 'FECHA_BAJA', 'FECHA_DE_BAJA')) return p.baja ? fechaCorta(p.baja) : p.baja;
  if (es(r, 'FECHA_NACIMIENTO', 'FECHA_DE_NACIMIENTO')) return p.nacimiento ? fechaCorta(p.nacimiento) : p.nacimiento;
  if (r === 'EDAD') {
    if (!p.nacimiento) return p.nacimiento;
    const n = new Date(p.nacimiento), h = new Date();
    let e = h.getFullYear() - n.getFullYear();
    if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) e--;
    return String(e);
  }
  if (es(r, 'CODIGO_DE_CUENTA_IBAN', 'IBAN')) return p.iban;
  if (es(r, 'CCC_PROCURADOR', 'CUENTA_CONSIGNACIONES', 'CCC')) return p.cuenta;
  if (es(r, 'NUMERO_CLIENTE', 'NUM_CLIENTE')) return p.numero;
  if (es(r, 'ESTADO')) return p.estado;
  if (es(r, 'NOTAS', 'OBSERVACIONES')) return p.notas;
  if (es(r, 'TIPO_CLIENTE', 'TIPO_CONTACTO', 'TIPO')) return p.tipo;
  return undefined;
}

function campoExpediente(exp: any, resto: string, ctx?: Contexto): string | undefined {
  if (!exp) return undefined;
  const r = resto;
  // Última actuación: "Datos_del_Expediente_Última_Actuación_Fecha_Actuación"...
  if (r.startsWith('ULTIMA_ACTUACION')) {
    const a = ctx?.ultimaActuacion;
    const sub = r.slice('ULTIMA_ACTUACION'.length).replace(/^_/, '');
    if (!sub || es(sub, 'ACTUACION')) return a?.titulo || '';
    if (es(sub, 'FECHA_ACTUACION', 'FECHA')) return a?.fecha ? fechaCorta(a.fecha) : '';
    if (es(sub, 'NOTAS')) return a?.notas || '';
    return undefined;
  }
  if (r.startsWith('USUARIOS')) return es(r.slice(9), 'NOMBRE') || r === 'USUARIOS' ? (exp.abogado_propio || '') : undefined;
  if (es(r, 'ANO_EXPEDIENTE', 'ANO_EXP', 'ANO')) return exp.anio ? String(exp.anio) : '';
  if (es(r, 'NUM_EXPEDIENTE', 'NUMERO_EXPEDIENTE') || r === 'NUMERO') return exp.num_exp ? `${exp.anio}/${exp.num_exp}` : '';
  if (es(r, 'NUM_ASUNTO')) return exp.num_exp ? String(exp.num_exp) : '';
  if (es(r, 'NUM_AUTOS', 'NUMERO_AUTOS')) return exp.num_autos || '';
  if (r === 'NIG' || r.startsWith('NIG_')) return exp.nig || '';
  if (es(r, 'REF_EXPEDIENTE', 'REFERENCIA_EXPEDIENTE')) return exp.ref_expediente || '';
  if (es(r, 'REF_PROPIA', 'REFERENCIA_PROPIA')) return exp.ref_propia || '';
  if (es(r, 'DESCRIPCION_EXPEDIENTE', 'DESCRIPCION')) return exp.descripcion || '';
  if (es(r, 'ESTADO_EXPEDIENTE', 'ESTADO')) return exp.estado || '';
  if (es(r, 'FECHA_ALTA', 'FECHA_DE_ALTA', 'FECHA_ENCARGO', 'FECHA_INICIO')) return fechaCorta(exp.fecha_inicio || exp.created_at);
  if (es(r, 'FECHA_CIERRE') && !r.includes('OBRA')) return fechaCorta(exp.fecha_cierre);
  if (es(r, 'FECHA_NOTIFICACION')) return fechaCorta(exp.fecha_notificacion);
  if (es(r, 'CUANTIA')) return euros(exp.cuantia_total ?? exp.cuantia_principal ?? exp.importe);
  if (es(r, 'TIPO_DE_PROCEDIMIENTO', 'TIPO_PROCEDIMIENTO')) return exp.tipo_proc || '';
  if (es(r, 'TIPO_DE_EXPEDIENTE', 'TIPO_EXPEDIENTE')) return TIPOS_EXPEDIENTE[exp.tipo] || exp.tipo || '';
  if (es(r, 'TIPO_DE_ASUNTO', 'TIPOS_DE_ASUNTO', 'TIPO_ASUNTO')) return exp.tipos_asunto || '';
  if (es(r, 'TODOS_LOS_CLIENTES')) return exp.demandantes || exp.cliente_nombre || '';
  if (es(r, 'TODOS_LOS_CONTRARIOS')) return exp.demandados || exp.contrario || '';
  if (es(r, 'ETAPA', 'FASE_PROCEDIMIENTO', 'FASE')) return exp.etapa || '';
  if (es(r, 'USUARIO')) return exp.abogado_propio || '';
  if (es(r, 'CENTRO')) return exp.centro || '';
  if (es(r, 'TOTAL_COBRO', 'TOTAL_COBROS', 'TOTAL_COBRADO')) return ctx?.totalCobrado != null ? euros(ctx.totalCobrado) : '';
  if (r === 'NOTAS' || es(r, 'COMENTARIOS', 'OBSERVACIONES')) return exp.observaciones || '';
  return undefined;
}

/** Valor que Vantia tiene para un campo, o undefined si no lo guarda. */
export function valorVantia(nombre: string, ctx: Contexto): string | undefined {
  const clave = claveCanonica(nombre);
  // "Tipo_de_Expediente_Descripción", "Tipos_de_Asunto_Tipo_de_Asunto" (macros avanzadas)
  if (clave.startsWith('TIPO_DE_EXPEDIENTE')) return ctx.exp ? (TIPOS_EXPEDIENTE[ctx.exp.tipo] || ctx.exp.tipo || '') : undefined;
  if (clave.startsWith('TIPOS_DE_ASUNTO')) return ctx.exp ? (ctx.exp.tipos_asunto || '') : undefined;
  if (clave.endsWith('FECHA_IMPRESION_LARGA')) return fechaLarga(new Date());
  if (clave.endsWith('FECHA_IMPRESION')) return fechaCorta(new Date());
  const { grupo, resto } = grupoDe(clave);
  switch (grupo) {
    case 'Despacho':
      if (resto.startsWith('LOGO')) return undefined; // imagen: pendiente
      return campoPersona(ctx.org, resto);
    case 'Expediente': return clave.startsWith('TIPOS_DE_PROCEDIMIENTO') ? (ctx.exp?.tipo_proc || '') : campoExpediente(ctx.exp, resto, ctx);
    case 'Cliente': return campoPersona(ctx.cliente, resto);
    case 'Contrario':
      if (es(resto, 'ABOGADO_CONTRARIO')) return ctx.abogadoContrario.nombre;
      if (es(resto, 'PROCURADOR_CONTRARIO')) return ctx.procuradorContrario.nombre;
      return campoPersona(ctx.contrario, resto);
    case 'Juzgado':
      if (resto.startsWith('NUM_AUTOS')) return ctx.juzgado.autos;
      if (resto.startsWith('NIG')) return ctx.exp?.nig || '';
      if (resto.startsWith('FASE')) return ctx.exp?.etapa || '';
      return campoPersona(ctx.juzgado, resto);
    case 'Procurador': return campoPersona(ctx.procurador, resto);
    case 'Procurador contrario': return campoPersona(ctx.procuradorContrario, resto);
    case 'Abogado': return campoPersona(ctx.abogado, resto);
    case 'Abogado contrario': return campoPersona(ctx.abogadoContrario, resto);
    // La persona de contacto del expediente (solo su nombre y lo que se haya escrito)
    case 'Contacto': return es(resto.replace(/^(PRINCIPAL|LINEA)_/, ''), 'NOMBRE') || !resto ? (ctx.exp?.persona_contacto || ctx.exp?.contacto || '') : undefined;
    default: return undefined;
  }
}

// ── Lectura de datos ────────────────────────────────────────────────────────

/** "C/ Mayor 12, 07001 Palma, Illes Balears" → dirección, CP, población, provincia. */
export function partirDireccion(txt?: string | null): Persona {
  if (!txt) return {};
  const limpio = txt.replace(/\s+/g, ' ').trim();
  const cp = limpio.match(/\b(\d{5})\b/)?.[1] || '';
  const provincia = limpio.match(/\(([^()]+)\)\s*(?:[-,]\s*\d{5})?\s*$/)?.[1]?.trim()
    || limpio.match(/\(([^()]+)\)/)?.[1]?.trim() || '';
  // Trozos separados por " - " o comas
  const trozos = limpio.split(/\s+-\s+|,\s*/).map((t) => t.trim()).filter(Boolean);
  let poblacion = '';
  const conParentesis = trozos.find((t) => /\(/.test(t));
  if (conParentesis) poblacion = conParentesis.replace(/\(.*$/, '').replace(/\b\d{5}\b/, '').trim();
  else {
    const conCp = trozos.find((t) => /\b\d{5}\b/.test(t));
    if (conCp) poblacion = conCp.replace(/\b\d{5}\b/, '').trim() || trozos[trozos.indexOf(conCp) + 1] || '';
  }
  // La dirección: lo que va antes de la población / el CP
  const corte = trozos.findIndex((t) => t === conParentesis || /^\d{5}\b/.test(t) || (poblacion && t.startsWith(poblacion)) || /\b\d{5}\b/.test(t) && !/\d{5}.*\d/.test(t.replace(/\b\d{5}\b/, '')));
  const direccion = (corte > 0 ? trozos.slice(0, corte) : trozos.filter((t) => !/\b\d{5}\b/.test(t) && t !== conParentesis)).join(', ');
  // Población en mayúsculas ("ORIHUELA") → "Orihuela"
  const bonita = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : t);
  return { direccion, cp, poblacion: bonita(poblacion), provincia: bonita(provincia) };
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
    comercial: r.commercial_name || '',
    nif: r.nif_cif || '', direccion: r.address_street || '', cp: r.address_cp || '',
    poblacion: r.address_town || '', provincia: r.address_province || '', pais: r.address_country || '',
    telefono: r.phone_1 || '', telefono2: r.phone_2 || '', telefono3: r.phone_3 || '',
    movil: r.phone_mobile || r.mobile || '', fax: r.phone_fax || r.fax || '', email: r.email || '', web: r.website || '',
    colegiado: r.num_colegiado || '', tipo: r.type || r.tipo || '',
    nacimiento: r.birth_date || '', nacionalidad: r.nationality || '',
    sexo: r.gender === 'M' ? 'Hombre' : r.gender === 'F' ? 'Mujer' : (r.gender || ''),
    alta: r.date_alta || '', baja: r.date_baja || '', estado: r.client_status || r.estado || '',
    numero: r.internal_number != null ? String(r.internal_number) : '',
    notas: r.observaciones || r.notes || '',
    cuenta: r.cuenta_consignaciones || '',
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

/** Con expediente: todo. Sin expediente pero con cliente (plantilla usada
 *  desde la ficha del cliente): los datos del despacho y del cliente. */
export async function contextoPlantilla(organizacionId: string, expedienteId?: string | null, clienteId?: string | null): Promise<Contexto> {
  const { rows: org } = await pool.query(`SELECT nombre, nif_cif, direccion_fiscal, telefono, email_contacto, web FROM organizaciones WHERE id = $1`, [organizacionId]);
  const o = org[0] || {};
  // IBAN del despacho: su cuenta de Facturación o, si no tiene, la de Quipu.
  const ibanDe = (sql: string) => pool.query(sql, [organizacionId]).then((r) => r.rows[0]?.iban || '').catch(() => '');
  const ibanDespacho = (await ibanDe(`SELECT iban FROM billing_bank_accounts
        WHERE organizacion_id = $1 AND COALESCE(iban, '') <> '' ORDER BY created_at LIMIT 1`))
    || (await ibanDe(`SELECT q.iban FROM quipu_bank_accounts q JOIN quipu_settings s ON s.id = q.quipu_setting_id
        WHERE s.organizacion_id = $1 AND COALESCE(q.iban, '') <> '' ORDER BY q.created_at LIMIT 1`));
  const ctx: Contexto = {
    org: {
      nombre: o.nombre || '', nif: o.nif_cif || '', iban: ibanDespacho,
      telefono: o.telefono || '', email: o.email_contacto || '', web: o.web || '',
      ...partirDireccion(o.direccion_fiscal),
    },
    exp: null, cliente: {}, contrario: {}, juzgado: {}, procurador: {}, procuradorContrario: {}, abogado: {}, abogadoContrario: {},
  };
  if (!expedienteId) {
    if (clienteId) {
      const { rows: c } = await pool.query(`SELECT * FROM entities WHERE id = $1 AND organizacion_id = $2`, [clienteId, organizacionId]);
      if (c[0]) ctx.cliente = personaDe(c[0]);
      (ctx as any).clienteEncontrado = Boolean(c[0]);
    }
    return ctx;
  }
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
  const { rows: act } = await pool.query(
    `SELECT titulo, COALESCE(plazo, created_at) AS fecha, COALESCE(NULLIF(descripcion, ''), notas) AS notas
       FROM client_tasks WHERE expediente_id = $1 AND organizacion_id = $2 AND tipo = 'actuacion'
      ORDER BY COALESCE(plazo, created_at) DESC LIMIT 1`,
    [expedienteId, organizacionId],
  ).catch(() => ({ rows: [] as any[] }));
  ctx.ultimaActuacion = act[0] || null;
  const { rows: cob } = await pool.query(
    `SELECT SUM(importe) FILTER (WHERE tipo = 'abono') AS cobrado, COUNT(*) AS n FROM expediente_apuntes WHERE expediente_id = $1`, [expedienteId],
  ).catch(() => ({ rows: [] as any[] }));
  ctx.totalCobrado = Number(cob[0]?.n) > 0 ? Number(cob[0]?.cobrado || 0) : null;
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
    if (!esDeDespacho(nombre) && !expedienteId) continue;
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

// ── Logo del despacho (se inserta como imagen en «Empresa_Logo_de_Empresa») ──
export const esCampoLogo = (nombre: string) => {
  const c = claveCanonica(nombre);
  return c.includes('LOGO') && grupoDe(c).grupo === 'Despacho';
};

/** El logo de Mi Despacho (guardado en misc_uploads), o null si no hay. */
export async function logoDespacho(organizacionId: string): Promise<{ buffer: Buffer; mime: string; url: string } | null> {
  const { rows } = await pool.query(`SELECT logo_url FROM organizaciones WHERE id = $1`, [organizacionId]).catch(() => ({ rows: [] as any[] }));
  const url: string | undefined = rows[0]?.logo_url;
  if (!url) return null;
  const archivo = url.split('/').pop() || '';
  const { rows: m } = await pool.query(
    `SELECT mimetype, data FROM misc_uploads WHERE filename = $1 AND kind = 'org_logo'`, [archivo],
  ).catch(() => ({ rows: [] as any[] }));
  if (m[0]?.data) return { buffer: Buffer.from(m[0].data), mime: m[0].mimetype || 'image/png', url };
  return null;
}
