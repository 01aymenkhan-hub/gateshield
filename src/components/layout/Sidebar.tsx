'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLayout } from '@/context/LayoutContext';
import { useLanguage } from '@/context/LanguageContext';
import GateShieldLogo from '@/components/ui/GateShieldLogo';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  UserCheck,
  Award,
  HardHat,
  Truck,
  FileBarChart,
  ShieldCheck,
  UserCog,
  Building2,
  Settings,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  X,
  Package,
  Crown,
  Clock,
  CheckCircle2,
  History,
} from 'lucide-react';

interface NavItem {
  labelKey: string;
  defaultLabel: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav_dashboard', defaultLabel: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav_visitors', defaultLabel: 'Visitors', href: '/visitors', icon: Users },
  { labelKey: 'vendors', defaultLabel: 'Vendors', href: '/vendors', icon: Briefcase },
  { labelKey: 'interviews', defaultLabel: 'Interviews', href: '/interviews', icon: UserCheck },
  { labelKey: 'nav_guest', defaultLabel: 'Guests', href: '/special-guests', icon: Award },
  { labelKey: 'nav_vip_guest', defaultLabel: 'VIP Guests', href: '/vip-guests', icon: Crown },
  { labelKey: 'cat_contractor', defaultLabel: 'Contractors', href: '/contractors', icon: HardHat },
  { labelKey: 'deliveries', defaultLabel: 'Deliveries', href: '/deliveries', icon: Truck },
  { labelKey: 'nav_departments', defaultLabel: 'Departments', href: '/departments', icon: Building2, adminOnly: true },
  { labelKey: 'nav_employees', defaultLabel: 'Employees', href: '/employees', icon: Users, adminOnly: true },
  { labelKey: 'nav_reports', defaultLabel: 'Reports & Analytics', href: '/reports', icon: FileBarChart, adminOnly: true },
  { labelKey: 'nav_audit_logs', defaultLabel: 'Audit Logs', href: '/audit-logs', icon: ShieldCheck, adminOnly: true },
  { labelKey: 'nav_operators', defaultLabel: 'Manage Access', href: '/access', icon: UserCog, adminOnly: true },
  { labelKey: 'nav_settings', defaultLabel: 'Settings', href: '/settings', icon: Settings, adminOnly: true },
];

