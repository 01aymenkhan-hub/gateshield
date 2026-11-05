'use client';

import React from 'react';
import { Check, Printer, IdCard, UserPlus, Plus, X, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { playSelectSound, playContinueSound } from '@/utils/interactionSound';

interface RegistrationSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit: Record<string, any> | null;
  onViewCard: () => void;
  onPrintBadge: () => void;
  onRegisterNext: () => void;
  imageStorageStatus?: 'saved' | 'failed' | 'none';
  imageStorageError?: string | null;
  onRetrySaveImage?: () => Promise<void>;
  isRetryingImageSave?: boolean;
}

export default function RegistrationSuccessModal({
  isOpen,
  onClose,
  visit,
  onViewCard,
  onPrintBadge,
  onRegisterNext,
  imageStorageStatus = 'none',
  imageStorageError = null,
  onRetrySaveImage,
  isRetryingImageSave = false,
}: RegistrationSuccessModalProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const isAdmin = user?.role === 'ADMIN';
  const isUr = !isAdmin && language === 'ur';

  if (!isOpen || !visit) return null;

  const person = visit.person || {};
  const isDelivery = String(person.category || '').toUpperCase() === 'DELIVERY';
  const visitorCardNo = isDelivery
    ? visit.vehicleNo || visit.visitorCardNo || 'N/A'
    : visit.visitorCardNo || 'N/A';

  /* ── Preserve Original Admin Panel UI 100% Unchanged ── */
  if (isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 text-center relative animate-in zoom-in-95 duration-200">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Success Icon */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm mb-4">
            <Check className="w-7 h-7 stroke-[2.5]" />
          </div>

          {/* Title & Description */}
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Registration Successful
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto">
            Visitor entry has been verified and registered. The visitor can now proceed.
          </p>

          {/* Key Operational Pass Highlight Box */}
          <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-left space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Visitor Name
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                {person.fullName || visit.hostName || 'Registered Visitor'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isDelivery ? 'Vehicle Number' : 'Visitor Card Badge #'}
              </span>
              <span className="text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {visitorCardNo}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Check-in Status
              </span>
              <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                {visit.status === 'CHECKED_IN' || !visit.status ? 'CHECKED IN' : visit.status}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isDelivery ? 'Delivery Source / Company' : 'Visit To'}
              </span>
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {isDelivery
                  ? person.company || visit.hostName || 'N/A'
                  : `${visit.hostName} (${visit.department})`}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Check-in Time &amp; Gate
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {visit.timeIn
                  ? new Date(visit.timeIn).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                {visit.entryGate?.name ? ` • ${visit.entryGate.name}` : ''}
              </span>
            </div>
          </div>

          {/* Distinct ID Image Save Failure Notice & Retry */}
          {imageStorageStatus === 'failed' && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-left space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Visitor registered, but saving the scanned ID card image failed.
                  </p>
                  {imageStorageError && (
                    <p className="text-[11px] opacity-85 mt-0.5">{imageStorageError}</p>
                  )}
                </div>
              </div>
              {onRetrySaveImage && (
                <button
                  type="button"
                  onClick={onRetrySaveImage}
                  disabled={isRetryingImageSave}
                  className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isRetryingImageSave ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving ID image...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Saving ID Image</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onPrintBadge}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Badge</span>
              </button>

              <button
                onClick={onViewCard}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <IdCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>View Card</span>
              </button>
            </div>

            <button
              onClick={onRegisterNext}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Register Next Visitor</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Operator Final Registration Success Screen ── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 text-center relative animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm mb-4">
          <Check className="w-9 h-9 stroke-[2.5]" />
        </div>

        {/* Title & Description */}
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {t('reg_success_title')}
        </h2>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto">
          {t('reg_success_subtitle')}
        </p>

        {/* Key Operational Pass Highlight Box */}
        <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span
              dir="auto"
              className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400"
            >
              {t('reg_visitor_name')}
            </span>
            <span
              dir="auto"
              className="text-sm font-extrabold text-slate-900 dark:text-white truncate max-w-[200px]"
            >
              {person.fullName || visit.hostName || 'Registered Visitor'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span
              dir="auto"
              className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400"
            >
              {isDelivery
                ? t('vehicle_no_label', 'Vehicle Number')
                : t('reg_card_badge_no')}
            </span>
            <span
              dir="ltr"
              className="text-sm font-mono font-extrabold px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            >
              {visitorCardNo}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span
              dir="auto"
              className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400"
            >
              {t('checkin_status_label', 'Check-in Status')}
            </span>
            <span
              dir="auto"
              className="text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
            >
              {visit.status === 'CHECKED_IN' || !visit.status ? 'CHECKED IN' : visit.status}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span
              dir="auto"
              className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400"
            >
              {isDelivery
                ? t('delivery_source_label', 'Delivery Source / Company Name')
                : t('reg_visit_to')}
            </span>
            <span
              dir="auto"
              className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200"
            >
              {isDelivery
                ? person.company || visit.hostName || 'N/A'
                : `${visit.hostName} (${visit.department})`}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-700/60 pt-2.5">
            <span
              dir="auto"
              className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400"
            >
              {t('checkin_time_label', 'Check-in Time')} / {t('reg_entry_gate')}
            </span>
            <span
              dir="auto"
              className="text-xs sm:text-sm font-extrabold text-slate-700 dark:text-slate-300"
            >
              {visit.timeIn
                ? new Date(visit.timeIn).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
              {visit.entryGate?.name ? ` • ${visit.entryGate.name}` : ''}
            </span>
          </div>
        </div>

        {/* Distinct ID Image Save Failure Notice & Retry */}
        {imageStorageStatus === 'failed' && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 space-y-2">
            <div
              className={`flex items-start gap-2 text-xs font-bold ${
                isUr ? 'text-right' : 'text-left'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p dir="auto">
                  {t(
                    'image_save_failed_warning',
                    'Visitor registered, but saving the scanned ID card image failed.'
                  )}
                </p>
                {imageStorageError && (
                  <p dir="auto" className="text-[11px] font-medium opacity-85 mt-0.5">
                    {imageStorageError}
                  </p>
                )}
              </div>
            </div>
            {onRetrySaveImage && (
              <button
                type="button"
                onClick={() => {
                  playSelectSound();
                  void onRetrySaveImage();
                }}
                disabled={isRetryingImageSave}
                className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isRetryingImageSave ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('saving_id_image', 'Saving ID image...')}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('retry_save_image_btn', 'Retry Saving ID Image')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Action Buttons — Enhanced Print Badge & View Card */}
        <div className="mt-6 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Print Badge with Subtle Wave/Pulse Animation */}
            <button
              onClick={() => {
                playContinueSound();
                onPrintBadge();
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm sm:text-base font-extrabold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer gk-pulse-blue"
            >
              <Printer className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
              <span>{t('print_badge_btn')}</span>
            </button>

            {/* View Card with Larger Icon & Text */}
            <button
              onClick={() => {
                playSelectSound();
                onViewCard();
              }}
              className="w-full py-3.5 px-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] text-slate-800 dark:text-slate-100 text-sm sm:text-base font-extrabold shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <IdCard className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{t('view_card_btn')}</span>
            </button>
          </div>

          <button
            onClick={() => {
              playContinueSound();
              onRegisterNext();
            }}
            className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t('register_next_visitor_btn', 'Register Next Visitor')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
