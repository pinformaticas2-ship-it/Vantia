import { Request, Response, NextFunction } from 'express';
import { resolvePermission, nivelCubre, Modulo } from '../config/permissions';

// Gate genérico por módulo, montado una vez por router (p.ej.
// `router.use(requireModulePermission('clientes'))` al principio de
// routes/entities.ts) en vez de repetir el chequeo en cada endpoint. El
// nivel exigido se deduce del método HTTP: leer (GET/HEAD) solo necesita
// 'lectura', cualquier otro método (crear/editar/borrar) necesita 'edicion'.
export function requireModulePermission(modulo: Modulo) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const organizacionId = (req as any).organizacionId;
    const rol = (req as any).organizacionRol;
    if (!organizacionId || !rol) {
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }
    const requerido = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'lectura' : 'edicion';
    try {
      const nivel = await resolvePermission(organizacionId, rol, modulo);
      if (!nivelCubre(nivel, requerido)) {
        res.status(403).json({
          success: false,
          error: requerido === 'edicion'
            ? 'No tienes permiso para modificar este módulo.'
            : 'No tienes permiso para ver este módulo.',
        });
        return;
      }
      next();
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || 'Error comprobando permisos.' });
    }
  };
}
