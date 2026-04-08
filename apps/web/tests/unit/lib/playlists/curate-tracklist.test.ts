import { beforeEach, describe, expect, it, vi } from 'vitest';
import { curateTracklist } from '@/lib/playlists/curate-tracklist';
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
});
