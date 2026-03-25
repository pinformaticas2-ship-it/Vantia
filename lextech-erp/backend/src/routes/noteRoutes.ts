import { Router } from 'express';
import { getNotes, createNote, updateNote, deleteNote } from '../controllers/noteController';
import { requireAuth } from '../middleware/auth';

// mergeParams: true es CRÍTICO — permite leer /:id del router padre (entities.ts)
const router = Router({ mergeParams: true });

/**
 * Rutas de notas — se montan bajo /api/entities/:id/notes
 *
 * GET    /api/entities/:id/notes              → listar notas del cliente
 * POST   /api/entities/:id/notes              → crear nota
 * PUT    /api/entities/:id/notes/:noteId      → actualizar nota
 * DELETE /api/entities/:id/notes/:noteId      → eliminar nota
 */

router.get('/',          requireAuth, getNotes);
router.post('/',         requireAuth, createNote);
router.put('/:noteId',   requireAuth, updateNote);
router.delete('/:noteId',requireAuth, deleteNote);

export default router;
