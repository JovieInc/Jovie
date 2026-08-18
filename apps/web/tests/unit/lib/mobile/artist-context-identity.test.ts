import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/mobile/chat/artist-context.ts'),
  'utf8'
);

describe('mobile artist-context identity contract', () => {
  it('loads the session-authorized profile without a second claims or clerkId gate', () => {
    expect(SOURCE).toContain('eq(creatorProfiles.id, input.profileId)');
    expect(SOURCE).not.toContain('getExactProfileAccess');
    expect(SOURCE).not.toContain('users.clerkId');
    expect(SOURCE).not.toContain('userClerkId');
    expect(SOURCE).not.toContain('clerkUserId');
  });
});
