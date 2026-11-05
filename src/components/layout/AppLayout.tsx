'use client';

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import CheckInModal from '../modals/CheckInModal';
import CheckOutModal from '../modals/CheckOutModal';
import CheckStatusModal from '../modals/CheckStatusModal';
import GatekeeperLoader from '../ui/GatekeeperLoader';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'next/navigation';

export default function AppLayout({
  children,
  onRefreshData,
}: {
  children: React.ReactNode;
  onRefreshData?: () => void;
}) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [checkInCategory, setCheckInCategory] = useState('VISITOR');
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [isCheckStatusOpen, setIsCheckStatusOpen] = useState(false);

  // Auth redirection
  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <GatekeeperLoader
        variant="fullscreen"
        title={t('loading_gatekeeper', 'Loading GateShield...')}
      />
    );
  }

  if (!user) {
    return null;
  }

  const handleOpenCheckIn = (category: string = 'VISITOR') => {
    setCheckInCategory(category);
    setIsCheckInOpen(true);
  };

  return (
    <div
      dir="ltr"
      className="min-h-screen flex bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-500 selection:text-white"
    >
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200">
        <Header
          onOpenCheckIn={handleOpenCheckIn}
          onOpenCheckOut={() => setIsCheckOutOpen(true)}
          onOpenCheckStatus={() => setIsCheckStatusOpen(true)}
        />

        <main
          dir="ltr"
          className="flex-1 p-3 sm:p-4 md:p-5 lg:p-6 overflow-y-auto min-w-0"
        >
          {children}
        </main>
      </div>

      {/* Global Modals */}
      <CheckInModal
        isOpen={isCheckInOpen}
        defaultCategory={checkInCategory}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={() => {
          if (onRefreshData) onRefreshData();
        }}
      />

      <CheckOutModal
        isOpen={isCheckOutOpen}
        onClose={() => setIsCheckOutOpen(false)}
        onSuccess={() => {
          if (onRefreshData) onRefreshData();
        }}
      />

      <CheckStatusModal
        isOpen={isCheckStatusOpen}
        onClose={() => setIsCheckStatusOpen(false)}
      />
    </div>
  );
}
