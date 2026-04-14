"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const financialGoalsController_1 = require("../controllers/financialGoalsController");
const financialGoalMovementsController_1 = require("../controllers/financialGoalMovementsController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('financial_goals'));
router.get('/', financialGoalsController_1.getFinancialGoals);
router.post('/', financialGoalsController_1.createFinancialGoal);
router.put('/:id', financialGoalsController_1.updateFinancialGoal);
router.delete('/:id', financialGoalsController_1.deleteFinancialGoal);
// Goal movements (progress history)
router.get('/:goalId/movements', financialGoalMovementsController_1.getGoalMovements);
router.post('/:goalId/movements', financialGoalMovementsController_1.addGoalMovement);
router.put('/:goalId/movements/:movementId', financialGoalMovementsController_1.updateGoalMovement);
router.delete('/:goalId/movements/:movementId', financialGoalMovementsController_1.deleteGoalMovement);
exports.default = router;
//# sourceMappingURL=financialGoals.js.map