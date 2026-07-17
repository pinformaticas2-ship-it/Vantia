import { useUser } from "@clerk/clerk-react";

// Rol guardado en publicMetadata.role (Clerk) -- fuente de verdad para
// mostrar/ocultar UI de Tesorería. Esto es solo para la experiencia visual;
// la autorización real siempre se vuelve a comprobar en el backend
// (requireAdmin) antes de dejar leer o escribir nada de Tesorería.
export function useIsAdmin(): { isAdmin: boolean; isLoaded: boolean } {
  const { user, isLoaded } = useUser();
  const role = (user?.publicMetadata as any)?.role;
  return { isAdmin: role === "admin", isLoaded };
}
