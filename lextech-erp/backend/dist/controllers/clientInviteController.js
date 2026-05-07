"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvite = createInvite;
exports.listInvites = listInvites;
exports.deleteInvite = deleteInvite;
exports.getPublicForm = getPublicForm;
exports.submitPublicForm = submitPublicForm;
const database_1 = __importDefault(require("../config/database"));
const crypto_1 = require("crypto");
function userId(req) { return req.auth?.userId || 'SYSTEM'; }
function userName(req) { return req.auth?.firstName || req.auth?.name || 'Usuario'; }
const ok = (res, data) => res.json({ success: true, data });
const err = (res, msg, s = 500) => res.status(s).json({ success: false, error: msg });
async function ensureTable() {
    await database_1.default.query(`
    CREATE TABLE IF NOT EXISTS client_invite_links (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      token       TEXT        UNIQUE NOT NULL,
      created_by  TEXT        NOT NULL,
      creator_name TEXT       NOT NULL DEFAULT '',
      label       TEXT        NOT NULL DEFAULT '',
      status      TEXT        NOT NULL DEFAULT 'pendiente'
                              CHECK (status IN ('pendiente','completado','expirado')),
      client_id   UUID        REFERENCES entities(id) ON DELETE SET NULL,
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at     TIMESTAMPTZ
    )
  `);
}
async function createInvite(req, res) {
    const uid = userId(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    try {
        await ensureTable();
        const token = (0, crypto_1.randomBytes)(18).toString('base64url');
        const label = (req.body?.label || '').trim();
        const uname = userName(req);
        await database_1.default.query(`INSERT INTO client_invite_links (token, created_by, creator_name, label)
       VALUES ($1, $2, $3, $4)`, [token, uid, uname, label]);
        return ok(res, { token });
    }
    catch (e) {
        return err(res, e.message);
    }
}
async function listInvites(req, res) {
    const uid = userId(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    try {
        await ensureTable();
        const { rows } = await database_1.default.query(`SELECT l.*, e.first_name || COALESCE(' ' || e.last_name, '') AS client_name
       FROM client_invite_links l
       LEFT JOIN entities e ON e.id = l.client_id
       WHERE l.created_by = $1
       ORDER BY l.created_at DESC
       LIMIT 100`, [uid]);
        return ok(res, rows);
    }
    catch (e) {
        return err(res, e.message);
    }
}
async function deleteInvite(req, res) {
    const uid = userId(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    try {
        await database_1.default.query(`DELETE FROM client_invite_links WHERE id=$1 AND created_by=$2`, [req.params.id, uid]);
        return ok(res, { deleted: true });
    }
    catch (e) {
        return err(res, e.message);
    }
}
async function getPublicForm(req, res) {
    try {
        await ensureTable();
        const { rows } = await database_1.default.query(`SELECT id, status, label, creator_name, expires_at FROM client_invite_links WHERE token=$1`, [req.params.token]);
        if (!rows.length)
            return err(res, 'Enlace no válido', 404);
        const link = rows[0];
        if (link.status !== 'pendiente')
            return err(res, 'Este enlace ya ha sido utilizado', 410);
        if (new Date(link.expires_at) < new Date())
            return err(res, 'Este enlace ha expirado', 410);
        return ok(res, { label: link.label, creator_name: link.creator_name });
    }
    catch (e) {
        return err(res, e.message);
    }
}
async function submitPublicForm(req, res) {
    try {
        await ensureTable();
        const { rows } = await database_1.default.query(`SELECT id, status, created_by, expires_at FROM client_invite_links WHERE token=$1`, [req.params.token]);
        if (!rows.length)
            return err(res, 'Enlace no válido', 404);
        const link = rows[0];
        if (link.status !== 'pendiente')
            return err(res, 'Este enlace ya ha sido utilizado', 410);
        if (new Date(link.expires_at) < new Date())
            return err(res, 'Este enlace ha expirado', 410);
        const { first_name, last_name, email, telefono, nif_cif, observaciones } = req.body;
        if (!first_name?.trim())
            return err(res, 'El nombre es obligatorio', 400);
        const { rows: ent } = await database_1.default.query(`INSERT INTO entities
         (first_name, last_name, email, telefono, nif_cif, observaciones,
          entity_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'individual',$7)
       RETURNING id`, [
            first_name.trim(),
            (last_name || '').trim() || null,
            (email || '').trim() || null,
            (telefono || '').trim() || null,
            (nif_cif || '').trim() || null,
            (observaciones || '').trim() || null,
            link.created_by,
        ]);
        const clientId = ent[0].id;
        await database_1.default.query(`UPDATE client_invite_links
       SET status='completado', client_id=$1, used_at=NOW()
       WHERE id=$2`, [clientId, link.id]);
        return ok(res, { message: 'Datos recibidos correctamente', client_id: clientId });
    }
    catch (e) {
        return err(res, e.message);
    }
}
