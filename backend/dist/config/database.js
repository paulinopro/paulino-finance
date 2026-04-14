"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = exports.syncSuperAdminsFromEnv = exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const subscriptionModules_1 = require("../constants/subscriptionModules");
const notificationTemplateSeed_1 = require("../services/notificationTemplateSeed");
dotenv_1.default.config();
const pool = new pg_1.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'paulino_finance',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
// Test connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    }
    catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};
exports.query = query;
const getClient = async () => {
    const client = await pool.connect();
    return client;
};
exports.getClient = getClient;
const syncSuperAdminsFromEnv = async () => {
    const raw = process.env.SUPER_ADMIN_EMAILS || '';
    const emails = raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    for (const email of emails) {
        await (0, exports.query)(`UPDATE users SET is_super_admin = true WHERE LOWER(TRIM(email)) = $1`, [email]);
    }
    if (emails.length > 0) {
        console.log('Super admin emails synced from SUPER_ADMIN_EMAILS');
    }
};
exports.syncSuperAdminsFromEnv = syncSuperAdminsFromEnv;
const initializeDatabase = async () => {
    try {
        await createTables();
        await (0, notificationTemplateSeed_1.seedDefaultTemplatesForAllUsers)();
        await seedSubscriptionData();
        await (0, exports.syncSuperAdminsFromEnv)();
        console.log('Database tables created/verified');
    }
    catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};
