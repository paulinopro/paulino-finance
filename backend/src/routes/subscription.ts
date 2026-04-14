import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMySubscription,
  listPublicPlans,
  startPaypalSubscription,
} from '../controllers/subscriptionController';

const router = express.Router();

router.get('/plans', listPublicPlans);
router.get('/me', authenticate, getMySubscription);
router.post('/paypal/start', authenticate, startPaypalSubscription);

export default router;
