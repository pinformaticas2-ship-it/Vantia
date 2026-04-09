import { Request, Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';

// ── GET /api/tasks/client/:clientId ────────────────────────────
export const getTasks = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM client_tasks WHERE client_id = $1 ORDER BY
        CASE estado WHEN 'urgente' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END,
        plazo ASC NULLS LAST,
        created_at DESC`,
      [clientId]
    );
    res.json({ data: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/tasks/me ── tareas del usuario autenticado ────────
export const getMyTasks = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const result = await pool.query(
      `SELECT ct.*,
              COALESCE(e.commercial_name, e.first_name || ' ' || COALESCE(e.last_name,'')) AS client_name_resolved
       FROM client_tasks ct
       LEFT JOIN entities e ON e.id = ct.client_id
       WHERE ct.user_id = $1
       ORDER BY
         CASE ct.estado WHEN 'urgente' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END,
         ct.plazo ASC NULLS LAST,
         ct.created_at DESC`,
      [userId]
    );
    res.json({ data: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── POST /api/tasks/client/:clientId ───────────────────────────
export const createTask = async (req: any, res: Response) => {
  const { clientId } = req.params;
  const { titulo, descripcion, plazo, fecha_aviso, estado, prioridad, expediente, expediente_id, tipo, juzgado, num_proc, importe, notas, etapa } = req.body;

  if (!titulo?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

  const userId   = req.auth?.userId || 'SYSTEM';
  const userName = await resolveUserName(userId);

  try {
    // Obtener nombre del cliente para guardarlo en la tarea
    const clientRow = await pool.query(
      `SELECT COALESCE(commercial_name, first_name || ' ' || COALESCE(last_name,'')) AS name FROM entities WHERE id = $1`,
      [clientId]
    );
    const clientName = clientRow.rows[0]?.name || null;

    const result = await pool.query(
      `INSERT INTO client_tasks
         (client_id, client_name, titulo, descripcion, plazo, fecha_aviso, estado, prioridad,
          expediente, expediente_id, tipo, juzgado, num_proc, importe, notas, etapa, created_by, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        clientId, clientName,
        titulo.trim(),
        descripcion?.trim() || null,
        plazo || null,
        fecha_aviso || null,
        estado || 'pendiente',
        prioridad || 'media',
        expediente?.trim() || null,
        expediente_id || null,
        tipo || 'otro',
        juzgado?.trim() || null,
        num_proc?.trim() || null,
        importe ? parseFloat(importe) : null,
        notas?.trim() || null,
        etapa?.trim() || null,
        userName,
        userId,
      ]
    );
    logActivityForReq(req, `Tarea creada: ${titulo.trim()}`, 'CLIENT', clientId);
    res.status(201).json({ data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── PUT /api/tasks/:id ─────────────────────────────────────────
export const updateTask = async (req: any, res: Response) => {
  const { id } = req.params;
  const { titulo, descripcion, plazo, fecha_aviso, estado, prioridad, expediente, tipo, juzgado, num_proc, importe, notas, etapa } = req.body;

  try {
    const result = await pool.query(
      `UPDATE client_tasks
       SET titulo=$1, descripcion=$2, plazo=$3, fecha_aviso=$4, estado=$5, prioridad=$6,
           expediente=$7, tipo=$8, juzgado=$9, num_proc=$10,
           importe=$11, notas=$12, etapa=$13, updated_at=NOW()
       WHERE id=$14
       RETURNING *`,
      [
        titulo?.trim(),
        descripcion?.trim() || null,
        plazo || null,
        fecha_aviso || null,
        estado,
        prioridad,
        expediente?.trim() || null,
        tipo || 'otro',
        juzgado?.trim() || null,
        num_proc?.trim() || null,
        importe ? parseFloat(importe) : null,
        notas?.trim() || null,
        etapa?.trim() || null,
        id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── PATCH /api/tasks/:id/estado ── (completar / reabrir rápido) ─
export const patchTaskEstado = async (req: any, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body;
  if (!['pendiente', 'urgente', 'completada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const result = await pool.query(
      `UPDATE client_tasks SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [estado, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── DELETE /api/tasks/:id ──────────────────────────────────────
export const deleteTask = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`DELETE FROM client_tasks WHERE id=$1 RETURNING titulo, client_id`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    logActivityForReq(req, `Tarea eliminada: ${rows[0].titulo}`, 'CLIENT', rows[0].client_id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/tasks/indicators/:clientId ────────────────────────
// Devuelve métricas calculadas para el panel lateral de indicadores
export const getIndicators = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    // Tareas
    const tasksQ = await pool.query(
      `SELECT
        COUNT(*)                                                           AS total_tareas,
        COUNT(*) FILTER (WHERE estado != 'completada')                     AS tareas_pendientes,
        COUNT(*) FILTER (WHERE estado = 'urgente')                         AS tareas_urgentes,
        COUNT(*) FILTER (WHERE estado != 'completada' AND plazo < NOW())   AS tareas_vencidas,
        COUNT(*) FILTER (WHERE estado = 'completada')                      AS tareas_completadas
       FROM client_tasks WHERE client_id = $1`,
      [clientId]
    );

    // Archivos
    const filesQ = await pool.query(
      `SELECT COUNT(*) AS total_archivos FROM client_files WHERE client_id = $1`,
      [clientId]
    );

    // Notas
    const notesQ = await pool.query(
      `SELECT COUNT(*) AS total_notas FROM notes WHERE client_id = $1`,
      [clientId]
    );

    // Actuaciones (activity_log)
    const actQ = await pool.query(
      `SELECT MAX(created_at) AS ultima_actuacion,
              COUNT(*)::int   AS total_actuaciones
       FROM activity_log
       WHERE entity_id = $1 AND entity_type = 'CLIENT'
         AND action_type NOT LIKE 'Nota%'`,
      [clientId]
    );

    // Expedientes
    const expQ = await pool.query(
      `SELECT COUNT(*)::int AS total_expedientes FROM expedientes WHERE cliente_id = $1`,
      [clientId]
    );

    // Días desde alta del cliente
    const clientQ = await pool.query(
      `SELECT date_alta, client_status, address_street, address_town FROM entities WHERE id = $1`,
      [clientId]
    );

    const t = tasksQ.rows[0];
    const ultimaAct = actQ.rows[0]?.ultima_actuacion;
    const diasSinActuacion = ultimaAct
      ? Math.floor((Date.now() - new Date(ultimaAct).getTime()) / 86400000)
      : null;

    const clientRow = clientQ.rows[0];
    const diasDesdeAlta = clientRow?.date_alta
      ? Math.floor((Date.now() - new Date(clientRow.date_alta).getTime()) / 86400000)
      : null;
    const tieneDomicilio = !!(clientRow?.address_street || clientRow?.address_town);

    res.json({
      data: {
        total_tareas:       Number(t.total_tareas),
        tareas_pendientes:  Number(t.tareas_pendientes),
        tareas_urgentes:    Number(t.tareas_urgentes),
        tareas_vencidas:    Number(t.tareas_vencidas),
        tareas_completadas: Number(t.tareas_completadas),
        total_archivos:     Number(filesQ.rows[0].total_archivos),
        total_notas:        Number(notesQ.rows[0].total_notas),
        total_actuaciones:  Number(actQ.rows[0]?.total_actuaciones ?? 0),
        total_expedientes:  Number(expQ.rows[0]?.total_expedientes ?? 0),
        dias_sin_actuacion: diasSinActuacion,
        dias_desde_alta:    diasDesdeAlta,
        tiene_domicilio:    tieneDomicilio,
        client_status:      clientRow?.client_status || '—',
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/tasks/etapas ── lista de etapas disponibles ───────
export const getEtapas = async (_req: any, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, orden FROM task_etapas ORDER BY orden ASC, nombre ASC`
    );
    res.json({ data: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── POST /api/tasks/etapas ── crear nueva etapa ─────────────────
export const createEtapa = async (req: any, res: Response) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    // Obtener el orden máximo actual
    const maxRes = await pool.query(`SELECT COALESCE(MAX(orden),0) AS max FROM task_etapas`);
    const nextOrden = Number(maxRes.rows[0].max) + 1;
    const result = await pool.query(
      `INSERT INTO task_etapas (nombre, orden) VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING *`,
      [nombre.trim(), nextOrden]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
