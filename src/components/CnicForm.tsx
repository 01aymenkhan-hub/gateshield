"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { CnicData } from "../types/cnic";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { playSelectSound, playBackSound } from "@/utils/interactionSound";

interface CnicFormProps {
  /** The current form data (controlled by parent). */
  data: CnicData;
  /** Called whenever a field value changes. */
  onChange: (updated: CnicData) => void;
  /** Optional callback for operator to rescan document */
  onRescan?: () => void;
}

export default function CnicForm({ data, onChange, onRescan }: CnicFormProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { language, t } = useLanguage();
  const isUr = !isAdmin && language === "ur";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (!isAdmin && name === "gender" && value) {
      playSelectSound();
    }
    const updated: CnicData = { ...data, [name]: value };

    // Synchronize aliases
    if (name === "name" || name === "fullName") {
      updated.name = value;
      updated.fullName = value;
    } else if (name === "fatherName" || name === "fatherHusbandName") {
      updated.fatherName = value;
      updated.fatherHusbandName = value;
    } else if (name === "cnic" || name === "cnicNumber") {
      updated.cnic = value;
      updated.cnicNumber = value;
    }

    onChange(updated);
  };

  if (isAdmin) {
    /* ================= ORIGINAL ADMIN CNIC FORM (100% UNCHANGED) ================= */
    const labelClass = "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5";
    const inputClass =
      "block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-colors shadow-2xs";

    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Extracted Information
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verified fields from Pakistani CNIC (Smart Card or Old NADRA format)
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            8 Required Fields
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* 1. Full Name */}
          <div>
            <label htmlFor="fullName" className={labelClass}>
              Full Name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              dir="auto"
              style={{ textAlign: 'start' }}
              value={data.fullName || data.name || ""}
              onChange={handleChange}
              placeholder="e.g. Muhammad Mehmood Asim"
              className={inputClass}
            />
            {data.nameUrdu && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Original Urdu: <span lang="ur" dir="rtl">{data.nameUrdu}</span> · Verify English spelling</p>}
          </div>

          {/* 2. Father / Husband Name */}
          <div>
            <label htmlFor="fatherHusbandName" className={labelClass}>
              Father / Husband Name
            </label>
            <input
              id="fatherHusbandName"
              name="fatherHusbandName"
              type="text"
              dir="auto"
              style={{ textAlign: 'start' }}
              value={data.fatherHusbandName || data.fatherName || ""}
              onChange={handleChange}
              placeholder="e.g. Muhammad Asim Khan"
              className={inputClass}
            />
            {data.fatherNameUrdu && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Original Urdu: <span lang="ur" dir="rtl">{data.fatherNameUrdu}</span> · Verify English spelling</p>}
          </div>

          {/* 3. CNIC Number */}
          <div>
            <label htmlFor="cnicNumber" className={labelClass}>
              CNIC Number
            </label>
            <input
              id="cnicNumber"
              name="cnicNumber"
              type="text"
              value={data.cnicNumber || data.cnic || ""}
              onChange={handleChange}
              placeholder="XXXXX-XXXXXXX-X"
              className={inputClass}
            />
          </div>

          {/* 4. Gender */}
          <div>
            <label htmlFor="gender" className={labelClass}>
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              value={data.gender || ""}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {/* 5. Date of Birth */}
          <div>
            <label htmlFor="dateOfBirth" className={labelClass}>
              Date of Birth
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={data.dateOfBirth || ""}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          {/* 6. Date of Issue (empty for Old CNIC) */}
          <div>
            <label htmlFor="dateOfIssue" className={labelClass}>
              Date of Issue
            </label>
            <input
              id="dateOfIssue"
              name="dateOfIssue"
              type="date"
              value={data.dateOfIssue || ""}
              onChange={handleChange}
              placeholder="YYYY-MM-DD (Smart CNIC only)"
              className={inputClass}
            />
          </div>

          {/* 7. Date of Expiry (empty for Old CNIC) */}
          <div>
            <label htmlFor="dateOfExpiry" className={labelClass}>
              Date of Expiry
            </label>
            <input
              id="dateOfExpiry"
              name="dateOfExpiry"
              type="date"
              value={data.dateOfExpiry || ""}
              onChange={handleChange}
              placeholder="YYYY-MM-DD (Smart CNIC only)"
              className={inputClass}
            />
          </div>

          {/* 8. CNIC Identification (empty for Smart CNIC) */}
          <div>
            <label htmlFor="cnicIdentification" className={labelClass}>
              CNIC Identification
            </label>
            <input
              id="cnicIdentification"
              name="cnicIdentification"
              type="text"
              value={data.cnicIdentification || ""}
              onChange={handleChange}
              placeholder="e.g. Nothing / Mole on face"
              className={inputClass}
            />
          </div>
        </div>
      </section>
    );
  }

  /* ================= OPERATOR STEP 4: COMPACT REVIEW SCANNED DETAILS (CNIC) ================= */
  const textAlignClass = isUr ? "text-right" : "text-left";
  const opLabelClass = `block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 mb-1 ${textAlignClass}`;
  const opInputClass =
    "block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-colors shadow-2xs";

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4">
      {/* Small simple green status line + Heading immediately below (no descriptive subtitle) */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <span dir="auto" className={`text-xs font-extrabold tracking-wide ${(data.fullName || data.name) ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {(data.fullName || data.name)
              ? t("scan_complete_line", "✓ Scan Complete")
              : (isUr ? 'نام نہیں پڑھا گیا — تصویر دوبارہ لیں' : 'Name not read — retry with a clear photo')}
          </span>
          {onRescan && (
            <button
              type="button"
              onClick={() => {
                playBackSound();
                onRescan();
              }}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span dir="auto">{t("rescan_card_btn", "Rescan Card")}</span>
            </button>
          )}
        </div>
        <h2
          className={`text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5 ${textAlignClass}`}
        >
          {t("review_scanned_details_title", "Review Scanned Details")}
        </h2>
      </div>

      <div className="space-y-2.5">
        {/* Row 1: Full Name + Father / Husband Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="fullName" className={opLabelClass}>
              {t("field_full_name", "Full Name")} <span className="text-red-500">*</span>
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              dir="auto"
              style={{ textAlign: 'start' }}
              value={data.fullName || data.name || ""}
              onChange={handleChange}
              placeholder="e.g. Muhammad Mehmood Asim"
              className={opInputClass}
            />
            {data.nameUrdu && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("source_urdu_name", "Original Urdu")}: <span lang="ur" dir="rtl">{data.nameUrdu}</span> · {t("verify_english_spelling", "Verify English spelling")}</p>}
          </div>

          <div>
            <label htmlFor="fatherHusbandName" className={opLabelClass}>
              {t("field_father_husband_name", "Father / Husband Name")}
            </label>
            <input
              id="fatherHusbandName"
              name="fatherHusbandName"
              type="text"
              dir="auto"
              style={{ textAlign: 'start' }}
              value={data.fatherHusbandName || data.fatherName || ""}
              onChange={handleChange}
              placeholder="e.g. Muhammad Asim Khan"
              className={opInputClass}
            />
            {data.fatherNameUrdu && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("source_urdu_name", "Original Urdu")}: <span lang="ur" dir="rtl">{data.fatherNameUrdu}</span> · {t("verify_english_spelling", "Verify English spelling")}</p>}
          </div>
        </div>

        {/* Row 2: CNIC Number */}
        <div>
          <label htmlFor="cnicNumber" className={opLabelClass}>
            {t("field_cnic_number", "CNIC Number")} <span className="text-red-500">*</span>
          </label>
          <input
            id="cnicNumber"
            name="cnicNumber"
            type="text"
            value={data.cnicNumber || data.cnic || ""}
            onChange={handleChange}
            placeholder="XXXXX-XXXXXXX-X"
            className={`${opInputClass} font-mono`}
          />
        </div>

        {/* Row 3: Gender + Date of Birth (Side-by-Side 2 Columns on Mobile) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="gender" className={opLabelClass}>
              {t("field_gender", "Gender")}
            </label>
            <select
              id="gender"
              name="gender"
              value={data.gender || ""}
              onChange={handleChange}
              className={opInputClass}
            >
              <option value="">{t("field_gender_select", "Select Gender")}</option>
              <option value="Male">{t("field_gender_male", "Male")}</option>
              <option value="Female">{t("field_gender_female", "Female")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="dateOfBirth" className={opLabelClass}>
              {t("field_dob", "Date of Birth")}
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={data.dateOfBirth || ""}
              onChange={handleChange}
              className={opInputClass}
            />
          </div>
        </div>

        {/* Row 4: Date of Issue + Date of Expiry (Side-by-Side 2 Columns on Mobile) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="dateOfIssue" className={opLabelClass}>
              {t("field_issue_date", "Date of Issue")}
            </label>
            <input
              id="dateOfIssue"
              name="dateOfIssue"
              type="date"
              value={data.dateOfIssue || ""}
              onChange={handleChange}
              className={opInputClass}
            />
          </div>

          <div>
            <label htmlFor="dateOfExpiry" className={opLabelClass}>
              {t("field_expiry_date", "Date of Expiry")}
            </label>
            <input
              id="dateOfExpiry"
              name="dateOfExpiry"
              type="date"
              value={data.dateOfExpiry || ""}
              onChange={handleChange}
              className={opInputClass}
            />
          </div>
        </div>

        {/* Row 5: Identification Mark (Full-Width Row Below) */}
        <div>
          <label htmlFor="cnicIdentification" className={opLabelClass}>
            {t("field_identification", "Identification Mark")}
          </label>
          <input
            id="cnicIdentification"
            name="cnicIdentification"
            type="text"
            value={data.cnicIdentification || ""}
            onChange={handleChange}
            placeholder="e.g. Nothing"
            className={opInputClass}
          />
        </div>
      </div>
    </section>
  );
}
