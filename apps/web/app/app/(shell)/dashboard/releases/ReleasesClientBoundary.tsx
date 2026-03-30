'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePendingShell } from '@/components/organisms/AuthShellWrapper';
import { QueryErrorBoundary } from '@/lib/queries';

interface ReleasesClientBoundaryProps {
  readonly children: ReactNode;
}

export function ReleasesClientBoundary({
  children,
}: ReleasesClientBoundaryProps) {
  const { clearPendingShell } = usePendingShell();

  useEffect(() => {
    clearPendingShell('releases');
  }, [clearPendingShell]);

  return <QueryErrorBoundary>{children}</QueryErrorBoundary>;
}
