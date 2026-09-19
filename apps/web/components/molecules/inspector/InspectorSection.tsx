// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import type { ReactNode } from 'react';
import { DrawerSectionHeading } from '@/components/molecules/drawer/DrawerSectionHeading';
import { cn } from '@/lib/utils';

export interface InspectorSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * Non-collapsible Inspector section. Navigation lives in tabs, not accordions.
 */
export function InspectorSection({
  title,
  children,
  className,
  'data-testid': testId,
}: InspectorSectionProps) {
  return (
    <section data-testid={testId} className={cn('space-y-2', className)}>
      {title ? <DrawerSectionHeading>{title}</DrawerSectionHeading> : null}
      {children}
    </section>
  );
}
