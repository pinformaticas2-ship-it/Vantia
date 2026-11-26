import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, FileText, FolderOpen, Loader2, RefreshCw, AlertTriangle, KeyRound, FilePlus2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso, confirmar } from '../lib/avisos';
import { startGoogleDriveConnect } from '../lib/googleDriveConnect';
import { abrirPickerGoogle, hayPickerGoogle } from '../lib/googlePicker';
import ElegirCarpetaDrive from './ElegirCarpetaDrive';
import ExploradorPlantillas from './ExploradorPlantillas';
import { t } from '../lib/i18n';

// ── Ajustes → Mi Despacho → Plantillas del despacho (15/10/2026) ────────────
// Cada despacho usa las plantillas de una carpeta "Plantillas" de su Google
// Drive o Dropbox. Backend: routes/plantillas.ts + services/plantillasNube.ts.

interface Config {
  origen: 'integradas' | 'drive' | 'dropbox';
  carpetaUrl: string | null;
  carpetaTexto: string | null;
  total: number | null;
  error: string | null;
  conectados: { drive: boolean; dropbox: boolean };
  importacion: { estado: 'importando' | 'hecha' | 'error'; hechos: number; total: number; error?: string } | null;
  hayIntegradas: boolean;
  canManage: boolean;
  carpetaNombre: string | null;
  sePuedeSubir: boolean;
  driveLectura: boolean;
  driveEscritura?: boolean;
  carpetaSelector?: boolean;
  carpetaId?: string | null;
  carpetaPropia?: boolean;
}

