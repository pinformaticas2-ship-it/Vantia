import React from 'react';
import { Check, Palette, Settings } from 'lucide-react';
import { useTheme, AppTheme } from '../lib/ThemeContext';

const PALETTES: {
  id: AppTheme;
  name: string;
  description: string;
  sidebar: string;
  sidebarBorder: string;
  accent: string;
  bg: string;
  bars: string[];
}[] = [
  {
    id: 'rojo',
    name: 'Rojo y Negro',
    description: 'Corporativo. Barra lateral oscura con acento rojo intenso.',
    sidebar: '#0f172a',
    sidebarBorder: '#1e293b',
    accent: '#dc2626',
    bg: '#f4f6f8',
    bars: ['#1e293b', '#dc2626', '#334155', '#1e293b', '#334155'],
  },
  {
    id: 'azul',
    name: 'Azul y Blanco',
    description: 'Moderno y limpio. Barra lateral clara con acento azul.',
    sidebar: '#ffffff',
    sidebarBorder: '#e2e8f0',
    accent: '#2563eb',
    bg: '#f0f5ff',
    bars: ['#e2e8f0', '#2563eb', '#e2e8f0', '#f1f5f9', '#e2e8f0'],
  },
];

function PaletteCard({ p, active, onClick }: {
  p: typeof PALETTES[0];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left rounded-2xl border-2 transition-all duration-300 overflow-hidden group ${
        active
          ? 'border-blue-500 shadow-xl shadow-blue-500/15 scale-[1.01]'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-lg hover:scale-[1.005]'
      }`}
    >
      {/* ── Mini app preview ── */}
      <div className="h-36 flex overflow-hidden select-none pointer-events-none" style={{ backgroundColor: p.bg }}>
        {/* Sidebar */}
        <div
          className="w-16 h-full flex flex-col pt-3 px-2 gap-1.5 shrink-0"
          style={{ backgroundColor: p.sidebar, borderRight: `1px solid ${p.sidebarBorder}` }}
        >
          {/* Logo placeholder */}
          <div className="rounded-md h-5 mb-2" style={{ backgroundColor: p.accent, opacity: 0.9 }} />
          {p.bars.map((color, i) => (
            <div
              key={i}
              className="rounded h-2"
              style={{
                backgroundColor: color,
                width: i === 1 ? '82%' : `${52 + (i * 11) % 30}%`,
                opacity: i === 1 ? 1 : 0.55,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-3 space-y-2" style={{ backgroundColor: p.bg }}>
          {/* Topbar */}
          <div
            className="rounded-lg h-7 flex items-center px-2 gap-2"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <div className="rounded h-2 flex-1" style={{ backgroundColor: '#e2e8f0' }} />
            <div className="rounded h-4 w-10" style={{ backgroundColor: p.accent }} />
          </div>
          {/* Cards row */}
          <div className="flex gap-2">
            {[0.9, 0.7, 1].map((w, i) => (
              <div
                key={i}
                className="flex-1 rounded-xl p-2 space-y-1"
                style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
              >
                <div className="rounded h-1.5" style={{ backgroundColor: p.accent, width: `${w * 60}%` }} />
                <div className="rounded h-1.5 bg-slate-100" style={{ width: '80%' }} />
                <div className="rounded h-1.5 bg-slate-100" style={{ width: '55%' }} />
              </div>
            ))}
          </div>
          {/* Table row */}
          <div
            className="rounded-xl h-10 px-2 flex items-center gap-2"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <div className="rounded-full h-3 w-3" style={{ backgroundColor: p.accent, opacity: 0.3 }} />
            <div className="rounded h-1.5 flex-1 bg-slate-100" />
            <div className="rounded h-4 w-8" style={{ backgroundColor: p.accent, opacity: 0.8 }} />
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div className="px-4 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          {/* Color swatches */}
          <div className="flex gap-1 shrink-0">
            <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: p.sidebar === '#ffffff' ? '#e2e8f0' : p.sidebar }} />
            <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: p.accent }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">{p.name}</p>
            <p className="text-xs text-slate-400 leading-snug mt-0.5 truncate">{p.description}</p>
          </div>
        </div>
        <div
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
            active ? 'bg-blue-500 border-blue-500 shadow-md shadow-blue-500/30' : 'border-slate-300'
          }`}
        >
          {active && <Check size={11} className="text-white" strokeWidth={3} />}
        </div>
      </div>

      {/* Active glow overlay */}
      {active && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none ring-2 ring-inset ring-blue-500/20" />
      )}
    </button>
  );
}

export default function Configuracion() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col h-full bg-[#f4f6f8]">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-slate-200 flex items-center gap-4 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <Settings size={19} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 leading-tight">Configuración</h1>
          <p className="text-sm text-slate-400 mt-0.5">Personaliza la apariencia y el comportamiento del sistema</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl space-y-6">

          {/* Apariencia */}
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <Palette size={14} className="text-violet-500" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Paleta de colores</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Los cambios se aplican al instante en toda la aplicación</p>
              </div>
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase tracking-wide">
                {theme === 'rojo' ? 'Rojo y Negro' : 'Azul y Blanco'}
              </span>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PALETTES.map((p) => (
                  <PaletteCard
                    key={p.id}
                    p={p}
                    active={theme === p.id}
                    onClick={() => setTheme(p.id)}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Placeholder sections */}
          {[
            { label: 'Notificaciones', desc: 'Configura alertas y avisos del sistema', color: 'amber' },
            { label: 'Empresa', desc: 'Datos del despacho, logo e información legal', color: 'emerald' },
            { label: 'Seguridad', desc: 'Contraseñas, sesiones y accesos', color: 'rose' },
          ].map(({ label, desc }) => (
            <section key={label} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm opacity-50 pointer-events-none select-none">
              <div className="px-6 py-4 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-slate-300" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-700">{label}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                </div>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full uppercase tracking-wide">Próximamente</span>
              </div>
            </section>
          ))}

        </div>
      </div>
    </div>
  );
}
