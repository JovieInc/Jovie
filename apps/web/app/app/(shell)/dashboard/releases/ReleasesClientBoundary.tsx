'use client';

import type { ReactNode } from 'react';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';

interface ReleasesClientBoundaryProps {
  readonly children: ReactNode;
}

export function ReleasesClientBoundary({
  children,
}: ReleasesClientBoundaryProps) {
  return <QueryErrorBoundary>{children}</QueryErrorBoundary>;
}
