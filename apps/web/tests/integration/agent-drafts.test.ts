import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration proof uses the real migrated database. */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mintDraftCapability } from '@/lib/agent-acquisition/draft-capability';
import {
  createAgentDraft,
  readAgentDraft,
} from '@/lib/agent-acquisition/draft-store';
import { prepareReleaseLaunch } from '@/lib/agent-acquisition/release-launch';
import * as schema from '@/lib/db/schema';
import { agentVisibilityDrafts } from '@/lib/db/schema/agent-drafts';
import {
  setupDatabaseBeforeAll,
  withRlsAnonymous,
  withRlsUser,
} from '../setup-db';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/agent-acquisition/artist-resolution', () => ({
  resolveAgentArtist: mocks.resolve,
}));
vi.mock('@/lib/agent-acquisition/release-resolution', () => ({
  resolveAgentRelease: mocks.release,
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
const acquisition = {
  agent_source: 'integration',
  client: 'integration-runner',
  installation_id: 'draft-installation',
  referral_token: 'draft-referral',
  session_or_run_id: 'draft-concurrency',
  intent: 'release_launch',
  first_touch: { source: 'agent' },
};
const grant = () => {
  const value = mintDraftCapability(artistId, acquisition);
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
  mocks.release.mockReset();
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

const launchFacts = {
  source: 'release_metadata',
  content_type: 'track',
  title: 'Integration Signal',
  artist_name: artist.display_name,
  release_date: '2026-11-07',
  artwork_url: 'https://i.scdn.co/image/integration',
  upc: '00123456789012',
  dsp_links: { spotify: 'https://open.spotify.com/track/integration-track' },
  artists: [{ name: artist.display_name, ids: { spotify: artistId.slice(8) } }],
} as const;

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

// All callers must finish loading the same version before any provider returns.
function raceProvider(participants: number) {
  const ready = signal();
  let arrived = 0;
  mocks.release.mockImplementation(async () => {
    if (++arrived === participants) ready.resolve();
    await ready.promise;
    return { status: 'resolved', facts: [launchFacts] };
  });
}

describe('agent release launch real persistence', () => {
  beforeEach(() => {
    mocks.release.mockImplementation(async () => ({
      status: 'resolved',
      facts: [launchFacts],
    }));
  });
  it('persists one launch per draft, replays it and keeps the fingerprint private', async () => {
    const g = grant();
    expect(await createAgentDraft(g.input)).toMatchObject({
      status: 'draft_ready',
    });
    const input = {
      draft_id: g.capability.draft_id,
      draft_token: g.token,
      goal: 'Launch the integration single',
      release_metadata: {
        title: 'Integration Signal',
        artist_name: artist.display_name,
      },
    };
    raceProvider(3);
    const [first, second, third] = await Promise.all([
      prepareReleaseLaunch(input),
      prepareReleaseLaunch(input),
      prepareReleaseLaunch(input),
    ]);
    expect(first).toMatchObject({
      status: 'launch_draft_ready',
      draft_id: g.capability.draft_id,
      ownership: 'unverified',
      published_url: null,
    });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    // Resolution may run concurrently; CAS must persist one stable result.
    expect(mocks.release).toHaveBeenCalledTimes(3);
    const replay = await prepareReleaseLaunch(input);
    expect(replay).toEqual(first);
    expect(mocks.release).toHaveBeenCalledTimes(3);
    const presented = await readAgentDraft(g.capability.draft_id, g.token);
    expect(presented).toMatchObject({
      launch: { status: 'launch_draft_ready', acquisition },
      acquisition,
    });
    expect(JSON.stringify(presented)).not.toContain('inputFingerprint');
    const [stored] = await db
      .select()
      .from(agentVisibilityDrafts)
      .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
    expect(stored?.preview.launch?.result).toMatchObject({
      status: 'launch_draft_ready',
    });
    expect(stored?.preview.launch?.inputFingerprint).toBeTruthy();
    expect(stored?.acquisition).toEqual(acquisition);
  });
  it('keeps concurrent different inputs compare-and-set with a retryable loser', async () => {
    const g = grant();
    expect(await createAgentDraft(g.input)).toMatchObject({
      status: 'draft_ready',
    });
    const base = {
      draft_id: g.capability.draft_id,
      draft_token: g.token,
      release_metadata: {
        title: 'Integration Signal',
        artist_name: artist.display_name,
      },
    };
    raceProvider(2);
    const [a, b] = await Promise.all([
      prepareReleaseLaunch({ ...base, goal: 'goal A' }),
      prepareReleaseLaunch({ ...base, goal: 'goal B' }),
    ]);
    const results = [a, b];
    const winner = results.find(result => result.status !== 'error');
    const loser = results.find(
      result => result.status === 'error' && result.code === 'DRAFT_CHANGED'
    );
    // Exactly one of the racing writes owns the stored launch.
    expect(winner).toBeDefined();
    expect(loser).toMatchObject({ retryable: true });
    const persisted = await readAgentDraft(g.capability.draft_id, g.token);
    expect(persisted).toMatchObject({ launch: winner, acquisition });
    const retried = await prepareReleaseLaunch({
      ...base,
      goal: loser === a ? 'goal A' : 'goal B',
    });
    expect(retried).toMatchObject({
      status: 'launch_draft_ready',
      draft_id: g.capability.draft_id,
    });
    const [stored] = await db
      .select()
      .from(agentVisibilityDrafts)
      .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
    expect(stored?.preview.launch?.result).toMatchObject({
      status: 'launch_draft_ready',
    });
  });
  it('denies expired and claimed capabilities before provider resolution', async () => {
    for (const change of [
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
      const input = {
        draft_id: g.capability.draft_id,
        draft_token: g.token,
        goal: 'Launch the integration single',
        release_metadata: {
          title: 'Integration Signal',
          artist_name: artist.display_name,
        },
      };
      expect(await prepareReleaseLaunch(input)).toMatchObject({
        code: 'DRAFT_UNAVAILABLE',
      });
      const [stored] = await db
        .select()
        .from(agentVisibilityDrafts)
        .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
      expect(stored?.preview.launch).toBeUndefined();
      expect(mocks.release).not.toHaveBeenCalled();
    }
  });
  it('rejects capability revocation while provider resolution is in flight', async () => {
    for (const change of [
      { expiresAt: new Date(0) },
      { claimedAt: new Date() },
      { capabilityHash: 'revoked-during-provider-call' },
      { artistId: 'apple_music:657515' },
    ]) {
      const g = grant();
      expect(await createAgentDraft(g.input)).toMatchObject({
        status: 'draft_ready',
      });
      const started = signal();
      const finish = signal();
      mocks.release.mockImplementationOnce(async () => {
        started.resolve();
        await finish.promise;
        return { status: 'resolved', facts: [launchFacts] };
      });
      const pending = prepareReleaseLaunch({
        draft_id: g.capability.draft_id,
        draft_token: g.token,
        goal: 'Launch during revocation',
        release_metadata: { title: launchFacts.title },
      });
      await started.promise;
      try {
        await db
          .update(agentVisibilityDrafts)
          .set(change)
          .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
      } finally {
        finish.resolve();
      }
      expect(await pending).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
      const [stored] = await db
        .select()
        .from(agentVisibilityDrafts)
        .where(eq(agentVisibilityDrafts.id, g.capability.draft_id));
      expect(stored).toMatchObject(change);
      expect(stored?.preview.launch).toBeUndefined();
      expect(stored?.acquisition).toEqual(acquisition);
    }
  });
});
