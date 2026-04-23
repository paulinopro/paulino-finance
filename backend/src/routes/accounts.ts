import express from 'express';
import {
  getAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../controllers/accountController';
import { listAccountTransfers, createAccountTransfer } from '../controllers/accountTransferController';
import { listCashAdjustments, createCashAdjustment } from '../controllers/cashAdjustmentController';
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
router.post('/:id/cash-adjustments', createCashAdjustment);
router.get('/:id', getAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
