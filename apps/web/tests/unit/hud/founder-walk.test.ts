import { describe, expect, it } from 'vitest';
import {
  captureVideoFileName,
  isAccountVideoUrl,
} from '@/lib/capture/account-video';
import { isFounderWalkBlobUrl } from '@/lib/hud/founder-walk';

describe('account video store', () => {
  it('names capture files by purpose and time', () => {
    expect(
      captureVideoFileName('founder_walk', new Date('2026-08-17T12:00:00.000Z'))
    ).toBe('founder_walk-2026-08-17T12-00-00-000Z.webm');
  });

  it('accepts only https account video hosts', () => {
    expect(
      isAccountVideoUrl('https://abc.blob.vercel-storage.com/walk.webm')
    ).toBe(true);
    expect(
      isFounderWalkBlobUrl('https://abc.blob.vercel-storage.com/walk.webm')
    ).toBe(true);
    expect(isAccountVideoUrl('https://example.com/walk.webm')).toBe(false);
    expect(isAccountVideoUrl('not-a-url')).toBe(false);
  });
});
