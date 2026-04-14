import express from 'express';
import {
  getExpensesReport,
  getLoansReport,
  getCardsReport,
  getAccountsReport,
  getComprehensiveReport,
} from '../controllers/reportController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

const sub = requireSubscriptionModule('reports');

router.get('/expenses', authenticate, sub, getExpensesReport);
router.get('/loans', authenticate, sub, getLoansReport);
router.get('/cards', authenticate, sub, getCardsReport);
router.get('/accounts', authenticate, sub, getAccountsReport);
router.get('/comprehensive', authenticate, sub, getComprehensiveReport);

export default router;
