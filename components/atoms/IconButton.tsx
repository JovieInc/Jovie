'use client';

import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export type IconButtonProps = {
  ariaLabel: string;
  title?: string;
  className?: string;
  onClick?: () => void;
  href?: string; // if provided, renders a Link
  target?: string;
  rel?: string;
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
  disabled,
  size = 'sm',
  variant = 'subtle',
  children,
}: IconButtonProps) {
  const base = cn(
    'inline-flex items-center justify-center rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
    'border border-subtle',
    variant === 'subtle'
      ? 'bg-surface-2 hover:bg-surface-3 text-tertiary-token hover:text-secondary-token'
      : 'bg-surface-1 hover:bg-surface-2 text-secondary-token hover:text-primary-token',
    size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
    disabled && 'opacity-50 cursor-not-allowed',
    disabled && href && 'pointer-events-none',
    className
  );

  if (href) {
    return (
      <Link
        href={href}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
        title={title}
        className={base}
        aria-disabled={disabled ? 'true' : undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={base}
    >
      {children}
    </button>
  );
}
