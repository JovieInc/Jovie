import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardOverviewControlsProvider } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardOverviewHeaderToolbarClient } from '@/components/dashboard/organisms/DashboardOverviewHeaderToolbarClient';
import { DashboardOverviewMetricsClient } from '@/components/dashboard/organisms/DashboardOverviewMetricsClient';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import { PROFILE_URL } from '@/constants/app';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';

interface DashboardOverviewProps {
  artist: Artist | null;
  hasSocialLinks: boolean;
  hasMusicLinks?: boolean;
}

export function DashboardOverview({
  artist,
  hasSocialLinks,
  hasMusicLinks = false,
}: DashboardOverviewProps) {
  if (!artist) {
    return (
      <StarterEmptyState
        title='We could not load your profile'
        description='The dashboard data did not include your Jovie profile. Refresh or reopen onboarding to finish setup.'
        primaryAction={{ label: 'Refresh dashboard', href: '/app' }}
        secondaryAction={{ label: 'Restart onboarding', href: '/onboarding' }}
        testId='dashboard-missing-profile'
      />
    );
  }

  const isHandleClaimed = Boolean(artist.owner_user_id);
  const musicLinkFromProfile = Boolean(
    artist.spotify_url ||
      artist.apple_music_url ||
      artist.youtube_url ||
      // Fallback for camelCase fields in some test fixtures
      (artist as { spotifyUrl?: string }).spotifyUrl ||
      (artist as { appleMusicUrl?: string }).appleMusicUrl ||
      (artist as { youtubeUrl?: string }).youtubeUrl
  );
  const hasMusicLink = hasMusicLinks || musicLinkFromProfile;
  const allTasksComplete = isHandleClaimed && hasMusicLink && hasSocialLinks;
  const totalSteps = 3;
  const completedCount = [isHandleClaimed, hasMusicLink, hasSocialLinks].filter(
    Boolean
  ).length;

  const profileUrl = (() => {
    if (!artist.handle) return undefined;
    const base = trimTrailingSlashes(PROFILE_URL);
    const path = trimLeadingSlashes(artist.handle);
    return `${base}/${path}`;
  })();

  const greetingName = (() => {
    const raw = (artist.name || 'Artist').trim();
    const first = raw.split(/\s+/)[0];
    return first || 'Artist';
  })();

  const header = (
    <header className='flex flex-col gap-0.5 rounded-2xl bg-transparent p-3'>
      <div className='grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-4'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
            <h1 className='text-xl font-semibold text-primary-token'>
              Welcome back, {greetingName}
            </h1>
            <div className='flex items-center gap-1'>
              <Button
                asChild
                variant='secondary'
                size='sm'
                className='h-11 w-11 rounded-full p-0'
              >
                <Link
                  href={`/${artist.handle}`}
                  aria-label='View profile'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Icon
                    name='ArrowUpRight'
                    className='h-5 w-5'
                    aria-hidden='true'
                  />
                  <span className='sr-only'>View profile</span>
                </Link>
              </Button>
              <CopyToClipboardButton
                relativePath={`/${artist.handle}`}
                idleLabel='Copy URL'
                iconName='Copy'
                className='h-11 w-11 rounded-full border border-subtle p-0 bg-transparent text-primary-token hover:bg-surface-2'
              />
            </div>
          </div>
        </div>

        <div className='flex shrink-0 items-center justify-end sm:self-start'>
          <DashboardOverviewHeaderToolbarClient />
        </div>

        <p className='text-sm text-secondary-token sm:col-span-2'>
          Keep your profile polished and ready to share.
        </p>
      </div>
    </header>
  );

  if (!allTasksComplete) {
    return (
      <DashboardOverviewControlsProvider>
        <div
          className='flex min-h-[60vh] items-center justify-center'
          data-testid='dashboard-overview'
        >
          <div className='w-full max-w-sm space-y-5'>
            <div className='space-y-0.5 text-center'>
              <h1 className='text-lg font-normal text-primary-token'>
                Complete your setup
              </h1>
              <p className='text-[13px] text-tertiary-token'>
                {completedCount} of {totalSteps} complete
              </p>
            </div>

            <ul className='space-y-1'>
              <li
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  !isHandleClaimed ? 'hover:bg-surface-1' : ''
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                    isHandleClaimed
                      ? 'bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400'
                      : 'border border-subtle text-tertiary-token'
                  }`}
                >
                  {isHandleClaimed ? '✓' : '1'}
                </span>
                <div className='flex-1 min-w-0'>
                  <p
                    className={`text-[13px] ${
                      isHandleClaimed
                        ? 'text-tertiary-token line-through decoration-tertiary-token/40'
                        : 'text-primary-token'
                    }`}
                  >
                    Claim your handle
                  </p>
                </div>
                {!isHandleClaimed && (
                  <Link
                    href='/app/settings'
                    className='text-[13px] text-accent-token opacity-0 transition-opacity group-hover:opacity-100'
                  >
                    Claim →
                  </Link>
                )}
              </li>

              <li
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  !hasMusicLink ? 'hover:bg-surface-1' : ''
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                    hasMusicLink
                      ? 'bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400'
                      : 'border border-subtle text-tertiary-token'
                  }`}
                >
                  {hasMusicLink ? '✓' : '2'}
                </span>
                <div className='flex-1 min-w-0'>
                  <p
                    className={`text-[13px] ${
                      hasMusicLink
                        ? 'text-tertiary-token line-through decoration-tertiary-token/40'
                        : 'text-primary-token'
                    }`}
                  >
                    Add a music link
                  </p>
                </div>
                {!hasMusicLink && (
                  <Link
                    href='/app/dashboard/profile'
                    className='text-[13px] text-accent-token opacity-0 transition-opacity group-hover:opacity-100'
                  >
                    Add →
                  </Link>
                )}
              </li>

              <li
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  !hasSocialLinks ? 'hover:bg-surface-1' : ''
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                    hasSocialLinks
                      ? 'bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400'
                      : 'border border-subtle text-tertiary-token'
                  }`}
                >
                  {hasSocialLinks ? '✓' : '3'}
                </span>
                <div className='flex-1 min-w-0'>
                  <p
                    className={`text-[13px] ${
                      hasSocialLinks
                        ? 'text-tertiary-token line-through decoration-tertiary-token/40'
                        : 'text-primary-token'
                    }`}
                  >
                    Add social links
                  </p>
                </div>
                {!hasSocialLinks && (
                  <Link
                    href='/app/dashboard/profile'
                    className='text-[13px] text-accent-token opacity-0 transition-opacity group-hover:opacity-100'
                  >
                    Add →
                  </Link>
                )}
              </li>
            </ul>
          </div>
        </div>
      </DashboardOverviewControlsProvider>
    );
  }

  return (
    <DashboardOverviewControlsProvider>
      <div className='space-y-2' data-testid='dashboard-overview'>
        {header}

        <DashboardOverviewMetricsClient
          profileId={artist.id}
          profileUrl={profileUrl}
          showActivity
        />
      </div>
    </DashboardOverviewControlsProvider>
  );
}
