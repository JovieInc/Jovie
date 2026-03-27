'use client';

import { type ComponentType, useEffect, useState } from 'react';

interface EnhancementBundle {
  MarketingScrollUnlock: ComponentType;
  ScrollRevealInit: ComponentType;
}

export function MarketingEnhancements() {
  const [bundle, setBundle] = useState<EnhancementBundle | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadEnhancements = () => {
      void Promise.all([
        import('@/features/home/MarketingScrollUnlock'),
        import('@/features/home/ScrollRevealInit'),
      ]).then(([marketingScrollUnlock, scrollRevealInit]) => {
        if (!active) {
          return;
        }

        setBundle({
          MarketingScrollUnlock: marketingScrollUnlock.MarketingScrollUnlock,
          ScrollRevealInit: scrollRevealInit.ScrollRevealInit,
        });
      });
    };

    if ('requestIdleCallback' in globalThis) {
      const idleId = globalThis.requestIdleCallback(loadEnhancements, {
        timeout: 1500,
      });
      return () => {
        active = false;
        globalThis.cancelIdleCallback(idleId);
      };
    }

    timeoutId = globalThis.setTimeout(loadEnhancements, 200);
    return () => {
      active = false;
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, []);

  if (!bundle) {
    return null;
  }

  const { MarketingScrollUnlock, ScrollRevealInit } = bundle;

  return (
    <>
      <MarketingScrollUnlock />
      <ScrollRevealInit />
    </>
  );
}
