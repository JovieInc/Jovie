import { describe, expect, it } from 'vitest';
import {
  PROFILE_MODE_KEYS,
  type ProfileMode,
} from '@/features/profile/contracts';
import { resolveProfileV2Presentation } from '@/features/profile/profile-v2-presentation';

describe('resolveProfileV2Presentation', () => {
  it.each([
    ['profile', { initialOverlay: null, scrollTarget: null }],
    ['tour', { initialOverlay: null, scrollTarget: 'tour' }],
    ['pay', { initialOverlay: 'pay', scrollTarget: null }],
    ['about', { initialOverlay: null, scrollTarget: 'about' }],
    ['listen', { initialOverlay: 'listen', scrollTarget: null }],
    ['subscribe', { initialOverlay: 'subscribe', scrollTarget: null }],
    ['contact', { initialOverlay: 'contact', scrollTarget: null }],
  ] satisfies ReadonlyArray<
    readonly [ProfileMode, unknown]
  >)('maps %s into the expected pane and overlay', (mode, expected) => {
    expect(PROFILE_MODE_KEYS).toContain(mode);
    expect(resolveProfileV2Presentation(mode)).toEqual(expected);
  });
});
