'use client';

import { cn } from '@jovie/ui/lib/utils';
import * as React from 'react';

import { Button, type ButtonProps } from './button';
import { Link } from './link';

/**
 * Canonical EmptyState primitive (GH-13896).
 *
 * Contract:
 * - One heading (required)
 * - One short support line (optional)
 * - Optional primary action (button or link)
 * - Optional secondary action (text link)
 * - NO icon/emoji hero in a box (banned pattern)
 * - Always centered vertically AND horizontally in the parent container
 *
 * Consumers must wrap this in a container with `flex-1` to allow
 * vertical centering via `grid place-items-center`.
 */

type PrimaryAction =
  | {
      label: string;
      onClick: () => void;
      variant?: ButtonProps['variant'];
      ariaLabel?: string;
      disabled?: boolean;
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
  readonly heading: string;
  readonly description?: string;
  readonly primaryAction?: PrimaryAction;
  readonly secondaryAction?: SecondaryAction;
  readonly className?: string;
  readonly testId?: string;
}

function renderPrimaryAction(action: PrimaryAction): React.ReactNode {
  const buttonContent = action.label;

  if ('href' in action) {
    if (action.disabled) {
      return (
        <Button
          variant={action.variant ?? 'primary'}
          size='sm'
          disabled
          aria-label={action.ariaLabel ?? action.label}
        >
          {buttonContent}
        </Button>
      );
    }

    return (
      <Button asChild variant={action.variant ?? 'primary'} size='sm'>
        <Link
          href={action.href}
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
      size='sm'
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={action.ariaLabel ?? action.label}
    >
      {buttonContent}
    </Button>
  );
}

function renderSecondaryAction(action: SecondaryAction): React.ReactNode {
  if ('href' in action) {
    return (
      <Button asChild variant='link' size='sm'>
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
      variant='link'
      size='sm'
      onClick={action.onClick}
      aria-label={action.ariaLabel ?? action.label}
    >
      {action.label}
    </Button>
  );
}

export function EmptyState({
  heading,
  description,
  primaryAction,
  secondaryAction,
  className,
  testId,
}: EmptyStateProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();

  return (
    <div
      role='status'
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      data-testid={testId}
      className={cn(
        'grid flex-1 place-items-center px-3 py-10 text-center',
        className
      )}
    >
      <div>
        <h3
          id={headingId}
          className='mb-1 text-app font-caption text-secondary-token'
        >
          {heading}
        </h3>

        {description && (
          <p
            id={descriptionId}
            className='mb-5 max-w-sm text-app leading-[1.45] text-secondary-token'
          >
            {description}
          </p>
        )}

        {(primaryAction || secondaryAction) && (
          <div className='flex flex-col items-center gap-2 sm:flex-row sm:gap-3'>
            {primaryAction && renderPrimaryAction(primaryAction)}
            {secondaryAction && renderSecondaryAction(secondaryAction)}
          </div>
        )}
      </div>
    </div>
  );
}
