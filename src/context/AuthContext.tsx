'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface Gate {
  id: string;
  name: string;
  type: 'ENTRY' | 'EXIT' | 'BOTH';
  description?: string | null;
  active?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
  gates?: Gate[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  theme: 'light' | 'dark';
  currentGate: Gate | null;
  setCurrentGate: (gate: Gate | null) => void;
  toggleTheme: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  theme: 'light',
  currentGate: null,
  setCurrentGate: () => {},
  toggleTheme: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [currentGate, setCurrentGateState] = useState<Gate | null>(null);
  const router = useRouter();

  // Load theme (Light mode is the default)
  useEffect(() => {
    const savedTheme = localStorage.getItem('gk_theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'light';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gk_theme', next);
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = 'light';
      }
      return next;
    });
  };

  const setCurrentGate = (gate: Gate | null) => {
    if (user?.role === 'OPERATOR') {
      const assignedGates = Array.isArray(user.gates) ? user.gates : [];
      if (!gate) {
        if (assignedGates.length > 0) {
          setCurrentGateState(assignedGates[0]);
          localStorage.setItem('gk_current_gate', JSON.stringify(assignedGates[0]));
        } else {
          setCurrentGateState(null);
          localStorage.removeItem('gk_current_gate');
        }
        return;
      }
      const allowedGate = assignedGates.find((g) => g.id === gate.id);
      if (!allowedGate) {
        return;
      }
      setCurrentGateState(allowedGate);
      localStorage.setItem('gk_current_gate', JSON.stringify(allowedGate));
      return;
    }

    setCurrentGateState(gate);
    if (gate) {
      localStorage.setItem('gk_current_gate', JSON.stringify(gate));
    } else {
      localStorage.removeItem('gk_current_gate');
    }
  };

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          const userGates: Gate[] = Array.isArray(data.user.gates) ? data.user.gates : [];

          if (data.user.role === 'OPERATOR') {
            if (userGates.length === 0) {
              setCurrentGateState(null);
              localStorage.removeItem('gk_current_gate');
            } else {
              let matchedSavedGate: Gate | undefined;
              const savedGate = localStorage.getItem('gk_current_gate');
              if (savedGate) {
                try {
                  const parsed = JSON.parse(savedGate) as Gate | null;
                  if (parsed?.id) {
                    matchedSavedGate = userGates.find((g) => g.id === parsed.id);
                  }
                } catch {
                  // ignore invalid saved gate
                }
              }
              const gateToSelect = matchedSavedGate || userGates[0];
              setCurrentGateState(gateToSelect);
              localStorage.setItem('gk_current_gate', JSON.stringify(gateToSelect));
            }
          } else {
            // ADMIN: restore saved gate if valid, or select first gate
            const savedGate = localStorage.getItem('gk_current_gate');
            if (savedGate) {
              try {
                const parsed = JSON.parse(savedGate) as Gate | null;
                const matched = parsed?.id
                  ? userGates.find((g) => g.id === parsed.id) || parsed
                  : null;
                setCurrentGateState(matched);
              } catch {
                if (userGates.length > 0) {
                  setCurrentGateState(userGates[0]);
                  localStorage.setItem('gk_current_gate', JSON.stringify(userGates[0]));
                }
              }
            } else if (userGates.length > 0) {
              setCurrentGateState(userGates[0]);
              localStorage.setItem('gk_current_gate', JSON.stringify(userGates[0]));
            }
          }
        } else {
          setUser(null);
          setCurrentGateState(null);
        }
      } else {
        setUser(null);
        setCurrentGateState(null);
      }
    } catch {
      setUser(null);
      setCurrentGateState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setCurrentGateState(null);
      localStorage.removeItem('gk_current_gate');
      router.push('/login');
    } catch (e) {
      console.error('Logout error:', e);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        theme,
        currentGate,
        setCurrentGate,
        toggleTheme,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
