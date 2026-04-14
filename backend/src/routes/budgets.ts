import express from 'express';
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from '../controllers/budgetController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('budgets'));

router.get('/', getBudgets);
router.post('/', createBudget);
router.put('/:id', updateBudget);
router.delete('/:id', deleteBudget);

export default router;
