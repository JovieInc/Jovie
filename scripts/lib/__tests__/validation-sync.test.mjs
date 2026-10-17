import * as nodeFs from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

// The JOV-7703 contract is TypeScript in another package; load it at runtime
// so the scripts checkJs pass does not typecheck that package.
const CONTRACTS = new URL(
  '../../../packages/agent-transport-contracts',
  import.meta.url
).href;
const {
  acknowledgeDispatch,
  extractWorkBlocks,
  renderWorkBlock,
  sealWorkOrder,
} = await import(`${CONTRACTS}/work-order.ts`);
const { founderCardKey, fromSummerCard } = await import(
  `${CONTRACTS}/work-order-adapters.ts`
);

import {
  boundGithubCache,
  classifyMergedRisk,
  createProductionFacts,
  githubClient,
  immutableGithubCache,
  inspectVerifiedProductionMarker,
  listMergedFiles,
  listMergedLinkedPulls,
  mergedUiEvidence,
  pullImplementsIssue,
  reconcileValidation,
} from '../validation-sync.mjs';
import {
  createWorld,
  HARNESS_MANIFEST,
  intercept,
  json,
  MAIN,
  NO_UI_MATRIX,
  portFor,
  REPO,
  receiptComment,
  snapshotFor,
  TASTE_MATRIX,
  UI_MATRIX,
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
    facts: createProductionFacts({
      fetchImpl,
      github,
      repository: REPO,
      verifyMarker: options.verifyMarker ?? (() => true),
    }),
    harnessManifest: options.harnessManifest ?? HARNESS_MANIFEST,
    assuranceMatrix:
      'assuranceMatrix' in options ? options.assuranceMatrix : NO_UI_MATRIX,
    linear: portFor(world),
    eventPull: options.eventPull,
    dryRun: options.dryRun,
    now: options.now,
    log: options.log ?? (() => {}),
  });
}

const merge = (world, fetchImpl, number, options = {}) =>
  evaluate(world, fetchImpl, { ...options, eventPull: { number } });

