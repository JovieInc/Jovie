'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/feedback/Banner';
import {
  isOpenInAppDismissed,
  OPEN_IN_APP_TIMEOUT_MS,
  type OpenInAppTarget,
  persistOpenInAppDismissal,
  resolveOpenInAppEligibility,
} from '@/lib/mobile/open-in-app';

type BannerState = 'hidden' | 'ready' | 'unavailable';

function isStandaloneDisplay(): boolean {
  if (globalThis.matchMedia?.('(display-mode: standalone)').matches) {
    return true;
  }
  // iOS Safari home-screen launches set navigator.standalone.
  return (
    (globalThis.navigator as { standalone?: boolean } | undefined)
      ?.standalone === true
  );
}

/**
 * Compact "Open in Jovie" prompt for eligible mobile-web `/app/*` routes.
 *
 * Renders only on iOS/Android mobile web (never inside the app's WKWebView
 * or an installed PWA), fires the verified `ie.jov.jovie://` deep link, and
 * when the app does not take focus leaves the visitor on the current page —
 * no redirect loop, no dead end. Dismissal persists for 7 days.
 */
export function OpenInAppBanner() {
  const pathname = usePathname();
  const [state, setState] = useState<BannerState>('hidden');
  const targetRef = useRef<OpenInAppTarget | null>(null);
  const attemptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const eligibility = resolveOpenInAppEligibility({
      userAgent: globalThis.navigator?.userAgent,
      pathname,
      isStandaloneDisplay: isStandaloneDisplay(),
    });
    if (!eligibility || isOpenInAppDismissed(globalThis.localStorage)) {
      return;
    }

    targetRef.current = eligibility.target;
    setState('ready');
  }, [pathname]);

  useEffect(
    () => () => {
      if (attemptTimerRef.current) clearTimeout(attemptTimerRef.current);
    },
    []
  );

  const handleDismiss = useCallback(() => {
    persistOpenInAppDismissal(globalThis.localStorage);
    setState('hidden');
  }, []);

  const handleOpen = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;

    let appOpened = false;
    const onVisibilityChange = () => {
      if (document.hidden) appOpened = true;
    };
    const onBlur = () => {
      appOpened = true;
    };
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      globalThis.removeEventListener('blur', onBlur);
      if (attemptTimerRef.current) {
        clearTimeout(attemptTimerRef.current);
        attemptTimerRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    globalThis.addEventListener('blur', onBlur);

    attemptTimerRef.current = setTimeout(() => {
      cleanup();
      // Deep link could not reach the app: stay on the current web page.
      if (!appOpened) setState('unavailable');
    }, OPEN_IN_APP_TIMEOUT_MS);

    try {
      // Custom scheme: Safari will not follow a universal link that points
      // at the domain the user is already browsing, and an unhandled scheme
      // URL is ignored by the app rather than looping back to the web.
      globalThis.location.assign(target.schemeUrl);
    } catch {
      cleanup();
      setState('unavailable');
    }
  }, []);

  if (state === 'hidden') return null;

  return (
    <div
      data-testid='open-in-app-banner'
      data-state={state}
      className='pointer-events-none fixed inset-x-3 z-40 lg:hidden'
      style={{ top: 'max(env(safe-area-inset-top), 8px)' }}
    >
      <div className='pointer-events-auto mx-auto max-w-md'>
        {state === 'ready' ? (
          <Banner
            variant='info'
            title='Open in Jovie'
            description='Continue in the app for the full experience.'
            action={{ label: 'Open', onClick: handleOpen }}
            onDismiss={handleDismiss}
            testId='open-in-app-banner-card'
          />
        ) : (
          <Banner
            variant='info'
            title='Continue on the web'
            description='The Jovie app is not installed on this device.'
            onDismiss={handleDismiss}
            testId='open-in-app-banner-card'
          />
        )}
      </div>
    </div>
  );
}
