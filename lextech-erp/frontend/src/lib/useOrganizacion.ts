import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch, getActiveOrganizacionId, setActiveOrganizacionId } from './api';

export type OrgRol = 'propietario' | 'admin' | 'miembro';

export interface OrganizacionInfo {
  id: string;
  nombre: string;
}

export interface OrganizacionMembership extends OrganizacionInfo {
  rol: OrgRol;
}

// Organización activa del usuario + todas a las que pertenece (para el
// selector "Seleccionar empresa" del sidebar). Mismo patrón que useIsAdmin.ts,
// pero yendo contra nuestra propia BD (organizacion_miembros) en vez de
// publicMetadata.role de Clerk -- ver backend/src/controllers/organizacionesController.ts.
export function useOrganizacion() {
  const { getToken } = useAuth();
  const [organizacion, setOrganizacion] = useState<OrganizacionInfo | null>(null);
  const [rol, setRol] = useState<OrgRol | null>(null);
  const [organizaciones, setOrganizaciones] = useState<OrganizacionMembership[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch('/api/organizacion', { getToken });
      if (data?.success) {
        setOrganizacion(data.data.organizacion || null);
        setRol(data.data.rol || null);
        setOrganizaciones(data.data.organizaciones || []);
      }
    } catch {
      /* deja isLoaded=true igualmente; los consumidores tratan null como "sin organización" */
    } finally {
      setIsLoaded(true);
    }
  }, [getToken]);

  useEffect(() => { void reload(); }, [reload]);

  // Cambia la organización activa y recarga la app entera -- así todo lo que
  // ya se hubiera cargado (dashboard, listados, VantIA...) se vuelve a pedir
  // con la organización nueva, en vez de tener que invalidar cada página a mano.
  const switchOrganizacion = useCallback((id: string) => {
    setActiveOrganizacionId(id);
    window.location.reload();
  }, []);

  return {
    organizacion,
    rol,
    organizaciones,
    isLoaded,
    reload,
    switchOrganizacion,
    activeOrganizacionId: getActiveOrganizacionId(),
  };
}
