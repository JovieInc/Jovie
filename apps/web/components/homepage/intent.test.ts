import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_INTENT_EXPERIMENT_ID,
  HOMEPAGE_INTENT_KEY,
  HOMEPAGE_INTENT_VARIANT_ID,
  PILLS,
} from '@/components/homepage/intent';

describe('homepage intent constants', () => {
  it('HOMEPAGE_INTENT_KEY is a stable contract with /onboarding', () => {
    expect(HOMEPAGE_INTENT_KEY).toBe('jovie_homepage_intent');
  });

  it('experiment and variant ids are stable', () => {
    expect(HOMEPAGE_INTENT_EXPERIMENT_ID).toBe('homepage_intent_pills_v1');
    expect(HOMEPAGE_INTENT_VARIANT_ID).toBe('release_assets_v1');
  });

  it('PILLS exposes the intake pills in order', () => {
    expect(PILLS.map(p => p.id)).toEqual([
      'plan_a_release',
      'generate_album_art',
      'pitch_playlists',
      'build_artist_profile',
      'analyze_momentum',
    ]);
    expect(PILLS.map(p => p.label)).toEqual([
      'Plan a release',
      'Generate album art',
      'Pitch playlists',
      'Build artist profile',
      'Analyze momentum',
    ]);
    expect(PILLS.map(p => p.insertedPrompt)).toEqual([
      'Plan a release for ',
      'Generate album art for ',
      'Pitch playlists for ',
      'Build artist profile for ',
      'Analyze momentum for ',
    ]);
    expect(PILLS.every(p => p.insertedPrompt.endsWith(' '))).toBe(true);
  });
});