exports.initializeDatabase = initializeDatabase;
async function seedSubscriptionData() {
    const fullMods = JSON.stringify((0, subscriptionModules_1.defaultEnabledModulesAll)());
    const freeMods = JSON.stringify((0, subscriptionModules_1.defaultEnabledModulesFree)());
    await (0, exports.query)(`INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, currency, enabled_modules, sort_order)
     SELECT 'Plan completo', 'full', 'Acceso a todos los módulos de la aplicación.', 0, 0, 'USD', $1::jsonb, 0
     WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'full')`, [fullMods]);
    await (0, exports.query)(`INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, currency, enabled_modules, sort_order)
     SELECT 'Plan gratuito', 'free', 'Panel, perfil y preferencias básicas. Contrata un plan para desbloquear el resto.', 0, 0, 'USD', $1::jsonb, 1
     WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'free')`, [freeMods]);
    const fullPlan = await (0, exports.query)(`SELECT id FROM subscription_plans WHERE slug = 'full' LIMIT 1`);
    const fullId = fullPlan.rows[0]?.id;
    if (!fullId)
        return;
    await (0, exports.query)(`INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
     SELECT u.id, $1, 'active', CURRENT_TIMESTAMP, NULL
     FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id)`, [fullId]);
}
const createTables = async () => {
    // Users table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      telegram_chat_id VARCHAR(50),
      currency_preference VARCHAR(3) DEFAULT 'DOP',
      exchange_rate_dop_usd DECIMAL(10, 2) DEFAULT 55.00,
      timezone VARCHAR(50) DEFAULT 'America/Santo_Domingo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Add timezone column if it doesn't exist (for existing databases)
    await (0, exports.query)(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='timezone') THEN
        ALTER TABLE users ADD COLUMN timezone VARCHAR(50) DEFAULT 'America/Santo_Domingo';
      END IF;
    END $$;
  `);
    await (0, exports.query)(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='is_super_admin') THEN
        ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='subscription_plan') THEN
        ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'free';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='subscription_status') THEN
        ALTER TABLE users ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'active';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='password_reset_token_hash') THEN
        ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(64);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='password_reset_expires_at') THEN
        ALTER TABLE users ADD COLUMN password_reset_expires_at TIMESTAMP;
      END IF;
    END $$;
  `);
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await (0, exports.query)(`
    INSERT INTO system_settings (key, value) VALUES ('registration_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `);
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(80) UNIQUE NOT NULL,
      description TEXT,
      price_monthly DECIMAL(12, 2) NOT NULL DEFAULT 0,
      price_yearly DECIMAL(12, 2) NOT NULL DEFAULT 0,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      paypal_plan_id_monthly VARCHAR(255),
      paypal_plan_id_yearly VARCHAR(255),
      enabled_modules JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trialing', 'cancelled', 'expired', 'past_due')),
      paypal_subscription_id VARCHAR(255),
      paypal_plan_id VARCHAR(255),
      current_period_start TIMESTAMP,
      current_period_end TIMESTAMP,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      cancelled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions(plan_id)`);
    // Credit Cards table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bank_name VARCHAR(255) NOT NULL,
      card_name VARCHAR(255) NOT NULL,
      credit_limit_dop DECIMAL(15, 2),
      credit_limit_usd DECIMAL(15, 2),
      current_debt_dop DECIMAL(15, 2) DEFAULT 0,
      current_debt_usd DECIMAL(15, 2) DEFAULT 0,
      minimum_payment_dop DECIMAL(15, 2),
      minimum_payment_usd DECIMAL(15, 2),
      cut_off_day INTEGER NOT NULL,
      payment_due_day INTEGER NOT NULL,
      currency_type VARCHAR(10) NOT NULL CHECK (currency_type IN ('DOP', 'USD', 'DUAL')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Add minimum_payment columns if they don't exist
    await (0, exports.query)(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='credit_cards' AND column_name='minimum_payment_dop') THEN
        ALTER TABLE credit_cards ADD COLUMN minimum_payment_dop DECIMAL(15, 2);
        ALTER TABLE credit_cards ADD COLUMN minimum_payment_usd DECIMAL(15, 2);
      END IF;
    END $$;
  `);
    // Expense Categories table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )
  `);
    // Insert default categories for existing users
    await (0, exports.query)(`
    INSERT INTO expense_categories (user_id, name)
    SELECT id, unnest(ARRAY['Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 'Salud', 'Educación', 'Ropa', 'Otros'])
    FROM users
    ON CONFLICT (user_id, name) DO NOTHING
  `);
    // Loans table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS loans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      loan_name VARCHAR(255) NOT NULL,
      bank_name VARCHAR(255),
      total_amount DECIMAL(15, 2) NOT NULL,
      interest_rate DECIMAL(5, 2) NOT NULL,
      interest_rate_type VARCHAR(10) NOT NULL CHECK (interest_rate_type IN ('ANNUAL', 'MONTHLY')),
      total_installments INTEGER NOT NULL,
      paid_installments INTEGER DEFAULT 0,
      start_date DATE NOT NULL,
      end_date DATE,
      installment_amount DECIMAL(15, 2) NOT NULL,
      fixed_charge DECIMAL(15, 2) DEFAULT 0.00,
      payment_day INTEGER,
      next_payment_date DATE,
      currency VARCHAR(3) NOT NULL DEFAULT 'DOP',
      status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAID', 'DEFAULTED')),
      interest_calculation_base VARCHAR(20) DEFAULT 'ACTUAL_360' CHECK (interest_calculation_base IN ('ACTUAL_360', 'ACTUAL_365', '30_360', '30_365')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Add bank_name, payment_day, next_payment_date, fixed_charge, and interest_calculation_base columns if they don't exist
    await (0, exports.query)(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loans' AND column_name='bank_name') THEN
        ALTER TABLE loans ADD COLUMN bank_name VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loans' AND column_name='payment_day') THEN
        ALTER TABLE loans ADD COLUMN payment_day INTEGER;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loans' AND column_name='next_payment_date') THEN
        ALTER TABLE loans ADD COLUMN next_payment_date DATE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loans' AND column_name='fixed_charge') THEN
        ALTER TABLE loans ADD COLUMN fixed_charge DECIMAL(15, 2) DEFAULT 0.00;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loans' AND column_name='interest_calculation_base') THEN
        ALTER TABLE loans ADD COLUMN interest_calculation_base VARCHAR(20) DEFAULT 'ACTUAL_360' 
          CHECK (interest_calculation_base IN ('ACTUAL_360', 'ACTUAL_365', '30_360', '30_365'));
      END IF;
    END $$;
  `);
    // Loan Payments table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS loan_payments (
      id SERIAL PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      payment_date DATE NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      principal_amount DECIMAL(15, 2) DEFAULT 0.00,
      interest_amount DECIMAL(15, 2) DEFAULT 0.00,
      charge_amount DECIMAL(15, 2) DEFAULT 0.00,
      late_fee DECIMAL(15, 2) DEFAULT 0.00,
      installment_number INTEGER NOT NULL,
      outstanding_balance DECIMAL(15, 2),
      notes TEXT,
      payment_type VARCHAR(20) DEFAULT 'COMPLETE' CHECK (payment_type IN ('COMPLETE', 'PARTIAL', 'ADVANCE', 'INTEREST')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Add new columns to loan_payments if they don't exist
    await (0, exports.query)(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='principal_amount') THEN
        ALTER TABLE loan_payments ADD COLUMN principal_amount DECIMAL(15, 2) DEFAULT 0.00;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='interest_amount') THEN
        ALTER TABLE loan_payments ADD COLUMN interest_amount DECIMAL(15, 2) DEFAULT 0.00;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='charge_amount') THEN
        ALTER TABLE loan_payments ADD COLUMN charge_amount DECIMAL(15, 2) DEFAULT 0.00;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='late_fee') THEN
        ALTER TABLE loan_payments ADD COLUMN late_fee DECIMAL(15, 2) DEFAULT 0.00;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='outstanding_balance') THEN
        ALTER TABLE loan_payments ADD COLUMN outstanding_balance DECIMAL(15, 2);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='payment_type') THEN
        ALTER TABLE loan_payments ADD COLUMN payment_type VARCHAR(20) DEFAULT 'COMPLETE' CHECK (payment_type IN ('COMPLETE', 'PARTIAL', 'ADVANCE', 'INTEREST'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='loan_payments' AND column_name='updated_at') THEN
        ALTER TABLE loan_payments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;
  `);
    // Update payment_type constraint to include INTEREST
    await (0, exports.query)(`
    DO $$
    BEGIN
      -- Drop the old constraint if it exists
      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'loan_payments_payment_type_check'
      ) THEN
        ALTER TABLE loan_payments DROP CONSTRAINT loan_payments_payment_type_check;
      END IF;
      
      -- Add the new constraint with INTEREST included
      ALTER TABLE loan_payments 
      ADD CONSTRAINT loan_payments_payment_type_check 
      CHECK (payment_type IN ('COMPLETE', 'PARTIAL', 'ADVANCE', 'INTEREST'));
    END $$;
  `);
    // Amortization Schedule table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS amortization_schedule (
      id SERIAL PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      installment_number INTEGER NOT NULL,
      due_date DATE NOT NULL,
      principal_amount DECIMAL(15, 2) NOT NULL,
      interest_amount DECIMAL(15, 2) NOT NULL,
      charge_amount DECIMAL(15, 2) DEFAULT 0.00,
      total_due DECIMAL(15, 2) NOT NULL,
      outstanding_balance DECIMAL(15, 2) NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE', 'FUTURE')),
      payment_id INTEGER REFERENCES loan_payments(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(loan_id, installment_number)
    )
  `);
    // Update existing foreign key constraint if it exists without ON DELETE SET NULL
    await (0, exports.query)(`
    DO $$
    BEGIN
      -- Drop existing constraint if it exists
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'amortization_schedule_payment_id_fkey'
      ) THEN
        ALTER TABLE amortization_schedule 
        DROP CONSTRAINT amortization_schedule_payment_id_fkey;
      END IF;
      
      -- Add new constraint with ON DELETE SET NULL
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'amortization_schedule_payment_id_fkey'
      ) THEN
        ALTER TABLE amortization_schedule 
        ADD CONSTRAINT amortization_schedule_payment_id_fkey 
        FOREIGN KEY (payment_id) 
        REFERENCES loan_payments(id) 
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);
    // Income table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS income (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'DOP',
      income_type VARCHAR(20) NOT NULL CHECK (income_type IN ('FIXED', 'VARIABLE')),
      frequency VARCHAR(20),
      receipt_day INTEGER,
      date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Expenses table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'DOP',
      expense_type VARCHAR(20) NOT NULL CHECK (expense_type IN ('RECURRING_MONTHLY', 'NON_RECURRING', 'ANNUAL')),
      category VARCHAR(100),
      payment_day INTEGER,
      payment_month INTEGER,
      date DATE,
      is_paid BOOLEAN DEFAULT false,
      last_paid_month INTEGER,
      last_paid_year INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Add last_paid_month and last_paid_year columns if they don't exist
    await (0, exports.query)(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='expenses' AND column_name='last_paid_month') THEN
        ALTER TABLE expenses ADD COLUMN last_paid_month INTEGER;
        ALTER TABLE expenses ADD COLUMN last_paid_year INTEGER;
      END IF;
    END $$;
  `);
    // Bank Accounts table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bank_name VARCHAR(255) NOT NULL,
      account_type VARCHAR(50) NOT NULL,
      account_number VARCHAR(100),
      balance_dop DECIMAL(15, 2) DEFAULT 0,
      balance_usd DECIMAL(15, 2) DEFAULT 0,
      currency_type VARCHAR(10) NOT NULL CHECK (currency_type IN ('DOP', 'USD', 'DUAL')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Notifications table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      related_id INTEGER,
      related_type VARCHAR(50),
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Notification Templates table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id SERIAL PRIMARY KEY,
      notification_type VARCHAR(50) NOT NULL UNIQUE CHECK (notification_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE')),
      title_template TEXT NOT NULL,
      message_template TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Migración: plantillas globales → una fila por (usuario, tipo)
    await (0, exports.query)(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notification_templates' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE notification_templates ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_notification_type_key;
        INSERT INTO notification_templates (user_id, notification_type, title_template, message_template)
        SELECT u.id, t.notification_type, t.title_template, t.message_template
        FROM users u
        CROSS JOIN notification_templates t
        WHERE t.user_id IS NULL;
        DELETE FROM notification_templates WHERE user_id IS NULL;
        ALTER TABLE notification_templates ALTER COLUMN user_id SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_user_type_unique
          ON notification_templates (user_id, notification_type);
      END IF;
    END $$;
  `);
    // Notification Settings table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_type VARCHAR(50) NOT NULL,
      enabled BOOLEAN DEFAULT true,
      days_before INTEGER[] DEFAULT ARRAY[3, 7],
      telegram_enabled BOOLEAN DEFAULT false,
      email_enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, notification_type)
    )
  `);
    // Calendar Events table - tracks payment status for financial events
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'INCOME', 'EXPENSE', 'RECURRING_EXPENSE')),
      related_id INTEGER NOT NULL,
      related_type VARCHAR(50) NOT NULL,
      event_date DATE NOT NULL,
      title VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'DOP',
      status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'RECEIVED', 'OVERDUE', 'CANCELLED')),
      is_recurring BOOLEAN DEFAULT false,
      recurrence_pattern VARCHAR(50),
      color VARCHAR(7) DEFAULT '#3b82f6',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, event_type, related_id, event_date)
    )
  `);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status)`);
    // Create indexes for better performance
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_credit_cards_user_id ON credit_cards(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id)`);
    // Accounts Payable table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS accounts_payable (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      due_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE')),
      category VARCHAR(100),
      notes TEXT,
      paid_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Accounts Receivable table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS accounts_receivable (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      due_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RECEIVED', 'OVERDUE')),
      category VARCHAR(100),
      notes TEXT,
      received_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Budgets table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS budgets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100),
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('MONTHLY', 'YEARLY')),
      period_month INTEGER,
      period_year INTEGER NOT NULL,
      spent DECIMAL(15, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Financial Goals table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS financial_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      target_amount DECIMAL(15, 2) NOT NULL,
      current_amount DECIMAL(15, 2) DEFAULT 0,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      target_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Financial Goal Movements table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS financial_goal_movements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_id INTEGER NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
      amount DECIMAL(15, 2) NOT NULL,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Vehicles table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      make VARCHAR(100) NOT NULL,
      model VARCHAR(100) NOT NULL,
      year INTEGER,
      license_plate VARCHAR(50),
      color VARCHAR(50),
      mileage DECIMAL(10, 2) DEFAULT 0,
      purchase_date DATE,
      purchase_price DECIMAL(15, 2),
      currency VARCHAR(3) CHECK (currency IN ('DOP', 'USD')),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Vehicle Expenses table
    await (0, exports.query)(`
    CREATE TABLE IF NOT EXISTS vehicle_expenses (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expense_type VARCHAR(50) NOT NULL,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      date DATE NOT NULL,
      mileage_at_expense DECIMAL(10, 2),
      category VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_income_user_id ON income(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_accounts_payable_user_id ON accounts_payable(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_accounts_receivable_user_id ON accounts_receivable(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_financial_goals_user_id ON financial_goals(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_vehicle_id ON vehicle_expenses(vehicle_id)`);
    await (0, exports.query)(`CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_user_id ON vehicle_expenses(user_id)`);
};
exports.default = pool;
//# sourceMappingURL=database.js.map