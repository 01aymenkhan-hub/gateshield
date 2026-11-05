'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import AdminGuard from '@/components/auth/AdminGuard';
import {
  UserCog,
  UserPlus,
  Shield,
  Check,
  X,
  Key,
  Pencil,
  CheckCircle2,
  Loader2,
  QrCode,
  Copy,
  RefreshCw,
  Clock,
  XCircle,
  Eye,
  Phone,
  Mail,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import OperatorQrCardModal, { OperatorQrCardData } from '@/components/modals/OperatorQrCardModal';

type ModalMode = 'create' | 'edit';
type ActiveTab = 'operators' | 'requests';

interface SharedCredentialsData {
  name: string;
  email: string;
  phone?: string | null;
  operatorNumber?: string | null;
  temporaryPassword: string;
  qrCard?: OperatorQrCardData | null;
}

function AccessManagementContent() {
  const { user: currentUser } = useAuth();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    searchParams?.get('tab') === 'requests' ? 'requests' : 'operators'
  );
  const [users, setUsers] = useState<any[]>([]);
  const [operatorRequests, setOperatorRequests] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [gates, setGates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  // Operator QR Card Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [activeQrCard, setActiveQrCard] = useState<OperatorQrCardData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // One-Time Secure Credential Display/Copy Modal
  const [credentialsModalData, setCredentialsModalData] = useState<SharedCredentialsData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [initialFormState, setInitialFormState] = useState<any>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'OPERATOR' | 'ADMIN'>('OPERATOR');
  const [selectedGates, setSelectedGates] = useState<string[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Request View / Approve / Reject Modals
  const [viewingRequest, setViewingRequest] = useState<any | null>(null);
  const [approvingRequest, setApprovingRequest] = useState<any | null>(null);
  const [approveGates, setApproveGates] = useState<string[]>([]);
  const [rejectingRequest, setRejectingRequest] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessingRequest, setIsProcessingRequest] = useState(false);

  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'requests') {
      setActiveTab('requests');
    }
  }, [searchParams]);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, opRes, gRes] = await Promise.all([
        fetch('/api/users', { cache: 'no-store' }),
        fetch('/api/admin/operators', { cache: 'no-store' }),
        fetch('/api/gates', { cache: 'no-store' }),
      ]);
      if (uRes.ok) {
        const uData = await uRes.json();
        const allUsers = Array.isArray(uData.users) ? uData.users : [];
        // Show approved members in the main Operators & Access tab
        setUsers(
          allUsers.filter(
            (u: any) => !u.approvalStatus || u.approvalStatus === 'APPROVED'
          )
        );
      }
      if (opRes.ok) {
        const opData = await opRes.json();
        setOperatorRequests(Array.isArray(opData.requests) ? opData.requests : []);
        setPendingCount(typeof opData.pendingCount === 'number' ? opData.pendingCount : 0);
      }
      if (gRes.ok) {
        const gData = await gRes.json();
        setGates(gData.gates || []);
      }
    } catch (e) {
      console.error('Error loading access data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
    let generated = 'Op-';
    for (let i = 0; i < 8; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingUserId(null);
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRole('OPERATOR');
    setSelectedGates([]);
    setModalError(null);
    setInitialFormState({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'OPERATOR',
      selectedGates: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (userToEdit: any) => {
    setModalMode('edit');
    setEditingUserId(userToEdit.id);
    const initialGates = userToEdit.gateAccess?.map((ga: any) => ga.gate?.id || ga.gateId) || [];
    setName(userToEdit.name || '');
    setEmail(userToEdit.email || '');
    setPhone(userToEdit.phone || '');
    setPassword('');
    setRole(userToEdit.role || 'OPERATOR');
    setSelectedGates(initialGates);
    setModalError(null);
    setInitialFormState({
      name: userToEdit.name || '',
      email: userToEdit.email || '',
      phone: userToEdit.phone || '',
      password: '',
      role: userToEdit.role || 'OPERATOR',
      selectedGates: initialGates,
    });
    setIsModalOpen(true);
  };

  const isFormDirty = () => {
    if (!initialFormState) return false;
    return (
      name !== initialFormState.name ||
      email !== initialFormState.email ||
      phone !== initialFormState.phone ||
      password !== initialFormState.password ||
      role !== initialFormState.role ||
      JSON.stringify(selectedGates.slice().sort()) !==
        JSON.stringify(initialFormState.selectedGates.slice().sort())
    );
  };

  const handleCloseModal = () => {
    if (isFormDirty()) {
      const confirmDiscard = window.confirm(
        'You have unsaved changes. Are you sure you want to discard them?'
      );
      if (!confirmDiscard) return;
    }
    setIsModalOpen(false);
    setModalError(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      if (modalMode === 'create') {
        if (!name.trim() || !email.trim()) {
          throw new Error('Name and email are required.');
        }

        if (role === 'OPERATOR') {
          // Use Admin Operator endpoint which supports auto/custom password + one-time credential display + QR card
          const res = await fetch('/api/admin/operators', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || null,
              password: password.trim() || undefined,
              gateIds: selectedGates,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to create operator account');

          setIsModalOpen(false);
          showNotification('Operator account created and approved immediately.');
          await loadData();

          if (data.credentials) {
            setCredentialsModalData({
              name: data.credentials.name,
              email: data.credentials.email,
              phone: data.credentials.phone,
              operatorNumber: data.credentials.operatorNumber,
              temporaryPassword: data.credentials.temporaryPassword,
              qrCard: data.qrCard || null,
            });
          } else if (data.qrCard) {
            setActiveQrCard(data.qrCard);
            setIsQrModalOpen(true);
          }
        } else {
          // Admin account creation
          if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters.');
          }
          const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim(),
              password,
              role: 'ADMIN',
              gateIds: [],
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to create administrator');

          setIsModalOpen(false);
          showNotification('Administrator account created successfully.');
          await loadData();
        }
      } else {
        // Edit Mode
        if (!name.trim() || !email.trim()) {
          throw new Error('Name and email are required.');
        }
        if (password && password.trim().length < 6) {
          throw new Error('New password must be at least 6 characters.');
        }

        const payload: any = {
          id: editingUserId,
          name: name.trim(),
          email: email.trim(),
          role,
          gateIds: role === 'OPERATOR' ? selectedGates : [],
        };
        if (password && password.trim().length >= 6) {
          payload.password = password.trim();
        }

        const res = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update member');

        setIsModalOpen(false);
        showNotification('Member updated successfully.');
        await loadData();
      }
    } catch (err: any) {
      setModalError(err?.message || 'Error processing request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetOperatorPassword = async (operatorUser: any) => {
    if (
      !window.confirm(
        `Generate a new temporary password for ${operatorUser.name} (${operatorUser.email})?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/operators/${operatorUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_PASSWORD' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset operator password');

      showNotification(`Password reset for ${operatorUser.name}.`);
      if (data.credentials) {
        setCredentialsModalData({
          name: operatorUser.name,
          email: data.credentials.email,
          phone: operatorUser.phone,
          operatorNumber: operatorUser.operatorNumber,
          temporaryPassword: data.credentials.temporaryPassword,
          qrCard: null,
        });
      }
    } catch (err: any) {
      alert(err?.message || 'Error resetting password');
    }
  };

  const handleOpenQrCard = async (userId: string) => {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/qr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch QR card');
      setActiveQrCard(data.card);
      setIsQrModalOpen(true);
    } catch (err: any) {
      alert(err?.message || 'Error loading operator QR card');
    } finally {
      setQrLoading(false);
    }
  };

  const handleRegenerateQr = async (userId: string) => {
    const res = await fetch(`/api/users/${userId}/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to regenerate QR card');
    setActiveQrCard(data.card);
    showNotification('Operator QR card regenerated successfully.');
    await loadData();
  };

  const handleRevokeQr = async (userId: string) => {
    const res = await fetch(`/api/users/${userId}/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to revoke QR card');
    setActiveQrCard((prev) => (prev ? { ...prev, isRevoked: true } : null));
    showNotification('Operator QR card revoked successfully.');
    await loadData();
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, active: !currentActive }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, active: !currentActive } : u))
        );
        showNotification(
          currentActive ? 'Member deactivated successfully.' : 'Member activated successfully.'
        );
      }
    } catch (e) {
      console.error('Error toggling active status:', e);
    }
  };

  const handleApproveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingRequest) return;
    setIsProcessingRequest(true);
    try {
      const res = await fetch(`/api/admin/operators/${approvingRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE',
          gateIds: approveGates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve operator request');

      setApprovingRequest(null);
      showNotification(`Operator request for ${approvingRequest.name} approved.`);
      window.dispatchEvent(new Event('gk:refresh-operator-badge'));
      await loadData();

      if (data.qrCard) {
        setActiveQrCard(data.qrCard);
        setIsQrModalOpen(true);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to approve request');
    } finally {
      setIsProcessingRequest(false);
    }
  };

  const handleRejectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRequest) return;
    setIsProcessingRequest(true);
    try {
      const res = await fetch(`/api/admin/operators/${rejectingRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECT',
          rejectionReason:
            rejectionReason.trim() || 'Your operator registration request was declined by Admin.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject operator request');

      setRejectingRequest(null);
      setRejectionReason('');
      showNotification(`Operator request for ${rejectingRequest.name} rejected.`);
      window.dispatchEvent(new Event('gk:refresh-operator-badge'));
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to reject request');
    } finally {
      setIsProcessingRequest(false);
    }
  };

  const copyToClipboard = async (text: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
    }
  };

  const filteredRequests = operatorRequests.filter((req) => {
    if (requestStatusFilter === 'ALL') return true;
    return req.approvalStatus === requestStatusFilter;
  });

  return (
    <AppLayout>
      <AdminGuard>
        <div className="space-y-6">
          {/* Success Banner Notification */}
          {successToast && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold animate-in fade-in slide-in-from-top-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
                <UserCog className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Operator &amp; Access Management
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Manage operator accounts, gate assignments, QR access cards, and operator self-registration requests
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Add Operator / Admin</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('operators')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'operators'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <UserCog className="w-3.5 h-3.5" />
              <span>Approved Operators &amp; Admins ({users.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'requests'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Operator Requests</span>
              {pendingCount > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    activeTab === 'requests'
                      ? 'bg-white text-blue-700'
                      : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {pendingCount} Pending
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: APPROVED OPERATORS & ADMINS */}
          {activeTab === 'operators' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[780px]">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">User</th>
                      <th className="px-4 py-3.5">Role</th>
                      <th className="px-4 py-3.5">Assigned Gates</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Created Date</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                            <span>Loading user accounts...</span>
                          </div>
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                          No member accounts found.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                              {u.operatorNumber && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  {u.operatorNumber}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                            {u.phone && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{u.phone}</p>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                u.role === 'ADMIN'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            {u.role === 'ADMIN' ? (
                              <span className="text-slate-500 font-medium">
                                All Gates (Full Control)
                              </span>
                            ) : u.gateAccess && u.gateAccess.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.gateAccess.map((ga: any) => (
                                  <span
                                    key={ga.gate.id}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  >
                                    {ga.gate.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No gates assigned</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {u.active ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
                                Deactivated
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {u.role === 'OPERATOR' && (
                                <>
                                  <button
                                    onClick={() => handleOpenQrCard(u.id)}
                                    disabled={qrLoading}
                                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title="View or Print Operator Login QR Card"
                                  >
                                    <QrCode className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    <span>QR Card</span>
                                  </button>

                                  <button
                                    onClick={() => handleResetOperatorPassword(u)}
                                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title="Generate & Share Temporary Password"
                                  >
                                    <Key className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                    <span>Reset Password</span>
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleOpenEdit(u)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="Edit Member Information"
                              >
                                <Pencil className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                <span>Edit</span>
                              </button>

                              {u.id !== currentUser?.id && (
                                <button
                                  onClick={() => handleToggleActive(u.id, u.active)}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                                    u.active
                                      ? 'border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                      : 'border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                  }`}
                                >
                                  {u.active ? 'Deactivate' : 'Activate'}
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
            </div>
          )}

          {/* TAB 2: SELF-REGISTRATION OPERATOR REQUESTS */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setRequestStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        requestStatusFilter === status
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden min-w-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Operator Applicant</th>
                        <th className="px-4 py-3.5">Phone Number</th>
                        <th className="px-4 py-3.5">Request Date &amp; Time</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-400 text-xs">
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto mb-2" />
                            Loading operator registration requests...
                          </td>
                        </tr>
                      ) : filteredRequests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-400 text-xs">
                            No operator registration requests found.
                          </td>
                        </tr>
                      ) : (
                        filteredRequests.map((req) => (
                          <tr
                            key={req.id}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {req.name}
                                </p>
                                {req.operatorNumber && (
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {req.operatorNumber}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">{req.email}</p>
                            </td>

                            <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                              {req.phone || '—'}
                            </td>

                            <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                              {new Date(req.createdAt).toLocaleString()}
                            </td>

                            <td className="px-4 py-3.5">
                              {req.approvalStatus === 'PENDING' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                  <Clock className="w-3 h-3" /> Pending Approval
                                </span>
                              )}
                              {req.approvalStatus === 'APPROVED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" /> Approved
                                </span>
                              )}
                              {req.approvalStatus === 'REJECTED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                                  <XCircle className="w-3 h-3" /> Rejected
                                </span>
                              )}
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingRequest(req)}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>View Details</span>
                                </button>

                                {req.approvalStatus !== 'APPROVED' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setApprovingRequest(req);
                                      setApproveGates(
                                        req.gateAccess?.map(
                                          (ga: any) => ga.gate?.id || ga.gateId
                                        ) || []
                                      );
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approve</span>
                                  </button>
                                )}

                                {req.approvalStatus === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingRequest(req);
                                      setRejectionReason('');
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Reject</span>
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
              </div>
            </div>
          )}
        </div>

        {/* Create / Edit Operator or Admin Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
            <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-xl text-white ${
                      modalMode === 'create' ? 'bg-blue-600' : 'bg-indigo-600'
                    }`}
                  >
                    {modalMode === 'create' ? (
                      <UserPlus className="w-4 h-4" />
                    ) : (
                      <Pencil className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      {modalMode === 'create' ? 'Add Operator / Admin Account' : 'Edit Member Account'}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {modalMode === 'create'
                        ? 'Admin-created accounts are immediately active and approved'
                        : `Modify profile details and assigned permissions for ${name || 'member'}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleSubmitForm} className="space-y-3.5">
                {/* 1. Name */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Officer Tariq"
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* 2. Email */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tariq@company.com"
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* 3. Phone (for Operators) */}
                {modalMode === 'create' && role === 'OPERATOR' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0300-1234567"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                )}

                {/* 4. Password with Generate button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {modalMode === 'create' ? (
                        role === 'OPERATOR' ? (
                          'Temporary Password (Optional — auto-generated if blank)'
                        ) : (
                          <>
                            Password <span className="text-rose-500">*</span>
                          </>
                        )
                      ) : (
                        'Change Password (Optional)'
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={generateTempPassword}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required={modalMode === 'create' && role === 'ADMIN'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      modalMode === 'create'
                        ? role === 'OPERATOR'
                          ? 'Leave blank to auto-generate temporary password'
                          : 'Minimum 6 characters'
                        : 'Leave blank to keep existing password'
                    }
                    className="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* 5. Role */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Role &amp; Privilege Level <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="OPERATOR">Operator / Guard</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>

                {/* 6. Gate Assignments */}
                {role === 'OPERATOR' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Assigned Gates
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {selectedGates.length} of {gates.length} selected
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
                      {gates.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No gates configured.</p>
                      ) : (
                        gates.map((g) => (
                          <label
                            key={g.id}
                            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-xs cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedGates.includes(g.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGates([...selectedGates, g.id]);
                                } else {
                                  setSelectedGates(selectedGates.filter((id) => id !== g.id));
                                }
                              }}
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {g.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({g.type})
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span>
                      Administrators automatically possess full access to all gates and system
                      management.
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>{modalMode === 'create' ? 'Create Account' : 'Save Changes'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ONE-TIME SECURE OPERATOR CREDENTIALS MODAL (For copying/sharing Email + Temp Password + QR Card) */}
        {credentialsModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      Operator Credentials Ready
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Copy and share these login credentials with the operator now
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCredentialsModalData(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Operator Name:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {credentialsModalData.name}{' '}
                    {credentialsModalData.operatorNumber
                      ? `(${credentialsModalData.operatorNumber})`
                      : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400">
                      Login Email
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {credentialsModalData.email}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copyToClipboard(credentialsModalData.email, 'email')
                    }
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedField === 'email' ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">
                      Temporary Password (Shown Once)
                    </span>
                    <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                      {credentialsModalData.temporaryPassword}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copyToClipboard(credentialsModalData.temporaryPassword, 'password')
                    }
                    className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100 cursor-pointer flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedField === 'password' ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      `GateShield Operator Login\nName: ${credentialsModalData.name}\nEmail: ${credentialsModalData.email}\nTemporary Password: ${credentialsModalData.temporaryPassword}`,
                      'all'
                    )
                  }
                  className="w-full sm:flex-1 py-2.5 px-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-extrabold hover:bg-blue-100 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedField === 'all' ? 'Copied All Credentials!' : 'Copy All Credentials'}</span>
                </button>

                {credentialsModalData.qrCard && (
                  <button
                    type="button"
                    onClick={() => {
                      const card = credentialsModalData.qrCard!;
                      setCredentialsModalData(null);
                      setActiveQrCard(card);
                      setIsQrModalOpen(true);
                    }}
                    className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Open QR Card</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW OPERATOR REQUEST DETAILS MODAL */}
        {viewingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
            <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Operator Registration Request Details
                </h3>
                <button
                  type="button"
                  onClick={() => setViewingRequest(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Operator Name:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {viewingRequest.name}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Operator ID:</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {viewingRequest.operatorNumber || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Email Address:</span>
                  <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {viewingRequest.email}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Phone Number:</span>
                  <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {viewingRequest.phone || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Requested On:</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {new Date(viewingRequest.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-extrabold">{viewingRequest.approvalStatus}</span>
                </div>
                {viewingRequest.rejectionReason && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
                    <span className="font-bold block mb-0.5">Rejection Reason:</span>
                    {viewingRequest.rejectionReason}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {viewingRequest.approvalStatus === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const req = viewingRequest;
                        setViewingRequest(null);
                        setRejectingRequest(req);
                        setRejectionReason('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const req = viewingRequest;
                        setViewingRequest(null);
                        setApprovingRequest(req);
                        setApproveGates([]);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Approve &amp; Assign Gates
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setViewingRequest(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* APPROVE OPERATOR REQUEST MODAL (Assign Gates & Activate) */}
        {approvingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
            <form
              onSubmit={handleApproveRequest}
              className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Approve Operator Request
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Approve {approvingRequest.name} ({approvingRequest.email}) and assign gate
                    access
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setApprovingRequest(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Assign Checkpoints / Gates
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {approveGates.length} of {gates.length} selected
                  </span>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
                  {gates.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No gates configured.</p>
                  ) : (
                    gates.map((g) => (
                      <label
                        key={g.id}
                        className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={approveGates.includes(g.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setApproveGates([...approveGates, g.id]);
                            } else {
                              setApproveGates(approveGates.filter((id) => id !== g.id));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {g.name}
                        </span>
                        <span className="text-[10px] text-slate-400">({g.type})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setApprovingRequest(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingRequest}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isProcessingRequest ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Approving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve &amp; Activate Operator</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* REJECT OPERATOR REQUEST MODAL */}
        {rejectingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
            <form
              onSubmit={handleRejectRequest}
              className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Reject Operator Request
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Decline operator registration for {rejectingRequest.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Reason for Rejection (Optional)
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide a brief reason for declining this request..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectingRequest(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingRequest}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isProcessingRequest ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Rejecting...</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>Reject Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Dedicated Operator QR Access Badge Card Modal */}
        <OperatorQrCardModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          cardData={activeQrCard}
          onRegenerate={handleRegenerateQr}
          onRevoke={handleRevokeQr}
        />
      </AdminGuard>
    </AppLayout>
  );
}

export default function AccessManagementPage() {
  return (
    <Suspense fallback={<div role="status">Loading access management...</div>}>
      <AccessManagementContent />
    </Suspense>
  );
}
