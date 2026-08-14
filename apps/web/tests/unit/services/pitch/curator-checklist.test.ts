import { describe, expect, it } from 'vitest';
import {
  formatPitchChecklistForPrompt,
  getPitchChecklistStatus,
  PITCH_GRILL_PROCEDURE,
} from '@/lib/services/pitch/curator-checklist';

describe('getPitchChecklistStatus', () => {
  it('refuses to treat missing listen link and why-this-playlist as known', () => {
    const status = getPitchChecklistStatus({
      artistName: 'Luna Waves',
      title: 'Neon Reef',
      genres: ['dream pop'],
      releaseDate: new Date('2026-06-19'),
      targetPlaylists: null,
      whyText: null,
      instructions: null,
    });

    expect(status.allResolved).toBe(false);
    expect(status.firstMissing?.id).toBe('whyTwoSentences');
    expect(status.items.find(item => item.id === 'listenLink')?.status).toBe(
      'unknown'
    );
    expect(
      status.items.find(item => item.id === 'whyThisPlaylist')?.status
    ).toBe('unknown');
  });

  it('resolves a listen link and playlist fit from instructions', () => {
    const status = getPitchChecklistStatus({
      artistName: 'Luna Waves',
      title: 'Neon Reef',
      genres: ['dream pop'],
      releaseDate: '2026-06-19',
      targetPlaylists: ['Pollen'],
      whyText: 'I wrote it after a night swim in Miami.',
      instructions:
        'Private link https://open.spotify.com/track/demo belongs on Pollen.',
    });

    expect(status.allResolved).toBe(true);
    expect(status.items.find(item => item.id === 'listenLink')?.value).toBe(
      'https://open.spotify.com/track/demo'
    );
  });

  it('honors explicit UNKNOWN markers so drafting can proceed without inventing', () => {
    const status = getPitchChecklistStatus({
      artistName: 'Luna Waves',
      title: 'Neon Reef',
      genres: ['dream pop'],
      releaseDate: new Date('2026-06-19'),
      targetPlaylists: ['Pollen'],
      whyText: 'Night-swim song.',
      instructions: 'UNKNOWN: listenLink',
    });

    expect(status.items.find(item => item.id === 'listenLink')?.status).toBe(
      'unknown'
    );
    expect(formatPitchChecklistForPrompt(status)).toContain(
      'Spotify or private listen link: UNKNOWN'
    );
  });
});

describe('PITCH_GRILL_PROCEDURE', () => {
  it('asks one missing field at a time before drafting', () => {
    expect(PITCH_GRILL_PROCEDURE).toContain('ONE missing field');
    expect(PITCH_GRILL_PROCEDURE).toContain('Dear Curator');
    expect(PITCH_GRILL_PROCEDURE).toContain('never invent a listen URL');
  });
});
