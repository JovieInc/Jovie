import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REQUIRED } from '../promotion-readiness.mjs';
import {
  collectorIo,
  collectPromotion,
  guardrailValid,
  MAX_AGE_MS,
  parityMatches,
  promotionVerdict,
} from '../promotion-readiness-collect.mjs';

const now = 1800000000000;
const sha = n => String(n).repeat(40);
const input = { repo: 'JovieInc/Jovie', pr: 1, expectedHead: sha(1) };
const body =
  '## Guardrail\nFailure class: loop\nMechanism: exact head\nWhere enforced: enroll\nHow it heals: fresh evidence\nNOW\nSimulation: cascade\n';
function fixture() {
  const context = {
    head: sha(1),
    base: sha(2),
    tree: sha(3),
    policy: sha(4),
    metadata: sha(5),
    headTree: sha(6),
    mergeParents: [sha(2), sha(1)],
    mergeable: true,
    behind: 1,
    baseAgeMs: 1,
    pull: { body },
    labels: [],
  };
  const selected = { product: ['web'], lanes: ['product'] };
  const bundle = {
    sha: context.head,
    tree: context.headTree,
    rc: 0,
    at: new Date(now).toISOString(),
    base: context.base,
    mergedTree: context.tree,
    policy: context.policy,
    metadata: context.metadata,
    suitesComplete: true,
    selectedSuites: selected,
  };
  const io = {
    context: async () => context,
    sourceChecks: async () => ({ pass: true, at: now }),
    sizePolicy: async () => ({ pass: true }),
    outsideReview: async () => ({ pass: true }),
    retry: async () => ({ complete: true, runs: [], receipts: [], retries: 0 }),
    selectedSuites: async () => selected,
    /** @returns {Promise<Array<Partial<typeof bundle>>>} */
    bundles: async () => [bundle],
    queue: async () => ({ complete: true, version: 'q1', entries: [] }),
    health: async () => ({ complete: true, circuitOpen: false }),
    main: async () => context.base,
    currentMetadata: async () => ({
      metadata: context.metadata,
      head: context.head,
    }),
    overlap: async () => 'clean',
    lease: async () => true,
  };
  return { context, selected, bundle, io };
}
test('collector binds all REQUIRED receipts to one exact tuple', async () => {
  const { io } = fixture();
  const collected = await collectPromotion(input, io, { now });
  assert.deepEqual(
    Object.keys(collected.evidence).sort(),
    [...REQUIRED].sort()
  );
  for (const receipt of Object.values(collected.evidence)) {
    assert.equal(receipt.pass, true);
    assert.deepEqual(receipt.tuple, collected.tuple);
  }
  assert.equal((await promotionVerdict(input, io, { now })).ready, true);
});
for (const name of [
  'sourceChecks',
  'sizePolicy',
  'outsideReview',
  'retry',
  'bundles',
  'selectedSuites',
]) {
  test(`collector fails closed when ${name} throws without rejecting`, async () => {
    const { io } = fixture();
    io[name] = async () => {
      throw new Error('offline');
    };
    const result = await promotionVerdict(input, io, { now });
    assert.equal(result.ready, false);
    assert.equal(result.mode, 'shadow');
    assert.equal(result.errors.length, 1);
  });
}
test('stale and future source receipts are not refreshed by collection', async () => {
  for (const at of [now - MAX_AGE_MS - 1, now + 1]) {
    const { io } = fixture();
    io.sourceChecks = async () => ({ pass: true, at });
    assert.ok(
      (await promotionVerdict(input, io, { now })).failures.includes(
        'sourceChecks'
      )
    );
  }
});
test('missing, malformed or moved identity is a shadow HOLD', async () => {
  for (const value of [undefined, 'short', sha(9)]) {
    const { context, io } = fixture();
    context.head = value;
    assert.deepEqual((await promotionVerdict(input, io, { now })).failures, [
      'collector',
    ]);
  }
});
test('every tuple field and selected-suite plan participates in bundle binding', () => {
  const { context, bundle, selected } = fixture();
  for (const field of [
    'base',
    'mergedTree',
    'policy',
    'metadata',
    'sha',
    'tree',
  ]) {
    assert.equal(
      parityMatches({ ...bundle, [field]: sha(9) }, context, selected, now),
      false,
      field
    );
  }
  assert.equal(parityMatches(bundle, context, {}, now), false);
  assert.equal(
    parityMatches(
      { ...bundle, at: new Date(now - MAX_AGE_MS - 1).toISOString() },
      context,
      selected,
      now
    ),
    false
  );
});
test('ordinary preflight evidence never claims merged-suite coverage or triggers a duplicate flight', async () => {
  const { io, bundle } = fixture();
  io.bundles = async () => [
    { sha: bundle.sha, tree: bundle.tree, rc: 0, at: bundle.at },
  ];
  io.dispatchSelected = async () => assert.fail('second CI flight');
  assert.ok(
    (await promotionVerdict(input, io, { now })).failures.includes(
      'mergeSuiteParity'
    )
  );
});
test('missing bundle dispatches only the supplied selected plan and remains pending', async () => {
  const { io, selected, context } = fixture();
  let dispatched;
  io.bundles = async () => [];
  io.dispatchSelected = async value => {
    dispatched = value;
  };
  assert.ok(
    (await promotionVerdict(input, io, { now })).failures.includes(
      'mergeSuiteParity'
    )
  );
  assert.deepEqual(dispatched, { context, selected });
});
test('main/queue/metadata races and absent shared lease all HOLD', async () => {
  for (const mutate of [
    io => {
      io.main = async () => sha(9);
    },
    io => {
      let n = 0;
      io.queue = async () => ({ complete: true, version: String(n++) });
    },
    io => {
      io.currentMetadata = async () => ({ metadata: sha(9), head: sha(1) });
    },
    io => {
      io.currentMetadata = async () => ({ metadata: sha(5), head: sha(9) });
    },
    io => {
      delete io.lease;
    },
    io => {
      io.health = async () => ({ complete: true, circuitOpen: true });
    },
    io => {
      io.overlap = async () => 'conflict';
    },
  ]) {
    const { io } = fixture();
    mutate(io);
    assert.equal((await promotionVerdict(input, io, { now })).ready, false);
  }
});
test('dry merge requires exact parents and bounded base age/distance', async () => {
  for (const changed of [
    { mergeParents: [sha(9), sha(1)] },
    { behind: 41 },
    { baseAgeMs: 13 * 3600000 },
  ]) {
    const { context, io } = fixture();
    Object.assign(context, changed);
    assert.ok(
      (await promotionVerdict(input, io, { now })).failures.includes('dryMerge')
    );
  }
});
test('Guardrail parser requires real fields and rejects N/A or untracked LATER', () => {
  assert.equal(guardrailValid(body), true);
  for (const invalid of [
    body.replace('Mechanism: exact head', ''),
    body.replace('Mechanism: exact head', 'Mechanism: '),
    body.replace('loop', 'N/A'),
    body.replace('NOW', 'LATER'),
  ])
    assert.equal(guardrailValid(invalid), false);
  assert.equal(guardrailValid(body.replace('NOW', 'LATER JOV-13053')), true);
});
test('runtime size adapter uses canonical exclusions and train source verification', async () => {
  const io = collectorIo({ repo: input.repo, policy: sha(4), transport: {} });
  const result = await io.sizePolicy({
    files: [
      { filename: 'script.mjs', additions: 801, deletions: 0 },
      { filename: 'script.test.mjs', additions: 9000, deletions: 0 },
    ],
    labels: [],
    pull: { body: '' },
  });
  assert.equal(result.pass, false);
  const small = await io.sizePolicy({
    files: [{ filename: 'script.test.mjs', additions: 9000, deletions: 0 }],
    labels: [],
    pull: { body: '' },
  });
  assert.equal(small.pass, true);
});

test('a foreign tuple cannot be rebound by a trusted adapter', async () => {
  const { io } = fixture();
  io.sourceChecks = async () => ({
    pass: true,
    at: now,
    tuple: { head: sha(9) },
  });
  assert.ok(
    (await promotionVerdict(input, io, { now })).failures.includes(
      'sourceChecks'
    )
  );
});
