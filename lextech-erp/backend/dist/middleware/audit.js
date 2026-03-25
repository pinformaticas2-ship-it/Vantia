"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = void 0;
const database_1 = __importDefault(require("../config/database"));
const auditLog = (action, entity) => {
    return async (req, res, next) => {
        next();
        const userId = req.auth?.userId || 'ANONYMOUS';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const details = JSON.stringify({
            body: req.body,
            query: req.query,
            params: req.params
        });
        try {
            await database_1.default.query(`INSERT INTO audit_logs (user_id, action, entity, ip_address, details) 
             VALUES ($1, $2, $3, $4, $5)`, [userId, action, entity, ip, details]);
            console.log(`📝 AUDIT: ${action} on ${entity} by ${userId}`);
        }
        catch (err) {
            console.error("❌ Error guardando auditoría:", err);
        }
    };
};
exports.auditLog = auditLog;
