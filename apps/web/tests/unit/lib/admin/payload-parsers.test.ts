import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  parseToggleFeaturedPayload,
  parseToggleVerifyPayload,
} from '@/lib/admin/payload-parsers';

describe('admin payload parsers', () => {
  it('parses toggle verify payload from valid form-data booleans', async () => {
    const request = new NextRequest('http://localhost/admin/verify', {
      method: 'POST',
      body: new URLSearchParams({
        profileId: 'profile_1',
        nextVerified: 'false',
      }),
    });

    const payload = await parseToggleVerifyPayload(request);

    expect(payload).toEqual({ profileId: 'profile_1', nextVerified: false });
  });

  it('rejects invalid boolean strings for toggle verify form-data', async () => {
    const request = new NextRequest('http://localhost/admin/verify', {
      method: 'POST',
      body: new URLSearchParams({
        profileId: 'profile_1',
        nextVerified: 'yes',
      }),
    });

    await expect(parseToggleVerifyPayload(request)).rejects.toThrow(
      'nextVerified must be "true" or "false"'
    );
  });

  it('rejects invalid boolean strings for toggle featured form-data', async () => {
    const request = new NextRequest('http://localhost/admin/featured', {
      method: 'POST',
      body: new URLSearchParams({
        profileId: 'profile_1',
        nextFeatured: '1',
      }),
    });

    await expect(parseToggleFeaturedPayload(request)).rejects.toThrow(
      'nextFeatured must be "true" or "false"'
    );
  });
});
