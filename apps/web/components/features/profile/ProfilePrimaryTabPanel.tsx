'use client';

import { Button } from '@jovie/ui';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/molecules/EmptyState';
import { AboutSection } from '@/features/profile/AboutSection';
import { AlertsSettingsView } from '@/features/profile/AlertsSettingsView';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import type { NotificationSourceContext } from '@/features/profile/artist-notifications-cta/types';
import type {
  ProfilePreviewNotificationsState,
  ProfilePrimaryTab,
  ProfileRenderMode,
} from '@/features/profile/contracts';
import {
  PUBLIC_MUSIC_EMPTY_DESCRIPTION,
  PUBLIC_MUSIC_EMPTY_HEADING,
  PUBLIC_MUSIC_ERROR_DESCRIPTION,
  PUBLIC_MUSIC_ERROR_HEADING,
  resolvePublicMusicSurface,
} from '@/features/profile/profile-surface-state';
import type { PublicRelease } from '@/features/profile/releases/types';
import { StaticListenInterface } from '@/features/profile/StaticListenInterface';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import { ReleasesView } from '@/features/profile/views/ReleasesView';
import type { AvailableDSP } from '@/lib/dsp';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';

const PANEL_CLASS_NAME =
  'rounded-(--profile-card-radius) border border-[color:var(--profile-panel-border)] bg-[color:var(--profile-content-bg)] p-5 shadow-(--profile-panel-shadow) backdrop-blur-2xl';
const OTP_SLOT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const NATIVE_PANEL_CLASS_NAME = '-mx-4 space-y-0 pb-2';

interface ProfilePrimaryTabPanelProps {
  readonly mode: Exclude<ProfilePrimaryTab, 'profile'>;
  readonly renderMode?: ProfileRenderMode;
  readonly artist: Artist;
  readonly notificationsPortalContainer?: HTMLElement | null;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly alertOptInVariant?: ProfileAlertOptInVariant;
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
  readonly catalogLoadFailed?: boolean;
  readonly alertSourceContext?: NotificationSourceContext;
  readonly previewNotificationsState?: ProfilePreviewNotificationsState;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
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
      <p className='text-app font-semibold tracking-[-0.015em] text-white/56'>
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
        ? 'Manage alerts'
        : 'Get Alerts';
  const resolvedBody =
    state.helper ??
    (state.kind === 'status'
      ? 'Music, shows, and merch updates are ready.'
      : undefined);

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
          <p className='text-xl font-semibold tracking-[-0.014em] text-white dark:text-white'>
            {resolvedTitle}
          </p>
          {resolvedBody ? (
            <p className='max-w-[28ch] text-app leading-5 text-white/58'>
              {resolvedBody}
            </p>
          ) : null}
        </div>

        {state.kind === 'button' ? (
          <div className='inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white dark:text-white'>
            <Bell className='h-4 w-4' />
            <span>{isSubscribed ? 'Manage alerts' : 'Get Alerts'}</span>
          </div>
        ) : null}

