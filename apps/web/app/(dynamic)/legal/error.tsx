'use client';

import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function LegalError({ error, reset }: ErrorProps) {
  return (
    <MarketingContentShell>
      <ErrorBoundary
        error={error}
        reset={reset}
        context='Legal'
        message='If this persists, contact support@jov.ie.'
      />
    </MarketingContentShell>
  );
}
