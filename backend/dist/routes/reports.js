"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reportController_1 = require("../controllers/reportController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
const sub = (0, requireSubscriptionModule_1.requireSubscriptionModule)('reports');
router.get('/expenses', auth_1.authenticate, sub, reportController_1.getExpensesReport);
router.get('/loans', auth_1.authenticate, sub, reportController_1.getLoansReport);
router.get('/cards', auth_1.authenticate, sub, reportController_1.getCardsReport);
router.get('/accounts', auth_1.authenticate, sub, reportController_1.getAccountsReport);
router.get('/comprehensive', auth_1.authenticate, sub, reportController_1.getComprehensiveReport);
exports.default = router;
//# sourceMappingURL=reports.js.map