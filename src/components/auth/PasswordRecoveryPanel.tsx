'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  KeyRound,
  Loader2,
  ShieldCheck,
  Send,
} from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import { useLanguage } from '@/context/LanguageContext';

export type PortalContextType = 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';

interface PasswordRecoveryPanelProps {
  portalContext?: PortalContextType;
  initialEmail?: string;
  onBackToLogin?: (updatedEmail?: string) => void;
  backHref?: string;
}

type RecoveryViewState =
  | 'FORM'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'COMPLETED';

export default function PasswordRecoveryPanel({
  portalContext = 'OPERATOR',
  initialEmail = '',
  onBackToLogin,
  backHref,
}: PasswordRecoveryPanelProps) {
  const { language, t } = useLanguage();
  const isUrdu = language === 'ur';

  const [viewState, setViewState] = useState<RecoveryViewState>('FORM');
  const [email, setEmail] = useState(initialEmail);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [detectedPortal, setDetectedPortal] = useState<PortalContextType>(portalContext);

  // Create New Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const pollInFlightRef = useRef(false);

  const checkLiveStatus = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch('/api/auth/password-reset/status', {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();

      if (!data.active || !data.status) {
        return;
      }

      if (data.portalContext && ['ADMIN', 'OPERATOR', 'EMPLOYEE'].includes(data.portalContext)) {
        setDetectedPortal(data.portalContext as PortalContextType);
      } else if (data.userRole && ['ADMIN', 'OPERATOR', 'EMPLOYEE'].includes(data.userRole)) {
        setDetectedPortal(data.userRole as PortalContextType);
      }

      if (data.status === 'PENDING') {
        setViewState((prev) => (prev === 'COMPLETED' ? 'COMPLETED' : 'PENDING'));
      } else if (data.status === 'APPROVED' && data.canResetPassword) {
        setExpiresAt(data.expiresAt || null);
        setError(null);
        setViewState('APPROVED');
      } else if (data.status === 'REJECTED') {
        setRejectionReason(data.rejectionReason || null);
        setViewState('REJECTED');
      } else if (data.status === 'EXPIRED' || (data.status === 'APPROVED' && !data.canResetPassword)) {
        setViewState('EXPIRED');
      } else if (data.status === 'COMPLETED') {
        setViewState('COMPLETED');
      }
    } catch {
      // Ignore transient network errors during polling
    } finally {
      pollInFlightRef.current = false;
      setInitialCheckDone(true);
    }
  }, []);

  useEffect(() => {
    const initialCheck = setTimeout(() => { void checkLiveStatus(); }, 0);
    return () => clearTimeout(initialCheck);
  }, [checkLiveStatus]);

  // Real-time polling while waiting for Admin decision or while on Approved screen (to detect expiry)
  useEffect(() => {
    if (viewState !== 'PENDING' && viewState !== 'APPROVED') return;

    const interval = setInterval(() => {
      void checkLiveStatus();
    }, 3000);

    const handleFocus = () => {
      void checkLiveStatus();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkLiveStatus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [viewState, checkLiveStatus]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(
        isUrdu
          ? 'براہ کرم اپنا درست رجسٹرڈ ای میل ایڈریس درج کریں۔'
          : 'Please enter a valid registered email address.'
      );
      return;
    }

    setSubmittingRequest(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          portalContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to submit password reset request.');
        return;
      }

      setConfirmationMessage(
        data.message ||
          'If an active account is registered with this email address, your password reset request has been submitted for Administrator approval.'
      );
      setViewState('PENDING');
      // Immediately check live status (in case an approved request was already active for this user)
      setTimeout(() => {
        void checkLiveStatus();
      }, 250);
    } catch {
      setError(
        isUrdu
          ? 'نیٹ ورک کا مسئلہ ہے۔ براہ کرم دوبارہ کوشش کریں۔'
          : 'Network error while submitting password reset request.'
      );
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.length < 6) {
      setError(
        isUrdu
          ? 'نیا پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے۔'
          : 'New password must be at least 6 characters long.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        isUrdu
          ? 'نیا پاس ورڈ اور تصدیقی پاس ورڈ یکساں نہیں ہیں۔'
          : 'New password and confirm password do not match.'
      );
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update password.');
        if (res.status === 401 || res.status === 403 || res.status === 409) {
          void checkLiveStatus();
        }
        return;
      }

      if (data.portalContext && ['ADMIN', 'OPERATOR', 'EMPLOYEE'].includes(data.portalContext)) {
        setDetectedPortal(data.portalContext as PortalContextType);
      } else if (data.userRole && ['ADMIN', 'OPERATOR', 'EMPLOYEE'].includes(data.userRole)) {
        setDetectedPortal(data.userRole as PortalContextType);
      }

      setNewPassword('');
      setConfirmPassword('');
      setViewState('COMPLETED');
    } catch {
      setError(
        isUrdu
          ? 'پاس ورڈ اپ ڈیٹ کرتے وقت نیٹ ورک کا مسئلہ پیش آیا۔'
          : 'Network error while updating password. Please try again.'
      );
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleResetTrackerAndStartOver = async () => {
    try {
      await fetch('/api/auth/password-reset/status', { method: 'DELETE' });
    } catch {
      // ignore
    }
    setError(null);
    setRejectionReason(null);
    setConfirmationMessage(null);
    setViewState('FORM');
  };

  const handleReturnToLogin = async () => {
    if (viewState === 'COMPLETED' || viewState === 'REJECTED' || viewState === 'EXPIRED') {
      try {
        await fetch('/api/auth/password-reset/status', { method: 'DELETE' });
      } catch {
        // ignore
      }
    }
    if (onBackToLogin) {
      onBackToLogin(email.trim() || undefined);
      return;
    }
    const targetUrl =
      backHref ||
      (detectedPortal === 'EMPLOYEE'
        ? '/employee'
        : detectedPortal === 'ADMIN'
        ? '/admin'
        : '/login');
    window.location.href = targetUrl;
  };

  if (!initialCheckDone && !onBackToLogin) {
    return (
      <div className="p-8 text-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {isUrdu ? 'پاس ورڈ ری سیٹ کی حیثیت چیک کی جا رہی ہے...' : 'Checking password recovery status...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span dir="auto" className={isUrdu ? 'text-right flex-1' : 'text-left flex-1'}>
            {error}
          </span>
        </div>
      )}

      {/* ================================================================= */}
      {/* STATE 1: SUBMIT PASSWORD RESET REQUEST FORM                       */}
      {/* ================================================================= */}
      {viewState === 'FORM' && (
        <form onSubmit={handleRequestSubmit} className="space-y-4">
          <div className={`space-y-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
            <h3 dir="auto" className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{t('forgot_password_title', isUrdu ? 'پاس ورڈ ری سیٹ کی درخواست' : 'Forgot Password Recovery')}</span>
            </h3>
            <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isUrdu
                ? 'اپنا رجسٹرڈ ای میل ایڈریس درج کریں۔ ایڈمن کی منظوری کے بعد آپ اسی اسکرین پر فوری طور پر نیا پاس ورڈ بنا سکیں گے۔'
                : 'Enter your registered email address to request an Administrator-approved password reset.'}
            </p>
          </div>

          <div>
            <label
              dir="auto"
              className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ${
                isUrdu ? 'text-right' : 'text-left'
              }`}
            >
              {isUrdu ? 'رجسٹرڈ ای میل ایڈریس' : 'Registered Email Address'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@company.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-left"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submittingRequest}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {submittingRequest ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span dir="auto">{isUrdu ? 'درخواست بھیجی جا رہی ہے...' : 'Sending Request...'}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 shrink-0" />
                <span dir="auto">{isUrdu ? 'ری سیٹ کی درخواست بھیجیں' : 'Send Request'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleReturnToLogin()}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span dir="auto">{isUrdu ? 'لاگ ان پر واپس جائیں' : 'Back to Login'}</span>
          </button>
        </form>
      )}

      {/* ================================================================= */}
      {/* STATE 2: PENDING ADMIN APPROVAL (REAL-TIME AUTO-UPDATING)         */}
      {/* ================================================================= */}
      {viewState === 'PENDING' && (
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              {isUrdu ? 'ایڈمن کی منظوری کا انتظار ہے' : 'Awaiting Administrator Approval'}
            </span>
            <h3 dir="auto" className="text-base font-extrabold text-slate-900 dark:text-white pt-1">
              {isUrdu ? 'پاس ورڈ ری سیٹ کی درخواست جمع ہو گئی ہے' : 'Password Reset Request Submitted'}
            </h3>
            <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              {confirmationMessage ||
                (isUrdu
                  ? 'اگر اس ای میل پر فعال اکاؤنٹ موجود ہے تو آپ کی درخواست ایڈمن کو بھیج دی گئی ہے۔ منظوری ملتے ہی یہ اسکرین خودکار طور پر اپ ڈیٹ ہو جائے گی۔'
                  : 'If an active account is registered with this email address, your password reset request has been submitted for Administrator approval.')}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold text-blue-800 dark:text-blue-200 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
            <span dir="auto">
              {isUrdu
                ? 'ریئل ٹائم اپ ڈیٹ فعال ہے — صفحہ ریفریش کرنے کی ضرورت نہیں'
                : 'Real-time updates active — no page refresh required'}
            </span>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void handleResetTrackerAndStartOver()}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              <span dir="auto">{isUrdu ? 'مختلف ای میل درج کریں' : 'Use Another Email'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleReturnToLogin()}
              className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span dir="auto">{isUrdu ? 'لاگ ان پر واپس جائیں' : 'Back to Login'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STATE 3: APPROVED — CREATE NEW PASSWORD SCREEN                    */}
      {/* ================================================================= */}
      {viewState === 'APPROVED' && (
        <form onSubmit={handleUpdatePassword} className="space-y-4 animate-in fade-in-0 duration-200">
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className={`space-y-0.5 flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
              <p dir="auto" className="text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
                {isUrdu ? 'ایڈمن نے آپ کی درخواست منظور کر لی ہے!' : 'Administrator Approved Your Request'}
              </p>
              <p dir="auto" className="text-[11px] text-emerald-700 dark:text-emerald-300">
                {isUrdu
                  ? 'اب آپ اپنا نیا پاس ورڈ درج کر کے اکاؤنٹ اپ ڈیٹ کر سکتے ہیں۔'
                  : 'You are authorized to create a new password below. This single-use authorization expires automatically.'}
              </p>
              {expiresAt && (
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 pt-0.5">
                  Valid until: {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              dir="auto"
              className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ${
                isUrdu ? 'text-right' : 'text-left'
              }`}
            >
              {isUrdu ? 'نیا پاس ورڈ' : 'New Password'} <span className="text-rose-500">*</span>
            </label>
            <PasswordInput
              showLockIcon
              dir="ltr"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={isUrdu ? 'کم از کم 6 حروف' : 'Minimum 6 characters'}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
            />
          </div>

          <div>
            <label
              dir="auto"
              className={`block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ${
                isUrdu ? 'text-right' : 'text-left'
              }`}
            >
              {isUrdu ? 'نئے پاس ورڈ کی تصدیق کریں' : 'Confirm New Password'} <span className="text-rose-500">*</span>
            </label>
            <PasswordInput
              showLockIcon
              dir="ltr"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={isUrdu ? 'پاس ورڈ دوبارہ درج کریں' : 'Re-enter new password'}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
            />
          </div>

          <button
            type="submit"
            disabled={updatingPassword}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {updatingPassword ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span dir="auto">{isUrdu ? 'پاس ورڈ اپ ڈیٹ ہو رہا ہے...' : 'Updating Password...'}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span dir="auto">{isUrdu ? 'پاس ورڈ اپ ڈیٹ کریں' : 'Update Password'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleReturnToLogin()}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span dir="auto">{isUrdu ? 'لاگ ان پر واپس جائیں' : 'Back to Login'}</span>
          </button>
        </form>
      )}

      {/* ================================================================= */}
      {/* STATE 4: REJECTED BY ADMIN                                        */}
      {/* ================================================================= */}
      {viewState === 'REJECTED' && (
        <div className="text-center space-y-4 py-2 animate-in fade-in-0 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <XCircle className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
              {isUrdu ? 'درخواست مسترد کر دی گئی' : 'Request Rejected'}
            </span>
            <h3 dir="auto" className="text-base font-extrabold text-slate-900 dark:text-white pt-1">
              {isUrdu ? 'پاس ورڈ ری سیٹ کی اجازت نہیں ملی' : 'Password Reset Request Declined'}
            </h3>
            <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              {isUrdu
                ? 'ایڈمنسٹریٹر نے آپ کی پاس ورڈ ری سیٹ کی درخواست منظور نہیں کی۔'
                : 'Your password reset request was reviewed and rejected by the Administrator.'}
            </p>
            {rejectionReason && (
              <div className="mt-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                {isUrdu ? 'ایڈمن نوٹ: ' : 'Admin Note: '}
                {rejectionReason}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void handleResetTrackerAndStartOver()}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              <span dir="auto">{isUrdu ? 'نئی درخواست بھیجیں' : 'Submit New Request'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleReturnToLogin()}
              className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span dir="auto">{isUrdu ? 'لاگ ان پر واپس جائیں' : 'Back to Login'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STATE 5: EXPIRED AUTHORIZATION                                    */}
      {/* ================================================================= */}
      {viewState === 'EXPIRED' && (
        <div className="text-center space-y-4 py-2 animate-in fade-in-0 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
              {isUrdu ? 'میعاد ختم ہو گئی' : 'Authorization Expired'}
            </span>
            <h3 dir="auto" className="text-base font-extrabold text-slate-900 dark:text-white pt-1">
              {isUrdu ? 'پاس ورڈ ری سیٹ کا وقت ختم ہو گیا ہے' : 'Password Reset Session Expired'}
            </h3>
            <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              {isUrdu
                ? 'حفاظتی وجوہات کی بنا پر پاس ورڈ ری سیٹ کی اجازت مخصوص وقت کے بعد ختم ہو جاتی ہے۔ براہ کرم نئی درخواست جمع کروائیں۔'
                : 'For security reasons, single-use password reset authorizations expire automatically. Please submit a new request.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void handleResetTrackerAndStartOver()}
              className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-extrabold transition-all cursor-pointer"
            >
              <span dir="auto">{isUrdu ? 'نئی درخواست بھیجیں' : 'Request Again'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleReturnToLogin()}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span dir="auto">{isUrdu ? 'لاگ ان پر واپس جائیں' : 'Back to Login'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* STATE 6: COMPLETED — PASSWORD UPDATED SUCCESSFULLY                */}
      {/* ================================================================= */}
      {viewState === 'COMPLETED' && (
        <div className="text-center space-y-4 py-2 animate-in fade-in-0 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
              {isUrdu ? 'پاس ورڈ اپ ڈیٹ ہو گیا' : 'Password Updated'}
            </span>
            <h3 dir="auto" className="text-base font-extrabold text-slate-900 dark:text-white pt-1">
              {isUrdu ? 'آپ کا نیا پاس ورڈ محفوظ ہو گیا ہے' : 'Password Updated Successfully'}
            </h3>
            <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              {isUrdu
                ? 'آپ کا پاس ورڈ کامیابی سے تبدیل کر دیا گیا ہے۔ اب آپ اپنے نئے پاس ورڈ کے ساتھ لاگ ان کر سکتے ہیں۔'
                : 'Your password has been securely updated and previous sessions have been revoked. You can now sign in with your new password.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleReturnToLogin()}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span dir="auto">{isUrdu ? 'نئے پاس ورڈ کے ساتھ لاگ ان کریں' : 'Return to Login & Sign In'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
