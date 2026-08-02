import express from 'express';
import {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  updateExpensePaymentStatus,
} from '../controllers/expenseController';
import { getExpenseTimeline } from '../controllers/financialTimelineController';
import { createEntityActiveStatusHandler } from '../controllers/entityActiveStatus';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('expenses'));

router.get('/', getExpenses);
router.patch('/:id/active-status', createEntityActiveStatusHandler('expenses'));
router.get('/:id/timeline', getExpenseTimeline);
router.get('/:id', getExpense);
router.post('/', createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);
router.patch('/:id/payment-status', updateExpensePaymentStatus);

export default router;
