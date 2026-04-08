import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  curateTracklist,
  dedupeTrackIdsByArtist,
  parseTrackIdsFromResponseText,
} from '@/lib/playlists/curate-tracklist';
import type { CandidateTrack } from '@/lib/playlists/discover-tracks';
import type { JovieArtistTrack } from '@/lib/playlists/feature-jovie-artists';

const { createMessageMock, captureErrorMock } = vi.hoisted(() => ({
  createMessageMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class AnthropicMock {
    readonly messages = {
      create: createMessageMock,
    };
  }

  return {
    default: AnthropicMock,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

function makeCandidates(artistByIndex?: (index: number) => string) {
  return Array.from({ length: 12 }, (_, index) => {
    const id = `track-${index + 1}`;
    return {
      id,
      name: `Track ${index + 1}`,
      artist: artistByIndex ? artistByIndex(index) : `Artist ${index + 1}`,
      artistId: `artist-${index + 1}`,
      popularity: 60 - index,
      durationMs: 180_000,
      previewUrl: null,
      albumName: `Album ${index + 1}`,
      albumArtUrl: null,
    } satisfies CandidateTrack;
  });
}

const concept = {
  title: 'Night Drive Synth Pop',
  description: 'A neon city drive with glossy hooks and steady momentum.',
  moodTags: ['night', 'driving', 'synth'],
};

describe('curateTracklist', () => {
  beforeEach(() => {
    createMessageMock.mockReset();
    captureErrorMock.mockReset();
  });

  it('throws early when fewer than 10 candidates are provided', async () => {
    const candidates = makeCandidates().slice(0, 5);

    await expect(
      curateTracklist({
        concept,
        candidates,
        jovieArtistTracks: [] satisfies JovieArtistTrack[],
        targetSize: 10,
      })
    ).rejects.toThrow('Not enough candidate tracks (5). Need at least 10.');

    expect(createMessageMock).not.toHaveBeenCalled();
  });

  it('deduplicates track IDs and prevents adjacent same-artist tracks', async () => {
    const candidates = makeCandidates(index => {
      if (index === 1 || index === 2) return 'Artist B';
      return `Artist ${index + 1}`;
    });

    createMessageMock.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            'track-1',
            'track-2',
            'track-3',
            'track-4',
            'track-1',
            'track-5',
            'track-6',
            'track-7',
            'track-8',
            'track-9',
            'track-10',
            'track-11',
            'track-12',
          ]),
        },
      ],
    });

    const result = await curateTracklist({
      concept,
      candidates,
      jovieArtistTracks: [] satisfies JovieArtistTrack[],
      targetSize: 12,
    });

    expect(result.trackCount).toBeGreaterThanOrEqual(10);
    expect(new Set(result.trackIds).size).toBe(result.trackIds.length);

    const artistLookup = new Map(
      candidates.map(track => [track.id, track.artist])
    );
    for (let index = 1; index < result.trackIds.length; index++) {
      const currentArtist = artistLookup.get(result.trackIds[index]);
      const previousArtist = artistLookup.get(result.trackIds[index - 1]);
      expect(currentArtist).not.toBe(previousArtist);
    }
  });

  it('retries when dedupe drops below the 10-track minimum and then fails closed', async () => {
    const candidates = makeCandidates(() => 'Same Artist');
    const llmSelection = JSON.stringify(
      candidates.slice(0, 10).map(track => track.id)
    );

    createMessageMock
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: llmSelection }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: llmSelection }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: llmSelection }],
      });

    await expect(
      curateTracklist({
        concept,
        candidates,
        jovieArtistTracks: [] satisfies JovieArtistTrack[],
        targetSize: 10,
      })
    ).rejects.toThrow('Failed to curate tracklist after 3 attempts');

    expect(createMessageMock).toHaveBeenCalledTimes(3);
    expect(captureErrorMock).toHaveBeenCalledWith(
      '[Curate Tracklist] Too few tracks after dedupe',
      null,
      expect.objectContaining({ deduped: 1 })
    );
  });

  it('parses fenced JSON responses from the model', async () => {
    const candidates = makeCandidates();
    const fencedTrackList = [
      '```json',
      JSON.stringify(candidates.slice(0, 10).map(track => track.id)),
      '```',
    ].join('\n');

    createMessageMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: fencedTrackList }],
    });

    const result = await curateTracklist({
      concept,
      candidates,
      jovieArtistTracks: [] satisfies JovieArtistTrack[],
      targetSize: 10,
    });

    expect(result.trackCount).toBe(10);
    expect(result.trackIds).toHaveLength(10);
  });

  it('retries when invalid IDs reduce valid results below 10', async () => {
    const candidates = makeCandidates();
    const modelSelection = JSON.stringify([
      ...candidates.slice(0, 8).map(track => track.id),
      'not-a-real-track',
      'also-not-real',
    ]);

    createMessageMock
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: modelSelection }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: modelSelection }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: modelSelection }],
      });

    await expect(
      curateTracklist({
        concept,
        candidates,
        jovieArtistTracks: [] satisfies JovieArtistTrack[],
        targetSize: 10,
      })
    ).rejects.toThrow('Failed to curate tracklist after 3 attempts');

    expect(captureErrorMock).toHaveBeenCalledWith(
      '[Curate Tracklist] Too few valid tracks after filter',
      null,
      expect.objectContaining({ valid: 8 })
    );
  });
});

describe('curateTracklist helpers', () => {
  it('parseTrackIdsFromResponseText extracts fenced JSON payloads', () => {
    const ids = parseTrackIdsFromResponseText(
      [
        '```json',
        '["track-1","track-2","track-3","track-4","track-5","track-6","track-7","track-8","track-9","track-10"]',
        '```',
      ].join('\n')
    );

    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe('track-1');
  });

  it('dedupeTrackIdsByArtist removes duplicates and adjacent same-artist IDs', () => {
    const artistLookup = new Map<string, string>([
      ['track-1', 'Artist A'],
      ['track-2', 'Artist B'],
      ['track-3', 'Artist B'],
      ['track-4', 'Artist C'],
    ]);

    const deduped = dedupeTrackIdsByArtist(
      ['track-1', 'track-2', 'track-3', 'track-1', 'track-4'],
      artistLookup
    );

    expect(deduped).toEqual(['track-1', 'track-2', 'track-4']);
  });
});