const PARCEL_NAV_ITEMS: NavItem[] = [
  { labelKey: 'parcel_tracker_title', defaultLabel: 'Parcel Tracker', href: '/parcels?tab=expected', icon: Clock },
  { labelKey: 'parcel_tab_received', defaultLabel: 'Received Parcels', href: '/parcels?tab=received', icon: Package },
  { labelKey: 'parcel_tab_delivered', defaultLabel: 'Delivered Parcels', href: '/parcels?tab=delivered', icon: CheckCircle2 },
  { labelKey: 'parcel_tab_history', defaultLabel: 'Parcel History', href: '/parcels?tab=history', icon: History },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, theme, toggleTheme, logout } = useAuth();
  const { t, language } = useLanguage();
  const isUrdu = language === 'ur';
  const {
    isMobileSidebarOpen,
    closeMobileSidebar,
    isDesktopCollapsed,
    toggleDesktopSidebar,
    pendingEmployeeCount,
    pendingOperatorCount,
  } = useLayout();

  const currentParcelTab = searchParams?.get('tab') || 'expected';
  const desktopNavRef = React.useRef<HTMLDivElement>(null);
  const mobileNavRef = React.useRef<HTMLDivElement>(null);

  const handleNavScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    try {
      sessionStorage.setItem('gk_sidebar_scroll', String(e.currentTarget.scrollTop));
    } catch {
      // ignore storage errors
    }
  }, []);

  React.useLayoutEffect(() => {
    let savedScroll = 0;
    try {
      const raw = sessionStorage.getItem('gk_sidebar_scroll');
      if (raw !== null) savedScroll = Number(raw) || 0;
    } catch {
      // ignore storage errors
    }

    [desktopNavRef.current, mobileNavRef.current].forEach((container) => {
      if (!container) return;
      if (savedScroll > 0) {
        container.scrollTop = savedScroll;
      }
      const activeEl = container.querySelector<HTMLElement>('[data-active="true"]');
      if (!activeEl) return;
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      if (containerRect.height <= 0) return;

      if (activeRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - activeRect.top + 12;
      } else if (activeRect.bottom > containerRect.bottom) {
        container.scrollTop += activeRect.bottom - containerRect.bottom + 12;
      }
    });
  }, [pathname, currentParcelTab, isMobileSidebarOpen]);

  const renderNavLinks = (
    isCollapsed: boolean,
    navRef: React.RefObject<HTMLDivElement | null>,
    onLinkClick?: () => void
  ) => {
    return (
      <div
        ref={navRef}
        onScroll={handleNavScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain sidebar-scroll px-3 py-3 space-y-1"
      >
        {!isCollapsed && (
          <div className={`px-3 pb-2 font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400 ${isUrdu ? 'text-[13px] leading-[1.6]' : 'text-[10px]'}`}>
            {isUrdu ? 'مینو' : 'Navigation'}
          </div>
        )}

        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && user?.role !== 'ADMIN') return null;

          const isActive = pathname === item.href;
          const Icon = item.icon;
          const displayLabel = t(item.labelKey, item.defaultLabel);
          const badgeCount =
            item.href === '/employees'
              ? pendingEmployeeCount
              : item.href === '/access'
                ? pendingOperatorCount
                : 0;
          const showPendingBadge = badgeCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              data-active={isActive ? 'true' : undefined}
              title={isCollapsed ? displayLabel : undefined}
              className={`relative flex items-center rounded-xl font-medium transition-all group ${
                isCollapsed
                  ? 'justify-center p-2.5 my-1'
                  : 'justify-between px-3 py-2'
              } ${isUrdu ? 'text-[15px]' : 'text-sm'} ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200'
                  }`}
                />
                {!isCollapsed && (
                  <span className={`truncate ${isUrdu ? 'text-[15px] leading-[1.6]' : ''}`}>
                    {displayLabel}
                  </span>
                )}
              </div>

              {!isCollapsed && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {showPendingBadge && (
                    <span
                      className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                        isActive
                          ? 'bg-white text-blue-700'
                          : 'bg-amber-500 text-slate-950 shadow-2xs'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                  {isActive && (
                    isUrdu ? (
                      <ChevronLeft className="w-4 h-4 opacity-70 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 opacity-70 shrink-0" />
                    )
                  )}
                </div>
              )}

              {isCollapsed && showPendingBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold flex items-center justify-center">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Dedicated Parcel Management Section */}
        <div className="pt-3 mt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1">
          {!isCollapsed && (
            <div className={`px-3 pb-1.5 font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5 ${isUrdu ? 'text-[13px] leading-[1.6]' : 'text-[10px]'}`}>
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span>{t('emp_card_parcel_management', 'Parcel Management')}</span>
            </div>
          )}

          {PARCEL_NAV_ITEMS.map((item) => {
            const tabKey = item.href.split('tab=')[1] || 'expected';
            const isActive = pathname === '/parcels' && currentParcelTab === tabKey;
            const Icon = item.icon;
            const displayLabel = t(item.labelKey, item.defaultLabel);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onLinkClick}
                data-active={isActive ? 'true' : undefined}
                title={isCollapsed ? displayLabel : undefined}
                className={`relative flex items-center rounded-xl font-medium transition-all group ${
                  isCollapsed
                    ? 'justify-center p-2.5 my-1'
                    : 'justify-between px-3 py-2'
                } ${isUrdu ? 'text-[15px]' : 'text-sm'} ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-blue-600 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300'
                    }`}
                  />
                  {!isCollapsed && (
                    <span className={`truncate ${isUrdu ? 'text-[15px] leading-[1.6]' : ''}`}>
                      {displayLabel}
                    </span>
                  )}
                </div>

                {!isCollapsed && isActive && (
                  isUrdu ? (
                    <ChevronLeft className="w-4 h-4 opacity-70 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 opacity-70 shrink-0" />
                  )
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  const renderUserFooter = (isCollapsed: boolean) => {
    return (
      <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-900/20">
        <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between'} px-1`}>
          <button
            onClick={toggleTheme}
            className={`flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer ${
              isCollapsed ? 'p-2 w-full' : 'px-2.5 py-1.5'
            }`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                {!isCollapsed && <span className={isUrdu ? 'text-[13px] leading-[1.5]' : ''}>{isUrdu ? 'روشن' : 'Light'}</span>}
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                {!isCollapsed && <span className={isUrdu ? 'text-[13px] leading-[1.5]' : ''}>{isUrdu ? 'ڈارک' : 'Dark'}</span>}
              </>
            )}
          </button>

          <button
            onClick={logout}
            className={`flex items-center justify-center gap-1 text-xs font-semibold rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer ${
              isCollapsed ? 'p-2 w-full' : 'px-2 py-1.5'
            }`}
            title={t('logout', 'Sign out')}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span className={isUrdu ? 'text-[13px] leading-[1.5]' : ''}>{t('logout', 'Logout')}</span>}
          </button>
        </div>

        {user && !isCollapsed && (
          <div className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-2xs">
            <div className="overflow-hidden pr-2">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
            </div>
            <span
              className={`font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                isUrdu ? 'text-[11px] leading-[1.4]' : 'text-[9px]'
              } ${
                user.role === 'ADMIN'
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              {isUrdu
                ? user.role === 'ADMIN'
                  ? 'ایڈمن'
                  : user.role === 'OPERATOR'
                  ? 'آپریٹر'
                  : 'ملازم'
                : user.role}
            </span>
          </div>
        )}

        {user && isCollapsed && (
          <div
            className="w-9 h-9 mx-auto rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-xs font-extrabold text-blue-700 dark:text-blue-300"
            title={`${user.name} (${user.role})`}
          >
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* 1. Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen h-dvh max-h-screen max-h-dvh overflow-hidden no-print transition-all duration-200 ease-in-out border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] ${
          isDesktopCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand / Logo Section */}
        <div
          className={`h-16 shrink-0 border-b border-slate-200 dark:border-slate-800 flex items-center ${
            isDesktopCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {isDesktopCollapsed ? (
            <button
              onClick={toggleDesktopSidebar}
              className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all cursor-pointer group"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <GateShieldLogo
                variant="icon"
                size="sm"
                className="group-hover:hidden transition-all"
              />
              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-200 hidden group-hover:block transition-all" />
            </button>
          ) : (
            <>
              <div className="flex items-center overflow-hidden min-w-0 pr-2">
                <GateShieldLogo variant="full" size="md" />
              </div>

              {/* Desktop Collapse Button */}
              <button
                onClick={toggleDesktopSidebar}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Navigation items */}
        {renderNavLinks(isDesktopCollapsed, desktopNavRef)}

        {/* Footer */}
        {renderUserFooter(isDesktopCollapsed)}
      </aside>

      {/* 2. Mobile Drawer Backdrop Overlay */}
      <div
        className={`lg:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity duration-200 ${
          isMobileSidebarOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      {/* 3. Mobile Off-Canvas Drawer */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-screen h-dvh max-h-screen max-h-dvh overflow-hidden flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] shadow-2xl transition-transform duration-200 ease-in-out no-print ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Brand Header with Close Button */}
        <div className="h-16 shrink-0 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center min-w-0 overflow-hidden">
            <GateShieldLogo variant="full" size="md" />
          </div>

          <button
            onClick={closeMobileSidebar}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
            title={isUrdu ? 'مینو بند کریں' : 'Close menu'}
            aria-label={isUrdu ? 'مینو بند کریں' : 'Close menu'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Navigation */}
        {renderNavLinks(false, mobileNavRef, closeMobileSidebar)}

        {/* Mobile Footer */}
        {renderUserFooter(false)}
      </aside>
    </>
  );
}
