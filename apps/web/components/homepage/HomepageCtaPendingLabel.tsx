'use client';

import { Spinner } from '@jovie/ui/atoms/spinner';
import { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';

/**
 * Link-pending affordance for the homepage front-door CTA.
 *
 * `/start` is force-dynamic (Clerk + flag resolution), so the soft navigation
 * has a visible dead stretch. `useLinkStatus` flips for the duration of that
 * navigation; the label cross-fades to a centered spinner — opacity-only, so
 * the button geometry never shifts. Rendered inside the CTA `Link`; outside a
 * Next link context (unit tests, plain anchors) it degrades to a static label.
 */
export function HomepageCtaPendingLabel({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        className={`inline-flex items-center justify-center gap-1.5 transition-opacity duration-subtle ease-out motion-reduce:transition-none ${pending ? 'opacity-0' : 'opacity-100'}`}
      >
        {children}
      </span>
      <span
        aria-hidden='true'
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-subtle ease-out motion-reduce:transition-none ${pending ? 'opacity-100' : 'opacity-0'}`}
      >
        <Spinner size='sm' tone='primary' label='Opening Jovie' />
      </span>
    </>
  );
}
