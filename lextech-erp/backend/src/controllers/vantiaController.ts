import { Response, Request } from 'express';
import pool from '../config/database';

const SYSTEM_PROMPT =
  'Eres VantIA, el asistente inteligente de VANTIA Legis ERP, ' +
  'un sistema de gestión para despachos de abogados. ' +
  'Ayudas a los usuarios con dudas legales generales, gestión de expedientes, ' +
  'clientes, documentos y el uso del sistema. ' +
  'Responde siempre en español, de forma concisa y profesional. ' +
  'Si te preguntan algo fuera del ámbito jurídico o del sistema, ' +
  'redirige amablemente la conversación.';

interface HistoryMessage {
  role: 'user' | 'model';
  text: string;
}

// ─────────────────────────────────────────────────────────────
// GET /api/vantia/chat/history
// ─────────────────────────────────────────────────────────────
export const getChatHistory = async (req: Request, res: Response) => {
  const { moduleId } = req.query;
  // @ts-ignore
  const userId = req.auth?.userId;

  if (!moduleId || !userId) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros.' });
  }

  try {
    const result = await pool.query(
      'SELECT history FROM vantia_chat_history WHERE user_id = $1 AND module_id = $2',
      [userId, String(moduleId)]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, history: result.rows[0].history || [] });
    } else {
      res.json({ success: true, history: [] });
    }
  } catch (error) {
    console.error('❌ Error fetching chat history:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
};


// ─────────────────────────────────────────────────────────────
// POST /api/vantia/chat
// body: { message: string, history?: HistoryMessage[] }
// ─────────────────────────────────────────────────────────────
export const chatVantia = async (req: any, res: Response) => {
  const {
    message,
    history = [],
    systemPrompt,
    moduleId,
  }: {
    message: string;
    history: HistoryMessage[];
    systemPrompt?: string;
    moduleId: string;
  } = req.body;

  const userId = req.auth?.userId;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
  }
  if (!userId || !moduleId) {
    return res.status(400).json({ success: false, error: 'Falta userId o moduleId.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'VantIA no está configurada. Añade GEMINI_API_KEY al archivo .env del backend.',
    });
  }

  try {
    // --- INYECCIÓN DE CONTEXTO DESDE LA BASE DE DATOS ---
    let dbContextInfo = '';
    if (moduleId.startsWith('/dashboard/clientes')) {
      try {
        const recentClients = await pool.query(
          `SELECT first_name, last_name, commercial_name 
           FROM entities 
           WHERE type = 'CLIENTE' 
           ORDER BY created_at DESC 
           LIMIT 5`
        );
        if (recentClients.rows.length > 0) {
          const clientNames = recentClients.rows.map(c => c.commercial_name || `${c.first_name} ${c.last_name || ''}`.trim()).join(', ');
          dbContextInfo = `\n\nContexto de la base de datos (módulo de clientes): Los 5 clientes más recientes son: ${clientNames}.`;
        }
      } catch (e) {
        console.error("❌ Error fetching DB context for VantIA:", e);
        // No bloquear la respuesta si la BD falla, simplemente no se añade el contexto.
      }
    }
    // Aquí se podrían añadir más `if` para otros módulos (expedientes, etc.)
    // ----------------------------------------------------

    const finalSystemPrompt = (systemPrompt || SYSTEM_PROMPT) + dbContextInfo;

    const contents = [
      ...history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const conversationContents = [
      {
        role: 'user',
        parts: [{ text: finalSystemPrompt }],
      },
      { role: 'model', parts: [{ text: 'Entendido.' }] },
      ...contents,
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: conversationContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData: any = await geminiRes.json().catch(() => ({}));
      const msg = errData?.error?.message || `Error HTTP ${geminiRes.status} de Gemini`;
      console.error('❌ VantIA Gemini error:', msg);
      return res.status(502).json({ success: false, error: msg });
    }

    const data: any = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No he podido procesar tu consulta. Inténtalo de nuevo.';

    res.json({ success: true, reply });

    // --- GUARDAR HISTORIAL EN SEGUNDO PLANO ---
    try {
      const newHistory: HistoryMessage[] = [
        ...history,
        { role: 'user', text: message },
        { role: 'model', text: reply },
      ];

      const upsertQuery = `
        INSERT INTO vantia_chat_history (user_id, module_id, history)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, module_id)
        DO UPDATE SET
          history = EXCLUDED.history,
          updated_at = NOW();
      `;

      await pool.query(upsertQuery, [userId, moduleId, JSON.stringify(newHistory)]);
    } catch (dbError) {
      console.error('❌ Error saving chat history:', dbError);
    }
    // -----------------------------------------

  } catch (error: any) {
    console.error('❌ VantIA fetch error:', error?.message || String(error));
    res.status(500).json({ success: false, error: 'Error al conectar con el motor de IA.' });
  }
};
