'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import {
  Search,
  Filter,
  Download,
  Users,
  Calendar,
  Building,
  DoorOpen,
  DoorClosed,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Printer,
  UserPlus,
  Briefcase,
  UserCheck,
  Award,
  HardHat,
  Truck,
  Trash2,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import CheckInModal from '@/components/modals/CheckInModal';
import CheckOutModal from '@/components/modals/CheckOutModal';
import VisitorBadgeModal from '@/components/modals/VisitorBadgeModal';
import DateFilterInput from '@/components/ui/DateFilterInput';
import { useAuth } from '@/context/AuthContext';

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Users,
  Briefcase,
  UserCheck,
  Award,
  HardHat,
  Truck,
  users: Users,
  briefcase: Briefcase,
  usercheck: UserCheck,
  'user-check': UserCheck,
  award: Award,
  hardhat: HardHat,
  'hard-hat': HardHat,
  truck: Truck,
};

const DEFAULT_CATEGORY_ICONS: Record<string, LucideIcon> = {
  ALL: Users,
  VISITOR: Users,
  VENDOR: Briefcase,
  INTERVIEW: UserCheck,
  SPECIAL_GUEST: Award,
  CONTRACTOR: HardHat,
  DELIVERY: Truck,
};

interface VisitorCategoryViewProps {
  category: 'ALL' | 'VISITOR' | 'VENDOR' | 'INTERVIEW' | 'SPECIAL_GUEST' | 'CONTRACTOR' | 'DELIVERY';
  title: string;
  description: string;
  icon?: string;
}

