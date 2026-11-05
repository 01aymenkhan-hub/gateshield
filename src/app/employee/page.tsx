'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  UserPlus,
  Users,
  Bell,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  Briefcase,
  Phone,
  Mail,
  Lock,
  Calendar,
  RefreshCw,
  LogOut,
  Sun,
  Moon,
  Languages,
  Upload,
  X,
  Sparkles,
  DoorOpen,
  Search,
  RotateCcw,
  Package,
  Truck,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Eye,
} from 'lucide-react';
import GatekeeperLoader from '@/components/ui/GatekeeperLoader';
import GateShieldLogo from '@/components/ui/GateShieldLogo';
import PasswordInput from '@/components/ui/PasswordInput';
import PasswordRecoveryPanel from '@/components/auth/PasswordRecoveryPanel';
import type { EmployeeAuthUser } from '@/lib/auth';
import type {
  GuestInvitationRecord,
  EmployeeNotificationRecord,
} from '@/app/api/employee/invitations/route';
import type { ParcelRow } from '@/app/api/employee/parcels/route';

interface DepartmentOption {
  id: string;
  name: string;
}

const ESTIMATED_ARRIVAL_SLOTS = [
  '8 AM – 9 AM',
  '9 AM – 10 AM',
  '10 AM – 11 AM',
  '11 AM – 12 PM',
  '12 PM – 1 PM',
  '1 PM – 2 PM',
  '2 PM – 3 PM',
  '3 PM – 4 PM',
  '4 PM – 5 PM',
  '5 PM – 6 PM',
  '6 PM – 7 PM',
  '7 PM – 8 PM',
  '8 PM – 9 PM',
  '9 PM – 10 PM',
  '10 PM – 11 PM',
  '11 PM – 12 AM',
  '12 AM – 1 AM',
  '1 AM – 2 AM',
  '2 AM – 3 AM',
  '3 AM – 4 AM',
  '4 AM – 5 AM',
  '5 AM – 6 AM',
  '6 AM – 7 AM',
  '7 AM – 8 AM',
];

function formatCnicInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function EmployeePortalPage() {
  const { theme, toggleTheme } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const isUrdu = language === 'ur';

  // Portal state
  const [initialLoading, setInitialLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | null>(
    null
  );
  const [employee, setEmployee] = useState<EmployeeAuthUser | null>(null);
  const [applicant, setApplicant] = useState<EmployeeAuthUser | null>(null);

  // Auth tabs: 'login' | 'register' | 'forgot'
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration fields
  const [regFullName, setRegFullName] = useState('');
  const [regDepartmentId, setRegDepartmentId] = useState('');
  const [regPosition, setRegPosition] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Approved Employee Dashboard section:
  // 'HOME' (Two prominent clickable cards: Guest Management & Parcel Management)
  // 'GUESTS' (Card A: Guest Management -> Invite Guest & Visited Guests)
  // 'PARCELS' (Card B: Parcel Management -> Add Parcel Reminder & Arrived Parcels)
  const [activeSection, setActiveSection] = useState<'HOME' | 'GUESTS' | 'PARCELS'>('HOME');

  // Guest Management sub-tabs: 'INVITE' | 'HISTORY'
  const [activeAction, setActiveAction] = useState<'INVITE' | 'HISTORY'>('INVITE');
  const [invitations, setInvitations] = useState<GuestInvitationRecord[]>([]);

  // Parcel Management sub-tabs: 'REMINDER' | 'ARRIVED'
  const [parcelTab, setParcelTab] = useState<'REMINDER' | 'ARRIVED'>('REMINDER');
  const [parcels, setParcels] = useState<ParcelRow[]>([]);
  const [parcelSearch, setParcelSearch] = useState('');
  const [parcelStatusFilter, setParcelStatusFilter] = useState<
    'ALL' | 'EXPECTED' | 'RECEIVED' | 'DELIVERED'
  >('ALL');
  const [previewParcelPhoto, setPreviewParcelPhoto] = useState<ParcelRow | null>(null);

  // Add Parcel Reminder form state
  const [parcelOwnerName, setParcelOwnerName] = useState('');
  const [parcelSenderPlatform, setParcelSenderPlatform] = useState('');
  const [parcelExpectedDate, setParcelExpectedDate] = useState(getTodayDateString());
  const [parcelOwnerPhone, setParcelOwnerPhone] = useState('');
  const [parcelDepartmentId, setParcelDepartmentId] = useState('');
  const [parcelNotes, setParcelNotes] = useState('');
  const [parcelSubmitting, setParcelSubmitting] = useState(false);
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [parcelErrorField, setParcelErrorField] = useState<string | null>(null);
  const [parcelSuccess, setParcelSuccess] = useState<string | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState<EmployeeNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [liveArrivalBanner, setLiveArrivalBanner] = useState<EmployeeNotificationRecord | null>(
    null
  );
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const initialNotificationsLoadedRef = useRef(false);

  // Invite Guest Form state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCnic, setGuestCnic] = useState('');
  const [alongWith, setAlongWith] = useState('');
  const [guestPhotoUrl, setGuestPhotoUrl] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(getTodayDateString());
  const [expectedArrivalTime, setExpectedArrivalTime] = useState('12 PM – 1 PM');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Visited Guests search & filter
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<
    'ALL' | 'PENDING' | 'CHECKED_IN' | 'CHECKED_OUT'
  >('ALL');

  // Re-invite Modal state
  const [reinviteTarget, setReinviteTarget] = useState<GuestInvitationRecord | null>(null);
  const [reinviteGuestName, setReinviteGuestName] = useState('');
  const [reinvitePhone, setReinvitePhone] = useState('');
  const [reinviteCnic, setReinviteCnic] = useState('');
  const [reinviteAlongWith, setReinviteAlongWith] = useState('');
  const [reinvitePhotoUrl, setReinvitePhotoUrl] = useState<string | null>(null);
  const [reinviteDate, setReinviteDate] = useState(getTodayDateString());
  const [reinviteTime, setReinviteTime] = useState('12 PM – 1 PM');
  const [reinviteSubmitting, setReinviteSubmitting] = useState(false);
  const [reinviteError, setReinviteError] = useState<string | null>(null);

  // Check URL query params for deep-linking (e.g. ?section=parcels&tab=arrived)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sec = params.get('section')?.toLowerCase();
    const tab = params.get('tab')?.toLowerCase();
    if (sec === 'parcels') {
      setActiveSection('PARCELS');
      if (tab === 'arrived') setParcelTab('ARRIVED');
      else if (tab === 'reminder') setParcelTab('REMINDER');
    } else if (sec === 'guests') {
      setActiveSection('GUESTS');
      if (tab === 'history') setActiveAction('HISTORY');
      else if (tab === 'invite') setActiveAction('INVITE');
    }
  }, []);

  // Load active departments for registration & parcel reminder dropdowns
  useEffect(() => {
    let active = true;
    const fetchDepartments = async () => {
      try {
        const res = await fetch('/api/departments?activeOnly=true');
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.departments)) {
            setDepartments(data.departments);
            if (data.departments.length > 0 && !regDepartmentId) {
              setRegDepartmentId(data.departments[0].id);
            }
          }
        }
      } catch {
        // Non-fatal
      }
    };
    fetchDepartments();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill parcel reminder defaults when employee session loads
  useEffect(() => {
    if (employee) {
      setParcelOwnerName((prev) => prev || employee.name || '');
      setParcelOwnerPhone((prev) => prev || employee.phoneNumber || '');
      if (employee.departmentId) {
        setParcelDepartmentId((prev) => prev || employee.departmentId || '');
      } else if (departments.length > 0) {
        const matched = departments.find(
          (d) =>
            employee.departmentName &&
            d.name.toLowerCase() === employee.departmentName.toLowerCase()
        );
        setParcelDepartmentId((prev) => prev || matched?.id || departments[0].id);
      }
    }
  }, [employee, departments]);

  // Poll / check employee status (used on initial load AND while applicant is PENDING or REJECTED)
  const statusRequestInFlightRef = useRef(false);
  const checkEmployeeStatus = useCallback(async () => {
    if (statusRequestInFlightRef.current) return;
    statusRequestInFlightRef.current = true;
    try {
      const res = await fetch('/api/employee/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAuthenticated(Boolean(data.authenticated));
        setApprovalStatus(data.approvalStatus || null);
        setEmployee(data.employee || null);
        setApplicant(data.applicant || null);
      }
    } catch {
      // Ignore transient network errors during polling
    } finally {
      statusRequestInFlightRef.current = false;
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      void checkEmployeeStatus();
    }, 0);
    return () => clearTimeout(initTimer);
  }, [checkEmployeeStatus]);

  // Real-time polling while applicant is on PENDING or REJECTED screen
  useEffect(() => {
    if (authenticated || (approvalStatus !== 'PENDING' && approvalStatus !== 'REJECTED')) {
      return;
    }
    const interval = setInterval(() => {
      void checkEmployeeStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [authenticated, approvalStatus, checkEmployeeStatus]);

  // Poll employee invitations, parcels, & notifications when authenticated & APPROVED
  const invitationsRequestInFlightRef = useRef(false);
  const fetchEmployeeInvitationsAndNotifications = useCallback(async () => {
    if (!authenticated || approvalStatus !== 'APPROVED') return;
    if (invitationsRequestInFlightRef.current) return;
    invitationsRequestInFlightRef.current = true;
    try {
      const [invRes, prcRes] = await Promise.all([
        fetch('/api/employee/invitations', { cache: 'no-store' }),
        fetch('/api/employee/parcels', { cache: 'no-store' }),
      ]);

      if (invRes.status === 401 || invRes.status === 403) {
        await checkEmployeeStatus();
        return;
      }

      if (invRes.ok) {
        const data = await invRes.json();
        if (Array.isArray(data.invitations)) {
          setInvitations(data.invitations);
        }
        if (Array.isArray(data.notifications)) {
          const incoming: EmployeeNotificationRecord[] = data.notifications;
          if (!initialNotificationsLoadedRef.current) {
            incoming.forEach((n) => knownNotificationIdsRef.current.add(n.id));
            initialNotificationsLoadedRef.current = true;
          } else {
            const brandNewAlert = incoming.find(
              (n) =>
                !knownNotificationIdsRef.current.has(n.id) &&
                (n.type === 'GUEST_ARRIVED' ||
                  n.type === 'PARCEL_RECEIVED' ||
                  n.type === 'PARCEL_DELIVERED')
            );
            incoming.forEach((n) => knownNotificationIdsRef.current.add(n.id));
            if (brandNewAlert) {
              setLiveArrivalBanner(brandNewAlert);
            }
          }
          setNotifications(incoming);
        }
        if (typeof data.unreadNotificationCount === 'number') {
          setUnreadCount(data.unreadNotificationCount);
        }
      }

      if (prcRes.ok) {
        const prcData = await prcRes.json();
        if (Array.isArray(prcData.parcels)) {
          setParcels(prcData.parcels);
        }
      }
    } catch {
      // Non-fatal polling error
    } finally {
      invitationsRequestInFlightRef.current = false;
    }
  }, [authenticated, approvalStatus, checkEmployeeStatus]);

  useEffect(() => {
    if (!authenticated || approvalStatus !== 'APPROVED') return;
    const initTimer = setTimeout(() => {
      void fetchEmployeeInvitationsAndNotifications();
    }, 0);
    const interval = setInterval(() => {
      void fetchEmployeeInvitationsAndNotifications();
    }, 5000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [authenticated, approvalStatus, fetchEmployeeInvitationsAndNotifications]);

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMsg(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/employee/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Failed to sign in.');
        return;
      }

      setAuthenticated(Boolean(data.authenticated));
      setApprovalStatus(data.approvalStatus || null);
      setEmployee(data.employee || null);
      setApplicant(data.applicant || data.employee || null);
      setLoginPassword('');
    } catch {
      setAuthError('Network error while signing in. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmployeeRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMsg(null);

    if (regPassword !== regConfirmPassword) {
      setAuthError('Password and Confirm Password do not match.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/employee/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: regFullName.trim(),
          departmentId: regDepartmentId,
          position: regPosition.trim(),
          phoneNumber: regPhone.trim(),
          email: regEmail.trim(),
          password: regPassword,
          confirmPassword: regConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Failed to submit registration request.');
        return;
      }

      setAuthenticated(false);
      setApprovalStatus('PENDING');
      setApplicant(data.applicant || null);
      setRegPassword('');
      setRegConfirmPassword('');
      setAuthSuccessMsg(
        data.message ||
          'Registration request submitted! Your status will update automatically once reviewed by Admin.'
      );
    } catch {
      setAuthError('Network error while submitting registration. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmployeeLogout = async () => {
    try {
      await fetch('/api/employee/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setAuthenticated(false);
    setApprovalStatus(null);
    setEmployee(null);
    setApplicant(null);
    setInvitations([]);
    setParcels([]);
    setNotifications([]);
    setUnreadCount(0);
    setActiveSection('HOME');
    knownNotificationIdsRef.current.clear();
    initialNotificationsLoadedRef.current = false;
  };

  const handlePhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onPhotoReady: (dataUrl: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 480;
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          onPhotoReady(canvas.toDataURL('image/jpeg', 0.82));
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    setInviteSubmitting(true);
    try {
      const idempotencyKey = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const res = await fetch('/api/employee/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim(),
          guestCnic: guestCnic.trim() || undefined,
          alongWith: alongWith.trim() || undefined,
          guestPhotoUrl,
          visitDate,
          expectedArrivalTime,
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Failed to create guest invitation.');
        return;
      }

      setInviteSuccess(
        isUrdu
          ? `${guestName.trim()} (${visitDate}, ${expectedArrivalTime}) کے لیے دعوت نامہ بنا دیا گیا ہے۔`
          : `Invitation created for ${guestName.trim()} (${visitDate}, ${expectedArrivalTime}). All gate operators can now check in this guest under Guest and assign a VC Card Number at the gate.`
      );
      setGuestName('');
      setGuestPhone('');
      setGuestCnic('');
      setAlongWith('');
      setGuestPhotoUrl(null);
      await fetchEmployeeInvitationsAndNotifications();
    } catch {
      setInviteError('Network error while creating invitation. Please try again.');
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleCreateParcelReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setParcelError(null);
    setParcelErrorField(null);
    setParcelSuccess(null);
    setParcelSubmitting(true);

    try {
      const res = await fetch('/api/employee/parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerName: parcelOwnerName.trim(),
          senderPlatform: parcelSenderPlatform.trim(),
          expectedArrivalDate: parcelExpectedDate,
          ownerPhone: parcelOwnerPhone.trim(),
          notes: parcelNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParcelError(data.error || 'Failed to submit parcel reminder.');
        setParcelErrorField(data.field || null);
        return;
      }

      setParcelSuccess(
        isUrdu
          ? `"${parcelSenderPlatform.trim()}" کا پارسل ریمائنڈر (${parcelExpectedDate}) محفوظ کر لیا گیا ہے اور آپریٹر پارسل ٹریکر کو بھیج دیا گیا ہے۔`
          : `Parcel reminder for "${parcelSenderPlatform.trim()}" expected on ${parcelExpectedDate} has been saved with Expected status and sent to the Operator Parcel Tracker.`
      );
      setParcelSenderPlatform('');
      setParcelNotes('');
      await fetchEmployeeInvitationsAndNotifications();
    } catch {
      setParcelError('Network error while submitting parcel reminder. Please try again.');
    } finally {
      setParcelSubmitting(false);
    }
  };

  const openReinviteModal = (record: GuestInvitationRecord) => {
    setReinviteTarget(record);
    setReinviteGuestName(record.guestName);
    setReinvitePhone(record.guestPhone);
    setReinviteCnic(record.guestCnic || '');
    setReinviteAlongWith(record.alongWith || '');
    setReinvitePhotoUrl(record.guestPhotoUrl || null);
    setReinviteDate(getTodayDateString());
    setReinviteTime(
      ESTIMATED_ARRIVAL_SLOTS.includes(record.expectedArrivalTime)
        ? record.expectedArrivalTime
        : '12 PM – 1 PM'
    );
    setReinviteError(null);
  };

  const handleReinviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reinviteTarget) return;
    setReinviteError(null);

    setReinviteSubmitting(true);
    try {
      const idempotencyKey = `reinv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch('/api/employee/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: reinviteGuestName.trim(),
          guestPhone: reinvitePhone.trim(),
          guestCnic: reinviteCnic.trim() || undefined,
          alongWith: reinviteAlongWith.trim() || undefined,
          guestPhotoUrl: reinvitePhotoUrl,
          visitDate: reinviteDate,
          expectedArrivalTime: reinviteTime,
          reinvitedFromId: reinviteTarget.id,
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReinviteError(data.error || 'Failed to re-invite guest.');
        return;
      }

      setReinviteTarget(null);
      setInviteSuccess(
        isUrdu
          ? `${reinviteGuestName.trim()} (${reinviteDate}, ${reinviteTime}) کو دوبارہ مدعو کر لیا گیا ہے۔`
          : `Re-invited ${reinviteGuestName.trim()} (${reinviteDate}, ${reinviteTime}). Shared with all gate operators.`
      );
      await fetchEmployeeInvitationsAndNotifications();
    } catch {
      setReinviteError('Network error while re-inviting guest.');
    } finally {
      setReinviteSubmitting(false);
    }
  };

  const handleMarkNotificationsRead = async (notificationId?: string) => {
    try {
      await fetch('/api/employee/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      await fetchEmployeeInvitationsAndNotifications();
    } catch {
      // Ignore
    }
  };

  if (initialLoading) {
    return (
      <GatekeeperLoader
        variant="fullscreen"
        title={t('loading_gatekeeper', 'Loading Employee Portal...')}
      />
    );
  }

  const filteredHistory = invitations.filter((inv) => {
    if (historyFilter !== 'ALL' && inv.status !== historyFilter) return false;
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    return (
      inv.guestName.toLowerCase().includes(q) ||
      inv.guestPhone.toLowerCase().includes(q) ||
      Boolean(inv.visitorCardNo && inv.visitorCardNo.toLowerCase().includes(q)) ||
      Boolean(inv.guestCnic && inv.guestCnic.toLowerCase().includes(q)) ||
      Boolean(inv.alongWith && inv.alongWith.toLowerCase().includes(q)) ||
      Boolean(inv.entryGateName && inv.entryGateName.toLowerCase().includes(q))
    );
  });

  const filteredParcels = parcels.filter((prc) => {
    if (parcelStatusFilter !== 'ALL' && prc.status !== parcelStatusFilter) return false;
    if (!parcelSearch.trim()) return true;
    const q = parcelSearch.toLowerCase();
    return (
      prc.senderPlatform.toLowerCase().includes(q) ||
      prc.ownerName.toLowerCase().includes(q) ||
      prc.ownerPhone.toLowerCase().includes(q) ||
      prc.departmentName.toLowerCase().includes(q) ||
      Boolean(prc.receivingGateName && prc.receivingGateName.toLowerCase().includes(q)) ||
      Boolean(prc.deliveryGateName && prc.deliveryGateName.toLowerCase().includes(q))
    );
  });

  const expectedParcelCount = parcels.filter((p) => p.status === 'EXPECTED').length;
  const receivedParcelCount = parcels.filter((p) => p.status === 'RECEIVED').length;
  const deliveredParcelCount = parcels.filter((p) => p.status === 'DELIVERED').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header Bar — Fixed LTR layout so switching between Urdu & English never flips header alignment */}
      <header
        dir="ltr"
        className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0c121e]/95 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-30"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (authenticated) setActiveSection('HOME');
            }}
            className="flex items-center gap-2.5 cursor-pointer text-left"
          >
            <GateShieldLogo variant="full" size="md" />
          </button>
          <div className="min-w-0">
            <span
              dir="auto"
              className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-block truncate max-w-full"
            >
              {t('emp_portal_title', 'Employee Portal')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Switch */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{language === 'ur' ? 'English' : 'اردو'}</span>
          </button>

          {/* Theme Switch */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500" />
            )}
          </button>

          {/* Authenticated Employee Controls: Notifications Bell & Logout */}
          {authenticated && employee && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !isNotificationsOpen;
                    setIsNotificationsOpen(nextOpen);
                    if (nextOpen && unreadCount > 0) {
                      handleMarkNotificationsRead();
                    }
                  }}
                  className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
                  title={t('emp_arrival_notifications', 'Guest & Parcel Notifications')}
                >
                  <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <>
                    <div
                      className="fixed inset-0 bg-slate-950/30 backdrop-blur-[1px] z-40 sm:hidden"
                      onClick={() => setIsNotificationsOpen(false)}
                    />
                    <div
                      dir="ltr"
                      className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[75vh] sm:max-h-[24rem] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/50 shrink-0">
                        <span
                          dir="auto"
                          className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 truncate"
                        >
                          {t('emp_arrival_notifications', 'Guest & Parcel Notifications')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsNotificationsOpen(false)}
                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer shrink-0"
                          title={t('close', 'Close')}
                          aria-label={t('close', 'Close')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No notifications yet. You will be notified here in real time when your invited guest arrives or when a parcel is received or delivered at a gate.
                        </div>
                      ) : (
                        notifications.map((n) => {
                          const isParcel =
                            n.type === 'PARCEL_RECEIVED' || n.type === 'PARCEL_DELIVERED';
                          return (
                            <div
                              key={n.id}
                              onClick={() => {
                                setIsNotificationsOpen(false);
                                if (isParcel) {
                                  setActiveSection('PARCELS');
                                  setParcelTab('ARRIVED');
                                } else {
                                  setActiveSection('GUESTS');
                                  setActiveAction('HISTORY');
                                }
                              }}
                              className={`p-3.5 text-xs space-y-1 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70 ${
                                !n.isRead
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30'
                                  : 'bg-white dark:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`font-extrabold flex items-center gap-1.5 ${
                                    isParcel
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {isParcel ? (
                                    <Package className="w-3.5 h-3.5 shrink-0" />
                                  ) : (
                                    <DoorOpen className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  {new Date(n.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                                <p className="text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                                  {n.message}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {employee.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">
                    {employee.departmentName} &bull; {employee.position}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleEmployeeLogout}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('logout', 'Logout')}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        {/* =================================================================== */}
        {/* 1. APPLICANT STATUS VIEW (PENDING OR REJECTED) — REAL-TIME POLLING */}
        {/* =================================================================== */}
        {!authenticated && (approvalStatus === 'PENDING' || approvalStatus === 'REJECTED') && applicant ? (
          <div className="max-w-xl mx-auto mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div
              className={`p-6 text-white ${
                approvalStatus === 'PENDING'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600'
                  : 'bg-gradient-to-r from-rose-600 via-rose-500 to-red-600'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs">
                  {approvalStatus === 'PENDING' ? (
                    <>
                      <Clock className="w-3.5 h-3.5 animate-spin" />
                      PENDING ADMIN APPROVAL
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      NOT APPROVED
                    </>
                  )}
                </span>
                <span className="text-[11px] font-semibold text-white/90 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  Live Status Sync
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold mt-4">
                {approvalStatus === 'PENDING'
                  ? t('emp_status_pending_title', 'Registration Pending Approval')
                  : t('emp_status_rejected_title', 'Registration Request Not Approved')}
              </h2>
              <p className="text-xs sm:text-sm text-white/90 mt-1 leading-relaxed">
                {approvalStatus === 'PENDING'
                  ? t(
                      'emp_status_pending_desc',
                      'Your employee account request has been received. This screen updates automatically as soon as an administrator approves your request.'
                    )
                  : t(
                      'emp_status_rejected_desc',
                      'Your employee registration request was not approved by the administrator.'
                    )}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {authSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{authSuccessMsg}</span>
                </div>
              )}

              {approvalStatus === 'REJECTED' && applicant.rejectionReason && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-rose-600 dark:text-rose-400">
                    Administrator Note
                  </p>
                  <p className="font-medium">{applicant.rejectionReason}</p>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Full Name</span>
                  <span className="font-bold text-slate-900 dark:text-white">{applicant.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Department</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {applicant.departmentName || 'General'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Position</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {applicant.position || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-slate-500">Phone Number</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {applicant.phoneNumber || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Email Address</span>
                  <span className="font-bold text-slate-900 dark:text-white">{applicant.email}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={checkEmployeeStatus}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check Status Now</span>
                </button>

                <button
                  type="button"
                  onClick={handleEmployeeLogout}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          </div>
        ) : !authenticated ? (
          /* =================================================================== */
          /* 2. UNAUTHENTICATED VIEW — EMPLOYEE SIGN IN & REGISTRATION           */
          /* =================================================================== */
          <div className="max-w-lg mx-auto mt-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
              {/* Portal Banner */}
              <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 text-white">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15">
                  GateShield Employee Access
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold mt-2">
                  {t('emp_portal_title', 'Employee Portal')}
                </h2>
                <p className="text-xs text-blue-100 mt-1">
                  {t(
                    'emp_portal_subtitle',
                    'Sign in to manage guests and parcels, or submit a first-time employee registration request.'
                  )}
                </p>
              </div>

              {/* Mode Tabs */}
              <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-1.5 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setAuthError(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    authTab === 'login'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('emp_sign_in_tab', 'Employee Sign In')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setAuthError(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    authTab === 'register'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  }`}
                >
                  {t('emp_register_tab', 'First-Time Registration')}
                </button>
              </div>

              <div className="p-6">
                {authError && (
                  <div className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                {authTab === 'login' ? (
                  <form onSubmit={handleEmployeeLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('emp_email', 'Email Address')} *
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="employee@company.com"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          {t('emp_password', 'Password')} *
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthError(null);
                            setAuthTab('forgot');
                          }}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          {isUrdu ? 'پاس ورڈ بھول گئے؟' : 'Forgot Password?'}
                        </button>
                      </div>
                      <PasswordInput
                        showLockIcon
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                    >
                      {authSubmitting
                        ? 'Signing in...'
                        : t('emp_sign_in_tab', 'Sign In to Employee Portal')}
                    </button>
                  </form>
                ) : authTab === 'register' ? (
                  <form onSubmit={handleEmployeeRegister} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {t('emp_full_name', 'Full Name')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder="e.g. Ahmed Raza"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {t('emp_department', 'Department')} *
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <select
                            required
                            value={regDepartmentId}
                            onChange={(e) => setRegDepartmentId(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="" disabled>
                              Select Department
                            </option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {t('emp_position', 'Position / Designation')} *
                        </label>
                        <div className="relative">
                          <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            required
                            value={regPosition}
                            onChange={(e) => setRegPosition(e.target.value)}
                            placeholder="e.g. Senior Manager"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {t('emp_phone', 'Phone Number')} *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="tel"
                            required
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            placeholder="03001234567"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {t('emp_email', 'Email Address')} *
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            required
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {t('emp_password', 'Password')} *
                        </label>
                        <PasswordInput
                          required
                          minLength={6}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          {t('emp_confirm_password', 'Confirm Password')} *
                        </label>
                        <PasswordInput
                          required
                          minLength={6}
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer mt-2"
                    >
                      {authSubmitting
                        ? 'Submitting Request...'
                        : t('emp_submit_registration', 'Submit Registration Request')}
                    </button>
                  </form>
                ) : authTab === 'forgot' ? (
                  <PasswordRecoveryPanel
                    portalContext="EMPLOYEE"
                    initialEmail={loginEmail}
                    onBackToLogin={(updatedEmail) => {
                      if (updatedEmail) setLoginEmail(updatedEmail);
                      setAuthError(null);
                      setAuthTab('login');
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          /* =================================================================== */
          /* 3. AUTHENTICATED EMPLOYEE DASHBOARD (APPROVED ONLY)                 */
          /*    Landing View: Two Prominent Clickable Cards:                     */
          /*      Card A: Guest Management                                       */
          /*      Card B: Parcel Management                                      */
          /* =================================================================== */
          <div className="space-y-6">
            {/* Real-Time Arrival / Parcel Alert Toast/Banner */}
            {liveArrivalBanner && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg flex items-center justify-between gap-4 animate-in fade-in-0 slide-in-from-top-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-100">
                      {liveArrivalBanner.title}
                    </p>
                    <p className="text-sm font-bold mt-0.5">{liveArrivalBanner.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLiveArrivalBanner(null)}
                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

                {/* =============================================================== */}
                {/* LANDING VIEW: TWO PROMINENT CLICKABLE CARDS                     */}
                {/* =============================================================== */}
                {activeSection === 'HOME' && (
                  <div className="space-y-6 py-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                      <div className={isUrdu ? 'text-right' : 'text-left'}>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          {isUrdu ? `خوش آمدید، ${employee?.name}` : `Welcome Back, ${employee?.name}`}
                        </span>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                          {t('emp_dashboard_heading', 'Employee Self-Service Dashboard')}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {isUrdu
                            ? 'مہمانوں کے انتظام یا پارسل ٹریکنگ کے لیے نیচে سے انتخاب کریں۔'
                            : 'Select an option below to manage your invited guests or track expected and arrived parcels.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {employee?.departmentName} &bull; {employee?.position}
                        </span>
                      </div>
                    </div>

                    {/* Two Prominent Clickable Cards: Card A (Guest Management) & Card B (Parcel Management) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* CARD A: GUEST MANAGEMENT */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection('GUESTS');
                          setActiveAction('INVITE');
                        }}
                        className={`group relative p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden ${isUrdu ? 'text-right' : 'text-left'}`}
                      >
                        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors pointer-events-none" />

                        <div>
                          <div className="flex items-center justify-between gap-4 mb-5">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
                              <Users className="w-8 h-8" />
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              {invitations.length} {isUrdu ? 'مہمان' : invitations.length === 1 ? 'Guest' : 'Guests'}
                            </span>
                          </div>

                          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {t('emp_card_guest_management', 'Guest Management')}
                          </h2>
                          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                            {t(
                              'emp_card_guest_management_desc',
                              'Invite upcoming guests to share arrival details with gate operators, view visited guest history, and re-invite returning guests.'
                            )}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                              1. {t('emp_action_invite_guest', 'Invite Guest')}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                              2. {t('emp_action_visited_guests', 'Visited Guests')}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                            {isUrdu ? 'کھولیں' : 'Open'} <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </button>

                      {/* CARD B: PARCEL MANAGEMENT */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection('PARCELS');
                          setParcelTab('REMINDER');
                        }}
                        className={`group relative p-6 sm:p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden ${isUrdu ? 'text-right' : 'text-left'}`}
                      >
                        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors pointer-events-none" />

                        <div>
                          <div className="flex items-center justify-between gap-4 mb-5">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
                              <Package className="w-8 h-8" />
                            </div>
                            <div className="flex items-center gap-1.5">
                              {receivedParcelCount > 0 && (
                                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 animate-pulse">
                                  {receivedParcelCount} {isUrdu ? 'گیٹ پر تیار' : 'Ready at Gate'}
                                </span>
                              )}
                              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {parcels.length} {isUrdu ? 'پارسل' : parcels.length === 1 ? 'Parcel' : 'Parcels'}
                              </span>
                            </div>
                          </div>

                          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {t('emp_card_parcel_management', 'Parcel Management')}
                          </h2>
                          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                            {t(
                              'emp_card_parcel_management_desc',
                              'Add a parcel reminder when expecting a delivery (Daraz, Foodpanda, TCS, Leopard, DHL, etc.) and track your arrived parcels at the gate.'
                            )}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                              1. {t('emp_tab_add_parcel_reminder', 'Add Parcel Reminder')}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                              2. {t('emp_tab_arrived_parcels', 'Arrived Parcels')}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                            {isUrdu ? 'کھولیں' : 'Open'} <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* =============================================================== */}
                {/* SECTION A: GUEST MANAGEMENT (INVITE GUEST & VISITED GUESTS)     */}
                {/* =============================================================== */}
                {activeSection === 'GUESTS' && (
                  <div className="space-y-5">
                    {/* Top Navigation Bar to switch between Landing / Guest Management / Parcel Management */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setActiveSection('HOME')}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>{isUrdu ? 'ڈیش بورڈ' : 'Dashboard Cards'}</span>
                        </button>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          {t('emp_card_guest_management', 'Guest Management')}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection('PARCELS');
                          setParcelTab('REMINDER');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>{isUrdu ? 'پارسل مینجمنٹ' : 'Switch to Parcel Management'}</span>
                      </button>
                    </div>

                    {/* Two Guest Management Tabs: 1. Invite Guest & 2. Visited Guests */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Action 1: Invite Guest */}
                      <button
                        type="button"
                        onClick={() => setActiveAction('INVITE')}
                        className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center gap-4 ${
                          activeAction === 'INVITE'
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-md shadow-blue-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
                        }`}
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                            activeAction === 'INVITE'
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          <UserPlus className="w-7 h-7" />
                        </div>
                        <div className={`min-w-0 flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
                          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                            {t('emp_action_invite_guest', 'Invite Guest')}
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {t(
                              'emp_action_invite_guest_desc',
                              'Pre-register an upcoming guest and share arrival details with gate operators'
                            )}
                          </p>
                        </div>
                      </button>

                      {/* Action 2: Visited Guests */}
                      <button
                        type="button"
                        onClick={() => setActiveAction('HISTORY')}
                        className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center gap-4 ${
                          activeAction === 'HISTORY'
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-md shadow-blue-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
                        }`}
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                            activeAction === 'HISTORY'
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          <Users className="w-7 h-7" />
                        </div>
                        <div className={`min-w-0 flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                              {t('emp_action_visited_guests', 'Visited Guests')}
                            </h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              {invitations.length}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {t(
                              'emp_action_visited_guests_desc',
                              'View your invited and visited guest history and re-invite returning guests'
                            )}
                          </p>
                        </div>
                      </button>
                    </div>

                    {/* =============================================================== */}
                    {/* ACTION 1 PANEL: INVITE GUEST FORM                               */}
                    {/* =============================================================== */}
                    {activeAction === 'INVITE' ? (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <div className={isUrdu ? 'text-right' : 'text-left'}>
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                              {t('emp_action_invite_guest', 'Invite Guest')}
                            </h3>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {isUrdu ? 'میزبان' : 'Host'}: {employee?.name} ({employee?.departmentName})
                          </span>
                        </div>

                        <form onSubmit={handleCreateInvitation} className="p-6 space-y-5">
                          {inviteError && (
                            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <span>{inviteError}</span>
                            </div>
                          )}

                          {inviteSuccess && (
                            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{inviteSuccess}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setInviteSuccess(null)}
                                className="text-emerald-700 dark:text-emerald-300 hover:underline text-[11px] shrink-0 cursor-pointer"
                              >
                                {isUrdu ? 'بند کریں' : 'Dismiss'}
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Guest Name (Required) */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_guest_name', 'Guest Name')} *
                              </label>
                              <input
                                type="text"
                                required
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                placeholder={isUrdu ? 'مہمان کا نام درج کریں' : 'Guest name'}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Phone Number (Required) */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_guest_phone', 'Guest Phone Number')} *
                              </label>
                              <div className="relative">
                                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="tel"
                                  required
                                  value={guestPhone}
                                  onChange={(e) => setGuestPhone(e.target.value)}
                                  placeholder="03001234567"
                                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Visit Date & Expected Arrival Time (1-hour 12h slot dropdown) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_visit_date', 'Visit Date')} *
                              </label>
                              <div className="relative">
                                <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="date"
                                  required
                                  min={getTodayDateString()}
                                  value={visitDate}
                                  onChange={(e) => setVisitDate(e.target.value)}
                                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_expected_arrival', 'Arrival Time')} *
                              </label>
                              <div className="relative">
                                <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select
                                  value={expectedArrivalTime}
                                  onChange={(e) => setExpectedArrivalTime(e.target.value)}
                                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  {ESTIMATED_ARRIVAL_SLOTS.map((slot) => (
                                    <option key={slot} value={slot}>
                                      {slot}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                            {/* CNIC */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_guest_cnic', 'CNIC')}
                              </label>
                              <input
                                type="text"
                                value={guestCnic}
                                onChange={(e) => setGuestCnic(formatCnicInput(e.target.value))}
                                placeholder="35202-1234567-1"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Along With (Step 9 Requirement) */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('along_with', 'Along With')}
                              </label>
                              <input
                                type="text"
                                value={alongWith}
                                onChange={(e) => setAlongWith(e.target.value)}
                                placeholder={t('along_with_placeholder', 'Accompanying persons or count')}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Guest Photo */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_guest_photo', 'Guest Photo')}
                              </label>
                              <div className="flex items-center gap-3">
                                {guestPhotoUrl ? (
                                  <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={guestPhotoUrl}
                                      alt="Guest"
                                      className="w-full h-full object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setGuestPhotoUrl(null)}
                                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-slate-900/80 text-white cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : null}
                                <label className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer bg-slate-50/50 dark:bg-slate-800/40">
                                  <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                  <span>
                                    {guestPhotoUrl
                                      ? isUrdu
                                        ? 'تصویر تبدیل کریں'
                                        : 'Change Photo'
                                      : isUrdu
                                        ? 'تصویر اپ لوڈ کریں'
                                        : 'Upload Photo'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handlePhotoUpload(e, setGuestPhotoUrl)}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 flex justify-end">
                            <button
                              type="submit"
                              disabled={inviteSubmitting}
                              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                              <UserPlus className="w-4 h-4" />
                              <span>
                                {inviteSubmitting
                                  ? isUrdu
                                    ? 'بھیجا جا رہا ہے...'
                                    : 'Sending Invitation...'
                                  : t('emp_create_invitation_btn', 'Send Guest Invitation')}
                              </span>
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      /* =============================================================== */
                      /* ACTION 2 PANEL: VISITED GUESTS (HISTORY & RE-INVITE)            */
                      /* =============================================================== */
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className={isUrdu ? 'text-right' : 'text-left'}>
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                              {t('emp_action_visited_guests', 'Visited Guests')}
                            </h3>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                placeholder={isUrdu ? 'مہمان، کارڈ یا گیٹ تلاش کریں...' : 'Search guest, card, gate...'}
                                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <select
                              value={historyFilter}
                              onChange={(e) =>
                                setHistoryFilter(
                                  e.target.value as 'ALL' | 'PENDING' | 'CHECKED_IN' | 'CHECKED_OUT'
                                )
                              }
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                            >
                              <option value="ALL">{isUrdu ? 'تمام حیثیت' : 'All Statuses'}</option>
                              <option value="PENDING">{isUrdu ? 'آمد کا انتظار' : 'Pending Arrival'}</option>
                              <option value="CHECKED_IN">{isUrdu ? 'اس وقت اندر' : 'Currently Inside'}</option>
                              <option value="CHECKED_OUT">{isUrdu ? 'چیک آؤٹ شدہ' : 'Checked Out'}</option>
                            </select>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          {filteredHistory.length === 0 ? (
                            <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                              <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                              <p className="font-semibold text-slate-500 dark:text-slate-400">
                                {isUrdu ? 'کوئی مہمان ریکارڈ نہیں ملا۔' : 'No guest records match your filter.'}
                              </p>
                            </div>
                          ) : (
                            <table className="w-full text-left text-xs min-w-[880px]">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                  <th className="px-5 py-3">{isUrdu ? 'مہمان' : 'Guest'}</th>
                                  <th className="px-4 py-3">{t('along_with', 'Along With')}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'وزیٹر کارڈ' : 'VC Card No.'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'تاریخ اور وقت' : 'Visit Date & Arrival Time'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'چیک اِن' : 'Actual Check-In'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'چیک آؤٹ' : 'Actual Check-Out'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'گیٹ' : 'Actual Gate Used'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'حیثیت' : 'Status'}</th>
                                  <th className="px-5 py-3 text-right">{isUrdu ? 'کارروائی' : 'Action'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {filteredHistory.map((inv) => (
                                  <tr
                                    key={inv.id}
                                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                                  >
                                    <td className="px-5 py-3.5">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                                          {inv.guestPhotoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                              src={inv.guestPhotoUrl}
                                              alt={inv.guestName}
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <Users className="w-4 h-4 text-slate-400" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="font-bold text-slate-900 dark:text-white">
                                            {inv.guestName}
                                          </p>
                                          <p className="text-[11px] font-mono text-slate-500">
                                            {inv.guestPhone}
                                            {inv.guestCnic ? ` • ${inv.guestCnic}` : ''}
                                          </p>
                                        </div>
                                      </div>
                                    </td>

                                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-semibold">
                                      {inv.alongWith || '—'}
                                    </td>

                                    <td className="px-4 py-3.5 font-mono font-extrabold text-blue-600 dark:text-blue-400">
                                      {inv.visitorCardNo ? (
                                        inv.visitorCardNo
                                      ) : (
                                        <span className="text-slate-400 dark:text-slate-500 font-sans font-semibold text-[11px]">
                                          {isUrdu ? 'گیٹ پر تفویض ہوگا' : 'Assigned at Gate'}
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-3.5">
                                      <p className="font-bold text-slate-800 dark:text-slate-200">
                                        {inv.visitDate}
                                      </p>
                                      <p className="text-[11px] text-slate-500">
                                        {inv.expectedArrivalTime}
                                      </p>
                                    </td>

                                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                                      {inv.actualCheckInTime
                                        ? new Date(inv.actualCheckInTime).toLocaleString([], {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'}
                                    </td>

                                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                                      {inv.actualCheckOutTime
                                        ? new Date(inv.actualCheckOutTime).toLocaleString([], {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'}
                                    </td>

                                    <td className="px-4 py-3.5">
                                      {inv.entryGateName ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                                          {inv.entryGateName}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">
                                          {isUrdu ? 'آمد پر' : 'Assigned on Arrival'}
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-3.5">
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                          inv.status === 'CHECKED_IN'
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                            : inv.status === 'CHECKED_OUT'
                                            ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                        }`}
                                      >
                                        {inv.status === 'CHECKED_IN'
                                          ? isUrdu
                                            ? 'چیک اِن'
                                            : 'CHECKED IN'
                                          : inv.status === 'CHECKED_OUT'
                                          ? isUrdu
                                            ? 'چیک آؤٹ'
                                            : 'CHECKED OUT'
                                          : isUrdu
                                          ? 'انتظار میں'
                                          : 'PENDING ARRIVAL'}
                                      </span>
                                    </td>

                                    <td className="px-5 py-3.5 text-right">
                                      <button
                                        type="button"
                                        onClick={() => openReinviteModal(inv)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>{t('emp_reinvite_btn', 'Re-invite')}</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* =============================================================== */}
                {/* SECTION B: PARCEL MANAGEMENT (ADD REMINDER & ARRIVED PARCELS)   */}
                {/* =============================================================== */}
                {activeSection === 'PARCELS' && (
                  <div className="space-y-5">
                    {/* Top Navigation Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setActiveSection('HOME')}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>{isUrdu ? 'ڈیش بورڈ' : 'Dashboard Cards'}</span>
                        </button>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          {t('emp_card_parcel_management', 'Parcel Management')}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection('GUESTS');
                          setActiveAction('INVITE');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{isUrdu ? 'مہمانوں کا انتظام' : 'Switch to Guest Management'}</span>
                      </button>
                    </div>

                    {/* Two Parcel Management Tabs: Tab 1 (Add Parcel Reminder) & Tab 2 (Arrived Parcels) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Tab 1: Add Parcel Reminder */}
                      <button
                        type="button"
                        onClick={() => setParcelTab('REMINDER')}
                        className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center gap-4 ${
                          parcelTab === 'REMINDER'
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-md shadow-blue-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
                        }`}
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                            parcelTab === 'REMINDER'
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          <Truck className="w-7 h-7" />
                        </div>
                        <div className={`min-w-0 flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
                          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                            {t('emp_tab_add_parcel_reminder', 'Add Parcel Reminder')}
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {t(
                              'emp_tab_add_parcel_reminder_desc',
                              'Pre-notify gate operators about an expected parcel delivery'
                            )}
                          </p>
                        </div>
                      </button>

                      {/* Tab 2: Arrived Parcels */}
                      <button
                        type="button"
                        onClick={() => setParcelTab('ARRIVED')}
                        className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center gap-4 ${
                          parcelTab === 'ARRIVED'
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 shadow-md shadow-blue-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
                        }`}
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                            parcelTab === 'ARRIVED'
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          <Package className="w-7 h-7" />
                        </div>
                        <div className={`min-w-0 flex-1 ${isUrdu ? 'text-right' : 'text-left'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                              {t('emp_tab_arrived_parcels', 'Arrived Parcels')}
                            </h2>
                            <div className="flex items-center gap-1.5">
                              {receivedParcelCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  {receivedParcelCount} {isUrdu ? 'موصول شدہ' : 'Received'}
                                </span>
                              )}
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                                {parcels.length}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {t(
                              'emp_tab_arrived_parcels_desc',
                              'Track Expected, Received, and Delivered status & receiving gate for your parcels'
                            )}
                          </p>
                        </div>
                      </button>
                    </div>

                    {/* =========================================================== */}
                    {/* TAB 1 PANEL: ADD PARCEL REMINDER FORM                       */}
                    {/* =========================================================== */}
                    {parcelTab === 'REMINDER' ? (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <div className={isUrdu ? 'text-right' : 'text-left'}>
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                              {t('emp_tab_add_parcel_reminder', 'Add Parcel Reminder')}
                            </h3>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {t('parcel_status_expected', 'Expected')}
                          </span>
                        </div>

                        <form onSubmit={handleCreateParcelReminder} className="p-6 space-y-5">
                          {parcelError && (
                            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <span>{parcelError}</span>
                            </div>
                          )}

                          {parcelSuccess && (
                            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{parcelSuccess}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setParcelSuccess(null);
                                  setParcelTab('ARRIVED');
                                }}
                                className="text-emerald-700 dark:text-emerald-300 hover:underline text-[11px] font-extrabold shrink-0 cursor-pointer"
                              >
                                {isUrdu ? 'پارسل دیکھیں' : 'View Parcels'} &rarr;
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Owner Name */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('parcel_owner_name', 'Owner Name')} *
                              </label>
                              <input
                                type="text"
                                required
                                value={parcelOwnerName}
                                onChange={(e) => setParcelOwnerName(e.target.value)}
                                placeholder={isUrdu ? 'مالک کا نام' : 'Owner name'}
                                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                                  parcelErrorField === 'ownerName'
                                    ? 'border-rose-500 ring-1 ring-rose-500'
                                    : 'border-slate-200 dark:border-slate-700'
                                } bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                              />
                            </div>

                            {/* Parcel From (short, clear label) */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('parcel_from', 'Parcel From')} *
                              </label>
                              <div className="relative">
                                <Truck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  required
                                  value={parcelSenderPlatform}
                                  onChange={(e) => setParcelSenderPlatform(e.target.value)}
                                  placeholder="e.g. Foodpanda, TCS, Daraz, Bank"
                                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border ${
                                    parcelErrorField === 'senderPlatform'
                                      ? 'border-rose-500 ring-1 ring-rose-500'
                                      : 'border-slate-200 dark:border-slate-700'
                                  } bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Arrival Date */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('parcel_expected_date', 'Arrival Date')} *
                              </label>
                              <div className="relative">
                                <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="date"
                                  required
                                  min={getTodayDateString()}
                                  value={parcelExpectedDate}
                                  onChange={(e) => setParcelExpectedDate(e.target.value)}
                                  className={`w-full pl-10 pr-3 py-2.5 rounded-xl border ${
                                    parcelErrorField === 'expectedArrivalDate'
                                      ? 'border-rose-500 ring-1 ring-rose-500'
                                      : 'border-slate-200 dark:border-slate-700'
                                  } bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                />
                              </div>
                            </div>

                            {/* Phone Number */}
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('emp_phone', 'Phone Number')} *
                              </label>
                              <div className="relative">
                                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="tel"
                                  required
                                  value={parcelOwnerPhone}
                                  onChange={(e) => setParcelOwnerPhone(e.target.value)}
                                  placeholder="03001234567"
                                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border ${
                                    parcelErrorField === 'ownerPhone'
                                      ? 'border-rose-500 ring-1 ring-rose-500'
                                      : 'border-slate-200 dark:border-slate-700'
                                  } bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                              {t('parcel_notes', 'Notes')}
                            </label>
                            <input
                              type="text"
                              value={parcelNotes}
                              onChange={(e) => setParcelNotes(e.target.value)}
                              placeholder={isUrdu ? 'ٹریکنگ آئی ڈی یا اضافی تفصیل' : 'Tracking ID or instructions'}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div className="pt-2 flex justify-end">
                            <button
                              type="submit"
                              disabled={parcelSubmitting}
                              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-sm font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Package className="w-4 h-4" />
                              <span>
                                {parcelSubmitting
                                  ? isUrdu
                                    ? 'محفوظ ہو رہا ہے...'
                                    : 'Saving Parcel Reminder...'
                                  : t('save_parcel_reminder_btn', 'Save Parcel Reminder')}
                              </span>
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      /* =========================================================== */
                      /* TAB 2 PANEL: ARRIVED PARCELS (MY PARCELS ONLY)              */
                      /* =========================================================== */
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className={isUrdu ? 'text-right' : 'text-left'}>
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                              {t('emp_tab_arrived_parcels', 'Arrived Parcels')}
                            </h3>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={parcelSearch}
                                onChange={(e) => setParcelSearch(e.target.value)}
                                placeholder={isUrdu ? 'پلیٹ فارم یا گیٹ تلاش کریں...' : 'Search platform, gate...'}
                                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <select
                              value={parcelStatusFilter}
                              onChange={(e) =>
                                setParcelStatusFilter(
                                  e.target.value as 'ALL' | 'EXPECTED' | 'RECEIVED' | 'DELIVERED'
                                )
                              }
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                            >
                              <option value="ALL">
                                {isUrdu ? `تمام حیثیت (${parcels.length})` : `All Statuses (${parcels.length})`}
                              </option>
                              <option value="EXPECTED">
                                {t('parcel_status_expected', 'Expected')} ({expectedParcelCount})
                              </option>
                              <option value="RECEIVED">
                                {t('parcel_status_received', 'Received')} ({receivedParcelCount})
                              </option>
                              <option value="DELIVERED">
                                {t('parcel_status_delivered', 'Delivered')} ({deliveredParcelCount})
                              </option>
                            </select>
                          </div>
                        </div>

                        <div>
                          {filteredParcels.length === 0 ? (
                            <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                              <Package className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                              <p className="font-semibold text-slate-500 dark:text-slate-400">
                                {isUrdu ? 'کوئی پارسل ریکارڈ نہیں ملا۔' : 'No parcel records match your filter.'}
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Mobile Vertical Parcel Cards (< md) */}
                              <div className="md:hidden p-3 space-y-3">
                                {filteredParcels.map((prc) => (
                                  <div
                                    key={prc.id}
                                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3.5 space-y-2.5 shadow-2xs"
                                  >
                                    <div className="flex items-start justify-between gap-2.5">
                                      <div className="flex items-start gap-2.5 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0">
                                          {prc.photoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                              src={prc.photoUrl}
                                              alt={prc.senderPlatform}
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight break-words">
                                            {prc.senderPlatform}
                                          </p>
                                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                            {prc.ownerName} &bull; {prc.departmentName}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex flex-col items-end gap-1 shrink-0">
                                        <span
                                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                            prc.status === 'RECEIVED'
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                              : prc.status === 'DELIVERED'
                                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                          }`}
                                        >
                                          {prc.status === 'RECEIVED'
                                            ? t('parcel_status_received', 'Received')
                                            : prc.status === 'DELIVERED'
                                            ? t('parcel_status_delivered', 'Delivered')
                                            : t('parcel_status_expected', 'Expected')}
                                        </span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                          {prc.source === 'EXPECTED'
                                            ? isUrdu
                                              ? 'متوقع'
                                              : 'Expected'
                                            : isUrdu
                                            ? 'غیر متوقع'
                                            : 'Unexpected'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 text-xs">
                                      <div>
                                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                                          {t('parcel_expected_date', 'Arrival Date')}
                                        </span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                          {prc.expectedArrivalDate
                                            ? new Date(prc.expectedArrivalDate).toLocaleDateString([], {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                              })
                                            : '—'}
                                        </span>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                                          {t('parcel_receiving_gate', 'Receiving Gate')}
                                        </span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                          {prc.receivingGateName ||
                                            (isUrdu ? 'گیٹ پر آمد کا انتظار' : 'Awaiting Arrival')}
                                        </span>
                                      </div>

                                      {prc.receivedAt && (
                                        <div>
                                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                                            {isUrdu ? 'وصولی کا وقت' : 'Received'}
                                          </span>
                                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                                            {new Date(prc.receivedAt).toLocaleString([], {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      )}

                                      {prc.deliveredAt && (
                                        <div>
                                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                                            {isUrdu ? 'حوالگی کا وقت' : 'Delivered'}
                                          </span>
                                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                                            {new Date(prc.deliveredAt).toLocaleString([], {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {prc.notes && (
                                      <p className="text-[11px] text-slate-500 italic break-words">
                                        {prc.notes}
                                      </p>
                                    )}

                                    {prc.photoUrl && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewParcelPhoto(prc)}
                                        className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>{isUrdu ? 'تصویر دیکھیں' : 'View Photo'}</span>
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Desktop Table (md+) */}
                              <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left text-xs min-w-[860px]">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                  <th className="px-5 py-3">{t('parcel_from', 'Parcel From')}</th>
                                  <th className="px-4 py-3">{t('parcel_expected_date', 'Arrival Date')}</th>
                                  <th className="px-4 py-3">{t('parcel_receiving_gate', 'Receiving Gate')}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'وصولی کا وقت' : 'Received Date & Time'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'حوالگی کا وقت' : 'Delivered Date & Time'}</th>
                                  <th className="px-4 py-3">{isUrdu ? 'حیثیت' : 'Status'}</th>
                                  <th className="px-5 py-3 text-right">{isUrdu ? 'تصویر' : 'Photo'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {filteredParcels.map((prc) => (
                                  <tr
                                    key={prc.id}
                                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                                  >
                                    <td className="px-5 py-3.5">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 overflow-hidden flex items-center justify-center shrink-0">
                                          {prc.photoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                              src={prc.photoUrl}
                                              alt={prc.senderPlatform}
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                          )}
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <p className="font-extrabold text-slate-900 dark:text-white">
                                              {prc.senderPlatform}
                                            </p>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                              {prc.source === 'EXPECTED'
                                                ? isUrdu
                                                  ? 'متوقع'
                                                  : 'Reminder'
                                                : isUrdu
                                                ? 'غیر متوقع'
                                                : 'Unexpected'}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-slate-500">
                                            {prc.ownerName} &bull; {prc.departmentName}
                                          </p>
                                          {prc.notes && (
                                            <p className="text-[11px] text-slate-400 italic mt-0.5">
                                              {prc.notes}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-semibold">
                                      {prc.expectedArrivalDate
                                        ? new Date(prc.expectedArrivalDate).toLocaleDateString([], {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                          })
                                        : '—'}
                                    </td>

                                    <td className="px-4 py-3.5">
                                      {prc.receivingGateName ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-[11px]">
                                          <MapPin className="w-3 h-3" />
                                          {prc.receivingGateName}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">
                                          {isUrdu ? 'گیٹ پر آمد کا انتظار' : 'Awaiting Arrival at Gate'}
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                                      {prc.receivedAt ? (
                                        <div>
                                          <p className="font-semibold">
                                            {new Date(prc.receivedAt).toLocaleString([], {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </p>
                                          {prc.receivedByName && (
                                            <p className="text-[10px] text-slate-400">
                                              by {prc.receivedByName}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        '—'
                                      )}
                                    </td>

                                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                                      {prc.deliveredAt ? (
                                        <div>
                                          <p className="font-semibold">
                                            {new Date(prc.deliveredAt).toLocaleString([], {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </p>
                                          {prc.deliveryGateName && (
                                            <p className="text-[10px] text-slate-400">
                                              at {prc.deliveryGateName}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        '—'
                                      )}
                                    </td>

                                    <td className="px-4 py-3.5">
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                          prc.status === 'RECEIVED'
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                            : prc.status === 'DELIVERED'
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                        }`}
                                      >
                                        {prc.status === 'RECEIVED'
                                          ? t('parcel_status_received', 'Received')
                                          : prc.status === 'DELIVERED'
                                          ? t('parcel_status_delivered', 'Delivered')
                                          : t('parcel_status_expected', 'Expected')}
                                      </span>
                                    </td>

                                    <td className="px-5 py-3.5 text-right">
                                      {prc.photoUrl ? (
                                        <button
                                          type="button"
                                          onClick={() => setPreviewParcelPhoto(prc)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>{isUrdu ? 'تصویر دیکھیں' : 'View Photo'}</span>
                                        </button>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
          </div>
        )}
      </main>

      {/* Parcel Photo Preview Modal */}
      {previewParcelPhoto && previewParcelPhoto.photoUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Parcel Photo &bull; {previewParcelPhoto.senderPlatform}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Received at {previewParcelPhoto.receivingGateName || 'Gate'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewParcelPhoto(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewParcelPhoto.photoUrl}
                alt="Parcel"
                className="w-full max-h-80 object-contain rounded-xl bg-slate-950"
              />
            </div>
          </div>
        </div>
      )}

      {/* Re-Invite Guest Modal */}
      {reinviteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('emp_reinvite_btn', 'Re-invite')}: {reinviteTarget.guestName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Creates a new invitation without overwriting previous visit history.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReinviteTarget(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReinviteSubmit} className="p-6 space-y-4">
              {reinviteError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{reinviteError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_guest_name', 'Guest Name')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={reinviteGuestName}
                    onChange={(e) => setReinviteGuestName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_guest_phone', 'Guest Phone Number')} *
                  </label>
                  <input
                    type="tel"
                    required
                    value={reinvitePhone}
                    onChange={(e) => setReinvitePhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_visit_date', 'Visit Date')} *
                  </label>
                  <input
                    type="date"
                    required
                    min={getTodayDateString()}
                    value={reinviteDate}
                    onChange={(e) => setReinviteDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_expected_arrival', 'Arrival Time')} *
                  </label>
                  <select
                    value={reinviteTime}
                    onChange={(e) => setReinviteTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ESTIMATED_ARRIVAL_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emp_guest_cnic', 'CNIC')}
                  </label>
                  <input
                    type="text"
                    value={reinviteCnic}
                    onChange={(e) => setReinviteCnic(formatCnicInput(e.target.value))}
                    placeholder="35202-1234567-1"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('along_with', 'Along With')}
                  </label>
                  <input
                    type="text"
                    value={reinviteAlongWith}
                    onChange={(e) => setReinviteAlongWith(e.target.value)}
                    placeholder={t('along_with_placeholder', 'Accompanying persons or count')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setReinviteTarget(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  {t('cancel_btn', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={reinviteSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white text-xs font-extrabold shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  {reinviteSubmitting
                    ? isUrdu
                      ? 'بھیجا جا رہا ہے...'
                      : 'Sending Re-invitation...'
                    : t('emp_create_invitation_btn', 'Send Guest Invitation')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
