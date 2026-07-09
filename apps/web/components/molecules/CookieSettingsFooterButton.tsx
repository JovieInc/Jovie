'use client';

import { Button } from '@jovie/ui';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { cn } from '@/lib/utils';

export interface CookieSettingsFooterButtonProps {
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function CookieSettingsFooterButton({
  className,
  style,
}: CookieSettingsFooterButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const match = document.cookie
      .split(';')
      .find(c => c.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`));
    if (match && match.split('=')[1]?.trim() !== '0') {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <Button
      type='button'
      variant='link'
      className={cn(
        'h-auto appearance-none bg-transparent p-0 text-left no-underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        className
      )}
      style={style}
      onClick={() => {
        window.dispatchEvent(new CustomEvent('jv:cookie:open'));
      }}
    >
      Cookie Settings
    </Button>
  );
}
