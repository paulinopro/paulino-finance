"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const loanController_1 = require("../controllers/loanController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('loans'));
router.get('/', loanController_1.getLoans);
router.get('/:id', loanController_1.getLoan);
router.get('/:id/amortization', loanController_1.getAmortizationSchedule);
router.post('/', loanController_1.createLoan);
router.put('/:id', loanController_1.updateLoan);
router.delete('/:id', loanController_1.deleteLoan);
router.post('/:id/payment', loanController_1.recordPayment);
router.put('/payments/:paymentId', loanController_1.updatePayment);
router.delete('/:loanId/payments/:paymentId', loanController_1.deletePayment);
exports.default = router;
//# sourceMappingURL=loans.js.map