'use client';

import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { usePendingShell } from '@/components/organisms/PendingShellContext';

interface ReleasesClientBoundaryProps {
  readonly children: ReactNode;
}

export function ReleasesClientBoundary({
  children,
}: ReleasesClientBoundaryProps) {
  const { clearPendingShell } = usePendingShell();

  useLayoutEffect(() => {
    clearPendingShell('releases');
  }, [clearPendingShell]);

  return <>{children}</>;
}
