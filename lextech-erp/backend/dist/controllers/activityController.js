"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addClientActivity = exports.getClientActivity = exports.getActivity = void 0;
exports.logActivityForReq = logActivityForReq;
exports.logActivity = logActivity;
const database_1 = __importDefault(require("../config/database"));
const pgErr = (e) => `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;
const _nameCache = new Map();
async function resolveUserName(userId) {
    const hit = _nameCache.get(userId);
    if (hit && hit.exp > Date.now())
        return hit.name;
    try {
        const { clerkClient } = require('@clerk/clerk-sdk-node');
        const user = await clerkClient.users.getUser(userId);
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
            || user.emailAddresses?.[0]?.emailAddress
            || userId;
        _nameCache.set(userId, { name, exp: Date.now() + 10 * 60 * 1000 });
        return name;
    }
    catch {
        return userId;
    }
}
async function logActivityForReq(req, actionType, entityType, entityId, entityName) {
    const userId = req.auth?.userId || 'SYSTEM';
    const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);
    return logActivity(userId, userName, actionType, entityType, entityId, entityName);
}
const getActivity = async (_req, res) => {
    try {
        const result = await database_1.default.query(`
      SELECT id, user_id, user_name, action_type,
             entity_type, entity_id, entity_name, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 50
    `);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        console.error('❌ getActivity:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.getActivity = getActivity;
const getClientActivity = async (req, res) => {
    const { clientId } = req.params;
    try {
        const result = await database_1.default.query(`
      SELECT id, user_id, user_name, action_type,
             entity_type, entity_id, entity_name, created_at
      FROM activity_log
      WHERE entity_id = $1
      ORDER BY created_at DESC
      LIMIT 200
    `, [clientId]);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        console.error('❌ getClientActivity:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.getClientActivity = getClientActivity;
const addClientActivity = async (req, res) => {
    const { clientId } = req.params;
    const { action_type, description } = req.body;
    const userId = req.auth?.userId || 'SYSTEM';
    const userName = req.auth?.sessionClaims?.name
        || req.auth?.sessionClaims?.email
        || userId;
    if (!action_type || !action_type.trim()) {
        return res.status(400).json({ success: false, error: 'action_type es obligatorio.' });
    }
    try {
        const clientRes = await database_1.default.query(`SELECT COALESCE(commercial_name, CONCAT(first_name, ' ', last_name)) AS name
       FROM entities WHERE id = $1`, [clientId]);
        const entityName = clientRes.rows[0]?.name || clientId;
        const fullAction = description?.trim()
            ? `${action_type.trim()}: ${description.trim()}`
            : action_type.trim();
        const result = await database_1.default.query(`INSERT INTO activity_log (user_id, user_name, action_type, entity_type, entity_id, entity_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [userId, userName, fullAction, 'CLIENT', clientId, entityName]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('❌ addClientActivity:', pgErr(error));
        res.status(500).json({ success: false, error: pgErr(error) });
    }
};
exports.addClientActivity = addClientActivity;
async function logActivity(userId, userName, actionType, entityType, entityId, entityName) {
    try {
        await database_1.default.query(`INSERT INTO activity_log (user_id, user_name, action_type, entity_type, entity_id, entity_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [userId, userName, actionType, entityType || null, entityId || null, entityName || null]);
    }
    catch (_e) {
    }
}
