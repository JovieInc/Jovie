'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const baseToastClasses =
  'relative w-full max-w-sm rounded-2xl border px-5 py-3 shadow-[0_18px_45px_rgba(15,15,25,0.45)] backdrop-blur-[18px] transition-all duration-300';

const typeTextColors = {
  info: 'text-slate-900 dark:text-white',
  success: 'text-slate-900 dark:text-white',
  warning: 'text-slate-900 dark:text-white',
  error: 'text-slate-900 dark:text-white',
};

const accentStyles = {
  info: 'from-sky-400 via-white/0 to-cyan-400',
  success: 'from-emerald-400 via-white/0 to-lime-400',
  warning: 'from-amber-400 via-white/0 to-orange-500',
  error: 'from-rose-500 via-white/0 to-red-500',
};

const actionStyles = {
  info: 'text-sky-600 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200',
  success:
    'text-emerald-600 hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200',
  warning:
    'text-amber-700 hover:text-amber-600 dark:text-amber-200 dark:hover:text-amber-100',
  error:
    'text-rose-600 hover:text-rose-500 dark:text-rose-300 dark:hover:text-rose-200',
};

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 5000,
  onClose,
  action,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!duration) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onClose?.();
      }, 300); // Allow time for exit animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleActionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    action?.onClick();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: output element not appropriate for toast notification
    <div
      role='status'
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-label={`${type} toast`}
      data-testid='toast'
      className={cn(
        baseToastClasses,
        typeTextColors[type],
        'border-white/60 bg-white/70 dark:border-white/10 dark:bg-[#020617]/70',
        isVisible
          ? 'animate-in slide-in-from-bottom-2'
          : 'animate-out slide-out-to-bottom-2',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-y-3 left-4 w-1.5 rounded-full bg-gradient-to-b blur-sm',
          accentStyles[type]
        )}
      />
      <span className='text-sm'>{message}</span>
      {action && (
        <button
          type='button'
          onClick={handleActionClick}
          className={cn('text-sm font-semibold', actionStyles[type])}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
