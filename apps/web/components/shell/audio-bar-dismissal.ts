export const AUDIO_BAR_DISMISSAL_STORAGE_KEY = 'jovie.audio-bar.dismissed';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioBarVisibilityInput {
  readonly dismissed: boolean;
  readonly hasActiveTrack: boolean;
  readonly explicitPlay: boolean;
}

type DismissalListener = (dismissed: boolean) => void;

const dismissalListeners = new Set<DismissalListener>();

function emitDismissal(dismissed: boolean): void {
  for (const listener of dismissalListeners) {
    listener(dismissed);
  }
}

export function subscribeAudioBarDismissal(
  listener: DismissalListener
): () => void {
  dismissalListeners.add(listener);
  return () => {
    dismissalListeners.delete(listener);
  };
}

function getDefaultStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    return storage;
  } catch {
    return null;
  }
}

/**
 * Fail closed: unreadable or unavailable storage is treated as dismissed so
 * a storage exception cannot resurrect the bar.
 */
export function readAudioBarDismissed(storage?: StorageLike | null): boolean {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return true;
  try {
    return store.getItem(AUDIO_BAR_DISMISSAL_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * Persist dismissal. Storage exceptions are swallowed so dismiss never throws.
 * Returns the in-memory dismissed value the caller should keep.
 */
export function writeAudioBarDismissed(
  dismissed: boolean,
  storage?: StorageLike | null
): boolean {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) {
    emitDismissal(dismissed);
    return dismissed;
  }
  try {
    store.setItem(AUDIO_BAR_DISMISSAL_STORAGE_KEY, dismissed ? '1' : '0');
    emitDismissal(dismissed);
    return dismissed;
  } catch {
    emitDismissal(dismissed);
    return dismissed;
  }
}

export function shouldShowAudioBar(input: AudioBarVisibilityInput): boolean {
  if (input.explicitPlay) return input.hasActiveTrack;
  if (input.dismissed) return false;
  return input.hasActiveTrack;
}
