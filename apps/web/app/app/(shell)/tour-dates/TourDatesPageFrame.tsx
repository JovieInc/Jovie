import type { ReactNode } from 'react';
import { PageShell } from '@/components/organisms/PageShell';

/**
 * The Tour Dates page frame, shared by the loaded page and its first-boot
 * skeleton so the two can never drift apart.
 */
export function TourDatesPageFrame({
  children,
  testId,
}: {
  readonly children: ReactNode;
  readonly testId: string;
}) {
  return (
    <PageShell
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      data-testid={testId}
      contentClassName='min-h-0'
    >
      {children}
    </PageShell>
  );
}
