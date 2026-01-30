import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { DashboardOverviewControlsProvider } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardOverviewHeaderToolbarClient } from '@/components/dashboard/organisms/DashboardOverviewHeaderToolbarClient';
import { DashboardOverviewMetricsClient } from '@/components/dashboard/organisms/DashboardOverviewMetricsClient';
import {
  getCompletedTaskContainerClass,
  getCompletedTaskIndicatorClass,
  getCompletedTaskIndicatorContent,
  getCompletedTaskLabelClass,
  getIncompleteTaskContainerClass,
  getIncompleteTaskIndicatorClass,
  getIncompleteTaskIndicatorContent,
  getIncompleteTaskLabelClass,
} from '@/components/dashboard/organisms/dashboard-overview-helpers';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import { PROFILE_URL } from '@/constants/app';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';

function buildProfileUrl(
  handle: string | null | undefined
): string | undefined {
  if (!handle) return undefined;
  const base = trimTrailingSlashes(PROFILE_URL);
  const path = trimLeadingSlashes(handle);
  return `${base}/${path}`;
}

function getGreetingName(artistName: string | null | undefined): string {
  const raw = (artistName || 'Artist').trim();
  const first = raw.split(/\s+/)[0];
  return first || 'Artist';
}

interface DashboardOverviewProps {
  readonly artist: Artist | null;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks?: boolean;
}

interface SetupTaskItemProps {
  isComplete: boolean;
  stepNumber: number;
  label: string;
  actionHref: string;
  actionLabel: string;
}

function SetupTaskItem({
  isComplete,
  stepNumber,
  label,
  actionHref,
  actionLabel,
}: SetupTaskItemProps) {
  const containerClass = isComplete
    ? getCompletedTaskContainerClass()
    : getIncompleteTaskContainerClass();
  const indicatorClass = isComplete
    ? getCompletedTaskIndicatorClass()
    : getIncompleteTaskIndicatorClass();
  const indicatorContent = isComplete
    ? getCompletedTaskIndicatorContent()
    : getIncompleteTaskIndicatorContent(stepNumber);
  const labelClass = isComplete
    ? getCompletedTaskLabelClass()
    : getIncompleteTaskLabelClass();

  return (
    <li className={containerClass}>
      <span className={indicatorClass}>{indicatorContent}</span>
      <div className='flex-1 min-w-0'>
        <p className={labelClass}>{label}</p>
      </div>
      {!isComplete && (
        <Link
          href={actionHref}
          className='text-[13px] text-accent-token opacity-0 transition-opacity group-hover:opacity-100'
        >
          {actionLabel} →
        </Link>
      )}
    </li>
  );
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

  const profileUrl = buildProfileUrl(artist.handle);
  const greetingName = getGreetingName(artist.name);

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
              <SetupTaskItem
                isComplete={isHandleClaimed}
                stepNumber={1}
                label='Claim your handle'
                actionHref='/app/settings'
                actionLabel='Claim'
              />
              <SetupTaskItem
                isComplete={hasMusicLink}
                stepNumber={2}
                label='Add a music link'
                actionHref='/app/dashboard/profile'
                actionLabel='Add'
              />
              <SetupTaskItem
                isComplete={hasSocialLinks}
                stepNumber={3}
                label='Add social links'
                actionHref='/app/dashboard/profile'
                actionLabel='Add'
              />
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
