import { Response, Request } from 'express';
import path from 'path';
import pool from '../config/database';
import { performDeleteFile, performRenameFile, performMoveFile, ensureFileOnDisk } from './filesController';
import { logActivityForReq, resolveUserName } from './activityController';
import { extractTextFromFile, type DocFile } from '../utils/docExtract';

const GEMINI_MODEL   = 'gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 5;

// Límites públicos conocidos de la cuenta gratuita de Gemini (Google los
// puede cambiar sin avisar -- se muestran como referencia, no como dato
// verificado en vivo, porque la API no expone un endpoint de cuota).
const GEMINI_FREE_TIER_LIMITS: Record<string, { rpm: number; tpm: number; rpd: number }> = {
  'gemini-2.5-flash': { rpm: 10, tpm: 250_000, rpd: 250 },
};

// Modelos que el selector del frontend puede pedir de verdad (el resto de
// opciones que ofrece el selector -- ChatGPT, Claude, Vincent AI, y también
// Gemini Pro -- son opciones de cara al usuario sin backend funcional
// todavía; si llega uno de esos ids aquí, o cualquier otra cosa no
// reconocida, se cae al modelo por defecto en vez de fallar. gemini-2.5-pro
// se quitó de esta lista: Google lo retiró (404) y su sustituto,
// gemini-3.1-pro-preview, da 429 con la cuenta gratuita actual (cuota 0
// para Pro) -- comprobado a mano contra la API real.
const ALLOWED_GEMINI_MODELS = new Set(['gemini-2.5-flash']);

// ── Prompt base — identidad + capacidades ────────────────────────────────────
const BASE_PROMPT = `Eres Vantia, la inteligencia artificial integrada en VANTIA Legis ERP. Eres un asistente completo, culto y capaz de ayudar con absolutamente cualquier cosa.

QUIÉN ERES:
Eres una IA de última generación con conocimiento amplio en derecho español e internacional, procesal civil y penal, derecho mercantil, fiscal, laboral, hipotecario y constitucional. También dominas redacción jurídica y no jurídica, análisis de documentos, estrategia procesal, doctrina, jurisprudencia del Tribunal Supremo y el TJUE, normativa europea, y conocimiento general en cualquier materia (historia, ciencia, tecnología, economía, medicina, cultura, etc.).

ADEMÁS, tienes acceso en tiempo real a la base de datos de ESTE despacho: clientes, expedientes, tareas, actuaciones, facturas, gastos, presupuestos, agenda, archivos y notas.

CÓMO DEBES COMPORTARTE:
- Responde SIEMPRE en español con naturalidad, precisión y el tono adecuado al contexto (formal si es jurídico, conversacional si es casual).
- Si te preguntan algo de conocimiento general, cultura, ciencia, historia, tecnología, o cualquier tema → responde directamente y en profundidad, sin buscar en la base de datos.
- Si te preguntan por redacción (contratos, escritos, demandas, emails, cartas, informes) → redacta directamente con calidad profesional.
- Si te preguntan por datos REALES del despacho (clientes concretos, expedientes activos, facturas, tareas) → usa las herramientas para obtener datos reales. Nunca inventes nombres, cifras ni referencias.
- Puedes LEER el contenido de los documentos adjuntos a un expediente (PDF, Word, texto e incluso imágenes escaneadas vía OCR) con leer_archivo_expediente, no solo ver su nombre. Úsala en cuanto el usuario pida analizar, resumir, revisar o preguntar algo sobre el contenido de un documento concreto — no te quedes solo con el nombre del archivo cuando lo que hace falta es lo que dice dentro. Tarda algo más que el resto de herramientas (sobre todo si hay que hacer OCR), así que puedes avisar de que estás leyéndolo si la respuesta se demora.
- Puedes gestionar documentos de expedientes (borrarlos, renombrarlos, moverlos a otro expediente, incluidos los que viven en Google Drive), cambiar la descripción de un expediente, crear notas internas sobre un cliente o un expediente, crear y actualizar tareas/actuaciones (incluido marcarlas completadas o borrarlas), y crear citas en la agenda. Para eso usa preparar_borrado_archivo / preparar_renombrado_archivo / preparar_movimiento_archivo / preparar_actualizar_descripcion_expediente / preparar_crear_nota / preparar_crear_tarea / preparar_actualizar_estado_tarea / preparar_eliminar_tarea / preparar_crear_cita. También tienes herramientas de solo lectura para el detalle completo de un cliente o expediente (detalle_cliente, detalle_expediente), el directorio de profesionales externos (listar_profesionales) y correos (buscar_correos) — estas no necesitan confirmación. Cada herramienta que usas, sea de lectura o de propuesta, queda registrada en un historial de Vantia que el despacho puede consultar; si te preguntan "qué has hecho" o "qué has consultado", diles que pueden verlo ahí. IMPORTANTE: las herramientas "preparar_..." NUNCA ejecutan la acción, solo la dejan preparada — al usuario se le muestra una tarjeta con botones "Confirmar"/"Cancelar" para decidir. Esa tarjeta YA ES la confirmación: en cuanto sepas exactamente qué hay que hacer (archivo/expediente/cliente y el dato nuevo que corresponda), LLAMA A LA HERRAMIENTA EN ESE MISMO TURNO. NUNCA preguntes antes en el chat "¿quieres que lo haga?", "¿te parece bien?" o similar y esperes a que el usuario responda "sí"/"vale" — eso duplica la confirmación (la del chat y la de la tarjeta) y además esta conversación NO conserva qué archivo/expediente exacto habíais hablado de un turno a otro, así que un "vale" suelto en el siguiente mensaje no tiene con qué actuar y falla. Si el usuario pide algo con intención ya clara (p.ej. "sugiéreme un nombre y cámbialo", "bórralo", "apunta una nota diciendo...", "cambia la descripción a..."), actúa directamente: llama a la herramienta ya. Solo pregunta antes en texto si de verdad falta un dato imprescindible (qué archivo si hay varios, de qué cliente). Tras usar una herramienta "preparar_...", dile al usuario que confirme en la tarjeta; NUNCA digas que ya está hecho, porque todavía no lo está.
- Si ya tienes en el contexto datos de la entidad en pantalla → úsalos directamente sin volver a buscarlos.
- Nunca muestres JSON en bruto. Convierte siempre los resultados en texto natural y bien formateado.
- Puedes razonar, debatir, opinar (con matices), calcular, traducir, resumir, corregir, mejorar textos, generar ideas, hacer listas, comparar opciones, explicar paso a paso, y mucho más.
- Si alguien te saluda, respóndele con naturalidad. Si te hacen una pregunta de la vida cotidiana, respóndela. Eres un asistente sin restricciones temáticas.

PENSAMIENTO CRÍTICO — al analizar un documento, expediente o situación no te limites a resumir o describir: piensa como lo haría un abogado experimentado revisándolo de verdad.
- Señala lo que falta, lo que es ambiguo, lo que contradice otra parte del mismo documento o de lo que ya sabes del expediente, y los plazos o riesgos que veas venir. Si algo tiene mala pinta (una cláusula abusiva, un plazo que está a punto de vencer, una incoherencia entre lo que dice el contrato y lo que pide el cliente), dilo directamente, aunque no te lo hayan preguntado explícitamente.
- Da tu valoración, no solo los hechos: si te preguntan "¿qué te parece este contrato?" o "¿cómo lo ves?", responde con una opinión fundamentada (puntos fuertes, puntos débiles, qué cambiarías, qué riesgo asumiría el cliente), no una lista neutra de cláusulas.
- Cuando compares opciones o estrategias procesales, no te quedes en "ambas son posibles": pondera pros/contras y, si hay una que recomendarías tú, dilo con tus razones — el usuario puede no estar de acuerdo, pero un asistente que nunca se moja no aporta criterio.
- Si los datos que tienes (del expediente, de un documento leído, de lo que dice el usuario) no cuadran entre sí, coméntalo en vez de ignorarlo o asumir que uno de los dos está bien.

CÓMO NO DEBES ESCRIBIR:
- Nada de tono acartonado, protocolario ni de informe corporativo. Escribe como un compañero de despacho que sabe mucho, no como un formulario. Nada de "recatado" — sé directo, cercano y con criterio propio; puedes tener opinión y decirla.
- No conviertas cualquier respuesta corta en una ficha con "**Campo:** valor" en lista. Eso solo tiene sentido cuando de verdad hay muchos campos que enumerar (una tabla de datos, por ejemplo). Para 1-3 datos, cuéntalos en una frase natural: "El expediente 2026/1 trata sobre... y tiene un archivo adjunto, CEDULA, DEMANDA Y DOCUMENTOS (173 MB)." en vez de una lista con negritas para cada dato suelto.
- Usa negrita (**así**) con moderación, solo para remarcar algo puntual de verdad importante, no para etiquetar cada dato. Usa listas con guiones solo cuando hay una enumeración real de 3 o más elementos del mismo tipo. Evita anidar listas y sub-listas para respuestas simples.
- Varía la estructura según la pregunta: a veces un párrafo corto es la mejor respuesta, no todo necesita títulos ni listas.`;

// ── Instrucciones específicas por módulo ─────────────────────────────────────
function moduleInstructions(moduleId: string): string {
  if (moduleId.includes('/clientes'))
    return 'MÓDULO ACTIVO: Clientes. El usuario está gestionando clientes del despacho. Prioriza respuestas sobre datos del cliente, LOPD/RGPD, tipos de documentos de identidad, relaciones cliente-expediente y gestión de la cartera de clientes.';
  if (moduleId.includes('/expedientes'))
    return 'MÓDULO ACTIVO: Expedientes. El usuario gestiona casos judiciales. Prioriza: plazos procesales, actuaciones, tipos de procedimientos, partes del proceso, fechas clave, documentación del caso y estado del expediente.';
  if (moduleId.includes('/tareas'))
    return 'MÓDULO ACTIVO: Tareas y actuaciones. El usuario gestiona actuaciones procesales y tareas del despacho. Prioriza: plazos, prioridades, tipos de actuación y organización del trabajo.';
  if (moduleId.includes('/agenda'))
    return 'MÓDULO ACTIVO: Agenda. El usuario gestiona su calendario. Prioriza: vistas, reuniones, plazos judiciales, citas con clientes y organización del tiempo.';
  if (moduleId.includes('/facturacion'))
    return 'MÓDULO ACTIVO: Facturación. El usuario gestiona honorarios y finanzas. Prioriza: facturas, cobros pendientes, vencimientos, gastos y control económico del despacho.';
  if (moduleId.includes('/correo'))
    return 'MÓDULO ACTIVO: Correo. El usuario gestiona emails del despacho. Puedes redactar correos profesionales, resumir conversaciones, proponer respuestas o ayudar a organizar la bandeja de entrada.';
  if (moduleId.includes('/documental'))
    return 'MÓDULO ACTIVO: Documental. El usuario busca o gestiona documentación jurídica. Puedes ayudar con búsquedas en el BOE, resúmenes normativos y localización de jurisprudencia. CENDOJ y LexNET solo están disponibles como enlace directo al portal oficial, no hay búsqueda automática sobre ellos.';
  if (moduleId.includes('/whatsapp'))
    return 'MÓDULO ACTIVO: WhatsApp. El usuario gestiona mensajería con clientes. Puedes redactar mensajes, proponer respuestas y ayudar con la comunicación comercial.';
  if (moduleId.includes('/chat'))
    return 'MÓDULO ACTIVO: Chat de equipo. Puedes ayudar a redactar mensajes internos, resumir conversaciones o resolver dudas del despacho.';
  if (moduleId.includes('/config'))
    return 'MÓDULO ACTIVO: Configuración del sistema. Puedes ayudar con ajustes, explicar opciones y orientar sobre el uso del ERP.';
  return 'MÓDULO ACTIVO: Panel principal. Puedes ayudar con cualquier área del despacho.';
}

