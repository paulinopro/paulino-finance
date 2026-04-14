import express from 'express';
import {
  getLoans,
  getLoan,
  createLoan,
  updateLoan,
  deleteLoan,
  recordPayment,
  deletePayment,
  getAmortizationSchedule,
  updatePayment,
} from '../controllers/loanController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('loans'));

router.get('/', getLoans);
router.get('/:id', getLoan);
router.get('/:id/amortization', getAmortizationSchedule);
router.post('/', createLoan);
router.put('/:id', updateLoan);
router.delete('/:id', deleteLoan);
router.post('/:id/payment', recordPayment);
router.put('/payments/:paymentId', updatePayment);
router.delete('/:loanId/payments/:paymentId', deletePayment);

export default router;
