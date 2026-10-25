import { describe, expect, it } from 'vitest';
import {
  normalizeSongTitle,
  resolveTitleReleaseLink,
} from '@/lib/youtube-library/title-link';

const rec = (
  id: string,
  releaseId: string | null,
  durationMs: number | null
) => ({
  id,
  isrc: null,
  releaseId,
  title: 'Seaside Heights',
  durationMs,
});

describe('normalizeSongTitle', () => {
  it('strips artist prefix, video noise and feat clauses', () => {
    expect(
      normalizeSongTitle('Tim White - Seaside Heights (Official Lyric Video)')
    ).toBe('seasideheights');
    expect(
      normalizeSongTitle(
        'Take Me Over (Feat. Erica Gibson) Official Lyric Video'
      )
    ).toBe('takemeover');
  });
});

describe('resolveTitleReleaseLink', () => {
  const video = {
    title: 'Tim White - Seaside Heights (Lyric Video)',
    durationSeconds: 200,
  };

  it('auto-approves a unique title with matching duration', () => {
    const r = resolveTitleReleaseLink({
      video,
      catalog: [rec('a', 'solo', 200_000)],
    });
    expect(r).toMatchObject({
      status: 'approved',
      releaseId: 'solo',
      matchSource: 'title_match',
    });
  });

  it('picks the version whose duration fits among same-title releases', () => {
    const r = resolveTitleReleaseLink({
      video,
      catalog: [rec('a', 'vigel', 240_000), rec('b', 'solo', 201_000)],
    });
    expect(r).toMatchObject({ status: 'approved', releaseId: 'solo' });
    expect(r?.confidence).toBeLessThan(0.85);
  });

  it('queues for review when versions cannot be told apart', () => {
    const r = resolveTitleReleaseLink({
      video,
      catalog: [rec('a', 'vigel', 200_000), rec('b', 'solo', 200_500)],
    });
    expect(r).toMatchObject({ status: 'pending_review', releaseId: null });
  });

  it('never auto-links a unique title when the duration differs', () => {
    const r = resolveTitleReleaseLink({
      video,
      catalog: [rec('a', 'vigel', 245_000)],
    });
    expect(r?.status).toBe('pending_review');
  });

  it('returns null with no same-title release', () => {
    expect(
      resolveTitleReleaseLink({
        video: { title: 'Other Song', durationSeconds: 100 },
        catalog: [rec('a', 'solo', 100_000)],
      })
    ).toBeNull();
  });
});
