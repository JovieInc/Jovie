'use client';

import { Card, CardContent, CardHeader } from '@jovie/ui';
import { CheckCircle2, CircleAlert, Clock, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { BatchIngestForm } from '@/components/admin/BatchIngestForm';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import type { IngestHistoryRow } from '@/lib/admin/ingest-history';
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
          <Card>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='text-sm font-medium text-primary-token'>
                    Single profile ingest
                  </h2>
                  <p className='text-xs text-tertiary-token'>
                    Ingest a creator by URL or Spotify artist name search.
                  </p>
                </div>
                <IngestProfileDropdown onIngestPending={handleIngestComplete} />
              </div>
            </CardHeader>
          </Card>

          {/* Batch ingest */}
          <BatchIngestForm onComplete={handleIngestComplete} />

          {/* Ingest history */}
          <Card>
            <CardHeader className='pb-2'>
              <h2 className='text-sm font-medium text-primary-token'>
                Recent ingest history
              </h2>
              <p className='text-xs text-tertiary-token'>
                Last {history.length} ingest events from the audit log.
              </p>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className='py-6 text-center text-sm text-secondary-token'>
                  No ingest events recorded yet.
                </p>
              ) : (
                <ul className='max-h-[480px] divide-y divide-subtle overflow-y-auto'>
                  {history.map(row => {
                    const config = EVENT_LABELS[row.type] ?? {
                      label: row.type,
                      className: 'text-secondary-token',
                    };
                    return (
                      <li
                        key={row.id}
                        className='flex items-center gap-3 py-2 text-xs'
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
                        <span className='min-w-0 flex-1 truncate text-primary-token'>
                          {row.handle
                            ? `@${row.handle}`
                            : (row.spotifyId ?? '--')}
                        </span>
                        {row.failureReason && (
                          <span
                            className='max-w-[200px] truncate text-error'
                            title={row.failureReason}
                          >
                            {row.failureReason}
                          </span>
                        )}
                        <span className='ml-auto shrink-0 text-tertiary-token'>
                          {formatTimeAgo(row.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </PageShell>
  );
}
