"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

interface VisitorPhotoCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File, previewUrl: string) => void;
  mode?: "face" | "document";
}

export default function VisitorPhotoCameraModal({
  isOpen,
  onClose,
  onCapture,
  mode = "face",
}: VisitorPhotoCameraModalProps) {
  const isDocMode = mode === "document";
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGenerationRef = useRef(0);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.onloadedmetadata = () => { node.play().catch(() => {}); };
    }
  }, []);

  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    isDocMode ? "environment" : "user"
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"live" | "review">("live");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [isShutterActive, setIsShutterActive] = useState(false);

  useEffect(() => {
    setFacingMode(isDocMode ? "environment" : "user");
  }, [isDocMode]);

  // Stop current camera stream
  const stopCameraStream = useCallback(() => {
    cameraGenerationRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start camera with current facingMode
  const startCamera = useCallback(async () => {
    stopCameraStream();
    const generation = cameraGenerationRef.current;
    setCameraError(null);
    try {
      const videoConstraints: MediaTrackConstraints = isDocMode
        ? {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });

      if (generation !== cameraGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      attachVideo(videoRef.current);
    } catch (err: unknown) {
      if (generation !== cameraGenerationRef.current) return;
      console.error("Visitor camera access error:", err);
      setCameraError(
        "Unable to access camera. Please verify device permissions or use 'Upload Image'."
      );
    }
  }, [facingMode, isDocMode, stopCameraStream, attachVideo]);

  // Lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setCapturedPreview(null);
      setCapturedFile(null);
      setModalMode("live");
      return;
    }

    setModalMode("live");
    setCapturedPreview(null);
    setCapturedFile(null);
    startCamera();

    return () => {
      stopCameraStream();
    };
  }, [isOpen, startCamera, stopCameraStream]);

  // Flip front / rear camera
  const handleToggleFacingMode = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // Capture photo from video feed
  const handleShutterClick = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const generation = cameraGenerationRef.current;

    setIsShutterActive(true);
    setTimeout(() => setIsShutterActive(false), 150);

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (ctx) {
        if (isDocMode) {
          // Preserve full original captured image dimensions and proportions without cropping
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          canvas.width = vw;
          canvas.height = vh;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(video, 0, 0, vw, vh);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          canvas.toBlob(
            (blob) => {
              if (blob && generation === cameraGenerationRef.current) {
                const file = new File([blob], `delivery_doc_${Date.now()}.jpg`, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                setCapturedFile(file);
                setCapturedPreview(dataUrl);
                setModalMode("review");
                stopCameraStream();
              }
            },
            "image/jpeg",
            0.92
          );
        } else {
          // Use square aspect ratio for clean face photo
          const size = Math.min(video.videoWidth, video.videoHeight);
          canvas.width = 600;
          canvas.height = 600;
          // Crop center square
          const sx = (video.videoWidth - size) / 2;
          const sy = (video.videoHeight - size) / 2;

          // If front camera, mirror image for natural selfie feel
          if (facingMode === "user") {
            ctx.translate(600, 0);
            ctx.scale(-1, 1);
          }

          ctx.drawImage(video, sx, sy, size, size, 0, 0, 600, 600);

          canvas.toBlob(
            (blob) => {
              if (blob && generation === cameraGenerationRef.current) {
                const file = new File([blob], `visitor_photo_${Date.now()}.jpg`, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                const previewUrl = URL.createObjectURL(file);
                setCapturedFile(file);
                setCapturedPreview(previewUrl);
                setModalMode("review");
                stopCameraStream();
              }
            },
            "image/jpeg",
            0.92
          );
        }
      }
    } catch (err) {
      console.error("Failed to capture visitor photo:", err);
    }
  }, [facingMode, isDocMode, stopCameraStream]);

  // Retake from review screen
  const handleReviewRetake = () => {
    if (capturedPreview && capturedPreview.startsWith("blob:")) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedPreview(null);
    setCapturedFile(null);
    setModalMode("live");
    if (videoRef.current && streamRef.current) {
      videoRef.current.play().catch(console.error);
    } else {
      startCamera();
    }
  };

  // Confirm photo
  const handleReviewConfirm = () => {
    if (!capturedFile || !capturedPreview) return;
    stopCameraStream();
    onCapture(capturedFile, capturedPreview);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-0 sm:p-4 select-none">
      <div className="relative w-full h-full sm:max-w-md sm:h-[85vh] sm:rounded-2xl overflow-hidden bg-black flex flex-col justify-between">
        {/* Shutter Flash Animation Overlay */}
        {isShutterActive && (
          <div className="absolute inset-0 z-40 bg-white opacity-80 pointer-events-none transition-opacity" />
        )}

        {/* ── Top Header ── */}
        <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-white text-sm font-semibold tracking-wide">
              {modalMode === "live"
                ? isDocMode
                  ? "Capture Delivery Document"
                  : "Capture Card Holder Photo"
                : isDocMode
                ? "Review Delivery Document"
                : "Review Photo"}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Flip camera button (available in live mode) */}
            {modalMode === "live" && (
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="rounded-full bg-white/20 hover:bg-white/30 p-2 text-white transition-colors"
                title="Switch Camera (Front/Rear)"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onClose();
              }}
              className="rounded-full bg-white/20 hover:bg-white/30 p-2 text-white transition-colors"
              title="Close camera"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Middle Live Feed or Review ── */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
          {cameraError ? (
            <div className="text-center p-6 text-white max-w-xs">
              <svg
                className="mx-auto w-12 h-12 text-red-400 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm text-red-200 mb-4">{cameraError}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold"
              >
                Close Camera
              </button>
            </div>
          ) : modalMode === "live" ? (
            <>
              <video
                ref={attachVideo}
                playsInline
                muted
                autoPlay
                className={`absolute inset-0 w-full h-full ${
                  isDocMode ? "object-contain" : "object-cover"
                } ${
                  !isDocMode && facingMode === "user" ? "scale-x-[-1]" : ""
                }`}
              />

              {!isDocMode && (
                /* Portrait Oval Face Guide (Face Mode Only) */
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  <div
                    className="relative w-64 h-80 rounded-[45%] ring-2 ring-white/90 shadow-2xl"
                    style={{
                      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
                    }}
                  >
                    <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                      <span className="text-xs font-medium text-white/90 bg-black/40 px-3 py-1 rounded-full backdrop-blur-xs">
                        Align visitor face here
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Review Screen */
            <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4 overflow-hidden">
              {isDocMode ? (
                <div className="relative flex items-center justify-center max-w-full max-h-[calc(100%-2rem)] rounded-xl overflow-hidden border border-white/30 shadow-2xl bg-black">
                  {capturedPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={capturedPreview}
                      alt="Captured delivery document preview"
                      className="block w-auto h-auto max-w-full max-h-[64vh] object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="relative w-64 h-64 rounded-2xl overflow-hidden border-2 border-white/50 shadow-2xl bg-black">
                  {capturedPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={capturedPreview}
                      alt="Captured visitor face preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              )}
              <p className="text-xs text-white/70 mt-3 text-center">
                {isDocMode
                  ? "Ensure the delivery document details are clearly readable."
                  : "Ensure the visitor's face is clearly visible."}
              </p>
            </div>
          )}
        </div>

        {/* ── Bottom Controls ── */}
        <div className="relative z-20 p-5 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center">
          {modalMode === "live" ? (
            <div className="w-full flex items-center justify-center">
              {isDocMode ? (
                <button
                  type="button"
                  onClick={handleShutterClick}
                  disabled={Boolean(cameraError)}
                  className="py-3.5 px-8 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm sm:text-base font-bold shadow-lg flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Capture document"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Capture</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleShutterClick}
                  disabled={Boolean(cameraError)}
                  className="group relative flex items-center justify-center w-18 h-18 rounded-full border-4 border-white bg-white/20 active:scale-95 transition-transform shadow-lg cursor-pointer"
                  title="Take visitor photo"
                >
                  <div className="w-14 h-14 rounded-full bg-white group-hover:scale-95 group-active:scale-90 transition-transform shadow-inner" />
                </button>
              )}
            </div>
          ) : (
            <div className="w-full max-w-xs flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReviewRetake}
                className="flex-1 py-3 px-4 rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 active:scale-95 text-white text-sm font-semibold transition-all text-center cursor-pointer"
              >
                Retake
              </button>

              <button
                type="button"
                onClick={handleReviewConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-95 text-white text-sm font-semibold transition-all shadow-lg text-center flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>{isDocMode ? "Continue" : "✓ Use Photo"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
