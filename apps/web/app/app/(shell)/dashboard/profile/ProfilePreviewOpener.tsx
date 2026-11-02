'use client';

import { useEffect } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Auto-opens the desktop companion while keeping the mobile editor available.
 * Crossing into mobile closes the companion before explicit modal disclosure.
 * Renders nothing — just triggers the side effect.
 */
export function ProfilePreviewOpener() {
  const { open, close } = usePreviewPanelState();
  const isDesktop = useBreakpoint('lg');

  useEffect(() => {
    const queryList =
      typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(min-width: 1024px)')
        : null;
    // The breakpoint hook's server snapshot is false through hydration.
    // Reading the live viewport here keeps a desktop history return from
    // closing the rail after the provider has opened it.
    const desktop = queryList ? queryList.matches : isDesktop;
    if (desktop) open();
    else close();

    if (
      queryList === null ||
      typeof queryList.addEventListener !== 'function'
    ) {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) open();
      else close();
    };
    queryList.addEventListener('change', onChange);
    return () => queryList.removeEventListener('change', onChange);
  }, [isDesktop, open, close]);

  return null;
}
