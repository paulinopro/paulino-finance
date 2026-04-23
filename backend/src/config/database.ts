import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import {
  defaultEnabledModulesAll,
  defaultEnabledModulesFree,
} from '../constants/subscriptionModules';
import { seedDefaultTemplatesForAllUsers } from '../services/notificationTemplateSeed';

dotenv.config();

const pool = new Pool({
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

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  return client;
};

export const syncSuperAdminsFromEnv = async () => {
  const raw = process.env.SUPER_ADMIN_EMAILS || '';
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    await query(
      `UPDATE users SET is_super_admin = true WHERE LOWER(TRIM(email)) = $1`,
      [email]
    );
  }
  if (emails.length > 0) {
    console.log('Super admin emails synced from SUPER_ADMIN_EMAILS');
  }
};

export const initializeDatabase = async () => {
  try {
    await createTables();
    await seedDefaultTemplatesForAllUsers();
    await seedSubscriptionData();
    await syncSuperAdminsFromEnv();
    console.log('Database tables created/verified');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

async function seedSubscriptionData(): Promise<void> {
  const fullMods = JSON.stringify(defaultEnabledModulesAll());
  const freeMods = JSON.stringify(defaultEnabledModulesFree());

  await query(
    `INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, currency, enabled_modules, sort_order)
     SELECT 'Plan completo', 'full', 'Acceso a todos los módulos de la aplicación.', 0, 0, 'USD', $1::jsonb, 0
     WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'full')`,
    [fullMods]
  );

  await query(
    `INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, currency, enabled_modules, sort_order)
     SELECT 'Plan gratuito', 'free', 'Panel, perfil y preferencias básicas. Contrata un plan para desbloquear el resto.', 0, 0, 'USD', $1::jsonb, 1
     WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'free')`,
    [freeMods]
  );

  const fullPlan = await query(`SELECT id FROM subscription_plans WHERE slug = 'full' LIMIT 1`);
  const fullId = fullPlan.rows[0]?.id;
  if (!fullId) return;

  await query(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
     SELECT u.id, $1, 'active', CURRENT_TIMESTAMP, NULL
     FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id)`,
    [fullId]
  );
}

const createTables = async () => {
  // Users table
  await query(`
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
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='timezone') THEN
        ALTER TABLE users ADD COLUMN timezone VARCHAR(50) DEFAULT 'America/Santo_Domingo';
      END IF;
    END $$;
  `);

  await query(`
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
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_schema = 'public' AND table_name='users' AND column_name='cedula') THEN
        ALTER TABLE users ADD COLUMN cedula VARCHAR(50);
      END IF;
    END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    INSERT INTO system_settings (key, value) VALUES ('registration_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO system_settings (key, value) VALUES ('maintenance_mode', 'false')
    ON CONFLICT (key) DO NOTHING
  `);

  await query(`
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

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'paypal_product_id'
      ) THEN
        ALTER TABLE subscription_plans ADD COLUMN paypal_product_id VARCHAR(255);
      END IF;
    END $$
  `);

  await query(`
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

  await query(
    `CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions(plan_id)`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL,
      amount DECIMAL(15, 4) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(32) NOT NULL DEFAULT 'completed',
      period_start TIMESTAMP,
      period_end TIMESTAMP,
      paid_at TIMESTAMP NOT NULL,
      paypal_sale_id VARCHAR(128) UNIQUE,
      paypal_subscription_id VARCHAR(255),
      source VARCHAR(32) NOT NULL DEFAULT 'paypal',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(
    `CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_paid ON subscription_payments(user_id, paid_at DESC)`
  );

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_subscriptions' AND column_name = 'billing_interval'
      ) THEN
        ALTER TABLE user_subscriptions
          ADD COLUMN billing_interval VARCHAR(20)
            CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'yearly'));
      END IF;
    END $$;
  `);

  await query(`
        CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(40),
      target_id INTEGER,
      details JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(
    `CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC)`
  );

  // Credit Cards table
  await query(`
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
  await query(`
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
  await query(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )
  `);

  // Insert default categories for existing users
  await query(`
    INSERT INTO expense_categories (user_id, name)
    SELECT id, unnest(ARRAY['Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 'Salud', 'Educación', 'Ropa', 'Otros'])
    FROM users
    ON CONFLICT (user_id, name) DO NOTHING
  `);

  // Loans table
  await query(`
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
  await query(`
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
  await query(`
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
  await query(`
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
  await query(`
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
  await query(`
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
  await query(`
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
  await query(`
    CREATE TABLE IF NOT EXISTS income (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'DOP',
      nature VARCHAR(20) NOT NULL DEFAULT 'variable' CHECK (nature IN ('fixed', 'variable')),
      recurrence_type VARCHAR(20) NOT NULL DEFAULT 'non_recurrent' CHECK (recurrence_type IN ('recurrent', 'non_recurrent')),
      frequency VARCHAR(32),
      receipt_day INTEGER,
      date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Expenses table
  await query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'DOP',
      nature VARCHAR(20) NOT NULL DEFAULT 'variable' CHECK (nature IN ('fixed', 'variable')),
      recurrence_type VARCHAR(20) NOT NULL DEFAULT 'non_recurrent' CHECK (recurrence_type IN ('recurrent', 'non_recurrent')),
      frequency VARCHAR(32),
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
  await query(`
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
  await query(`
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

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bank_accounts' AND column_name = 'account_kind'
      ) THEN
        ALTER TABLE bank_accounts ADD COLUMN account_kind VARCHAR(20) NOT NULL DEFAULT 'bank'
          CHECK (account_kind IN ('bank', 'cash', 'wallet'));
      END IF;
    END $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'bank_account_id'
      ) THEN
        ALTER TABLE income ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'bank_account_id'
      ) THEN
        ALTER TABLE expenses ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'is_received'
      ) THEN
        ALTER TABLE income ADD COLUMN is_received BOOLEAN NOT NULL DEFAULT false;
        UPDATE income SET is_received = true WHERE bank_account_id IS NOT NULL;
      END IF;
    END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS account_transfers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
      to_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (from_account_id <> to_account_id),
      CHECK (amount > 0)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS cash_adjustments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
      amount_delta DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      reason TEXT,
      counted_total DECIMAL(15, 2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_account_transfers_user_id ON account_transfers(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cash_adjustments_user_id ON cash_adjustments(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_income_bank_account_id ON income(bank_account_id)`);

  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'frequency'
      ) THEN
        ALTER TABLE income ALTER COLUMN frequency TYPE VARCHAR(32);
      END IF;
    END $$;
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_expenses_bank_account_id ON expenses(bank_account_id)`);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'loan_payments' AND column_name = 'bank_account_id'
      ) THEN
        ALTER TABLE loan_payments ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS credit_card_payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credit_card_id INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
      amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL CHECK (currency IN ('DOP', 'USD')),
      payment_date DATE NOT NULL,
      bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_cc_payments_user_id ON credit_card_payments(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cc_payments_card_id ON credit_card_payments(credit_card_id)`);

  // Notifications table
  await query(`
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
  await query(`
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
  await query(`
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
  await query(`
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

  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`);

  // Calendar Events table - tracks payment status for financial events
  await query(`
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
  
  await query(`CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status)`);

  // Create indexes for better performance
  await query(`CREATE INDEX IF NOT EXISTS idx_credit_cards_user_id ON credit_cards(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id)`);
  // Accounts Payable table
  await query(`
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
  await query(`
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

  // Abonos parciales — cuentas por pagar (cada fila genera un gasto NON_RECURRING)
  await query(`
    CREATE TABLE IF NOT EXISTS accounts_payable_payments (
      id SERIAL PRIMARY KEY,
      account_payable_id INTEGER NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount DECIMAL(15, 2) NOT NULL,
      payment_date DATE NOT NULL,
      expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_app_payments_account ON accounts_payable_payments(account_payable_id)`);

  // Abonos parciales — cuentas por cobrar (cada fila genera un ingreso VARIABLE)
  await query(`
    CREATE TABLE IF NOT EXISTS accounts_receivable_payments (
      id SERIAL PRIMARY KEY,
      account_receivable_id INTEGER NOT NULL REFERENCES accounts_receivable(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount DECIMAL(15, 2) NOT NULL,
      payment_date DATE NOT NULL,
      income_id INTEGER REFERENCES income(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_arp_payments_account ON accounts_receivable_payments(account_receivable_id)`);

  // Budgets table
  await query(`
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
  await query(`
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
  await query(`
    CREATE TABLE IF NOT EXISTS financial_goal_movements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_id INTEGER NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
      amount DECIMAL(15, 2) NOT NULL,
      note TEXT,
      movement_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_goal_movements' AND column_name = 'movement_date'
      ) THEN
        ALTER TABLE financial_goal_movements ADD COLUMN movement_date DATE;
        UPDATE financial_goal_movements SET movement_date = created_at::date WHERE movement_date IS NULL;
      END IF;
    END $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_goals' AND column_name = 'bank_account_id'
      ) THEN
        ALTER TABLE financial_goals
        ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_goal_movements' AND column_name = 'bank_account_id'
      ) THEN
        ALTER TABLE financial_goal_movements
        ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_goal_movements' AND column_name = 'source_bank_account_id'
      ) THEN
        ALTER TABLE financial_goal_movements
        ADD COLUMN source_bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // Vehicles table
  await query(`
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
  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_expenses (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      spend_kind VARCHAR(50) NOT NULL,
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

  await query(`CREATE INDEX IF NOT EXISTS idx_income_user_id ON income(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_accounts_payable_user_id ON accounts_payable(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_accounts_receivable_user_id ON accounts_receivable(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_financial_goals_user_id ON financial_goals(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_vehicle_id ON vehicle_expenses(vehicle_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_user_id ON vehicle_expenses(user_id)`);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_expenses' AND column_name = 'category_id'
      ) THEN
        ALTER TABLE vehicle_expenses ADD COLUMN category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_expenses' AND column_name = 'bank_account_id'
      ) THEN
        ALTER TABLE vehicle_expenses ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_expenses' AND column_name = 'linked_expense_id'
      ) THEN
        ALTER TABLE vehicle_expenses ADD COLUMN linked_expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_expenses_linked_expense_unique
    ON vehicle_expenses(linked_expense_id)
    WHERE linked_expense_id IS NOT NULL
  `);

  /* Ingresos/gastos: Tipo=nature (fixed|variable), Frecuencia=frequency, Naturaleza=recurrence_type (recurrent|non_recurrent).
     Columnas: income.nature, income.recurrence_type, income.frequency; expenses.* idem. */
  // Taxonomía nature + recurrence_type + frequency (ingresos/gastos)
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'nature'
      ) THEN
        ALTER TABLE income ADD COLUMN nature VARCHAR(20);
        ALTER TABLE income ADD COLUMN recurrence_type VARCHAR(20);
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'nature'
      ) THEN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'income_type'
        ) THEN
          UPDATE income SET nature = CASE WHEN income_type = 'FIXED' THEN 'fixed' ELSE 'variable' END
            WHERE nature IS NULL;
          UPDATE income SET recurrence_type = CASE WHEN income_type = 'FIXED' THEN 'recurrent' ELSE 'non_recurrent' END
            WHERE recurrence_type IS NULL;
        ELSE
          UPDATE income SET nature = COALESCE(nature, 'variable'), recurrence_type = COALESCE(recurrence_type, 'non_recurrent')
            WHERE nature IS NULL OR recurrence_type IS NULL;
        END IF;
        UPDATE income SET frequency = LOWER(TRIM(frequency)) WHERE frequency IS NOT NULL;
        ALTER TABLE income ALTER COLUMN nature SET NOT NULL;
        ALTER TABLE income ALTER COLUMN recurrence_type SET NOT NULL;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'income_nature_check') THEN
          ALTER TABLE income ADD CONSTRAINT income_nature_check CHECK (nature IN ('fixed', 'variable'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'income_recurrence_type_check') THEN
          ALTER TABLE income ADD CONSTRAINT income_recurrence_type_check CHECK (recurrence_type IN ('recurrent', 'non_recurrent'));
        END IF;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'nature'
      ) THEN
        ALTER TABLE expenses ADD COLUMN nature VARCHAR(20);
        ALTER TABLE expenses ADD COLUMN recurrence_type VARCHAR(20);
        ALTER TABLE expenses ADD COLUMN frequency VARCHAR(32);
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'nature'
      ) THEN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'expense_type'
        ) THEN
          UPDATE expenses SET nature = 'variable', recurrence_type = 'non_recurrent', frequency = NULL
            WHERE expense_type = 'NON_RECURRING' AND nature IS NULL;
          UPDATE expenses SET nature = 'fixed', recurrence_type = 'recurrent', frequency = 'monthly'
            WHERE expense_type = 'RECURRING_MONTHLY' AND nature IS NULL;
          UPDATE expenses SET nature = 'fixed', recurrence_type = 'recurrent', frequency = 'annual'
            WHERE expense_type = 'ANNUAL' AND nature IS NULL;
        END IF;
        UPDATE expenses SET nature = COALESCE(nature, 'variable'), recurrence_type = COALESCE(recurrence_type, 'non_recurrent')
          WHERE nature IS NULL OR recurrence_type IS NULL;
        ALTER TABLE expenses ALTER COLUMN nature SET NOT NULL;
        ALTER TABLE expenses ALTER COLUMN recurrence_type SET NOT NULL;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_nature_check') THEN
          ALTER TABLE expenses ADD CONSTRAINT expenses_nature_check CHECK (nature IN ('fixed', 'variable'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_recurrence_type_check') THEN
          ALTER TABLE expenses ADD CONSTRAINT expenses_recurrence_type_check CHECK (recurrence_type IN ('recurrent', 'non_recurrent'));
        END IF;
      END IF;
    END $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_expenses' AND column_name = 'expense_type'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_expenses' AND column_name = 'spend_kind'
      ) THEN
        ALTER TABLE vehicle_expenses RENAME COLUMN expense_type TO spend_kind;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'income_type'
      ) THEN
        ALTER TABLE income DROP COLUMN income_type;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'expense_type'
      ) THEN
        ALTER TABLE expenses DROP COLUMN expense_type;
      END IF;
    END $$;
  `);

  /* Plantillas guardadas: variables legacy {expenseTypeLabel} → {expenseScheduleLabel} (idempotente). */
  await query(`
    UPDATE notification_templates
    SET
      message_template = REPLACE(
        REPLACE(
          message_template,
          '{expenseTypeLabel}',
          '{expenseScheduleLabel}'
        ),
        '<b>Tipo:</b> {expenseScheduleLabel}',
        '<b>Calendario:</b> {expenseScheduleLabel}'
      ),
      title_template = REPLACE(title_template, '{expenseTypeLabel}', '{expenseScheduleLabel}'),
      updated_at = CURRENT_TIMESTAMP
    WHERE notification_type = 'RECURRING_EXPENSE'
      AND (
        message_template LIKE '%' || '{expenseTypeLabel}' || '%'
        OR title_template LIKE '%' || '{expenseTypeLabel}' || '%'
        OR message_template LIKE '%<b>Tipo:</b> {expenseScheduleLabel}%'
      );
  `);
};

export default pool;
