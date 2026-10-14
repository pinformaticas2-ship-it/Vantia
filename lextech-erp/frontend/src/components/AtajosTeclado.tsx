import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Keyboard, X } from 'lucide-react';
import { usePreferencias } from '../lib/preferencias';

// ── Atajos de teclado (14/10/2026) ───────────────────────────────────────────
// "?" abre esta ayuda; "/" va al buscador; "g" y luego una letra salta a un
// módulo (estilo Gmail/GitHub). Nunca actúan mientras se escribe en un campo.
// Se desactivan en Ajustes → Preferencias de trabajo.

export const IR_A: { tecla: string; path: string; label: string }[] = [
  { tecla: 'd', path: '/dashboard', label: 'Dashboard' },
  { tecla: 'e', path: '/dashboard/expedientes', label: 'Expedientes' },
  { tecla: 'l', path: '/dashboard/clientes', label: 'Clientes' },
  { tecla: 'a', path: '/dashboard/agenda', label: 'Agenda' },
  { tecla: 't', path: '/dashboard/tareas', label: 'Tareas' },
  { tecla: 'v', path: '/dashboard/vistas', label: 'Vistas' },
  { tecla: 'c', path: '/dashboard/chat', label: 'Chat' },
  { tecla: 'm', path: '/dashboard/correo', label: 'Correo' },
  { tecla: 'o', path: '/dashboard/documental', label: 'Documental' },
  { tecla: 's', path: '/dashboard/config', label: 'Ajustes' },
];

function escribiendo(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e) return false;
  const tag = e.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.isContentEditable;
}

export function AyudaAtajos({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const Tecla = ({ children }: { children: React.ReactNode }) => (
    <kbd className="inline-flex min-w-[1.6rem] justify-center rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700 shadow-sm">{children}</kbd>
  );
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="flex items-center gap-2 text-base font-bold text-slate-800"><Keyboard size={18} className="text-slate-400" /> Atajos de teclado</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          <div className="flex items-center justify-between"><span>Ver esta ayuda</span><Tecla>?</Tecla></div>
          <div className="flex items-center justify-between"><span>Ir al buscador</span><Tecla>/</Tecla></div>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Ir a… (pulsa G y luego la letra)</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {IR_A.map((a) => (
              <div key={a.tecla} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span>{a.label}</span>
                <span className="flex items-center gap-1"><Tecla>G</Tecla><Tecla>{a.tecla.toUpperCase()}</Tecla></span>
              </div>
            ))}
          </div>
          <p className="pt-2 text-xs text-slate-500">No funcionan mientras escribes en un campo. Se pueden desactivar en Ajustes → Preferencias de trabajo.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function AtajosTeclado() {
  const { prefs } = usePreferencias();
  const navigate = useNavigate();
  const [ayuda, setAyuda] = useState(false);
  const esperandoG = useRef<number | null>(null);

  useEffect(() => {
    if (!prefs.atajos) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || escribiendo(ev.target)) return;
      if (ev.key === '?') { ev.preventDefault(); setAyuda(true); return; }
      if (ev.key === '/') {
        const buscador = document.querySelector<HTMLInputElement>('input[data-buscador-global]');
        if (buscador) { ev.preventDefault(); buscador.focus(); }
        return;
      }
      const k = ev.key.toLowerCase();
      if (esperandoG.current) {
        window.clearTimeout(esperandoG.current);
        esperandoG.current = null;
        const destino = IR_A.find((a) => a.tecla === k);
        if (destino) { ev.preventDefault(); navigate(destino.path); }
        return;
      }
      if (k === 'g') esperandoG.current = window.setTimeout(() => { esperandoG.current = null; }, 1500);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.atajos, navigate]);

  return ayuda ? <AyudaAtajos onClose={() => setAyuda(false)} /> : null;
}

/** Al entrar en Vantia (una vez por sesión del navegador), va a la página de
 *  inicio elegida en Ajustes → Preferencias de trabajo. */
export function InicioPreferido() {
  const { prefs, cargado } = usePreferencias();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!cargado) return;
    let hecho = false;
    try { hecho = sessionStorage.getItem('vantia.inicioAplicado') === '1'; sessionStorage.setItem('vantia.inicioAplicado', '1'); } catch { /* sin almacenamiento */ }
    if (hecho || prefs.inicio === '/dashboard') return;
    if (location.pathname === '/dashboard' || location.pathname === '/') navigate(prefs.inicio, { replace: true });
  }, [cargado]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
