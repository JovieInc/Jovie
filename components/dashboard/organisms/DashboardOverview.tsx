'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import type { DashboardData } from '@/app/dashboard/actions';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { CompletionBanner } from '@/components/dashboard/molecules/CompletionBanner';
import { SetupTaskItem } from '@/components/dashboard/molecules/SetupTaskItem';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardOverviewProps {
  initialData: DashboardData;
}

export function DashboardOverview({ initialData }: DashboardOverviewProps) {
  const artist: Artist | null = initialData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
    : null;

  if (!artist) {
    return null; // Safety: server should always provide a selected profile
  }

  const isHandleClaimed = Boolean(artist.owner_user_id);
  const hasMusicLink = Boolean(
    artist.spotify_url || artist.apple_music_url || artist.youtube_url
  );
  const hasSocialLinks = initialData.hasSocialLinks;
  const allTasksComplete = isHandleClaimed && hasMusicLink && hasSocialLinks;
  const totalSteps = 3;
  const completedCount = [isHandleClaimed, hasMusicLink, hasSocialLinks].filter(
    Boolean
  ).length;

  // Smart welcome message based on completion status
  const getWelcomeMessage = () => {
    if (allTasksComplete) {
      return `🎉 Welcome back, ${artist.name || 'Artist'}! Your profile is live and ready.`;
    }
    if (completedCount === 0) {
      return `Welcome, ${artist.name || 'Artist'}! Let's set up your profile in just a few steps.`;
    }
    if (completedCount === 1) {
      return `Great start, ${artist.name || 'Artist'}! You're ${Math.round((completedCount / totalSteps) * 100)}% done.`;
    }
    return `Almost there, ${artist.name || 'Artist'}! Just ${totalSteps - completedCount} step${totalSteps - completedCount > 1 ? 's' : ''} left.`;
  };

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-primary-token'>Dashboard</h1>
        <p className='text-secondary-token mt-2 text-lg leading-relaxed'>
          {getWelcomeMessage()}
        </p>
        {!allTasksComplete && (
          <div className='mt-3 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400'>
            <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse' />
            <span>{`${totalSteps - completedCount} task${totalSteps - completedCount > 1 ? 's' : ''} remaining`}</span>
          </div>
        )}
      </div>

      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary-token mb-4'>
          {allTasksComplete ? 'Profile Ready!' : 'Complete Your Setup'}
        </h3>

        {allTasksComplete ? (
          <div className='space-y-6'>
            <CompletionBanner />
            <div className='flex flex-col sm:flex-row gap-3'>
              <Button asChild size='lg' className='flex-1 sm:flex-none'>
                <Link
                  href={`/${artist.handle}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <svg
                    className='w-4 h-4 mr-2'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                    />
                  </svg>
                  View Your Profile
                </Link>
              </Button>
              <div className='flex-1 sm:flex-none'>
                <CopyToClipboardButton relativePath={`/${artist.handle}`} />
              </div>
            </div>
            {/* Additional completion actions */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
              <Button asChild variant='outline' size='sm'>
                <Link href='/dashboard/links'>
                  <svg
                    className='w-4 h-4 mr-2'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.102m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
                    />
                  </svg>
                  Add More Links
                </Link>
              </Button>
              <Button asChild variant='outline' size='sm'>
                <Link href='/dashboard/settings'>
                  <svg
                    className='w-4 h-4 mr-2'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4'
                    />
                  </svg>
                  Customize Profile
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {/* Enhanced Progress indicator */}
            <div className='mb-6'>
              <div className='flex justify-between items-center mb-3'>
                <span className='text-sm font-medium text-secondary-token'>
                  Setup Progress
                </span>
                <span className='text-sm font-medium text-accent'>{`${completedCount}/${totalSteps} completed`}</span>
              </div>
              <div
                role='progressbar'
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalSteps}
                aria-label={`Setup progress: ${completedCount} of ${totalSteps} steps completed`}
                className='relative w-full bg-surface-2 rounded-full h-3 overflow-hidden'
              >
                <div
                  className='bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-700 ease-out relative overflow-hidden'
                  style={{ width: `${(completedCount / totalSteps) * 100}%` }}
                >
                  {/* Animated shine effect */}
                  <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-pulse opacity-75' />
                </div>
                {/* Progress steps indicators */}
                <div className='absolute inset-0 flex justify-between items-center px-1'>
                  {Array.from({ length: totalSteps }).map((_, index) => (
                    <div
                      key={index}
                      className={`w-1 h-1 rounded-full transition-all duration-300 ${
                        index < completedCount
                          ? 'bg-white shadow-sm'
                          : 'bg-gray-400/50'
                      }`}
                    />
                  ))}
                </div>
              </div>
              {/* Progress percentage text */}
              <div className='text-xs text-gray-500 mt-2 text-center'>
                {Math.round((completedCount / totalSteps) * 100)}% complete
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
