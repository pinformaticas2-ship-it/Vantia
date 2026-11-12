import React, { useEffect, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { BookOpen, Camera, Copy, Download, ExternalLink, Keyboard, LifeBuoy, Loader2, LogOut, Moon, Monitor, Sparkles, Sun, Scale, Trash2, Type, UserRound, type LucideIcon } from 'lucide-react';
import { apiFetch, resolveApiUrl } from '../lib/api';
import { PAGINAS_INICIO, TAMANOS_TEXTO, usePreferencias, Modo } from '../lib/preferencias';
import { AyudaAtajos } from './AtajosTeclado';
import { aviso, confirmar } from "../lib/avisos";

// Secciones nuevas de Ajustes (14/10/2026): Mi perfil, Preferencias de trabajo,
// Datos y privacidad, y el selector de modo claro/oscuro de Apariencia.

const Tarjeta = ({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{titulo}</h3>
      {extra}
    </div>
    {children}
  </div>
);

function useEstadoGuardado() {
  const [estado, setEstado] = useState<'' | 'guardando' | 'ok' | 'error'>('');
  const texto = estado === 'guardando' ? 'Guardando…' : estado === 'ok' ? 'Guardado' : estado === 'error' ? 'No se pudo guardar' : '';
  return { estado, setEstado, etiqueta: <span className={`text-[11px] ${estado === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{texto}</span> };
}

// ── Apariencia: modo claro / oscuro / como el sistema ──────────────────────
export function SelectorModo() {
  const { prefs, guardar } = usePreferencias();
  const opciones: { v: Modo; label: string; Icon: any; desc: string }[] = [
    { v: 'claro', label: 'Claro', Icon: Sun, desc: 'Fondo blanco' },
    { v: 'oscuro', label: 'Oscuro', Icon: Moon, desc: 'Descansa la vista' },
    { v: 'sistema', label: 'Como el sistema', Icon: Monitor, desc: 'Sigue a tu ordenador' },
  ];
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Modo</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {opciones.map(({ v, label, Icon, desc }) => {
          const activo = prefs.modo === v;
          return (
            <button key={v} type="button" onClick={() => void guardar({ modo: v }).catch(() => {})}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${activo ? 'border-red-600 bg-red-600/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <Icon size={18} className={activo ? 'text-red-600' : 'text-slate-400'} />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">{desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Apariencia: tamaño del texto (16/10/2026) ───────────────────────────
export function SelectorTexto() {
  const { prefs, guardar } = usePreferencias();
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Tamaño del texto</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TAMANOS_TEXTO.map(({ valor, label, px }) => {
          const activo = prefs.texto === valor;
          return (
            <button key={valor} type="button" onClick={() => void guardar({ texto: valor }).catch(() => {})}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${activo ? 'border-red-600 bg-red-600/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <Type size={Math.round(16 * (px / 16))} className={activo ? 'text-red-600' : 'text-slate-400'} />
              {/* Cada opción en su propio tamaño, sin escalar con el elegido */}
              <span className="block font-semibold text-slate-800" style={{ fontSize: `${px * 0.875}px` }}>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Agranda la letra de toda la aplicación en tus dispositivos. Si necesitas más, el zoom del navegador (Ctrl y +) también funciona.</p>
    </section>
  );
}

// ── Cabecera común de cada sección de Ajustes (12/11/2026) ────────────────
// Antes cada sección tenía la suya (una oscura enorme en Apariencia, un
// título suelto en otras, nada en Mi perfil): ahora todas la misma.
export function CabeceraAjuste({ icon: Icon, titulo, descripcion, extra }: {
  icon: LucideIcon;
  titulo: string;
  descripcion: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-red-600 shadow-sm">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-800">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{descripcion}</p>
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
}

// ── Apariencia: menos animaciones (12/11/2026) ───────────────────────────
export function SelectorMovimiento() {
  const { prefs, guardar } = usePreferencias();
  const activo = prefs.menosAnimaciones;
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Movimiento</h3>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <Sparkles size={18} className="shrink-0 text-slate-400" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">Menos animaciones</span>
            <span className="block text-xs text-slate-500">Quita los fundidos y desplazamientos: todo aparece al instante. Útil si te marean o en ordenadores lentos.</span>
          </span>
        </span>
        <button type="button" role="switch" aria-checked={activo} aria-label="Menos animaciones"
          onClick={() => void guardar({ menosAnimaciones: !activo }).catch(() => {})}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${activo ? 'bg-red-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </section>
  );
}

// ── Apariencia: muestra en vivo (12/11/2026) ─────────────────────────────
// Piezas reales de la app (no un dibujo): cambian al momento con el modo,
// el tema, el tamaño del texto y las animaciones que elijas.
export function MuestraApariencia() {
  const [interruptor, setInterruptor] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Así se ve</p>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><Scale size={17} /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">Exp. 2026/0142 · Reclamación de cantidad</p>
          <p className="truncate text-xs text-slate-500">Juzgado de 1ª Instancia nº 3 · próxima vista el 18 nov.</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        El texto de toda la aplicación se verá con este tamaño y estos colores, en el modo que hayas elegido.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">En plazo</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Vence mañana</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">Archivado</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Botón principal</button>
        <button type="button" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Secundario</button>
        <button type="button" role="switch" aria-checked={interruptor} aria-label="Interruptor de ejemplo" onClick={() => setInterruptor((v) => !v)}
          className={`relative ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${interruptor ? 'bg-red-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${interruptor ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

// ── Mi perfil ─────────────────────────────────────────────────────────────
// 12/11/2026: el nombre y la foto se cambian aquí (antes había que ir a
// Seguridad, a la pantalla de Clerk). El correo de acceso sigue en Seguridad
// porque hay que verificar el nuevo con un código.
const FOTO_MAX_MB = 8;

export function PerfilPanel() {
  const { user, isLoaded } = useUser();
  const { prefs, guardar } = usePreferencias();
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [cargo, setCargo] = useState(prefs.cargo);
  const [telefono, setTelefono] = useState(prefs.telefono);
  const [guardando, setGuardando] = useState(false);
  const [foto, setFoto] = useState<'' | 'subiendo' | 'quitando'>('');
  const fotoRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setNombre(user.firstName || '');
    setApellidos(user.lastName || '');
  }, [user?.id, user?.firstName, user?.lastName]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCargo(prefs.cargo); setTelefono(prefs.telefono); }, [prefs.cargo, prefs.telefono]);

  const nombreCambiado = !!user && (nombre.trim() !== (user.firstName || '') || apellidos.trim() !== (user.lastName || ''));
  const prefsCambiadas = cargo.trim() !== prefs.cargo || telefono.trim() !== prefs.telefono;
  const cambiado = nombreCambiado || prefsCambiadas;
  const telefonoValido = !telefono.trim() || /^[+()\d\s-]{6,30}$/.test(telefono.trim());
  const nombreValido = !!nombre.trim();

  // Si te vas con cambios sin guardar, el navegador avisa.
  useEffect(() => {
    if (!cambiado) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [cambiado]);

  const onGuardar = async () => {
    if (!user || !nombreValido || !telefonoValido) return;
    setGuardando(true);
    try {
      if (nombreCambiado) await user.update({ firstName: nombre.trim(), lastName: apellidos.trim() });
      if (prefsCambiadas) await guardar({ cargo: cargo.trim(), telefono: telefono.trim() });
      aviso.ok('Perfil guardado');
    } catch (e: any) {
      aviso.error(e?.errors?.[0]?.longMessage || e?.message || 'No se pudo guardar el perfil');
    } finally { setGuardando(false); }
  };
  const descartar = () => {
    setNombre(user?.firstName || ''); setApellidos(user?.lastName || '');
    setCargo(prefs.cargo); setTelefono(prefs.telefono);
  };

  const subirFoto = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) { aviso.error('Elige una imagen JPG, PNG, GIF o WebP.'); return; }
    if (file.size > FOTO_MAX_MB * 1024 * 1024) { aviso.error(`La foto pesa demasiado (máximo ${FOTO_MAX_MB} MB).`); return; }
    setFoto('subiendo');
    try { await user.setProfileImage({ file }); aviso.ok('Foto actualizada'); }
    catch (e: any) { aviso.error(e?.errors?.[0]?.longMessage || 'No se pudo cambiar la foto'); }
    finally { setFoto(''); }
  };
  const quitarFoto = async () => {
    if (!user) return;
    if (!(await confirmar({ titulo: '¿Quitar tu foto?', mensaje: 'Se verán tus iniciales en su lugar.', confirmar: 'Quitar foto' }))) return;
    setFoto('quitando');
    try { await user.setProfileImage({ file: null }); aviso.ok('Foto quitada'); }
    catch (e: any) { aviso.error(e?.errors?.[0]?.longMessage || 'No se pudo quitar la foto'); }
    finally { setFoto(''); }
  };

  if (!isLoaded || !user) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-300" size={26} /></div>;
  }

  const nombreVisible = [nombre.trim(), apellidos.trim()].filter(Boolean).join(' ') || 'Sin nombre';
  const iniciales = nombreVisible.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300';
  const etiqueta = 'mb-1 block text-xs font-semibold text-slate-600';

  return (
    <div className="space-y-6">
      <CabeceraAjuste icon={UserRound} titulo="Mi perfil"
        descripcion="Tu nombre, tu foto y cómo te ven tus compañeros del despacho." />

      <Tarjeta titulo="Foto">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative h-20 w-20 shrink-0">
            {user.hasImage
              ? <img src={user.imageUrl} alt="Tu foto" className="h-20 w-20 rounded-full object-cover ring-1 ring-slate-200" />
              : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-xl font-bold text-slate-500">{iniciales || '?'}</div>}
            {foto && <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"><Loader2 size={18} className="animate-spin text-white" /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fotoRef.current?.click()} disabled={!!foto}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                <Camera size={14} /> {user.hasImage ? 'Cambiar foto' : 'Subir foto'}
              </button>
              {user.hasImage && (
                <button type="button" onClick={() => void quitarFoto()} disabled={!!foto}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60">
                  <Trash2 size={14} /> Quitar
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">JPG, PNG, GIF o WebP, hasta {FOTO_MAX_MB} MB. Mejor una foto cuadrada de tu cara.</p>
            <input ref={fotoRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void subirFoto(f); }} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Tus datos">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={etiqueta}>Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoComplete="given-name" className={input} />
            {!nombreValido && <span className="peligro mt-1 block text-[11px] text-red-600">El nombre no puede quedar vacío.</span>}
          </label>
          <label className="block">
            <span className={etiqueta}>Apellidos</span>
            <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} maxLength={80} autoComplete="family-name" className={input} />
          </label>
          <label className="block">
            <span className={etiqueta}>Cargo</span>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={100} placeholder="Ej. Abogada, Procuradora, Administración" className={input} />
            <span className="mt-1 block text-[11px] text-slate-400">Se ve junto a tu nombre en el chat.</span>
          </label>
          <label className="block">
            <span className={etiqueta}>Teléfono de contacto</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} placeholder="+34 600 000 000" inputMode="tel" autoComplete="tel" className={input} />
            {!telefonoValido && <span className="peligro mt-1 block text-[11px] text-red-600">Solo números, espacios, + ( ) y guiones.</span>}
          </label>
          <div className="sm:col-span-2">
            <span className={etiqueta}>Correo de acceso</span>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="truncate text-sm text-slate-600">{user.primaryEmailAddress?.emailAddress || '—'}</span>
              <Link to="/dashboard/config?section=seguridad" className="text-xs font-semibold text-red-600 hover:underline">Cambiar en Seguridad</Link>
            </div>
          </div>
        </div>

        {/* Así te ven los demás */}
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Así te ven en el despacho</p>
          <div className="flex items-center gap-3">
            {user.hasImage
              ? <img src={user.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500">{iniciales || '?'}</div>}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{nombreVisible}</p>
              <p className="truncate text-xs text-slate-500">{[cargo.trim() || 'Sin cargo', telefono.trim()].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">Tu firma de correo se gestiona en <Link to="/dashboard/correo" className="font-semibold text-red-600 hover:underline">Correo → Firmas</Link>.</p>
          <div className="flex items-center gap-2">
            {cambiado && !guardando && (
              <button type="button" onClick={descartar} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Descartar</button>
            )}
            <button type="button" onClick={() => void onGuardar()} disabled={!cambiado || guardando || !nombreValido || !telefonoValido}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {guardando && <Loader2 size={14} className="animate-spin" />} {cambiado ? 'Guardar cambios' : 'Guardado'}
            </button>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}

// ── Preferencias de trabajo ───────────────────────────────────────────────
export function PreferenciasTrabajoPanel() {
  const { prefs, guardar } = usePreferencias();
  const g = useEstadoGuardado();
  const [ayuda, setAyuda] = useState(false);
  const cambiar = async (c: Parameters<typeof guardar>[0]) => {
    g.setEstado('guardando');
    try { await guardar(c); g.setEstado('ok'); } catch { g.setEstado('error'); }
  };
  const fila = 'flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0';
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Al trabajar" extra={g.etiqueta}>
        <div className={fila}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Página de inicio</p>
            <p className="text-xs text-slate-500">Lo primero que ves al entrar en Vantia.</p>
          </div>
          <select value={prefs.inicio} onChange={(e) => void cambiar({ inicio: e.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300">
            {PAGINAS_INICIO.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
          </select>
        </div>
        <div className={fila}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">La semana empieza en</p>
            <p className="text-xs text-slate-500">En el calendario de la Agenda.</p>
          </div>
          <select value={prefs.primerDia} onChange={(e) => void cambiar({ primerDia: e.target.value as 'lunes' | 'domingo' })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300">
            <option value="lunes">Lunes</option>
            <option value="domingo">Domingo</option>
          </select>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Atajos de teclado">
        <div className={fila}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Usar atajos de teclado</p>
            <p className="text-xs text-slate-500">Por ejemplo, G y luego A para ir a la Agenda, o / para buscar.</p>
          </div>
          <button type="button" role="switch" aria-checked={prefs.atajos} aria-label="Usar atajos de teclado"
            onClick={() => void cambiar({ atajos: !prefs.atajos })}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${prefs.atajos ? 'bg-red-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${prefs.atajos ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <button type="button" onClick={() => setAyuda(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline">
          <Keyboard size={13} /> Ver todos los atajos (o pulsa ?)
        </button>
        {ayuda && <AyudaAtajos onClose={() => setAyuda(false)} />}
      </Tarjeta>
    </div>
  );
}

// ── Datos y privacidad (propietario/administradores) ──────────────────────
export function PrivacidadPanel() {
  const { getToken } = useAuth();
  const [datos, setDatos] = useState<{ retencionMeses: number | null; desde: string | null; registros: number; opciones: number[] } | null>(null);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState(false);
  const g = useEstadoGuardado();
  const cargar = async () => {
    try {
      const res = await apiFetch('/api/privacidad', { getToken });
      if (res?.success === false) throw new Error(res.error);
      setDatos(res.data);
    } catch (e: any) { setError(e?.message || 'No se pudo cargar'); }
  };
  useEffect(() => { void cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarRetencion = async (valor: string) => {
    const meses = valor === '' ? null : Number(valor);
    if (meses && datos?.desde && !(await confirmar({ titulo: `¿Borrar la trazabilidad de más de ${meses} meses?`, mensaje: "Los registros más antiguos se eliminarán para siempre. Esto no se puede deshacer.", confirmar: "Borrar y guardar", peligro: true }))) return;
    g.setEstado('guardando');
    try {
      const res = await apiFetch('/api/privacidad', { method: 'PUT', getToken, body: JSON.stringify({ retencionMeses: meses }) });
      if (res?.success === false) throw new Error(res.error);
      g.setEstado('ok');
      await cargar();
    } catch (e: any) { g.setEstado('error'); setError(e?.message || ''); }
  };

  const exportar = async () => {
    setExportando(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch(resolveApiUrl('/api/privacidad/exportar'), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('No se pudo exportar');
      const blob = await res.blob();
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'vantia-datos.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) { setError(e?.message || 'No se pudo exportar'); } finally { setExportando(false); }
  };

  return (
    <div className="space-y-6">
      <Tarjeta titulo="Cuánto se guarda la trazabilidad" extra={g.etiqueta}>
        <p className="text-sm text-slate-600">
          La trazabilidad guarda datos personales de quienes trabajan en el despacho (IP, dispositivo, horarios y acciones).
          El RGPD pide no guardarlos más tiempo del necesario: lo habitual son 12 meses.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select value={datos?.retencionMeses ?? ''} disabled={!datos} onChange={(e) => void cambiarRetencion(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300">
            <option value="">Sin límite</option>
            {(datos?.opciones || [6, 12, 24, 36, 60]).map((m) => <option key={m} value={m}>{m} meses</option>)}
          </select>
          {datos && (
            <span className="text-xs text-slate-500">
              {datos.registros.toLocaleString('es-ES')} registros{datos.desde ? `, desde el ${new Date(datos.desde).toLocaleDateString('es-ES')}` : ''}.
            </span>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500"><Trash2 size={12} className="mt-0.5 shrink-0" /> Lo que pase del plazo se borra solo cada día.</p>
      </Tarjeta>
      <Tarjeta titulo="Exportar los datos del despacho">
        <p className="text-sm text-slate-600">
          Descarga un archivo con clientes y contactos, expedientes, tareas, agenda, facturación, vistas, miembros y trazabilidad del despacho.
          No incluye los correos ni los chats: son de cada persona.
        </p>
        <button type="button" onClick={() => void exportar()} disabled={exportando}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar (JSON)
        </button>
        <p className="mt-2 text-xs text-slate-500">La exportación queda registrada en la trazabilidad.</p>
      </Tarjeta>
      {error && <p className="peligro text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Integraciones: correo y Quipu (se configuran en su módulo; aquí, su estado) ──
export function IntegracionesPropias() {
  const { getToken } = useAuth();
  const [correo, setCorreo] = useState<{ n: number; avisos: number } | null>(null);
  const [quipu, setQuipu] = useState<{ connected: boolean; otra?: string } | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/email/accounts', { getToken });
        const cuentas: any[] = Array.isArray(r?.data) ? r.data : [];
        setCorreo({ n: cuentas.length, avisos: cuentas.filter((c) => c.sync_warning || c.envio_warning).length });
      } catch { setCorreo({ n: 0, avisos: 0 }); }
      try {
        const r = await apiFetch('/api/quipu/status', { getToken });
        setQuipu({ connected: Boolean(r?.data?.connected), otra: r?.data?.connectedInOtherOrg });
      } catch { setQuipu({ connected: false }); }
    })();
  }, [getToken]);
  const Estado = ({ ok, aviso, texto }: { ok: boolean; aviso?: boolean; texto: string }) => (
    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${aviso ? 'bg-amber-50 text-amber-700' : ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{texto}</span>
  );
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Correo</p>
            <p className="mt-1 text-xs text-slate-500">
              {correo === null ? 'Comprobando…' : correo.n === 0 ? 'Ninguna cuenta conectada en esta organización.'
                : `${correo.n} cuenta${correo.n === 1 ? '' : 's'} conectada${correo.n === 1 ? '' : 's'}${correo.avisos ? ` · ${correo.avisos} con avisos` : ''}.`}
            </p>
          </div>
          {correo && <Estado ok={correo.n > 0} aviso={correo.avisos > 0} texto={correo.avisos ? 'Revisar' : correo.n ? 'Conectado' : 'Sin conectar'} />}
        </div>
        <Link to="/dashboard/correo" className="mt-4 inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          {correo?.n ? 'Gestionar cuentas y firmas' : 'Conectar una cuenta'}
        </Link>
      </div>
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Quipu (facturación)</p>
            <p className="mt-1 text-xs text-slate-500">
              {quipu === null ? 'Comprobando…' : quipu.connected ? 'Las facturas se sincronizan con Quipu.'
                : quipu.otra ? `Conectado en ${quipu.otra}, no en esta organización.` : 'Sin conectar.'}
            </p>
          </div>
          {quipu && <Estado ok={quipu.connected} texto={quipu.connected ? 'Conectado' : 'Sin conectar'} />}
        </div>
        <Link to="/dashboard/facturacion" className="mt-4 inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          {quipu?.connected ? 'Ir a Facturación' : 'Conectar desde Facturación'}
        </Link>
      </div>
    </div>
  );
}

// ── Mis datos y privacidad (cada persona, 16/10/2026) ─────────────────────
// Descargar lo que Vantia guarda de ti (art. 15 RGPD), qué se guarda en el
// navegador, cerrar sesión y eliminar la cuenta.

/** Lo que no se borra al "borrar los datos de este navegador": la sesión de
 *  Clerk (si no, te echa) y el identificador del dispositivo (Trazabilidad). */
const CLAVES_QUE_SE_QUEDAN = /^(__clerk|clerk|lextech_device_id$)/;

async function borrarDatosNavegador() {
  try {
    for (const k of Object.keys(localStorage)) if (!CLAVES_QUE_SE_QUEDAN.test(k)) localStorage.removeItem(k);
  } catch { /* sin almacenamiento */ }
  try { sessionStorage.clear(); } catch { /* idem */ }
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* idem */ }
}

export function MisDatosPanel() {
  const { getToken } = useAuth();
  const clerk = useClerk();
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [eliminando, setEliminando] = useState(false);

  const descargar = async () => {
    setDescargando(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch(resolveApiUrl('/api/privacidad/mis-datos'), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('No se pudieron descargar tus datos');
      const blob = await res.blob();
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'vantia-mis-datos.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) { setError(e?.message || 'No se pudieron descargar tus datos'); } finally { setDescargando(false); }
  };

  const borrarNavegador = async () => {
    if (!(await confirmar({
      titulo: '¿Borrar los datos de este navegador?',
      mensaje: 'Se borran las preferencias guardadas en este equipo, la caché y los borradores de correo sin guardar. Tu cuenta y todo lo del despacho no se tocan. La página se recargará.',
      confirmar: 'Borrar y recargar',
    }))) return;
    await borrarDatosNavegador();
    window.location.reload();
  };

  const eliminarCuenta = async () => {
    setEliminando(true); setError('');
    try {
      const res = await apiFetch('/api/privacidad/eliminar-cuenta', { method: 'POST', getToken, body: JSON.stringify({ confirmacion }) });
      if (res?.success === false) throw new Error(res.error);
      await borrarDatosNavegador();
      await clerk.signOut({ redirectUrl: '/' });
    } catch (e: any) { setError(e?.message || 'No se pudo eliminar la cuenta'); setEliminando(false); }
  };

  const boton = 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Descargar mis datos">
        <p className="text-sm text-slate-600">
          Un archivo con lo que Vantia guarda de ti: tu perfil, tus preferencias, los despachos a los que perteneces y tu actividad.
          Lo que creas dentro de un despacho (clientes, expedientes, documentos) es del despacho: su propietario lo exporta desde Datos y privacidad.
        </p>
        <button type="button" onClick={() => void descargar()} disabled={descargando} className={`mt-4 ${boton}`}>
          {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar (JSON)
        </button>
      </Tarjeta>

      <Tarjeta titulo="Cookies y este navegador">
        <p className="text-sm text-slate-600">
          Vantia no usa cookies de publicidad ni de analítica y no envía datos de uso a terceros. Solo guarda lo imprescindible:
          la sesión iniciada y, en este navegador, tus preferencias y algo de caché para que todo cargue más rápido.
        </p>
        <button type="button" onClick={() => void borrarNavegador()} className={`mt-4 ${boton}`}>
          <Trash2 size={14} /> Borrar los datos de este navegador
        </button>
        <p className="mt-2 text-xs text-slate-500">Útil si algo se ve raro o desactualizado. No cierra la sesión.</p>
      </Tarjeta>

      <Tarjeta titulo="Sesión">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Cierra la sesión en este dispositivo. Las demás sesiones abiertas se ven y se cierran en Seguridad.</p>
          <button type="button" onClick={() => void clerk.signOut({ redirectUrl: '/' })} className={boton}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </Tarjeta>

      <div className="rounded-2xl border border-red-200 bg-white p-5">
        <h3 className="mb-4 border-b border-red-100 pb-2 text-sm font-bold uppercase tracking-wider text-red-700">Eliminar mi cuenta</h3>
        <p className="text-sm text-slate-600">
          Tu usuario se borra y ya no podrás entrar. Sales de todos tus despachos; lo que hiciste en ellos se queda, porque es del despacho.
          Si eres propietario de un despacho, antes tienes que transferirlo a otra persona o eliminarlo. No se puede deshacer.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder="Escribe ELIMINAR"
            aria-label="Escribe ELIMINAR para confirmar"
            className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300" />
          <button type="button" onClick={() => void eliminarCuenta()} disabled={confirmacion.trim().toUpperCase() !== 'ELIMINAR' || eliminando}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {eliminando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Eliminar mi cuenta
          </button>
        </div>
      </div>
      {error && <p className="peligro text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Ayuda e información (16/10/2026) ──────────────────────────────────────
// Los textos legales se publican fuera de la app: sus direcciones van en
// VITE_TERMINOS_URL y VITE_PRIVACIDAD_URL (sin ellas, "Pendiente de publicar").
const URL_TERMINOS = import.meta.env.VITE_TERMINOS_URL as string | undefined;
const URL_PRIVACIDAD = import.meta.env.VITE_PRIVACIDAD_URL as string | undefined;

export function AyudaPanel() {
  const [copiado, setCopiado] = useState(false);
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
  const commit = typeof __APP_COMMIT__ !== 'undefined' && __APP_COMMIT__ !== 'dev' ? __APP_COMMIT__.slice(0, 7) : '';
  const build = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
  const fechaBuild = build ? new Date(build).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : '';
  const infoSoporte = [
    `Vantia ${version}${commit ? ` (${commit})` : ''}`,
    fechaBuild && `Publicada: ${fechaBuild}`,
    `Navegador: ${navigator.userAgent}`,
    `Pantalla: ${window.innerWidth}×${window.innerHeight}`,
  ].filter(Boolean).join('\n');
  const copiar = async () => {
    try { await navigator.clipboard.writeText(infoSoporte); setCopiado(true); window.setTimeout(() => setCopiado(false), 2500); } catch { /* sin portapapeles */ }
  };
  const enlace = 'flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50';
  const legal = (url: string | undefined, label: string) => url
    ? <a href={url} target="_blank" rel="noopener noreferrer" className={enlace}>{label} <ExternalLink size={14} className="text-slate-400" /></a>
    : <div className={`${enlace} cursor-default !text-slate-400 hover:bg-white`}>{label} <span className="text-[11px] font-normal">Pendiente de publicar</span></div>;
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Ayuda">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/dashboard/config?section=manual" className={enlace}><span className="flex items-center gap-2"><BookOpen size={15} className="text-slate-400" /> Manual de usuario</span></Link>
          <Link to="/dashboard/soporte" className={enlace}><span className="flex items-center gap-2"><LifeBuoy size={15} className="text-slate-400" /> Centro de soporte</span></Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">¿Algo no funciona o tienes una duda? Abre un ticket en el Centro de soporte: te contestamos por ahí y por correo.</p>
      </Tarjeta>
      <Tarjeta titulo="Información legal">
        <div className="grid gap-3 sm:grid-cols-2">
          {legal(URL_TERMINOS, 'Términos y condiciones')}
          {legal(URL_PRIVACIDAD, 'Política de privacidad')}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Versión">
        <p className="text-sm text-slate-700">Vantia <span className="font-semibold">{version || '—'}</span>{commit && <span className="text-slate-400"> · {commit}</span>}</p>
        {fechaBuild && <p className="mt-0.5 text-xs text-slate-500">Publicada el {fechaBuild}</p>}
        <button type="button" onClick={() => void copiar()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar información para soporte'}
        </button>
        <p className="mt-2 text-xs text-slate-500">Pégala en tu ticket: nos dice qué versión y qué navegador usas.</p>
      </Tarjeta>
    </div>
  );
}
