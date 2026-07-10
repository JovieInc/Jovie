import { describe, expect, it } from 'vitest';
import {
  resolveSocialShortcutPlatforms,
  SOCIAL_SHORTCUT_SLUG_MAP,
  SOCIAL_SHORTCUT_SLUGS,
} from './shortcut-platforms';

describe('resolveSocialShortcutPlatforms', () => {
  it('maps all six short slugs to canonical platform ids', () => {
    expect(resolveSocialShortcutPlatforms('ig')).toEqual(['instagram']);
    expect(resolveSocialShortcutPlatforms('tt')).toEqual(['tiktok']);
    expect(resolveSocialShortcutPlatforms('x')).toEqual(['x', 'twitter']);
    expect(resolveSocialShortcutPlatforms('yt')).toEqual(['youtube']);
    expect(resolveSocialShortcutPlatforms('sp')).toEqual(['spotify']);
    expect(resolveSocialShortcutPlatforms('web')).toEqual(['website']);
  });

  it('accepts full platform name aliases', () => {
    expect(resolveSocialShortcutPlatforms('instagram')).toEqual(['instagram']);
    expect(resolveSocialShortcutPlatforms('TikTok')).toEqual(['tiktok']);
    expect(resolveSocialShortcutPlatforms('twitter')).toEqual(['x', 'twitter']);
    expect(resolveSocialShortcutPlatforms('YOUTUBE')).toEqual(['youtube']);
    expect(resolveSocialShortcutPlatforms('spotify')).toEqual(['spotify']);
    expect(resolveSocialShortcutPlatforms('website')).toEqual(['website']);
  });

  it('trims and lowercases input', () => {
    expect(resolveSocialShortcutPlatforms('  IG  ')).toEqual(['instagram']);
  });

  it('returns null for empty or unknown slugs', () => {
    expect(resolveSocialShortcutPlatforms(null)).toBeNull();
    expect(resolveSocialShortcutPlatforms(undefined)).toBeNull();
    expect(resolveSocialShortcutPlatforms('')).toBeNull();
    expect(resolveSocialShortcutPlatforms('   ')).toBeNull();
    expect(resolveSocialShortcutPlatforms('fb')).toBeNull();
    expect(resolveSocialShortcutPlatforms('linkedin')).toBeNull();
  });

  it('exports the six short slugs as a stable list', () => {
    expect(SOCIAL_SHORTCUT_SLUGS).toEqual(['ig', 'tt', 'x', 'yt', 'sp', 'web']);
    expect(Object.keys(SOCIAL_SHORTCUT_SLUG_MAP)).toEqual(
      SOCIAL_SHORTCUT_SLUGS
    );
  });
});
