import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import {
  createSchedule,
  getConversationByClient,
  getConversationByPhone,
  getSchedules,
  getWhatsAppConfig,
  getWhatsAppContacts,
  getWhatsAppStatus,
  receiveWebhook,
  saveWhatsAppConfig,
  sendWhatsAppMessage,
  testWhatsAppConfig,
  verifyWebhook,
} from '../controllers/whatsappController';

const router = Router();

router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

router.use(requireAuth);
router.use(requireModulePermission('whatsapp'));

router.get('/status', getWhatsAppStatus);
router.get('/config', getWhatsAppConfig);
router.put('/config', saveWhatsAppConfig);
router.post('/config/test', testWhatsAppConfig);
router.get('/contacts', getWhatsAppContacts);
router.get('/conversations/client/:clientId', getConversationByClient);
router.get('/conversations/phone/:phone', getConversationByPhone);
router.post('/messages', sendWhatsAppMessage);
router.get('/schedules', getSchedules);
router.post('/schedules', createSchedule);

export default router;
