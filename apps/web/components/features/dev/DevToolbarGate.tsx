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
]);
const DEV_TOOLBAR_SUPPRESSED_PREFIXES = ['/demo/'];

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

function isSuppressedClientContext(pathname: string): boolean {
  return (
    isDemoRecordingClient() ||
    isDevChromeDisabledClient() ||
    isDevToolbarSuppressedPath(pathname)
  );
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
      document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
      setShouldRender(false);
    };

    const syncToolbarVisibility = () => {
      if (cancelled) return;

      if (disabled || isSuppressedClientContext(pathname)) {
        hideToolbar();
        return;
      }

      const isProduction =
        process.env.NODE_ENV === 'production' && env === 'production';

      setShouldRender(!isProduction || hasDevToolbarCookie());
    };

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
      attributeFilter: ['data-demo-recording', 'data-dev-chrome-disabled'],
    });

    return () => {
      cancelled = true;
      if (animationFrame !== undefined) {
        globalThis.cancelAnimationFrame?.(animationFrame);
      }
      document.removeEventListener('DOMContentLoaded', handleDomReady);
      observer?.disconnect();
    };
  }, [disabled, env, pathname]);

  if (disabled || !shouldRender) {
    return null;
  }

  return <DevToolbar env={env} sha={sha} version={version} />;
}
