import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { safeJson } from "../lib/api";

// Solo las variantes de Gemini están conectadas de verdad (misma API, mismo
// backend, solo cambia el id del modelo). ChatGPT, Claude y Vincent AI (el
// asistente de vLex) se muestran como opciones a petición del usuario, pero
// sin backend detrás todavía -- hace falta su API key correspondiente antes
// de poder activarlas.
export const MODEL_STORAGE_KEY = "vantia_model_v1";

export interface AiModelOption {
  id: string;
  label: string;
  provider: string;
  desc: string;
  available: boolean;
}

export const AI_MODELS: AiModelOption[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google",    desc: "Rápido, el que usa Vantia hoy",   available: true },
  // gemini-2.5-pro ya no existe (Google lo retiró) y su sustituto,
  // gemini-3.1-pro-preview, necesita un plan de pago -- con la cuenta
  // gratuita actual da error 429 (cuota 0), comprobado a mano contra la API.
  { id: "gemini-2.5-pro", label: "Gemini Pro", provider: "Google",    desc: "Necesita plan de pago de Google", available: false },
  { id: "chatgpt",        label: "ChatGPT",    provider: "OpenAI",    desc: "Próximamente",                    available: false },
  { id: "claude",         label: "Claude",     provider: "Anthropic", desc: "Próximamente",                    available: false },
  { id: "vincent",        label: "Vincent AI", provider: "vLex",      desc: "Próximamente",                    available: false },
];

export function pickInitialModel(): string {
  try {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    return AI_MODELS.some(m => m.id === saved && m.available) ? saved! : AI_MODELS[0].id;
  } catch {
    return AI_MODELS[0].id;
  }
}

export interface VantiaUsage {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  resetsNote: string;
  limits: Record<string, { rpm: number; tpm: number; rpd: number }>;
}

// Carga el uso de hoy bajo demanda (se llama al abrir el desplegable, no en
// cada render) -- Google no expone un endpoint de cuota restante, así que
// esto es lo que el propio backend ha ido sumando hoy.
export function useVantiaUsageOnDemand(getToken: () => Promise<string | null>) {
  const [usage, setUsage] = useState<VantiaUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/vantia/usage", { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok && data?.success) { setUsage(data.data); setLoaded(true); }
    } catch { /* el panel de propiedades es informativo, no bloquea nada si falla */ }
    finally { setLoading(false); }
  };

  return { usage, loading, load };
}

const fmt = (n: number) => n.toLocaleString("es-ES");

// Lista de modelos + propiedades del modelo activo (peticiones/tokens de
// hoy, límites conocidos de la cuenta gratuita). Mismo panel para el widget
// flotante y para la página Chat IA -- una herramienta nueva no necesita
// tocar esto dos veces.
export function VantiaModelPickerPanel({ selectedModel, onSelect, usage, usageLoading }: {
  selectedModel: string;
  onSelect: (id: string) => void;
  usage: VantiaUsage | null;
  usageLoading: boolean;
}) {
  const activeModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];
  const limits = usage?.limits?.[activeModel.id];

  return (
    <div>
      <p className="px-3.5 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">Modelo / agente de IA</p>
      {AI_MODELS.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m.id)}
          disabled={!m.available}
          className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left transition-colors ${
            m.id === selectedModel ? "bg-red-50" : m.available ? "hover:bg-slate-50" : "cursor-not-allowed"
          }`}
        >
          <div className="min-w-0">
            <p className={`text-xs font-semibold truncate ${m.available ? "text-slate-700" : "text-slate-400"}`}>{m.label}</p>
            <p className="text-[10px] text-slate-400 truncate">{m.provider} · {m.desc}</p>
          </div>
          {m.id === selectedModel ? (
            <Check className="h-3.5 w-3.5 text-red-600 shrink-0" />
          ) : !m.available ? (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-300 bg-slate-100 rounded-full px-1.5 py-0.5">Próx.</span>
          ) : null}
        </button>
      ))}

      <div className="mt-1.5 border-t border-slate-100 px-3.5 pt-2.5 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">Propiedades de {activeModel.label}</p>
        {usageLoading ? (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando uso de hoy…
          </div>
        ) : !activeModel.available ? (
          <p className="text-[11px] text-slate-400">Todavía sin conectar -- no hay datos de uso.</p>
        ) : (
          <div className="space-y-1 text-[11px] text-slate-500">
            <div className="flex justify-between"><span>Peticiones hoy</span><span className="font-semibold text-slate-700">{usage ? `${fmt(usage.requests)}${limits ? ` / ${fmt(limits.rpd)}` : ""}` : "—"}</span></div>
            <div className="flex justify-between"><span>Tokens hoy</span><span className="font-semibold text-slate-700">{usage ? fmt(usage.totalTokens) : "—"}</span></div>
            {limits && <div className="flex justify-between"><span>Límite por minuto</span><span className="text-slate-600">{limits.rpm} peticiones · {fmt(limits.tpm)} tokens</span></div>}
            <p className="pt-1 text-slate-400 leading-snug">
              {usage?.resetsNote || "La cuota gratuita se reinicia cada día."} Cuenta compartida por todo el despacho; es una estimación propia, Google no ofrece un dato de cuota restante en tiempo real.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
