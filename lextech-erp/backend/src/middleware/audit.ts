import { Request, Response, NextFunction } from 'express';
import pool from '../config/database'; // Tu conexión a Postgres

export const auditLog = (action: string, entity: string) => {
  return async (req: any, res: Response, next: NextFunction) => {
    // Primero dejamos que la operación ocurra
    next();

    // Después registramos (en background, sin bloquear al usuario)
    const userId = req.auth?.userId || 'ANONYMOUS';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const details = JSON.stringify({
        body: req.body,
        query: req.query,
        params: req.params
    });

    try {
        await pool.query(
            `INSERT INTO audit_logs (user_id, action, entity, ip_address, details) 
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, entity, ip, details]
        );
        console.log(`📝 AUDIT: ${action} on ${entity} by ${userId}`);
    } catch (err) {
        console.error("❌ Error guardando auditoría:", err);
    }
  };
};