'use client';

import React, { useState, useEffect } from 'react';
import { Printer, X, User, QrCode } from 'lucide-react';
import { generateQrDataUrl } from '@/lib/qrUtils';
import GateShieldLogo from '@/components/ui/GateShieldLogo';

interface VisitorBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit: Record<string, any> | null;
  autoPrint?: boolean;
  onAutoPrintTriggered?: () => void;
}

export default function VisitorBadgeModal({
  isOpen,
  onClose,
  visit,
  autoPrint = false,
  onAutoPrintTriggered,
}: VisitorBadgeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const person = visit?.person || {};
  const gateName = visit?.entryGate?.name || visit?.gateName || 'Main Gate';
  const passCode = visit?.passCode || (visit?.id ? `GKP-${String(visit.id).slice(-8).toUpperCase()}` : 'GKP-PASS');

  useEffect(() => {
    if (!visit) return;
    const codeToEncode = visit.passCode || (visit.id ? `GKP-${String(visit.id).slice(-8).toUpperCase()}` : 'GKP-PASS');
    generateQrDataUrl(codeToEncode)
      .then(setQrDataUrl)
      .catch((err) => console.error('Failed to generate QR data URL:', err));
  }, [visit]);

  useEffect(() => {
    if (!isOpen || !autoPrint || !qrDataUrl) return;
    const timer = setTimeout(() => {
      window.print();
      if (onAutoPrintTriggered) onAutoPrintTriggered();
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, autoPrint, qrDataUrl, onAutoPrintTriggered]);

  if (!isOpen || !visit) return null;

  const parsedCheckInDate = visit.checkInTime ? new Date(visit.checkInTime) : new Date();
  const visitDate = parsedCheckInDate.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const checkInTime = parsedCheckInDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 max-h-[calc(100vh-2rem)] flex flex-col">
        {/* Modal Controls (No print) */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between no-print bg-slate-50 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2">
            <GateShieldLogo variant="icon" size="xs" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Visitor Security Badge
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Badge</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* The Badge (Printable Area) */}
        <div className="overflow-y-auto p-3">
          <div className="printable-area p-5 bg-white text-slate-900 border-2 border-slate-900 rounded-2xl text-center space-y-3.5 shadow-sm">
            {/* Badge Top Header */}
            <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-left">
                <GateShieldLogo variant="icon" size="sm" forceTheme="light" />
                <div className="leading-tight">
                  <span className="font-black text-sm tracking-tight block text-[#2E4482]">
                    GateShield
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">
                    SECURITY ACCESS PASS
                  </span>
                </div>
              </div>

              <div className="text-right leading-tight">
                <span className="text-[10px] font-mono font-bold block text-slate-600">
                  {visit.visitNumber || 'VIS-PASS'}
                </span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-900 text-white inline-block mt-0.5 tracking-wider">
                  {person.category || 'VISITOR'}
                </span>
              </div>
            </div>

            {/* Visitor Photo & Name */}
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-slate-900 overflow-hidden bg-slate-100 flex items-center justify-center mb-1.5 shadow-inner">
                {person.photoUrl ? (
                  <img
                    src={person.photoUrl}
                    alt={person.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>
              <h3 className="font-black text-base sm:text-lg tracking-tight leading-tight uppercase text-slate-950">
                {person.fullName || 'Visitor'}
              </h3>
              {person.company && (
                <p className="text-xs font-semibold text-slate-600 uppercase mt-0.5">
                  {person.company}
                </p>
              )}
              <p className="text-[11px] font-mono text-slate-600 font-bold mt-0.5">
                ID / CNIC: {person.cnicNumber || person.dlsNumber || 'N/A'}
              </p>
            </div>

            {/* Prominent Operational Information Grid */}
            <div className="grid grid-cols-2 gap-2 text-left bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
              {/* Visit To */}
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-500 block">
                  Visit To
                </span>
                <span className="font-bold text-slate-900 text-xs truncate block mt-0.5">
                  {visit.hostName || 'N/A'}
                </span>
              </div>

              {/* Department */}
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-500 block">
                  Department
                </span>
                <span className="font-bold text-slate-900 text-xs truncate block mt-0.5">
                  {visit.department || 'N/A'}
                </span>
              </div>

              {/* Entry Gate - Prominently Displayed */}
              <div className="col-span-2 py-1 px-2 rounded-lg bg-blue-50 border border-blue-200">
                <span className="text-[10px] uppercase font-extrabold text-blue-700 block">
                  Entry Gate
                </span>
                <span className="font-black text-blue-900 text-sm block">
                  {gateName}
                </span>
              </div>

              {/* Card Badge # / Vehicle No. */}
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-500 block">
                  {String(person.category || '').toUpperCase() === 'DELIVERY'
                    ? 'Vehicle Number'
                    : 'Visitor Card No.'}
                </span>
                <span className="font-black text-slate-900 text-xs block font-mono mt-0.5">
                  {String(person.category || '').toUpperCase() === 'DELIVERY'
                    ? visit.vehicleNo || visit.visitorCardNo || 'N/A'
                    : visit.visitorCardNo || 'N/A'}
                </span>
              </div>

              {/* Date & Time */}
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-500 block">
                  Check-in Time
                </span>
                <span className="font-bold text-slate-900 text-xs block mt-0.5">
                  {checkInTime} • {visitDate}
                </span>
              </div>
            </div>

            {/* Dedicated Secure QR Code Section */}
            <div className="flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white p-1 rounded-lg flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Visitor Pass QR"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center animate-pulse rounded">
                    <QrCode className="w-8 h-8 text-slate-300" />
                  </div>
                )}
              </div>
              <div className="text-center mt-1">
                <span className="text-[10px] font-mono font-black text-slate-900 tracking-wider block">
                  PASS: {passCode}
                </span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">
                  Scan at gate for instant checkout
                </span>
              </div>
            </div>

            {/* Badge Footer */}
            <div className="pt-1.5 text-[9px] font-bold text-slate-500 tracking-wider uppercase border-t border-slate-200">
              Please wear badge visibly at all times • Return to Gate Guard at exit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
