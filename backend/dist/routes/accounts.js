"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const accountController_1 = require("../controllers/accountController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('accounts'));
router.get('/', accountController_1.getAccounts);
router.get('/:id', accountController_1.getAccount);
router.post('/', accountController_1.createAccount);
router.put('/:id', accountController_1.updateAccount);
router.delete('/:id', accountController_1.deleteAccount);
exports.default = router;
//# sourceMappingURL=accounts.js.map