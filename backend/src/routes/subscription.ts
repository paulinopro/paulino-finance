import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMySubscription,
  getMyPaymentHistory,
  listPublicPlans,
  startPaypalSubscription,
} from '../controllers/subscriptionController';

const router = express.Router();

router.get('/plans', listPublicPlans);
router.get('/me', authenticate, getMySubscription);
router.get('/payments', authenticate, getMyPaymentHistory);
router.post('/paypal/start', authenticate, startPaypalSubscription);

export default router;
