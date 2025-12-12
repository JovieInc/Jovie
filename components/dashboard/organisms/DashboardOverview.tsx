import { Button } from '@jovie/ui';
import Link from 'next/link';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardRefreshButton } from '@/components/dashboard/atoms/DashboardRefreshButton';
import { AnalyticsCards } from '@/components/dashboard/molecules/AnalyticsCards';
import { CompletionBanner } from '@/components/dashboard/molecules/CompletionBanner';
import { SetupTaskItem } from '@/components/dashboard/molecules/SetupTaskItem';
import { DashboardActivityFeed } from '@/components/dashboard/organisms/DashboardActivityFeed';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import { APP_URL } from '@/constants/app';
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
    const base = APP_URL.replace(/\/+$/, '');
    const path = artist.handle.replace(/^\/+/, '');
    return `${base}/${path}`;
  })();

  const header = (
    <header className='flex flex-col gap-1.5 rounded-2xl bg-transparent p-1 md:flex-row md:items-center md:justify-between'>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold text-primary-token'>
          Welcome back, {artist.name || 'Artist'}
        </h1>
        <p className='text-sm text-secondary-token'>
          Keep your profile polished and ready to share.
        </p>
      </div>
      <div className='flex flex-wrap gap-2'>
        <DashboardRefreshButton ariaLabel='Refresh dashboard' />
        <Button
          asChild
          variant='secondary'
          size='sm'
          className='rounded-full px-3 text-[13px] font-semibold'
        >
          <Link
            href={`/${artist.handle}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            View profile
          </Link>
        </Button>
        <CopyToClipboardButton
          relativePath={`/${artist.handle}`}
          idleLabel='Copy URL'
          className='rounded-full border border-subtle px-3 text-[13px] font-semibold bg-transparent text-primary-token hover:bg-surface-2'
        />
      </div>
    </header>
  );

  if (!allTasksComplete) {
    return (
      <div className='space-y-5'>
        {header}

        <section className='rounded-2xl bg-surface-1/40 p-4 shadow-none'>
          <AnalyticsCards profileUrl={profileUrl} />
        </section>

        <section className='rounded-2xl border-0 bg-transparent p-1'>
          <div className='space-y-2 rounded-2xl bg-surface-1/40 p-4 shadow-none'>
            <div className='flex items-center justify-between gap-3'>
              <div className='space-y-1'>
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
              <p
                className='sr-only'
                aria-label={`Setup progress: ${completedCount} of ${totalSteps} steps completed`}
              >
                {completedCount} of {totalSteps} tasks done
              </p>
            </div>

            <ol className='grid list-none grid-cols-1 gap-3 pl-0 md:grid-cols-3'>
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
    );
  }

  return (
    <div className='space-y-5'>
      {header}

      <section className='rounded-2xl bg-surface-1/40 p-4 shadow-none'>
        <div className='space-y-3'>
          <CompletionBanner />
        </div>
      </section>

      <section className='rounded-2xl bg-surface-1/40 p-4 shadow-none'>
        <AnalyticsCards profileUrl={profileUrl} />
      </section>

      <section className='rounded-2xl bg-surface-1/40 p-4 shadow-none'>
        <DashboardActivityFeed
          profileId={artist.id}
          profileHandle={artist.handle}
        />
      </section>
    </div>
  );
}
