'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

interface LayoutContextType {
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  isDesktopCollapsed: boolean;
  setIsDesktopCollapsed: (collapsed: boolean) => void;
  toggleDesktopSidebar: () => void;
  pendingEmployeeCount: number;
  pendingOperatorCount: number;
  refreshPendingCounts: () => Promise<void>;
}

const LayoutContext = createContext<LayoutContextType>({
  isMobileSidebarOpen: false,
  setIsMobileSidebarOpen: () => {},
  toggleMobileSidebar: () => {},
  closeMobileSidebar: () => {},
  isDesktopCollapsed: false,
  setIsDesktopCollapsed: () => {},
  toggleDesktopSidebar: () => {},
  pendingEmployeeCount: 0,
  pendingOperatorCount: 0,
  refreshPendingCounts: async () => {},
});

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [pendingEmployeeCount, setPendingEmployeeCount] = useState(0);
  const [pendingOperatorCount, setPendingOperatorCount] = useState(0);
  const badgeReqInFlightRef = useRef(false);

  const refreshPendingCounts = useCallback(async () => {
    if (user?.role !== 'ADMIN' || badgeReqInFlightRef.current) return;
    badgeReqInFlightRef.current = true;
    try {
      const [empRes, opRes] = await Promise.all([
        fetch('/api/admin/employees?summaryOnly=true', { cache: 'no-store' }),
        fetch('/api/admin/operators?summaryOnly=true', { cache: 'no-store' }),
      ]);
      if (empRes.ok) {
        const data = await empRes.json();
        if (typeof data.pendingCount === 'number') {
          setPendingEmployeeCount(data.pendingCount);
        }
      }
      if (opRes.ok) {
        const opData = await opRes.json();
        if (typeof opData.pendingCount === 'number') {
          setPendingOperatorCount(opData.pendingCount);
        }
      }
    } catch {
      // Ignore transient network errors
    } finally {
      badgeReqInFlightRef.current = false;
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      setPendingEmployeeCount(0);
      setPendingOperatorCount(0);
      return;
    }

    const initTimer = setTimeout(() => {
      void refreshPendingCounts();
    }, 0);

    const interval = setInterval(() => {
      void refreshPendingCounts();
    }, 5000);

    const handleImmediateRefresh = () => {
      void refreshPendingCounts();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshPendingCounts();
      }
    };

    window.addEventListener('gk:refresh-employee-badge', handleImmediateRefresh);
    window.addEventListener('gk:refresh-operator-badge', handleImmediateRefresh);
    window.addEventListener('focus', handleImmediateRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener('gk:refresh-employee-badge', handleImmediateRefresh);
      window.removeEventListener('gk:refresh-operator-badge', handleImmediateRefresh);
      window.removeEventListener('focus', handleImmediateRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.role, refreshPendingCounts]);

  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem('gk_sidebar_collapsed');
      if (savedCollapsed !== null) {
        setIsDesktopCollapsed(savedCollapsed === 'true');
      } else if (typeof window !== 'undefined' && window.innerWidth < 1280) {
        // Default to collapsed (icon-only mode) on tablet and 1024px screens so content gets full width
        setIsDesktopCollapsed(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen((prev) => !prev);
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const toggleDesktopSidebar = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gk_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <LayoutContext.Provider
      value={{
        isMobileSidebarOpen,
        setIsMobileSidebarOpen,
        toggleMobileSidebar,
        closeMobileSidebar,
        isDesktopCollapsed,
        setIsDesktopCollapsed,
        toggleDesktopSidebar,
        pendingEmployeeCount,
        pendingOperatorCount,
        refreshPendingCounts,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
