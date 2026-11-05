'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  QrCode,
  Camera,
  AlertCircle,
  ArrowRight,
  Languages,
  Mail,
  Lock,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  Phone,
  User,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import OperatorQrScanner from '@/components/scanner/OperatorQrScanner';
import GateShieldLogo from '@/components/ui/GateShieldLogo';

type LoginTab = 'qr' | 'email';
type ScreenMode = 'login' | 'register' | 'applicant_status';

interface ApplicantData {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  operatorNumber?: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  active: boolean;
  createdAt: string;
}

export default function OperatorLoginPage() {
  const [loginTab, setLoginTab] = useState<LoginTab>('qr');
  const [screenMode, setScreenMode] = useState<ScreenMode>('login');

  // QR Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);

  // Operator Self-Registration State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Applicant Status State
  const [applicant, setApplicant] = useState<ApplicantData | null>(null);

  const router = useRouter();
  const { user, loading, refreshUser, theme, toggleTheme } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const checkApplicantStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/operator/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.applicant) {
        setApplicant(data.applicant);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void checkApplicantStatus();
  }, [checkApplicantStatus]);

  useEffect(() => {
    if (screenMode !== 'applicant_status' && !applicant) return;
    const interval = setInterval(() => {
      void checkApplicantStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [screenMode, applicant, checkApplicantStatus]);

  const formatErrorMessage = (rawErr: string) => {
    if (language !== 'ur') return rawErr;
    const lower = rawErr.toLowerCase();
    if (lower.includes('deactivated') || lower.includes('inactive')) {
      return 'یہ آپریٹر کارڈ بند کر دیا گیا ہے۔ براہ کرم ایڈمن سے رابطہ کریں۔';
    }
    if (lower.includes('invalid') || lower.includes('expired') || lower.includes('not found')) {
      return 'یہ کیو آر کارڈ درست نہیں ہے۔ براہ کرم اپنا اصل آپریٹر کارڈ اسکین کریں۔';
    }
    return rawErr;
  };

  const handleScan = async (rawDecodedText: string) => {
    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawDecodedText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('auth_failed_default'));
      }

      await refreshUser();
      router.push('/dashboard');
    } catch (err: unknown) {
      console.error('[Operator QR Login Error]:', err);
      const msg =
        err instanceof Error
          ? err.message
          : t('auth_failed_default', 'Login verification failed. Please scan your card again.');
      setError(msg);
      setIsScanning(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setIsEmailSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'PENDING_APPROVAL' || data.code === 'REJECTED_APPROVAL') {
          await checkApplicantStatus();
          setScreenMode('applicant_status');
        }
        throw new Error(data.error || 'Invalid email or password.');
      }

      await refreshUser();
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleOperatorRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!regName.trim() || !regEmail.trim() || !regPhone.trim() || !regPassword) {
      setError('Operator Name, Email, Phone Number, and Password are required.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch('/api/operator/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim().toLowerCase(),
          phone: regPhone.trim(),
          password: regPassword,
          confirmPassword: regConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit operator registration request.');
      }

      if (data.applicant) {
        setApplicant(data.applicant);
      } else {
        await checkApplicantStatus();
      }
      setScreenMode('applicant_status');
      setRegPassword('');
      setRegConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleClearApplicantSession = async () => {
    try {
      await fetch('/api/operator/status', { method: 'DELETE' });
    } catch {
      // Ignore
    }
    setApplicant(null);
    setScreenMode('login');
  };

  const handleStartScanning = () => {
    setError(null);
    setIsScanning(true);
  };

  const handleCancelScanning = () => {
    setIsScanning(false);
    setError(null);
  };

  return (
    <div
      dir="ltr"
      className="min-h-screen flex flex-col justify-between items-center p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased relative overflow-hidden transition-colors"
    >
      {/* Top Bar with Brand, Language Selector & Theme Toggle — Fixed LTR layout */}
      <div className="w-full max-w-md flex items-center justify-between z-20 pt-2">
        <div className="flex items-center">
          <GateShieldLogo variant="full" size="md" />
        </div>

        <div className="flex items-center gap-2">
          {/* English / Urdu Language Selector */}
          <button
            onClick={toggleLanguage}
            type="button"
            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={language === 'ur' ? 'Switch to English' : 'اردو میں دیکھیں'}
            aria-label="Switch Language"
          >
            <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="font-semibold">{language === 'ur' ? 'English' : 'اردو'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            type="button"
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={t('switch_theme', 'Switch Theme')}
          >
            {theme === 'dark' ? (
              <span className="text-amber-400">☀ {t('theme_light', 'Light')}</span>
            ) : (
              <span className="text-indigo-600">🌙 {t('theme_dark', 'Dark')}</span>
            )}
          </button>
        </div>
      </div>

      {/* Background Soft Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-96 h-80 sm:h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content Area */}
      <div className="w-full max-w-sm sm:max-w-md my-auto relative z-10 space-y-5 py-4">
        {/* Brand Title Area */}
        <div className="text-center space-y-1.5">
          <h1
            dir="auto"
            className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-snug"
          >
            {screenMode === 'register'
              ? t('register_as_operator_btn', 'Register as Operator')
              : screenMode === 'applicant_status'
                ? t('operator_request_status_title', 'Operator Request Status')
                : t('operator_login_title', 'Operator Login')}
          </h1>
          <p
            dir="auto"
            className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed"
          >
            {screenMode === 'register'
              ? t(
                  'register_operator_subtitle',
                  'Submit your operator account request for Administrator approval'
                )
              : screenMode === 'applicant_status'
                ? t(
                    'operator_request_status_subtitle',
                    'Live status of your Operator registration request'
                  )
                : loginTab === 'qr'
                  ? t(
                      'operator_login_subtitle',
                      'Scan your physical Operator Access Card to open your checkpoint dashboard'
                    )
                  : t(
                      'operator_email_login_subtitle',
                      'Sign in using your approved Operator email and password'
                    )}
          </p>
        </div>

        {/* Pending / Active Applicant Status Banner (if user has an active application cookie while on login view) */}
        {screenMode === 'login' && applicant && (
          <div
            onClick={() => setScreenMode('applicant_status')}
            className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 cursor-pointer transition-all ${
              applicant.approvalStatus === 'APPROVED'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : applicant.approvalStatus === 'REJECTED'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Clock className="w-4 h-4 shrink-0" />
              <div className={`min-w-0 flex-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                <p dir="auto" className="font-bold truncate">
                  {applicant.name} • {applicant.approvalStatus}
                </p>
                <p dir="auto" className="text-[11px] opacity-80 truncate">
                  {language === 'ur'
                    ? 'رجسٹریشن درخواست کی صورتحال دیکھنے کے لیے کلک کریں'
                    : 'Click to view registration request status'}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/80 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-start gap-3 shadow-xs animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div className={`flex-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
              <p dir="auto" className="font-bold">
                {t('auth_failed_title', 'Authentication Notice')}
              </p>
              <p
                dir="auto"
                className="text-[11px] font-normal text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed"
              >
                {formatErrorMessage(error)}
              </p>
            </div>
          </div>
        )}

        {/* Main Card Container */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-xl">
          {/* Screen A — QR Code Login (Default Screen) */}
          {screenMode === 'login' && loginTab === 'qr' && (
            <>
              {isScanning ? (
                <OperatorQrScanner
                  onScan={handleScan}
                  onCancel={handleCancelScanning}
                  isVerifying={isVerifying}
                />
              ) : (
                <button
                  type="button"
                  onClick={handleStartScanning}
                  className="w-full group flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl border-2 border-dashed border-blue-400/60 dark:border-blue-500/40 hover:border-blue-600 dark:hover:border-blue-400 bg-gradient-to-b from-blue-50/60 to-white dark:from-slate-850 dark:to-slate-900 hover:from-blue-100/50 dark:hover:from-slate-800 transition-all cursor-pointer text-center space-y-4 shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  <div className="relative">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-blue-600 group-hover:bg-blue-700 text-white flex items-center justify-center shadow-xl shadow-blue-600/30 transition-all duration-300 group-hover:scale-105">
                      <QrCode className="w-12 h-12 sm:w-14 sm:h-14 stroke-[2.2]" />
                    </div>
                    <div className="absolute -bottom-1.5 -right-1.5 p-2 rounded-xl bg-amber-500 text-white shadow-md border-2 border-white dark:border-slate-900 group-hover:rotate-6 transition-transform">
                      <Camera className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-center">
                    <h2
                      dir="auto"
                      className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-snug"
                    >
                      {t('scan_your_qr_code', 'Scan Your QR Code')}
                    </h2>
                    <div className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                      <span dir="auto">
                        {t('tap_to_open_camera', 'Tap anywhere to open camera')}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform shrink-0" />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 w-full text-center">
                    <p
                      dir="auto"
                      className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium"
                    >
                      {t('instant_mobile_login', 'Instant mobile login • No password required')}
                    </p>
                  </div>
                </button>
              )}
            </>
          )}

          {/* Screen B — Email/Password Login */}
          {screenMode === 'login' && loginTab === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label
                  dir="auto"
                  className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ${
                    language === 'ur' ? 'text-right' : 'text-left'
                  }`}
                >
                  {t('operator_email_label', 'Operator Email')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-left"
                  />
                </div>
              </div>

              <div>
                <label
                  dir="auto"
                  className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ${
                    language === 'ur' ? 'text-right' : 'text-left'
                  }`}
                >
                  {t('operator_password_label', 'Password')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    dir="ltr"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('operator_password_placeholder', 'Enter your password')}
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-left"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isEmailSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isEmailSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span dir="auto">{t('signing_in_btn', 'Signing in...')}</span>
                  </>
                ) : (
                  <>
                    <span dir="auto">
                      {t('login_to_operator_dashboard_btn', 'Login to Operator Dashboard')}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </>
                )}
              </button>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
                <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400">
                  {t('no_operator_account_prompt', "Don't have an Operator account yet?")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setScreenMode('register');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" />
                  <span dir="auto">{t('register_as_operator_btn', 'Register as Operator')}</span>
                </button>
              </div>
            </form>
          )}

          {screenMode === 'register' && (
            <form onSubmit={handleOperatorRegister} className="space-y-3.5">
              <div>
                <label
                  dir="auto"
                  className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 ${
                    language === 'ur' ? 'text-right' : 'text-left'
                  }`}
                >
                  {t('operator_name_label', 'Operator Name')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    dir="auto"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={t('operator_name_placeholder', 'Full Name (e.g. Officer Bilal)')}
                    className={`w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                      language === 'ur' ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label
                  dir="auto"
                  className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 ${
                    language === 'ur' ? 'text-right' : 'text-left'
                  }`}
                >
                  {t('email_address_label', 'Email Address')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    dir="ltr"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="bilal@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-left"
                  />
                </div>
              </div>

              <div>
                <label
                  dir="auto"
                  className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 ${
                    language === 'ur' ? 'text-right' : 'text-left'
                  }`}
                >
                  {t('emp_phone', 'Phone Number')} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    dir="ltr"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    dir="auto"
                    className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 ${
                      language === 'ur' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {t('operator_password_label', 'Password')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={t('min_6_chars_placeholder', 'Min 6 chars')}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-left"
                  />
                </div>
                <div>
                  <label
                    dir="auto"
                    className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 ${
                      language === 'ur' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {t('confirm_password_label', 'Confirm Password')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder={t('reenter_password_placeholder', 'Re-enter password')}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-left"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span dir="auto">{t('submitting_request_btn', 'Submitting Request...')}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span dir="auto">
                      {t('submit_registration_request_btn', 'Submit Registration Request')}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setScreenMode('login');
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span dir="auto">{t('back_to_login_btn', 'Back to Login')}</span>
              </button>
            </form>
          )}

          {screenMode === 'applicant_status' && applicant && (
            <div className="space-y-4 text-center py-2">
              {applicant.approvalStatus === 'PENDING' && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                    <Clock className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <span
                      dir="auto"
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                    >
                      {language === 'ur' ? 'ایڈمن کی منظوری زیر التواء' : 'Pending Admin Approval'}
                    </span>
                    <h3
                      dir="auto"
                      className="text-base font-black text-slate-900 dark:text-white pt-1"
                    >
                      {language === 'ur'
                        ? 'درخواست کامیابی سے جمع ہو گئی'
                        : 'Request Submitted Successfully'}
                    </h3>
                    <p
                      dir="auto"
                      className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed"
                    >
                      {language === 'ur' ? (
                        <>
                          آپ کے آپریٹر اکاؤنٹ (<strong>{applicant.email}</strong>) کی درخواست ایڈمن
                          کو بھیج دی گئی ہے۔ منظوری کے بعد یہ اسکرین خودکار طور پر اپ ڈیٹ ہو جائے
                          گی۔
                        </>
                      ) : (
                        <>
                          Your operator registration request for <strong>{applicant.email}</strong>{' '}
                          has been sent to the Administrator. This screen updates automatically
                          once reviewed.
                        </>
                      )}
                    </p>
                  </div>
                </>
              )}

              {applicant.approvalStatus === 'APPROVED' && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <span
                      dir="auto"
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                    >
                      {language === 'ur' ? 'منظور شدہ' : 'Approved'}
                    </span>
                    <h3
                      dir="auto"
                      className="text-base font-black text-slate-900 dark:text-white pt-1"
                    >
                      {language === 'ur'
                        ? 'آپریٹر اکاؤنٹ منظور ہو گیا!'
                        : 'Operator Account Approved!'}
                    </h3>
                    <p
                      dir="auto"
                      className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed"
                    >
                      {language === 'ur'
                        ? `آپ کا اکاؤنٹ (${applicant.email}) منظور کر لیا گیا ہے۔ اب آپ اپنے ای میل اور پاس ورڈ یا کیو آر کارڈ سے لاگ ان کر سکتے ہیں۔`
                        : `Your account (${applicant.email}) has been approved by the Administrator. You can now sign in with your email and password or QR card.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(applicant.email);
                      setLoginTab('email');
                      setScreenMode('login');
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer"
                  >
                    <span dir="auto">
                      {language === 'ur'
                        ? 'ای میل لاگ ان پر جائیں'
                        : 'Proceed to Email Login'}
                    </span>
                  </button>
                </>
              )}

              {applicant.approvalStatus === 'REJECTED' && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                    <XCircle className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <span
                      dir="auto"
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                    >
                      {language === 'ur' ? 'درخواست مسترد' : 'Request Declined'}
                    </span>
                    <h3
                      dir="auto"
                      className="text-base font-black text-slate-900 dark:text-white pt-1"
                    >
                      {language === 'ur'
                        ? 'رجسٹریشن کی درخواست مسترد کر دی گئی'
                        : 'Registration Request Declined'}
                    </h3>
                    <p
                      dir="auto"
                      className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed"
                    >
                      {applicant.rejectionReason ||
                        (language === 'ur'
                          ? 'ایڈمن کی جانب سے آپ کی آپریٹر رجسٹریشن کی درخواست مسترد کر دی گئی ہے۔'
                          : 'Your operator registration request was declined by the Administrator.')}
                    </p>
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setScreenMode('login')}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <span dir="auto">{t('back_to_login_btn', 'Back to Login')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearApplicantSession()}
                  className="py-2 px-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <span dir="auto">{language === 'ur' ? 'حیثیت صاف کریں' : 'Clear Status'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Outside and directly below the QR scanner / Email login box: Simple clickable text link */}
        {screenMode === 'login' && (
          <div className="text-center pt-1">
            {loginTab === 'qr' ? (
              <button
                type="button"
                onClick={() => {
                  setIsScanning(false);
                  setLoginTab('email');
                  setError(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline underline-offset-4 transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4 shrink-0" />
                <span dir="auto">{t('login_with_email_link', 'Login with Email')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLoginTab('qr');
                  setError(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline underline-offset-4 transition-colors cursor-pointer"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span dir="auto">{t('login_with_qr_link', 'Login with QR Code')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="w-full max-w-md text-center py-2 z-10">
        <p dir="auto" className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          {t('login_footer', 'GateShield • Checkpoint Access Control')}
        </p>
      </div>
    </div>
  );
}
