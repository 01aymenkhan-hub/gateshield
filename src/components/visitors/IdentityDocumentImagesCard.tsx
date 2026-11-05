'use client';

import React, { useState } from 'react';
import { CreditCard, ImageOff, RefreshCw, Maximize2, X, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface IdentityDocumentPerson {
  id: string;
  category?: string | null;
  company?: string | null;
  fullName?: string | null;
  cnicNumber?: string | null;
  dlsNumber?: string | null;
  hasCnicImage?: boolean;
  hasDlsImage?: boolean;
  hasDeliveryDocImage?: boolean;
  hasOutgoingDocImage?: boolean;
  latestDeliveryVisitId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visits?: Array<Record<string, any>>;
}

interface IdentityDocumentImagesCardProps {
  person: IdentityDocumentPerson;
  visitId?: string | null;
  compact?: boolean;
}

interface DocumentSlot {
  type: 'cnic' | 'dls' | 'delivery_doc' | 'delivery_in' | 'delivery_out';
  label: string;
  docNumber: string | null | undefined;
  subLabel?: string | null;
  visitId?: string | null;
  hasImage: boolean;
}

function SingleDocumentImagePanel({
  personId,
  slot,
  compact = false,
  onExpand,
}: {
  personId: string;
  slot: DocumentSlot;
  compact?: boolean;
  onExpand: (url: string, label: string, docNumber?: string | null) => void;
}) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState<boolean>(slot.hasImage);
  const [hasError, setHasError] = useState<boolean>(false);
  const [cacheBuster, setCacheBuster] = useState<number>(0);

  const imageUrl = `/api/visitors/${encodeURIComponent(personId)}/document-image?type=${slot.type}${
    slot.visitId ? `&visitId=${encodeURIComponent(slot.visitId)}` : ''
  }${cacheBuster ? `&v=${cacheBuster}` : ''}`;

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    setCacheBuster((prev) => prev + 1);
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden flex flex-col ${
        compact ? 'p-3 gap-2' : 'p-4 gap-3'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {slot.label}
            </h4>
            {slot.docNumber && (
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {slot.docNumber}
              </p>
            )}
            {slot.subLabel && (
              <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 truncate mt-0.5">
                {slot.subLabel}
              </p>
            )}
          </div>
        </div>

        {slot.hasImage && !hasError && (
          <button
            type="button"
            onClick={() => onExpand(imageUrl, slot.label, slot.docNumber)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer shrink-0"
            title={slot.label}
            aria-label={slot.label}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {slot.hasImage ? (
        <div
          className={`relative w-full aspect-[1.58/1] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center justify-center ${
            compact ? 'max-h-44' : 'max-h-60'
          }`}
        >
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-100/90 dark:bg-slate-900/90 z-10">
              <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {t('loading_please_wait', 'Loading, please wait...')}
              </span>
            </div>
          )}

          {hasError ? (
            <div className="p-4 text-center flex flex-col items-center justify-center gap-2">
              <ImageOff className="w-6 h-6 text-rose-500 dark:text-rose-400" />
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {t('failed_to_load_document_image', 'Unable to load document image.')}
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t('retry_save_image', 'Retry')}</span>
              </button>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={slot.label}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              onClick={() => onExpand(imageUrl, slot.label, slot.docNumber)}
              className="w-full h-full object-contain cursor-zoom-in transition-transform duration-200 hover:scale-[1.01]"
            />
          )}
        </div>
      ) : (
        <div
          className={`w-full aspect-[1.58/1] rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 flex flex-col items-center justify-center text-center p-4 ${
            compact ? 'max-h-32' : 'max-h-44'
          }`}
        >
          <ImageOff className="w-5 h-5 text-slate-400 dark:text-slate-500 mb-1.5" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t('image_not_available', 'Image not available')}
          </p>
        </div>
      )}
    </div>
  );
}

