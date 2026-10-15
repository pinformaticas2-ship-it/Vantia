import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { CheckCircle2, ChevronDown, FilePlus2, Loader2, Search, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';

// ── Datos para documentos (15/10/2026) ──────────────────────────────────────
// Los datos propios del asunto que Vantia no guarda en otra ficha (WIZINK,
// cláusulas abusivas, recursos, multas, campos libres...). Se rellenan aquí
// una vez y TODAS las plantillas del expediente los usan (las de la nube,
// el autorrelleno y los documentos base). Backend: /api/plantillas/datos/:id.

interface Campo { grupo: string; etiqueta: string; nombre: string; clave: string }

const esFecha = (etiqueta: string) => /\bfecha\b/i.test(etiqueta);

export default function DatosDocumentosExpediente({ expedienteId, bloqueado = false }: { expedienteId: string; bloqueado?: boolean }) {
  const { getToken } = useAuth();
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [visibles, setVisibles] = useState<Set<string>>(new Set()); // grupos añadidos a mano (aún sin datos)
  const [q, setQ] = useState('');
  const [eligiendo, setEligiendo] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const pendientes = useRef<Record<string, string>>({});
  const temporizador = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/plantillas/datos/${expedienteId}`, { getToken });
      if (r?.success === false) throw new Error(r.error);
      setCampos(r.data.campos);
      setValores(r.data.valores || {});
    } catch (e: any) { aviso.error(e?.message || 'No se pudieron cargar los datos.'); setCampos([]); }
  }, [expedienteId, getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Guardado automático un momento después de dejar de escribir
  const guardar = useCallback(async () => {
    const lote = pendientes.current;
    pendientes.current = {};
    if (!Object.keys(lote).length) return;
    setGuardando('…');
    try {
      const r = await apiFetch(`/api/plantillas/datos/${expedienteId}`, { method: 'PUT', getToken, body: JSON.stringify({ valores: lote }) });
      if (r?.success === false) throw new Error(r.error);
      setGuardando('ok');
      window.setTimeout(() => setGuardando(null), 1500);
    } catch (e: any) {
      Object.assign(pendientes.current, lote);
      setGuardando(null);
      aviso.error(e?.message || 'No se pudo guardar.');
    }
  }, [expedienteId, getToken]);
  useEffect(() => () => { if (temporizador.current) window.clearTimeout(temporizador.current); void guardar(); }, [guardar]);

  const cambiar = (c: Campo, v: string) => {
    setValores((p) => ({ ...p, [c.clave]: v }));
    pendientes.current[c.nombre] = v;
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => void guardar(), 700);
  };

  const grupos = useMemo(() => {
    const m = new Map<string, Campo[]>();
    for (const c of campos || []) { if (!m.has(c.grupo)) m.set(c.grupo, []); m.get(c.grupo)!.push(c); }
    return m;
  }, [campos]);
  const rellenos = (g: string) => (grupos.get(g) || []).filter((c) => (valores[c.clave] || '').trim()).length;
  // Se muestran los grupos con algún dato y los añadidos; con búsqueda, los que coinciden.
  const texto = q.trim().toLowerCase();
  const gruposVisibles = [...grupos.keys()].filter((g) => {
    if (texto) return g.toLowerCase().includes(texto) || grupos.get(g)!.some((c) => c.etiqueta.toLowerCase().includes(texto));
    return rellenos(g) > 0 || visibles.has(g);
  });
  const disponibles = [...grupos.keys()].filter((g) => !gruposVisibles.includes(g));

  if (!campos) return <div className="py-10 flex justify-center text-slate-400"><Loader2 size={18} className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">Datos para documentos</h3>
          <p className="text-xs text-slate-500">Rellénalos una vez: todas las plantillas de este expediente los usarán. Se guardan solos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {guardando && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              {guardando === 'ok' ? <><CheckCircle2 size={12} className="text-emerald-600" /> Guardado</> : <><Loader2 size={12} className="animate-spin" /> Guardando</>}
            </span>
          )}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un dato…"
              className="h-9 w-48 sm:w-64 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-red-300" />
          </div>
          {!bloqueado && disponibles.length > 0 && (
            <div className="relative">
              <button type="button" onClick={() => setEligiendo((v) => !v)}
                className="h-9 px-3 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 inline-flex items-center gap-1.5">
                <FilePlus2 size={14} /> Añadir datos de…
              </button>
              {eligiendo && (
                <div className="absolute right-0 top-full mt-1.5 z-30 w-72 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {disponibles.map((g) => (
                    <button key={g} type="button" onClick={() => { setVisibles((p) => new Set(p).add(g)); setAbiertos((p) => new Set(p).add(g)); setEligiendo(false); }}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                      <span className="truncate">{g}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{grupos.get(g)!.length} datos</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {gruposVisibles.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">{texto ? 'Ningún dato coincide.' : 'Este expediente aún no tiene datos propios.'}</p>
          {!texto && <p className="mt-1 text-xs text-slate-500">Pulsa «Añadir datos de…» y elige, por ejemplo, WIZINK o Cláusulas abusivas. Los datos del cliente, contrario, juzgado o despacho ya salen solos de sus fichas.</p>}
        </div>
      )}

      {gruposVisibles.map((g) => {
        const lista = (grupos.get(g) || []).filter((c) => !texto || g.toLowerCase().includes(texto) || c.etiqueta.toLowerCase().includes(texto));
        const abierto = abiertos.has(g) || !!texto;
        const n = rellenos(g);
        return (
          <section key={g} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 px-4 py-3">
              <button type="button" onClick={() => setAbiertos((p) => { const s = new Set(p); s.has(g) ? s.delete(g) : s.add(g); return s; })}
                className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${abierto ? '' : '-rotate-90'}`} />
                <span className="text-sm font-semibold text-slate-800 truncate">{g}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${n ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{n} de {grupos.get(g)!.length}</span>
              </button>
              {n === 0 && visibles.has(g) && (
                <button type="button" title="Quitar" onClick={() => setVisibles((p) => { const s = new Set(p); s.delete(g); return s; })}
                  className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center"><X size={14} /></button>
              )}
            </div>
            {abierto && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-4 pb-4">
                {lista.map((c) => (
                  <label key={c.clave} className="flex flex-col gap-1 min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate" title={`«${c.nombre}»`}>{c.etiqueta}</span>
                    <input value={valores[c.clave] || ''} disabled={bloqueado}
                      onChange={(e) => cambiar(c, e.target.value)}
                      placeholder={esFecha(c.etiqueta) ? 'dd/mm/aaaa' : ''}
                      className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none focus:bg-white focus:border-red-300 disabled:opacity-60" />
                  </label>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
