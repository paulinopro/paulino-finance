import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import {
  listUsers,
  getSystemSettings,
  updateSystemSettings,
  impersonateUser,
  stopImpersonation,
  updateUserAdmin,
} from '../controllers/adminController';
import {
  listSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} from '../controllers/adminSubscriptionPlansController';

const router = express.Router();

router.post('/stop-impersonation', authenticate, stopImpersonation);

router.use(authenticate, requireSuperAdmin);

router.get('/users', listUsers);
router.get('/settings', getSystemSettings);
router.patch('/settings', updateSystemSettings);
router.post('/impersonate/:userId', impersonateUser);
router.patch('/users/:userId', updateUserAdmin);

router.get('/subscription-plans', listSubscriptionPlans);
router.post('/subscription-plans', createSubscriptionPlan);
router.put('/subscription-plans/:id', updateSubscriptionPlan);
router.delete('/subscription-plans/:id', deleteSubscriptionPlan);

export default router;
