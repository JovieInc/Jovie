'use client';

import { useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useTransition } from 'react';
import { FounderFunnelBand } from '@/components/features/admin/hud/FounderFunnelBand';
import type { FounderFunnelData } from '@/lib/admin/types';
import { founderFunnelRangeParser } from '@/lib/nuqs';

// Keep URL navigation in the Growth entry point, outside the HUD's client graph.
export function GrowthFounderFunnel({
  initialFunnel,
  urlSearchParams,
}: {
  readonly initialFunnel: FounderFunnelData;
  readonly urlSearchParams: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, setRange] = useQueryState(
    'funnelRange',
    founderFunnelRangeParser.withOptions({
      shallow: false,
      clearOnDefault: false,
      history: 'push',
      scroll: false,
      startTransition,
    })
  );
  return (
    <FounderFunnelBand
      initialFunnel={initialFunnel}
      growth={{
        pending,
        urlSearchParams,
        onChange: range => {
          void setRange(range);
        },
        onRetry: () => startTransition(() => router.refresh()),
      }}
    />
  );
}
