'use client';

import { Button, type ButtonProps, Kbd } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Canonical empty-state primitive (GH-12638).
 *
 * Contract:
 * - Lucide (or any) greyscale icon in a quiet surface chip
 * - Title Case heading
 * - One supporting sentence
 * - One primary CTA (button or link) — required for product empty states
 * - Optional secondary text link (not a second filled button)
 *
 * Prefer this over bespoke *EmptyState components. Domain-specific multi-step
 * flows (Bandsintown connect, multi-card inbox starters) may still own their
 * own surface, but simple hierarchy empty states must compose this primitive.
 */

type EmptyStateVariant = 'default' | 'search' | 'error' | 'permission';

type PrimaryAction =
  | {
      label: string;
      onClick: () => void;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
      disabled?: boolean;
      /** Keyboard shortcut to display (e.g., "N then I" or "Ctrl+N") */
      shortcut?: string;
    }
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
      prefetch?: boolean;
      disabled?: boolean;
      /** Keyboard shortcut to display (e.g., "N then I" or "Ctrl+N") */
      shortcut?: string;
    };

type SecondaryAction =
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      ariaLabel?: string;
      prefetch?: boolean;
    }
  | {
      label: string;
      onClick: () => void;
      ariaLabel?: string;
    };

export interface EmptyStateProps {
  readonly icon?: React.ReactNode;
  readonly heading: string;
  readonly description?: string;
  readonly action?: PrimaryAction;
  readonly secondaryAction?: SecondaryAction;
  readonly variant?: EmptyStateVariant;
  /** Button size - use 'sm' for less padding */
  readonly size?: 'default' | 'sm';
  readonly className?: string;
  readonly testId?: string;
}

const variantStyles: Record<
  EmptyStateVariant,
  {
    iconWrapper: string;
    heading: string;
    descriptionClassName: string;
  }
> = {
  default: {
    iconWrapper: 'text-tertiary-token',
    heading: 'text-secondary-token',
    descriptionClassName: 'text-secondary-token',
  },
  search: {
    iconWrapper: 'text-tertiary-token',
    heading: 'text-secondary-token',
    descriptionClassName: 'text-secondary-token',
  },
  error: {
    iconWrapper: 'text-error',
    heading: 'text-secondary-token',
    descriptionClassName: 'text-secondary-token',
  },
  permission: {
    iconWrapper: 'text-tertiary-token',
    heading: 'text-secondary-token',
    descriptionClassName: 'text-secondary-token',
  },
};

/**
 * Parses a shortcut string like "N then I" or "Ctrl+N" into displayable parts
 */
function parseShortcut(shortcut: string): React.ReactNode {
  // Handle "X then Y" format
  if (shortcut.includes(' then ')) {
    const parts = shortcut.split(' then ');
    return (
      <span className='ml-2 inline-flex items-center gap-1'>
        <Kbd>{parts[0]}</Kbd>
        <span className='text-3xs text-tertiary-token'>then</span>
        <Kbd>{parts[1]}</Kbd>
      </span>
    );
  }
  // Handle simple shortcut like "Ctrl+N"
  return (
    <span className='ml-2'>
      <Kbd>{shortcut}</Kbd>
    </span>
  );
}

export function EmptyState({
  icon,
  heading,
  description,
  action,
  secondaryAction,
  variant = 'default',
  size = 'sm',
  className,
  testId,
}: EmptyStateProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const styles = variantStyles[variant] ?? variantStyles.default;
  const buttonSize = size === 'sm' ? 'sm' : 'default';

  const renderPrimaryAction = (): React.ReactNode => {
    if (!action) return null;

    const buttonContent = (
      <>
        {action.label}
        {action.shortcut && parseShortcut(action.shortcut)}
      </>
    );

    if ('href' in action) {
      if (action.disabled) {
        return (
          <Button
            variant={action.variant ?? 'primary'}
            size={buttonSize}
            disabled
            aria-label={action.ariaLabel ?? action.label}
          >
            {buttonContent}
          </Button>
        );
      }

      return (
        <Button asChild variant={action.variant ?? 'primary'} size={buttonSize}>
          <Link
            href={action.href}
            prefetch={action.prefetch ?? false}
            target={action.target}
            rel={action.rel}
            aria-label={action.ariaLabel ?? action.label}
          >
            {buttonContent}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        variant={action.variant ?? 'primary'}
        size={buttonSize}
        onClick={action.onClick}
        disabled={action.disabled}
        aria-label={action.ariaLabel ?? action.label}
      >
        {buttonContent}
      </Button>
    );
  };

  const renderSecondaryAction = (): React.ReactNode => {
    if (!secondaryAction) return null;

    // Secondary is always a quiet text link (not a second filled button).
    if ('href' in secondaryAction) {
      return (
        <Button asChild variant='link' size={buttonSize}>
          <Link
            href={secondaryAction.href}
            prefetch={secondaryAction.prefetch ?? false}
            target={secondaryAction.target}
            rel={secondaryAction.rel}
            aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
          >
            {secondaryAction.label}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        variant='link'
        size={buttonSize}
        onClick={secondaryAction.onClick}
        aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
      >
        {secondaryAction.label}
      </Button>
    );
  };

  return (
    <output
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      data-testid={testId}
      className={cn(
        'flex flex-1 flex-col items-center justify-center px-3 py-10 text-center',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-subtle bg-surface-1',
            styles.iconWrapper
          )}
          aria-hidden='true'
        >
          {icon}
        </div>
      )}

      <h3
        id={headingId}
        className={cn('mb-1 text-app font-caption', styles.heading)}
      >
        {heading}
      </h3>

      {description && (
        <p
          id={descriptionId}
          className={cn(
            'mb-5 max-w-sm text-app leading-[1.45]',
            styles.descriptionClassName
          )}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className='flex flex-col items-center gap-2 sm:flex-row sm:gap-3'>
          {renderPrimaryAction()}
          {renderSecondaryAction()}
        </div>
      )}
    </output>
  );
}
