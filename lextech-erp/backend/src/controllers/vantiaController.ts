import { Response } from 'express';

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
// POST /api/vantia/chat
// body: { message: string, history?: HistoryMessage[] }
// ─────────────────────────────────────────────────────────────
export const chatVantia = async (req: any, res: Response) => {
  const {
    message,
    history = [],
    systemPrompt,   // el frontend puede enviar un prompt contextual por módulo
  }: { message: string; history: HistoryMessage[]; systemPrompt?: string } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'VantIA no está configurada. Añade GEMINI_API_KEY al archivo .env del backend.',
    });
  }

  // Construir el historial en el formato que espera Gemini
  const contents = [
    ...history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt || SYSTEM_PROMPT }] },
          contents,
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
  } catch (error: any) {
    console.error('❌ VantIA fetch error:', error?.message || String(error));
    res.status(500).json({ success: false, error: 'Error al conectar con el motor de IA.' });
  }
};
