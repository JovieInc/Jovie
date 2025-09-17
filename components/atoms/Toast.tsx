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

  const typeStyles = {
    info: 'bg-gray-900 text-white',
    success: 'bg-green-600 text-white',
    warning: 'bg-amber-500 text-white',
    error: 'bg-red-600 text-white',
  };

  const actionStyles = {
    info: 'text-blue-400 hover:text-blue-300',
    success: 'text-green-200 hover:text-green-100',
    warning: 'text-amber-200 hover:text-amber-100',
    error: 'text-red-200 hover:text-red-100',
  };

  return (
    <div
      role='status'
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50',
        typeStyles[type],
        isVisible
          ? 'animate-in slide-in-from-bottom-2'
          : 'animate-out slide-out-to-bottom-2',
        className
      )}
    >
      <span className='text-sm'>{message}</span>
      {action && (
        <button
          onClick={handleActionClick}
          className={cn('text-sm font-medium', actionStyles[type])}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
