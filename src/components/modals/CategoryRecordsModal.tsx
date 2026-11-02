'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Search,
  Users,
  Briefcase,
  UserCheck,
  Award,
  HardHat,
  Truck,
  DoorOpen,
  DoorClosed,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { IconVisitorPass } from '@/components/icons/OperatorTaskIcons';
import GatekeeperLoader from '@/components/ui/GatekeeperLoader';

export interface CategoryModalConfig {
  isOpen: boolean;
  category: string;
  status?: string;
  titleKey: string;
  defaultTitle: string;
  gateId?: string;
}

interface CategoryRecordsModalProps {
  config: CategoryModalConfig | null;
  onClose: () => void;
  onViewPass: (visit: any) => void;
  onCheckOut: (visit: any) => void;
  onViewPerson?: (visit: any) => void;
  onRefreshStats?: () => void;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ALL: Users,
  VISITOR: Users,
  VENDOR: Briefcase,
  INTERVIEW: UserCheck,
  SPECIAL_GUEST: Award,
  CONTRACTOR: HardHat,
  DELIVERY: Truck,
};

export default function CategoryRecordsModal({
  config,
  onClose,
  onViewPass,
  onCheckOut,
  onViewPerson,
}: CategoryRecordsModalProps) {
  const { language, t } = useLanguage();
  const [visits, setVisits] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(config?.status || 'ALL');
  const [page, setPage] = useState(1);
  const limit = 15;

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!config?.isOpen) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (config.category && config.category !== 'ALL') {
        params.set('category', config.category);
      }
      if (statusFilter && statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (config.gateId && config.gateId !== 'ALL') {
        params.set('gateId', config.gateId);
      }
      if (searchTerm.trim()) {
        params.set('q', searchTerm.trim());
      }
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/visitors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVisits(data.visits || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[CategoryRecordsModal] Error loading visits:', err);
    } finally {
      setLoading(false);
    }
  }, [config, statusFilter, searchTerm, page]);

  useEffect(() => {
    if (config?.isOpen) {
      setStatusFilter(config.status || 'ALL');
      setSearchTerm('');
      setPage(1);
    }
  }, [config]);

  useEffect(() => {
    if (config?.isOpen) {
      fetchRecords();
    }
  }, [config?.isOpen, statusFilter, page, fetchRecords]);

  // Debounced search handling
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    setPage(1);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchRecords();
    }, 350);
  };

  // Keyboard Escape listener & Body scroll lock
  useEffect(() => {
    if (!config?.isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [config?.isOpen, onClose]);

  if (!config?.isOpen) return null;

  const CategoryIcon = CATEGORY_ICONS[config.category] || Users;
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-150">
      <div className="w-full h-full max-w-6xl max-h-[96vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 shrink-0">
              <CategoryIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className={`min-w-0 flex-1 ${language === 'ur' ? 'text-right' : 'text-left'}`}>
              <div className={`flex items-center gap-2 ${language === 'ur' ? 'justify-end' : 'justify-start'}`}>
                <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white truncate">
                  {t(config.titleKey, config.defaultTitle)}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0 font-mono">
                  {total}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t('real_time_occupancy', 'Security records and checkpoint logs')}
              </p>
            </div>
          </div>

          {/* Large, High-Contrast Red Close Button in Top-Right Corner */}
          <button
            onClick={onClose}
            type="button"
            className="p-2.5 sm:p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80 transition-all cursor-pointer shrink-0 shadow-xs active:scale-95 flex items-center gap-1.5"
            title={t('close', 'Close')}
            aria-label={t('close', 'Close')}
          >
            <X className="w-5 h-5 stroke-[2.5]" />
            <span className="hidden sm:inline text-xs font-bold">{t('close', 'Close')}</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Real-time Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder={t('search_placeholder', 'Search by name, CNIC, or badge number...')}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${language === 'ur' ? 'text-right' : 'text-left'}`}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                  fetchRecords();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 hidden md:inline">
              <Filter className="w-3.5 h-3.5 inline mr-1" />
              {t('status', 'Status')}:
            </span>
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t('filter_all', 'All')}
            </button>
            <button
              onClick={() => {
                setStatusFilter('CHECKED_IN');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'CHECKED_IN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{t('filter_inside', 'Inside')}</span>
            </button>
            <button
              onClick={() => {
                setStatusFilter('CHECKED_OUT');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'CHECKED_OUT'
                  ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t('filter_checked_out', 'Checked Out')}
            </button>
          </div>
        </div>

        {/* Modal Body / Records View */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <GatekeeperLoader
              variant="section"
              title={t('loading_records', 'Loading records...')}
            />
          ) : visits.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400 text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {t('no_records_found', 'No matching records found')}
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                {t('no_records_hint', 'Try searching with a different visitor name, CNIC number, badge, or changing the status filter.')}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table View */}
              <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-850/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">{t('visitor', 'Visitor')}</th>
                      <th className="px-4 py-3.5">{t('category', 'Category')}</th>
                      <th className="px-4 py-3.5">{t('host_and_dept', 'Host & Department')}</th>
                      <th className="px-4 py-3.5">{t('card_badge', 'Card / Badge')}</th>
                      <th className="px-4 py-3.5">{t('entry_time', 'Entry Time')}</th>
                      <th className="px-4 py-3.5">{t('status', 'Status')}</th>
                      <th className="px-5 py-3.5 text-right">{t('actions', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {visits.map((visit) => (
                      <tr
                        key={visit.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div
                            onClick={() => onViewPerson && onViewPerson(visit)}
                            className={`flex items-center gap-3 ${
                              onViewPerson ? 'cursor-pointer group' : ''
                            }`}
                          >
                            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
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
                              <p className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {visit.person?.fullName}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                {visit.person?.cnicNumber || visit.person?.dlsNumber || visit.person?.phoneNumber || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {visit.person?.category || 'VISITOR'}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {visit.hostName}
                          </p>
                          <p className="text-[11px] text-slate-400">{visit.department}</p>
                        </td>

                        <td className="px-4 py-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {String(visit.person?.category || '').toUpperCase() === 'DELIVERY'
                            ? visit.vehicleNo || visit.visitorCardNo || 'N/A'
                            : visit.visitorCardNo || 'N/A'}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {new Date(visit.checkInTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {visit.status === 'CHECKED_IN' ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>{t('filter_inside', 'Inside')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                              <span>{t('filter_checked_out', 'Checked Out')}</span>
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onViewPass(visit)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer flex items-center gap-1"
                              title={t('view_pass', 'View Pass')}
                            >
                              <IconVisitorPass className="w-3.5 h-3.5" />
                              <span>{t('view_pass', 'View Pass')}</span>
                            </button>

                            {visit.status === 'CHECKED_IN' && (
                              <button
                                onClick={() => onCheckOut(visit)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <DoorClosed className="w-3.5 h-3.5" />
                                <span>{t('checkout_btn', 'Check Out')}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout (Touch-friendly cards) */}
              <div className="md:hidden space-y-3">
                {visits.map((visit) => (
                  <div
                    key={visit.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        onClick={() => onViewPerson && onViewPerson(visit)}
                        className={`flex items-center gap-3 ${onViewPerson ? 'cursor-pointer group' : ''}`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                          {visit.person?.photoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={visit.person.photoUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Users className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {visit.person?.fullName}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {visit.person?.cnicNumber || visit.person?.dlsNumber || visit.person?.phoneNumber || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {visit.person?.category || 'VISITOR'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 block">{t('host_and_dept', 'Host')}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {visit.hostName} ({visit.department})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">
                          {String(visit.person?.category || '').toUpperCase() === 'DELIVERY'
                            ? t('vehicle_no_label', 'Vehicle No.')
                            : t('card_badge', 'Badge')}
                        </span>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {String(visit.person?.category || '').toUpperCase() === 'DELIVERY'
                            ? visit.vehicleNo || visit.visitorCardNo || 'N/A'
                            : visit.visitorCardNo || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {new Date(visit.checkInTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onViewPass(visit)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                        >
                          {t('view_pass', 'Pass')}
                        </button>

                        {visit.status === 'CHECKED_IN' && (
                          <button
                            onClick={() => onCheckOut(visit)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                          >
                            {t('checkout_btn', 'Check Out')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Modal Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 shrink-0">
            <span>
              {t('showing', 'Showing')} {visits.length} of {total} records (Page {page} of {totalPages})
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('previous', 'Previous')}</span>
              </button>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <span className="hidden sm:inline">{t('next', 'Next')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
