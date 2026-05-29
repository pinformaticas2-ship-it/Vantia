import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  disconnectQuipu,
  getQuipuStatus,
  saveQuipuCredentials,
  syncQuipuBootstrap,
  // Synced (from local DB)
  getSyncedContacts,
  getSyncedBankAccounts,
  // Contactos
  getQuipuContacts,
  createQuipuContact,
  updateQuipuContact,
  deleteQuipuContact,
  // Facturas (invoices)
  getQuipuInvoices,
  getQuipuInvoiceDetail,
  createQuipuInvoice,
  updateQuipuInvoice,
  deleteQuipuInvoice,
  sendQuipuInvoiceByEmail,
  // Cobros (receipts)
  getQuipuReceipts,
  createQuipuReceipt,
  // Cuentas bancarias
  getQuipuBankAccounts,
  getQuipuBankTransactions,
  // Series de numeración
  getQuipuNumberingSeries,
  // Empresa
  getQuipuCompany,
  // Push local → Quipu
  pushLocalFacturaToQuipu,
} from '../controllers/quipuController';

const router = Router();

// ── Configuración ──────────────────────────────────────────────
router.get('/status',      requireAuth, getQuipuStatus);
router.post('/connect',    requireAuth, saveQuipuCredentials);
router.post('/sync',       requireAuth, syncQuipuBootstrap);
router.delete('/disconnect', requireAuth, disconnectQuipu);

// ── Datos sincronizados (BD local, sin llamadas en vivo) ───────
router.get('/synced/contacts',      requireAuth, getSyncedContacts);
router.get('/synced/bank_accounts', requireAuth, getSyncedBankAccounts);

// ── Contactos ──────────────────────────────────────────────────
router.get('/contacts',         requireAuth, getQuipuContacts);
router.post('/contacts',        requireAuth, createQuipuContact);
router.patch('/contacts/:id',   requireAuth, updateQuipuContact);
router.delete('/contacts/:id',  requireAuth, deleteQuipuContact);

// ── Facturas ───────────────────────────────────────────────────
router.get('/invoices',                      requireAuth, getQuipuInvoices);
router.get('/invoices/:id',                  requireAuth, getQuipuInvoiceDetail);
router.post('/invoices',                     requireAuth, createQuipuInvoice);
router.patch('/invoices/:id',                requireAuth, updateQuipuInvoice);
router.delete('/invoices/:id',               requireAuth, deleteQuipuInvoice);
router.post('/invoices/:id/send_by_email',   requireAuth, sendQuipuInvoiceByEmail);

// ── Cobros ─────────────────────────────────────────────────────
router.get('/receipts',   requireAuth, getQuipuReceipts);
router.post('/receipts',  requireAuth, createQuipuReceipt);

// ── Cuentas bancarias ──────────────────────────────────────────
router.get('/bank_accounts',                         requireAuth, getQuipuBankAccounts);
router.get('/bank_accounts/:id/transactions',        requireAuth, getQuipuBankTransactions);

// ── Series de numeración ───────────────────────────────────────
router.get('/numbering_series', requireAuth, getQuipuNumberingSeries);

// ── Empresa ────────────────────────────────────────────────────
router.get('/company', requireAuth, getQuipuCompany);

// ── Push factura local → Quipu ─────────────────────────────────
router.post('/push-factura/:id', requireAuth, pushLocalFacturaToQuipu);

export default router;
