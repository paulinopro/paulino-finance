"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const agendaController_1 = require("../controllers/agendaController");
const agendaOAuthController_1 = require("../controllers/agendaOAuthController");
const agendaICloudController_1 = require("../controllers/agendaICloudController");
const auth_1 = require("../middleware/auth");
const requireSubscriptionModule_1 = require("../middleware/requireSubscriptionModule");
const router = express_1.default.Router();
/** OAuth redir público desde Google — valida JWT en param state */
router.get('/connect/google/callback', agendaOAuthController_1.googleCalendarOAuthCallbackPublic);
router.use(auth_1.authenticate);
router.use((0, requireSubscriptionModule_1.requireSubscriptionModule)('agenda'));
router.get('/connect/google/start', agendaOAuthController_1.googleCalendarAuthorizeStart);
router.get('/connect/google/calendars', agendaOAuthController_1.googleCalendarListWritable);
router.patch('/connect/google', agendaOAuthController_1.googleCalendarSetDefault);
router.delete('/connect/google', agendaOAuthController_1.googleCalendarDisconnect);
router.post('/connect/icloud', agendaICloudController_1.icloudCalendarConnect);
router.get('/connect/icloud/calendars', agendaICloudController_1.icloudCalendarListWritable);
router.patch('/connect/icloud', agendaICloudController_1.icloudCalendarSetDefault);
router.delete('/connect/icloud', agendaICloudController_1.icloudCalendarDisconnect);
router.get('/items', agendaController_1.getItems);
router.get('/items/:id', agendaController_1.getOneItem);
router.post('/items', agendaController_1.postItem);
router.patch('/items/:id', agendaController_1.patchItem);
router.delete('/items/:id', agendaController_1.removeItem);
router.get('/connections', agendaController_1.getConnections);
exports.default = router;
//# sourceMappingURL=agenda.js.map