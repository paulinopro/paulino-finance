"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationController_1 = require("../controllers/notificationController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('notifications'));
router.get('/', notificationController_1.getNotifications);
router.get('/push/vapid-public-key', notificationController_1.getPushVapidPublicKey);
router.post('/push/subscribe', notificationController_1.subscribePush);
router.post('/push/unsubscribe', notificationController_1.unsubscribePush);
router.put('/:id/read', notificationController_1.markAsRead);
router.put('/read-all', notificationController_1.markAllAsRead);
router.delete('/:id', notificationController_1.deleteNotification);
router.get('/settings', notificationController_1.getNotificationSettings);
router.post('/settings', notificationController_1.updateNotificationSettings);
router.post('/test', notificationController_1.testNotification);
exports.default = router;
//# sourceMappingURL=notifications.js.map