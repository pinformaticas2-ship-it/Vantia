import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Search, PencilLine, RefreshCw } from 'lucide-react';
import { safeJson } from '../lib/api';

interface VantiaHistoryEntry {
  id: string;
  userName: string;
  toolName: string;
  kind: 'read' | 'write';
  summary: string;
  ok: boolean;
  pendingStatus: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'pendiente de confirmar', cls: 'bg-amber-50 text-amber-600' },
  confirmed: { label: 'confirmada',             cls: 'bg-emerald-50 text-emerald-600' },
  cancelled: { label: 'cancelada',              cls: 'bg-slate-100 text-slate-400' },
  expired:   { label: 'caducada',               cls: 'bg-slate-100 text-slate-400' },
};

// Trazabilidad de la IA: cada herramienta que Vantia ejecuta (lectura o
// propuesta) se registra en vantia_tool_log en el backend; este modal es el
// único lugar donde el despacho puede verlo -- antes solo quedaba rastro de
// las acciones YA confirmadas, en activity_log/Trazabilidad, no de lo que la
// IA había consultado o propuesto.
export function VantiaHistoryModal({ getToken, onClose }: {
  getToken: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<VantiaHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/vantia/history?limit=100', { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok && data?.success) setEntries(data.data);
      else setError(data?.error || 'No se pudo cargar el historial.');
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-4 pb-8 pt-[8vh]" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Historial de Vantia</h3>
            <p className="text-xs text-slate-400">Todo lo que la IA ha consultado o propuesto en este despacho.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} title="Actualizar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">
              <RefreshCw size={15} />
            </button>
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : error ? (
            <p className="px-5 py-8 text-center text-xs text-rose-600">{error}</p>
          ) : entries.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400">Todavía no hay nada registrado.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map(e => {
                const status = e.pendingStatus ? STATUS_LABEL[e.pendingStatus] : null;
                return (
                  <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${e.kind === 'write' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                      {e.kind === 'write' ? <PencilLine size={13} /> : <Search size={13} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-5 ${e.ok ? 'text-slate-700' : 'text-rose-600'}`}>{e.summary}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                        <span>{e.userName}</span><span>·</span><span>{timeAgo(e.createdAt)}</span>
                        {status && <span className={`rounded-full px-1.5 py-0.5 font-bold uppercase ${status.cls}`}>{status.label}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
