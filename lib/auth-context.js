'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const MOCK_USERS = [
  { id: 'user_001', username: 'demo', password: 'password', displayName: 'Demo User' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const stored = localStorage.getItem('budget_app_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      } catch (e) {
        localStorage.removeItem('budget_app_session');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const found = MOCK_USERS.find(
      (u) => u.username === username && u.password === password
    );

    if (!found) {
      throw new Error('Invalid username or password');
    }

    const session = {
      id: found.id,
      username: found.username,
      displayName: found.displayName,
    };

    localStorage.setItem('budget_app_session', JSON.stringify(session));
    setUser(session);
    return session;
  };

  const logout = () => {
    localStorage.removeItem('budget_app_session');
    setUser(null);
  };

  const register = async (username, password, displayName) => {
    // Mock registration - just creates a local session
    const session = {
      id: `user_${Date.now()}`,
      username,
      displayName: displayName || username,
    };
    localStorage.setItem('budget_app_session', JSON.stringify(session));
    setUser(session);
    return session;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useUser() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useUser must be used within an AuthProvider');
  }
  return context;
}
