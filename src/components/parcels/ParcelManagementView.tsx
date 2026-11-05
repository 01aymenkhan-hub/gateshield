'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  Camera,
  MapPin,
  Phone,
  Building2,
  Calendar,
  Plus,
  X,
  Eye,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { ParcelRow } from '@/app/api/employee/parcels/route';
import UnexpectedParcelModal from '@/components/modals/UnexpectedParcelModal';

export type ParcelTabType = 'expected' | 'received' | 'delivered' | 'history';

interface GateOption {
  id: string;
  name: string;
  type: string;
}

interface ParcelManagementViewProps {
  initialTab?: ParcelTabType;
  isModal?: boolean;
  onCloseModal?: () => void;
  openRegisterInitially?: boolean;
}

export default function ParcelManagementView({
  initialTab = 'expected',
  isModal = false,
  onCloseModal,
  openRegisterInitially = false,
}: ParcelManagementViewProps) {
  const { t, language } = useLanguage();
  const isUrdu = language === 'ur';
  const [activeTab, setActiveTab] = useState<ParcelTabType>(initialTab);
  const [parcels, setParcels] = useState<ParcelRow[]>([]);
  const [gates, setGates] = useState<GateOption[]>([]);
  const [selectedGateId, setSelectedGateId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'EXPECTED' | 'UNEXPECTED'>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    'ALL' | 'EXPECTED' | 'RECEIVED' | 'DELIVERED'
  >('ALL');

  // Unexpected Parcel Modal
  const [isUnexpectedOpen, setIsUnexpectedOpen] = useState(openRegisterInitially);

  // Receive Expected Parcel Verification Modal state
  const [receivingTarget, setReceivingTarget] = useState<ParcelRow | null>(null);
  const [receivePhotoUrl, setReceivePhotoUrl] = useState<string | null>(null);
  const [receiveGateId, setReceiveGateId] = useState<string>('');
  const [receiveNotes, setReceiveNotes] = useState<string>('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // Camera state for receiving expected parcel
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Confirmation Screens (Receiving Confirmation & Delivery Confirmation)
  const [confirmationModal, setConfirmationModal] = useState<{
    type: 'RECEIVED' | 'DELIVERED';
    parcel: ParcelRow;
  } | null>(null);

  // Deliver Parcel submitting state
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Photo preview modal
  const [photoPreviewParcel, setPhotoPreviewParcel] = useState<ParcelRow | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (openRegisterInitially) {
      setIsUnexpectedOpen(true);
    }
  }, [openRegisterInitially]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const fetchParcels = useCallback(async () => {
    try {
      const res = await fetch('/api/parcels', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.parcels)) {
          setParcels(data.parcels);
        }
        if (Array.isArray(data.gates)) {
          setGates(data.gates);
          if (data.gates.length > 0) {
            setSelectedGateId((prev) => prev || data.gates[0].id);
            setReceiveGateId((prev) => prev || data.gates[0].id);
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
    void fetchParcels();
    const interval = setInterval(() => {
      void fetchParcels();
    }, 5000);
    return () => {
      clearInterval(interval);
      stopCamera();
    };
  }, [fetchParcels, stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch {
      setCameraError(
        isUrdu
          ? 'کیمرہ دستیاب نہیں ہے۔ براہ کرم کیمرے کی اجازت دیں۔'
          : 'Unable to access camera. Please allow camera permission and try again.'
      );
      setCameraActive(false);
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const maxDim = 640;
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;
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
      ctx.drawImage(video, 0, 0, w, h);
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 320);
      setReceivePhotoUrl(canvas.toDataURL('image/jpeg', 0.84));
      stopCamera();
    }
  };

  const openReceiveModal = (parcel: ParcelRow) => {
    setReceivingTarget(parcel);
    setReceivePhotoUrl(parcel.photoUrl || null);
    setReceiveNotes(parcel.notes || '');
    setReceiveGateId(selectedGateId || (gates[0]?.id ?? ''));
    setReceiveError(null);
    stopCamera();
  };

  const handleConfirmReceiveExpected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingTarget) return;
    setReceiveError(null);

    if (!receivePhotoUrl) {
      setReceiveError(
        isUrdu
          ? 'براہ کرم پارسل وصول کرنے سے پہلے پارسل کی تصویر لیں۔'
          : 'Please capture a Parcel Photo before clicking Receive Parcel.'
      );
      return;
    }

    setReceiveSubmitting(true);
    try {
      const res = await fetch(`/api/parcels/${receivingTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECEIVE',
          photoUrl: receivePhotoUrl,
          gateId: receiveGateId || selectedGateId || undefined,
          notes: receiveNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReceiveError(data.error || 'Failed to receive expected parcel.');
        return;
      }

      stopCamera();
      setReceivingTarget(null);
      setConfirmationModal({
        type: 'RECEIVED',
        parcel: data.parcel,
      });
      await fetchParcels();
    } catch {
      setReceiveError('Network error while receiving parcel.');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const handleDeliverParcel = async (parcel: ParcelRow) => {
    setActionError(null);
    setDeliveringId(parcel.id);
    try {
      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELIVER',
          gateId: selectedGateId || parcel.receivingGateId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to mark parcel as delivered.');
        return;
      }

      setConfirmationModal({
        type: 'DELIVERED',
        parcel: data.parcel,
      });
      await fetchParcels();
    } catch {
      setActionError('Network error while marking parcel as delivered.');
    } finally {
      setDeliveringId(null);
    }
  };

  const expectedCount = parcels.filter((p) => p.status === 'EXPECTED').length;
  const receivedCount = parcels.filter((p) => p.status === 'RECEIVED').length;
  const deliveredCount = parcels.filter((p) => p.status === 'DELIVERED').length;

  const filteredParcels = parcels.filter((p) => {
    if (activeTab === 'expected' && p.status !== 'EXPECTED') return false;
    if (activeTab === 'received' && p.status !== 'RECEIVED') return false;
    if (activeTab === 'delivered' && p.status !== 'DELIVERED') return false;
    if (
      activeTab === 'history' &&
      historyStatusFilter !== 'ALL' &&
      p.status !== historyStatusFilter
    ) {
      return false;
    }

    if (sourceFilter !== 'ALL' && p.source !== sourceFilter) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.ownerName.toLowerCase().includes(q) ||
      p.ownerPhone.toLowerCase().includes(q) ||
      p.departmentName.toLowerCase().includes(q) ||
      Boolean(p.senderName && p.senderName.toLowerCase().includes(q)) ||
      Boolean(p.senderPhone && p.senderPhone.toLowerCase().includes(q)) ||
      p.senderPlatform.toLowerCase().includes(q) ||
      Boolean(p.receivingGateName && p.receivingGateName.toLowerCase().includes(q)) ||
      Boolean(p.deliveryGateName && p.deliveryGateName.toLowerCase().includes(q)) ||
      Boolean(p.notes && p.notes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Action Header */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
            <Package className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className={`min-w-0 ${isUrdu ? 'text-right' : 'text-left'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
                {t('parcel_tracker_title', 'Parcel Tracker')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 shrink-0">
                {parcels.length} {isUrdu ? 'کل' : 'Total'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Hidden on mobile per Requirement 1; preserved on desktop */}
          <button
            type="button"
            onClick={() => setIsUnexpectedOpen(true)}
            className="hidden sm:inline-flex px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md shadow-blue-500/20 items-center gap-2 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t('register_unexpected_parcel', 'Unexpected Parcel')}</span>
          </button>

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

      {/* Mobile Compact Single-Line Category Filter Tabs (< lg) */}
      <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 lg:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('expected')}
          className={`px-1.5 py-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
            activeTab === 'expected'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
          }`}
        >
          <span className="truncate">{t('parcel_tab_expected_short', 'Expected')}</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shrink-0 ${
              activeTab === 'expected'
                ? 'bg-white/20 text-white'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
            }`}
          >
            {expectedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('received')}
          className={`px-1.5 py-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
            activeTab === 'received'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
          }`}
        >
          <span className="truncate">{t('parcel_tab_received_short', 'Received')}</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shrink-0 ${
              activeTab === 'received'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
          >
            {receivedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('delivered')}
          className={`px-1.5 py-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
            activeTab === 'delivered'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
          }`}
        >
          <span className="truncate">{t('parcel_tab_delivered_short', 'Delivered')}</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shrink-0 ${
              activeTab === 'delivered'
                ? 'bg-white/20 text-white'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
            }`}
          >
            {deliveredCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-1.5 py-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
          }`}
        >
          <span className="truncate">{t('parcel_tab_all_short', 'History')}</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shrink-0 ${
              activeTab === 'history'
                ? 'bg-white/20 text-white'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
            }`}
          >
            {parcels.length}
          </span>
        </button>
      </div>

      {/* Desktop 4 Navigation Cards (lg+) */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('expected')}
          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
            activeTab === 'expected'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/35 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
          }`}
        >
          <div className={isUrdu ? 'text-right' : 'text-left'}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {t('parcel_tracker_title', 'Parcel Tracker')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
              {t('parcel_tab_expected', 'Expected Parcels')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {expectedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('received')}
          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
            activeTab === 'received'
              ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/35 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400'
          }`}
        >
          <div className={isUrdu ? 'text-right' : 'text-left'}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t('parcel_status_received', 'Received')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
              {t('parcel_tab_received', 'Received Parcels')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {receivedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('delivered')}
          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
            activeTab === 'delivered'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/35 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
          }`}
        >
          <div className={isUrdu ? 'text-right' : 'text-left'}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {t('parcel_status_delivered', 'Delivered')}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
              {t('parcel_tab_delivered', 'Delivered Parcels')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {deliveredCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
            activeTab === 'history'
              ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/35 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400'
          }`}
        >
          <div className={isUrdu ? 'text-right' : 'text-left'}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              {isUrdu ? 'مکمل ریکارڈ' : 'Complete Log'}
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
              {t('parcel_tab_history', 'Parcel History')}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            {parcels.length}
          </span>
        </button>
      </div>

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
            {isUrdu ? 'بند کریں' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Search & Filter Bar (Simple search bar on mobile; All Sources hidden on mobile) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isUrdu
                ? 'نام، فون نمبر، شعبہ، یا پارسل تلاش کریں...'
                : 'Search by owner name, phone, department, or sender...'
            }
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Hidden on mobile per Requirement 4 */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <select
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as 'ALL' | 'EXPECTED' | 'UNEXPECTED')
            }
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
          >
            <option value="ALL">{isUrdu ? 'تمام ذرائع' : 'All Sources'}</option>
            <option value="EXPECTED">{t('parcel_status_expected', 'Expected')}</option>
            <option value="UNEXPECTED">{isUrdu ? 'غیر متوقع' : 'Unexpected'}</option>
          </select>

          {activeTab === 'history' && (
            <select
              value={historyStatusFilter}
              onChange={(e) =>
                setHistoryStatusFilter(
                  e.target.value as 'ALL' | 'EXPECTED' | 'RECEIVED' | 'DELIVERED'
                )
              }
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
            >
              <option value="ALL">{isUrdu ? 'تمام حیثیت' : 'All Statuses'}</option>
              <option value="EXPECTED">{t('parcel_status_expected', 'Expected')}</option>
              <option value="RECEIVED">{t('parcel_status_received', 'Received')}</option>
              <option value="DELIVERED">{t('parcel_status_delivered', 'Delivered')}</option>
            </select>
          )}
        </div>
      </div>

      {/* Parcel Records Table (Desktop) / Full-Width Cards (Mobile) */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            {isUrdu ? 'پارسل ریکارڈ لوڈ ہو رہے ہیں...' : 'Loading parcel records...'}
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="p-10 sm:p-12 text-center space-y-3">
            <Package className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
            <div>
              <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                {activeTab === 'expected'
                  ? isUrdu
                    ? 'کوئی متوقع پارسل ریمائنڈر موجود نہیں'
                    : 'No Expected Parcel Reminders Pending'
                  : activeTab === 'received'
                  ? isUrdu
                    ? 'اس وقت گیٹ پر کوئی موصول شدہ پارسل موجود نہیں'
                    : 'No Received Parcels Currently Waiting at the Gate'
                  : activeTab === 'delivered'
                  ? isUrdu
                    ? 'کوئی حوالے کیا گیا پارسل نہیں ملا'
                    : 'No Delivered Parcels Found'
                  : isUrdu
                  ? 'کوئی پارسل ریکارڈ نہیں ملا'
                  : 'No Parcel History Matches Your Filter'}
              </p>
            </div>
            {activeTab === 'delivered' && receivedCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('received')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
              >
                {t('parcel_tab_received', 'Received Parcels')} ({receivedCount})
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ================================================================= */}
            {/* MOBILE FULL-WIDTH PARCEL CARDS (< md) — No Horizontal Scrolling   */}
            {/* ================================================================= */}
            <div className="md:hidden p-3 space-y-3">
              {filteredParcels.map((prc) => (
                <div
                  key={prc.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 space-y-3 shadow-2xs"
                >
                  {/* Card Top Row: Photo/Icon + Owner Name, Phone, Department + Status Badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => prc.photoUrl && setPhotoPreviewParcel(prc)}
                        className={`w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0 ${
                          prc.photoUrl ? 'cursor-pointer ring-2 ring-blue-500/20' : 'cursor-default'
                        }`}
                        title={prc.photoUrl ? 'Tap to view parcel photo' : undefined}
                      >
                        {prc.photoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={prc.photoUrl}
                            alt={prc.ownerName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight break-words">
                          {prc.ownerName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            {prc.ownerPhone}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200">
                            <Building2 className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{prc.departmentName}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Source Badges */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          prc.status === 'RECEIVED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : prc.status === 'DELIVERED'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                        }`}
                      >
                        {prc.status === 'RECEIVED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            {t('parcel_status_received', 'Received')}
                          </>
                        ) : prc.status === 'DELIVERED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            {t('parcel_status_delivered', 'Delivered')}
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            {t('parcel_status_expected', 'Expected')}
                          </>
                        )}
                      </span>

                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                          prc.source === 'EXPECTED'
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                            : 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {prc.source === 'EXPECTED'
                          ? t('parcel_status_expected', 'Expected')
                          : isUrdu
                          ? 'غیر متوقع'
                          : 'Unexpected'}
                      </span>
                    </div>
                  </div>

                  {/* Card Details Grid: Sender/Platform, Expected Date, Receiving Info, Delivery Info */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/70 text-xs">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">
                        {t('parcel_from', 'Parcel From')}
                      </span>
                      <span className="mt-0.5 inline-flex items-center gap-1 font-extrabold text-blue-700 dark:text-blue-300 break-words">
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        <span>{prc.senderPlatform}</span>
                      </span>
                      {(prc.senderName || prc.senderPhone) && (
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300 break-words">
                          <span className="font-semibold">{prc.senderName}</span>
                          {prc.senderName && prc.senderPhone ? ' • ' : ''}
                          {prc.senderPhone && <span className="font-mono">{prc.senderPhone}</span>}
                        </p>
                      )}
                    </div>

                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">
                        {t('parcel_expected_date', 'Arrival Date')}
                      </span>
                      <span className="mt-0.5 inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {prc.expectedArrivalDate
                            ? new Date(prc.expectedArrivalDate).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : prc.receivedAt
                            ? new Date(prc.receivedAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '—'}
                        </span>
                      </span>
                    </div>

                    {prc.receivedAt && (
                      <div className="p-2 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 col-span-2 sm:col-span-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          {t('parcel_receiving_gate', 'Receiving Gate')}
                        </span>
                        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                            {prc.receivingGateName || 'Gate'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(prc.receivedAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    )}

                    {prc.deliveredAt && (
                      <div className="p-2 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 col-span-2 sm:col-span-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          {isUrdu ? 'حوالگی کا گیٹ اور وقت' : 'Delivery Gate & Time'}
                        </span>
                        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            {prc.deliveryGateName || prc.receivingGateName || 'Gate'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(prc.deliveredAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes (if any) */}
                  {prc.notes && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {t('notes_label', 'Notes')}:{' '}
                      </span>
                      <span className="break-words">{prc.notes}</span>
                    </div>
                  )}

                  {/* Card Actions Row */}
                  {(prc.photoUrl || prc.status === 'EXPECTED' || prc.status === 'RECEIVED') && (
                    <div className="flex items-center gap-2 pt-1">
                      {prc.photoUrl && (
                        <button
                          type="button"
                          onClick={() => setPhotoPreviewParcel(prc)}
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isUrdu ? 'تصویر' : 'Photo'}</span>
                        </button>
                      )}

                      {prc.status === 'EXPECTED' && (
                        <button
                          type="button"
                          onClick={() => openReceiveModal(prc)}
                          className="flex-1 py-2.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 shrink-0" />
                          <span>{t('receive_parcel_btn', 'Receive Parcel')}</span>
                        </button>
                      )}

                      {prc.status === 'RECEIVED' && (
                        <button
                          type="button"
                          disabled={deliveringId === prc.id}
                          onClick={() => handleDeliverParcel(prc)}
                          className="flex-1 py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {deliveringId === prc.id
                              ? isUrdu
                                ? 'حوالے ہو رہا ہے...'
                                : 'Delivering...'
                              : t('deliver_parcel_btn', 'Deliver Parcel')}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ================================================================= */}
            {/* DESKTOP TABLE (md+)                                               */}
            {/* ================================================================= */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[920px]">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">{t('parcel_owner_name', 'Owner Name')}</th>
                  <th className="px-4 py-3.5">{t('parcel_from', 'Parcel From')}</th>
                  <th className="px-4 py-3.5">{t('parcel_expected_date', 'Arrival Date')}</th>
                  <th className="px-4 py-3.5">{t('parcel_receiving_gate', 'Receiving Gate')}</th>
                  <th className="px-4 py-3.5">{isUrdu ? 'حوالگی کا وقت' : 'Delivery Gate & Time'}</th>
                  <th className="px-4 py-3.5">{isUrdu ? 'حیثیت' : 'Status'}</th>
                  <th className="px-5 py-3.5 text-right">{t('actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredParcels.map((prc) => (
                  <tr
                    key={prc.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0">
                          {prc.photoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={prc.photoUrl}
                              alt={prc.ownerName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">
                            {prc.ownerName}
                          </p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span className="font-mono">{prc.ownerPhone}</span>
                            </span>
                            <span>&bull;</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                              <Building2 className="w-3 h-3" />
                              {prc.departmentName}
                            </span>
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-extrabold text-xs">
                        <Truck className="w-3.5 h-3.5" />
                        {prc.senderPlatform}
                      </span>
                      {(prc.senderName || prc.senderPhone) && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-semibold">{prc.senderName}</span>
                          {prc.senderName && prc.senderPhone ? ' • ' : ''}
                          {prc.senderPhone && <span className="font-mono">{prc.senderPhone}</span>}
                        </p>
                      )}
                      {prc.notes && (
                        <p className="text-[11px] text-slate-400 italic mt-1 max-w-[180px] truncate">
                          {prc.notes}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                          prc.source === 'EXPECTED'
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {prc.source === 'EXPECTED'
                          ? t('parcel_status_expected', 'Expected')
                          : isUrdu
                          ? 'غیر متوقع'
                          : 'Unexpected'}
                      </span>
                      {prc.expectedArrivalDate && (
                        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(prc.expectedArrivalDate).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {prc.receivedAt ? (
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            {prc.receivingGateName || 'Gate'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {new Date(prc.receivedAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {prc.receivedByName && (
                            <p className="text-[10px] text-slate-400">by {prc.receivedByName}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">
                          {isUrdu ? 'ابھی وصول نہیں ہوا' : 'Not Received Yet'}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {prc.deliveredAt ? (
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            {prc.deliveryGateName || prc.receivingGateName || 'Gate'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {new Date(prc.deliveredAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {prc.deliveredByName && (
                            <p className="text-[10px] text-slate-400">by {prc.deliveredByName}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          prc.status === 'RECEIVED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : prc.status === 'DELIVERED'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                        }`}
                      >
                        {prc.status === 'RECEIVED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            {t('parcel_status_received', 'Received')}
                          </>
                        ) : prc.status === 'DELIVERED' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            {t('parcel_status_delivered', 'Delivered')}
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            {t('parcel_status_expected', 'Expected')}
                          </>
                        )}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {prc.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoPreviewParcel(prc)}
                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                            title="View Parcel Photo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {prc.status === 'EXPECTED' && (
                          <button
                            type="button"
                            onClick={() => openReceiveModal(prc)}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>{t('receive_parcel_btn', 'Receive Parcel')}</span>
                          </button>
                        )}

                        {prc.status === 'RECEIVED' && (
                          <button
                            type="button"
                            disabled={deliveringId === prc.id}
                            onClick={() => handleDeliverParcel(prc)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {deliveringId === prc.id
                                ? isUrdu
                                  ? 'حوالے ہو رہا ہے...'
                                  : 'Delivering...'
                                : t('deliver_parcel_btn', 'Deliver Parcel')}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/* RECEIVE EXPECTED PARCEL MODAL (Verify Details + Capture Photo)    */}
      {/* ================================================================= */}
      {receivingTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-auto animate-in fade-in-0 zoom-in-95">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className={isUrdu ? 'text-right' : 'text-left'}>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">
                  {t('receive_parcel_btn', 'Receive Parcel')}
                </span>
                <h3 className="text-base sm:text-lg font-extrabold mt-0.5">
                  {receivingTarget.ownerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setReceivingTarget(null);
                }}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReceiveExpected} className="p-6 space-y-4">
              {receiveError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{receiveError}</span>
                </div>
              )}

              {/* Pre-filled Employee Reminder Details for Verification */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">{t('parcel_owner_name', 'Owner Name')}</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {receivingTarget.ownerName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">{t('emp_phone', 'Phone Number')}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {receivingTarget.ownerPhone}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">{t('emp_department', 'Department')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {receivingTarget.departmentName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">{t('parcel_from', 'Parcel From')}</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">
                    {receivingTarget.senderPlatform}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">{t('parcel_expected_date', 'Arrival Date')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {receivingTarget.expectedArrivalDate
                      ? new Date(receivingTarget.expectedArrivalDate).toLocaleDateString()
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Parcel Photo Capture (Camera only, wave animation, prominent capture button) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('parcel_photo', 'Parcel Photo')} *
                </label>

                {cameraError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">{cameraError}</p>
                )}

                {cameraActive ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-blue-500 bg-slate-950">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-56 object-cover"
                    />
                    {/* Subtle Wave Animation on Camera Capture */}
                    {captureFlash && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full border-4 border-blue-400/80 animate-ping" />
                        <div className="absolute inset-0 bg-blue-500/20 animate-pulse" />
                      </div>
                    )}
                    <div className="p-4 bg-slate-900/95 flex flex-col items-center gap-3">
                      <button
                        type="button"
                        onClick={captureFromCamera}
                        className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-extrabold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2.5 cursor-pointer transition-all"
                      >
                        <Camera className="w-5 h-5" />
                        <span>{t('capture_parcel_photo', 'Capture Parcel Photo')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                      >
                        {t('cancel_btn', 'Cancel')}
                      </button>
                    </div>
                  </div>
                ) : receivePhotoUrl ? (
                  <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-3.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receivePhotoUrl}
                        alt="Parcel"
                        className="w-24 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                      />
                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t('parcel_photo', 'Parcel Photo')}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReceivePhotoUrl(null);
                        void startCamera();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{t('retake_photo', 'Retake Photo')}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-sm font-extrabold flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span>{t('capture_parcel_photo', 'Capture Parcel Photo')}</span>
                  </button>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setReceivingTarget(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {t('cancel_btn', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={receiveSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-500/25 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {receiveSubmitting
                      ? isUrdu
                        ? 'وصول ہو رہا ہے...'
                        : 'Receiving...'
                      : t('receive_parcel_btn', 'Receive Parcel')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* RECEIVING / DELIVERY CONFIRMATION MODAL                           */}
      {/* ================================================================= */}
      {confirmationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
            <div
              className={`px-6 py-5 text-white flex items-center justify-between ${
                confirmationModal.type === 'RECEIVED'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">
                    {confirmationModal.type === 'RECEIVED'
                      ? 'Parcel Receiving Confirmation'
                      : 'Parcel Delivery Confirmation'}
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold mt-0.5">
                    {confirmationModal.type === 'RECEIVED'
                      ? `Parcel Received at ${confirmationModal.parcel.receivingGateName || 'Gate'}`
                      : `Parcel Delivered to ${confirmationModal.parcel.ownerName}`}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmationModal(null)}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {confirmationModal.type === 'RECEIVED'
                  ? `Parcel status has been updated to Received and ${confirmationModal.parcel.ownerName} has been notified that their parcel is available at ${confirmationModal.parcel.receivingGateName || 'the gate'}.`
                  : `Parcel status has been updated to Delivered and ${confirmationModal.parcel.ownerName} has been notified.`}
              </p>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Employee / Owner</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {confirmationModal.parcel.ownerName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Department &amp; Phone</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {confirmationModal.parcel.departmentName} &bull;{' '}
                    {confirmationModal.parcel.ownerPhone}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Sender / Platform</span>
                  <span className="font-extrabold text-amber-600 dark:text-amber-400">
                    {confirmationModal.parcel.senderPlatform}
                  </span>
                </div>
                {(confirmationModal.parcel.senderName || confirmationModal.parcel.senderPhone) && (
                  <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                    <span className="text-slate-500">Parcel Sender</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {confirmationModal.parcel.senderName}
                      {confirmationModal.parcel.senderName && confirmationModal.parcel.senderPhone
                        ? ' • '
                        : ''}
                      {confirmationModal.parcel.senderPhone}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Receiving Gate</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {confirmationModal.parcel.receivingGateName || '—'}
                  </span>
                </div>
                {confirmationModal.type === 'DELIVERED' && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Delivered At</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {confirmationModal.parcel.deliveredAt
                        ? new Date(confirmationModal.parcel.deliveredAt).toLocaleString()
                        : new Date().toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmationModal(null)}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-extrabold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {photoPreviewParcel && photoPreviewParcel.photoUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {photoPreviewParcel.ownerName} &bull; {photoPreviewParcel.senderPlatform}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Received at {photoPreviewParcel.receivingGateName || 'Gate'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoPreviewParcel(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreviewParcel.photoUrl}
                alt="Parcel"
                className="w-full max-h-80 object-contain rounded-xl bg-slate-950"
              />
            </div>
          </div>
        </div>
      )}

      {/* Unexpected Parcel Modal */}
      <UnexpectedParcelModal
        isOpen={isUnexpectedOpen}
        onClose={() => setIsUnexpectedOpen(false)}
        onSuccess={() => {
          void fetchParcels();
        }}
      />
    </div>
  );
}
