import React, { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { Download, Keyboard, Loader2, Moon, Monitor, Sun, Trash2 } from 'lucide-react';
import { apiFetch, resolveApiUrl } from '../lib/api';
import { PAGINAS_INICIO, usePreferencias, Modo } from '../lib/preferencias';
import { AyudaAtajos } from './AtajosTeclado';

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
      <p className="mt-2 text-xs text-slate-500">El modo oscuro es nuevo: si ves alguna pantalla con colores raros, avísanos desde el Centro de soporte.</p>
    </section>
  );
}

// ── Mi perfil ─────────────────────────────────────────────────────────────
export function PerfilPanel() {
  const { user } = useUser();
  const { prefs, guardar } = usePreferencias();
  const [cargo, setCargo] = useState(prefs.cargo);
  const [telefono, setTelefono] = useState(prefs.telefono);
  const g = useEstadoGuardado();
  useEffect(() => { setCargo(prefs.cargo); setTelefono(prefs.telefono); }, [prefs.cargo, prefs.telefono]);
  const cambiado = cargo.trim() !== prefs.cargo || telefono.trim() !== prefs.telefono;
  const onGuardar = async () => {
    g.setEstado('guardando');
    try { await guardar({ cargo: cargo.trim(), telefono: telefono.trim() }); g.setEstado('ok'); } catch { g.setEstado('error'); }
  };
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Tus datos">
        <div className="flex items-center gap-4">
          {user?.imageUrl
            ? <img src={user.imageUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            : <div className="h-14 w-14 rounded-full bg-slate-200" />}
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-800">{user?.fullName || 'Sin nombre'}</p>
            <p className="truncate text-sm text-slate-500">{user?.primaryEmailAddress?.emailAddress}</p>
            <p className="mt-1 text-xs text-slate-500">El nombre, la foto y el correo de acceso se cambian en <Link to="/dashboard/config?section=seguridad" className="font-semibold text-red-600 hover:underline">Seguridad</Link>.</p>
          </div>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Cómo te ven en el despacho" extra={g.etiqueta}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Cargo</span>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={100} placeholder="Ej. Abogada, Procuradora, Administración"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300" />
            <span className="mt-1 block text-[11px] text-slate-400">Se ve junto a tu nombre en el chat.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Teléfono de contacto</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} placeholder="+34 600 000 000"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Tu firma de correo se gestiona en <Link to="/dashboard/correo" className="font-semibold text-red-600 hover:underline">Correo → Firmas</Link>.</p>
          <button type="button" onClick={() => void onGuardar()} disabled={!cambiado || g.estado === 'guardando'}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Guardar</button>
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
    if (meses && datos?.desde && !window.confirm(`Se borrarán los registros de trazabilidad de más de ${meses} meses. Esto no se puede deshacer. ¿Continuar?`)) return;
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
