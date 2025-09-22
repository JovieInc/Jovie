'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SmartBadgeProps {
  variant?: 'dot' | 'count' | 'status' | 'new' | 'pro';
  count?: number;
  status?: 'active' | 'warning' | 'error' | 'success' | 'info';
  pulse?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function SmartBadge({
  variant = 'dot',
  count = 0,
  status = 'info',
  pulse = false,
  className,
  children,
}: SmartBadgeProps) {
  const shouldShow = variant === 'count' ? count > 0 : true;

  if (!shouldShow) return null;

  const getVariantClasses = () => {
    switch (variant) {
      case 'dot':
        return cn('w-2 h-2 rounded-full', {
          'bg-blue-500': status === 'info',
          'bg-green-500': status === 'success',
          'bg-yellow-500': status === 'warning',
          'bg-red-500': status === 'error',
          'bg-gray-500': status === 'active',
        });

      case 'count':
        return cn(
          'min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-medium text-white',
          {
            'bg-blue-500': status === 'info',
            'bg-green-500': status === 'success',
            'bg-yellow-500': status === 'warning',
            'bg-red-500': status === 'error',
            'bg-gray-500': status === 'active',
          }
        );

      case 'status':
        return cn('px-2 py-0.5 rounded-full text-[10px] font-medium', {
          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300':
            status === 'info',
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300':
            status === 'success',
          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300':
            status === 'warning',
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300':
            status === 'error',
          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300':
            status === 'active',
        });

      case 'new':
        return 'px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider';

      case 'pro':
        return 'px-1.5 py-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider';

      default:
        return '';
    }
  };

  const pulseClasses = pulse ? 'animate-pulse' : '';

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center transition-all duration-200',
        getVariantClasses(),
        pulseClasses,
        className
      )}
    >
      {variant === 'count' && count > 99 ? '99+' : children || count}
    </span>
  );
}

// Quick action badge component for contextual actions
interface QuickActionBadgeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'secondary';
  className?: string;
}

export function QuickActionBadge({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  className,
}: QuickActionBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200',
        'hover:scale-105 active:scale-95',
        {
          'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-surface':
            variant === 'default',
          'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/80':
            variant === 'primary',
          'bg-sidebar-muted text-sidebar-muted-foreground hover:bg-sidebar-surface':
            variant === 'secondary',
        },
        className
      )}
      title={label}
    >
      <Icon className='w-3 h-3' />
      <span className='hidden group-hover:inline-block'>{label}</span>
    </button>
  );
}
