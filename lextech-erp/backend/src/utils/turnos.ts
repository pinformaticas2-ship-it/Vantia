import os from 'os';
import crypto from 'crypto';
import pool from '../config/database';

// ── Turnos de los procesos de fondo (19/10/2026) ─────────────────────────────
// Con varias instancias del backend (p. ej. mientras se despliega), solo una
// debe hacer cada pasada (correo, vistas, soporte). Antes se usaba
// pg_try_advisory_lock, que obliga a RETENER una conexión del pool durante
// toda la pasada -- minutos, en la del correo -- y el pool de Supabase es de
// pocas conexiones: el resto de la app hacía cola (enviar un mensaje tardaba
// segundos). Ahora el turno se apunta en una fila con caducidad: se toma, se
// renueva mientras se trabaja y se suelta al acabar, sin retener nada. Si el
// proceso muere, el turno caduca solo.

const DUENO = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
let tablaLista: Promise<void> | null = null;

function asegurarTabla(): Promise<void> {
  tablaLista ??= pool.query(
    `CREATE TABLE IF NOT EXISTS tareas_turnos (
       nombre TEXT PRIMARY KEY,
       dueno  TEXT NOT NULL,
       hasta  TIMESTAMPTZ NOT NULL
     )`,
  ).then(() => undefined, (e) => { tablaLista = null; throw e; });
  return tablaLista;
}

/** Toma (o renueva, si ya es suyo) el turno durante `ms`. false si lo tiene otra instancia. */
export async function tomarTurno(nombre: string, ms: number): Promise<boolean> {
  await asegurarTabla();
  const { rows } = await pool.query(
    `INSERT INTO tareas_turnos (nombre, dueno, hasta) VALUES ($1, $2, NOW() + $3 * INTERVAL '1 millisecond')
     ON CONFLICT (nombre) DO UPDATE SET dueno = EXCLUDED.dueno, hasta = EXCLUDED.hasta
       WHERE tareas_turnos.hasta < NOW() OR tareas_turnos.dueno = EXCLUDED.dueno
     RETURNING nombre`,
    [nombre, DUENO, ms],
  );
  return rows.length > 0;
}

/** Alarga el turno propio (llamar entre pasos largos). Nunca lanza. */
export async function renovarTurno(nombre: string, ms: number): Promise<void> {
  await pool.query(
    `UPDATE tareas_turnos SET hasta = NOW() + $3 * INTERVAL '1 millisecond' WHERE nombre = $1 AND dueno = $2`,
    [nombre, DUENO, ms],
  ).catch(() => {});
}

/** Deja el turno libre para la siguiente pasada. Nunca lanza. */
export async function soltarTurno(nombre: string): Promise<void> {
  await pool.query(`UPDATE tareas_turnos SET hasta = NOW() WHERE nombre = $1 AND dueno = $2`, [nombre, DUENO]).catch(() => {});
}
