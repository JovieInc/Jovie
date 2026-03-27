'use client';

import { useEffect, useState } from 'react';
import { HeroPhoneStaticPreview } from './HeroPhoneStaticPreview';

function shouldRenderDesktopPreview() {
  return globalThis.matchMedia('(min-width: 1024px)').matches;
}

export function HeroDesktopPreviewMount() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (!shouldRenderDesktopPreview()) {
      return;
    }

    const loadPreview = () => {
      setShouldRender(true);
    };

    if ('requestIdleCallback' in globalThis) {
      const idleId = globalThis.requestIdleCallback(loadPreview, {
        timeout: 250,
      });

      return () => {
        globalThis.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(loadPreview, 120);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  if (!shouldRender) {
    return <div aria-hidden='true' className='h-[592px] w-[282px]' />;
  }

  return <HeroPhoneStaticPreview />;
}
