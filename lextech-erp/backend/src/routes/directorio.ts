import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getProfesionales,
  getProfesionalById,
  createProfesional,
  updateProfesional,
  deleteProfesional,
} from '../controllers/directorioController';

const router = Router();

router.get('/',       requireAuth, getProfesionales);
router.post('/',      requireAuth, createProfesional);
router.get('/:id',    requireAuth, getProfesionalById);
router.put('/:id',    requireAuth, updateProfesional);
router.delete('/:id', requireAuth, deleteProfesional);

export default router;
