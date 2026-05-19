import { Response, NextFunction } from 'express';
import pool from '../config/database';
import { getClientIp } from '../utils/clientIp';

function getDeviceId(req: any): string | null {
  const raw = req.headers?.['x-device-id'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export const auditLog = (action: string, entity: string) => {
  return async (req: any, _res: Response, next: NextFunction) => {
    next();

    const userId = req.auth()?.userId || 'ANONYMOUS';
    const ip = getClientIp(req);
    const details = JSON.stringify({
      body: req.body,
      query: req.query,
      params: req.params,
      device_id: getDeviceId(req),
    });

    try {
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity, ip_address, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, action, entity, ip, details]
      );
      console.log(`AUDIT: ${action} on ${entity} by ${userId}`);
    } catch (err) {
      console.error('Error guardando auditoria:', err);
    }
  };
};
