"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const templateController_1 = require("../controllers/templateController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('templates'));
router.get('/', templateController_1.getTemplates);
router.get('/:type', templateController_1.getTemplateByType);
router.put('/:type', templateController_1.updateTemplateByType);
router.post('/:type/reset', templateController_1.resetTemplate);
router.post('/:type/test', templateController_1.testTemplate);
exports.default = router;
//# sourceMappingURL=templates.js.map