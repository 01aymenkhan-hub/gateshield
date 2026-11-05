'use client';

import React, { useEffect, useId, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

export interface GatekeeperLoaderProps {
  title?: string;
  subtitle?: string;
  /**
   * 'fullscreen' covers the entire viewport (e.g. initial auth/session check).
   * 'section' renders centered inside a dashboard/table/modal container.
   * 'overlay' / 'card' covers a relative parent card/modal during active processing (e.g. OCR scan).
   * 'compact' renders an inline branded loader bar.
   */
  variant?: 'fullscreen' | 'section' | 'overlay' | 'card' | 'compact';
  /**
   * If the operation runs longer than this threshold (ms), display a subtle reassurance message.
   * Defaults to 4500ms.
   */
  showSlowHintAfterMs?: number;
}

interface GateShieldAnimatedMarkProps {
  isDark: boolean;
  sizeClassName: string;
}

/**
 * Renders the official GateShield hexagonal building-gate mark with:
 * 1. The outer hexagonal building outline, lintel, and door jambs completely stationary (official PNG).
 * 2. A flowing, thin GateShield blue perimeter scan with a soft localized halo that travels smoothly
 *    clockwise around the exact outer building outline (287.5,12 -> 526,150 -> 526,425 -> 287.5,563 -> 49,425 -> 49,150).
 * 3. The subtle inner swinging gate leaf (pivoting around its right hinge at 398,420) and access light
 *    synchronized with the perimeter scan passing the gate entrance.
 */
function GateShieldAnimatedMark({ isDark, sizeClassName }: GateShieldAnimatedMarkProps) {
  const uid = useId().replace(/:/g, '');
  const [imgError, setImgError] = useState(false);

  const iconSrc = isDark
    ? '/brand/gateshield-icon-dark.png'
    : '/brand/gateshield-icon-light.png';

  // Sampled directly from the official GateShield assets:
  // Light mode icon fill: #334c91 (RGB 51, 76, 145)
  // Dark mode icon fill:  #ffffff (RGB 255, 255, 255)
  const gateFillColor = isDark ? '#ffffff' : '#334c91';
  const edgeHighlightColor = isDark ? '#38bdf8' : '#0ea5e9';
  const baseOutlineGlowColor = isDark ? '#0ea5e9' : '#0284c7';
  const baseOutlineStrokeColor = isDark ? '#60a5fa' : '#38bdf8';
  const tailFarColor = isDark ? '#2563eb' : '#0369a1';
  const tailMidColor = isDark ? '#3b82f6' : '#0284c7';
  const scanBodyColor = isDark ? '#38bdf8' : '#0ea5e9';
  const scanHeadGlowColor = isDark ? '#22d3ee' : '#06b6d4';
  const scanCoreColor = isDark ? '#e0f2fe' : '#bae6fd';

  const clipDoorwayId = `gs-doorway-clip-${uid}`;
  const clipThresholdId = `gs-threshold-clip-${uid}`;
  const lightGradId = `gs-access-grad-${uid}`;
  const entrancePulseGradId = `gs-entrance-pulse-${uid}`;
  const baseOutlineFilterId = `gs-base-outline-glow-${uid}`;
  const scanHaloFilterId = `gs-scan-halo-${uid}`;
  const headGlowFilterId = `gs-head-glow-${uid}`;

  // Exact measured outer hexagonal building perimeter in the 576x576 asset coordinate space
  const outerPerimeterPath =
    'M 287.5 12 L 526 150 L 526 425 L 287.5 563 L 49 425 L 49 150 Z';

  if (imgError) {
    return (
      <div
        className={`${sizeClassName} rounded-xl bg-[#334c91] text-white font-black text-sm flex items-center justify-center shrink-0`}
      >
        GS
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClassName} shrink-0 select-none`}>
      {/* Stationary Official GateShield Logo (outer hexagon, doorway lintel, and vertical jambs remain 100% fixed) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt="GateShield"
        draggable={false}
        onError={() => setImgError(true)}
        className="w-full h-full object-contain gs-logo-stationary-base"
      />

      {/* Precision-Aligned 576x576 Perimeter Scan, Inner Gate & Entrance Light Overlay */}
      <svg
        viewBox="0 0 576 576"
        className="absolute inset-0 w-full h-full pointer-events-none gs-gate-overlay-svg overflow-visible"
        aria-hidden="true"
      >
        <defs>
          {/* Continuous soft ambient glow around the full shield outline */}
          <filter
            id={baseOutlineFilterId}
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" />
          </filter>

          {/* Localized soft halo filter applied to the moving perimeter glow trail */}
          <filter
            id={scanHaloFilterId}
            x="-18%"
            y="-18%"
            width="136%"
            height="136%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="6.5" />
          </filter>

          {/* Crisp bloom filter for the leading cyan/blue highlight head */}
          <filter
            id={headGlowFilterId}
            x="-18%"
            y="-18%"
            width="136%"
            height="136%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Clips strictly to the inner doorway corridor between the left jamb (x=322) and right jamb (x=398) */}
          <clipPath id={clipDoorwayId}>
            <polygon points="321.2,330 398.8,330 398.8,420.5 321.2,464.2" />
          </clipPath>

          {/* Clips the subtle access light to the open entrance floor triangle */}
          <clipPath id={clipThresholdId}>
            <polygon points="322,368 398,420 322,464" />
          </clipPath>

          {/* Subtle GateShield blue access light gradient */}
          <linearGradient id={lightGradId} x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="45%" stopColor={isDark ? '#60a5fa' : '#2563eb'} stopOpacity={isDark ? '0.45' : '0.32'} />
            <stop offset="75%" stopColor={isDark ? '#93c5fd' : '#3b82f6'} stopOpacity={isDark ? '0.65' : '0.48'} />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>

          {/* Restrained brightness pulse near the gate entrance when the perimeter scan reaches the doorway */}
          <radialGradient id={entrancePulseGradId} cx="356" cy="426" r="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isDark ? '#38bdf8' : '#0ea5e9'} stopOpacity={isDark ? '0.45' : '0.35'} />
            <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 1. Synchronized Subtle Entrance Pulse when the perimeter scan reaches the gate */}
        <circle
          cx="356"
          cy="426"
          r="54"
          fill={`url(#${entrancePulseGradId})`}
          className="gs-entrance-glow"
        />

        {/* 2. Subtle Access Light travelling inward through the open gate threshold */}
        <g clipPath={`url(#${clipThresholdId})`}>
          <g className="gs-access-light">
            <polygon
              points="310,362 412,414 338,476 296,430"
              fill={`url(#${lightGradId})`}
            />
          </g>
        </g>

        {/* 3. Inner Gate Leaf pivoting gently open around the right hinge (398, 420) and returning smoothly */}
        <g clipPath={`url(#${clipDoorwayId})`}>
          <g className="gs-gate-leaf">
            {/* Solid gate leaf matching exact official PNG color (#334c91 light / #ffffff dark) */}
            <polygon
              points="318,324 402,324 399,420.3 321,392.2"
              fill={gateFillColor}
            />
            {/* Subtle edge highlight along the lower edge of the opening gate */}
            <line
              x1="322"
              y1="391.8"
              x2="398"
              y2="419.6"
              stroke={edgeHighlightColor}
              strokeWidth="4.5"
              strokeLinecap="round"
              className="gs-gate-edge"
            />
          </g>
        </g>

        {/* 4. Softly Illuminated Base Shield Outline (keeps the entire shield perimeter gently lit at all times) */}
        <path
          d={outerPerimeterPath}
          fill="none"
          stroke={baseOutlineGlowColor}
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={isDark ? '0.32' : '0.28'}
          filter={`url(#${baseOutlineFilterId})`}
          className="gs-outline-base-glow"
        />
        <path
          d={outerPerimeterPath}
          fill="none"
          stroke={baseOutlineStrokeColor}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={isDark ? '0.45' : '0.42'}
          className="gs-outline-base-line"
        />

        {/* 5. Continuous Circulating Shield Outline Glow (Leading Highlight + Smooth Fading Trail) */}
        {/* 5a. Wide ambient blue/cyan bloom following the moving light */}
        <path
          d={outerPerimeterPath}
          pathLength={1000}
          fill="none"
          stroke={scanBodyColor}
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="220 780"
          strokeOpacity={isDark ? '0.52' : '0.44'}
          filter={`url(#${scanHaloFilterId})`}
          style={
            {
              '--gs-dash-start': '980',
              '--gs-dash-end': '-20',
            } as React.CSSProperties
          }
          className="gs-perimeter-scan-line"
        />

        {/* 5b. Far tapering tail behind the moving light */}
        <path
          d={outerPerimeterPath}
          pathLength={1000}
          fill="none"
          stroke={tailFarColor}
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="280 720"
          strokeOpacity={isDark ? '0.24' : '0.22'}
          style={
            {
              '--gs-dash-start': '1040',
              '--gs-dash-end': '40',
            } as React.CSSProperties
          }
          className="gs-perimeter-scan-line"
        />

        {/* 5c. Mid fading trail */}
        <path
          d={outerPerimeterPath}
          pathLength={1000}
          fill="none"
          stroke={tailMidColor}
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="195 805"
          strokeOpacity={isDark ? '0.46' : '0.42'}
          style={
            {
              '--gs-dash-start': '955',
              '--gs-dash-end': '-45',
            } as React.CSSProperties
          }
          className="gs-perimeter-scan-line"
        />

        {/* 5d. Rich cyan-blue near-head body */}
        <path
          d={outerPerimeterPath}
          pathLength={1000}
          fill="none"
          stroke={scanBodyColor}
          strokeWidth="11.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="115 885"
          strokeOpacity={isDark ? '0.82' : '0.78'}
          style={
            {
              '--gs-dash-start': '875',
              '--gs-dash-end': '-125',
            } as React.CSSProperties
          }
          className="gs-perimeter-scan-line"
        />

        {/* 5e. Bright glowing cyan highlight head */}
        <path
          d={outerPerimeterPath}
          pathLength={1000}
          fill="none"
          stroke={scanHeadGlowColor}
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="52 948"
          strokeOpacity="0.96"
          filter={`url(#${headGlowFilterId})`}
          style={
            {
              '--gs-dash-start': '812',
              '--gs-dash-end': '-188',
            } as React.CSSProperties
          }
          className="gs-perimeter-scan-line"
        />

        {/* 5f. Crisp ice-cyan core tip at the very front of the traveling light */}
        <path
          d={outerPerimeterPath}
          pathLength={1000}
          fill="none"
          stroke={scanCoreColor}
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24 976"
          strokeOpacity="1"
          style={
            {
              '--gs-dash-start': '784',
              '--gs-dash-end': '-216',
            } as React.CSSProperties
          }
          className="gs-perimeter-scan-line"
        />
      </svg>
    </div>
  );
}

export default function GatekeeperLoader({
  title,
  subtitle,
  variant = 'section',
  showSlowHintAfterMs = 4500,
}: GatekeeperLoaderProps) {
  const { language, t } = useLanguage();
  const { theme } = useAuth();
  const isUr = language === 'ur';
  const isDark = theme === 'dark';
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (!showSlowHintAfterMs || showSlowHintAfterMs <= 0) return;
    const timer = setTimeout(() => {
      setShowSlowHint(true);
    }, showSlowHintAfterMs);
    return () => clearTimeout(timer);
  }, [showSlowHintAfterMs]);

  const resolvedTitle = title || t('loading_gatekeeper', 'Loading GateShield...');

  if (variant === 'compact') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700 ${
          isUr ? 'text-right' : 'text-left'
        }`}
      >
        <GateShieldAnimatedMark isDark={isDark} sizeClassName="w-7 h-7" />
        <div className="min-w-0">
          <p dir="auto" className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
            {resolvedTitle}
          </p>
          {subtitle && (
            <p dir="auto" className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  const containerClasses =
    variant === 'fullscreen'
      ? 'min-h-screen w-full flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100'
      : variant === 'overlay' || variant === 'card'
      ? 'w-full rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 shadow-sm text-center'
      : 'w-full py-14 px-6 flex flex-col items-center justify-center text-center';

  return (
    <div role="status" aria-live="polite" className={containerClasses}>
      {/* Clean, Centered GateShield Mark Container (No Heavy Blur or 3D Distortion) */}
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mb-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <GateShieldAnimatedMark
          isDark={isDark}
          sizeClassName="w-16 h-16 sm:w-[72px] sm:h-[72px]"
        />
      </div>

      {/* Loading Status Text */}
      <div className="max-w-sm space-y-1 text-center">
        <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
          {resolvedTitle}
        </p>
        {subtitle && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
            {subtitle}
          </p>
        )}
        {showSlowHint && (
          <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 pt-1 animate-in fade-in duration-300">
            {t('slow_operation_hint', 'Still working, please wait a moment...')}
          </p>
        )}
      </div>
    </div>
  );
}

