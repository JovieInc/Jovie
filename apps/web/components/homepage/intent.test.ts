import { describe, expect, it } from 'vitest';
import {
  HERO_COPY,
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

  it('exposes the locked hero copy and CTA contract', () => {
    expect(HERO_COPY.headline).toBe(
      'You make the music.\nJovie runs the business.'
    );
    expect(HERO_COPY.subhead).toBe(
      'It finds what your songs need — the presave, the pitch, the page — drafts it, and waits for your yes.'
    );
    expect(HERO_COPY).not.toHaveProperty('lede');
    expect(HERO_COPY.primaryCta.label).toBe('Claim your free profile');
    expect(HERO_COPY.secondaryCta).toEqual({
      label: 'See a live profile',
      href: '/timwhite',
    });
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
      'Generate pitch',
      'Build artist profile',
      'Analyze momentum',
    ]);
    expect(PILLS.map(p => p.insertedPrompt)).toEqual([
      'Plan a release for ',
      'Generate album art for ',
      'Generate a pitch for ',
      'Build artist profile for ',
      'Analyze momentum for ',
    ]);
    expect(PILLS.every(p => p.insertedPrompt.endsWith(' '))).toBe(true);
  });
});
