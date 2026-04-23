"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cardController_1 = require("../controllers/cardController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('cards'));
router.delete('/payments/:paymentId', cardController_1.deleteCardPayment);
router.get('/:id/payments', cardController_1.listCardPayments);
router.post('/:id/payments', cardController_1.recordCardPayment);
router.get('/', cardController_1.getCards);
router.get('/:id', cardController_1.getCard);
router.post('/', cardController_1.createCard);
router.put('/:id', cardController_1.updateCard);
router.delete('/:id', cardController_1.deleteCard);
exports.default = router;
//# sourceMappingURL=cards.js.map