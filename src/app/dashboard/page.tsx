'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useLayout } from '@/context/LayoutContext';
import {
  Users,
  UserCheck,
  UserCog,
  Building2,
  CheckCircle2,
  Briefcase,
  Award,
  DoorOpen,
  DoorClosed,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  UserPlus,
  Search,
  Calendar,
  ChevronRight,
  TrendingUp,
  Truck,
  Sparkles,
  X,
  Package,
  Crown,
  Plus,
} from 'lucide-react';
import {
  IconRegisterVisitor,
  IconCheckoutVisitor,
  IconCheckStatus,
  IconAddVendor,
  IconCurrentlyInside,
} from '@/components/icons/OperatorTaskIcons';
import CheckInModal from '@/components/modals/CheckInModal';
import CheckOutModal from '@/components/modals/CheckOutModal';
import CheckStatusModal from '@/components/modals/CheckStatusModal';
import VisitorBadgeModal from '@/components/modals/VisitorBadgeModal';
import RegistrationSuccessModal from '@/components/modals/RegistrationSuccessModal';
import CategoryRecordsModal, { CategoryModalConfig } from '@/components/modals/CategoryRecordsModal';
import UpcomingGuestsModal from '@/components/modals/UpcomingGuestsModal';
import ParcelManagementView from '@/components/parcels/ParcelManagementView';
import VipGuestManagementView from '@/components/vip/VipGuestManagementView';
import GatekeeperLoader from '@/components/ui/GatekeeperLoader';
import { playSelectSound } from '@/utils/interactionSound';
import type { GuestInvitationRecord } from '@/app/api/employee/invitations/route';

