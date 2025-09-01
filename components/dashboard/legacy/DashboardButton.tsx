import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface DashboardButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'ghost'
    | 'outline'
    | 'pro-upgrade'
    | 'theme-selector'
    | 'nav-item';
  isActive?: boolean;
  isPro?: boolean;
}

export function DashboardButton({
  variant = 'secondary',
  className,
  children,
  isActive,
  isPro,
  ...props
}: DashboardButtonProps) {
  // Handle special dashboard variants
  if (variant === 'pro-upgrade') {
    return (
      <button
        className={cn(
          // Apple-style pill button with subtle design
          'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium',
          'bg-surface-3 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600',
          'text-primary border border-subtle',
          'shadow-sm hover:shadow-md',
          'transition-all duration-200 ease-out',
          'gap-2 focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Subtle glow effect and press animation
          'hover:ring-1 hover:ring-gray-300 dark:hover:ring-gray-500',
          'btn-press',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === 'theme-selector') {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-1',
          isActive
            ? 'bg-surface-2 border-accent text-primary ring-1 ring-accent'
            : 'bg-surface-1 border-subtle text-secondary hover:bg-surface-2 hover:text-primary',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === 'nav-item') {
    return (
      <button
        className={cn(
          'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ring-accent focus-visible:ring-offset-1',
          isActive
            ? 'bg-surface-2 text-primary shadow-sm border border-accent/20'
            : 'text-secondary hover:text-primary hover:bg-surface-2',
          'btn-press',
          className
        )}
        aria-current={isActive ? 'page' : undefined}
        {...props}
      >
        {children}
        {isPro && (
          <span className='ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-secondary border border-subtle'>
            Pro
          </span>
        )}
      </button>
    );
  }

  // Map dashboard variants to existing Button variants
  const variantMap: Record<string, ButtonProps['variant']> = {
    primary: 'primary',
    secondary: 'secondary',
    ghost: 'ghost',
    outline: 'secondary', // Use secondary as closest match
  };

  return (
    <Button
      variant={variantMap[variant] || 'secondary'}
      className={cn(className)}
      {...props}
    >
      {children}
    </Button>
  );
}
