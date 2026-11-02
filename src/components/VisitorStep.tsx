"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  ArrowLeft,
  ArrowRight,
  FileText,
  Truck,
} from "lucide-react";
import VisitorPhotoCameraModal from "./VisitorPhotoCameraModal";
import { VisitorStepData, SubmissionStatus, VisitInfoData } from "../types/visitor";
import { CnicData } from "../types/cnic";
import { DlsData, DocumentType } from "../types/dls";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  playSelectSound,
  playContinueSound,
  playBackSound,
} from "@/utils/interactionSound";
import { compressIdentityImageFile } from "@/utils/documentImageCompression";

interface VisitorStepProps {
  category?: string;
  visitInfo: VisitInfoData;
  documentType: DocumentType;
  cnicData: CnicData;
  dlsData: DlsData;
  visitorData: VisitorStepData;
  onChangeVisitorData: (data: VisitorStepData) => void;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submissionStatus: SubmissionStatus;
  submissionError: string | null;
  onResetAll: () => void;
  operatorMode?: "photo" | "delivery-document" | "details";
  onNextPhotoStep?: () => void;
  onNextDeliveryDocStep?: () => void;
}

export default function VisitorStep({
  category = "VISITOR",
  visitInfo,
  documentType,
  cnicData,
  dlsData,
  visitorData,
  onChangeVisitorData,
  onBack,
  onSubmit,
  submissionStatus,
  submissionError,
  operatorMode = "photo",
  onNextPhotoStep,
  onNextDeliveryDocStep,
}: VisitorStepProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const isAdmin = user?.role === "ADMIN";
  const isUr = !isAdmin && language === "ur";
  const isDelivery = category === "DELIVERY";

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isDocCameraOpen, setIsDocCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Live duplicate card availability check state
  const [cardAvailability, setCardAvailability] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [normalizedCardDisplay, setNormalizedCardDisplay] = useState<string>("");

  useEffect(() => {
    if (isDelivery) {
      return;
    }
    const raw = visitorData.visitorCardNo.trim();
    if (!raw) {
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/visits/card-availability?cardNo=${encodeURIComponent(raw)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setNormalizedCardDisplay(data.normalizedCardNo || raw.toUpperCase());
          setCardAvailability(data.available ? "available" : "taken");
        } else {
          setCardAvailability("idle");
        }
      } catch {
        if (!cancelled) {
          setCardAvailability("idle");
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visitorData.visitorCardNo, isDelivery]);

  // Validation rules:
  // 1. Photo is required for standard categories, optional for DELIVERY
  const hasPhotoAttached = Boolean(visitorData.photoPreview);
  const isPhotoValid = isDelivery ? true : hasPhotoAttached;
  // 1b. Delivery Document is required for DELIVERY only
  const hasDeliveryDoc = Boolean(visitorData.deliveryDocumentPreview);
  const isDeliveryDocValid = !isDelivery || hasDeliveryDoc;
  // 2. Phone is optional; if entered, must be Pakistani format: 11 digits, starts with 03
  const trimmedPhone = visitorData.phoneNumber.trim();
  const hasPhoneValue = trimmedPhone.length > 0;
  const isPhoneValid = !hasPhoneValue || /^03\d{9}$/.test(trimmedPhone);
  // 3. For DELIVERY: Vehicle Number is required (replaces VC Card Number)
  //    For all other categories: Visitor Card No. is required
  const rawVehicleNo = (visitorData.vehicleNo || "").trim();
  const normalizedVehicleKey = rawVehicleNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const hasVehicleNoValue = rawVehicleNo.length > 0;
  const isVehicleNoValid =
    normalizedVehicleKey.length >= 3 && normalizedVehicleKey.length <= 20;

  const hasCardNoValue = visitorData.visitorCardNo.trim().length > 0;
  const effectiveCardAvailability = hasCardNoValue ? cardAvailability : "idle";
  const isCardNoValid = isDelivery
    ? isVehicleNoValid
    : hasCardNoValue &&
      effectiveCardAvailability !== "taken" &&
      effectiveCardAvailability !== "checking";

  // Complete form readiness
  const isFormReady =
    isPhotoValid && isDeliveryDocValid && isPhoneValid && isCardNoValid;

  // Extract primary name & doc ID from Step 3/4 for summary
  const displayName =
    documentType === "cnic"
      ? cnicData.fullName || cnicData.name || "N/A"
      : dlsData.fullName || "N/A";

  const displayDocNum =
    documentType === "cnic"
      ? cnicData.cnicNumber || cnicData.cnic || "N/A"
      : dlsData.licenseNumber || "N/A";

  // Handle Photo captured from face camera (do NOT auto-advance; operator reviews and presses Continue)
  const handlePhotoCaptured = async (file: File, previewUrl: string) => {
    setIsCameraOpen(false);
    if (!isAdmin) {
      playSelectSound();
    }
    let finalPreview = previewUrl;
    try {
      const compressed = await compressIdentityImageFile(file, 600, 600, 0.86);
      if (compressed.ok) {
        finalPreview = compressed.dataUrl;
      }
    } catch {
      // Fallback to previewUrl if compression fails
    }
    onChangeVisitorData({
      ...visitorData,
      photoFile: file,
      photoPreview: finalPreview,
    });
  };

  // Handle Photo uploaded from device (Admin only)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let finalPreview = URL.createObjectURL(file);
    try {
      const compressed = await compressIdentityImageFile(file, 600, 600, 0.86);
      if (compressed.ok) {
        finalPreview = compressed.dataUrl;
      }
    } catch {
      // Keep object URL fallback
    }
    onChangeVisitorData({
      ...visitorData,
      photoFile: file,
      photoPreview: finalPreview,
    });
    e.target.value = "";
  };

  // Handle Delivery Document captured from camera
  const handleDeliveryDocCaptured = async (file: File, previewUrl: string) => {
    setIsDocCameraOpen(false);
    if (!isAdmin) {
      playSelectSound();
    }
    let finalPreview = previewUrl;
    try {
      const compressed = await compressIdentityImageFile(file, 1080, 1080, 0.88);
      if (compressed.ok) {
        finalPreview = compressed.dataUrl;
      }
    } catch {
      // Fallback to previewUrl
    }
    onChangeVisitorData({
      ...visitorData,
      deliveryDocumentFile: file,
      deliveryDocumentPreview: finalPreview,
    });
  };

  // Handle Delivery Document uploaded from device
  const handleDeliveryDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAdmin) {
      playSelectSound();
    }
    let finalPreview = URL.createObjectURL(file);
    try {
      const compressed = await compressIdentityImageFile(file, 1080, 1080, 0.88);
      if (compressed.ok) {
        finalPreview = compressed.dataUrl;
      }
    } catch {
      // Keep object URL fallback
    }
    onChangeVisitorData({
      ...visitorData,
      deliveryDocumentFile: file,
      deliveryDocumentPreview: finalPreview,
    });
    e.target.value = "";
  };

  // Handle phone input: allow only digits, maximum 11 digits
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericOnly = e.target.value.replace(/\D/g, "").slice(0, 11);
    onChangeVisitorData({
      ...visitorData,
      phoneNumber: numericOnly,
    });
  };

  // Handle visitor card number change (manual entry only)
  const handleCardNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    if (!nextVal.trim()) {
      setCardAvailability("idle");
      setNormalizedCardDisplay("");
    } else {
      setCardAvailability("checking");
    }
    onChangeVisitorData({
      ...visitorData,
      visitorCardNo: nextVal,
    });
  };

  // Handle vehicle number change (Delivery category only)
  const handleVehicleNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value.toUpperCase();
    onChangeVisitorData({
      ...visitorData,
      vehicleNo: nextVal,
    });
  };

  const handleSubmitClick = async () => {
    if (
      !isFormReady ||
      submissionStatus === "submitting" ||
      submissionStatus === "success"
    ) {
      return;
    }
    if (!isAdmin) {
      playContinueSound();
    }
    await onSubmit();
  };

  /* ── Preserve Original Admin Panel UI 100% Unchanged ── */
  if (isAdmin) {
    return (
      <div className="space-y-6">
        {/* ── Summary Card: Host Info & Document Info ── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
            {/* Host info from Step 1 */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/80">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                {isDelivery
                  ? t("delivery_source_label", "Delivery Source / Company Name")
                  : "Host / Meet To"}
              </span>
              <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                {isDelivery
                  ? visitInfo.deliverySource || visitInfo.meetName || "N/A"
                  : visitInfo.meetName || "N/A"}
              </p>
              {!isDelivery && (
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  Dept:{" "}
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    {visitInfo.department || "N/A"}
                  </span>
                </p>
              )}
            </div>

            {/* Document info from Step 2 */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  {documentType === "cnic" ? "Pakistani CNIC" : "Driving License"}
                </span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 truncate max-w-[170px]">
                  {displayName}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 px-2.5 py-1 rounded-lg">
                {displayDocNum}
              </span>
            </div>
          </div>
        </div>

        {/* ── Card Holder Photo Section ── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {isDelivery ? "Capture Image" : "Visitor Photo"}{" "}
                {!isDelivery && <span className="text-red-500">*</span>}
              </h2>
              {hasPhotoAttached ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Photo Attached ✓
                </span>
              ) : isDelivery ? (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                  Optional
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full">
                  Required
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isDelivery
                ? "Capture or upload a photo of the delivery person (optional)"
                : "Capture or upload a clear portrait photo of the visitor"}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {!visitorData.photoPreview ? (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50/70 dark:bg-slate-800/40">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                No visitor photo attached
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 text-center max-w-xs">
                Take a photo using camera or upload from device
              </p>

              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <svg
                    className="w-4 h-4"
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
                  <span>Capture Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <span>Upload Image</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-xl overflow-hidden shadow-xs border-2 border-white dark:border-slate-700 bg-slate-900 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={visitorData.photoPreview}
                  alt="Visitor Photo"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 w-full space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Visitor Photo Confirmed
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  You can retake using camera or choose a different image.
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="py-2 px-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-blue-600"
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
                    <span>Retake Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    <span>Upload Different</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Delivery Document Capture Section (Required for DELIVERY only) ── */}
        {isDelivery && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Capture Document <span className="text-red-500">*</span>
                </h2>
                {hasDeliveryDoc ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Document Attached ✓
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full">
                    Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Capture or upload a picture of the delivery slip, parcel receipt, or document provided by the delivery person
              </p>
            </div>

            <input
              ref={docFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleDeliveryDocFileUpload}
            />

            {!visitorData.deliveryDocumentPreview ? (
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50/70 dark:bg-slate-800/40">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <FileText className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  No delivery document attached
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 text-center max-w-xs">
                  Capture the delivery slip or receipt using camera or upload from device
                </p>

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setIsDocCameraOpen(true)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capture Document</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => docFileInputRef.current?.click()}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>Upload Document</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="relative w-44 h-32 rounded-xl overflow-hidden shadow-xs border-2 border-white dark:border-slate-700 bg-slate-900 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visitorData.deliveryDocumentPreview}
                    alt="Delivery Document"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Delivery Document Captured
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    You can retake using camera or choose a different document image.
                  </p>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsDocCameraOpen(true)}
                      className="py-2 px-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                      <span>Retake Document</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => docFileInputRef.current?.click()}
                      className="py-2 px-3.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <span>Upload Different</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Phone Number Section ── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
          <div className="mb-3">
            <label
              htmlFor="visitorPhoneNumber"
              className="block text-base font-bold text-slate-900 dark:text-white tracking-tight"
            >
              Phone Number <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Format: 11-digit Pakistani mobile number starting with 03 (e.g. 03001234567)
            </p>
          </div>

          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <input
              id="visitorPhoneNumber"
              type="tel"
              inputMode="numeric"
              pattern="03[0-9]{9}"
              maxLength={11}
              value={visitorData.phoneNumber}
              onChange={handlePhoneChange}
              placeholder="03001234567"
              className={`block w-full pl-10 pr-3 py-3 rounded-xl border text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 transition-colors shadow-2xs ${
                visitorData.phoneNumber.length > 0 && !isPhoneValid
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20"
                  : isPhoneValid
                  ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                  : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
              }`}
            />
          </div>

          {visitorData.phoneNumber.length > 0 && !isPhoneValid && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center space-x-1">
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Please enter a valid Pakistani mobile number (03XXXXXXXXX).</span>
            </p>
          )}
        </section>

        {/* ── Vehicle Number (DELIVERY only) OR Visitor Card No. (Standard Categories) ── */}
        {isDelivery ? (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="deliveryVehicleNo"
                  className="block text-base font-bold text-slate-900 dark:text-white tracking-tight"
                >
                  Vehicle Number <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Required
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enter the delivery vehicle registration number (e.g. KHI-1234 or LEB-4589)
              </p>
            </div>

            <div className="max-w-md">
              <input
                id="deliveryVehicleNo"
                type="text"
                maxLength={24}
                value={visitorData.vehicleNo || ""}
                onChange={handleVehicleNoChange}
                placeholder="e.g. KHI-1234 or LEB-4589"
                className={`block w-full px-4 py-3 rounded-xl border bg-white dark:bg-slate-800 text-sm font-mono font-bold uppercase text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors shadow-2xs ${
                  hasVehicleNoValue && !isVehicleNoValid
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                    : hasVehicleNoValue && isVehicleNoValid
                    ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                }`}
              />
              {hasVehicleNoValue && !isVehicleNoValid && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-2">
                  Please enter a valid Vehicle Number (at least 3 alphanumeric characters).
                </p>
              )}
            </div>
          </section>
        ) : (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="visitorCardNo"
                  className="block text-base font-bold text-slate-900 dark:text-white tracking-tight"
                >
                  Visitor Card Badge No. <span className="text-red-500">*</span>
                </label>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enter the ID/number of the physical visitor card handed to the visitor
              </p>
            </div>

            <div className="max-w-md">
              <input
                id="visitorCardNo"
                type="text"
                value={visitorData.visitorCardNo}
                onChange={handleCardNoChange}
                placeholder="e.g. VC-1025 or 104"
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20 transition-colors shadow-2xs"
              />
              {cardAvailability === "taken" && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-2">
                  This card is already assigned. Please choose another available card.
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Belongings / Carried Items Section (Optional) ── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Carrying Items / Belongings
                </h2>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Optional
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Is the visitor carrying bags, laptops, toolkits, or other equipment into the facility?
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(visitorData.hasBelongings)}
              onClick={() => {
                const nextState = !visitorData.hasBelongings;
                onChangeVisitorData({
                  ...visitorData,
                  hasBelongings: nextState,
                  belongings: nextState ? visitorData.belongings || "" : "",
                });
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                visitorData.hasBelongings
                  ? "bg-blue-600"
                  : "bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  visitorData.hasBelongings ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {visitorData.hasBelongings && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-200 space-y-2">
              <label
                htmlFor="carriedItemsInput"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                List Carried Items &amp; Serial Numbers
              </label>
              <textarea
                id="carriedItemsInput"
                rows={3}
                value={visitorData.belongings || ""}
                onChange={(e) =>
                  onChangeVisitorData({
                    ...visitorData,
                    belongings: e.target.value,
                  })
                }
                placeholder="e.g. Dell Latitude Laptop (SN: 884712), Black Backpack, Multimeter & Tool Kit"
                className="block w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20 transition-colors shadow-2xs"
              />
              <p className="text-[11px] text-slate-400">
                Items noted will be logged on the visitor entry record and shown in profile details.
              </p>
            </div>
          )}
        </section>

        {submissionStatus === "error" && submissionError && (
          <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-start space-x-2">
            <svg
              className="w-5 h-5 text-red-500 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-semibold">Submission Failed</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {submissionError}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={submissionStatus === "submitting"}
            className="py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={
              !isFormReady ||
              submissionStatus === "submitting" ||
              submissionStatus === "success"
            }
            className={`flex-1 max-w-xs py-3 px-6 rounded-xl text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2 ${
              submissionStatus === "submitting"
                ? "bg-blue-500 cursor-not-allowed"
                : submissionStatus === "success"
                ? "bg-emerald-600 cursor-default"
                : submissionStatus === "error"
                ? "bg-amber-600 hover:bg-amber-700 active:scale-[0.98] cursor-pointer"
                : isFormReady
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] cursor-pointer"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none border border-slate-200 dark:border-slate-700"
            }`}
          >
            {submissionStatus === "submitting" ? (
              <span>Submitting...</span>
            ) : submissionStatus === "success" ? (
              <span>Submitted</span>
            ) : submissionStatus === "error" ? (
              <span>Try Again</span>
            ) : (
              <span>Submit Registration</span>
            )}
          </button>
        </div>

        <VisitorPhotoCameraModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handlePhotoCaptured}
          mode="face"
        />

        <VisitorPhotoCameraModal
          isOpen={isDocCameraOpen}
          onClose={() => setIsDocCameraOpen(false)}
          onCapture={handleDeliveryDocCaptured}
          mode="document"
        />
      </div>
    );
  }

  /* ── OPERATOR STEP 5: CAPTURE VISITOR PHOTO ONLY ── */
  if (operatorMode === "photo") {
    return (
      <div className="space-y-3.5">
        {/* 1. Compact Summary of Fetched Visitor Details at the Top */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 shadow-2xs">
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className={isUr ? "text-right" : "text-left"}>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                {isDelivery
                  ? t("delivery_source_label", "Delivery Source / Company Name")
                  : t("host_summary_label", "Visitor to Meet")}
              </span>
              <p className="font-extrabold text-slate-900 dark:text-white truncate text-xs sm:text-sm">
                {isDelivery
                  ? visitInfo.deliverySource || visitInfo.meetName || "N/A"
                  : visitInfo.meetName || "N/A"}
              </p>
              {!isDelivery && (
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold truncate">
                  {t("dept_label", "Dept")}:{" "}
                  <span className="text-slate-800 dark:text-slate-200 font-bold">
                    {visitInfo.department || "N/A"}
                  </span>
                </p>
              )}
            </div>

            <div className={isUr ? "text-right" : "text-left"}>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                {documentType === "cnic"
                  ? t("cnic_title", "Pakistani CNIC")
                  : t("dls_title", "Driving Licence")}
              </span>
              <p className="font-extrabold text-slate-900 dark:text-white truncate text-xs sm:text-sm">
                {displayName}
              </p>
              <span className="inline-block text-[11px] font-mono font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md mt-0.5">
                {displayDocNum}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Visitor Photo Capture Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              className={`text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight ${
                isUr ? "text-right flex-1" : "text-left flex-1"
              }`}
            >
              {isDelivery
                ? t("capture_image_title", "Capture Image")
                : t("capture_visitor_photo", "Capture Visitor Photo")}{" "}
              {!isDelivery && <span className="text-red-500">*</span>}
            </h2>

            {hasPhotoAttached ? (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                {t("photo_attached_badge", "Photo Attached ✓")}
              </span>
            ) : isDelivery ? (
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full shrink-0">
                {t("optional_badge", "Optional")}
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-full shrink-0">
                {t("photo_required_badge", "Required")}
              </span>
            )}
          </div>

          {!visitorData.photoPreview ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                playSelectSound();
                setIsCameraOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  playSelectSound();
                  setIsCameraOpen(true);
                }
              }}
              className="group border-2 border-dashed border-blue-400 dark:border-blue-600 hover:border-blue-600 dark:hover:border-blue-400 rounded-2xl p-6 sm:p-7 flex flex-col items-center justify-center text-center bg-blue-50/50 hover:bg-blue-50/90 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 transition-all cursor-pointer active:scale-[0.99]"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-100 dark:bg-blue-900/70 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3 gk-pulse-blue transition-transform group-hover:scale-105">
                <Camera className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2]" />
              </div>

              <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mb-1">
                {isDelivery
                  ? t("capture_image_title", "Capture Image")
                  : t("capture_visitor_photo", "Capture Visitor Photo")}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-4 max-w-xs">
                {isDelivery
                  ? t(
                      "capture_image_optional_sub",
                      "Capture a photo of the delivery person (optional) or tap Next to continue"
                    )
                  : t(
                      "capture_visitor_photo_sub",
                      "Tap below to open camera and take a clear photo of the visitor"
                    )}
              </p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  playSelectSound();
                  setIsCameraOpen(true);
                }}
                className="py-3 px-7 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm sm:text-base font-extrabold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                <span>{t("capture_photo_btn", "Capture Photo")}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-emerald-50/40 dark:bg-slate-800/60 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/70">
              <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shadow-sm border-2 border-white dark:border-slate-700 bg-slate-900 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={visitorData.photoPreview}
                  alt="Visitor Photo"
                  className="w-full h-full object-cover"
                />
              </div>

              <div
                className={`flex-1 w-full space-y-2.5 text-center ${
                  isUr ? "sm:text-right" : "sm:text-left"
                }`}
              >
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span
                    dir="auto"
                    className={`text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex-1 ${
                      isUr ? "sm:text-right" : "sm:text-left"
                    }`}
                  >
                    {t("photo_confirmed_title", "Visitor Photo Captured")}
                  </span>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      playSelectSound();
                      setIsCameraOpen(true);
                    }}
                    className="py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 shadow-2xs inline-flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>{t("retake_photo_btn", "Retake Photo")}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 3. Back & Continue / Next Navigation */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              playBackSound();
              onBack();
            }}
            className="py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("back_btn", "Back")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isPhotoValid && onNextPhotoStep) {
                playContinueSound();
                onNextPhotoStep();
              }
            }}
            disabled={!isPhotoValid}
            className={`flex-1 max-w-xs py-3 px-6 rounded-xl text-xs sm:text-sm font-extrabold shadow-xs flex items-center justify-center gap-2 transition-all ${
              isPhotoValid
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white cursor-pointer"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none"
            }`}
          >
            <span>
              {isDelivery
                ? t("next_btn", "Next")
                : t("continue_btn", "Continue")}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Visitor Photo Camera Modal */}
        <VisitorPhotoCameraModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handlePhotoCaptured}
          mode="face"
        />
      </div>
    );
  }

  /* ── OPERATOR DELIVERY STEP 5: CAPTURE DELIVERY DOCUMENT (REQUIRED FOR DELIVERY ONLY) ── */
  if (operatorMode === "delivery-document") {
    return (
      <div className="space-y-3.5">
        {/* 1. Compact Summary of Delivery Source & Scanned ID */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 shadow-2xs">
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className={isUr ? "text-right" : "text-left"}>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                {t("delivery_source_label", "Delivery Source / Company Name")}
              </span>
              <p className="font-extrabold text-slate-900 dark:text-white truncate text-xs sm:text-sm">
                {visitInfo.deliverySource || visitInfo.meetName || "N/A"}
              </p>
            </div>

            <div className={isUr ? "text-right" : "text-left"}>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                {documentType === "cnic"
                  ? t("cnic_title", "Pakistani CNIC")
                  : t("dls_title", "Driving Licence")}
              </span>
              <p className="font-extrabold text-slate-900 dark:text-white truncate text-xs sm:text-sm">
                {displayName}
              </p>
              <span className="inline-block text-[11px] font-mono font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md mt-0.5">
                {displayDocNum}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Capture Document Section (Required) */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              className={`text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight ${
                isUr ? "text-right flex-1" : "text-left flex-1"
              }`}
            >
              {t("capture_document_title", "Capture Document")}{" "}
              <span className="text-red-500">*</span>
            </h2>

            {hasDeliveryDoc ? (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                {t("document_attached_badge", "Document Attached ✓")}
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-full shrink-0">
                {t("photo_required_badge", "Required")}
              </span>
            )}
          </div>

          <input
            ref={docFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleDeliveryDocFileUpload}
          />

          {!visitorData.deliveryDocumentPreview ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                playSelectSound();
                setIsDocCameraOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  playSelectSound();
                  setIsDocCameraOpen(true);
                }
              }}
              className="group border-2 border-dashed border-blue-400 dark:border-blue-600 hover:border-blue-600 dark:hover:border-blue-400 rounded-2xl p-6 sm:p-7 flex flex-col items-center justify-center text-center bg-blue-50/50 hover:bg-blue-50/90 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 transition-all cursor-pointer active:scale-[0.99]"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-100 dark:bg-blue-900/70 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3 gk-pulse-blue transition-transform group-hover:scale-105">
                <FileText className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2]" />
              </div>

              <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mb-1">
                {t("capture_document_title", "Capture Document")}
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-4 max-w-xs">
                {t(
                  "capture_document_subtitle",
                  "Capture a clear picture of the delivery slip, parcel receipt, or document provided by the delivery person"
                )}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playSelectSound();
                    setIsDocCameraOpen(true);
                  }}
                  className="py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm sm:text-base font-extrabold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>{t("capture_document_btn", "Capture Document")}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    docFileInputRef.current?.click();
                  }}
                  className="py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold shadow-2xs transition-all cursor-pointer"
                >
                  <span>{t("upload_id_image_btn", "Upload Image")}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-emerald-50/40 dark:bg-slate-800/60 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/70">
              <div className="relative w-44 h-32 sm:w-48 sm:h-36 rounded-2xl overflow-hidden shadow-sm border-2 border-white dark:border-slate-700 bg-slate-900 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={visitorData.deliveryDocumentPreview}
                  alt="Delivery Document Preview"
                  className="w-full h-full object-contain"
                />
              </div>

              <div
                className={`flex-1 w-full space-y-2.5 text-center ${
                  isUr ? "sm:text-right" : "sm:text-left"
                }`}
              >
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span
                    dir="auto"
                    className={`text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex-1 ${
                      isUr ? "sm:text-right" : "sm:text-left"
                    }`}
                  >
                    {t("document_captured_title", "Delivery Document Captured")}
                  </span>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      playSelectSound();
                      setIsDocCameraOpen(true);
                    }}
                    className="py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 shadow-2xs inline-flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>{t("retake_document_btn", "Retake Document")}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 3. Back & Next Navigation */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              playBackSound();
              onBack();
            }}
            className="py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("back_btn", "Back")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (hasDeliveryDoc && onNextDeliveryDocStep) {
                playContinueSound();
                onNextDeliveryDocStep();
              }
            }}
            disabled={!hasDeliveryDoc}
            className={`flex-1 max-w-xs py-3 px-6 rounded-xl text-xs sm:text-sm font-extrabold shadow-xs flex items-center justify-center gap-2 transition-all ${
              hasDeliveryDoc
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white cursor-pointer"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none"
            }`}
          >
            <span>{t("next_btn", "Next")}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Delivery Document Camera Modal */}
        <VisitorPhotoCameraModal
          isOpen={isDocCameraOpen}
          onClose={() => setIsDocCameraOpen(false)}
          onCapture={handleDeliveryDocCaptured}
          mode="document"
        />
      </div>
    );
  }

  /* ── OPERATOR STEP 6: REGISTRATION DETAILS (PHONE, MANUAL VC NUMBER, CARRYING ITEMS & SUBMIT) ── */
  return (
    <div className="space-y-3.5">
      {/* Heading */}
      <div className={isUr ? "text-right" : "text-left"}>
        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
          {isDelivery
            ? t("phone_and_vehicle_title", "Phone Number & Vehicle Number")
            : t("registration_details_title", "Registration Details")}
        </h2>
      </div>

      {/* 1. Phone Number Section (Optional) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className={`mb-2 ${isUr ? "text-right" : "text-left"}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label
              htmlFor="visitorPhoneNumber"
              dir="auto"
              className={`block text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-tight flex-1 ${
                isUr ? "text-right" : "text-left"
              }`}
            >
              {t("phone_number_label", "Phone Number")}
            </label>
            <span
              dir="auto"
              className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0"
            >
              {t("optional_badge", "Optional")}
            </span>
          </div>
          <p
            dir="auto"
            className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5"
          >
            {t("phone_number_hint", "11-digit mobile number starting with 03 (e.g. 03001234567)")}
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          </div>
          <input
            id="visitorPhoneNumber"
            type="tel"
            dir="ltr"
            inputMode="numeric"
            pattern="03[0-9]{9}"
            maxLength={11}
            value={visitorData.phoneNumber}
            onChange={handlePhoneChange}
            placeholder="03001234567"
            className={`block w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm sm:text-base font-mono font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 transition-colors shadow-2xs ${
              hasPhoneValue && !isPhoneValid
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20"
                : hasPhoneValue && isPhoneValid
                ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
            }`}
          />
        </div>

        {hasPhoneValue && !isPhoneValid && (
          <p
            className={`text-xs font-bold text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1.5 ${
              isUr ? "text-right" : "text-left"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span dir="auto" className="flex-1">
              {t(
                "phone_number_error",
                "Please enter a valid 11-digit mobile number starting with 03."
              )}
            </span>
          </p>
        )}
      </section>

      {/* 2. Vehicle Number (DELIVERY only) OR Visitor Card Number (Standard Categories) */}
      {isDelivery ? (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className={`mb-2 ${isUr ? "text-right" : "text-left"}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="deliveryVehicleNo"
                dir="auto"
                className={`block text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-tight flex-1 ${
                  isUr ? "text-right" : "text-left"
                }`}
              >
                {t("vehicle_no_label", "Vehicle Number")} <span className="text-red-500">*</span>
              </label>
              <span
                dir="auto"
                className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0"
              >
                {t("photo_required_badge", "Required")}
              </span>
            </div>
            <p
              dir="auto"
              className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5"
            >
              {t(
                "vehicle_no_hint",
                "Enter the delivery vehicle registration number (e.g. KHI-1234 or LEB-4589)"
              )}
            </p>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Truck className="w-4 h-4" />
              </div>
              <input
                id="deliveryVehicleNo"
                type="text"
                dir="ltr"
                maxLength={24}
                value={visitorData.vehicleNo || ""}
                onChange={handleVehicleNoChange}
                placeholder={t("vehicle_no_placeholder", "e.g. KHI-1234 or LEB-4589")}
                className={`block w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm sm:text-base font-mono font-extrabold uppercase text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 transition-colors shadow-2xs ${
                  hasVehicleNoValue && !isVehicleNoValid
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20"
                    : hasVehicleNoValue && isVehicleNoValid
                    ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                }`}
              />
            </div>

            {hasVehicleNoValue && !isVehicleNoValid && (
              <p
                className={`text-xs font-bold text-red-600 dark:text-red-400 mt-1 flex items-center gap-1.5 ${
                  isUr ? "text-right" : "text-left"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span dir="auto" className="flex-1">
                  {t(
                    "vehicle_no_error",
                    "Please enter a valid Vehicle Number (at least 3 alphanumeric characters)."
                  )}
                </span>
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className={`mb-2 ${isUr ? "text-right" : "text-left"}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="visitorCardNo"
                dir="auto"
                className={`block text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-tight flex-1 ${
                  isUr ? "text-right" : "text-left"
                }`}
              >
                {t("visitor_card_no_label", "Visitor Card Number")} <span className="text-red-500">*</span>
              </label>
            </div>
            <p
              dir="auto"
              className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5"
            >
              {t(
                "visitor_card_no_hint",
                "Enter the physical card number handed to the visitor (e.g. VC-12)"
              )}
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <input
                id="visitorCardNo"
                type="text"
                dir="ltr"
                value={visitorData.visitorCardNo}
                onChange={handleCardNoChange}
                placeholder={t("visitor_card_no_placeholder", "e.g. VC-12 or 104")}
                className={`block w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm sm:text-base font-mono font-extrabold uppercase text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 transition-colors shadow-2xs ${
                  cardAvailability === "taken"
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/20 bg-red-50/30 dark:bg-red-950/20"
                    : cardAvailability === "available"
                    ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                }`}
              />
              {cardAvailability === "checking" && (
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                </div>
              )}
            </div>

            {cardAvailability === "taken" && (
              <div
                className={`p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-2.5 animate-in fade-in duration-150 ${
                  isUr ? "text-right" : "text-left"
                }`}
              >
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                <p dir="auto" className="text-xs sm:text-sm font-extrabold leading-snug flex-1">
                  {t(
                    "visitor_card_already_assigned",
                    "This card is already assigned. Please choose another available card."
                  )}
                </p>
              </div>
            )}

            {cardAvailability === "available" && normalizedCardDisplay && (
              <div className="px-3 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span
                    dir="auto"
                    className="text-xs font-bold text-emerald-800 dark:text-emerald-200"
                  >
                    {t("visitor_card_available_badge", "Assigned Physical Card:")}
                  </span>
                </div>
                <span
                  dir="ltr"
                  className="text-xs sm:text-sm font-mono font-extrabold px-2.5 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs"
                >
                  {normalizedCardDisplay}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. Carrying Items Section (Optional, Compact) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className={`flex-1 ${isUr ? "text-right" : "text-left"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                dir="auto"
                className={`text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-tight flex-1 ${
                  isUr ? "text-right" : "text-left"
                }`}
              >
                {t("carrying_items_title", "Carrying Items")}
              </h2>
              <span
                dir="auto"
                className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0"
              >
                {t("optional_badge", "Optional")}
              </span>
            </div>
            <p
              dir="auto"
              className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5"
            >
              {t(
                "carrying_items_subtitle",
                "Turn on if the visitor has a laptop, bag, or tools"
              )}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={Boolean(visitorData.hasBelongings)}
            onClick={() => {
              playSelectSound();
              const nextState = !visitorData.hasBelongings;
              onChangeVisitorData({
                ...visitorData,
                hasBelongings: nextState,
                belongings: nextState ? visitorData.belongings || "" : "",
              });
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              visitorData.hasBelongings
                ? "bg-blue-600"
                : "bg-slate-300 dark:bg-slate-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                visitorData.hasBelongings ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {visitorData.hasBelongings && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-200 space-y-1.5">
            <label
              htmlFor="carriedItemsInput"
              dir="auto"
              className={`block text-xs font-bold text-slate-700 dark:text-slate-300 ${
                isUr ? "text-right" : "text-left"
              }`}
            >
              {t("list_carried_items_label", "List Carried Items")}
            </label>
            <textarea
              id="carriedItemsInput"
              dir="auto"
              rows={2}
              value={visitorData.belongings || ""}
              onChange={(e) =>
                onChangeVisitorData({
                  ...visitorData,
                  belongings: e.target.value,
                })
              }
              placeholder={t("carried_items_placeholder", "e.g. Laptop, Backpack, Tool Kit")}
              className={`block w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20 transition-colors shadow-2xs ${
                isUr ? "text-right" : "text-left"
              }`}
            />
          </div>
        )}
      </section>

      {/* Submission Error Alert (if any) */}
      {submissionStatus === "error" && submissionError && (
        <div
          className={`bg-red-50 dark:bg-red-950/60 border-2 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2.5 ${
            isUr ? "text-right" : "text-left"
          }`}
        >
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
          <p dir="auto" className="font-extrabold flex-1">
            {submissionError}
          </p>
        </div>
      )}

      {/* 4. Bottom Navigation & Final Submit Registration Button */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => {
            playBackSound();
            onBack();
          }}
          disabled={submissionStatus === "submitting"}
          className="py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("back_btn", "Back")}</span>
        </button>

        <button
          type="button"
          onClick={handleSubmitClick}
          disabled={
            !isFormReady ||
            submissionStatus === "submitting" ||
            submissionStatus === "success"
          }
          className={`flex-1 max-w-xs py-3 px-6 rounded-xl text-white text-xs sm:text-sm font-extrabold shadow-xs transition-all flex items-center justify-center gap-2 ${
            submissionStatus === "submitting"
              ? "bg-blue-500 cursor-not-allowed"
              : submissionStatus === "success"
              ? "bg-emerald-600 cursor-default"
              : submissionStatus === "error"
              ? "bg-amber-600 hover:bg-amber-700 active:scale-[0.98] cursor-pointer"
              : isFormReady
              ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] cursor-pointer"
              : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none border border-slate-200 dark:border-slate-700"
          }`}
        >
          {submissionStatus === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>{t("submitting_btn", "Submitting...")}</span>
            </>
          ) : submissionStatus === "success" ? (
            <span>{t("submitted_btn", "Submitted ✓")}</span>
          ) : submissionStatus === "error" ? (
            <span>{t("try_again_btn", "Try Again")}</span>
          ) : (
            <span>{t("submit_registration_btn", "Submit Registration")}</span>
          )}
        </button>
      </div>
    </div>
  );
}
