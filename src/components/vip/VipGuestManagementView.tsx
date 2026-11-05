'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  Crown,
  Car,
  Phone,
  Briefcase,
  Clock,
  CheckCircle2,
  LogIn,
  LogOut,
  Plus,
  Search,
  Edit3,
  XCircle,
  AlertCircle,
  Upload,
  X,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import type { VipGuestRow } from '@/app/api/vip-guests/route';

interface GateOption {
  id: string;
  name: string;
  type: string;
}

interface VipGuestManagementViewProps {
  isModal?: boolean;
  onlyFormModal?: boolean;
  onCloseModal?: () => void;
  onSuccessSave?: (message: string) => void;
}

function formatCnicInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

function getDefaultArrivalDateTimeLocal(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toDateTimeLocalValue(dt: Date | string): string {
  const d = new Date(dt);
  if (isNaN(d.getTime())) return getDefaultArrivalDateTimeLocal();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function VipGuestManagementView({
  isModal = false,
  onlyFormModal = false,
  onCloseModal,
  onSuccessSave,
}: VipGuestManagementViewProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const isUrdu = language === 'ur';
  const isAdmin = user?.role === 'ADMIN';

  const [vipGuests, setVipGuests] = useState<VipGuestRow[]>([]);
  const [gates, setGates] = useState<GateOption[]>([]);
  const [selectedGateId, setSelectedGateId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'UPCOMING' | 'CHECKED_IN' | 'CHECKED_OUT'
  >('ALL');

  // Action feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Admin Add / Edit VIP Guest Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(onlyFormModal);
  const [editingVip, setEditingVip] = useState<VipGuestRow | null>(null);
  const [vipName, setVipName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [designation, setDesignation] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [plannedArrivalTime, setPlannedArrivalTime] = useState(
    getDefaultArrivalDateTimeLocal()
  );
  const [cnicNumber, setCnicNumber] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchVipGuests = useCallback(async () => {
    try {
      const res = await fetch('/api/vip-guests?includeCancelled=true', {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.vipGuests)) {
          setVipGuests(data.vipGuests);
        }
        if (Array.isArray(data.gates)) {
          setGates(data.gates);
          if (data.gates.length > 0) {
            setSelectedGateId((prev) => prev || data.gates[0].id);
          }
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (onlyFormModal) {
      setLoading(false);
      return;
    }
    void fetchVipGuests();
    const interval = setInterval(() => {
      void fetchVipGuests();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchVipGuests, onlyFormModal]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 480;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setPhotoUrl(canvas.toDataURL('image/jpeg', 0.82));
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const openAddVipModal = () => {
    if (!isAdmin) return;
    setEditingVip(null);
    setVipName('');
    setPhoneNumber('');
    setDesignation('');
    setVehicleNumber('');
    setPlannedArrivalTime(getDefaultArrivalDateTimeLocal());
    setCnicNumber('');
    setPhotoUrl(null);
    setNotes('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const openEditVipModal = (vip: VipGuestRow) => {
    if (!isAdmin) return;
    setEditingVip(vip);
    setVipName(vip.vipName);
    setPhoneNumber(vip.phoneNumber);
    setDesignation(vip.designation);
    setVehicleNumber(vip.vehicleNumber);
    setPlannedArrivalTime(toDateTimeLocalValue(vip.plannedArrivalTime));
    setCnicNumber(vip.cnicNumber || '');
    setPhotoUrl(vip.photoUrl || null);
    setNotes(vip.notes || '');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleSaveVip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setFormError(null);
    setFormSubmitting(true);

    try {
      const url = editingVip ? `/api/vip-guests/${editingVip.id}` : '/api/vip-guests';
      const method = editingVip ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingVip ? 'UPDATE' : undefined,
          vipName: vipName.trim(),
          phoneNumber: phoneNumber.trim(),
          designation: designation.trim(),
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          plannedArrivalTime: new Date(plannedArrivalTime).toISOString(),
          cnicNumber: cnicNumber.trim() || null,
          photoUrl,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(
          data.error ||
            (isUrdu ? 'وی آئی پی مہمان محفوظ نہیں ہو سکا۔' : 'Failed to save VIP Guest.')
        );
        return;
      }

      const successMsg =
        data.message ||
        (isUrdu
          ? `وی آئی پی مہمان ${vipName.trim()} محفوظ کر دیا گیا۔`
          : `VIP Guest ${vipName.trim()} saved and notified to all Operator gates.`);

      setIsFormModalOpen(false);
      setActionSuccess(successMsg);
      if (onSuccessSave) {
        onSuccessSave(successMsg);
      }
      if (onlyFormModal) {
        onCloseModal?.();
        return;
      }
      await fetchVipGuests();
    } catch {
      setFormError(
        isUrdu ? 'نیٹ ورک کا مسئلہ ہے۔ دوبارہ کوشش کریں۔' : 'Network error while saving VIP Guest.'
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleCancelVip = async (vip: VipGuestRow) => {
    if (!isAdmin) return;
    setActionError(null);
    setActionSuccess(null);
    setProcessingId(vip.id);
    try {
      const res = await fetch(`/api/vip-guests/${vip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANCEL' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to cancel VIP visit.');
        return;
      }
      setActionSuccess(data.message || `VIP visit for ${vip.vipName} cancelled.`);
      await fetchVipGuests();
    } catch {
      setActionError('Network error while cancelling VIP visit.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleGateAction = async (vip: VipGuestRow, action: 'CHECK_IN' | 'CHECK_OUT') => {
    setActionError(null);
    setActionSuccess(null);
    setProcessingId(vip.id);
    try {
      const res = await fetch(`/api/vip-guests/${vip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          gateId: selectedGateId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(
          data.error ||
            `Failed to ${action === 'CHECK_IN' ? 'check in' : 'check out'} VIP Guest.`
        );
        return;
      }
      setActionSuccess(
        data.message ||
          `VIP Guest ${vip.vipName} (${vip.vehicleNumber}) ${
            action === 'CHECK_IN' ? 'checked in' : 'checked out'
          }.`
      );
      await fetchVipGuests();
    } catch {
      setActionError('Network error while updating VIP gate status.');
    } finally {
      setProcessingId(null);
    }
  };

  const activeVips = vipGuests.filter((v) => v.active && v.status !== 'CANCELLED');
  const upcomingCount = activeVips.filter((v) => v.status === 'UPCOMING').length;
  const checkedInCount = activeVips.filter((v) => v.status === 'CHECKED_IN').length;
  const checkedOutCount = activeVips.filter((v) => v.status === 'CHECKED_OUT').length;

  const filteredVips = activeVips.filter((v) => {
    if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const normPlate = q.replace(/[\s\-]/g, '');
    return (
      v.vipName.toLowerCase().includes(q) ||
      v.vehicleNumber.toLowerCase().includes(q) ||
      v.vehicleNumber.replace(/[\s\-]/g, '').toLowerCase().includes(normPlate) ||
      v.designation.toLowerCase().includes(q) ||
      v.phoneNumber.toLowerCase().includes(q)
    );
  });

  const getStatusLabel = (status: VipGuestRow['status']) => {
    if (status === 'CHECKED_IN') return t('vip_status_checked_in', 'Inside');
    if (status === 'CHECKED_OUT') return t('vip_status_checked_out', 'Checked Out');
    return t('vip_status_upcoming', 'Upcoming');
  };

  return (
    <div dir="ltr" className={onlyFormModal ? '' : 'space-y-4'}>
      {!onlyFormModal && (
        <>
      {/* Top Header — Clean Heading: VIP Guest List (No unnecessary explanatory subtext) */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
            <Crown className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div
            className={`flex items-center gap-2.5 flex-wrap min-w-0 flex-1 ${
              isUrdu ? 'justify-end text-right' : 'justify-start text-left'
            }`}
          >
            <h1
              dir="auto"
              className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate"
            >
              {t('vip_guest_list_title', 'VIP Guest List')}
            </h1>
            <span
              dir="auto"
              className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            >
              {isUrdu ? 'وزیٹر کارڈ درکار نہیں' : 'No Visitor Card Required'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {gates.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs">
              <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-slate-500 font-semibold">
                {t('gate_label', 'Gate')}:
              </span>
              <select
                value={selectedGateId}
                onChange={(e) => setSelectedGateId(e.target.value)}
                className="bg-transparent font-extrabold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {gates.map((g) => (
                  <option key={g.id} value={g.id} className="bg-white dark:bg-slate-900">
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Strictly Admin-Only: Add VIP Guest Button */}
          {isAdmin && (
            <button
              type="button"
              onClick={openAddVipModal}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t('add_vip_guest_btn', 'Add VIP Guest')}</span>
            </button>
          )}

          {isModal && onCloseModal && (
            <button
              type="button"
              onClick={onCloseModal}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer shrink-0 transition-colors"
              title={t('close', 'Close')}
              aria-label={t('close', 'Close')}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar Directly Below Heading on Mobile & Desktop */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            dir="auto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              'vip_search_placeholder',
              'Search by VIP name, vehicle number, or designation...'
            )}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isUrdu ? 'text-right' : 'text-left'
            }`}
          />
        </div>
      </div>

      {/* Desktop-Only Status Filter Cards (Hidden on Mobile per requirement) */}
      <div className="hidden sm:grid sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 rounded-2xl border-2 text-start transition-all cursor-pointer flex items-center justify-between ${
            statusFilter === 'ALL'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/35'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {t('filter_all', 'All')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {t('vip_guest_list_title', 'VIP Guest List')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {activeVips.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('UPCOMING')}
          className={`p-3.5 rounded-2xl border-2 text-start transition-all cursor-pointer flex items-center justify-between ${
            statusFilter === 'UPCOMING'
              ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/35'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {t('vip_status_upcoming', 'Upcoming')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {t('vip_status_upcoming', 'Upcoming')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {upcomingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('CHECKED_IN')}
          className={`p-3.5 rounded-2xl border-2 text-start transition-all cursor-pointer flex items-center justify-between ${
            statusFilter === 'CHECKED_IN'
              ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/35'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t('currently_inside', 'Currently Inside')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {t('vip_status_checked_in', 'Inside')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {checkedInCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('CHECKED_OUT')}
          className={`p-3.5 rounded-2xl border-2 text-start transition-all cursor-pointer flex items-center justify-between ${
            statusFilter === 'CHECKED_OUT'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/35'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {t('filter_checked_out', 'Checked Out')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {t('vip_status_checked_out', 'Checked Out')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {checkedOutCount}
          </span>
        </button>
      </div>

      {/* Feedback Banners */}
      {actionSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
          >
            {t('close', 'Close')}
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:underline cursor-pointer"
          >
            {t('close', 'Close')}
          </button>
        </div>
      )}

      {/* High-Visibility VIP Guest Cards / List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          {t('loading_records', 'Loading records...')}
        </div>
      ) : filteredVips.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <Crown className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
            {t('no_vip_found', 'No VIP guests found.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredVips.map((vip) => (
            <div
              key={vip.id}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all flex flex-col justify-between gap-4"
            >
              <div>
                {/* Top Row: Prominent VIP Name + High-Visibility Vehicle License Plate Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0">
                      {vip.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={vip.photoUrl}
                          alt={vip.vipName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            vip.status === 'CHECKED_IN'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : vip.status === 'CHECKED_OUT'
                              ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                          }`}
                        >
                          {getStatusLabel(vip.status)}
                        </span>
                      </div>

                      {/* Prominent VIP Name */}
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5 truncate">
                        {vip.vipName}
                      </h3>

                      {/* Designation */}
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mt-0.5">
                        <Briefcase className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{vip.designation}</span>
                      </p>
                    </div>
                  </div>

                  {/* Prominent Vehicle Number License Plate Badge */}
                  <div className="shrink-0">
                    <div className="inline-flex flex-col items-center px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-slate-900 dark:bg-amber-400 text-white dark:text-slate-950 border-2 border-amber-400 dark:border-amber-300 shadow-sm">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest opacity-80 flex items-center gap-1">
                        <Car className="w-3 h-3" />
                        {t('vip_vehicle_label', 'Vehicle Number')}
                      </span>
                      <span className="text-xs sm:text-sm font-mono font-black tracking-wider mt-0.5">
                        {vip.vehicleNumber}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Essential Details Grid */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {t('vip_planned_arrival_label', 'Planned Arrival Time')}
                    </p>
                    <p className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      {new Date(vip.plannedArrivalTime).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {t('emp_phone', 'Phone Number')}
                    </p>
                    <p className="font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {vip.phoneNumber}
                    </p>
                  </div>

                  {vip.actualCheckInTime && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                        {t('entry_time', 'Entry Time')}
                      </p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {new Date(vip.actualCheckInTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ({vip.checkInGateName || 'Gate'})
                      </p>
                    </div>
                  )}

                  {vip.actualCheckOutTime && (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
                        {t('exit_time', 'Exit Time')}
                      </p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {new Date(vip.actualCheckOutTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ({vip.checkOutGateName || 'Gate'})
                      </p>
                    </div>
                  )}
                </div>

                {vip.notes && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                    {vip.notes}
                  </p>
                )}
              </div>

              {/* Action Bar: Fast Gate Check-In / Check-Out + Admin Edit/Cancel */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {/* Hidden on Mobile per requirement */}
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                  {isUrdu ? 'وزیٹر کارڈ درکار نہیں' : 'Direct Gate Pass'}
                </span>

                <div className="flex items-center gap-2 ms-auto">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditVipModal(vip)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isUrdu ? 'ترمیم' : 'Edit'}</span>
                      </button>
                      {vip.status === 'UPCOMING' && (
                        <button
                          type="button"
                          disabled={processingId === vip.id}
                          onClick={() => handleCancelVip(vip)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t('cancel_btn', 'Cancel')}</span>
                        </button>
                      )}
                    </>
                  )}

                  {vip.status === 'UPCOMING' && (
                    <button
                      type="button"
                      disabled={processingId === vip.id}
                      onClick={() => handleGateAction(vip, 'CHECK_IN')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>
                        {processingId === vip.id
                          ? t('submitting_btn', 'Submitting...')
                          : t('vip_checkin_btn', 'Check In VIP')}
                      </span>
                    </button>
                  )}

                  {vip.status === 'CHECKED_IN' && (
                    <button
                      type="button"
                      disabled={processingId === vip.id}
                      onClick={() => handleGateAction(vip, 'CHECK_OUT')}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>
                        {processingId === vip.id
                          ? t('submitting_btn', 'Submitting...')
                          : t('vip_checkout_btn', 'Check Out VIP')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* ================================================================= */}
      {/* ADMIN-ONLY ADD / EDIT VIP GUEST MODAL (Standard GateShield Blue)  */}
      {/* ================================================================= */}
      {isAdmin && isFormModalOpen && (
        <div
          dir="ltr"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-auto animate-in fade-in-0 zoom-in-95">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <h3
                  dir="auto"
                  className={`text-base sm:text-lg font-extrabold flex-1 truncate ${
                    isUrdu ? 'text-right' : 'text-left'
                  }`}
                >
                  {editingVip
                    ? t('edit_vip_guest_title', 'Edit VIP Guest')
                    : t('new_vip_guest_title', 'Add VIP Guest')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFormModalOpen(false);
                  if (onlyFormModal) onCloseModal?.();
                }}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVip} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span dir="auto" className={`flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
                    {formError}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* VIP Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('vip_name_label', 'VIP Name')} *
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    required
                    value={vipName}
                    onChange={(e) => setVipName(e.target.value)}
                    placeholder={isUrdu ? 'وی آئی پی مہمان کا نام' : 'VIP Full Name'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Designation */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('vip_designation_label', 'Designation')} *
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    required
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder={isUrdu ? 'مثلاً چیئرمین، سی ای او' : 'e.g. Chairman, CEO'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Vehicle Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('vip_vehicle_label', 'Vehicle Number')} *
                  </label>
                  <div className="relative">
                    <Car className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      dir="ltr"
                      required
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                      placeholder="LEB-2026"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_phone', 'Phone Number')} *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      dir="ltr"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="03001234567"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Planned Arrival Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('vip_planned_arrival_label', 'Planned Arrival Time')} *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={plannedArrivalTime}
                    onChange={(e) => setPlannedArrivalTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* CNIC */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_guest_cnic', 'CNIC')}
                  </label>
                  <input
                    type="text"
                    value={cnicNumber}
                    onChange={(e) => setCnicNumber(formatCnicInput(e.target.value))}
                    placeholder="35202-1234567-1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                {/* Photo */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_guest_photo', 'Photo')}
                  </label>
                  <div className="flex items-center gap-3">
                    {photoUrl && (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl}
                          alt="VIP"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotoUrl(null)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-slate-900/80 text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <label className="flex-1 py-2.5 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>
                        {photoUrl
                          ? isUrdu
                            ? 'تصویر تبدیل کریں'
                            : 'Change Photo'
                          : isUrdu
                          ? 'تصویر منتخب کریں'
                          : 'Select Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('notes_label', 'Notes')}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('notes_placeholder', 'Additional details')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormModalOpen(false);
                    if (onlyFormModal) onCloseModal?.();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {t('cancel_btn', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-600/25 cursor-pointer"
                >
                  {formSubmitting
                    ? t('submitting_btn', 'Submitting...')
                    : editingVip
                    ? t('update_vip_btn', 'Update VIP Guest')
                    : t('save_vip_btn', 'Save VIP Guest')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
