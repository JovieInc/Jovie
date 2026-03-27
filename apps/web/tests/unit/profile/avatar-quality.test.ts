import { describe, expect, it } from 'vitest';
import { resolveAvatarQuality } from '@/lib/profile/avatar-quality';

describe('resolveAvatarQuality', () => {
  it('returns ok when the shortest side is at least 512px', () => {
    expect(resolveAvatarQuality(1024, 512)).toEqual({
      status: 'ok',
      width: 1024,
      height: 512,
    });
  });

  it('returns low when the shortest side is below 512px', () => {
    expect(resolveAvatarQuality(640, 480)).toEqual({
      status: 'low',
      width: 640,
      height: 480,
    });
  });

  it('returns unknown when metadata is missing', () => {
    expect(resolveAvatarQuality(null, 480)).toEqual({
      status: 'unknown',
      width: null,
      height: null,
    });
  });
});
