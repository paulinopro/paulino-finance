import express from 'express';
import {
  getFinancialGoals,
  createFinancialGoal,
  updateFinancialGoal,
  deleteFinancialGoal,
} from '../controllers/financialGoalsController';
import {
  getGoalMovements,
  addGoalMovement,
  updateGoalMovement,
  deleteGoalMovement,
} from '../controllers/financialGoalMovementsController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('financial_goals'));

router.get('/', getFinancialGoals);
router.post('/', createFinancialGoal);
router.put('/:id', updateFinancialGoal);
router.delete('/:id', deleteFinancialGoal);

// Goal movements (progress history)
router.get('/:goalId/movements', getGoalMovements);
router.post('/:goalId/movements', addGoalMovement);
router.put('/:goalId/movements/:movementId', updateGoalMovement);
router.delete('/:goalId/movements/:movementId', deleteGoalMovement);

export default router;