// ── Contexto dinámico por entidad en pantalla ─────────────────────────────────
// `linkedExpedienteId` es distinto de la detección automática por URL: lo manda
// explícitamente el frontend cuando el usuario vincula un expediente a mano a
// una conversación de Chat IA independiente (que no vive bajo /expedientes/,
// así que la detección por moduleId nunca lo encontraría por sí sola).
async function buildEntityContext(moduleId: string, userId: string, organizacionId: string, linkedExpedienteId?: string | null): Promise<string> {
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const entityId = UUID_RE.exec(moduleId)?.[0];
  const autoExpedienteId = entityId && moduleId.includes('/expedientes/') ? entityId : null;
  const expedienteId = autoExpedienteId || linkedExpedienteId || null;
  const lines: string[] = [];

  try {
    // ── Entidad cliente ──────────────────────────────────────────────────────
    if (entityId && moduleId.includes('/clientes/')) {
      const [cRes, statsRes] = await Promise.all([
        pool.query(
          `SELECT first_name, last_name, commercial_name, nif_cif, email, phone, type, created_at
           FROM entities WHERE id=$1 AND organizacion_id=$2`, [entityId, organizacionId]
        ),
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM expedientes WHERE cliente_id=$1)                         AS expedientes,
             (SELECT COUNT(*)::int FROM client_tasks WHERE client_id=$1 AND estado!='completada') AS tareas,
             (SELECT COUNT(*)::int FROM notes WHERE client_id=$1)                                AS notas,
             (SELECT COUNT(*)::int FROM client_files WHERE client_id=$1)                         AS archivos`,
          [entityId]
        ),
      ]);
      if (cRes.rows.length) {
        const c  = cRes.rows[0];
        const s  = statsRes.rows[0];
        const nm = c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
        lines.push(`ENTIDAD EN PANTALLA → Cliente: "${nm}" | NIF/CIF: ${c.nif_cif || '—'} | Email: ${c.email || '—'} | Tel: ${c.phone || '—'} | Tipo: ${c.type}`);
        lines.push(`Resumen: ${s.expedientes} expediente(s), ${s.tareas} tarea(s) pendiente(s), ${s.notas} nota(s), ${s.archivos} archivo(s).`);
      }
    }

    // ── Entidad expediente (en pantalla o vinculado a mano al chat) ─────────
    if (expedienteId) {
      const [eRes, statsRes] = await Promise.all([
        pool.query(
          `SELECT e.anio, e.num_exp, e.descripcion, e.estado, e.fecha_inicio, e.fecha_cierre,
                  ent.commercial_name, ent.first_name, ent.last_name
           FROM expedientes e
           LEFT JOIN entities ent ON e.cliente_id = ent.id
           WHERE e.id=$1 AND e.organizacion_id=$2`, [expedienteId, organizacionId]
        ),
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM client_tasks WHERE expediente_id=$1 AND estado='urgente')     AS urgentes,
             (SELECT COUNT(*)::int FROM client_tasks WHERE expediente_id=$1 AND estado='pendiente')   AS pendientes,
             (SELECT COUNT(*)::int FROM client_tasks WHERE expediente_id=$1 AND estado='completada')  AS completadas,
             (SELECT COUNT(*)::int FROM client_tasks WHERE expediente_id=$1 AND plazo<NOW() AND estado!='completada') AS vencidas,
             (SELECT COUNT(*)::int FROM client_files WHERE client_id=$1)                              AS archivos,
             (SELECT COUNT(*)::int FROM notes WHERE expediente_id=$1)                                 AS notas`,
          [expedienteId]
        ),
      ]);
      if (eRes.rows.length) {
        const e  = eRes.rows[0];
        const s  = statsRes.rows[0];
        const cn = e.commercial_name || `${e.first_name || ''} ${e.last_name || ''}`.trim();
        const tag = autoExpedienteId ? 'ENTIDAD EN PANTALLA' : 'EXPEDIENTE VINCULADO A ESTA CONVERSACIÓN';
        lines.push(`${tag} → Expediente ${e.anio}/${e.num_exp} (${e.estado}) | Descripción: "${e.descripcion || 'Sin descripción'}" | Cliente: ${cn || '—'} | Inicio: ${e.fecha_inicio ? new Date(e.fecha_inicio).toLocaleDateString('es-ES') : '—'}${e.fecha_cierre ? ` | Cierre: ${new Date(e.fecha_cierre).toLocaleDateString('es-ES')}` : ''}`);
        lines.push(`Resumen: ${s.urgentes} tarea(s) urgente(s), ${s.pendientes} pendiente(s), ${s.vencidas} vencida(s), ${s.completadas} completada(s), ${s.archivos} archivo(s), ${s.notas} nota(s).`);
      }
    }

    // ── Alertas globales del usuario (siempre) ───────────────────────────────
    const alertRes = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND estado='urgente')                             AS t_urgentes,
         (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND plazo<NOW() AND estado!='completada')         AS t_vencidas,
         (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND estado='pendiente')                           AS t_pendientes,
         (SELECT COUNT(*)::int FROM agenda_events WHERE user_id=$1 AND start_at>=NOW() AND start_at<NOW()+INTERVAL '7 days') AS agenda_7d,
         (SELECT COUNT(*)::int FROM facturacion_facturas WHERE estado='pendiente')                                     AS facturas_pendientes`,
      [userId]
    );
    if (alertRes.rows.length) {
      const a = alertRes.rows[0];
      const alerts: string[] = [];
      if (a.t_urgentes  > 0) alerts.push(`${a.t_urgentes} tarea(s) URGENTE(s)`);
      if (a.t_vencidas  > 0) alerts.push(`${a.t_vencidas} tarea(s) VENCIDA(s)`);
      if (a.t_pendientes > 0) alerts.push(`${a.t_pendientes} tarea(s) pendiente(s)`);
      if (a.agenda_7d   > 0) alerts.push(`${a.agenda_7d} evento(s) en la próxima semana`);
      if (a.facturas_pendientes > 0) alerts.push(`${a.facturas_pendientes} factura(s) por cobrar`);
      if (alerts.length) lines.push(`Estado del despacho: ${alerts.join(' · ')}.`);
    }

  } catch (e: any) {
    console.warn('⚠️  Vantia context error:', e?.message);
  }

  return lines.length ? '\n\n---\n' + lines.join('\n') : '';
}

// ── Título automático de conversación (Chat IA) ──────────────────────────────
// En vez de usar el propio mensaje del usuario tal cual (que a veces es una
// sola palabra, o texto sin sentido si solo se está probando), le pedimos a
// Gemini un resumen cortito de qué trata la conversación -- igual que hacen
// ChatGPT/Claude con sus títulos automáticos. Se llama SIEMPRE después de
// haber respondido ya al usuario (no añade latencia a la respuesta), así que
// un fallo aquí no afecta al chat en sí -- por eso el catch en el punto de
// llamada usa el propio mensaje como título de reserva.
async function generateConversationTitle(userMessage: string, assistantReply: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  try {
    const prompt = `Resume esta conversación en un título muy corto (máximo 6 palabras), como el título de una pestaña de chat. Sin comillas, sin punto final, sin emojis. Solo el título, nada más.

Usuario: ${userMessage.slice(0, 500)}
Asistente: ${assistantReply.slice(0, 500)}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 30 },
        }),
      }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    let title: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    title = title.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\.$/, '').trim();
    return title ? title.slice(0, 100) : null;
  } catch {
    return null;
  }
}

