import { Request, Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';

const explainTaskError = (error: any) => {
  const raw = String(error?.message || "");

  if (
    raw.includes("invalid input syntax for type timestamp with time zone") ||
    raw.includes("invalid input syntax for type timestamp") ||
    raw.includes("invalid input syntax for type date")
  ) {
    return "No se pudo guardar la tarea porque una fecha u hora tiene un formato inválido. Revisa el plazo, el recordatorio o la fecha vinculada del calendario.";
  }

  if (raw.includes("violates foreign key constraint")) {
    return "No se pudo guardar la tarea porque falta o no existe el cliente o expediente vinculado.";
  }

  if (raw.includes("null value in column")) {
    return "No se pudo guardar la tarea porque falta un dato obligatorio.";
  }

  return "No se pudo guardar la tarea por un error interno. Revisa los datos y vuelve a intentarlo.";
};

const taskDateToAgendaStart = (value?: string | null) => {
  if (!value) return null;
  return `${String(value).slice(0, 10)}T08:00:00.000Z`;
};

const taskDateToAgendaEnd = (value?: string | null) => {
  if (!value) return null;
  return `${String(value).slice(0, 10)}T18:00:00.000Z`;
};

const mapTaskEstadoToAgendaStatus = (estado?: string | null) =>
  estado === 'completada' ? 'completado' : 'pendiente';

const mapTaskTipoToAgendaType = (tipo?: string | null) => {
  if (!tipo) return 'plazo';
  if (['reunion'].includes(tipo)) return 'reunion';
  if (['vista_juicio'].includes(tipo)) return 'vista';
  return 'plazo';
};

const buildTaskAgendaPayload = (task: any) => {
  const eventDate = task.fecha_aviso || task.plazo;
  if (!eventDate) return null;

  const descriptionParts = [task.descripcion, task.notas].filter(Boolean);
  return {
    title: task.titulo,
    description: descriptionParts.join('\n\n') || null,
    start_at: taskDateToAgendaStart(eventDate),
    end_at: taskDateToAgendaEnd(eventDate),
    all_day: true,
    type: mapTaskTipoToAgendaType(task.tipo),
    status: mapTaskEstadoToAgendaStatus(task.estado),
    expediente_id: task.expediente_id || null,
    cliente_id: task.client_id || null,
    organization_context: task.expediente || null,
    source: 'task-sync',
    task_id: task.id,
  };
};

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
    res.status(500).json({ error: explainTaskError(e) });
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
    res.status(500).json({ error: explainTaskError(e) });
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
    const createdTask = result.rows[0];
    const agendaPayload = buildTaskAgendaPayload(createdTask);

    if (agendaPayload) {
      const agendaRes = await pool.query(
        `INSERT INTO agenda_events
           (user_id, user_name, title, description, start_at, end_at, all_day,
            type, status, expediente_id, cliente_id, organization_context, source, task_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          userId,
          userName,
          agendaPayload.title,
          agendaPayload.description,
          agendaPayload.start_at,
          agendaPayload.end_at,
          agendaPayload.all_day,
          agendaPayload.type,
          agendaPayload.status,
          agendaPayload.expediente_id,
          agendaPayload.cliente_id,
          agendaPayload.organization_context,
          agendaPayload.source,
          agendaPayload.task_id,
        ]
      );

      const linkedAgenda = agendaRes.rows[0];
      await pool.query(
        `UPDATE client_tasks SET agenda_event_id = $1, updated_at = NOW() WHERE id = $2`,
        [linkedAgenda.id, createdTask.id]
      );
      createdTask.agenda_event_id = linkedAgenda.id;
    }

    logActivityForReq(req, `Tarea creada: ${titulo.trim()}`, 'CLIENT', clientId);
    res.status(201).json({ data: createdTask });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── PUT /api/tasks/:id ─────────────────────────────────────────
export const updateTask = async (req: any, res: Response) => {
  const { id } = req.params;
  const { titulo, descripcion, plazo, fecha_aviso, estado, prioridad, expediente, tipo, juzgado, num_proc, importe, notas, etapa } = req.body;

  try {
    const existingQ = await pool.query(`SELECT * FROM client_tasks WHERE id = $1`, [id]);
    if (existingQ.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const existingTask = existingQ.rows[0];
    const userId = req.auth?.userId || existingTask.user_id || 'SYSTEM';
    const userName = existingTask.created_by || await resolveUserName(userId);

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
    const updatedTask = result.rows[0];
    const agendaPayload = buildTaskAgendaPayload(updatedTask);

    if (agendaPayload && updatedTask.agenda_event_id) {
      await pool.query(
        `UPDATE agenda_events
         SET title=$1, description=$2, start_at=$3, end_at=$4, all_day=$5,
             type=$6, status=$7, expediente_id=$8, cliente_id=$9,
             organization_context=$10, task_id=$11, updated_at=NOW()
         WHERE id=$12`,
        [
          agendaPayload.title,
          agendaPayload.description,
          agendaPayload.start_at,
          agendaPayload.end_at,
          agendaPayload.all_day,
          agendaPayload.type,
          agendaPayload.status,
          agendaPayload.expediente_id,
          agendaPayload.cliente_id,
          agendaPayload.organization_context,
          agendaPayload.task_id,
          updatedTask.agenda_event_id,
        ]
      );
    } else if (agendaPayload && !updatedTask.agenda_event_id) {
      const agendaRes = await pool.query(
        `INSERT INTO agenda_events
           (user_id, user_name, title, description, start_at, end_at, all_day,
            type, status, expediente_id, cliente_id, organization_context, source, task_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          userId,
          userName,
          agendaPayload.title,
          agendaPayload.description,
          agendaPayload.start_at,
          agendaPayload.end_at,
          agendaPayload.all_day,
          agendaPayload.type,
          agendaPayload.status,
          agendaPayload.expediente_id,
          agendaPayload.cliente_id,
          agendaPayload.organization_context,
          agendaPayload.source,
          agendaPayload.task_id,
        ]
      );
      updatedTask.agenda_event_id = agendaRes.rows[0].id;
      await pool.query(
        `UPDATE client_tasks SET agenda_event_id = $1, updated_at = NOW() WHERE id = $2`,
        [updatedTask.agenda_event_id, updatedTask.id]
      );
    } else if (!agendaPayload && updatedTask.agenda_event_id) {
      await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [updatedTask.agenda_event_id]);
      await pool.query(
        `UPDATE client_tasks SET agenda_event_id = NULL, updated_at = NOW() WHERE id = $1`,
        [updatedTask.id]
      );
      updatedTask.agenda_event_id = null;
    }

    res.json({ data: updatedTask });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
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
    const updatedTask = result.rows[0];
    if (updatedTask.agenda_event_id) {
      await pool.query(
        `UPDATE agenda_events SET status = $1, updated_at = NOW() WHERE id = $2`,
        [mapTaskEstadoToAgendaStatus(estado), updatedTask.agenda_event_id]
      );
    }
    res.json({ data: updatedTask });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── DELETE /api/tasks/:id ──────────────────────────────────────
export const deleteTask = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const beforeDelete = await pool.query(`SELECT agenda_event_id FROM client_tasks WHERE id = $1`, [id]);
    const { rows } = await pool.query(`DELETE FROM client_tasks WHERE id=$1 RETURNING titulo, client_id`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const agendaEventId = beforeDelete.rows[0]?.agenda_event_id;
    if (agendaEventId) {
      await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [agendaEventId]);
    }
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
