import { Request, Response } from 'express';
import pool from '../config/database';
import { resolveUserOrgMemberships } from './organizacionesController';

// ── Pendientes de las otras organizaciones (15/10/2026) ─────────────────────
// La campana solo cuenta lo de la organización abierta. Esto dice, para cada
// organización del usuario, cuánto tiene pendiente: mensajes de chat sin
// leer, vistas por confirmar, plazos que vencen en 3 días o menos y tareas
// suyas que vencen pronto. Así el selector de organización avisa de que hay
// algo esperando en otra. Solo números: ningún contenido de otra organización.

export async function getPendientesOrgs(req: Request, res: Response) {
  const userId: string | undefined = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ success: false });
  try {
    const orgs = (await resolveUserOrgMemberships(userId)).filter((m) => m.rol !== 'soporte').map((m) => m.organizacionId);
    if (!orgs.length) return res.json({ success: true, data: [] });
    const q = (sql: string) => pool.query(sql, [orgs, userId]).then((r) => r.rows).catch(() => [] as any[]);
    const [chat, vistas, plazos, tareas] = await Promise.all([
      q(`SELECT c.organizacion_id AS org, COUNT(*)::int AS n
           FROM chat_canales c
           JOIN chat_miembros m ON m.canal_id = c.id AND m.user_id = $2
           JOIN chat_mensajes msg ON msg.canal_id = c.id
          WHERE c.organizacion_id = ANY($1::uuid[]) AND c.archivado = false
            AND msg.deleted_at IS NULL AND msg.user_id <> $2
            AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)
          GROUP BY 1`),
      q(`SELECT organizacion_id AS org, COUNT(*)::int AS n
           FROM vistas_solicitudes
          WHERE organizacion_id = ANY($1::uuid[]) AND estado IN ('pendiente','error')
            AND (responsable_user_id = $2 OR mailbox_user_id = $2)
          GROUP BY 1`),
      q(`SELECT e.organizacion_id AS org, COUNT(*)::int AS n
           FROM exp_notificaciones n JOIN expedientes e ON e.id = n.expediente_id
          WHERE e.organizacion_id = ANY($1::uuid[]) AND n.estado = 'pendiente'
            AND n.fecha_limite IS NOT NULL AND n.fecha_limite <= CURRENT_DATE + 3
            AND $2::text IS NOT NULL
          GROUP BY 1`),
      q(`SELECT organizacion_id AS org, COUNT(*)::int AS n
           FROM client_tasks
          WHERE organizacion_id = ANY($1::uuid[]) AND user_id = $2
            AND estado <> 'completada' AND plazo IS NOT NULL AND plazo::date <= CURRENT_DATE + 3
          GROUP BY 1`),
    ]);
    const de = (rows: any[], org: string) => rows.find((r) => r.org === org)?.n || 0;
    const data = orgs.map((org) => {
      const d = { chat: de(chat, org), vistas: de(vistas, org), plazos: de(plazos, org), tareas: de(tareas, org) };
      return { organizacionId: org, ...d, total: d.chat + d.vistas + d.plazos + d.tareas };
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
}
