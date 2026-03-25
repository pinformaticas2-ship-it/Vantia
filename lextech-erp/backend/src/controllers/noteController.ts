import { Request, Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';

interface AuthenticatedRequest extends Request {
  auth?: { userId: string };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = ['general', 'urgente', 'seguimiento', 'recordatorio', 'comercial', 'legal', 'otro'];
const VALID_PRIORITIES = ['baja', 'normal', 'alta', 'urgente'];

/**
 * GET /api/entities/:id/notes
 * Obtener todas las notas de un cliente
 */
export const getNotes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // NOTA: el parámetro viene del router padre (/api/entities/:id) via mergeParams
    const clientId = req.params.id;

    if (!clientId || !UUID_REGEX.test(clientId)) {
      return res.status(400).json({ success: false, error: "ID de cliente inválido." });
    }

    const result = await pool.query(
      `SELECT id, client_id, content, category, priority, color, created_by, created_at, updated_at
       FROM notes
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [clientId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error("❌ Error obteniendo notas:", error);
    return res.status(500).json({ success: false, error: "Error al obtener las notas." });
  }
};

/**
 * POST /api/entities/:id/notes
 * Crear una nueva nota
 */
export const createNote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.params.id;
    const { content, category = 'general', priority = 'normal', color = '#FCD34D' } = req.body;

    if (!clientId || !UUID_REGEX.test(clientId)) {
      return res.status(400).json({ success: false, error: "ID de cliente inválido." });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: "El contenido de la nota es obligatorio." });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: "Categoría inválida." });
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, error: "Prioridad inválida." });
    }

    // Verificar que el cliente existe
    const clientCheck = await pool.query('SELECT id FROM entities WHERE id = $1', [clientId]);
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Cliente no encontrado." });
    }

    const userId = req.auth?.userId || 'SYSTEM';
    const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

    const result = await pool.query(
      `INSERT INTO notes (client_id, content, category, priority, color, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, client_id, content, category, priority, color, created_by, created_at, updated_at`,
      [clientId, content.trim(), category, priority, color, userName]
    );

    const preview = content.trim().length > 80 ? content.trim().slice(0, 80) + '…' : content.trim();
    logActivityForReq(req, `Nota añadida: ${preview}`, 'CLIENT', clientId);
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("❌ Error creando nota:", error);
    return res.status(500).json({ success: false, error: "Error al crear la nota." });
  }
};

/**
 * PUT /api/entities/:id/notes/:noteId
 * Actualizar una nota
 */
export const updateNote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.params.id;
    const { noteId } = req.params;
    const { content, category, priority, color } = req.body;

    if (!clientId || !UUID_REGEX.test(clientId)) {
      return res.status(400).json({ success: false, error: "ID de cliente inválido." });
    }

    if (!noteId || !UUID_REGEX.test(noteId)) {
      return res.status(400).json({ success: false, error: "ID de nota inválido." });
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: "Categoría inválida." });
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, error: "Prioridad inválida." });
    }

    // Verificar que la nota pertenece al cliente
    const noteCheck = await pool.query(
      'SELECT id FROM notes WHERE id = $1 AND client_id = $2',
      [noteId, clientId]
    );

    if (noteCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Nota no encontrada para este cliente." });
    }

    // Construir query dinámicamente — solo actualiza los campos enviados
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (content !== undefined && content !== null) { updates.push(`content = $${p++}`); values.push(content.trim()); }
    if (category !== undefined && category !== null) { updates.push(`category = $${p++}`); values.push(category); }
    if (priority !== undefined && priority !== null) { updates.push(`priority = $${p++}`); values.push(priority); }
    if (color !== undefined && color !== null) { updates.push(`color = $${p++}`); values.push(color); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: "No hay campos para actualizar." });
    }

    values.push(noteId, clientId);

    const result = await pool.query(
      `UPDATE notes SET ${updates.join(', ')}
       WHERE id = $${p} AND client_id = $${p + 1}
       RETURNING id, client_id, content, category, priority, color, created_by, created_at, updated_at`,
      values
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("❌ Error actualizando nota:", error);
    return res.status(500).json({ success: false, error: "Error al actualizar la nota." });
  }
};

/**
 * DELETE /api/entities/:id/notes/:noteId
 * Eliminar una nota
 */
export const deleteNote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = req.params.id;
    const { noteId } = req.params;

    if (!clientId || !UUID_REGEX.test(clientId)) {
      return res.status(400).json({ success: false, error: "ID de cliente inválido." });
    }

    if (!noteId || !UUID_REGEX.test(noteId)) {
      return res.status(400).json({ success: false, error: "ID de nota inválido." });
    }

    // Verificar que la nota pertenece al cliente y obtener su contenido antes de borrar
    const noteCheck = await pool.query(
      'SELECT id, content FROM notes WHERE id = $1 AND client_id = $2',
      [noteId, clientId]
    );

    if (noteCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Nota no encontrada para este cliente." });
    }

    const noteContent: string = noteCheck.rows[0].content || '';
    await pool.query('DELETE FROM notes WHERE id = $1', [noteId]);

    const preview = noteContent.length > 80 ? noteContent.slice(0, 80) + '…' : noteContent;
    logActivityForReq(req, `Nota eliminada: ${preview}`, 'CLIENT', clientId);
    return res.json({ success: true, message: "Nota eliminada correctamente." });
  } catch (error: any) {
    console.error("❌ Error eliminando nota:", error);
    return res.status(500).json({ success: false, error: "Error al eliminar la nota." });
  }
};
