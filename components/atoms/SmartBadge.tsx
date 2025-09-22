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
        return cn('w-2 h-2 rounded-full transition-all duration-200', {
          'bg-status-info': status === 'info',
          'bg-status-success': status === 'success',
          'bg-status-warning': status === 'warning',
          'bg-status-error': status === 'error',
          'bg-sidebar-muted-foreground': status === 'active',
        });

      case 'count':
        return cn(
          'min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-medium transition-all duration-200',
          'text-white shadow-sm',
          {
            'bg-status-info': status === 'info',
            'bg-status-success': status === 'success',
            'bg-status-warning text-gray-900': status === 'warning', // Dark text on bright warning
            'bg-status-error': status === 'error',
            'bg-sidebar-muted-foreground': status === 'active',
          }
        );

      case 'status':
        return cn(
          'px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-200',
          {
            // Info status - Linear-inspired blue
            'bg-blue-50 text-blue-700 ring-1 ring-blue-200/50 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-800/30':
              status === 'info',
            // Success status - Natural green
            'bg-green-50 text-green-700 ring-1 ring-green-200/50 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800/30':
              status === 'success',
            // Warning status - Vibrant amber
            'bg-amber-50 text-amber-700 ring-1 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800/30':
              status === 'warning',
            // Error status - Clear red
            'bg-red-50 text-red-700 ring-1 ring-red-200/50 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-800/30':
              status === 'error',
            // Active status - Sophisticated neutral
            'bg-surface-2 text-text-secondary ring-1 ring-border-subtle dark:bg-surface-3 dark:text-text-muted dark:ring-border-default':
              status === 'active',
          }
        );

      case 'new':
        return 'px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider shadow-sm ring-1 ring-purple-500/20 transition-all duration-200 hover:shadow-md';

      case 'pro':
        return 'px-1.5 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-gray-900 text-[9px] font-bold rounded-full uppercase tracking-wider shadow-sm ring-1 ring-amber-400/20 transition-all duration-200 hover:shadow-md';

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
        'hover:scale-105 active:scale-95 backdrop-blur-sm',
        'shadow-sm ring-1 ring-transparent hover:ring-sidebar-border',
        {
          'bg-sidebar-accent/80 text-sidebar-accent-foreground hover:bg-sidebar-surface hover:shadow-md':
            variant === 'default',
          'bg-sidebar-primary/90 text-sidebar-primary-foreground hover:bg-sidebar-primary/80 hover:shadow-lg':
            variant === 'primary',
          'bg-sidebar-surface/60 text-sidebar-muted-foreground hover:bg-sidebar-surface hover:text-sidebar-foreground':
            variant === 'secondary',
        },
        className
      )}
      title={label}
    >
      <Icon className='w-3 h-3 transition-transform duration-200 group-hover:scale-110' />
      <span className='hidden group-hover:inline-block transition-all duration-200 opacity-0 group-hover:opacity-100'>
        {label}
      </span>
    </button>
  );
}
