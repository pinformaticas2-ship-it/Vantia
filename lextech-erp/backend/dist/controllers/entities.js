"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEntity = exports.patchEntity = exports.updateEntity = exports.createEntity = exports.getEntityById = exports.getEntities = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = __importDefault(require("../config/database"));
const activityController_1 = require("./activityController");
const paths_1 = require("../config/paths");
const nullIfEmpty = (v) => {
    if (v === undefined || v === null)
        return null;
    if (typeof v === 'string') {
        const normalized = v.trim();
        if (!normalized || normalized === '—' || normalized === '-')
            return null;
        return normalized;
    }
    return v;
};
function reqUserName(req) {
    const c = req.auth?.sessionClaims;
    if (!c)
        return req.auth?.userId || 'Sistema';
    return c.name
        || c.full_name
        || [c.first_name, c.last_name].filter(Boolean).join(' ')
        || c.email
        || c.username
        || req.auth?.userId
        || 'Sistema';
}
const pgErr = (e) => `${e?.message || String(e)}${e?.detail ? ' | detail: ' + e.detail : ''}${e?.code ? ' | code: ' + e.code : ''}`;
const friendlyEntityError = (e) => {
    const raw = String(e?.message || '');
    if (e?.code === '22P02' && /type numeric/i.test(raw)) {
        return 'No se pudo guardar el cliente porque algún campo numérico tiene un formato inválido. Revisa código postal, teléfonos y otros campos opcionales.';
    }
    if (e?.code === '22P02' && /date/i.test(raw)) {
        return 'No se pudo guardar el cliente porque alguna fecha no tiene un formato válido.';
    }
    return pgErr(e);
};
const getEntities = async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const typeFilter = req.query.type || '';
        const statusFilter = req.query.status || '';
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const conditions = [];
        const values = [];
        let p = 1;
        if (search) {
            conditions.push(`(
        first_name ILIKE $${p} OR last_name ILIKE $${p}
        OR nif_cif ILIKE $${p} OR email ILIKE $${p}
        OR commercial_name ILIKE $${p}
      )`);
            values.push(`%${search}%`);
            p++;
        }
        if (typeFilter) {
            conditions.push(`type = $${p}`);
            values.push(typeFilter);
            p++;
        }
        if (statusFilter) {
            conditions.push(`client_status = $${p}`);
            values.push(statusFilter);
            p++;
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await database_1.default.query(`
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
    }
    catch (error) {
        console.error('❌ getEntities:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.getEntities = getEntities;
const getEntityById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await database_1.default.query(`SELECT * FROM entities WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('❌ getEntityById:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.getEntityById = getEntityById;
const createEntity = async (req, res) => {
    const { type, client_status, document_type, first_name, last_name, commercial_name, nif_cif, gender, birth_date, nationality, expedition_country, legal_nature, address_street, address_town, address_cp, address_province, address_country, email, phone_1, phone_2, phone_3, phone_mobile, phone_fax, website, date_alta, date_baja, lopd, commercial_communications, center, photo_url, } = req.body;
    const userId = req.auth?.userId || 'SYSTEM';
    if (!first_name || !nif_cif) {
        return res.status(400).json({
            success: false,
            error: 'Nombre y NIF/CIF son obligatorios.'
        });
    }
    const safeBirthDate = nullIfEmpty(birth_date);
    const safeDateAlta = nullIfEmpty(date_alta) || new Date().toISOString().split('T')[0];
    const safeDateBaja = nullIfEmpty(date_baja);
    try {
        const result = await database_1.default.query(`
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
      ) RETURNING *`, [
            nullIfEmpty(type) || 'CLIENTE',
            nullIfEmpty(client_status) || 'Alta',
            nullIfEmpty(document_type) || 'DNI',
            first_name,
            nullIfEmpty(last_name),
            nullIfEmpty(commercial_name),
            nif_cif,
            nullIfEmpty(gender),
            safeBirthDate,
            nullIfEmpty(nationality) || 'Española',
            nullIfEmpty(expedition_country) || 'España',
            nullIfEmpty(legal_nature),
            nullIfEmpty(address_street),
            nullIfEmpty(address_town),
            nullIfEmpty(address_cp),
            nullIfEmpty(address_province),
            nullIfEmpty(address_country) || 'España',
            nullIfEmpty(email),
            nullIfEmpty(phone_1),
            nullIfEmpty(phone_2),
            nullIfEmpty(phone_3),
            nullIfEmpty(phone_mobile),
            nullIfEmpty(phone_fax),
            nullIfEmpty(website),
            safeDateAlta,
            safeDateBaja,
            nullIfEmpty(lopd) || 'Pendiente',
            nullIfEmpty(commercial_communications) || 'No',
            nullIfEmpty(center),
            nullIfEmpty(photo_url),
            userId,
        ]);
        try {
            const clientId = result.rows[0].id;
            const serverFolder = path_1.default.join(paths_1.UPLOADS_CLIENTS_ROOT, clientId);
            const localFolder = path_1.default.join(paths_1.CLIENT_FILES_ROOT, clientId);
            if (!fs_1.default.existsSync(serverFolder))
                fs_1.default.mkdirSync(serverFolder, { recursive: true });
            if (!fs_1.default.existsSync(localFolder))
                fs_1.default.mkdirSync(localFolder, { recursive: true });
        }
        catch (err) {
            console.warn('⚠️ No se pudo crear carpeta para cliente:', err);
        }
        const entityName = `${first_name} ${last_name || ''}`.trim() + ` (${nif_cif})`;
        (0, activityController_1.logActivityForReq)(req, 'Nuevo cliente creado', 'CLIENT', result.rows[0].id, entityName);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('❌ createEntity:', pgErr(error));
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
        }
        const status = error?.code === '22P02' ? 400 : 500;
        res.status(status).json({ success: false, error: friendlyEntityError(error) });
    }
};
exports.createEntity = createEntity;
const updateEntity = async (req, res) => {
    const { id } = req.params;
    const { type, client_status, document_type, first_name, last_name, commercial_name, nif_cif, gender, birth_date, nationality, expedition_country, legal_nature, address_street, address_town, address_cp, address_province, address_country, email, phone_1, phone_2, phone_3, phone_mobile, phone_fax, website, date_alta, date_baja, lopd, commercial_communications, center, photo_url, } = req.body;
    const safeBirthDate = nullIfEmpty(birth_date);
    const safeDateAlta = nullIfEmpty(date_alta);
    const safeDateBaja = nullIfEmpty(date_baja);
    try {
        const result = await database_1.default.query(`
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
      RETURNING *`, [
            nullIfEmpty(type) || 'CLIENTE',
            nullIfEmpty(client_status) || 'Alta',
            nullIfEmpty(document_type) || 'DNI',
            first_name,
            nullIfEmpty(last_name),
            nullIfEmpty(commercial_name),
            nif_cif,
            nullIfEmpty(gender),
            safeBirthDate,
            nullIfEmpty(nationality) || 'Española',
            nullIfEmpty(expedition_country) || 'España',
            nullIfEmpty(legal_nature),
            nullIfEmpty(address_street),
            nullIfEmpty(address_town),
            nullIfEmpty(address_cp),
            nullIfEmpty(address_province),
            nullIfEmpty(address_country) || 'España',
            nullIfEmpty(email),
            nullIfEmpty(phone_1),
            nullIfEmpty(phone_2),
            nullIfEmpty(phone_3),
            nullIfEmpty(phone_mobile),
            nullIfEmpty(phone_fax),
            nullIfEmpty(website),
            safeDateAlta,
            safeDateBaja,
            nullIfEmpty(lopd) || 'Pendiente',
            nullIfEmpty(commercial_communications) || 'No',
            nullIfEmpty(center),
            nullIfEmpty(photo_url),
            id,
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
        const updatedRow = result.rows[0];
        const updatedName = updatedRow.commercial_name
            || [updatedRow.first_name, updatedRow.last_name].filter(Boolean).join(' ')
            || id;
        (0, activityController_1.logActivityForReq)(req, 'Datos del cliente actualizados', 'CLIENT', id, updatedName);
        res.json({ success: true, data: updatedRow });
    }
    catch (error) {
        console.error('❌ updateEntity:', pgErr(error));
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
        }
        const status = error?.code === '22P02' ? 400 : 500;
        res.status(status).json({ success: false, error: friendlyEntityError(error) });
    }
};
exports.updateEntity = updateEntity;
const patchEntity = async (req, res) => {
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
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const values = entries.map(([, v]) => (v === '' ? null : v));
    try {
        const result = await database_1.default.query(`UPDATE entities SET ${sets}, updated_at = NOW() WHERE id = $${entries.length + 1} RETURNING *`, [...values, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        res.json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('❌ patchEntity:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.patchEntity = patchEntity;
const deleteEntity = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await database_1.default.query(`DELETE FROM entities WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
        res.json({ success: true, message: 'Cliente eliminado correctamente' });
    }
    catch (error) {
        console.error('❌ deleteEntity:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.deleteEntity = deleteEntity;
