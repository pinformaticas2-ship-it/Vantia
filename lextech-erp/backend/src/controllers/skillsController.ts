import { Request, Response } from 'express';
import pool from '../config/database';
import { resolveUserName } from './activityController';

// Skills de la IA (30/10/2026): instrucciones reutilizables que la IA sigue al
// redactar. Cada despacho tiene las suyas (Ajustes → Skills). Tres tipos:
// - documento: cómo redactar un tipo de escrito concreto (demanda, burofax...).
//   Se elige en el editor de Documentos o la IA la aplica sola en Chat IA
//   cuando la petición encaja.
// - estilo: se aplica SIEMPRE que la IA redacta (formato, tono, firma...).
// - tarea: otras formas de trabajar (resumir, revisar un contrato...).
// Las verá la IA del editor y, si en_chat, también Chat IA.

export const CATEGORIAS = ['documento', 'estilo', 'tarea'] as const;

const ok = (res: Response, data: any, status = 200) => res.status(status).json({ success: true, data });
const fallo = (res: Response, error: string, status = 500) => res.status(status).json({ success: false, error });
const texto = (v: any, max: number) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const esGestor = (req: any) => ['propietario', 'admin'].includes(req.organizacionRol);

// Skills con las que empieza cada despacho; se pueden editar o borrar.
export const SKILLS_INICIALES: { nombre: string; descripcion: string; categoria: string; instrucciones: string }[] = [
  {
    nombre: 'Estilo del despacho',
    categoria: 'estilo',
    descripcion: 'Formato y tono de todo lo que redacta la IA.',
    instrucciones: [
      'Redacta en español de España, con tono jurídico claro y sin fórmulas arcaicas innecesarias.',
      'Usa los datos reales del expediente y del cliente cuando estén disponibles. NUNCA inventes nombres, DNI, importes, fechas ni números de procedimiento: si falta un dato, deja un hueco visible así: [●].',
      'Cita la normativa con su nombre completo la primera vez (p. ej., Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil) y abreviada después (LEC).',
      'Fechas en formato "30 de octubre de 2026". Importes con separador de miles y dos decimales: 1.250,00 €.',
    ].join('\n'),
  },
  {
    nombre: 'Demanda de juicio verbal (reclamación de cantidad)',
    categoria: 'documento',
    descripcion: 'Demanda para reclamar cantidades de hasta 15.000 € (art. 250.2 LEC).',
    instrucciones: [
      'Estructura: encabezamiento "AL JUZGADO DE PRIMERA INSTANCIA DE [●] QUE POR TURNO CORRESPONDA"; comparecencia (procurador si procede, en nombre de quien actúa, con sus datos); "EXPONE"; HECHOS numerados (PRIMERO, SEGUNDO...); FUNDAMENTOS DE DERECHO (jurisdicción y competencia, capacidad, legitimación, postulación, procedimiento, fondo, intereses y costas); "SUPLICO AL JUZGADO"; OTROSÍES si proceden; lugar, fecha y firmas de abogado y procurador.',
      'Indica la cuantía y su cálculo. Si la cuantía no supera 2.000 €, recuerda que no es preceptiva la intervención de abogado ni procurador (art. 23 y 31 LEC).',
      'Enumera al final los documentos que se acompañan (documento nº 1, nº 2...).',
    ].join('\n'),
  },
  {
    nombre: 'Burofax de reclamación previa',
    categoria: 'documento',
    descripcion: 'Requerimiento extrajudicial de pago o de cumplimiento antes de demandar.',
    instrucciones: [
      'Carta breve y firme: remitente (cliente, a través del despacho), destinatario, lugar y fecha.',
      'Expón en pocos párrafos el origen de la deuda u obligación, el importe exacto o lo que se exige, y concede un plazo concreto (por defecto 10 días naturales) para cumplir.',
      'Advierte de que, si no se atiende, se ejercitarán las acciones judiciales oportunas con reclamación de intereses y costas.',
      'Sin tecnicismos innecesarios: lo va a leer alguien que no es jurista.',
    ].join('\n'),
  },
  {
    nombre: 'Hoja de encargo profesional',
    categoria: 'documento',
    descripcion: 'Encargo profesional entre el despacho y el cliente, con honorarios.',
    instrucciones: [
      'Partes (despacho y cliente con sus datos), objeto del encargo detallado, lo que queda fuera del encargo, honorarios (importe o forma de cálculo, provisión de fondos, IVA), gastos y suplidos, duración, obligaciones de ambas partes, protección de datos (RGPD y LOPDGDD), deber de secreto profesional, posibilidad de desistimiento y firma.',
      'Si el expediente no tiene importe de honorarios, deja [●] en vez de inventarlo.',
    ].join('\n'),
  },
  {
    nombre: 'Correo al cliente sobre el estado del asunto',
    categoria: 'documento',
    descripcion: 'Explicar al cliente cómo va su expediente, sin jerga.',
    instrucciones: [
      'Saludo cercano, explica en lenguaje llano qué ha pasado, en qué punto está el asunto y cuál es el siguiente paso, con fechas si las hay.',
      'Si el cliente tiene que hacer algo (enviar documentos, firmar, pagar una provisión), ponlo en una lista clara al final.',
      'Máximo unas 250 palabras. Despedida y firma del despacho.',
    ].join('\n'),
  },
  {
    nombre: 'Resumen del expediente',
    categoria: 'tarea',
    descripcion: 'Resumen interno: partes, hechos, estado, plazos y riesgos.',
    instrucciones: [
      'Secciones: Partes; Objeto del asunto; Situación actual; Próximos plazos (con fechas); Riesgos y puntos débiles; Siguientes pasos recomendados.',
      'Basado solo en los datos del expediente. Si algo no consta, dilo ("no consta") en lugar de suponerlo.',
    ].join('\n'),
  },
];

