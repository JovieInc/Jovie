'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/app-control-button-class';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

/** Visible label text — single source for render and the accessible name. */
const VISIBLE_LABEL = 'Back';

/**
 * WCAG label-content-name-mismatch contract: the accessible name must contain
 * the visible label text, or voice-control activation ("click Back") breaks.
 * A localized aria-label override (e.g. an Arabic 'رجوع') keeps its wording
 * and gains the visible word rather than replacing it.
 */
function resolveAccessibleName(ariaLabel: string): string {
  return ariaLabel.toLowerCase().includes(VISIBLE_LABEL.toLowerCase())
    ? ariaLabel
    : `${ariaLabel} ${VISIBLE_LABEL}`;
}

interface AuthBackButtonProps {
  readonly onClick?: (event?: React.MouseEvent<HTMLElement>) => void;
  readonly href?: string;
  readonly className?: string;
  readonly ariaLabel?: string;
  /**
   * When true, renders inline instead of fixed positioning.
   * Use this when the button is part of a form flow to prevent overlap.
   */
  readonly inline?: boolean;
}

export function AuthBackButton({
  onClick,
  href,
  className,
  ariaLabel = 'Go back',
  inline = false,
}: Readonly<AuthBackButtonProps>) {
  const haptic = useHapticFeedback();
  const accessibleName = resolveAccessibleName(ariaLabel);

  // Position classes - fixed by default, relative when inline
  const positionClasses = inline
    ? 'relative'
    : cn(
        'fixed z-50',
        'top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]',
        'md:top-6 md:left-6'
      );
  const controlClasses = cn(
    APP_CONTROL_BUTTON_CLASS,
    'h-9 gap-2 px-3 text-primary-token shadow-[0_1px_1px_rgba(0,0,0,0.04),0_6px_16px_-10px_rgba(0,0,0,0.24)]',
    positionClasses,
    className
  );

  const handleClick = (event?: React.MouseEvent<HTMLElement>) => {
    haptic.light();
    onClick?.(event);
  };

  if (href) {
    return (
      <Button
        asChild
        variant='ghost'
        size='sm'
        aria-label={accessibleName}
        className={controlClasses}
      >
        <Link
          href={href}
          onClick={event => {
            handleClick(event);
          }}
        >
          <ArrowLeft className='h-3.5 w-3.5' />
          <span className='text-xs font-medium tracking-[-0.012em]'>
            {VISIBLE_LABEL}
          </span>
        </Link>
      </Button>
    );
  }

  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={handleClick}
      aria-label={accessibleName}
      className={controlClasses}
    >
      <ArrowLeft className='h-3.5 w-3.5' />
      <span className='text-xs font-medium tracking-[-0.012em]'>
        {VISIBLE_LABEL}
      </span>
    </Button>
  );
}