describe('canonical marker adapter', () => {
  it.each([
    ['verified', true],
    ['none', false],
    ['pending', false],
    ['recovery_available', false],
  ])('maps canonical %s without inventing a pass', (state, expected) => {
    const execute = (command, args, options) => {
      expect(command).toBe(process.execPath);
      expect(args.slice(1)).toEqual([
        '--repo',
        REPO,
        '--sha',
        MAIN[2],
        '--controller-workflow-id',
        '91',
      ]);
      expect(args[0]).toMatch(
        /\.github\/scripts\/production-marker-state\.mjs$/
      );
      expect(options.timeout).toBe(45_000);
      return JSON.stringify({ state });
    };
    expect(
      inspectVerifiedProductionMarker({
        repository: REPO,
        sha: MAIN[2],
        controllerWorkflowId: 91,
        execute,
      })
    ).toBe(expected);
  });
  it.each(['{}', '{"state":"manual","reason":"payload_mismatch"}', '{invalid'])(
    'rejects malformed or unverified classifier output %s',
    output => {
      expect(() =>
        inspectVerifiedProductionMarker({
          repository: REPO,
          sha: MAIN[2],
          controllerWorkflowId: 91,
          execute: () => output,
        })
      ).toThrow();
    }
  );
});

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
  it('does not certify artifact-name presence when the canonical byte/attempt proof is not verified', async () => {
    const { world, fetchImpl } = createWorld();
    await evaluate(world, fetchImpl, { verifyMarker: () => false });
    expect(world.issues['JOV-1'].state).toBe('Merging');
  });

  it('recognizes the release owner recovery marker through the same canonical proof', async () => {
    const { world, fetchImpl } = createWorld();
    const recovered = intercept(fetchImpl, async url => {
      if (!url.includes('/actions/artifacts?')) return null;
      const name = `production-generation-verified-recovery-${MAIN[2]}`;
      return json({
        artifacts: url.includes(`name=${name}&`)
          ? [{ name, expired: false, workflow_run: { head_branch: 'main' } }]
          : [],
      });
    });
    await evaluate(world, recovered, {
      verifyMarker: (sha, workflow) => {
        expect(sha).toBe(MAIN[2]);
        expect(workflow).toBe(91);
        return true;
      },
    });
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('holds on malformed canonical marker proof instead of trusting the named artifact', async () => {
    const { world, fetchImpl } = createWorld();
    await evaluate(world, fetchImpl, {
      verifyMarker: () => {
        throw new Error('marker payload mismatch');
      },
    });
    expect(world.updates).toEqual([]);
    expect(world.issues['JOV-1'].comments[0].body).toContain(
      'marker payload mismatch'
    );
  });
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

  it('retains verified validation entry during forward marker lag, but never closes until the new marker arrives', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.description = 'validation-required: outcome';
    await evaluate(world, fetchImpl);
    expect(issue.state).toBe('Validating');
    world.served = MAIN[3].slice(0, 7);
    issue.comments.push(
      receiptComment('JOV-1', { sha: MAIN[3] }, '2026-10-03T13:00:00Z')
    );
    await evaluate(world, fetchImpl);
    expect(issue.state).toBe('Validating');
    expect(world.updates).toEqual(['JOV-1:Validating']);
    expect(issue.comments.at(-1).body).toContain(
      'Next missing receipt: deployment.'
    );
    world.markers.add(MAIN[3]);
    await evaluate(world, fetchImpl);
    expect(issue.state).toBe('Done');
    expect(world.updates).toEqual(['JOV-1:Validating', 'JOV-1:Done']);
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
    '{not json}',
    '{"schema":"jovie.validation-receipt/v1","issue":"JOV-1","kind":"outcome","status":"pass"}',
    '{"schema":"jovie.validation-receipt/v1"}',
  ])(
    'does not fall back to a passing receipt after a malformed newer receipt %s',
    async malformed => {
      const { world, fetchImpl } = createWorld();
      const issue = world.issues['JOV-1'];
      issue.description = 'validation-required: outcome';
      issue.state = 'Validating';
      issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T13:00:00Z'));
      issue.comments.push({
        body: `<!-- validation-receipt:v1\n${malformed}\n-->`,
        createdAt: '2026-10-03T14:00:00Z',
      });
      await evaluate(world, fetchImpl);
      expect(issue.state).toBe('Validating');
      expect(issue.comments.at(-1).body).toContain('malformed');
      issue.comments.push(receiptComment('JOV-1', {}, '2026-10-03T15:00:00Z'));
      await evaluate(world, fetchImpl);
      expect(issue.state).toBe('Done');
    }
  );

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
          {
            createdAt: '2026-10-03T11:00:00Z',
            fromState: { type: 'completed' },
            toState: { type: 'unstarted' },
          },
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

  it('ignores a prior-window failure created after a racing reopen, then consumes current proof', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    issue.state = 'Validating';
    issue.history = [
      {
        createdAt: '2026-10-03T13:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
    ];
    issue.comments.push(
      receiptComment(
        'JOV-1',
        { status: 'fail', episodeStartedAt: null },
        '2026-10-03T13:00:01Z'
      )
    );
    await evaluate(world, fetchImpl);
    expect(issue.state).toBe('Validating');
    issue.comments.push(
      receiptComment(
        'JOV-1',
        { episodeStartedAt: '2026-10-03T13:00:00Z' },
        '2026-10-03T13:01:00Z'
      )
    );
    await evaluate(world, fetchImpl);
    expect(issue.state).toBe('Done');
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

describe('validation sync: founder taste (JOV-7759)', () => {
  const taste = (overrides, createdAt) =>
    receiptComment(
      'JOV-1',
      {
        kind: 'founder-taste',
        evidence: 'https://example.test/ovie/taste/1',
        ...overrides,
      },
      createdAt
    );

  it('needs machine evidence, not Tim, for a deterministic UI row', async () => {
    const { world, fetchImpl } = createWorld();
    await merge(world, fetchImpl, 101, { assuranceMatrix: UI_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    const held = world.issues['JOV-1'].comments.at(-1).body;
    expect(held).toContain('Next missing receipt: screen-audit.');
    expect(held).toContain(
      'AM-020 ui-state-completeness on web-desktop, web-mobile'
    );
    expect(held).not.toContain('founder-taste');
    expect(world.descriptions).toEqual([]);
    world.issues['JOV-1'].comments.push(
      receiptComment(
        'JOV-1',
        {
          kind: 'screen-audit',
          evidence: 'https://github.com/JovieInc/Jovie/actions/runs/1',
        },
        '2026-10-03T13:00:00Z'
      )
    );
    await evaluate(world, fetchImpl, { assuranceMatrix: UI_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('holds a UI change in Validating until the founder accepts the exact production build', async () => {
    const { world, fetchImpl } = createWorld();
    await merge(world, fetchImpl, 101, { assuranceMatrix: TASTE_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    const held = world.issues['JOV-1'].comments.at(-1).body;
    expect(held).toContain('Next missing receipt: founder-taste.');
    expect(held).toContain(
      'AM-024 ui-visual-taste on web-desktop, macos-electron'
    );
    expect(held).toContain('"uiEvidence":[{"row":"AM-024"');

    world.issues['JOV-1'].comments.push(taste({}, '2026-10-03T13:00:00Z'));
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('routes a founder rejection to Rework with the note, and needs a fresh decision after the fix', async () => {
    const { world, fetchImpl } = createWorld();
    await merge(world, fetchImpl, 101, { assuranceMatrix: TASTE_MATRIX });
    world.issues['JOV-1'].comments.push(
      taste(
        { status: 'fail', note: 'The rail toggle still jumps 2px on open.' },
        '2026-10-03T13:00:00Z'
      )
    );
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Rework');
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'Note: The rail toggle still jumps 2px on open.'
    );

    addMerge(world, 103, MAIN[3], '2026-10-03T14:00:00Z');
    world.served = MAIN[4].slice(0, 7);
    await merge(world, fetchImpl, 103, { assuranceMatrix: TASTE_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    world.issues['JOV-1'].comments.push(
      taste({ sha: MAIN[4] }, '2026-10-03T15:00:00Z')
    );
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  /** Summer's JOV-7739 tick: read the order from the body, post the decision. */
  function summerTick(world, status, comment = null, orderIndex = 0) {
    const issue = world.issues['JOV-1'];
    const raw = extractWorkBlocks(issue.description).orders[orderIndex];
    const order = sealWorkOrder(raw);
    const card = {
      id: `card-${order.digest.slice(0, 8)}`,
      idempotencyKey: founderCardKey(order),
      status,
      comment,
      decidedAt: '2026-10-04T02:00:00.000Z',
    };
    const ack = acknowledgeDispatch(order, {
      transportRef: `ovie:summer-card/${card.id}`,
      dispatchedAt: '2026-10-04T01:30:00.000Z',
    });
    const result = fromSummerCard(order, {
      ack,
      card,
      observedAt: card.decidedAt,
    });
    world.clock += 1000;
    issue.comments.push({
      body: `Founder ${status} in Ovie.\n\n${renderWorkBlock(result)}`,
      createdAt: new Date(world.clock).toISOString(),
    });
  }

  it('files one Ovie taste order per binding and closes on the founder approval', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].description = 'Mirror the rail toggle.';
    const now = () => new Date('2026-10-04T01:00:00Z');
    await merge(world, fetchImpl, 101, { assuranceMatrix: TASTE_MATRIX, now });
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX, now });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.descriptions).toEqual(['JOV-1']);
    const body = world.issues['JOV-1'].description;
    expect(body.startsWith('Mirror the rail toggle.')).toBe(true);
    const [order] = extractWorkBlocks(body).orders;
    expect(order).toMatchObject({
      authorityClass: 'founder',
      requiredCapabilities: ['taste'],
      scope: { entityRefs: expect.arrayContaining([`sha:${MAIN[2]}`]) },
    });

    summerTick(world, 'approved');
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX, now });
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('routes an Ovie rejection to Rework with the note, then asks again for the fix build', async () => {
    const { world, fetchImpl } = createWorld();
    const now = () => new Date('2026-10-04T01:00:00Z');
    await merge(world, fetchImpl, 101, { assuranceMatrix: TASTE_MATRIX, now });
    summerTick(world, 'rejected', 'Too much chrome around the player.');
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX, now });
    expect(world.issues['JOV-1'].state).toBe('Rework');
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'Note: Too much chrome around the player.'
    );

    addMerge(world, 103, MAIN[3], '2026-10-03T14:00:00Z');
    world.served = MAIN[4].slice(0, 7);
    await merge(world, fetchImpl, 103, { assuranceMatrix: TASTE_MATRIX, now });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.descriptions).toEqual(['JOV-1', 'JOV-1']);
    expect(
      extractWorkBlocks(world.issues['JOV-1'].description).orders
    ).toHaveLength(2);
  });

  it('files a new taste order after reopening and ignores a delayed result for the previous order', async () => {
    const { world, fetchImpl } = createWorld();
    const issue = world.issues['JOV-1'];
    const firstTime = () => new Date('2026-10-04T01:00:00Z');
    await merge(world, fetchImpl, 101, {
      assuranceMatrix: TASTE_MATRIX,
      now: firstTime,
    });
    const oldOrder = extractWorkBlocks(issue.description).orders[0];
    summerTick(world, 'approved');
    await evaluate(world, fetchImpl, {
      assuranceMatrix: TASTE_MATRIX,
      now: firstTime,
    });
    expect(issue.state).toBe('Done');
    issue.state = 'Validating';
    issue.history = [
      {
        createdAt: '2026-10-04T03:00:00Z',
        fromState: { type: 'completed' },
        toState: { type: 'started' },
      },
    ];
    world.clock = Date.parse('2026-10-04T04:00:00Z');
    // A repeated old work-result gets a later delivery timestamp, but it
    // remains bound to the previously consumed order and cannot pass.
    summerTick(world, 'approved');
    issue.comments.push(receiptComment('JOV-1', {}, '2026-10-04T04:00:00Z'));
    const now = () => new Date('2026-10-04T04:00:00Z');
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX, now });
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX, now });
    expect(issue.state).toBe('Validating');
    const orders = extractWorkBlocks(issue.description).orders;
    expect(orders).toHaveLength(2);
    expect(orders[1].orderId).not.toBe(oldOrder.orderId);
    expect(orders[1].idempotencyKey).not.toBe(oldOrder.idempotencyKey);
    expect(orders[1].scope.entityRefs).toContain(
      'episode:2026-10-04T03:00:00.000Z'
    );
    summerTick(world, 'approved', null, 1);
    await evaluate(world, fetchImpl, { assuranceMatrix: TASTE_MATRIX, now });
    expect(issue.state).toBe('Done');
  });

  it('surfaces a refused order write', async () => {
    const { world, fetchImpl } = createWorld();
    world.refuseDescription = true;
    await expect(
      merge(world, fetchImpl, 101, { assuranceMatrix: TASTE_MATRIX })
    ).rejects.toThrow(/refused the founder taste order/);
  });

  it('treats an unreadable matrix as unknown UI evidence, never as no UI change', async () => {
    const { world, fetchImpl } = createWorld();
    await merge(world, fetchImpl, 101, { assuranceMatrix: null });
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'Next missing receipt: screen-audit.'
    );
    expect(world.descriptions).toEqual([]);
    expect(mergedUiEvidence(null, TASTE_MATRIX)).toBeNull();
    expect(mergedUiEvidence(['docs/README.md'], TASTE_MATRIX)).toEqual([]);
    expect(
      mergedUiEvidence(['apps/web/components/Card.tsx'], {
        rows: [{ ...UI_MATRIX.rows[0], ui: { requiredEvidence: [] } }],
      })?.[0]?.judgment
    ).toBe('deterministic');
  });

  it('does not turn queue invariant metadata into a founder build approval', async () => {
    const { world, fetchImpl } = createWorld();
    // PR19749 / JOV-5117: queue controls plus the shared invariant registry.
    world.pulls[101].files = [
      '.github/MERGE_QUEUE.md',
      '.github/scripts/auto-merge-stuck-triage.js',
      'canon/invariants.jsonl',
      'scripts/lib/source-admission-policy.mjs',
      'scripts/merge-group-failure-hold.mjs',
    ];
    const matrix = JSON.parse(
      readFileSync(
        new URL('../../invariants/assurance-matrix.json', import.meta.url),
        'utf8'
      )
    );
    expect(mergedUiEvidence(world.pulls[101].files, matrix)).toEqual([]);
    await merge(world, fetchImpl, 101, { assuranceMatrix: matrix });
    expect(world.issues['JOV-1'].comments.at(-1).body).not.toContain(
      'founder-taste'
    );
    expect(world.descriptions).toEqual([]);
    // A real taste detector changed alongside metadata still owes its row.
    expect(
      mergedUiEvidence(
        [
          'canon/invariants.jsonl',
          'apps/web/scripts/design-ci-judge-router.ts',
        ],
        matrix
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 'AM-024', judgment: 'taste' }),
      ])
    );
    expect(
      mergedUiEvidence(
        [
          'canon/invariants.jsonl',
          'apps/web/lib/animation/motion-primitives.ts',
        ],
        matrix
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 'AM-018', judgment: 'mixed' }),
      ])
    );
  });

  it('does not ask for taste when the change touches no UI row', async () => {
    const { world, fetchImpl } = createWorld();
    world.pulls[101].files = ['scripts/lib/thing.mjs'];
    await merge(world, fetchImpl, 101, { assuranceMatrix: TASTE_MATRIX });
    expect(world.issues['JOV-1'].state).toBe('Done');
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
          verifyMarker: () => true,
        }),
        harnessManifest: HARNESS_MANIFEST,
        assuranceMatrix: NO_UI_MATRIX,
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

  it('binds only pull requests that implement the issue, never a passing mention (#20371 / JOV-7192)', async () => {
    const { world, fetchImpl } = createWorld();
    world.pulls[101] = {
      ...world.pulls[101],
      title: 'feat(acquisition): derive acquisition_eligible',
      headRef: 'feat/jov-7696-acquisition-eligible',
      body: 'Golden path nightly is red, tracked on JOV-1. Part of JOV-1.',
    };
    // A sweep sees only Linear's attachment, not a merge event.
    expect((await evaluate(world, fetchImpl)).action).toBe('skip');
    expect(world.issues['JOV-1'].state).toBe('In Review');
    expect(world.updates).toEqual([]);

    for (const pull of [
      { title: 'fix(profile): card (JOV-1)' },
      { head: { ref: 'codex/jov-1-card' } },
      { body: '<!-- linear-issue-identifier:JOV-1 -->' },
      { body: '<!-- summer-issue-bind -->\nJOV-1\ntaskKey:abc' },
      { body: 'Fixes JOV-1' },
      { body: 'Resolves https://linear.app/jovie/issue/JOV-1/card' },
    ]) {
      expect(pullImplementsIssue(pull, 'JOV-1')).toBe(true);
    }
    for (const pull of [
      { title: 'fix: card (JOV-12)' },
      { head: { ref: 'tim/jov-12-card' } },
      { body: 'Fixes JOV-12' },
      { body: 'Refs JOV-1' },
    ]) {
      expect(pullImplementsIssue(pull, 'JOV-1')).toBe(false);
    }
    expect(pullImplementsIssue({ title: 'JOV-1' }, 'not-an-id')).toBe(false);
  });

  it('rejects an ambiguous link set', async () => {
    const github = async () => {
      throw new Error('not reached');
    };
    await expect(
      listMergedLinkedPulls({
        github,
        repository: REPO,
        identifier: 'JOV-1',
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
    const classify = async (github, harnessManifest = HARNESS_MANIFEST) =>
      classifyMergedRisk(
        await listMergedFiles({
          github,
          repository: REPO,
          pulls: [{ number: 1 }],
        }),
        harnessManifest
      );
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

  it('retries GitHub 5xx with backoff and succeeds on a later attempt', async () => {
    const seen = [];
    const github = githubClient(async () => {
      seen.push('call');
      return seen.length < 3
        ? { ok: false, status: 503, json: async () => ({}) }
        : json({ ok: 1 });
    }, 'gh_test');
    expect((await github('repos/JovieInc/Jovie/pulls/15973')).body).toEqual({
      ok: 1,
    });
    expect(seen).toHaveLength(3);
  });

  it('reports a persistent GitHub 5xx after the bounded attempts', async () => {
    let calls = 0;
    const github = githubClient(async () => {
      calls += 1;
      return { ok: false, status: 503, json: async () => ({}) };
    }, 'gh_test');
    await expect(github('repos/JovieInc/Jovie/pulls/15973')).rejects.toThrow(
      /GitHub HTTP 503 for repos\/JovieInc\/Jovie\/pulls\/15973/
    );
    expect(calls).toBe(4);
  });

  it('does not retry a GitHub 4xx', async () => {
    let calls = 0;
    const github = githubClient(async () => {
      calls += 1;
      return { ok: false, status: 404, json: async () => ({}) };
    }, 'gh_test');
    await expect(github('repos/x')).rejects.toThrow(/GitHub HTTP 404/);
    expect(calls).toBe(1);
  });
});

describe('immutable GitHub read cache (repo quota, 2026-10-11)', () => {
  const { mkdtempSync, rmSync, readdirSync, utimesSync } = nodeFs;
  const PULL = `repos/${REPO}/pulls/7`;
  const FILES = `repos/${REPO}/pulls/7/files?per_page=100&page=1`;
  const COMPARE = `repos/${REPO}/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`;
  const tempDir = () => mkdtempSync(`${tmpdir()}/linear-sync-cache-`);
  const live = responses => {
    const calls = [];
    return {
      calls,
      github: async path => {
        calls.push(path);
        return {
          body: structuredClone(
            responses[path.split('?')[0]] ?? responses[path]
          ),
          link: '',
        };
      },
    };
  };
  const merged = {
    number: 7,
    title: 'feat: thing (JOV-1)',
    body: 'Closes JOV-1',
    html_url: `https://github.com/${REPO}/pull/7`,
    merged_at: '2026-10-11T00:00:00Z',
    merge_commit_sha: 'c'.repeat(40),
    base: { ref: 'main' },
    head: { ref: 'codex/jov-1' },
    user: { login: 'large-payload-not-kept' },
  };

  it('serves merged pulls, their files and exact compares from disk on the next sweep', async () => {
    const dir = tempDir();
    try {
      const responses = {
        [PULL]: merged,
        [`repos/${REPO}/pulls/7/files`]: [{ filename: 'a.ts', patch: '@@' }],
        [COMPARE]: { status: 'ahead', commits: [] },
      };
      const first = live(responses);
      const sweepOne = immutableGithubCache(first.github, dir);
      await sweepOne(PULL);
      await sweepOne(FILES);
      await sweepOne(COMPARE);
      expect(first.calls).toHaveLength(3);

      const second = live(responses);
      const sweepTwo = immutableGithubCache(second.github, dir);
      const pull = await sweepTwo(PULL);
      const files = await sweepTwo(FILES);
      const compare = await sweepTwo(COMPARE);
      expect(second.calls).toEqual([]);
      expect(pull.body).toMatchObject({
        merged_at: merged.merged_at,
        merge_commit_sha: merged.merge_commit_sha,
        base: { ref: 'main' },
      });
      expect(pull.body.user).toBeUndefined();
      expect(pullImplementsIssue(pull.body, 'JOV-1')).toBe(true);
      expect(files.body).toEqual([
        { filename: 'a.ts', previous_filename: undefined },
      ]);
      expect(compare.body).toEqual({ status: 'ahead' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never caches an open pull request, its files or a non-sha compare', async () => {
    const dir = tempDir();
    try {
      const responses = {
        [PULL]: { ...merged, merged_at: null },
        [`repos/${REPO}/pulls/7/files`]: [{ filename: 'a.ts' }],
        [`repos/${REPO}/compare/main...b`]: { status: 'ahead' },
      };
      for (let sweep = 0; sweep < 2; sweep += 1) {
        const { calls, github } = live(responses);
        const cached = immutableGithubCache(github, dir);
        await cached(PULL);
        await cached(FILES);
        await cached(`repos/${REPO}/compare/main...b`);
        expect(calls).toHaveLength(3);
      }
      expect(boundGithubCache(dir)).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bounds the directory and keys the save on content', async () => {
    const dir = tempDir();
    try {
      const paths = ['b', 'c', 'd'].map(
        head => `repos/${REPO}/compare/${'a'.repeat(40)}...${head.repeat(40)}`
      );
      const { github } = live(
        Object.fromEntries(paths.map(path => [path, { status: 'ahead' }]))
      );
      const cached = immutableGithubCache(github, dir);
      for (const path of paths) await cached(path);
      const names = readdirSync(dir);
      names.forEach((name, index) =>
        utimesSync(`${dir}/${name}`, index + 1, index + 1)
      );
      const before = boundGithubCache(dir, 10);
      expect(before).toMatch(/^[0-9a-f]{16}$/);
      expect(boundGithubCache(dir, 10)).toBe(before);
      const after = boundGithubCache(dir, 2);
      expect(readdirSync(dir)).toHaveLength(2);
      expect(readdirSync(dir)).not.toContain(names[0]);
      expect(after).not.toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes through without a cache directory', async () => {
    const { calls, github } = live({ [PULL]: merged });
    const cached = immutableGithubCache(github, undefined);
    await cached(PULL);
    await cached(PULL);
    expect(calls).toHaveLength(2);
  });
});

describe('githubClient on an exhausted repo quota', () => {
  it('stops at once and marks the error rate-limited so the sweep defers', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'x-ratelimit-remaining': '0' }),
        json: async () => ({
          message: 'API rate limit exceeded for installation.',
        }),
      };
    };
    const error = await githubClient(
      fetchImpl,
      't'
    )(`repos/${REPO}/pulls/1`).catch(e => e);
    expect(error.message).toContain('GitHub HTTP 403');
    expect(error.rateLimited).toBe(true);
    expect(calls).toBe(1);
  });
});
