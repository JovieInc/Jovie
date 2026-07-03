'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ShellListRowFrame } from '@/components/organisms/table';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type {
  WhatShippedItem,
  WhatShippedResponse,
} from '@/types/what-shipped';

const WHAT_SHIPPED_QUERY_KEY = ['ops', 'what-shipped'] as const;
const WHAT_SHIPPED_POLL_MS = 60_000;
const WHAT_SHIPPED_GC_MS = WHAT_SHIPPED_POLL_MS * 2;
const SKELETON_ROW_COUNT = 4;
const EMPTY_STATE_MESSAGE = 'Nothing shipped in the last few hours';

async function fetchWhatShipped(
  signal: AbortSignal
): Promise<WhatShippedResponse> {
  const response = await fetch('/api/ops/what-shipped', { signal });
  if (!response.ok) {
    throw new Error(`What shipped fetch failed (${response.status})`);
  }
  return response.json() as Promise<WhatShippedResponse>;
}

function WhatShippedSkeleton() {
  return (
    <div className='grid gap-2' data-testid='what-shipped-skeleton'>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div
          key={index}
          className='h-14 animate-pulse rounded-xl border border-subtle bg-surface-0'
          aria-hidden='true'
        />
      ))}
    </div>
  );
}

function WhatShippedRow({
  item,
}: Readonly<{ readonly item: WhatShippedItem }>) {
  return (
    <ShellListRowFrame className='flex items-start justify-between gap-3 border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0 flex-1'>
        <a
          href={item.url}
          target='_blank'
          rel='noopener noreferrer'
          className='group flex items-start gap-1.5'
        >
          <p className='line-clamp-2 text-app font-semibold text-primary-token transition-colors group-hover:text-accent-blue'>
            {item.title}
          </p>
          <ExternalLink
            className='mt-0.5 h-3 w-3 shrink-0 text-tertiary-token opacity-0 transition-opacity group-hover:opacity-100'
            aria-hidden='true'
          />
        </a>
        <p className='mt-1 text-2xs text-tertiary-token'>#{item.number}</p>
      </div>
      <p className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
        {formatTimeAgo(item.merged_at)}
      </p>
    </ShellListRowFrame>
  );
}

export function WhatShipped() {
  const { data, isLoading, isError } = useQuery<WhatShippedResponse>({
    queryKey: WHAT_SHIPPED_QUERY_KEY,
    queryFn: ({ signal }) => fetchWhatShipped(signal),
    staleTime: WHAT_SHIPPED_POLL_MS,
    gcTime: WHAT_SHIPPED_GC_MS,
    refetchInterval: WHAT_SHIPPED_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
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
        ) : isError ? (
          <p
            className='min-h-14 text-app leading-5 text-secondary-token'
            data-testid='what-shipped-error'
          >
            Could not load the shipping feed.
          </p>
        ) : showEmpty ? (
          <p
            className='min-h-14 text-app leading-5 text-secondary-token'
            data-testid='what-shipped-empty'
          >
            {EMPTY_STATE_MESSAGE}
          </p>
        ) : (
          <div className='grid gap-2' data-testid='what-shipped-list'>
            {items.map(item => (
              <WhatShippedRow key={item.number} item={item} />
            ))}
          </div>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
