import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { SetupTaskItem } from '@/components/dashboard/molecules/SetupTaskItem';
import { DashboardOverviewControlsProvider } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardOverviewHeaderToolbarClient } from '@/components/dashboard/organisms/DashboardOverviewHeaderToolbarClient';
import { DashboardOverviewMetricsClient } from '@/components/dashboard/organisms/DashboardOverviewMetricsClient';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import { PROFILE_URL } from '@/constants/app';
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
        primaryAction={{ label: 'Refresh dashboard', href: '/app/dashboard' }}
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
    const base = PROFILE_URL.replace(/\/+$/, '');
    const path = artist.handle.replace(/^\/+/, '');
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
        <div className='space-y-2' data-testid='dashboard-overview'>
          {header}

          <DashboardOverviewMetricsClient
            profileId={artist.id}
            profileUrl={profileUrl}
          />

          <section className='rounded-2xl border-0 bg-transparent'>
            <div className='space-y-2 rounded-2xl bg-surface-1/40 p-3 shadow-none'>
              <div className='flex items-center justify-between gap-2.5'>
                <div className='space-y-0.5'>
                  <p className='text-xs uppercase tracking-[0.18em] text-secondary-token'>
                    Complete your setup
                  </p>
                  <h3 className='text-lg font-semibold text-primary-token'>
                    Finish the essentials
                  </h3>
                  <p className='text-sm text-secondary-token'>
                    {completedCount}/{totalSteps} complete
                  </p>
                </div>
                {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label needed for screen reader accessibility */}
                <p
                  className='sr-only'
                  aria-label={`Setup progress: ${completedCount} of ${totalSteps} steps completed`}
                >
                  {completedCount} of {totalSteps} tasks done
                </p>
              </div>

              <ol className='grid list-none grid-cols-1 gap-2.5 pl-0 md:grid-cols-3'>
                <SetupTaskItem
                  index={1}
                  title='Claim your handle'
                  complete={isHandleClaimed}
                  completeLabel='Handle claimed'
                  incompleteLabel='Secure your unique profile URL'
                  action={
                    <Link
                      href='/app/settings'
                      aria-label='Claim handle'
                      className='rounded-full px-3 text-[13px] font-semibold text-primary-token underline-offset-2 hover:underline'
                    >
                      Claim handle
                    </Link>
                  }
                />

                <SetupTaskItem
                  index={2}
                  title='Add a music link'
                  complete={hasMusicLink}
                  completeLabel='Music link added'
                  incompleteLabel='Connect Spotify, Apple Music, or YouTube'
                  action={
                    <Link
                      href='/app/dashboard/profile'
                      aria-label='Add music link'
                      className='rounded-full px-3 text-[13px] font-semibold text-primary-token underline-offset-2 hover:underline'
                    >
                      Add music link
                    </Link>
                  }
                />

                <SetupTaskItem
                  index={3}
                  title='Add social links'
                  complete={hasSocialLinks}
                  completeLabel='Social links added'
                  incompleteLabel='Connect Instagram, TikTok, Twitter, etc.'
                  action={
                    <Link
                      href='/app/dashboard/profile'
                      aria-label='Add social links'
                      className='rounded-full px-3 text-[13px] font-semibold text-primary-token underline-offset-2 hover:underline'
                    >
                      Add social links
                    </Link>
                  }
                />
              </ol>
            </div>
          </section>
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
