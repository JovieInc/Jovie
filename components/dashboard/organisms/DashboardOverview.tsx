'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { CompletionBanner } from '@/components/dashboard/molecules/CompletionBanner';
import { SetupTaskItem } from '@/components/dashboard/molecules/SetupTaskItem';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

export function DashboardOverview() {
  const dashboardData = useDashboardData();
  const artist: Artist | null = dashboardData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    : null;

  if (!artist) {
    return null; // Safety: server should always provide a selected profile
  }

  const isHandleClaimed = Boolean(artist.owner_user_id);
  const hasMusicLink = Boolean(
    artist.spotify_url || artist.apple_music_url || artist.youtube_url
  );
  const hasSocialLinks = dashboardData.hasSocialLinks;
  const allTasksComplete = isHandleClaimed && hasMusicLink && hasSocialLinks;
  const totalSteps = 3;
  const completedCount = [isHandleClaimed, hasMusicLink, hasSocialLinks].filter(
    Boolean
  ).length;

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Dashboard</h1>
        <p className='text-secondary-token mt-1'>
          Welcome back, {artist.name || 'Artist'}
        </p>
      </div>

      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary-token mb-4'>
          {allTasksComplete ? 'Profile Ready!' : 'Complete Your Setup'}
        </h3>

        {allTasksComplete ? (
          <div className='space-y-4'>
            <CompletionBanner />
            <div className='flex gap-3'>
              <Button asChild size='sm'>
                <Link
                  href={`/${artist.handle}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  View Profile
                </Link>
              </Button>
              <CopyToClipboardButton relativePath={`/${artist.handle}`} />
            </div>
          </div>
        ) : (
          <div>
            {/* Progress indicator */}
            <div className='mb-4'>
              <div className='flex justify-between items-center mb-2'>
                <span className='text-sm text-secondary-token'>
                  Setup Progress
                </span>
                <span className='text-sm text-secondary-token'>{`${completedCount}/${totalSteps}`}</span>
              </div>
              <div
                role='progressbar'
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalSteps}
                aria-label={`Setup progress: ${completedCount} of ${totalSteps} steps completed`}
                className='w-full bg-surface-2 rounded-full h-2'
              >
                <div
                  className='bg-accent h-2 rounded-full transition-all duration-300 ease-in-out'
                  style={{ width: `${(completedCount / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <ol className='space-y-3 list-none pl-0'>
              <SetupTaskItem
                index={1}
                title='Claim your handle'
                complete={isHandleClaimed}
                completeLabel='Handle claimed'
                incompleteLabel='Secure your unique profile URL'
                action={
                  <Button asChild size='sm' variant='primary'>
                    <Link href='/dashboard/settings'>Claim handle</Link>
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
                  <Button asChild size='sm' variant='primary'>
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
                  <Button asChild size='sm' variant='primary'>
                    <Link href='/dashboard/links'>Add social links</Link>
                  </Button>
                }
              />
            </ol>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
