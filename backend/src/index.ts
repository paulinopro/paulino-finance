import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import express from 'express';
import type { CorsOptions } from 'cors';
import { initializeDatabase } from './config/database';
import { paypalWebhook } from './controllers/paypalWebhookController';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import cardRoutes from './routes/cards';
import loanRoutes from './routes/loans';
import incomeRoutes from './routes/income';
import expenseRoutes from './routes/expenses';
import accountRoutes from './routes/accounts';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';
import categoryRoutes from './routes/categories';
import reportRoutes from './routes/reports';
import templateRoutes from './routes/templates';
import calendarRoutes from './routes/calendar';
import accountsPayableRoutes from './routes/accountsPayable';
import accountsReceivableRoutes from './routes/accountsReceivable';
import budgetRoutes from './routes/budgets';
import financialGoalsRoutes from './routes/financialGoals';
import cashFlowRoutes from './routes/cashFlow';
import projectionsRoutes from './routes/projections';
import vehicleRoutes from './routes/vehicles';
import adminRoutes from './routes/admin';
import subscriptionRoutes from './routes/subscription';
import { startNotificationScheduler } from './services/notificationService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const corsOrigins = process.env.CORS_ORIGIN;
const corsOptions: CorsOptions = {
  origin: corsOrigins
    ? corsOrigins
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : true,
  credentials: true,
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.post(
  '/api/webhooks/paypal',
  express.raw({ type: 'application/json' }),
  paypalWebhook
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Paulino Finance API is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/accounts-payable', accountsPayableRoutes);
app.use('/api/accounts-receivable', accountsReceivableRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/financial-goals', financialGoalsRoutes);
app.use('/api/cash-flow', cashFlowRoutes);
app.use('/api/projections', projectionsRoutes);
app.use('/api/vehicles', vehicleRoutes);

// Error handling middleware
app.use(errorHandler);

// Initialize database and start server
initializeDatabase()
    .then(() => {
        console.log('Database initialized successfully');

        // Start notification scheduler
        startNotificationScheduler();
        console.log('Notification scheduler started');

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });

export default app;
