import express from 'express';
import {
  getVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleExpenses,
  createVehicleExpense,
  updateVehicleExpense,
  deleteVehicleExpense,
} from '../controllers/vehicleController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscriptionModule('vehicles'));

router.get('/', getVehicles);
router.post('/', createVehicle);
router.put('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);

router.get('/:vehicleId/expenses', getVehicleExpenses);
router.post('/:vehicleId/expenses', createVehicleExpense);
router.put('/:vehicleId/expenses/:expenseId', updateVehicleExpense);
router.delete('/:vehicleId/expenses/:expenseId', deleteVehicleExpense);

export default router;
