import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';
import { logActivity, logActivityForReq } from './activityController';
import { CLIENT_FILES_ROOT, UPLOADS_CLIENTS_ROOT as UPLOADS_ROOT } from '../config/paths';

/** Convierte strings vacíos/guiones a null (evita casts fallidos en PostgreSQL) */
const nullIfEmpty = (v: any) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const normalized = v.trim();
    if (!normalized || normalized === '—' || normalized === '-') return null;
    return normalized;
  }
  return v;
};

/** Extrae el nombre legible del usuario desde las sessionClaims de Clerk */
function reqUserName(req: any): string {
  const c = req.auth?.sessionClaims;
  if (!c) return req.auth?.userId || 'Sistema';
  return c.name
    || c.full_name
    || [c.first_name, c.last_name].filter(Boolean).join(' ')
    || c.email
    || c.username
    || req.auth?.userId
    || 'Sistema';
}

/** Formatea un error de PG de forma legible */
const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.detail ? ' | detail: ' + e.detail : ''}${e?.code ? ' | code: ' + e.code : ''}`;

const friendlyEntityError = (e: any) => {
  const raw = String(e?.message || '');
  if (e?.code === '22P02' && /type numeric/i.test(raw)) {
    return 'No se pudo guardar el cliente porque algún campo numérico tiene un formato inválido. Revisa código postal, teléfonos y otros campos opcionales.';
  }
  if (e?.code === '22P02' && /date/i.test(raw)) {
    return 'No se pudo guardar el cliente porque alguna fecha no tiene un formato válido.';
  }
  return pgErr(e);
};

// ─────────────────────────────────────────────────────────────
// GET /api/entities  — con búsqueda, filtro y paginación
// ─────────────────────────────────────────────────────────────
export const getEntities = async (req: any, res: Response) => {
  try {
    const search = (req.query.search as string || '').trim();
    const typeFilter = req.query.type as string || '';
    const statusFilter = req.query.status as string || '';
    const limit  = Math.min(parseInt(req.query.limit  as string) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const conditions: string[] = [];
    const values: any[] = [];
    let p = 1;

    // Búsqueda por texto (nombre, NIF, email)
    if (search) {
      conditions.push(`(
        first_name ILIKE $${p} OR last_name ILIKE $${p}
        OR nif_cif ILIKE $${p} OR email ILIKE $${p}
        OR commercial_name ILIKE $${p}
      )`);
      values.push(`%${search}%`);
      p++;
    }

    // Filtro por tipo
    if (typeFilter) {
      conditions.push(`type = $${p}`);
      values.push(typeFilter);
      p++;
    }

    // Filtro por estado
    if (statusFilter) {
      conditions.push(`client_status = $${p}`);
      values.push(statusFilter);
      p++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        e.id, e.internal_number, e.type, e.client_status,
        e.first_name, e.last_name, e.commercial_name, e.nif_cif,
        e.email, e.phone_1, e.phone_mobile,
        e.address_town, e.address_province,
        e.photo_url, e.created_at, e.date_alta, e.lopd, e.color,
        (SELECT COUNT(*) FROM activity_log al
         WHERE al.entity_id = e.id AND al.entity_type = 'CLIENT'
           AND al.action_type NOT LIKE 'Nota%'
        )::int AS total_actuaciones,
        (SELECT COUNT(*) FROM expedientes exp
         WHERE exp.cliente_id = e.id
        )::int AS total_expedientes
      FROM entities e
      ${where}
      ORDER BY e.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...values, limit, offset]);

    return res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (error: any) {
    console.error('❌ getEntities:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/entities/check-nif?nif=<NIF_CIF>
// ─────────────────────────────────────────────────────────────
export const checkNifCif = async (req: any, res: Response) => {
  const nif = (req.query.nif as string || '').trim().toUpperCase();
  if (!nif) return res.json({ exists: false, entity: null });
  try {
    const result = await pool.query(
      `SELECT id, type, client_status, first_name, last_name, commercial_name, nif_cif, email, phone_1, phone_mobile, address_town
       FROM entities WHERE UPPER(nif_cif) = $1 LIMIT 1`,
      [nif]
    );
    if (result.rows.length === 0) return res.json({ exists: false, entity: null });
    return res.json({ exists: true, entity: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ exists: false, error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/entities/:id
// ─────────────────────────────────────────────────────────────
export const getEntityById = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM entities WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ getEntityById:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/entities
// ─────────────────────────────────────────────────────────────
export const createEntity = async (req: any, res: Response) => {
  const {
    type, client_status, document_type,
    first_name, last_name, commercial_name,
    nif_cif, gender, birth_date,
    nationality, expedition_country, legal_nature,
    address_street, address_town, address_cp,
    address_province, address_country,
    email, phone_1, phone_2, phone_3,
    phone_mobile, phone_fax, website,
    date_alta, date_baja,
    lopd, commercial_communications, center,
    photo_url,
  } = req.body;

  const userId = req.auth?.userId || 'SYSTEM';

  if (!first_name || !nif_cif) {
    return res.status(400).json({
      success: false,
      error: 'Nombre y NIF/CIF son obligatorios.'
    });
  }

  // Normalizar fechas: empty string → null (PostgreSQL no acepta '' en columnas DATE)
  const safeBirthDate  = nullIfEmpty(birth_date);
  const safeDateAlta   = nullIfEmpty(date_alta)  || new Date().toISOString().split('T')[0];
  const safeDateBaja   = nullIfEmpty(date_baja);

  try {
    const result = await pool.query(`
      INSERT INTO entities (
        type, client_status, document_type,
        first_name, last_name, commercial_name,
        nif_cif, gender, birth_date,
        nationality, expedition_country, legal_nature,
        address_street, address_town, address_cp,
        address_province, address_country,
        email, phone_1, phone_2, phone_3,
        phone_mobile, phone_fax, website,
        date_alta, date_baja,
        lopd, commercial_communications, center,
        photo_url, created_by
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9::date,
        $10, $11, $12,
        $13, $14, $15,
        $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24,
        $25::date, $26::date,
        $27, $28, $29,
        $30, $31
      ) RETURNING *`,
      [
        nullIfEmpty(type)                    || 'CLIENTE',   // $1
        nullIfEmpty(client_status)           || 'Alta',      // $2
        nullIfEmpty(document_type)           || 'DNI',       // $3
        first_name,                                          // $4
        nullIfEmpty(last_name),                              // $5
        nullIfEmpty(commercial_name),                        // $6
        nif_cif,                                             // $7
        nullIfEmpty(gender),                                 // $8
        safeBirthDate,                                       // $9  ::date
        nullIfEmpty(nationality)             || 'Española',  // $10
        nullIfEmpty(expedition_country)      || 'España',    // $11
        nullIfEmpty(legal_nature),                           // $12
        nullIfEmpty(address_street),                         // $13
        nullIfEmpty(address_town),                           // $14
        nullIfEmpty(address_cp),                             // $15
        nullIfEmpty(address_province),                       // $16
        nullIfEmpty(address_country)         || 'España',    // $17
        nullIfEmpty(email),                                  // $18
        nullIfEmpty(phone_1),                                // $19
        nullIfEmpty(phone_2),                                // $20
        nullIfEmpty(phone_3),                                // $21
        nullIfEmpty(phone_mobile),                           // $22
        nullIfEmpty(phone_fax),                              // $23
        nullIfEmpty(website),                                // $24
        safeDateAlta,                                        // $25 ::date
        safeDateBaja,                                        // $26 ::date
        nullIfEmpty(lopd)                    || 'Pendiente', // $27
        nullIfEmpty(commercial_communications) || 'No',      // $28
        nullIfEmpty(center),                                 // $29
        nullIfEmpty(photo_url),                              // $30
        userId,                                              // $31
      ]
    );
    // Crear carpetas para archivos del cliente (uploads del servidor + carpeta local)
    try {
      const clientId = result.rows[0].id;
      const serverFolder = path.join(UPLOADS_ROOT, clientId);
      const localFolder  = path.join(CLIENT_FILES_ROOT, clientId);
      if (!fs.existsSync(serverFolder)) fs.mkdirSync(serverFolder, { recursive: true });
      if (!fs.existsSync(localFolder))  fs.mkdirSync(localFolder,  { recursive: true });
    } catch (err) {
      console.warn('⚠️ No se pudo crear carpeta para cliente:', err);
    }

    // Registrar actividad (fire-and-forget, no bloquea la respuesta)
    const entityName = `${first_name} ${last_name || ''}`.trim() + ` (${nif_cif})`;
    logActivityForReq(req, 'Nuevo cliente creado', 'CLIENT', result.rows[0].id, entityName);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ createEntity:', pgErr(error));
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
    }
    const status = error?.code === '22P02' ? 400 : 500;
    res.status(status).json({ success: false, error: friendlyEntityError(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/entities/:id
// ─────────────────────────────────────────────────────────────
export const updateEntity = async (req: any, res: Response) => {
  const { id } = req.params;
  const {
    type, client_status, document_type,
    first_name, last_name, commercial_name,
    nif_cif, gender, birth_date,
    nationality, expedition_country, legal_nature,
    address_street, address_town, address_cp,
    address_province, address_country,
    email, phone_1, phone_2, phone_3,
    phone_mobile, phone_fax, website,
    date_alta, date_baja,
    lopd, commercial_communications, center,
    photo_url,
  } = req.body;

  const safeBirthDate = nullIfEmpty(birth_date);
  const safeDateAlta  = nullIfEmpty(date_alta);
  const safeDateBaja  = nullIfEmpty(date_baja);

  try {
    const result = await pool.query(`
      UPDATE entities SET
        type                     = $1,
        client_status            = $2,
        document_type            = $3,
        first_name               = $4,
        last_name                = $5,
        commercial_name          = $6,
        nif_cif                  = $7,
        gender                   = $8,
        birth_date               = $9::date,
        nationality              = $10,
        expedition_country       = $11,
        legal_nature             = $12,
        address_street           = $13,
        address_town             = $14,
        address_cp               = $15,
        address_province         = $16,
        address_country          = $17,
        email                    = $18,
        phone_1                  = $19,
        phone_2                  = $20,
        phone_3                  = $21,
        phone_mobile             = $22,
        phone_fax                = $23,
        website                  = $24,
        date_alta                = $25::date,
        date_baja                = $26::date,
        lopd                     = $27,
        commercial_communications = $28,
        center                   = $29,
        photo_url                = $30
      WHERE id = $31
      RETURNING *`,
      [
        nullIfEmpty(type)                    || 'CLIENTE',
        nullIfEmpty(client_status)           || 'Alta',
        nullIfEmpty(document_type)           || 'DNI',
        first_name,
        nullIfEmpty(last_name),
        nullIfEmpty(commercial_name),
        nif_cif,
        nullIfEmpty(gender),
        safeBirthDate,
        nullIfEmpty(nationality)             || 'Española',
        nullIfEmpty(expedition_country)      || 'España',
        nullIfEmpty(legal_nature),
        nullIfEmpty(address_street),
        nullIfEmpty(address_town),
        nullIfEmpty(address_cp),
        nullIfEmpty(address_province),
        nullIfEmpty(address_country)         || 'España',
        nullIfEmpty(email),
        nullIfEmpty(phone_1),
        nullIfEmpty(phone_2),
        nullIfEmpty(phone_3),
        nullIfEmpty(phone_mobile),
        nullIfEmpty(phone_fax),
        nullIfEmpty(website),
        safeDateAlta,
        safeDateBaja,
        nullIfEmpty(lopd)                    || 'Pendiente',
        nullIfEmpty(commercial_communications) || 'No',
        nullIfEmpty(center),
        nullIfEmpty(photo_url),
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    const updatedRow = result.rows[0];
    const updatedName = updatedRow.commercial_name
      || [updatedRow.first_name, updatedRow.last_name].filter(Boolean).join(' ')
      || id;
    logActivityForReq(req, 'Datos del cliente actualizados', 'CLIENT', id, updatedName);
    res.json({ success: true, data: updatedRow });
  } catch (error: any) {
    console.error('❌ updateEntity:', pgErr(error));
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
    }
    const status = error?.code === '22P02' ? 400 : 500;
    res.status(status).json({ success: false, error: friendlyEntityError(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/entities/:id  — actualización parcial de campos
// ─────────────────────────────────────────────────────────────
export const patchEntity = async (req: any, res: Response) => {
  const { id } = req.params;
  const ALLOWED = [
    'client_status', 'date_baja', 'date_alta',
    'lopd', 'center', 'commercial_communications',
    'type', 'commercial_name', 'website', 'color',
  ];
  const entries = Object.entries(req.body).filter(([k]) => ALLOWED.includes(k));
  if (entries.length === 0) {
    return res.status(400).json({ success: false, error: 'Sin campos válidos para actualizar' });
  }
  const sets   = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const values = entries.map(([, v]) => (v === '' ? null : v));
  try {
    const result = await pool.query(
      `UPDATE entities SET ${sets}, updated_at = NOW() WHERE id = $${entries.length + 1} RETURNING *`,
      [...values, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    const updated = result.rows[0];
    const clientName = updated.commercial_name || [updated.first_name, updated.last_name].filter(Boolean).join(' ');
    const changedFields = entries.map(([k]) => k).join(', ');
    logActivityForReq(req, `Cliente actualizado (${changedFields})`, 'CLIENT', id, clientName);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('❌ patchEntity:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/entities/:id
// ─────────────────────────────────────────────────────────────
export const deleteEntity = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM entities WHERE id = $1 RETURNING id, first_name, last_name, commercial_name`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    const deleted = result.rows[0];
    const clientName = deleted.commercial_name || [deleted.first_name, deleted.last_name].filter(Boolean).join(' ');
    logActivityForReq(req, 'Cliente eliminado', 'CLIENT', id, clientName);
    res.json({ success: true, message: 'Cliente eliminado correctamente' });
  } catch (error: any) {
    console.error('❌ deleteEntity:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// Importacion masiva de clientes por CSV — lotes de importacion
// (mismo patron que expediente_import_batches/items en expedientesController.ts)
// ─────────────────────────────────────────────────────────────

function clampImportStatus(status: any): string {
  const value = String(status || '').toLowerCase();
  const allowed = new Set(['uploaded', 'configuring', 'reviewing', 'processing', 'completed', 'failed']);
  return allowed.has(value) ? value : 'uploaded';
}

function normalizeCount(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export const getEntityImportHistory = async (req: any, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const r = await pool.query(
      `SELECT id, file_name, status, total_count, completed_count, error_count, pending_count,
              notes, created_at, updated_at, user_id, user_name
       FROM entity_import_batches
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: r.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getEntityImportBatchDetail = async (req: any, res: Response) => {
  try {
    const [batchResult, itemsResult] = await Promise.all([
      pool.query(
        `SELECT id, file_name, status, total_count, completed_count, error_count, pending_count,
                notes, created_at, updated_at, user_id, user_name
         FROM entity_import_batches
         WHERE id = $1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, row_number, reference, status, error_message, payload, created_entity_id,
                created_at, updated_at
         FROM entity_import_items
         WHERE batch_id = $1
         ORDER BY row_number ASC NULLS LAST, created_at ASC`,
        [req.params.id]
      ),
    ]);

    if (!batchResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Lote de importacion no encontrado' });
    }

    res.json({ success: true, data: { ...batchResult.rows[0], items: itemsResult.rows } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const createEntityImportBatch = async (req: any, res: Response) => {
  const client = await pool.connect();

  try {
    const fileName = String(req.body?.file_name || '').trim();
    if (!fileName) {
      client.release();
      return res.status(400).json({ success: false, error: 'file_name es obligatorio' });
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
      `INSERT INTO entity_import_batches
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
      const createdEntityId = typeof rawItem?.created_entity_id === 'string'
        ? rawItem.created_entity_id
        : null;

      await client.query(
        `INSERT INTO entity_import_items
           (batch_id, row_number, reference, status, error_message, payload, created_entity_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [batch.id, rowNumber, reference, itemStatus, errorMessage, payload, createdEntityId]
      );
    }

    await client.query('COMMIT');

    logActivityForReq(req, `Importacion CSV de clientes registrada: ${fileName}`, 'CLIENT_IMPORT', batch.id, fileName, 'UPLOAD');

    res.status(201).json({ success: true, data: batch });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: pgErr(e) });
  } finally {
    client.release();
  }
};

export const updateEntityImportBatch = async (req: any, res: Response) => {
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
       FROM entity_import_batches
       WHERE id = $1`,
      [req.params.id]
    );

    if (!current.rows.length) {
      return res.status(404).json({ success: false, error: 'Lote de importacion no encontrado' });
    }

    const prev = current.rows[0];
    const nextTotal = totalCount ?? prev.total_count ?? 0;
    const nextCompleted = completedCount ?? prev.completed_count ?? 0;
    const nextErrors = errorCount ?? prev.error_count ?? 0;
    const nextPending = pendingCount ?? Math.max(nextTotal - nextCompleted - nextErrors, 0);

    const r = await pool.query(
      `UPDATE entity_import_batches
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

    logActivityForReq(
      req,
      `Importacion CSV de clientes actualizada: ${batch.file_name} (${batch.status})`,
      'CLIENT_IMPORT',
      batch.id,
      batch.file_name,
      batch.status === 'failed' ? 'ACTION' : 'UPLOAD'
    );

    res.json({ success: true, data: batch });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};
