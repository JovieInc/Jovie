'use client';

import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function BlogError({ error, reset }: ErrorProps) {
  return (
    <MarketingContentShell>
      <ErrorBoundary error={error} reset={reset} context='Blog' />
    </MarketingContentShell>
  );
}
