import pool from '../config/database';

// Registro de lo que hacen las automatizaciones (12/11/2026): se ve en
// Ajustes → Automatizaciones («Últimas ejecuciones»). Nunca lanza: registrar
// no puede romper lo que se está haciendo.

export type ClaveAutomatizacion = 'vistas' | 'docsBase' | 'bienvenida' | 'recordatorios';

export async function registrarAutomatizacion(organizacionId: string, clave: ClaveAutomatizacion, ok: boolean, detalle: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO automatizaciones_registro (organizacion_id, clave, ok, detalle) VALUES ($1, $2, $3, $4)`,
      [organizacionId, clave, ok, String(detalle || '').slice(0, 500)],
    );
  } catch { /* sin registro */ }
}

export async function ultimasEjecuciones(organizacionId: string, clave: ClaveAutomatizacion, limite = 5) {
  const { rows } = await pool.query(
    `SELECT ok, detalle, created_at FROM automatizaciones_registro
      WHERE organizacion_id = $1 AND clave = $2 ORDER BY created_at DESC LIMIT $3`,
    [organizacionId, clave, limite],
  ).catch(() => ({ rows: [] as any[] }));
  return rows;
}
