"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = void 0;
const database_1 = __importDefault(require("../config/database"));
const clientIp_1 = require("../utils/clientIp");
function getDeviceId(req) {
    const raw = req.headers?.['x-device-id'];
    if (!raw)
        return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = String(value).trim();
    return trimmed ? trimmed.slice(0, 120) : null;
}
const auditLog = (action, entity) => {
    return async (req, _res, next) => {
        next();
        const userId = req.auth?.userId || 'ANONYMOUS';
        const ip = (0, clientIp_1.getClientIp)(req);
        const details = JSON.stringify({
            body: req.body,
            query: req.query,
            params: req.params,
            device_id: getDeviceId(req),
        });
        try {
            await database_1.default.query(`INSERT INTO audit_logs (user_id, action, entity, ip_address, details)
         VALUES ($1, $2, $3, $4, $5)`, [userId, action, entity, ip, details]);
            console.log(`AUDIT: ${action} on ${entity} by ${userId}`);
        }
        catch (err) {
            console.error('Error guardando auditoria:', err);
        }
    };
};
exports.auditLog = auditLog;
