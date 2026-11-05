import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch, getActiveOrganizacionId, setActiveOrganizacionId } from './api';

export type OrgRol = 'propietario' | 'admin' | 'miembro' | 'soporte';

// Mismos módulos que backend/src/config/permissions.ts -- si se añade uno
// ahí, hay que añadirlo aquí también.
export type Modulo =
  | 'clientes' | 'expedientes' | 'agenda' | 'tareas' | 'chat'
  | 'correo' | 'whatsapp' | 'documental' | 'directorio' | 'facturacion';

export type NivelAcceso = 'ninguno' | 'lectura' | 'edicion';

export interface OrganizacionInfo {
  id: string;
  nombre: string;
  nifCif?: string | null;
  direccionFiscal?: string | null;
  telefono?: string | null;
  emailContacto?: string | null;
  web?: string | null;
  logoUrl?: string | null;
  textoLegalFacturas?: string | null;
  clientWelcomeEmailSubject?: string | null;
  clientWelcomeEmailBody?: string | null;
  clientWelcomeEmailSignature?: string | null;
  googleDriveConnected?: boolean;
  googleDriveEmail?: string | null;
  googleDriveHasError?: boolean;
  googleDriveErrorMessage?: string | null;
  dropboxConnected?: boolean;
  dropboxEmail?: string | null;
  documentStorageMode?: 'auto' | 'ask';
  documentStorageDefaultProvider?: 'drive' | 'dropbox';
}

// La organización en la que el backend está trabajando de verdad (puede no
// coincidir con la preferencia guardada si esta ya no es válida). Para quien
// necesite saberlo fuera de React, p. ej. los borradores (lib/borradores).
let orgResuelta: string | null = null;
export const getOrganizacionResuelta = () => orgResuelta;

export interface OrganizacionMembership extends OrganizacionInfo {
  rol: OrgRol;
}

// Respuesta de /api/organizacion compartida por todos los que usan el hook
// (la pantalla de "sin despacho", el layout, el sidebar, las páginas...). Así
// la primera carga hace UNA petición y quien se monta después ya tiene el dato
// al instante, sin parpadeos de "cargando". Va atada al usuario de Clerk para
// que un cambio de sesión en la misma pestaña nunca vea la del anterior.
type DatosOrg = {
  organizacion: OrganizacionInfo | null;
  rol: OrgRol | null;
  permisos: Record<Modulo, NivelAcceso> | null;
  organizaciones: OrganizacionMembership[];
  sinOrganizacion: boolean;
};
let compartido: { userId: string; datos: DatosOrg; at: number } | null = null;
// Pasado este rato, quien monte el hook pinta lo guardado al instante y lo
// refresca por detrás (p. ej. si un admin te ha cambiado los permisos).
const FRESCO_MS = 30_000;
let enCurso: { userId: string; promesa: Promise<DatosOrg | null> } | null = null;

async function pedirOrganizacion(userId: string, getToken: () => Promise<string | null>, forzar: boolean) {
  if (!forzar && compartido?.userId === userId && Date.now() - compartido.at < FRESCO_MS) return compartido.datos;
  if (!forzar && enCurso?.userId === userId) return enCurso.promesa;
  const promesa = (async (): Promise<DatosOrg | null> => {
    try {
      const data = await apiFetch('/api/organizacion', { getToken });
      if (!data?.success) return null;
      return {
        organizacion: data.data.organizacion || null,
        rol: data.data.rol || null,
        permisos: data.data.permisos || null,
        organizaciones: data.data.organizaciones || [],
        sinOrganizacion: Boolean(data.data.sinOrganizacion),
      };
    } catch {
      return null; // los consumidores tratan null como "sin organización"
    }
  })();
  enCurso = { userId, promesa };
  const datos = await promesa;
  if (enCurso?.promesa === promesa) enCurso = null;
  // Un fallo de red no se guarda: el siguiente que monte lo vuelve a intentar.
  if (datos) {
    compartido = { userId, datos, at: Date.now() };
    orgResuelta = datos.organizacion?.id || null;
  }
  return datos;
}

// Organización activa del usuario + todas a las que pertenece (para el
// selector "Seleccionar empresa" del sidebar). Mismo patrón que useIsAdmin.ts,
// pero yendo contra nuestra propia BD (organizacion_miembros) en vez de
// publicMetadata.role de Clerk -- ver backend/src/controllers/organizacionesController.ts.
export function useOrganizacion() {
  const { getToken, userId } = useAuth();
  const inicial = userId && compartido?.userId === userId ? compartido.datos : null;
  const [organizacion, setOrganizacion] = useState<OrganizacionInfo | null>(inicial?.organizacion ?? null);
  const [rol, setRol] = useState<OrgRol | null>(inicial?.rol ?? null);
  const [permisos, setPermisos] = useState<Record<Modulo, NivelAcceso> | null>(inicial?.permisos ?? null);
  const [organizaciones, setOrganizaciones] = useState<OrganizacionMembership[]>(inicial?.organizaciones ?? []);
  const [isLoaded, setIsLoaded] = useState(Boolean(inicial));
  // El backend dice explícitamente que el usuario no pertenece a ningún despacho
  // (no es lo mismo que "aún cargando" ni que "falló la petición").
  const [sinOrganizacion, setSinOrganizacion] = useState(inicial?.sinOrganizacion ?? false);

  const cargar = useCallback(async (forzar: boolean) => {
    if (!userId) return;
    const datos = await pedirOrganizacion(userId, getToken, forzar);
    if (datos) {
      setSinOrganizacion(datos.sinOrganizacion);
      setOrganizacion(datos.organizacion);
      setRol(datos.rol);
      setPermisos(datos.permisos);
      setOrganizaciones(datos.organizaciones);
    }
    setIsLoaded(true);
  }, [getToken, userId]);

  const reload = useCallback(() => cargar(true), [cargar]);

  useEffect(() => { void cargar(false); }, [cargar]);

  // Cambia la organización activa y recarga la app entera -- así todo lo que
  // ya se hubiera cargado (dashboard, listados, Vantia...) se vuelve a pedir
  // con la organización nueva, en vez de tener que invalidar cada página a mano.
  const switchOrganizacion = useCallback((id: string) => {
    setActiveOrganizacionId(id);
    window.location.reload();
  }, []);

  // "propietario" es el único que de verdad no depende nunca de la matriz de
  // permisos (siempre tiene acceso completo, y no admite excepciones ni de
  // rol ni de miembro individual -- ver DEFAULT_PERMISSIONS/resolveEffective
  // Permission en el backend), así que se resuelve aparte para que funcione
  // incluso mientras `permisos` todavía está cargando. "admin" YA NO tiene
  // ese atajo: por defecto tiene acceso completo igual, pero el propietario
  // puede haberle quitado un módulo concreto (excepción por miembro), y esa
  // excepción vive en `permisos` como a cualquier otro rol -- si se seguía
  // devolviendo true a ciegas para admin, esa excepción nunca se notaba en
  // el sidebar/gating del frontend aunque el backend sí la hiciera cumplir.
  const NIVEL_RANK: Record<NivelAcceso, number> = { ninguno: 0, lectura: 1, edicion: 2 };
  const puede = useCallback((modulo: Modulo, minimo: NivelAcceso = 'lectura'): boolean => {
    if (rol === 'propietario') return true;
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
    sinOrganizacion,
    reload,
    switchOrganizacion,
    activeOrganizacionId: getActiveOrganizacionId(),
  };
}
