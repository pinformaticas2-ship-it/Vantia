import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  createFactura,
  createGasto,
  createPresupuesto,
  deleteFactura,
  deleteGasto,
  deletePresupuesto,
  getBillingBootstrap,
  updateFactura,
  updateGasto,
  updatePresupuesto,
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '../controllers/facturacionController';

const router = Router();

// Tesorería es solo para administradores -- se aplica a todas las rutas
// de este router, además del requireAuth que ya lleva cada una.
router.use(requireAdmin);

router.get('/bootstrap', requireAuth, getBillingBootstrap);

router.post('/facturas', requireAuth, createFactura);
router.put('/facturas/:id', requireAuth, updateFactura);
router.delete('/facturas/:id', requireAuth, deleteFactura);

router.post('/gastos', requireAuth, createGasto);
router.put('/gastos/:id', requireAuth, updateGasto);
router.delete('/gastos/:id', requireAuth, deleteGasto);

router.post('/presupuestos', requireAuth, createPresupuesto);
router.put('/presupuestos/:id', requireAuth, updatePresupuesto);
router.delete('/presupuestos/:id', requireAuth, deletePresupuesto);

router.get('/bank-accounts', requireAuth, listBankAccounts);
router.post('/bank-accounts', requireAuth, createBankAccount);
router.put('/bank-accounts/:id', requireAuth, updateBankAccount);
router.delete('/bank-accounts/:id', requireAuth, deleteBankAccount);

export default router;
