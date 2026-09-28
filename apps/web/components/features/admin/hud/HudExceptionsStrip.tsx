'use client';

// @coverage-via apps/web/tests/unit/app/ops-cockpit.test.tsx

import { CircleAlert } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { deriveOpsExceptions } from '@/lib/hud/cockpit';
import type { HudMetrics } from '@/types/hud';

/**
 * Exceptions-only health strip. Internal subsystem detail (env state,
 * dispatch, diagnostics, agent run plumbing) stays off the founder screen;
 * what remains is what requires founder awareness.
 */
export function HudExceptionsStrip({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  const exceptions = deriveOpsExceptions(metrics);

  return (
    <ContentSurfaceCard
      surface='details'
      data-testid='hud-exceptions'
      className='overflow-hidden'
    >
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 p-3'>
        <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
          Needs attention
        </p>
        {exceptions.length === 0 ? (
          <p className='text-xs text-secondary-token'>
            No exceptions — systems nominal.
          </p>
        ) : (
          exceptions.map(exception => (
            <span
              key={exception.id}
              className='inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-3 py-1 text-2xs font-medium text-primary-token'
              title={exception.detail ?? undefined}
            >
              <CircleAlert className='h-3 w-3 text-error' aria-hidden='true' />
              {exception.label}
            </span>
          ))
        )}
      </div>
    </ContentSurfaceCard>
  );
}
