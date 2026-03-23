'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

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
  const Icon = isLight ? MoonStar : SunMedium;

  return (
    <button
      type='button'
      onClick={handleToggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={cn(
        'focus-ring-themed flex h-8 w-8 items-center justify-center rounded-full border border-subtle text-secondary-token transition-colors hover:border-default hover:bg-surface-1 hover:text-primary-token',
        isLight && 'bg-surface-1 text-primary-token'
      )}
    >
      <Icon className='h-4 w-4' aria-hidden='true' />
    </button>
  );
}
