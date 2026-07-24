'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  isDemoRecordingClient,
  isDevChromeDisabledClient,
} from '@/lib/demo-recording';

const DevToolbar = dynamic(
  () =>
    import('@/components/features/dev/DevToolbar').then(mod => mod.DevToolbar),
  { ssr: false }
);

interface DevToolbarGateProps {
  readonly env: string;
  readonly sha: string;
  readonly version: string;
  readonly disabled?: boolean;
}

const DEV_TOOLBAR_SUPPRESSED_PATHS = new Set([
  '/demovideo',
  '/demo',
  '/demo/video',
  '/start',
  '/onboarding',
]);
const DEV_TOOLBAR_SUPPRESSED_PREFIXES = [
  '/demo/',
  '/onboarding/',
  '/app/onboarding',
];

/** Zero the layout CSS var so customer metrics never include toolbar chrome. */
export function resetDevToolbarHeight(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
}

function hasDevToolbarCookie(): boolean {
  if (typeof document === 'undefined') return false;

  return document.cookie
    .split(';')
    .some(cookie => cookie.trim().startsWith('__dev_toolbar=1'));
}

export function isDevToolbarSuppressedPath(pathname: string): boolean {
  return (
    DEV_TOOLBAR_SUPPRESSED_PATHS.has(pathname) ||
    DEV_TOOLBAR_SUPPRESSED_PREFIXES.some(prefix => pathname.startsWith(prefix))
  );
}

/**
 * Production customer sessions never show the toolbar unless an explicit
 * `__dev_toolbar=1` cookie opt-in is present (emergency prod debugging).
 */
export function shouldRenderDevToolbar({
  env,
  disabled = false,
  pathname,
  hasCookie = false,
  isDemoRecording = false,
  isDevChromeDisabled = false,
  isElectron = false,
  nodeEnv = process.env.NODE_ENV,
}: {
  readonly env: string;
  readonly disabled?: boolean;
  readonly pathname: string;
  readonly hasCookie?: boolean;
  readonly isDemoRecording?: boolean;
  readonly isDevChromeDisabled?: boolean;
  readonly isElectron?: boolean;
  readonly nodeEnv?: string | undefined;
}): boolean {
  if (disabled) return false;
  if (isDemoRecording || isDevChromeDisabled || isElectron) return false;
  if (isDevToolbarSuppressedPath(pathname)) return false;

  const isProduction = nodeEnv === 'production' && env === 'production';
  if (isProduction) return hasCookie;

  return true;
}

export function DevToolbarGate({
  env,
  sha,
  version,
  disabled = false,
}: DevToolbarGateProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const hideToolbar = () => {
      resetDevToolbarHeight();
      setShouldRender(false);
    };

    const syncToolbarVisibility = () => {
      if (cancelled) return;

      const nextShouldRender = shouldRenderDevToolbar({
        env,
        disabled,
        pathname,
        hasCookie: hasDevToolbarCookie(),
        isDemoRecording: isDemoRecordingClient(),
        isDevChromeDisabled: isDevChromeDisabledClient(),
        isElectron:
          document.documentElement.dataset.desktopRuntime === 'electron',
      });

      if (!nextShouldRender) {
        // Always zero height when hidden so layout metrics and sticky docks
        // never reserve space for admin/persona chrome on customer surfaces.
        hideToolbar();
        return;
      }

      setShouldRender(true);
    };

    // Fail closed on first paint: zero height until we confirm render.
    resetDevToolbarHeight();
    syncToolbarVisibility();

    const animationFrame = globalThis.requestAnimationFrame?.(
      syncToolbarVisibility
    );
    const handleDomReady = () => syncToolbarVisibility();
    document.addEventListener('DOMContentLoaded', handleDomReady);

    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(syncToolbarVisibility);
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-demo-recording',
        'data-desktop-runtime',
        'data-dev-chrome-disabled',
      ],
    });

    return () => {
      cancelled = true;
      if (animationFrame !== undefined) {
        globalThis.cancelAnimationFrame?.(animationFrame);
      }
      document.removeEventListener('DOMContentLoaded', handleDomReady);
      observer?.disconnect();
      // Leaving a gated surface must not leave residual height for metrics.
      resetDevToolbarHeight();
    };
  }, [disabled, env, pathname]);

  if (disabled || !shouldRender) {
    return null;
  }

  return <DevToolbar env={env} sha={sha} version={version} />;
}
