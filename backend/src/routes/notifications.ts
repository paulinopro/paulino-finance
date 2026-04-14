import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationSettings,
  updateNotificationSettings,
  testNotification,
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('notifications'));

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);
router.get('/settings', getNotificationSettings);
router.post('/settings', updateNotificationSettings);
router.post('/test', testNotification);

export default router;
