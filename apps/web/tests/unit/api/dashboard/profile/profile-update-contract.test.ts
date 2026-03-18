import { describe, expect, it } from 'vitest';
import {
  buildProfileUpdateContext,
  parseProfileUpdates,
} from '@/app/api/dashboard/profile/lib';

describe('profile update contract', () => {
  it('rejects hometown when it matches location', async () => {
    const result = parseProfileUpdates({
      displayName: 'Test Artist',
      location: 'Austin, TX',
      hometown: 'Austin, TX',
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new TypeError('Expected hometown/location validation to fail');
    }

    const payload = await result.response.json();
    expect(payload.error).toBe(
      'Hometown must be different from your current location'
    );
  });

  it('maps hometown into settings while keeping location separate', () => {
    const parsed = parseProfileUpdates({
      displayName: 'Test Artist',
      location: 'Austin, TX',
      hometown: 'Tulsa, OK',
      settings: { hide_branding: true },
    });

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      throw new TypeError('Expected valid profile updates');
    }

    const context = buildProfileUpdateContext(parsed.parsed);

    expect(context.dbProfileUpdates).toEqual({
      displayName: 'Test Artist',
      location: 'Austin, TX',
      settings: {
        hide_branding: true,
        hometown: 'Tulsa, OK',
      },
    });
  });
});
