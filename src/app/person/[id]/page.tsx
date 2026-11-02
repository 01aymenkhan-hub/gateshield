'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import {
  Users,
  ArrowLeft,
  Calendar,
  Shield,
  Phone,
  CreditCard,
  MapPin,
  Building,
  Award,
  ShieldAlert,
  Printer,
  Clock,
  DoorOpen,
  DoorClosed,
  CheckCircle2,
  Package,
  Trash2,
} from 'lucide-react';
import VisitorBadgeModal from '@/components/modals/VisitorBadgeModal';
import IdentityDocumentImagesCard from '@/components/visitors/IdentityDocumentImagesCard';
import GatekeeperLoader from '@/components/ui/GatekeeperLoader';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

export default function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [person, setPerson] = useState<any>(null);
  const [activeVisit, setActiveVisit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVisitBadge, setSelectedVisitBadge] = useState<any>(null);

  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');

  // Delete states
  const [isDeletePersonOpen, setIsDeletePersonOpen] = useState(false);
  const [visitToDelete, setVisitToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadPerson = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/visitors/${id}`);
      if (!res.ok) throw new Error('Person not found');
      const data = await res.json();
      setPerson(data.person);
      setActiveVisit(data.activeVisit);
    } catch (e: any) {
      setError(e?.message || 'Error loading person details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPerson();
  }, [id]);

  const handleToggleVip = async () => {
    if (!person) return;
    try {
      const res = await fetch(`/api/visitors/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVip: !person.isVip }),
      });
      if (res.ok) {
        setPerson({ ...person, isVip: !person.isVip });
      }
    } catch (e) {
      console.error('Error toggling VIP:', e);
    }
  };

  const handleToggleBlacklist = async () => {
    if (!person) return;
    const willBlacklist = !person.isBlacklisted;
    try {
      const res = await fetch(`/api/visitors/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isBlacklisted: willBlacklist,
          blacklistReason: willBlacklist ? blacklistReason : null,
        }),
      });
      if (res.ok) {
        setPerson({
          ...person,
          isBlacklisted: willBlacklist,
          blacklistReason: willBlacklist ? blacklistReason : null,
        });
        setIsBlacklistModalOpen(false);
      }
    } catch (e) {
      console.error('Error toggling blacklist:', e);
    }
  };

  const handleDeletePerson = async () => {
    if (!person) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/visitors/${person.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete person');
      router.replace('/visitors');
    } catch (e: any) {
      setDeleteError(e?.message || 'Error deleting person profile');
      setIsDeleting(false);
    }
  };

  const handleDeleteVisit = async () => {
    if (!visitToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/visits/${visitToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete visit');
      setPerson({
        ...person,
        visits: person.visits.filter((v: any) => v.id !== visitToDelete.id),
      });
      if (activeVisit?.id === visitToDelete.id) {
        setActiveVisit(null);
      }
      setVisitToDelete(null);
    } catch (e: any) {
      setDeleteError(e?.message || 'Error deleting visit');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <GatekeeperLoader
          variant="section"
          title={t('loading_person_details', 'Loading person details...')}
        />
      </AppLayout>
    );
  }

  if (error || !person) {
    return (
      <AppLayout>
        <div className="p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-500">{error || 'Person record not found'}</p>
          <Link
            href="/visitors"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Visitors list</span>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/visitors"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Visitor Registry</span>
          </Link>
        </div>

        {/* Person Hero Profile Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                {person.photoUrl ? (
                  <img
                    src={person.photoUrl}
                    alt={person.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users className="w-8 h-8 text-slate-400" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {person.fullName}
                  </h1>
                  {person.isVip && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300">
                      <Award className="w-3 h-3" /> VIP
                    </span>
                  )}
                  {person.isBlacklisted && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300">
                      <ShieldAlert className="w-3 h-3" /> BLACKLISTED
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Category:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {person.category}
                  </span>{' '}
                  {person.fatherHusbandName && `• S/O / D/O / W/O: ${person.fatherHusbandName}`}
                </p>

                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  CNIC: {person.cnicNumber || 'N/A'} • DLS: {person.dlsNumber || 'N/A'} • Phone:{' '}
                  {person.phoneNumber || 'N/A'}
                </p>
              </div>
            </div>

            {/* Quick Actions (VIP / Blacklist) */}
            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <button
                onClick={handleToggleVip}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  person.isVip
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {person.isVip ? '★ VIP Marked' : '☆ Mark as VIP'}
              </button>

              <button
                onClick={() => {
                  if (person.isBlacklisted) {
                    handleToggleBlacklist();
                  } else {
                    setIsBlacklistModalOpen(true);
                  }
                }}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  person.isBlacklisted
                    ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600'
                }`}
              >
                {person.isBlacklisted ? 'Unblacklist Person' : 'Blacklist'}
              </button>

              {user?.role === 'ADMIN' && (
                <button
                  onClick={() => setIsDeletePersonOpen(true)}
                  className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  title="Delete Person Profile (Admin Only)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>

          {person.isBlacklisted && person.blacklistReason && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">
              <span className="font-bold">Blacklist Warning:</span> {person.blacklistReason}
            </div>
          )}

          {/* Demographic & Document Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Gender</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {person.gender || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Date of Birth</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {person.dateOfBirth || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Issue / Valid From</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {person.dateOfIssue || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Expiry / Valid Upto</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {person.dateOfExpiry || 'N/A'}
              </span>
            </div>
            {person.licensingAuthority && (
              <div>
                <span className="text-slate-400 block font-medium">Licensing Authority</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {person.licensingAuthority}
                </span>
              </div>
            )}
            {person.identification && (
              <div>
                <span className="text-slate-400 block font-medium">Identification Mark</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {person.identification}
                </span>
              </div>
            )}
            {person.company && (
              <div>
                <span className="text-slate-400 block font-medium">Company / Organization</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {person.company}
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-400 block font-medium">Lifetime Visits</span>
              <span className="font-extrabold text-blue-600 dark:text-blue-400">
                {person.visits?.length || 0} visits
              </span>
            </div>
          </div>
        </div>

        {/* Scanned ID Card Images Section */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('identity_documents_title', 'Scanned ID Card Images')}
            </h2>
          </div>
          <IdentityDocumentImagesCard person={person} />
        </div>

        {/* Additional Details & Belongings Section */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Additional Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
              <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider">
                Carried Items / Belongings
              </span>
              {person.belongings || activeVisit?.belongings || person.visits?.find((v: any) => v.belongings)?.belongings ? (
                <p className="font-semibold text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                  {person.belongings || activeVisit?.belongings || person.visits?.find((v: any) => v.belongings)?.belongings}
                </p>
              ) : (
                <p className="text-slate-400 italic">No carried belongings recorded</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
              <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider">
                Address Information
              </span>
              <p className="text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-500">Present Address:</span>{' '}
                {person.presentAddress || 'N/A'}
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-500">Permanent Address:</span>{' '}
                {person.permanentAddress || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Visit History Section */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                Visit History Logs ({person.visits?.length || 0})
              </h2>
              <p className="text-xs text-slate-400">Complete historical access ledger</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Visit #</th>
                  <th className="px-4 py-3.5">Host Person &amp; Dept</th>
                  <th className="px-4 py-3.5">
                    {String(person.category || '').toUpperCase() === 'DELIVERY'
                      ? 'Vehicle #'
                      : 'Card / Vehicle #'}
                  </th>
                  <th className="px-4 py-3.5">Check-In</th>
                  <th className="px-4 py-3.5">Check-Out</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {person.visits && person.visits.length > 0 ? (
                  person.visits.map((v: any) => {
                    const durationMins = v.checkOutTime
                      ? Math.round(
                          (new Date(v.checkOutTime).getTime() - new Date(v.checkInTime).getTime()) /
                            60000
                        )
                      : null;

                    return (
                      <tr
                        key={v.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {v.visitNumber}
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {v.hostName}
                          </p>
                          <p className="text-[10px] text-slate-400">{v.department}</p>
                          {v.belongings && (
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate max-w-[170px] mt-0.5" title={`Belongings: ${v.belongings}`}>
                              📦 {v.belongings}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {v.vehicleNo || v.visitorCardNo || 'N/A'}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {v.entryGate?.name || 'Gate'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(v.checkInTime).toLocaleString([], {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {v.checkOutTime ? (
                            <>
                              <p className="font-medium text-slate-800 dark:text-slate-200">
                                {v.exitGate?.name || 'Gate'}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {new Date(v.checkOutTime).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </p>
                            </>
                          ) : (
                            <span className="text-slate-400 italic">Not checked out</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {durationMins !== null ? `${durationMins} mins` : 'In progress'}
                        </td>

                        <td className="px-4 py-3.5">
                          {v.status === 'CHECKED_IN' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              INSIDE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              EXITED
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedVisitBadge({ ...v, person })}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                              title="Print Badge"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            {user?.role === 'ADMIN' && (
                              <button
                                onClick={() => {
                                  setVisitToDelete(v);
                                  setDeleteError(null);
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete Visit (Admin Only)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                      No visits recorded yet for this person.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Blacklist Modal */}
      {isBlacklistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-rose-600 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> Blacklist {person.fullName}
            </h3>
            <p className="text-xs text-slate-500">
              Future check-in attempts by this person will be automatically blocked at all gates.
            </p>

            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Reason for Blacklist <span className="text-red-500">*</span>
              </label>
              <textarea
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
                placeholder="e.g. Security incident, barred vendor, stolen property inquiry"
                rows={3}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsBlacklistModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleBlacklist}
                disabled={!blacklistReason.trim()}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
              >
                Confirm Blacklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Person Profile Confirmation Modal */}
      {isDeletePersonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Delete Person Profile?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This will permanently delete this person and all their historical visits.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs space-y-1">
              <p className="font-semibold text-rose-900 dark:text-rose-200">
                Name: <span className="font-bold">{person.fullName}</span>
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                CNIC/ID: {person.cnicNumber || person.dlsNumber || 'N/A'}
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                Visits to be deleted: {person.visits?.length || 0}
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
                  setIsDeletePersonOpen(false);
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeletePerson}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting Profile...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Visit Confirmation Modal */}
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
                onClick={handleDeleteVisit}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting Visit...</span>
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

      {selectedVisitBadge && (
        <VisitorBadgeModal
          isOpen={Boolean(selectedVisitBadge)}
          onClose={() => setSelectedVisitBadge(null)}
          visit={selectedVisitBadge}
        />
      )}
    </AppLayout>
  );
}
