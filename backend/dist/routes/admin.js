"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const requireSuperAdmin_1 = require("../middleware/requireSuperAdmin");
const adminController_1 = require("../controllers/adminController");
const adminSubscriptionPlansController_1 = require("../controllers/adminSubscriptionPlansController");
const router = express_1.default.Router();
router.post('/stop-impersonation', auth_1.authenticate, adminController_1.stopImpersonation);
router.use(auth_1.authenticate, requireSuperAdmin_1.requireSuperAdmin);
router.get('/users', adminController_1.listUsers);
router.get('/settings', adminController_1.getSystemSettings);
router.patch('/settings', adminController_1.updateSystemSettings);
router.post('/impersonate/:userId', adminController_1.impersonateUser);
router.patch('/users/:userId', adminController_1.updateUserAdmin);
router.get('/subscription-plans', adminSubscriptionPlansController_1.listSubscriptionPlans);
router.post('/subscription-plans', adminSubscriptionPlansController_1.createSubscriptionPlan);
router.put('/subscription-plans/:id', adminSubscriptionPlansController_1.updateSubscriptionPlan);
router.delete('/subscription-plans/:id', adminSubscriptionPlansController_1.deleteSubscriptionPlan);
exports.default = router;
//# sourceMappingURL=admin.js.map