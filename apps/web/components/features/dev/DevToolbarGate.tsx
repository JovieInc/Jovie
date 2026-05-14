'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

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

const DEV_TOOLBAR_SUPPRESSED_PATHS = new Set(['/demovideo', '/demo/video']);

function hasDevToolbarCookie(): boolean {
  if (typeof document === 'undefined') return false;

  return document.cookie
    .split(';')
    .some(cookie => cookie.trim().startsWith('__dev_toolbar=1'));
}

function isSuppressedPath(): boolean {
  return (
    typeof window !== 'undefined' &&
    DEV_TOOLBAR_SUPPRESSED_PATHS.has(window.location.pathname)
  );
}

export function DevToolbarGate({
  env,
  sha,
  version,
  disabled = false,
}: DevToolbarGateProps) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (disabled || isSuppressedPath()) {
      document.documentElement.style.setProperty('--dev-toolbar-height', '0px');
      setShouldRender(false);
      return;
    }

    const isProduction =
      process.env.NODE_ENV === 'production' && env === 'production';

    setShouldRender(!isProduction || hasDevToolbarCookie());
  }, [disabled, env]);

  if (disabled || !shouldRender) {
    return null;
  }

  return <DevToolbar env={env} sha={sha} version={version} />;
}
