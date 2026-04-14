"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const budgetController_1 = require("../controllers/budgetController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('budgets'));
router.get('/', budgetController_1.getBudgets);
router.post('/', budgetController_1.createBudget);
router.put('/:id', budgetController_1.updateBudget);
router.delete('/:id', budgetController_1.deleteBudget);
exports.default = router;
//# sourceMappingURL=budgets.js.map