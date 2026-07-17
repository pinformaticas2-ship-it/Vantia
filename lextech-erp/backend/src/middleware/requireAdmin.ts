import { Request, Response, NextFunction } from 'express';
import { resolveUserRole } from '../controllers/activityController';

// Gate de autorización para secciones restringidas a administradores
// (Tesorería). Va DESPUÉS de requireAuth en la cadena de middlewares, o
// puede montarse solo con router.use() ya que clerkMiddleware() (global,
// server.ts) rellena req.auth para cualquier request con sesión válida
// independientemente de si requireAuth ya corrió.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }
  const role = await resolveUserRole(userId);
  if (role !== 'admin') {
    res.status(403).json({ success: false, error: 'Esta sección es solo para administradores.' });
    return;
  }
  next();
}
