import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSetUpPublicProfile } from '@/lib/profile/profile-setup-eligibility';

describe('canSetUpPublicProfile', () => {
  it.each(['banned', 'suspended', 'waitlist_pending'])('blocks %s', status => {
    expect(canSetUpPublicProfile(status)).toBe(false);
  });

  it.each(['active', 'waitlist_approved', 'profile_claimed', null, undefined])(
    'allows %s',
    status => {
      expect(canSetUpPublicProfile(status)).toBe(true);
    }
  );

  it('is used by every path that creates a public claimed profile for a user', () => {
    const root = join(__dirname, '../../..');
    for (const file of [
      'lib/mobile/complete-profile.ts',
      'app/app/(shell)/dashboard/actions/switch-profile.ts',
    ]) {
      expect(readFileSync(join(root, file), 'utf8')).toContain(
        'canSetUpPublicProfile'
      );
    }
  });
});
