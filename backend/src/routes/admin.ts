import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import {
  getAdminStats,
  getAdminHealth,
  listAdminAuditLog,
  listUsers,
  getUserById,
  getUserSubscriptionPayments,
  getSystemSettings,
  updateSystemSettings,
  getAdminSubscriptionDataQuality,
  impersonateUser,
  stopImpersonation,
  updateUserAdmin,
} from '../controllers/adminController';
import {
  listSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  syncSubscriptionPlanPaypal,
  deleteSubscriptionPlan,
} from '../controllers/adminSubscriptionPlansController';

const router = express.Router();

router.post('/stop-impersonation', authenticate, stopImpersonation);

router.use(authenticate, requireSuperAdmin);

router.get('/stats', getAdminStats);
router.get('/health', getAdminHealth);
router.get('/data-quality/subscription-payments', getAdminSubscriptionDataQuality);
router.get('/audit-log', listAdminAuditLog);
router.get('/users', listUsers);
router.get('/users/:userId/payments', getUserSubscriptionPayments);
router.get('/users/:userId', getUserById);
router.get('/settings', getSystemSettings);
router.patch('/settings', updateSystemSettings);
router.post('/impersonate/:userId', impersonateUser);
router.patch('/users/:userId', updateUserAdmin);

router.get('/subscription-plans', listSubscriptionPlans);
router.post('/subscription-plans', createSubscriptionPlan);
router.post('/subscription-plans/:id/sync-paypal', syncSubscriptionPlanPaypal);
router.put('/subscription-plans/:id', updateSubscriptionPlan);
router.delete('/subscription-plans/:id', deleteSubscriptionPlan);

export default router;
