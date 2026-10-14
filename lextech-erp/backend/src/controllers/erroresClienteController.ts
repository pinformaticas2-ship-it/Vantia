import { Request, Response } from 'express';
import pool from '../config/database';

// ── Errores de la app en el navegador (16/10/2026) ──────────────────────────
// Cuando una pantalla falla, el frontend muestra "Algo ha fallado" en vez de
// una página en blanco y manda aquí qué pasó, para enterarnos sin esperar a
// que nos lo cuente nadie. Tabla: errores_cliente (ver migrations.ts).

const LIMITE_POR_USUARIO = 30;           // como mucho 30 errores...
const VENTANA_MS = 10 * 60 * 1000;       // ...cada 10 minutos por usuario
const recientes = new Map<string, number[]>();

const recortar = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
};

export const registrarErrorCliente = async (req: Request, res: Response) => {
  const userId: string | undefined = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ success: false });
  const ahora = Date.now();
  const lista = (recientes.get(userId) || []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length >= LIMITE_POR_USUARIO) return res.status(429).json({ success: false });
  lista.push(ahora);
  recientes.set(userId, lista);

  const b = req.body || {};
  const mensaje = recortar(b.mensaje, 1000);
  if (!mensaje) return res.status(400).json({ success: false });
  try {
    await pool.query(
      `INSERT INTO errores_cliente (organizacion_id, user_id, tipo, mensaje, stack, component_stack, ruta, version, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        (req as any).organizacionId || null, userId, recortar(b.tipo, 30) || 'pantalla', mensaje,
        recortar(b.stack, 8000), recortar(b.componentStack, 8000), recortar(b.ruta, 500),
        recortar(b.version, 80), recortar(req.headers['user-agent'], 400),
      ],
    );
    console.warn(`[error-cliente] ${userId} ${b.ruta || ''} :: ${mensaje}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[error-cliente] no se pudo guardar:', e?.message);
    res.status(500).json({ success: false });
  }
};

/** Los últimos errores del despacho (propietario/administrador). */
export const listarErroresCliente = async (req: Request, res: Response) => {
  if (!['propietario', 'admin'].includes((req as any).organizacionRol)) {
    return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", tipo, mensaje, ruta, version, created_at AS "createdAt"
         FROM errores_cliente WHERE organizacion_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [(req as any).organizacionId],
    );
    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
};

/** Se guardan 90 días. */
export function startPurgaErroresCliente() {
  const purgar = () => pool.query(`DELETE FROM errores_cliente WHERE created_at < NOW() - INTERVAL '90 days'`).catch(() => {});
  setTimeout(purgar, 60_000);
  setInterval(purgar, 24 * 60 * 60 * 1000);
}
