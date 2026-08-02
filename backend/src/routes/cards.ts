import express from 'express';
import {
  getCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
  listCardPayments,
  recordCardPayment,
  deleteCardPayment,
} from '../controllers/cardController';
import { createEntityActiveStatusHandler } from '../controllers/entityActiveStatus';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('cards'));

router.delete('/payments/:paymentId', deleteCardPayment);
router.get('/:id/payments', listCardPayments);
router.post('/:id/payments', recordCardPayment);
router.patch('/:id/active-status', createEntityActiveStatusHandler('cards'));

router.get('/', getCards);
router.get('/:id', getCard);
router.post('/', createCard);
router.put('/:id', updateCard);
router.delete('/:id', deleteCard);

export default router;
