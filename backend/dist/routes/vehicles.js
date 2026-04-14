"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const vehicleController_1 = require("../controllers/vehicleController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('vehicles'));
router.get('/', vehicleController_1.getVehicles);
router.post('/', vehicleController_1.createVehicle);
router.put('/:id', vehicleController_1.updateVehicle);
router.delete('/:id', vehicleController_1.deleteVehicle);
router.get('/:vehicleId/expenses', vehicleController_1.getVehicleExpenses);
router.post('/:vehicleId/expenses', vehicleController_1.createVehicleExpense);
router.put('/:vehicleId/expenses/:expenseId', vehicleController_1.updateVehicleExpense);
router.delete('/:vehicleId/expenses/:expenseId', vehicleController_1.deleteVehicleExpense);
exports.default = router;
//# sourceMappingURL=vehicles.js.map