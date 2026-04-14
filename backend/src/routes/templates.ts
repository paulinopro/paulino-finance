import express from 'express';
import {
  getTemplates,
  getTemplateByType,
  updateTemplateByType,
  resetTemplate,
  testTemplate,
} from '../controllers/templateController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('templates'));

router.get('/', getTemplates);
router.get('/:type', getTemplateByType);
router.put('/:type', updateTemplateByType);
router.post('/:type/reset', resetTemplate);
router.post('/:type/test', testTemplate);

export default router;
