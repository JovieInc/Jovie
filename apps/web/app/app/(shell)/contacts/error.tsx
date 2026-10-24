'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

/**
 * Route-level error boundary for /app/contacts (JOV-8791). The /app/audience
 * redirect lands here, so a failed segment render must show the standard
 * error UI with a retry action instead of a blank page.
 */
export default function ContactsError({ error, reset }: ErrorProps) {
  return <ErrorBoundary error={error} reset={reset} context='Contacts' />;
}
