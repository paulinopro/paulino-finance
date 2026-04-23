import express from 'express';
import {
  getAccountsReceivable,
  getAccountReceivablePayments,
  addAccountReceivablePayment,
  updateAccountReceivablePayment,
  deleteAccountReceivablePayment,
  createAccountReceivable,
  updateAccountReceivable,
  receiveAccountReceivable,
  deleteAccountReceivable,
} from '../controllers/accountsReceivableController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('accounts_receivable'));

router.get('/', getAccountsReceivable);
router.get('/:id/payments', getAccountReceivablePayments);
router.post('/:id/payments', addAccountReceivablePayment);
router.put('/:id/payments/:paymentId', updateAccountReceivablePayment);
router.delete('/:id/payments/:paymentId', deleteAccountReceivablePayment);
router.post('/', createAccountReceivable);
router.put('/:id', updateAccountReceivable);
router.put('/:id/receive', receiveAccountReceivable);
router.delete('/:id', deleteAccountReceivable);

export default router;
