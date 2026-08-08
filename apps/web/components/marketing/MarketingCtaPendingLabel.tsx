'use client';

import { Spinner } from '@jovie/ui/atoms/spinner';
import { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';

/**
 * Stable pending affordance for marketing CTAs that navigate to dynamic routes.
 *
 * The label and spinner share the same footprint, so pending navigation changes
 * opacity without changing button geometry. Outside a Next link context it
 * degrades to the static label.
 */
export function MarketingCtaPendingLabel({
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
