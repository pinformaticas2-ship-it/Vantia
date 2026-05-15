"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncQuipuBootstrap = exports.disconnectQuipu = exports.saveQuipuCredentials = exports.getQuipuStatus = void 0;
const database_1 = __importDefault(require("../config/database"));
const activityController_1 = require("./activityController");
const quipuService_1 = require("../services/quipuService");
const sanitizeText = (value) => {
    const text = String(value ?? '').trim();
    return text || null;
};
async function getStoredQuipuSettings(userId) {
    const result = await database_1.default.query(`SELECT * FROM quipu_settings WHERE user_id = $1 LIMIT 1`, [userId]);
    return result.rows[0] || null;
}
const getQuipuStatus = async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId)
        return res.status(401).json({ success: false, error: 'No autenticado' });
    try {
        const settings = await getStoredQuipuSettings(userId);
        if (!settings) {
            return res.json({ success: true, data: { connected: false } });
        }
        res.json({
            success: true,
            data: {
                connected: true,
                baseUrl: settings.base_url,
                lastSyncAt: settings.last_sync_at,
                syncSummary: settings.sync_summary || null,
                quipuCompany: settings.quipu_company || null,
                quipuEmail: settings.quipu_email || null,
                hasAccessToken: Boolean(settings.access_token),
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar el estado de Quipu.' });
    }
};
exports.getQuipuStatus = getQuipuStatus;
const saveQuipuCredentials = async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId)
        return res.status(401).json({ success: false, error: 'No autenticado' });
    const appId = sanitizeText(req.body?.appId);
    const appSecret = sanitizeText(req.body?.appSecret);
    const baseUrl = sanitizeText(req.body?.baseUrl) || 'https://getquipu.com';
    if (!appId || !appSecret) {
        return res.status(400).json({ success: false, error: 'App ID y App Secret son obligatorios.' });
    }
    try {
        const token = await (0, quipuService_1.requestQuipuToken)({ app_id: appId, app_secret: appSecret, base_url: baseUrl });
        const userName = await (0, activityController_1.resolveUserName)(userId);
        const result = await database_1.default.query(`INSERT INTO quipu_settings
         (user_id, app_id, app_secret, base_url, access_token, token_type, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE
       SET app_id = EXCLUDED.app_id,
           app_secret = EXCLUDED.app_secret,
           base_url = EXCLUDED.base_url,
           access_token = EXCLUDED.access_token,
           token_type = EXCLUDED.token_type,
           token_expires_at = EXCLUDED.token_expires_at,
           updated_at = NOW()
       RETURNING *`, [userId, appId, appSecret, baseUrl, token.accessToken, token.tokenType, token.expiresAt]);
        await (0, activityController_1.logActivityForReq)(req, 'Configuración Quipu guardada', 'QUIPU', result.rows[0].id, userName, 'UPDATE');
        res.json({
            success: true,
            data: {
                connected: true,
                baseUrl: result.rows[0].base_url,
                tokenExpiresAt: result.rows[0].token_expires_at,
            },
        });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'No se pudo validar la conexión con Quipu.' });
    }
};
exports.saveQuipuCredentials = saveQuipuCredentials;
const disconnectQuipu = async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId)
        return res.status(401).json({ success: false, error: 'No autenticado' });
    try {
        await database_1.default.query(`DELETE FROM quipu_settings WHERE user_id = $1`, [userId]);
        await (0, activityController_1.logActivityForReq)(req, 'Conexión Quipu eliminada', 'QUIPU', undefined, undefined, 'DELETE');
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudo desconectar Quipu.' });
    }
};
exports.disconnectQuipu = disconnectQuipu;
const syncQuipuBootstrap = async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId)
        return res.status(401).json({ success: false, error: 'No autenticado' });
    try {
        const settings = await getStoredQuipuSettings(userId);
        if (!settings) {
            return res.status(400).json({ success: false, error: 'Primero debes configurar Quipu.' });
        }
        const bootstrap = await (0, quipuService_1.fetchQuipuBootstrap)(settings);
        const summary = (0, quipuService_1.summarizeQuipuBootstrap)(bootstrap);
        await database_1.default.query(`UPDATE quipu_settings
       SET last_sync_at = NOW(),
           sync_summary = $2,
           updated_at = NOW()
       WHERE user_id = $1`, [userId, JSON.stringify(summary)]);
        await (0, activityController_1.logActivityForReq)(req, 'Sincronización Quipu ejecutada', 'QUIPU', settings.id, undefined, 'UPDATE');
        res.json({
            success: true,
            data: {
                summary,
                contacts: bootstrap.contacts.slice(0, 20),
                invoices: bootstrap.invoices.slice(0, 20),
                numberingSeries: bootstrap.numberingSeries,
            },
        });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'No se pudo sincronizar con Quipu.' });
    }
};
exports.syncQuipuBootstrap = syncQuipuBootstrap;
