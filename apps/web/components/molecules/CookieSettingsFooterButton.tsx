'use client';

import { cn } from '@/lib/utils';

export interface CookieSettingsFooterButtonProps {
  readonly className?: string;
}

export function CookieSettingsFooterButton({
  className,
}: CookieSettingsFooterButtonProps) {
  return (
    <button
      type='button'
      className={cn(
        'appearance-none bg-transparent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        className
      )}
      onClick={() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('jv:cookie:open'));
      }}
    >
      Cookie settings
    </button>
  );
}
