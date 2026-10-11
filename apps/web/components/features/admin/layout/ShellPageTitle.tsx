'use client';

import { useEffect } from 'react';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';

/** Replaces the shell breadcrumb title without adding route-level page chrome. */
export function ShellPageTitle({ title }: { readonly title: string }) {
  const { setHeaderBadge } = useSetHeaderActions();

  useEffect(() => {
    setHeaderBadge(title);
    return () => setHeaderBadge(null);
  }, [setHeaderBadge, title]);

  return null;
}
