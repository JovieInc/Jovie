'use client';

import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export type IconButtonProps = {
  ariaLabel: string;
  title?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  href?: string; // link destination when rendering as link
  target?: string;
  rel?: string;
  as?: 'button' | 'link';
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'subtle' | 'neutral';
  children: React.ReactNode; // typically an SVG icon
};

// Consistent bordered icon-only button used across sidebar controls
export function IconButton({
  ariaLabel,
  title,
  className,
  onClick,
  href,
  target,
  rel,
  as,
  disabled,
  size = 'sm',
  variant = 'subtle',
  children,
}: IconButtonProps) {
  const resolvedAs = as ?? (href ? 'link' : 'button');

  const base = cn(
    'inline-flex items-center justify-center rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
    'border border-subtle',
    variant === 'subtle'
      ? 'bg-surface-2 hover:bg-surface-3 text-tertiary-token hover:text-secondary-token'
      : 'bg-surface-1 hover:bg-surface-2 text-secondary-token hover:text-primary-token',
    size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
    disabled && 'opacity-50 cursor-not-allowed',
    disabled && resolvedAs === 'link' && 'pointer-events-none',
    className
  );

  // Determine data-state based on current state
  const dataState = disabled ? 'disabled' : 'idle';

  // Merge rel tokens and ensure security for new tab links
  const relTokens = rel?.split(' ').filter(Boolean) ?? [];
  if (target === '_blank') {
    if (!relTokens.includes('noopener')) relTokens.push('noopener');
    if (!relTokens.includes('noreferrer')) relTokens.push('noreferrer');
  }
  const computedRel = relTokens.length ? relTokens.join(' ') : undefined;

  if (resolvedAs === 'link' && href) {
    return (
      <Link
        href={href}
        target={target}
        rel={computedRel}
        aria-label={ariaLabel}
        title={title}
        className={base}
        aria-disabled={disabled ? 'true' : undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={
          disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick
        }
        onKeyDown={
          disabled
            ? undefined
            : e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLAnchorElement).click();
                }
              }
        }
        data-state={dataState}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type='button'
      onClick={onClick}
      onKeyDown={
        disabled
          ? undefined
          : e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLButtonElement).click();
              }
            }
      }
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={base}
      data-state={dataState}
    >
      {children}
    </button>
  );
}
