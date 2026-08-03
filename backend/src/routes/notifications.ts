import express from 'express';
import {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationSettings,
  updateNotificationSettings,
  testTelegramNotification,
  testPushNotification,
  getPushVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from '../controllers/notificationController';
import {
  getWhatsAppConfiguration,
  testWhatsAppNotification,
  updateWhatsAppConfiguration,
} from '../controllers/whatsappNotificationController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('notifications'));

router.get('/', getNotifications);
router.get('/push/vapid-public-key', getPushVapidPublicKey);
router.post('/push/subscribe', subscribePush);
router.post('/push/unsubscribe', unsubscribePush);
router.post('/test/push', testPushNotification);
router.post('/push/test', testPushNotification);
router.get('/whatsapp', getWhatsAppConfiguration);
router.put('/whatsapp', updateWhatsAppConfiguration);
router.post('/test/whatsapp', testWhatsAppNotification);
router.post('/test/telegram', testTelegramNotification);
router.post('/test', testTelegramNotification);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);
router.get('/settings', getNotificationSettings);
router.get('/:id', getNotificationById);
router.post('/settings', updateNotificationSettings);

export default router;
