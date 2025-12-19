'use client';

import type { MouseEventHandler } from 'react';

export interface AuthBackButtonProps {
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children?: string;
  className?: string;
}

export function AuthBackButton({
  onClick,
  disabled = false,
  children = 'Back',
  className,
}: AuthBackButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={`text-sm text-secondary-token hover:text-primary-token transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-ring-themed focus-visible:ring-offset-(--color-bg-base) rounded-md ${
        className ?? ''
      }`}
    >
      {children}
    </button>
  );
}
