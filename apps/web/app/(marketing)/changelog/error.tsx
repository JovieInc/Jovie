'use client';

import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function ChangelogError({ error, reset }: ErrorProps) {
  return (
    <MarketingContentShell>
      <ErrorBoundary error={error} reset={reset} context='Changelog' />
    </MarketingContentShell>
  );
}
