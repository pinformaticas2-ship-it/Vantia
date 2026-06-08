import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq } from './activityController';

function reqUserName(req: any): string {
  const c = req.auth?.sessionClaims;
  if (!c) return req.auth?.userId || 'Sistema';
  return c.name || c.full_name
    || [c.first_name, c.last_name].filter(Boolean).join(' ')
    || c.email || req.auth?.userId || 'Sistema';
}

function clampImportStatus(status: any): string {
  const value = String(status || '').toLowerCase();
  const allowed = new Set(['uploaded', 'configuring', 'reviewing', 'processing', 'completed', 'failed']);
  return allowed.has(value) ? value : 'uploaded';
}

function normalizeCount(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function nullableText(value: any): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function nullableNumeric(value: any) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim();
  if (!normalized || normalized === '-' || normalized === '—') return null;
  return value;
}

function friendlyExpedienteError(e: any) {
  const raw = String(e?.message || '');
  if (e?.code === '22P02' && /type numeric/i.test(raw)) {
    return 'No se pudo actualizar el expediente porque algún importe o número relacionado venía vacío o con formato inválido.';
  }
  if (e?.code === '22P02' && /date/i.test(raw)) {
    return 'No se pudo actualizar el expediente porque alguna fecha no tiene un formato válido.';
  }
  return raw || 'Error al guardar el expediente';
}

function normalizeExpedienteRelationPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export const getExpedientes = async (req: any, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const estado = (req.query.estado as string) || '';
    const tipo = (req.query.tipo as string) || '';
    const anio = parseInt(req.query.anio as string, 10) || 0;
    const clienteId = ((req.query.clienteId as string) || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 300, 500);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const conds: string[] = [];
    const vals: any[] = [];
    let p = 1;

    if (q) {
      conds.push(`(
        unaccent(COALESCE(e.descripcion, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.ref_propia, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.ref_expediente, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.cliente_nombre, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.contrario, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.juzgado, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.nig, '')) ILIKE unaccent($${p})
        OR unaccent(COALESCE(e.num_autos, '')) ILIKE unaccent($${p})
        OR CAST(e.num_exp AS TEXT) ILIKE $${p}
      )`);
      vals.push(`%${q}%`);
      p++;
    }
    if (estado) { conds.push(`e.estado = $${p}`); vals.push(estado); p++; }
    if (tipo) { conds.push(`e.tipo = $${p}`); vals.push(tipo); p++; }
    if (anio) { conds.push(`e.anio = $${p}`); vals.push(anio); p++; }
    if (clienteId) { conds.push(`e.cliente_id = $${p}`); vals.push(clienteId); p++; }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const sql = `
      SELECT e.*,
             ent.first_name || COALESCE(' ' || ent.last_name, '') AS cliente_nombre_linked
      FROM expedientes e
      LEFT JOIN entities ent ON ent.id = e.cliente_id
      ${where}
      ORDER BY e.anio DESC, e.num_exp DESC
      LIMIT $${p} OFFSET $${p + 1}
    `;
    vals.push(limit, offset);

    const countSql = `SELECT COUNT(*) FROM expedientes e ${where}`;
    const [rows, countRow] = await Promise.all([
      pool.query(sql, vals),
      pool.query(countSql, vals.slice(0, -2)),
    ]);

    res.json({ data: rows.rows, total: parseInt(countRow.rows[0].count, 10) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getStats = async (_req: any, res: Response) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado = 'abierto') AS abiertos,
        COUNT(*) FILTER (WHERE estado = 'cerrado') AS cerrados,
        COUNT(*) FILTER (WHERE estado = 'suspendido') AS suspendidos,
        COUNT(*) FILTER (WHERE estado = 'archivado') AS archivados,
        EXTRACT(YEAR FROM NOW())::int AS anio_actual,
        COUNT(*) FILTER (WHERE anio = EXTRACT(YEAR FROM NOW())::int) AS este_anio
      FROM expedientes
    `);
    res.json({ data: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getImportHistory = async (req: any, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const r = await pool.query(
      `SELECT id, file_name, status, total_count, completed_count, error_count, pending_count,
              notes, created_at, updated_at, user_id, user_name
       FROM expediente_import_batches
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ data: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getImportBatchDetail = async (req: any, res: Response) => {
  try {
    const [batchResult, itemsResult] = await Promise.all([
      pool.query(
        `SELECT id, file_name, status, total_count, completed_count, error_count, pending_count,
                notes, created_at, updated_at, user_id, user_name
         FROM expediente_import_batches
         WHERE id = $1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, row_number, reference, status, error_message, payload, created_expediente_id,
                created_at, updated_at
         FROM expediente_import_items
         WHERE batch_id = $1
         ORDER BY row_number ASC NULLS LAST, created_at ASC`,
        [req.params.id]
      ),
    ]);

    if (!batchResult.rows.length) {
      return res.status(404).json({ error: 'Lote de importacion no encontrado' });
    }

    res.json({ data: { ...batchResult.rows[0], items: itemsResult.rows } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createImportBatch = async (req: any, res: Response) => {
  const client = await pool.connect();

  try {
    const fileName = String(req.body?.file_name || '').trim();
    if (!fileName) {
      return res.status(400).json({ error: 'file_name es obligatorio' });
    }

    const status = clampImportStatus(req.body?.status);
    const totalCount = normalizeCount(req.body?.total_count);
    const completedCount = normalizeCount(req.body?.completed_count);
    const errorCount = normalizeCount(req.body?.error_count);
    const pendingCount = req.body?.pending_count != null
      ? normalizeCount(req.body?.pending_count)
      : Math.max(totalCount - completedCount - errorCount, 0);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() || null : null;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const userId = req.auth?.userId || 'SYSTEM';
    const userName = reqUserName(req);

    await client.query('BEGIN');

    const batchInsert = await client.query(
      `INSERT INTO expediente_import_batches
         (user_id, user_name, file_name, status, total_count, completed_count, error_count, pending_count, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, file_name, status, total_count, completed_count, error_count, pending_count,
                 notes, created_at, updated_at, user_id, user_name`,
      [userId, userName, fileName, status, totalCount, completedCount, errorCount, pendingCount, notes]
    );

    const batch = batchInsert.rows[0];

    for (const rawItem of items) {
      const rowNumber = rawItem?.row_number != null ? normalizeCount(rawItem.row_number) : null;
      const reference = typeof rawItem?.reference === 'string' ? rawItem.reference.trim() || null : null;
      const rawStatus = String(rawItem?.status || '').toLowerCase();
      const itemStatus = rawStatus === 'completed' || rawStatus === 'failed' || rawStatus === 'processing'
        ? rawStatus
        : 'uploaded';
      const errorMessage = typeof rawItem?.error_message === 'string' ? rawItem.error_message.trim() || null : null;
      const payload = rawItem?.payload ?? null;
      const createdExpedienteId = typeof rawItem?.created_expediente_id === 'string'
        ? rawItem.created_expediente_id
        : null;

      await client.query(
        `INSERT INTO expediente_import_items
           (batch_id, row_number, reference, status, error_message, payload, created_expediente_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [batch.id, rowNumber, reference, itemStatus, errorMessage, payload, createdExpedienteId]
      );
    }

    await client.query('COMMIT');

    await logActivityForReq(
      req,
      `Importacion CSV registrada: ${fileName}`,
      'EXPEDIENTE_IMPORT',
      batch.id,
      fileName,
      'UPLOAD'
    );

    res.status(201).json({ data: batch });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
};

export const updateImportBatch = async (req: any, res: Response) => {
  try {
    const status = req.body?.status != null ? clampImportStatus(req.body.status) : null;
    const notes = req.body?.notes != null
      ? (typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null)
      : undefined;
    const totalCount = req.body?.total_count != null ? normalizeCount(req.body.total_count) : undefined;
    const completedCount = req.body?.completed_count != null ? normalizeCount(req.body.completed_count) : undefined;
    const errorCount = req.body?.error_count != null ? normalizeCount(req.body.error_count) : undefined;
    const pendingCount = req.body?.pending_count != null ? normalizeCount(req.body.pending_count) : undefined;

    const current = await pool.query(
      `SELECT id, file_name, status, total_count, completed_count, error_count, pending_count, notes
       FROM expediente_import_batches
       WHERE id = $1`,
      [req.params.id]
    );

    if (!current.rows.length) {
      return res.status(404).json({ error: 'Lote de importacion no encontrado' });
    }

    const prev = current.rows[0];
    const nextTotal = totalCount ?? prev.total_count ?? 0;
    const nextCompleted = completedCount ?? prev.completed_count ?? 0;
    const nextErrors = errorCount ?? prev.error_count ?? 0;
    const nextPending = pendingCount ?? Math.max(nextTotal - nextCompleted - nextErrors, 0);

    const r = await pool.query(
      `UPDATE expediente_import_batches
       SET status = $1,
           total_count = $2,
           completed_count = $3,
           error_count = $4,
           pending_count = $5,
           notes = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, file_name, status, total_count, completed_count, error_count, pending_count,
                 notes, created_at, updated_at, user_id, user_name`,
      [status ?? prev.status, nextTotal, nextCompleted, nextErrors, nextPending, notes === undefined ? prev.notes : notes, req.params.id]
    );

    const batch = r.rows[0];

    await logActivityForReq(
      req,
      `Importacion CSV actualizada: ${batch.file_name} (${batch.status})`,
      'EXPEDIENTE_IMPORT',
      batch.id,
      batch.file_name,
      batch.status === 'failed' ? 'ACTION' : 'UPLOAD'
    );

    res.json({ data: batch });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getExpediente = async (req: any, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT e.*, ent.first_name || COALESCE(' ' || ent.last_name, '') AS cliente_nombre_linked,
              ent.phone_1, ent.phone_mobile, ent.email AS cliente_email
       FROM expedientes e
       LEFT JOIN entities ent ON ent.id = e.cliente_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Expediente no encontrado' });
    res.json({ data: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getRelatedExpedientes = async (req: any, res: Response) => {
  try {
    const expedienteId = req.params.id;
    const r = await pool.query(
      `SELECT e.*
       FROM expediente_relations rel
       JOIN expedientes e
         ON e.id = CASE
           WHEN rel.expediente_id = $1 THEN rel.related_expediente_id
           ELSE rel.expediente_id
         END
       WHERE rel.expediente_id = $1 OR rel.related_expediente_id = $1
       ORDER BY e.anio DESC, e.num_exp DESC`,
      [expedienteId]
    );
    res.json({ data: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const addRelatedExpediente = async (req: any, res: Response) => {
  try {
    const expedienteId = String(req.params.id || "").trim();
    const relatedExpedienteId = String(req.body?.related_expediente_id || "").trim();

    if (!expedienteId || !relatedExpedienteId) {
      return res.status(400).json({ error: 'Falta el expediente a relacionar' });
    }
    if (expedienteId === relatedExpedienteId) {
      return res.status(400).json({ error: 'No puedes relacionar un expediente consigo mismo' });
    }

    const [leftId, rightId] = normalizeExpedienteRelationPair(expedienteId, relatedExpedienteId);

    const existing = await pool.query(
      `SELECT 1
         FROM expediente_relations
        WHERE expediente_id = $1 AND related_expediente_id = $2
        LIMIT 1`,
      [leftId, rightId]
    );

    if (existing.rowCount) {
      return res.status(409).json({ error: 'Estos expedientes ya están relacionados' });
    }

    await pool.query(
      `INSERT INTO expediente_relations (expediente_id, related_expediente_id, created_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (expediente_id, related_expediente_id) DO NOTHING`,
      [leftId, rightId, reqUserName(req)]
    );

    const related = await pool.query(
      `SELECT e.*
       FROM expediente_relations rel
       JOIN expedientes e
         ON e.id = CASE
           WHEN rel.expediente_id = $1 THEN rel.related_expediente_id
           ELSE rel.expediente_id
         END
       WHERE rel.expediente_id = $1 OR rel.related_expediente_id = $1
       ORDER BY e.anio DESC, e.num_exp DESC`,
      [expedienteId]
    );

    res.status(201).json({ data: related.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const removeRelatedExpediente = async (req: any, res: Response) => {
  try {
    const expedienteId = String(req.params.id || "").trim();
    const relatedId = String(req.params.relatedId || "").trim();
    if (!expedienteId || !relatedId) {
      return res.status(400).json({ error: 'Falta el expediente relacionado' });
    }
    const [leftId, rightId] = normalizeExpedienteRelationPair(expedienteId, relatedId);
    await pool.query(
      `DELETE FROM expediente_relations
       WHERE expediente_id = $1 AND related_expediente_id = $2`,
      [leftId, rightId]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createExpediente = async (req: any, res: Response) => {
  const {
    anio, ref_propia, ref_expediente, descripcion, tipo, cliente_id, cliente_nombre,
    contrario, procurador, juzgado, tipo_proc, num_autos, nig,
    estado, observaciones, fecha_inicio, fecha_cierre, importe,
    tipos_asunto, cuantia_principal, intereses, costas, cuantia_total,
    indeterminado, etapa, persona_contacto, contacto, centro, color,
  } = req.body;

  try {
    const yr = anio || new Date().getFullYear();

    // Leer config del contador para este año
    const cfgR = await pool.query(
      `SELECT min_num, auto_fill, override_next FROM expediente_counter_config WHERE anio = $1`, [yr]
    );
    const cfg = cfgR.rows[0] || { min_num: 1, auto_fill: true, override_next: null };
    const minNum: number = cfg.min_num ?? 1;
    const autoFill: boolean = cfg.auto_fill !== false;

    let numExp: number;

    if (cfg.override_next != null) {
      // Usar el número específico configurado manualmente
      numExp = cfg.override_next;
      // Limpiar el override después de usarlo
      await pool.query(
        `UPDATE expediente_counter_config SET override_next = NULL WHERE anio = $1`, [yr]
      );
    } else if (autoFill) {
      // Primer hueco disponible >= min_num (rellena huecos)
      const nextR = await pool.query(
        `WITH bounds AS (
            SELECT GREATEST(COALESCE(MAX(num_exp), 0), $2 - 1) + 1 AS top_n FROM expedientes WHERE anio = $1
         ),
         seq AS (SELECT generate_series($2, (SELECT top_n FROM bounds)) AS n)
         SELECT MIN(s.n) AS next FROM seq s
         WHERE s.n NOT IN (SELECT num_exp FROM expedientes WHERE anio = $1)`,
        [yr, minNum]
      );
      numExp = nextR.rows[0]?.next ?? minNum;
    } else {
      // Modo clásico: MAX + 1, respetando min_num
      const maxR = await pool.query(
        `SELECT GREATEST(COALESCE(MAX(num_exp), 0), $2 - 1) + 1 AS next FROM expedientes WHERE anio = $1`,
        [yr, minNum]
      );
      numExp = maxR.rows[0]?.next ?? minNum;
    }

    let nombre = cliente_nombre || null;
    if (cliente_id && !nombre) {
      const cr = await pool.query(
        `SELECT first_name || COALESCE(' ' || last_name, '') AS n FROM entities WHERE id = $1`,
        [cliente_id]
      );
      nombre = cr.rows[0]?.n || null;
    }

    // Retry loop: si otro proceso insertan el mismo num_exp concurrentemente (race condition
    // durante importación CSV masiva), recalculamos num_exp y reintentamos hasta 10 veces.
    let r: any = null;
    let attempts = 0;
    while (!r && attempts < 10) {
      attempts++;
      if (attempts > 1) {
        // Recalcular num_exp tras colisión
        if (cfg.override_next != null) {
          numExp = cfg.override_next;
        } else if (autoFill) {
          const nextR2 = await pool.query(
            `WITH bounds AS (
                SELECT GREATEST(COALESCE(MAX(num_exp), 0), $2 - 1) + 1 AS top_n FROM expedientes WHERE anio = $1
             ),
             seq AS (SELECT generate_series($2, (SELECT top_n FROM bounds)) AS n)
             SELECT MIN(s.n) AS next FROM seq s
             WHERE s.n NOT IN (SELECT num_exp FROM expedientes WHERE anio = $1)`,
            [yr, minNum]
          );
          numExp = nextR2.rows[0]?.next ?? minNum;
        } else {
          const maxR2 = await pool.query(
            `SELECT GREATEST(COALESCE(MAX(num_exp), 0), $2 - 1) + 1 AS next FROM expedientes WHERE anio = $1`,
            [yr, minNum]
          );
          numExp = maxR2.rows[0]?.next ?? minNum;
        }
      }

      try {
        r = await pool.query(
          `INSERT INTO expedientes
             (anio, num_exp, ref_propia, ref_expediente, descripcion, tipo,
              cliente_id, cliente_nombre, contrario, procurador, juzgado,
              tipo_proc, num_autos, nig, estado, observaciones,
              fecha_inicio, fecha_cierre, importe,
              tipos_asunto, cuantia_principal, intereses, costas, cuantia_total,
              indeterminado, etapa, persona_contacto, contacto, centro, color,
              created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
           RETURNING *`,
          [
            yr, numExp,
            nullableText(ref_propia), nullableText(ref_expediente),
            nullableText(descripcion), tipo || 'judicial',
            cliente_id || null, nombre,
            nullableText(contrario), nullableText(procurador),
            nullableText(juzgado), nullableText(tipo_proc),
            nullableText(num_autos), nullableText(nig),
            estado || 'abierto',
            nullableText(observaciones),
            fecha_inicio || null, fecha_cierre || null,
            nullableNumeric(importe),
            nullableText(tipos_asunto),
            nullableNumeric(cuantia_principal),
            nullableNumeric(intereses),
            nullableNumeric(costas),
            nullableNumeric(cuantia_total),
            indeterminado === true || indeterminado === 'true',
            nullableText(etapa),
            nullableText(persona_contacto),
            nullableText(contacto),
            nullableText(centro),
            nullableText(color) || 'ninguno',
            reqUserName(req),
          ]
        );
      } catch (insertErr: any) {
        // 23505 = unique_violation — race condition, reintentar con nuevo num_exp
        if (insertErr?.code === '23505' && attempts < 10) { r = null; continue; }
        throw insertErr;
      }
    }

    logActivityForReq(req, `Expediente creado: ${yr}/${numExp} - ${descripcion || ''}`, 'EXPEDIENTE', r.rows[0].id);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) {
    res.status(e?.code === '22P02' ? 400 : 500).json({ error: friendlyExpedienteError(e) });
  }
};

export const updateExpediente = async (req: any, res: Response) => {
  const {
    ref_propia, ref_expediente, descripcion, tipo, cliente_id, cliente_nombre,
    contrario, procurador, procurador_contrario, juzgado, tipo_proc, num_autos, nig,
    estado, observaciones, fecha_inicio, fecha_cierre, importe,
    tipos_asunto, cuantia_principal, intereses, costas, cuantia_total,
    indeterminado, etapa, persona_contacto, contacto, centro, color,
  } = req.body;

  try {
    let nombre = cliente_nombre || null;
    if (cliente_id && !nombre) {
      const cr = await pool.query(
        `SELECT first_name || COALESCE(' ' || last_name, '') AS n FROM entities WHERE id = $1`,
        [cliente_id]
      );
      nombre = cr.rows[0]?.n || null;
    }

    const r = await pool.query(
      `UPDATE expedientes SET
         ref_propia=$1, ref_expediente=$2, descripcion=$3, tipo=$4,
         cliente_id=$5, cliente_nombre=$6, contrario=$7, procurador=$8,
         juzgado=$9, tipo_proc=$10, num_autos=$11, nig=$12,
         estado=$13, observaciones=$14, fecha_inicio=$15, fecha_cierre=$16,
         importe=$17,
         tipos_asunto=$18, cuantia_principal=$19, intereses=$20, costas=$21,
         cuantia_total=$22, indeterminado=$23, etapa=$24,
         persona_contacto=$25, contacto=$26, centro=$27, color=$28,
         procurador_contrario=$29,
         updated_at=NOW()
       WHERE id=$30 RETURNING *`,
      [
        nullableText(ref_propia), nullableText(ref_expediente),
        nullableText(descripcion), tipo || 'judicial',
        cliente_id || null, nombre,
        nullableText(contrario), nullableText(procurador),
        nullableText(juzgado), nullableText(tipo_proc),
        nullableText(num_autos), nullableText(nig),
        estado || 'abierto',
        nullableText(observaciones),
        fecha_inicio || null, fecha_cierre || null,
        nullableNumeric(importe),
        nullableText(tipos_asunto),
        nullableNumeric(cuantia_principal),
        nullableNumeric(intereses),
        nullableNumeric(costas),
        nullableNumeric(cuantia_total),
        indeterminado === true || indeterminado === 'true',
        nullableText(etapa),
        nullableText(persona_contacto),
        nullableText(contacto),
        nullableText(centro),
        nullableText(color) || 'ninguno',
        nullableText(procurador_contrario),
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Expediente no encontrado' });
    const exp = r.rows[0];
    const label = exp.descripcion ? `${exp.anio}/${exp.num_exp} - ${exp.descripcion}` : `${exp.anio}/${exp.num_exp}`;
    logActivityForReq(req, `Expediente actualizado: ${label}`, 'EXPEDIENTE', exp.id, 'UPDATE' as any);
    res.json({ data: exp });
  } catch (e: any) {
    res.status(e?.code === '22P02' ? 400 : 500).json({ error: friendlyExpedienteError(e) });
  }
};

export const getExpedienteHistorial = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const [expRes, actRes, notesRes, tasksRes] = await Promise.all([
      pool.query(
        `SELECT id, anio, num_exp, descripcion, estado, created_at, updated_at, fecha_inicio, fecha_cierre FROM expedientes WHERE id=$1`,
        [id]
      ),
      pool.query(
        `SELECT user_name, action_type, event_type, created_at FROM activity_log
         WHERE entity_id=$1 ORDER BY created_at ASC LIMIT 500`,
        [id]
      ),
      pool.query(
        `SELECT content, category, created_by, created_at FROM notes WHERE expediente_id=$1 ORDER BY created_at ASC`,
        [id]
      ),
      pool.query(
        `SELECT titulo, tipo, estado, plazo, created_at FROM client_tasks WHERE expediente_id=$1 ORDER BY created_at ASC`,
        [id]
      ),
    ]);

    if (!expRes.rows.length) return res.status(404).json({ error: 'Expediente no encontrado' });
    const exp = expRes.rows[0];
    const events: any[] = [];

    events.push({
      type: 'alta',
      timestamp: exp.fecha_inicio || exp.created_at,
      title: 'Expediente dado de alta',
      user_name: null,
    });

    for (const a of actRes.rows) {
      events.push({ type: 'cambio', timestamp: a.created_at, title: a.action_type, user_name: a.user_name });
    }
    for (const n of notesRes.rows) {
      const preview = n.content.length > 100 ? n.content.slice(0, 100) + '…' : n.content;
      events.push({ type: 'nota', timestamp: n.created_at, title: preview, user_name: n.created_by, meta: { category: n.category } });
    }
    for (const t of tasksRes.rows) {
      events.push({ type: t.tipo === 'actuacion' ? 'actuacion' : 'tarea', timestamp: t.created_at, title: t.titulo, user_name: null, meta: { estado: t.estado, plazo: t.plazo } });
    }
    if (exp.fecha_cierre) {
      // Use updated_at (full timestamp) when the expediente was last saved as "cerrado".
      // Fall back to end-of-day on fecha_cierre so it sorts after same-day events.
      const cierreTs = exp.updated_at || (exp.fecha_cierre + 'T23:59:59.000Z');
      events.push({ type: 'cierre', timestamp: cierreTs, title: 'Expediente cerrado', user_name: null });
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return res.json({ success: true, data: events });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const deleteExpediente = async (req: any, res: Response) => {
  try {
    const r = await pool.query(
      `DELETE FROM expedientes WHERE id=$1 RETURNING anio, num_exp, descripcion`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Expediente no encontrado' });
    logActivityForReq(req, `Expediente eliminado: ${r.rows[0].anio}/${r.rows[0].num_exp}`, 'EXPEDIENTE', req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// Devuelve solo la lista de años disponibles (rápido)
export const getCounterConfig = async (req: any, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const { rows: cfgRows } = await pool.query(
      `SELECT anio FROM expediente_counter_config ORDER BY anio DESC`
    );
    const { rows: expYears } = await pool.query(
      `SELECT DISTINCT anio FROM expedientes ORDER BY anio DESC LIMIT 10`
    );
    const years = Array.from(
      new Set([currentYear, ...cfgRows.map((r: any) => r.anio), ...expYears.map((r: any) => r.anio)])
    ).sort((a, b) => b - a).slice(0, 6);
    return res.json({ success: true, data: years });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// Devuelve config + estadísticas de UN año concreto
export const getCounterConfigYear = async (req: any, res: Response) => {
  const yr = Number(req.params.anio);
  if (!Number.isInteger(yr) || yr < 2000 || yr > 2100) return res.status(400).json({ error: 'Año inválido' });
  try {
    const { rows: cfgRows } = await pool.query(
      `SELECT min_num, auto_fill, override_next FROM expediente_counter_config WHERE anio = $1`, [yr]
    );
    const cfg = cfgRows[0] || {};
    const minNum: number = cfg.min_num ?? 1;
    const autoFill: boolean = cfg.auto_fill !== false;
    const overrideNext: number | null = cfg.override_next ?? null;

    const { rows: usedRows } = await pool.query(
      `SELECT num_exp FROM expedientes WHERE anio = $1 ORDER BY num_exp`, [yr]
    );
    const used: number[] = usedRows.map((r: any) => r.num_exp);
    const maxUsed = used.length ? Math.max(...used) : 0;

    let nextNum: number;
    if (overrideNext != null) {
      nextNum = overrideNext;
    } else if (autoFill) {
      // Primer hueco (limitado a max 9999 para evitar series gigantes)
      const top = Math.min(maxUsed + 1, 9999);
      const usedSet = new Set(used);
      nextNum = minNum;
      for (let i = minNum; i <= top + 1; i++) {
        if (!usedSet.has(i)) { nextNum = i; break; }
      }
    } else {
      nextNum = Math.max(maxUsed + 1, minNum);
    }

    const gaps: number[] = [];
    const usedSet2 = new Set(used);
    for (let i = minNum; i <= maxUsed && gaps.length < 20; i++) {
      if (!usedSet2.has(i)) gaps.push(i);
    }

    return res.json({ success: true, data: { anio: yr, min_num: minNum, auto_fill: autoFill, override_next: overrideNext, used_count: used.length, max_used: maxUsed, next_num: nextNum, gaps } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const setCounterConfig = async (req: any, res: Response) => {
  const { anio, min_num, auto_fill, override_next } = req.body;
  const yr = Number(anio);
  if (!Number.isInteger(yr) || yr < 2000 || yr > 2100) return res.status(400).json({ error: 'Año inválido' });
  const mn = Number(min_num ?? 1);
  if (!Number.isInteger(mn) || mn < 1) return res.status(400).json({ error: 'Número mínimo inválido (debe ser >= 1)' });
  const af = auto_fill !== false;
  const ov = override_next != null ? Number(override_next) : null;
  if (ov !== null && (!Number.isInteger(ov) || ov < 1)) return res.status(400).json({ error: 'Número de override inválido' });
  try {
    await pool.query(
      `INSERT INTO expediente_counter_config (anio, min_num, auto_fill, override_next)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (anio) DO UPDATE SET min_num = EXCLUDED.min_num, auto_fill = EXCLUDED.auto_fill, override_next = EXCLUDED.override_next`,
      [yr, mn, af, ov]
    );
    return res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
