import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { AlertTriangle, CheckCircle2, Folder, FolderTree, Loader2, Stethoscope, Wrench, X, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

// "Diagnosticar buzón": sondeo completo de una cuenta IMAP (estructura de
// carpetas del servidor + estado de cada una frente a lo guardado en Vantia),
// con reparación de las carpetas atrasadas. Backend: probeImapAccount en
// emailController.ts. El último informe se guarda en la cuenta.

type Verdict = 'ok' | 'cargando' | 'vacia' | 'pendiente' | 'reparada' | 'error' | 'contenedor' | 'oculta';
interface FolderRow {
  path: string;
  name: string;
  delimiter: string | null;
  specialUse: string | null;
  subscribed: boolean;
  visible: boolean;
  serverMessages: number | null;
  dbMessages: number;
  latestDate: string | null;
  latestSubject: string | null;
  verdict: Verdict;
  error: string | null;
  notes: string[];
}
interface Report {
  startedAt: string;
  server: string;
  ok: boolean;
  error?: string;
  ms?: number;
  folders: FolderRow[];
}

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  ok:         { label: 'Al día',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  reparada:   { label: 'Reparada',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cargando:   { label: 'Cargando historial', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  vacia:      { label: 'Vacía',       cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  pendiente:  { label: 'Atrasada',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  error:      { label: 'Error',       cls: 'bg-red-50 text-red-700 border-red-200' },
  contenedor: { label: 'Agrupa',      cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  oculta:     { label: 'No suscrita', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
};

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function MailboxProbeModal({ accountId, accountEmail, onClose, onRepaired }: {
  accountId: string;
  accountEmail: string;
  onClose: () => void;
  onRepaired?: () => void;
}) {
  const { getToken } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [probeAt, setProbeAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    setRunning(true); setError('');
    try {
      const res = await apiFetch(`/api/email/accounts/${accountId}/probe`, { method: 'POST', getToken });
      if (res?.success === false) throw new Error(res.error);
      setReport(res.data); setProbeAt(new Date().toISOString());
      onRepaired?.();
    } catch (e: any) {
      setError(e.message || 'No se pudo diagnosticar el buzón');
    } finally {
      setRunning(false);
    }
  }, [accountId, getToken, onRepaired]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/email/accounts/${accountId}/probe`, { getToken });
        if (res?.success && res.data?.report) { setReport(res.data.report); setProbeAt(res.data.probeAt); }
        else void run(); // sin informe previo: diagnosticar directamente
      } catch { void run(); } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const problemas = report?.folders.filter((f) => f.verdict === 'error' || f.verdict === 'pendiente') || [];
  const depth = (f: FolderRow) => (f.delimiter ? f.path.split(f.delimiter).length - 1 : 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/20 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-red-50/50 px-6 pt-6 pb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-red-50 text-[#ab0433]">
            <Stethoscope size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900">Diagnóstico del buzón</h3>
            <p className="truncate text-sm text-slate-500">{accountEmail}{report ? ` · ${report.server}` : ''}</p>
            {probeAt && <p className="mt-0.5 text-xs text-slate-400">Último diagnóstico: {fmt(probeAt)}{report?.ms ? ` · ${(report.ms / 1000).toFixed(1)} s` : ''}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {(loading || (running && !report)) && (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="animate-spin text-slate-400" />
              Revisando todas las carpetas del servidor…
            </div>
          )}
          {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {report?.error && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <XCircle size={15} className="mt-0.5 shrink-0" /> No se pudo conectar con el servidor: {report.error}
            </p>
          )}
          {report && !report.error && (
            <>
              <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${problemas.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                {problemas.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                {problemas.length
                  ? `${problemas.length} carpeta${problemas.length === 1 ? '' : 's'} con problemas. Pulsa "Diagnosticar y reparar".`
                  : `Todo correcto: ${report.folders.length} carpetas revisadas.`}
              </div>
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-1.5 pr-2 font-semibold">Carpeta</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Servidor</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Vantia</th>
                    <th className="py-1.5 pr-2 font-semibold">Último mensaje</th>
                    <th className="py-1.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.folders.map((f) => {
                    const v = VERDICT[f.verdict] || VERDICT.error;
                    return (
                      <tr key={f.path} className="align-top">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth(f) * 12 }}>
                            {f.verdict === 'contenedor' ? <FolderTree size={12} className="shrink-0 text-slate-400" /> : <Folder size={12} className="shrink-0 text-slate-400" />}
                            <span className={`truncate font-medium ${f.visible ? 'text-slate-700' : 'text-slate-400'}`} title={f.path}>{f.name}</span>
                          </div>
                          {(f.error || f.notes.length > 0) && (
                            <p className="mt-0.5 text-[11px] text-slate-500" style={{ paddingLeft: depth(f) * 12 + 18 }}>{f.error || f.notes.join(' ')}</p>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{f.serverMessages ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{f.verdict === 'contenedor' || f.verdict === 'oculta' ? '—' : f.dbMessages}</td>
                        <td className="max-w-[180px] py-1.5 pr-2 text-slate-500"><span className="block truncate" title={f.latestSubject || ''}>{f.latestDate ? fmt(f.latestDate) : '—'}</span></td>
                        <td className="py-1.5"><span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${v.cls}`}>{v.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-slate-400">
                "No suscrita": la carpeta existe en el servidor pero tu programa de correo la oculta; Vantia hace lo mismo. "Agrupa": solo contiene otras carpetas.
                "Cargando historial": lo nuevo ya está; los mensajes antiguos se van descargando por tandas cada pocos minutos hasta igualar al servidor.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cerrar</button>
          <button type="button" onClick={() => void run()} disabled={running}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2 text-sm font-bold text-white hover:bg-[#8f0329] disabled:opacity-60">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />}
            {running ? 'Diagnosticando…' : 'Diagnosticar y reparar'}
          </button>
        </div>
      </div>
    </div>
  );
}
