import express from 'express';
import { getCashFlow } from '../controllers/cashFlowController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('cash_flow'));

router.get('/', getCashFlow);

export default router;
