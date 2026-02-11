'use client';

import { useVersionUpdateToast } from '@/lib/hooks/useVersionUpdateToast';

/** Activates version-update toast monitoring. Renders nothing. */
export function VersionUpdateToastActivator() {
  useVersionUpdateToast();
  return null;
}
