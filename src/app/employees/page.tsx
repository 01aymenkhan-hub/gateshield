'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import AdminGuard from '@/components/auth/AdminGuard';
import GatekeeperLoader from '@/components/ui/GatekeeperLoader';
import PasswordInput from '@/components/ui/PasswordInput';
import {
  Users,
  UserCheck,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  RefreshCw,
  Building2,
  Briefcase,
  Phone,
  Mail,
  Lock,
  Check,
  X,
  Power,
  ExternalLink,
  Plus,
  KeyRound,
} from 'lucide-react';
import type { AdminEmployeeRow } from '@/app/api/admin/employees/route';
import type { PasswordResetStatusType } from '@/lib/passwordReset';

interface DepartmentOption {
  id: string;
  name: string;
}

interface EmployeePasswordResetRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: 'EMPLOYEE';
  status: PasswordResetStatusType;
  reviewedById: string | null;
  reviewedByName: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  departmentName: string | null;
  position: string | null;
  phoneNumber: string | null;
}

type EmployeeRequestTypeFilter = 'ALL' | 'REGISTRATION' | 'PASSWORD_RESET';

function AdminEmployeesContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'EMPLOYEES'>(
    searchParams?.get('tab')?.toLowerCase() === 'employees' ? 'EMPLOYEES' : 'REQUESTS'
  );
  const [requests, setRequests] = useState<AdminEmployeeRow[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<EmployeePasswordResetRow[]>(
    []
  );
  const [employees, setEmployees] = useState<AdminEmployeeRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRegistrationCount, setPendingRegistrationCount] = useState(0);
  const [pendingPasswordResetCount, setPendingPasswordResetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [requestTypeFilter, setRequestTypeFilter] = useState<EmployeeRequestTypeFilter>(() => {
    const rt = searchParams?.get('requestType')?.toUpperCase();
    if (rt === 'REGISTRATION' || rt === 'PASSWORD_RESET') return rt;
    return 'ALL';
  });
  const [requestStatusFilter, setRequestStatusFilter] = useState<
    'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED'
  >('ALL');
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(
    searchParams?.get('requestId') || null
  );

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  // Reject Modal state (Registration)
  const [rejectTarget, setRejectTarget] = useState<AdminEmployeeRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Approve Confirmation Modal state (Registration)
  const [approveTarget, setApproveTarget] = useState<AdminEmployeeRow | null>(null);

  // Password Reset Reject Modal state
  const [rejectResetTarget, setRejectResetTarget] = useState<EmployeePasswordResetRow | null>(
    null
  );
  const [resetRejectionReason, setResetRejectionReason] = useState('');

  // Add Employee Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [addFullName, setAddFullName] = useState('');
  const [addDepartmentId, setAddDepartmentId] = useState('');
  const [addPosition, setAddPosition] = useState('');
  const [addPhoneNumber, setAddPhoneNumber] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addConfirmPassword, setAddConfirmPassword] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const reqInFlightRef = useRef(false);
  const fetchEmployeesData = useCallback(async () => {
    if (reqInFlightRef.current) return;
    reqInFlightRef.current = true;
    try {
      const res = await fetch('/api/admin/employees', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setPasswordResetRequests(
          Array.isArray(data.passwordResetRequests) ? data.passwordResetRequests : []
        );
        setEmployees(Array.isArray(data.employees) ? data.employees : []);
        setPendingCount(typeof data.pendingCount === 'number' ? data.pendingCount : 0);
        setPendingRegistrationCount(
          typeof data.pendingRegistrationCount === 'number'
            ? data.pendingRegistrationCount
            : 0
        );
        setPendingPasswordResetCount(
          typeof data.pendingPasswordResetCount === 'number'
            ? data.pendingPasswordResetCount
            : 0
        );
      }
    } catch (e) {
      console.error('Error loading admin employees:', e);
    } finally {
      reqInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  // Deep-link synchronization for URL query params (?tab=requests&requestType=PASSWORD_RESET&requestId=...)
  useEffect(() => {
    const tabParam = searchParams?.get('tab')?.toLowerCase();
    const reqTypeParam = searchParams?.get('requestType')?.toUpperCase();
    const reqIdParam = searchParams?.get('requestId');

    if (tabParam === 'requests' || reqTypeParam || reqIdParam) {
      setActiveTab('REQUESTS');
    } else if (tabParam === 'employees') {
      setActiveTab('EMPLOYEES');
    }

    if (reqTypeParam === 'REGISTRATION' || reqTypeParam === 'PASSWORD_RESET') {
      setRequestTypeFilter(reqTypeParam);
    } else if (reqIdParam) {
      if (reqIdParam.startsWith('prr_')) {
        setRequestTypeFilter('PASSWORD_RESET');
      } else if (reqIdParam.startsWith('emp_')) {
        setRequestTypeFilter('REGISTRATION');
      }
    }

    if (reqIdParam) {
      setRequestStatusFilter('ALL');
      setSearchQuery('');
      setHighlightedRequestId(reqIdParam);
    }
  }, [searchParams]);

  // Smooth scroll & visual highlight when deep-linked request row is mounted
  useEffect(() => {
    if (!highlightedRequestId || loading) return;
    const scrollTimer = setTimeout(() => {
      const rowEl = document.getElementById(`emp-req-row-${highlightedRequestId}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 180);
    const clearTimer = setTimeout(() => {
      setHighlightedRequestId((curr) => (curr === highlightedRequestId ? null : curr));
    }, 8000);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightedRequestId, loading, requests.length, passwordResetRequests.length]);

  useEffect(() => {
    let active = true;
    const fetchDepartments = async () => {
      try {
        const res = await fetch('/api/departments?activeOnly=true');
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.departments)) {
            setDepartments(data.departments);
            if (data.departments.length > 0 && !addDepartmentId) {
              setAddDepartmentId(data.departments[0].id);
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

  useEffect(() => {
    const initTimer = setTimeout(() => {
      void fetchEmployeesData();
    }, 0);
    const interval = setInterval(() => {
      void fetchEmployeesData();
    }, 6000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [fetchEmployeesData]);

  const notifySidebarBadgeRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('gk:refresh-employee-badge'));
      window.dispatchEvent(new Event('gk:refresh-password-reset-badge'));
    }
  };

  const handleApprovePasswordReset = async (resetReq: EmployeePasswordResetRow) => {
    setActionBusyId(resetReq.id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/password-resets/${resetReq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMessage({
          type: 'error',
          text: data.error || 'Failed to approve employee password reset request.',
        });
        await fetchEmployeesData();
        notifySidebarBadgeRefresh();
        return;
      }

      setBannerMessage({
        type: 'success',
        text:
          data.message ||
          `Password reset request approved for ${resetReq.userName} (${resetReq.userEmail}).`,
      });
      await fetchEmployeesData();
      notifySidebarBadgeRefresh();
    } catch {
      setBannerMessage({
        type: 'error',
        text: 'Network error while approving employee password reset request.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectPasswordResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectResetTarget) return;
    const target = rejectResetTarget;
    setActionBusyId(target.id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/password-resets/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECT',
          rejectionReason: resetRejectionReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMessage({
          type: 'error',
          text: data.error || 'Failed to reject employee password reset request.',
        });
        setRejectResetTarget(null);
        await fetchEmployeesData();
        notifySidebarBadgeRefresh();
        return;
      }

      setBannerMessage({
        type: 'success',
        text:
          data.message ||
          `Password reset request rejected for ${target.userName} (${target.userEmail}).`,
      });
      setRejectResetTarget(null);
      setResetRejectionReason('');
      await fetchEmployeesData();
      notifySidebarBadgeRefresh();
    } catch {
      setBannerMessage({
        type: 'error',
        text: 'Network error while rejecting employee password reset request.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const openAddEmployeeModal = () => {
    setAddFullName('');
    if (departments.length > 0 && !addDepartmentId) {
      setAddDepartmentId(departments[0].id);
    }
    setAddPosition('');
    setAddPhoneNumber('');
    setAddEmail('');
    setAddPassword('');
    setAddConfirmPassword('');
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (addPassword !== addConfirmPassword) {
      setAddError('Password and Confirm Password do not match.');
      return;
    }

    setAddSubmitting(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: addFullName.trim(),
          departmentId: addDepartmentId,
          position: addPosition.trim(),
          phoneNumber: addPhoneNumber.trim(),
          email: addEmail.trim(),
          password: addPassword,
          confirmPassword: addConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || 'Failed to create employee account.');
        return;
      }

      setIsAddModalOpen(false);
      setActiveTab('EMPLOYEES');
      setBannerMessage({
        type: 'success',
        text:
          data.message ||
          `Employee account for ${addFullName.trim()} created and immediately approved.`,
      });
      await fetchEmployeesData();
      notifySidebarBadgeRefresh();
    } catch {
      setAddError('Network error while creating employee account. Please try again.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    const target = approveTarget;
    setActionBusyId(target.id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/employees/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMessage({
          type: 'error',
          text: data.error || 'Failed to approve employee request.',
        });
        setApproveTarget(null);
        await fetchEmployeesData();
        notifySidebarBadgeRefresh();
        return;
      }

      const emailStatus = data.emailDispatch?.status;
      const emailNote =
        emailStatus === 'ACCEPTED_BY_SMTP'
          ? 'Approval email accepted by SMTP server.'
          : emailStatus === 'SKIPPED_DISABLED'
          ? 'Account approved in database (SMTP email skipped because EMAIL_ENABLED is false).'
          : emailStatus === 'FAILED'
          ? 'Account approved in database, but SMTP email delivery failed.'
          : '';

      setBannerMessage({
        type: emailStatus === 'FAILED' ? 'warning' : 'success',
        text: `${data.message} ${emailNote}`.trim(),
      });
      setApproveTarget(null);
      await fetchEmployeesData();
      notifySidebarBadgeRefresh();
    } catch {
      setBannerMessage({
        type: 'error',
        text: 'Network error while approving employee request.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    const target = rejectTarget;
    setActionBusyId(target.id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/employees/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECT',
          rejectionReason: rejectionReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMessage({
          type: 'error',
          text: data.error || 'Failed to reject employee request.',
        });
        setRejectTarget(null);
        await fetchEmployeesData();
        notifySidebarBadgeRefresh();
        return;
      }

      const emailStatus = data.emailDispatch?.status;
      const emailNote =
        emailStatus === 'ACCEPTED_BY_SMTP'
          ? 'Notification email accepted by SMTP server.'
          : emailStatus === 'SKIPPED_DISABLED'
          ? 'Request rejected in database (SMTP email skipped because EMAIL_ENABLED is false).'
          : emailStatus === 'FAILED'
          ? 'Request rejected in database, but SMTP email delivery failed.'
          : '';

      setBannerMessage({
        type: 'success',
        text: `${data.message} ${emailNote}`.trim(),
      });
      setRejectTarget(null);
      setRejectionReason('');
      await fetchEmployeesData();
      notifySidebarBadgeRefresh();
    } catch {
      setBannerMessage({
        type: 'error',
        text: 'Network error while rejecting employee request.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleToggleEmployeeActive = async (emp: AdminEmployeeRow) => {
    setActionBusyId(emp.id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE_ACTIVE',
          active: !emp.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMessage({
          type: 'error',
          text: data.error || 'Failed to update employee status.',
        });
        return;
      }

      setBannerMessage({
        type: 'success',
        text: data.message || 'Employee account status updated.',
      });
      await fetchEmployeesData();
    } catch {
      setBannerMessage({
        type: 'error',
        text: 'Network error while updating employee status.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleUpdateEmployeeDepartment = async (
    emp: AdminEmployeeRow,
    departmentId: string
  ) => {
    if (!departmentId || departmentId === emp.departmentId) return;
    setActionBusyId(emp.id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_DEPARTMENT',
          departmentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMessage({
          type: 'error',
          text: data.error || 'Failed to update employee department.',
        });
        return;
      }

      setBannerMessage({
        type: 'success',
        text: data.message || 'Employee department updated.',
      });
      await fetchEmployeesData();
    } catch {
      setBannerMessage({
        type: 'error',
        text: 'Network error while updating employee department.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  type UnifiedEmployeeRequest =
    | {
        kind: 'REGISTRATION';
        id: string;
        name: string;
        email: string;
        departmentName: string | null;
        position: string | null;
        phoneNumber: string | null;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        createdAt: string | Date;
        rejectionReason: string | null;
        rawReg: AdminEmployeeRow;
      }
    | {
        kind: 'PASSWORD_RESET';
        id: string;
        name: string;
        email: string;
        departmentName: string | null;
        position: string | null;
        phoneNumber: string | null;
        status: PasswordResetStatusType;
        createdAt: string | Date;
        rejectionReason: string | null;
        expiresAt: string | null;
        reviewedByName: string | null;
        rawReset: EmployeePasswordResetRow;
      };

  const unifiedEmployeeRequests: UnifiedEmployeeRequest[] = [
    ...requests.map(
      (r): UnifiedEmployeeRequest => ({
        kind: 'REGISTRATION',
        id: r.id,
        name: r.name,
        email: r.email,
        departmentName: r.departmentName,
        position: r.position,
        phoneNumber: r.phoneNumber,
        status: r.approvalStatus,
        createdAt: r.createdAt,
        rejectionReason: r.rejectionReason,
        rawReg: r,
      })
    ),
    ...passwordResetRequests.map(
      (prr): UnifiedEmployeeRequest => ({
        kind: 'PASSWORD_RESET',
        id: prr.id,
        name: prr.userName,
        email: prr.userEmail,
        departmentName: prr.departmentName,
        position: prr.position,
        phoneNumber: prr.phoneNumber,
        status: prr.status,
        createdAt: prr.createdAt,
        rejectionReason: prr.rejectionReason,
        expiresAt: prr.expiresAt,
        reviewedByName: prr.reviewedByName,
        rawReset: prr,
      })
    ),
  ].sort((a, b) => {
    const aPending = a.status === 'PENDING' ? 0 : 1;
    const bPending = b.status === 'PENDING' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const filteredRequests = unifiedEmployeeRequests.filter((item) => {
    if (requestTypeFilter !== 'ALL' && item.kind !== requestTypeFilter) {
      return false;
    }
    if (requestStatusFilter !== 'ALL' && item.status !== requestStatusFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q) ||
      (item.departmentName && item.departmentName.toLowerCase().includes(q)) ||
      (item.position && item.position.toLowerCase().includes(q)) ||
      (item.phoneNumber && item.phoneNumber.toLowerCase().includes(q))
    );
  });

  const filteredApprovedEmployees = employees.filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.departmentName && emp.departmentName.toLowerCase().includes(q)) ||
      (emp.position && emp.position.toLowerCase().includes(q)) ||
      (emp.phoneNumber && emp.phoneNumber.toLowerCase().includes(q))
    );
  });

  return (
    <AdminGuard>
      <AppLayout onRefreshData={fetchEmployeesData}>
        {loading ? (
          <GatekeeperLoader
            variant="section"
            title="Loading employee requests and accounts..."
          />
        ) : (
          <div className="space-y-6">
            {/* Page Header */}
            <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-200 bg-white/10 px-2.5 py-0.5 rounded-full">
                    Employee Portal Administration
                  </span>
                  {pendingCount > 0 && (
                    <span className="text-xs font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
                      {pendingCount} Pending Request{pendingCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Employee Management
                </h1>
                <p className="text-xs sm:text-sm text-blue-100 max-w-2xl">
                  Review and approve Employee Portal registration requests, or directly add approved employee accounts.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={openAddEmployeeModal}
                  className="px-4 py-2.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 active:bg-blue-100 text-xs font-extrabold shadow-lg shadow-blue-950/20 flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Add Employee</span>
                </button>
                <a
                  href="/employee"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 transition-all"
                >
                  <span>Open Employee Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={fetchEmployeesData}
                  className="px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {bannerMessage && (
              <div
                className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
                  bannerMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : bannerMessage.type === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {bannerMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{bannerMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBannerMessage(null)}
                  className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Tabs + Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="inline-flex p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('REQUESTS')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'REQUESTS'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>1. Employee Requests</span>
                  {pendingCount > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        activeTab === 'REQUESTS'
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('EMPLOYEES')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'EMPLOYEES'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>2. Employees</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      activeTab === 'EMPLOYEES'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {employees.length}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {activeTab === 'REQUESTS' && (
                  <select
                    value={requestStatusFilter}
                    onChange={(e) =>
                      setRequestStatusFilter(
                        e.target.value as
                          | 'ALL'
                          | 'PENDING'
                          | 'APPROVED'
                          | 'REJECTED'
                          | 'COMPLETED'
                          | 'EXPIRED'
                      )
                    }
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="ALL">
                      All Statuses ({unifiedEmployeeRequests.length})
                    </option>
                    <option value="PENDING">Pending ({pendingCount})</option>
                    <option value="APPROVED">
                      Approved (
                      {
                        unifiedEmployeeRequests.filter((r) => r.status === 'APPROVED')
                          .length
                      }
                      )
                    </option>
                    <option value="COMPLETED">
                      Completed (
                      {
                        unifiedEmployeeRequests.filter((r) => r.status === 'COMPLETED')
                          .length
                      }
                      )
                    </option>
                    <option value="REJECTED">
                      Rejected (
                      {
                        unifiedEmployeeRequests.filter((r) => r.status === 'REJECTED')
                          .length
                      }
                      )
                    </option>
                    <option value="EXPIRED">
                      Expired (
                      {
                        unifiedEmployeeRequests.filter((r) => r.status === 'EXPIRED')
                          .length
                      }
                      )
                    </option>
                  </select>
                )}

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, department, email..."
                    className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                  />
                </div>
              </div>
            </div>

            {/* ================================================================= */}
            {/* TAB 1: EMPLOYEE REQUESTS                                          */}
            {/* ================================================================= */}
            {activeTab === 'REQUESTS' ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Employee Request Management
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Review and approve Employee registration requests and Forgot Password recovery requests.
                    </p>
                  </div>

                  {/* Request Category / Type Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRequestTypeFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                        requestTypeFilter === 'ALL'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>All Requests</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                          requestTypeFilter === 'ALL'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {unifiedEmployeeRequests.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequestTypeFilter('REGISTRATION')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                        requestTypeFilter === 'REGISTRATION'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Registration Requests</span>
                      {pendingRegistrationCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                          {pendingRegistrationCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRequestTypeFilter('PASSWORD_RESET')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                        requestTypeFilter === 'PASSWORD_RESET'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Password Reset Requests</span>
                      {pendingPasswordResetCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                          {pendingPasswordResetCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {filteredRequests.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                      <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                      <p className="font-semibold text-slate-500 dark:text-slate-400">
                        No employee requests match the selected category or filter.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs min-w-[980px]">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-3">Employee Name</th>
                          <th className="px-4 py-3">Request Type</th>
                          <th className="px-4 py-3">Department &amp; Position</th>
                          <th className="px-4 py-3">Phone Number</th>
                          <th className="px-4 py-3">Registered Email</th>
                          <th className="px-4 py-3">Request Date / Time</th>
                          <th className="px-4 py-3">Current Status</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {filteredRequests.map((req) => (
                          <tr
                            key={`${req.kind}_${req.id}`}
                            id={`emp-req-row-${req.id}`}
                            className={`transition-colors ${
                              highlightedRequestId === req.id
                                ? 'bg-blue-50/90 dark:bg-blue-950/60 ring-2 ring-inset ring-blue-500'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                              {req.name}
                            </td>

                            <td className="px-4 py-3.5">
                              {req.kind === 'PASSWORD_RESET' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-extrabold text-[10px] uppercase tracking-wider">
                                  <KeyRound className="w-3 h-3" />
                                  <span>Password Reset</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-extrabold text-[10px] uppercase tracking-wider">
                                  <UserPlus className="w-3 h-3" />
                                  <span>Registration</span>
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                                  <Building2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                  {req.departmentName || 'Unassigned'}
                                </span>
                                {req.position && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                                    <Briefcase className="w-3 h-3 text-slate-400" />
                                    {req.position}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-slate-300">
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {req.phoneNumber || '—'}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                              <span className="inline-flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                {req.email}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                              {new Date(req.createdAt).toLocaleString([], {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                    req.status === 'PENDING'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                      : req.status === 'APPROVED'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                      : req.status === 'COMPLETED'
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                                      : req.status === 'EXPIRED'
                                      ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                  }`}
                                >
                                  {req.status}
                                </span>
                                {req.kind === 'PASSWORD_RESET' &&
                                  req.status === 'APPROVED' &&
                                  req.expiresAt && (
                                    <div className="text-[10px] text-slate-400">
                                      Expires{' '}
                                      {new Date(req.expiresAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </div>
                                  )}
                              </div>
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              {req.status === 'PENDING' ? (
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={actionBusyId === req.id}
                                    onClick={() => {
                                      if (req.kind === 'PASSWORD_RESET') {
                                        void handleApprovePasswordReset(req.rawReset);
                                      } else {
                                        setApproveTarget(req.rawReg);
                                      }
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={actionBusyId === req.id}
                                    onClick={() => {
                                      if (req.kind === 'PASSWORD_RESET') {
                                        setRejectResetTarget(req.rawReset);
                                        setResetRejectionReason('');
                                      } else {
                                        setRejectTarget(req.rawReg);
                                        setRejectionReason('');
                                      }
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  {req.status === 'APPROVED'
                                    ? 'Approved'
                                    : req.status === 'COMPLETED'
                                    ? 'Password Updated'
                                    : req.status === 'EXPIRED'
                                    ? 'Expired'
                                    : req.rejectionReason
                                    ? `Rejected: ${req.rejectionReason}`
                                    : 'Rejected'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              /* ================================================================= */
              /* TAB 2: APPROVED EMPLOYEES                                         */
              /* ================================================================= */
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Approved Employees
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Active employee accounts authorized to sign in at /employee and invite guests.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddEmployeeModal}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add Employee</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  {filteredApprovedEmployees.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                      <UserCheck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                      <p className="font-semibold text-slate-500 dark:text-slate-400">
                        No approved employee accounts yet.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs min-w-[880px]">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-3">Employee Name</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Position</th>
                          <th className="px-4 py-3">Phone &amp; Email</th>
                          <th className="px-4 py-3">Guest Invitations</th>
                          <th className="px-4 py-3">Approved At</th>
                          <th className="px-4 py-3">Account Status</th>
                          <th className="px-5 py-3 text-right">Management</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {filteredApprovedEmployees.map((emp) => (
                          <tr
                            key={emp.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                              {emp.name}
                            </td>

                            <td className="px-4 py-3.5">
                              {departments.length > 0 ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold">
                                  <Building2 className="w-3 h-3 shrink-0" />
                                  <select
                                    value={
                                      emp.departmentId ||
                                      departments.find(
                                        (d) =>
                                          d.name.toLowerCase() ===
                                          (emp.departmentName || '').toLowerCase()
                                      )?.id ||
                                      ''
                                    }
                                    disabled={actionBusyId === emp.id}
                                    onChange={(e) =>
                                      void handleUpdateEmployeeDepartment(emp, e.target.value)
                                    }
                                    aria-label={`Change department for ${emp.name}`}
                                    className="bg-transparent text-xs font-bold text-blue-700 dark:text-blue-300 focus:outline-none cursor-pointer"
                                  >
                                    {!emp.departmentId &&
                                      !departments.some(
                                        (d) =>
                                          d.name.toLowerCase() ===
                                          (emp.departmentName || '').toLowerCase()
                                      ) && (
                                        <option value="" disabled>
                                          {emp.departmentName || 'Assign Department'}
                                        </option>
                                      )}
                                    {departments.map((d) => (
                                      <option
                                        key={d.id}
                                        value={d.id}
                                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                      >
                                        {d.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold">
                                  <Building2 className="w-3 h-3" />
                                  {emp.departmentName || 'General'}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                              {emp.position || '—'}
                            </td>

                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-slate-800 dark:text-slate-200">
                                {emp.email}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500">
                                {emp.phoneNumber || '—'}
                              </p>
                            </td>

                            <td className="px-4 py-3.5">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                                {emp.totalInvitations || 0} Invited
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-slate-500">
                              {emp.approvedAt
                                ? new Date(emp.approvedAt).toLocaleDateString([], {
                                    dateStyle: 'medium',
                                  })
                                : '—'}
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                  emp.active
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    emp.active ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {emp.active ? 'Active' : 'Deactivated'}
                              </span>
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                disabled={actionBusyId === emp.id}
                                onClick={() => handleToggleEmployeeActive(emp)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                                  emp.active
                                    ? 'border-rose-200 dark:border-rose-800 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                    : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>{emp.active ? 'Deactivate' : 'Activate'}</span>
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

        {/* Add Employee Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Add Employee
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Creates an immediately active and approved Employee Portal account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateEmployee} className="p-6 space-y-4 text-xs">
                {addError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{addError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={addFullName}
                      onChange={(e) => setAddFullName(e.target.value)}
                      placeholder="e.g. Ayesha Khan"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Department *
                    </label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        required
                        value={addDepartmentId}
                        onChange={(e) => setAddDepartmentId(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Position *
                    </label>
                    <div className="relative">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={addPosition}
                        onChange={(e) => setAddPosition(e.target.value)}
                        placeholder="e.g. Operations Manager"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Phone Number *
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        value={addPhoneNumber}
                        onChange={(e) => setAddPhoneNumber(e.target.value)}
                        placeholder="03001234567"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="employee@company.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Password *
                    </label>
                    <PasswordInput
                      showLockIcon
                      required
                      minLength={6}
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Confirm Password *
                    </label>
                    <PasswordInput
                      showLockIcon
                      required
                      minLength={6}
                      value={addConfirmPassword}
                      onChange={(e) => setAddConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-white font-extrabold shadow-md shadow-blue-500/20 cursor-pointer flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{addSubmitting ? 'Creating Employee...' : 'Create Employee Account'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Approve Confirmation Modal */}
        {approveTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/70 dark:bg-emerald-950/40 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Approve Employee Request
                </h3>
                <button
                  type="button"
                  onClick={() => setApproveTarget(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Are you sure you want to approve <strong>{approveTarget.name}</strong> for Employee Portal access?
                </p>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Department:</span>
                    <span className="font-bold">{approveTarget.departmentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Position:</span>
                    <span className="font-bold">{approveTarget.position}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-bold">{approveTarget.email}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setApproveTarget(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === approveTarget.id}
                    onClick={handleApproveConfirm}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold cursor-pointer"
                  >
                    {actionBusyId === approveTarget.id ? 'Approving...' : 'Confirm Approval'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reject / Dismiss Confirmation Modal */}
        {rejectTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-rose-50/70 dark:bg-rose-950/40 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  Reject Employee Request
                </h3>
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleRejectConfirm} className="p-6 space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Rejecting <strong>{rejectTarget.name}</strong> ({rejectTarget.email}) will block their access to the Employee Dashboard and update their status to <strong>REJECTED</strong>.
                </p>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Reason for Rejection
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Department verification could not be completed."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRejectTarget(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusyId === rejectTarget.id}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-extrabold cursor-pointer"
                  >
                    {actionBusyId === rejectTarget.id ? 'Rejecting...' : 'Reject Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reject Employee Password Reset Confirmation Modal */}
        {rejectResetTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-rose-50/70 dark:bg-rose-950/40 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  Reject Employee Password Reset
                </h3>
                <button
                  type="button"
                  onClick={() => setRejectResetTarget(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleRejectPasswordResetConfirm} className="p-6 space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Are you sure you want to reject the password reset request for{' '}
                  <strong>{rejectResetTarget.userName}</strong> ({rejectResetTarget.userEmail})?
                </p>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Reason for Rejection
                  </label>
                  <textarea
                    rows={3}
                    value={resetRejectionReason}
                    onChange={(e) => setResetRejectionReason(e.target.value)}
                    placeholder="e.g. Please verify identity with HR or Security Administrator."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRejectResetTarget(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusyId === rejectResetTarget.id}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-extrabold cursor-pointer"
                  >
                    {actionBusyId === rejectResetTarget.id ? 'Rejecting...' : 'Reject Reset Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AppLayout>
    </AdminGuard>
  );
}

export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={<div role="status">Loading employees...</div>}>
      <AdminEmployeesContent />
    </Suspense>
  );
}
