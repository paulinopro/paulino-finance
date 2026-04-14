import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AuthBrandMark from '../components/AuthBrandMark';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success('¡Bienvenido!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 flex items-center justify-center p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="card">
          <div className="text-center mb-8">
            <AuthBrandMark />
            <h1 className="page-title mb-2">Paulino Finance</h1>
            <p className="text-dark-400 text-sm sm:text-base">Inicia sesión en tu cuenta</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="label">
                Correo Electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="password" className="label mb-0">
                  Contraseña
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs sm:text-sm text-primary-500 hover:text-primary-400 font-medium shrink-0"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          <p className="mt-6 text-center text-dark-400">
            ¿No tienes una cuenta?{' '}
            <Link to="/register" className="text-primary-500 hover:text-primary-400 font-medium">
              Regístrate
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
