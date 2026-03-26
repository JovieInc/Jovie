import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
} from '@/lib/services/pitch/prompts';
import type { PitchInput } from '@/lib/services/pitch/types';

const FULL_INPUT: PitchInput = {
  artist: {
    displayName: 'Test Artist',
    bio: 'An electronic music producer from LA',
    genres: ['electronic', 'house'],
    location: 'Los Angeles, CA',
    activeSinceYear: 2018,
    spotifyFollowers: 15000,
    spotifyPopularity: 45,
    pitchContext:
      '500K+ streams on Spotify. Featured on New Music Friday twice. Recent radio play on KCRW.',
    targetPlaylists: ['Pollen', 'mint'],
  },
  release: {
    title: 'Midnight Drive',
    releaseDate: new Date('2026-04-15'),
    releaseType: 'single',
    genres: ['deep house', 'melodic techno'],
    totalTracks: 1,
    label: 'Indie Records',
    distributor: 'DistroKid',
  },
  tracks: [
    {
      title: 'Midnight Drive',
      durationMs: 240000,
      creditNames: ['Test Artist', 'Featured Singer'],
    },
  ],
};

const MINIMAL_INPUT: PitchInput = {
  artist: {
    displayName: 'Solo Act',
    bio: null,
    genres: null,
    location: null,
    activeSinceYear: null,
    spotifyFollowers: null,
    spotifyPopularity: null,
    pitchContext: null,
    targetPlaylists: null,
  },
  release: {
    title: 'Untitled',
    releaseDate: null,
    releaseType: 'single',
    genres: null,
    totalTracks: 1,
    label: null,
    distributor: null,
  },
  tracks: [],
};

describe('buildSystemPrompt', () => {
  it('returns a non-empty string with platform limits', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('500');
    expect(prompt).toContain('300');
    expect(prompt).toContain('Spotify');
    expect(prompt).toContain('Apple Music');
    expect(prompt).toContain('Amazon');
  });

  it('instructs not to fabricate stats', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('never fabricate');
  });

  it('instructs first-person voice', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('first person');
  });

  it('includes the 3-beat formula', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('EMOTIONAL CORE');
    expect(prompt).toContain('SONIC PLACEMENT');
    expect(prompt).toContain('CONTEXT + FIT');
  });

  it('includes anti-pattern rules', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('never use hype words');
    expect(prompt.toLowerCase()).toContain('never include links');
    expect(prompt.toLowerCase()).toContain('never include streaming stats');
    expect(prompt.toLowerCase()).toContain('never copy-paste');
  });

  it('includes an example pitch', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('EXAMPLE');
    expect(prompt).toContain('4AM Mercy');
  });
});

describe('buildUserPrompt', () => {
  it('includes all artist data fields when provided', () => {
    const prompt = buildUserPrompt(FULL_INPUT);
    expect(prompt).toContain('Test Artist');
    expect(prompt).toContain('electronic');
    expect(prompt).toContain('Los Angeles');
    expect(prompt).toContain('15,000');
    expect(prompt).toContain('45/100');
    expect(prompt).toContain('2018');
  });

  it('includes pitch context when provided', () => {
    const prompt = buildUserPrompt(FULL_INPUT);
    expect(prompt).toContain('500K+ streams');
    expect(prompt).toContain('New Music Friday');
    expect(prompt).toContain('KCRW');
  });

  it('includes target playlists when provided', () => {
    const prompt = buildUserPrompt(FULL_INPUT);
    expect(prompt).toContain('Target Playlists');
    expect(prompt).toContain('Pollen');
    expect(prompt).toContain('mint');
  });

  it('shows fallback text when no target playlists', () => {
    const prompt = buildUserPrompt(MINIMAL_INPUT);
    expect(prompt).toContain('Target Playlists');
    expect(prompt).toContain('suggest');
  });

  it('includes release data', () => {
    const prompt = buildUserPrompt(FULL_INPUT);
    expect(prompt).toContain('Midnight Drive');
    expect(prompt).toContain('single');
    expect(prompt).toContain('2026-04-15');
    expect(prompt).toContain('Indie Records');
    expect(prompt).toContain('DistroKid');
  });

  it('includes track credits', () => {
    const prompt = buildUserPrompt(FULL_INPUT);
    expect(prompt).toContain('Featured Singer');
    expect(prompt).toContain('4:00');
  });

  it('handles minimal input without errors', () => {
    const prompt = buildUserPrompt(MINIMAL_INPUT);
    expect(prompt).toContain('Solo Act');
    expect(prompt).toContain('Untitled');
    expect(prompt).not.toContain('null');
  });

  it('does not include pitch context section when empty', () => {
    const prompt = buildUserPrompt(MINIMAL_INPUT);
    expect(prompt).not.toContain('Artist-Provided Context');
  });
});
