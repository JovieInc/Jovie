'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';

/** A failed read has no usable value; retry only re-reads the current route. */
export function AdminReadUnavailable({
  message,
}: {
  readonly message: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role='status' aria-live='polite' aria-busy={pending}>
      <HudObservationStatus
        state='unavailable'
        message={pending ? 'Reading current data…' : message}
        onRetry={() => {
          if (!pending) startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}
