import express from 'express';
import {
  getAccountsPayable,
  getAccountPayablePayments,
  addAccountPayablePayment,
  updateAccountPayablePayment,
  deleteAccountPayablePayment,
  createAccountPayable,
  updateAccountPayable,
  payAccountPayable,
  deleteAccountPayable,
} from '../controllers/accountsPayableController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('accounts_payable'));

router.get('/', getAccountsPayable);
router.get('/:id/payments', getAccountPayablePayments);
router.post('/:id/payments', addAccountPayablePayment);
router.put('/:id/payments/:paymentId', updateAccountPayablePayment);
router.delete('/:id/payments/:paymentId', deleteAccountPayablePayment);
router.post('/', createAccountPayable);
router.put('/:id', updateAccountPayable);
router.put('/:id/pay', payAccountPayable);
router.delete('/:id', deleteAccountPayable);

export default router;
