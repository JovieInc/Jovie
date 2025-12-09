import { Button } from '@jovie/ui';
import Link from 'next/link';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { CompletionBanner } from '@/components/dashboard/molecules/CompletionBanner';
import { SetupTaskItem } from '@/components/dashboard/molecules/SetupTaskItem';
import { DashboardActivityFeed } from '@/components/dashboard/organisms/DashboardActivityFeed';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import type { Artist } from '@/types/db';

interface DashboardOverviewProps {
  artist: Artist | null;
  hasSocialLinks: boolean;
}

export function DashboardOverview({
  artist,
  hasSocialLinks,
}: DashboardOverviewProps) {
  if (!artist) {
    return (
      <StarterEmptyState
        title='We could not load your profile'
        description='The dashboard data did not include your Jovie profile. Refresh or reopen onboarding to finish setup.'
        primaryAction={{ label: 'Refresh dashboard', href: '/dashboard' }}
        secondaryAction={{ label: 'Restart onboarding', href: '/onboarding' }}
        testId='dashboard-missing-profile'
      />
    );
  }

  const isHandleClaimed = Boolean(artist.owner_user_id);
  const hasMusicLink = Boolean(
    artist.spotify_url || artist.apple_music_url || artist.youtube_url
  );
  const allTasksComplete = isHandleClaimed && hasMusicLink && hasSocialLinks;
  const totalSteps = 3;
  const completedCount = [isHandleClaimed, hasMusicLink, hasSocialLinks].filter(
    Boolean
  ).length;

  return (
    <div className='space-y-6'>
      <DashboardCard
        variant='analytics'
        className='rounded-2xl bg-surface-0/80 shadow-sm dark:bg-linear-to-r dark:from-[#0f111a] dark:via-[#0a0c15] dark:to-[#0f111a] dark:shadow-[0_25px_70px_rgba(5,10,25,0.35)]'
        padding='large'
      >
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <p className='text-xs uppercase tracking-[0.3em] text-secondary-token'>
              Dashboard
            </p>
            <h1 className='text-2xl font-semibold text-primary-token'>
              Welcome back, {artist.name || 'Artist'}
            </h1>
            <p className='text-sm text-secondary-token'>
              Keep your profile polished and ready to share.
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button
              asChild
              variant='secondary'
              size='sm'
              className='bg-transparent border border-white/10 text-secondary-token hover:bg-white/5 hover:text-primary-token active:scale-[0.97] transition-transform duration-150 ease-out'
            >
              <Link
                href={`/${artist.handle}`}
                target='_blank'
                rel='noopener noreferrer'
              >
                View live profile
              </Link>
            </Button>
            <CopyToClipboardButton
              relativePath={`/${artist.handle}`}
              className='bg-transparent border border-black/10 dark:border-white/10 text-secondary-token hover:bg-black/5 dark:hover:bg-white/5 hover:text-primary-token active:scale-[0.97] transition-transform duration-150 ease-out'
            />
          </div>
        </div>
      </DashboardCard>

      <DashboardCard variant='onboarding'>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-xs uppercase tracking-[0.25em] text-secondary-token'>
              {allTasksComplete ? 'Complete' : 'Getting Started'}
            </p>
            <h3 className='text-xl font-semibold text-primary-token'>
              {allTasksComplete ? 'Profile ready!' : 'Complete your setup'}
            </h3>
            <p className='text-sm text-secondary-token'>
              {allTasksComplete
                ? 'Everything essential is live—share your profile.'
                : 'Finish the essentials to unlock the full experience.'}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <div className='text-xs font-semibold text-primary-token'>
              {completedCount}/{totalSteps}
            </div>
            <div className='h-2 w-16 overflow-hidden rounded-full border border-subtle bg-surface-2'>
              <div
                className='h-full rounded-full bg-linear-to-r from-accent to-accent/80 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] transition-all duration-300 ease-out'
                style={{ width: `${(completedCount / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {allTasksComplete ? (
          <div className='mt-4 space-y-4'>
            <CompletionBanner />
            <div className='flex flex-wrap gap-3'>
              <Button asChild size='sm'>
                <Link
                  href={`/${artist.handle}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  View profile
                </Link>
              </Button>
              <CopyToClipboardButton relativePath={`/${artist.handle}`} />
            </div>
          </div>
        ) : (
          <div className='mt-4 space-y-4'>
            <div
              role='progressbar'
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={totalSteps}
              aria-label={`Setup progress: ${completedCount} of ${totalSteps} steps completed`}
              className='relative h-2 overflow-hidden rounded-full border border-subtle bg-surface-2'
            >
              <div
                className='absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-accent to-accent/80 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] transition-all duration-300 ease-out'
                style={{ width: `${(completedCount / totalSteps) * 100}%` }}
              />
            </div>

            <ol className='space-y-2 list-none pl-0'>
              <SetupTaskItem
                index={1}
                title='Claim your handle'
                complete={isHandleClaimed}
                completeLabel='Handle claimed'
                incompleteLabel='Secure your unique profile URL'
                action={
                  <Button asChild size='sm' variant='primary'>
                    <Link href='/settings'>Claim handle</Link>
                  </Button>
                }
              />

              <SetupTaskItem
                index={2}
                title='Add a music link'
                complete={hasMusicLink}
                completeLabel='Music link added'
                incompleteLabel='Connect Spotify, Apple Music, or YouTube'
                action={
                  <Button
                    asChild
                    size='sm'
                    variant='primary'
                    className='px-4 sm:px-5 text-[13px] rounded-lg hover:opacity-90'
                  >
                    <Link href='/dashboard/links'>Add music link</Link>
                  </Button>
                }
              />

              <SetupTaskItem
                index={3}
                title='Add social links'
                complete={hasSocialLinks}
                completeLabel='Social links added'
                incompleteLabel='Connect Instagram, TikTok, Twitter, etc.'
                action={
                  <Button
                    asChild
                    size='sm'
                    variant='primary'
                    className='px-4 sm:px-5 text-[13px] rounded-lg hover:opacity-90'
                  >
                    <Link href='/dashboard/links'>Add social links</Link>
                  </Button>
                }
              />
            </ol>
          </div>
        )}
      </DashboardCard>

      <DashboardCard variant='settings' className='h-full'>
        <DashboardActivityFeed profileId={artist.id} />
      </DashboardCard>
    </div>
  );
}
