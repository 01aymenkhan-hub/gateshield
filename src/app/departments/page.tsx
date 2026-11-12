'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AdminGuard from '@/components/auth/AdminGuard';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  Phone,
  CheckCircle2,
  X,
  Loader2,
  AlertTriangle,
  Search,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface DepartmentItem {
  id: string;
  name: string;
  normalizedName: string;
  hodName: string;
  whatsappNumber: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  visitCount?: number;
}

type ModalMode = 'create' | 'edit';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [deptName, setDeptName] = useState('');
  const [hodName, setHodName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation modal state
  const [deptToDelete, setDeptToDelete] = useState<DepartmentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchDepartments = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const res = await fetch('/api/departments');
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load departments.');
        return;
      }
      setDepartments(data.departments || []);
    } catch {
      setLoadError('Network error while loading departments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/departments')
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || 'Failed to load departments.');
        } else {
          setDepartments(data.departments || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Network error while loading departments.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingDept(null);
    setDeptName('');
    setHodName('');
    setWhatsappNumber('');
    setIsActive(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: DepartmentItem) => {
    setModalMode('edit');
    setEditingDept(dept);
    setDeptName(dept.name);
    setHodName(dept.hodName);
    setWhatsappNumber(dept.whatsappNumber);
    setIsActive(dept.active);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setModalError(null);
  };

  const validateWhatsappClient = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return 'WhatsApp Number is required.';
    const compact = trimmed.replace(/[\s\-()]+/g, '');
    if (!/^03\d{9}$/.test(compact) && !/^\+?[1-9]\d{9,14}$/.test(compact)) {
      return 'Please enter a valid WhatsApp number (e.g., 03001234567 or +923001234567).';
    }
    return null;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const trimmedName = deptName.trim().replace(/\s+/g, ' ');
    const trimmedHod = hodName.trim().replace(/\s+/g, ' ');

    if (!trimmedName) {
      setModalError('Department Name is required.');
      return;
    }

    if (!trimmedHod) {
      setModalError('Head of Department (HOD) Name is required.');
      return;
    }

    const whatsappErr = validateWhatsappClient(whatsappNumber);
    if (whatsappErr) {
      setModalError(whatsappErr);
      return;
    }

    setIsSubmitting(true);
    try {
      const url =
        modalMode === 'create'
          ? '/api/departments'
          : `/api/departments/${editingDept?.id}`;
      const method = modalMode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          hodName: trimmedHod,
          whatsappNumber: whatsappNumber.trim(),
          active: isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || 'Failed to save department.');
        return;
      }

      setIsModalOpen(false);
      await fetchDepartments();
      showToast(
        modalMode === 'create'
          ? `Department "${trimmedName}" added successfully.`
          : `Department "${trimmedName}" updated successfully.`
      );
    } catch {
      setModalError('Network error while saving department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (dept: DepartmentItem) => {
    try {
      const res = await fetch(`/api/departments/${dept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !dept.active }),
      });
      if (res.ok) {
        await fetchDepartments();
        showToast(
          `Department "${dept.name}" ${!dept.active ? 'activated' : 'deactivated'}.`
        );
      }
    } catch {
      // Ignore transient error
    }
  };

  const handleConfirmDelete = async () => {
    if (!deptToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/departments/${deptToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete department.');
        return;
      }
      const deletedName = deptToDelete.name;
      setDeptToDelete(null);
      await fetchDepartments();
      showToast(`Department "${deletedName}" deleted.`);
    } catch {
      setDeleteError('Network error while deleting department.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDepartments = departments.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.hodName.toLowerCase().includes(q) ||
      d.whatsappNumber.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout>
      <AdminGuard>
        <div className="space-y-6">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-600 text-white shadow-xl shadow-emerald-600/20 text-sm font-semibold animate-in fade-in slide-in-from-bottom-4 duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
                <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                Department Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Manage organization departments, assign Heads of Department (HODs), and configure WhatsApp contact numbers for visitor notifications and department communication.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Department
            </button>
          </div>

          {/* Search & Summary Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by department, HOD name, or WhatsApp number..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-semibold">
              <span>
                Total: <strong className="text-slate-900 dark:text-white">{departments.length}</strong>
              </span>
              <span>•</span>
              <span>
                Active:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {departments.filter((d) => d.active).length}
                </strong>
              </span>
            </div>
          </div>

          {/* Departments Table / List */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-semibold">Loading departments...</p>
              </div>
            ) : loadError ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{loadError}</p>
                <button
                  type="button"
                  onClick={() => fetchDepartments(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : filteredDepartments.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {searchQuery.trim()
                      ? 'No matching departments found'
                      : 'Departments have not been configured yet'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {searchQuery.trim()
                      ? 'Try adjusting your search filter.'
                      : 'Add your first department so operators can select it during visitor registration.'}
                  </p>
                </div>
                {!searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Department
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 px-4">Department Name</th>
                      <th className="py-3.5 px-4">Head of Department (HOD)</th>
                      <th className="py-3.5 px-4">WhatsApp Number</th>
                      <th className="py-3.5 px-4">Visits</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {filteredDepartments.map((dept) => (
                      <tr
                        key={dept.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/70 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              {dept.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{dept.hodName}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-mono font-semibold text-xs">
                            <Phone className="w-3 h-3 shrink-0" />
                            <span>{dept.whatsappNumber}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-600 dark:text-slate-300">
                          {dept.visitCount ?? 0}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(dept)}
                            title="Click to toggle active status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                              dept.active
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {dept.active ? (
                              <>
                                <ToggleRight className="w-3.5 h-3.5" />
                                Active
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-3.5 h-3.5" />
                                Inactive
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(dept)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                              title="Edit Department"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeptToDelete(dept);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold text-xs transition-colors cursor-pointer"
                              title="Delete Department"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create / Edit Department Modal */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {modalMode === 'create' ? 'Add New Department' : 'Edit Department'}
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {modalMode === 'create'
                          ? 'Create a department for visitor registration'
                          : 'Update department details and HOD contact info'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
                  {modalError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 text-xs font-semibold text-rose-600 dark:text-rose-300">
                      {modalError}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="dept-name-input"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Department Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="dept-name-input"
                      type="text"
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      placeholder="e.g., Accounts, IT, Production, HR"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="hod-name-input"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Head of Department (HOD) Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="hod-name-input"
                      type="text"
                      value={hodName}
                      onChange={(e) => setHodName(e.target.value)}
                      placeholder="e.g., Mr. Tariq Mehmood"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="whatsapp-input"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      WhatsApp Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="whatsapp-input"
                      type="tel"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="e.g., 03001234567 or +923001234567"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Supports Pakistani mobile format (03XXXXXXXXX) or international format (+923XXXXXXXXX).
                    </p>
                  </div>

                  {modalMode === 'edit' && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Available in Operator Registration
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsActive((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-bold text-white shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {modalMode === 'create' ? 'Add Department' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deptToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        Delete Department &ldquo;{deptToDelete.name}&rdquo;?
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        This department will be removed from the Operator registration options. Historical visitor records for{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {deptToDelete.name}
                        </strong>{' '}
                        will be preserved intact.
                      </p>
                    </div>
                  </div>

                  {deleteError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-300">
                      {deleteError}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDeptToDelete(null)}
                      disabled={isDeleting}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-xs font-bold text-white shadow-md shadow-rose-600/20 cursor-pointer"
                    >
                      {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Delete Department
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminGuard>
    </AppLayout>
  );
}
