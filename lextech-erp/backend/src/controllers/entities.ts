import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';
import { logActivity } from './activityController';

const UPLOADS_ROOT = path.join(__dirname, '../../uploads/clients');

const CLIENT_FILES_ROOT = process.env.CLIENT_FILES_PATH
  ? path.resolve(process.env.CLIENT_FILES_PATH)
  : path.join(process.env.USERPROFILE || process.env.HOME || '', 'lextech-client-files');

/** Convierte string vacío a null (evita cast ::date fallido en PostgreSQL) */
const nullIfEmpty = (v: any) => (v === '' || v === undefined ? null : v);

/** Formatea un error de PG de forma legible */
const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.detail ? ' | detail: ' + e.detail : ''}${e?.code ? ' | code: ' + e.code : ''}`;

// ─────────────────────────────────────────────────────────────
// GET /api/entities
// ─────────────────────────────────────────────────────────────
export const getEntities = async (req: any, res: Response) => {
  // Intentar primero query completo (con todas las columnas nuevas)
  try {
    const result = await pool.query(`
      SELECT
        id,
        internal_number,
        type,
        client_status,
        first_name,
        last_name,
        commercial_name,
        nif_cif,
        email,
        phone_1,
        phone_mobile,
        address_town,
        address_province,
        photo_url,
        created_at
      FROM entities
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return res.json({ success: true, data: result.rows });
  } catch (_fullErr: any) {
    // Si falla (columnas nuevas aún no existen), usar query mínimo con columnas originales
    console.warn('⚠️  getEntities full query failed, using fallback query:', _fullErr?.message);
  }

  try {
    const result = await pool.query(`
      SELECT
        id,
        type,
        first_name,
        last_name,
        commercial_name,
        nif_cif,
        email,
        phone_1,
        address_town,
        created_at
      FROM entities
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('❌ getEntities fallback:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
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
    logActivity(userId, userId, 'Nuevo cliente creado', 'CLIENT', result.rows[0].id, entityName);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ createEntity:', pgErr(error));
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
    }
    res.status(500).json({ success: false, error: pgErr(error) });
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
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ updateEntity:', pgErr(error));
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
    }
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
      `DELETE FROM entities WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    res.json({ success: true, message: 'Cliente eliminado correctamente' });
  } catch (error: any) {
    console.error('❌ deleteEntity:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};
