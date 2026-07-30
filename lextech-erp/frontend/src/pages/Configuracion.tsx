import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, BookOpen, Building2, Camera, Check, Loader2, Lock, Palette, Plug, Plus, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useTheme, AppTheme } from '../lib/ThemeContext';
import { pickSidebarStyle, autoSidebarBorder } from '../lib/themeCss';
import { apiFetch, resolveUploadUrl, setActiveOrganizacionId } from '../lib/api';
import { useOrganizacion, OrgRol } from '../lib/useOrganizacion';
import ManualPanel from './ManualPanel';

const PALETTES: {
  id: AppTheme;
  name: string;
  description: string;
  sidebar: string;
  sidebarBorder: string;
  accent: string;
  secondary?: string;
  bg: string;
  bars: string[];
}[] = [
  {
    id: 'rojo',
    name: 'Rojo y Negro',
    description: 'Corporativo. Barra lateral negra con acento rojo intenso.',
    sidebar: '#0f172a',
    sidebarBorder: '#1e293b',
    accent: '#dc2626',
    bg: '#f4f6f8',
    bars: ['#1e293b', '#dc2626', '#334155', '#1e293b', '#334155'],
  },
  {
    id: 'azul',
    name: 'Azul y Ámbar',
    description: 'Base clara con acento azul y detalles en ámbar para insignias y avisos.',
    sidebar: '#ffffff',
    sidebarBorder: '#e2e8f0',
    accent: '#2563eb',
    secondary: '#f59e0b',
    bg: '#f0f5ff',
    bars: ['#e2e8f0', '#2563eb', '#f59e0b', '#f1f5f9', '#e2e8f0'],
  },
  {
    id: 'verde',
    name: 'Verde y Oro',
    description: 'Base clara con acento verde esmeralda y detalles dorados para insignias y avisos.',
    sidebar: '#ffffff',
    sidebarBorder: '#e2e8f0',
    accent: '#059669',
    secondary: '#fbbf24',
    bg: '#f3fcf9',
    bars: ['#e2e8f0', '#059669', '#fbbf24', '#f1f5f9', '#e2e8f0'],
  },
  {
    id: 'violeta',
    name: 'Violeta y Rosa',
    description: 'Base clara con acento violeta y detalles en rosa para insignias y avisos.',
    sidebar: '#ffffff',
    sidebarBorder: '#e2e8f0',
    accent: '#7c3aed',
    secondary: '#f43f5e',
    bg: '#f6f3fc',
    bars: ['#e2e8f0', '#7c3aed', '#f43f5e', '#f1f5f9', '#e2e8f0'],
  },
  {
    id: 'grafito',
    name: 'Grafito y Turquesa',
    description: 'Barra lateral grafito oscuro con acento turquesa y detalles en ámbar.',
    sidebar: '#1f2937',
    sidebarBorder: '#374151',
    accent: '#0d9488',
    secondary: '#fbbf24',
    bg: '#f2fbfa',
    bars: ['#374151', '#0d9488', '#fbbf24', '#4b5563', '#374151'],
  },
  {
    id: 'indigo',
    name: 'Índigo y Coral',
    description: 'Base clara con acento índigo y detalles en coral para insignias y avisos.',
    sidebar: '#ffffff',
    sidebarBorder: '#e2e8f0',
    accent: '#4f46e5',
    secondary: '#f97316',
    bg: '#f1f1fe',
    bars: ['#e2e8f0', '#4f46e5', '#f97316', '#f1f5f9', '#e2e8f0'],
  },
];