/** Crea las skills iniciales la primera vez que un despacho entra en Skills o usa la IA. */
export async function sembrarSkills(organizacionId: string): Promise<void> {
  const r = await pool.query(
    `INSERT INTO ia_skills_sembradas (organizacion_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING organizacion_id`,
    [organizacionId],
  );
  if (!r.rowCount) return;
  for (const s of SKILLS_INICIALES) {
    await pool.query(
      `INSERT INTO ia_skills (organizacion_id, nombre, descripcion, instrucciones, categoria) VALUES ($1,$2,$3,$4,$5)`,
      [organizacionId, s.nombre, s.descripcion, s.instrucciones, s.categoria],
    );
  }
}

export interface SkillRow {
  id: string; nombre: string; descripcion: string | null; instrucciones: string;
  categoria: string; activa: boolean; en_chat: boolean;
}

export async function skillsActivas(organizacionId: string, soloChat = false): Promise<SkillRow[]> {
  await sembrarSkills(organizacionId);
  const { rows } = await pool.query(
    `SELECT id, nombre, descripcion, instrucciones, categoria, activa, en_chat FROM ia_skills
      WHERE organizacion_id=$1 AND activa ${soloChat ? 'AND en_chat' : ''} ORDER BY categoria, nombre`,
    [organizacionId],
  );
  return rows;
}

/**
 * Bloque de instrucciones para el prompt de Chat IA: las de estilo siempre;
 * las demás, con nombre y descripción para que la IA decida si aplican.
 * Limitado para no comerse el contexto.
 */
export async function bloqueSkillsParaChat(organizacionId: string): Promise<string> {
  const skills = await skillsActivas(organizacionId, true).catch(() => [] as SkillRow[]);
  if (!skills.length) return '';
  const partes: string[] = [];
  let total = 0;
  for (const s of skills) {
    const t = `### ${s.nombre}${s.categoria === 'estilo' ? ' (aplícala SIEMPRE que redactes)' : ''}\n${s.descripcion ? `${s.descripcion}\n` : ''}${s.instrucciones}`;
    if (total + t.length > 14_000) break;
    partes.push(t);
    total += t.length;
  }
  return `\n\nSKILLS DEL DESPACHO — instrucciones propias de este despacho. Cuando la petición del usuario encaje con una, síguela al pie de la letra (y dilo: "Lo he redactado con la skill «…»"). Las de estilo se aplican siempre que redactes.\n\n${partes.join('\n\n')}`;
}

