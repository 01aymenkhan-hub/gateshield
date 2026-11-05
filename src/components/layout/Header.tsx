'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Gate } from '@/context/AuthContext';
import { useLayout } from '@/context/LayoutContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  DoorClosed,
  Clock,
  UserPlus,
  Briefcase,
  Search,
  ChevronDown,
  Building,
  Menu,
  Sun,
  Moon,
  Check,
  Languages,
  User,
  Bell,
  CheckCheck,
  X,
  Plus,
  Settings,
  UserCog,
} from 'lucide-react';
import { IconLogoutDoor } from '@/components/icons/OperatorTaskIcons';

interface HeaderNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  targetUrl?: string | null;
  dedupeKey?: string | null;
  operatorUserId?: string | null;
  createdAt: string;
}

interface HeaderProps {
  onOpenCheckIn?: (category?: string) => void;
  onOpenCheckOut?: () => void;
  onOpenCheckStatus?: () => void;
}

export default function Header({
  onOpenCheckIn,
  onOpenCheckOut,
  onOpenCheckStatus,
}: HeaderProps) {
  const router = useRouter();
  const { user, currentGate, setCurrentGate, theme, toggleTheme, logout } = useAuth();
  const { toggleMobileSidebar } = useLayout();
  const { language, toggleLanguage, t } = useLanguage();
  const isAdmin = user?.role === 'ADMIN';

  const [gates, setGates] = useState<Gate[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveToast, setLiveToast] = useState<HeaderNotification | null>(null);

  const gateDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const isFirstNotifLoadRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications?limit=25', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const fetched: HeaderNotification[] = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(fetched);
      setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);

      if (isFirstNotifLoadRef.current) {
        fetched.forEach((n) => seenNotifIdsRef.current.add(n.id));
        isFirstNotifLoadRef.current = false;
      } else {
        const newestUnseen = fetched.find((n) => !n.isRead && !seenNotifIdsRef.current.has(n.id));
        fetched.forEach((n) => seenNotifIdsRef.current.add(n.id));
        if (newestUnseen) {
          if (typeof window !== 'undefined' && user.role === 'ADMIN') {
            window.dispatchEvent(new Event('gk:refresh-employee-badge'));
            window.dispatchEvent(new Event('gk:refresh-operator-badge'));
            window.dispatchEvent(new Event('gk:refresh-password-reset-badge'));
          }
          setLiveToast(newestUnseen);
          setTimeout(() => {
            setLiveToast((curr) => (curr?.id === newestUnseen.id ? null : curr));
          }, 6000);
        }
      }
    } catch {
      // Ignore transient network errors
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchNotifications();
    const interval = setInterval(() => {
      void fetchNotifications();
    }, 5000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  const handleMarkNotificationsRead = async (ids?: string[]) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids && ids.length > 0 ? { ids } : { markAll: true }),
      });
      await fetchNotifications();
    } catch {
      // Ignore
    }
  };

  const resolveNotificationTargetUrl = (notif: HeaderNotification): string | null => {
    const rawUrl = notif.targetUrl?.trim() || '';
    const dedupe = notif.dedupeKey?.trim() || '';
    const msgUpper = (notif.message || '').toUpperCase();

    // 1. Employee Registration Request
    if (notif.type === 'EMPLOYEE_REQUEST' || dedupe.startsWith('emp_req_')) {
      const empId = dedupe.startsWith('emp_req_') ? dedupe.replace('emp_req_', '') : '';
      return empId
        ? `/employees?tab=requests&requestType=REGISTRATION&requestId=${encodeURIComponent(empId)}`
        : '/employees?tab=requests&requestType=REGISTRATION';
    }

    // 2. Operator Registration Request
    if (notif.type === 'OPERATOR_REQUEST' || dedupe.startsWith('op_req_') || rawUrl.startsWith('/operators')) {
      const opId =
        notif.operatorUserId ||
        (dedupe.startsWith('op_req_') ? dedupe.replace('op_req_', '') : '');
      return opId
        ? `/access?tab=requests&requestType=REGISTRATION&requestId=${encodeURIComponent(opId)}`
        : '/access?tab=requests&requestType=REGISTRATION';
    }

    // 3. Password Reset Requests (New & Legacy)
    if (
      notif.type === 'EMPLOYEE_PASSWORD_RESET_REQUEST' ||
      notif.type === 'OPERATOR_PASSWORD_RESET_REQUEST' ||
      notif.type === 'ADMIN_PASSWORD_RESET_REQUEST' ||
      notif.type === 'PASSWORD_RESET_REQUEST' ||
      dedupe.startsWith('pwd_reset_req_') ||
      rawUrl === '/dashboard#password-reset-requests'
    ) {
      if (
        rawUrl &&
        rawUrl !== '/dashboard#password-reset-requests' &&
        (rawUrl.startsWith('/employees') || rawUrl.startsWith('/access') || rawUrl.startsWith('/settings'))
      ) {
        return rawUrl;
      }

      const reqId = dedupe.startsWith('pwd_reset_req_')
        ? dedupe.replace('pwd_reset_req_', '')
        : '';

      if (
        notif.type === 'EMPLOYEE_PASSWORD_RESET_REQUEST' ||
        msgUpper.includes('(EMPLOYEE)')
      ) {
        return reqId
          ? `/employees?tab=requests&requestType=PASSWORD_RESET&requestId=${encodeURIComponent(reqId)}`
          : '/employees?tab=requests&requestType=PASSWORD_RESET';
      }

      if (
        notif.type === 'OPERATOR_PASSWORD_RESET_REQUEST' ||
        msgUpper.includes('(OPERATOR)')
      ) {
        return reqId
          ? `/access?tab=requests&requestType=PASSWORD_RESET&requestId=${encodeURIComponent(reqId)}`
          : '/access?tab=requests&requestType=PASSWORD_RESET';
      }

      return reqId
        ? `/settings?section=admin-security&requestId=${encodeURIComponent(reqId)}`
        : '/settings?section=admin-security';
    }

    return rawUrl || null;
  };

  const handleClickNotification = async (notif: HeaderNotification) => {
    if (!notif.isRead) {
      await handleMarkNotificationsRead([notif.id]);
    }
    setIsNotifOpen(false);
    const resolvedUrl = resolveNotificationTargetUrl(notif);
    if (resolvedUrl) {
      router.push(resolvedUrl);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gateDropdownRef.current && !gateDropdownRef.current.contains(event.target as Node)) {
        setIsGateOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsGateOpen(false);
        setIsProfileOpen(false);
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString(isAdmin || language !== 'ur' ? 'en-US' : 'ur-PK', {
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
  }, [language, isAdmin]);

  useEffect(() => {
    if (!user) {
      setGates([]);
      return;
    }

    const loadGates = async () => {
      try {
        const res = await fetch('/api/gates', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const fetchedGates: Gate[] = Array.isArray(data.gates) ? data.gates : [];
          setGates(fetchedGates);

          if (user.role === 'OPERATOR') {
            if (fetchedGates.length === 0) {
              setCurrentGate(null);
            } else if (!currentGate || !fetchedGates.some((g) => g.id === currentGate.id)) {
              setCurrentGate(fetchedGates[0]);
            }
          } else if (!currentGate && fetchedGates.length > 0 && !localStorage.getItem('gk_current_gate')) {
            setCurrentGate(fetchedGates[0]);
          }
        }
      } catch (e) {
        console.error('Error loading gates in header:', e);
      }
    };
    loadGates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const handleConfirmLogout = () => {
    if (window.confirm(t('confirm_logout', 'Are you sure you want to log out of the checkpoint?'))) {
      void logout();
    }
  };

  const operatorDisplayNumber =
    (user as { operatorNumber?: string } | null)?.operatorNumber ||
    (user?.id ? `OP-${user.id.slice(-6).toUpperCase()}` : 'OP');

  const renderNotificationBell = () => (
    <div ref={notifDropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsNotifOpen((prev) => !prev)}
        className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer"
        title={t('notifications_title', 'Notifications')}
        aria-label={t('notifications_title', 'Notifications')}
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isNotifOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-950/35 backdrop-blur-[1px] z-40 sm:hidden"
            onClick={() => setIsNotifOpen(false)}
          />
          <div
            dir="ltr"
            className="fixed left-3 right-3 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[75vh] sm:max-h-[24rem] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  dir="auto"
                  className="text-xs font-extrabold text-slate-900 dark:text-white truncate"
                >
                  {t('notifications_title', 'Notifications')}
                </span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shrink-0">
                    {unreadCount}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleMarkNotificationsRead()}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                    <span dir="auto" className="truncate">
                      {t('mark_all_read', 'Mark all read')}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsNotifOpen(false)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer shrink-0 transition-colors"
                  title={t('close', 'Close')}
                  aria-label={t('close', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 dark:divide-slate-800/80">
              {notifications.length === 0 ? (
                <div
                  dir="auto"
                  className="p-8 text-center text-xs text-slate-400 dark:text-slate-500"
                >
                  {t('no_notifications', 'No notifications yet.')}
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => void handleClickNotification(n)}
                    className={`p-3.5 transition-colors cursor-pointer ${
                      !n.isRead
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        dir="auto"
                        className="text-xs font-bold text-slate-900 dark:text-white leading-snug break-words"
                      >
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                      )}
                    </div>
                    <p
                      dir="auto"
                      className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed break-words"
                    >
                      {n.message}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <header
      dir="ltr"
      className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0c121e]/90 backdrop-blur-md px-3 sm:px-4 md:px-5 lg:px-6 flex items-center justify-between gap-2 sm:gap-3 md:gap-4 sticky top-0 z-30 no-print transition-colors"
    >
      {/* Live Real-Time Notification Toast Banner */}
      {liveToast && (
        <div
          onClick={() => {
            const toastNotif = liveToast;
            setLiveToast(null);
            void handleClickNotification(toastNotif);
          }}
          className="fixed top-20 left-3 right-3 sm:left-auto sm:right-4 z-50 sm:max-w-sm p-4 rounded-2xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-2xl cursor-pointer animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {liveToast.title}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {liveToast.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLiveToast(null);
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      
      {/* Left: Mobile Menu Toggle + Gate Selector + Clock */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3.5 min-w-0">
        {/* Mobile Hamburger Menu Toggle Button */}
        <button
          onClick={toggleMobileSidebar}
          type="button"
          className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
          title="Open menu"
          aria-label="Open navigation menu"
        >
          <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Active Gate Selector Dropdown */}
        <div ref={gateDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setIsGateOpen(!isGateOpen)}
            className="flex items-center gap-1.5 sm:gap-2.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all text-left cursor-pointer group"
            aria-expanded={isGateOpen}
            aria-haspopup="listbox"
          >
            <div className="p-1 rounded-lg bg-blue-100/70 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 shrink-0">
              <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>

            {/* Desktop label & full name */}
            <div className="hidden sm:block min-w-0 pr-1 text-left">
              <div className="flex items-center justify-start gap-1.5 leading-none mb-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    !isAdmin && !currentGate
                      ? 'bg-amber-500'
                      : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                <span
                  dir="auto"
                  className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider"
                >
                  {isAdmin ? 'Active Gate' : t('active_gate', 'Active Gate')}
                </span>
              </div>
              <div
                dir="auto"
                className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[110px] sm:max-w-[130px] md:max-w-[150px] lg:max-w-[130px] xl:max-w-[200px]"
              >
                {currentGate?.name ||
                  (isAdmin ? 'All Gates' : t('no_gate_assigned', 'No Gate Assigned'))}
              </div>
            </div>

            {/* Mobile compact label */}
            <div className="sm:hidden flex items-center gap-1 pr-0.5 text-left">
              <span
                dir="auto"
                className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[85px]"
              >
                {currentGate?.name?.split(' ')[0] ||
                  (isAdmin ? 'All Gates' : t('no_gate_assigned', 'No Gate'))}
              </span>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform duration-200 shrink-0 ${
                isGateOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
              }`}
            />
          </button>

          {/* Gate Selector Dropdown Floating Panel */}
          {isGateOpen && (
            <div className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-850/60 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {isAdmin ? 'Switch Active Gate' : t('active_gate', 'Assigned Gate')}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  {gates.length} {gates.length === 1 ? 'Gate' : isAdmin ? 'Gates' : t('all_gates', 'Gates')}
                </span>
              </div>

              <div className="p-1.5 max-h-64 overflow-y-auto space-y-1">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentGate(null);
                      setIsGateOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      !currentGate
                        ? 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 shadow-2xs'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          !currentGate
                            ? 'bg-blue-600 ring-4 ring-blue-100 dark:ring-blue-950'
                            : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      />
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-bold truncate ${
                            !currentGate
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          All Gates
                        </p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          View activity across all configured checkpoints
                        </p>
                      </div>
                    </div>
                    {!currentGate && (
                      <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </button>
                )}

                {!isAdmin && gates.length === 0 ? (
                  <div className="p-3.5 text-center space-y-1">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      {t('no_gate_assigned', 'No Gate Assigned')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {t(
                        'no_gate_assigned_desc',
                        'No gate is assigned to your Operator account. Please contact an Administrator to assign a gate.'
                      )}
                    </p>
                  </div>
                ) : (
                  gates.map((gate) => {
                    const isSelected = currentGate?.id === gate.id;
                    return (
                      <button
                        key={gate.id}
                        type="button"
                        onClick={() => {
                          setCurrentGate(gate);
                          setIsGateOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 shadow-2xs'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 ring-4 ring-blue-100 dark:ring-blue-950'
                                : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                          />
                          <div className="min-w-0">
                            <p
                              className={`text-xs font-bold truncate ${
                                isSelected
                                  ? 'text-blue-700 dark:text-blue-300'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {gate.name}
                            </p>
                            {gate.description && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {gate.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              gate.type === 'ENTRY'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : gate.type === 'EXIT'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                            }`}
                          >
                            {gate.type}
                          </span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live Date & Time Display (Visible on Tablet & Desktop, hidden on Mobile) */}
        <div className="hidden md:flex items-center gap-2 sm:gap-2.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 shadow-2xs shrink-0 transition-colors">
          <div className="p-1 rounded-lg bg-blue-100/70 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 shrink-0">
            <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
          </div>

          <div className="flex flex-col min-w-0 pr-0.5 sm:pr-1">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-xs lg:text-sm font-bold font-mono text-slate-900 dark:text-white tracking-tight">
                {currentTime || '--:--'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Live Clock" />
            </div>
            <span className="hidden xl:block text-[10px] lg:text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none mt-1 truncate">
              {currentDate}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions Scoped by Role */}
      {isAdmin ? (
        /* ================= ADMIN HEADER CONTROLS ================= */
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {renderNotificationBell()}

          {/* Visible Language Switch Button (Urdu / English) */}
          <button
            onClick={toggleLanguage}
            type="button"
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={language === 'ur' ? 'Switch to English' : 'اردو میں دیکھیں'}
            aria-label="Switch Language"
          >
            <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="font-semibold">{language === 'ur' ? 'English' : 'اردو'}</span>
          </button>

          {/* Quick Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            type="button"
            className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            )}
            <span className="hidden xl:inline text-[11px] capitalize">{theme}</span>
          </button>

          {/* Check Visitor Status Button */}
          <button
            onClick={onOpenCheckStatus}
            type="button"
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={t('check_status', 'Check Visitor Status')}
          >
            <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span dir="auto" className="hidden sm:inline">
              {t('check_status', 'Check Visitor Status')}
            </span>
          </button>

          {/* Top-Right Admin Profile Icon & Dropdown Menu */}
          <div ref={profileDropdownRef} className="relative">
            <button
              onClick={() => setIsProfileOpen((prev) => !prev)}
              type="button"
              className="flex items-center gap-2 p-1.5 sm:pl-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
              aria-expanded={isProfileOpen}
              aria-label={t('admin_profile_label', 'Admin Profile')}
              title={t('admin_profile_label', 'Admin Profile')}
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                {user?.name ? user.name[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden lg:block text-left pr-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[115px]">
                  {user?.name || 'Admin'}
                </p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold leading-none mt-0.5">
                  {t('role_admin', 'Administrator')}
                </p>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${
                  isProfileOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isProfileOpen && (
              <div
                dir="ltr"
                className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
              >
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-850/60 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      dir="auto"
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider"
                    >
                      {t('role_admin', 'Administrator')}
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                      ADMIN
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                </div>

                <div className="p-2 space-y-1">
                  <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                    <span dir="auto" className="text-[11px] text-slate-400">
                      {t('active_gate', 'Active Gate')}
                    </span>
                    <span
                      dir="auto"
                      className="font-bold text-slate-900 dark:text-white truncate max-w-[125px]"
                    >
                      {currentGate?.name || t('all_gates', 'All Gates')}
                    </span>
                  </div>

                  {/* Admin Profile / Access Management Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      router.push('/access');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
                  >
                    <UserCog className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span dir="auto">{t('admin_profile_label', 'Admin Profile & Access')}</span>
                  </button>

                  {/* Settings Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      router.push('/settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
                  >
                    <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span dir="auto">{t('nav_settings', 'Settings')}</span>
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  {/* Logout Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      void logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
                  >
                    <IconLogoutDoor className="w-4 h-4 text-rose-500 shrink-0" />
                    <span dir="auto">{t('logout', 'Logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= OPERATOR HEADER CONTROLS (Point 2) ================= */
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {renderNotificationBell()}

          {/* Visible Language Switch Button (Urdu / English) */}
          <button
            onClick={toggleLanguage}
            type="button"
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={language === 'ur' ? 'Switch to English' : 'اردو میں دیکھیں'}
            aria-label="Switch Language"
          >
            <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="font-semibold">{language === 'ur' ? 'English' : 'اردو'}</span>
          </button>

          {/* Quick Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            type="button"
            className="p-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            )}
          </button>

          {/* Desktop / Tablet Profile Menu Dropdown */}
          <div ref={profileDropdownRef} className="relative hidden sm:block">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              type="button"
              className="flex items-center gap-2 p-1.5 pl-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
              aria-expanded={isProfileOpen}
              aria-label="User Profile"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {user?.name ? user.name[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden lg:block text-left pr-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[110px]">
                  {user?.name || 'Operator'}
                </p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                  {operatorDisplayNumber}
                </p>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  isProfileOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Profile Dropdown Panel */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-850/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      {user?.role === 'ADMIN'
                        ? t('role_admin', 'Administrator')
                        : t('role_operator', 'Security Operator')}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                      {operatorDisplayNumber}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                </div>

                <div className="p-2 space-y-1">
                  <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                    <span dir="auto" className="text-[11px] text-slate-400">
                      {t('active_gate', 'Gate')}
                    </span>
                    <span
                      dir="auto"
                      className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]"
                    >
                      {currentGate?.name || t('no_gate_assigned', 'No Gate Assigned')}
                    </span>
                  </div>

                  {/* Red Logout Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      handleConfirmLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
                  >
                    <IconLogoutDoor className="w-4 h-4 text-rose-500" />
                    <span dir="auto">{t('logout', 'Logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tablet/Desktop Primary Add Visitor Button */}
          <button
            onClick={() => onOpenCheckIn && onOpenCheckIn('VISITOR')}
            type="button"
            disabled={!currentGate && gates.length === 0}
            title={
              !currentGate && gates.length === 0
                ? t(
                    'no_gate_assigned_desc',
                    'No gate is assigned to your Operator account. Please contact an Administrator to assign a gate.'
                  )
                : undefined
            }
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span dir="auto">{t('add_visitor_btn', 'Add Visitor')}</span>
          </button>

          {/* MOBILE HEADER ONLY: Prominent Red Logout Button (Replaces standalone Add button as requested) */}
          <button
            onClick={handleConfirmLogout}
            type="button"
            className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs shadow-rose-600/30 transition-all cursor-pointer shrink-0 active:scale-95"
            title={t('logout', 'Logout')}
            aria-label={t('logout', 'Logout')}
          >
            <IconLogoutDoor className="w-4 h-4 text-white" />
            <span dir="auto">{language === 'ur' ? 'لاگ آؤٹ' : 'Exit'}</span>
          </button>
        </div>
      )}
    </header>
  );
}
