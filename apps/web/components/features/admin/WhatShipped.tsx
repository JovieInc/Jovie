'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ShellListRowFrame } from '@/components/organisms/table';
import type { WhatShippedResponse } from '@/lib/hud/what-shipped';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

const WHAT_SHIPPED_POLL_MS = 60_000;
const WHAT_SHIPPED_QUERY_GC_MS = WHAT_SHIPPED_POLL_MS * 2;
const SKELETON_ROW_KEYS = ['what-shipped-skel-1', 'what-shipped-skel-2'] as const;

const EMPTY_MESSAGE = 'nothing shipped in the last few hours';

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

export function WhatShipped({
  kioskToken = null,
}: Readonly<WhatShippedProps>) {
  const { data, isLoading, isError } = useQuery<WhatShippedResponse>({
    queryKey: ['ops', 'what-shipped', kioskToken],
    queryFn: ({ signal }) => fetchWhatShipped(kioskToken, signal),
    staleTime: WHAT_SHIPPED_POLL_MS,
    gcTime: WHAT_SHIPPED_QUERY_GC_MS,
    refetchInterval: WHAT_SHIPPED_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const items = data?.items ?? [];
  const showEmpty = !isLoading && !isError && items.length === 0;

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
          {!isLoading && items.length > 0 ? (
            <span className='ml-auto text-2xs tabular-nums text-tertiary-token'>
              {items.length}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <WhatShippedSkeleton />
        ) : showEmpty ? (
          <p className='min-h-13 text-app leading-6 text-secondary-token'>
            {EMPTY_MESSAGE}
          </p>
        ) : isError ? (
          <p className='min-h-13 text-app leading-6 text-secondary-token'>
            {EMPTY_MESSAGE}
          </p>
        ) : (
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
        )}
      </div>
    </ContentSurfaceCard>
  );
}