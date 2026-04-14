import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import InstallAppPrompt from './components/InstallAppPrompt';
import { useMediaQuery } from './hooks/useMediaQuery';

const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const Layout = React.lazy(() => import('./components/Layout'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Cards = React.lazy(() => import('./pages/Cards'));
const Loans = React.lazy(() => import('./pages/Loans'));
const Income = React.lazy(() => import('./pages/Income'));
const Expenses = React.lazy(() => import('./pages/Expenses'));
const Accounts = React.lazy(() => import('./pages/Accounts'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Reports = React.lazy(() => import('./pages/Reports'));
const NotificationTemplates = React.lazy(() => import('./pages/NotificationTemplates'));
const Calendar = React.lazy(() => import('./pages/Calendar'));
const AccountsPayable = React.lazy(() => import('./pages/AccountsPayable'));
const AccountsReceivable = React.lazy(() => import('./pages/AccountsReceivable'));
const Budgets = React.lazy(() => import('./pages/Budgets'));
const FinancialGoals = React.lazy(() => import('./pages/FinancialGoals'));
const CashFlow = React.lazy(() => import('./pages/CashFlow'));
const Projections = React.lazy(() => import('./pages/Projections'));
const Vehicles = React.lazy(() => import('./pages/Vehicles'));
const NotificationHistory = React.lazy(() => import('./pages/NotificationHistory'));
const Categories = React.lazy(() => import('./pages/Categories'));
const Admin = React.lazy(() => import('./pages/Admin'));
const AdminSubscriptionPlans = React.lazy(() => import('./pages/AdminSubscriptionPlans'));
const Subscription = React.lazy(() => import('./pages/Subscription'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
    </div>
  );
}

function App() {
  const isNarrow = useMediaQuery('(max-width: 639px)');

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Router>
          <Toaster
            position={isNarrow ? 'top-center' : 'top-right'}
            containerClassName="!max-w-[min(100vw-1.5rem,24rem)]"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
              },
            }}
          />
          <InstallAppPrompt />
          <PwaUpdatePrompt />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="cards" element={<Cards />} />
                <Route path="loans" element={<Loans />} />
                <Route path="income" element={<Income />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="reports" element={<Reports />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="templates" element={<NotificationTemplates />} />
                <Route path="accounts-payable" element={<AccountsPayable />} />
                <Route path="accounts-receivable" element={<AccountsReceivable />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="financial-goals" element={<FinancialGoals />} />
                <Route path="cash-flow" element={<CashFlow />} />
                <Route path="projections" element={<Projections />} />
                <Route path="vehicles" element={<Vehicles />} />
                <Route path="notifications/history" element={<NotificationHistory />} />
                <Route path="categories" element={<Categories />} />
                <Route path="subscription" element={<Subscription />} />
                <Route
                  path="admin"
                  element={
                    <AdminRoute>
                      <Admin />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/subscriptions"
                  element={
                    <AdminRoute>
                      <AdminSubscriptionPlans />
                    </AdminRoute>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