        {state.kind === 'input' ||
        state.kind === 'name' ||
        state.kind === 'birthday' ? (
          <div className='space-y-3'>
            <div className='rounded-3xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white/72'>
              {state.value || state.label}
            </div>
            <div className='inline-flex items-center justify-center rounded-full bg-white dark:bg-surface-1 px-4 py-2 text-sm font-semibold text-black dark:text-white'>
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
                  className='flex h-11 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] text-sm font-semibold text-white/78'
                >
                  {state.value?.[index] ?? ''}
                </div>
              ))}
            </div>
            <div className='inline-flex items-center justify-center rounded-full bg-white dark:bg-surface-1 px-4 py-2 text-sm font-semibold text-black dark:text-white'>
              {state.actionLabel || 'Verify'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SubscribePanel({
  artist,
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  renderMode,
  notificationsPortalContainer,
  subscribeTwoStep,
  alertOptInVariant,
  previewNotificationsState,
  onFlowClosed,
  onSubscriptionActivated,
  keepSubscribeFlowMounted = false,
  sourceContext,
}: Readonly<{
  artist: Artist;
  isSubscribed: boolean;
  contentPrefs: Record<NotificationContentType, boolean>;
  onTogglePref: (key: NotificationContentType) => void;
  onUnsubscribe: () => void;
  isUnsubscribing: boolean;
  renderMode: ProfileRenderMode;
  notificationsPortalContainer?: HTMLElement | null;
  subscribeTwoStep?: boolean;
  alertOptInVariant?: ProfileAlertOptInVariant;
  previewNotificationsState?: ProfilePreviewNotificationsState;
  onFlowClosed?: () => void;
  onSubscriptionActivated?: () => void;
  keepSubscribeFlowMounted?: boolean;
  sourceContext?: NotificationSourceContext;
}>) {
  if (renderMode === 'preview') {
    return (
      <PreviewAlertsPanel
        state={
          previewNotificationsState ?? {
            kind: 'button',
            tone: 'quiet',
            label: 'Get Alerts',
          }
        }
        isSubscribed={isSubscribed}
      />
    );
  }

  if (!isSubscribed || keepSubscribeFlowMounted) {
    return (
      <div
        className={cn(
          NATIVE_PANEL_CLASS_NAME,
          'flex h-full min-h-full flex-col'
        )}
        data-testid='profile-primary-tab-subscribe'
      >
        {subscribeTwoStep ? (
          <TwoStepNotificationsCTA
            artist={artist}
            startExpanded
            presentation='inline'
            portalContainer={notificationsPortalContainer}
            onFlowClosed={onFlowClosed}
            onSubscriptionActivated={onSubscriptionActivated}
            experimentVariant={alertOptInVariant}
            source={sourceContext?.ctaLocation ?? 'subscribe_tab'}
            sourceContext={sourceContext}
          />
        ) : (
          <ArtistNotificationsCTA
            artist={artist}
            presentation='inline'
            variant='button'
            autoOpen
            forceExpanded
            hideListenFallback
            source={sourceContext?.ctaLocation ?? 'subscribe_tab'}
            sourceContext={sourceContext}
            portalContainer={notificationsPortalContainer}
            onFlowClosed={onFlowClosed}
            onSubscriptionActivated={onSubscriptionActivated}
            experimentVariant={alertOptInVariant}
          />
        )}
      </div>
    );
  }

  return (
    <AlertsSettingsView
      isSubscribed={isSubscribed}
      contentPrefs={contentPrefs}
      onTogglePref={onTogglePref}
      onUnsubscribe={onUnsubscribe}
      isUnsubscribing={isUnsubscribing}
    />
  );
}

function ProfileMusicEmptyState({
  artist,
  sourceContext,
  renderMode,
}: Readonly<{
  artist: Artist;
  sourceContext: NotificationSourceContext;
  renderMode: ProfileRenderMode;
}>) {
  const action =
    renderMode === 'preview' ? (
      <Button
        type='button'
        variant='primary'
        size='marketing'
        className='w-full'
        disabled
      >
        Turn On Music Alerts
      </Button>
    ) : (
      <ArtistNotificationsCTA
        artist={artist}
        variant='button'
        presentation='overlay'
        hideListenFallback
        source={sourceContext.ctaLocation}
        sourceContext={sourceContext}
        triggerLabel='Turn On Music Alerts'
      />
    );

  return (
    <EmptyState
      heading={PUBLIC_MUSIC_EMPTY_HEADING}
      description={PUBLIC_MUSIC_EMPTY_DESCRIPTION}
      actionSlot={<div className='w-full max-w-xs'>{action}</div>}
      testId='profile-primary-tab-music-empty'
    />
  );
}

function ProfileMusicErrorState({
  renderMode,
}: Readonly<{
  renderMode: ProfileRenderMode;
}>) {
  return (
    <EmptyState
      heading={PUBLIC_MUSIC_ERROR_HEADING}
      description={PUBLIC_MUSIC_ERROR_DESCRIPTION}
      variant='error'
      action={
        renderMode === 'preview'
          ? {
              label: 'Try again',
              onClick: () => {},
              disabled: true,
            }
          : {
              label: 'Try again',
              onClick: () => {
                globalThis.location.reload();
              },
            }
      }
      testId='profile-primary-tab-music-error'
    />
  );
}

export function ProfilePrimaryTabPanel({
  mode,
  renderMode = 'interactive',
  artist,
  notificationsPortalContainer,
  dsps = [],
  subscribeTwoStep = false,
  alertOptInVariant,
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  tourDates = [],
  releases = [],
  catalogLoadFailed = false,
  alertSourceContext,
  previewNotificationsState,
  onFlowClosed,
  onSubscriptionActivated,
}: Readonly<ProfilePrimaryTabPanelProps>) {
  const [keepSubscribeFlowMounted, setKeepSubscribeFlowMounted] =
    useState(false);

  useEffect(() => {
    if (!isSubscribed) {
      setKeepSubscribeFlowMounted(true);
    }
  }, [isSubscribed]);

  const handleSubscribeFlowClosed = useCallback(() => {
    setKeepSubscribeFlowMounted(false);
    onFlowClosed?.();
  }, [onFlowClosed]);

  const handleSubscriptionActivated = useCallback(() => {
    setKeepSubscribeFlowMounted(true);
    onSubscriptionActivated?.();
  }, [onSubscriptionActivated]);
  const musicEmptySourceContext: NotificationSourceContext = {
    artistId: artist.id,
    profileId: artist.id,
    profileSlug: artist.handle,
    currentTab: 'music',
    ctaLocation: 'music_empty_state',
    intent: 'music_alerts',
  };
  const eventsEmptySourceContext: NotificationSourceContext = {
    artistId: artist.id,
    profileId: artist.id,
    profileSlug: artist.handle,
    currentTab: 'events',
    ctaLocation: 'events_empty_state',
    intent: 'event_alerts',
  };
  const subscribeSourceContext: NotificationSourceContext =
    alertSourceContext ?? {
      artistId: artist.id,
      profileId: artist.id,
      profileSlug: artist.handle,
      currentTab: 'alerts',
      ctaLocation: 'subscribe_tab',
      intent: 'general_alerts',
    };

  if (mode === 'listen') {
    const musicSurface = resolvePublicMusicSurface({
      releases,
      hasPlayableDestinations: dsps.length > 0,
      catalogLoadFailed,
    });

    if (musicSurface.kind === 'catalog') {
      return (
        <div
          className='-mx-4 space-y-4 pb-2'
          data-testid='profile-primary-tab-releases'
        >
          <div>
            <div className='px-4 pb-2 pt-3'>
              <h2 className='text-xl font-semibold leading-none tracking-[-0.014em] text-white dark:text-white'>
                Music
              </h2>
            </div>
            <ReleasesView
              releases={musicSurface.visibleReleases}
              artistId={artist.id}
              artistHandle={artist.handle}
              artistName={artist.name}
            />
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(NATIVE_PANEL_CLASS_NAME, 'flex min-h-full flex-col')}
        data-testid='profile-primary-tab-listen'
      >
        <div className='px-4 pb-2 pt-3'>
          <h2 className='text-xl font-semibold leading-none tracking-[-0.014em] text-white dark:text-white'>
            Music
          </h2>
        </div>
        {musicSurface.kind === 'error' ? (
          <ProfileMusicErrorState renderMode={renderMode} />
        ) : musicSurface.kind === 'artist-streaming' ? (
          <div
            className='px-4 pb-4'
            data-testid='profile-primary-tab-artist-streaming'
          >
            <StaticListenInterface
              artist={artist}
              handle={artist.handle}
              dspsOverride={dsps}
              containerClassName='max-w-none'
              hideHelpText
              renderMode={renderMode}
            />
          </div>
        ) : (
          <ProfileMusicEmptyState
            artist={artist}
            renderMode={renderMode}
            sourceContext={musicEmptySourceContext}
          />
        )}
      </div>
    );
  }

  if (mode === 'tour') {
    return (
      <div
        className={cn(NATIVE_PANEL_CLASS_NAME, 'flex min-h-full flex-col')}
        data-testid='profile-primary-tab-tour'
      >
        <div className='px-4 pb-2 pt-3'>
          <h2 className='text-xl font-semibold leading-none tracking-[-0.014em] text-white dark:text-white'>
            Shows
          </h2>
        </div>
        <TourDrawerContent
          artist={artist}
          tourDates={[...tourDates]}
          emptyStateSourceContext={eventsEmptySourceContext}
          renderMode={renderMode}
        />
      </div>
    );
  }

  if (mode === 'subscribe') {
    return (
      <SubscribePanel
        artist={artist}
        renderMode={renderMode}
        isSubscribed={isSubscribed}
        contentPrefs={contentPrefs}
        onTogglePref={onTogglePref}
        onUnsubscribe={onUnsubscribe}
        isUnsubscribing={isUnsubscribing}
        notificationsPortalContainer={notificationsPortalContainer}
        subscribeTwoStep={subscribeTwoStep}
        alertOptInVariant={alertOptInVariant}
        previewNotificationsState={previewNotificationsState}
        onFlowClosed={handleSubscribeFlowClosed}
        onSubscriptionActivated={handleSubscriptionActivated}
        keepSubscribeFlowMounted={keepSubscribeFlowMounted}
        sourceContext={subscribeSourceContext}
      />
    );
  }

  return (
    <div className={PANEL_CLASS_NAME} data-testid='profile-primary-tab-about'>
      <SectionIntro title='About' />
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
