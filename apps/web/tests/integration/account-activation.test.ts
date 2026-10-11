import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { readAccountActivation } from '@/lib/db/queries/account-activation';
import { users } from '@/lib/db/schema/auth';
import { chatConversations } from '@/lib/db/schema/chat';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { setupDatabaseBeforeAll } from '../setup-db';

vi.mock('server-only', () => ({}));
setupDatabaseBeforeAll();

const userIds: string[] = [];
const profileIds: string[] = [];
const waitlistIds: string[] = [];

afterEach(async () => {
  if (userIds.length) {
    await db
      .delete(chatConversations)
      .where(inArray(chatConversations.userId, userIds));
    await db
      .delete(userProfileClaims)
      .where(inArray(userProfileClaims.userId, userIds));
  }
  if (profileIds.length)
    await db
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, profileIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  if (waitlistIds.length)
    await db
      .delete(waitlistEntries)
      .where(inArray(waitlistEntries.id, waitlistIds));
  userIds.length = profileIds.length = waitlistIds.length = 0;
});

describe('persisted account activation diagnosis', () => {
  it('correlates counts and conversation state per account, preserving missing waitlist and excluding deleted/unrequested accounts', async () => {
    const suffix = randomUUID();
    const waitlistId = randomUUID();
    waitlistIds.push(waitlistId);
    await db.insert(waitlistEntries).values({
      id: waitlistId,
      email: `activation-${suffix}@example.test`,
      emailNormalized: `activation-${suffix}@example.test`,
      status: 'new',
    });
    const [a, b, deleted, unrequested] = Array.from({ length: 4 }, () =>
      randomUUID()
    );
    userIds.push(a, b, deleted, unrequested);
    await db.insert(users).values(
      userIds.map((id, i) => ({
        id,
        email: `activation-${suffix}-${i}@example.test`,
        userStatus: 'active' as const,
        waitlistEntryId: id === a ? waitlistId : null,
        deletedAt: id === deleted ? new Date() : null,
      }))
    );
    profileIds.push(...Array.from({ length: 3 }, () => randomUUID()));
    await db.insert(creatorProfiles).values(
      profileIds.map((id, i) => ({
        id,
        userId: i < 2 ? a : unrequested,
        creatorType: 'artist' as const,
        username: `activation-${suffix}-${i}`,
        usernameNormalized: `activation-${suffix}-${i}`,
        isClaimed: i !== 1,
      }))
    );
    // Role membership is separate from legacy profile ownership and the
    // founder metric: b manages a's profile but owns no claimed profile.
    await db.insert(userProfileClaims).values({
      userId: b,
      creatorProfileId: profileIds[0],
      role: 'manager',
    });
    await db.insert(chatConversations).values([
      { userId: a, sessionId: randomUUID() },
      { userId: b, sessionId: null },
      { userId: unrequested, sessionId: randomUUID() },
    ]);

    const result = await readAccountActivation([a, b, deleted, a]);
    expect(result).toHaveLength(2);
    const byId = new Map(result.map(row => [row.id, row]));
    expect(byId.get(a)).toEqual({
      id: a,
      accountStatus: 'active',
      waitlistLinked: true,
      waitlistStatus: 'new',
      attachedOnboardingConversation: true,
      ownedProfileCount: 2,
      claimedProfileCount: 1,
      roleClaimCount: 0,
    });
    expect(byId.get(b)).toEqual({
      id: b,
      accountStatus: 'active',
      waitlistLinked: false,
      waitlistStatus: null,
      attachedOnboardingConversation: false,
      ownedProfileCount: 0,
      claimedProfileCount: 0,
      roleClaimCount: 1,
    });
    expect(byId.has(deleted)).toBe(false);
    expect(byId.has(unrequested)).toBe(false);
  });
});
