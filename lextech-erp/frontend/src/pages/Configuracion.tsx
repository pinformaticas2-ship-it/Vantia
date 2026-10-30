import { startGoogleDriveConnect } from '../lib/googleDriveConnect';
import { startDropboxConnect } from '../lib/dropboxConnect';
import { DriveLogo, DropboxLogo } from '../components/StorageStatusIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, SlidersHorizontal, UserRound } from 'lucide-react';
import { AlertTriangle, Bell, BellOff, BellRing, BookOpen, Building2, Camera, Check, ChevronDown, Cloud, Crown, Facebook, Gavel, History, Info, Instagram, KeyRound, LifeBuoy, Link2, Loader2, Lock, LockKeyhole, MessageCircle, Clock3, Mail as MailIcon, Phone, Palette, Plug, Plus, Settings, ShieldCheck, Sparkles, Trash2, UsersRound, X, Zap } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, UserProfile } from '@clerk/clerk-react';
import { useTheme, AppTheme } from '../lib/ThemeContext';
import { pickSidebarStyle, autoSidebarBorder, muteSidebarColor } from '../lib/themeCss';
import { apiFetch, resolveUploadUrl, setActiveOrganizacionId } from '../lib/api';
import { useOrganizacion, OrgRol, Modulo, NivelAcceso } from '../lib/useOrganizacion';
import ManualPanel from './ManualPanel';
import AutomatizacionesPanel from './AutomatizacionesPanel';
import SkillsPanel from './SkillsPanel';
import PlantillasNubeConfig from '../components/PlantillasNubeConfig';
import Trazabilidad from './Trazabilidad';
import ComoFunciona from '../components/ComoFunciona';
import { PerfilPanel, PreferenciasTrabajoPanel, PrivacidadPanel, SelectorModo, SelectorTexto, MisDatosPanel, AyudaPanel, IntegracionesPropias } from '../components/AjustesPaneles';
import { usePreferencias, esOscuro, useAparienciaClerk } from '../lib/preferencias';
import { usePushNotifications } from '../lib/usePushNotifications';
import { TikTokIcon } from '../components/TikTokPanel';

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

const SECCIONES_VALIDAS: string[] = ['apariencia', 'perfil', 'preferencias', 'manual', 'misdatos', 'ayuda', 'notificaciones', 'despacho', 'seguridad', 'integraciones', 'automatizaciones', 'skills', 'trazabilidad', 'privacidad', 'usuarios'];
type SectionKey = 'apariencia' | 'perfil' | 'preferencias' | 'manual' | 'misdatos' | 'ayuda' | 'notificaciones' | 'despacho' | 'seguridad' | 'integraciones' | 'automatizaciones' | 'skills' | 'trazabilidad' | 'privacidad' | 'usuarios';

// 14/10/2026: Ajustes en dos grupos -- lo tuyo (Mi cuenta) y lo del despacho.
const SECCIONES_CUENTA: { key: SectionKey; label: string; icon: any }[] = [
  { key: 'apariencia',    label: 'Apariencia',               icon: Palette },
  { key: 'perfil',        label: 'Mi perfil',                icon: UserRound },
  { key: 'preferencias',  label: 'Preferencias de trabajo',  icon: SlidersHorizontal },
  { key: 'notificaciones', label: 'Notificaciones',          icon: Bell },
  { key: 'seguridad',     label: 'Seguridad',                icon: ShieldCheck },
  { key: 'misdatos',      label: 'Mis datos y privacidad',   icon: Lock },
  { key: 'manual',        label: 'Manual de usuario',        icon: BookOpen },
  { key: 'ayuda',         label: 'Ayuda e información',      icon: Info },
];
const SECCIONES_DESPACHO: { key: SectionKey; label: string; icon: any; soloGestor?: boolean }[] = [
  { key: 'despacho',        label: 'Mi Despacho',          icon: Building2 },
  { key: 'integraciones',   label: 'Integraciones',        icon: Plug },
  { key: 'automatizaciones', label: 'Automatizaciones',    icon: Zap, soloGestor: true },
  { key: 'skills',          label: 'Skills de la IA',      icon: Sparkles },
  { key: 'trazabilidad',    label: 'Trazabilidad',         icon: History },
  { key: 'privacidad',      label: 'Datos y privacidad',   icon: Database, soloGestor: true },
  { key: 'usuarios',        label: 'Gestión de Usuarios',  icon: UsersRound, soloGestor: true },
];

const OTHER_SECTIONS: { key: SectionKey; label: string; desc: string; icon: any }[] = [
  { key: 'notificaciones', label: 'Notificaciones',        desc: 'Configura alertas por email y avisos emergentes del sistema.',            icon: Bell },
  { key: 'despacho',       label: 'Mi Despacho',           desc: 'Información fiscal del despacho, logotipo y textos legales para facturas.', icon: Building2 },
  { key: 'seguridad',      label: 'Seguridad',             desc: 'Cambio de contraseñas, autenticación en dos pasos (2FA) y sesiones activas.', icon: ShieldCheck },
  { key: 'integraciones',  label: 'Integraciones',         desc: 'Conecta Vantia con herramientas y servicios externos.',                    icon: Plug },
  { key: 'automatizaciones', label: 'Automatizaciones',    desc: 'Flujos automáticos de la organización, como las vistas recibidas por correo.', icon: Zap },
  { key: 'skills',         label: 'Skills de la IA',       desc: 'Instrucciones del despacho que la IA sigue al redactar documentos.',     icon: Sparkles },
  // Antes en el menú lateral (14/10/2026): es auditoría, no trabajo del día a día.
  { key: 'trazabilidad',   label: 'Trazabilidad',          desc: 'Historial de accesos y acciones de todo el despacho.',                      icon: History },
  { key: 'usuarios',       label: 'Gestión de Usuarios',   desc: 'Administra los usuarios y permisos del despacho.',                          icon: UsersRound },
];

