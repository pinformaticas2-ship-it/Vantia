import pool from '../config/database';

// Latido de los procesos de fondo (tabla scheduler_heartbeats): permite ver
// desde la BD si cada programador se está ejecutando de verdad y cómo acabó.
// Nunca lanza: un fallo al anotar no debe parar el proceso que se anota.

export async function heartbeatStart(name: string): Promise<void> {
  await pool.query(
    `INSERT INTO scheduler_heartbeats (name, started_at, updated_at) VALUES ($1, NOW(), NOW())
     ON CONFLICT (name) DO UPDATE SET started_at = NOW(), updated_at = NOW()`,
    [name],
  ).catch(() => {});
}

export async function heartbeatEnd(name: string, details: Record<string, any> = {}, error?: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO scheduler_heartbeats (name, finished_at, last_error, details, updated_at) VALUES ($1, NOW(), $2, $3, NOW())
     ON CONFLICT (name) DO UPDATE SET finished_at = NOW(), last_error = EXCLUDED.last_error, details = EXCLUDED.details, updated_at = NOW()`,
    [name, error || null, JSON.stringify(details)],
  ).catch(() => {});
}
