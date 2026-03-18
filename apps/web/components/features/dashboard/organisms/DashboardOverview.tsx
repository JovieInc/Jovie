import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ICON_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { Icon } from '@/components/atoms/Icon';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { CopyToClipboardButton } from '@/features/dashboard/molecules/CopyToClipboardButton';
import { SocialBioNudge } from '@/features/dashboard/molecules/SocialBioNudge';
import { DashboardOverviewControlsProvider } from '@/features/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardOverviewHeaderToolbarClient } from '@/features/dashboard/organisms/DashboardOverviewHeaderToolbarClient';
import { DashboardOverviewMetricsClient } from '@/features/dashboard/organisms/DashboardOverviewMetricsClient';
import {
  getCompletedTaskContainerClass,
  getCompletedTaskIndicatorClass,
  getCompletedTaskIndicatorContent,
  getCompletedTaskLabelClass,
  getIncompleteTaskContainerClass,
  getIncompleteTaskIndicatorClass,
  getIncompleteTaskIndicatorContent,
  getIncompleteTaskLabelClass,
} from '@/features/dashboard/organisms/dashboard-overview-helpers';
import { GetStartedChecklistCard } from '@/features/dashboard/organisms/GetStartedChecklistCard';
import { StarterEmptyState } from '@/features/feedback/StarterEmptyState';
import { GLYPH_ARROW_RIGHT } from '@/lib/keyboard-shortcuts';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import type { Artist } from '@/types/db';

function buildProfileUrl(
  handle: string | null | undefined
): string | undefined {
  if (!handle) return undefined;
  const base = trimTrailingSlashes(BASE_URL);
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
  readonly isComplete: boolean;
  readonly stepNumber: number;
  readonly label: string;
  readonly actionHref: string;
  readonly actionLabel: string;
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
          className='text-[12.5px] font-[510] text-secondary-token transition-colors hover:text-primary-token'
        >
          {actionLabel} {GLYPH_ARROW_RIGHT}
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
        primaryAction={{
          label: 'Refresh dashboard',
          href: APP_ROUTES.DASHBOARD,
        }}
        secondaryAction={{
          label: 'Restart onboarding',
          href: APP_ROUTES.ONBOARDING,
        }}
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
    <ContentSurfaceCard as='header' className='overflow-hidden'>
      <ContentSectionHeader
        title={
          <span className='text-[15px] font-[590] tracking-[-0.01em] text-primary-token'>
            Welcome back, {greetingName}
          </span>
        }
        subtitle='Keep your profile polished and ready to share.'
        actions={
          <div className='flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-end'>
            <div className='flex items-center gap-1'>
              <Button
                asChild
                variant='ghost'
                size='icon'
                className={APP_ICON_BUTTON_CLASS}
              >
                <Link
                  href={`/${artist.handle}`}
                  aria-label='View profile'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Icon
                    name='ArrowUpRight'
                    className='h-3.5 w-3.5'
                    aria-hidden='true'
                  />
                  <span className='sr-only'>View profile</span>
                </Link>
              </Button>
              <CopyToClipboardButton
                relativePath={`/${artist.handle}`}
                idleLabel='Copy URL'
                iconName='Copy'
                className={APP_ICON_BUTTON_CLASS}
              />
            </div>
            <DashboardOverviewHeaderToolbarClient />
          </div>
        }
        actionsClassName='w-full sm:w-auto'
      />
    </ContentSurfaceCard>
  );

  if (!allTasksComplete) {
    return (
      <DashboardOverviewControlsProvider>
        <div
          className='flex min-h-[60vh] items-center justify-center px-4 py-6 sm:px-0'
          data-testid='dashboard-overview'
        >
          <ContentSurfaceCard className='w-full max-w-md overflow-hidden'>
            <ContentSectionHeader
              title='Complete your setup'
              subtitle={`${completedCount} of ${totalSteps} complete`}
              bodyClassName='space-y-0'
            />

            <ul className='space-y-1 p-2 sm:p-3'>
              <SetupTaskItem
                isComplete={isHandleClaimed}
                stepNumber={1}
                label='Claim your handle'
                actionHref={APP_ROUTES.SETTINGS}
                actionLabel='Claim'
              />
              <SetupTaskItem
                isComplete={hasMusicLink}
                stepNumber={2}
                label='Add a music link'
                actionHref={APP_ROUTES.SETTINGS_ARTIST_PROFILE}
                actionLabel='Add'
              />
              <SetupTaskItem
                isComplete={hasSocialLinks}
                stepNumber={3}
                label='Add social links'
                actionHref={APP_ROUTES.SETTINGS_ARTIST_PROFILE}
                actionLabel='Add'
              />
            </ul>
          </ContentSurfaceCard>
        </div>
      </DashboardOverviewControlsProvider>
    );
  }

  return (
    <DashboardOverviewControlsProvider>
      <div className='space-y-6' data-testid='dashboard-overview'>
        {header}

        {artist.owner_user_id && (
          <GetStartedChecklistCard
            userId={artist.owner_user_id}
            profileUrl={profileUrl}
          />
        )}

        {profileUrl && (
          <SocialBioNudge profileId={artist.id} profileUrl={profileUrl} />
        )}

        <DashboardOverviewMetricsClient
          profileId={artist.id}
          profileUrl={profileUrl}
          showActivity
        />
      </div>
    </DashboardOverviewControlsProvider>
  );
}
