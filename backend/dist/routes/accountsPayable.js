"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const accountsPayableController_1 = require("../controllers/accountsPayableController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('accounts_payable'));
router.get('/', accountsPayableController_1.getAccountsPayable);
router.get('/:id/payments', accountsPayableController_1.getAccountPayablePayments);
router.post('/:id/payments', accountsPayableController_1.addAccountPayablePayment);
router.put('/:id/payments/:paymentId', accountsPayableController_1.updateAccountPayablePayment);
router.delete('/:id/payments/:paymentId', accountsPayableController_1.deleteAccountPayablePayment);
router.post('/', accountsPayableController_1.createAccountPayable);
router.put('/:id', accountsPayableController_1.updateAccountPayable);
router.put('/:id/pay', accountsPayableController_1.payAccountPayable);
router.delete('/:id', accountsPayableController_1.deleteAccountPayable);
exports.default = router;
//# sourceMappingURL=accountsPayable.js.map