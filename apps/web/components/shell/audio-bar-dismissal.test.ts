import { describe, expect, it } from 'vitest';
import {
  AUDIO_BAR_DISMISSAL_STORAGE_KEY,
  readAudioBarDismissed,
  type StorageLike,
  shouldShowAudioBar,
  writeAudioBarDismissed,
} from './audio-bar-dismissal';

class MemoryStorage implements StorageLike {
  readonly #values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('quota');
  }

  setItem(): void {
    throw new Error('quota');
  }
}

describe('audio bar dismissal persistence', () => {
  it('stays dismissed across a storage round-trip that models reload', () => {
    const storage = new MemoryStorage();

    expect(writeAudioBarDismissed(true, storage)).toBe(true);
    expect(storage.getItem(AUDIO_BAR_DISMISSAL_STORAGE_KEY)).toBe('1');
    expect(readAudioBarDismissed(storage)).toBe(true);
    expect(
      shouldShowAudioBar({
        dismissed: readAudioBarDismissed(storage),
        hasActiveTrack: true,
        explicitPlay: false,
      })
    ).toBe(false);
  });

  it('reopens the bar only after explicit play clears dismissal', () => {
    const storage = new MemoryStorage();
    writeAudioBarDismissed(true, storage);

    expect(
      shouldShowAudioBar({
        dismissed: true,
        hasActiveTrack: true,
        explicitPlay: false,
      })
    ).toBe(false);

    writeAudioBarDismissed(false, storage);

    expect(readAudioBarDismissed(storage)).toBe(false);
    expect(
      shouldShowAudioBar({
        dismissed: false,
        hasActiveTrack: true,
        explicitPlay: true,
      })
    ).toBe(true);
  });

  it('fails closed when storage is unavailable or throws', () => {
    expect(readAudioBarDismissed(null)).toBe(true);
    expect(writeAudioBarDismissed(true, null)).toBe(true);
    expect(() => readAudioBarDismissed(new ThrowingStorage())).not.toThrow();
    expect(readAudioBarDismissed(new ThrowingStorage())).toBe(true);
    expect(() =>
      writeAudioBarDismissed(true, new ThrowingStorage())
    ).not.toThrow();
    expect(
      shouldShowAudioBar({
        dismissed: true,
        hasActiveTrack: true,
        explicitPlay: false,
      })
    ).toBe(false);
  });

  it('does not show the idle bar when dismissed with no track', () => {
    expect(
      shouldShowAudioBar({
        dismissed: true,
        hasActiveTrack: false,
        explicitPlay: false,
      })
    ).toBe(false);
  });
});
