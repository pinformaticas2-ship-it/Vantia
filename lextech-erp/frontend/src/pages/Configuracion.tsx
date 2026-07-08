import React, { useState } from 'react';
import { Bell, Building2, Check, Palette, Plug, ShieldCheck, UsersRound } from 'lucide-react';
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
    name: 'Avalentia Pro',
    description: 'Corporativo. Barra lateral oscura con acento rojo intenso.',
    sidebar: '#0f172a',
    sidebarBorder: '#1e293b',
    accent: '#dc2626',
    bg: '#f4f6f8',
    bars: ['#1e293b', '#dc2626', '#334155', '#1e293b', '#334155'],
  },
  {
    id: 'azul',
    name: 'Claro Minimalista',
    description: 'Moderno y limpio. Barra lateral clara con acento azul.',
    sidebar: '#ffffff',
    sidebarBorder: '#e2e8f0',
    accent: '#2563eb',
    bg: '#f0f5ff',
    bars: ['#e2e8f0', '#2563eb', '#e2e8f0', '#f1f5f9', '#e2e8f0'],
  },
];

type SectionKey = 'apariencia' | 'notificaciones' | 'despacho' | 'seguridad' | 'integraciones' | 'usuarios';

const OTHER_SECTIONS: { key: SectionKey; label: string; desc: string; icon: any }[] = [
  { key: 'notificaciones', label: 'Notificaciones',        desc: 'Configura alertas por email y avisos emergentes del sistema.',            icon: Bell },
  { key: 'despacho',       label: 'Mi Despacho',           desc: 'Información fiscal del despacho, logotipo y textos legales para facturas.', icon: Building2 },
  { key: 'seguridad',      label: 'Seguridad',             desc: 'Cambio de contraseñas, autenticación en dos pasos (2FA) y sesiones activas.', icon: ShieldCheck },
  { key: 'integraciones',  label: 'Integraciones',         desc: 'Conecta Vantia con herramientas y servicios externos.',                    icon: Plug },
  { key: 'usuarios',       label: 'Gestión de Usuarios',   desc: 'Administra los usuarios y permisos del despacho.',                          icon: UsersRound },
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
        active ? 'shadow-xl scale-[1.01]' : 'border-slate-200 hover:border-slate-300 hover:shadow-lg hover:scale-[1.005]'
      }`}
      style={active ? { borderColor: p.accent, boxShadow: `0 20px 25px -5px ${p.accent}26, 0 8px 10px -6px ${p.accent}26` } : undefined}
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
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${active ? 'shadow-md' : 'border-slate-300'}`}
          style={active ? { backgroundColor: p.accent, borderColor: p.accent, boxShadow: `0 4px 6px -1px ${p.accent}4d` } : undefined}
        >
          {active && <Check size={11} className="text-white" strokeWidth={3} />}
        </div>
      </div>

      {/* Active glow overlay */}
      {active && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${p.accent}33` }} />
      )}
    </button>
  );
}

export default function Configuracion() {
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SectionKey>('apariencia');
  const activeOther = OTHER_SECTIONS.find((s) => s.key === activeSection);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sub-navegación de Ajustes ── */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-slate-200 z-10">
        <div className="p-6 pb-2">
          <h2 className="text-lg font-extrabold text-slate-800">Ajustes</h2>
        </div>
        <div className="flex-1 overflow-y-auto modules-scrollbar p-3">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveSection('apariencia')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-colors text-left ${
                activeSection === 'apariencia' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
              }`}
            >
              <Palette size={16} className={activeSection === 'apariencia' ? 'text-red-500' : 'text-slate-400'} /> Apariencia
            </button>
            {OTHER_SECTIONS.map((s, i) => {
              const Icon = s.icon;
              const active = activeSection === s.key;
              return (
                <React.Fragment key={s.key}>
                  {i === OTHER_SECTIONS.length - 1 && <div className="my-4 border-t border-slate-200 mx-2" />}
                  <button
                    onClick={() => setActiveSection(s.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left group ${
                      active ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <Icon size={16} className={active ? 'text-red-500' : 'text-slate-400 group-hover:text-slate-600'} /> {s.label}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ── Contenido del ajuste ── */}
      <div className="flex-1 overflow-y-auto modules-scrollbar p-8 lg:p-12 bg-[#f4f6f8]">
        <div className="max-w-4xl">

          {activeSection === 'apariencia' ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-extrabold text-slate-800 mb-1">Apariencia</h1>
                <p className="text-sm text-slate-500">Personaliza la paleta de colores y el comportamiento visual del sistema para adaptarlo a tus preferencias.</p>
              </div>

              {/* Tema del sistema */}
              <section className="mb-10">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Tema del Entorno de Trabajo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {PALETTES.map((p) => (
                    <PaletteCard
                      key={p.id}
                      p={p}
                      active={theme === p.id}
                      onClick={() => setTheme(p.id)}
                    />
                  ))}
                </div>
              </section>

              {/* Otros módulos */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Otros Módulos de Configuración</h3>
                <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden mt-6">
                  {OTHER_SECTIONS.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setActiveSection(s.key)}
                        className={`flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left group ${
                          i < OTHER_SECTIONS.length - 1 ? 'border-b border-slate-100' : ''
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-slate-200">
                            <Icon size={18} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 group-hover:text-slate-900">{s.label}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded-md border border-slate-200 shrink-0">Próximamente</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-24">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                {activeOther && <activeOther.icon size={24} className="text-slate-400" />}
              </div>
              <h1 className="text-xl font-extrabold text-slate-800 mb-1">{activeOther?.label}</h1>
              <p className="text-sm text-slate-500 max-w-sm">{activeOther?.desc}</p>
              <span className="mt-4 px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded-full border border-slate-200">Próximamente</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
