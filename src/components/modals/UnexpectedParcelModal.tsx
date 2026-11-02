'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Package,
  Camera,
  CheckCircle2,
  AlertCircle,
  Truck,
  User,
  Phone,
  Building2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import type { ParcelRow } from '@/app/api/employee/parcels/route';

interface DepartmentOption {
  id: string;
  name: string;
}

interface UnexpectedParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (parcel: ParcelRow) => void;
  onOpenParcelTracker?: () => void;
}

const PARCEL_FROM_OPTIONS = ['Foodpanda', 'TCS', 'Bank', 'Other'] as const;
type ParcelFromOption = (typeof PARCEL_FROM_OPTIONS)[number];

function validateAppPhoneNumber(raw: string): { valid: boolean; cleaned: string } {
  const cleaned = raw.trim().replace(/[\s\-()]+/g, '');
  if (!cleaned) {
    return { valid: false, cleaned: '' };
  }
  const isPakLocal = /^03\d{9}$/.test(cleaned);
  const isInternational = /^\+?[1-9]\d{9,14}$/.test(cleaned);
  return {
    valid: isPakLocal || isInternational,
    cleaned,
  };
}

export default function UnexpectedParcelModal({
  isOpen,
  onClose,
  onSuccess,
  onOpenParcelTracker,
}: UnexpectedParcelModalProps) {
  const { language, t } = useLanguage();
  const isUrdu = language === 'ur';

  // Dynamic departments from Admin Panel
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState<boolean>(false);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);

  // Form state (Fields 1–5 + Parcel From + Photo + Notes)
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [parcelFromOption, setParcelFromOption] = useState<ParcelFromOption | ''>('');
  const [customSender, setCustomSender] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Submission & Confirmation state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedParcel, setConfirmedParcel] = useState<ParcelRow | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const loadDepartments = useCallback(async () => {
    setDepartmentsLoading(true);
    setDepartmentsError(null);
    try {
      const res = await fetch('/api/departments?activeOnly=true', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to load departments');
      }
      const data = await res.json();
      if (Array.isArray(data.departments)) {
        setDepartments(
          data.departments.map((d: { id: string; name: string }) => ({
            id: d.id,
            name: d.name,
          }))
        );
      } else {
        setDepartments([]);
      }
    } catch {
      setDepartmentsError(
        t('departments_load_error', 'Unable to load departments. Please try again.')
      );
    } finally {
      setDepartmentsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    void loadDepartments();
    return () => {
      stopCamera();
    };
  }, [isOpen, loadDepartments, stopCamera]);

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
      setTimeout(() => setCaptureFlash(false), 260);
      setPhotoUrl(canvas.toDataURL('image/jpeg', 0.84));
      stopCamera();
    }
  };

  const resetForm = () => {
    setSenderName('');
    setSenderPhone('');
    setEmployeeName('');
    setEmployeePhone('');
    setSelectedDepartmentId('');
    setParcelFromOption('');
    setCustomSender('');
    setNotes('');
    setPhotoUrl(null);
    setError(null);
    setConfirmedParcel(null);
    stopCamera();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedSenderName = senderName.trim().replace(/\s+/g, ' ');
    if (!trimmedSenderName) {
      setError(
        isUrdu
          ? 'براہ کرم پارسل بھیجنے والے کا نام درج کریں۔'
          : 'Parcel Sender Name is required.'
      );
      return;
    }

    const senderPhoneValidation = validateAppPhoneNumber(senderPhone);
    if (!senderPhoneValidation.valid) {
      setError(
        isUrdu
          ? 'براہ کرم پارسل بھیجنے والے کا درست فون نمبر درج کریں (مثلاً 03001234567)۔'
          : 'Please enter a valid Parcel Sender Phone Number (e.g., 03001234567).'
      );
      return;
    }

    const trimmedEmployeeName = employeeName.trim().replace(/\s+/g, ' ');
    if (!trimmedEmployeeName) {
      setError(
        isUrdu
          ? 'براہ کرم ملازم کا نام درج کریں۔'
          : 'Employee Name is required.'
      );
      return;
    }

    const employeePhoneValidation = validateAppPhoneNumber(employeePhone);
    if (!employeePhoneValidation.valid) {
      setError(
        isUrdu
          ? 'براہ کرم ملازم کا درست فون نمبر درج کریں (مثلاً 03001234567)۔'
          : 'Please enter a valid Employee Phone Number (e.g., 03001234567).'
      );
      return;
    }

    const selectedDept = departments.find((d) => d.id === selectedDepartmentId);
    if (!selectedDepartmentId || !selectedDept) {
      setError(
        isUrdu
          ? 'براہ کرم ملازم کا شعبہ (ڈیپارٹمنٹ) منتخب کریں۔'
          : 'Please select an Employee Department.'
      );
      return;
    }

    const resolvedSender =
      parcelFromOption === 'Other' ? customSender.trim() : parcelFromOption;

    if (!resolvedSender) {
      setError(
        parcelFromOption === 'Other'
          ? isUrdu
            ? 'براہ کرم بھیجنے والے کا نام درج کریں۔'
            : 'Please enter the sender name.'
          : isUrdu
          ? 'براہ کرم پارسل کا ذریعہ (Parcel From) منتخب کریں۔'
          : 'Please select Parcel From.'
      );
      return;
    }

    if (!photoUrl) {
      setError(
        isUrdu
          ? 'براہ کرم پارسل کی تصویر لیں۔'
          : 'Please capture a Parcel Photo.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: trimmedSenderName,
          senderPhone: senderPhoneValidation.cleaned,
          ownerName: trimmedEmployeeName,
          ownerPhone: employeePhoneValidation.cleaned,
          departmentId: selectedDept.id,
          departmentName: selectedDept.name,
          senderPlatform: resolvedSender,
          photoUrl,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error ||
            (isUrdu
              ? 'پارسل محفوظ نہیں ہو سکا۔'
              : 'Failed to register and receive parcel.')
        );
        return;
      }

      setConfirmedParcel(data.parcel);
      if (onSuccess && data.parcel) {
        onSuccess(data.parcel);
      }
    } catch {
      setError(
        isUrdu
          ? 'نیٹ ورک کا مسئلہ ہے۔ دوبارہ کوشش کریں۔'
          : 'Network error while receiving parcel. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const getOptionLabel = (opt: ParcelFromOption) => {
    if (opt === 'Other') return isUrdu ? 'دیگر (Other)' : 'Other';
    if (opt === 'Bank') return isUrdu ? 'بینک (Bank)' : 'Bank';
    return opt;
  };

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-auto animate-in fade-in-0 zoom-in-95">
        {/* Header — Consistent GateShield Blue Theme */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div className={`min-w-0 flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
              <h2 dir="auto" className="text-base sm:text-lg font-extrabold leading-tight truncate">
                {confirmedParcel
                  ? isUrdu
                    ? 'پارسل وصولی کی تصدیق'
                    : 'Parcel Received'
                  : t('unexpected_parcel_title', 'Unexpected Parcel')}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* RECEIVING CONFIRMATION SCREEN                                     */}
        {/* ================================================================= */}
        {confirmedParcel ? (
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                  {t('status_received', 'Received')}
                </span>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  {isUrdu
                    ? `پارسل ${confirmedParcel.receivingGateName || 'گیٹ'} پر وصول ہو گیا`
                    : `Parcel Received at ${confirmedParcel.receivingGateName || 'Gate'}`}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {isUrdu
                    ? `${confirmedParcel.ownerName} (${confirmedParcel.departmentName}) کو اطلاع بھیج دی گئی ہے۔`
                    : `Notification sent to ${confirmedParcel.ownerName} (${confirmedParcel.departmentName}).`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              {confirmedParcel.photoUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 h-40 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={confirmedParcel.photoUrl}
                    alt="Received Parcel"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="sm:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2 text-xs">
                {confirmedParcel.senderName && (
                  <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                    <span className="text-slate-500">
                      {t('parcel_sender_name_label', 'Parcel Sender Name')}
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {confirmedParcel.senderName}
                    </span>
                  </div>
                )}
                {confirmedParcel.senderPhone && (
                  <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                    <span className="text-slate-500">
                      {t('parcel_sender_phone_label', 'Parcel Sender Phone Number')}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {confirmedParcel.senderPhone}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">
                    {t('employee_name_label', 'Employee Name')}
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {confirmedParcel.ownerName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">
                    {t('employee_phone_label', 'Employee Phone Number')}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {confirmedParcel.ownerPhone}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">
                    {t('employee_department_label', 'Employee Department')}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {confirmedParcel.departmentName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">{t('parcel_from_label', 'Parcel From')}</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">
                    {confirmedParcel.senderPlatform}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">{t('receiving_gate_label', 'Receiving Gate')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {confirmedParcel.receivingGateName}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">{isUrdu ? 'وصولی کا وقت' : 'Received At'}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {confirmedParcel.receivedAt
                      ? new Date(confirmedParcel.receivedAt).toLocaleString()
                      : new Date().toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isUrdu ? 'ایک اور پارسل درج کریں' : 'Register Another Parcel'}
              </button>
              {onOpenParcelTracker && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onClose();
                    onOpenParcelTracker();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  {t('parcel_tracker_title', 'Parcel Tracker')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md cursor-pointer"
              >
                {t('close', 'Close')}
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* UNEXPECTED PARCEL REGISTRATION FORM                               */
          /* ================================================================= */
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Parcel Sender Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('parcel_sender_name_label', 'Parcel Sender Name')} *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder={t('parcel_sender_name_placeholder', 'Enter parcel sender name')}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 2. Parcel Sender Phone Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('parcel_sender_phone_label', 'Parcel Sender Phone Number')} *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder={t('parcel_sender_phone_placeholder', 'e.g. 03001234567')}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 3. Employee Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('employee_name_label', 'Employee Name')} *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder={t('employee_name_placeholder', 'Enter employee name')}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 4. Employee Phone Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('employee_phone_label', 'Employee Phone Number')} *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={employeePhone}
                  onChange={(e) => setEmployeePhone(e.target.value)}
                  placeholder={t('employee_phone_placeholder', 'e.g. 03001234567')}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 5. Employee Department — Dynamic Dropdown from Admin Panel */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('employee_department_label', 'Employee Department')} *
              </label>
              <div className="relative">
                {departmentsLoading ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                ) : (
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
                <select
                  required
                  disabled={departmentsLoading || departments.length === 0}
                  value={selectedDepartmentId}
                  onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">
                    {departmentsLoading
                      ? t('loading_departments', 'Loading departments...')
                      : departments.length === 0
                      ? t(
                          'no_departments_available',
                          'No departments available. Please configure departments in the Admin Panel.'
                        )
                      : t('select_department_placeholder', 'Select Department')}
                  </option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              {departmentsError && (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <span>{departmentsError}</span>
                  <button
                    type="button"
                    onClick={() => void loadDepartments()}
                    className="font-bold underline cursor-pointer shrink-0"
                  >
                    {t('retry', 'Retry')}
                  </button>
                </div>
              )}
              {!departmentsLoading && !departmentsError && departments.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  {t(
                    'no_departments_available',
                    'No departments available. Please configure departments in the Admin Panel.'
                  )}
                </p>
              )}
            </div>

            {/* 6. Parcel From (Foodpanda, TCS, Bank, Other) */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('parcel_from_label', 'Parcel From')} *
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PARCEL_FROM_OPTIONS.map((opt) => {
                  const selected = parcelFromOption === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setParcelFromOption(opt)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        selected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5 shrink-0" />
                      <span>{getOptionLabel(opt)}</span>
                    </button>
                  );
                })}
              </div>

              {parcelFromOption === 'Other' && (
                <div className="pt-1">
                  <input
                    type="text"
                    required
                    value={customSender}
                    onChange={(e) => setCustomSender(e.target.value)}
                    placeholder={t('other_sender_placeholder', 'Enter sender name')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* 3. Parcel Photo Capture (Camera Only + Subtle Wave Animation + Prominent Capture Button) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('parcel_photo_label', 'Parcel Photo')} *
              </label>

              {cameraError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">{cameraError}</p>
              )}

              {cameraActive ? (
                <div className="rounded-2xl overflow-hidden border-2 border-blue-500 bg-slate-950 shadow-lg">
                  <div className="relative h-64 w-full bg-slate-950 overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Subtle Wave Animation Overlay while capturing */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-blue-400/80 to-transparent animate-pulse" />
                      <div className="absolute inset-4 rounded-2xl border border-blue-400/35 pointer-events-none flex items-center justify-center">
                        <span className="w-28 h-28 rounded-full border border-blue-400/25 animate-ping" />
                      </div>
                    </div>

                    {captureFlash && (
                      <div className="absolute inset-0 bg-white animate-out fade-out duration-300 pointer-events-none" />
                    )}
                  </div>

                  {/* Prominent, Large Capture Button Area well-separated from other controls */}
                  <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={captureFromCamera}
                      className="w-full sm:w-auto min-w-[220px] py-3.5 px-8 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-sm font-extrabold shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2.5 cursor-pointer transition-all"
                    >
                      <Camera className="w-5 h-5" />
                      <span>{t('capture_parcel_photo_btn', 'Capture Photo')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-200 py-1 px-3 cursor-pointer"
                    >
                      {t('cancel_btn', 'Cancel')}
                    </button>
                  </div>
                </div>
              ) : photoUrl ? (
                <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 h-48 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt="Parcel Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('photo_attached_badge', 'Photo Attached ✓')}
                    </span>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{t('retake_photo_btn', 'Retake Photo')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-sm font-extrabold flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span>{t('open_camera_btn', 'Open Camera')}</span>
                </button>
              )}
            </div>

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

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {t('cancel_btn', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-600/25 flex items-center gap-2 cursor-pointer"
              >
                <Package className="w-4 h-4" />
                <span>
                  {submitting
                    ? t('submitting_btn', 'Submitting...')
                    : t('receive_parcel_btn', 'Receive Parcel')}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
