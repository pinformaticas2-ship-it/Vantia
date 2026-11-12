import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { Building2, Camera, Loader2, Trash2, X } from 'lucide-react';
import { apiFetch, setActiveOrganizacionId } from '../lib/api';
import { t } from '../lib/i18n';

// Crear una organización nueva (12/11/2026): antes era un formulario al final
// de Ajustes → Mi Despacho; ahora se abre desde el selector de despacho de la
// barra lateral. Cualquiera puede crear una (queda como propietario).

export const EVENTO_CREAR_ORGANIZACION = 'vantia:crear-organizacion';
/** Abre esta ventana desde cualquier sitio. */
export function abrirCrearOrganizacion() { window.dispatchEvent(new Event(EVENTO_CREAR_ORGANIZACION)); }

const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-300';

function CrearOrganizacionModal({ onClose }: { onClose: () => void }) {
  const { getToken } = useAuth();
  const [nombre, setNombre] = useState('');
  const [nifCif, setNifCif] = useState('');
  const [direccionFiscal, setDireccionFiscal] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !creando) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creando, onClose]);

  const elegirLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setLogo(f); setPreview(URL.createObjectURL(f));
  };
  const quitarLogo = () => {
    if (preview) URL.revokeObjectURL(preview);
    setLogo(null); setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setCreando(true); setError('');
    try {
      const data = await apiFetch('/api/organizacion', {
        method: 'POST', getToken,
        body: JSON.stringify({ nombre: nombre.trim(), nifCif: nifCif.trim(), direccionFiscal: direccionFiscal.trim() }),
      });
      if (data?.success === false) throw new Error(data.error);
      const id = data.data.id;
      // La nueva pasa a ser la activa antes de subir el logo (la cabecera
      // X-Organizacion-Id tiene que apuntar a ella).
      setActiveOrganizacionId(id);
      if (logo) {
        try {
          const token = await getToken();
          const fd = new FormData();
          fd.append('logo', logo);
          await fetch('/api/organizacion/logo', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        } catch { /* la organización ya existe; el logo se puede poner luego en Mi Despacho */ }
      }
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || t('No se pudo crear la organización.'));
      setCreando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !creando) onClose(); }}>
      <form onSubmit={(e) => void crear(e)} className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-bold text-slate-800">{t('Nueva organización')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('Un despacho o empresa aparte, con sus propios clientes, expedientes y miembros. Serás su propietario.')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={creando} aria-label={t('Cerrar')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => inputRef.current?.click()} title={t('Elegir logotipo')}
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {preview ? <img src={preview} alt={t('Logotipo')} className="h-full w-full object-contain" /> : <Building2 size={22} className="text-slate-300" />}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100"><Camera size={16} /></span>
            </button>
            <input ref={inputRef} type="file" accept="image/*" onChange={elegirLogo} className="hidden" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{t('Logotipo')}{' '}<span className="font-normal text-slate-400">{t('(opcional)')}</span></p>
              <p className="mt-0.5 text-xs text-slate-400">{t('Pulsa el cuadro para elegir una imagen.')}</p>
              {preview && <button type="button" onClick={quitarLogo} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 size={11} />{t('Quitar')}</button>}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">{t('Nombre')}</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('Nombre del nuevo despacho')} className={campo} autoFocus required />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">{t('NIF/CIF')}{' '}<span className="font-normal normal-case text-slate-400">{t('(opcional)')}</span></span>
              <input value={nifCif} onChange={(e) => setNifCif(e.target.value)} placeholder="B12345678" className={campo} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">{t('Dirección fiscal')}{' '}<span className="font-normal normal-case text-slate-400">{t('(opcional)')}</span></span>
              <input value={direccionFiscal} onChange={(e) => setDireccionFiscal(e.target.value)} placeholder={t('Calle, número, ciudad')} className={campo} />
            </label>
          </div>
          <p className="text-xs text-slate-400">{t('El resto (contacto, textos de facturas, plantillas) se completa luego en Ajustes → Mi Despacho.')}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={creando} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('Cancelar')}</button>
          <button type="submit" disabled={creando || !nombre.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            {creando && <Loader2 size={14} className="animate-spin" />}{t('Crear y entrar')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Se monta una vez (en el layout) y abre la ventana cuando se pide. */
export function CrearOrganizacionHost() {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    const abrir = () => setAbierta(true);
    window.addEventListener(EVENTO_CREAR_ORGANIZACION, abrir);
    return () => window.removeEventListener(EVENTO_CREAR_ORGANIZACION, abrir);
  }, []);
  return abierta ? <CrearOrganizacionModal onClose={() => setAbierta(false)} /> : null;
}
