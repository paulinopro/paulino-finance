import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import { adminService } from '../services/adminService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  impersonatedBy: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  setSession: (token: string, user: User, impersonatedBy: number | null) => void;
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (authService.isAuthenticated()) {
        try {
          const { user: currentUser, impersonatedBy: imp } = await authService.getCurrentUser();
          setUser(currentUser);
          setImpersonatedBy(imp);
        } catch (error) {
          authService.logout();
          setImpersonatedBy(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authService.login({ email, password });
    setUser(response.user);
    setImpersonatedBy(null);
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const response = await authService.register({ email, password, firstName, lastName });
    setUser(response.user);
    setImpersonatedBy(null);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setImpersonatedBy(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser((prev) => {
      const next = { ...(prev ?? ({} as User)), ...updatedUser };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  };

  const setSession = (token: string, u: User, imp: number | null) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    setImpersonatedBy(imp);
  };

  const stopImpersonation = async () => {
    const { token, user: u } = await adminService.stopImpersonation();
    setSession(token, u, null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        impersonatedBy,
        login,
        register,
        logout,
        updateUser,
        setSession,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
