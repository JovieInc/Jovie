import { describe, expect, it } from 'vitest';
import type { TeleprompterTakeSummary } from '@/lib/teleprompter/takes/contract';
import { libraryAssetMatchesView } from './library-data';
import {
  buildLibraryTakeAssets,
  isLibraryTakeAsset,
  libraryWorkPresentation,
} from './library-take-assets';

function take(
  overrides: Partial<TeleprompterTakeSummary> = {}
): TeleprompterTakeSummary {
  return {
    takeId: 'take_1',
    takeNumber: 3,
    title: 'Save the Night intro',
    kind: 'promo',
    source: 'script',
    durationMs: 42_000,
    kept: false,
    createdAt: '2026-11-08T00:00:00.000Z',
    mediaUrl: '/api/teleprompter/takes/take_1/media',
    ...overrides,
  };
}

describe('library take assets', () => {
  it('lists a take as a private video that plays through the owner route', () => {
    const [asset] = buildLibraryTakeAssets([take()], 'Tim White');

    expect(asset).toMatchObject({
      id: 'take-take_1',
      itemKind: 'video',
      catalogType: 'media',
      title: 'Save the Night intro · Take 3',
      artist: 'Tim White',
      profileVisibility: 'hidden',
      status: 'draft',
      lifecycleStage: 'idea',
      itemStatusLabel: 'Take',
      primaryActionLabel: 'Watch Take',
      primaryActionHref: '/api/teleprompter/takes/take_1/media',
      videoUrl: '/api/teleprompter/takes/take_1/media',
      totalDurationMs: 42_000,
    });
    expect(asset?.providers).toEqual([]);
    expect(asset?.description).toBeUndefined();
  });

  it('marks kept takes and carries the interviewer question', () => {
    const [asset] = buildLibraryTakeAssets(
      [take({ kept: true, source: 'answer', question: 'Why this song?' })],
      'Tim White'
    );

    expect(asset).toMatchObject({
      itemStatusLabel: 'Kept Take',
      lifecycleStage: 'in_progress',
      description: 'Why this song?',
    });
  });

  it('falls back to a plain title when the script has none', () => {
    const [asset] = buildLibraryTakeAssets([take({ title: '  ' })], 'Tim');
    expect(asset?.title).toBe('Take 3');
  });

  it('shows takes in All, Media and Videos but not Releases', () => {
    const [asset] = buildLibraryTakeAssets([take()], 'Tim White');
    if (!asset) throw new Error('expected a take asset');
    expect(libraryAssetMatchesView(asset, 'all')).toBe(true);
    expect(libraryAssetMatchesView(asset, 'media')).toBe(true);
    expect(libraryAssetMatchesView(asset, 'videos')).toBe(true);
    expect(libraryAssetMatchesView(asset, 'releases')).toBe(false);
  });

  it('gives a take no public presentation, but keeps it for other work', () => {
    const [asset] = buildLibraryTakeAssets([take()], 'Tim White');
    if (!asset) throw new Error('expected a take asset');

    expect(isLibraryTakeAsset(asset)).toBe(true);
    expect(libraryWorkPresentation(asset)).toBeNull();
    expect(libraryWorkPresentation(null)).toBeNull();
    expect(
      libraryWorkPresentation({ ...asset, id: 'youtube-1' })
    ).toMatchObject({ objectId: 'youtube-1', profileVisibility: 'hidden' });
  });
});
