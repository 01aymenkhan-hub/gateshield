'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, RefreshCw, AlertTriangle, FlipHorizontal, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onCancel: () => void;
}

export default function QrScanner({ onScan, onCancel }: QrScannerProps) {
  const { language } = useLanguage();
  const isUrdu = language === 'ur';
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'denied' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const scannerRef = useRef<any>(null);
  const containerId = useRef(`qr-reader-${Math.random().toString(36).substring(2, 9)}`);
  const isMountedRef = useRef(true);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const hasScannedRef = useRef(false);
  const currentFacingModeRef = useRef<'environment' | 'user'>('environment');

  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    const instance = scannerRef.current;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
        await instance.clear();
      } catch (err) {
        console.warn('[QR Scanner] Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
      }
    }
    isStoppingRef.current = false;
  }, []);

  const handleSuccessfulScan = useCallback(
    async (decodedText: string) => {
      if (hasScannedRef.current) return;
      hasScannedRef.current = true;

      // Provide vibration feedback if supported
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100);
        } catch {}
      }

      await stopScanner();
      onScan(decodedText);
    },
    [onScan, stopScanner]
  );

  const startScanner = useCallback(
    async (cameraParam?: string | { facingMode: string }) => {
      // Guard against concurrent execution or unmounted component
      if (!isMountedRef.current || isStartingRef.current) {
        return;
      }

      isStartingRef.current = true;
      setIsInitializing(true);
      setErrorMessage(null);
      hasScannedRef.current = false;

      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!isMountedRef.current) {
          isStartingRef.current = false;
          return;
        }

        // Safely stop any previous scanner instance before creating a new one
        await stopScanner();

        if (!isMountedRef.current) {
          isStartingRef.current = false;
          return;
        }

        const containerEl = document.getElementById(containerId.current);
        if (!containerEl) {
          console.warn('[QR Scanner] Viewfinder container not mounted');
          isStartingRef.current = false;
          setIsInitializing(false);
          return;
        }

        const html5QrCode = new Html5Qrcode(containerId.current);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edgeSize = Math.max(180, Math.floor(minEdge * 0.7));
            return { width: edgeSize, height: edgeSize };
          },
          aspectRatio: 1.0,
        };

        // Determine camera target:
        // Use provided cameraParam, or default directly to { facingMode: "environment" }
        // Do NOT call getCameras() or use deviceId for initial camera startup!
        const targetCamera = cameraParam || { facingMode: currentFacingModeRef.current };

        await html5QrCode.start(
          targetCamera,
          config,
          (decodedText: string) => {
            handleSuccessfulScan(decodedText);
          },
          () => {
            // Ignore frame-by-frame non-detection
          }
        );

        // If component unmounted while start was executing, cleanly tear down immediately
        if (!isMountedRef.current) {
          try {
            if (html5QrCode.isScanning) {
              await html5QrCode.stop();
            }
            await html5QrCode.clear();
          } catch (teardownErr) {
            console.warn('[QR Scanner] Unmount teardown error:', teardownErr);
          }
          scannerRef.current = null;
          isStartingRef.current = false;
          return;
        }

        setPermissionState('granted');
        setIsInitializing(false);

        // Once the camera stream is running and permission is granted,
        // safely query available cameras in background to populate Flip Camera options
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0 && isMountedRef.current) {
            setCameras(devices);
          }
        } catch (enumErr) {
          console.debug('[QR Scanner] Background camera enumeration:', enumErr);
        }
      } catch (err: any) {
        console.error('[QR Scanner] Init error details:', {
          name: err?.name,
          message: err?.message,
          stack: err?.stack,
        });

        if (isMountedRef.current) {
          const errStr = (err?.name || err?.message || err?.toString() || '').toLowerCase();
          if (errStr.includes('permission') || errStr.includes('notallowed')) {
            setPermissionState('denied');
            setErrorMessage('Camera access was denied. Please allow camera permissions in your browser to scan QR passes.');
          } else {
            setPermissionState('error');
            setErrorMessage(err?.message || 'Failed to start camera. Please ensure no other application is using it.');
          }
          setIsInitializing(false);
        }
      } finally {
        isStartingRef.current = false;
      }
    },
    [handleSuccessfulScan, stopScanner]
  );

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  const switchCamera = async () => {
    if (isStartingRef.current || isInitializing) return;

    if (cameras.length > 1) {
      let nextCameraId: string | null = null;
      if (activeCameraId) {
        const currentIndex = cameras.findIndex((c) => c.id === activeCameraId);
        const nextIndex = (currentIndex + 1) % cameras.length;
        nextCameraId = cameras[nextIndex].id;
      } else {
        const frontCam = cameras.find((c) =>
          c.label.toLowerCase().includes('front') || c.label.toLowerCase().includes('user')
        );
        nextCameraId = frontCam ? frontCam.id : (cameras[1]?.id || cameras[0].id);
      }
      setActiveCameraId(nextCameraId);
      await startScanner(nextCameraId);
    } else {
      const newMode = currentFacingModeRef.current === 'environment' ? 'user' : 'environment';
      currentFacingModeRef.current = newMode;
      setActiveCameraId(null);
      await startScanner({ facingMode: newMode });
    }
  };

  const handleRetry = () => {
    setActiveCameraId(null);
    currentFacingModeRef.current = 'environment';
    startScanner({ facingMode: 'environment' });
  };

  return (
    <div className="flex flex-col items-center justify-center w-full animate-in fade-in duration-150">
      {/* Viewfinder Container */}
      <div className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-lg flex items-center justify-center">
        {/* html5-qrcode video viewport */}
        <div id={containerId.current} className="w-full h-full object-cover" />

        {/* Loading Overlay */}
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white gap-2 z-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className={`font-semibold ${isUrdu ? 'text-[14px] leading-[1.6]' : 'text-xs'}`}>
              {isUrdu ? 'کیمرہ شروع ہو رہا ہے...' : 'Starting camera...'}
            </p>
          </div>
        )}

        {/* Permission Denied / Error State */}
        {(permissionState === 'denied' || permissionState === 'error') && !isInitializing && (
          <div className="absolute inset-0 bg-slate-900 p-5 flex flex-col items-center justify-center text-center z-20 space-y-3">
            <div className="p-3 rounded-full bg-rose-500/10 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h4 className={`font-bold text-white ${isUrdu ? 'text-[16px] leading-[1.6]' : 'text-sm'}`}>
                {isUrdu ? 'کیمرہ دستیاب نہیں' : 'Camera Unavailable'}
              </h4>
              <p className={`text-slate-400 mt-1 max-w-[240px] leading-relaxed ${isUrdu ? 'text-[13px]' : 'text-xs'}`}>
                {isUrdu
                  ? 'کیو آر پاس اسکین کرنے کے لیے براہ کرم کیمرے کی اجازت دیں۔'
                  : errorMessage || 'Unable to access device camera.'}
              </p>
            </div>
            <button
              onClick={handleRetry}
              className={`px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${isUrdu ? 'text-[14px] leading-[1.5]' : 'text-xs'}`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isUrdu ? 'کیمرہ دوبارہ چلائیں' : 'Retry Camera'}</span>
            </button>
          </div>
        )}

        {/* Reticle / Target Scanner Overlay when active */}
        {permissionState === 'granted' && !isInitializing && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="w-48 h-48 sm:w-56 sm:h-56 relative rounded-2xl border-2 border-dashed border-blue-400/80 bg-blue-500/5">
              {/* Corner Target Indicators */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

              {/* Pulsing Scan Beam */}
              <div className="w-full h-0.5 bg-blue-400 absolute top-1/2 -translate-y-1/2 shadow-[0_0_12px_rgba(59,130,246,0.9)] animate-pulse" />
            </div>
          </div>
        )}
      </div>

      {/* Instructions & Controls */}
      <div className="mt-3 text-center space-y-2 w-full max-w-[320px]">
        <p className={`font-semibold text-slate-700 dark:text-slate-300 ${isUrdu ? 'text-[14px] leading-[1.6]' : 'text-xs'}`}>
          {isUrdu ? 'کیمرے کو وزیٹر پاس کے کیو آر کوڈ کے سامنے رکھیں' : 'Point camera at the Visitor Pass QR code'}
        </p>

        <div className="flex items-center justify-center gap-2">
          {cameras.length > 1 && (
            <button
              onClick={switchCamera}
              className={`px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer ${isUrdu ? 'text-[14px] leading-[1.5]' : 'text-xs'}`}
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-blue-500" />
              <span>{isUrdu ? 'کیمرہ تبدیل کریں' : 'Flip Camera'}</span>
            </button>
          )}

          <button
            onClick={() => {
              stopScanner();
              onCancel();
            }}
            className={`px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer ${isUrdu ? 'text-[14px] leading-[1.5]' : 'text-xs'}`}
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
            <span>{isUrdu ? 'اسکین منسوخ کریں' : 'Cancel Scan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
