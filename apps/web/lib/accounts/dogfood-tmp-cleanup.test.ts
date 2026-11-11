// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { users } from '@/lib/db/schema/auth';
import { baSessions, baUsers } from '@/lib/db/schema/better-auth';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { FOUNDER_REVIEW_SOURCE } from '@/lib/founder-review/contract';
import { FOUNDER_EMAIL_DOMAIN } from '@/lib/utils/email';
import { newDogfoodWalkEmail } from './dogfood-account';
import {
  type DogfoodTmpCleanupDb,
  runDogfoodTmpCleanup,
} from './dogfood-tmp-cleanup';

let client: PGlite;
let database: ReturnType<typeof drizzle>;

// Real PostgreSQL with the production migrations; no production DB.
beforeAll(async () => {
  client = new PGlite();
  const dir = path.join(process.cwd(), 'drizzle', 'migrations');
  const journal = JSON.parse(
    readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8')
  ) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await client.exec(
      readFileSync(path.join(dir, `${tag}.sql`), 'utf8').replaceAll(
        '--> statement-breakpoint',
        ''
      )
    );
  }
  database = drizzle(client);
}, 120_000);

afterAll(async () => client?.close());

beforeEach(async () => {
  await client.exec(
    'TRUNCATE ba_sessions, ba_accounts, ba_users, creator_profiles, users CASCADE'
  );
});

