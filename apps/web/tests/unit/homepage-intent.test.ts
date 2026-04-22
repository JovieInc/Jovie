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

  it('PILLS exposes the four release-adjacent pills in order', () => {
    expect(PILLS.map(p => p.id)).toEqual([
      'create_release_page',
      'generate_album_art',
      'generate_playlist_pitch',
      'plan_a_release',
    ]);
    expect(PILLS.map(p => p.label)).toEqual([
      'Create release page',
      'Generate album art',
      'Generate playlist pitch',
      'Plan a release',
    ]);
    expect(PILLS.every(p => p.insertedPrompt.endsWith(' '))).toBe(true);
  });
});
