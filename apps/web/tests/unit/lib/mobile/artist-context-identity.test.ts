import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/mobile/chat/artist-context.ts'),
  'utf8'
);
const TURN_HANDLER_SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/mobile/chat/turn-handler.ts'),
  'utf8'
);

describe('mobile artist-context identity contract', () => {
  it('loads the session-authorized profile without a second claims or clerkId gate', () => {
    expect(SOURCE).toContain('eq(creatorProfiles.id, profileId)');
    expect(SOURCE).not.toContain('getExactProfileAccess');
    expect(SOURCE).not.toContain('users.clerkId');
    expect(SOURCE).not.toContain('userClerkId');
    expect(SOURCE).not.toContain('clerkUserId');
  });

  it('keeps chatting with the session profile when the extra lookup misses', () => {
    expect(TURN_HANDLER_SOURCE).toContain('authorizedProfile: session.profile');
    expect(TURN_HANDLER_SOURCE).not.toContain(
      'could not load your artist context'
    );
  });
});
