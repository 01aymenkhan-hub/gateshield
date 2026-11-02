'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  DoorClosed,
  Search,
  X,
  CheckCircle,
  Clock,
  User,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Loader2,
  QrCode,
  ShieldCheck,
  Building,
  RotateCcw,
  CreditCard,
  Truck,
  Camera,
  FileText,
  Upload,
  Maximize2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import QrScanner from '@/components/scanner/QrScanner';
import VisitorPhotoCameraModal from '@/components/VisitorPhotoCameraModal';
import { compressIdentityImageFile } from '@/utils/documentImageCompression';

interface CheckOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialVisit?: any;
}

export default function CheckOutModal({
  isOpen,
  onClose,
  onSuccess,
  initialVisit,
}: CheckOutModalProps) {
  const { user, currentGate } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.role === 'ADMIN';
  const [checkoutMode, setCheckoutMode] = useState<'search' | 'qr'>('search');
  const [identifier, setIdentifier] = useState('');
  const [searching, setSearching] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeVisit, setActiveVisit] = useState<any>(initialVisit || null);
  const [alreadyCheckedOutRecord, setAlreadyCheckedOutRecord] = useState<any | null>(null);

  // Delivery Checkout Popup & Outgoing Document Capture State
  const [isDeliveryCheckoutPopupOpen, setIsDeliveryCheckoutPopupOpen] = useState(false);
  const [isOutgoingCameraOpen, setIsOutgoingCameraOpen] = useState(false);
  const [outgoingDocPreview, setOutgoingDocPreview] = useState<string | null>(null);
  const [deliveryCheckoutError, setDeliveryCheckoutError] = useState<string | null>(null);
  const [expandedDocPreview, setExpandedDocPreview] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const outgoingFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && initialVisit) {
      setActiveVisit(initialVisit);
      setError(null);
      setSuccessMessage(null);
      setIsDeliveryCheckoutPopupOpen(false);
      setOutgoingDocPreview(null);
      setDeliveryCheckoutError(null);
    }
  }, [isOpen, initialVisit]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Live debounced suggestions for manual search
  useEffect(() => {
    if (!isOpen || checkoutMode !== 'search') return;
    const trimmed = identifier.trim();

    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSuggesting(true);
        const res = await fetch(`/api/visits/status?q=${encodeURIComponent(trimmed)}&mode=checkout`);
        const data = await res.json();
        if (res.ok && data.found && Array.isArray(data.matches)) {
          setMatches(data.matches);
          setError(null);
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.error('Live checkout search error:', err);
      } finally {
        setIsSuggesting(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [identifier, isOpen, checkoutMode]);

  // Reset state on close
  const handleClose = () => {
    setIdentifier('');
    setActiveVisit(null);
    setAlreadyCheckedOutRecord(null);
    setMatches([]);
    setError(null);
    setSuccessMessage(null);
    setCheckoutMode('search');
    setIsDeliveryCheckoutPopupOpen(false);
    setIsOutgoingCameraOpen(false);
    setOutgoingDocPreview(null);
    setDeliveryCheckoutError(null);
    setExpandedDocPreview(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleSelectVisit = (match: any) => {
    if (!match.isCurrentlyInside || !match.activeVisit) {
      if (match.latestVisit) {
        setAlreadyCheckedOutRecord({
          ...match.latestVisit,
          person: match.person,
        });
        setActiveVisit(null);
        setError(null);
        return;
      }
      setError(
        `${match.person?.fullName || 'Person'} is not currently checked in (already checked out). Only visitors currently inside can be checked out.`
      );
      setActiveVisit(null);
      return;
    }

    setActiveVisit({
      ...match.activeVisit,
      person: match.person,
    });
    setError(null);
    setAlreadyCheckedOutRecord(null);
    setIsDeliveryCheckoutPopupOpen(false);
    setOutgoingDocPreview(null);
    setDeliveryCheckoutError(null);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim()) return;

    setSearching(true);
    setError(null);
    setActiveVisit(null);
    setAlreadyCheckedOutRecord(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visits/status?q=${encodeURIComponent(identifier.trim())}&mode=checkout`);
      const data = await res.json();

      if (!res.ok || !data.found || !data.matches || data.matches.length === 0) {
        setError(data.message || 'No visitor found with this information');
        setMatches([]);
      } else if (data.matches.length === 1) {
        const single = data.matches[0];
        if (!single.isCurrentlyInside || !single.activeVisit) {
          if (single.latestVisit) {
            setAlreadyCheckedOutRecord({
              ...single.latestVisit,
              person: single.person,
            });
            setMatches([]);
          } else {
            setError(`${single.person?.fullName || 'Person'} is not currently checked in (already checked out)`);
            setMatches([]);
          }
        } else {
          handleSelectVisit(single);
          setMatches([]);
        }
      } else {
        setMatches(data.matches);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to search for visitor');
    } finally {
      setSearching(false);
    }
  };

  // Handle QR Scan Detection
  const handleQrScan = async (decodedText: string) => {
    setSearching(true);
    setError(null);
    setActiveVisit(null);
    setAlreadyCheckedOutRecord(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/visits/qr-lookup?code=${encodeURIComponent(decodedText.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.found || !data.visit) {
        setError(data.error || 'Invalid Visitor Pass: The scanned QR code is invalid or not registered.');
        return;
      }

      if (data.visit.status === 'CHECKED_OUT') {
        // Visitor is already checked out: show details & alert, do NOT allow duplicate checkout
        setAlreadyCheckedOutRecord(data.visit);
      } else {
        // Active visitor inside: prepare for confirmation
        setActiveVisit({
          ...data.visit,
          person: data.visit.person,
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to lookup scanned QR pass');
    } finally {
      setSearching(false);
    }
  };

  // Capture Outgoing Delivery Document via camera
  const handleOutgoingDocCaptured = async (file: File, previewUrl: string) => {
    setIsOutgoingCameraOpen(false);
    setDeliveryCheckoutError(null);
    let finalPreview = previewUrl;
    try {
      const compressed = await compressIdentityImageFile(file, 1080, 1080, 0.88);
      if (compressed.ok) {
        finalPreview = compressed.dataUrl;
      }
    } catch {
      // Fallback to previewUrl
    }
    setOutgoingDocPreview(finalPreview);
  };

  // Upload Outgoing Delivery Document from device
  const handleOutgoingDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDeliveryCheckoutError(null);
    let finalPreview = URL.createObjectURL(file);
    try {
      const compressed = await compressIdentityImageFile(file, 1080, 1080, 0.88);
      if (compressed.ok) {
        finalPreview = compressed.dataUrl;
      }
    } catch {
      // Fallback
    }
    setOutgoingDocPreview(finalPreview);
  };

  const isActiveDelivery =
    String(activeVisit?.person?.category || '').toUpperCase() === 'DELIVERY';

  const handleOpenDeliveryCheckoutPopup = () => {
    setDeliveryCheckoutError(null);
    setIsDeliveryCheckoutPopupOpen(true);
  };

  const handleCheckOut = async () => {
    if (!activeVisit) return;

    if (isActiveDelivery && !outgoingDocPreview) {
      setDeliveryCheckoutError(
        'Please capture the outgoing delivery document before confirming checkout.'
      );
      setIsDeliveryCheckoutPopupOpen(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    setDeliveryCheckoutError(null);

    try {
      const res = await fetch('/api/visits/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitId: activeVisit.id,
          exitGateId: currentGate?.id,
          outgoingDocImageData: isActiveDelivery ? outgoingDocPreview : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check out');
      }

      const vehicleLabel = activeVisit.vehicleNo ? ` (Vehicle: ${activeVisit.vehicleNo})` : '';
      setSuccessMessage(
        isActiveDelivery
          ? `Delivery vehicle${vehicleLabel} — ${activeVisit.person?.fullName} checked out successfully!`
          : `${activeVisit.person?.fullName} checked out successfully!`
      );
      setIsDeliveryCheckoutPopupOpen(false);
      setOutgoingDocPreview(null);
      setActiveVisit(null);
      setIdentifier('');
      setMatches([]);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccessMessage(null);
        handleClose();
      }, 1500);
    } catch (err: any) {
      const errMsg = err?.message || 'Error completing checkout';
      if (isActiveDelivery && isDeliveryCheckoutPopupOpen) {
        setDeliveryCheckoutError(errMsg);
      } else {
        setError(errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={containerRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[85vh]"
      >
        {/* Header - Fixed & Stable */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <DoorClosed className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                Check Out Visitor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Log visitor departure, scan QR pass, or search manually
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (Search vs Scan QR) */}
        <div className="px-5 sm:px-6 pt-4 shrink-0">
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setCheckoutMode('search');
                setError(null);
                setAlreadyCheckedOutRecord(null);
              }}
              className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                checkoutMode === 'search'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Visitor</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCheckoutMode('qr');
                setError(null);
                setAlreadyCheckedOutRecord(null);
                setActiveVisit(null);
              }}
              className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                checkoutMode === 'qr'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan QR Code</span>
            </button>
          </div>
        </div>

        {/* Messages & Alerts */}
        <div className="px-5 sm:px-6 pt-3 shrink-0">
          {successMessage && (
            <div className="mb-2 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center gap-3 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Dynamic Content Area: QR Scanner or Manual Search */}
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* TAB 1: QR CAMERA SCANNER */}
          {checkoutMode === 'qr' && !activeVisit && !alreadyCheckedOutRecord && (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-2 animate-in fade-in">
              {searching ? (
                <div className="p-8 flex flex-col items-center justify-center space-y-3 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Resolving Visitor Pass...
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Verifying pass security token with GateShield database
                  </p>
                </div>
              ) : (
                <QrScanner
                  onScan={handleQrScan}
                  onCancel={() => setCheckoutMode('search')}
                />
              )}
            </div>
          )}

          {/* TAB 2: MANUAL SEARCH FORM */}
          {checkoutMode === 'search' && !activeVisit && !alreadyCheckedOutRecord && (
            <div className="space-y-3 flex-1 min-h-0 flex flex-col">
              <form onSubmit={handleSearch} className="space-y-2 shrink-0">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scan or enter Vehicle Number, CNIC, Phone, Pass ID, or Visitor Card No.
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (activeVisit) setActiveVisit(null);
                        if (error) setError(null);
                      }}
                      placeholder="e.g. KHI-1234 or 42201-1234567-1 or 03001234567 or CARD-01"
                      className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      autoFocus
                    />
                    {isSuggesting && (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={searching || !identifier.trim()}
                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-all cursor-pointer shrink-0"
                  >
                    {searching ? 'Finding...' : 'Find'}
                  </button>
                </div>
              </form>

              {/* Matching Visitors List (when no single active visit is selected) */}
              {matches.length > 0 && (
                <div className="flex-1 min-h-0 flex flex-col animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 pb-2 shrink-0">
                    <span>Matching Visitors / Deliveries ({matches.length})</span>
                    <span className="text-[11px] text-slate-400 font-normal">Select active record to check out</span>
                  </div>

                  <div className="overflow-y-auto space-y-2 pr-1.5 max-h-[min(290px,calc(100vh-230px))]">
                    {matches.map((m) => {
                      const isMatchDelivery =
                        String(m.person?.category || '').toUpperCase() === 'DELIVERY';
                      const matchVeh = m.vehicleNo || m.activeVisit?.vehicleNo || m.latestVisit?.vehicleNo;

                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectVisit(m)}
                          className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                            m.isCurrentlyInside
                              ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400 dark:hover:border-emerald-700'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-75 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                              {m.person.photoUrl ? (
                                <img src={m.person.photoUrl} alt="" className="w-full h-full object-cover" />
                              ) : isMatchDelivery ? (
                                <Truck className="w-5 h-5 text-blue-500" />
                              ) : (
                                <User className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                  {m.person.fullName}
                                </h4>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 shrink-0">
                                  {m.person.category}
                                </span>
                                {matchVeh && (
                                  <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                    🚚 {matchVeh}
                                  </span>
                                )}
                                {m.person.isVip && (
                                  <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 shrink-0">
                                    VIP
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {!isMatchDelivery && m.cardNo ? `Card: ${m.cardNo} • ` : ''}
                                {m.person.cnicNumber
                                  ? `CNIC: ${m.person.cnicNumber}`
                                  : m.person.dlsNumber
                                  ? `DLS: ${m.person.dlsNumber}`
                                  : m.person.category}
                                {m.person.phoneNumber ? ` • ${m.person.phoneNumber}` : ''}
                              </p>
                              {m.activeVisit ? (
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium truncate">
                                  {isMatchDelivery
                                    ? `Source: ${m.person.company || m.activeVisit.hostName}`
                                    : `Host: ${m.activeVisit.hostName} (${m.activeVisit.department})`}{' '}
                                  • In:{' '}
                                  {new Date(m.activeVisit.checkInTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-400 truncate">
                                  Completed / Checked out
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {m.isCurrentlyInside ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                INSIDE
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                CHECKED OUT
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STATE A: VISITOR / DELIVERY FOUND & INSIDE -> DETAILS & CHECKOUT CARD */}
          {activeVisit && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 animate-in fade-in pr-1">
              <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {activeVisit.person?.photoUrl ? (
                        <img
                          src={activeVisit.person.photoUrl}
                          alt={activeVisit.person.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : isActiveDelivery ? (
                        <Truck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <User className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {activeVisit.person?.fullName}
                        </h3>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                          {activeVisit.person?.category || 'VISITOR'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {activeVisit.person?.cnicNumber
                          ? `CNIC: ${activeVisit.person.cnicNumber}`
                          : activeVisit.person?.dlsNumber
                          ? `DLS: ${activeVisit.person.dlsNumber}`
                          : 'ID: N/A'}{' '}
                        • Phone: {activeVisit.person?.phoneNumber || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    CHECKED IN
                  </span>
                </div>

                {/* Prominent Vehicle Number Banner for Delivery */}
                {isActiveDelivery && (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Vehicle Number
                        </span>
                        <span className="text-sm font-mono font-extrabold text-slate-900 dark:text-white">
                          {activeVisit.vehicleNo || 'N/A'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Delivery Source / Company
                      </span>
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                        {activeVisit.person?.company || activeVisit.hostName || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-blue-200/60 dark:border-blue-900/40">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      {isActiveDelivery ? 'Delivery Source / Company:' : 'Visit To:'}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {isActiveDelivery
                        ? activeVisit.person?.company || activeVisit.hostName || 'N/A'
                        : activeVisit.hostName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      {isActiveDelivery ? 'Recipient / Department:' : 'Department:'}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {activeVisit.department || 'Delivery'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Entry Gate:</span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {activeVisit.entryGate?.name || 'Main Gate'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      Check-in Date &amp; Time:
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {new Date(activeVisit.checkInTime).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      {isActiveDelivery ? 'Vehicle Number:' : 'Card / Badge No:'}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {isActiveDelivery
                        ? activeVisit.vehicleNo || 'N/A'
                        : activeVisit.visitorCardNo || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 block text-[11px] font-bold">
                      Exit Gate (Active):
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {currentGate?.name || 'Main Gate'}
                    </span>
                  </div>
                </div>

                {/* Incoming Delivery Document Preview (if Delivery) */}
                {isActiveDelivery && activeVisit.person?.id && (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {t('incoming_delivery_doc_label', 'Incoming Delivery Document (Check-in)')}
                        </span>
                      </div>
                      {(activeVisit.hasIncomingDoc || activeVisit.person?.hasDeliveryDocImage) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDocPreview({
                              url: `/api/visitors/${encodeURIComponent(
                                activeVisit.person.id
                              )}/document-image?type=delivery_in&visitId=${encodeURIComponent(
                                activeVisit.id
                              )}`,
                              title: t(
                                'incoming_delivery_doc_label',
                                'Incoming Delivery Document (Check-in)'
                              ),
                            })
                          }
                          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>Expand</span>
                        </button>
                      )}
                    </div>

                    {activeVisit.hasIncomingDoc || activeVisit.person?.hasDeliveryDocImage ? (
                      <div
                        onClick={() =>
                          setExpandedDocPreview({
                            url: `/api/visitors/${encodeURIComponent(
                              activeVisit.person.id
                            )}/document-image?type=delivery_in&visitId=${encodeURIComponent(
                              activeVisit.id
                            )}`,
                            title: t(
                              'incoming_delivery_doc_label',
                              'Incoming Delivery Document (Check-in)'
                            ),
                          })
                        }
                        className="w-full h-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/visitors/${encodeURIComponent(
                            activeVisit.person.id
                          )}/document-image?type=delivery_in&visitId=${encodeURIComponent(
                            activeVisit.id
                          )}`}
                          alt="Incoming Delivery Document"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No incoming document image available
                      </p>
                    )}
                  </div>
                )}

                {!isAdmin && !isActiveDelivery && activeVisit.visitorCardNo && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                      <CreditCard className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-extrabold">
                        {t('collect_physical_card_label')}
                      </span>
                    </div>
                    <span className="text-sm sm:text-base font-mono font-extrabold px-3 py-1 rounded-lg bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs shrink-0">
                      {activeVisit.visitorCardNo}
                    </span>
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  {isActiveDelivery ? (
                    <button
                      type="button"
                      onClick={handleOpenDeliveryCheckoutPopup}
                      disabled={submitting}
                      className="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <DoorClosed className="w-4 h-4" />
                      <span>{t('checkout_btn', 'Checkout')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleCheckOut}
                      disabled={submitting}
                      className="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <DoorClosed className="w-4 h-4" />
                      <span>{submitting ? 'Checking Out...' : 'Confirm Check Out'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveVisit(null);
                      setIsDeliveryCheckoutPopupOpen(false);
                      setOutgoingDocPreview(null);
                      setDeliveryCheckoutError(null);
                      if (checkoutMode === 'qr') {
                        setAlreadyCheckedOutRecord(null);
                      }
                    }}
                    className="w-full py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>{checkoutMode === 'qr' ? 'Scan Another QR Pass' : 'Search Another Visitor'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STATE B: VISITOR FOUND BUT ALREADY CHECKED OUT */}
          {alreadyCheckedOutRecord && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 animate-in fade-in pr-1">
              <div className="p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/50 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {alreadyCheckedOutRecord.person?.photoUrl ? (
                        <img
                          src={alreadyCheckedOutRecord.person.photoUrl}
                          alt={alreadyCheckedOutRecord.person.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                        {alreadyCheckedOutRecord.person?.fullName}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        CNIC: {alreadyCheckedOutRecord.person?.cnicNumber || 'N/A'} •{' '}
                        {String(alreadyCheckedOutRecord.person?.category || '').toUpperCase() ===
                        'DELIVERY'
                          ? `Vehicle: ${alreadyCheckedOutRecord.vehicleNo || 'N/A'}`
                          : `Card: ${alreadyCheckedOutRecord.visitorCardNo || 'N/A'}`}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shrink-0">
                    ALREADY CHECKED OUT
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Visitor is already checked out</span>
                  </div>
                  <p className="text-[11px] pl-5.5 leading-relaxed">
                    This visitor departed at{' '}
                    <span className="font-bold">
                      {alreadyCheckedOutRecord.checkOutTime
                        ? new Date(alreadyCheckedOutRecord.checkOutTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'an earlier time'}
                    </span>
                    {alreadyCheckedOutRecord.exitGate?.name
                      ? ` through ${alreadyCheckedOutRecord.exitGate.name}`
                      : ''}
                    . Duplicate check-out is prevented.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Entry Gate:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {alreadyCheckedOutRecord.entryGate?.name || 'Main Gate'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Entry Time:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(alreadyCheckedOutRecord.checkInTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Exit Gate:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {alreadyCheckedOutRecord.exitGate?.name || 'Main Gate'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Exit Time:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {alreadyCheckedOutRecord.checkOutTime
                        ? new Date(alreadyCheckedOutRecord.checkOutTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Incoming & Outgoing Delivery Documents for Completed Delivery */}
                {String(alreadyCheckedOutRecord.person?.category || '').toUpperCase() ===
                  'DELIVERY' &&
                  alreadyCheckedOutRecord.person?.id && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block truncate">
                          Incoming Document
                        </span>
                        {alreadyCheckedOutRecord.hasIncomingDoc ||
                        alreadyCheckedOutRecord.person?.hasDeliveryDocImage ? (
                          <div
                            onClick={() =>
                              setExpandedDocPreview({
                                url: `/api/visitors/${encodeURIComponent(
                                  alreadyCheckedOutRecord.person.id
                                )}/document-image?type=delivery_in&visitId=${encodeURIComponent(
                                  alreadyCheckedOutRecord.id
                                )}`,
                                title: t(
                                  'incoming_delivery_doc_label',
                                  'Incoming Delivery Document (Check-in)'
                                ),
                              })
                            }
                            className="w-full h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center cursor-zoom-in"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/visitors/${encodeURIComponent(
                                alreadyCheckedOutRecord.person.id
                              )}/document-image?type=delivery_in&visitId=${encodeURIComponent(
                                alreadyCheckedOutRecord.id
                              )}`}
                              alt="Incoming Document"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic">Not available</p>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block truncate">
                          Outgoing Document
                        </span>
                        {alreadyCheckedOutRecord.hasOutgoingDoc ||
                        alreadyCheckedOutRecord.person?.hasOutgoingDocImage ? (
                          <div
                            onClick={() =>
                              setExpandedDocPreview({
                                url: `/api/visitors/${encodeURIComponent(
                                  alreadyCheckedOutRecord.person.id
                                )}/document-image?type=delivery_out&visitId=${encodeURIComponent(
                                  alreadyCheckedOutRecord.id
                                )}`,
                                title: t(
                                  'outgoing_delivery_doc_label',
                                  'Outgoing Delivery Document (Checkout)'
                                ),
                              })
                            }
                            className="w-full h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center cursor-zoom-in"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/visitors/${encodeURIComponent(
                                alreadyCheckedOutRecord.person.id
                              )}/document-image?type=delivery_out&visitId=${encodeURIComponent(
                                alreadyCheckedOutRecord.id
                              )}`}
                              alt="Outgoing Document"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic">Not available</p>
                        )}
                      </div>
                    </div>
                  )}

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAlreadyCheckedOutRecord(null);
                      setCheckoutMode('qr');
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Scan Another Pass</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAlreadyCheckedOutRecord(null);
                      setCheckoutMode('search');
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Search Visitor</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DELIVERY CHECKOUT POPUP MODAL (Outgoing Document Capture) */}
      {isDeliveryCheckoutPopupOpen && activeVisit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Popup Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {t('delivery_checkout_title', 'Delivery Checkout')}
                  </h3>
                  <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                    Vehicle: {activeVisit.vehicleNo || 'N/A'} •{' '}
                    {activeVisit.person?.company || activeVisit.hostName || 'Delivery'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setIsDeliveryCheckoutPopupOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Popup Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Instruction */}
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {t(
                  'delivery_checkout_instruction',
                  'Capture a clear picture of the outgoing goods list, dispatch slip, gate pass, or invoice provided by the delivery person before confirming checkout.'
                )}
              </div>

              {deliveryCheckoutError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{deliveryCheckoutError}</span>
                </div>
              )}

              <input
                ref={outgoingFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleOutgoingDocFileUpload}
              />

              {/* Outgoing Document Capture / Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {t('capture_outgoing_doc_label', 'Outgoing Delivery Document')}{' '}
                    <span className="text-red-500">*</span>
                  </span>
                  {outgoingDocPreview ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {t('outgoing_doc_captured_badge', 'Outgoing Document Captured ✓')}
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {t('photo_required_badge', 'Required')}
                    </span>
                  )}
                </div>

                {!outgoingDocPreview ? (
                  <div className="border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-blue-50/40 dark:bg-blue-950/20">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3">
                      <FileText className="w-7 h-7" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-4 max-w-xs">
                      Take a picture of the outgoing delivery document, dispatch slip, or gate pass
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => setIsOutgoingCameraOpen(true)}
                        className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{t('capture_outgoing_doc_btn', 'Capture Outgoing Document')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => outgoingFileInputRef.current?.click()}
                        className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-slate-800/60 space-y-3">
                    <div className="relative w-full h-44 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={outgoingDocPreview}
                        alt="Outgoing Delivery Document Preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setIsOutgoingCameraOpen(true)}
                        className="py-2 px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                        <span>{t('retake_outgoing_doc_btn', 'Retake')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => outgoingFileInputRef.current?.click()}
                        className="py-2 px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Upload Different</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Checkout & Cancel Actions */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCheckOut}
                  disabled={!outgoingDocPreview || submitting}
                  className={`w-full py-3 rounded-xl font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 ${
                    outgoingDocPreview && !submitting
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Completing Delivery Checkout...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>{t('confirm_checkout_btn', 'Confirm Checkout')}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsDeliveryCheckoutPopupOpen(false)}
                  className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal for Outgoing Document Capture */}
      <VisitorPhotoCameraModal
        isOpen={isOutgoingCameraOpen}
        onClose={() => setIsOutgoingCameraOpen(false)}
        onCapture={handleOutgoingDocCaptured}
        mode="document"
      />

      {/* Lightbox Modal for Incoming Document Preview */}
      {expandedDocPreview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setExpandedDocPreview(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {expandedDocPreview.title}
              </h4>
              <button
                type="button"
                onClick={() => setExpandedDocPreview(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={expandedDocPreview.url}
                alt={expandedDocPreview.title}
                className="max-w-full max-h-[68vh] object-contain rounded-xl shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
