'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  X,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useLayout } from '@/context/LayoutContext';
import { PasswordResetStatusType } from '@/lib/passwordReset';

interface AdminPasswordResetItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
  portalContext: string | null;
  status: PasswordResetStatusType;
  reviewedById: string | null;
  reviewedByName: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminPasswordResetSectionProps {
  roleFilter?: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
  highlightRequestId?: string | null;
}

export default function AdminPasswordResetSection({
  roleFilter = 'ADMIN',
  highlightRequestId = null,
}: AdminPasswordResetSectionProps) {
  const { language, t } = useLanguage();
  const isUrdu = language === 'ur';
  const { refreshPendingCounts } = useLayout();

  const [requests, setRequests] = useState<AdminPasswordResetItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED'
  >('ALL');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(highlightRequestId);

  // Reject Modal state
  const [rejectTarget, setRejectTarget] = useState<AdminPasswordResetItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchInFlightRef = useRef(false);

  const fetchResetRequests = useCallback(
    async (silent = false) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      if (!silent) setLoading(true);
      try {
        const query = roleFilter ? `?role=${roleFilter}` : '';
        const res = await fetch(`/api/admin/password-resets${query}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.requests)) {
          setRequests(data.requests);
        }
        if (typeof data.pendingCount === 'number') {
          setPendingCount(data.pendingCount);
        }
      } catch {
        // Ignore transient network errors during background poll
      } finally {
        fetchInFlightRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [roleFilter]
  );

  useEffect(() => {
    if (highlightRequestId) {
      setActiveHighlightId(highlightRequestId);
      setStatusFilter('ALL');
      const timer = setTimeout(() => {
        const el = document.getElementById(`admin-pwd-req-${highlightRequestId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
      const clearTimer = setTimeout(() => {
        setActiveHighlightId((curr) => (curr === highlightRequestId ? null : curr));
      }, 8000);
      return () => {
        clearTimeout(timer);
        clearTimeout(clearTimer);
      };
    }
  }, [highlightRequestId, requests.length]);

  useEffect(() => {
    void fetchResetRequests(false);

    const interval = setInterval(() => {
      void fetchResetRequests(true);
    }, 4000);

    const handleImmediateRefresh = () => {
      void fetchResetRequests(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchResetRequests(true);
      }
    };

    window.addEventListener('gk:refresh-password-reset-badge', handleImmediateRefresh);
    window.addEventListener('focus', handleImmediateRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gk:refresh-password-reset-badge', handleImmediateRefresh);
      window.removeEventListener('focus', handleImmediateRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchResetRequests]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  const handleApprove = async (reqItem: AdminPasswordResetItem) => {
    setActionError(null);
    setActionBusyId(reqItem.id);
    try {
      const res = await fetch(`/api/admin/password-resets/${reqItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to approve password reset request.');
        return;
      }
      showToast(
        data.message ||
          `Approved password reset for ${reqItem.userName} (${reqItem.userEmail}).`
      );
      await fetchResetRequests(true);
      void refreshPendingCounts();
    } catch {
      setActionError('Network error while approving password reset request.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    setActionError(null);
    setActionBusyId(rejectTarget.id);
    try {
      const res = await fetch(`/api/admin/password-resets/${rejectTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECT',
          rejectionReason: rejectionReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to reject password reset request.');
        return;
      }
      setRejectTarget(null);
      setRejectionReason('');
      showToast(
        data.message ||
          `Rejected password reset request for ${rejectTarget.userName}.`
      );
      await fetchResetRequests(true);
      void refreshPendingCounts();
    } catch {
      setActionError('Network error while rejecting password reset request.');
    } finally {
      setActionBusyId(null);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  const renderStatusBadge = (status: PasswordResetStatusType) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            <span>{isUrdu ? 'زیر التواء' : 'Pending'}</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>{isUrdu ? 'منظور شدہ' : 'Approved'}</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>{isUrdu ? 'مکمل شدہ' : 'Completed'}</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <XCircle className="w-3 h-3" />
            <span>{isUrdu ? 'مسترد شدہ' : 'Rejected'}</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <Clock className="w-3 h-3" />
            <span>{isUrdu ? 'میعاد ختم' : 'Expired'}</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      id="password-reset-requests"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
    >
      {/* Header Bar */}
      <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20 shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className={isUrdu ? 'text-right' : 'text-left'}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                {roleFilter === 'ADMIN'
                  ? isUrdu
                    ? 'ایڈمن پاس ورڈ ری سیٹ کی درخواستیں'
                    : 'Administrator Password Recovery Requests'
                  : t('password_reset_requests_title', isUrdu ? 'پاس ورڈ ری سیٹ کی درخواستیں' : 'Password Reset Requests')}
              </h2>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-950 animate-pulse">
                  {pendingCount} {isUrdu ? 'زیر التواء' : 'Pending'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isUrdu
                ? 'صرف مجاز ایڈمن اکاؤنٹس کے پاس ورڈ ری سیٹ درخواستوں کی منظوری یا مسترد کرنے کا محفوظ انتظام'
                : 'Authorized administrator recovery section (isolated from Employee and Operator request queues)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              { key: 'ALL', label: isUrdu ? 'تمام' : 'All' },
              { key: 'PENDING', label: isUrdu ? 'زیر التواء' : 'Pending' },
              { key: 'APPROVED', label: isUrdu ? 'منظور شدہ' : 'Approved' },
              { key: 'COMPLETED', label: isUrdu ? 'مکمل' : 'Completed' },
              { key: 'REJECTED', label: isUrdu ? 'مسترد' : 'Rejected' },
              { key: 'EXPIRED', label: isUrdu ? 'میعاد ختم' : 'Expired' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => void fetchResetRequests(false)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            title="Refresh Requests"
            aria-label="Refresh Requests"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackToast && (
        <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {actionError && (
        <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Requests Table */}
      <div className="overflow-x-auto">
        {loading && requests.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span>{isUrdu ? 'درخواستیں لوڈ ہو رہی ہیں...' : 'Loading password reset requests...'}</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            {isUrdu
              ? 'اس وقت کوئی پاس ورڈ ری سیٹ کی درخواست موجود نہیں ہے۔'
              : 'No password reset requests match the selected filter.'}
          </div>
        ) : (
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3">{isUrdu ? 'صارف کا نام' : 'User Name'}</th>
                <th className="px-4 py-3">{isUrdu ? 'رجسٹرڈ ای میل' : 'Registered Email'}</th>
                <th className="px-4 py-3">{isUrdu ? 'کردار' : 'User Role'}</th>
                <th className="px-4 py-3">{isUrdu ? 'درخواست کا وقت' : 'Request Date & Time'}</th>
                <th className="px-4 py-3">{isUrdu ? 'حیثیت' : 'Request Status'}</th>
                <th className="px-5 py-3 text-right">{isUrdu ? 'کارروائی' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredRequests.map((reqItem) => (
                <tr
                  key={reqItem.id}
                  id={`admin-pwd-req-${reqItem.id}`}
                  className={`transition-colors ${
                    activeHighlightId === reqItem.id
                      ? 'bg-blue-50/90 dark:bg-blue-950/60 ring-2 ring-inset ring-blue-500'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                    {reqItem.userName}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                    {reqItem.userEmail}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase">
                      {reqItem.userRole}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                    <div>{new Date(reqItem.createdAt).toLocaleDateString()}</div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(reqItem.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-1">
                      {renderStatusBadge(reqItem.status)}
                      {reqItem.status === 'APPROVED' && reqItem.expiresAt && (
                        <div className="text-[10px] text-slate-400">
                          Expires:{' '}
                          {new Date(reqItem.expiresAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                      {reqItem.status === 'REJECTED' && reqItem.rejectionReason && (
                        <div className="text-[10px] text-rose-500 max-w-[180px] truncate" title={reqItem.rejectionReason}>
                          Note: {reqItem.rejectionReason}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {reqItem.status === 'PENDING' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={actionBusyId === reqItem.id}
                          onClick={() => void handleApprove(reqItem)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isUrdu ? 'منظور کریں' : 'Approve'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === reqItem.id}
                          onClick={() => {
                            setRejectTarget(reqItem);
                            setRejectionReason('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{isUrdu ? 'مسترد کریں' : 'Reject'}</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">
                        {reqItem.reviewedByName
                          ? `Reviewed by ${reqItem.reviewedByName}`
                          : reqItem.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Confirmation Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-rose-50/70 dark:bg-rose-950/40 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <span>{isUrdu ? 'پاس ورڈ ری سیٹ کی درخواست مسترد کریں' : 'Reject Password Reset Request'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to reject the password reset request for{' '}
                <strong>{rejectTarget.userName}</strong> ({rejectTarget.userEmail})?
              </p>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Please verify identity with security desk first"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === rejectTarget.id}
                  onClick={() => void handleConfirmReject()}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-extrabold cursor-pointer"
                >
                  {actionBusyId === rejectTarget.id ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
