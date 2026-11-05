'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  showLockIcon?: boolean;
  lockIconClassName?: string;
  wrapperClassName?: string;
  toggleButtonClassName?: string;
}

export default function PasswordInput({
  showLockIcon = false,
  lockIconClassName = 'w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none',
  wrapperClassName = 'relative',
  toggleButtonClassName,
  className = '',
  disabled,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  // Ensure right padding accommodates the eye toggle button and left padding accommodates lock icon if enabled
  const paddingClasses = `${showLockIcon && !className.includes('pl-') ? 'pl-10 ' : ''}${
    !className.includes('pr-10') && !className.includes('pr-11') ? 'pr-10 ' : ''
  }`;

  return (
    <div className={wrapperClassName}>
      {showLockIcon && <Lock className={lockIconClassName} />}
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={`${className} ${paddingClasses}`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className={
          toggleButtonClassName ||
          'absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors cursor-pointer disabled:opacity-50'
        }
      >
        {visible ? (
          <EyeOff className="w-4 h-4 shrink-0" />
        ) : (
          <Eye className="w-4 h-4 shrink-0" />
        )}
      </button>
    </div>
  );
}
