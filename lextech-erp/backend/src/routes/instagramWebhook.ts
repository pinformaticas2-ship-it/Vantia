import express, { Router } from 'express';
import { verificarWebhook, recibirWebhook } from '../controllers/instagramController';

// Webhook de Instagram (mensajes directos y comentarios). Sin sesión y con el
// cuerpo en bruto: la firma X-Hub-Signature-256 se calcula sobre los bytes tal cual llegan.
const router = Router();
router.get('/', verificarWebhook);
router.post('/', express.raw({ type: '*/*', limit: '5mb' }), recibirWebhook);
export default router;
