'use client';

import React, { useState } from 'react';
import { Printer, RefreshCw, Ban, X, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import GateShieldLogo from '@/components/ui/GateShieldLogo';

export interface OperatorQrCardData {
  id: string;
  name: string;
  email?: string;
  operatorNumber?: string;
  qrDataUrl: string | null;
  createdAt?: string;
  isRevoked?: boolean;
  active?: boolean;
}

interface OperatorQrCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardData: OperatorQrCardData | null;
  onRegenerate?: (userId: string) => Promise<void>;
  onRevoke?: (userId: string) => Promise<void>;
}

export default function OperatorQrCardModal({
  isOpen,
  onClose,
  cardData,
  onRegenerate,
  onRevoke,
}: OperatorQrCardModalProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (!isOpen || !cardData) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    const confirmed = window.confirm(
      'Regenerating will immediately invalidate the existing QR code. The operator must use the newly generated card. Are you sure you want to proceed?'
    );
    if (!confirmed) return;

    setActionLoading(true);
    setActionMessage(null);
    try {
      await onRegenerate(cardData.id);
      setActionMessage('New QR code generated successfully.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate QR code';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!onRevoke) return;
    const confirmed = window.confirm(
      'Revoking will immediately disable QR login for this operator until regenerated. Are you sure?'
    );
    if (!confirmed) return;

    setActionLoading(true);
    setActionMessage(null);
    try {
      await onRevoke(cardData.id);
      setActionMessage('Operator QR card has been revoked.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke QR code';
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const opNumber = cardData.operatorNumber || `OP-${cardData.id.slice(-6).toUpperCase()}`;

  return (
    <>
      {/* Scoped Print Stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #operator-access-card-print,
          #operator-access-card-print * {
            visibility: visible !important;
          }
          #operator-access-card-print {
            position: absolute !important;
            left: 50% !important;
            top: 60px !important;
            transform: translateX(-50%) !important;
            width: 380px !important;
            background: #ffffff !important;
            color: #0f172a !important;
            border: 2px solid #0f172a !important;
            border-radius: 16px !important;
            padding: 24px !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
          }
          .no-print-area {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Modal Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto no-print-area">
        <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80">
            <div className="flex items-center gap-2.5">
              <GateShieldLogo variant="icon" size="sm" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Operator Access Card</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Print or manage login QR badge</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5">
            {actionMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{actionMessage}</span>
              </div>
            )}

            {cardData.isRevoked && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>This QR card is revoked. Click &quot;Regenerate QR&quot; to issue a new active card.</span>
              </div>
            )}

            {/* The Badge Card (Both Screen View and Print Target) */}
            <div
              id="operator-access-card-print"
              className="rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white p-6 shadow-md text-slate-900 flex flex-col items-center text-center space-y-4"
            >
              {/* Card Header */}
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-200 w-full justify-center">
                <GateShieldLogo variant="icon" size="sm" forceTheme="light" />
                <div className="text-left">
                  <h4 className="text-xs font-black tracking-tight text-[#2E4482] leading-tight">
                    GateShield
                  </h4>
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest leading-none">
                    Security Operator Badge
                  </p>
                </div>
              </div>

              {/* Operator Identity */}
              <div className="space-y-0.5">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">{cardData.name}</h3>
                <p className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md inline-block">
                  {opNumber}
                </p>
                {cardData.email && (
                  <p className="text-[11px] text-slate-400 block pt-0.5">{cardData.email}</p>
                )}
              </div>

              {/* QR Code Container */}
              <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center">
                {cardData.qrDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={cardData.qrDataUrl}
                    alt={`Login QR for ${cardData.name}`}
                    className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                    QR not available
                  </div>
                )}
              </div>

              {/* Instructions on card */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-slate-800">
                  Scan this QR code on the login screen to access GateShield
                </p>
                <p className="text-[9px] text-slate-400 max-w-[280px]">
                  Authorized for assigned checkpoint gates • Valid until revoked • Keep badge secure
                </p>
              </div>
            </div>

            {/* Actions for Admin */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handlePrint}
                disabled={!cardData.qrDataUrl || cardData.isRevoked}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>Print Operator Badge (A4)</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={actionLoading}
                    className="py-2 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                    <span>Regenerate QR</span>
                  </button>
                )}

                {onRevoke && !cardData.isRevoked && (
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={actionLoading}
                    className="py-2 rounded-xl border border-rose-300 dark:border-rose-800/80 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Revoke QR</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Access Management</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
