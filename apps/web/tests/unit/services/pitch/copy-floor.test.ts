import { describe, expect, it, vi } from 'vitest';

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock('@/lib/ai/sdk', () => ({
  gateway: vi.fn(() => 'mock-model'),
  generateObject: mockGenerateObject,
}));

vi.mock('@/lib/ai/telemetry', () => ({
  buildAiTelemetry: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/pitch/prompts', () => ({
  buildSystemPrompt: vi.fn(() => 'system'),
  buildUserPrompt: vi.fn(() => 'user'),
  buildPitchDraftSystemPrompt: vi.fn(() => 'system'),
  buildPitchDraftUserPrompt: vi.fn(() => 'user'),
}));

import { CopyFloorViolationError } from '@/lib/copy/outbound-floor';
import { generatePitches } from '@/lib/services/pitch/pitch-generator';
import type { PitchInput } from '@/lib/services/pitch/types';

const INPUT: PitchInput = {
  artist: {
    displayName: 'Test Artist',
    bio: null,
    genres: null,
    location: null,
    activeSinceYear: null,
    spotifyFollowers: null,
    spotifyPopularity: null,
    careerHighlights: null,
    targetPlaylists: null,
  },
  release: {
    title: 'Neon Sky',
    releaseDate: null,
    releaseType: 'single',
    genres: null,
    totalTracks: 1,
    label: null,
    distributor: null,
  },
  tracks: [],
};

describe('pitch generator copy floor (JOV-6616)', () => {
  it('returns pitches that pass the customer-voice floor', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        spotify: 'A new single from an emerging LA producer.',
        appleMusic: 'Fresh melodic techno for late-night playlists.',
        amazon: 'A debut single with a strong hook.',
        generic: 'A debut single with a strong hook.',
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generatePitches(INPUT);
    expect(result.pitches.spotify).toContain('emerging LA producer');
  });

  it('throws CopyFloorViolationError when a pitch breaks the floor', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        spotify: 'We guarantee playlist placements for this track.',
        appleMusic: 'ok',
        amazon: 'ok',
        generic: 'ok',
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await expect(generatePitches(INPUT)).rejects.toBeInstanceOf(
      CopyFloorViolationError
    );
  });
});