// ── Herramientas disponibles ──────────────────────────────────────────────────
const TOOLS = [{
  function_declarations: [
    {
      name: 'estadisticas_generales',
      description: 'Estadísticas globales del despacho: clientes totales, expedientes activos/cerrados, tareas por estado, facturas pendientes e importe por cobrar, próximos eventos.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'buscar_clientes',
      description: 'Busca clientes por nombre, empresa o NIF/CIF. Incluye número de expedientes por cliente. Úsalo cuando el usuario da un nombre/NIF concreto.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nombre, apellido, empresa o NIF/CIF' },
          limit: { type: 'integer', description: 'Máximo resultados (por defecto 8)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'listar_clientes',
      description: 'Lista clientes del despacho con ordenación y filtros. Usa esta herramienta para "últimos clientes", "clientes con expedientes", "todos los clientes", etc. Incluye conteo de expedientes activos por cliente.',
      parameters: {
        type: 'object',
        properties: {
          ordenar_por:      { type: 'string',  description: 'reciente (por fecha de alta, más nuevos primero) | nombre (alfabético). Por defecto: reciente' },
          con_expedientes:  { type: 'boolean', description: 'true para mostrar solo clientes que tienen al menos un expediente' },
          sin_expedientes:  { type: 'boolean', description: 'true para mostrar solo clientes sin ningún expediente' },
          tipo:             { type: 'string',  description: 'CLIENTE | PROVEEDOR | CONTACTO — filtra por tipo de entidad' },
          limit:            { type: 'integer', description: 'Máximo resultados (por defecto 10, máximo 30)' },
        },
      },
    },
    {
      name: 'expedientes_cliente',
      description: 'Muestra todos los expedientes de un cliente concreto, con estado, descripción y fechas.',
      parameters: {
        type: 'object',
        properties: {
          cliente_id:   { type: 'string', description: 'UUID del cliente (usar si se conoce)' },
          cliente_nombre: { type: 'string', description: 'Nombre del cliente para buscarlo primero si no se tiene el UUID' },
          estado:       { type: 'string', description: 'Filtrar por estado: activo | cerrado | suspendido | archivado' },
        },
      },
    },
    {
      name: 'listar_expedientes',
      description: 'Lista expedientes del despacho. Filtros: estado (activo/cerrado/suspendido/archivado), cliente concreto y texto libre. Incluye nombre del cliente.',
      parameters: {
        type: 'object',
        properties: {
          estado:     { type: 'string',  description: 'activo | cerrado | suspendido | archivado' },
          busqueda:   { type: 'string',  description: 'Texto en número de expediente, descripción o nombre del cliente' },
          cliente_id: { type: 'string',  description: 'UUID del cliente para filtrar sus expedientes' },
          limit:      { type: 'integer', description: 'Máximo resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'obtener_tareas',
      description: 'Tareas y actuaciones del usuario. Filtros: estado, vencidas, y expediente concreto.',
      parameters: {
        type: 'object',
        properties: {
          estado:         { type: 'string',  description: 'pendiente | urgente | completada' },
          solo_vencidas:  { type: 'boolean', description: 'true para ver solo tareas con plazo vencido' },
          expediente_id:  { type: 'string',  description: 'UUID del expediente para filtrar sus tareas' },
          limit:          { type: 'integer', description: 'Máximo resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'listar_facturas',
      description: 'Facturas del sistema. Filtros: estado, cliente y texto libre.',
      parameters: {
        type: 'object',
        properties: {
          estado:     { type: 'string',  description: 'pendiente | pagada | vencida | cancelada' },
          busqueda:   { type: 'string',  description: 'Número de factura o nombre del contacto' },
          cliente_id: { type: 'string',  description: 'UUID del cliente para ver sus facturas' },
          limit:      { type: 'integer', description: 'Máximo resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'listar_gastos',
      description: 'Gastos registrados en el sistema.',
      parameters: {
        type: 'object',
        properties: {
          estado:   { type: 'string',  description: 'pendiente | pagado' },
          busqueda: { type: 'string',  description: 'Número o proveedor' },
          limit:    { type: 'integer', description: 'Máximo resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'listar_presupuestos',
      description: 'Presupuestos del sistema.',
      parameters: {
        type: 'object',
        properties: {
          estado:   { type: 'string',  description: 'pendiente | aceptado | rechazado' },
          busqueda: { type: 'string',  description: 'Número o contacto' },
          limit:    { type: 'integer', description: 'Máximo resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'agenda_proxima',
      description: 'Próximos eventos de la agenda del usuario.',
      parameters: {
        type: 'object',
        properties: {
          dias: { type: 'integer', description: 'Días hacia adelante (por defecto 14)' },
        },
      },
    },
    {
      name: 'buscar_notas',
      description: 'Busca notas internas por contenido, cliente o expediente.',
      parameters: {
        type: 'object',
        properties: {
          query:         { type: 'string',  description: 'Texto a buscar en el contenido de la nota' },
          cliente_id:    { type: 'string',  description: 'UUID del cliente para ver sus notas' },
          expediente_id: { type: 'string',  description: 'UUID del expediente para ver sus notas' },
          limit:         { type: 'integer', description: 'Máximo resultados (por defecto 8)' },
        },
      },
    },
    {
      name: 'tareas_expediente',
      description: 'Obtiene todas las tareas/actuaciones de un expediente concreto.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id: { type: 'string', description: 'UUID del expediente' },
          estado:        { type: 'string', description: 'Filtrar por estado (opcional)' },
        },
        required: ['expediente_id'],
      },
    },
    {
      name: 'archivos_expediente',
      description: 'Lista los archivos/documentos adjuntos a un expediente concreto.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id: { type: 'string', description: 'UUID del expediente' },
        },
        required: ['expediente_id'],
      },
    },
    {
      name: 'leer_archivo_expediente',
      description: 'Lee el CONTENIDO de un documento adjunto a un expediente (PDF, Word .doc/.docx, texto plano, o una imagen escaneada vía OCR) para poder analizarlo, resumirlo o responder preguntas sobre lo que dice. Úsala cuando haga falta el contenido real, no solo el nombre del archivo (para eso ya está archivos_expediente). No sirve para hojas de cálculo ni imágenes que no sean de un documento escaneado.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id: { type: 'string', description: 'UUID del expediente que contiene el archivo' },
          archivo:       { type: 'string', description: 'Nombre (o parte del nombre) del archivo a leer' },
        },
        required: ['expediente_id', 'archivo'],
      },
    },
    {
      name: 'preparar_borrado_archivo',
      description: 'Prepara el borrado de un documento de un expediente. NO lo borra: deja la acción pendiente de que el usuario la confirme en una tarjeta que se le muestra en el chat. Úsala solo cuando el usuario pida explícitamente borrar/eliminar un archivo concreto.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id: { type: 'string', description: 'UUID del expediente que contiene el archivo' },
          archivo:       { type: 'string', description: 'Nombre (o parte del nombre) del archivo a borrar' },
        },
        required: ['expediente_id', 'archivo'],
      },
    },
    {
      name: 'preparar_renombrado_archivo',
      description: 'Prepara el renombrado de un documento de un expediente. NO lo renombra: deja la acción pendiente de que el usuario la confirme en una tarjeta que se le muestra en el chat.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id: { type: 'string', description: 'UUID del expediente que contiene el archivo' },
          archivo:       { type: 'string', description: 'Nombre (o parte del nombre) del archivo a renombrar' },
          nuevo_nombre:  { type: 'string', description: 'Nuevo nombre para el archivo (sin extensión, se conserva la original)' },
        },
        required: ['expediente_id', 'archivo', 'nuevo_nombre'],
      },
    },
    {
      name: 'preparar_movimiento_archivo',
      description: 'Prepara mover un documento desde un expediente a otro (deben ser expedientes distintos, del mismo despacho). NO lo mueve: deja la acción pendiente de que el usuario la confirme en una tarjeta que se le muestra en el chat.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id:      { type: 'string', description: 'UUID del expediente de origen (donde está ahora el archivo)' },
          archivo:            { type: 'string', description: 'Nombre (o parte del nombre) del archivo a mover' },
          expediente_destino: { type: 'string', description: 'Expediente al que moverlo: su UUID si se conoce, o texto para buscarlo (p.ej. "2026/14" o parte de la descripción)' },
        },
        required: ['expediente_id', 'archivo', 'expediente_destino'],
      },
    },
    {
      name: 'preparar_actualizar_descripcion_expediente',
      description: 'Prepara cambiar la descripción de un expediente. NO la cambia: deja la acción pendiente de que el usuario la confirme en una tarjeta que se le muestra en el chat.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id:     { type: 'string', description: 'UUID del expediente' },
          nueva_descripcion: { type: 'string', description: 'Nueva descripción del expediente' },
        },
        required: ['expediente_id', 'nueva_descripcion'],
      },
    },
    {
      name: 'preparar_crear_nota',
      description: 'Prepara crear una nota interna sobre un cliente o sobre un expediente concreto. NO la crea: deja la acción pendiente de que el usuario la confirme en una tarjeta que se le muestra en el chat. Da cliente_id o expediente_id (uno de los dos).',
      parameters: {
        type: 'object',
        properties: {
          cliente_id:    { type: 'string', description: 'UUID del cliente sobre el que va la nota' },
          expediente_id: { type: 'string', description: 'UUID del expediente sobre el que va la nota (alternativa a cliente_id)' },
          contenido:     { type: 'string', description: 'Contenido de la nota' },
          categoria:     { type: 'string', description: 'general | urgente | seguimiento | recordatorio | comercial | legal | otro (por defecto general)' },
        },
        required: ['contenido'],
      },
    },
    {
      name: 'buscar_correos',
      description: 'Busca correos del usuario (bandeja conectada) por texto libre (asunto, remitente o fragmento) y/o filtrando por cliente o expediente. Solo lectura.',
      parameters: {
        type: 'object',
        properties: {
          query:         { type: 'string',  description: 'Texto a buscar en asunto, remitente o fragmento del correo' },
          cliente_id:    { type: 'string',  description: 'UUID del cliente para ver sus correos vinculados' },
          expediente_id: { type: 'string',  description: 'UUID del expediente para ver sus correos vinculados' },
          limit:         { type: 'integer', description: 'Máximo resultados (por defecto 8)' },
        },
      },
    },
    {
      name: 'detalle_cliente',
      description: 'Ficha completa de un cliente concreto: contacto (email, teléfonos, dirección), estado LOPD, fecha de alta y número de expedientes. Úsala cuando el usuario pida "la ficha de", "los datos de" o "el contacto de" un cliente ya identificado.',
      parameters: {
        type: 'object',
        properties: {
          cliente_id:     { type: 'string', description: 'UUID del cliente (usar si se conoce)' },
          cliente_nombre: { type: 'string', description: 'Nombre del cliente para buscarlo primero si no se tiene el UUID' },
        },
      },
    },
    {
      name: 'detalle_expediente',
      description: 'Ficha completa de un expediente concreto: descripción, tipo de procedimiento, juzgado, autos, NIG, contrario, procurador/abogado propio y contrario, fechas y observaciones.',
      parameters: {
        type: 'object',
        properties: {
          expediente_id: { type: 'string', description: 'UUID del expediente' },
        },
        required: ['expediente_id'],
      },
    },
    {
      name: 'listar_profesionales',
      description: 'Lista el directorio de abogados y procuradores externos del despacho (contrarios o de referencia), con colegio, número de colegiado y contacto.',
      parameters: {
        type: 'object',
        properties: {
          tipo:     { type: 'string',  description: 'ABOGADO | PROCURADOR. Si se omite, se listan ambos tipos.' },
          busqueda: { type: 'string',  description: 'Nombre, despacho, colegio o número de colegiado' },
          limit:    { type: 'integer', description: 'Máximo resultados (por defecto 15)' },
        },
      },
    },
    {
      name: 'preparar_crear_tarea',
      description: 'Prepara crear una tarea/actuación nueva. NO la crea: deja la acción pendiente de que el usuario la confirme en una tarjeta que se le muestra en el chat. Necesita saber para qué cliente o expediente es.',
      parameters: {
        type: 'object',
        properties: {
          titulo:        { type: 'string', description: 'Título de la tarea' },
          descripcion:   { type: 'string', description: 'Descripción opcional' },
          cliente_id:    { type: 'string', description: 'UUID del cliente (si no se da expediente_id, es obligatorio)' },
          expediente_id: { type: 'string', description: 'UUID del expediente al que pertenece la tarea (opcional; si se da, el cliente se deduce de él)' },
          plazo:         { type: 'string', description: 'Fecha límite en formato YYYY-MM-DD (opcional)' },
          prioridad:     { type: 'string', description: 'alta | media | baja (por defecto media)' },
          tipo:          { type: 'string', description: 'Tipo de actuación libre (por defecto "otro")' },
        },
        required: ['titulo'],
      },
    },
    {
      name: 'preparar_actualizar_estado_tarea',
      description: 'Prepara cambiar el estado de una tarea existente (marcarla completada, urgente o reabrirla a pendiente). NO la cambia: deja la acción pendiente de confirmación en una tarjeta.',
      parameters: {
        type: 'object',
        properties: {
          tarea:         { type: 'string', description: 'Texto (parte del título) de la tarea a localizar' },
          expediente_id: { type: 'string', description: 'UUID del expediente para acotar la búsqueda si hay varias tareas con nombre parecido' },
          nuevo_estado:  { type: 'string', description: 'pendiente | urgente | completada' },
        },
        required: ['tarea', 'nuevo_estado'],
      },
    },
    {
      name: 'preparar_eliminar_tarea',
      description: 'Prepara eliminar una tarea existente. NO la elimina: deja la acción pendiente de confirmación en una tarjeta.',
      parameters: {
        type: 'object',
        properties: {
          tarea:         { type: 'string', description: 'Texto (parte del título) de la tarea a localizar' },
          expediente_id: { type: 'string', description: 'UUID del expediente para acotar la búsqueda si hay varias tareas con nombre parecido' },
        },
        required: ['tarea'],
      },
    },
    {
      name: 'preparar_crear_cita',
      description: 'Prepara crear un evento/cita en la agenda. NO lo crea: deja la acción pendiente de confirmación en una tarjeta.',
      parameters: {
        type: 'object',
        properties: {
          titulo:        { type: 'string', description: 'Título de la cita' },
          fecha_inicio:  { type: 'string', description: 'Fecha y hora de inicio en formato ISO (p.ej. 2026-10-01T10:00:00) o "YYYY-MM-DD HH:mm"' },
          fecha_fin:     { type: 'string', description: 'Fecha y hora de fin (opcional)' },
          descripcion:   { type: 'string', description: 'Descripción opcional' },
          ubicacion:     { type: 'string', description: 'Lugar opcional' },
          tipo:          { type: 'string', description: 'cita | vista | reunion | plazo | otro (por defecto cita)' },
          expediente_id: { type: 'string', description: 'UUID del expediente relacionado (opcional)' },
          cliente_id:    { type: 'string', description: 'UUID del cliente relacionado (opcional)' },
        },
        required: ['titulo', 'fecha_inicio'],
      },
    },
  ],
}];

// ── Etiquetas en español de cada herramienta, para mostrar en el frontend
// mientras Vantia está consultando datos reales (p.ej. "Buscando clientes…") ──
const TOOL_LABELS: Record<string, string> = {
  estadisticas_generales: 'Consultando estadísticas del despacho…',
  buscar_clientes:        'Buscando clientes…',
  listar_clientes:        'Consultando listado de clientes…',
  expedientes_cliente:    'Consultando expedientes del cliente…',
  listar_expedientes:     'Consultando expedientes…',
  obtener_tareas:         'Consultando tareas…',
  listar_facturas:        'Consultando facturas…',
  listar_gastos:          'Consultando gastos…',
  listar_presupuestos:    'Consultando presupuestos…',
  agenda_proxima:         'Consultando la agenda…',
  buscar_notas:           'Buscando notas…',
  tareas_expediente:      'Consultando tareas del expediente…',
  archivos_expediente:    'Consultando archivos del expediente…',
  leer_archivo_expediente: 'Leyendo el documento…',
  preparar_borrado_archivo:      'Preparando el borrado del archivo…',
  preparar_renombrado_archivo:   'Preparando el renombrado del archivo…',
  preparar_movimiento_archivo:   'Preparando el movimiento del archivo…',
  preparar_actualizar_descripcion_expediente: 'Preparando el cambio de descripción…',
  preparar_crear_nota:           'Preparando la nueva nota…',
  buscar_correos:                'Buscando correos…',
  detalle_cliente:               'Consultando ficha del cliente…',
  detalle_expediente:            'Consultando ficha del expediente…',
  listar_profesionales:          'Consultando el directorio…',
  preparar_crear_tarea:          'Preparando la nueva tarea…',
  preparar_actualizar_estado_tarea: 'Preparando el cambio de estado de la tarea…',
  preparar_eliminar_tarea:       'Preparando el borrado de la tarea…',
  preparar_crear_cita:           'Preparando la nueva cita…',
};

// ── Gestión de archivos desde el chat: SOLO propone, nunca ejecuta ──────────
// Estas tres herramientas nunca tocan un archivo real. Buscan el expediente y
// el archivo (siempre acotado a la organización activa), y si hay una única
// coincidencia crean una fila 'pending' en vantia_pending_actions con lo que
// se HARÍA. La mutación real solo ocurre en confirmVantiaAction, cuando el
// usuario pulsa "Confirmar" en la tarjeta que le muestra el chat.
async function resolveExpedienteAndFile(organizacionId: string, expedienteId: string, query: string) {
  const expRes = await pool.query(
    `SELECT anio, num_exp, descripcion FROM expedientes WHERE id = $1 AND organizacion_id = $2`,
    [expedienteId, organizacionId],
  );
  if (!expRes.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
  const exp = expRes.rows[0];
  const label = `${exp.anio}/${exp.num_exp}${exp.descripcion ? ' - ' + exp.descripcion : ''}`;

  const filesRes = await pool.query(
    `SELECT id, original_name, document_name FROM client_files
     WHERE client_id = $1 AND (original_name ILIKE $2 OR document_name ILIKE $2)
     ORDER BY created_at DESC LIMIT 10`,
    [expedienteId, `%${query}%`],
  );
  return { label, files: filesRes.rows as { id: string; original_name: string; document_name: string | null }[] };
}

async function resolveExpedienteByText(organizacionId: string, text: string) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(text.trim())) {
    const r = await pool.query(
      `SELECT id, anio, num_exp, descripcion FROM expedientes WHERE id = $1 AND organizacion_id = $2`,
      [text.trim(), organizacionId],
    );
    return r.rows;
  }
  const r = await pool.query(
    `SELECT id, anio, num_exp, descripcion FROM expedientes
     WHERE organizacion_id = $1 AND (descripcion ILIKE $2 OR (anio::text || '/' || num_exp::text) ILIKE $2)
     ORDER BY created_at DESC LIMIT 10`,
    [organizacionId, `%${text}%`],
  );
  return r.rows;
}

function expedienteLabel(e: { anio: number; num_exp: number; descripcion?: string | null }) {
  return `${e.anio}/${e.num_exp}${e.descripcion ? ' - ' + e.descripcion : ''}`;
}

async function resolveTaskByText(organizacionId: string, text: string, expedienteId?: string) {
  const conds = ['organizacion_id = $1', 'titulo ILIKE $2'];
  const params: any[] = [organizacionId, `%${text}%`];
  if (expedienteId) { conds.push(`expediente_id = $3`); params.push(expedienteId); }
  const r = await pool.query(
    `SELECT id, titulo, estado FROM client_tasks WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 10`,
    params,
  );
  return r.rows as { id: string; titulo: string; estado: string }[];
}

const AMBIGUOUS_FILE_MSG = 'Hay varios archivos que coinciden con ese nombre en el expediente. Pide al usuario que precise cuál (nombre más completo, o cuál de la lista) y vuelve a intentarlo.';
const AMBIGUOUS_EXP_MSG  = 'Hay varios expedientes que coinciden con ese destino. Pide al usuario que precise cuál (número de expediente o más detalle) y vuelve a intentarlo.';
const AMBIGUOUS_TASK_MSG = 'Hay varias tareas que coinciden con ese texto. Pide al usuario que precise cuál (título más completo, o cuál de la lista) y vuelve a intentarlo.';

// ── Historial de Vantia: registra cada herramienta ejecutada (lectura o
// propuesta) para que el despacho pueda ver qué ha consultado o hecho la IA.
// Se llama una sola vez, en el wrapper callTool() -- así cualquier
// herramienta nueva queda registrada automáticamente sin tocar este código.
function summarizeToolCall(name: string, args: Record<string, any>, result: any): string {
  const base = (TOOL_LABELS[name] || name).replace(/…$/, '').trim();
  const bits: string[] = [];
  for (const k of ['query', 'busqueda', 'archivo', 'tarea', 'cliente_nombre', 'nuevo_nombre', 'nueva_descripcion', 'contenido', 'estado', 'nuevo_estado', 'expediente_destino', 'titulo']) {
    if (args?.[k]) bits.push(`${k}="${String(args[k]).slice(0, 60)}"`);
  }
  const argsStr = bits.length ? ` (${bits.join(', ')})` : '';
  if (result?.error) return `${base}${argsStr} → error: ${String(result.error).slice(0, 160)}`;
  if (result?.ambiguo) return `${base}${argsStr} → varias coincidencias, pidió aclarar`;
  if (result?.accion_pendiente) return `${base}${argsStr} → propuesta: ${result.titulo || result.tipo}`;
  if (typeof result?.texto === 'string') return `${base}${argsStr} → leyó ${result.texto.length.toLocaleString('es-ES')} caracteres`;
  if (typeof result?.total === 'number') return `${base}${argsStr} → ${result.total} resultado(s)`;
  return `${base}${argsStr}`;
}

