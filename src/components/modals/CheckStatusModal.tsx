'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User, ShieldAlert, Award, Clock, Calendar, CheckCircle2, History, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import IdentityDocumentImagesCard from '@/components/visitors/IdentityDocumentImagesCard';
import { useLanguage } from '@/context/LanguageContext';

interface CheckStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckOut?: (visitId: string) => void;
  initialPerson?: {
    person: any;
    isCurrentlyInside?: boolean;
    activeVisit?: any;
    totalVisits?: number;
  } | null;
}

export default function CheckStatusModal({ isOpen, onClose, initialPerson }: CheckStatusModalProps) {
  const { language, t } = useLanguage();
  const isUr = language === 'ur';
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const getCategoryLabel = (cat?: string) => {
    const upper = String(cat || 'VISITOR').toUpperCase();
    if (!isUr) return upper;
    switch (upper) {
      case 'VISITOR':
        return 'وزیٹر';
      case 'VENDOR':
        return 'وینڈر';
      case 'INTERVIEW':
        return 'انٹرویو';
      case 'SPECIAL_GUEST':
        return 'مہمان';
      case 'CONTRACTOR':
        return 'ٹھیکیدار';
      case 'DELIVERY':
        return 'ڈلیوری';
      default:
        return upper;
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && initialPerson && initialPerson.person) {
      setResult({
        found: true,
        person: initialPerson.person,
        isCurrentlyInside: Boolean(initialPerson.isCurrentlyInside),
        activeVisit: initialPerson.activeVisit || null,
        totalVisits: initialPerson.totalVisits ?? 1,
        recentVisits: initialPerson.activeVisit ? [initialPerson.activeVisit] : [],
      });
      setError(null);
    }
  }, [isOpen, initialPerson]);

  // Live debounced suggestions
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSuggesting(true);
        const res = await fetch(`/api/visits/status?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (res.ok && data.found && Array.isArray(data.matches)) {
          setMatches(data.matches);
          setError(null);
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.error('Live search error:', err);
      } finally {
        setIsSuggesting(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Reset state on close
  const handleClose = () => {
    setQuery('');
    setResult(null);
    setMatches([]);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleSelectMatch = (match: any) => {
    setResult({
      found: true,
      person: match.person,
      isCurrentlyInside: match.isCurrentlyInside,
      activeVisit: match.activeVisit,
      totalVisits: match.totalVisits,
      recentVisits: match.recentVisits || (match.latestVisit ? [match.latestVisit] : []),
    });
    setError(null);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/visits/status?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to search');
      }

      if (!data.found || !data.matches || data.matches.length === 0) {
        setError(
          isUr
            ? 'آپ کی تلاش کے مطابق کوئی وزیٹر یا ریکارڈ نہیں ملا۔'
            : 'No person or visit record found matching your query.'
        );
        setMatches([]);
      } else if (data.matches.length === 1) {
        handleSelectMatch(data.matches[0]);
        setMatches([]);
      } else {
        setMatches(data.matches);
      }
    } catch (err: any) {
      setError(isUr ? 'حیثیت معلوم کرنے میں مسئلہ پیش آیا' : err?.message || 'Error checking status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={containerRef}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[85vh]"
      >
        {/* Header - Fixed & Stable */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div className={`min-w-0 flex-1 ${isUr ? 'text-right' : 'text-left'}`}>
              <h2
                dir="auto"
                className={`font-extrabold text-slate-900 dark:text-white ${
                  isUr ? 'text-[17px] sm:text-lg leading-[1.6]' : 'text-base'
                }`}
              >
                {t('check_status', 'Check Person Status')}
              </h2>
              <p
                dir="auto"
                className="text-xs text-slate-500 dark:text-slate-400 leading-[1.5]"
              >
                {isUr
                  ? 'موجودگی، سابقہ ملاقاتوں اور سیکیورٹی ریکارڈ کی فوری معلومات'
                  : 'Instant lookup of presence, visits & security status'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Controls - Fixed & Stable */}
        <div className="p-5 sm:p-6 pb-3 shrink-0">
          <form onSubmit={handleSearch} className="space-y-2">
            <label
              dir="auto"
              className={`block ${
                isUr ? 'text-[14px] sm:text-[15px] leading-[1.6] text-right' : 'text-xs'
              } font-semibold text-slate-700 dark:text-slate-300`}
            >
              {isUr
                ? 'نام، شناختی کارڈ نمبر، فون نمبر، یا کارڈ نمبر سے تلاش کریں'
                : 'Search by Name, CNIC, Phone, or Card No.'}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  dir="ltr"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (result) setResult(null);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Mehmood or 42201-1234567-1 or 03001234567"
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  autoFocus
                />
                {isSuggesting && (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className={`px-4 py-2 ${isUr ? 'text-sm leading-[1.6]' : 'text-sm'} font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-all cursor-pointer shrink-0`}
              >
                <span dir="auto">
                  {loading
                    ? isUr
                      ? 'تلاش جاری...'
                      : 'Checking...'
                    : isUr
                    ? 'چیک کریں'
                    : 'Check'}
                </span>
              </button>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div
              dir="auto"
              className="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-center"
            >
              {error}
            </div>
          )}
        </div>

        {/* Dynamic Lower Area - Independently Scrollable */}
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Matching Results List (when no single result is selected) */}
          {!result && matches.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col animate-in fade-in">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 pb-2 shrink-0">
                <span dir="auto" className={isUr ? 'text-[14px] leading-[1.6]' : ''}>
                  {isUr ? `ملتے جلتے ریکارڈز (${matches.length})` : `Matching Records (${matches.length})`}
                </span>
                <span dir="auto" className="text-[11px] text-slate-400 font-normal">
                  {isUr ? 'تفصیل دیکھنے کے لیے منتخب کریں' : 'Select a person below'}
                </span>
              </div>

              {/* Scrollable list: 3-4 items visible, scrollable for more */}
              <div className="overflow-y-auto space-y-2 pr-1.5 max-h-[min(290px,calc(100vh-230px))]">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMatch(m)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/50 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-800 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                        {m.person.photoUrl ? (
                          <img src={m.person.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {m.person.fullName}
                          </h4>
                          {m.person.isVip && (
                            <span
                              dir="auto"
                              className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 shrink-0"
                            >
                              {isUr ? 'وی آئی پی' : 'VIP'}
                            </span>
                          )}
                          {m.person.isBlacklisted && (
                            <span
                              dir="auto"
                              className="text-[9px] font-bold px-1 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 shrink-0"
                            >
                              {isUr ? 'بلاک شدہ' : 'BLOCKED'}
                            </span>
                          )}
                        </div>
                        <p dir="auto" className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {m.person.cnicNumber
                            ? `${isUr ? 'شناختی کارڈ:' : 'CNIC:'} ${m.person.cnicNumber}`
                            : `${isUr ? 'کیٹیگری:' : 'Category:'} ${getCategoryLabel(m.person.category)}`}
                          {m.cardNo ? ` • ${isUr ? 'کارڈ:' : 'Card:'} ${m.cardNo}` : ''}
                        </p>
                        {m.activeVisit ? (
                          <p dir="auto" className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
                            {isUr ? 'میزبان:' : 'Host:'} {m.activeVisit.hostName} ({m.activeVisit.department})
                          </p>
                        ) : m.latestVisit ? (
                          <p dir="auto" className="text-[10px] text-slate-400 truncate">
                            {isUr ? 'آخری آمد:' : 'Last visited:'}{' '}
                            {new Date(m.latestVisit.checkInTime).toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {m.isCurrentlyInside ? (
                        <span
                          dir="auto"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {isUr ? 'اندر موجود' : 'INSIDE'}
                        </span>
                      ) : (
                        <span
                          dir="auto"
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {isUr ? 'باہر' : 'OUTSIDE'}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Record Detail Profile Card */}
          {result && result.person && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 animate-in fade-in pr-1">
              <div className="flex items-center justify-between">
                <span
                  dir="auto"
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                >
                  {isUr ? 'وزیٹر کی تفصیلات' : 'Person Details'}
                </span>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <ArrowLeft className="w-3 h-3" />{' '}
                  <span dir="auto">{isUr ? 'واپس نتائج پر' : 'Back to Results'}</span>
                </button>
              </div>

              {/* Profile Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {result.person.photoUrl ? (
                        <img
                          src={result.person.photoUrl}
                          alt={result.person.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                          {result.person.fullName}
                        </h3>
                        {result.person.isVip && (
                          <span
                            dir="auto"
                            className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300"
                          >
                            <Award className="w-3 h-3" /> {isUr ? 'وی آئی پی' : 'VIP'}
                          </span>
                        )}
                        {result.person.isBlacklisted && (
                          <span
                            dir="auto"
                            className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300"
                          >
                            <ShieldAlert className="w-3 h-3" /> {isUr ? 'بلاک شدہ' : 'BLACKLISTED'}
                          </span>
                        )}
                      </div>
                      <p dir="auto" className="text-xs text-slate-500 dark:text-slate-400">
                        {getCategoryLabel(result.person.category)} •{' '}
                        {isUr ? 'شناختی کارڈ:' : 'CNIC:'} {result.person.cnicNumber || 'N/A'}
                        {result.person.dlsNumber
                          ? ` • ${isUr ? 'لائسنس:' : 'DLS:'} ${result.person.dlsNumber}`
                          : ''}{' '}
                        • {isUr ? 'فون نمبر:' : 'Phone:'} {result.person.phoneNumber || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Presence Pill */}
                  {result.isCurrentlyInside ? (
                    <span
                      dir="auto"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {isUr ? 'اندر موجود' : 'INSIDE'}
                    </span>
                  ) : (
                    <span
                      dir="auto"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {isUr ? 'باہر' : 'OUTSIDE'}
                    </span>
                  )}
                </div>

                {/* Active Visit Info */}
                {result.isCurrentlyInside && result.activeVisit && (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-xs space-y-1">
                    <p dir="auto" className="font-semibold text-emerald-900 dark:text-emerald-200">
                      {isUr ? 'موجودہ ملاقات:' : 'Active Visit:'} #{result.activeVisit.visitNumber}
                      {result.activeVisit.visitorCardNo
                        ? ` (${isUr ? 'کارڈ:' : 'Card:'} ${result.activeVisit.visitorCardNo})`
                        : ''}
                    </p>
                    <p dir="auto" className="text-emerald-800 dark:text-emerald-300">
                      {isUr ? 'آمد کا گیٹ:' : 'Entry Gate:'}{' '}
                      {result.activeVisit.entryGate?.name || 'Main Gate'}{' '}
                      {isUr ? 'بوقت' : 'at'}{' '}
                      {new Date(result.activeVisit.checkInTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p dir="auto" className="text-emerald-800 dark:text-emerald-300">
                      {isUr ? 'میزبان:' : 'Host:'} {result.activeVisit.hostName} ({result.activeVisit.department})
                    </p>
                  </div>
                )}

                {/* Scanned ID Card Images (CNIC / Driving Licence) */}
                <div className="space-y-2 pt-1">
                  <h4
                    dir="auto"
                    className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider"
                  >
                    {t('identity_documents_title', 'Scanned ID Card Images')}
                  </h4>
                  <IdentityDocumentImagesCard
                    person={result.person}
                    visitId={result.activeVisit?.id || result.recentVisits?.[0]?.id || null}
                    compact
                  />
                </div>
              </div>

              {/* Total visits stat */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span dir="auto" className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />{' '}
                  {isUr ? 'کل ریکارڈ شدہ ملاقاتیں:' : 'Total Recorded Visits:'}
                </span>
                <span dir="auto" className="font-bold text-slate-800 dark:text-slate-200">
                  {isUr ? `${result.totalVisits} ملاقاتیں` : `${result.totalVisits} visit(s)`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
