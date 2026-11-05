"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Users,
  Briefcase,
  UserCheck,
  Package,
  HardHat,
  Truck,
  Check,
  ArrowLeft,
  Building2,
  User,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { VisitInfoData } from "../types/visitor";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  playSelectSound,
  playContinueSound,
  playAutoAdvanceSound,
  playBackSound,
} from "@/utils/interactionSound";

interface VisitInfoStepProps {
  data: VisitInfoData;
  onChange: (updated: VisitInfoData) => void;
  onNext: () => void;
  category?: string;
  onCategoryChange?: (category: string) => void;
  operatorMode?: "category" | "visit-info";
  onBack?: () => void;
  onParcelSelect?: () => void;
}

interface DynamicDepartmentOption {
  id: string;
  name: string;
  hodName?: string;
  whatsappNumber?: string;
}

const CATEGORIES = [
  {
    id: "VISITOR",
    labelKey: "cat_visitor",
    defaultLabel: "Visitor",
    icon: Users,
    activeBorder: "border-emerald-500 dark:border-emerald-400",
    activeBg: "bg-emerald-50/80 dark:bg-emerald-950/50",
    iconBg: "bg-emerald-500 text-white",
    checkBg: "bg-emerald-600 text-white",
  },
  {
    id: "VENDOR",
    labelKey: "cat_vendor",
    defaultLabel: "Vendor",
    icon: Briefcase,
    activeBorder: "border-purple-500 dark:border-purple-400",
    activeBg: "bg-purple-50/80 dark:bg-purple-950/50",
    iconBg: "bg-purple-600 text-white",
    checkBg: "bg-purple-600 text-white",
  },
  {
    id: "INTERVIEW",
    labelKey: "cat_interview",
    defaultLabel: "Interview",
    icon: UserCheck,
    activeBorder: "border-blue-500 dark:border-blue-400",
    activeBg: "bg-blue-50/80 dark:bg-blue-950/50",
    iconBg: "bg-blue-600 text-white",
    checkBg: "bg-blue-600 text-white",
  },
  {
    id: "PARCEL",
    labelKey: "cat_parcel",
    defaultLabel: "Parcel",
    icon: Package,
    activeBorder: "border-amber-500 dark:border-amber-400",
    activeBg: "bg-amber-50/80 dark:bg-amber-950/50",
    iconBg: "bg-amber-500 text-white",
    checkBg: "bg-amber-600 text-white",
  },
  {
    id: "CONTRACTOR",
    labelKey: "cat_contractor",
    defaultLabel: "Contractor",
    icon: HardHat,
    activeBorder: "border-orange-500 dark:border-orange-400",
    activeBg: "bg-orange-50/80 dark:bg-orange-950/50",
    iconBg: "bg-orange-500 text-white",
    checkBg: "bg-orange-600 text-white",
  },
  {
    id: "DELIVERY",
    labelKey: "cat_delivery",
    defaultLabel: "Delivery",
    icon: Truck,
    activeBorder: "border-teal-500 dark:border-teal-400",
    activeBg: "bg-teal-50/80 dark:bg-teal-950/50",
    iconBg: "bg-teal-600 text-white",
    checkBg: "bg-teal-600 text-white",
  },
];

const DEPT_TRANSLATION_KEY_MAP: Record<string, string> = {
  accounts: "dept_accounts",
  production: "dept_production",
  it: "dept_it",
  admin: "dept_admin",
  operations: "dept_operations",
  procurement: "dept_procurement",
  "supply chain": "dept_supply_chain",
  "executive office": "dept_executive_office",
  hr: "dept_hr",
};