function PaletteCard({ p, active, onClick }: {
  p: typeof PALETTES[0];
  active: boolean;
  onClick: () => void;
}) {
  // En modo oscuro, la vista previa enseña la versión oscura del tema.
  const { prefs } = usePreferencias();
  const oscuro = esOscuro(prefs.modo);
  // Mismos grises neutros que el modo oscuro de la app (lib/temasExtra.css).
  const panel = oscuro ? { backgroundColor: '#1a1d21', border: '1px solid #2c3036' } : { backgroundColor: '#ffffff', border: '1px solid #e2e8f0' };
  const fondo = oscuro ? '#121417' : p.bg;
  const barraLateral = oscuro ? '#1a1d21' : p.sidebar;
  const bordeLateral = oscuro ? '#2c3036' : p.sidebarBorder;
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
      <div className="h-40 flex overflow-hidden select-none pointer-events-none transition-transform duration-500 group-hover:scale-[1.03]" style={{ backgroundColor: fondo }}>
        {/* Sidebar */}
        <div
          className="w-16 h-full flex flex-col pt-3 px-2 gap-1.5 shrink-0"
          style={{ backgroundColor: barraLateral, borderRight: `1px solid ${bordeLateral}` }}
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
        <div className="flex-1 p-3 space-y-2" style={{ backgroundColor: fondo }}>
          {/* Topbar */}
          <div
            className="rounded-lg h-7 flex items-center px-2 gap-2"
            style={panel}
          >
            <div className="rounded h-2 flex-1" style={{ backgroundColor: oscuro ? '#2c3036' : '#e2e8f0' }} />
            <div className="rounded h-4 w-10" style={{ backgroundColor: p.accent }} />
          </div>
          {/* Cards row */}
          <div className="flex gap-2">
            {[0.9, 0.7, 1].map((w, i) => (
              <div
                key={i}
                className="flex-1 rounded-xl p-2 space-y-1"
                style={panel}
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
            style={panel}
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
        <span className={`shrink-0 text-[11px] font-bold transition-colors ${active ? '' : 'text-slate-300 group-hover:text-slate-400'}`} style={active ? { color: oscuro ? `color-mix(in srgb, ${p.accent} 55%, white)` : p.accent } : undefined}>
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
          <div className="peligro h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
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
                <p className="peligro text-xs font-bold uppercase tracking-wider text-red-700 mb-2">Se eliminará permanentemente</p>
                <ul className="peligro space-y-1 text-sm text-red-800">
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

          {error && <p className="text-xs text-rose-600">{error}</p>}
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
  const [telefono, setTelefono] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [web, setWeb] = useState('');
  const [textoLegalFacturas, setTextoLegalFacturas] = useState('');
  const [welcomeEmailSubject, setWelcomeEmailSubject] = useState('');
  const [welcomeEmailBody, setWelcomeEmailBody] = useState('');
  const [welcomeEmailSignature, setWelcomeEmailSignature] = useState('');
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
    setTelefono(organizacion.telefono || '');
    setEmailContacto(organizacion.emailContacto || '');
    setWeb(organizacion.web || '');
    setTextoLegalFacturas(organizacion.textoLegalFacturas || '');
    setWelcomeEmailSubject(organizacion.clientWelcomeEmailSubject || '');
    setWelcomeEmailBody(organizacion.clientWelcomeEmailBody || '');
    setWelcomeEmailSignature(organizacion.clientWelcomeEmailSignature || '');
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
          telefono: telefono.trim(),
          emailContacto: emailContacto.trim(),
          web: web.trim(),
          textoLegalFacturas: textoLegalFacturas.trim(),
          clientWelcomeEmailSubject: welcomeEmailSubject.trim(),
          clientWelcomeEmailBody: welcomeEmailBody.trim(),
          clientWelcomeEmailSignature: welcomeEmailSignature.trim(),
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
                    placeholder="Calle, número, CP Población (Provincia)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300"
                  />
                </div>
              </div>
              {/* Contacto del despacho: también sale en las plantillas (teléfono, correo, web) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                  ['Teléfono', telefono, setTelefono, '971 00 00 00', 'tel'],
                  ['Correo electrónico', emailContacto, setEmailContacto, 'despacho@ejemplo.es', 'email'],
                  ['Web', web, setWeb, 'www.despacho.es', 'text'],
                ] as const).map(([label, valor, set, ph, tipo]) => (
                  <div key={label}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                    <input type={tipo} value={valor} onChange={(e) => set(e.target.value)} placeholder={ph}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300" />
                  </div>
                ))}
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
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Correo de bienvenida al cliente</p>
                <p className="text-xs text-slate-400 mb-3">
                  Se envía automáticamente al dar de alta un cliente (manual o por formulario con enlace). Deja los campos vacíos para usar el mensaje por defecto. Puedes usar <code className="bg-slate-100 px-1 py-0.5 rounded">{'{nombre}'}</code> para insertar el nombre del cliente.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Asunto</label>
                    <input
                      value={welcomeEmailSubject}
                      onChange={(e) => setWelcomeEmailSubject(e.target.value)}
                      placeholder="Hemos recibido tus datos"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mensaje</label>
                    <textarea
                      value={welcomeEmailBody}
                      onChange={(e) => setWelcomeEmailBody(e.target.value)}
                      rows={4}
                      placeholder={`Hola {nombre},\n\nHemos registrado correctamente tus datos en nuestro despacho. En breve nos pondremos en contacto contigo para los siguientes pasos.\n\nUn saludo.`}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Firma (opcional)</label>
                    <textarea
                      value={welcomeEmailSignature}
                      onChange={(e) => setWelcomeEmailSignature(e.target.value)}
                      rows={3}
                      placeholder={`Despacho Vantia Legis\nAv. Ejemplo, 1 — 28001 Madrid\nTel. 900 000 000`}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300 resize-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">Se añade al final del correo, debajo del mensaje.</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs text-slate-400">
              <Lock size={14} className="shrink-0" />
              Solo el propietario o un administrador pueden ver y editar el NIF/CIF, la dirección fiscal y el texto legal de esta organización.
            </div>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
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
                  <button type="button" onClick={clearNewLogo} className="peligro inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 mt-1">
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
  const [transferTarget, setTransferTarget] = useState<Miembro | null>(null);
  const [permisosTarget, setPermisosTarget] = useState<Miembro | null>(null);

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

  // Ceder la propiedad recarga toda la página a propósito (no solo la lista
  // de miembros): tu propio rol pasa de propietario a admin, y eso afecta a
  // cosas que viven fuera de este panel (el menú lateral, qué módulos ves...).
  const doTransfer = async (confirmNombre: string): Promise<{ ok: boolean; error?: string }> => {
    if (!transferTarget) return { ok: false, error: 'Selecciona a quién transferir.' };
    const data = await apiFetch('/api/organizacion/transferir-propiedad', {
      method: 'POST', getToken,
      body: JSON.stringify({ toMemberId: transferTarget.id, confirmNombre }),
    });
    if (data?.success === false) return { ok: false, error: data.error };
    return { ok: true };
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
              <option value="soporte">Soporte técnico</option>
              <option value="admin">Admin</option>
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
          {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
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
                  {/* "Propietario" ya no es una opción más del desplegable: es un
                      cargo único que se cede aparte (botón de la corona), nunca se
                      elige al vuelo -- ver transferTarget más abajo. */}
                  {m.rol === 'propietario' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full">
                      <Crown size={12} /> Propietario
                    </span>
                  ) : myRol === 'propietario' ? (
                    <select
                      value={m.rol}
                      onChange={(e) => changeRol(m.id, e.target.value as OrgRol)}
                      disabled={busyId === m.id}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-red-300 bg-white capitalize"
                    >
                      <option value="miembro">Miembro</option>
                      <option value="soporte">Soporte técnico</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 capitalize px-2.5 py-1 bg-slate-100 rounded-full">{m.rol}</span>
                  )}

                  {myRol === 'propietario' && m.rol !== 'propietario' && (
                    <button
                      onClick={() => setTransferTarget(m)}
                      disabled={busyId === m.id}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
                      title="Transferir la propiedad a esta persona"
                    >
                      <Crown size={14} />
                    </button>
                  )}

                  {/* Excepciones de permisos solo para este miembro (p.ej. un
                      admin que no debe ver Tesorería) -- solo el propietario
                      puede tocarlas, el propietario mismo no admite excepciones. */}
                  {myRol === 'propietario' && m.rol !== 'propietario' && (
                    <button
                      onClick={() => setPermisosTarget(m)}
                      disabled={busyId === m.id}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-[#ab0433] hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Permisos individuales de este miembro"
                    >
                      <Lock size={14} />
                    </button>
                  )}

                  {/* Propietario puede quitar a cualquiera (salvo a sí mismo, ver
                      abajo); admin solo a miembro/soporte -- no a otro admin ni al
                      propietario (el backend vuelve a comprobarlo igual, esto es
                      solo para no ofrecer un botón que luego el servidor rechace). */}
                  {m.rol !== 'propietario' && (myRol === 'propietario' || (myRol === 'admin' && m.rol !== 'admin')) && (
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

      {canManage && <RolesPermisosPanel editable={myRol === 'propietario'} />}

      {transferTarget && (
        <TransferOwnershipModal
          organizacionNombre={organizacion?.nombre || ''}
          targetNombre={transferTarget.nombre}
          onClose={() => setTransferTarget(null)}
          onDone={() => { window.location.reload(); }}
          transfer={doTransfer}
        />
      )}

      {permisosTarget && (
        <MemberPermisosModal
          miembro={permisosTarget}
          onClose={() => setPermisosTarget(null)}
        />
      )}
    </>
  );
}

// Modal de "ceder la propiedad" -- mismo patrón de "escribe el nombre de la
// organización para confirmar" que ya usa el borrado de la organización
// (DeleteOrganizacionModal), a propósito: es la acción más importante de
// toda esta pantalla, no debería costar menos confirmarla que borrar algo.
function TransferOwnershipModal({ organizacionNombre, targetNombre, onClose, onDone, transfer }: {
  organizacionNombre: string;
  targetNombre: string;
  onClose: () => void;
  onDone: () => void;
  transfer: (confirmNombre: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [typedNombre, setTypedNombre] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameMatches = typedNombre.trim() === organizacionNombre.trim();
  const canConfirm = nameMatches && confirmChecked && !busy;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true); setError('');
    const res = await transfer(typedNombre.trim());
    if (res.ok) onDone();
    else { setError(res.error || 'No se pudo transferir la propiedad.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-3.5 bg-amber-50/60">
          <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <Crown size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">Transferir propiedad</h2>
            <p className="text-sm text-slate-500 mt-0.5">Dejarás de ser propietario y pasarás a administrador.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
            <strong>{targetNombre}</strong> pasará a ser el propietario de <strong>{organizacionNombre}</strong>, con control total:
            podrá gestionar la facturación, eliminar la organización y cambiar el rol de cualquier miembro, incluido el tuyo.
            Solo puede haber un propietario a la vez.
          </div>

          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-300"
            />
            Entiendo lo que implica y quiero ceder la propiedad.
          </label>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Escribe <span className="text-slate-800 normal-case">{organizacionNombre}</span> para confirmar
            </label>
            <input
              value={typedNombre}
              onChange={(e) => setTypedNombre(e.target.value)}
              placeholder={organizacionNombre}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-300"
              autoFocus
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Transferir propiedad
          </button>
        </div>
      </div>
    </div>
  );
}

// Excepciones de permisos para UN miembro concreto -- lo que ya le da su rol
// (Roles y permisos, más arriba), con la posibilidad de hacer una excepción
// módulo a módulo solo para esta persona (p.ej. un admin sin acceso a
// Tesorería). Mismo patrón visual que RolesPermisosPanel, en un modal.
function MemberPermisosModal({ miembro, onClose }: { miembro: Miembro; onClose: () => void }) {
  const { getToken } = useAuth();
  const [modulos, setModulos] = useState<{ id: Modulo; label: string }[]>([]);
  const [matriz, setMatriz] = useState<Record<Modulo, NivelAcceso> | null>(null);
  const [personalizados, setPersonalizados] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingModulo, setSavingModulo] = useState<Modulo | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/organizacion/miembros/${miembro.id}/permisos`, { getToken });
      if (data?.success) {
        setModulos(data.data.modulos || []);
        setMatriz(data.data.matriz || null);
        setPersonalizados(data.data.personalizados || []);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, miembro.id]);

  useEffect(() => { void load(); }, [load]);

  const changeNivel = async (modulo: Modulo, nivel: NivelAcceso) => {
    if (!matriz) return;
    const prev = matriz[modulo];
    setMatriz({ ...matriz, [modulo]: nivel }); // optimista
    setSavingModulo(modulo);
    try {
      const data = await apiFetch(`/api/organizacion/miembros/${miembro.id}/permisos`, {
        method: 'PUT', getToken, body: JSON.stringify({ modulo, nivel }),
      });
      if (data?.success === false) throw new Error(data.error);
      setMatriz(data.data.matriz);
      setPersonalizados(data.data.personalizados);
    } catch {
      setMatriz((m) => (m ? { ...m, [modulo]: prev } : m)); // revertir si falla
    } finally {
      setSavingModulo(null);
    }
  };

  const resetAll = async () => {
    setResetting(true);
    try {
      const data = await apiFetch(`/api/organizacion/miembros/${miembro.id}/permisos`, { method: 'DELETE', getToken });
      if (data?.success) { setMatriz(data.data.matriz); setPersonalizados([]); }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-red-50 text-[#ab0433] flex items-center justify-center shrink-0">
            <Lock size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">Permisos individuales</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{miembro.nombre} · <span className="capitalize">{miembro.rol}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={16} /></button>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs text-slate-500 mb-4">
            Por defecto tiene lo que le da su rol ({miembro.rol}). Cambia un módulo aquí para hacer una excepción solo para
            esta persona — por ejemplo, un admin que no debe ver Tesorería.
          </p>
          {loading || !matriz ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" size={22} /></div>
          ) : (
            <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1 -mr-1">
              {modulos.map((m) => {
                const isCustom = personalizados.includes(m.id);
                return (
                  <div key={m.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${isCustom ? 'bg-red-50/60' : ''}`}>
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-2 min-w-0">
                      <span className="truncate">{m.label}</span>
                      {isCustom && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#ab0433] bg-red-100 px-1.5 py-0.5 rounded-full">
                          Personalizado
                        </span>
                      )}
                    </span>
                    <select
                      value={matriz[m.id]}
                      disabled={savingModulo === m.id}
                      onChange={(e) => changeNivel(m.id, e.target.value as NivelAcceso)}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-red-300 bg-white disabled:opacity-50"
                    >
                      {(['ninguno', 'lectura', 'edicion'] as NivelAcceso[]).map((n) => (
                        <option key={n} value={n}>{NIVEL_LABEL[n]}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={resetAll}
            disabled={resetting || personalizados.length === 0}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {resetting ? 'Restableciendo…' : `Quitar excepciones (${personalizados.length})`}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const NIVEL_LABEL: Record<NivelAcceso, string> = { ninguno: 'Ninguno', lectura: 'Solo ver', edicion: 'Editar' };
const ROLES_EDITABLES: { rol: OrgRol; label: string }[] = [
  { rol: 'admin',    label: 'Admin' },
  { rol: 'miembro',  label: 'Miembro' },
  { rol: 'soporte',  label: 'Soporte técnico' },
];

// Matriz módulo × rol, editable solo por el propietario. Solo guarda las
// celdas que se desvían de lo de fábrica (ver DEFAULT_PERMISSIONS en el
// backend) -- por eso al abrir esto por primera vez ya sale todo relleno con
// el comportamiento actual, no vacío.
function RolesPermisosPanel({ editable }: { editable: boolean }) {
  const { getToken } = useAuth();
  const [modulos, setModulos] = useState<{ id: Modulo; label: string }[]>([]);
  const [matriz, setMatriz] = useState<Record<OrgRol, Record<Modulo, NivelAcceso>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/organizacion/permisos', { getToken });
      if (data?.success) { setModulos(data.data.modulos || []); setMatriz(data.data.matriz || null); }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const changeNivel = async (rol: OrgRol, modulo: Modulo, nivel: NivelAcceso) => {
    if (!matriz) return;
    const cellKey = `${rol}:${modulo}`;
    const prev = matriz[rol][modulo];
    setMatriz({ ...matriz, [rol]: { ...matriz[rol], [modulo]: nivel } }); // optimista
    setSavingCell(cellKey);
    try {
      const data = await apiFetch('/api/organizacion/permisos', { method: 'PUT', getToken, body: JSON.stringify({ rol, modulo, nivel }) });
      if (data?.success === false) throw new Error(data.error);
    } catch {
      setMatriz((m) => m ? { ...m, [rol]: { ...m[rol], [modulo]: prev } } : m); // revertir si falla
    } finally {
      setSavingCell(null);
    }
  };

  return (
    <section className="mt-8">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-200 pb-2">Roles y permisos</h3>
      <p className="text-xs text-slate-500 mb-4 max-w-2xl">
        Qué puede ver y editar cada rol en cada módulo. El propietario y los administradores siempre tienen acceso completo a todo;
        aquí se ajusta lo que ven Miembro y Soporte técnico. El rol "Soporte técnico" está pensado para quien administra el sistema
        sin ser abogado del despacho: por defecto no ve Clientes ni Expedientes, para no depender de su discreción el secreto profesional.
      </p>
      {loading || !matriz ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" size={22} /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left font-semibold text-slate-500 text-xs uppercase tracking-wide px-4 py-3">Módulo</th>
                {ROLES_EDITABLES.map((r) => (
                  <th key={r.rol} className="text-left font-semibold text-slate-500 text-xs uppercase tracking-wide px-4 py-3">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {modulos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{m.label}</td>
                  {ROLES_EDITABLES.map((r) => {
                    const cellKey = `${r.rol}:${m.id}`;
                    return (
                      <td key={r.rol} className="px-4 py-2">
                        <select
                          value={matriz[r.rol][m.id]}
                          disabled={!editable || savingCell === cellKey}
                          onChange={(e) => changeNivel(r.rol, m.id, e.target.value as NivelAcceso)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-red-300 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          {(['ninguno', 'lectura', 'edicion'] as NivelAcceso[]).map((n) => (
                            <option key={n} value={n}>{NIVEL_LABEL[n]}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!editable && <p className="text-xs text-slate-400 mt-2">Solo el propietario puede cambiar estos permisos.</p>}
    </section>
  );
}

function SeguridadPanel() {
  const navigate = useNavigate();
  const apariencia = useAparienciaClerk({
    elements: {
      formButtonPrimary: 'bg-[#ab0433] hover:bg-[#8f0329] text-sm normal-case',
      badge: 'bg-red-50 text-[#ab0433]',
    },
    variables: { colorPrimary: '#ab0433' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">
          Cuenta y autenticación
        </h3>
        <p className="text-xs text-slate-500 max-w-2xl mb-5">
          Contraseña, verificación en dos pasos (2FA) y sesiones activas se gestionan aquí mismo —
          es la pantalla de seguridad de Clerk, el proveedor de acceso de Vantia, así que los cambios
          son inmediatos y no hace falta ningún desarrollo aparte para mantenerla al día.
        </p>
        <div className="mx-auto max-w-3xl flex justify-center">
          <UserProfile
            routing="hash"
            appearance={apariencia}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
          Actividad de la cuenta
        </h3>
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <History size={20} className="text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Historial de accesos y acciones</p>
            <p className="text-xs text-slate-500 mt-0.5 max-w-md">
              Inicios de sesión, IP y dispositivo de cada acceso, y el registro de acciones de todo el
              despacho, están en Trazabilidad.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/config?section=trazabilidad')}
            className="shrink-0 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Ver Trazabilidad
          </button>
        </div>
      </div>
    </div>
  );
}

interface WhatsAppIntegrationStatus {
  configured: boolean;
  phoneNumberIdConfigured: boolean;
  accessTokenConfigured: boolean;
  verifyTokenConfigured: boolean;
  webhookBaseUrlConfigured: boolean;
  webhookUrl: string;
}

// Todas las conexiones con canales/servicios externos se gestionan desde
// aquí en vez de repartidas dentro de cada módulo (antes WhatsApp tenía su
// propio formulario de credenciales escondido en su pantalla de conexión).
// Instagram y Facebook quedan como fichas informativas -- comparten la
// misma app de Meta que WhatsApp, pero no hay ninguna cuenta ni permiso de
// mensajería todavía (ver [[project_vantia_pending_user_actions]]).
function IntegracionesPanel({ canManage }: { canManage: boolean }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  // TikTok: la cuenta se conecta aquí y se usa desde Comunicación Externa.
  const [tiktok, setTiktok] = useState<{ configured: boolean; connected: boolean; account?: { displayName?: string } } | null>(null);
  const [tiktokConnecting, setTiktokConnecting] = useState(false);
  const [tiktokError, setTiktokError] = useState('');
  useEffect(() => {
    apiFetch('/api/tiktok/status', { getToken })
      .then((d) => { if (d?.success) setTiktok(d.data); })
      .catch(() => { /* sin estado: la tarjeta queda como pendiente */ });
  }, [getToken]);
  const connectTiktok = async () => {
    setTiktokConnecting(true); setTiktokError('');
    try {
      const d = await apiFetch('/api/tiktok/connect', { method: 'POST', getToken });
      if (!d?.success || !d.data?.url) throw new Error(d?.error || 'No se pudo iniciar la conexión con TikTok.');
      window.location.href = d.data.url;
    } catch (e: any) {
      setTiktokError(e.message || 'No se pudo iniciar la conexión con TikTok.');
      setTiktokConnecting(false);
    }
  };
  const { organizacion, reload: reloadOrganizacion } = useOrganizacion();
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);
  const driveConnected = Boolean(organizacion?.googleDriveConnected);

  const connectDrive = () => {
    setDriveError('');
    startGoogleDriveConnect({
      getToken,
      onError: setDriveError,
      onBusy: setDriveConnecting,
      onConnected: () => window.location.reload(),
    });
  };

  const disconnectDrive = async () => {
    setDisconnectingDrive(true); setDriveError('');
    try {
      const data = await apiFetch('/api/organizacion/drive', { method: 'DELETE', getToken });
      if (data?.success === false) throw new Error(data.error);
      window.location.reload();
    } catch (e: any) {
      setDriveError(e.message || 'No se pudo desconectar Google Drive');
      setDisconnectingDrive(false);
    }
  };

  const [dropboxConnecting, setDropboxConnecting] = useState(false);
  const [dropboxError, setDropboxError] = useState('');
  const [disconnectingDropbox, setDisconnectingDropbox] = useState(false);
  const dropboxConnected = Boolean(organizacion?.dropboxConnected);

  const connectDropbox = () => {
    setDropboxError('');
    startDropboxConnect({
      getToken,
      onError: setDropboxError,
      onBusy: setDropboxConnecting,
      onConnected: () => window.location.reload(),
    });
  };

  const disconnectDropbox = async () => {
    setDisconnectingDropbox(true); setDropboxError('');
    try {
      const data = await apiFetch('/api/organizacion/dropbox', { method: 'DELETE', getToken });
      if (data?.success === false) throw new Error(data.error);
      window.location.reload();
    } catch (e: any) {
      setDropboxError(e.message || 'No se pudo desconectar Dropbox');
      setDisconnectingDropbox(false);
    }
  };

  // ── Almacenamiento de documentos: automático vs preguntar cada vez ───────
  const [storageMode, setStorageMode] = useState<'auto' | 'ask'>(organizacion?.documentStorageMode || 'auto');
  const [storageDefault, setStorageDefault] = useState<'drive' | 'dropbox'>(organizacion?.documentStorageDefaultProvider || 'drive');
  const [savingStorageSettings, setSavingStorageSettings] = useState(false);
  const [storageSettingsError, setStorageSettingsError] = useState('');
  const [storageSettingsSaved, setStorageSettingsSaved] = useState(false);
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const providerPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showProviderPicker) return;
    const h = (e: MouseEvent) => { if (providerPickerRef.current && !providerPickerRef.current.contains(e.target as Node)) setShowProviderPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showProviderPicker]);
  const providerLabel = (p: 'drive' | 'dropbox') => (p === 'drive' ? 'Google Drive' : 'Dropbox');
  const connectedStorageProviders = (['drive', 'dropbox'] as const).filter(p =>
    p === 'drive' ? !!organizacion?.googleDriveConnected : !!organizacion?.dropboxConnected
  );

  useEffect(() => {
    if (organizacion?.documentStorageMode) setStorageMode(organizacion.documentStorageMode);
    if (organizacion?.documentStorageDefaultProvider) setStorageDefault(organizacion.documentStorageDefaultProvider);
  }, [organizacion?.documentStorageMode, organizacion?.documentStorageDefaultProvider]);

  // Si la nube marcada como "por defecto" deja de estar conectada (o nunca
  // lo estuvo), no tiene sentido seguir ofreciéndola/mostrándola -- se
  // corrige sola a la primera que sí esté conectada.
  useEffect(() => {
    if (!organizacion || connectedStorageProviders.length === 0) return;
    const stored = organizacion.documentStorageDefaultProvider || 'drive';
    if (!connectedStorageProviders.includes(stored)) {
      const corrected = connectedStorageProviders[0];
      setStorageDefault(corrected);
      saveStorageSettings(organizacion.documentStorageMode || 'auto', corrected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacion?.googleDriveConnected, organizacion?.dropboxConnected]);

  const saveStorageSettings = async (mode: 'auto' | 'ask', defaultProvider: 'drive' | 'dropbox') => {
    setSavingStorageSettings(true); setStorageSettingsError(''); setStorageSettingsSaved(false);
    try {
      const data = await apiFetch('/api/organizacion/document-storage-settings', {
        method: 'PUT', getToken, body: JSON.stringify({ mode, defaultProvider }),
      });
      if (data?.success === false) throw new Error(data.error);
      await reloadOrganizacion();
      setStorageSettingsSaved(true);
      setTimeout(() => setStorageSettingsSaved(false), 2000);
    } catch (e: any) {
      setStorageSettingsError(e.message || 'No se pudo guardar.');
    } finally {
      setSavingStorageSettings(false);
    }
  };

  const [status, setStatus] = useState<WhatsAppIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    accessToken: '', phoneNumberId: '', verifyToken: '', webhookBaseUrl: '', graphVersion: 'v23.0', businessAccountId: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusData, configData] = await Promise.all([
        apiFetch('/api/whatsapp/status', { getToken }),
        apiFetch('/api/whatsapp/config', { getToken }),
      ]);
      if (statusData?.success) setStatus(statusData.data);
      if (configData?.success) {
        setForm((f) => ({
          ...f,
          phoneNumberId: configData.data?.phoneNumberId || '',
          verifyToken: configData.data?.verifyToken || '',
          webhookBaseUrl: configData.data?.webhookBaseUrl || '',
          graphVersion: configData.data?.graphVersion || 'v23.0',
          businessAccountId: configData.data?.businessAccountId || '',
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const data = await apiFetch('/api/whatsapp/config', { method: 'PUT', getToken, body: JSON.stringify(form) });
      if (data?.success === false) throw new Error(data.error);
      setStatus(data.data);
      setMessage('Credenciales guardadas.');
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setError(null); setMessage(null);
    try {
      const data = await apiFetch('/api/whatsapp/config/test', { method: 'POST', getToken });
      if (data?.success === false) throw new Error(data.error);
      setMessage(`Conexión verificada: ${data.data?.verifiedName || data.data?.displayPhoneNumber || 'número validado'}.`);
    } catch (e: any) {
      setError(e.message || 'No se pudo verificar la conexión con WhatsApp Business.');
    } finally {
      setTesting(false);
    }
  };

  const waConnected = Boolean(status?.configured);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-1">Integraciones</h1>
        <p className="text-sm text-slate-500">Conecta Vantia con canales de mensajería y servicios externos.</p>
      </div>

      {/* Correo y Quipu: se configuran en su módulo; aquí se ve su estado (14/10/2026). */}
      <IntegracionesPropias />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <MessageCircle size={20} className="text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">WhatsApp</p>
                <p className="text-xs text-slate-400 truncate">WhatsApp Business Cloud API</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${waConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {loading ? '…' : waConnected ? 'Conectado' : 'Pendiente'}
            </span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            Habla con tus clientes por WhatsApp desde Comunicación Externa, sin salir del ERP.
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Link2 size={13} /> {waConnected ? 'Gestionar' : 'Conectar'}
            </button>
          ) : (
            <p className="mt-4 text-[11px] text-slate-400">Solo el propietario o un administrador pueden configurarlo.</p>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400">
                <Instagram size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Instagram</p>
                <p className="text-xs text-slate-400 truncate">Mensajes directos</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">Próximamente</span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            Requiere una cuenta de Instagram Business/Creator añadida como probadora en la app de Meta del despacho.
          </p>
          <button type="button" disabled className="mt-4 inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-100 px-4 py-2 text-xs font-bold text-slate-300">
            <Link2 size={13} /> Conectar
          </button>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                <Facebook size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Facebook</p>
                <p className="text-xs text-slate-400 truncate">Messenger de la Página</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">Próximamente</span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            Canal independiente de Instagram: mensajes de Messenger a la Página de Facebook del despacho, dentro de la
            misma bandeja de Comunicación Externa.
          </p>
          <button type="button" disabled className="mt-4 inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-100 px-4 py-2 text-xs font-bold text-slate-300">
            <Link2 size={13} /> Conectar
          </button>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black">
                <TikTokIcon size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">TikTok</p>
                <p className="text-xs text-slate-400 truncate">{tiktok?.connected && tiktok.account?.displayName ? tiktok.account.displayName : 'Vídeos y estadísticas'}</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${tiktok?.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {!tiktok ? '…' : tiktok.connected ? 'Conectado' : 'Pendiente'}
            </span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            Conecta la cuenta del despacho para ver tus vídeos con sus visualizaciones y publicar vídeos nuevos desde
            Comunicación Externa.
            {tiktok && !tiktok.configured && ' Falta configurar TikTok en el servidor.'}
          </p>
          {tiktokError && <p className="mt-2 text-[11px] text-red-600">{tiktokError}</p>}
          {tiktok?.connected ? (
            <button
              type="button"
              onClick={() => navigate('/dashboard/whatsapp?canal=tiktok')}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Link2 size={13} /> Gestionar
            </button>
          ) : canManage ? (
            <button
              type="button"
              onClick={connectTiktok}
              disabled={tiktokConnecting || !tiktok?.configured}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tiktokConnecting ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Conectar
            </button>
          ) : (
            <p className="mt-4 text-[11px] text-slate-400">Solo el propietario o un administrador pueden conectarlo.</p>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
                <DriveLogo size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Google Drive</p>
                <p className="text-xs text-slate-400 truncate">Documentos de expedientes</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${driveConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {driveConnected ? 'Conectado' : 'Pendiente'}
            </span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            El servidor no guarda los archivos de forma permanente. Con Google Drive, los documentos de cada expediente se guardan en una carpeta propia y no se pierden.
            {driveConnected && organizacion?.googleDriveEmail ? ` Cuenta: ${organizacion.googleDriveEmail}.` : ''}
          </p>
          {canManage ? (
            driveConnected ? (
              <button
                type="button"
                onClick={disconnectDrive}
                disabled={disconnectingDrive}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {disconnectingDrive ? 'Desconectando…' : 'Desconectar'}
              </button>
            ) : (
              <button
                type="button"
                onClick={connectDrive}
                disabled={driveConnecting}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <Link2 size={13} /> {driveConnecting ? 'Conectando…' : 'Conectar'}
              </button>
            )
          ) : (
            <p className="mt-4 text-[11px] text-slate-400">Solo el propietario o un administrador pueden configurarlo.</p>
          )}
          {driveError && <p className="mt-2 text-xs text-rose-600">{driveError}</p>}
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50">
                <Cloud size={20} className="text-[#0364B8]" fill="currentColor" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">OneDrive</p>
                <p className="text-xs text-slate-400 truncate">Documentos de expedientes</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">Próximamente</span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            Alternativa a Google Drive para guardar los documentos de cada expediente en tu cuenta de Microsoft.
          </p>
          <button type="button" disabled className="mt-4 inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-100 px-4 py-2 text-xs font-bold text-slate-300">
            <Link2 size={13} /> Conectar
          </button>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <DropboxLogo size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Dropbox</p>
                <p className="text-xs text-slate-400 truncate">Vinculación de cuenta</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${dropboxConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {dropboxConnected ? 'Conectado' : 'Pendiente'}
            </span>
          </div>
          <p className="mt-3 flex-1 text-xs leading-5 text-slate-500">
            Vincula tu cuenta de Dropbox. Por ahora solo conecta la cuenta -- todavía no guarda documentos de expedientes ahí (esa parte llega después).
            {dropboxConnected && organizacion?.dropboxEmail ? ` Cuenta: ${organizacion.dropboxEmail}.` : ''}
          </p>
          {canManage ? (
            dropboxConnected ? (
              <button
                type="button"
                onClick={disconnectDropbox}
                disabled={disconnectingDropbox}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {disconnectingDropbox ? 'Desconectando…' : 'Desconectar'}
              </button>
            ) : (
              <button
                type="button"
                onClick={connectDropbox}
                disabled={dropboxConnecting}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <Link2 size={13} /> {dropboxConnecting ? 'Conectando…' : 'Conectar'}
              </button>
            )
          ) : (
            <p className="mt-4 text-[11px] text-slate-400">Solo el propietario o un administrador pueden configurarlo.</p>
          )}
          {dropboxError && <p className="mt-2 text-xs text-rose-600">{dropboxError}</p>}
        </div>
      </div>

      {(organizacion?.googleDriveConnected || organizacion?.dropboxConnected) && (
        <div className="mt-4 max-w-2xl">
          <button
            type="button"
            onClick={() => setShowStorageSettings(v => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-left transition-colors hover:bg-slate-100/70"
          >
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <Settings size={13} className="shrink-0 text-slate-400" />
              Guardado de documentos:{' '}
              <span className="font-semibold text-slate-700">
                {storageMode === 'auto' ? `automático · ${storageDefault === 'drive' ? 'Google Drive' : 'Dropbox'}` : 'pregunta cada vez'}
              </span>
            </span>
            <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${showStorageSettings ? 'rotate-180' : ''}`} />
          </button>

          {showStorageSettings && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-5 animate-fade-in">
              {!canManage ? (
                <p className="text-xs text-slate-400">Solo el propietario o un administrador pueden cambiar esto.</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">A qué nube van los documentos nuevos de un expediente, cuando hay más de una conectada.</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <button
                      type="button"
                      disabled={savingStorageSettings}
                      onClick={() => { setStorageMode('auto'); saveStorageSettings('auto', storageDefault); }}
                      className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                        storageMode === 'auto' ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-800">Automático</p>
                      <p className="mt-0.5 text-xs text-slate-500">Siempre la misma nube, sin preguntar.</p>
                    </button>
                    <button
                      type="button"
                      disabled={savingStorageSettings}
                      onClick={() => { setStorageMode('ask'); saveStorageSettings('ask', storageDefault); }}
                      className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                        storageMode === 'ask' ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-800">Preguntar cada vez</p>
                      <p className="mt-0.5 text-xs text-slate-500">Al subir un documento, elige Drive, Dropbox u OneDrive.</p>
                    </button>
                  </div>
                  {storageMode === 'auto' && connectedStorageProviders.length > 1 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-600">Nube por defecto</label>
                      <div className="relative w-full max-w-xs" ref={providerPickerRef}>
                        <button
                          type="button"
                          disabled={savingStorageSettings}
                          onClick={() => setShowProviderPicker(v => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:border-slate-300 focus:outline-none focus:border-red-300 disabled:opacity-60"
                        >
                          <span className="flex items-center gap-2">
                            {storageDefault === 'drive' ? <DriveLogo size={16} /> : <DropboxLogo size={16} />}
                            {providerLabel(storageDefault)}
                          </span>
                          <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${showProviderPicker ? 'rotate-180' : ''}`} />
                        </button>
                        {showProviderPicker && (
                          <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg animate-fade-in">
                            {connectedStorageProviders.map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => { setStorageDefault(p); saveStorageSettings('auto', p); setShowProviderPicker(false); }}
                                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                  storageDefault === p ? 'bg-red-50 font-semibold text-red-700' : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  {p === 'drive' ? <DriveLogo size={16} /> : <DropboxLogo size={16} />}
                                  {providerLabel(p)}
                                </span>
                                {storageDefault === p && <Check size={14} />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Si la elegida deja de estar conectada, se usa la que sí lo esté; si ninguna lo está, se guarda solo en el servidor.
                      </p>
                    </div>
                  )}
                  {storageMode === 'auto' && connectedStorageProviders.length === 1 && (
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      {connectedStorageProviders[0] === 'drive' ? <DriveLogo size={16} /> : <DropboxLogo size={16} />}
                      Se guardará en <span className="font-semibold text-slate-700">{providerLabel(connectedStorageProviders[0])}</span>, tu única nube conectada.
                    </p>
                  )}
                  {storageSettingsError && <p className="text-xs text-rose-600">{storageSettingsError}</p>}
                  {storageSettingsSaved && <p className="text-xs text-emerald-600">Guardado.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && canManage && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pb-8 pt-[10vh]" onClick={() => setExpanded(false)}>
          <div
            className="flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                  <MessageCircle size={18} className="text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">Configurar WhatsApp Business</h3>
                  <p className="text-xs text-slate-400">{waConnected ? 'Conectado' : 'Pendiente de configurar'}</p>
                </div>
              </div>
              <button onClick={() => setExpanded(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <p className="mb-4 text-xs text-slate-500">
                El access token, el phone number id y el verify token se obtienen en developers.facebook.com, dentro de la app
                conectada al número Business del despacho.
              </p>
              {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
              {message && <p className="mb-3 text-xs font-medium text-emerald-600">{message}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <ConfigInput label="Access token" value={form.accessToken} onChange={(v) => setForm((f) => ({ ...f, accessToken: v }))} placeholder="EAAG..." />
                <ConfigInput label="Phone number id" value={form.phoneNumberId} onChange={(v) => setForm((f) => ({ ...f, phoneNumberId: v }))} placeholder="123456789012345" />
                <ConfigInput label="Verify token" value={form.verifyToken} onChange={(v) => setForm((f) => ({ ...f, verifyToken: v }))} placeholder="token-seguro" />
                <ConfigInput label="Webhook base URL" value={form.webhookBaseUrl} onChange={(v) => setForm((f) => ({ ...f, webhookBaseUrl: v }))} placeholder="https://tu-dominio.com" />
                <ConfigInput label="Graph version" value={form.graphVersion} onChange={(v) => setForm((f) => ({ ...f, graphVersion: v }))} placeholder="v23.0" />
                <ConfigInput label="Business account id" value={form.businessAccountId} onChange={(v) => setForm((f) => ({ ...f, businessAccountId: v }))} placeholder="opcional" />
              </div>
              {status?.webhookUrl && (
                <p className="mt-4 text-[11px] text-slate-400">
                  URL de webhook para pegar en Meta: <code className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-600">{status.webhookUrl}</code>
                </p>
              )}
            </div>
            <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !status?.phoneNumberIdConfigured || !status?.accessTokenConfigured}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <LockKeyhole size={14} />}
                Probar conexión
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#ab0433] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#92042c] disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                Guardar credenciales
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ConfigInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-red-300"
      />
    </label>
  );
}

type TipoPrefAviso = 'chat' | 'correo' | 'whatsapp' | 'plazo' | 'vista' | 'soporte';
interface AvisoPrefs {
  tipos: Record<TipoPrefAviso, boolean>;
  email?: Record<TipoPrefAviso, boolean>;
  silencio: { activo: boolean; desde: string; hasta: string; finDeSemana: boolean };
}

function NotificacionesPanel() {
  const push = usePushNotifications();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Preferencias (13/10/2026): qué tipos de aviso y horario de silencio.
  // Se guardan en el servidor, valen para todos tus dispositivos.
  const [prefs, setPrefs] = useState<AvisoPrefs | null>(null);
  const [enSilencioAhora, setEnSilencioAhora] = useState(false);
  // Cuenta de correo propia desde la que salen los avisos por correo (o null).
  const [cuentaCorreo, setCuentaCorreo] = useState<string | null | undefined>(undefined);
  const [guardado, setGuardado] = useState<'' | 'guardando' | 'ok' | 'error'>('');
  const [prueba, setPrueba] = useState<'' | 'enviando' | 'ok' | string>('');
  const guardarTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/push/preferencias', { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json().catch(() => null);
        if (!cancelled && res.ok && d?.data?.prefs) { setPrefs(d.data.prefs); setEnSilencioAhora(Boolean(d.data.enSilencioAhora)); setCuentaCorreo(d.data.cuentaCorreo ?? null); }
      } catch { /* se queda sin cargar */ }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const cambiarPrefs = (next: AvisoPrefs) => {
    setPrefs(next);
    setGuardado('guardando');
    if (guardarTimer.current) window.clearTimeout(guardarTimer.current);
    guardarTimer.current = window.setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/push/preferencias', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefs: next }),
        });
        const d = await res.json().catch(() => null);
        if (!res.ok) throw new Error();
        setEnSilencioAhora(Boolean(d?.data?.enSilencioAhora));
        setGuardado('ok');
      } catch {
        setGuardado('error');
      }
    }, 500);
  };

  const enviarPrueba = async () => {
    setPrueba('enviando');
    try {
      const token = await getToken();
      const res = await fetch('/api/push/prueba', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || 'No se pudo enviar');
      setPrueba('ok');
    } catch (e: any) {
      setPrueba(e?.message || 'No se pudo enviar');
    }
  };

  const handleToggle = async () => {
    setError(null);
    if (push.subscribed) {
      await push.unsubscribe();
      return;
    }
    const okd = await push.subscribe();
    if (!okd) {
      setError(
        push.permission === 'denied'
          ? 'Has bloqueado los avisos para este sitio en el navegador. Actívalos desde los ajustes de notificaciones del navegador y vuelve a intentarlo.'
          : 'No se ha podido activar. Inténtalo de nuevo.',
      );
    }
  };

  const EVENTS: { key: TipoPrefAviso; icon: any; label: string; desc: string }[] = [
    { key: 'chat', icon: MessageCircle, label: 'Mensajes del chat interno', desc: 'Cuando alguien te escribe en un canal o directo. No llegan si estás en "No molestar", "En juicio" o "En reunión".' },
    { key: 'correo', icon: MailIcon, label: 'Correo nuevo',              desc: 'Al llegar un correo a tu bandeja de entrada (se revisa cada pocos minutos).' },
    { key: 'whatsapp', icon: Phone, label: 'WhatsApp entrante',         desc: 'Cuando un cliente escribe por WhatsApp (si puedes ver Comunicación externa).' },
    { key: 'plazo', icon: Clock3, label: 'Plazos y recordatorios', desc: 'A 3 días, el día antes y el mismo día; si vence, hasta 3 recordatorios (uno por semana).' },
    { key: 'vista', icon: Gavel, label: 'Vistas',                    desc: 'Vistas por confirmar, cambios y cancelaciones de las que te tocan.' },
    { key: 'soporte', icon: LifeBuoy, label: 'Centro de soporte',         desc: 'Respuestas y cambios de estado en tus tickets.' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Avisos push del navegador</h3>
          <ComoFunciona capitulo="17" />
        </div>

        {!push.supported ? (
          <p className="text-sm text-slate-500">Este navegador no admite notificaciones push.</p>
        ) : !push.serverEnabled ? (
          <p className="text-sm text-slate-500">Las notificaciones push todavía no están configuradas en el servidor.</p>
        ) : (
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${push.subscribed ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              {push.subscribed ? <BellRing size={20} className="text-emerald-600" /> : <BellOff size={20} className="text-slate-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {push.subscribed ? 'Avisos activados en este dispositivo' : 'Avisos desactivados en este dispositivo'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 max-w-md">
                Recibe un aviso del sistema aunque tengas Vantia cerrado o en segundo plano. Se activa por dispositivo/navegador, no por cuenta.
              </p>
              {error && <p className="peligro text-xs text-red-600 mt-2">{error}</p>}
              {push.subscribed && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void enviarPrueba()} disabled={prueba === 'enviando'}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60">
                    {prueba === 'enviando' ? 'Enviando…' : 'Enviar aviso de prueba'}
                  </button>
                  {prueba === 'ok' && <span className="text-xs text-emerald-700">Enviado: debería aparecer en unos segundos (con Vantia en segundo plano).</span>}
                  {prueba && prueba !== 'ok' && prueba !== 'enviando' && <span className="text-xs text-red-600">{prueba}</span>}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleToggle}
              disabled={push.busy}
              className={`shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                push.subscribed
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {push.busy ? 'Un momento…' : push.subscribed ? 'Desactivar' : 'Activar avisos'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Qué te avisa</h3>
          <span className="text-[11px] text-slate-400">
            {guardado === 'guardando' ? 'Guardando…' : guardado === 'ok' ? 'Guardado' : guardado === 'error' ? 'No se pudo guardar' : 'Para todos tus dispositivos'}
          </span>
        </div>
        <div className="mb-2 flex justify-end gap-3 pr-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <span className="w-9 text-center">Aviso</span>
          <span className="w-9 text-center">Correo</span>
        </div>
        <div className="space-y-3">
          {EVENTS.map((e) => {
            const on = prefs ? prefs.tipos[e.key] : true;
            const porCorreo = Boolean(prefs?.email?.[e.key]);
            const interruptor = (activo: boolean, etiqueta: string, onClick: () => void, deshabilitado = false) => (
              <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={!prefs || deshabilitado} onClick={onClick}
                title={deshabilitado ? 'Un correo para avisar de un correo no tiene sentido' : undefined}
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${activo ? 'bg-red-600' : 'bg-slate-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            );
            return (
              <div key={e.key} className="flex items-start gap-3">
                <e.icon size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{e.label}</p>
                  <p className="text-xs text-slate-500">{e.desc}</p>
                </div>
                {interruptor(on, `${e.label}: aviso en el navegador`,
                  () => prefs && cambiarPrefs({ ...prefs, tipos: { ...prefs.tipos, [e.key]: !on } }))}
                {interruptor(porCorreo, `${e.label}: por correo`,
                  () => prefs && cambiarPrefs({ ...prefs, email: { ...(prefs.email || {} as Record<TipoPrefAviso, boolean>), [e.key]: !porCorreo } }),
                  e.key === 'correo')}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          {cuentaCorreo
            ? <>Los avisos por correo salen de tu cuenta <span className="font-semibold text-slate-700">{cuentaCorreo}</span> y te llegan a tu correo de acceso. El chat y WhatsApp, como mucho uno cada 15 minutos.</>
            : cuentaCorreo === null
              ? <span className="text-amber-700">Para recibir avisos por correo necesitas una cuenta de correo conectada en <Link to="/dashboard/correo" className="font-semibold underline">Correo</Link>: los avisos salen desde ella.</span>
              : null}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Horario de silencio</h3>
          {prefs && (
            <button type="button" role="switch" aria-checked={prefs.silencio.activo} aria-label="Horario de silencio"
              onClick={() => cambiarPrefs({ ...prefs, silencio: { ...prefs.silencio, activo: !prefs.silencio.activo } })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${prefs.silencio.activo ? 'bg-red-600' : 'bg-slate-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${prefs.silencio.activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          )}
        </div>
        {!prefs ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <div className={prefs.silencio.activo ? '' : 'opacity-50'}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span>Sin avisos de</span>
              <input type="time" value={prefs.silencio.desde} disabled={!prefs.silencio.activo}
                onChange={(ev) => ev.target.value && cambiarPrefs({ ...prefs, silencio: { ...prefs.silencio, desde: ev.target.value } })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
              <span>a</span>
              <input type="time" value={prefs.silencio.hasta} disabled={!prefs.silencio.activo}
                onChange={(ev) => ev.target.value && cambiarPrefs({ ...prefs, silencio: { ...prefs.silencio, hasta: ev.target.value } })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
              <span className="text-xs text-slate-400">(hora de Madrid)</span>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={prefs.silencio.finDeSemana} disabled={!prefs.silencio.activo} className="accent-red-600"
                onChange={(ev) => cambiarPrefs({ ...prefs, silencio: { ...prefs.silencio, finDeSemana: ev.target.checked } })} />
              Y todo el fin de semana
            </label>
            <p className="mt-3 text-xs text-slate-500">
              Vale para el aviso y para el correo. Los mensajes directos del chat y las vistas llegan siempre: son lo urgente. Los plazos que caigan en silencio se avisan al terminar.
              {prefs.silencio.activo && enSilencioAhora && <span className="ml-1 font-semibold text-slate-700">Ahora mismo estás en silencio.</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Configuracion() {
  const { rol: myRol } = useOrganizacion();
  const esGestor = myRol === 'propietario' || myRol === 'admin';
  // "Gestión de Usuarios" (añadir/quitar miembros, roles, permisos) no
  // aparece siquiera como pestaña para quien no sea propietario/admin --
  // antes se mostraba a cualquiera y solo se ocultaban los botones dentro
  // del panel, dejando la pestaña visible sin motivo para un rol "miembro".
  const visibleOtherSections = OTHER_SECTIONS.filter(
    // Automatizaciones: igual, solo quien puede activarlas y configurarlas.
    (s) => (s.key !== 'usuarios' && s.key !== 'automatizaciones') || myRol === 'propietario' || myRol === 'admin',
  );
  const { theme, setTheme } = useTheme();
  const currentAccent = PALETTES.find((p) => p.id === theme)?.accent ?? PALETTES[0].accent;
  // Permite enlazar directamente a una sección concreta (p.ej. desde el aviso
  // de "conéctalo desde Configuración → Integraciones" en Comunicación Externa)
  // con ?section=integraciones, en vez de dejar siempre a quien llega en Apariencia.
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<SectionKey>(() => {
    const requested = searchParams.get('section') as SectionKey | null;
    return requested && SECCIONES_VALIDAS.includes(requested) ? requested : 'apariencia';
  });
  // Si cambia ?section= estando ya aquí (p.ej. "Ver Trazabilidad" desde Seguridad).
  useEffect(() => {
    const requested = searchParams.get('section') as SectionKey | null;
    if (requested && SECCIONES_VALIDAS.includes(requested)) setActiveSection(requested);
  }, [searchParams]);
  const activeOther = visibleOtherSections.find((s) => s.key === activeSection);

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">

      {/* ── Sub-navegación de Ajustes ── */}
      <aside className="w-full md:w-64 flex-shrink-0 flex flex-col bg-white border-b md:border-b-0 md:border-r border-slate-200 z-10">
        <div className="px-4 pt-4 pb-1 md:p-6 md:pb-2">
          <h2 className="text-lg font-extrabold text-slate-800">Ajustes</h2>
        </div>
        <div className="md:flex-1 md:overflow-y-auto modules-scrollbar p-3">
          <nav className="flex gap-1.5 overflow-x-auto pb-1 modules-scrollbar md:flex-col md:overflow-visible md:pb-0">
            {[
              { titulo: 'Mi cuenta', items: SECCIONES_CUENTA },
              { titulo: 'Despacho', items: SECCIONES_DESPACHO.filter((x) => !x.soloGestor || esGestor) },
            ].map((grupo, gi) => (
              <React.Fragment key={grupo.titulo}>
                {gi > 0 && <div className="shrink-0 w-px self-stretch bg-slate-200 md:hidden" />}
                <p className={`hidden md:block px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 ${gi > 0 ? 'mt-5' : ''}`}>{grupo.titulo}</p>
                {grupo.items.map((it) => {
                  const Icon = it.icon;
                  const active = activeSection === it.key;
                  // Para quien no es propietario/admin, Trazabilidad es solo su actividad.
                  const label = it.key === 'trazabilidad' && !esGestor && myRol !== 'soporte' ? 'Mi actividad' : it.label;
                  return (
                    <button key={it.key} type="button" onClick={() => setActiveSection(it.key)}
                      className={`shrink-0 whitespace-nowrap md:w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left group ${
                        active ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                      }`}>
                      <Icon size={16} className={active ? 'text-red-500' : 'text-slate-400 group-hover:text-slate-600'} /> {label}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </nav>
        </div>
      </aside>

      {/* ── Contenido del ajuste ── */}
      {/* Trazabilidad ocupa todo el hueco (lista + detalle, como su propia
          pantalla); el resto de secciones van centradas con ancho de lectura. */}
      <div className={activeSection === 'trazabilidad'
        ? 'flex-1 min-h-0 overflow-hidden bg-[#f4f6f8]'
        : 'flex-1 overflow-y-auto modules-scrollbar p-4 sm:p-8 lg:p-12 bg-[#f4f6f8]'}>
        <div className={activeSection === 'trazabilidad' ? 'h-full' : `mx-auto ${activeSection === 'apariencia' ? 'max-w-6xl' : 'max-w-4xl'}`}>

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

              {/* Claro / oscuro / como el sistema */}
              <SelectorModo />

              {/* Tamaño del texto (accesibilidad) */}
              <SelectorTexto />

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

              {/* 15/10/2026: sin colores a medida -- solo los temas predefinidos, cada
                  uno con su versión clara y oscura, para que todo se vea siempre bien. */}
              <p className="text-xs text-slate-500">
                Cada tema tiene su versión clara y oscura: elige el modo arriba y el tema aquí.
              </p>
            </>
          ) : activeSection === 'manual' ? (
            <ManualPanel />
          ) : activeSection === 'despacho' ? (
            <><DespachoPanel /><PlantillasNubeConfig /></>
          ) : activeSection === 'misdatos' ? (
            <MisDatosPanel />
          ) : activeSection === 'ayuda' ? (
            <AyudaPanel />
          ) : activeSection === 'perfil' ? (
            <PerfilPanel />
          ) : activeSection === 'preferencias' ? (
            <PreferenciasTrabajoPanel />
          ) : activeSection === 'privacidad' && esGestor ? (
            <PrivacidadPanel />
          ) : activeSection === 'notificaciones' ? (
            <NotificacionesPanel />
          ) : activeSection === 'seguridad' ? (
            <SeguridadPanel />
          ) : activeSection === 'integraciones' ? (
            <IntegracionesPanel canManage={myRol === 'propietario' || myRol === 'admin'} />
          ) : activeSection === 'automatizaciones' && (myRol === 'propietario' || myRol === 'admin') ? (
            <AutomatizacionesPanel />
          ) : activeSection === 'skills' ? (
            <SkillsPanel />
          ) : activeSection === 'trazabilidad' ? (
            <div className="h-full min-h-[520px] overflow-hidden">
              <Trazabilidad />
            </div>
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

