"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dashboardController_1 = require("../controllers/dashboardController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('dashboard'));
router.get('/summary', dashboardController_1.getSummary);
router.get('/stats', dashboardController_1.getStats);
router.get('/daily-health', dashboardController_1.getDailyHealth);
router.get('/weekly-health', dashboardController_1.getWeeklyHealth);
router.get('/monthly-health', dashboardController_1.getMonthlyHealth);
router.get('/annual-health', dashboardController_1.getAnnualHealth);
exports.default = router;
//# sourceMappingURL=dashboard.js.map