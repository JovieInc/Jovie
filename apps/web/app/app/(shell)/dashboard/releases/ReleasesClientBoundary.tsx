'use client';

import type { ReactNode } from 'react';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';

export function ReleasesClientBoundary({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <QueryErrorBoundary>{children}</QueryErrorBoundary>;
}
