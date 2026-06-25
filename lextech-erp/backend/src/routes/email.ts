import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getAccounts,
  getOAuthProfiles,
  upsertOAuthProfile,
  deleteOAuthProfile,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountFolders,
  createAccountFolder,
  syncAccount,
  syncGmailProfile,
  getMessages,
  getMessage,
  markRead,
  toggleStar,
  deleteMessage,
  sendMail,
  saveDraft,
  getDrafts,
  getStats,
  getRecipientSuggestions,
  logGmailSent,
  linkEmailToExpediente,
  emptyTrash,
  getMessageBodyFromEngine,
  downloadAttachment,
} from '../controllers/emailController';

const router = Router();
router.use(requireAuth);

// ── Cuentas ──────────────────────────────────────────────────────────────────
router.get('/accounts',           getAccounts);
router.get('/profiles',           getOAuthProfiles);
router.post('/profiles',          upsertOAuthProfile);
router.delete('/profiles/:id',    deleteOAuthProfile);
router.post('/accounts',          createAccount);
router.put('/accounts/:id',       updateAccount);
router.delete('/accounts/:id',    deleteAccount);
router.get('/accounts/:id/folders', getAccountFolders);
router.post('/accounts/:id/folders', createAccountFolder);
router.post('/accounts/:id/sync', syncAccount);
router.post('/gmail/profiles/:profileId/sync', syncGmailProfile);

// ── Mensajes ─────────────────────────────────────────────────────────────────
router.get('/messages',           getMessages);
router.get('/messages/:id',       getMessage);
router.patch('/messages/:id/read',   markRead);
router.patch('/messages/:id/star',   toggleStar);
router.delete('/messages/:id',    deleteMessage);
router.get('/contacts/suggestions', getRecipientSuggestions);

// ── Envío y borradores ───────────────────────────────────────────────────────
router.post('/send',              sendMail);
router.post('/gmail/log-sent',    logGmailSent);
router.post('/drafts',            saveDraft);
router.get('/drafts',             getDrafts);

// ── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats',              getStats);

// ── Papelera ──────────────────────────────────────────────────────────────────
router.delete('/trash',           emptyTrash);

// ── Asociar email a expediente ───────────────────────────────────────────────
router.patch('/messages/:id/link', linkEmailToExpediente);

// ── EmailEngine: body cache y adjuntos ───────────────────────────────────────
router.get('/messages/:id/body',                        getMessageBodyFromEngine);
router.get('/messages/:id/attachments/:attachmentId',   downloadAttachment);

export default router;
