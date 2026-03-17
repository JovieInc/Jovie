'use client';

import {
  CheckCircle2,
  CircleAlert,
  Clock,
  History,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { EmptyState } from '@/components/organisms/EmptyState';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { BatchIngestForm } from '@/features/admin/BatchIngestForm';
import type { IngestHistoryRow } from '@/features/admin/ingest-history.types';
import { IngestProfileDropdown } from '@/features/admin/ingest-profile-dropdown';
import { cn } from '@/lib/utils';

interface AdminIngestPageClientProps {
  readonly history: IngestHistoryRow[];
}

const EVENT_LABELS: Record<string, { label: string; className: string }> = {
  ARTIST_CLAIM_SUCCESS: { label: 'Created', className: 'text-success' },
  ARTIST_CLAIM_FAILED: { label: 'Failed', className: 'text-error' },
  ARTIST_CLAIM_ATTEMPT: {
    label: 'Attempted',
    className: 'text-secondary-token',
  },
  ARTIST_DATA_REFRESH: { label: 'Refreshed', className: 'text-info' },
  ARTIST_DATA_REFRESH_FAILED: {
    label: 'Refresh failed',
    className: 'text-error',
  },
};

function EventIcon({ type }: { readonly type: string }) {
  switch (type) {
    case 'ARTIST_CLAIM_SUCCESS':
      return <CheckCircle2 className='size-3.5 text-success' />;
    case 'ARTIST_CLAIM_FAILED':
    case 'ARTIST_DATA_REFRESH_FAILED':
      return <CircleAlert className='size-3.5 text-error' />;
    case 'ARTIST_DATA_REFRESH':
      return <RefreshCw className='size-3.5 text-info' />;
    default:
      return <Clock className='size-3.5 text-secondary-token' />;
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(date).toLocaleDateString();
}

export function AdminIngestPageClient({ history }: AdminIngestPageClientProps) {
  const router = useRouter();

  const handleIngestComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6'>
          {/* Single profile ingest */}
          <ContentSurfaceCard>
            <ContentSectionHeader
              title='Single profile ingest'
              subtitle='Ingest a creator by URL or Spotify artist name search.'
              actions={
                <IngestProfileDropdown onIngestPending={handleIngestComplete} />
              }
              className='min-h-0 px-4 py-3'
              actionsClassName='shrink-0'
            />
          </ContentSurfaceCard>

          {/* Batch ingest */}
          <BatchIngestForm onComplete={handleIngestComplete} />

          {/* Ingest history */}
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeader
              title='Recent ingest history'
              subtitle={`Last ${history.length} ingest events from the audit log.`}
              className='min-h-0 px-4 py-3'
            />
            <div className='px-4 py-3'>
              {history.length === 0 ? (
                <EmptyState
                  icon={<History className='size-5' />}
                  heading='No ingest events yet'
                  description='Single profile imports and batch ingest runs will appear here.'
                  className='py-8'
                />
              ) : (
                <ul className='max-h-[480px] divide-y divide-(--linear-border-subtle) overflow-y-auto'>
                  {history.map(row => {
                    const config = EVENT_LABELS[row.type] ?? {
                      label: row.type,
                      className: 'text-secondary-token',
                    };
                    return (
                      <li
                        key={row.id}
                        className='grid grid-cols-[auto,minmax(0,1fr),auto] items-start gap-2 py-2 text-xs sm:flex sm:items-center sm:gap-3'
                      >
                        <EventIcon type={row.type} />
                        <span
                          className={cn(
                            'min-w-[80px] font-medium',
                            config.className
                          )}
                        >
                          {config.label}
                        </span>
                        <span className='col-span-2 min-w-0 truncate text-primary-token sm:col-auto sm:flex-1'>
                          {row.handle
                            ? `@${row.handle}`
                            : (row.spotifyId ?? '--')}
                        </span>
                        {row.failureReason && (
                          <span
                            className='col-span-3 text-wrap break-words text-error sm:col-auto sm:max-w-[200px] sm:truncate'
                            title={row.failureReason}
                          >
                            {row.failureReason}
                          </span>
                        )}
                        <span className='col-start-3 row-start-1 shrink-0 text-right text-tertiary-token sm:ml-auto'>
                          {formatTimeAgo(row.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </ContentSurfaceCard>
        </div>
      </PageContent>
    </PageShell>
  );
}
