import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { resolveEffectivePermission, nivelCubre } from '../config/permissions';

// Gate para /api/files/:clientId/... -- ese `:clientId` es en realidad el id de
// una "entidad" que puede ser un cliente (tabla entities) O un expediente
// (tabla expedientes), porque client_files.client_id se reutiliza para ambos.
// Este middleware:
//   1. Resuelve de qué tipo es la entidad y a qué organización pertenece.
//   2. Si no pertenece a la organización activa de quien pide -> 404 (además
//      cierra de paso un agujero de aislamiento entre organizaciones:
//      client_files todavía no tiene organizacion_id propio).
//   3. Comprueba el permiso del módulo correspondiente ('clientes' o
//      'expedientes') con la matriz efectiva (rol + excepción por miembro).
//
// Las rutas de plantillas (/templates/...) y las de token temporal (/dl/...)
// no pasan por aquí -- se montan antes en routes/files.ts.
export async function requireFilesPermission(req: Request, res: Response, next: NextFunction) {
  const organizacionId = (req as any).organizacionId;
  const rol = (req as any).organizacionRol;
  const userId = (req as any).auth?.userId;
  if (!organizacionId || !rol) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }

  const entityId = req.params.clientId;
  if (!entityId) {
    res.status(400).json({ success: false, error: 'Falta el identificador de la entidad.' });
    return;
  }

  try {
    // ¿Cliente o expediente? Se mira en las dos tablas, filtrando ya por la
    // organización activa -- si no aparece en ninguna, o aparece pero es de
    // otra organización, se responde 404 (no 403: mejor no confirmar que el
    // id existe).
    const { rows } = await pool.query(
      `SELECT 'clientes' AS modulo FROM entities WHERE id = $1 AND organizacion_id = $2 AND type = 'CLIENTE'
       UNION ALL
       SELECT 'expedientes' FROM expedientes WHERE id = $1 AND organizacion_id = $2
       LIMIT 1`,
      [entityId, organizacionId],
    );
    const modulo: 'clientes' | 'expedientes' | null = rows[0]?.modulo ?? null;
    if (!modulo) {
      res.status(404).json({ success: false, error: 'No encontrado.' });
      return;
    }

    // temp-token y open-local son operaciones de lectura aunque el método sea
    // POST (generar un enlace de apertura / abrir en la app de escritorio).
    const p = req.path;
    const esLecturaAunquePost = p.endsWith('/temp-token') || p.endsWith('/open-local');
    const requerido = (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || esLecturaAunquePost) ? 'lectura' : 'edicion';

    const nivel = await resolveEffectivePermission(organizacionId, userId, rol, modulo);
    if (!nivelCubre(nivel, requerido)) {
      res.status(403).json({
        success: false,
        error: requerido === 'edicion'
          ? 'No tienes permiso para modificar los archivos de este módulo.'
          : 'No tienes permiso para ver los archivos de este módulo.',
      });
      return;
    }
    next();
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error comprobando permisos.' });
  }
}