async function logVantiaToolCall(organizacionId: string, userId: string, name: string, args: Record<string, any>, result: any): Promise<void> {
  if (!organizacionId) return;
  try {
    const kind = name.startsWith('preparar_') ? 'write' : 'read';
    const ok = !(result && (result as any).error);
    const pendingActionId = (result && (result as any).accion_pendiente) ? (result as any).token : null;
    await pool.query(
      `INSERT INTO vantia_tool_log (organizacion_id, user_id, tool_name, kind, args, summary, ok, pending_action_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [organizacionId, userId, name, kind, JSON.stringify(args || {}), summarizeToolCall(name, args, result), ok, pendingActionId],
    );
  } catch (e: any) {
    console.error('❌ Vantia tool log:', e?.message);
  }
}

// ── Dispatcher de herramientas ────────────────────────────────────────────────
// callTool() es un envoltorio fino sobre callToolInner(): ejecuta la
// herramienta y, pase lo que pase, deja constancia en vantia_tool_log. Al
// registrar aquí (un único punto de paso para las dos formas de chatear,
// chatVantia y chatVantiaStream) cualquier herramienta nueva queda trazada
// sin tener que tocar este código de nuevo.
async function callTool(name: string, args: Record<string, any>, userId: string, organizacionId: string): Promise<object> {
  const result = await callToolInner(name, args, userId, organizacionId);
  void logVantiaToolCall(organizacionId, userId, name, args, result);
  return result;
}

async function callToolInner(name: string, args: Record<string, any>, userId: string, organizacionId: string): Promise<object> {
  try {
    switch (name) {

      case 'estadisticas_generales': {
        const r = await pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM entities WHERE type='CLIENTE' AND organizacion_id=$2)                          AS total_clientes,
            (SELECT COUNT(*)::int FROM expedientes WHERE estado NOT IN ('cerrado','archivado') AND organizacion_id=$2) AS expedientes_activos,
            (SELECT COUNT(*)::int FROM expedientes WHERE estado='cerrado' AND organizacion_id=$2)                      AS expedientes_cerrados,
            (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND estado!='completada')                      AS tareas_pendientes,
            (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND estado='urgente')                          AS tareas_urgentes,
            (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND plazo<NOW() AND estado!='completada')      AS tareas_vencidas,
            (SELECT COUNT(*)::int FROM facturacion_facturas WHERE estado='pendiente')                                  AS facturas_pendientes,
            (SELECT COALESCE(SUM(total),0) FROM facturacion_facturas WHERE estado='pendiente')                         AS importe_pendiente_eur,
            (SELECT COUNT(*)::int FROM facturacion_gastos WHERE estado='pendiente')                                    AS gastos_pendientes,
            (SELECT COUNT(*)::int FROM agenda_events WHERE user_id=$1 AND start_at>=NOW())                             AS eventos_proximos
        `, [userId, organizacionId]);
        return { estadisticas: r.rows[0] };
      }

      case 'buscar_clientes': {
        const q = `%${args.query ?? ''}%`, limit = Math.min(Number(args.limit) || 8, 20);
        const r = await pool.query(`
          SELECT e.id, e.first_name, e.last_name, e.commercial_name, e.nif_cif, e.email, e.phone, e.type, e.created_at,
                 COUNT(exp.id)::int AS num_expedientes,
                 COUNT(exp.id) FILTER (WHERE exp.estado NOT IN ('cerrado','archivado'))::int AS expedientes_activos
          FROM entities e
          LEFT JOIN expedientes exp ON exp.cliente_id = e.id
          WHERE e.organizacion_id = $3
            AND (e.commercial_name ILIKE $1
             OR CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,'')) ILIKE $1
             OR e.nif_cif ILIKE $1 OR e.email ILIKE $1)
          GROUP BY e.id
          ORDER BY COALESCE(e.commercial_name, e.first_name) NULLS LAST LIMIT $2
        `, [q, limit, organizacionId]);
        return {
          total: r.rowCount,
          clientes: r.rows.map(c => ({
            id: c.id,
            nombre: c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            nif: c.nif_cif, email: c.email, telefono: c.phone, tipo: c.type,
            alta: c.created_at,
            num_expedientes: c.num_expedientes,
            expedientes_activos: c.expedientes_activos,
          })),
        };
      }

      case 'listar_clientes': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const conds: string[] = [`e.organizacion_id=$1`];
        const params: any[] = [organizacionId];
        let pi = 2;
        if (args.tipo) { conds.push(`e.type=$${pi++}`); params.push(args.tipo); }
        const havingConds: string[] = [];
        if (args.con_expedientes)  havingConds.push('COUNT(exp.id) > 0');
        if (args.sin_expedientes)  havingConds.push('COUNT(exp.id) = 0');
        const orderSql = args.ordenar_por === 'nombre'
          ? 'COALESCE(e.commercial_name, e.first_name) ASC NULLS LAST'
          : 'e.created_at DESC';
        params.push(limit);
        const r = await pool.query(`
          SELECT e.id, e.first_name, e.last_name, e.commercial_name, e.nif_cif, e.email, e.phone, e.type, e.created_at,
                 COUNT(exp.id)::int AS num_expedientes,
                 COUNT(exp.id) FILTER (WHERE exp.estado NOT IN ('cerrado','archivado'))::int AS expedientes_activos
          FROM entities e
          LEFT JOIN expedientes exp ON exp.cliente_id = e.id
          WHERE ${conds.join(' AND ')}
          GROUP BY e.id
          ${havingConds.length ? 'HAVING ' + havingConds.join(' AND ') : ''}
          ORDER BY ${orderSql}
          LIMIT $${pi}
        `, params);
        return {
          total: r.rowCount,
          ordenado_por: args.ordenar_por || 'reciente',
          clientes: r.rows.map(c => ({
            id: c.id,
            nombre: c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            nif: c.nif_cif, email: c.email, telefono: c.phone, tipo: c.type,
            alta: c.created_at,
            num_expedientes: c.num_expedientes,
            expedientes_activos: c.expedientes_activos,
          })),
        };
      }

      case 'expedientes_cliente': {
        let clienteId = args.cliente_id;
        let clienteNombre = '—';
        if (!clienteId && args.cliente_nombre) {
          const q = `%${args.cliente_nombre}%`;
          const found = await pool.query(
            `SELECT id, COALESCE(commercial_name, CONCAT(first_name,' ',last_name)) AS nombre
             FROM entities WHERE (commercial_name ILIKE $1 OR CONCAT(first_name,' ',last_name) ILIKE $1) AND organizacion_id=$2 LIMIT 1`,
            [q, organizacionId]
          );
          if (!found.rows.length) return { error: `No se encontró cliente con nombre "${args.cliente_nombre}"` };
          clienteId = found.rows[0].id;
          clienteNombre = found.rows[0].nombre;
        }
        if (!clienteId) return { error: 'Se requiere cliente_id o cliente_nombre' };
        const conds = ['e.cliente_id=$1', 'e.organizacion_id=$2'], params: any[] = [clienteId, organizacionId];
        let pi = 3;
        if (args.estado) { conds.push(`e.estado=$${pi++}`); params.push(args.estado); }
        const r = await pool.query(`
          SELECT e.id, e.anio, e.num_exp, e.descripcion, e.estado, e.fecha_inicio, e.fecha_cierre,
                 e.juzgado, e.tipo_proc,
                 COUNT(t.id) FILTER (WHERE t.estado!='completada')::int AS tareas_pendientes,
                 COUNT(f.id)::int AS num_archivos
          FROM expedientes e
          LEFT JOIN client_tasks t ON t.expediente_id = e.id
          LEFT JOIN client_files f ON f.client_id = e.id
          WHERE ${conds.join(' AND ')}
          GROUP BY e.id
          ORDER BY e.fecha_inicio DESC NULLS LAST
        `, params);
        if (!clienteNombre || clienteNombre === '—') {
          const cn = await pool.query(
            `SELECT COALESCE(commercial_name, CONCAT(first_name,' ',last_name)) AS nombre FROM entities WHERE id=$1 AND organizacion_id=$2`, [clienteId, organizacionId]
          );
          clienteNombre = cn.rows[0]?.nombre || clienteId;
        }
        return {
          cliente: clienteNombre,
          total: r.rowCount,
          expedientes: r.rows.map(e => ({
            id: e.id, ref: `${e.anio}/${e.num_exp}`, descripcion: e.descripcion,
            estado: e.estado, inicio: e.fecha_inicio, cierre: e.fecha_cierre,
            juzgado: e.juzgado, tipo_proc: e.tipo_proc,
            tareas_pendientes: e.tareas_pendientes, archivos: e.num_archivos,
          })),
        };
      }

      case 'listar_expedientes': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const conds: string[] = [`e.organizacion_id=$1`], params: any[] = [organizacionId];
        let pi = 2;
        if (args.estado)     { conds.push(`e.estado=$${pi++}`); params.push(args.estado); }
        if (args.cliente_id) { conds.push(`e.cliente_id=$${pi++}`); params.push(args.cliente_id); }
        if (args.busqueda)   {
          conds.push(`(e.descripcion ILIKE $${pi} OR CONCAT(e.anio::text,'/',e.num_exp::text) ILIKE $${pi} OR ent.commercial_name ILIKE $${pi} OR CONCAT(ent.first_name,' ',ent.last_name) ILIKE $${pi})`);
          params.push(`%${args.busqueda}%`); pi++;
        }
        params.push(limit);
        const r = await pool.query(`
          SELECT e.id, e.anio, e.num_exp, e.descripcion, e.estado, e.fecha_inicio, e.fecha_cierre,
                 COALESCE(ent.commercial_name, CONCAT(ent.first_name,' ',ent.last_name)) AS cliente
          FROM expedientes e
          LEFT JOIN entities ent ON ent.id = e.cliente_id
          WHERE ${conds.join(' AND ')}
          ORDER BY e.created_at DESC LIMIT $${pi}
        `, params);
        return { total: r.rowCount, expedientes: r.rows.map(e => ({ id: e.id, ref: `${e.anio}/${e.num_exp}`, descripcion: e.descripcion, estado: e.estado, cliente: e.cliente, inicio: e.fecha_inicio, cierre: e.fecha_cierre })) };
      }

      case 'obtener_tareas': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const conds = ['created_by=$1'], params: any[] = [userId];
        let pi = 2;
        if (args.estado)        { conds.push(`estado=$${pi++}`); params.push(args.estado); }
        if (args.expediente_id) { conds.push(`expediente_id=$${pi++}`); params.push(args.expediente_id); }
        if (args.solo_vencidas) conds.push(`(plazo<NOW() AND estado!='completada')`);
        params.push(limit);
        const r = await pool.query(`
          SELECT titulo, tipo, estado, prioridad, plazo, client_name, expediente, created_at
          FROM client_tasks WHERE ${conds.join(' AND ')}
          ORDER BY CASE WHEN estado='urgente' THEN 0 WHEN plazo<NOW() AND estado!='completada' THEN 1 ELSE 2 END, plazo ASC NULLS LAST
          LIMIT $${pi}
        `, params);
        return { total: r.rowCount, tareas: r.rows.map(t => ({ titulo: t.titulo, tipo: t.tipo, estado: t.estado, prioridad: t.prioridad, plazo: t.plazo, cliente: t.client_name, expediente: t.expediente })) };
      }

      case 'listar_facturas': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const conds: string[] = [], params: any[] = [];
        let pi = 1;
        if (args.estado)     { conds.push(`f.estado=$${pi++}`); params.push(args.estado); }
        if (args.cliente_id) { conds.push(`f.entity_id=$${pi++}`); params.push(args.cliente_id); }
        if (args.busqueda)   { conds.push(`(f.num ILIKE $${pi} OR f.contacto ILIKE $${pi})`); params.push(`%${args.busqueda}%`); pi++; }
        params.push(limit);
        const r = await pool.query(`SELECT f.num,f.contacto,f.total,f.estado,f.fecha,f.vencimiento FROM facturacion_facturas f ${conds.length ? 'WHERE '+conds.join(' AND ') : ''} ORDER BY f.fecha DESC LIMIT $${pi}`, params);
        return { total: r.rowCount, facturas: r.rows.map(f => ({ num: f.num, contacto: f.contacto, total_eur: Number(f.total).toFixed(2), estado: f.estado, fecha: f.fecha, vencimiento: f.vencimiento })) };
      }

      case 'listar_gastos': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const conds: string[] = [], params: any[] = [];
        let pi = 1;
        if (args.estado)   { conds.push(`estado=$${pi++}`); params.push(args.estado); }
        if (args.busqueda) { conds.push(`(num ILIKE $${pi} OR proveedor ILIKE $${pi})`); params.push(`%${args.busqueda}%`); pi++; }
        params.push(limit);
        const r = await pool.query(`SELECT num,proveedor,total,categoria,estado,fecha FROM facturacion_gastos ${conds.length ? 'WHERE '+conds.join(' AND ') : ''} ORDER BY fecha DESC LIMIT $${pi}`, params);
        return { total: r.rowCount, gastos: r.rows.map(g => ({ num: g.num, proveedor: g.proveedor, total_eur: Number(g.total).toFixed(2), categoria: g.categoria, estado: g.estado, fecha: g.fecha })) };
      }

      case 'listar_presupuestos': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const conds: string[] = [], params: any[] = [];
        let pi = 1;
        if (args.estado)   { conds.push(`estado=$${pi++}`); params.push(args.estado); }
        if (args.busqueda) { conds.push(`(num ILIKE $${pi} OR contacto ILIKE $${pi})`); params.push(`%${args.busqueda}%`); pi++; }
        params.push(limit);
        const r = await pool.query(`SELECT num,contacto,total,estado,fecha FROM facturacion_presupuestos ${conds.length ? 'WHERE '+conds.join(' AND ') : ''} ORDER BY fecha DESC LIMIT $${pi}`, params);
        return { total: r.rowCount, presupuestos: r.rows.map(p => ({ num: p.num, contacto: p.contacto, total_eur: Number(p.total).toFixed(2), estado: p.estado, fecha: p.fecha })) };
      }

      case 'agenda_proxima': {
        const dias = Math.min(Number(args.dias) || 14, 60);
        const r = await pool.query(`
          SELECT title,type,status,start_at,end_at,description,location
          FROM agenda_events
          WHERE user_id=$1 AND start_at>=NOW() AND start_at<=NOW()+($2*INTERVAL '1 day')
          ORDER BY start_at ASC LIMIT 25
        `, [userId, dias]);
        return { total: r.rowCount, dias_consultados: dias, eventos: r.rows.map(e => ({ titulo: e.title, tipo: e.type, estado: e.status, inicio: e.start_at, fin: e.end_at, descripcion: e.description, lugar: e.location })) };
      }

      case 'buscar_notas': {
        const limit = Math.min(Number(args.limit) || 8, 20);
        const conds: string[] = [], params: any[] = [];
        let pi = 1;
        if (args.query)         { conds.push(`n.content ILIKE $${pi++}`); params.push(`%${args.query}%`); }
        if (args.cliente_id)    { conds.push(`n.client_id=$${pi++}`); params.push(args.cliente_id); }
        if (args.expediente_id) { conds.push(`n.expediente_id=$${pi++}`); params.push(args.expediente_id); }
        params.push(limit);
        const r = await pool.query(`
          SELECT n.content, n.category, n.priority, n.created_at,
                 COALESCE(e.commercial_name, CONCAT(e.first_name,' ',e.last_name)) AS client_name
          FROM notes n LEFT JOIN entities e ON n.client_id=e.id
          ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
          ORDER BY n.created_at DESC LIMIT $${pi}
        `, params);
        return { total: r.rowCount, notas: r.rows.map(n => ({ contenido: n.content.length > 200 ? n.content.slice(0,200)+'…' : n.content, categoria: n.category, prioridad: n.priority, cliente: n.client_name, fecha: n.created_at })) };
      }

      case 'tareas_expediente': {
        const limit = Math.min(Number(args.limit) || 20, 50);
        const conds = ['expediente_id=$1'], params: any[] = [args.expediente_id];
        let pi = 2;
        if (args.estado) { conds.push(`estado=$${pi++}`); params.push(args.estado); }
        params.push(limit);
        const r = await pool.query(`
          SELECT titulo, tipo, estado, prioridad, plazo, created_at
          FROM client_tasks WHERE ${conds.join(' AND ')}
          ORDER BY CASE WHEN estado='urgente' THEN 0 WHEN plazo<NOW() AND estado!='completada' THEN 1 ELSE 2 END, plazo ASC NULLS LAST
          LIMIT $${pi}
        `, params);
        return { total: r.rowCount, tareas: r.rows.map(t => ({ titulo: t.titulo, tipo: t.tipo, estado: t.estado, prioridad: t.prioridad, plazo: t.plazo })) };
      }

      case 'archivos_expediente': {
        // El expediente tiene que ser de esta organización -- sin este filtro,
        // pedir el UUID de un expediente de OTRO despacho devolvía igualmente
        // sus nombres de archivo.
        const expCheck = await pool.query(`SELECT 1 FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [args.expediente_id, organizacionId]);
        if (!expCheck.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
        const r = await pool.query(`
          SELECT id, original_name, document_name, category, size_bytes, storage_provider, created_at
          FROM client_files WHERE client_id=$1 ORDER BY created_at DESC LIMIT 30
        `, [args.expediente_id]);
        return { total: r.rowCount, archivos: r.rows.map(f => ({ id: f.id, nombre: f.document_name || f.original_name, categoria: f.category, tamano_kb: f.size_bytes ? Math.round(f.size_bytes / 1024) : null, en_drive: f.storage_provider === 'drive', fecha: f.created_at })) };
      }

      case 'leer_archivo_expediente': {
        const expedienteId = String(args.expediente_id || '');
        const query = String(args.archivo || '');
        if (!expedienteId || !query) return { error: 'Faltan expediente_id o archivo.' };
        const resolved = await resolveExpedienteAndFile(organizacionId, expedienteId, query);
        if ('error' in resolved) return resolved;
        if (resolved.files.length === 0) return { error: `No encuentro ningún archivo que coincida con "${query}" en ese expediente.` };
        if (resolved.files.length > 1) {
          return { ambiguo: true, coincidencias: resolved.files.map(f => ({ id: f.id, nombre: f.document_name || f.original_name })), mensaje: AMBIGUOUS_FILE_MSG };
        }
        const file = resolved.files[0];
        const nombre = file.document_name || file.original_name;
        const fileRow = await pool.query(
          `SELECT stored_name, original_name, storage_provider, drive_file_id, dropbox_file_id, size_bytes
           FROM client_files WHERE id=$1`,
          [file.id],
        );
        if (!fileRow.rows.length) return { error: 'No encuentro ese archivo.' };
        const f = fileRow.rows[0];
        const ext = path.extname(f.original_name || f.stored_name || '').toLowerCase();
        const READABLE_EXTS = ['.pdf', '.docx', '.doc', '.txt', '.text', '.rtf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'];
        if (!READABLE_EXTS.includes(ext)) {
          return { error: `No puedo leer archivos ${ext || 'de este tipo'} todavía. Solo puedo leer PDF, Word, texto plano e imágenes escaneadas (con OCR).` };
        }
        try {
          const filePath = await ensureFileOnDisk(expedienteId, f.stored_name, f.storage_provider, f.drive_file_id, f.dropbox_file_id);
          const docFile: DocFile = { name: nombre, fullPath: filePath, ext, size: f.size_bytes || 0 };
          const texto = await extractTextFromFile(docFile);
          if (!texto.trim()) return { error: 'No se ha podido extraer texto legible de ese documento (puede estar vacío, o ser una imagen ilegible).' };
          return { archivo: nombre, expediente: resolved.label, texto };
        } catch (e: any) {
          return { error: `No se pudo leer el archivo: ${e.message}` };
        }
      }

      case 'preparar_borrado_archivo': {
        const expedienteId = String(args.expediente_id || '');
        const query = String(args.archivo || '');
        if (!expedienteId || !query) return { error: 'Faltan expediente_id o archivo.' };
        const resolved = await resolveExpedienteAndFile(organizacionId, expedienteId, query);
        if ('error' in resolved) return resolved;
        if (resolved.files.length === 0) return { error: `No encuentro ningún archivo que coincida con "${query}" en ese expediente.` };
        if (resolved.files.length > 1) {
          return { ambiguo: true, coincidencias: resolved.files.map(f => ({ id: f.id, nombre: f.document_name || f.original_name })), mensaje: AMBIGUOUS_FILE_MSG };
        }
        const file = resolved.files[0];
        const nombre = file.document_name || file.original_name;
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, file_id, file_name, expediente_id, expediente_label)
           VALUES ($1,$2,'delete',$3,$4,$5,$6) RETURNING id`,
          [organizacionId, userId, file.id, nombre, expedienteId, resolved.label],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'delete',
          titulo: `Borrar "${nombre}"`, detalle: `Expediente ${resolved.label}`,
          mensaje: 'Acción preparada: dile al usuario que confirme el borrado en la tarjeta que se le ha mostrado. Todavía NO está borrado.',
        };
      }

      case 'preparar_renombrado_archivo': {
        const expedienteId = String(args.expediente_id || '');
        const query = String(args.archivo || '');
        const nuevoNombre = String(args.nuevo_nombre || '').trim();
        if (!expedienteId || !query || !nuevoNombre) return { error: 'Faltan expediente_id, archivo o nuevo_nombre.' };
        const resolved = await resolveExpedienteAndFile(organizacionId, expedienteId, query);
        if ('error' in resolved) return resolved;
        if (resolved.files.length === 0) return { error: `No encuentro ningún archivo que coincida con "${query}" en ese expediente.` };
        if (resolved.files.length > 1) {
          return { ambiguo: true, coincidencias: resolved.files.map(f => ({ id: f.id, nombre: f.document_name || f.original_name })), mensaje: AMBIGUOUS_FILE_MSG };
        }
        const file = resolved.files[0];
        const nombreActual = file.document_name || file.original_name;
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, file_id, file_name, expediente_id, expediente_label, payload)
           VALUES ($1,$2,'rename',$3,$4,$5,$6,$7::jsonb) RETURNING id`,
          [organizacionId, userId, file.id, nombreActual, expedienteId, resolved.label, JSON.stringify({ newName: nuevoNombre })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'rename',
          titulo: `Renombrar "${nombreActual}" → "${nuevoNombre}"`, detalle: `Expediente ${resolved.label}`,
          mensaje: 'Acción preparada: dile al usuario que confirme el renombrado en la tarjeta que se le ha mostrado. Todavía NO está renombrado.',
        };
      }

      case 'preparar_movimiento_archivo': {
        const expedienteId = String(args.expediente_id || '');
        const query = String(args.archivo || '');
        const destinoTexto = String(args.expediente_destino || '');
        if (!expedienteId || !query || !destinoTexto) return { error: 'Faltan expediente_id, archivo o expediente_destino.' };
        const resolved = await resolveExpedienteAndFile(organizacionId, expedienteId, query);
        if ('error' in resolved) return resolved;
        if (resolved.files.length === 0) return { error: `No encuentro ningún archivo que coincida con "${query}" en ese expediente.` };
        if (resolved.files.length > 1) {
          return { ambiguo: true, coincidencias: resolved.files.map(f => ({ id: f.id, nombre: f.document_name || f.original_name })), mensaje: AMBIGUOUS_FILE_MSG };
        }
        const file = resolved.files[0];
        const nombre = file.document_name || file.original_name;

        const targets = await resolveExpedienteByText(organizacionId, destinoTexto);
        if (targets.length === 0) return { error: `No encuentro ningún expediente destino que coincida con "${destinoTexto}".` };
        if (targets.length > 1) {
          return { ambiguo: true, coincidencias: targets.map(t => ({ id: t.id, nombre: expedienteLabel(t) })), mensaje: AMBIGUOUS_EXP_MSG };
        }
        const target = targets[0];
        if (target.id === expedienteId) return { error: 'El expediente de destino es el mismo que el de origen.' };
        const targetLabel = expedienteLabel(target);

        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, file_id, file_name, expediente_id, expediente_label, payload)
           VALUES ($1,$2,'move',$3,$4,$5,$6,$7::jsonb) RETURNING id`,
          [organizacionId, userId, file.id, nombre, expedienteId, resolved.label, JSON.stringify({ targetExpedienteId: target.id, targetExpedienteLabel: targetLabel })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'move',
          titulo: `Mover "${nombre}"`, detalle: `De ${resolved.label} a ${targetLabel}`,
          mensaje: 'Acción preparada: dile al usuario que confirme el movimiento en la tarjeta que se le ha mostrado. Todavía NO se ha movido.',
        };
      }

      case 'preparar_actualizar_descripcion_expediente': {
        const expedienteId = String(args.expediente_id || '');
        const nuevaDescripcion = String(args.nueva_descripcion || '').trim();
        if (!expedienteId || !nuevaDescripcion) return { error: 'Faltan expediente_id o nueva_descripcion.' };
        const expRes = await pool.query(`SELECT anio, num_exp, descripcion FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [expedienteId, organizacionId]);
        if (!expRes.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
        const label = expedienteLabel(expRes.rows[0]);
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, expediente_id, expediente_label, payload)
           VALUES ($1,$2,'update_expediente',$3,$4,$5::jsonb) RETURNING id`,
          [organizacionId, userId, expedienteId, label, JSON.stringify({ descripcion: nuevaDescripcion })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'update_expediente',
          titulo: `Cambiar la descripción del expediente ${label}`, detalle: `Nueva descripción: "${nuevaDescripcion}"`,
          mensaje: 'Acción preparada: dile al usuario que confirme el cambio en la tarjeta que se le ha mostrado. Todavía NO se ha aplicado.',
        };
      }

      case 'preparar_crear_nota': {
        const clienteId = String(args.cliente_id || '');
        const expedienteIdArg = String(args.expediente_id || '');
        const contenido = String(args.contenido || '').trim();
        const categoria = String(args.categoria || 'general');
        if (!clienteId && !expedienteIdArg) return { error: 'Falta cliente_id o expediente_id.' };
        if (!contenido) return { error: 'Falta contenido.' };
        const validCats = ['general', 'urgente', 'seguimiento', 'recordatorio', 'comercial', 'legal', 'otro'];
        const cat = validCats.includes(categoria) ? categoria : 'general';

        let targetId: string; let targetLabel: string; let targetType: 'cliente' | 'expediente';
        if (expedienteIdArg) {
          const expRes = await pool.query(`SELECT anio, num_exp, descripcion FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [expedienteIdArg, organizacionId]);
          if (!expRes.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
          targetId = expedienteIdArg; targetLabel = expedienteLabel(expRes.rows[0]); targetType = 'expediente';
        } else {
          const clienteRes = await pool.query(
            `SELECT commercial_name, first_name, last_name FROM entities WHERE id=$1 AND organizacion_id=$2`,
            [clienteId, organizacionId],
          );
          if (!clienteRes.rows.length) return { error: 'No encuentro ese cliente en este despacho.' };
          const c = clienteRes.rows[0];
          targetId = clienteId; targetLabel = c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cliente'; targetType = 'cliente';
        }
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, expediente_id, expediente_label, payload)
           VALUES ($1,$2,'create_note',$3,$4,$5::jsonb) RETURNING id`,
          [organizacionId, userId, targetId, targetLabel, JSON.stringify({ content: contenido, category: cat, target_type: targetType })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'create_note',
          titulo: `Crear nota para ${targetLabel}`, detalle: contenido,
          mensaje: 'Acción preparada: dile al usuario que confirme la creación de la nota en la tarjeta que se le ha mostrado. Todavía NO se ha creado.',
        };
      }

      case 'detalle_cliente': {
        let clienteId = String(args.cliente_id || '');
        if (!clienteId && args.cliente_nombre) {
          const q = `%${args.cliente_nombre}%`;
          const found = await pool.query(
            `SELECT id FROM entities WHERE (commercial_name ILIKE $1 OR CONCAT(first_name,' ',last_name) ILIKE $1) AND organizacion_id=$2 LIMIT 1`,
            [q, organizacionId],
          );
          if (!found.rows.length) return { error: `No se encontró cliente con nombre "${args.cliente_nombre}"` };
          clienteId = found.rows[0].id;
        }
        if (!clienteId) return { error: 'Se requiere cliente_id o cliente_nombre' };
        const r = await pool.query(`
          SELECT e.*, COUNT(exp.id)::int AS num_expedientes, COUNT(n.id)::int AS num_notas
          FROM entities e
          LEFT JOIN expedientes exp ON exp.cliente_id = e.id
          LEFT JOIN notes n ON n.client_id = e.id
          WHERE e.id=$1 AND e.organizacion_id=$2
          GROUP BY e.id
        `, [clienteId, organizacionId]);
        if (!r.rows.length) return { error: 'No encuentro ese cliente en este despacho.' };
        const c = r.rows[0];
        return {
          cliente: {
            id: c.id, nombre: c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            tipo: c.type, estado: c.client_status, nif: c.nif_cif,
            email: c.email, telefonos: [c.phone_1, c.phone_2, c.phone_3, c.phone_mobile].filter(Boolean),
            direccion: [c.address_street, c.address_town, c.address_province, c.address_cp].filter(Boolean).join(', '),
            web: c.website, lopd: c.lopd, alta: c.date_alta,
            num_expedientes: c.num_expedientes, num_notas: c.num_notas,
          },
        };
      }

      case 'detalle_expediente': {
        const r = await pool.query(`
          SELECT e.*, COALESCE(ent.commercial_name, CONCAT(ent.first_name,' ',ent.last_name)) AS cliente_nombre
          FROM expedientes e LEFT JOIN entities ent ON ent.id = e.cliente_id
          WHERE e.id=$1 AND e.organizacion_id=$2
        `, [args.expediente_id, organizacionId]);
        if (!r.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
        const e = r.rows[0];
        return {
          expediente: {
            id: e.id, ref: `${e.anio}/${e.num_exp}`, ref_propia: e.ref_propia, descripcion: e.descripcion,
            tipo: e.tipo, estado: e.estado, cliente: e.cliente_nombre, contrario: e.contrario,
            procurador: e.procurador, procurador_contrario: e.procurador_contrario,
            abogado_propio: e.abogado_propio, abogado_contrario: e.abogado_contrario,
            juzgado: e.juzgado, tipo_proc: e.tipo_proc, num_autos: e.num_autos, nig: e.nig,
            fecha_inicio: e.fecha_inicio, fecha_cierre: e.fecha_cierre,
            importe_eur: e.importe != null ? Number(e.importe).toFixed(2) : null,
            observaciones: e.observaciones,
          },
        };
      }

      case 'listar_profesionales': {
        const limit = Math.min(Number(args.limit) || 15, 40);
        const conds = ['organizacion_id=$1'], params: any[] = [organizacionId];
        let pi = 2;
        if (args.tipo) { conds.push(`tipo=$${pi++}`); params.push(String(args.tipo).toUpperCase()); }
        if (args.busqueda) {
          conds.push(`(first_name ILIKE $${pi} OR last_name ILIKE $${pi} OR despacho ILIKE $${pi} OR colegio ILIKE $${pi} OR num_colegiado ILIKE $${pi})`);
          params.push(`%${args.busqueda}%`); pi++;
        }
        params.push(limit);
        const r = await pool.query(`
          SELECT tipo, first_name, last_name, despacho, colegio, num_colegiado, email, phone
          FROM directorio_profesionales WHERE ${conds.join(' AND ')}
          ORDER BY first_name ASC LIMIT $${pi}
        `, params);
        return { total: r.rowCount, profesionales: r.rows.map(p => ({ tipo: p.tipo, nombre: `${p.first_name} ${p.last_name || ''}`.trim(), despacho: p.despacho, colegio: p.colegio, num_colegiado: p.num_colegiado, email: p.email, telefono: p.phone })) };
      }

      case 'preparar_crear_tarea': {
        const titulo = String(args.titulo || '').trim();
        if (!titulo) return { error: 'Falta titulo.' };
        let clienteId = String(args.cliente_id || '');
        let expedienteIdArg = String(args.expediente_id || '');
        let clienteNombre = '';
        let expLabel = '';
        if (expedienteIdArg) {
          const expRes = await pool.query(`SELECT anio, num_exp, descripcion, cliente_id FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [expedienteIdArg, organizacionId]);
          if (!expRes.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
          expLabel = expedienteLabel(expRes.rows[0]);
          if (!clienteId) clienteId = expRes.rows[0].cliente_id;
        }
        if (!clienteId) return { error: 'Necesito cliente_id, o un expediente_id cuyo expediente tenga cliente asignado.' };
        const clienteRes = await pool.query(`SELECT commercial_name, first_name, last_name FROM entities WHERE id=$1 AND organizacion_id=$2`, [clienteId, organizacionId]);
        if (!clienteRes.rows.length) return { error: 'No encuentro ese cliente en este despacho.' };
        const c = clienteRes.rows[0];
        clienteNombre = c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cliente';
        const label = expLabel ? `${clienteNombre} (expediente ${expLabel})` : clienteNombre;
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, expediente_id, expediente_label, payload)
           VALUES ($1,$2,'create_task',$3,$4,$5::jsonb) RETURNING id`,
          [organizacionId, userId, clienteId, label, JSON.stringify({
            titulo, descripcion: args.descripcion || null, plazo: args.plazo || null,
            prioridad: args.prioridad || 'media', tipo: args.tipo || 'otro', expedienteId: expedienteIdArg || null,
          })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'create_task',
          titulo: `Crear tarea "${titulo}"`, detalle: `Para ${label}`,
          mensaje: 'Acción preparada: dile al usuario que confirme la creación de la tarea en la tarjeta que se le ha mostrado. Todavía NO se ha creado.',
        };
      }

      case 'preparar_actualizar_estado_tarea':
      case 'preparar_eliminar_tarea': {
        const isDelete = name === 'preparar_eliminar_tarea';
        const texto = String(args.tarea || '').trim();
        if (!texto) return { error: 'Falta tarea (texto para localizarla).' };
        const nuevoEstado = String(args.nuevo_estado || '');
        if (!isDelete && !['pendiente', 'urgente', 'completada'].includes(nuevoEstado)) {
          return { error: 'nuevo_estado debe ser pendiente, urgente o completada.' };
        }
        const matches = await resolveTaskByText(organizacionId, texto, args.expediente_id ? String(args.expediente_id) : undefined);
        if (matches.length === 0) return { error: `No encuentro ninguna tarea que coincida con "${texto}".` };
        if (matches.length > 1) {
          return { ambiguo: true, coincidencias: matches.map(t => ({ id: t.id, nombre: t.titulo })), mensaje: AMBIGUOUS_TASK_MSG };
        }
        const task = matches[0];
        const tipo = isDelete ? 'delete_task' : 'update_task';
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, expediente_label, payload)
           VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,
          [organizacionId, userId, tipo, task.titulo, JSON.stringify({ taskId: task.id, nuevoEstado })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo,
          titulo: isDelete ? `Eliminar la tarea "${task.titulo}"` : `Cambiar la tarea "${task.titulo}" a ${nuevoEstado}`,
          detalle: isDelete ? undefined : `Estado actual: ${task.estado}`,
          mensaje: `Acción preparada: dile al usuario que confirme en la tarjeta que se le ha mostrado. Todavía NO se ha ${isDelete ? 'eliminado' : 'cambiado'}.`,
        };
      }

      case 'preparar_crear_cita': {
        const titulo = String(args.titulo || '').trim();
        const fechaInicio = String(args.fecha_inicio || '').trim();
        if (!titulo || !fechaInicio) return { error: 'Faltan titulo o fecha_inicio.' };
        const startDate = new Date(fechaInicio);
        if (isNaN(startDate.getTime())) return { error: 'fecha_inicio no es una fecha válida.' };
        let contextLabel = titulo;
        if (args.expediente_id) {
          const expRes = await pool.query(`SELECT anio, num_exp, descripcion FROM expedientes WHERE id=$1 AND organizacion_id=$2`, [args.expediente_id, organizacionId]);
          if (!expRes.rows.length) return { error: 'No encuentro ese expediente en este despacho.' };
          contextLabel = `${titulo} (expediente ${expedienteLabel(expRes.rows[0])})`;
        }
        const pending = await pool.query(
          `INSERT INTO vantia_pending_actions (organizacion_id, user_id, tipo, expediente_id, expediente_label, payload)
           VALUES ($1,$2,'create_event',$3,$4,$5::jsonb) RETURNING id`,
          [organizacionId, userId, args.expediente_id || null, contextLabel, JSON.stringify({
            titulo, fechaInicio, fechaFin: args.fecha_fin || null, descripcion: args.descripcion || null,
            ubicacion: args.ubicacion || null, tipo: args.tipo || 'cita', expedienteId: args.expediente_id || null, clienteId: args.cliente_id || null,
          })],
        );
        return {
          accion_pendiente: true, token: pending.rows[0].id, tipo: 'create_event',
          titulo: `Crear cita "${titulo}"`, detalle: `${startDate.toLocaleString('es-ES')}`,
          mensaje: 'Acción preparada: dile al usuario que confirme la creación de la cita en la tarjeta que se le ha mostrado. Todavía NO se ha creado.',
        };
      }

      case 'buscar_correos': {
        const q = String(args.query || '').trim();
        const limit = Math.min(Number(args.limit) || 8, 20);
        const params: any[] = [userId];
        let where = 'user_id = $1';
        if (q) { params.push(`%${q}%`); where += ` AND (subject ILIKE $${params.length} OR snippet ILIKE $${params.length} OR from_name ILIKE $${params.length} OR from_email ILIKE $${params.length})`; }
        if (args.cliente_id) { params.push(args.cliente_id); where += ` AND cliente_id = $${params.length}`; }
        if (args.expediente_id) { params.push(args.expediente_id); where += ` AND expediente_id = $${params.length}`; }
        params.push(limit);
        const r = await pool.query(
          `SELECT from_name, from_email, subject, snippet, sent_at, is_read FROM emails WHERE ${where} ORDER BY sent_at DESC NULLS LAST LIMIT $${params.length}`,
          params,
        );
        return { total: r.rowCount, correos: r.rows };
      }

      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e: any) {
    console.error(`❌ Vantia tool [${name}]:`, e?.message);
    return { error: `Error ejecutando ${name}: ${e?.message}` };
  }
}

// ── GET /api/vantia/conversations ────────────────────────────────────────────
export const listConversations = async (req: Request, res: Response) => {
  // @ts-ignore
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false });
  try {
    const result = await pool.query(
      `SELECT id, module_id, title,
              history->0->>'text' AS first_message,
              updated_at, created_at
       FROM vantia_chat_history
       WHERE user_id = $1 AND module_id LIKE 'chat-ia:%'
       ORDER BY updated_at DESC`,
      [userId]
    );
    res.json({ success: true, conversations: result.rows });
  } catch (err) {
    console.error('❌ Error listing conversations:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};

// ── DELETE /api/vantia/conversations/:id ─────────────────────────────────────
export const deleteConversation = async (req: Request, res: Response) => {
  // @ts-ignore
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false });
  try {
    await pool.query(
      'DELETE FROM vantia_chat_history WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting conversation:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};

// ── GET /api/vantia/chat/history ──────────────────────────────────────────────
export const getChatHistory = async (req: Request, res: Response) => {
  const { moduleId } = req.query;
  // @ts-ignore
  const userId = req.auth?.userId;
  if (!moduleId || !userId) return res.status(400).json({ success: false, error: 'Faltan parámetros.' });
  try {
    const result = await pool.query(
      'SELECT history FROM vantia_chat_history WHERE user_id=$1 AND module_id=$2',
      [userId, String(moduleId)]
    );
    res.json({ success: true, history: result.rows[0]?.history || [] });
  } catch (err) {
    console.error('❌ Error fetching Vantia history:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};

// ── DELETE /api/vantia/chat/history ── vacía la conversación del widget
// flotante para el módulo actual (a diferencia de deleteConversation, que
// borra por id de fila y solo se usa desde el listado de Chat IA) ──────────
export const clearChatHistory = async (req: Request, res: Response) => {
  const { moduleId } = req.query;
  // @ts-ignore
  const userId = req.auth?.userId;
  if (!moduleId || !userId) return res.status(400).json({ success: false, error: 'Faltan parámetros.' });
  try {
    await pool.query(
      'DELETE FROM vantia_chat_history WHERE user_id=$1 AND module_id=$2',
      [userId, String(moduleId)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error clearing Vantia history:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};

// ── POST /api/vantia/chat ─────────────────────────────────────────────────────
export const chatVantia = async (req: any, res: Response) => {
  const {
    message,
    history  = [],
    moduleId,
  }: { message: string; history: any[]; moduleId: string } = req.body;

  const userId = req.auth?.userId;

  if (!message?.trim())     return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
  if (!userId || !moduleId) return res.status(400).json({ success: false, error: 'Falta userId o moduleId.' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'Vantia no está configurada. Añade GEMINI_API_KEY al .env del backend.' });

  try {
    // Construir el system prompt completo con contexto de entidad en paralelo al envío
    const [entityCtx] = await Promise.all([
      buildEntityContext(moduleId, userId, req.organizacionId),
    ]);

    const fullSystemPrompt =
      BASE_PROMPT +
      '\n\n' + moduleInstructions(moduleId) +
      entityCtx;

    // Gemini exige turnos alternados user/model y que el primero sea user.
    // Eliminamos turnos model del inicio del historial guardado (ej: saludo inicial).
    const cleanHistory: any[] = [...history];
    while (cleanHistory.length > 0 && cleanHistory[0].role === 'model') cleanHistory.shift();

    // Inyectamos el system prompt como primer turno user + confirmación model
    // (enfoque más compatible con todas las versiones de Gemini)
    let contents: any[] = [
      { role: 'user',  parts: [{ text: fullSystemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido. Soy Vantia, listo para ayudarte.' }] },
      ...cleanHistory.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    let reply = '';

    // Bucle agéntico — Gemini puede encadenar varias llamadas a herramientas
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            tools: TOOLS,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const err: any = await geminiRes.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${geminiRes.status}`;
        console.error(`❌ Gemini API error (round ${round}):`, geminiRes.status, msg, JSON.stringify(err?.error || {}));
        throw new Error(msg);
      }

      const data: any  = await geminiRes.json();
      const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
      const fnCalls    = parts.filter((p: any) => p.functionCall);
      const textParts  = parts.filter((p: any) => p.text);

      if (fnCalls.length === 0) {
        reply = textParts.map((p: any) => p.text || '').join('').trim()
          || 'No he podido procesar tu consulta. Inténtalo de nuevo.';
        break;
      }

      console.log(`🤖 Vantia ronda ${round + 1}: ${fnCalls.map((f: any) => f.functionCall.name).join(', ')}`);

      const toolResults = await Promise.all(
        fnCalls.map(async (part: any) => {
          const { name, args } = part.functionCall;
          return { name, result: await callTool(name, args ?? {}, userId, req.organizacionId) };
        })
      );

      contents.push({ role: 'model', parts });
      contents.push({
        role: 'user',
        parts: toolResults.map(tr => ({
          functionResponse: { name: tr.name, response: tr.result },
        })),
      });
    }

    if (!reply) reply = 'He procesado la consulta pero no pude generar una respuesta. Inténtalo de nuevo.';
    res.json({ success: true, reply });

    // Guardar historial en segundo plano (con título automático en primer mensaje)
    const isChatIa = moduleId.startsWith('chat-ia:');
    const isFirstMessage = isChatIa && history.length === 0;
    const fallbackTitle = isFirstMessage ? message.slice(0, 100) : null;
    pool.query(
      `INSERT INTO vantia_chat_history (user_id, module_id, history, title)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, module_id) DO UPDATE SET
         history = EXCLUDED.history,
         updated_at = NOW(),
         title = COALESCE(vantia_chat_history.title, EXCLUDED.title)`,
      [userId, moduleId, JSON.stringify([
        ...history,
        { role: 'user',  text: message },
        { role: 'model', text: reply },
      ]), fallbackTitle]
    ).then(() => {
      // Sustituye el título de reserva (el propio mensaje) por un resumen
      // generado por IA en cuanto está listo -- no bloquea nada, ya se
      // guardó la conversación al instante con el título provisional.
      if (!isFirstMessage) return;
      generateConversationTitle(message, reply).then(title => {
        if (!title) return;
        pool.query(`UPDATE vantia_chat_history SET title=$1 WHERE user_id=$2 AND module_id=$3`, [title, userId, moduleId]).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('❌ Vantia error:', msg);
    res.status(500).json({ success: false, error: msg });
  }
};

// ── Streaming real de Gemini (SSE) ──────────────────────────────────────────
// La API de Gemini, con `alt=sse`, va mandando el texto en fragmentos que hay
// que ir concatenando (no manda el texto acumulado, sino solo lo nuevo de
// cada fragmento). Esta función lee el cuerpo de la respuesta a mano (no hay
// cliente oficial en uso aquí, todo va por `fetch` crudo) y va entregando
// cada objeto JSON de cada evento `data: ...` según llega.
async function* geminiStreamChunks(url: string, body: any): AsyncGenerator<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const reader  = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Gemini separa cada evento SSE con \r\n\r\n (CRLF), no \n\n -- normalizar
    // a LF aquí antes de buscar el separador es lo que hace que esto
    // funcione. Sin esto, indexOf('\n\n') no encuentra NUNCA el separador
    // real y el buffer crece sin soltar ni un solo fragmento de texto.
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = rawEvent.split('\n').find(l => l.startsWith('data:'));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(5).trim();
      if (!jsonStr) continue;
      try { yield JSON.parse(jsonStr); } catch { /* fragmento incompleto o basura -- se ignora */ }
    }
  }
}

// ── POST /api/vantia/chat/stream ── versión con streaming real (SSE) + avisos
// de uso de herramientas en vivo, usada por la página Chat IA. El widget
// flotante sigue en /chat (sin streaming) para no tocar ese componente aparte.
export const chatVantiaStream = async (req: any, res: Response) => {
  const {
    message,
    history  = [],
    moduleId,
    linkedExpedienteId,
    model,
  }: { message: string; history: any[]; moduleId: string; linkedExpedienteId?: string; model?: string } = req.body;

  const userId = req.auth?.userId;
  const geminiModel = ALLOWED_GEMINI_MODELS.has(model as string) ? (model as string) : GEMINI_MODEL;

  if (!message?.trim())     return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
  if (!userId || !moduleId) return res.status(400).json({ success: false, error: 'Falta userId o moduleId.' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'Vantia no está configurada. Añade GEMINI_API_KEY al .env del backend.' });

  // OJO: nada de 'Connection: keep-alive' aquí -- es una cabecera hop-by-hop
  // exclusiva de HTTP/1.1, prohibida en HTTP/2 (RFC 7540 §8.1.2.2). Railway
  // habla HTTP/2 con el navegador; si esa cabecera llega tal cual al cliente
  // provoca net::ERR_HTTP2_PROTOCOL_ERROR a media respuesta (la conexión
  // arranca con 200 pero se corta en cuanto el navegador la valida).
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // evita que un proxy intermedio (nginx, etc.) bufferee el stream
  });
  // Fuerza el envío inmediato de las cabeceras: sin esto, Node/el proxy puede
  // retenerlas hasta el primer res.write() con datos, y ese primer write no
  // llega hasta que buildEntityContext() + la primera respuesta de Gemini
  // resuelven -- si eso tarda más que el timeout de "primer byte" del proxy
  // de turno, la conexión se corta y el fetch() del navegador falla con un
  // genérico "Failed to fetch" en vez de un error legible.
  res.flushHeaders?.();
  const emit = (obj: object) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  // Comentario SSE (ignorado por el parser del cliente, que solo mira líneas
  // "data:") solo para garantizar que algo viaja por el socket cuanto antes.
  res.write(': connected\n\n');

  // OJO: esto tiene que ir en `res` (la respuesta), no en `req` (la petición).
  // `req.on('close')` se dispara en cuanto Node termina de LEER el cuerpo de
  // la petición entrante -- que para un POST con body ya está consumido
  // (por express.json()) prácticamente al llegar aquí -- no cuando el
  // cliente deja de escuchar la respuesta. Usarlo aquí marcaba `closed=true`
  // casi al instante, así que el bucle de abajo (con `&& !closed`) nunca
  // llegaba ni a arrancar: la respuesta se quedaba abierta sin hacer nada
  // hasta que el requestTimeout por defecto de Node (5 minutos) la mataba.
  // Esto explicaba el "no genera respuesta" que costó tanto depurar.
  let closed = false;
  res.on('close', () => { closed = true; clearInterval(heartbeat); });

  // Latido de seguridad: mantiene la conexión "viva" a ojos de cualquier
  // proxy intermedio durante los huecos sin datos (p.ej. mientras Gemini
  // genera), sin afectar al contenido real (comentario SSE, el parser del
  // cliente solo mira líneas "data:").
  const heartbeat = setInterval(() => { if (!closed) res.write(': hb\n\n'); }, 10000);

  try {
    const entityCtx = await buildEntityContext(moduleId, userId, req.organizacionId, linkedExpedienteId);
    const fullSystemPrompt = BASE_PROMPT + '\n\n' + moduleInstructions(moduleId) + entityCtx;

    const cleanHistory: any[] = [...history];
    while (cleanHistory.length > 0 && cleanHistory[0].role === 'model') cleanHistory.shift();

    const contents: any[] = [
      { role: 'user',  parts: [{ text: fullSystemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido. Soy Vantia, listo para ayudarte.' }] },
      ...cleanHistory.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    let fullReply = '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Google no da un endpoint de "cuota restante" consultable con una API
    // key normal -- se lleva la cuenta propia de lo que se gasta en esta
    // conversación (cada ronda es una llamada real a la API, facturable por
    // separado) para acumularlo en vantia_usage_daily al terminar.
    let apiCallsMade = 0;
    let usagePromptTokens = 0, usageCompletionTokens = 0, usageTotalTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS && !closed; round++) {
      const roundParts: any[] = [];
      let roundUsage: any = null;
      apiCallsMade++;

      for await (const chunk of geminiStreamChunks(url, {
        contents,
        tools: TOOLS,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      })) {
        if (closed) break;
        if (chunk?.usageMetadata) roundUsage = chunk.usageMetadata;
        const parts: any[] = chunk?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          roundParts.push(p);
          if (p.text) {
            fullReply += p.text;
            emit({ type: 'text', delta: p.text });
          }
        }
      }
      if (roundUsage) {
        usagePromptTokens     += roundUsage.promptTokenCount || 0;
        usageCompletionTokens += roundUsage.candidatesTokenCount || 0;
        usageTotalTokens      += roundUsage.totalTokenCount || 0;
      }
      if (closed) break;

      const fnCalls = roundParts.filter(p => p.functionCall);
      if (fnCalls.length === 0) break; // ronda final: ya no pide más herramientas

      console.log(`🤖 Vantia (stream) ronda ${round + 1}: ${fnCalls.map((f: any) => f.functionCall.name).join(', ')}`);

      const toolResults: { name: string; result: object }[] = [];
      for (const part of fnCalls) {
        if (closed) break;
        const { name, args } = part.functionCall;
        emit({ type: 'tool_start', name, label: TOOL_LABELS[name] || `Consultando ${name}…` });
        const result = await callTool(name, args ?? {}, userId, req.organizacionId);
        toolResults.push({ name, result });
        emit({ type: 'tool_end', name });
        // Propuesta de gestión de archivo (borrar/renombrar/mover): se manda
        // como evento propio, independiente de lo que Gemini narre en texto,
        // para que el frontend pinte la tarjeta de confirmación siempre que
        // de verdad se haya creado una fila 'pending' -- no solo cuando el
        // modelo la menciona (o se le olvida mencionarla) en su respuesta.
        if ((result as any)?.accion_pendiente && (result as any)?.token) {
          emit({ type: 'action_proposal', ...(result as any) });
        }
      }

      contents.push({ role: 'model', parts: roundParts.length ? roundParts : [{ text: '' }] });
      contents.push({
        role: 'user',
        parts: toolResults.map(tr => ({ functionResponse: { name: tr.name, response: tr.result } })),
      });
    }

    if (!fullReply) fullReply = 'He procesado la consulta pero no pude generar una respuesta. Inténtalo de nuevo.';

    clearInterval(heartbeat);
    if (!closed) {
      emit({ type: 'done', reply: fullReply });
      res.end();
    }

    // Uso de hoy, en segundo plano -- si no se hizo ninguna llamada real no
    // hay nada que sumar (p.ej. si falló antes de arrancar el bucle).
    if (apiCallsMade > 0) {
      pool.query(
        `INSERT INTO vantia_usage_daily (usage_date, requests, prompt_tokens, completion_tokens, total_tokens)
         VALUES (CURRENT_DATE, $1, $2, $3, $4)
         ON CONFLICT (usage_date) DO UPDATE SET
           requests = vantia_usage_daily.requests + EXCLUDED.requests,
           prompt_tokens = vantia_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
           completion_tokens = vantia_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
           total_tokens = vantia_usage_daily.total_tokens + EXCLUDED.total_tokens`,
        [apiCallsMade, usagePromptTokens, usageCompletionTokens, usageTotalTokens],
      ).catch(() => {});
    }

    // Guardar historial en segundo plano, igual que en /chat
    const isChatIa = moduleId.startsWith('chat-ia:');
    const isFirstMessage = isChatIa && history.length === 0;
    const fallbackTitle = isFirstMessage ? message.slice(0, 100) : null;
    pool.query(
      `INSERT INTO vantia_chat_history (user_id, module_id, history, title)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, module_id) DO UPDATE SET
         history = EXCLUDED.history,
         updated_at = NOW(),
         title = COALESCE(vantia_chat_history.title, EXCLUDED.title)`,
      [userId, moduleId, JSON.stringify([
        ...history,
        { role: 'user',  text: message },
        { role: 'model', text: fullReply },
      ]), fallbackTitle]
    ).then(() => {
      if (!isFirstMessage) return;
      generateConversationTitle(message, fullReply).then(title => {
        if (!title) return;
        pool.query(`UPDATE vantia_chat_history SET title=$1 WHERE user_id=$2 AND module_id=$3`, [title, userId, moduleId]).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('❌ Vantia stream error:', msg);
    clearInterval(heartbeat);
    if (!closed) {
      emit({ type: 'error', message: msg });
      res.end();
    }
  }
};

// ── POST /api/vantia/feedback ── 👍/👎 sobre una respuesta concreta de Vantia.
// Guarda un único voto por (usuario, conversación, índice de mensaje); mandar
// rating:null borra el voto (el frontend lo usa para "deshacer" un clic).
// ── POST /api/vantia/actions/:token/confirm ── ejecuta de verdad una acción
// de archivo que el chat dejó propuesta (borrar/renombrar/mover) -- este es
// el ÚNICO sitio de todo el flujo de Vantia que llega a tocar un archivo
// real. Solo se llega aquí con un clic explícito del usuario en la tarjeta.
export const confirmVantiaAction = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const organizacionId = req.organizacionId;
  const { token } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado.' });
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM vantia_pending_actions WHERE id = $1 AND organizacion_id = $2`,
      [token, organizacionId],
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Acción no encontrada.' });
    const action = rows[0];

    if (action.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: action.status === 'confirmed' ? 'Esta acción ya se ejecutó antes.' : 'Esta acción ya no está disponible.',
      });
    }
    // Caduca a los 30 min -- evita ejecutar sobre un archivo que puede haber
    // cambiado (o desaparecido) desde que se propuso la acción.
    if (Date.now() - new Date(action.created_at).getTime() > 30 * 60 * 1000) {
      await pool.query(`UPDATE vantia_pending_actions SET status='expired', resolved_at=NOW() WHERE id=$1`, [token]);
      return res.status(410).json({ success: false, error: 'Esta propuesta caducó. Pídeselo de nuevo a Vantia.' });
    }

    let result: { success: boolean; error?: string };
    if (action.tipo === 'delete') {
      result = await performDeleteFile(action.expediente_id, action.file_id);
    } else if (action.tipo === 'rename') {
      result = await performRenameFile(action.expediente_id, action.file_id, action.payload?.newName || '');
    } else if (action.tipo === 'move') {
      result = await performMoveFile(action.expediente_id, action.file_id, action.payload?.targetExpedienteId);
    } else if (action.tipo === 'update_expediente') {
      try {
        const nuevaDescripcion = action.payload?.descripcion;
        if (!nuevaDescripcion) throw new Error('Nada que actualizar.');
        const r = await pool.query(
          `UPDATE expedientes SET descripcion = $1 WHERE id = $2 AND organizacion_id = $3`,
          [nuevaDescripcion, action.expediente_id, organizacionId],
        );
        result = r.rowCount ? { success: true } : { success: false, error: 'No se encontró el expediente.' };
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
    } else if (action.tipo === 'create_note') {
      try {
        const targetType = action.payload?.target_type === 'expediente' ? 'expediente' : 'cliente';
        const column = targetType === 'expediente' ? 'expediente_id' : 'client_id';
        await pool.query(
          `INSERT INTO notes (${column}, content, category, created_by) VALUES ($1,$2,$3,$4)`,
          [action.expediente_id, action.payload?.content || '', action.payload?.category || 'general', userId],
        );
        result = { success: true };
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
    } else if (action.tipo === 'create_task') {
      try {
        const p = action.payload || {};
        if (!p.titulo) throw new Error('Falta el título de la tarea.');
        const userName = await resolveUserName(userId);
        const clienteRes = await pool.query(`SELECT COALESCE(commercial_name, CONCAT(first_name,' ',last_name)) AS nombre FROM entities WHERE id=$1`, [action.expediente_id]);
        await pool.query(
          `INSERT INTO client_tasks (client_id, client_name, titulo, descripcion, plazo, estado, prioridad, tipo, expediente_id, created_by, user_id, organizacion_id)
           VALUES ($1,$2,$3,$4,$5,'pendiente',$6,$7,$8,$9,$10,$11)`,
          [action.expediente_id, clienteRes.rows[0]?.nombre || null, p.titulo, p.descripcion || null, p.plazo || null, p.prioridad || 'media', p.tipo || 'otro', p.expedienteId || null, userName, userId, organizacionId],
        );
        result = { success: true };
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
    } else if (action.tipo === 'update_task') {
      try {
        const p = action.payload || {};
        if (!p.taskId || !p.nuevoEstado) throw new Error('Faltan datos de la tarea.');
        const r = await pool.query(
          `UPDATE client_tasks SET estado=$1, updated_at=NOW() WHERE id=$2 AND organizacion_id=$3 RETURNING agenda_event_id`,
          [p.nuevoEstado, p.taskId, organizacionId],
        );
        if (!r.rowCount) throw new Error('No se encontró la tarea.');
        const agendaEventId = r.rows[0].agenda_event_id;
        if (agendaEventId) {
          await pool.query(`UPDATE agenda_events SET status=$1, updated_at=NOW() WHERE id=$2`, [p.nuevoEstado === 'completada' ? 'completado' : 'pendiente', agendaEventId]);
        }
        result = { success: true };
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
    } else if (action.tipo === 'delete_task') {
      try {
        const p = action.payload || {};
        if (!p.taskId) throw new Error('Falta el id de la tarea.');
        const before = await pool.query(`SELECT agenda_event_id FROM client_tasks WHERE id=$1 AND organizacion_id=$2`, [p.taskId, organizacionId]);
        const r = await pool.query(`DELETE FROM client_tasks WHERE id=$1 AND organizacion_id=$2`, [p.taskId, organizacionId]);
        if (!r.rowCount) throw new Error('No se encontró la tarea.');
        if (before.rows[0]?.agenda_event_id) await pool.query(`DELETE FROM agenda_events WHERE id=$1`, [before.rows[0].agenda_event_id]);
        result = { success: true };
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
    } else if (action.tipo === 'create_event') {
      try {
        const p = action.payload || {};
        if (!p.titulo || !p.fechaInicio) throw new Error('Faltan datos de la cita.');
        const userName = await resolveUserName(userId);
        await pool.query(
          `INSERT INTO agenda_events (user_id, user_name, title, description, start_at, end_at, all_day, type, status, expediente_id, cliente_id, location, source, organizacion_id)
           VALUES ($1,$2,$3,$4,$5,$6,false,$7,'pendiente',$8,$9,$10,'vantia',$11)`,
          [userId, userName, p.titulo, p.descripcion || null, p.fechaInicio, p.fechaFin || null, p.tipo || 'cita', p.expedienteId || null, p.clienteId || null, p.ubicacion || null, organizacionId],
        );
        result = { success: true };
      } catch (e: any) {
        result = { success: false, error: e.message };
      }
    } else {
      result = { success: false, error: 'Tipo de acción desconocido.' };
    }

    await pool.query(
      `UPDATE vantia_pending_actions SET status = $1, resolved_at = NOW() WHERE id = $2`,
      [result.success ? 'confirmed' : 'cancelled', token],
    );
    if (!result.success) return res.status(500).json({ success: false, error: result.error || 'No se pudo completar la acción.' });

    const activityMsg = action.tipo === 'delete' ? `Vantia (chat IA) eliminó el archivo "${action.file_name}"`
      : action.tipo === 'rename' ? `Vantia (chat IA) renombró el archivo "${action.file_name}"`
      : action.tipo === 'move' ? `Vantia (chat IA) movió el archivo "${action.file_name}"`
      : action.tipo === 'update_expediente' ? `Vantia (chat IA) actualizó la descripción del expediente ${action.expediente_label}`
      : action.tipo === 'create_note' ? `Vantia (chat IA) creó una nota para ${action.expediente_label}`
      : action.tipo === 'create_task' ? `Vantia (chat IA) creó la tarea "${action.payload?.titulo}" para ${action.expediente_label}`
      : action.tipo === 'update_task' ? `Vantia (chat IA) cambió el estado de la tarea "${action.expediente_label}" a ${action.payload?.nuevoEstado}`
      : action.tipo === 'delete_task' ? `Vantia (chat IA) eliminó la tarea "${action.expediente_label}"`
      : `Vantia (chat IA) creó la cita "${action.payload?.titulo}"`;
    const entityType = ['delete', 'rename', 'move', 'update_expediente'].includes(action.tipo) ? 'EXPEDIENTE'
      : ['update_task', 'delete_task'].includes(action.tipo) ? 'TASK'
      : action.tipo === 'create_note' ? (action.payload?.target_type === 'expediente' ? 'EXPEDIENTE' : 'CLIENT')
      : action.tipo === 'create_task' ? 'CLIENT'
      : 'AGENDA';
    const entityId = ['update_task', 'delete_task'].includes(action.tipo) ? action.payload?.taskId : action.expediente_id;
    logActivityForReq(req, activityMsg, entityType, entityId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || 'No se pudo completar la acción.' });
  }
};

// ── POST /api/vantia/actions/:token/cancel ── descarta una propuesta sin
// tocar nada. Se llama al pulsar "Cancelar" en la tarjeta.
export const cancelVantiaAction = async (req: any, res: Response) => {
  const organizacionId = req.organizacionId;
  const { token } = req.params;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    await pool.query(
      `UPDATE vantia_pending_actions SET status='cancelled', resolved_at=NOW() WHERE id=$1 AND organizacion_id=$2 AND status='pending'`,
      [token, organizacionId],
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || 'No se pudo cancelar.' });
  }
};

// ── GET /api/vantia/usage ── lo que se lleva gastado HOY con la API key del
// despacho (propia cuenta de Vantia; Google no expone un endpoint de cuota
// restante), más los límites públicos conocidos de la cuenta gratuita, para
// el menú de propiedades del modelo en el selector del chat.
export const getVantiaUsage = async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT requests, prompt_tokens, completion_tokens, total_tokens FROM vantia_usage_daily WHERE usage_date = CURRENT_DATE`,
    );
    const row = r.rows[0] || { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    res.json({
      success: true,
      data: {
        date: new Date().toISOString().slice(0, 10),
        requests: Number(row.requests),
        promptTokens: Number(row.prompt_tokens),
        completionTokens: Number(row.completion_tokens),
        totalTokens: Number(row.total_tokens),
        resetsNote: 'La cuota gratuita de Google se reinicia a medianoche, hora del Pacífico (EE. UU.) -- unas 08:00-09:00 en España según el horario.',
        limits: GEMINI_FREE_TIER_LIMITS,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
};

// ── GET /api/vantia/history ── historial de lo que Vantia ha consultado y
// propuesto en este despacho (trazabilidad de la IA) -- toda la organización,
// no solo el usuario que pregunta, igual que el resto de Trazabilidad.
export const getVantiaHistory = async (req: any, res: Response) => {
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  try {
    const r = await pool.query(
      `SELECT l.id, l.user_id, l.tool_name, l.kind, l.summary, l.ok, l.created_at,
              p.status AS pending_status
       FROM vantia_tool_log l
       LEFT JOIN vantia_pending_actions p ON p.id = l.pending_action_id
       WHERE l.organizacion_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizacionId, limit, offset],
    );
    const uniqueUserIds = [...new Set(r.rows.map(row => row.user_id))];
    const names = await Promise.all(uniqueUserIds.map(id => resolveUserName(id)));
    const nameByUser = Object.fromEntries(uniqueUserIds.map((id, i) => [id, names[i]]));
    res.json({
      success: true,
      data: r.rows.map(row => ({
        id: row.id,
        userName: nameByUser[row.user_id] || row.user_id,
        toolName: row.tool_name,
        kind: row.kind,
        summary: row.summary,
        ok: row.ok,
        pendingStatus: row.pending_status,
        createdAt: row.created_at,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export const submitFeedback = async (req: any, res: Response) => {
  const { moduleId, messageIndex, rating, messageExcerpt } = req.body as {
    moduleId?: string; messageIndex?: number; rating?: 'up' | 'down'; messageExcerpt?: string;
  };
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false });
  if (!moduleId || typeof messageIndex !== 'number' || (rating !== 'up' && rating !== 'down' && rating !== null)) {
    return res.status(400).json({ success: false, error: 'Parámetros inválidos.' });
  }
  try {
    if (rating === null) {
      await pool.query(
        `DELETE FROM vantia_message_feedback WHERE user_id=$1 AND module_id=$2 AND message_index=$3`,
        [userId, moduleId, messageIndex]
      );
      return res.json({ success: true, rating: null });
    }
    await pool.query(
      `INSERT INTO vantia_message_feedback (user_id, module_id, message_index, rating, message_excerpt)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, module_id, message_index) DO UPDATE SET
         rating = EXCLUDED.rating, message_excerpt = EXCLUDED.message_excerpt, created_at = NOW()`,
      [userId, moduleId, messageIndex, rating, (messageExcerpt || '').slice(0, 500)]
    );
    res.json({ success: true, rating });
  } catch (err: any) {
    console.error('❌ Error guardando feedback de Vantia:', err?.message);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};
