"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const subscriptionController_1 = require("../controllers/subscriptionController");
const router = express_1.default.Router();
router.get('/plans', subscriptionController_1.listPublicPlans);
router.get('/me', auth_1.authenticate, subscriptionController_1.getMySubscription);
router.post('/paypal/start', auth_1.authenticate, subscriptionController_1.startPaypalSubscription);
exports.default = router;
//# sourceMappingURL=subscription.js.map