// GET /api/skills
export async function listarSkills(req: Request, res: Response) {
  try {
    const org = (req as any).organizacionId;
    await sembrarSkills(org);
    const { rows } = await pool.query(
      `SELECT id, nombre, descripcion, instrucciones, categoria, activa, en_chat, updated_by_name, updated_at
         FROM ia_skills WHERE organizacion_id=$1 ORDER BY categoria, nombre`,
      [org],
    );
    return ok(res, { skills: rows, puedeEditar: esGestor(req) });
  } catch (e: any) { return fallo(res, e?.message || 'No se pudieron cargar las skills'); }
}

function leerCuerpo(b: any) {
  const cambios: Record<string, any> = {};
  if ('nombre' in b) cambios.nombre = texto(b.nombre, 120);
  if ('descripcion' in b) cambios.descripcion = texto(b.descripcion, 400);
  if ('instrucciones' in b) cambios.instrucciones = texto(b.instrucciones, 20_000) || '';
  if ('categoria' in b && (CATEGORIAS as readonly string[]).includes(b.categoria)) cambios.categoria = b.categoria;
  if ('activa' in b) cambios.activa = Boolean(b.activa);
  if ('en_chat' in b) cambios.en_chat = Boolean(b.en_chat);
  return cambios;
}

// POST /api/skills
export async function crearSkill(req: Request, res: Response) {
  try {
    if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador pueden crear skills.', 403);
    const org = (req as any).organizacionId;
    const userId = (req as any).auth?.userId;
    const c = leerCuerpo(req.body || {});
    if (!c.nombre) return fallo(res, 'Ponle un nombre a la skill.', 400);
    if (!c.instrucciones) return fallo(res, 'Escribe las instrucciones que debe seguir la IA.', 400);
    const autor = await resolveUserName(userId).catch(() => null);
    const { rows } = await pool.query(
      `INSERT INTO ia_skills (organizacion_id, nombre, descripcion, instrucciones, categoria, activa, en_chat, created_by, updated_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [org, c.nombre, c.descripcion ?? null, c.instrucciones, c.categoria || 'documento', c.activa ?? true, c.en_chat ?? true, userId, autor],
    );
    return ok(res, rows[0], 201);
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo crear la skill'); }
}

// PUT /api/skills/:id
export async function actualizarSkill(req: Request, res: Response) {
  try {
    if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador pueden editar skills.', 403);
    const org = (req as any).organizacionId;
    const c = leerCuerpo(req.body || {});
    if ('nombre' in c && !c.nombre) return fallo(res, 'El nombre no puede quedar vacío.', 400);
    if ('instrucciones' in c && !c.instrucciones) return fallo(res, 'Las instrucciones no pueden quedar vacías.', 400);
    const claves = Object.keys(c);
    if (!claves.length) return fallo(res, 'No hay cambios.', 400);
    const autor = await resolveUserName((req as any).auth?.userId).catch(() => null);
    const sets = claves.map((k, i) => `${k}=$${i + 3}`);
    const { rows } = await pool.query(
      `UPDATE ia_skills SET ${sets.join(', ')}, updated_by_name=$${claves.length + 3}, updated_at=NOW()
        WHERE id=$1 AND organizacion_id=$2 RETURNING *`,
      [req.params.id, org, ...claves.map((k) => c[k]), autor],
    );
    if (!rows.length) return fallo(res, 'Skill no encontrada.', 404);
    return ok(res, rows[0]);
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo guardar la skill'); }
}

// DELETE /api/skills/:id
export async function borrarSkill(req: Request, res: Response) {
  try {
    if (!esGestor(req)) return fallo(res, 'Solo el propietario o un administrador pueden borrar skills.', 403);
    const { rowCount } = await pool.query(
      `DELETE FROM ia_skills WHERE id=$1 AND organizacion_id=$2`, [req.params.id, (req as any).organizacionId],
    );
    if (!rowCount) return fallo(res, 'Skill no encontrada.', 404);
    return ok(res, { borrada: true });
  } catch (e: any) { return fallo(res, e?.message || 'No se pudo borrar la skill'); }
}
