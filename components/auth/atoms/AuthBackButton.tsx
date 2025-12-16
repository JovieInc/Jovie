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
      className={`text-sm text-[#6b6f76] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        className ?? ''
      }`}
    >
      {children}
    </button>
  );
}