export default function VisitInfoStep({
  data,
  onChange,
  onNext,
  category = "",
  onCategoryChange,
  operatorMode = "category",
  onBack,
  onParcelSelect,
}: VisitInfoStepProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { language, t } = useLanguage();
  const isUr = !isAdmin && language === "ur";

  const isAdvancingRef = useRef(false);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [recentHosts, setRecentHosts] = useState<string[]>([]);
  const [isMeetInputFocused, setIsMeetInputFocused] = useState(false);

  // Dynamic departments state for Operator Step 2
  const [departments, setDepartments] = useState<DynamicDepartmentOption[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState<boolean>(!isAdmin);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);

  useEffect(() => {
    isAdvancingRef.current = false;
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, [operatorMode]);

  const fetchActiveDepartments = useCallback(async () => {
    if (isAdmin) return;
    setDepartmentsLoading(true);
    setDepartmentsError(null);
    try {
      const res = await fetch("/api/departments?activeOnly=true");
      if (!res.ok) {
        throw new Error("Failed to load departments");
      }
      const json = await res.json();
      if (Array.isArray(json?.departments)) {
        setDepartments(
          json.departments.map((d: { id: string; name: string; hodName?: string; whatsappNumber?: string }) => ({
            id: d.id,
            name: d.name,
            hodName: d.hodName,
            whatsappNumber: d.whatsappNumber,
          }))
        );
      } else {
        setDepartments([]);
      }
    } catch {
      setDepartmentsError(
        t("departments_load_error", "Unable to load departments. Please try again.")
      );
    } finally {
      setDepartmentsLoading(false);
    }
  }, [isAdmin, t]);

  // Fetch active departments from Admin Department Management when Operator Step 2 opens
  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    fetch("/api/departments?activeOnly=true")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load departments");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setDepartmentsError(null);
        if (Array.isArray(json?.departments)) {
          setDepartments(
            json.departments.map((d: { id: string; name: string; hodName?: string; whatsappNumber?: string }) => ({
              id: d.id,
              name: d.name,
              hodName: d.hodName,
              whatsappNumber: d.whatsappNumber,
            }))
          );
        } else {
          setDepartments([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDepartmentsError(
            t("departments_load_error", "Unable to load departments. Please try again.")
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDepartmentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, operatorMode, t]);

  // Fetch existing hosts from recent visits in the database for autocomplete
  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    fetch("/api/visitors?limit=60")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.visits || !Array.isArray(json.visits)) return;
        const hostSet = new Set<string>();
        const hosts: string[] = [];

        for (const v of json.visits) {
          const h = (v.hostName || "").trim();
          if (h && h.length >= 2) {
            const key = h.toLowerCase();
            if (!hostSet.has(key)) {
              hostSet.add(key);
              hosts.push(h);
            }
          }
        }
        setRecentHosts(hosts.slice(0, 8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Filter autocomplete dropdown suggestions ONLY when the operator is actively typing a query
  const matchingSearchHosts = useMemo(() => {
    const q = data.meetName.trim().toLowerCase();
    if (!q) return [];
    return recentHosts
      .filter((h) => h.toLowerCase().includes(q) && h.toLowerCase() !== q)
      .slice(0, 4);
  }, [recentHosts, data.meetName]);

  const isDelivery = category === "DELIVERY";
  const deliverySourceValue = (data.deliverySource ?? data.meetName ?? "").trim();
  const isDeliverySourceValid = deliverySourceValue.length > 0;
  const isMeetNameValid = data.meetName.trim().length > 0;
  const isDepartmentValid = data.department.trim().length > 0;
  const isFormValid = isDelivery ? isDeliverySourceValid : isMeetNameValid && isDepartmentValid;

  const triggerSafeNext = (withAutoAdvanceSound = false) => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
    }
    if (withAutoAdvanceSound && !isAdmin) {
      playAutoAdvanceSound();
    }
    onNext();
  };

  const handleDeliverySourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange({
      ...data,
      deliverySource: val,
      meetName: val,
      department: data.department?.trim() ? data.department : "Delivery",
    });
  };

  const handleAdminChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onChange({ ...data, [name]: value });
  };

  /* ================= ORIGINAL ADMIN VISIT INFO STEP ================= */
  if (isAdmin) {
    const labelClass = "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5";
    const inputClass =
      "block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-colors shadow-2xs";

    if (isDelivery) {
      return (
        <div className="space-y-6">
          <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-6 sm:p-7">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {t("delivery_source_title", "Delivery Source / Company Name")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t(
                  "delivery_source_subtitle",
                  "Enter the name of the cargo company, courier service, or source from which the delivery arrived"
                )}
              </p>
            </div>

            <div>
              <label htmlFor="deliverySource" className={labelClass}>
                {t("delivery_source_label", "Delivery Source / Company Name")}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="deliverySource"
                name="deliverySource"
                type="text"
                value={data.deliverySource ?? data.meetName}
                onChange={handleDeliverySourceChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (isDeliverySourceValid) {
                      onNext();
                    }
                  }
                }}
                placeholder={t(
                  "delivery_source_placeholder",
                  "e.g. TCS, DHL, Leopards, Daraz, Supplier Name"
                )}
                className={inputClass}
                autoFocus
              />
            </div>
          </section>

          <div className="pt-2">
            <button
              type="button"
              onClick={onNext}
              disabled={!isDeliverySourceValid}
              className={`w-full py-3.5 px-6 rounded-xl text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-all ${
                isDeliverySourceValid
                  ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white cursor-pointer"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none"
              }`}
            >
              <span>{t("next_btn", "Next")}</span>
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
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
            {!isDeliverySourceValid && (
              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">
                {t(
                  "delivery_source_required_hint",
                  "Please enter Delivery Source / Company Name to continue"
                )}
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-6 sm:p-7">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Visit Information
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Please enter the host details for this visitor registration
            </p>
          </div>

          <div className="space-y-5">
            {/* 1. Visitor is here to meet */}
            <div>
              <label htmlFor="meetName" className={labelClass}>
                Visitor is here to meet <span className="text-red-500">*</span>
              </label>
              <input
                id="meetName"
                name="meetName"
                type="text"
                value={data.meetName}
                onChange={handleAdminChange}
                placeholder="e.g. Muhammad Asif (Manager)"
                className={inputClass}
                autoFocus
              />
            </div>

            {/* 2. Department */}
            <div>
              <label htmlFor="department" className={labelClass}>
                Department <span className="text-red-500">*</span>
              </label>
              <input
                id="department"
                name="department"
                type="text"
                value={data.department}
                onChange={handleAdminChange}
                placeholder="e.g. Accounts, Production, IT"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Next Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onNext}
            disabled={!isFormValid}
            className={`w-full py-3.5 px-6 rounded-xl text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-all ${
              isFormValid
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white cursor-pointer"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none"
            }`}
          >
            <span>Continue to Document Verification</span>
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
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
          {!isFormValid && (
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">
              Please fill in both required fields to continue
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ================= OPERATOR STEP 1: SELECT VISITOR CATEGORY ================= */
  const textAlignClass = isUr ? "text-right" : "text-left";

  if (operatorMode === "category") {
    const handleCategorySelect = (catId: string) => {
      if (!catId || isAdvancingRef.current) return;
      if (catId === "PARCEL" && onParcelSelect) {
        playSelectSound();
        onParcelSelect();
        return;
      }
      if (onCategoryChange) {
        onCategoryChange(catId);
      }
      triggerSafeNext(true);
    };

    return (
      <div className="space-y-3">
        <div className={textAlignClass}>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t("select_category_title", "Select Visitor Category")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("select_category_subtitle", "Tap a category card to continue automatically")}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = Boolean(category) && category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.id)}
                aria-pressed={isSelected}
                className={`relative p-3 sm:p-4 rounded-2xl border-2 transition-all duration-150 flex flex-col items-center justify-center text-center gap-2 cursor-pointer min-h-[104px] sm:min-h-[120px] active:scale-[0.98] ${
                  isSelected
                    ? `${cat.activeBorder} ${cat.activeBg} shadow-sm`
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                }`}
              >
                {isSelected && (
                  <span
                    className={`absolute top-2 right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shadow-xs ${cat.checkBg}`}
                  >
                    <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                  </span>
                )}

                <div
                  className={`w-11 h-11 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center shadow-sm shrink-0 transition-transform ${
                    isSelected
                      ? `${cat.iconBg} scale-105`
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>

                <span
                  className={`text-xs sm:text-sm font-extrabold leading-snug ${
                    isSelected
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {t(cat.labelKey, cat.defaultLabel)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ================= OPERATOR STEP 2: VISIT INFORMATION ================= */
  if (isDelivery) {
    return (
      <div className="space-y-3.5">
        <div className={textAlignClass}>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t("delivery_source_title", "Delivery Source / Company Name")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              "delivery_source_subtitle",
              "Enter the name of the cargo company, courier service, or source from which the delivery arrived"
            )}
          </p>
        </div>

        <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5">
          <label
            htmlFor="operatorDeliverySource"
            className={`block text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 ${textAlignClass}`}
          >
            {t("delivery_source_label", "Delivery Source / Company Name")}{" "}
            <span className="text-red-500">*</span>
          </label>

          <div className="relative">
            <Truck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="operatorDeliverySource"
              name="deliverySource"
              type="text"
              autoComplete="off"
              autoFocus
              value={data.deliverySource ?? data.meetName}
              onChange={handleDeliverySourceChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (isDeliverySourceValid) {
                    playContinueSound();
                    triggerSafeNext(false);
                  }
                }
              }}
              placeholder={t(
                "delivery_source_placeholder",
                "e.g. TCS, DHL, Leopards, Daraz, Supplier Name"
              )}
              className={`block w-full rounded-xl border-2 pl-10 pr-3.5 py-2.5 text-sm sm:text-base font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-900 focus:outline-none transition-colors ${textAlignClass} ${
                isDeliverySourceValid
                  ? "border-emerald-500/80 dark:border-emerald-500/70"
                  : "border-slate-200 dark:border-slate-700 focus:border-blue-500"
              }`}
            />
          </div>
        </div>

        {!isDeliverySourceValid && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-200 text-xs font-bold ${
              isUr ? "text-right" : "text-left"
            }`}
          >
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span dir="auto" className="flex-1">
              {t(
                "delivery_source_required_hint",
                "Please enter Delivery Source / Company Name to continue"
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2.5 pt-1">
          {onBack ? (
            <button
              type="button"
              onClick={() => {
                playBackSound();
                onBack();
              }}
              className="py-2.5 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("back_btn", "Back")}</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            disabled={!isDeliverySourceValid}
            onClick={() => {
              if (!isDeliverySourceValid) return;
              playContinueSound();
              triggerSafeNext(false);
            }}
            className={`flex-1 sm:flex-initial sm:min-w-[160px] py-2.5 px-5 rounded-xl text-xs sm:text-sm font-extrabold shadow-xs flex items-center justify-center gap-2 transition-all ${
              isDeliverySourceValid
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white cursor-pointer"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none"
            }`}
          >
            <span>{t("next_btn", "Next")}</span>
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
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  const handleMeetNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextMeetName = e.target.value;
    const updated = { ...data, meetName: nextMeetName };
    onChange(updated);

    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
    }

    // If Department is already selected and operator finishes typing a valid host name, auto-advance after brief pause
    if (nextMeetName.trim().length >= 2 && updated.department.trim().length > 0) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        triggerSafeNext(true);
      }, 950);
    }
  };

  const handleSelectHostOption = (host: string) => {
    const updated = { ...data, meetName: host };
    onChange(updated);
    setIsMeetInputFocused(false);
    if (host.trim().length > 0 && updated.department.trim().length > 0) {
      triggerSafeNext(true);
    } else {
      playSelectSound();
    }
  };

  const handleSelectDepartmentCard = (dept: DynamicDepartmentOption) => {
    const updated: VisitInfoData = {
      ...data,
      department: dept.name,
      departmentId: dept.id,
    };
    onChange(updated);
    if (updated.meetName.trim().length > 0 && dept.name.trim().length > 0) {
      triggerSafeNext(true);
    } else {
      playSelectSound();
    }
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (data.meetName.trim().length > 0 && data.department.trim().length > 0) {
        triggerSafeNext(true);
      }
    }
  };

  const getLocalizedDepartmentLabel = (name: string): string => {
    const key = DEPT_TRANSLATION_KEY_MAP[name.trim().toLowerCase()];
    return key ? t(key, name) : name;
  };

  return (
    <div className="space-y-3.5">
      {/* Heading */}
      <div className={textAlignClass}>
        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
          {t("visit_info_title", "Visit Information")}
        </h2>
      </div>

      {/* 1. Visitor to Meet (Clean input + floating autocomplete dropdown only when searching) */}
      <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5">
        <label
          htmlFor="meetName"
          className={`block text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 ${textAlignClass}`}
        >
          {t("meet_name_label", "Visitor to Meet")} <span className="text-red-500">*</span>
        </label>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="meetName"
            name="meetName"
            type="text"
            autoComplete="off"
            value={data.meetName}
            onFocus={() => setIsMeetInputFocused(true)}
            onBlur={() => {
              setTimeout(() => setIsMeetInputFocused(false), 150);
            }}
            onChange={handleMeetNameInputChange}
            onKeyDown={handleFieldKeyDown}
            placeholder={t(
              "meet_name_placeholder",
              "Search or enter host name (e.g. Muhammad Asif)"
            )}
            className={`block w-full rounded-xl border-2 pl-10 pr-3.5 py-2.5 text-sm sm:text-base font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-900 focus:outline-none transition-colors ${textAlignClass} ${
              isMeetNameValid
                ? "border-emerald-500/80 dark:border-emerald-500/70"
                : "border-slate-200 dark:border-slate-700 focus:border-blue-500"
            }`}
          />

          {/* Floating autocomplete dropdown when actively searching */}
          {isMeetInputFocused && matchingSearchHosts.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {matchingSearchHosts.map((host) => (
                <button
                  key={host}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectHostOption(host);
                  }}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span
                    dir="auto"
                    className={`truncate flex-1 ${isUr ? "text-right" : "text-left"}`}
                  >
                    {host}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Department (Dynamic from Admin Department Management — no custom text input) */}
      <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5">
        <div
          className={`block text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 ${textAlignClass}`}
        >
          {t("department_label", "Department")} <span className="text-red-500">*</span>
        </div>

        {departmentsLoading ? (
          <div className="py-5 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{t("loading_departments", "Loading departments...")}</span>
          </div>
        ) : departmentsError ? (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-300 text-center sm:text-left">
              {departmentsError}
            </span>
            <button
              type="button"
              onClick={fetchActiveDepartments}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t("retry", "Retry")}</span>
            </button>
          </div>
        ) : departments.length === 0 ? (
          <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-center">
            <p className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-200">
              {t("no_departments_configured", "Departments have not been configured yet.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {departments.map((dept) => {
              const isSelectedDept =
                (data.departmentId && data.departmentId === dept.id) ||
                data.department.trim().toLowerCase() === dept.name.toLowerCase();
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => handleSelectDepartmentCard(dept)}
                  aria-pressed={isSelectedDept}
                  className={`relative px-3 py-2.5 rounded-xl border-2 text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 text-center cursor-pointer min-h-[46px] active:scale-[0.98] ${
                    isSelectedDept
                      ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-blue-400 dark:hover:border-blue-500"
                  }`}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">{getLocalizedDepartmentLabel(dept.name)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Missing selection indicator */}
      {!isFormValid && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-200 text-xs font-bold ${
            isUr ? "text-right" : "text-left"
          }`}
        >
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span dir="auto" className="flex-1">
            {!isMeetNameValid
              ? t("missing_meet_name_hint", "Please enter or select Visitor to Meet")
              : t("missing_department_hint", "Please select a Department to continue")}
          </span>
        </div>
      )}

      {/* Back Navigation (No Next/Continue button on Step 2 per spec) */}
      <div className="flex items-center justify-between pt-1">
        {onBack && (
          <button
            type="button"
            onClick={() => {
              playBackSound();
              onBack();
            }}
            className="py-2.5 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("back_btn", "Back")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
