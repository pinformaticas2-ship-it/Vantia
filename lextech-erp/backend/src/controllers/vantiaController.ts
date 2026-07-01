import { Response, Request } from 'express';
import pool from '../config/database';

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPT =
  'Eres VantIA, el asistente inteligente de VANTIA Legis ERP, un sistema de gestión para despachos de abogados. ' +
  'Tienes acceso en tiempo real a la base de datos del despacho a través de herramientas especializadas. ' +
  'SIEMPRE usa las herramientas disponibles cuando el usuario pregunte por datos concretos: clientes, expedientes, tareas, ' +
  'facturas, agenda, notas o estadísticas. No inventes datos ni respondas "no tengo acceso" si tienes una herramienta adecuada. ' +
  'Responde en español, de forma concisa y profesional. Interpreta los resultados de las herramientas y redacta ' +
  'una respuesta natural y útil. Si el usuario pregunta algo fuera del ámbito jurídico o del sistema, ' +
  'redirige amablemente la conversación.';

// ── Definición de herramientas ────────────────────────────────────────────────
const TOOLS = [{
  function_declarations: [
    {
      name: 'estadisticas_generales',
      description: 'Obtiene estadísticas generales del despacho: clientes totales, expedientes activos, tareas pendientes/urgentes/vencidas, facturas por cobrar e importe total pendiente, próximos eventos de agenda.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'buscar_clientes',
      description: 'Busca clientes en la base de datos por nombre, empresa o NIF/CIF. Devuelve nombre, tipo, email, teléfono y fecha de alta.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto de búsqueda: nombre, apellido, empresa o NIF/CIF' },
          limit: { type: 'integer', description: 'Máximo de resultados (por defecto 8, máximo 20)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'listar_expedientes',
      description: 'Lista expedientes del despacho. Puede filtrar por estado o buscar por número/descripción.',
      parameters: {
        type: 'object',
        properties: {
          estado:   { type: 'string',  description: "Estado: 'activo', 'cerrado', 'suspendido', 'archivado'" },
          busqueda: { type: 'string',  description: 'Texto para buscar en número (p.ej. "2024/001") o descripción' },
          limit:    { type: 'integer', description: 'Máximo de resultados (por defecto 10, máximo 30)' },
        },
      },
    },
    {
      name: 'obtener_tareas',
      description: 'Obtiene las tareas y actuaciones del usuario actual. Puede filtrar por estado o mostrar solo las vencidas.',
      parameters: {
        type: 'object',
        properties: {
          estado:        { type: 'string',  description: "Estado: 'pendiente', 'urgente', 'completada'" },
          solo_vencidas: { type: 'boolean', description: 'Si true, solo tareas con plazo ya vencido' },
          limit:         { type: 'integer', description: 'Máximo de resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'listar_facturas',
      description: 'Lista facturas del sistema. Puede filtrar por estado o buscar por número/contacto.',
      parameters: {
        type: 'object',
        properties: {
          estado:   { type: 'string',  description: "Estado: 'pendiente', 'pagada', 'vencida', 'cancelada'" },
          busqueda: { type: 'string',  description: 'Buscar por número de factura o nombre del contacto' },
          limit:    { type: 'integer', description: 'Máximo de resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'listar_gastos',
      description: 'Lista gastos registrados en el sistema con filtros opcionales.',
      parameters: {
        type: 'object',
        properties: {
          estado:   { type: 'string',  description: "Estado: 'pendiente', 'pagado'" },
          busqueda: { type: 'string',  description: 'Buscar por número o proveedor' },
          limit:    { type: 'integer', description: 'Máximo de resultados (por defecto 10)' },
        },
      },
    },
    {
      name: 'agenda_proxima',
      description: 'Obtiene los próximos eventos de la agenda del usuario.',
      parameters: {
        type: 'object',
        properties: {
          dias: { type: 'integer', description: 'Días hacia adelante a consultar (por defecto 14, máximo 60)' },
        },
      },
    },
    {
      name: 'buscar_notas',
      description: 'Busca notas internas del despacho por contenido.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string',  description: 'Texto a buscar en las notas' },
          limit: { type: 'integer', description: 'Máximo de resultados (por defecto 8)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'listar_presupuestos',
      description: 'Lista presupuestos del sistema con filtros opcionales.',
      parameters: {
        type: 'object',
        properties: {
          estado:   { type: 'string',  description: "Estado: 'pendiente', 'aceptado', 'rechazado'" },
          busqueda: { type: 'string',  description: 'Buscar por número o contacto' },
          limit:    { type: 'integer', description: 'Máximo de resultados (por defecto 10)' },
        },
      },
    },
  ],
}];

// ── Dispatcher de herramientas ────────────────────────────────────────────────
async function callTool(name: string, args: Record<string, any>, userId: string): Promise<object> {
  try {
    switch (name) {

      case 'estadisticas_generales': {
        const r = await pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM entities WHERE type = 'CLIENTE')                                                    AS total_clientes,
            (SELECT COUNT(*)::int FROM expedientes WHERE estado NOT IN ('cerrado','archivado'))                             AS expedientes_activos,
            (SELECT COUNT(*)::int FROM expedientes WHERE estado = 'cerrado')                                               AS expedientes_cerrados,
            (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND estado != 'completada')                        AS tareas_pendientes,
            (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND estado = 'urgente')                            AS tareas_urgentes,
            (SELECT COUNT(*)::int FROM client_tasks WHERE created_by=$1 AND plazo < NOW() AND estado != 'completada')      AS tareas_vencidas,
            (SELECT COUNT(*)::int FROM facturacion_facturas WHERE estado = 'pendiente')                                    AS facturas_pendientes,
            (SELECT COALESCE(SUM(total),0) FROM facturacion_facturas WHERE estado = 'pendiente')                           AS importe_pendiente_eur,
            (SELECT COUNT(*)::int FROM facturacion_gastos WHERE estado = 'pendiente')                                      AS gastos_pendientes,
            (SELECT COUNT(*)::int FROM agenda_events WHERE user_id=$1 AND start_at >= NOW())                               AS eventos_proximos
        `, [userId]);
        return { estadisticas: r.rows[0] };
      }

      case 'buscar_clientes': {
        const q     = `%${args.query ?? ''}%`;
        const limit = Math.min(Number(args.limit) || 8, 20);
        const r = await pool.query(`
          SELECT id, first_name, last_name, commercial_name, nif_cif, email, phone, type, created_at
          FROM entities
          WHERE commercial_name ILIKE $1
             OR CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) ILIKE $1
             OR nif_cif ILIKE $1
             OR email   ILIKE $1
          ORDER BY COALESCE(commercial_name, first_name) NULLS LAST
          LIMIT $2
        `, [q, limit]);
        return {
          total: r.rowCount,
          clientes: r.rows.map(c => ({
            id:       c.id,
            nombre:   c.commercial_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            nif:      c.nif_cif,
            email:    c.email,
            telefono: c.phone,
            tipo:     c.type,
            alta:     c.created_at,
          })),
        };
      }

      case 'listar_expedientes': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const params: any[] = [];
        const conds: string[] = [];
        let pi = 1;
        if (args.estado) { conds.push(`e.estado = $${pi++}`); params.push(args.estado); }
        if (args.busqueda) {
          conds.push(`(e.descripcion ILIKE $${pi} OR CONCAT(e.anio::text,'/',e.num_exp::text) ILIKE $${pi})`);
          params.push(`%${args.busqueda}%`); pi++;
        }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`
          SELECT e.id, e.anio, e.num_exp, e.descripcion, e.estado, e.fecha_inicio, e.fecha_cierre
          FROM expedientes e
          ${where}
          ORDER BY e.created_at DESC
          LIMIT $${pi}
        `, params);
        return {
          total: r.rowCount,
          expedientes: r.rows.map(e => ({
            id:          e.id,
            ref:         `${e.anio}/${e.num_exp}`,
            descripcion: e.descripcion,
            estado:      e.estado,
            inicio:      e.fecha_inicio,
            cierre:      e.fecha_cierre,
          })),
        };
      }

      case 'obtener_tareas': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const params: any[] = [userId];
        const conds: string[] = ['created_by = $1'];
        let pi = 2;
        if (args.estado) { conds.push(`estado = $${pi++}`); params.push(args.estado); }
        if (args.solo_vencidas) conds.push(`(plazo < NOW() AND estado != 'completada')`);
        params.push(limit);
        const r = await pool.query(`
          SELECT titulo, tipo, estado, prioridad, plazo, client_name, expediente, created_at
          FROM client_tasks
          WHERE ${conds.join(' AND ')}
          ORDER BY
            CASE WHEN estado='urgente'  THEN 0
                 WHEN plazo < NOW() AND estado!='completada' THEN 1
                 ELSE 2 END,
            plazo ASC NULLS LAST
          LIMIT $${pi}
        `, params);
        return {
          total: r.rowCount,
          tareas: r.rows.map(t => ({
            titulo:     t.titulo,
            tipo:       t.tipo,
            estado:     t.estado,
            prioridad:  t.prioridad,
            plazo:      t.plazo,
            cliente:    t.client_name,
            expediente: t.expediente,
          })),
        };
      }

      case 'listar_facturas': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const params: any[] = [];
        const conds: string[] = [];
        let pi = 1;
        if (args.estado)   { conds.push(`estado = $${pi++}`); params.push(args.estado); }
        if (args.busqueda) { conds.push(`(num ILIKE $${pi} OR contacto ILIKE $${pi})`); params.push(`%${args.busqueda}%`); pi++; }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`
          SELECT num, contacto, total, estado, fecha, vencimiento
          FROM facturacion_facturas
          ${where}
          ORDER BY fecha DESC
          LIMIT $${pi}
        `, params);
        return {
          total: r.rowCount,
          facturas: r.rows.map(f => ({
            num:         f.num,
            contacto:    f.contacto,
            total_eur:   Number(f.total).toFixed(2),
            estado:      f.estado,
            fecha:       f.fecha,
            vencimiento: f.vencimiento,
          })),
        };
      }

      case 'listar_gastos': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const params: any[] = [];
        const conds: string[] = [];
        let pi = 1;
        if (args.estado)   { conds.push(`estado = $${pi++}`); params.push(args.estado); }
        if (args.busqueda) { conds.push(`(num ILIKE $${pi} OR proveedor ILIKE $${pi})`); params.push(`%${args.busqueda}%`); pi++; }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`
          SELECT num, proveedor, total, categoria, estado, fecha
          FROM facturacion_gastos
          ${where}
          ORDER BY fecha DESC
          LIMIT $${pi}
        `, params);
        return {
          total: r.rowCount,
          gastos: r.rows.map(g => ({
            num:       g.num,
            proveedor: g.proveedor,
            total_eur: Number(g.total).toFixed(2),
            categoria: g.categoria,
            estado:    g.estado,
            fecha:     g.fecha,
          })),
        };
      }

      case 'agenda_proxima': {
        const dias = Math.min(Number(args.dias) || 14, 60);
        const r = await pool.query(`
          SELECT title, type, status, start_at, end_at, description, location
          FROM agenda_events
          WHERE user_id = $1
            AND start_at >= NOW()
            AND start_at <= NOW() + ($2 * INTERVAL '1 day')
          ORDER BY start_at ASC
          LIMIT 25
        `, [userId, dias]);
        return {
          total: r.rowCount,
          dias_consultados: dias,
          eventos: r.rows.map(e => ({
            titulo:      e.title,
            tipo:        e.type,
            estado:      e.status,
            inicio:      e.start_at,
            fin:         e.end_at,
            descripcion: e.description,
            lugar:       e.location,
          })),
        };
      }

      case 'buscar_notas': {
        const q     = `%${args.query ?? ''}%`;
        const limit = Math.min(Number(args.limit) || 8, 20);
        const r = await pool.query(`
          SELECT n.content, n.category, n.priority, n.created_at,
                 e.commercial_name AS client_name
          FROM notes n
          LEFT JOIN entities e ON n.client_id = e.id
          WHERE n.content ILIKE $1
          ORDER BY n.created_at DESC
          LIMIT $2
        `, [q, limit]);
        return {
          total: r.rowCount,
          notas: r.rows.map(n => ({
            contenido: n.content.length > 200 ? n.content.slice(0, 200) + '…' : n.content,
            categoria: n.category,
            prioridad: n.priority,
            cliente:   n.client_name,
            fecha:     n.created_at,
          })),
        };
      }

      case 'listar_presupuestos': {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const params: any[] = [];
        const conds: string[] = [];
        let pi = 1;
        if (args.estado)   { conds.push(`estado = $${pi++}`); params.push(args.estado); }
        if (args.busqueda) { conds.push(`(num ILIKE $${pi} OR contacto ILIKE $${pi})`); params.push(`%${args.busqueda}%`); pi++; }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`
          SELECT num, contacto, total, estado, fecha
          FROM facturacion_presupuestos
          ${where}
          ORDER BY fecha DESC
          LIMIT $${pi}
        `, params);
        return {
          total: r.rowCount,
          presupuestos: r.rows.map(p => ({
            num:       p.num,
            contacto:  p.contacto,
            total_eur: Number(p.total).toFixed(2),
            estado:    p.estado,
            fecha:     p.fecha,
          })),
        };
      }

      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e: any) {
    console.error(`❌ VantIA tool [${name}]:`, e?.message);
    return { error: `Error ejecutando ${name}: ${e?.message}` };
  }
}

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
  } catch (error) {
    console.error('❌ Error fetching VantIA history:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};

// ── POST /api/vantia/chat ─────────────────────────────────────────────────────
export const chatVantia = async (req: any, res: Response) => {
  const {
    message,
    history    = [],
    systemPrompt,
    moduleId,
  }: { message: string; history: any[]; systemPrompt?: string; moduleId: string } = req.body;

  const userId = req.auth?.userId;

  if (!message?.trim())    return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
  if (!userId || !moduleId) return res.status(400).json({ success: false, error: 'Falta userId o moduleId.' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'VantIA no está configurada. Añade GEMINI_API_KEY al .env del backend.' });

  try {
    const finalSystem = systemPrompt || SYSTEM_PROMPT;

    // Build conversation contents
    let contents: any[] = [
      { role: 'user',  parts: [{ text: finalSystem }] },
      { role: 'model', parts: [{ text: 'Entendido. Usaré las herramientas disponibles para consultar los datos reales del despacho.' }] },
      ...history.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user',  parts: [{ text: message }] },
    ];

    let reply = '';

    // Agentic loop: Gemini can call tools up to MAX_TOOL_ROUNDS times
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            tools: TOOLS,
            generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errData: any = await geminiRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${geminiRes.status} de Gemini`);
      }

      const data: any = await geminiRes.json();
      const candidate = data?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];

      // Separate text parts from function call parts
      const fnCalls  = parts.filter(p => p.functionCall);
      const textParts = parts.filter(p => p.text);

      if (fnCalls.length === 0) {
        // No more tool calls — this is the final answer
        reply = textParts.map(p => p.text || '').join('').trim()
          || 'No he podido procesar tu consulta. Inténtalo de nuevo.';
        break;
      }

      // Log which tools Gemini is calling
      console.log(`🤖 VantIA round ${round + 1}: llamando ${fnCalls.map((f: any) => f.functionCall.name).join(', ')}`);

      // Execute all requested tools in parallel
      const toolResults = await Promise.all(
        fnCalls.map(async (part: any) => {
          const { name, args } = part.functionCall;
          const result = await callTool(name, args ?? {}, userId);
          return { name, result };
        })
      );

      // Append model's function-call turn to contents
      contents.push({ role: 'model', parts });

      // Append function results as a user turn
      contents.push({
        role: 'user',
        parts: toolResults.map(tr => ({
          functionResponse: { name: tr.name, response: tr.result },
        })),
      });
    }

    if (!reply) reply = 'He procesado la consulta pero no pude generar una respuesta. Inténtalo de nuevo.';

    res.json({ success: true, reply });

    // Persist history in background (don't await)
    pool.query(
      `INSERT INTO vantia_chat_history (user_id, module_id, history)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, module_id)
       DO UPDATE SET history = EXCLUDED.history, updated_at = NOW()`,
      [userId, moduleId, JSON.stringify([
        ...history,
        { role: 'user',  text: message },
        { role: 'model', text: reply },
      ])]
    ).catch(() => {});

  } catch (error: any) {
    console.error('❌ VantIA fetch error:', error?.message || String(error));
    res.status(500).json({ success: false, error: 'Error al conectar con el motor de IA.' });
  }
};
