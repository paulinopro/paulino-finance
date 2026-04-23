"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const database_1 = require("./config/database");
const paypalWebhookController_1 = require("./controllers/paypalWebhookController");
const errorHandler_1 = require("./middleware/errorHandler");
const maintenanceMode_1 = require("./middleware/maintenanceMode");
const auth_1 = __importDefault(require("./routes/auth"));
const cards_1 = __importDefault(require("./routes/cards"));
const loans_1 = __importDefault(require("./routes/loans"));
const income_1 = __importDefault(require("./routes/income"));
const expenses_1 = __importDefault(require("./routes/expenses"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const categories_1 = __importDefault(require("./routes/categories"));
const reports_1 = __importDefault(require("./routes/reports"));
const templates_1 = __importDefault(require("./routes/templates"));
const calendar_1 = __importDefault(require("./routes/calendar"));
const accountsPayable_1 = __importDefault(require("./routes/accountsPayable"));
const accountsReceivable_1 = __importDefault(require("./routes/accountsReceivable"));
const budgets_1 = __importDefault(require("./routes/budgets"));
const financialGoals_1 = __importDefault(require("./routes/financialGoals"));
const cashFlow_1 = __importDefault(require("./routes/cashFlow"));
const projections_1 = __importDefault(require("./routes/projections"));
const vehicles_1 = __importDefault(require("./routes/vehicles"));
const admin_1 = __importDefault(require("./routes/admin"));
const subscription_1 = __importDefault(require("./routes/subscription"));
const notificationService_1 = require("./services/notificationService");
const webPushService_1 = require("./services/webPushService");
// Carga .env: raíz del repo (monorepo) y luego backend/.env (sobrescribe)
const rootEnv = path_1.default.resolve(__dirname, '../../.env');
const backendEnv = path_1.default.resolve(__dirname, '../.env');
if ((0, fs_1.existsSync)(rootEnv)) {
    dotenv_1.default.config({ path: rootEnv });
}
if ((0, fs_1.existsSync)(backendEnv)) {
    dotenv_1.default.config({ path: backendEnv, override: true });
}
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}
const corsOrigins = process.env.CORS_ORIGIN;
const corsOptions = {
    origin: corsOrigins
        ? corsOrigins
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : true,
    credentials: true,
};
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.post('/api/webhooks/paypal', express_1.default.raw({ type: 'application/json' }), paypalWebhookController_1.paypalWebhook);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api', maintenanceMode_1.maintenanceApiGuard);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Paulino Finance API is running' });
});
// API Routes
app.use('/api/auth', auth_1.default);
app.use('/api/subscription', subscription_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/cards', cards_1.default);
app.use('/api/loans', loans_1.default);
app.use('/api/income', income_1.default);
app.use('/api/expenses', expenses_1.default);
app.use('/api/accounts', accounts_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/categories', categories_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/templates', templates_1.default);
app.use('/api/calendar', calendar_1.default);
app.use('/api/accounts-payable', accountsPayable_1.default);
app.use('/api/accounts-receivable', accountsReceivable_1.default);
app.use('/api/budgets', budgets_1.default);
app.use('/api/financial-goals', financialGoals_1.default);
app.use('/api/cash-flow', cashFlow_1.default);
app.use('/api/projections', projections_1.default);
app.use('/api/vehicles', vehicles_1.default);
// Error handling middleware
app.use(errorHandler_1.errorHandler);
// Initialize database and start server
(0, database_1.initializeDatabase)()
    .then(() => {
    console.log('Database initialized successfully');
    (0, webPushService_1.initWebPush)();
    // Start notification scheduler
    (0, notificationService_1.startNotificationScheduler)();
    console.log('Notification scheduler started');
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})
    .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map