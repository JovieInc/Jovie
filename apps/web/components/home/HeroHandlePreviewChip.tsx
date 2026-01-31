'use client';

import { useEffect, useState } from 'react';

interface HeroHandlePreviewChipProps {
  readonly fallbackHandle?: string;
}

export function HeroHandlePreviewChip({
  fallbackHandle = 'yourhandle',
}: HeroHandlePreviewChipProps) {
  const [handle, setHandle] = useState(fallbackHandle);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ handle?: string }>;
      const next = customEvent.detail?.handle?.trim();
      setHandle(next && next.length > 0 ? next : fallbackHandle);
    };

    globalThis.addEventListener(
      'jovie-hero-handle-change',
      listener as EventListener
    );

    return () => {
      globalThis.removeEventListener(
        'jovie-hero-handle-change',
        listener as EventListener
      );
    };
  }, [fallbackHandle]);

  return <>{handle}</>;
}
