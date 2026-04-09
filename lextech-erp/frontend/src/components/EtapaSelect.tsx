import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { safeJson } from '../lib/api';

interface EtapaSelectProps {
  value: string;
  onChange: (v: string) => void;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  /** 'sm' para formularios inline, 'md' (default) para modales */
  size?: 'sm' | 'md';
}

export function EtapaSelect({ value, onChange, getToken, size = 'md' }: EtapaSelectProps) {
  const [etapas,   setEtapas]   = useState<string[]>([]);
  const [open,     setOpen]     = useState(false);
  const [search,   setSearch]   = useState('');
  const [adding,   setAdding]   = useState(false);
  const [newEtapa, setNewEtapa] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  const triggerRef  = useRef<HTMLButtonElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const portalId    = useRef(`etapa-portal-${Math.random().toString(36).slice(2)}`);

  // ── Cargar etapas ────────────────────────────────────────────
  const loadEtapas = useCallback(async () => {
    try {
      const token = await getToken({ skipCache: true });
      const res   = await fetch('/api/tasks/etapas', { headers: { Authorization: `Bearer ${token}` } });
      const data  = await safeJson(res);
      if (res.ok) setEtapas((data.data || []).map((e: any) => e.nombre));
    } catch (_) {}
  }, [getToken]);

  useEffect(() => { loadEtapas(); }, [loadEtapas]);

  // ── Foco en el input de nueva etapa al activarse ────────────
  useEffect(() => {
    if (adding) {
      const t = setTimeout(() => addInputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [adding]);

  // ── Cerrar al clicar fuera (funciona con portal) ────────────
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target  = e.target as Node;
      const portal  = document.getElementById(portalId.current);
      const trigger = triggerRef.current;
      if (
        (!trigger || !trigger.contains(target)) &&
        (!portal  || !portal.contains(target))
      ) {
        setOpen(false);
        setAdding(false);
        setSearch('');
        setNewEtapa('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // ── Actualizar posición al hacer scroll / resize ─────────────
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setDropRect(triggerRef.current.getBoundingClientRect());
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // ── Abrir/cerrar dropdown ────────────────────────────────────
  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      setDropRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen(v => !v);
    if (open) { setAdding(false); setSearch(''); setNewEtapa(''); }
  };

  // ── Seleccionar etapa ────────────────────────────────────────
  const select = (etapa: string) => {
    onChange(etapa);
    setOpen(false);
    setSearch('');
    setAdding(false);
    setNewEtapa('');
  };

  // ── Guardar nueva etapa ──────────────────────────────────────
  const handleAdd = async () => {
    const nombre = newEtapa.trim();
    if (!nombre || saving) return;
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res   = await fetch('/api/tasks/etapas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ nombre }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setEtapas(prev => [...prev, data.data.nombre]);
        select(data.data.nombre);
        setNewEtapa('');
      }
    } finally {
      setSaving(false);
    }
  };

  const filtered = etapas.filter(e =>
    e.toLowerCase().includes(search.toLowerCase())
  );

  // ── Estilos según tamaño ─────────────────────────────────────
  const triggerCls = size === 'sm'
    ? 'w-full flex items-center justify-between border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white hover:border-slate-300 transition-colors mt-0.5 text-left focus:outline-none focus:border-red-400'
    : 'w-full flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white hover:border-slate-300 transition-colors text-left focus:outline-none focus:border-red-400';

  const dropStyle: React.CSSProperties = dropRect
    ? {
        position: 'fixed',
        top:      dropRect.bottom + 4,
        left:     dropRect.left,
        width:    Math.max(dropRect.width, 260),
        zIndex:   10000,
      }
    : { display: 'none' };

  return (
    <>
      <button ref={triggerRef} type="button" onClick={toggleOpen} className={triggerCls}>
        <span className={value ? 'text-slate-800 font-medium truncate pr-2' : 'text-slate-400'}>
          {value || 'Sin etapa'}
        </span>
        <ChevronDown
          size={13}
          className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && createPortal(
        <div
          id={portalId.current}
          style={dropStyle}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl"
        >
          {/* Buscador */}
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar etapa…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400"
            />
          </div>

          {/* Lista */}
          <div className="max-h-48 overflow-y-auto">
            {/* Opción vacía */}
            <button type="button" onClick={() => select('')}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                !value ? 'font-bold text-red-600' : 'text-slate-400 italic'
              }`}>
              — Sin etapa —
            </button>

            {filtered.map(etapa => (
              <button key={etapa} type="button" onClick={() => select(etapa)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-red-50 hover:text-red-700 transition-colors ${
                  value === etapa ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-700'
                }`}>
                {etapa}
              </button>
            ))}

            {filtered.length === 0 && !adding && (
              <p className="px-3 py-3 text-xs text-slate-400 text-center italic">Sin resultados</p>
            )}
          </div>

          {/* Añadir nueva etapa */}
          <div className="border-t border-slate-100 p-2">
            {adding ? (
              <div className="flex gap-1.5">
                <input
                  ref={addInputRef}
                  value={newEtapa}
                  onChange={e => setNewEtapa(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); handleAdd(); }
                    if (e.key === 'Escape') { setAdding(false); setNewEtapa(''); }
                  }}
                  placeholder="Nombre de la nueva etapa…"
                  className="flex-1 text-xs border border-red-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-500 min-w-0"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving || !newEtapa.trim()}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors shrink-0"
                >
                  {saving ? '…' : 'OK'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewEtapa(''); }}
                  className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Plus size={12} /> Añadir nueva etapa
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
