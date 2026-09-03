'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  BANNER_ACTION_CLASS,
  BANNER_DISMISS_CLASS,
  BANNER_SHELL_GEOMETRY_CLASS,
  BANNER_VARIANT_CONTAINER,
  BANNER_VARIANT_ICON_COLOR,
} from './banner-semantic-contract';
import type { BannerAction, BannerVariant } from './banner-store';

/**
 * Canonical Banner — persistent, top-of-page system feedback.
 *
 * Shares the design-system tokens and motion timing used by toasts:
 * surface backgrounds, semantic accent colors (success, warning, error,
 * info), and 150ms subtle transitions. Persistent until dismissed.
 *
 * Prefer the imperative `banner.*` API (rendered via `BannerViewport`)
 * for app-level status; use this component directly for banners embedded
 * in a specific surface.
 */

const VARIANT_ICON: Record<BannerVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
  info: Info,
};

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

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      data-testid={testId ?? 'app-banner'}
      data-variant={variant}
      className={cn(
        BANNER_SHELL_GEOMETRY_CLASS,
        BANNER_VARIANT_CONTAINER[variant],
        className
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          BANNER_VARIANT_ICON_COLOR[variant]
        )}
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
            className={BANNER_ACTION_CLASS}
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
            className={BANNER_ACTION_CLASS}
          >
            {action.label}
          </Button>
        )
      ) : null}

      {onDismiss ? (
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          onClick={onDismiss}
          aria-label='Dismiss'
          className={BANNER_DISMISS_CLASS}
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </Button>
      ) : null}
    </div>
  );
}
