import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { t } from '../lib/i18n';
import Lienzo, { type PasoFijo, type RamaFija } from './automatizaciones/Lienzo';
import type { Catalogo, FlujoDatos } from './automatizaciones/tipos';

// Editor de las automatizaciones de serie (12/11/2026, segunda versión): el
// lienzo libre (components/automatizaciones/Lienzo.tsx) con los pasos de
// serie fijos —se pueden mover y, los opcionales, quitar— y un punto «Al
// terminar» del que cuelgan los pasos propios que se añadan. Esos pasos se
// guardan como un flujo «vinculado» (/api/automatizaciones/flujos) que el
// motor ejecuta cuando termina la automatización de serie.

export type PasoFlujo = PasoFijo;
export type RamaFlujo = RamaFija;
export { Campo, CampoCorreo, CampoLista, campoCls } from './automatizaciones/campos';

const FIN: Record<string, string> = {
  vistas: 'Al aceptar una vista',
  docsBase: 'Al crearse un expediente',
  bienvenida: 'Al dar de alta un cliente',
  recordatorios: 'Al enviar un recordatorio',
};

export default function FlujoEditor({
  titulo, subtitulo, icono, pasos, ramas, descripcion, puedeEditar, sucio, guardando, error, onGuardar, onCerrar, vinculada,
}: {
  titulo: string;
  subtitulo?: string;
  icono: LucideIcon;
  pasos: PasoFlujo[];
  ramas?: RamaFlujo[];
  descripcion?: React.ReactNode;
  puedeEditar: boolean;
  sucio: boolean;
  guardando: boolean;
  error?: string;
  onGuardar: () => void | Promise<void>;
  onCerrar: () => void;
  /** Clave de la automatización de serie (vistas, docsBase, bienvenida, recordatorios). */
  vinculada: string;
}) {
  const { getToken } = useAuth();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [inicial, setInicial] = useState<FlujoDatos | null>(null);
  const [guardandoExtra, setGuardandoExtra] = useState(false);
  const [errorExtra, setErrorExtra] = useState('');
  const [baseExtra, setBaseExtra] = useState('');

  useEffect(() => {
    void (async () => {
      const [c, f] = await Promise.all([
        apiFetch('/api/automatizaciones/catalogo', { getToken }).catch(() => null),
        apiFetch('/api/automatizaciones/flujos', { getToken }).catch(() => null),
      ]);
      if (c?.success) setCatalogo(c.data);
      const fila = (f?.data || []).find((x: any) => x.vinculada === vinculada);
      const datos: FlujoDatos = fila?.flujo?.nodos?.length ? fila.flujo : { nodos: [{ id: 'ancla', tipo: 'disparador', config: {}, x: 0, y: 0 }], aristas: [], layout: fila?.flujo?.layout || {} };
      setInicial(datos);
      setBaseExtra(JSON.stringify({ nodos: datos.nodos, aristas: datos.aristas, layout: datos.layout || {} }));
    })();
  }, [getToken, vinculada]);

  const guardar = async (f: FlujoDatos) => {
    setErrorExtra('');
    if (sucio) await onGuardar();
    const nuevo = JSON.stringify(f);
    if (nuevo === baseExtra) return;
    setGuardandoExtra(true);
    try {
      const propios = f.nodos.filter((n) => n.tipo !== 'disparador').length;
      const r = await apiFetch('/api/automatizaciones/flujos', {
        method: 'POST', getToken,
        body: JSON.stringify({ vinculada, nombre: t('Pasos añadidos a «{nombre}»', { nombre: titulo }), flujo: f, activo: propios > 0 }),
      });
      if (r?.success === false) throw new Error(r.error);
      setBaseExtra(nuevo);
    } catch (e: any) {
      setErrorExtra(e?.message || t('No se pudo guardar'));
      throw e;
    } finally { setGuardandoExtra(false); }
  };

  const probar = async (f: FlujoDatos) => {
    const r = await apiFetch('/api/automatizaciones/probar', { method: 'POST', getToken, body: JSON.stringify({ flujo: f, vinculada }) });
    return r?.success ? r.data : [];
  };

  if (!inicial) {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40">
        <Loader2 className="animate-spin text-white" />
      </div>
    );
  }
  return (
    <Lienzo
      titulo={titulo} subtitulo={subtitulo} icono={icono} catalogo={catalogo}
      inicial={inicial} fijos={{ pasos, ramas, etiquetaFin: t(FIN[vinculada] || 'Al terminar') }} vinculada={vinculada}
      panelGeneral={descripcion ? <div className="text-sm leading-6 text-slate-600">{descripcion}</div> : undefined}
      puedeEditar={puedeEditar} sucioExterno={sucio} guardando={guardando || guardandoExtra} error={error || errorExtra}
      onGuardar={guardar} onProbar={probar} onCerrar={onCerrar}
    />
  );
}
