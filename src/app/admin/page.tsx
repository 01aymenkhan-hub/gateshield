'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle, ArrowRight, QrCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import GateShieldLogo from '@/components/ui/GateShieldLogo';
import PasswordInput from '@/components/ui/PasswordInput';
import PasswordRecoveryPanel from '@/components/auth/PasswordRecoveryPanel';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('admin@gatekeeper.com');
  const [password, setPassword] = useState('admin123');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user, loading: authLoading, refreshUser, theme, toggleTheme } = useAuth();

  // If already authenticated as Admin, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password');
      }

      await refreshUser();
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please check credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased relative overflow-hidden transition-colors">
      {/* Top right Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleTheme}
          className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? (
            <span className="text-amber-400">☀ Light</span>
          ) : (
            <span className="text-indigo-600">🌙 Dark</span>
          )}
        </button>
      </div>

      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Card */}
        <div className="text-center space-y-2 flex flex-col items-center">
          <GateShieldLogo variant="full" size="lg" className="mb-1" />
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Enterprise Visitor &amp; Gate Access Control System
          </p>
        </div>

        {/* Login Form Box */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xl space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Administrator Access</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign in with your administrator email &amp; password
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase tracking-wider">
              Admin Portal
            </span>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {isForgotPassword ? (
            <PasswordRecoveryPanel
              portalContext="ADMIN"
              initialEmail={email}
              onBackToLogin={(updatedEmail) => {
                if (updatedEmail) setEmail(updatedEmail);
                setError(null);
                setIsForgotPassword(false);
              }}
            />
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@gatekeeper.com"
                    required
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setIsForgotPassword(true);
                    }}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <PasswordInput
                  showLockIcon
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In as Admin</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Credential Hint */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <span className="font-semibold text-slate-800 dark:text-slate-200 block">Administrator Credentials:</span>
            <p>Email: <span className="text-blue-600 dark:text-blue-400 font-mono">admin@gatekeeper.com</span></p>
            <p>Password: <span className="text-blue-600 dark:text-blue-400 font-mono">admin123</span></p>
          </div>

          {/* Switch to Operator Login */}
          <div className="pt-2 text-center border-t border-slate-100 dark:border-slate-800">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span>Switch to Operator QR Login</span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-500 dark:text-slate-500 font-medium">
          GateShield • Secured with Single-Tenant Database &amp; Audit Logging
        </p>
      </div>
    </div>
  );
}
