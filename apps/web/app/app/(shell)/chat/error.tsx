'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function ChatError({ error, reset }: ErrorProps) {
  return <ErrorBoundary error={error} reset={reset} context='Chat' />;
}
