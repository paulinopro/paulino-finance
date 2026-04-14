import express from 'express';
import { getSummary, getStats, getDailyHealth, getWeeklyHealth, getMonthlyHealth, getAnnualHealth } from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('dashboard'));

router.get('/summary', getSummary);
router.get('/stats', getStats);
router.get('/daily-health', getDailyHealth);
router.get('/weekly-health', getWeeklyHealth);
router.get('/monthly-health', getMonthlyHealth);
router.get('/annual-health', getAnnualHealth);

export default router;
