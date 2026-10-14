import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Search, Users, Briefcase, CheckCircle2, Calendar, Moon, Sun, CornerDownLeft,
  Palette, Bell, ShieldCheck, Building2, Plug, UsersRound, History, Keyboard, Loader2, ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePreferencias, esOscuro } from '../lib/preferencias';
import type { Modulo } from '../lib/useOrganizacion';

// ── Paleta de comandos: Ctrl+K / ⌘K (16/10/2026) ────────────────────────────
// Un único sitio para ir a cualquier parte y hacer lo habitual sin ratón:
// buscar clientes y expedientes de verdad (antes el buscador de arriba solo
// encontraba módulos), crear, abrir ajustes, cambiar de modo...
// Se abre con Ctrl+K / ⌘K, con "/" o pulsando el buscador de la cabecera.

export const ABRIR_PALETA = 'vantia:abrir-paleta';
export const abrirPaleta = (texto = '') => window.dispatchEvent(new CustomEvent(ABRIR_PALETA, { detail: texto }));

type Icono = React.ComponentType<{ size?: number | string; className?: string }>;
interface Elemento {
  id: string;
  grupo: string;
  titulo: string;
  sub?: string;
  icono: Icono;
  claves?: string;
  ejecutar: () => void;
}
export interface ModuloPaleta { name: string; path: string; desc: string; icon: Icono; modulo?: Modulo | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const coincide = (e: Elemento, t: string) => {
  const texto = norm(`${e.titulo} ${e.sub || ''} ${e.claves || ''}`);
  return t.split(/\s+/).filter(Boolean).every((p) => texto.includes(p));
};

export default function PaletaComandos({ modulos, puede }: { modulos: ModuloPaleta[]; puede: (m: Modulo) => boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(0);
  const [remotos, setRemotos] = useState<Elemento[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { prefs, guardar } = usePreferencias();

  // Abrir: Ctrl+K / ⌘K en cualquier momento; evento desde la cabecera o "/".
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setAbierta((v) => !v);
      }
    };
    const evento = (ev: Event) => { setQ(String((ev as CustomEvent).detail || '')); setAbierta(true); };
    window.addEventListener('keydown', tecla);
    window.addEventListener(ABRIR_PALETA, evento);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener(ABRIR_PALETA, evento); };
  }, []);

  useEffect(() => {
    if (abierta) { setFoco(0); setTimeout(() => inputRef.current?.focus(), 0); }
    else { setQ(''); setRemotos([]); }
  }, [abierta]);

  const ir = (path: string) => () => { setAbierta(false); navigate(path); };

  const fijos = useMemo<Elemento[]>(() => {
    const oscuro = esOscuro(prefs.modo);
    const lista: Elemento[] = [];
    const crear: [string, string, Icono, Modulo, string][] = [
      ['Nuevo cliente', '/dashboard/clientes/new', Users, 'clientes', 'crear alta añadir'],
      ['Nuevo expediente', '/dashboard/expedientes?nuevo=1', Briefcase, 'expedientes', 'crear abrir asunto caso'],
      ['Nueva tarea', '/dashboard/tareas?open=new', CheckCircle2, 'tareas', 'crear plazo pendiente'],
      ['Nuevo evento', '/dashboard/agenda?nuevo=1', Calendar, 'agenda', 'crear cita vista reunion juicio señalamiento'],
    ];
    for (const [titulo, path, icono, mod, claves] of crear) {
      if (puede(mod)) lista.push({ id: `crear-${path}`, grupo: 'Acciones', titulo, icono, claves: `nuevo ${claves}`, ejecutar: ir(path) });
    }
    lista.push({
      id: 'modo', grupo: 'Acciones', titulo: oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
      icono: (oscuro ? Sun : Moon) as Icono, claves: 'tema apariencia noche dia',
      ejecutar: () => { setAbierta(false); void guardar({ modo: oscuro ? 'claro' : 'oscuro' }).catch(() => {}); },
    });
    lista.push({
      id: 'atajos', grupo: 'Acciones', titulo: 'Ver atajos de teclado', icono: Keyboard as Icono, claves: 'ayuda teclas',
      ejecutar: () => { setAbierta(false); window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })); },
    });
    for (const m of modulos) {
      if (m.modulo && !puede(m.modulo)) continue;
      lista.push({ id: `ir-${m.path}`, grupo: 'Ir a', titulo: m.name, sub: m.desc, icono: m.icon, ejecutar: ir(m.path) });
    }
    const ajustes: [string, string, Icono, string][] = [
      ['Apariencia', 'apariencia', Palette, 'tema colores modo oscuro'],
      ['Mi perfil', 'perfil', Users, 'nombre cargo telefono'],
      ['Notificaciones', 'notificaciones', Bell, 'avisos push correo'],
      ['Seguridad', 'seguridad', ShieldCheck, 'contraseña 2fa sesiones'],
      ['Mi despacho', 'despacho', Building2, 'logo nif facturas'],
      ['Integraciones', 'integraciones', Plug, 'drive dropbox google'],
      ['Gestión de usuarios', 'usuarios', UsersRound, 'miembros permisos roles invitar'],
      ['Trazabilidad', 'trazabilidad', History, 'auditoria historial accesos'],
    ];
    for (const [titulo, sec, icono, claves] of ajustes) {
      lista.push({ id: `aj-${sec}`, grupo: 'Ajustes', titulo, icono, claves: `ajustes configuracion ${claves}`, ejecutar: ir(`/dashboard/config?section=${sec}`) });
    }
    return lista;
  }, [modulos, puede, prefs.modo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clientes y expedientes del despacho, con una pausa corta al escribir.
  useEffect(() => {
    const t = q.trim();
    if (!abierta || t.length < 2) { setRemotos([]); setBuscando(false); return; }
    setBuscando(true);
    let vivo = true;
    const id = setTimeout(async () => {
      const enc = encodeURIComponent(t);
      const [cli, exp] = await Promise.all([
        puede('clientes') ? apiFetch(`/api/entities?search=${enc}&limit=5`, { getToken }).catch(() => null) : null,
        puede('expedientes') ? apiFetch(`/api/expedientes?q=${enc}&limit=5`, { getToken }).catch(() => null) : null,
      ]);
      if (!vivo) return;
      const r: Elemento[] = [];
      for (const c of (cli?.data || []) as any[]) {
        const nombre = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.commercial_name || 'Cliente sin nombre';
        r.push({
          id: `cli-${c.id}`, grupo: 'Clientes', titulo: nombre,
          sub: [c.nif_cif, c.email].filter(Boolean).join(' · ') || undefined,
          icono: Users, ejecutar: ir(`/dashboard/clientes/${c.id}`),
        });
      }
      for (const e of (exp?.data || []) as any[]) {
        const num = e.num_exp ? `${e.anio ? e.anio + '/' : ''}${e.num_exp}` : e.ref_propia || '';
        r.push({
          id: `exp-${e.id}`, grupo: 'Expedientes', titulo: [num, e.descripcion].filter(Boolean).join(' · ') || 'Expediente',
          sub: e.cliente_nombre_linked || e.cliente_nombre || undefined,
          icono: Briefcase, ejecutar: ir(`/dashboard/expedientes/${e.id}`),
        });
      }
      setRemotos(r);
      setBuscando(false);
    }, 220);
    return () => { vivo = false; clearTimeout(id); };
  }, [q, abierta]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const t = norm(q.trim());
    const locales = t ? fijos.filter((e) => coincide(e, t)) : fijos.filter((e) => e.grupo !== 'Ajustes');
    // Con texto, primero lo encontrado en los datos del despacho.
    return t ? [...remotos, ...locales] : locales;
  }, [q, fijos, remotos]);

  useEffect(() => { setFoco(0); }, [q, remotos.length]);
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [foco]);

  if (!abierta) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setAbierta(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((f) => Math.min(f + 1, visibles.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); visibles[foco]?.ejecutar(); }
  };

  let grupoAnterior = '';
  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-start justify-center p-3 pt-[8vh] sm:pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-slate-900/50 aviso-fondo" onClick={() => setAbierta(false)} />
      <div role="dialog" aria-modal="true" aria-label="Buscar o ejecutar un comando"
        className="aviso-dialogo relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          {buscando ? <Loader2 size={18} className="shrink-0 animate-spin text-slate-400" /> : <Search size={18} className="shrink-0 text-slate-400" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca clientes, expedientes, módulos o acciones…"
            className="paleta-input h-14 flex-1 min-w-0 border-0 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 outline-none shadow-none ring-0 focus:ring-0 focus:border-0"
            aria-label="Buscar"
          />
          <kbd className="hidden sm:inline-flex rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-sans font-semibold text-slate-500">Esc</kbd>
        </div>
        <div ref={listaRef} className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {visibles.length === 0 && !buscando && (
            <p className="px-3 py-10 text-center text-sm text-slate-500">
              {q.trim().length < 2 ? 'Escribe para buscar.' : <>Nada coincide con «{q.trim()}».</>}
            </p>
          )}
          {visibles.map((e, i) => {
            const cabecera = e.grupo !== grupoAnterior ? e.grupo : null;
            grupoAnterior = e.grupo;
            const Icono = e.icono;
            const activo = i === foco;
            return (
              <React.Fragment key={e.id}>
                {cabecera && <p className="px-3 pb-1 pt-3 first:pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{cabecera}</p>}
                <button
                  type="button"
                  data-i={i}
                  onMouseMove={() => setFoco(i)}
                  onClick={e.ejecutar}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left ${activo ? 'bg-slate-100' : ''}`}
                >
                  <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${activo ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>
                    <Icono size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{e.titulo}</span>
                    {e.sub && <span className="block truncate text-xs text-slate-500">{e.sub}</span>}
                  </span>
                  {activo && (e.grupo === 'Clientes' || e.grupo === 'Expedientes' || e.grupo === 'Ir a' || e.grupo === 'Ajustes'
                    ? <ArrowRight size={15} className="shrink-0 text-slate-400" />
                    : <CornerDownLeft size={15} className="shrink-0 text-slate-400" />)}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="hidden sm:flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="font-sans font-semibold">↑↓</kbd> moverse</span>
          <span><kbd className="font-sans font-semibold">Intro</kbd> abrir</span>
          <span><kbd className="font-sans font-semibold">Esc</kbd> cerrar</span>
          <span className="ml-auto"><kbd className="font-sans font-semibold">Ctrl K</kbd> desde cualquier sitio</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
