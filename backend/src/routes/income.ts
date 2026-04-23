import express from 'express';
import {
  getIncome,
  getIncomeItem,
  createIncome,
  updateIncome,
  deleteIncome,
  updateIncomeReceiptStatus,
} from '../controllers/incomeController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('income'));

router.get('/', getIncome);
router.get('/:id', getIncomeItem);
router.post('/', createIncome);
router.patch('/:id/receipt-status', updateIncomeReceiptStatus);
router.put('/:id', updateIncome);
router.delete('/:id', deleteIncome);

export default router;
