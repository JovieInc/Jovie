import { describe, expect, it } from 'vitest';
import {
  classifyMergedRisk,
  createProductionFacts,
  githubClient,
  listMergedLinkedPulls,
  reconcileValidation,
} from '../validation-sync.mjs';
import {
  createWorld,
  HARNESS_MANIFEST,
  intercept,
  json,
  MAIN,
  portFor,
  REPO,
  receiptComment,
  snapshotFor,
  validClosure,
} from './fixtures/validation-world.mjs';

/**
 * One evaluation of JOV-1, the way the merge-sync writer runs it: a merge
 * event passes `eventPull`, a sweep does not.
 */
function evaluate(world, fetchImpl, options = {}) {
  const github = githubClient(fetchImpl, 'gh_test');
  return reconcileValidation({
    issue: snapshotFor(world, options.identifier ?? 'JOV-1'),
    holds: options.holds ?? [],
    parentReason: options.parentReason ?? '',
    github,
    repository: REPO,
    facts: createProductionFacts({ fetchImpl, github, repository: REPO }),
    harnessManifest: options.harnessManifest ?? HARNESS_MANIFEST,
    linear: portFor(world),
    eventPull: options.eventPull,
    dryRun: options.dryRun,
    log: options.log ?? (() => {}),
  });
}

const merge = (world, fetchImpl, number, options = {}) =>
  evaluate(world, fetchImpl, { ...options, eventPull: { number } });

function addMerge(world, number, mergeSha, mergedAt) {
  world.pulls[number] = {
    mergeSha,
    mergedAt,
    files: ['apps/web/components/Card.tsx'],
  };
  world.issues['JOV-1'].attachments.push(
    `https://github.com/${REPO}/pull/${number}`
  );
}

describe('validation sync: deployment', () => {
  it('waits in Merging, then marks an ordinary issue Done once a verified generation contains it', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    expect((await merge(world, fetchImpl, 101)).action).toBe('moved');
    expect(world.issues['JOV-1'].state).toBe('Merging');
    world.served = MAIN[2].slice(0, 7);
    await evaluate(world, fetchImpl);
    expect(world.updates).toEqual(['JOV-1:Merging', 'JOV-1:Done']);
    const last = world.issues['JOV-1'].comments.at(-1).body;
    expect(last).toContain(`Verified production generation: ${MAIN[2]}`);
    expect(last).toContain('validation-manifest:v1');
  });

  it('is idempotent under replay: one transition and one comment', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    await merge(world, fetchImpl, 101);
    await merge(world, fetchImpl, 101);
    await evaluate(world, fetchImpl);
    expect(world.updates).toEqual(['JOV-1:Merging']);
    expect(world.comments).toHaveLength(1);
  });

  it('converges when an older merge event arrives after a newer one', async () => {
    const { world, fetchImpl } = createWorld();
    addMerge(world, 102, MAIN[3], '2026-10-03T11:00:00Z');
    await merge(world, fetchImpl, 102);
    await merge(world, fetchImpl, 101);
    expect(world.issues['JOV-1'].state).toBe('Merging');
    expect(world.updates).toEqual(['JOV-1:Merging']);
    world.served = MAIN[4].slice(0, 7);
    await evaluate(world, fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('waits when the served build has no Production Verified marker', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[3].slice(0, 7) });
    await merge(world, fetchImpl, 101);
    expect(world.issues['JOV-1'].state).toBe('Merging');
    expect(world.issues['JOV-1'].comments[0].body).toContain(
      'has no Production Verified marker'
    );
  });

  it.each([
    ['an unavailable version endpoint', null, /version HTTP 503/],
    ['a non-commit build id', { buildId: 'dev' }, /not a commit/],
    ['an unresolvable build id', { buildId: 'abcdef1' }, /GitHub HTTP 404/],
  ])(
    'treats %s as unknown deployment without moving',
    async (_name, version, detail) => {
      const { world, fetchImpl } = createWorld({
        failVersion: version === null,
      });
      world.issues['JOV-1'].state = 'Validating';
      const patched = intercept(fetchImpl, async url =>
        version && url === 'https://jov.ie/api/version' ? json(version) : null
      );
      await evaluate(world, patched);
      expect(world.updates).toEqual([]);
      expect(world.issues['JOV-1'].comments[0].body).toMatch(detail);
    }
  );

  it('moves back to Merging when production rolls back behind the merge', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    world.markers.add(MAIN[0]);
    world.issues['JOV-1'].state = 'Validating';
    await evaluate(world, fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Merging');
  });

  it('leaves issues without a merged pull request on main alone', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-1'].attachments = [
      'https://github.com/JovieInc/summer-config/pull/9',
      `https://github.com/${REPO}/pull/101`,
    ];
    world.pulls[101].base = 'release';
    expect((await evaluate(world, fetchImpl)).action).toBe('skip');
    expect(world.updates).toEqual([]);
  });
});

