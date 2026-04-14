"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const expenseController_1 = require("../controllers/expenseController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('expenses'));
router.get('/', expenseController_1.getExpenses);
router.get('/:id', expenseController_1.getExpense);
router.post('/', expenseController_1.createExpense);
router.put('/:id', expenseController_1.updateExpense);
router.delete('/:id', expenseController_1.deleteExpense);
router.patch('/:id/payment-status', expenseController_1.updateExpensePaymentStatus);
exports.default = router;
//# sourceMappingURL=expenses.js.map