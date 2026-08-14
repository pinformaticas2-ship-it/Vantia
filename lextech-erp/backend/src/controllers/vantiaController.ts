import { Response, Request } from 'express';
import pool from '../config/database';

const GEMINI_MODEL   = 'gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 5;

// ── Prompt base — identidad + capacidades ────────────────────────────────────
const BASE_PROMPT = `Eres VantIA, la inteligencia artificial integrada en VANTIA Legis ERP. Eres un asistente completo, culto y capaz de ayudar con absolutamente cualquier cosa.

QUIÉN ERES:
Eres una IA de última generación con conocimiento amplio en derecho español e internacional, procesal civil y penal, derecho mercantil, fiscal, laboral, hipotecario y constitucional. También dominas redacción jurídica y no jurídica, análisis de documentos, estrategia procesal, doctrina, jurisprudencia del Tribunal Supremo y el TJUE, normativa europea, y conocimiento general en cualquier materia (historia, ciencia, tecnología, economía, medicina, cultura, etc.).

ADEMÁS, tienes acceso en tiempo real a la base de datos de ESTE despacho: clientes, expedientes, tareas, actuaciones, facturas, gastos, presupuestos, agenda, archivos y notas.

CÓMO DEBES COMPORTARTE:
- Responde SIEMPRE en español con naturalidad, precisión y el tono adecuado al contexto (formal si es jurídico, conversacional si es casual).
- Si te preguntan algo de conocimiento general, cultura, ciencia, historia, tecnología, o cualquier tema → responde directamente y en profundidad, sin buscar en la base de datos.
- Si te preguntan por redacción (contratos, escritos, demandas, emails, cartas, informes) → redacta directamente con calidad profesional.
- Si te preguntan por datos REALES del despacho (clientes concretos, expedientes activos, facturas, tareas) → usa las herramientas para obtener datos reales. Nunca inventes nombres, cifras ni referencias.
- Si ya tienes en el contexto datos de la entidad en pantalla → úsalos directamente sin volver a buscarlos.
- Nunca muestres JSON en bruto. Convierte siempre los resultados en texto natural y bien formateado.
- Puedes razonar, debatir, opinar (con matices), calcular, traducir, resumir, corregir, mejorar textos, generar ideas, hacer listas, comparar opciones, explicar paso a paso, y mucho más.
- Si alguien te saluda, respóndele con naturalidad. Si te hacen una pregunta de la vida cotidiana, respóndela. Eres un asistente sin restricciones temáticas.

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
    console.warn('⚠️  VantIA context error:', e?.message);
  }

  return lines.length ? '\n\n---\n' + lines.join('\n') : '';
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
  ],
}];

// ── Etiquetas en español de cada herramienta, para mostrar en el frontend
// mientras VantIA está consultando datos reales (p.ej. "Buscando clientes…") ──
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
};

// ── Dispatcher de herramientas ────────────────────────────────────────────────
async function callTool(name: string, args: Record<string, any>, userId: string, organizacionId: string): Promise<object> {
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
        const r = await pool.query(`
          SELECT original_name, document_name, category, size_bytes, created_at
          FROM client_files WHERE client_id=$1 ORDER BY created_at DESC LIMIT 30
        `, [args.expediente_id]);
        return { total: r.rowCount, archivos: r.rows.map(f => ({ nombre: f.document_name || f.original_name, categoria: f.category, tamano_kb: f.size_bytes ? Math.round(f.size_bytes / 1024) : null, fecha: f.created_at })) };
      }

      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e: any) {
    console.error(`❌ VantIA tool [${name}]:`, e?.message);
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
    console.error('❌ Error fetching VantIA history:', err);
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
    console.error('❌ Error clearing VantIA history:', err);
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
  if (!apiKey) return res.status(503).json({ success: false, error: 'VantIA no está configurada. Añade GEMINI_API_KEY al .env del backend.' });

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
      { role: 'model', parts: [{ text: 'Entendido. Soy VantIA, listo para ayudarte.' }] },
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

      console.log(`🤖 VantIA ronda ${round + 1}: ${fnCalls.map((f: any) => f.functionCall.name).join(', ')}`);

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
    const autoTitle = (isChatIa && history.length === 0) ? message.slice(0, 100) : null;
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
      ]), autoTitle]
    ).catch(() => {});

  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('❌ VantIA error:', msg);
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
  }: { message: string; history: any[]; moduleId: string; linkedExpedienteId?: string } = req.body;

  const userId = req.auth?.userId;

  if (!message?.trim())     return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
  if (!userId || !moduleId) return res.status(400).json({ success: false, error: 'Falta userId o moduleId.' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'VantIA no está configurada. Añade GEMINI_API_KEY al .env del backend.' });

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
      { role: 'model', parts: [{ text: 'Entendido. Soy VantIA, listo para ayudarte.' }] },
      ...cleanHistory.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    let fullReply = '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

    for (let round = 0; round < MAX_TOOL_ROUNDS && !closed; round++) {
      const roundParts: any[] = [];

      for await (const chunk of geminiStreamChunks(url, {
        contents,
        tools: TOOLS,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      })) {
        if (closed) break;
        const parts: any[] = chunk?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          roundParts.push(p);
          if (p.text) {
            fullReply += p.text;
            emit({ type: 'text', delta: p.text });
          }
        }
      }
      if (closed) break;

      const fnCalls = roundParts.filter(p => p.functionCall);
      if (fnCalls.length === 0) break; // ronda final: ya no pide más herramientas

      console.log(`🤖 VantIA (stream) ronda ${round + 1}: ${fnCalls.map((f: any) => f.functionCall.name).join(', ')}`);

      const toolResults: { name: string; result: object }[] = [];
      for (const part of fnCalls) {
        if (closed) break;
        const { name, args } = part.functionCall;
        emit({ type: 'tool_start', name, label: TOOL_LABELS[name] || `Consultando ${name}…` });
        const result = await callTool(name, args ?? {}, userId, req.organizacionId);
        toolResults.push({ name, result });
        emit({ type: 'tool_end', name });
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

    // Guardar historial en segundo plano, igual que en /chat
    const isChatIa = moduleId.startsWith('chat-ia:');
    const autoTitle = (isChatIa && history.length === 0) ? message.slice(0, 100) : null;
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
      ]), autoTitle]
    ).catch(() => {});

  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('❌ VantIA stream error:', msg);
    clearInterval(heartbeat);
    if (!closed) {
      emit({ type: 'error', message: msg });
      res.end();
    }
  }
};

// ── POST /api/vantia/feedback ── 👍/👎 sobre una respuesta concreta de VantIA.
// Guarda un único voto por (usuario, conversación, índice de mensaje); mandar
// rating:null borra el voto (el frontend lo usa para "deshacer" un clic).
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
    console.error('❌ Error guardando feedback de VantIA:', err?.message);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};
