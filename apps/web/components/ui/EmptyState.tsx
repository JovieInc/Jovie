'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

type EmptyStateVariant = 'default' | 'search' | 'error' | 'permission';

type PrimaryAction =
  | {
      label: string;
      onClick: () => void;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
    }
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
    };

type SecondaryAction =
  | {
      label: string;
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
    }
  | {
      label: string;
      onClick: () => void;
      ariaLabel?: string;
    };

export interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  description?: string;
  action?: PrimaryAction;
  secondaryAction?: SecondaryAction;
  variant?: EmptyStateVariant;
  className?: string;
  testId?: string;
}

/**
 * EmptyState variant styles using semantic design tokens
 *
 * Follows Linear's design system principles:
 * - Uses semantic color tokens (success, warning, error, info) instead of raw color values
 * - Consistent with the OKLCH-based theme system in design-system.css
 * - Automatically adapts to dark/light mode via CSS custom properties
 */
const variantStyles: Record<
  EmptyStateVariant,
  {
    iconWrapper: string;
    heading: string;
    description: string;
    secondary: string;
  }
> = {
  default: {
    iconWrapper:
      'bg-surface-1 text-tertiary-token ring-1 ring-inset ring-border-subtle',
    heading: 'text-primary-token',
    description: 'text-secondary-token',
    secondary: 'text-accent-token',
  },
  search: {
    iconWrapper:
      'bg-info-subtle text-info ring-1 ring-inset ring-info/20',
    heading: 'text-primary-token',
    description: 'text-secondary-token',
    secondary: 'text-info',
  },
  error: {
    iconWrapper:
      'bg-error-subtle text-error ring-1 ring-inset ring-error/20',
    heading: 'text-primary-token',
    description: 'text-secondary-token',
    secondary: 'text-error',
  },
  permission: {
    iconWrapper:
      'bg-warning-subtle text-warning ring-1 ring-inset ring-warning/20',
    heading: 'text-primary-token',
    description: 'text-secondary-token',
    secondary: 'text-warning',
  },
};

export function EmptyState({
  icon,
  heading,
  description,
  action,
  secondaryAction,
  variant = 'default',
  className,
  testId,
}: EmptyStateProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const styles = variantStyles[variant] ?? variantStyles.default;

  const renderPrimaryAction = (): React.ReactNode => {
    if (!action) return null;

    if ('href' in action) {
      return (
        <Button
          asChild
          variant={action.variant ?? 'primary'}
          className='mt-2 w-full max-w-xs sm:w-auto'
        >
          <Link
            href={action.href}
            target={action.target}
            rel={action.rel}
            aria-label={action.ariaLabel ?? action.label}
          >
            {action.label}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        variant={action.variant ?? 'primary'}
        onClick={action.onClick}
        aria-label={action.ariaLabel ?? action.label}
        className='mt-2 w-full max-w-xs sm:w-auto'
      >
        {action.label}
      </Button>
    );
  };

  const renderSecondaryAction = (): React.ReactNode => {
    if (!secondaryAction) return null;

    if ('href' in secondaryAction) {
      return (
        <Link
          href={secondaryAction.href}
          target={secondaryAction.target}
          rel={secondaryAction.rel}
          className={cn(
            'mt-4 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
            styles.secondary
          )}
        >
          {secondaryAction.label}
        </Link>
      );
    }

    return (
      <button
        type='button'
        onClick={secondaryAction.onClick}
        aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
        className={cn(
          'mt-4 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
          styles.secondary
        )}
      >
        {secondaryAction.label}
      </button>
    );
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: status role needed for accessible empty state announcement
    <section
      role='status'
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center px-4 py-12 text-center',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-full',
            styles.iconWrapper
          )}
          aria-hidden='true'
        >
          <span className='flex h-8 w-8 items-center justify-center'>
            {icon}
          </span>
        </div>
      )}

      <h3
        id={headingId}
        className={cn('mb-2 text-lg font-semibold', styles.heading)}
      >
        {heading}
      </h3>

      {description && (
        <p
          id={descriptionId}
          className={cn('mb-6 max-w-sm text-sm', styles.description)}
        >
          {description}
        </p>
      )}

      {renderPrimaryAction()}
      {renderSecondaryAction()}
    </section>
  );
}
