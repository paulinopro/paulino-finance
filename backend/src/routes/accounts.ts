import express from 'express';
import {
  getAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  listBankAccountMovements,
} from '../controllers/accountController';
import { listAccountTransfers, createAccountTransfer } from '../controllers/accountTransferController';
import { listCashAdjustments, createCashAdjustment } from '../controllers/cashAdjustmentController';
import { createEntityActiveStatusHandler } from '../controllers/entityActiveStatus';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('accounts'));

router.get('/transfers', listAccountTransfers);
router.post('/transfers', createAccountTransfer);
router.get('/cash-adjustments', listCashAdjustments);

router.get('/', getAccounts);
router.post('/', createAccount);
router.patch('/:id/active-status', createEntityActiveStatusHandler('accounts'));
router.post('/:id/cash-adjustments', createCashAdjustment);
router.get('/:id/movements', listBankAccountMovements);
router.get('/:id', getAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
