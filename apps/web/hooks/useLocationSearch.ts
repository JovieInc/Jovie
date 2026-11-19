'use client';

import { useSyncExternalStore } from 'react';

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

/** Location query without forcing a statically rendered profile through Suspense. */
export function useLocationSearch(): string | null {
  return useSyncExternalStore(
    subscribeToLocationSearch,
    getLocationSearchSnapshot,
    getServerLocationSearchSnapshot
  );
}
