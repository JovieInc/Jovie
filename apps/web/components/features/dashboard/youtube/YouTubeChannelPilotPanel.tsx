'use client';

import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { EmptyState } from '@/components/molecules/EmptyState';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { PageToolbar } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import type { AuthorizedYouTubeChannelWorkspace } from '@/lib/youtube-library';

export interface YouTubeChannelPilotPanelProps {
  readonly workspace: AuthorizedYouTubeChannelWorkspace;
}

function metric(value: number | null, suffix = ''): string {
  return value === null ? 'Unavailable' : `${value.toLocaleString()}${suffix}`;
}

function isoDate(value: string | null): string {
  if (!value) return 'Awaiting API sync';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function AuthRequiredState({ message }: { readonly message: string | null }) {
  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <EmptyState
        icon={<Icon name='Youtube' className='h-5 w-5' />}
        heading='Founder Authorization Required'
        description={
          message ??
          'Connect the selected profile’s owned YouTube channel. Jovie will not ingest or review a channel until Google OAuth proves ownership.'
        }
        presentation='workspace'
        testId='youtube-channel-auth-required'
        className='min-h-64'
      />
      <div className='border-t border-subtle px-4 py-3 text-center'>
        <Link
          href={APP_ROUTES.SETTINGS_CONNECTORS}
          className='text-xs font-medium text-accent-token hover:underline'
        >
          Open Connector Settings
        </Link>
      </div>
    </ContentSurfaceCard>
  );
}

export function YouTubeChannelPilotPanel({
  workspace,
}: YouTubeChannelPilotPanelProps) {
  const isConnected = workspace.state === 'connected';
  const toolbar = (
    <PageToolbar
      data-testid='youtube-channel-pilot-toolbar'
      start={
        <span className='text-xs text-tertiary-token'>
          {isConnected
            ? `${workspace.videos.length} API-backed video${workspace.videos.length === 1 ? '' : 's'}`
            : 'Authorization required'}
        </span>
      }
      end={
        <Link
          href={APP_ROUTES.DASHBOARD}
          className='text-xs font-medium text-accent-token hover:underline'
        >
          Review Candidates in Inbox
        </Link>
      }
    />
  );

  return (
    <AppShellContentPanel
      frame='content-container'
      contentPadding='compact'
      scroll='page'
      toolbar={toolbar}
      data-testid='youtube-channel-pilot'
    >
      <div className='flex flex-col gap-4'>
        {workspace.state === 'auth-required' ? (
          <AuthRequiredState message={workspace.errorMessage} />
        ) : workspace.state === 'ambiguous-channel' ? (
          <ContentSurfaceCard className='border-accent-red/30 p-4'>
            <h2 className='text-app font-semibold text-primary-token'>
              Channel Ownership Is Ambiguous
            </h2>
            <p className='mt-1 text-xs text-secondary-token'>
              {workspace.errorMessage}
            </p>
          </ContentSurfaceCard>
        ) : (
          <>
            <ContentSurfaceCard className='p-4'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <p className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
                    Authorized Channel
                  </p>
                  <h1 className='mt-1 font-mono text-app text-primary-token'>
                    {workspace.authorizedChannelId}
                  </h1>
                  <p className='mt-1 text-xs text-secondary-token'>
                    Last connector sync {isoDate(workspace.lastSyncAt)} ·{' '}
                    {workspace.videos.length} represented
                  </p>
                </div>
                <span className='rounded-full border border-subtle bg-surface-0 px-2.5 py-1 text-2xs font-medium text-secondary-token'>
                  Publication blocked pending Studio experiment + readback
                </span>
              </div>
            </ContentSurfaceCard>

            {workspace.videos.length === 0 ? (
              <ContentSurfaceCard className='overflow-hidden p-0'>
                <EmptyState
                  heading='Authorized Channel Is Waiting for Its First Sync'
                  description='No local videos are shown because Jovie has not yet received a complete API-backed uploads ledger for this channel.'
                  testId='youtube-channel-awaiting-sync'
                  className='min-h-48'
                />
              </ContentSurfaceCard>
            ) : (
              <section aria-labelledby='youtube-channel-ledger-heading'>
                <div className='mb-2 flex items-end justify-between gap-3'>
                  <div>
                    <h2
                      id='youtube-channel-ledger-heading'
                      className='text-app font-semibold text-primary-token'
                    >
                      Channel Ledger
                    </h2>
                    <p className='text-xs text-tertiary-token'>
                      Lifetime metrics from the YouTube Analytics API. Studio
                      thumbnail impressions and CTR remain unavailable by API.
                    </p>
                  </div>
                </div>
                <div className='space-y-2'>
                  {workspace.videos.map(video => (
                    <ContentSurfaceCard key={video.id} className='p-3'>
                      <div className='flex flex-col items-start gap-3 sm:flex-row'>
                        {video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.thumbnailUrl}
                            alt=''
                            aria-hidden='true'
                            className='aspect-video w-full shrink-0 rounded-md bg-surface-0 object-cover sm:w-36'
                          />
                        ) : (
                          <div className='flex h-20 w-full shrink-0 items-center justify-center rounded-md bg-surface-0 sm:aspect-video sm:h-auto sm:w-36'>
                            <Icon
                              name='Film'
                              className='h-5 w-5 text-tertiary-token'
                            />
                          </div>
                        )}
                        <div className='min-w-0 w-full flex-1'>
                          <div className='flex flex-wrap items-start justify-between gap-2'>
                            <div className='min-w-0'>
                              <a
                                href={video.url}
                                target='_blank'
                                rel='noreferrer'
                                className='line-clamp-2 text-app font-medium text-primary-token hover:underline'
                              >
                                {video.title}
                              </a>
                              <p className='mt-0.5 font-mono text-2xs text-quaternary-token'>
                                {video.videoId} ·{' '}
                                {video.privacyStatus ?? 'status unavailable'}
                              </p>
                            </div>
                            <span className='text-2xs text-tertiary-token'>
                              {isoDate(video.publishedAt)}
                            </span>
                          </div>
                          <dl className='mt-3 grid grid-cols-3 gap-2 text-xs'>
                            <div>
                              <dt className='text-tertiary-token'>Views</dt>
                              <dd className='font-medium tabular-nums text-primary-token'>
                                {metric(video.apiMetrics?.views ?? null)}
                              </dd>
                            </div>
                            <div>
                              <dt className='text-tertiary-token'>
                                Watch time
                              </dt>
                              <dd className='font-medium tabular-nums text-primary-token'>
                                {metric(
                                  video.apiMetrics?.watchTimeMinutes ?? null,
                                  ' min'
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className='text-tertiary-token'>Avg. view</dt>
                              <dd className='font-medium tabular-nums text-primary-token'>
                                {metric(
                                  video.apiMetrics?.avgViewDurationSeconds ??
                                    null,
                                  ' sec'
                                )}
                              </dd>
                            </div>
                          </dl>
                          <p className='mt-2 text-2xs text-quaternary-token'>
                            {video.apiMetrics
                              ? `API captured ${isoDate(video.apiMetrics.capturedAt)}`
                              : 'API snapshot pending — no performance values inferred'}
                          </p>
                        </div>
                      </div>
                    </ContentSurfaceCard>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShellContentPanel>
  );
}