export default function VisitorCategoryView({
  category,
  title,
  description,
  icon,
}: VisitorCategoryViewProps) {
  const ResolvedIcon: LucideIcon =
    (icon && CATEGORY_ICON_MAP[icon]) ||
    DEFAULT_CATEGORY_ICONS[category] ||
    Users;
  const { user, currentGate } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gates, setGates] = useState<any[]>([]);

  // Deletion state (Admin only)
  const [visitToDelete, setVisitToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGate, setSelectedGate] = useState<string>(() =>
    user?.role === 'OPERATOR' ? currentGate?.id || user?.gates?.[0]?.id || '' : 'ALL'
  );
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>({ page: 1, totalPages: 1, total: 0 });

  // Modals
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [selectedCheckoutVisit, setSelectedCheckoutVisit] = useState<any>(null);
  const [selectedBadgeVisit, setSelectedBadgeVisit] = useState<any>(null);

  const loadGates = useCallback(async () => {
    try {
      const res = await fetch('/api/gates', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const fetchedGates = Array.isArray(data.gates) ? data.gates : [];
        setGates(fetchedGates);
        if (user?.role === 'OPERATOR') {
          if (fetchedGates.length === 0) {
            setSelectedGate('');
          } else if (
            currentGate?.id &&
            fetchedGates.some((g: { id: string }) => g.id === currentGate.id)
          ) {
            setSelectedGate(currentGate.id);
          } else {
            setSelectedGate(fetchedGates[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Error loading gates:', e);
    }
  }, [user?.role, currentGate?.id]);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== 'ALL') params.set('category', category);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedGate && selectedGate !== 'ALL') {
        params.set('gateId', selectedGate);
      } else if (user?.role === 'OPERATOR' && currentGate?.id) {
        params.set('gateId', currentGate.id);
      }
      if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('page', String(page));
      params.set('limit', '20');

      const res = await fetch(`/api/visitors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVisits(data.visits || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    } catch (e) {
      console.error('Error loading visits:', e);
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery, selectedGate, selectedStatus, dateFrom, dateTo, page, user?.role, currentGate?.id]);

  useEffect(() => {
    loadGates();
  }, [loadGates]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  // Handle Admin Delete
  const handleConfirmDelete = async () => {
    if (!visitToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/visits/${visitToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete visit record');
      }
      setVisits((prev) => prev.filter((v) => v.id !== visitToDelete.id));
      setPagination((prev: any) => ({ ...prev, total: Math.max(0, (prev.total || 1) - 1) }));
      setDeleteSuccessMessage(data.message || `Visit #${visitToDelete.visitNumber} deleted successfully`);
      setVisitToDelete(null);
      setTimeout(() => setDeleteSuccessMessage(null), 4000);
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (visits.length === 0) return;
    const headers = [
      'Visit Number',
      'Name',
      'Category',
      'CNIC/ID',
      'Phone',
      'Host Name',
      'Department',
      'Card / Vehicle No',
      'Entry Gate',
      'Check In Time',
      'Exit Gate',
      'Check Out Time',
      'Status',
    ];

    const rows = visits.map((v) => [
      `"${v.visitNumber}"`,
      `"${v.person?.fullName || ''}"`,
      `"${v.person?.category || ''}"`,
      `"${v.person?.cnicNumber || v.person?.dlsNumber || ''}"`,
      `"${v.person?.phoneNumber || ''}"`,
      `"${v.hostName}"`,
      `"${v.department}"`,
      `"${String(v.person?.category || '').toUpperCase() === 'DELIVERY' ? v.vehicleNo || v.visitorCardNo || '' : v.visitorCardNo || ''}"`,
      `"${v.entryGate?.name || ''}"`,
      `"${new Date(v.checkInTime).toLocaleString()}"`,
      `"${v.exitGate?.name || ''}"`,
      `"${v.checkOutTime ? new Date(v.checkOutTime).toLocaleString() : ''}"`,
      `"${v.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppLayout onRefreshData={fetchVisits}>
      <div className="space-y-6">
        {/* Header & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <ResolvedIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {description} ({pagination.total} records)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setIsCheckInOpen(true)}
              disabled={!isAdmin && gates.length === 0 && !currentGate}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Register Entry</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="sm:col-span-2 md:col-span-3 xl:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Name, CNIC, Phone, Card #, Vehicle #, Host..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Gate Filter */}
            <div className="relative">
              <Building className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedGate}
                onChange={(e) => setSelectedGate(e.target.value)}
                disabled={!isAdmin && gates.length <= 1}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none cursor-pointer disabled:opacity-90"
              >
                {isAdmin && <option value="ALL">All Gates</option>}
                {!isAdmin && gates.length === 0 && (
                  <option value="">No Gate Assigned</option>
                )}
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="CHECKED_IN">Currently Inside</option>
                <option value="CHECKED_OUT">Checked Out</option>
              </select>
            </div>

            {/* Modern Date Filter */}
            <div className="flex items-center">
              <DateFilterInput
                value={dateFrom}
                onChange={setDateFrom}
                title="Filter records by date"
                placeholder="Filter date"
              />
            </div>
          </div>
        </div>

        {/* Visits Table */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Person Profile</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Host / Dept</th>
                  <th className="px-4 py-3.5">
                    {category === 'DELIVERY' ? 'Vehicle #' : 'Card / Vehicle #'}
                  </th>
                  <th className="px-4 py-3.5">Entry Gate &amp; Time</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-xs">
                      Loading visitor logs...
                    </td>
                  </tr>
                ) : visits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-xs">
                      No visit records found matching filters.
                    </td>
                  </tr>
                ) : (
                  visits.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Person Profile */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                            {v.person?.photoUrl ? (
                              <img
                                src={v.person.photoUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Users className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/person/${v.person?.id}`}
                              className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 group"
                            >
                              <span>{v.person?.fullName}</span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                            <p className="text-[10px] text-slate-400 font-mono">
                              CNIC: {v.person?.cnicNumber || v.person?.dlsNumber || 'N/A'} • Phone:{' '}
                              {v.person?.phoneNumber || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {v.person?.category || 'VISITOR'}
                        </span>
                      </td>

                      {/* Host & Dept */}
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {v.hostName}
                        </p>
                        <p className="text-[10px] text-slate-400">{v.department}</p>
                      </td>

                      {/* Card / Vehicle # */}
                      <td className="px-4 py-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {String(v.person?.category || '').toUpperCase() === 'DELIVERY'
                          ? v.vehicleNo || v.visitorCardNo || 'N/A'
                          : v.visitorCardNo || 'N/A'}
                      </td>

                      {/* Entry Gate & Time */}
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {v.entryGate?.name || 'Main Gate'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(v.checkInTime).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {v.status === 'CHECKED_IN' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            INSIDE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            EXITED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedBadgeVisit(v)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                            title="Print Badge"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <Link
                            href={`/person/${v.person?.id}`}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            History
                          </Link>

                          {v.status === 'CHECKED_IN' && (
                            <button
                              onClick={() => {
                                setSelectedCheckoutVisit(v);
                                setIsCheckOutOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 transition-colors shadow-xs cursor-pointer"
                            >
                              Exit
                            </button>
                          )}

                          {user?.role === 'ADMIN' && (
                            <button
                              onClick={() => {
                                setVisitToDelete(v);
                                setDeleteError(null);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Record (Admin Only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {pagination.totalPages > 1 && (
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total visits)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CheckInModal
        isOpen={isCheckInOpen}
        defaultCategory={category === 'ALL' ? 'VISITOR' : category}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={fetchVisits}
      />

      <CheckOutModal
        isOpen={isCheckOutOpen}
        initialVisit={selectedCheckoutVisit}
        onClose={() => {
          setIsCheckOutOpen(false);
          setSelectedCheckoutVisit(null);
        }}
        onSuccess={fetchVisits}
      />

      {selectedBadgeVisit && (
        <VisitorBadgeModal
          isOpen={Boolean(selectedBadgeVisit)}
          onClose={() => setSelectedBadgeVisit(null)}
          visit={selectedBadgeVisit}
        />
      )}

      {/* Admin Delete Confirmation Modal */}
      {visitToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Delete Visit Record?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Visitor: <span className="font-bold">{visitToDelete.person?.fullName || 'N/A'}</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Visit Number: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{visitToDelete.visitNumber}</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Host: <span className="font-medium text-slate-700 dark:text-slate-300">{visitToDelete.hostName} ({visitToDelete.department})</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Check-in: {new Date(visitToDelete.checkInTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setVisitToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Toast */}
      {deleteSuccessMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <span>✓ {deleteSuccessMessage}</span>
        </div>
      )}
    </AppLayout>
  );
}
