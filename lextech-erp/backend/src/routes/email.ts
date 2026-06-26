import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClerkClient } from '@clerk/backend';
import { addSSEClient } from '../utils/emailSSE';
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

// ── SSE: real-time email notifications (auth via ?token= since EventSource can't send headers) ──
router.get('/events', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const payload = await clerk.verifyToken(token);
    const userId = payload.sub;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write('data: {"type":"connected"}\n\n');

    const cleanup = addSSEClient(userId, res);
    const keepAlive = setInterval(() => { try { res.write('data: {"type":"ping"}\n\n'); } catch { /**/ } }, 25_000);

    req.on('close', () => { cleanup(); clearInterval(keepAlive); });
  } catch {
    if (!res.headersSent) res.status(401).json({ error: 'Invalid token' });
  }
});

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
