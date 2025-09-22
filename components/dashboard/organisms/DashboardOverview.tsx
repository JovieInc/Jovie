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
    <div className='space-y-8'>
      {/* Enhanced header with Linear-inspired typography */}
      <div className='space-y-4'>
        <div className='space-y-2'>
          <h1 className='text-3xl font-bold text-primary-token tracking-tight'>
            Dashboard
          </h1>
          <p className='text-secondary-token text-lg leading-relaxed max-w-2xl'>
            {getWelcomeMessage()}
          </p>
        </div>

        {!allTasksComplete && (
          <div className='inline-flex items-center gap-3 px-3 py-2 rounded-lg bg-status-info/10 border border-status-info/20 backdrop-blur-sm'>
            <div className='w-2 h-2 bg-status-info rounded-full animate-pulse shadow-sm' />
            <span className='text-sm font-medium text-status-info'>{`${totalSteps - completedCount} task${totalSteps - completedCount > 1 ? 's' : ''} remaining`}</span>
          </div>
        )}
      </div>

      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary-token mb-4'>
          {allTasksComplete ? 'Profile Ready!' : 'Complete Your Setup'}
        </h3>

        {allTasksComplete ? (
          <div className='space-y-8'>
            <CompletionBanner />

            {/* Primary actions with Linear-inspired styling */}
            <div className='flex flex-col sm:flex-row gap-4'>
              <Button
                asChild
                size='lg'
                className='flex-1 sm:flex-none group relative overflow-hidden'
              >
                <Link
                  href={`/${artist.handle}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center justify-center'
                >
                  <div className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -skew-x-12 group-hover:translate-x-full transition-transform duration-500' />
                  <svg
                    className='w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110'
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
                  <span className='transition-transform duration-200 group-hover:translate-x-1'>
                    View Your Profile
                  </span>
                </Link>
              </Button>
              <div className='flex-1 sm:flex-none'>
                <CopyToClipboardButton relativePath={`/${artist.handle}`} />
              </div>
            </div>

            {/* Secondary actions with enhanced styling */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-border-subtle'>
              <Button
                asChild
                variant='outline'
                size='sm'
                className='group hover:border-status-info/30 hover:bg-status-info/5'
              >
                <Link
                  href='/dashboard/links'
                  className='inline-flex items-center justify-center'
                >
                  <svg
                    className='w-4 h-4 mr-2 transition-all duration-200 group-hover:scale-110 group-hover:text-status-info'
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
                  <span className='transition-transform duration-200 group-hover:translate-x-0.5'>
                    Add More Links
                  </span>
                </Link>
              </Button>
              <Button
                asChild
                variant='outline'
                size='sm'
                className='group hover:border-status-warning/30 hover:bg-status-warning/5'
              >
                <Link
                  href='/dashboard/settings'
                  className='inline-flex items-center justify-center'
                >
                  <svg
                    className='w-4 h-4 mr-2 transition-all duration-200 group-hover:scale-110 group-hover:text-status-warning'
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
                  <span className='transition-transform duration-200 group-hover:translate-x-0.5'>
                    Customize Profile
                  </span>
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {/* Enhanced Progress indicator with Linear-inspired sophistication */}
            <div className='mb-8 space-y-4'>
              <div className='flex justify-between items-center'>
                <div className='space-y-1'>
                  <span className='text-sm font-medium text-primary-token'>
                    Setup Progress
                  </span>
                  <span className='text-xs text-text-muted'>
                    {Math.round((completedCount / totalSteps) * 100)}% complete
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-semibold text-status-success'>{`${completedCount}/${totalSteps}`}</span>
                  <span className='text-xs text-text-muted'>completed</span>
                </div>
              </div>

              <div
                role='progressbar'
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalSteps}
                aria-label={`Setup progress: ${completedCount} of ${totalSteps} steps completed`}
                className='relative w-full bg-surface-2 rounded-full h-2 overflow-hidden ring-1 ring-border-subtle shadow-inner'
              >
                <div
                  className='bg-gradient-to-r from-status-success via-status-info to-status-success h-2 rounded-full transition-all duration-700 ease-out relative overflow-hidden shadow-sm'
                  style={{ width: `${(completedCount / totalSteps) * 100}%` }}
                >
                  {/* Sophisticated shine effect */}
                  <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 animate-pulse opacity-60' />
                </div>

                {/* Progress milestone indicators */}
                <div className='absolute inset-0 flex justify-between items-center px-0.5'>
                  {Array.from({ length: totalSteps }).map((_, index) => (
                    <div
                      key={index}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ring-1 ${
                        index < completedCount
                          ? 'bg-white shadow-md ring-white/50 scale-110'
                          : 'bg-text-disabled ring-border-subtle scale-90'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Enhanced setup tasks with Linear-inspired sophistication */}
            <div className='space-y-3'>
              <SetupTaskItem
                index={1}
                title='Claim your handle'
                complete={isHandleClaimed}
                completeLabel='Handle claimed'
                incompleteLabel='Secure your unique profile URL'
                action={
                  <Button
                    asChild
                    size='sm'
                    variant='primary'
                    className='group relative overflow-hidden transition-all duration-200 hover:scale-105 active:scale-95'
                  >
                    <Link href='/dashboard/settings' className='relative z-10'>
                      <div className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -skew-x-12 group-hover:translate-x-full transition-transform duration-300' />
                      Claim handle
                    </Link>
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
                    className='group relative overflow-hidden transition-all duration-200 hover:scale-105 active:scale-95'
                  >
                    <Link href='/dashboard/links' className='relative z-10'>
                      <div className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -skew-x-12 group-hover:translate-x-full transition-transform duration-300' />
                      Add music link
                    </Link>
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
                    className='group relative overflow-hidden transition-all duration-200 hover:scale-105 active:scale-95'
                  >
                    <Link href='/dashboard/links' className='relative z-10'>
                      <div className='absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -skew-x-12 group-hover:translate-x-full transition-transform duration-300' />
                      Add social links
                    </Link>
                  </Button>
                }
              />
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
