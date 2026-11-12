import React, { useCallback, useEffect, useState } from 'react';
import { useAuth, useReverification, useUser } from '@clerk/clerk-react';
import QRCode from 'qrcode';
import { Check, Copy, Download, KeyRound, Laptop, Loader2, LogIn, ShieldCheck, Smartphone, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { locale, t } from '../lib/i18n';
import { aviso, confirmar } from '../lib/avisos';
import { CabeceraAjuste, Tarjeta } from './AjustesPaneles';

// ── Seguridad (12/11/2026) ────────────────────────────────────────────────
// Antes era la pantalla completa de Clerk (UserProfile) metida en la página:
// con su propio estilo y mezclando perfil y seguridad. Ahora, con el diseño de
// Vantia y solo lo de seguridad: contraseña, verificación en dos pasos,
// sesiones abiertas y los últimos accesos. Todo va contra Clerk directamente
// (con reverificación cuando Clerk la pide para acciones delicadas).

const boton = 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const botonPrincipal = 'inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60';
const campo = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-600/15';

/** Mensaje claro a partir de un error de Clerk. */
function mensajeClerk(e: any, porDefecto: string): string {
  const err = e?.errors?.[0];
  const codigos: Record<string, string> = {
    form_password_incorrect: t('La contraseña actual no es correcta.'),
    form_password_pwned: t('Tu contraseña ha aparecido en una filtración de datos en Internet.'),
    form_password_length_too_short: t('La contraseña es demasiado corta (mínimo 8 caracteres).'),
    form_password_not_strong_enough: t('Tu contraseña no es lo bastante segura.'),
    form_password_validation_failed: t('La contraseña actual no es correcta.'),
    form_code_incorrect: t('El código no es correcto. Prueba con el que aparece ahora en la app.'),
    form_param_format_invalid: t('El código no es correcto. Prueba con el que aparece ahora en la app.'),
    totp_already_enabled: t('La verificación en dos pasos ya está activada.'),
  };
  if (err?.code && codigos[err.code]) return codigos[err.code];
  if (err?.code === 'feature_not_enabled' || /not enabled|disabled for this instance/i.test(err?.longMessage || ''))
    return t('La verificación en dos pasos no está activada para Vantia. Hay que activarla en el panel de Clerk (Multi-factor → Authenticator app).');
  return err?.longMessage || err?.message || e?.message || porDefecto;
}

function navegadorDe(ua?: string | null): string {
  if (!ua) return '';
  const nav = /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : '';
  const so = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Macintosh|Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  return nav && so ? t('{navegador} en {sistema}', { navegador: nav, sistema: so }) : nav || so;
}

const fecha = (d: Date | string | number) => new Date(d).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ── Contraseña ─────────────────────────────────────────────────────────────
function TarjetaContrasena() {
  const { user } = useUser();
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cerrarOtras, setCerrarOtras] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const actualizar = useReverification((datos: Parameters<NonNullable<typeof user>['updatePassword']>[0]) => user!.updatePassword(datos));
  const tiene = !!user?.passwordEnabled;

  const cerrar = () => { setAbierto(false); setActual(''); setNueva(''); setRepetir(''); setError(''); };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) { setError(t('La contraseña es demasiado corta (mínimo 8 caracteres).')); return; }
    if (nueva !== repetir) { setError(t('Las dos contraseñas nuevas no coinciden.')); return; }
    setGuardando(true);
    try {
      await actualizar({ ...(tiene ? { currentPassword: actual } : {}), newPassword: nueva, signOutOfOtherSessions: cerrarOtras });
      aviso.ok(t('Contraseña cambiada.'));
      cerrar();
    } catch (err: any) {
      setError(mensajeClerk(err, t('No se pudo cambiar la contraseña.')));
    } finally { setGuardando(false); }
  };

  return (
    <Tarjeta titulo={t('Contraseña')}>
      {!abierto ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <KeyRound size={18} className="mt-0.5 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">{tiene
              ? t('Tu cuenta tiene contraseña. Cámbiala si crees que alguien más la conoce.')
              : t('Entras con Google y aún no tienes contraseña propia. Puedes crear una para entrar también con tu correo.')}</p>
          </div>
          <button type="button" className={boton} onClick={() => setAbierto(true)}>{tiene ? t('Cambiar contraseña') : t('Crear contraseña')}</button>
        </div>
      ) : (
        <form onSubmit={(e) => void guardar(e)} className="max-w-md space-y-3">
          {tiene && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">{t('Contraseña actual')}</span>
              <input type="password" autoComplete="current-password" className={campo} value={actual} onChange={(e) => setActual(e.target.value)} required autoFocus />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t('Contraseña nueva')}</span>
            <input type="password" autoComplete="new-password" className={campo} value={nueva} onChange={(e) => setNueva(e.target.value)} required autoFocus={!tiene} />
            <span className="mt-1 block text-[11px] text-slate-400">{t('Mínimo 8 caracteres. Mejor una frase larga que una palabra con símbolos.')}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t('Repite la contraseña nueva')}</span>
            <input type="password" autoComplete="new-password" className={campo} value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={cerrarOtras} onChange={(e) => setCerrarOtras(e.target.checked)} className="accent-red-600" />
            {t('Cerrar la sesión en los demás dispositivos')}
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" className={botonPrincipal} disabled={guardando}>{guardando && <Loader2 size={14} className="animate-spin" />}{t('Guardar contraseña')}</button>
            <button type="button" className={boton} onClick={cerrar} disabled={guardando}>{t('Cancelar')}</button>
          </div>
        </form>
      )}
    </Tarjeta>
  );
}

