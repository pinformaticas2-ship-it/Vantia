import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Building2, Check, Loader2, Palette, Plug, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useTheme, AppTheme } from '../lib/ThemeContext';
import { apiFetch } from '../lib/api';
import { useOrganizacion, OrgRol } from '../lib/useOrganizacion';

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

function DespachoPanel() {
  const { getToken } = useAuth();
  const { organizacion, rol, organizaciones, isLoaded, reload, switchOrganizacion } = useOrganizacion();
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (organizacion) setNombre(organizacion.nombre); }, [organizacion]);

  const canEdit = rol === 'propietario' || rol === 'admin';

  const save = async () => {
    if (!nombre.trim()) return;
    setSaving(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion', { method: 'PUT', getToken, body: JSON.stringify({ nombre: nombre.trim() }) });
      if (data?.success === false) throw new Error(data.error);
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const createOrg = async () => {
    if (!newNombre.trim()) return;
    setCreatingLoading(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion', { method: 'POST', getToken, body: JSON.stringify({ nombre: newNombre.trim() }) });
      if (data?.success === false) throw new Error(data.error);
      switchOrganizacion(data.data.id);
    } catch (e: any) {
      setError(e.message || 'No se pudo crear la organización.');
      setCreatingLoading(false);
    }
  };

  if (!isLoaded) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-300" size={28} /></div>;
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-1">Mi Despacho</h1>
        <p className="text-sm text-slate-500">Información de la organización activa y gestión de organizaciones.</p>
      </div>

      <section className="mb-10 max-w-lg">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Organización activa</h3>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          {!canEdit && <p className="text-xs text-slate-400">Solo el propietario o un administrador pueden editar el nombre.</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {canEdit && (
            <button
              onClick={save}
              disabled={saving || !nombre.trim()}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
              {saved ? 'Guardado' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </section>

      {organizaciones.length > 0 && (
        <section className="mb-10 max-w-lg">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Tus organizaciones</h3>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-sm overflow-hidden">
            {organizaciones.map((o) => (
              <button
                key={o.id}
                onClick={() => o.id !== organizacion?.id && switchOrganizacion(o.id)}
                className={`w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors ${o.id === organizacion?.id ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{o.nombre}</p>
                  <p className="text-xs text-slate-400 capitalize">{o.rol}</p>
                </div>
                {o.id === organizacion?.id && <Check size={16} className="text-red-500" />}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-lg">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Crear una nueva organización</h3>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800"
          >
            <Plus size={15} /> Nueva organización
          </button>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-3">
            <input
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              placeholder="Nombre del nuevo despacho"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
              autoFocus
            />
            <button
              onClick={createOrg}
              disabled={creatingLoading || !newNombre.trim()}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {creatingLoading ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
            </button>
            <button onClick={() => { setCreating(false); setNewNombre(''); }} className="text-sm text-slate-400 hover:text-slate-600 px-2">Cancelar</button>
          </div>
        )}
      </section>
    </>
  );
}

interface Miembro { id: string; userId: string; nombre: string; email: string | null; rol: OrgRol; createdAt: string; }

function UsuariosPanel() {
  const { getToken } = useAuth();
  const { rol: myRol, organizacion } = useOrganizacion();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [nuevoRol, setNuevoRol] = useState<OrgRol>('miembro');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = myRol === 'propietario' || myRol === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/organizacion/miembros', { getToken });
      if (data?.success) setMiembros(data.data || []);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const addMiembro = async () => {
    if (!email.trim()) return;
    setAdding(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion/miembros', { method: 'POST', getToken, body: JSON.stringify({ email: email.trim(), rol: nuevoRol }) });
      if (data?.success === false) throw new Error(data.error);
      setEmail(''); setNuevoRol('miembro');
      await load();
    } catch (e: any) {
      setError(e.message || 'No se pudo añadir el miembro.');
    } finally {
      setAdding(false);
    }
  };

  const changeRol = async (id: string, nuevo: OrgRol) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/organizacion/miembros/${id}`, { method: 'PATCH', getToken, body: JSON.stringify({ rol: nuevo }) });
      await load();
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/organizacion/miembros/${id}`, { method: 'DELETE', getToken });
      await load();
    } finally { setBusyId(null); }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-1">Gestión de Usuarios</h1>
        <p className="text-sm text-slate-500">Miembros de {organizacion?.nombre || 'esta organización'} y sus roles.</p>
      </div>

      {canManage && (
        <section className="mb-8 max-w-2xl">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Añadir miembro</h3>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-wrap items-center gap-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@delusuario.com"
              className="flex-1 min-w-[220px] rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
            />
            <select
              value={nuevoRol}
              onChange={(e) => setNuevoRol(e.target.value as OrgRol)}
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300 bg-white"
            >
              <option value="miembro">Miembro</option>
              <option value="admin">Admin</option>
              <option value="propietario">Propietario</option>
            </select>
            <button
              onClick={addMiembro}
              disabled={adding || !email.trim()}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Añadir
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <p className="text-xs text-slate-400 mt-2">La persona debe haber iniciado sesión al menos una vez en Vantia antes de poder añadirla.</p>
        </section>
      )}

      <section>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Miembros</h3>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-300" size={24} /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-sm overflow-hidden">
            {miembros.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.nombre}</p>
                  {m.email && <p className="text-xs text-slate-400 truncate">{m.email}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {myRol === 'propietario' ? (
                    <select
                      value={m.rol}
                      onChange={(e) => changeRol(m.id, e.target.value as OrgRol)}
                      disabled={busyId === m.id}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-red-300 bg-white capitalize"
                    >
                      <option value="miembro">Miembro</option>
                      <option value="admin">Admin</option>
                      <option value="propietario">Propietario</option>
                    </select>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 capitalize px-2.5 py-1 bg-slate-100 rounded-full">{m.rol}</span>
                  )}
                  {canManage && (
                    <button
                      onClick={() => remove(m.id)}
                      disabled={busyId === m.id}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Quitar de la organización"
                    >
                      {busyId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {miembros.length === 0 && <p className="text-sm text-slate-400 px-5 py-8 text-center">Sin miembros.</p>}
          </div>
        )}
      </section>
    </>
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
                        {s.key !== 'despacho' && s.key !== 'usuarios' && (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded-md border border-slate-200 shrink-0">Próximamente</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : activeSection === 'despacho' ? (
            <DespachoPanel />
          ) : activeSection === 'usuarios' ? (
            <UsuariosPanel />
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
