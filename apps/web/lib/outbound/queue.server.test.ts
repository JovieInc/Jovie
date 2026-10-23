import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  ledger: vi.fn(),
  execute: vi.fn(),
}));

function chain(result: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const key of ['from', 'leftJoin', 'where']) node[key] = () => node;
  node.limit = async () => result;
  node.then = (resolve: (value: unknown) => void) => resolve(result);
  return node;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => chain(mocks.results.shift() ?? []),
    execute: mocks.execute,
  },
}));
vi.mock('./ledger.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./ledger.server')>()),
  readOutboundLedger: mocks.ledger,
}));
vi.mock('@/constants/domains', () => ({
  getAppUrl: (path: string) => `https://jov.ie${path}`,
}));

import { getOutboundQueue } from './queue.server';

const base = {
  bio: null,
  fitScoreBreakdown: { hasSpotify: 15, genreMatch: 10 },
  linktreeUrl: 'https://linktr.ee/x',
  avatarUrl: null,
  instagramHandle: null,
  hasInstagram: false,
  outreachRoute: 'email',
  outreachStatus: 'pending',
  dmCopy: null,
  claimToken: 'tok',
  priorityScore: null,
  spotifyFollowers: null,
  latestReleaseDate: null,
  discoveryQuery: null,
  createdAt: new Date('2026-03-30T00:00:00Z'),
  ingestedAt: new Date('2026-03-30T19:30:00Z'),
  signupAt: null,
  signupUserId: null,
  paidAt: null,
  profileAvatarUrl: null,
};

describe('getOutboundQueue', () => {
  beforeEach(() => {
    mocks.ledger.mockResolvedValue(new Map());
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue({ rows: [] });
  });

  it('joins certification and reply evidence into ranked rows', async () => {
    mocks.results = [
      [
        {
          ...base,
          id: 'a',
          linktreeHandle: 'ada',
          displayName: 'Ada - Listen on Spotify',
          contactEmail: 'ada@example.com',
          status: 'ingested',
          fitScore: 45,
          creatorProfileId: 'p1',
          profileUsername: 'ada',
        },
        {
          ...base,
          id: 'b',
          linktreeHandle: 'bea',
          displayName: 'Bea',
          contactEmail: null,
          status: 'qualified',
          fitScore: 60,
          creatorProfileId: null,
          profileUsername: null,
        },
        {
          ...base,
          id: 'c',
          linktreeHandle: 'cy',
          displayName: 'Cy',
          contactEmail: 'cy@example.com',
          status: 'ingested',
          fitScore: 50,
          creatorProfileId: 'p3',
          profileUsername: 'cy',
        },
        {
          ...base,
          id: 'd',
          linktreeHandle: 'dee',
          displayName: 'Dee',
          contactEmail: 'dee@example.com',
          status: 'ingested',
          fitScore: 55,
          creatorProfileId: 'p4',
          profileUsername: 'dee',
        },
        {
          ...base,
          id: 'e',
          linktreeHandle: 'eve',
          displayName: 'Eve',
          contactEmail: 'eve@example.com',
          status: 'ingested',
          fitScore: 55,
          creatorProfileId: 'p5',
          profileUsername: 'eve',
        },
      ],
      [{ dedupeKey: 'email:ada@example.com' }],
      [{ leadId: 'c' }],
    ];
    const full = { dsp: true, catalog: true, search: true, reachability: true };
    mocks.execute.mockResolvedValue({
      rows: [
        { id: 'p4', ...full },
        { id: 'p5', ...full, search: false, reachability: false },
      ],
    });
    const queue = await getOutboundQueue(new Date('2026-10-04T12:00:00Z'));
    expect(
      queue.rows.map(row => [row.leadId, row.view, row.nextAction])
    ).toEqual([
      ['a', 'certified', 'approve_message'],
      ['d', 'ready', 'review_facts'],
      ['e', 'needs_evidence', 'gather_evidence'],
      ['b', 'needs_evidence', 'build_profile'],
      ['c', 'replied', 'await_claim'],
    ]);
    expect(queue.rows.find(row => row.leadId === 'e')?.missingEvidence).toEqual(
      ['search', 'reachability']
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(queue.rows[0]).toMatchObject({
      name: 'Ada',
      dedupeKey: 'email:ada@example.com',
      profilePath: '/ada',
    });
    expect(queue.counts).toMatchObject({
      certified: 1,
      ready: 1,
      needs_evidence: 2,
      replied: 1,
    });
    expect(mocks.ledger).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns an empty queue without extra reads', async () => {
    mocks.results = [[]];
    const queue = await getOutboundQueue();
    expect(queue.rows).toEqual([]);
    expect(queue.counts.ready).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
