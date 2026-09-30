import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration proof uses the real migrated database. */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mintDraftCapability } from '@/lib/agent-acquisition/draft-capability';
import {
  createAgentDraft,
  readAgentDraft,
} from '@/lib/agent-acquisition/draft-store';
import * as schema from '@/lib/db/schema';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import {
  setupDatabaseBeforeAll,
  withRlsAnonymous,
  withRlsUser,
} from '../setup-db';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/lib/agent-acquisition/artist-resolution', () => ({
  resolveAgentArtist: mocks.resolve,
}));
type TestDb = NeonDatabase<typeof schema>;
setupDatabaseBeforeAll();
let db: TestDb;
const ids = new Set<string>();
const artistId = 'spotify:4Z8W4fKeB5YxbusRsdQVPb';
const artist = {
  artist_id: artistId,
  provider: 'spotify',
  external_id: artistId.slice(8),
  display_name: 'Draft Integration Artist',
  source_url: `https://open.spotify.com/artist/${artistId.slice(8)}`,
  image_url: null,
  bio: null,
  genres: [],
};
const grant = () => {
  const value = mintDraftCapability(artistId, {
    agent_source: 'integration',
    session_or_run_id: 'draft-concurrency',
    first_touch: { source: 'agent' },
  });
  ids.add(value.capability.draft_id);
  return { ...value, input: { artist_id: artistId, draft_token: value.token } };
};
beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection)
    throw new Error(
      'Isolated database is required for draft persistence certification'
    );
  db = connection;
  mocks.resolve.mockImplementation(async () => ({
    status: 'resolved',
    artist,
    retryable: false,
  }));
});
afterEach(async () => {
  if (db && ids.size)
    await db
      .delete(agentVisibilityDrafts)
      .where(inArray(agentVisibilityDrafts.id, [...ids]));
  ids.clear();
  mocks.resolve.mockClear();
});
describe('agent drafts real persistence and access isolation', () => {
  it('racing retries persist one stable draft and independent capabilities stay isolated', async () => {
    const first = grant();
    const other = grant();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => createAgentDraft(first.input))
    );
    expect(results.every(result => result.status === 'draft_ready')).toBe(true);
    expect(results).toEqual(Array(4).fill(results[0]));
    const rows = await db
      .select()
      .from(agentVisibilityDrafts)
      .where(eq(agentVisibilityDrafts.id, first.capability.draft_id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.acquisition.session_or_run_id).toBe('draft-concurrency');
    const calls = mocks.resolve.mock.calls.length;
    expect(await createAgentDraft(first.input)).toEqual(results[0]);
    expect(mocks.resolve).toHaveBeenCalledTimes(calls);
    expect(
      await readAgentDraft(first.capability.draft_id, other.token)
    ).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
    const second = await createAgentDraft(other.input);
    expect(second).toMatchObject({
      status: 'draft_ready',
      draft_id: other.capability.draft_id,
    });
    expect(first.capability.draft_id).not.toBe(other.capability.draft_id);
  });
  it('enforces stored hash, artist binding, database expiry and claimed state on read and retry', async () => {
    for (const change of [
      { capabilityHash: 'different' },
      { artistId: 'apple_music:657515' },
      { expiresAt: new Date(0) },
      { claimedAt: new Date() },
    ]) {
      const g = grant();
      expect(await createAgentDraft(g.input)).toMatchObject({
        status: 'draft_ready',
      });
      await db
        .update(agentVisibilityDrafts)
        .set(change)
        .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
      expect(
        await readAgentDraft(g.capability.draft_id, g.token)
      ).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
      expect(await createAgentDraft(g.input)).toMatchObject({
        code: 'DRAFT_UNAVAILABLE',
      });
      const [stored] = await db
        .select()
        .from(agentVisibilityDrafts)
        .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
      expect(stored).toMatchObject(change);
    }
  });
  it('denies direct anonymous and unrelated-user row access through real RLS', async () => {
    const g = grant();
    expect(await createAgentDraft(g.input)).toMatchObject({
      status: 'draft_ready',
    });
    expect(
      await withRlsAnonymous(tx =>
        tx
          .select()
          .from(agentVisibilityDrafts)
          .where(eq(agentVisibilityDrafts.id, g.capability.draft_id))
      )
    ).toEqual([]);
    expect(
      await withRlsUser('unrelated-draft-reader', tx =>
        tx
          .select()
          .from(agentVisibilityDrafts)
          .where(eq(agentVisibilityDrafts.id, g.capability.draft_id))
      )
    ).toEqual([]);
    expect(
      await withRlsAnonymous(tx =>
        tx
          .update(agentVisibilityDrafts)
          .set({ claimedAt: new Date() })
          .where(eq(agentVisibilityDrafts.id, g.capability.draft_id))
          .returning()
      )
    ).toEqual([]);
    expect(await readAgentDraft(g.capability.draft_id, g.token)).toMatchObject({
      status: 'draft_ready',
    });
  });
});
