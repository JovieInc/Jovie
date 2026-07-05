const COMPLETED_KEY_PREFIX = 'jovie:teleprompter:completed:';

function storageKey(profileId: string): string {
  return `${COMPLETED_KEY_PREFIX}${profileId}`;
}

function readStorage(): Storage | null {
  if (globalThis.window === undefined) return null;
  try {
    return globalThis.window.localStorage;
  } catch {
    return null;
  }
}

export function hasCompletedTeleprompterRecording(profileId: string): boolean {
  const storage = readStorage();
  if (!storage) return false;
  return storage.getItem(storageKey(profileId)) === '1';
}

export function markTeleprompterRecordingCompleted(profileId: string): void {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(profileId), '1');
  } catch {
    // Best-effort only — analytics remain the source of truth for funnel metrics.
  }
}

export function shouldShowTeleprompterShowcase(
  profileId: string,
  showcaseVariant: 'interstitial' | 'direct'
): boolean {
  if (showcaseVariant !== 'interstitial') return false;
  return !hasCompletedTeleprompterRecording(profileId);
}
