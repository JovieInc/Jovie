'use client';

import { useSyncExternalStore } from 'react';
import { ClaimBanner } from '@/features/profile/ClaimBanner';
import type { ProfileVisitorState } from '@/lib/claim/types';
import { resolveClaimBannerState } from '../_lib/claim-banner-state';

interface PublicClaimBannerProps {
  readonly profileHandle: string;
  readonly displayName: string;
  readonly directClaimSupported: boolean;
  readonly claimRequiresVerification?: boolean;
  readonly isClaimed: boolean;
  readonly prefetch?: boolean;
  readonly visitorState: ProfileVisitorState;
}

const LOCATION_SEARCH_CHANGE_EVENT =
  'jovie:claim-banner-location-search-change';
const HISTORY_PATCHED = Symbol('jovie.claim-banner-location-search-patched');

type PatchedHistoryMethod = History['pushState'] & {
  [HISTORY_PATCHED]?: true;
};

function patchHistoryEvents() {
  if (globalThis.history === undefined) {
    return;
  }

  const { pushState, replaceState } = globalThis.history;
  const patchedPushState = pushState as PatchedHistoryMethod;
  const patchedReplaceState = replaceState as PatchedHistoryMethod;

  if (
    patchedPushState[HISTORY_PATCHED] &&
    patchedReplaceState[HISTORY_PATCHED]
  ) {
    return;
  }

  const dispatchChange = () => {
    globalThis.dispatchEvent(new Event(LOCATION_SEARCH_CHANGE_EVENT));
  };

  const nextPushState: PatchedHistoryMethod = function patchedPushState(
    this: History,
    ...args: Parameters<History['pushState']>
  ) {
    pushState.apply(this, args);
    dispatchChange();
  };

  const nextReplaceState: PatchedHistoryMethod = function patchedReplaceState(
    this: History,
    ...args: Parameters<History['replaceState']>
  ) {
    replaceState.apply(this, args);
    dispatchChange();
  };

  nextPushState[HISTORY_PATCHED] = true;
  nextReplaceState[HISTORY_PATCHED] = true;
  globalThis.history.pushState = nextPushState;
  globalThis.history.replaceState = nextReplaceState;
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  if (globalThis.location === undefined) {
    return () => undefined;
  }

  patchHistoryEvents();
  globalThis.addEventListener('popstate', onStoreChange);
  globalThis.addEventListener(LOCATION_SEARCH_CHANGE_EVENT, onStoreChange);

  return () => {
    globalThis.removeEventListener('popstate', onStoreChange);
    globalThis.removeEventListener(LOCATION_SEARCH_CHANGE_EVENT, onStoreChange);
  };
}

function getLocationSearchSnapshot(): string | null {
  if (globalThis.location === undefined) {
    return null;
  }

  return globalThis.location.search;
}

// The profile page is static, so the server never sees the visitor's query
// string. Null marks "not known yet" until hydration reads the real URL.
function getServerLocationSearchSnapshot(): null {
  return null;
}

export function PublicClaimBanner({
  profileHandle,
  displayName,
  directClaimSupported,
  claimRequiresVerification = false,
  isClaimed,
  prefetch,
  visitorState,
}: PublicClaimBannerProps) {
  const locationSearch = useSyncExternalStore(
    subscribeToLocationSearch,
    getLocationSearchSnapshot,
    getServerLocationSearchSnapshot
  );
  const locationKnown = locationSearch !== null;
  const claimSearchParam =
    new URLSearchParams(locationSearch ?? '').get('claim') ?? undefined;
  const bannerInputs = {
    visitorState,
    directClaimSupported,
    claimRequiresVerification,
    isClaimed,
  };
  const { claimBannerVariant, shouldShowClaimBanner } = resolveClaimBannerState(
    { ...bannerInputs, claimSearchParam }
  );
  // A claim link lands on ?claim=1, which only the browser can read. Reserve
  // the room for both copies so the banner never changes height on hydration.
  const alternateVariant = resolveClaimBannerState({
    ...bannerInputs,
    claimSearchParam: claimSearchParam === '1' ? undefined : '1',
  }).claimBannerVariant;

  if (!shouldShowClaimBanner) {
    return null;
  }

  return (
    <ClaimBanner
      profileHandle={profileHandle}
      displayName={displayName}
      prefetch={prefetch}
      variant={claimBannerVariant ?? undefined}
      reserveVariant={alternateVariant ?? undefined}
      trackExposure={locationKnown}
      ctaHref={
        claimBannerVariant === 'unsupported'
          ? undefined
          : `/${encodeURIComponent(profileHandle)}/claim?next=auth`
      }
    />
  );
}
