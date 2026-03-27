import { describe, expect, it } from 'vitest';
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
  ])('maps %s into the expected pane and overlay', (mode, expected) => {
    expect(resolveProfileV2Presentation(mode as any)).toEqual(expected);
  });
});
