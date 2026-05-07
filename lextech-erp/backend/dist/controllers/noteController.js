"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNote = exports.updateNote = exports.createNote = exports.getNotes = void 0;
const database_1 = __importDefault(require("../config/database"));
const activityController_1 = require("./activityController");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = ['general', 'urgente', 'seguimiento', 'recordatorio', 'comercial', 'legal', 'otro'];
const VALID_PRIORITIES = ['baja', 'normal', 'alta', 'urgente'];
function getNotesScope(req) {
    const isExpediente = req.baseUrl.includes('/expedientes/') || req.originalUrl.includes('/expedientes/');
    return {
        ownerId: req.params.id,
        ownerColumn: isExpediente ? 'expediente_id' : 'client_id',
        ownerTable: isExpediente ? 'expedientes' : 'entities',
        ownerLabel: isExpediente ? 'expediente' : 'cliente',
        activityType: isExpediente ? 'EXPEDIENTE' : 'CLIENT',
    };
}
const getNotes = async (req, res) => {
    try {
        const scope = getNotesScope(req);
        if (!scope.ownerId || !UUID_REGEX.test(scope.ownerId)) {
            return res.status(400).json({ success: false, error: `ID de ${scope.ownerLabel} inválido.` });
        }
        const result = await database_1.default.query(`SELECT id, client_id, expediente_id, content, category, priority, color, created_by, created_at, updated_at
       FROM notes
       WHERE ${scope.ownerColumn} = $1
       ORDER BY created_at DESC`, [scope.ownerId]);
        return res.json({ success: true, data: result.rows });
    }
    catch (error) {
        console.error('Error obteniendo notas:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener las notas.' });
    }
};
exports.getNotes = getNotes;
const createNote = async (req, res) => {
    try {
        const scope = getNotesScope(req);
        const { content, category = 'general', priority = 'normal', color = '#FCD34D' } = req.body;
        if (!scope.ownerId || !UUID_REGEX.test(scope.ownerId)) {
            return res.status(400).json({ success: false, error: `ID de ${scope.ownerLabel} inválido.` });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'El contenido de la nota es obligatorio.' });
        }
        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Categoría inválida.' });
        }
        if (!VALID_PRIORITIES.includes(priority)) {
            return res.status(400).json({ success: false, error: 'Prioridad inválida.' });
        }
        const ownerCheck = await database_1.default.query(`SELECT id FROM ${scope.ownerTable} WHERE id = $1`, [scope.ownerId]);
        if (ownerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `${scope.ownerLabel.charAt(0).toUpperCase() + scope.ownerLabel.slice(1)} no encontrado.`,
            });
        }
        const userId = req.auth?.userId || 'SYSTEM';
        const userName = userId === 'SYSTEM' ? 'Sistema' : await (0, activityController_1.resolveUserName)(userId);
        const result = await database_1.default.query(`INSERT INTO notes (client_id, expediente_id, content, category, priority, color, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, client_id, expediente_id, content, category, priority, color, created_by, created_at, updated_at`, [
            scope.ownerColumn === 'client_id' ? scope.ownerId : null,
            scope.ownerColumn === 'expediente_id' ? scope.ownerId : null,
            content.trim(),
            category,
            priority,
            color,
            userName,
        ]);
        const preview = content.trim().length > 80 ? `${content.trim().slice(0, 80)}…` : content.trim();
        (0, activityController_1.logActivityForReq)(req, `Nota añadida: ${preview}`, scope.activityType, scope.ownerId);
        return res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('Error creando nota:', error);
        return res.status(500).json({ success: false, error: 'Error al crear la nota.' });
    }
};
exports.createNote = createNote;
const updateNote = async (req, res) => {
    try {
        const scope = getNotesScope(req);
        const { noteId } = req.params;
        const { content, category, priority, color } = req.body;
        if (!scope.ownerId || !UUID_REGEX.test(scope.ownerId)) {
            return res.status(400).json({ success: false, error: `ID de ${scope.ownerLabel} inválido.` });
        }
        if (!noteId || !UUID_REGEX.test(noteId)) {
            return res.status(400).json({ success: false, error: 'ID de nota inválido.' });
        }
        if (category && !VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Categoría inválida.' });
        }
        if (priority && !VALID_PRIORITIES.includes(priority)) {
            return res.status(400).json({ success: false, error: 'Prioridad inválida.' });
        }
        const noteCheck = await database_1.default.query(`SELECT id FROM notes WHERE id = $1 AND ${scope.ownerColumn} = $2`, [noteId, scope.ownerId]);
        if (noteCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: `Nota no encontrada para este ${scope.ownerLabel}.` });
        }
        const updates = [];
        const values = [];
        let p = 1;
        if (content !== undefined && content !== null) {
            updates.push(`content = $${p++}`);
            values.push(String(content).trim());
        }
        if (category !== undefined && category !== null) {
            updates.push(`category = $${p++}`);
            values.push(category);
        }
        if (priority !== undefined && priority !== null) {
            updates.push(`priority = $${p++}`);
            values.push(priority);
        }
        if (color !== undefined && color !== null) {
            updates.push(`color = $${p++}`);
            values.push(color);
        }
        if (!updates.length) {
            return res.status(400).json({ success: false, error: 'No hay campos para actualizar.' });
        }
        values.push(noteId, scope.ownerId);
        const result = await database_1.default.query(`UPDATE notes SET ${updates.join(', ')}
       WHERE id = $${p} AND ${scope.ownerColumn} = $${p + 1}
       RETURNING id, client_id, expediente_id, content, category, priority, color, created_by, created_at, updated_at`, values);
        return res.json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        console.error('Error actualizando nota:', error);
        return res.status(500).json({ success: false, error: 'Error al actualizar la nota.' });
    }
};
exports.updateNote = updateNote;
const deleteNote = async (req, res) => {
    try {
        const scope = getNotesScope(req);
        const { noteId } = req.params;
        if (!scope.ownerId || !UUID_REGEX.test(scope.ownerId)) {
            return res.status(400).json({ success: false, error: `ID de ${scope.ownerLabel} inválido.` });
        }
        if (!noteId || !UUID_REGEX.test(noteId)) {
            return res.status(400).json({ success: false, error: 'ID de nota inválido.' });
        }
        const noteCheck = await database_1.default.query(`SELECT id, content FROM notes WHERE id = $1 AND ${scope.ownerColumn} = $2`, [noteId, scope.ownerId]);
        if (noteCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: `Nota no encontrada para este ${scope.ownerLabel}.` });
        }
        const noteContent = noteCheck.rows[0].content || '';
        await database_1.default.query('DELETE FROM notes WHERE id = $1', [noteId]);
        const preview = noteContent.length > 80 ? `${noteContent.slice(0, 80)}…` : noteContent;
        (0, activityController_1.logActivityForReq)(req, `Nota eliminada: ${preview}`, scope.activityType, scope.ownerId);
        return res.json({ success: true, message: 'Nota eliminada correctamente.' });
    }
    catch (error) {
        console.error('Error eliminando nota:', error);
        return res.status(500).json({ success: false, error: 'Error al eliminar la nota.' });
    }
};
exports.deleteNote = deleteNote;
