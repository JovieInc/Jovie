import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  ledger: vi.fn(),
  execute: vi.fn(),
  flag: vi.fn(),
  judgeLedger: vi.fn(),
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

vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/agent-os/dogfood-judge-runtime-store', () => ({
  getDogfoodJudgeLedger: () => ({ read: mocks.judgeLedger }),
}));
vi.mock('@/lib/leads/lead-claim-token', () => ({
  resolveLeadClaimToken: vi.fn(async () => 'tok'),
}));

import {
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetRevision,
} from './approval';
import { outboundTargetFromLead } from './ledger.server';
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
    mocks.flag.mockReset().mockResolvedValue(false);
    mocks.judgeLedger.mockReset().mockResolvedValue(null);
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

const NOW = new Date('2026-11-12T12:00:00Z');
const lead = {
  ...base,
  id: 'lead-1',
  linktreeHandle: 'ada',
  displayName: 'Ada',
  contactEmail: 'ada@example.com',
  status: 'ingested',
  fitScore: 70,
  creatorProfileId: 'profile-1',
  profileUsername: 'ada',
};
const surfaces = ['onboarding', 'outbound-artifact:profile-1'] as const;
function judgeEvidence() {
  return {
    schema: 'jovie.dogfood-judge-ledger/v1',
    currentFingerprint: 'fp',
    requiredSurfaces: surfaces,
    surfaces: Object.fromEntries(
      surfaces.map(id => [
        id,
        {
          verdict: 'pass',
          nothingWrong: true,
          signatureVerified: true,
          fingerprint: 'fp',
          sourceSha: null,
          judgedAt: NOW.toISOString(),
        },
      ])
    ),
  };
}

describe('queue draft visibility', () => {
  beforeEach(() => {
    mocks.flag.mockReset().mockResolvedValue(true);
    mocks.judgeLedger.mockReset().mockResolvedValue(judgeEvidence());
    mocks.results = [[lead], [], []];
    mocks.ledger.mockResolvedValue(new Map());
    mocks.execute.mockResolvedValue({
      rows: [
        {
          id: 'profile-1',
          dsp: true,
          catalog: true,
          search: true,
          reachability: true,
        },
      ],
    });
  });

  function saveCopy() {
    const targetRevision = outboundTargetRevision(outboundTargetFromLead(lead));
    const copy = {
      channel: 'email' as const,
      subject: 'Private subject',
      body: 'Private saved draft',
    };
    mocks.ledger.mockResolvedValue(
      new Map([
        [
          lead.id,
          [
            {
              evidenceKey: outboundCopyEvidenceKey(lead.id),
              evidenceRevision: outboundCopyRevision(targetRevision, copy),
              decision: 'unsure',
              snapshot: { targetRevision, ...copy },
              actorUserId: 'tim',
              createdAt: NOW,
            },
          ],
        ],
      ])
    );
    return copy;
  }

  it.each(surfaces)(
    'hides generated and saved drafts when %s is missing or fails',
    async surface => {
      for (const saved of [false, true]) {
        if (saved) saveCopy();
        for (const verdict of [null, 'fail']) {
          const evidence = judgeEvidence();
          if (verdict === null) delete evidence.surfaces[surface];
          else evidence.surfaces[surface].verdict = verdict;
          mocks.judgeLedger.mockResolvedValue(evidence);
          mocks.results = [[lead], [], []];
          const queue = await getOutboundQueue(NOW);
          expect(queue.rows[0]).toMatchObject({
            view: 'needs_judge',
            nextAction: 'await_judge',
            message: null,
          });
          expect(queue.counts.needs_judge).toBe(1);
          expect(JSON.stringify(queue)).not.toContain('Private saved draft');
        }
      }
    }
  );

  it('retains generated and saved drafts only after both surfaces pass', async () => {
    const generated = await getOutboundQueue(NOW);
    expect(generated.rows[0].view).toBe('ready');
    expect(generated.rows[0].message?.body).toContain('/claim/tok');
    const copy = saveCopy();
    mocks.results = [[lead], [], []];
    expect((await getOutboundQueue(NOW)).rows[0].message).toMatchObject(copy);
    expect(mocks.judgeLedger).toHaveBeenCalledTimes(2);
    expect(mocks.flag).toHaveBeenCalledWith('OUTBOUND_DOGFOOD_GATE');
  });

  it.each(['absent', 'unreadable', 'stale', 'flag-unreadable', 'no-profile'])(
    'fails closed for %s evidence',
    async failure => {
      saveCopy();
      if (failure === 'absent') mocks.judgeLedger.mockResolvedValue(null);
      if (failure === 'unreadable')
        mocks.judgeLedger.mockRejectedValue(new Error('offline'));
      if (failure === 'stale') {
        const evidence = judgeEvidence();
        evidence.surfaces.onboarding.judgedAt = '2026-10-01T00:00:00Z';
        mocks.judgeLedger.mockResolvedValue(evidence);
      }
      if (failure === 'flag-unreadable') {
        mocks.flag.mockRejectedValue(new Error('offline'));
        mocks.judgeLedger.mockResolvedValue(null);
      }
      if (failure === 'no-profile')
        mocks.results = [[{ ...lead, creatorProfileId: null }], [], []];
      expect((await getOutboundQueue(NOW)).rows[0]).toMatchObject({
        view: 'needs_judge',
        message: null,
      });
    }
  );

  it('preserves existing draft visibility without reading the judge when explicitly disabled', async () => {
    mocks.flag.mockResolvedValue(false);
    mocks.judgeLedger.mockRejectedValue(new Error('must not read'));
    const copy = saveCopy();
    expect((await getOutboundQueue(NOW)).rows[0].message).toMatchObject(copy);
    expect(mocks.judgeLedger).not.toHaveBeenCalled();
  });
});
