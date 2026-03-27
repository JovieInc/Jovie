import { describe, expect, it } from 'vitest';
import {
  PROFILE_MODE_KEYS,
  type ProfileMode,
} from '@/features/profile/contracts';
import { resolveProfileV2Presentation } from '@/features/profile/profile-v2-presentation';

describe('resolveProfileV2Presentation', () => {
  it.each([
    ['profile', { initialPane: 'profile', initialOverlay: null }],
    ['tour', { initialPane: 'tour', initialOverlay: null }],
    ['tip', { initialPane: 'tip', initialOverlay: null }],
    ['about', { initialPane: 'about', initialOverlay: null }],
    ['listen', { initialPane: 'profile', initialOverlay: 'listen' }],
    ['subscribe', { initialPane: 'profile', initialOverlay: 'subscribe' }],
    ['contact', { initialPane: 'profile', initialOverlay: 'contact' }],
  ] satisfies ReadonlyArray<
    readonly [ProfileMode, unknown]
  >)('maps %s into the expected pane and overlay', (mode, expected) => {
    expect(PROFILE_MODE_KEYS).toContain(mode);
    expect(resolveProfileV2Presentation(mode)).toEqual(expected);
  });
});
