'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sun, Moon, Languages } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import GateShieldLogo from '@/components/ui/GateShieldLogo';
import PasswordRecoveryPanel, { PortalContextType } from '@/components/auth/PasswordRecoveryPanel';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const isUrdu = language === 'ur';

  const rawPortal = (searchParams?.get('portal') || 'OPERATOR').toUpperCase();
  const portalContext: PortalContextType = ['ADMIN', 'OPERATOR', 'EMPLOYEE'].includes(rawPortal)
    ? (rawPortal as PortalContextType)
    : 'OPERATOR';
  const prefilledEmail = searchParams?.get('email') || '';

  const backHref =
    portalContext === 'EMPLOYEE'
      ? '/employee'
      : portalContext === 'ADMIN'
      ? '/admin'
      : '/login';

  return (
    <div
      dir="ltr"
      className="min-h-screen flex flex-col justify-center items-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased relative overflow-hidden transition-colors"
    >
      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleLanguage}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{language === 'en' ? 'اردو' : 'English'}</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{isUrdu ? 'روشن' : 'Light'}</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">{isUrdu ? 'ڈارک' : 'Dark'}</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full max-w-md relative z-10 space-y-5">
        <div className="text-center space-y-2 flex flex-col items-center">
          <GateShieldLogo variant="full" size="lg" className="mb-1" />
          <p dir="auto" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {isUrdu
              ? 'ایڈمن سے منظور شدہ محفوظ پاس ورڈ ری سیٹ سسٹم'
              : 'Administrator-Approved Password Recovery'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
            <div className={isUrdu ? 'text-right flex-1' : 'text-left flex-1'}>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/15">
                GateShield Security
              </span>
              <h1 dir="auto" className="text-base sm:text-lg font-extrabold mt-1">
                {isUrdu ? 'پاس ورڈ ریکوری اور ری سیٹ' : 'Password Recovery & Reset'}
              </h1>
            </div>
          </div>

          <div className="p-6">
            <PasswordRecoveryPanel
              portalContext={portalContext}
              initialEmail={prefilledEmail}
              backHref={backHref}
              onBackToLogin={() => router.push(backHref)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
          Loading password recovery...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
