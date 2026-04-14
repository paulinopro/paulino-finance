import express from 'express';
import {
  getCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
} from '../controllers/cardController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('cards'));

router.get('/', getCards);
router.get('/:id', getCard);
router.post('/', createCard);
router.put('/:id', updateCard);
router.delete('/:id', deleteCard);

export default router;
