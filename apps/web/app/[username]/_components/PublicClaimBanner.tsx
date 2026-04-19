'use client';

import { useSyncExternalStore } from 'react';
import { ClaimBanner } from '@/features/profile/ClaimBanner';
import type { ProfileVisitorState } from '@/lib/claim/types';
import { resolveClaimBannerState } from '../_lib/claim-banner-state';

interface PublicClaimBannerProps {
  readonly profileHandle: string;
  readonly displayName: string;
  readonly directClaimSupported: boolean;
  readonly isClaimed: boolean;
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

function getLocationSearchSnapshot(): string {
  if (globalThis.location === undefined) {
    return '';
  }

  return globalThis.location.search;
}

export function PublicClaimBanner({
  profileHandle,
  displayName,
  directClaimSupported,
  isClaimed,
  visitorState,
}: PublicClaimBannerProps) {
  const locationSearch = useSyncExternalStore(
    subscribeToLocationSearch,
    getLocationSearchSnapshot,
    () => ''
  );
  const claimSearchParam =
    new URLSearchParams(locationSearch).get('claim') ?? undefined;
  const { claimBannerVariant, shouldShowClaimBanner } = resolveClaimBannerState(
    {
      visitorState,
      claimSearchParam,
      directClaimSupported,
      isClaimed,
    }
  );

  if (!shouldShowClaimBanner) {
    return null;
  }

  return (
    <ClaimBanner
      profileHandle={profileHandle}
      displayName={displayName}
      variant={claimBannerVariant ?? undefined}
      ctaHref={
        claimBannerVariant === 'unsupported'
          ? undefined
          : `/${encodeURIComponent(profileHandle)}/claim?next=auth`
      }
    />
  );
}
