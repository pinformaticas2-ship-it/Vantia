import pool from '../config/database';

// IA de Vantia fuera del chat (13/11/2026): para el paso «IA de Vantia» de las
// automatizaciones y para «Créalo con IA». Mismo proveedor y modelos que el
// chat (Gemini), mismas herramientas de solo lectura para consultar los datos
// del despacho, y el uso se suma al contador diario como el del chat.

export const MODELOS_IA: { id: string; etiqueta: string; disponible: boolean }[] = [
  { id: 'gemini-2.5-flash', etiqueta: 'Gemini 2.5 Flash', disponible: true },
  { id: 'gemini-2.5-pro', etiqueta: 'Gemini Pro', disponible: false },
  { id: 'chatgpt', etiqueta: 'ChatGPT', disponible: false },
  { id: 'claude', etiqueta: 'Claude', disponible: false },
  { id: 'vincent', etiqueta: 'Vincent AI', disponible: false },
];
const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

export function iaDisponible(): boolean { return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY); }

async function sumarUso(llamadas: number, uso: { p: number; c: number; t: number }) {
  if (!llamadas) return;
  await pool.query(
    `INSERT INTO vantia_usage_daily (usage_date, requests, prompt_tokens, completion_tokens, total_tokens)
     VALUES (CURRENT_DATE, $1, $2, $3, $4)
     ON CONFLICT (usage_date) DO UPDATE SET
       requests = vantia_usage_daily.requests + EXCLUDED.requests,
       prompt_tokens = vantia_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
       completion_tokens = vantia_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
       total_tokens = vantia_usage_daily.total_tokens + EXCLUDED.total_tokens`,
    [llamadas, uso.p, uso.c, uso.t],
  ).catch(() => {});
}

/**
 * Pregunta a la IA. Con `conDatos`, puede consultar (solo leer) los datos del
 * despacho con las herramientas del asistente, en nombre de `userId`.
 */
export async function preguntarIA(opts: {
  prompt: string; sistema?: string; modelo?: string; json?: boolean; maxTokens?: number; temperatura?: number;
  conDatos?: { organizacionId: string; userId: string } | null;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('La IA de Vantia no está configurada en el servidor.');
  const elegido = MODELOS_IA.find((m) => m.id === opts.modelo);
  if (elegido && !elegido.disponible) throw new Error(`El modelo ${elegido.etiqueta} todavía no está disponible.`);
  const modelo = elegido?.id || MODELO_POR_DEFECTO;

  let herramientas: any[] | undefined;
  let ejecutar: ((n: string, a: any) => Promise<object>) | null = null;
  if (opts.conDatos) {
    const { TOOLS, callTool } = await import('../controllers/vantiaController');
    const soloLectura = (TOOLS[0] as any).function_declarations.filter((f: any) => !/^preparar_|^crear_/.test(f.name));
    herramientas = [{ function_declarations: soloLectura }];
    const permitidas = new Set(soloLectura.map((f: any) => f.name));
    ejecutar = (n, a) => (permitidas.has(n) ? callTool(n, a || {}, opts.conDatos!.userId, opts.conDatos!.organizacionId) : Promise.resolve({ error: 'Herramienta no permitida' }));
  }

  const contents: any[] = [{ role: 'user', parts: [{ text: opts.prompt }] }];
  const uso = { p: 0, c: 0, t: 0 };
  let llamadas = 0;
  try {
    for (let ronda = 0; ronda < 5; ronda++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          contents,
          ...(opts.sistema ? { systemInstruction: { parts: [{ text: opts.sistema }] } } : {}),
          ...(herramientas && !opts.json ? { tools: herramientas } : {}),
          generationConfig: {
            temperature: opts.temperatura ?? 0.4, maxOutputTokens: opts.maxTokens ?? 2048,
            ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      });
      llamadas++;
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? 'La IA ha llegado a su límite de uso; prueba más tarde.' : (data?.error?.message || `Error de la IA (${res.status})`));
      const u = data?.usageMetadata; if (u) { uso.p += u.promptTokenCount || 0; uso.c += u.candidatesTokenCount || 0; uso.t += u.totalTokenCount || 0; }
      const partes: any[] = data?.candidates?.[0]?.content?.parts || [];
      const llamadasHerr = partes.filter((x) => x.functionCall);
      if (llamadasHerr.length && ejecutar) {
        contents.push({ role: 'model', parts: partes });
        const respuestas = [];
        for (const c of llamadasHerr) {
          const r = await ejecutar(c.functionCall.name, c.functionCall.args).catch((e: any) => ({ error: e?.message || String(e) }));
          respuestas.push({ functionResponse: { name: c.functionCall.name, response: { resultado: r } } });
        }
        contents.push({ role: 'user', parts: respuestas });
        continue;
      }
      const texto = partes.map((x) => x.text || '').join('').trim();
      if (!texto) throw new Error('La IA no ha devuelto respuesta.');
      return texto;
    }
    throw new Error('La IA ha hecho demasiadas consultas sin llegar a responder.');
  } finally {
    await sumarUso(llamadas, uso);
  }
}
