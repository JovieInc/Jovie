'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import { AboutSection } from '@/features/profile/AboutSection';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import type {
  ProfilePreviewNotificationsState,
  ProfilePrimaryTab,
  ProfileRenderMode,
} from '@/features/profile/contracts';
import type { PublicRelease } from '@/features/profile/releases/types';
import { StaticListenInterface } from '@/features/profile/StaticListenInterface';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import { ReleasesView } from '@/features/profile/views/ReleasesView';
import type { AvailableDSP } from '@/lib/dsp';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';

const PANEL_CLASS_NAME =
  'rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5 shadow-[0_28px_72px_rgba(0,0,0,0.26)] backdrop-blur-2xl';
const OTP_SLOT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

interface ProfilePrimaryTabPanelProps {
  readonly mode: Exclude<ProfilePrimaryTab, 'profile'>;
  readonly renderMode?: ProfileRenderMode;
  readonly artist: Artist;
  readonly notificationsPortalContainer?: HTMLElement | null;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly isSubscribed: boolean;
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly onTogglePref: (key: NotificationContentType) => void;
  readonly onUnsubscribe: () => void;
  readonly isUnsubscribing: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly tourDates?: readonly TourDateViewModel[];
  readonly releases?: readonly PublicRelease[];
  readonly previewNotificationsState?: ProfilePreviewNotificationsState;
}

function SectionIntro({
  title,
  body,
}: Readonly<{
  title: string;
  body?: string;
}>) {
  return (
    <div className={cn('space-y-1', body ? 'mb-4' : 'mb-3')}>
      <p className='text-[13px] font-semibold tracking-[-0.015em] text-white/56'>
        {title}
      </p>
      {body ? (
        <p className='max-w-[28ch] text-sm leading-6 text-white/68'>{body}</p>
      ) : null}
    </div>
  );
}

function PreviewAlertsPanel({
  state,
  isSubscribed,
}: Readonly<{
  state: ProfilePreviewNotificationsState;
  isSubscribed: boolean;
}>) {
  const resolvedTitle =
    state.kind === 'status'
      ? 'Alerts On'
      : isSubscribed
        ? 'Manage Alerts'
        : 'Turn On Alerts';
  const resolvedBody =
    state.helper ??
    (state.kind === 'status'
      ? 'Music, shows, and merch updates are ready.'
      : 'Get new music and tour updates the moment they land.');

  return (
    <div
      className={PANEL_CLASS_NAME}
      data-testid='profile-primary-tab-subscribe'
    >
      <div className='space-y-4'>
        <div className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--profile-status-pill-border)] bg-[color:var(--profile-status-pill-bg)] text-[color:var(--profile-status-pill-fg)]'>
          {state.kind === 'status' ? (
            <CheckCircle2 className='size-4.5' />
          ) : (
            <Bell className='size-4.5' />
          )}
        </div>

        <div className='space-y-1.5'>
          <p className='text-[22px] font-semibold tracking-[-0.045em] text-white'>
            {resolvedTitle}
          </p>
          <p className='max-w-[28ch] text-sm leading-6 text-white/68'>
            {resolvedBody}
          </p>
        </div>

        {state.kind === 'button' ? (
          <div className='inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white'>
            <Bell className='h-4 w-4' />
            <span>{isSubscribed ? 'Manage alerts' : 'Turn on alerts'}</span>
          </div>
        ) : null}

        {state.kind === 'input' ||
        state.kind === 'name' ||
        state.kind === 'birthday' ? (
          <div className='space-y-3'>
            <div className='rounded-[22px] border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white/72'>
              {state.value || state.label}
            </div>
            <div className='inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black'>
              {state.actionLabel || 'Continue'}
            </div>
          </div>
        ) : null}

        {state.kind === 'otp' ? (
          <div className='space-y-3'>
            <div className='grid grid-cols-6 gap-2'>
              {OTP_SLOT_KEYS.map((slotKey, index) => (
                <div
                  key={`otp-${slotKey}`}
                  className='flex h-11 items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.06] text-sm font-semibold text-white/78'
                >
                  {state.value?.[index] ?? ''}
                </div>
              ))}
            </div>
            <div className='inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black'>
              {state.actionLabel || 'Verify'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SubscribePanel({
  renderMode,
  artist,
  notificationsPortalContainer,
  isSubscribed,
  previewNotificationsState,
}: Readonly<{
  renderMode: ProfileRenderMode;
  artist: Artist;
  notificationsPortalContainer?: HTMLElement | null;
  isSubscribed: boolean;
  previewNotificationsState?: ProfilePreviewNotificationsState;
}>) {
  if (renderMode === 'preview') {
    return (
      <PreviewAlertsPanel
        state={
          previewNotificationsState ?? {
            kind: 'button',
            tone: 'quiet',
            label: 'Turn on alerts',
          }
        }
        isSubscribed={isSubscribed}
      />
    );
  }

  return (
    <ArtistNotificationsCTA
      artist={artist}
      presentation='overlay'
      portalContainer={notificationsPortalContainer}
      autoOpen
      forceExpanded
      hideTrigger
    />
  );
}

export function ProfilePrimaryTabPanel({
  mode,
  renderMode = 'interactive',
  artist,
  notificationsPortalContainer,
  dsps,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  isSubscribed,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  tourDates = [],
  releases = [],
  previewNotificationsState,
}: Readonly<ProfilePrimaryTabPanelProps>) {
  if (mode === 'listen') {
    const visibleReleases = releases.filter(release => Boolean(release.slug));

    if (visibleReleases.length > 0) {
      return (
        <div
          className={PANEL_CLASS_NAME}
          data-testid='profile-primary-tab-releases'
        >
          <SectionIntro title='Releases' />
          <ReleasesView
            releases={visibleReleases}
            artistHandle={artist.handle}
            artistName={artist.name}
          />
        </div>
      );
    }

    return (
      <div
        className={PANEL_CLASS_NAME}
        data-testid='profile-primary-tab-listen'
      >
        <SectionIntro title='Music' />
        <StaticListenInterface
          artist={artist}
          handle={artist.handle}
          dspsOverride={dsps}
          enableDynamicEngagement={enableDynamicEngagement}
          renderMode={renderMode}
          containerClassName='max-w-none'
          providerButtonClassName='rounded-[22px] border-white/8 bg-white/[0.045] px-4 py-3.5 text-white hover:bg-white/[0.08]'
          emptyStateClassName='border-white/8 bg-white/[0.04] shadow-none'
          hideHelpText
        />
      </div>
    );
  }

  if (mode === 'tour') {
    return (
      <div className={PANEL_CLASS_NAME} data-testid='profile-primary-tab-tour'>
        <SectionIntro title='Events' />
        <TourDrawerContent artist={artist} tourDates={[...tourDates]} />
      </div>
    );
  }

  if (mode === 'subscribe') {
    return (
      <SubscribePanel
        renderMode={renderMode}
        artist={artist}
        notificationsPortalContainer={notificationsPortalContainer}
        isSubscribed={isSubscribed}
        previewNotificationsState={previewNotificationsState}
      />
    );
  }

  return (
    <div className={PANEL_CLASS_NAME} data-testid='profile-primary-tab-about'>
      <SectionIntro title='Profile' />
      <div
        className={cn(
          'text-white/80',
          renderMode === 'preview' && 'pointer-events-none'
        )}
      >
        <AboutSection
          artist={artist}
          genres={genres}
          pressPhotos={pressPhotos}
          allowPhotoDownloads={allowPhotoDownloads}
        />
      </div>
    </div>
  );
}
