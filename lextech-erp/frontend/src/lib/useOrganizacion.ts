import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch, getActiveOrganizacionId, setActiveOrganizacionId } from './api';

export type OrgRol = 'propietario' | 'admin' | 'miembro' | 'soporte';

// Mismos módulos que backend/src/config/permissions.ts -- si se añade uno
// ahí, hay que añadirlo aquí también.
export type Modulo =
  | 'clientes' | 'expedientes' | 'agenda' | 'tareas' | 'chat'
  | 'correo' | 'whatsapp' | 'documental' | 'directorio';

export type NivelAcceso = 'ninguno' | 'lectura' | 'edicion';

export interface OrganizacionInfo {
  id: string;
  nombre: string;
  nifCif?: string | null;
  direccionFiscal?: string | null;
  logoUrl?: string | null;
  textoLegalFacturas?: string | null;
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
  const [permisos, setPermisos] = useState<Record<Modulo, NivelAcceso> | null>(null);
  const [organizaciones, setOrganizaciones] = useState<OrganizacionMembership[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch('/api/organizacion', { getToken });
      if (data?.success) {
        setOrganizacion(data.data.organizacion || null);
        setRol(data.data.rol || null);
        setPermisos(data.data.permisos || null);
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
  // ya se hubiera cargado (dashboard, listados, Vantia...) se vuelve a pedir
  // con la organización nueva, en vez de tener que invalidar cada página a mano.
  const switchOrganizacion = useCallback((id: string) => {
    setActiveOrganizacionId(id);
    window.location.reload();
  }, []);

  // "propietario"/"admin" son compatibilidad hacia atrás: no dependen de la
  // matriz de permisos (siempre tienen acceso completo, ver
  // DEFAULT_PERMISSIONS en el backend), así que se resuelven aparte para que
  // funcione incluso mientras `permisos` todavía está cargando.
  const NIVEL_RANK: Record<NivelAcceso, number> = { ninguno: 0, lectura: 1, edicion: 2 };
  const puede = useCallback((modulo: Modulo, minimo: NivelAcceso = 'lectura'): boolean => {
    if (rol === 'propietario' || rol === 'admin') return true;
    if (!permisos) return true; // aún sin cargar: no bloquear de más mientras se resuelve
    return NIVEL_RANK[permisos[modulo] ?? 'ninguno'] >= NIVEL_RANK[minimo];
  }, [rol, permisos]);

  return {
    organizacion,
    rol,
    permisos,
    puede,
    organizaciones,
    isLoaded,
    reload,
    switchOrganizacion,
    activeOrganizacionId: getActiveOrganizacionId(),
  };
}
