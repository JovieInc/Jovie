'use client';

import { useCallback, useState } from 'react';

/**
 * Light/dark toggle for investor memo reading pages.
 * Returns isLight state so the parent can apply CSS class to prose wrapper.
 * Shell stays dark; only the prose area switches.
 */
export function InvestorThemeToggle({
  onToggle,
}: {
  readonly onToggle: (isLight: boolean) => void;
}) {
  const [isLight, setIsLight] = useState(false);

  const handleToggle = useCallback(() => {
    const next = !isLight;
    setIsLight(next);
    onToggle(next);
  }, [isLight, onToggle]);

  return (
    <button
      type='button'
      onClick={handleToggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className='flex h-8 w-8 items-center justify-center rounded-[var(--radius-default)] text-[length:var(--text-sm)] transition-colors'
      style={{
        color: 'var(--color-text-tertiary-token)',
        background: isLight ? 'var(--color-interactive-hover)' : 'transparent',
      }}
    >
      {isLight ? '🌙' : '☀️'}
    </button>
  );
}
