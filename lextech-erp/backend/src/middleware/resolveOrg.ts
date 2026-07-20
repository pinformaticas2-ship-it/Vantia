import { Request, Response, NextFunction } from 'express';
import { resolveUserOrgMemberships } from '../controllers/organizacionesController';

// Resuelve la organización activa de la petición y la deja en
// req.organizacionId / req.organizacionRol para que cualquier controlador
// la use sin tener que resolverla por su cuenta. Middleware global (montado
// una vez en server.ts, justo después de clerkMiddleware()): no-op en rutas
// sin sesión (booking público, invitaciones de cliente, etc.).
//
// El cliente puede pedir una organización concreta con la cabecera
// X-Organizacion-Id (para el selector de "cambiar de organización" del
// sidebar) -- pero solo se respeta si el usuario es realmente miembro de
// esa organización; nunca se confía ciegamente en lo que mande el cliente.
export async function resolveOrg(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).auth?.userId;
  if (!userId) return next();

  try {
    const memberships = await resolveUserOrgMemberships(userId);
    if (memberships.length === 0) return next();

    const requestedId = req.headers['x-organizacion-id'];
    const requested = typeof requestedId === 'string'
      ? memberships.find((m) => m.organizacionId === requestedId)
      : undefined;

    const active = requested || memberships[0];
    (req as any).organizacionId = active.organizacionId;
    (req as any).organizacionRol = active.rol;
  } catch {
    // Si falla la resolución (BD caída puntualmente, etc.), no bloqueamos la
    // petición aquí -- los endpoints que de verdad necesiten organizacionId
    // fallan de forma controlada más abajo (ver requireOrgContext).
  }

  next();
}