// ── Verificación en dos pasos ──────────────────────────────────────────────
function CodigosRespaldo({ codigos, onListo }: { codigos: string[]; onListo: () => void }) {
  const texto = codigos.join('\n');
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([`${t('Códigos de respaldo de Vantia')}\n\n${texto}\n`], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'vantia-codigos-respaldo.txt'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">{t('Guarda estos códigos de respaldo')}</p>
      <p className="mt-1 text-xs text-amber-800">{t('Si pierdes el móvil, cada código sirve una vez para entrar. Solo se muestran ahora.')}</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm text-slate-800 sm:grid-cols-5" data-sin-traducir>
        {codigos.map((c) => <span key={c} className="rounded bg-white px-2 py-1 text-center">{c}</span>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={boton} onClick={() => { void navigator.clipboard?.writeText(texto); aviso.ok(t('Códigos copiados.')); }}><Copy size={14} />{t('Copiar')}</button>
        <button type="button" className={boton} onClick={descargar}><Download size={14} />{t('Descargar')}</button>
        <button type="button" className={botonPrincipal} onClick={onListo}><Check size={14} />{t('Ya los he guardado')}</button>
      </div>
    </div>
  );
}

function TarjetaDosPasos() {
  const { user } = useUser();
  const [paso, setPaso] = useState<'' | 'qr' | 'codigos'>('');
  const [secreto, setSecreto] = useState('');
  const [qr, setQr] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigos, setCodigos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const crearTotp = useReverification(() => user!.createTOTP());
  const desactivarTotp = useReverification(() => user!.disableTOTP());
  const crearCodigos = useReverification(() => user!.createBackupCode());
  const activo = !!user?.totpEnabled;

  const empezar = async () => {
    setOcupado(true); setError('');
    try {
      const totp = await crearTotp();
      if (!totp?.uri) throw new Error(t('No se pudo preparar la verificación en dos pasos.'));
      setSecreto(totp.secret || '');
      setQr(await QRCode.toDataURL(totp.uri, { margin: 1, width: 180 }));
      setPaso('qr');
    } catch (e: any) { setError(mensajeClerk(e, t('No se pudo preparar la verificación en dos pasos.'))); } finally { setOcupado(false); }
  };

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true); setError('');
    try {
      await user!.verifyTOTP({ code: codigo.replace(/\s/g, '') });
      const res = await crearCodigos();
      setCodigos(res?.codes || []);
      setPaso(res?.codes?.length ? 'codigos' : '');
      setCodigo('');
      await user!.reload();
      aviso.ok(t('Verificación en dos pasos activada.'));
    } catch (err: any) { setError(mensajeClerk(err, t('El código no es correcto. Prueba con el que aparece ahora en la app.'))); } finally { setOcupado(false); }
  };

  const nuevosCodigos = async () => {
    if (!(await confirmar({ titulo: t('¿Generar códigos de respaldo nuevos?'), mensaje: t('Los códigos que tenías dejarán de servir.'), confirmar: t('Generar') }))) return;
    setOcupado(true); setError('');
    try { const res = await crearCodigos(); setCodigos(res?.codes || []); setPaso('codigos'); }
    catch (e: any) { setError(mensajeClerk(e, t('No se pudieron generar los códigos.'))); } finally { setOcupado(false); }
  };

  const desactivar = async () => {
    if (!(await confirmar({ titulo: t('¿Desactivar la verificación en dos pasos?'), mensaje: t('Para entrar bastará con la contraseña. Tu cuenta quedará menos protegida.'), confirmar: t('Desactivar'), peligro: true }))) return;
    setOcupado(true); setError('');
    try { await desactivarTotp(); await user!.reload(); aviso.ok(t('Verificación en dos pasos desactivada.')); }
    catch (e: any) { setError(mensajeClerk(e, t('No se pudo desactivar.'))); } finally { setOcupado(false); }
  };

  const estado = (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {activo ? t('Activada') : t('Desactivada')}
    </span>
  );

  return (
    <Tarjeta titulo={t('Verificación en dos pasos')} extra={estado}>
      {paso === 'qr' ? (
        <form onSubmit={(e) => void verificar(e)} className="flex flex-col gap-5 sm:flex-row">
          {qr && <img src={qr} alt={t('Código QR para la app de autenticación')} className="h-44 w-44 shrink-0 rounded-lg border border-slate-200 bg-white p-1" />}
          <div className="min-w-0 flex-1 space-y-3">
            <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-600">
              <li>{t('Abre una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).')}</li>
              <li>{t('Escanea el código QR. Si no puedes, escribe esta clave:')} <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800" data-sin-traducir>{secreto}</code></li>
              <li>{t('Escribe el código de 6 cifras que te muestra la app.')}</li>
            </ol>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="123456" className={`${campo} max-w-[10rem] font-mono tracking-widest`} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className={botonPrincipal} disabled={ocupado || codigo.replace(/\s/g, '').length < 6}>{ocupado && <Loader2 size={14} className="animate-spin" />}{t('Activar')}</button>
              <button type="button" className={boton} onClick={() => { setPaso(''); setError(''); }} disabled={ocupado}>{t('Cancelar')}</button>
            </div>
          </div>
        </form>
      ) : paso === 'codigos' ? (
        <CodigosRespaldo codigos={codigos} onListo={() => { setPaso(''); setCodigos([]); }} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Smartphone size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="text-sm text-slate-600">{activo
                ? t('Al entrar, además de la contraseña, se pide un código de tu app de autenticación.')
                : t('Pide un código de tu móvil además de la contraseña. Aunque alguien la averigüe, no podrá entrar.')}</p>
            </div>
            {!activo && <button type="button" className={botonPrincipal} onClick={() => void empezar()} disabled={ocupado}>{ocupado && <Loader2 size={14} className="animate-spin" />}{t('Activar')}</button>}
          </div>
          {activo && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={boton} onClick={() => void nuevosCodigos()} disabled={ocupado}>{t('Códigos de respaldo nuevos')}</button>
              <button type="button" className={`${boton} text-red-600`} onClick={() => void desactivar()} disabled={ocupado}>{t('Desactivar')}</button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Tarjeta>
  );
}

// ── Sesiones abiertas ──────────────────────────────────────────────────────
function TarjetaSesiones() {
  const { user } = useUser();
  const { sessionId } = useAuth();
  const [sesiones, setSesiones] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState('');

  const cargar = useCallback(async () => {
    if (!user) return;
    try {
      const lista = await user.getSessions();
      setSesiones([...lista].filter((s: any) => s.status === 'active')
        .sort((a: any, b: any) => (a.id === sessionId ? -1 : b.id === sessionId ? 1 : +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt))));
    } catch (e: any) { setError(mensajeClerk(e, t('No se pudieron cargar las sesiones.'))); setSesiones([]); }
  }, [user, sessionId]);
  useEffect(() => { void cargar(); }, [cargar]);

  const cerrarSesion = async (s: any) => {
    setCerrando(s.id);
    try { await s.revoke(); await cargar(); }
    catch (e: any) { setError(mensajeClerk(e, t('No se pudo cerrar la sesión.'))); } finally { setCerrando(''); }
  };
  const otras = (sesiones || []).filter((s) => s.id !== sessionId);
  const cerrarOtras = async () => {
    if (!(await confirmar({ titulo: t('¿Cerrar la sesión en los demás dispositivos?'), mensaje: t('Tendrán que volver a entrar con tu contraseña.'), confirmar: t('Cerrar sesiones') }))) return;
    setCerrando('todas');
    try { await Promise.all(otras.map((s) => s.revoke())); await cargar(); }
    catch (e: any) { setError(mensajeClerk(e, t('No se pudo cerrar la sesión.'))); } finally { setCerrando(''); }
  };

  return (
    <Tarjeta titulo={t('Sesiones abiertas')}
      extra={otras.length > 1 ? <button type="button" className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60" onClick={() => void cerrarOtras()} disabled={!!cerrando}>{t('Cerrar todas las demás')}</button> : undefined}>
      {sesiones === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" />{t('Cargando…')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sesiones.map((s) => {
            const a = s.latestActivity || {};
            const actual = s.id === sessionId;
            const Icono = a.isMobile ? Smartphone : Laptop;
            const lugar = [a.city, a.country].filter(Boolean).join(', ');
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icono size={17} /></div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {[a.browserName, a.deviceType].filter(Boolean).join(' · ') || t('Dispositivo desconocido')}
                    {actual && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{t('Este dispositivo')}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[lugar, a.ipAddress].filter(Boolean).join(' · ')}{(lugar || a.ipAddress) ? ' · ' : ''}{t('Última actividad: {fecha}', { fecha: fecha(s.lastActiveAt) })}
                  </p>
                </div>
                {!actual && (
                  <button type="button" className={`${boton} px-3 py-1.5 text-xs`} onClick={() => void cerrarSesion(s)} disabled={!!cerrando}>
                    {cerrando === s.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}{t('Cerrar')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Tarjeta>
  );
}

// ── Tus últimos accesos ────────────────────────────────────────────────────
function TarjetaAccesos() {
  const { getToken } = useAuth();
  const [accesos, setAccesos] = useState<any[] | null>(null);
  useEffect(() => {
    apiFetch('/api/activity/me?event_type=LOGIN&limit=10', { getToken })
      .then((res) => setAccesos(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setAccesos([]));
  }, [getToken]);

  return (
    <Tarjeta titulo={t('Tus últimos accesos')}>
      <p className="mb-3 text-xs text-slate-500">{t('Cuándo y desde dónde has entrado en este despacho. Si ves algo que no reconoces, cambia la contraseña y cierra las demás sesiones.')}</p>
      {accesos === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" />{t('Cargando…')}</p>
      ) : accesos.length === 0 ? (
        <p className="text-sm text-slate-400">{t('Todavía no hay accesos registrados.')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {accesos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <LogIn size={15} className="shrink-0 text-slate-400" />
              <span className="min-w-[10rem] text-sm font-medium text-slate-700">{fecha(a.created_at)}</span>
              <span className="text-xs text-slate-500">{[navegadorDe(a.user_agent), a.ip_address].filter(Boolean).join(' · ') || '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

export function SeguridadPanel() {
  return (
    <div className="space-y-6">
      <CabeceraAjuste icon={ShieldCheck} titulo={t('Seguridad')}
        descripcion={t('Tu contraseña, la verificación en dos pasos y dónde tienes la sesión abierta.')} />
      <TarjetaContrasena />
      <TarjetaDosPasos />
      <TarjetaSesiones />
      <TarjetaAccesos />
    </div>
  );
}
