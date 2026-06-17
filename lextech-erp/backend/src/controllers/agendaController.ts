import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq } from './activityController';

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ` | code: ${e.code}` : ''}`;

const sanitizeTitle = (value: any) => String(value || '').trim();

const sanitizeText = (value: any) => {
  const str = String(value || '').trim();
  return str || null;
};

const agendaStatusToTaskEstado = (status?: string | null) =>
  status === 'completado' ? 'completada' : 'pendiente';

const agendaTypeToTaskTipo = (type?: string | null) => {
  if (type === 'reunion') return 'reunion';
  if (type === 'vista') return 'vista_juicio';
  if (type === 'llamada') return 'gestion';
  return 'plazo_procesal';
};

const agendaEventToTaskDate = (startAt?: string | null) =>
  startAt ? new Date(startAt).toISOString().slice(0, 10) : null;

const shouldSyncAgendaEventToTask = (event: { type?: string | null; cliente_id?: string | null }) =>
  event.type === 'plazo' && Boolean(event.cliente_id);

const toBoolean = (value: any) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'si'].includes(value.toLowerCase());
  if (typeof value === 'number') return value === 1;
  return false;
};

const normalizeGoogleEvent = (raw: any) => {
  const externalId = sanitizeText(raw?.external_id || raw?.id);
  const title = sanitizeTitle(raw?.title || raw?.summary);
  const startAt = raw?.start_at || raw?.start?.dateTime || (raw?.start?.date ? `${raw.start.date}T00:00:00.000Z` : null);
  const endAt = raw?.end_at || raw?.end?.dateTime || (raw?.end?.date ? `${raw.end.date}T23:59:59.999Z` : null);
  const allDay = toBoolean(raw?.all_day) || (!!raw?.start?.date && !raw?.start?.dateTime);

  return {
    externalId,
    title,
    startAt,
    endAt,
    allDay,
    description: sanitizeText(raw?.description),
    location: sanitizeText(raw?.location),
    externalUrl: sanitizeText(raw?.htmlLink || raw?.external_url),
    status: raw?.status === 'cancelled' ? 'cancelado' : 'pendiente',
    type: raw?.type || 'reunion',
    expedienteId: raw?.expediente_id || null,
    clienteId: raw?.cliente_id || null,
  };
};

export const getEvents = async (req: any, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    const status = (req.query.status as string) || '';
    const type = (req.query.type as string) || '';

    const conds: string[] = [`user_id = $1`];
    const vals: any[] = [userId];
    let p = 2;

    if (from) { conds.push(`start_at >= $${p}`); vals.push(from); p += 1; }
    if (to) { conds.push(`start_at <= $${p}`); vals.push(to); p += 1; }
    if (status) { conds.push(`status = $${p}`); vals.push(status); p += 1; }
    if (type) { conds.push(`type = $${p}`); vals.push(type); p += 1; }

    const result = await pool.query(
      `SELECT * FROM agenda_events WHERE ${conds.join(' AND ')} ORDER BY start_at ASC LIMIT 500`,
      vals
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('getEvents:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const getUpcomingEvents = async (req: any, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
    const result = await pool.query(
      `SELECT * FROM agenda_events
       WHERE user_id = $1 AND start_at >= NOW() AND status != 'cancelado'
       ORDER BY start_at ASC
       LIMIT $2`,
      [userId, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('getUpcomingEvents:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const getOrganizationOptions = async (_req: any, res: Response) => {
  try {
    const [expedientesRes, linksRes] = await Promise.all([
      pool.query(
        `SELECT
           e.id,
           e.ref_expediente,
           e.ref_propia,
           e.descripcion,
           e.cliente_id,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(ent.first_name, ''), ' ', COALESCE(ent.last_name, ''))), ''),
             NULLIF(ent.commercial_name, ''),
             ent.email,
             e.cliente_nombre
           ) AS cliente_nombre
         FROM expedientes e
         LEFT JOIN entities ent ON ent.id = e.cliente_id
         ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST
         LIMIT 500`
      ),
      pool.query(
        `SELECT DISTINCT expediente_id, user_id, user_name
         FROM (
           SELECT expediente_id, user_id, user_name
           FROM agenda_events
           WHERE expediente_id IS NOT NULL
           UNION
           SELECT entity_id::uuid AS expediente_id, user_id, user_name
           FROM activity_log
           WHERE entity_type = 'EXPEDIENTE' AND entity_id IS NOT NULL
         ) rel
         WHERE expediente_id IS NOT NULL AND user_id IS NOT NULL`
      ),
    ]);

    const linksByExpediente = new Map<string, Array<{ user_id: string; user_name: string }>>();
    for (const row of linksRes.rows) {
      const key = String(row.expediente_id);
      const current = linksByExpediente.get(key) || [];
      if (!current.some((item) => item.user_id === row.user_id)) {
        current.push({ user_id: row.user_id, user_name: row.user_name || 'Sin nombre' });
      }
      linksByExpediente.set(key, current);
    }

    const expedientes = expedientesRes.rows.map((row) => ({
      id: row.id,
      ref_expediente: row.ref_expediente,
      ref_propia: row.ref_propia,
      descripcion: row.descripcion,
      cliente_id: row.cliente_id,
      cliente_nombre: row.cliente_nombre,
      related_users: linksByExpediente.get(String(row.id)) || [],
    }));

    res.json({ success: true, data: { expedientes } });
  } catch (error: any) {
    console.error('getOrganizationOptions:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const getEventById = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM agenda_events WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const createEvent = async (req: any, res: Response) => {
  const userId = req.auth?.userId || 'SYSTEM';
  const {
    title, description, start_at, end_at, all_day,
    type, status, expediente_id, cliente_id, related_user_id, related_user_name, organization_context, location, color,
    source, external_provider, external_id, external_url,
  } = req.body;

  if (!sanitizeTitle(title)) {
    return res.status(400).json({ success: false, error: 'El titulo es obligatorio.' });
  }
  if (!start_at) {
    return res.status(400).json({ success: false, error: 'La fecha de inicio es obligatoria.' });
  }

  const { resolveUserName } = await import('./activityController');
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  try {
    const result = await pool.query(
      `INSERT INTO agenda_events
         (user_id, user_name, title, description, start_at, end_at, all_day,
          type, status, expediente_id, cliente_id, related_user_id, related_user_name, organization_context, location, color,
          source, external_provider, external_id, external_url, task_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        userId,
        userName,
        sanitizeTitle(title),
        sanitizeText(description),
        start_at,
        end_at || null,
        all_day ?? false,
        type || 'cita',
        status || 'pendiente',
        expediente_id || null,
        cliente_id || null,
        sanitizeText(related_user_id),
        sanitizeText(related_user_name),
        sanitizeText(organization_context),
        sanitizeText(location),
        color || null,
        source || 'manual',
        sanitizeText(external_provider),
        sanitizeText(external_id),
        sanitizeText(external_url),
        null,
      ]
    );
    const createdEvent = result.rows[0];

    if (shouldSyncAgendaEventToTask(createdEvent)) {
      const clientRow = await pool.query(
        `SELECT COALESCE(commercial_name, first_name || ' ' || COALESCE(last_name,'')) AS name FROM entities WHERE id = $1`,
        [createdEvent.cliente_id]
      );
      const clientName = clientRow.rows[0]?.name || null;
      const taskDate = agendaEventToTaskDate(createdEvent.start_at);
      const taskRes = await pool.query(
        `INSERT INTO client_tasks
           (client_id, client_name, titulo, descripcion, plazo, fecha_aviso, estado, prioridad,
            expediente, expediente_id, tipo, notas, created_by, user_id, agenda_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          createdEvent.cliente_id,
          clientName,
          createdEvent.title,
          createdEvent.description,
          taskDate,
          taskDate,
          agendaStatusToTaskEstado(createdEvent.status),
          'media',
          sanitizeText(createdEvent.organization_context),
          createdEvent.expediente_id || null,
          agendaTypeToTaskTipo(createdEvent.type),
          createdEvent.description,
          userName,
          userId,
          createdEvent.id,
        ]
      );
      createdEvent.task_id = taskRes.rows[0].id;
      await pool.query(`UPDATE agenda_events SET task_id = $1, updated_at = NOW() WHERE id = $2`, [createdEvent.task_id, createdEvent.id]);
    }

    await logActivityForReq(req, 'Evento agenda creado', 'AGENDA', createdEvent.id, sanitizeTitle(title));
    res.status(201).json({ success: true, data: createdEvent });
  } catch (error: any) {
    console.error('createEvent:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const updateEvent = async (req: any, res: Response) => {
  const { id } = req.params;
  const {
    title, description, start_at, end_at, all_day,
    type, status, expediente_id, cliente_id, related_user_id, related_user_name, organization_context, location, color,
    source, external_provider, external_id, external_url,
  } = req.body;

  if (!sanitizeTitle(title)) {
    return res.status(400).json({ success: false, error: 'El titulo es obligatorio.' });
  }
  if (!start_at) {
    return res.status(400).json({ success: false, error: 'La fecha de inicio es obligatoria.' });
  }

  try {
    const existingQ = await pool.query(`SELECT * FROM agenda_events WHERE id = $1`, [id]);
    if (existingQ.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }
    const existingEvent = existingQ.rows[0];

    const result = await pool.query(
      `UPDATE agenda_events SET
         title = $1,
         description = $2,
         start_at = $3,
         end_at = $4,
         all_day = $5,
         type = $6,
         status = $7,
         expediente_id = $8,
         cliente_id = $9,
         related_user_id = $10,
         related_user_name = $11,
         organization_context = $12,
         location = $13,
         color = $14,
         source = $15,
         external_provider = $16,
         external_id = $17,
         external_url = $18,
         updated_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [
        sanitizeTitle(title),
        sanitizeText(description),
        start_at,
        end_at || null,
        all_day ?? false,
        type || 'cita',
        status || 'pendiente',
        expediente_id || null,
        cliente_id || null,
        sanitizeText(related_user_id),
        sanitizeText(related_user_name),
        sanitizeText(organization_context),
        sanitizeText(location),
        color || null,
        source || 'manual',
        sanitizeText(external_provider),
        sanitizeText(external_id),
        sanitizeText(external_url),
        id,
      ]
    );
    const updatedEvent = result.rows[0];

    if (shouldSyncAgendaEventToTask(updatedEvent) && updatedEvent.task_id) {
      const taskDate = agendaEventToTaskDate(updatedEvent.start_at);
      await pool.query(
        `UPDATE client_tasks
         SET titulo = $1,
             descripcion = $2,
             plazo = $3,
             fecha_aviso = $4,
             estado = $5,
             expediente = $6,
             expediente_id = $7,
             tipo = $8,
             notas = $9,
             updated_at = NOW()
         WHERE id = $10`,
        [
          updatedEvent.title,
          updatedEvent.description,
          taskDate,
          taskDate,
          agendaStatusToTaskEstado(updatedEvent.status),
          sanitizeText(updatedEvent.organization_context),
          updatedEvent.expediente_id || null,
          agendaTypeToTaskTipo(updatedEvent.type),
          updatedEvent.description,
          updatedEvent.task_id,
        ]
      );
    } else if (shouldSyncAgendaEventToTask(updatedEvent) && !updatedEvent.task_id) {
      const clientRow = await pool.query(
        `SELECT COALESCE(commercial_name, first_name || ' ' || COALESCE(last_name,'')) AS name FROM entities WHERE id = $1`,
        [updatedEvent.cliente_id]
      );
      const clientName = clientRow.rows[0]?.name || null;
      const taskDate = agendaEventToTaskDate(updatedEvent.start_at);
      const taskRes = await pool.query(
        `INSERT INTO client_tasks
           (client_id, client_name, titulo, descripcion, plazo, fecha_aviso, estado, prioridad,
            expediente, expediente_id, tipo, notas, created_by, user_id, agenda_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          updatedEvent.cliente_id,
          clientName,
          updatedEvent.title,
          updatedEvent.description,
          taskDate,
          taskDate,
          agendaStatusToTaskEstado(updatedEvent.status),
          'media',
          sanitizeText(updatedEvent.organization_context),
          updatedEvent.expediente_id || null,
          agendaTypeToTaskTipo(updatedEvent.type),
          updatedEvent.description,
          updatedEvent.user_name || 'Sistema',
          updatedEvent.user_id || 'SYSTEM',
          updatedEvent.id,
        ]
      );
      updatedEvent.task_id = taskRes.rows[0].id;
      await pool.query(`UPDATE agenda_events SET task_id = $1, updated_at = NOW() WHERE id = $2`, [updatedEvent.task_id, updatedEvent.id]);
    } else if (!shouldSyncAgendaEventToTask(updatedEvent) && existingEvent.task_id) {
      await pool.query(`DELETE FROM client_tasks WHERE id = $1`, [existingEvent.task_id]);
      await pool.query(`UPDATE agenda_events SET task_id = NULL, updated_at = NOW() WHERE id = $1`, [updatedEvent.id]);
      updatedEvent.task_id = null;
    }

    await logActivityForReq(req, 'Evento agenda modificado', 'AGENDA', id, sanitizeTitle(title));
    res.json({ success: true, data: updatedEvent });
  } catch (error: any) {
    console.error('updateEvent:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const deleteEvent = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(`SELECT title, task_id FROM agenda_events WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }

    if (existing.rows[0].task_id) {
      await pool.query(`DELETE FROM client_tasks WHERE id = $1`, [existing.rows[0].task_id]);
    }
    await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [id]);
    await logActivityForReq(req, 'Evento agenda eliminado', 'AGENDA', id, existing.rows[0].title);
    res.json({ success: true });
  } catch (error: any) {
    console.error('deleteEvent:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

export const importGoogleEvents = async (req: any, res: Response) => {
  const userId = req.auth?.userId || 'SYSTEM';
  const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];

  if (!rawEvents.length) {
    return res.status(400).json({ success: false, error: 'No hay eventos de Google para importar.' });
  }

  const { resolveUserName } = await import('./activityController');
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  const imported: any[] = [];
  const skipped: any[] = [];
  const errors: Array<{ external_id: string | null; title: string; error: string }> = [];

  for (const raw of rawEvents) {
    const event = normalizeGoogleEvent(raw);

    if (!event.externalId || !event.title || !event.startAt) {
      errors.push({
        external_id: event.externalId,
        title: event.title || 'Sin titulo',
        error: 'Faltan datos obligatorios para importar el evento.',
      });
      continue;
    }

    try {
      const existing = await pool.query(
        `SELECT * FROM agenda_events
         WHERE external_provider = 'google' AND external_id = $1
         LIMIT 1`,
        [event.externalId]
      );

      if (existing.rows.length > 0) {
        skipped.push(existing.rows[0]);
        continue;
      }

      const result = await pool.query(
        `INSERT INTO agenda_events
           (user_id, user_name, title, description, start_at, end_at, all_day,
            type, status, expediente_id, cliente_id, location, color,
            source, external_provider, external_id, external_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          userId,
          userName,
          event.title,
          event.description,
          event.startAt,
          event.endAt,
          event.allDay,
          event.type,
          event.status,
          event.expedienteId,
          event.clienteId,
          event.location,
          null,
          'google',
          'google',
          event.externalId,
          event.externalUrl,
        ]
      );

      imported.push(result.rows[0]);
      await logActivityForReq(req, 'Evento Google importado a agenda', 'AGENDA', result.rows[0].id, event.title);
    } catch (error: any) {
      errors.push({
        external_id: event.externalId,
        title: event.title || 'Sin titulo',
        error: pgErr(error),
      });
    }
  }

  res.json({
    success: true,
    data: {
      imported,
      skipped,
      errors,
      summary: {
        total: rawEvents.length,
        imported: imported.length,
        skipped: skipped.length,
        errors: errors.length,
      },
    },
  });
};

export const syncGoogleEvents = async (req: any, res: Response) => {
  const userId = req.auth?.userId || 'SYSTEM';
  const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
  const from = req.body?.from as string | undefined;
  const to = req.body?.to as string | undefined;

  if (!from || !to) {
    return res.status(400).json({ success: false, error: 'Falta el rango de sincronizacion.' });
  }

  const { resolveUserName } = await import('./activityController');
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  const created: any[] = [];
  const updated: any[] = [];
  const deleted: any[] = [];
  const errors: Array<{ external_id: string | null; title: string; error: string }> = [];
  const seenIds = new Set<string>();

  for (const raw of rawEvents) {
    const event = normalizeGoogleEvent(raw);

    if (!event.externalId || !event.title || !event.startAt) {
      errors.push({
        external_id: event.externalId,
        title: event.title || 'Sin titulo',
        error: 'Faltan datos obligatorios para sincronizar el evento.',
      });
      continue;
    }

    seenIds.add(event.externalId);

    try {
      const existing = await pool.query(
        `SELECT * FROM agenda_events
         WHERE external_provider = 'google' AND external_id = $1
         LIMIT 1`,
        [event.externalId]
      );

      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE agenda_events SET
             user_id = $1,
             user_name = $2,
             title = $3,
             description = $4,
             start_at = $5,
             end_at = $6,
             all_day = $7,
             type = $8,
             status = $9,
             expediente_id = $10,
             cliente_id = $11,
             location = $12,
             source = 'google',
             external_provider = 'google',
             external_url = $13,
             updated_at = NOW()
           WHERE id = $14
           RETURNING *`,
          [
            userId,
            userName,
            event.title,
            event.description,
            event.startAt,
            event.endAt,
            event.allDay,
            event.type,
            event.status,
            event.expedienteId,
            event.clienteId,
            event.location,
            event.externalUrl,
            existing.rows[0].id,
          ]
        );
        updated.push(result.rows[0]);
        continue;
      }

      const result = await pool.query(
        `INSERT INTO agenda_events
           (user_id, user_name, title, description, start_at, end_at, all_day,
            type, status, expediente_id, cliente_id, location, color,
            source, external_provider, external_id, external_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          userId,
          userName,
          event.title,
          event.description,
          event.startAt,
          event.endAt,
          event.allDay,
          event.type,
          event.status,
          event.expedienteId,
          event.clienteId,
          event.location,
          null,
          'google',
          'google',
          event.externalId,
          event.externalUrl,
        ]
      );
      created.push(result.rows[0]);
    } catch (error: any) {
      errors.push({
        external_id: event.externalId,
        title: event.title || 'Sin titulo',
        error: pgErr(error),
      });
    }
  }

  try {
    const existingInRange = await pool.query(
      `SELECT id, external_id, title
       FROM agenda_events
       WHERE external_provider = 'google'
         AND start_at >= $1
         AND start_at <= $2`,
      [from, to]
    );

    for (const row of existingInRange.rows) {
      if (row.external_id && !seenIds.has(row.external_id)) {
        await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [row.id]);
        deleted.push(row);
      }
    }
  } catch (error: any) {
    errors.push({
      external_id: null,
      title: 'cleanup',
      error: pgErr(error),
    });
  }

  res.json({
    success: true,
    data: {
      created,
      updated,
      deleted,
      errors,
      summary: {
        total: rawEvents.length,
        created: created.length,
        updated: updated.length,
        deleted: deleted.length,
        errors: errors.length,
      },
    },
  });
};
