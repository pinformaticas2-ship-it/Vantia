import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from './api';

// Estado de la automatización de vistas por correo para el usuario actual:
// si debe ver el enlace "Vistas" del menú (organización con la automatización
// activada y él es propietario/admin, abogado responsable o dueño del buzón)
// y cuántas vistas tiene pendientes de confirmar. Ver backend
// controllers/vistasController.ts.
export function useVistasStatus(pollMs = 60_000) {
  const { getToken } = useAuth();
  const [visible, setVisible] = useState(false);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const load = async () => {
      try {
        const cfg = await apiFetch('/api/vistas/config?lite=1', { getToken });
        const show = Boolean(cfg?.success && cfg.data?.canSee && cfg.data?.enabled);
        if (cancelled) return;
        setVisible(show);
        if (show) {
          const av = await apiFetch('/api/vistas/avisos', { getToken });
          if (!cancelled && av?.success) setPendientes((av.data || []).filter((a: any) => a.estado === 'pendiente').length);
        } else {
          setPendientes(0);
        }
      } catch { /* sin conexión: se deja como estaba */ }
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

  return { visible, pendientes };
}

/** Avisa al menú y a la campana de que algo cambió (activar, aceptar...). */
export function notifyVistasChanged() {
  window.dispatchEvent(new Event('vistas:changed'));
}
