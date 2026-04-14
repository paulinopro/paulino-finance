"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const incomeController_1 = require("../controllers/incomeController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('income'));
router.get('/', incomeController_1.getIncome);
router.get('/:id', incomeController_1.getIncomeItem);
router.post('/', incomeController_1.createIncome);
router.put('/:id', incomeController_1.updateIncome);
router.delete('/:id', incomeController_1.deleteIncome);
exports.default = router;
//# sourceMappingURL=income.js.map