describe('validation sync: receipts', () => {
  it.each([
    [
      'JOV-6468: commissioning title and unchecked acceptance',
      {
        title: 'Commission one bounded activation experiment',
        description: '## Acceptance criteria\n- [ ] Outcome written back',
      },
    ],
    [
      'JOV-6473: reopened after Done',
      {
        title: 'Summer product bets: require falsifiable decisions',
        history: [
          { fromState: { type: 'completed' }, toState: { type: 'unstarted' } },
        ],
      },
    ],
    [
      'JOV-7302: commissioning proof section',
      {
        title: 'P0: Close the company control loop',
        description: '## First commissioning proof\nObjective to outcome.',
      },
    ],
  ])('never closes %s from merge plus deploy', async (_name, issue) => {
    const { world, fetchImpl } = createWorld();
    Object.assign(world.issues['JOV-1'], issue);
    await merge(world, fetchImpl, 101);
    await evaluate(world, fetchImpl);
    await evaluate(world, fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'Next missing receipt: outcome.'
    );
    expect(world.comments).toHaveLength(1);
  });

  it('closes outcome work only from a pass receipt on a verified generation', async () => {
    const { world, fetchImpl } = createWorld();
    await merge(world, fetchImpl, 101, { parentReason: 'commissioning' });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    world.issues['JOV-1'].comments.push(
      receiptComment('JOV-1', { sha: MAIN[3] }, '2026-10-03T13:00:00Z')
    );
    await evaluate(world, fetchImpl, { parentReason: 'commissioning' });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    world.issues['JOV-1'].comments.push(
      receiptComment('JOV-1', {}, '2026-10-03T13:05:00Z')
    );
    await evaluate(world, fetchImpl, { parentReason: 'commissioning' });
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('routes a required failure to Rework and requires fresh evidence after the fix merges', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].description = 'validation-required: outcome';
    await merge(world, fetchImpl, 101);
    world.issues['JOV-1'].comments.push(
      receiptComment(
        'JOV-1',
        { status: 'fail', evidence: 'https://example.test/repro/9' },
        '2026-10-03T13:00:00Z'
      )
    );
    await evaluate(world, fetchImpl);
    await evaluate(world, fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Rework');
    expect(
      world.updates.filter(update => update.endsWith('Rework'))
    ).toHaveLength(1);
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'https://example.test/repro/9'
    );

    addMerge(world, 103, MAIN[3], '2026-10-03T14:00:00Z');
    await merge(world, fetchImpl, 103);
    expect(world.issues['JOV-1'].state).toBe('Merging');
    world.served = MAIN[4].slice(0, 7);
    await evaluate(world, fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Validating');
    world.issues['JOV-1'].comments.push(
      receiptComment('JOV-1', { sha: MAIN[4] }, '2026-10-03T15:00:00Z')
    );
    await evaluate(world, fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('closes an escaped defect only when its deployed build is a verified generation containing the merge', async () => {
    /** @type {[string[], string][]} */
    const cases = [
      [[], 'Validating'],
      [[validClosure('JOV-1', MAIN[0])], 'Validating'],
      [[validClosure('JOV-1', MAIN[3])], 'Validating'],
      [[validClosure('JOV-1', MAIN[2])], 'Done'],
    ];
    for (const [comments, expected] of cases) {
      const { world, fetchImpl } = createWorld();
      Object.assign(world.issues['JOV-1'], {
        labels: ['escaped-defect'],
        comments: comments.map(body => ({
          body,
          createdAt: '2026-10-03T11:30:00Z',
        })),
      });
      await merge(world, fetchImpl, 101);
      expect(world.issues['JOV-1'].state).toBe(expected);
    }
  });

  it('requires human certification when the risk receipt blocks unattended release', async () => {
    const { world, fetchImpl } = createWorld();
    const manifest = structuredClone(HARNESS_MANIFEST);
    manifest.riskRules[0].blocksUnattendedAutoMerge = true;
    world.pulls[101].files = ['.github/workflows/ci.yml'];
    await merge(world, fetchImpl, 101, { harnessManifest: manifest });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.issues['JOV-1'].comments[0].body).toContain(
      'Next missing receipt: human-certification.'
    );
  });
});

describe('validation sync: writes', () => {
  it('does not write when another writer moved the issue mid-evaluation', async () => {
    const { world, fetchImpl } = createWorld();
    world.stateChangeDuringRead = 'Canceled';
    expect((await merge(world, fetchImpl, 101)).action).toBe('skip');
    expect(world.updates).toEqual([]);
    expect(world.issues['JOV-1'].state).toBe('Canceled');
  });

  it('never reopens Done or comments on it', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Done';
    await merge(world, fetchImpl, 101, { parentReason: 'commissioning' });
    expect(world.updates).toEqual([]);
    expect(world.comments).toEqual([]);
  });

  it('comments the hold reason once without moving', async () => {
    const { world, fetchImpl } = createWorld();
    const holds = ['Linked pull requests still open or draft: #104 (draft).'];
    expect((await merge(world, fetchImpl, 101, { holds })).action).toBe('hold');
    await merge(world, fetchImpl, 101, { holds });
    expect(world.updates).toEqual([]);
    expect(world.comments).toHaveLength(1);
    expect(world.issues['JOV-1'].comments[0].body).toContain('#104 (draft)');
  });

  it('reports a dry run without writing', async () => {
    const { world, fetchImpl } = createWorld();
    const lines = [];
    await merge(world, fetchImpl, 101, {
      dryRun: true,
      log: line => lines.push(line),
    });
    expect(lines.join('\n')).toContain('[dry run] JOV-1: In Review -> Done');
    expect(world.updates).toEqual([]);
    expect(world.comments).toEqual([]);
  });

  it('surfaces a refused move, a refused comment, and a missing state', async () => {
    const refusedMove = createWorld({ refuseUpdate: true });
    await expect(
      merge(refusedMove.world, refusedMove.fetchImpl, 101)
    ).rejects.toThrow(/refused to move JOV-1 to Done/);

    const refusedComment = createWorld({ refuseComment: true });
    await expect(
      merge(refusedComment.world, refusedComment.fetchImpl, 101)
    ).rejects.toThrow(/refused the lifecycle comment/);

    const stateless = createWorld();
    const github = githubClient(stateless.fetchImpl, 'gh_test');
    await expect(
      reconcileValidation({
        issue: { ...snapshotFor(stateless.world, 'JOV-1'), states: [] },
        holds: [],
        parentReason: '',
        github,
        repository: REPO,
        facts: createProductionFacts({
          fetchImpl: stateless.fetchImpl,
          github,
          repository: REPO,
        }),
        harnessManifest: HARNESS_MANIFEST,
        linear: portFor(stateless.world),
        eventPull: { number: 101 },
        log: () => {},
      })
    ).rejects.toThrow(/no Done state/);
  });
});

describe('validation sync: facts', () => {
  it('fails on malformed markers or compare results instead of guessing', async () => {
    for (const [pattern, body, error] of [
      ['production-generation-verified', {}, /malformed Production Verified/],
      ['/compare/', { status: 'weird' }, /compare returned weird/],
    ]) {
      const { world, fetchImpl } = createWorld();
      world.issues['JOV-1'].description = 'validation-required: outcome';
      world.issues['JOV-1'].comments.push(
        receiptComment('JOV-1', {}, '2026-10-03T11:30:00Z')
      );
      const broken = intercept(fetchImpl, async url =>
        url.includes(pattern) ? json(body) : null
      );
      await expect(merge(world, broken, 101)).rejects.toThrow(error);
      expect(world.updates).toEqual([]);
    }
  });

  it('rejects an ambiguous link set', async () => {
    const github = async () => {
      throw new Error('not reached');
    };
    await expect(
      listMergedLinkedPulls({
        github,
        repository: REPO,
        attachmentUrls: Array.from(
          { length: 61 },
          (_, index) => `https://github.com/${REPO}/pull/${200 + index}`
        ),
      })
    ).rejects.toThrow(/binding merge is ambiguous/);
  });

  it('classifies merged files with the existing CI risk receipt and treats gaps as unknown', async () => {
    const page =
      (filename, link = '') =>
      async () => ({
        body: [{ filename, previous_filename: 'apps/web/lib/old.ts' }],
        link,
      });
    const classify = (github, harnessManifest = HARNESS_MANIFEST) =>
      classifyMergedRisk({
        github,
        repository: REPO,
        pulls: [{ number: 1 }],
        harnessManifest,
      });
    const risk = await classify(page('apps/web/lib/billing/new.ts'));
    expect(risk?.riskLevel).toBe('high');
    expect(risk?.matchedRules).toContain('billing-money');
    expect(
      await classify(page('x.ts', '<https://api.github.com/next>; rel="next"'))
    ).toBeNull();
    expect(await classify(async () => ({ body: {}, link: '' }))).toBeNull();
    expect(
      await classify(async () => {
        throw new Error('GitHub HTTP 502');
      })
    ).toBeNull();
    expect(
      await classify(page('x.ts'), {
        riskRules: [{ id: 'bad', patterns: ['('] }],
      })
    ).toBeNull();
    expect(await classify(page('x.ts'), null)).toBeNull();
  });

  it('retries a dropped connection once and reports HTTP failures', async () => {
    let calls = 0;
    const github = githubClient(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return calls === 2
        ? json({ ok: 1 })
        : { ok: false, status: 502, json: async () => ({}) };
    }, 'gh_test');
    expect((await github('repos/x')).body).toEqual({ ok: 1 });
    await expect(github('repos/y')).rejects.toThrow(
      /GitHub HTTP 502 for repos\/y/
    );
  });
});