export default function PlantillasNubeConfig() {
  const { getToken } = useAuth();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [eligiendo, setEligiendo] = useState(false);

  // Con el selector oficial de Google (si está configurado): la carpeta y las
  // plantillas se eligen en una ventana de Google y Vantia solo recibe acceso
  // a eso (permiso básico drive.file, sin el aviso de "app no verificada").
  const conSelector = hayPickerGoogle();
  const idioma = typeof document !== 'undefined' && document.documentElement.lang?.startsWith('en') ? 'en' : 'es';
  const darAccesoPlantillas = async (carpetaId: string | null | undefined) => {
    if (!carpetaId) return;
    setOcupado('acceso');
    try {
      const elegidos = await abrirPickerGoogle({ modo: 'plantillas', padre: carpetaId, titulo: t("Elige las plantillas y subcarpetas que ya tenéis (Ctrl+A para todas)"), idioma });
      if (elegidos?.length) {
        aviso.ok(t("Vantia ya puede usar {n} elementos más", { n: elegidos.length }));
        await cargar(true); setVersion((v) => v + 1);
      }
    } catch (e: any) { aviso.error(e?.message ? t(e.message) : t("No se pudo abrir la ventana de Google.")); }
    finally { setOcupado(null); }
  };

  // Elegir una carpeta cualquiera del Drive: si aún no hay permiso de
  // lectura, primero se pide a Google (popup) y luego se abre el explorador.
  const elegirCarpeta = async () => {
    if (conSelector) {
      setOcupado('permiso');
      let elegida: { id: string; nombre: string } | undefined;
      try {
        elegida = (await abrirPickerGoogle({ modo: 'carpeta', titulo: t("Elige la carpeta de plantillas"), idioma }))?.[0];
      } catch (e: any) { aviso.error(e?.message ? t(e.message) : t("No se pudo abrir la ventana de Google.")); }
      setOcupado(null);
      if (!elegida) return;
      if (await usarCarpeta({ id: elegida.id, ruta: elegida.nombre }, true)) {
        // Las plantillas que ya hubiera dentro: Google pide elegirlas una vez.
        aviso.info(t("Ahora elige las plantillas que ya tenéis en esa carpeta para que Vantia pueda usarlas."));
        await darAccesoPlantillas(elegida.id);
      }
      return;
    }
    if (cfg?.driveLectura) { setEligiendo(true); return; }
    startGoogleDriveConnect({
      getToken,
      lectura: true,
      onBusy: (b) => setOcupado(b ? 'permiso' : null),
      onError: (m) => { setOcupado(null); aviso.error(m); },
      onConnected: async () => { setOcupado(null); await cargar(); setEligiendo(true); },
    });
  };
  const usarCarpeta = async (c: { id: string; ruta: string }, selector = false): Promise<boolean> => {
    try {
      const r = await apiFetch('/api/plantillas/elegir-carpeta', { method: 'POST', getToken, body: JSON.stringify({ carpetaId: c.id, nombre: c.ruta, selector }) });
      if (r?.success === false) throw new Error(r.error);
      setEligiendo(false);
      aviso.ok(t("Plantillas: se usará la carpeta «{ruta}»", { ruta: c.ruta }));
      await cargar(true); setVersion((v) => v + 1);
      return true;
    } catch (e: any) { aviso.error(e?.message ? t(e.message) : t("No se pudo usar esa carpeta.")); return false; }
  };

  const cargar = useCallback(async (refrescar = false) => {
    try {
      const r = await apiFetch(`/api/plantillas/config${refrescar ? '?refrescar=1' : ''}`, { getToken });
      if (r?.success) setCfg(r.data);
    } catch { /* se queda como estaba */ }
  }, [getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Mientras se importan, se mira el progreso cada 4 s.
  useEffect(() => {
    if (cfg?.importacion?.estado !== 'importando') return;
    const t = setTimeout(() => void cargar(), 4000);
    return () => clearTimeout(t);
  }, [cfg, cargar]);

  const accion = async (clave: string, url: string, body?: any, ok?: string) => {
    setOcupado(clave);
    try {
      const r = await apiFetch(url, { method: 'POST', getToken, body: JSON.stringify(body || {}) });
      if (r?.success === false) throw new Error(r.error);
      if (ok) aviso.ok(ok);
      await cargar();
    } catch (e: any) { aviso.error(e?.message || t("No se pudo hacer.")); }
    finally { setOcupado(null); }
  };

  // Subir y editar en una carpeta elegida del Drive: Google pide el permiso
  // completo de Drive (solo propietario/admin, una vez).
  const pedirEscritura = () => {
    if (!cfg?.canManage) return;
    // Con el selector: basta con volver a elegir la carpeta en la ventana de Google.
    if (conSelector) { void elegirCarpeta(); return; }
    startGoogleDriveConnect({
      getToken,
      escritura: true,
      onBusy: (b) => setOcupado(b ? 'escritura' : null),
      onError: (m) => { setOcupado(null); aviso.error(m); },
      onConnected: async () => { setOcupado(null); aviso.ok(t("Listo: ya se puede subir y editar en esa carpeta")); await cargar(); setVersion((v) => v + 1); },
    });
  };

  // Mientras se lee la carpeta (en Drive puede tardar unos segundos).
  if (!cfg) {
    return (
      <section className="mt-8 bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50"><FileText size={20} className="text-red-600" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-800">{t("Plantillas del despacho")}</h3>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" />{" "}{t("Leyendo vuestra carpeta de plantillas…")}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2 animate-pulse">
          <div className="h-9 rounded-lg bg-slate-100" />
          <div className="h-24 rounded-xl bg-slate-50" />
        </div>
      </section>
    );
  }
  const enNube = cfg.origen !== 'integradas';
  const nubeNombre = cfg.origen === 'drive' ? 'Google Drive' : 'Dropbox';
  const imp = cfg.importacion;

  return (
    <section className="mt-8 bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50"><FileText size={20} className="text-red-600" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-800">{t("Plantillas del despacho")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {enNube
              ? <>{t("Se usan las plantillas de la carpeta")}{" "}<b className="text-slate-700">{cfg.carpetaNombre || t("Plantillas")}</b>{" "}{t("de vuestro")}{" "}{nubeNombre}{cfg.total != null && <> · <b className="text-slate-700">{cfg.total}</b>{" "}{t("plantilla")}{cfg.total === 1 ? '' : 's'}</>}.</>
              : t("Ahora se usan las plantillas integradas de Vantia. Conecta una carpeta de vuestra nube para usar las vuestras.")}
          </p>
        </div>
      </div>

      {cfg.error && <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {cfg.error}</p>}

      {!enNube && cfg.canManage && (
        <div className="mt-4">
          {cfg.conectados.drive || cfg.conectados.dropbox ? (
            <div className="flex flex-wrap gap-2">
              {cfg.conectados.drive && (
                <button type="button" disabled={!!ocupado} onClick={() => void elegirCarpeta()}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {ocupado === 'permiso' ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}{" "}{t("Elegir carpeta de Google Drive")}</button>
              )}
              {cfg.conectados.drive && (
                <button type="button" disabled={!!ocupado} onClick={() => void accion('conectar', '/api/plantillas/conectar', { proveedor: 'drive' }, t('Carpeta «Plantillas» creada en Google Drive'))}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  {ocupado === 'conectar' ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}{" "}{t("Crear una carpeta nueva")}</button>
              )}
              {cfg.conectados.dropbox && (
                <button type="button" disabled={!!ocupado} onClick={() => void accion('conectar', '/api/plantillas/conectar', { proveedor: 'dropbox' }, t('Carpeta «Plantillas» creada en Dropbox'))}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  <FolderOpen size={14} />{" "}{t("Usar una carpeta de Dropbox")}</button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600">{t("Primero conecta Google Drive o Dropbox en")}{" "}<Link to="/dashboard/config?section=integraciones" className="font-semibold text-red-600 hover:underline">{t("Integraciones")}</Link>.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">{conSelector
            ? t("Elige en Google Drive la carpeta donde tenéis las plantillas, o crea una nueva. Vantia solo tendrá acceso a esa carpeta y a lo que elijáis. Desde ese momento este despacho solo verá sus plantillas.")
            : t("Elige la carpeta de vuestro Drive donde tenéis las plantillas (Google pedirá permiso para que Vantia pueda leer vuestro Drive), o crea una nueva. Desde ese momento este despacho solo verá sus plantillas.")}</p>
        </div>
      )}

      {enNube && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {cfg.carpetaUrl && (
              <a href={cfg.carpetaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <ExternalLink size={14} />{" "}{t("Abrir la carpeta")}</a>
            )}
            {cfg.canManage && cfg.origen === 'drive' && (
              <button type="button" disabled={!!ocupado} onClick={() => void elegirCarpeta()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {ocupado === 'permiso' ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}{" "}{t("Cambiar carpeta")}</button>
            )}
            {cfg.canManage && !cfg.sePuedeSubir && cfg.origen === 'drive' && (
              <button type="button" disabled={!!ocupado} onClick={pedirEscritura}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60">
                {ocupado === 'escritura' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}{" "}{t("Permitir subir y editar aquí")}</button>
            )}
            {cfg.canManage && conSelector && cfg.origen === 'drive' && cfg.carpetaId && (
              <button type="button" disabled={!!ocupado} onClick={() => void darAccesoPlantillas(cfg.carpetaId)}
                title={t("Vantia solo ve en vuestro Drive lo que sube ella y lo que elegís aquí")}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {ocupado === 'acceso' ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}{" "}{t("Añadir plantillas que ya están en Drive")}</button>
            )}
            {cfg.canManage && cfg.sePuedeSubir && (
              <>
                {cfg.hayIntegradas && imp?.estado !== 'importando' && (
                  <button type="button" disabled={!!ocupado} onClick={async () => {
                    if (!(await confirmar({ titulo: t("Copiar las plantillas integradas a vuestra carpeta"), mensaje: t("Se copiarán a la carpeta Plantillas de {nubeNombre} (unas 580, con sus subcarpetas). Las que ya estén no se repiten. Tarda unos minutos; puedes seguir trabajando.", { nubeNombre: nubeNombre }), confirmar: t("Copiar") }))) return;
                    void accion('importar', '/api/plantillas/importar-integradas', {}, t('Copiando las plantillas… puedes seguir trabajando'));
                  }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    <Copy size={14} />{" "}{t("Copiar las plantillas integradas")}</button>
                )}
              </>
            )}
            <button type="button" onClick={async () => { setOcupado('recargar'); await cargar(true); setOcupado(null); setVersion((v) => v + 1); }} title={t("Volver a leer la carpeta")} className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50">
              <RefreshCw size={14} className={ocupado === 'recargar' ? 'animate-spin' : ''} />
            </button>
          </div>

          {imp && (
            <div className="text-xs">
              {imp.estado === 'importando' && (
                <div>
                  <p className="text-slate-600 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />{" "}{t("Copiando plantillas:")}{" "}{imp.hechos}{" "}{t("de")}{" "}{imp.total}</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-red-600 transition-all" style={{ width: `${imp.total ? Math.round(100 * imp.hechos / imp.total) : 0}%` }} /></div>
                </div>
              )}
              {imp.estado === 'hecha' && <p className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} />{" "}{t("Plantillas integradas copiadas (")}{imp.total}).</p>}
              {imp.estado === 'error' && <p className="text-amber-700">{t("La copia se paró en")}{" "}{imp.hechos}{" "}{t("de")}{" "}{imp.total}: {imp.error}{t(". Puedes volver a pulsar «Copiar»: seguirá por donde iba.")}</p>}
            </div>
          )}

          <p className="text-xs text-slate-500">
            {cfg.origen === 'drive'
              ? (conSelector && !cfg.driveLectura
                ? t("Vantia solo ve en vuestro Drive las plantillas que sube ella y las que elegís con «Añadir plantillas que ya están en Drive». Si añadís plantillas directamente en Drive, elegidlas ahí una vez.")
                : cfg.driveLectura
                ? t("Añadid, cambiad o borrad las plantillas directamente en esa carpeta de Drive (también con subcarpetas): Vantia las lee de ahí. Sirven los Word (.doc, .docx) y los documentos de Google Docs.")
                : t("Vantia solo puede ver en vuestro Drive lo que ella misma ha subido. Para usar las plantillas que ya tenéis en Drive, pulsa «Cambiar carpeta» y dale permiso de lectura."))
              : <>{t("Lo que pongáis en")}{" "}<b>{cfg.carpetaTexto}</b>{" "}{t("(también desde el Dropbox del ordenador) aparece aquí, con sus subcarpetas.")}</>}
          </p>

          {cfg.canManage && (
            <button type="button" disabled={!!ocupado} onClick={async () => {
              if (!(await confirmar({ titulo: t("Dejar de usar la carpeta de la nube"), mensaje: t("Se volverán a usar las plantillas integradas de Vantia. La carpeta y sus archivos no se borran."), confirmar: t("Dejar de usarla") }))) return;
              void accion('desconectar', '/api/plantillas/desconectar', {}, t('Se vuelven a usar las plantillas integradas'));
            }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{t("Dejar de usar esta carpeta")}</button>
          )}
        </div>
      )}
      {cfg.canManage && (enNube || cfg.hayIntegradas) && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Carpetas y plantillas")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{enNube
            ? t("Sube archivos o carpetas enteras a vuestro {nube}. Con «Variables» marcas en el texto dónde va cada dato y eliges con qué se rellena.", { nube: nubeNombre })
            : t("Con «Variables» eliges con qué se rellena cada dato de una plantilla. Para subir las vuestras o cambiar dónde van las variables, conecta una carpeta de vuestra nube.")}</p>
          <ExploradorPlantillas key={`${cfg.origen}-${version}`} puedeSubir={cfg.sePuedeSubir}
            onPedirPermiso={cfg.origen === 'drive' ? pedirEscritura : undefined} onCambio={() => void cargar()} />
        </div>
      )}
      {eligiendo && <ElegirCarpetaDrive onElegir={async (c) => { await usarCarpeta(c); }} onCerrar={() => setEligiendo(false)} />}
    </section>
  );
}
