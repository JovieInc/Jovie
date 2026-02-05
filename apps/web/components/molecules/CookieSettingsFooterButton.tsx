'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface CookieSettingsFooterButtonProps {
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function CookieSettingsFooterButton({
  className,
  style,
}: CookieSettingsFooterButtonProps) {
  return (
    <button
      type='button'
      className={cn(
        'appearance-none bg-transparent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        className
      )}
      style={style}
      onClick={() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('jv:cookie:open'));
      }}
    >
      Cookie settings
    </button>
  );
}
