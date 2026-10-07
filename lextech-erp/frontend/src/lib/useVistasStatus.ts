import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from './api';

// Estado de la automatización de vistas por correo para el usuario actual:
// si debe ver el enlace "Vistas" del menú (organización con la automatización
// activada y él es propietario/admin, abogado responsable o dueño del buzón)
// y cuántas vistas tiene pendientes de confirmar. Ver backend
// controllers/vistasController.ts.
// Último estado conocido: el menú ya lo ha cargado, así que la página de Vistas
// (y cualquier otro sitio que use el hook) arranca con él en vez de mostrar un
// spinner mientras vuelve a preguntar. Al cambiar de organización se recarga
// la página, así que no se mezcla entre organizaciones.
let ultimo: { visible: boolean; pendientes: number } | null = null;

export function useVistasStatus(pollMs = 60_000) {
  const { getToken } = useAuth();
  const [visible, setVisible] = useState(ultimo?.visible ?? false);
  const [pendientes, setPendientes] = useState(ultimo?.pendientes ?? 0);
  const [loaded, setLoaded] = useState(ultimo !== null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const load = async () => {
      try {
        const cfg = await apiFetch('/api/vistas/config?lite=1', { getToken });
        const show = Boolean(cfg?.success && cfg.data?.canSee && cfg.data?.enabled);
        if (cancelled) return;
        setVisible(show);
        setLoaded(true);
        if (show) {
          const av = await apiFetch('/api/vistas/avisos', { getToken });
          if (!cancelled && av?.success) {
            const n = (av.data || []).filter((a: any) => a.estado === 'pendiente').length;
            setPendientes(n);
            ultimo = { visible: true, pendientes: n };
          } else if (!cancelled) {
            ultimo = { visible: true, pendientes: ultimo?.pendientes ?? 0 };
          }
        } else {
          setPendientes(0);
          ultimo = { visible: false, pendientes: 0 };
        }
      } catch {
        // Sin conexión: se deja como estaba, pero sin quedarse "cargando" para siempre.
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    timer = window.setInterval(load, pollMs);
    const onChange = () => void load();
    window.addEventListener('vistas:changed', onChange);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener('vistas:changed', onChange);
    };
  }, [getToken, pollMs]);

  return { visible, pendientes, loaded };
}

/** Avisa al menú y a la campana de que algo cambió (activar, aceptar...). */
export function notifyVistasChanged() {
  window.dispatchEvent(new Event('vistas:changed'));
}
