'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function RootError({ error, reset }: ErrorProps) {
  return <ErrorBoundary error={error} reset={reset} context='Root' />;
}
