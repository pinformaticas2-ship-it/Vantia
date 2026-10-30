import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listarSkills, crearSkill, actualizarSkill, borrarSkill } from '../controllers/skillsController';

// Skills de la IA (Ajustes → Skills). Las ve todo el despacho; crear, editar
// y borrar solo el propietario o un administrador (se comprueba en el controlador).
const router = Router();
router.use(requireAuth);

router.get('/', listarSkills);
router.post('/', crearSkill);
router.put('/:id', actualizarSkill);
router.delete('/:id', borrarSkill);

export default router;
