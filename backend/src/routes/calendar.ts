import express from 'express';
import {
  getEvents,
  getSummary,
  updateStatus,
  refreshEvents,
} from '../controllers/calendarController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('calendar'));

router.get('/events', getEvents);
router.get('/summary', getSummary);
router.put('/events/:id/status', updateStatus);
router.post('/refresh', refreshEvents);

export default router;
