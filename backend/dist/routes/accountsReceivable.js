"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const accountsReceivableController_1 = require("../controllers/accountsReceivableController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('accounts_receivable'));
router.get('/', accountsReceivableController_1.getAccountsReceivable);
router.get('/:id/payments', accountsReceivableController_1.getAccountReceivablePayments);
router.post('/:id/payments', accountsReceivableController_1.addAccountReceivablePayment);
router.put('/:id/payments/:paymentId', accountsReceivableController_1.updateAccountReceivablePayment);
router.delete('/:id/payments/:paymentId', accountsReceivableController_1.deleteAccountReceivablePayment);
router.post('/', accountsReceivableController_1.createAccountReceivable);
router.put('/:id', accountsReceivableController_1.updateAccountReceivable);
router.put('/:id/receive', accountsReceivableController_1.receiveAccountReceivable);
router.delete('/:id', accountsReceivableController_1.deleteAccountReceivable);
exports.default = router;
//# sourceMappingURL=accountsReceivable.js.map