type SectionKey = 'apariencia' | 'manual' | 'notificaciones' | 'despacho' | 'seguridad' | 'integraciones' | 'usuarios';

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
    <div className="relative">
      {/* ── Resplandor ambiental cuando está activo ── */}
      {active && (
        <div
          className="pointer-events-none absolute -inset-3 -z-10 rounded-[28px] opacity-40 blur-2xl transition-opacity duration-500"
          style={{ background: `radial-gradient(circle at 30% 20%, ${p.accent}, transparent 70%)` }}
        />
      )}
      <button
        onClick={onClick}
        className={`relative w-full text-left rounded-2xl border-2 transition-all duration-300 overflow-hidden group ${
          active ? 'shadow-xl -translate-y-0.5' : 'border-slate-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5'
        }`}
        style={active ? { borderColor: p.accent, boxShadow: `0 20px 25px -5px ${p.accent}26, 0 8px 10px -6px ${p.accent}26` } : undefined}
      >
      {/* ── Mini app preview ── */}
      <div className="h-40 flex overflow-hidden select-none pointer-events-none transition-transform duration-500 group-hover:scale-[1.03]" style={{ backgroundColor: p.bg }}>
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
                <div className="rounded h-1.5" style={{ backgroundColor: i === 2 ? (p.secondary ?? p.accent) : p.accent, width: `${w * 60}%` }} />
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
            <div className="rounded h-4 w-8" style={{ backgroundColor: p.secondary ?? p.accent, opacity: 0.85 }} />
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div className="px-4 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          {/* Color swatches */}
          <div className="flex -space-x-1.5 shrink-0">
            <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: p.sidebar === '#ffffff' ? '#e2e8f0' : p.sidebar }} />
            <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: p.accent }} />
            {p.secondary && <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: p.secondary }} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">{p.name}</p>
            <p className="text-xs text-slate-400 leading-snug mt-0.5 truncate">{p.description}</p>
          </div>
        </div>
        <span className={`shrink-0 text-[11px] font-bold transition-colors ${active ? '' : 'text-slate-300 group-hover:text-slate-400'}`} style={active ? { color: p.accent } : undefined}>
          {active ? 'En uso' : 'Aplicar'}
        </span>
      </div>

      {/* Active glow overlay */}
      {active && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${p.accent}33` }} />
      )}
      </button>
    </div>
  );
}

interface DeletionImpact {
  clientes: number;
  expedientes: number;
  otrosMiembros: number;
  esLaUnica: boolean;
}

function DeleteOrganizacionModal({ nombre, onClose }: { nombre: string; onClose: () => void }) {
  const { getToken } = useAuth();
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [typedNombre, setTypedNombre] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/api/organizacion/impacto-borrado', { getToken });
        if (data?.success === false) throw new Error(data.error);
        setImpact(data.data);
      } catch (e: any) {
        setError(e.message || 'No se pudo calcular el impacto del borrado.');
      } finally {
        setLoadingImpact(false);
      }
    })();
  }, [getToken]);

  const nameMatches = typedNombre.trim() === nombre.trim();
  const canDelete = !loadingImpact && impact && !impact.esLaUnica && confirmChecked && nameMatches && !deleting;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion', { method: 'DELETE', getToken, body: JSON.stringify({ confirmNombre: typedNombre.trim() }) });
      if (data?.success === false) throw new Error(data.error);
      // La organización activa ya no existe -- recargar para que el backend
      // resuelva cuál es la nueva organización activa del usuario.
      setActiveOrganizacionId(null);
      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'No se pudo eliminar la organización.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-3.5 bg-red-50/60">
          <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">Eliminar organización</h2>
            <p className="text-sm text-slate-500 mt-0.5">Esta acción es permanente y no se puede deshacer.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loadingImpact ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-300" size={22} /></div>
          ) : impact?.esLaUnica ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No puedes eliminar <strong>{nombre}</strong> porque es la única organización del sistema. Crea otra organización antes de poder borrar esta.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
                <p className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2">Se eliminará permanentemente</p>
                <ul className="space-y-1 text-sm text-red-800">
                  <li>• <strong>{impact?.clientes ?? 0}</strong> cliente{impact?.clientes === 1 ? '' : 's'}</li>
                  <li>• <strong>{impact?.expedientes ?? 0}</strong> expediente{impact?.expedientes === 1 ? '' : 's'}</li>
                  <li>• Todo el historial de importaciones de esta organización</li>
                </ul>
                {!!impact?.otrosMiembros && (
                  <p className="mt-2.5 pt-2.5 border-t border-red-200 text-sm text-red-800">
                    <strong>{impact.otrosMiembros}</strong> persona{impact.otrosMiembros === 1 ? '' : 's'} más perderá{impact.otrosMiembros === 1 ? '' : 'n'} el acceso a esta organización inmediatamente.
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Los módulos aún compartidos entre organizaciones (chat, agenda, tareas, facturación, email, WhatsApp) no se ven afectados por este borrado.
              </p>

              <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-300"
                />
                Entiendo que esta acción es irreversible y que se perderán todos los datos anteriores.
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Escribe <span className="text-slate-800 normal-case">{nombre}</span> para confirmar
                </label>
                <input
                  value={typedNombre}
                  onChange={(e) => setTypedNombre(e.target.value)}
                  placeholder={nombre}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
                  autoFocus
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          {!impact?.esLaUnica && (
            <button
              onClick={handleDelete}
              disabled={!canDelete}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              Eliminar definitivamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DespachoPanel() {
  const { getToken } = useAuth();
  const { organizacion, rol, organizaciones, isLoaded, switchOrganizacion } = useOrganizacion();
  const [nombre, setNombre] = useState('');
  const [nifCif, setNifCif] = useState('');
  const [direccionFiscal, setDireccionFiscal] = useState('');
  const [textoLegalFacturas, setTextoLegalFacturas] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newNifCif, setNewNifCif] = useState('');
  const [newDireccionFiscal, setNewDireccionFiscal] = useState('');
  const [newTextoLegalFacturas, setNewTextoLegalFacturas] = useState('');
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);
  const newLogoInputRef = useRef<HTMLInputElement>(null);
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (!organizacion) return;
    setNombre(organizacion.nombre);
    setNifCif(organizacion.nifCif || '');
    setDireccionFiscal(organizacion.direccionFiscal || '');
    setTextoLegalFacturas(organizacion.textoLegalFacturas || '');
  }, [organizacion]);

  const canEdit = rol === 'propietario' || rol === 'admin';

  const save = async () => {
    if (!nombre.trim()) return;
    setSaving(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion', {
        method: 'PUT', getToken,
        body: JSON.stringify({
          nombre: nombre.trim(),
          nifCif: nifCif.trim(),
          direccionFiscal: direccionFiscal.trim(),
          textoLegalFacturas: textoLegalFacturas.trim(),
        }),
      });
      if (data?.success === false) throw new Error(data.error);
      // El selector de organización del sidebar es otra instancia de este
      // mismo hook (no comparten estado), así que un simple reload() local
      // no le llega -- recargamos la página, igual que ya hace
      // switchOrganizacion, para que se vea en todas partes.
      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar.');
      setSaving(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true); setError('');
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch('/api/organizacion/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'No se pudo subir el logotipo.');
      // Mismo motivo que en save(): forzar recarga para que el logotipo
      // nuevo se vea también en el selector de organización del sidebar.
      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'No se pudo subir el logotipo.');
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setRemovingLogo(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/organizacion/logo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'No se pudo quitar el logotipo.');
      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'No se pudo quitar el logotipo.');
      setRemovingLogo(false);
    }
  };

  const handleNewLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (newLogoPreview) URL.revokeObjectURL(newLogoPreview);
    setNewLogoFile(file);
    setNewLogoPreview(URL.createObjectURL(file));
  };

  const clearNewLogo = () => {
    if (newLogoPreview) URL.revokeObjectURL(newLogoPreview);
    setNewLogoFile(null);
    setNewLogoPreview(null);
    if (newLogoInputRef.current) newLogoInputRef.current.value = '';
  };

  const createOrg = async () => {
    if (!newNombre.trim()) return;
    setCreatingLoading(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion', {
        method: 'POST', getToken,
        body: JSON.stringify({
          nombre: newNombre.trim(),
          nifCif: newNifCif.trim(),
          direccionFiscal: newDireccionFiscal.trim(),
          textoLegalFacturas: newTextoLegalFacturas.trim(),
        }),
      });
      if (data?.success === false) throw new Error(data.error);
      const newOrgId = data.data.id;

      if (newLogoFile) {
        // La organización aún no es la "activa" -- hay que serlo antes de
        // subir el logo para que el shim de fetch apunte la cabecera
        // X-Organizacion-Id a la recién creada y no a la actual.
        setActiveOrganizacionId(newOrgId);
        try {
          const token = await getToken();
          const formData = new FormData();
          formData.append('logo', newLogoFile);
          await fetch('/api/organizacion/logo', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } catch { /* la organización ya se creó bien; el logo se puede añadir luego desde Mi Despacho */ }
      }

      switchOrganizacion(newOrgId);
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

      <section className="mb-10 max-w-3xl">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Organización activa</h3>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0 group">
              <div className="h-16 w-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                {organizacion?.logoUrl ? (
                  <img src={resolveUploadUrl(organizacion.logoUrl) || ''} alt="Logotipo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 size={22} className="text-slate-300" />
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all disabled:cursor-wait"
                  title="Cambiar logotipo"
                >
                  {uploadingLogo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Logotipo</p>
              <p className="text-xs text-slate-400 mt-0.5">{canEdit ? 'Pasa el ratón por encima para cambiarlo. Se usará en facturas y documentos.' : 'Solo el propietario o un administrador pueden cambiarlo.'}</p>
              {canEdit && organizacion?.logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={removingLogo || uploadingLogo}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 mt-1.5"
                >
                  {removingLogo ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  Quitar logotipo
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          {canEdit ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">NIF/CIF</label>
                  <input
                    value={nifCif}
                    onChange={(e) => setNifCif(e.target.value)}
                    placeholder="B12345678"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dirección fiscal</label>
                  <input
                    value={direccionFiscal}
                    onChange={(e) => setDireccionFiscal(e.target.value)}
                    placeholder="Calle, número, ciudad"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Texto legal para facturas</label>
                <textarea
                  value={textoLegalFacturas}
                  onChange={(e) => setTextoLegalFacturas(e.target.value)}
                  rows={3}
                  placeholder="Texto que aparecerá al pie de las facturas (condiciones, aviso legal...)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300 resize-none"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs text-slate-400">
              <Lock size={14} className="shrink-0" />
              Solo el propietario o un administrador pueden ver y editar el NIF/CIF, la dirección fiscal y el texto legal de esta organización.
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {canEdit && (
            <button
              onClick={save}
              disabled={saving || !nombre.trim()}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar cambios
            </button>
          )}
        </div>
      </section>

      {organizaciones.length > 0 && (
        <section className="mb-10 max-w-3xl">
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

      <section className="max-w-3xl">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Crear una nueva organización</h3>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800"
          >
            <Plus size={15} /> Nueva organización
          </button>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0 group">
                <div className="h-16 w-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {newLogoPreview ? (
                    <img src={newLogoPreview} alt="Logotipo" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 size={22} className="text-slate-300" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => newLogoInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 group-hover:bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all"
                  title="Elegir logotipo"
                >
                  <Camera size={16} />
                </button>
                <input ref={newLogoInputRef} type="file" accept="image/*" onChange={handleNewLogoChange} className="hidden" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Logotipo <span className="normal-case font-normal text-slate-300">(opcional)</span></p>
                <p className="text-xs text-slate-400 mt-0.5">Pasa el ratón por encima para elegir una imagen. Si no pones ninguna se usará un icono por defecto.</p>
                {newLogoPreview && (
                  <button type="button" onClick={clearNewLogo} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 mt-1">
                    <Trash2 size={11} /> Quitar
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre</label>
              <input
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                placeholder="Nombre del nuevo despacho"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">NIF/CIF <span className="normal-case font-normal text-slate-300">(opcional)</span></label>
                <input
                  value={newNifCif}
                  onChange={(e) => setNewNifCif(e.target.value)}
                  placeholder="B12345678"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dirección fiscal <span className="normal-case font-normal text-slate-300">(opcional)</span></label>
                <input
                  value={newDireccionFiscal}
                  onChange={(e) => setNewDireccionFiscal(e.target.value)}
                  placeholder="Calle, número, ciudad"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Texto legal para facturas <span className="normal-case font-normal text-slate-300">(opcional)</span></label>
              <textarea
                value={newTextoLegalFacturas}
                onChange={(e) => setNewTextoLegalFacturas(e.target.value)}
                rows={2}
                placeholder="Podrás cambiarlo luego desde Mi Despacho"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300 resize-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={createOrg}
                disabled={creatingLoading || !newNombre.trim()}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {creatingLoading ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
              </button>
              <button
                onClick={() => { setCreating(false); setNewNombre(''); setNewNifCif(''); setNewDireccionFiscal(''); setNewTextoLegalFacturas(''); clearNewLogo(); }}
                className="text-sm text-slate-400 hover:text-slate-600 px-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      {rol === 'propietario' && organizacion && (
        <section className="mt-12 max-w-3xl">
          <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-4 border-b border-red-100 pb-2">Zona de peligro</h3>
          <div className="bg-red-50/50 border border-red-200 rounded-xl p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Eliminar esta organización</p>
              <p className="text-xs text-slate-500 mt-0.5">Borra permanentemente clientes, expedientes y el acceso de todos sus miembros.</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-2 shrink-0 bg-white border border-red-300 hover:bg-red-600 hover:text-white hover:border-red-600 text-red-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </section>
      )}

      {showDeleteModal && organizacion && (
        <DeleteOrganizacionModal nombre={organizacion.nombre} onClose={() => setShowDeleteModal(false)} />
      )}
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

function ColorField({ label, value, onChange, onCommit, valid }: {
  label: string; value: string; onChange: (v: string) => void; onCommit: (v: string) => void; valid: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={valid ? value : '#000000'}
        onChange={(e) => { onChange(e.target.value); onCommit(e.target.value); }}
        className="h-11 w-11 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-transparent p-0"
        title={label}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (valid) onCommit(value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) onCommit(value); }}
          maxLength={7}
          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm font-mono uppercase text-slate-700"
        />
      </div>
    </div>
  );
}

export default function Configuracion() {
  const { theme, setTheme, customColor, customSecondary, customSidebar, setCustomColors } = useTheme();
  const [draftPrimary, setDraftPrimary] = useState(customColor);
  const [draftSecondary, setDraftSecondary] = useState(customSecondary);
  const [draftSidebar, setDraftSidebar] = useState(customSidebar);
  useEffect(() => { setDraftPrimary(customColor); }, [customColor]);
  useEffect(() => { setDraftSecondary(customSecondary); }, [customSecondary]);
  useEffect(() => { setDraftSidebar(customSidebar); }, [customSidebar]);
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const draftPrimaryValid = HEX_RE.test(draftPrimary);
  const draftSecondaryValid = HEX_RE.test(draftSecondary);
  const draftSidebarValid = HEX_RE.test(draftSidebar);
  const allDraftsValid = draftPrimaryValid && draftSecondaryValid && draftSidebarValid;
  const isCustomInUse = theme === 'custom'
    && draftPrimary.toLowerCase() === customColor.toLowerCase()
    && draftSecondary.toLowerCase() === customSecondary.toLowerCase()
    && draftSidebar.toLowerCase() === customSidebar.toLowerCase();
  const currentAccent = PALETTES.find((p) => p.id === theme)?.accent ?? PALETTES[0].accent;
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
            <button
              onClick={() => setActiveSection('manual')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-colors text-left ${
                activeSection === 'manual' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
              }`}
            >
              <BookOpen size={16} className={activeSection === 'manual' ? 'text-red-500' : 'text-slate-400'} /> Manual de usuario
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
        <div className={activeSection === 'apariencia' ? 'max-w-6xl' : 'max-w-4xl'}>

          {activeSection === 'apariencia' ? (
            <>
              {/* ── Cabecera ── */}
              <div className="relative mb-9 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white shadow-sm">
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-30 blur-3xl transition-colors duration-500"
                  style={{ backgroundColor: currentAccent }}
                />
                <div
                  className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full opacity-20 blur-3xl transition-colors duration-500"
                  style={{ backgroundColor: currentAccent }}
                />
                <div className="relative flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                    <Palette size={22} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-extrabold">Apariencia</h1>
                    <p className="mt-1 text-sm text-slate-300">
                      Personaliza la paleta de colores y el comportamiento visual del sistema para adaptarlo a tus
                      preferencias.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tema del sistema */}
              <section className="mb-10">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Tema del Entorno de Trabajo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-10 mt-6">
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

              {/* Color personalizado */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Color personalizado</h3>
                {(() => {
                  const previewAccent = draftPrimaryValid ? draftPrimary : customColor;
                  const previewSecondary = draftSecondaryValid ? draftSecondary : customSecondary;
                  const previewSidebarBg = draftSidebarValid ? draftSidebar : customSidebar;
                  const previewIsDark = pickSidebarStyle(previewSidebarBg) === 'dark';
                  const previewSidebarBorder = autoSidebarBorder(previewSidebarBg, previewIsDark ? 'dark' : 'light');
                  const previewBars = previewIsDark
                    ? ['#374151', previewAccent, previewSecondary, '#4b5563', '#374151']
                    : ['#e2e8f0', previewAccent, previewSecondary, '#f1f5f9', '#e2e8f0'];
                  return (
                    <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
                      <div className="flex flex-1 flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div>
                          <p className="text-sm font-bold text-slate-800">Elige tus propios colores</p>
                          <p className="mt-0.5 text-xs text-slate-500">Primario, secundario y barra lateral — se aplican al instante en toda la aplicación.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <ColorField
                            label="Primario (acentos)"
                            value={draftPrimary}
                            onChange={setDraftPrimary}
                            onCommit={(v) => setCustomColors({ primary: v })}
                            valid={draftPrimaryValid}
                          />
                          <ColorField
                            label="Secundario (insignias)"
                            value={draftSecondary}
                            onChange={setDraftSecondary}
                            onCommit={(v) => setCustomColors({ secondary: v })}
                            valid={draftSecondaryValid}
                          />
                          <ColorField
                            label="Barra lateral"
                            value={draftSidebar}
                            onChange={setDraftSidebar}
                            onCommit={(v) => setCustomColors({ sidebar: v })}
                            valid={draftSidebarValid}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-400">
                          {isCustomInUse ? 'En uso' : allDraftsValid ? 'Pulsa Intro en cada campo, o haz clic en la vista previa para aplicar los tres' : 'Formato: #RRGGBB'}
                        </span>
                      </div>
                      <div className="w-full lg:w-72 lg:shrink-0">
                        <PaletteCard
                          p={{
                            id: 'custom',
                            name: 'Tu combinación',
                            description: `${previewAccent.toUpperCase()} · ${previewSecondary.toUpperCase()}`,
                            sidebar: previewSidebarBg,
                            sidebarBorder: previewSidebarBorder,
                            accent: previewAccent,
                            secondary: previewSecondary,
                            bg: '#f8fafc',
                            bars: previewBars,
                          }}
                          active={isCustomInUse}
                          onClick={() => { if (allDraftsValid) setCustomColors({ primary: draftPrimary, secondary: draftSecondary, sidebar: draftSidebar }); }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </section>
            </>
          ) : activeSection === 'manual' ? (
            <ManualPanel />
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
