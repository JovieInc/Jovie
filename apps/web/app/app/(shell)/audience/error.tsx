'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function AudienceError({ error, reset }: ErrorProps) {
  return <ErrorBoundary error={error} reset={reset} context='Audience' />;
}
