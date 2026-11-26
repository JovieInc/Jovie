'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProfileUrl } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  DEFAULT_UPSELL_PLAN,
  getPlanIntent,
  isPaidIntent,
} from '@/lib/auth/plan-intent';
import {
  buildInstagramBioLinkFromHandle,
  INSTAGRAM_EDIT_PROFILE_URL,
  postDistributionEvent,
} from '@/lib/distribution/instagram-activation';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  ONBOARDING_PREVIEW_SNAPSHOT_KEY,
  ONBOARDING_WELCOME_REPLY_KEY,
} from '@/lib/onboarding/session-keys';
import type {
  DiscoverySnapshot,
  SelectedArtist,
  StepId,
} from './onboardingV2Model';

interface UseOnboardingV2ProfileParams {
  readonly anythingElse: string;
  readonly currentStep: StepId;
  readonly discoverySnapshot: DiscoverySnapshot | null;
  readonly existingAvatarUrl: string | null;
  readonly existingBio: string | null;
  readonly existingGenres: string[] | null;
  readonly initialDisplayName: string;
  readonly normalizedInitialHandle: string;
  readonly profileHandle: string;
  readonly profileId: string | null;
  readonly selectedArtist: SelectedArtist | null;
}

/** The profile-ready step: preview snapshot, Instagram bio link, hand-off. */
export function useOnboardingV2Profile({
  anythingElse,
  currentStep,
  discoverySnapshot,
  existingAvatarUrl,
  existingBio,
  existingGenres,
  initialDisplayName,
  normalizedInitialHandle,
  profileHandle,
  profileId,
  selectedArtist,
}: UseOnboardingV2ProfileParams) {
  const router = useRouter();
  const notifications = useNotifications();
  const [didCopyInstagramBioLink, setDidCopyInstagramBioLink] = useState(false);
  const [didOpenInstagram, setDidOpenInstagram] = useState(false);
  const didTrackProfileReadyStepViewRef = useRef(false);

  const previewSnapshot = useMemo(() => {
    const profile = discoverySnapshot?.profile;
    const username =
      profile?.username || profileHandle || normalizedInitialHandle;

    return {
      activeSinceYear: profile?.activeSinceYear ?? null,
      avatarUrl: profile?.avatarUrl ?? existingAvatarUrl,
      bio: profile?.bio ?? existingBio,
      displayName:
        profile?.displayName ||
        selectedArtist?.name ||
        initialDisplayName ||
        username,
      dspConnections: {
        appleMusic: {
          artistName: null,
          connected: profile?.appleMusicConnected ?? false,
        },
        spotify: {
          artistName: selectedArtist?.name || null,
          connected: Boolean(
            selectedArtist || discoverySnapshot?.selectedSpotifyProfile
          ),
        },
      },
      genres: profile?.genres ?? existingGenres,
      hometown: profile?.hometown ?? null,
      links: (discoverySnapshot?.socialItems ?? [])
        .filter(item => item.kind === 'link' && item.state === 'active')
        .map(item => ({
          id: item.id,
          isVisible: true,
          platform: item.platform,
          title: item.platformLabel,
          url: item.url,
        })),
      location: profile?.location ?? null,
      profilePath: `/${username}`,
      username,
    };
  }, [
    discoverySnapshot,
    existingAvatarUrl,
    existingBio,
    existingGenres,
    initialDisplayName,
    normalizedInitialHandle,
    profileHandle,
    selectedArtist,
  ]);
  const publicProfileUrl = useMemo(() => {
    if (!profileHandle) {
      return null;
    }

    return getProfileUrl(profileHandle);
  }, [profileHandle]);
  const instagramBioLink = useMemo(() => {
    if (!profileHandle) {
      return null;
    }

    return buildInstagramBioLinkFromHandle(profileHandle);
  }, [profileHandle]);

  useEffect(() => {
    if (
      currentStep !== 'profile-ready' ||
      !profileId ||
      didTrackProfileReadyStepViewRef.current
    ) {
      return;
    }

    didTrackProfileReadyStepViewRef.current = true;
    void postDistributionEvent({
      eventType: 'step_viewed',
      metadata: { surface: 'onboarding' },
      platform: 'instagram',
      profileId,
    });
  }, [currentStep, profileId]);

  const handleCopyInstagramBioLink = useCallback(async () => {
    if (!instagramBioLink || !profileId) {
      return;
    }

    const didCopy = await copyToClipboard(instagramBioLink);
    if (!didCopy) {
      notifications.error('Failed to copy link');
      return;
    }

    setDidCopyInstagramBioLink(true);
    notifications.success('Instagram bio link copied', { duration: 2000 });
    void postDistributionEvent({
      eventType: 'link_copied',
      metadata: { surface: 'onboarding' },
      platform: 'instagram',
      profileId,
    });
  }, [instagramBioLink, notifications, profileId]);

  const handleOpenInstagram = useCallback(() => {
    if (!profileId) {
      return;
    }

    setDidOpenInstagram(true);
    void postDistributionEvent({
      eventType: 'platform_opened',
      metadata: { surface: 'onboarding' },
      platform: 'instagram',
      profileId,
    });
    globalThis.open(
      INSTAGRAM_EDIT_PROFILE_URL,
      '_blank',
      'noopener,noreferrer'
    );
  }, [profileId]);

  const handleOpenDashboard = useCallback(() => {
    if (profileId && !didCopyInstagramBioLink && !didOpenInstagram) {
      void postDistributionEvent({
        eventType: 'skipped',
        metadata: { surface: 'onboarding' },
        platform: 'instagram',
        profileId,
      });
    }

    try {
      globalThis.sessionStorage?.setItem(
        ONBOARDING_PREVIEW_SNAPSHOT_KEY,
        JSON.stringify(previewSnapshot)
      );
      if (anythingElse.trim()) {
        globalThis.sessionStorage?.setItem(
          ONBOARDING_WELCOME_REPLY_KEY,
          anythingElse.trim()
        );
      } else {
        globalThis.sessionStorage?.removeItem(ONBOARDING_WELCOME_REPLY_KEY);
      }
    } catch {
      // sessionStorage may be unavailable in restricted contexts
    }

    const planIntent = getPlanIntent();
    const hasIntent = isPaidIntent(planIntent);
    const plan = hasIntent ? planIntent : DEFAULT_UPSELL_PLAN;
    const source = hasIntent ? 'intent' : 'organic';
    const chatUrl = `${APP_ROUTES.CHAT}?from=onboarding&panel=profile`;
    const nextUrl = `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=${plan}&source=${source}&returnTo=${encodeURIComponent(chatUrl)}`;

    if (
      'startViewTransition' in document &&
      typeof document.startViewTransition === 'function'
    ) {
      document.startViewTransition(() => {
        router.push(nextUrl);
      });
      return;
    }

    router.push(nextUrl);
  }, [
    anythingElse,
    didCopyInstagramBioLink,
    didOpenInstagram,
    previewSnapshot,
    profileId,
    router,
  ]);

  return {
    didCopyInstagramBioLink,
    didOpenInstagram,
    handleCopyInstagramBioLink,
    handleOpenDashboard,
    handleOpenInstagram,
    publicProfileUrl,
  };
}