const now = new Date('2026-11-20T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const at = (local: string) => `${local}@${FOUNDER_EMAIL_DOMAIN}`;

const cleanupDb: () => DogfoodTmpCleanupDb = () => ({
  atomic: fn => database.transaction(tx => fn(tx as never)),
});

let seq = 0;
async function seed(
  email: string,
  options: {
    ageDays: number;
    accountClass?: 'internal' | null;
    subscriptionId?: string;
  }
) {
  seq += 1;
  const baId = `ba-${seq}`;
  await database.insert(baUsers).values({
    id: baId,
    name: 'Walk',
    email: `${seq}-${email}`,
    emailVerified: true,
  });
  await database.insert(baSessions).values({
    id: `s-${seq}`,
    userId: baId,
    token: `token-${seq}`,
    expiresAt: daysAgo(-30),
  } as never);
  const [user] = await database
    .insert(users)
    .values({
      clerkId: `ba:${baId}`,
      betterAuthUserId: baId,
      email,
      userStatus: 'active',
      accountClass:
        options.accountClass === undefined ? 'internal' : options.accountClass,
      stripeSubscriptionId: options.subscriptionId ?? null,
      createdAt: daysAgo(options.ageDays),
    } as never)
    .returning({ id: users.id });
  await database.insert(creatorProfiles).values({
    userId: user!.id,
    creatorType: 'artist',
    username: `walk${seq}`,
    usernameNormalized: `walk${seq}`,
  } as never);
  return { id: user!.id, baId };
}

async function state(id: string, baId: string) {
  const user = await client.query<{
    email: string | null;
    deleted_at: Date | null;
    user_status: string;
  }>('SELECT email, deleted_at, user_status FROM users WHERE id = $1', [id]);
  const profiles = await client.query(
    'SELECT id FROM creator_profiles WHERE user_id = $1',
    [id]
  );
  const ba = await client.query('SELECT id FROM ba_users WHERE id = $1', [
    baId,
  ]);
  const sessions = await client.query(
    'SELECT id FROM ba_sessions WHERE user_id = $1',
    [baId]
  );
  return {
    deleted: user.rows[0]?.deleted_at != null,
    email: user.rows[0]?.email ?? null,
    status: user.rows[0]?.user_status,
    profiles: profiles.rows.length,
    identity: ba.rows.length,
    sessions: sessions.rows.length,
  };
}

const KEPT = { deleted: false, profiles: 1, identity: 1, sessions: 1 };

describe('runDogfoodTmpCleanup against PostgreSQL', () => {
  it('dry run reports expired tmp accounts and writes nothing', async () => {
    const expired = await seed(at('t+dogfood-tmp-run1'), { ageDays: 8 });
    const report = await runDogfoodTmpCleanup(cleanupDb(), {
      apply: false,
      now,
    });
    expect(report).toMatchObject({
      mode: 'dry-run',
      matched: 1,
      removed: 0,
      sample: ['tmp-run1'],
    });
    expect(JSON.stringify(report)).not.toContain(FOUNDER_EMAIL_DOMAIN);
    expect(await state(expired.id, expired.baId)).toMatchObject(KEPT);
  });

  it('removes only expired, internal-marked tmp accounts and their data', async () => {
    const expired = await seed(at('t+dogfood-tmp-run1'), { ageDays: 8 });
    const fresh = await seed(at('t+dogfood-tmp-run2'), { ageDays: 6 });
    const longLived = await seed(at('t+dogfood'), { ageDays: 400 });
    const named = await seed(at('t+dogfood-studio'), { ageDays: 400 });
    const unmarked = await seed(at('t+dogfood-tmp-run3'), {
      ageDays: 8,
      accountClass: null,
    });
    const lookalike = await seed('t+dogfood-tmp-run4@gmail.com', {
      ageDays: 8,
    });
    const subdomain = await seed(
      `t+dogfood-tmp-run5@sub.${FOUNDER_EMAIL_DOMAIN}`,
      { ageDays: 8 }
    );
    const billed = await seed(at('t+dogfood-tmp-run6'), {
      ageDays: 8,
      subscriptionId: 'sub_test_walk',
    });

    const afterRemoval = vi.fn(async (_handles: readonly string[]) => {});
    const report = await runDogfoodTmpCleanup(cleanupDb(), {
      apply: true,
      now,
      afterRemoval,
    });
    expect(afterRemoval).toHaveBeenCalledTimes(1);
    expect(afterRemoval.mock.calls[0]?.[0]).toEqual([
      expect.stringMatching(/^walk\d+$/),
    ]);
    expect(report).toMatchObject({
      mode: 'apply',
      matched: 1,
      removed: 1,
      skippedBilling: 1,
    });

    expect(await state(expired.id, expired.baId)).toEqual({
      deleted: true,
      email: null,
      status: 'banned',
      profiles: 0,
      identity: 0,
      sessions: 0,
    });
    for (const kept of [
      fresh,
      longLived,
      named,
      unmarked,
      lookalike,
      subdomain,
      billed,
    ]) {
      expect(await state(kept.id, kept.baId)).toMatchObject(KEPT);
    }

    // Idempotent: a second run finds nothing left to remove.
    const again = await runDogfoodTmpCleanup(cleanupDb(), {
      apply: true,
      now,
      afterRemoval,
    });
    expect(again).toMatchObject({ matched: 0, removed: 0 });
    expect(afterRemoval).toHaveBeenCalledTimes(1);
  }, 60_000);
});

describe('runDogfoodTmpCleanup uploads guard', () => {
  it('skips an expired tmp account that holds founder-review uploads', async () => {
    const withUploads = await seed(at('t+dogfood-tmp-up1'), { ageDays: 8 });
    const plain = await seed(at('t+dogfood-tmp-up2'), { ageDays: 8 });
    // Another account's founder-review row must not shield `plain`.
    await database.insert(feedbackItems).values({
      userId: withUploads.id,
      source: FOUNDER_REVIEW_SOURCE,
      message: 'walk upload',
    } as never);

    const report = await runDogfoodTmpCleanup(cleanupDb(), {
      apply: true,
      now,
    });
    expect(report).toMatchObject({ matched: 1, removed: 1, skippedUploads: 1 });
    expect(await state(withUploads.id, withUploads.baId)).toMatchObject(KEPT);
    expect(await state(plain.id, plain.baId)).toMatchObject({ deleted: true });
  }, 60_000);
});

describe('newDogfoodWalkEmail', () => {
  it('mints a unique ephemeral dogfood address per walk', () => {
    const a = newDogfoodWalkEmail(undefined, now);
    const b = newDogfoodWalkEmail(undefined, now);
    expect(a).not.toBe(b);
    expect(a).toMatch(
      new RegExp(
        `^t\\+dogfood-tmp-20261120-[0-9a-f]{10}@${FOUNDER_EMAIL_DOMAIN.replace('.', '\\.')}$`
      )
    );
  });

  it('uses a given walk id and rejects unsafe ones', () => {
    expect(newDogfoodWalkEmail('walk-2026-11-09')).toBe(
      at('t+dogfood-tmp-walk-2026-11-09')
    );
    for (const bad of ['', 'a b', 'x@evil.com', 'a+b', `${'a'.repeat(37)}`]) {
      expect(() => newDogfoodWalkEmail(bad)).toThrow(TypeError);
    }
  });
});
