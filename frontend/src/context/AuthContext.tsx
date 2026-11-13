import React, { createContext, useContext, useState, useEffect } from 'react';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user_data');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = (newToken: string, newUserData: UserData) => {
    setToken(newToken);
    setUser(newUserData);
    localStorage.setItem('access_token', newToken);
    localStorage.setItem('user_data', JSON.stringify(newUserData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_data');
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