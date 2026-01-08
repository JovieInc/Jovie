import { Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface StarterEmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary';
}

export interface StarterEmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  primaryAction?: StarterEmptyStateAction;
  secondaryAction?: StarterEmptyStateAction;
  className?: string;
  testId?: string;
}

export function StarterEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className,
  testId,
}: StarterEmptyStateProps) {
  const renderAction = (
    action: StarterEmptyStateAction,
    isPrimary: boolean
  ) => {
    const variant = action.variant ?? (isPrimary ? 'primary' : 'secondary');
    const baseClasses =
      'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

    /** Button variant styles using semantic tokens */
    const primaryStyles = 'bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 focus-visible:ring-accent';
    const secondaryStyles = 'border border-subtle bg-base text-primary-token hover:bg-surface-1 focus-visible:ring-accent';
    const variantStyles = variant === 'primary' ? primaryStyles : secondaryStyles;

    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Link
            key={`${action.label}-${action.href}`}
            href={action.href}
            className={cn(baseClasses, variantStyles)}
          >
            {action.label}
          </Link>
        );
      }

      return (
        <a
          key={`${action.label}-${action.href}`}
          href={action.href}
          onClick={action.onClick}
          className={cn(baseClasses, variantStyles)}
        >
          {action.label}
        </a>
      );
    }

    return (
      <button
        key={action.label}
        type='button'
        onClick={action.onClick}
        className={cn(baseClasses, variantStyles)}
      >
        {action.label}
      </button>
    );
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible empty state announcement
    <div
      role='status'
      aria-live='polite'
      data-testid={testId ?? 'app-empty-state'}
      className={cn(
        'rounded-2xl border border-dashed border-subtle bg-surface-1 p-6 shadow-sm',
        className
      )}
    >
      <div className='flex items-start gap-4'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-base text-primary-token shadow-sm ring-1 ring-border-subtle'>
          {icon ?? <Sparkles className='h-6 w-6' aria-hidden='true' />}
        </div>
        <div className='flex-1 space-y-2'>
          <div>
            <p className='text-base font-semibold text-primary-token'>
              {title}
            </p>
            <p className='text-sm text-secondary-token'>{description}</p>
          </div>

          {(primaryAction || secondaryAction) && (
            <div className='flex flex-wrap gap-2'>
              {primaryAction ? renderAction(primaryAction, true) : null}
              {secondaryAction ? renderAction(secondaryAction, false) : null}
            </div>
          )}
        </div>

        <Rocket className='hidden h-10 w-10 text-accent-token sm:block' />
      </div>
    </div>
  );
}
