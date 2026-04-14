"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const calendarController_1 = require("../controllers/calendarController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('calendar'));
router.get('/events', calendarController_1.getEvents);
router.get('/summary', calendarController_1.getSummary);
router.put('/events/:id/status', calendarController_1.updateStatus);
router.post('/refresh', calendarController_1.refreshEvents);
exports.default = router;
//# sourceMappingURL=calendar.js.map