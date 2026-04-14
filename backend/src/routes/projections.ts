import express from 'express';
import { getProjections } from '../controllers/projectionsController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('projections'));

router.get('/', getProjections);

export default router;
