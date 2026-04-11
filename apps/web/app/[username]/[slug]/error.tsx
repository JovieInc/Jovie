'use client';

import { PublicPageErrorFallback } from '@/components/providers/PublicPageErrorFallback';
import type { ErrorProps } from '@/types/common';

export default function SmartLinkError({ error, reset }: ErrorProps) {
  return (
    <PublicPageErrorFallback
      error={error}
      context='Content'
      onRefresh={reset}
    />
  );
}
