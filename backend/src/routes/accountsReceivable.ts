import express from 'express';
import {
  getAccountsReceivable,
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
router.post('/', createAccountReceivable);
router.put('/:id', updateAccountReceivable);
router.put('/:id/receive', receiveAccountReceivable);
router.delete('/:id', deleteAccountReceivable);

export default router;
