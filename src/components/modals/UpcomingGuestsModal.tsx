'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import {
  X,
  Users,
  Search,
  Calendar,
  Clock,
  CreditCard,
  Building2,
  Phone,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Check,
  UserCheck,
  FileText,
} from 'lucide-react';
import { playRegistrationSuccessSound, playSelectSound } from '@/utils/interactionSound';
import type { GuestInvitationRecord } from '@/app/api/employee/invitations/route';

interface UpcomingGuestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invitations: GuestInvitationRecord[];
  pendingCount: number;
  onRefresh: () => Promise<void> | void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCheckInSuccess: (visit: any) => void;
}

function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export default function UpcomingGuestsModal({
  isOpen,
  onClose,
  invitations,
  pendingCount,
  onRefresh,
  onCheckInSuccess,
}: UpcomingGuestsModalProps) {
  const { language, t } = useLanguage();
  const { currentGate, user } = useAuth();
  const isUrdu = language === 'ur';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvitation, setSelectedInvitation] = useState<GuestInvitationRecord | null>(null);
  const [vcCardNo, setVcCardNo] = useState('');
  const [cardCheckStatus, setCardCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'unavailable'
  >('idle');
  const [cardCheckMessage, setCardCheckMessage] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Live VC card availability check when operator types in Enter VC Card No.
  useEffect(() => {
    if (!isOpen || !selectedInvitation) return;
    const trimmed = vcCardNo.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!trimmed) {
        setCardCheckStatus('idle');
        setCardCheckMessage('');
        return;
      }
      setCardCheckStatus('checking');
      try {
        const res = await fetch(
          `/api/visits/card-availability?cardNo=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.available) {
            setCardCheckStatus('available');
            setCardCheckMessage(data.message || 'VC Card is available for check-in.');
          } else {
            setCardCheckStatus('unavailable');
            setCardCheckMessage(
              data.message || 'This VC Card is already assigned to an active visitor. Please enter another card.'
            );
          }
        }
      } catch {
        // Ignore aborted request
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [vcCardNo, isOpen, selectedInvitation]);

  if (!isOpen) return null;

  const normalizedQuery = normalizeSearchText(searchQuery);
  const queryTokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];

  const filtered = invitations.filter((inv) => {
    if (queryTokens.length === 0) return true;
    const searchableHaystack = [
      normalizeSearchText(inv.guestName),
      normalizeSearchText(inv.employeeName),
      normalizeSearchText(inv.departmentName),
      normalizeSearchText(inv.guestPhone),
      normalizeSearchText(inv.guestCnic),
      normalizeSearchText(inv.alongWith),
      normalizeSearchText(inv.visitorCardNo),
    ].join(' ');
    return queryTokens.every((token) => searchableHaystack.includes(token));
  });

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenConfirmCheckIn = (inv: GuestInvitationRecord) => {
    if (user?.role !== 'ADMIN') {
      playSelectSound();
    }
    setErrorBanner(null);
    setVcCardNo(inv.visitorCardNo || '');
    setCardCheckStatus('idle');
    setCardCheckMessage('');
    setVehicleNo('');
    setNotes('');
    setSelectedInvitation(inv);
  };

  const operatorAssignedGate =
    currentGate || (user?.role === 'OPERATOR' ? user?.gates?.[0] || null : null);
  const displayGateName =
    user?.role === 'ADMIN'
      ? currentGate?.name || 'All Gates'
      : operatorAssignedGate?.name || t('no_gate_assigned', 'No Gate Assigned');

  const handleCompleteCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvitation) return;
    setErrorBanner(null);

    if (user?.role === 'OPERATOR' && !operatorAssignedGate) {
      setErrorBanner(
        t(
          'no_gate_assigned_desc',
          'No gate is assigned to your Operator account. Please contact an Administrator to assign a gate before checking in visitors.'
        )
      );
      return;
    }

    const trimmedCard = vcCardNo.trim();
    if (!trimmedCard) {
      setErrorBanner('Please enter a VC Card Number before checking in this guest.');
      return;
    }

    if (cardCheckStatus === 'unavailable') {
      setErrorBanner(
        cardCheckMessage ||
          'This VC Card Number is already assigned to an active visitor. Please enter an available card.'
      );
      return;
    }

    setSubmittingId(selectedInvitation.id);

    try {
      const res = await fetch(`/api/invitations/${selectedInvitation.id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryGateId:
            user?.role === 'OPERATOR'
              ? operatorAssignedGate?.id
              : currentGate?.id || undefined,
          visitorCardNo: trimmedCard,
          vehicleNo: vehicleNo.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(
          data.error || 'Could not complete check-in. Please verify the VC Card Number and try again.'
        );
        await onRefresh();
        if (res.status === 409 && data.code === 'INVITATION_ALREADY_CHECKED_IN') {
          setSelectedInvitation(null);
        } else if (res.status === 409 && data.code === 'CARD_ALREADY_ASSIGNED') {
          setCardCheckStatus('unavailable');
          setCardCheckMessage(data.error || 'This VC Card is already assigned to another visitor.');
        }
        return;
      }

      playRegistrationSuccessSound();
      setSelectedInvitation(null);
      setVcCardNo('');
      await onRefresh();
      onCheckInSuccess(data.visit);
    } catch {
      setErrorBanner('Network error while checking in invited guest. Please try again.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-indigo-700 via-blue-600 to-blue-700 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div className={`min-w-0 ${isUrdu ? 'text-right' : 'text-left'}`}>
              <div className={`flex flex-wrap items-center gap-2 ${isUrdu ? 'justify-end' : 'justify-start'}`}>
                <h2 className="text-base sm:text-xl font-extrabold tracking-tight truncate">
                  {t('upcoming_guests_title', 'Guest List')}
                </h2>
                <span className="min-w-[24px] h-6 px-2 rounded-full text-xs font-black bg-amber-400 text-slate-950 inline-flex items-center justify-center shadow-2xs shrink-0">
                  {pendingCount}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-blue-100 mt-0.5 line-clamp-2 sm:line-clamp-1">
                {t(
                  'upcoming_guests_subtitle',
                  'Select an invited guest and assign a VC Card No. to complete check-in'
                )}{' '}
                &bull; {t('active_gate', 'Active Gate')}:{' '}
                <strong>{displayGateName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Alert Bar (Shown when browsing list) */}
        {!selectedInvitation && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  'special_guest_search_placeholder',
                  'Search by guest name or inviting employee...'
                )}
                className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Showing <strong>{filtered.length}</strong> of <strong>{invitations.length}</strong>{' '}
              pending guest{invitations.length === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {errorBanner && (
          <div className="mx-4 mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-rose-600 hover:underline text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Body: Step 2/3/4 Guest Details Popup OR Step 1 Shared Pending Invitations List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {selectedInvitation ? (
            <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-5 sm:p-6 space-y-5">
              {/* Guest Details Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                    {selectedInvitation.guestPhotoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={selectedInvitation.guestPhotoUrl}
                        alt={selectedInvitation.guestName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShieldCheck className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">
                        {selectedInvitation.guestName}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                        {selectedInvitation.status === 'PENDING'
                          ? 'PENDING CHECK-IN'
                          : selectedInvitation.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {t('confirm_guest_checkin_title', 'Guest Details & Card Assignment')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setErrorBanner(null);
                    setSelectedInvitation(null);
                  }}
                  className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer shrink-0"
                >
                  &larr; {t('back_btn', 'Back')}
                </button>
              </div>

              {/* Step 2: Selected Guest's Invitation Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{t('emp_guest_name', 'Guest Name')} &amp; {t('emp_phone', 'Phone Number')}</span>
                  </span>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {selectedInvitation.guestName}
                  </p>
                  <p className="font-mono font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {selectedInvitation.guestPhone}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">{t('emp_guest_cnic', 'CNIC')}</span>
                  </span>
                  {selectedInvitation.guestCnic ? (
                    <p className="text-sm font-mono font-bold text-slate-900 dark:text-white truncate">
                      {selectedInvitation.guestCnic}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-400 dark:text-slate-500">
                      {t('not_provided_optional', 'Not provided')}
                    </p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate">{t('inviting_employee_label', 'Inviting Employee')}</span>
                  </span>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {selectedInvitation.employeeName}
                  </p>
                  <p className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 min-w-0">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{selectedInvitation.departmentName}</span>
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">{t('emp_visit_date', 'Visit Date')} &amp; {t('estimated_arrival_slot', 'Arrival Time')}</span>
                  </span>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {selectedInvitation.visitDate}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">{selectedInvitation.expectedArrivalTime}</span>
                  </p>
                </div>

                {selectedInvitation.alongWith && (
                  <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{t('along_with_label', 'Along With')}</span>
                    </span>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {selectedInvitation.alongWith}
                    </p>
                  </div>
                )}
              </div>

              {/* Step 3 & Step 4: Prominent VC Card No. Input + Check-In Form */}
              <form onSubmit={handleCompleteCheckIn} className="space-y-4 pt-1">
                <div className="gk-vc-card-wave rounded-2xl border-2 border-blue-500 dark:border-blue-400 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 dark:from-blue-950/50 dark:via-indigo-950/40 dark:to-blue-950/50 p-4 sm:p-5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="special-guest-vc-card-input"
                      className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-200 flex items-center gap-2 min-w-0"
                    >
                      <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="truncate">{t('enter_vc_card_no', 'VC Card No.')} *</span>
                    </label>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
                      {t('photo_required_badge', 'Required')}
                    </span>
                  </div>

                  <div className="relative">
                    <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="special-guest-vc-card-input"
                      type="text"
                      required
                      autoFocus
                      value={vcCardNo}
                      onChange={(e) => setVcCardNo(e.target.value.toUpperCase())}
                      placeholder="e.g. VC-101 or 05"
                      className={`w-full pl-11 pr-4 py-3 rounded-xl border-2 text-base font-mono font-extrabold tracking-wide focus:outline-none focus:ring-2 transition-all ${
                        cardCheckStatus === 'unavailable'
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 focus:ring-rose-500'
                          : cardCheckStatus === 'available'
                          ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 focus:ring-emerald-500'
                          : 'border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-blue-500'
                      }`}
                    />
                  </div>

                  {cardCheckStatus !== 'idle' ? (
                    <p
                      className={`text-xs font-bold flex items-center gap-1.5 ${
                        cardCheckStatus === 'available'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : cardCheckStatus === 'unavailable'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {cardCheckStatus === 'checking' && 'Checking VC Card availability...'}
                      {cardCheckStatus === 'available' && (
                        <>
                          <Check className="w-4 h-4 shrink-0" />
                          <span>{cardCheckMessage}</span>
                        </>
                      )}
                      {cardCheckStatus === 'unavailable' && (
                        <>
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{cardCheckMessage}</span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 font-medium">
                      Assign an available physical Visitor Card (VC) to this guest for entry at{' '}
                      <strong>{displayGateName}</strong>.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Number
                    </label>
                    <input
                      type="text"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                      placeholder="e.g. LEA-1234"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Gate Notes
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Check-in remark"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorBanner(null);
                      setSelectedInvitation(null);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      submittingId === selectedInvitation.id ||
                      !vcCardNo.trim() ||
                      cardCheckStatus === 'unavailable' ||
                      (user?.role === 'OPERATOR' && !operatorAssignedGate)
                    }
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {submittingId === selectedInvitation.id
                        ? 'Checking In Guest...'
                        : vcCardNo.trim()
                        ? `Check In Guest (${vcCardNo.trim()})`
                        : 'Check In Guest'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3 text-slate-400">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Users className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {searchQuery.trim()
                  ? `No invited guests match "${searchQuery.trim()}".`
                  : t('upcoming_guests_empty', 'No pending guest invitations right now.')}
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {searchQuery.trim()
                  ? 'Try searching by a partial guest name or inviting employee name.'
                  : 'When any employee invites a guest from the Employee Portal (/employee), the guest will appear here automatically for all gate operators.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => handleOpenConfirmCheckIn(inv)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenConfirmCheckIn(inv);
                    }
                  }}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer text-left min-w-0"
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0">
                        {inv.guestPhotoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={inv.guestPhotoUrl}
                            alt={inv.guestName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                            {inv.guestName}
                          </h3>
                        </div>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                          <Phone className="w-3 h-3 shrink-0" />
                          <span className="truncate">{inv.guestPhone}</span>
                          {inv.guestCnic && <span className="truncate">&bull; {inv.guestCnic}</span>}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 shrink-0">
                      PENDING
                    </span>
                  </div>

                  {/* Inviting Employee, Department, Visit Date & Arrival Time */}
                  <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs min-w-0">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 min-w-0">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{t('inviting_employee_label', 'Inviting Employee')}</span>
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                        {inv.employeeName}
                      </p>
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold truncate">
                        {inv.departmentName}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 min-w-0">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span className="truncate">{t('estimated_arrival_slot', 'Arrival Time')}</span>
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                        {inv.visitDate}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 min-w-0">
                        <Clock className="w-3 h-3 shrink-0 text-amber-500" />
                        <span className="truncate">{inv.expectedArrivalTime}</span>
                      </p>
                    </div>
                    {inv.alongWith && (
                      <div className="col-span-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {t('along_with_label', 'Along With')}:{' '}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {inv.alongWith}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold shadow-xs flex items-center justify-center gap-2 transition-all">
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {t('verify_and_checkin_btn', 'Select & Assign Card')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