export default function DashboardPage() {
  const router = useRouter();
  const { user, currentGate } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { t, language } = useLanguage();
  const { pendingEmployeeCount, pendingOperatorCount } = useLayout();

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Live time and date ticker for operator gate hero
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString(language === 'ur' ? 'ur-PK' : 'en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [language]);

  // Shared Modals state
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [checkInCategory, setCheckInCategory] = useState('VISITOR');
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [selectedCheckoutVisit, setSelectedCheckoutVisit] = useState<any>(null);
  const [isCheckStatusOpen, setIsCheckStatusOpen] = useState(false);
  const [selectedPersonForDetails, setSelectedPersonForDetails] = useState<any>(null);
  const [selectedVisitBadge, setSelectedVisitBadge] = useState<any>(null);
  const [badgeAutoPrint, setBadgeAutoPrint] = useState(false);
  const [specialGuestSuccessVisit, setSpecialGuestSuccessVisit] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Shared Upcoming Guests state (visible to all Gate Operators & Admins regardless of gate)
  const [isUpcomingGuestsOpen, setIsUpcomingGuestsOpen] = useState(false);
  const [upcomingInvitations, setUpcomingInvitations] = useState<GuestInvitationRecord[]>([]);
  const [upcomingPendingCount, setUpcomingPendingCount] = useState(0);
  const [newInvitationToast, setNewInvitationToast] = useState<GuestInvitationRecord | null>(null);
  const knownInvitationIdsRef = useRef<Set<string>>(new Set());
  const initialInvitationsLoadedRef = useRef(false);
  const upcomingReqInFlightRef = useRef(false);

  // Parcel Tracker & VIP Guest Modal states & live counts
  const [isParcelTrackerOpen, setIsParcelTrackerOpen] = useState(false);
  const [expectedParcelCount, setExpectedParcelCount] = useState(0);
  const [receivedParcelCount, setReceivedParcelCount] = useState(0);
  const [isVipGuestsOpen, setIsVipGuestsOpen] = useState(false);
  const [isInviteVipFormOpen, setIsInviteVipFormOpen] = useState(false);
  const [vipSavedToast, setVipSavedToast] = useState<string | null>(null);
  const [upcomingVipCount, setUpcomingVipCount] = useState(0);

  // Operator-only Category Records Modal state
  const [categoryModalConfig, setCategoryModalConfig] = useState<CategoryModalConfig | null>(null);

  const openPersonDetails = (visit: any) => {
    if (!visit?.person) return;
    setSelectedPersonForDetails({
      person: visit.person,
      isCurrentlyInside: visit.status === 'CHECKED_IN',
      activeVisit: visit.status === 'CHECKED_IN' ? visit : null,
      totalVisits: 1,
    });
    setIsCheckStatusOpen(true);
  };

  const fetchUpcomingInvitations = useCallback(async () => {
    if (upcomingReqInFlightRef.current) return;
    upcomingReqInFlightRef.current = true;
    try {
      const [res, prcRes, vipRes] = await Promise.all([
        fetch('/api/invitations/upcoming', { cache: 'no-store' }),
        fetch('/api/parcels', { cache: 'no-store' }),
        fetch('/api/vip-guests', { cache: 'no-store' }),
      ]);
      if (res.ok) {
        const data = await res.json();
        const incoming: GuestInvitationRecord[] = Array.isArray(data.invitations)
          ? data.invitations
          : [];
        if (!initialInvitationsLoadedRef.current) {
          incoming.forEach((inv) => knownInvitationIdsRef.current.add(inv.id));
          initialInvitationsLoadedRef.current = true;
        } else {
          const newlyCreated = incoming.find((inv) => !knownInvitationIdsRef.current.has(inv.id));
          incoming.forEach((inv) => knownInvitationIdsRef.current.add(inv.id));
          if (newlyCreated) {
            setNewInvitationToast(newlyCreated);
          }
        }
        setUpcomingInvitations(incoming);
        setUpcomingPendingCount(
          typeof data.pendingCount === 'number' ? data.pendingCount : incoming.length
        );
      }
      if (prcRes.ok) {
        const prcData = await prcRes.json();
        setExpectedParcelCount(prcData?.counts?.expectedCount ?? 0);
        setReceivedParcelCount(prcData?.counts?.receivedCount ?? 0);
      }
      if (vipRes.ok) {
        const vipData = await vipRes.json();
        setUpcomingVipCount(vipData?.counts?.upcomingCount ?? 0);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      upcomingReqInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchUpcomingInvitations();
    const interval = setInterval(fetchUpcomingInvitations, 5000);
    return () => clearInterval(interval);
  }, [fetchUpcomingInvitations]);

  const fetchStats = useCallback(async () => {
    try {
      const gateParam = currentGate ? `?gateId=${currentGate.id}` : '';
      const res = await fetch(`/api/dashboard/stats${gateParam}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (e) {
      console.error('Error fetching dashboard stats:', e);
    } finally {
      setLoading(false);
    }
  }, [currentGate]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [fetchStats]);

  const openCheckIn = (category: string = 'VISITOR') => {
    if (!isAdmin) {
      playSelectSound();
    }
    setCheckInCategory(category);
    setIsCheckInOpen(true);
  };

  return (
    <AppLayout onRefreshData={fetchStats}>
      {loading && !stats ? (
        <GatekeeperLoader
          variant="section"
          title={t('loading_dashboard', 'Loading dashboard...')}
        />
      ) : isAdmin ? (
        /* ========================================================================= */
        /*                          ORIGINAL ADMIN DASHBOARD                         */
        /* (Retains exact original layout, typography, cards, tables, buttons & responsive behavior) */
        /* ========================================================================= */
        <div className="space-y-6">
          {vipSavedToast && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span dir="auto">{vipSavedToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setVipSavedToast(null)}
                className="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Welcome & Quick Action Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 sm:gap-6">
            <div className={`space-y-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-200 bg-white/10 px-2.5 py-0.5 rounded-full inline-block mb-1">
                {t('active_gate', 'Active Gate')}: {currentGate?.name || t('all_gates', 'All Gates')}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {t('gate_control_dashboard', 'Gate Control Dashboard')}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100 max-w-xl">
                {t(
                  'gate_control_subtitle',
                  'Live visitor tracking, instant CNIC & Driving License OCR check-in, and security access logs.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2.5 w-full xl:w-auto">
              {/* 1. Employee Requests */}
              <button
                type="button"
                onClick={() => router.push('/employees?tab=requests')}
                className="w-full sm:w-auto sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm text-xs font-bold transition-all border border-white/20 cursor-pointer min-h-[42px] whitespace-nowrap"
              >
                <UserCheck className="w-4 h-4 text-blue-200 shrink-0" />
                <span>{t('admin_qa_employee_requests', 'Employee Requests')}</span>
                {pendingEmployeeCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950">
                    {pendingEmployeeCount}
                  </span>
                )}
              </button>

              {/* 2. Operator Requests */}
              <button
                type="button"
                onClick={() => router.push('/access?tab=requests')}
                className="w-full sm:w-auto sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm text-xs font-bold transition-all border border-white/20 cursor-pointer min-h-[42px] whitespace-nowrap"
              >
                <UserCog className="w-4 h-4 text-blue-200 shrink-0" />
                <span>{t('admin_qa_operator_requests', 'Operator Requests')}</span>
                {pendingOperatorCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950">
                    {pendingOperatorCount}
                  </span>
                )}
              </button>

              {/* 3. Invite VIP Guest */}
              <button
                type="button"
                onClick={() => setIsInviteVipFormOpen(true)}
                className="col-span-2 sm:col-span-1 w-full sm:w-auto sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer min-h-[42px] whitespace-nowrap"
              >
                <Crown className="w-4 h-4 shrink-0" />
                <span>{t('admin_qa_invite_vip', 'Invite VIP Guest')}</span>
              </button>
            </div>
          </div>

          {/* Original Admin KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Total Today */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t('total_visitors_today', 'Total Visitors Today')}
                </span>
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {stats?.totalToday || 0}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> {t('live_indicator', 'Live')}
                </span>
              </div>
            </div>

            {/* 2. Currently Inside (Smooth scrolls to currently inside table as originally built) */}
            <div
              onClick={() => {
                const el = document.getElementById('currently-inside-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-800 transition-all group"
              title="Click to view visitors currently inside"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {t('currently_inside', 'Currently Inside')}
                </span>
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <DoorOpen className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {stats?.currentlyInside || 0}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {t('active_on_site', 'Active on site')}
                </span>
              </div>
            </div>

            {/* 3. Check-outs */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t('total_checkouts', 'Total Check-Outs')}
                </span>
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  <DoorClosed className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {stats?.totalCheckOutsToday || 0}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {t('exited_premises', 'Exited premises')}
                </span>
              </div>
            </div>

            {/* 4. Overstay Alert */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t('overstay_alerts', 'Overstay Alerts (>8h)')}
                </span>
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {stats?.overstayCount || 0}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {t('flagged_badges', 'Flagged badges')}
                </span>
              </div>
            </div>
          </div>

          {/* Secondary Category Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">
                  {t('vendors', 'Vendors')}
                </span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {stats?.vendorsToday || 0}
                </span>
              </div>
              <Briefcase className="w-4 h-4 text-slate-400" />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">
                  {t('interviews', 'Interviews')}
                </span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {stats?.interviewsToday || 0}
                </span>
              </div>
              <UserCheck className="w-4 h-4 text-slate-400" />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">
                  {t('special_guests', 'Special Guests')}
                </span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {stats?.specialGuestsToday || 0}
                </span>
              </div>
              <Award className="w-4 h-4 text-slate-400" />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">
                  {t('deliveries', 'Deliveries')}
                </span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {stats?.deliveriesToday || 0}
                </span>
              </div>
              <DoorClosed className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Main Content Grid: Currently Inside Table + Recent Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Currently Inside (Full width on tablet, 2 cols on xl) */}
            <div
              id="currently-inside-section"
              className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs min-w-0"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                    {t('currently_inside_facility', 'Currently Inside Facility')} ({stats?.activeVisitors?.length || 0})
                  </h2>
                </div>
                <span className="text-xs text-slate-400">
                  {t('real_time_occupancy', 'Real-time occupancy')}
                </span>
              </div>

              <div className="overflow-x-auto">
                {stats?.activeVisitors && stats.activeVisitors.length > 0 ? (
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-3">{t('visitor', 'Visitor')}</th>
                        <th className="px-4 py-3">{t('category', 'Category')}</th>
                        <th className="px-4 py-3">{t('host_and_dept', 'Host & Dept')}</th>
                        <th className="px-4 py-3">{t('card_badge', 'Card / Badge')}</th>
                        <th className="px-4 py-3">{t('entry_time', 'Entry Time')}</th>
                        <th className="px-4 py-3 text-right">{t('actions', 'Action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {stats.activeVisitors.map((visit: any) => (
                        <tr
                          key={visit.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                                {visit.person?.photoUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={visit.person.photoUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Users className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {visit.person?.fullName}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {visit.person?.cnicNumber || visit.person?.phoneNumber || 'N/A'}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              {visit.person?.category || 'VISITOR'}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 dark:text-slate-200">
                              {visit.hostName}
                            </p>
                            <p className="text-[10px] text-slate-400">{visit.department}</p>
                          </td>

                          <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {visit.visitorCardNo || 'N/A'}
                          </td>

                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {new Date(visit.checkInTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedVisitBadge(visit)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                                title="Print / View Visitor Badge"
                              >
                                {t('view_pass', 'View Pass')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCheckoutVisit(visit);
                                  setIsCheckOutOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                              >
                                {t('checkout_btn', 'Check Out')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    {t('no_visitors_inside', 'No visitors currently inside the facility.')}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity (1 col) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t('recent_activity', 'Recent Activity')}
                </h2>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>

              <div className="space-y-3">
                {stats?.recentVisits && stats.recentVisits.length > 0 ? (
                  stats.recentVisits.slice(0, 7).map((v: any) => (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {v.person?.fullName}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            v.status === 'CHECKED_IN'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {v.status === 'CHECKED_IN'
                            ? t('check_in_badge', 'CHECK-IN')
                            : t('check_out_badge', 'CHECK-OUT')}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('visiting_host', 'Visiting')} {v.hostName} ({v.department}) •{' '}
                        {t('gate_label', 'Gate')}: {v.entryGate?.name || 'Main Gate'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span>
                          {t('card_label', 'Card')}: {v.visitorCardNo || 'N/A'}
                        </span>
                        <span>
                          {new Date(v.checkInTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    {t('no_activity_today', 'No activity recorded today yet.')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /*                     REDESIGNED OPERATOR DASHBOARD (Point 2)              */
        /* (Task icons, Urdu/English labels, visual tiles, category records modal)  */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Real-Time New Guest Invitation Notification Banner for All Operators */}
          {newInvitationToast && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in-0 slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div className={language === 'ur' ? 'text-right' : 'text-left'}>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-blue-100">
                    {t('new_guest_invitation_alert', 'New Special Guest Invitation Received!')}
                  </p>
                  <p className="text-sm font-bold mt-0.5">
                    {newInvitationToast.guestName} &bull; {newInvitationToast.expectedArrivalTime} &bull; Host: {newInvitationToast.employeeName} ({newInvitationToast.departmentName})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    playSelectSound();
                    setNewInvitationToast(null);
                    setIsUpcomingGuestsOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  <span>{t('guest_option_title', 'Guest')}</span>
                  {upcomingPendingCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-950/15 text-slate-950 text-[11px] font-black">
                      {upcomingPendingCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setNewInvitationToast(null)}
                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Unassigned Gate Warning Banner for Operators with no assigned gate */}
          {!currentGate && (!user?.gates || user.gates.length === 0) && (
            <div className="p-4 rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className={language === 'ur' ? 'text-right flex-1' : 'text-left flex-1'}>
                <p className="text-xs sm:text-sm font-extrabold">
                  {t('no_gate_assigned', 'No Gate Assigned')}
                </p>
                <p className="text-xs font-medium mt-0.5 text-amber-800 dark:text-amber-300">
                  {t(
                    'no_gate_assigned_desc',
                    'No gate is assigned to your Operator account. Please contact an Administrator to assign a gate before checking in visitors.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Gate Control Hero Section */}
          <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-5 sm:p-7 text-white shadow-xl shadow-blue-500/10 flex flex-col gap-4">
            <div className={`space-y-1.5 w-full ${language === 'ur' ? 'text-right' : 'text-left'}`}>
              <div className={`flex flex-wrap items-center gap-2 ${language === 'ur' ? 'justify-end' : 'justify-start'}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-200 bg-white/10 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentGate || (user?.gates && user.gates.length > 0)
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-amber-400'
                    }`}
                  />
                  {t('active_gate')}:{' '}
                  {currentGate?.name ||
                    user?.gates?.[0]?.name ||
                    t('no_gate_assigned', 'No Gate Assigned')}
                </span>
                {(currentGate?.type || user?.gates?.[0]?.type) && (
                  <span className="text-[11px] font-mono font-bold text-blue-200 bg-white/10 px-2 py-0.5 rounded-md">
                    {currentGate?.type || user?.gates?.[0]?.type}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
                {t('gate_control_dashboard')}
              </h1>
              <p className={`text-xs sm:text-sm text-blue-100 max-w-xl ${language === 'ur' ? 'ml-auto' : ''}`}>
                {t('gate_control_subtitle')}
              </p>
            </div>

            {/* Live Clock & Date Badge — Left-aligned in English, Right-aligned in Urdu */}
            <div
              className={`w-full flex flex-wrap items-center gap-2.5 sm:gap-3 ${
                language === 'ur' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                dir="ltr"
                className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 sm:px-4 py-2 rounded-xl border border-white/15 shadow-xs"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
                </div>
                <div className="text-left">
                  <p className="font-mono text-sm sm:text-base font-extrabold tracking-wider text-white leading-tight">
                    {currentTime || '--:--:--'}
                  </p>
                  <p className="text-[11px] font-medium text-blue-200 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>{currentDate || '...'}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Dashboard Action Area - 6 Visual Task Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* 1. Register Visitor (includes Parcel option for Unexpected Parcels) */}
            <button
              type="button"
              disabled={!currentGate && (!user?.gates || user.gates.length === 0)}
              onClick={() => openCheckIn('VISITOR')}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/20 border-2 border-emerald-500/30 hover:border-emerald-500 dark:border-emerald-800 dark:hover:border-emerald-500 shadow-sm hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-200 text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-3 min-h-[150px] sm:min-h-[170px]"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
                <IconRegisterVisitor className="w-10 h-10 sm:w-11 sm:h-11 text-white" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {t('register_visitor')}
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {t('register_visitor_desc')}
                </p>
              </div>
            </button>

            {/* 2. Check Out Visitor */}
            <button
              type="button"
              onClick={() => {
                setSelectedCheckoutVisit(null);
                setIsCheckOutOpen(true);
              }}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 dark:from-amber-950/40 dark:via-slate-900 dark:to-amber-950/20 border-2 border-amber-500/30 hover:border-amber-500 dark:border-amber-800 dark:hover:border-amber-500 shadow-sm hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[150px] sm:min-h-[170px]"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30 shrink-0">
                <IconCheckoutVisitor className="w-10 h-10 sm:w-11 sm:h-11 text-white" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {t('checkout_visitor')}
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {t('checkout_visitor_desc')}
                </p>
              </div>
            </button>

            {/* 3. Check Status */}
            <button
              type="button"
              onClick={() => setIsCheckStatusOpen(true)}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-white to-blue-500/5 dark:from-blue-950/40 dark:via-slate-900 dark:to-blue-950/20 border-2 border-blue-500/30 hover:border-blue-500 dark:border-blue-800 dark:hover:border-blue-500 shadow-sm hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[150px] sm:min-h-[170px]"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0">
                <IconCheckStatus className="w-10 h-10 sm:w-11 sm:h-11 text-white" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {t('check_status')}
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {t('check_status_desc')}
                </p>
              </div>
            </button>

            {/* 4. Guest (Renamed from Special Guest — Invited Guests Check-In Workflow) */}
            <button
              type="button"
              onClick={() => {
                playSelectSound();
                setIsUpcomingGuestsOpen(true);
              }}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-white to-indigo-500/5 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/20 border-2 border-indigo-500/30 hover:border-indigo-500 dark:border-indigo-800 dark:hover:border-indigo-500 shadow-sm hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[150px] sm:min-h-[170px]"
            >
              {upcomingPendingCount > 0 && (
                <span
                  aria-label={`${upcomingPendingCount} pending guests`}
                  className="gs-special-guest-badge absolute top-2.5 right-2.5 sm:top-3 sm:right-3 min-w-[28px] h-7 px-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black tracking-tight flex items-center justify-center gap-1 shadow-md shadow-amber-500/25 ring-2 ring-white dark:ring-slate-900 z-10"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shrink-0" />
                  <span>{upcomingPendingCount}</span>
                </span>
              )}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/30 shrink-0">
                <IconAddVendor className="w-10 h-10 sm:w-11 sm:h-11 text-white" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {t('guest_option_title', 'Guest')}
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {t('guest_option_desc', 'Invited Guests Check-In')}
                </p>
              </div>
            </button>

            {/* 5. Parcel Tracker (Expected & Received Parcels Workflow) */}
            <button
              type="button"
              onClick={() => {
                playSelectSound();
                setIsParcelTrackerOpen(true);
              }}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-orange-500/10 via-white to-orange-500/5 dark:from-orange-950/40 dark:via-slate-900 dark:to-orange-950/20 border-2 border-orange-500/30 hover:border-orange-500 dark:border-orange-800 dark:hover:border-orange-500 shadow-sm hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[150px] sm:min-h-[170px]"
            >
              {(expectedParcelCount > 0 || receivedParcelCount > 0) && (
                <span
                  aria-label={`${expectedParcelCount} expected parcels`}
                  className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 min-w-[28px] h-7 px-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-black tracking-tight flex items-center justify-center gap-1 shadow-md shadow-orange-500/25 ring-2 ring-white dark:ring-slate-900 z-10"
                >
                  <span>{expectedParcelCount || receivedParcelCount}</span>
                </span>
              )}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/30 shrink-0">
                <Package className="w-8 h-8 sm:w-9 sm:h-9 text-white" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {t('parcel_tracker_title', 'Parcel Tracker')}
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {t('parcel_tracker_desc', 'Expected, Received & Delivered Parcels')}
                </p>
              </div>
            </button>

            {/* 6. VIP Guest (Admin-Created VIP Fast Gate Check-In/Out) */}
            <button
              type="button"
              onClick={() => {
                playSelectSound();
                setIsVipGuestsOpen(true);
              }}
              className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 via-white to-purple-500/5 dark:from-purple-950/40 dark:via-slate-900 dark:to-purple-950/20 border-2 border-purple-500/30 hover:border-purple-500 dark:border-purple-800 dark:hover:border-purple-500 shadow-sm hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[150px] sm:min-h-[170px]"
            >
              {upcomingVipCount > 0 && (
                <span
                  aria-label={`${upcomingVipCount} upcoming VIP guests`}
                  className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 min-w-[28px] h-7 px-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-black tracking-tight flex items-center justify-center gap-1 shadow-md shadow-purple-500/25 ring-2 ring-white dark:ring-slate-900 z-10"
                >
                  <span>{upcomingVipCount}</span>
                </span>
              )}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/30 shrink-0">
                <Crown className="w-8 h-8 sm:w-9 sm:h-9 text-white" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                  {t('vip_guest_title', 'VIP Guest')}
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {t('vip_guest_desc', 'VIP Name & Vehicle Fast Check-In')}
                </p>
              </div>
            </button>
          </div>

          {/* Operator KPI Grid (Two Columns on Mobile, Four on Desktop) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Total Today */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'ALL',
                  titleKey: 'total_visitors_today',
                  defaultTitle: 'Total Visitors Today',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center text-center group min-h-[150px] sm:min-h-[165px]"
              title="Click to view all visitor records today"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5 shrink-0">
                <Users className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                {t('total_visitors_today')}
              </span>
              <span className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.totalToday || 0}
              </span>
              <span className="mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> {t('live_indicator')}
              </span>
            </button>

            {/* 2. Currently Inside */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'ALL',
                  status: 'CHECKED_IN',
                  titleKey: 'currently_inside',
                  defaultTitle: 'Currently Inside',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center text-center group min-h-[150px] sm:min-h-[165px]"
              title="Click to view all visitors currently inside"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5 shrink-0">
                <DoorOpen className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
                {t('currently_inside')}
              </span>
              <span className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.currentlyInside || 0}
              </span>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {t('active_on_site')}
              </span>
            </button>

            {/* 3. Check-outs */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'ALL',
                  status: 'CHECKED_OUT',
                  titleKey: 'total_checkouts',
                  defaultTitle: 'Total Check-Outs',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center text-center group min-h-[150px] sm:min-h-[165px]"
              title="Click to view checked-out visitors"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mb-2.5 shrink-0">
                <DoorClosed className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors leading-snug">
                {t('total_checkouts')}
              </span>
              <span className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.totalCheckOutsToday || 0}
              </span>
              <span className="mt-1.5 text-[11px] font-semibold text-slate-400">
                {t('exited_premises')}
              </span>
            </button>

            {/* 4. Overstay Alert */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'ALL',
                  status: 'OVERSTAY',
                  titleKey: 'overstay_alerts',
                  defaultTitle: 'Overstay Alerts',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-rose-400 dark:hover:border-rose-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center text-center group min-h-[150px] sm:min-h-[165px]"
              title="Click to view overstay visitors"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-2.5 shrink-0">
                <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors leading-snug">
                {t('overstay_alerts')}
              </span>
              <span className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.overstayCount || 0}
              </span>
              <span className="mt-1.5 text-[11px] font-semibold text-slate-400">
                {t('flagged_badges')}
              </span>
            </button>
          </div>

          {/* Secondary Category Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* Vendors */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'VENDOR',
                  titleKey: 'vendors',
                  defaultTitle: 'Vendors',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-400 dark:hover:border-purple-600 hover:shadow-sm flex flex-col items-center justify-center text-center shadow-2xs cursor-pointer group transition-all min-h-[130px] sm:min-h-[140px]"
              title="Click to view vendors"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2 shrink-0">
                <Briefcase className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors leading-snug">
                {t('vendors')}
              </span>
              <span className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.vendorsToday || 0}
              </span>
            </button>

            {/* Interviews */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'INTERVIEW',
                  titleKey: 'interviews',
                  defaultTitle: 'Interviews',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm flex flex-col items-center justify-center text-center shadow-2xs cursor-pointer group transition-all min-h-[130px] sm:min-h-[140px]"
              title="Click to view interviews"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 shrink-0">
                <UserCheck className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                {t('interviews')}
              </span>
              <span className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.interviewsToday || 0}
              </span>
            </button>

            {/* Special Guests */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'SPECIAL_GUEST',
                  titleKey: 'special_guests',
                  defaultTitle: 'Special Guests',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-sm flex flex-col items-center justify-center text-center shadow-2xs cursor-pointer group transition-all min-h-[130px] sm:min-h-[140px]"
              title="Click to view special guests"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 shrink-0">
                <Award className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug">
                {t('special_guests')}
              </span>
              <span className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.specialGuestsToday || 0}
              </span>
            </button>

            {/* Deliveries */}
            <button
              type="button"
              onClick={() =>
                setCategoryModalConfig({
                  isOpen: true,
                  category: 'DELIVERY',
                  titleKey: 'deliveries',
                  defaultTitle: 'Deliveries',
                  gateId: currentGate?.id,
                })
              }
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-sm flex flex-col items-center justify-center text-center shadow-2xs cursor-pointer group transition-all min-h-[130px] sm:min-h-[140px]"
              title="Click to view deliveries"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 shrink-0">
                <Truck className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
                {t('deliveries')}
              </span>
              <span className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats?.deliveriesToday || 0}
              </span>
            </button>
          </div>

          {/* Main Content Grid: Currently Inside Table + Recent Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Currently Inside (Full width on tablet, 2 cols on xl) */}
            <div
              id="currently-inside-section"
              className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs min-w-0"
            >
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3.5">
                <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3.5">
                  <div className="relative w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-center shrink-0">
                    <IconCurrentlyInside className="w-7 h-7 sm:w-8 sm:h-8" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                  </div>
                  <div className={`text-center ${language === 'ur' ? 'sm:text-right' : 'sm:text-left'}`}>
                    <div className={`flex flex-wrap items-center justify-center gap-2 ${language === 'ur' ? 'sm:justify-end' : 'sm:justify-start'}`}>
                      <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white leading-snug">
                        {t('currently_inside_facility')}
                      </h2>
                      <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm sm:text-base font-extrabold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {stats?.activeVisitors?.length || 0}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('real_time_occupancy')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCategoryModalConfig({
                      isOpen: true,
                      category: 'ALL',
                      status: 'CHECKED_IN',
                      titleKey: 'currently_inside_facility',
                      defaultTitle: 'Currently Inside Facility',
                      gateId: currentGate?.id,
                    })
                  }
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm shadow-emerald-600/20 shrink-0"
                  title="View all visitors currently inside in full-screen modal"
                >
                  <IconCurrentlyInside className="w-5 h-5 shrink-0" />
                  <span>{t('view_all')}</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0" />
                </button>
              </div>

              <div className="overflow-x-auto">
                {stats?.activeVisitors && stats.activeVisitors.length > 0 ? (
                  <>
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className={`px-5 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>{t('visitor')}</th>
                          <th className={`px-4 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>{t('category')}</th>
                          <th className={`px-4 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>{t('host_and_dept')}</th>
                          <th className={`px-4 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>{t('card_badge')}</th>
                          <th className={`px-4 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>{t('entry_time')}</th>
                          <th className="px-4 py-3 text-right">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {stats.activeVisitors.slice(0, 3).map((visit: any) => (
                          <tr
                            key={visit.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="px-5 py-3">
                              <div
                                onClick={() => openPersonDetails(visit)}
                                className="flex items-center gap-2.5 cursor-pointer group"
                              >
                                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                                  {visit.person?.photoUrl ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={visit.person.photoUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Users className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                                <div className={`min-w-0 flex-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                                  <p className="font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {visit.person?.fullName}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-mono">
                                    {visit.person?.cnicNumber || visit.person?.dlsNumber || visit.person?.phoneNumber || 'N/A'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className={`px-4 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {visit.person?.category || 'VISITOR'}
                              </span>
                            </td>

                            <td className={`px-4 py-3 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                              <p className="font-medium text-slate-800 dark:text-slate-200">
                                {visit.hostName}
                              </p>
                              <p className="text-[10px] text-slate-400">{visit.department}</p>
                            </td>

                            <td className={`px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                              {visit.visitorCardNo || 'N/A'}
                            </td>

                            <td className={`px-4 py-3 text-slate-600 dark:text-slate-300 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                              {new Date(visit.checkInTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedVisitBadge(visit)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                                  title="Print / View Visitor Badge"
                                >
                                  {t('view_pass')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCheckoutVisit(visit);
                                    setIsCheckOutOpen(true);
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                                >
                                  {t('checkout_btn')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {stats.activeVisitors.length > 3 && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 px-6">
                        <span className={language === 'ur' ? 'text-right' : 'text-left'}>
                          {language === 'ur'
                            ? `${stats.activeVisitors.length} میں سے 3 دکھائے جا رہے ہیں`
                            : `Showing 3 of ${stats.activeVisitors.length} visitors inside`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCategoryModalConfig({
                              isOpen: true,
                              category: 'ALL',
                              status: 'CHECKED_IN',
                              titleKey: 'currently_inside_facility',
                              defaultTitle: 'Currently Inside Facility',
                              gateId: currentGate?.id,
                            })
                          }
                          className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>
                            {t('view_all')} ({stats.activeVisitors.length})
                          </span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-10 sm:p-12 flex flex-col items-center justify-center text-center gap-2.5 text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400">
                      <IconCurrentlyInside className="w-7 h-7" />
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {t('no_visitors_inside')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity (1 col) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 w-full">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <h2 className={`font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                    {t('recent_activity')}
                  </h2>
                </div>
              </div>

              <div className="space-y-3">
                {stats?.recentVisits && stats.recentVisits.length > 0 ? (
                  stats.recentVisits.slice(0, 7).map((v: any) => (
                    <div
                      key={v.id}
                      onClick={() => openPersonDetails(v)}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 hover:border-blue-300 dark:hover:border-blue-800 transition-colors text-xs space-y-1 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                          {v.person?.fullName}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            v.status === 'CHECKED_IN'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {v.status === 'CHECKED_IN' ? t('check_in_badge', 'CHECK-IN') : t('check_out_badge', 'CHECK-OUT')}
                        </span>
                      </div>

                      <p className={`text-[11px] text-slate-500 dark:text-slate-400 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
                        {language === 'ur'
                          ? `${t('visiting_host')} ${v.hostName} (${v.department}) • ${t('gate_label')}: ${v.entryGate?.name || 'مین گیٹ'}`
                          : `Visiting ${v.hostName} (${v.department}) • Gate: ${v.entryGate?.name || 'Main Gate'}`}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span>{t('card_label', 'Card')}: {v.visitorCardNo || 'N/A'}</span>
                        <span>
                          {new Date(v.checkInTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    {t('no_activity_today')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Modals (Shared) */}
      <CheckInModal
        isOpen={isCheckInOpen}
        defaultCategory={checkInCategory}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={fetchStats}
      />

      <CheckOutModal
        isOpen={isCheckOutOpen}
        initialVisit={selectedCheckoutVisit}
        onClose={() => {
          setIsCheckOutOpen(false);
          setSelectedCheckoutVisit(null);
        }}
        onSuccess={() => {
          setSelectedCheckoutVisit(null);
          fetchStats();
        }}
      />

      <CheckStatusModal
        isOpen={isCheckStatusOpen}
        initialPerson={selectedPersonForDetails}
        onClose={() => {
          setIsCheckStatusOpen(false);
          setSelectedPersonForDetails(null);
        }}
      />

      {selectedVisitBadge && (
        <VisitorBadgeModal
          isOpen={Boolean(selectedVisitBadge)}
          onClose={() => {
            setSelectedVisitBadge(null);
            setBadgeAutoPrint(false);
          }}
          visit={selectedVisitBadge}
          autoPrint={badgeAutoPrint}
        />
      )}

      {/* Step 5: Special Guest Check-In Success / Result Screen (View Card & Print Badge) */}
      <RegistrationSuccessModal
        isOpen={Boolean(specialGuestSuccessVisit)}
        onClose={() => setSpecialGuestSuccessVisit(null)}
        visit={specialGuestSuccessVisit}
        onViewCard={() => {
          setBadgeAutoPrint(false);
          setSelectedVisitBadge(specialGuestSuccessVisit);
        }}
        onPrintBadge={() => {
          setBadgeAutoPrint(true);
          setSelectedVisitBadge(specialGuestSuccessVisit);
        }}
        onRegisterNext={() => {
          setSpecialGuestSuccessVisit(null);
          setIsUpcomingGuestsOpen(true);
        }}
      />

      {/* Shared Upcoming Guests Modal (All Operators & Admins) */}
      <UpcomingGuestsModal
        isOpen={isUpcomingGuestsOpen}
        onClose={() => setIsUpcomingGuestsOpen(false)}
        invitations={upcomingInvitations}
        pendingCount={upcomingPendingCount}
        onRefresh={async () => {
          await fetchUpcomingInvitations();
          await fetchStats();
        }}
        onCheckInSuccess={(createdVisit) => {
          setIsUpcomingGuestsOpen(false);
          fetchUpcomingInvitations();
          fetchStats();
          if (createdVisit) {
            setSpecialGuestSuccessVisit(createdVisit);
          }
        }}
      />

      {/* Operator Full-Screen Category / Status Records Modal */}
      {!isAdmin && (
        <CategoryRecordsModal
          config={categoryModalConfig}
          onClose={() => setCategoryModalConfig(null)}
          onViewPass={(visit) => {
            setBadgeAutoPrint(false);
            setSelectedVisitBadge(visit);
          }}
          onViewPerson={(visit) => openPersonDetails(visit)}
          onCheckOut={(visit) => {
            setSelectedCheckoutVisit(visit);
            setIsCheckOutOpen(true);
          }}
          onRefreshStats={fetchStats}
        />
      )}

      {/* Parcel Tracker Modal (Opened from Operator Dashboard Main Screen) */}
      {isParcelTrackerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl">
            <ParcelManagementView
              isModal
              onCloseModal={() => {
                setIsParcelTrackerOpen(false);
                void fetchUpcomingInvitations();
              }}
            />
          </div>
        </div>
      )}

      {/* VIP Guest Modal (Opened from Operator Dashboard Main Screen) */}
      {isVipGuestsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl">
            <VipGuestManagementView
              isModal
              onCloseModal={() => {
                setIsVipGuestsOpen(false);
                void fetchUpcomingInvitations();
              }}
            />
          </div>
        </div>
      )}

      {/* Direct Invite VIP Guest Form Modal (Opened from Admin Dashboard Quick Action) */}
      {isAdmin && isInviteVipFormOpen && (
        <VipGuestManagementView
          onlyFormModal
          onCloseModal={() => {
            setIsInviteVipFormOpen(false);
            void fetchUpcomingInvitations();
          }}
          onSuccessSave={(msg) => {
            setVipSavedToast(msg);
            setTimeout(() => setVipSavedToast(null), 5000);
          }}
        />
      )}
    </AppLayout>
  );
}
