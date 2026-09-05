'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/WhatShipped.test.tsx

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ShellListRowFrame } from '@/components/organisms/table';
import type { HudObservationState } from '@/lib/hud/observation';
import type { WhatShippedResponse } from '@/lib/hud/what-shipped';
import { WHAT_SHIPPED_POLL_MS } from '@/lib/hud/what-shipped-policy';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

const WHAT_SHIPPED_QUERY_GC_MS = WHAT_SHIPPED_POLL_MS * 2;
const SKELETON_ROW_KEYS = [
  'what-shipped-skel-1',
  'what-shipped-skel-2',
] as const;

const EMPTY_MESSAGE = 'Nothing shipped in the last few hours.';

async function fetchWhatShipped(
  kioskToken: string | null,
  signal: AbortSignal
): Promise<WhatShippedResponse> {
  const url = new URL('/api/ops/what-shipped', globalThis.location.origin);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`What shipped fetch failed (${response.status})`);
  }

  return response.json() as Promise<WhatShippedResponse>;
}

interface WhatShippedRowProps {
  readonly title: string;
  readonly number: number;
  readonly mergedAt: string;
  readonly url: string;
}

function WhatShippedRow({
  title,
  number,
  mergedAt,
  url,
}: Readonly<WhatShippedRowProps>) {
  return (
    <ShellListRowFrame className='flex items-center gap-3 border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0 flex-1'>
        <a
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          className='group flex items-center gap-1.5'
        >
          <p className='truncate text-app font-medium text-primary-token transition-colors group-hover:text-accent'>
            {title}
          </p>
          <ExternalLink
            className='h-3 w-3 shrink-0 text-tertiary-token opacity-0 transition-opacity group-hover:opacity-100'
            aria-hidden='true'
          />
        </a>
      </div>
      <span className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
        #{number}
      </span>
      <span className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
        {formatTimeAgo(mergedAt)}
      </span>
    </ShellListRowFrame>
  );
}

function WhatShippedSkeleton() {
  return (
    <div className='grid gap-2' aria-hidden='true'>
      {SKELETON_ROW_KEYS.map(key => (
        <div
          key={key}
          className='h-13 animate-pulse rounded-xl border border-subtle bg-surface-0'
        />
      ))}
    </div>
  );
}

export interface WhatShippedProps {
  readonly kioskToken?: string | null;
}

export function WhatShipped({ kioskToken = null }: Readonly<WhatShippedProps>) {
  const { data, isLoading, isError, refetch } = useQuery<WhatShippedResponse>({
    queryKey: ['ops', 'what-shipped', kioskToken],
    queryFn: ({ signal }) => fetchWhatShipped(kioskToken, signal),
    staleTime: WHAT_SHIPPED_POLL_MS,
    gcTime: WHAT_SHIPPED_QUERY_GC_MS,
    refetchInterval: WHAT_SHIPPED_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const items = data?.items ?? [];
  const observation = resolveWhatShippedObservation({
    isLoading,
    isError,
    data,
  });
  const showRows = items.length > 0;

  return (
    <ContentSurfaceCard
      surface='details'
      className='p-3'
      data-testid='what-shipped-card'
    >
      <div className='space-y-2.5'>
        <div className='flex items-center gap-2'>
          <p className='text-xs font-caption text-tertiary-token'>
            What Shipped
          </p>
          {showRows ? (
            <span className='ml-auto text-2xs tabular-nums text-tertiary-token'>
              {items.length}
            </span>
          ) : null}
        </div>

        {observation === 'loading' ? (
          <WhatShippedSkeleton />
        ) : showRows ? (
          <div className='grid gap-2'>
            {items.map(item => (
              <WhatShippedRow
                key={item.number}
                title={item.title}
                number={item.number}
                mergedAt={item.merged_at}
                url={item.url}
              />
            ))}
          </div>
        ) : (
          <HudObservationStatus
            state={observation}
            message={whatShippedMessage(observation, data)}
            freshnessLabel={
              data?.generatedAt
                ? `Updated ${formatTimeAgo(data.generatedAt)}`
                : null
            }
            onRetry={
              observation === 'unavailable' || observation === 'stale'
                ? () => {
                    refetch().catch(() => {});
                  }
                : undefined
            }
            testId='what-shipped-observation'
          />
        )}
        {showRows && observation === 'unavailable' ? (
          <HudObservationStatus
            state='unavailable'
            message='Showing last known shipped PRs.'
            onRetry={() => {
              refetch().catch(() => {});
            }}
            testId='what-shipped-last-known'
          />
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

function resolveWhatShippedObservation({
  isLoading,
  isError,
  data,
}: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly data: WhatShippedResponse | undefined;
}): HudObservationState {
  if (isLoading && !data) return 'loading';
  if (isError && !data) return 'unavailable';
  if (data?.observation === 'not_configured') return 'not_configured';
  if (isError || data?.observation === 'unavailable') return 'unavailable';
  if ((data?.items.length ?? 0) === 0) return 'empty';
  return 'fresh';
}

function whatShippedMessage(
  observation: HudObservationState,
  data: WhatShippedResponse | undefined
): string {
  if (observation === 'not_configured') {
    return (
      data?.errorMessage ??
      'What shipped is not configured. Add HUD GitHub credentials or the local sidecar cache.'
    );
  }
  if (observation === 'unavailable') {
    return data?.errorMessage ?? 'What shipped is unavailable.';
  }
  if (observation === 'empty') {
    return EMPTY_MESSAGE;
  }
  return '';
}
