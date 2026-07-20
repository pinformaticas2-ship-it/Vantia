import { Request, Response, NextFunction } from 'express';

// Gate de autorización para secciones restringidas a administradores
// (Tesorería). Va DESPUÉS de requireAuth en la cadena de middlewares, o
// puede montarse solo con router.use() ya que clerkMiddleware() + resolveOrg
// (global, server.ts) rellenan req.auth/req.organizacionRol para cualquier
// request con sesión válida, independientemente de si requireAuth ya corrió.
//
// La fuente de verdad del rol es la organización activa (organizacionRol,
// resuelta por el middleware resolveOrg desde organizacion_miembros), no
// publicMetadata.role de Clerk directamente -- así el rol se gestiona desde
// la pantalla "Gestión de Usuarios" en vez de tener que tocar el Dashboard
// de Clerk a mano.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }
  const rol = (req as any).organizacionRol;
  if (rol !== 'admin' && rol !== 'propietario') {
    res.status(403).json({ success: false, error: 'Esta sección es solo para administradores.' });
    return;
  }
  next();
}
