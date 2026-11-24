'use client';

import { type ComponentType, useEffect, useState } from 'react';

interface EnhancementBundle {
  MarketingScrollUnlock: ComponentType;
}

/**
 * Idle-loads marketing scroll unlock only. Scroll reveals are CSS-only
 * (`animation-timeline: view()` in globals.css); unsupported browsers keep
 * content visible with no JS observer (JOV-14244).
 */
export function MarketingEnhancements() {
  const [bundle, setBundle] = useState<EnhancementBundle | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadEnhancements = () => {
      void import('@/features/home/MarketingScrollUnlock').then(
        marketingScrollUnlock => {
          if (!active) {
            return;
          }

          setBundle({
            MarketingScrollUnlock: marketingScrollUnlock.MarketingScrollUnlock,
          });
        }
      );
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

  const { MarketingScrollUnlock } = bundle;

  return <MarketingScrollUnlock />;
}
