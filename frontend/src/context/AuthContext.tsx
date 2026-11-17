import React, { createContext, useContext, useState } from 'react';

export interface UserData {
  id: number;
  username: string;
  email: string;
  first_name: string;
  role: 'ADMIN' | 'MANAGER' | 'SALES_USER' | 'PURCHASE_USER' | 'STOCK_USER' | 'ACCOUNTS_USER';
  company?: {
    name: string;
    currency: string;
    symbol: string;
    country: string;
  };
}

interface AuthContextType {
  user: UserData | null;
  token: string | null;
  login: (token: string, user: UserData) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getStoredAccessToken = (): string | null => {
  const tokenKeys = ['access_token', 'token', 'jwt_access'];
  const tokens = tokenKeys
    .map((key) => localStorage.getItem(key))
    .filter((token): token is string => Boolean(token));
  const validToken = tokens.find((token) => token.split('.').length === 3);

  if (validToken) {
    localStorage.setItem('access_token', validToken);
    return validToken;
  }

  if (tokens.length > 0) {
    tokenKeys.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem('user_data');
    localStorage.removeItem('rbac_user');
  }

  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(getStoredAccessToken);
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user_data');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = (newToken: string, newUserData: UserData) => {
    try {
      localStorage.setItem('access_token', newToken);
      localStorage.setItem('token', newToken);
      localStorage.setItem('jwt_access', newToken);
      if (newUserData) {
        const enhancedUser = { ...newUserData, access: newToken };
        localStorage.setItem('rbac_user', JSON.stringify(enhancedUser));
      }
    } catch {}
    setToken(newToken);
    setUser(newUserData);
    localStorage.setItem('access_token', newToken);
    localStorage.setItem('user_data', JSON.stringify(newUserData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('token');
    localStorage.removeItem('jwt_access');
    localStorage.removeItem('user_data');
    localStorage.removeItem('rbac_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};