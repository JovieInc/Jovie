'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { BannerAction, BannerVariant } from './banner-store';

/**
 * Canonical Banner — persistent, top-of-page system feedback.
 *
 * Shares the design-system tokens and motion timing used by toasts:
 * surface backgrounds, semantic accent colors (success green, error red,
 * info blue), and 150ms subtle transitions. Persistent until dismissed.
 *
 * Prefer the imperative `banner.*` API (rendered via `BannerViewport`)
 * for app-level status; use this component directly for banners embedded
 * in a specific surface.
 */

const VARIANT_CONTAINER: Record<BannerVariant, string> = {
  success: 'border-success/30 bg-success-subtle',
  error: 'border-error/30 bg-error-subtle',
  info: 'border-info/30 bg-info-subtle',
};

const VARIANT_ICON_COLOR: Record<BannerVariant, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-info',
};

const VARIANT_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

export interface BannerProps {
  readonly variant?: BannerVariant;
  readonly title: string;
  readonly description?: string;
  readonly action?: BannerAction;
  /** When provided, renders a close affordance. */
  readonly onDismiss?: () => void;
  readonly className?: string;
  readonly testId?: string;
}

export function Banner({
  variant = 'info',
  title,
  description,
  action,
  onDismiss,
  className,
  testId,
}: BannerProps) {
  const Icon = VARIANT_ICON[variant];
  const actionClassName =
    'inline-flex shrink-0 items-center justify-center rounded-full border border-default bg-surface-1 px-3 py-1 text-sm font-medium text-primary-token transition-colors duration-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      data-testid={testId ?? 'app-banner'}
      data-variant={variant}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-card backdrop-blur-sm',
        VARIANT_CONTAINER[variant],
        className
      )}
    >
      <Icon
        className={cn('mt-0.5 h-4 w-4 shrink-0', VARIANT_ICON_COLOR[variant])}
        aria-hidden='true'
      />

      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium leading-snug text-primary-token break-words'>
          {title}
        </p>
        {description ? (
          <p className='mt-0.5 text-sm leading-snug text-secondary-token break-words'>
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        action.href ? (
          <Button
            asChild
            variant='secondary'
            size='sm'
            className={actionClassName}
          >
            <Link href={action.href} onClick={action.onClick}>
              {action.label}
            </Link>
          </Button>
        ) : (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={action.onClick}
            className={actionClassName}
          >
            {action.label}
          </Button>
        )
      ) : null}

      {onDismiss ? (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={onDismiss}
          aria-label='Dismiss'
          className='h-auto w-auto shrink-0 rounded-full p-1 text-tertiary-token transition-colors duration-subtle hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </Button>
      ) : null}
    </div>
  );
}