export default function IdentityDocumentImagesCard({
  person,
  visitId = null,
  compact = false,
}: IdentityDocumentImagesCardProps) {
  const { t } = useLanguage();
  const [expandedImage, setExpandedImage] = useState<{
    url: string;
    label: string;
    docNumber?: string | null;
  } | null>(null);

  if (!person || !person.id) return null;

  const hasCnicImage = Boolean(person.hasCnicImage);
  const hasDlsImage = Boolean(person.hasDlsImage);
  const latestVisit =
    (visitId && Array.isArray(person.visits)
      ? person.visits.find((v) => v.id === visitId)
      : null) ||
    (Array.isArray(person.visits) && person.visits.length > 0 ? person.visits[0] : null);

  const resolvedVisitId = visitId || latestVisit?.id || person.latestDeliveryVisitId || null;
  const hasIncomingDoc =
    Boolean(latestVisit?.hasIncomingDoc) || Boolean(person.hasDeliveryDocImage);
  const hasOutgoingDoc =
    Boolean(latestVisit?.hasOutgoingDoc) || Boolean(person.hasOutgoingDocImage);

  const hasCnicRecord = hasCnicImage || Boolean(person.cnicNumber);
  const hasDlsRecord = hasDlsImage || Boolean(person.dlsNumber);
  const isDelivery = String(person.category || '').toUpperCase() === 'DELIVERY';

  // Determine which document slots to display:
  // - If both CNIC and DLS images exist (or both document numbers/images exist and at least one has an image), show the applicable slots.
  // - Specifically:
  //   1) If hasCnicImage && hasDlsImage -> show both CNIC Image and Driving Licence Image
  //   2) Else if hasCnicImage -> show CNIC Image (and if hasDlsImage is false, only show DLS if hasDlsImage is true)
  //   3) Else if hasDlsImage -> show Driving Licence Image
  //   4) Else (neither image exists, e.g., older record or manual registration):
  //      show the slot matching the recorded document type (CNIC if cnicNumber, DLS if dlsNumber, or CNIC Image fallback) with "Image not available".
  const slots: DocumentSlot[] = [];

  if (hasCnicImage && hasDlsImage) {
    slots.push({
      type: 'cnic',
      label: t('cnic_image_label', 'CNIC Image'),
      docNumber: person.cnicNumber,
      hasImage: true,
    });
    slots.push({
      type: 'dls',
      label: t('dls_image_label', 'Driving Licence Image'),
      docNumber: person.dlsNumber,
      hasImage: true,
    });
  } else if (hasCnicImage) {
    slots.push({
      type: 'cnic',
      label: t('cnic_image_label', 'CNIC Image'),
      docNumber: person.cnicNumber,
      hasImage: true,
    });
  } else if (hasDlsImage) {
    slots.push({
      type: 'dls',
      label: t('dls_image_label', 'Driving Licence Image'),
      docNumber: person.dlsNumber,
      hasImage: true,
    });
  } else if (hasCnicRecord && hasDlsRecord) {
    slots.push({
      type: 'cnic',
      label: t('cnic_image_label', 'CNIC Image'),
      docNumber: person.cnicNumber,
      hasImage: false,
    });
    slots.push({
      type: 'dls',
      label: t('dls_image_label', 'Driving Licence Image'),
      docNumber: person.dlsNumber,
      hasImage: false,
    });
  } else if (hasDlsRecord) {
    slots.push({
      type: 'dls',
      label: t('dls_image_label', 'Driving Licence Image'),
      docNumber: person.dlsNumber,
      hasImage: false,
    });
  } else {
    slots.push({
      type: 'cnic',
      label: t('cnic_image_label', 'CNIC Image'),
      docNumber: person.cnicNumber,
      hasImage: false,
    });
  }

  if (hasIncomingDoc || hasOutgoingDoc || isDelivery) {
    const incomingTime = latestVisit?.incomingDocCapturedAt || latestVisit?.checkInTime;
    const outgoingTime = latestVisit?.outgoingDocCapturedAt || latestVisit?.checkOutTime;
    const vehicleSubtitle = latestVisit?.vehicleNo
      ? `${person.company || latestVisit?.hostName || 'Delivery'} • ${latestVisit.vehicleNo}`
      : person.company || latestVisit?.hostName || null;

    slots.push({
      type: 'delivery_in',
      label: t('incoming_delivery_doc_label', 'Incoming Delivery Document (Check-in)'),
      docNumber: vehicleSubtitle,
      subLabel:
        hasIncomingDoc && incomingTime
          ? `${t('captured_at_checkin_label', 'Captured at Check-in')}: ${new Date(
              incomingTime
            ).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
          : null,
      visitId: resolvedVisitId,
      hasImage: hasIncomingDoc,
    });

    slots.push({
      type: 'delivery_out',
      label: t('outgoing_delivery_doc_label', 'Outgoing Delivery Document (Checkout)'),
      docNumber: vehicleSubtitle,
      subLabel:
        hasOutgoingDoc && outgoingTime
          ? `${t('captured_at_checkout_label', 'Captured at Checkout')}: ${new Date(
              outgoingTime
            ).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
          : null,
      visitId: resolvedVisitId,
      hasImage: hasOutgoingDoc,
    });
  }

  return (
    <>
      <div
        className={`grid gap-3 ${
          slots.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {slots.map((slot) => (
          <SingleDocumentImagePanel
            key={slot.type}
            personId={person.id}
            slot={slot}
            compact={compact}
            onExpand={(url, label, docNumber) => setExpandedImage({ url, label, docNumber })}
          />
        ))}
      </div>

      {/* Lightbox Modal for Enlarged Inspection */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {expandedImage.label}
                  </h3>
                  {expandedImage.docNumber && (
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {expandedImage.docNumber}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={expandedImage.url}
                alt={expandedImage.label}
                className="max-w-full max-h-[68vh] object-contain rounded-xl shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
