'use client';

import { cn } from '@/lib/utils';

export interface CookieSettingsFooterButtonProps {
  className?: string;
}

export function CookieSettingsFooterButton({
  className,
}: CookieSettingsFooterButtonProps) {
  return (
    <button
      type='button'
      className={cn('appearance-none bg-transparent text-left', className)}
      onClick={() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('jv:cookie:open'));
      }}
    >
      Cookie settings
    </button>
  );
}
