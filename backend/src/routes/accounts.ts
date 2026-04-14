import express from 'express';
import {
  getAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../controllers/accountController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('accounts'));

router.get('/', getAccounts);
router.get('/:id', getAccount);
router.post('/', createAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
