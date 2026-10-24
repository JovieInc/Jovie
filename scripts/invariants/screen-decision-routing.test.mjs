import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { summerCardId } from '../../apps/web/lib/ovie/summer-card-digest.ts';
import {
  summerCardDecisionContract,
  summerCardInputSchema,
} from '../../apps/web/lib/ovie/summer-cards.ts';
import {
  runScreenCertification,
  SCREEN_REGISTRY,
} from './screen-certification.mjs';
import {
  projectScreenDecisionRouting,
  SCREEN_DECISION_SCHEMA,
} from './screen-decision-routing.mjs';
import { routeScreenEventReviews } from './screen-event-routing.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('EVENT routing qualification in the screen gate (JOV-7350)', () => {
  const source = 'apps/web/app/(home)/page.tsx';
  const decision = (overrides = {}) => ({
    id: 'identity-change',
    kind: 'event',
    eventClass: 'identity',
    paths: [source],
    proposedEffect: 'Replace the permanent public product identity.',
    evidence: ['canon/VOICE.md'],
    ...overrides,
  });
  /** @param {unknown[]} [decisions] */
  const declaration = (decisions = [decision()], overrides = {}) => ({
    schema: SCREEN_DECISION_SCHEMA,
    headSha: HEAD,
    changedPaths: [source],
    decisions,
    ...overrides,
  });
  const project = declarations =>
    projectScreenDecisionRouting({
      headSha: HEAD,
      changedPaths: [source],
      declarations,
    });
  const gate = (declarations, overrides = {}) =>
    runScreenCertification({
      headSha: HEAD,
      changedFiles: [source],
      registrationOnly: true,
      decisionDeclarations: declarations,
      ...overrides,
    });

  it('projects an EVENT candidate in the real gate without inventing delivery or approval', () => {
    const result = gate(declaration());
    assert.equal(result.ok, true);
    assert.equal(result.receipt.certified, false);
    const routing = result.receipt.decisionRouting;
    assert.equal(routing.mode, 'qualification-only');
    assert.equal(routing.status, 'founder-routing-unavailable');
    assert.equal(routing.runtimeProofAuthority, 'Gem');
    assert.equal(routing.classificationAuthority, 'not-verified');
    assert.equal(routing.trustedRoutingAdapter, 'unavailable');
    assert.equal(routing.deliveryVerified, false);
    assert.equal(routing.approvalVerified, false);
    assert.equal(routing.founderReviewCandidates.length, 1);
    assert.deepEqual(routing.founderReviewCandidates[0], {
      ...decision(),
      destination: 'founder-review',
      reviewBoundary: 'before-consequential-effect',
      provenance: 'caller-declaration',
      delivery: 'not-verified',
      approval: 'not-verified',
    });
  });

  it('does not turn missing classification into an ordinary-work pass', () => {
    const result = gate(undefined);
    assert.equal(result.ok, true);
    assert.equal(
      result.receipt.decisionRouting.status,
      'classification-unavailable'
    );
    assert.deepEqual(result.receipt.decisionRouting.unclassifiedPaths, [
      source,
    ]);
    assert.deepEqual(
      result.receipt.decisionRouting.founderReviewCandidates,
      []
    );
  });

  it('cannot use an EVENT declaration to bypass existing exact runtime evidence', () => {
    const result = gate(declaration(), { registrationOnly: false });
    assert.equal(result.ok, false);
    assert.equal(result.receipt.certified, false);
    assert.ok(result.receipt.issues.some(issue => issue.includes('proof')));
    assert.equal(
      result.receipt.decisionRouting.status,
      'founder-routing-unavailable'
    );
  });

  it('routes routine spacing, runtime proof and external actions to their existing owners', () => {
    for (const [kind, destination] of [
      ['machine-correctness', 'existing-ci'],
      ['platform-device-proof', 'Gem'],
      ['consequential-external-action', 'existing-action-authorization'],
    ]) {
      const routing = project(
        declaration([
          decision({
            kind,
            eventClass: undefined,
            proposedEffect:
              'Correct reversible spacing within the existing design contract.',
          }),
        ])
      );
      assert.equal(routing.status, 'declaration-only');
      assert.deepEqual(routing.founderReviewCandidates, []);
      assert.equal(routing.routes[0].destination, destination);
      assert.equal(routing.routes[0].approval, 'not-verified');
    }
  });

  it('does not infer EVENT from an auth path or bypass exclusions', () => {
    const authPath = SCREEN_REGISTRY.find(
      entry => entry.excluded && entry.owner === 'auth-security'
    ).sources[0];
    const input = declaration(
      [
        decision({
          kind: 'machine-correctness',
          eventClass: undefined,
          paths: [authPath],
        }),
      ],
      { changedPaths: [authPath] }
    );
    const result = gate(input, { changedFiles: [authPath] });
    assert.equal(result.ok, true);
    assert.equal(result.receipt.certified, false);
    assert.equal(result.receipt.excludedChanges.length, 1);
    assert.deepEqual(
      result.receipt.decisionRouting.founderReviewCandidates,
      []
    );
  });

  it('keeps taste steering separate from pre-merge human holds', () => {
    const routing = project(
      declaration([
        decision({ kind: 'founder-strategy-taste', eventClass: undefined }),
      ])
    );
    assert.equal(
      routing.founderReviewCandidates[0].reviewBoundary,
      'existing-taste-steering-or-post-landing-certification'
    );
  });

  it('retains security and permanence EVENT classes', () => {
    for (const eventClass of ['security', 'permanence']) {
      assert.equal(
        project(declaration([decision({ eventClass })]))
          .founderReviewCandidates[0].eventClass,
        eventClass
      );
    }
  });

  it('rejects stale, malformed, partial and forged-approval envelopes', () => {
    for (const input of [
      null,
      [],
      {},
      declaration([], { schema: 'other/v1' }),
      declaration([], { headSha: 'b'.repeat(40) }),
      declaration([], { changedPaths: [] }),
      declaration([], { changedPaths: [source, source] }),
      declaration([], { changedPaths: ['unrelated.ts'] }),
      declaration([], { decisions: null }),
      declaration([], { approved: true }),
    ]) {
      const routing = project(input);
      assert.equal(routing.status, 'classification-unavailable');
      assert.equal(routing.routes.length, 0);
      assert.equal(routing.approvalVerified, false);
    }
    assert.equal(
      projectScreenDecisionRouting().status,
      'classification-unavailable'
    );
    assert.equal(
      projectScreenDecisionRouting({
        headSha: 'bad',
        changedPaths: [source],
        declarations: declaration(),
      }).status,
      'classification-unavailable'
    );
  });

  it('rejects invalid decisions, missing evidence, unbound paths and approval fields', () => {
    for (const invalid of [
      null,
      [],
      decision({ id: '' }),
      decision({ kind: 'unknown' }),
      decision({ kind: null }),
      decision({
        kind: { toString: () => 'machine-correctness' },
        eventClass: undefined,
      }),
      decision({ paths: [] }),
      decision({ paths: [source, source] }),
      decision({ paths: ['unrelated.ts'] }),
      decision({ proposedEffect: '' }),
      decision({ evidence: [] }),
      decision({ evidence: [null] }),
      decision({ eventClass: 'spacing' }),
      decision({ eventClass: null }),
      decision({ kind: 'machine-correctness' }),
      decision({ approved: true }),
      decision({ routingReceipt: { id: 'sc_forged', status: 'decided' } }),
    ]) {
      const routing = project(declaration([invalid]));
      assert.equal(routing.status, 'classification-unavailable');
      assert.deepEqual(routing.routes, []);
      assert.deepEqual(routing.unclassifiedPaths, [source]);
    }
    const duplicate = project(declaration([decision(), decision()]));
    assert.equal(duplicate.status, 'classification-unavailable');
    assert.equal(duplicate.routes.length, 1);
  });

  it('requires full change-set binding even for deleted or excluded surfaces', () => {
    const other = 'apps/web/app/deleted/page.tsx';
    const result = gate(declaration(), {
      changedFiles: [
        { path: source, status: 'M' },
        { path: other, status: 'D' },
      ],
    });
    assert.equal(
      result.receipt.decisionRouting.status,
      'classification-unavailable'
    );
    assert.deepEqual(
      result.receipt.decisionRouting.changedPaths,
      [source, other].sort()
    );
    const input = declaration([], { changedPaths: [other, source] });
    const empty = projectScreenDecisionRouting({
      headSha: HEAD,
      changedPaths: [source, other, source],
      declarations: input,
    });
    assert.deepEqual(empty.unclassifiedPaths, [source, other].sort());
  });

  it('reads qualification declarations through the CLI and records parse failures in its receipt', () => {
    const temp = mkdtempSync(join(tmpdir(), 'screen-decisions-cli-'));
    const input = join(temp, 'declarations.json');
    const output = join(temp, 'receipt.json');
    const head = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim();
    const run = (...extra) =>
      spawnSync(
        process.execPath,
        [
          join(ROOT, 'scripts/invariants/screen-certification.mjs'),
          '--registration-only',
          '--diff-base=HEAD',
          `--receipt-out=${output}`,
          ...extra,
        ],
        { cwd: ROOT, encoding: 'utf8' }
      );
    try {
      const baseline = run();
      const baselineReceipt = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(baseline.status, 1); // Existing self-diff rejection remains enforced.
      writeFileSync(
        input,
        JSON.stringify(declaration([], { headSha: head, changedPaths: [] }))
      );
      const valid = run(`--decision-file=${input}`);
      const validReceipt = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(valid.status, baseline.status);
      assert.deepEqual(validReceipt.issues, baselineReceipt.issues);
      assert.equal(validReceipt.decisionRouting.status, 'declaration-only');
      assert.equal(validReceipt.decisionRouting.approvalVerified, false);
      assert.match(valid.stdout, /mode=qualification-only/);
      writeFileSync(input, '{');
      const invalid = run(`--decision-file=${input}`);
      const invalidReceipt = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(invalid.status, baseline.status);
      assert.deepEqual(invalidReceipt.issues, baselineReceipt.issues);
      assert.equal(
        invalidReceipt.decisionRouting.status,
        'classification-unavailable'
      );
      assert.match(
        invalidReceipt.decisionRouting.findings.join(' '),
        /could not be read/
      );
      const missing = run(`--decision-file=${join(temp, 'missing.json')}`);
      assert.equal(missing.status, baseline.status);
      assert.equal(
        JSON.parse(readFileSync(output, 'utf8')).decisionRouting.status,
        'classification-unavailable'
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('reports unreadable or invalid JSON without changing the established gate result', () => {
    const result = gate(declaration(), { decisionInputError: true });
    assert.equal(result.ok, true);
    assert.equal(
      result.receipt.decisionRouting.status,
      'classification-unavailable'
    );
    assert.match(
      result.receipt.decisionRouting.findings.join(' '),
      /could not be read/
    );
  });

  it('records an unavailable EVENT transport through the actual gate CLI without credentials', () => {
    const temp = mkdtempSync(join(tmpdir(), 'screen-event-cli-'));
    const input = join(temp, 'declarations.json');
    const output = join(temp, 'receipt.json');
    const head = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim();
    const paths = spawnSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .stdout.trim()
      .split('\n');
    try {
      writeFileSync(
        input,
        JSON.stringify(
          declaration([decision({ paths })], {
            headSha: head,
            changedPaths: paths,
          })
        )
      );
      const result = spawnSync(
        process.execPath,
        [
          join(ROOT, 'scripts/invariants/screen-certification.mjs'),
          '--registration-only',
          '--diff-base=HEAD^',
          `--receipt-out=${output}`,
          `--decision-file=${input}`,
          '--route-event-reviews',
          '--decision-issue=JOV-7350',
        ],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, VERCEL_OIDC_TOKEN: '' },
        }
      );
      const receipt = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(result.status, receipt.ok ? 0 : 1);
      assert.equal(receipt.decisionRouting.eventDelivery.status, 'unavailable');
      assert.equal(receipt.decisionRouting.deliveryVerified, false);
      assert.equal(receipt.decisionRouting.runtimeProofAuthority, 'Gem');
      assert.match(
        receipt.decisionRouting.eventDelivery.findings.join(' '),
        /credential/
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('writes producer delivery acknowledgements through the actual CLI without changing its proof verdict', () => {
    const temp = mkdtempSync(join(tmpdir(), 'screen-event-readback-cli-'));
    const input = join(temp, 'declarations.json');
    const output = join(temp, 'receipt.json');
    const transport = join(temp, 'fixture-transport.mjs');
    const committedAt = spawnSync(
      'git',
      ['show', '-s', '--format=%cI', 'HEAD'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    ).stdout.trim();
    const head = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim();
    const paths = spawnSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .stdout.trim()
      .split('\n');
    const args = [
      join(ROOT, 'scripts/invariants/screen-certification.mjs'),
      '--diff-base=HEAD^',
      `--receipt-out=${output}`,
      `--decision-file=${input}`,
    ];
    try {
      writeFileSync(
        input,
        JSON.stringify(
          declaration(
            [
              decision({ paths: paths.slice(0, 1) }),
              ...(paths.length > 1
                ? [
                    {
                      id: 'remaining-changes',
                      kind: 'machine-correctness',
                      paths: paths.slice(1),
                      proposedEffect:
                        'Verify remaining changes through existing CI.',
                      evidence: ['docs/PR_FLOW.md'],
                    },
                  ]
                : []),
            ],
            { headSha: head, changedPaths: paths }
          )
        )
      );
      // Test-only producer boundary; no live card or authority receipt is filed.
      writeFileSync(
        transport,
        `
        import { createHash } from 'node:crypto';
        import { mock } from 'node:test';
        // Bind the fixture clock to HEAD so old checkouts remain reproducible.
        mock.timers.enable({ apis: ['Date'], now: ${Date.parse(committedAt)} });
        globalThis.fetch = async (url, init) => {
          if (url !== 'https://jov.ie/api/internal/ovie/summer-cards' ||
              init.headers.authorization !== 'Bearer fixture-only-oidc-token') throw Error('unexpected transport');
          const input = JSON.parse(init.body);
          const digest = createHash('sha256').update('summer-card:' + input.idempotencyKey).digest('hex');
          return new Response(JSON.stringify({card: {...input,
            defaultIfSilent: null, recipient: null, amountUsd: null,
            defaultDecision: 'reject',
            id: 'sc_' + digest.slice(0, 32), status: 'approved',
            createdAt: new Date().toISOString()
          }}), {status: 201});
        };
      `
      );
      const baseline = spawnSync(process.execPath, args, {
        cwd: ROOT,
        encoding: 'utf8',
      });
      const before = JSON.parse(readFileSync(output, 'utf8'));
      const routed = spawnSync(
        process.execPath,
        [
          `--import=${transport}`,
          ...args,
          '--route-event-reviews',
          '--decision-issue=JOV-7350',
        ],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, VERCEL_OIDC_TOKEN: 'fixture-only-oidc-token' },
        }
      );
      const receipt = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(routed.status, baseline.status);
      assert.equal(receipt.certified, before.certified);
      assert.deepEqual(receipt.issues, before.issues);
      assert.equal(receipt.decisionRouting.status, 'founder-routed');
      assert.deepEqual(receipt.decisionRouting.changedPaths, [...paths].sort());
      assert.deepEqual(
        receipt.decisionRouting.eventDelivery.receipts[0].changedPaths,
        [...paths].sort()
      );
      assert.deepEqual(
        receipt.decisionRouting.founderReviewCandidates[0].paths,
        paths.slice(0, 1)
      );

      assert.equal(receipt.decisionRouting.deliveryVerified, true);
      assert.equal(receipt.decisionRouting.approvalVerified, false);
      assert.equal(receipt.decisionRouting.runtimeProofAuthority, 'Gem');
      assert.equal(
        receipt.decisionRouting.eventDelivery.receipts[0].acknowledgement.phase,
        'acknowledged'
      );
      assert.match(routed.stdout, /delivery=verified/);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe('EVENT producer delivery in the screen gate', () => {
  const T0 = '2026-10-20T12:00:00.000Z';
  const COMMIT = '2026-10-20T11:00:00.000Z';
  const source = 'apps/web/app/(home)/page.tsx';
  const event = (overrides = {}) => ({
    id: 'identity-change',
    kind: 'event',
    eventClass: 'identity',
    paths: [source],
    proposedEffect: 'Change the permanent public identity.',
    evidence: ['https://github.com/JovieInc/Jovie/blob/main/canon/VOICE.md'],
    ...overrides,
  });
  const gate = (decisions = [event()], registrationOnly = true) =>
    runScreenCertification({
      headSha: HEAD,
      changedFiles: [source],
      registrationOnly,
      decisionDeclarations: {
        schema: SCREEN_DECISION_SCHEMA,
        headSha: HEAD,
        changedPaths: [source],
        decisions,
      },
    });
  const routing = (decisions = [event()]) =>
    gate(decisions).receipt.decisionRouting;
  const settings = {
    issueIdentifier: 'JOV-7350',
    headCommittedAt: COMMIT,
    token: 'test-only-oidc-token',
    now: T0,
  };
  const storedCard = input => ({
    ...summerCardInputSchema.parse(input),
    ...summerCardDecisionContract(
      summerCardInputSchema.parse(input),
      new Date(T0)
    ),
    id: summerCardId(input.idempotencyKey),
    status: 'pending',
    createdAt: T0,
    decidedAt: null,
    comment: null,
  });
  const success = async (_url, init) =>
    new Response(
      JSON.stringify({
        card: storedCard(JSON.parse(init.body)),
      }),
      { status: 201 }
    );
  const route = (projection = routing(), overrides = {}) =>
    routeScreenEventReviews(projection, {
      ...settings,
      fetchImpl: success,
      ...overrides,
    });

  it('delivers identity/security/permanence through the existing card contract with stable replay receipts', async () => {
    const projection = routing(
      ['identity', 'security', 'permanence'].map(eventClass =>
        event({ id: eventClass, eventClass })
      )
    );
    const bodies = [];
    const fetchImpl = async (url, init) => {
      assert.equal(url, 'https://jov.ie/api/internal/ovie/summer-cards');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.headers.authorization, `Bearer ${settings.token}`);
      bodies.push(JSON.parse(init.body));
      return success(url, init);
    };
    const delivered = await route(projection, { fetchImpl });
    const replayed = await route(projection, {
      fetchImpl,
      now: '2026-10-20T12:01:00.000Z',
    });
    assert.deepEqual(bodies.slice(0, 3), bodies.slice(3));
    assert.equal(delivered.status, 'founder-routed');
    assert.equal(delivered.eventDelivery.status, 'delivered');
    assert.equal(delivered.deliveryVerified, true);
    assert.equal(delivered.runtimeProofAuthority, 'Gem');
    assert.equal(delivered.classificationAuthority, 'not-verified');
    assert.equal(delivered.approvalVerified, false);
    assert.equal(delivered.mode, 'qualification-only');
    assert.deepEqual(delivered.eventDelivery.findings, []);
    assert.equal(replayed.eventDelivery.receipts.length, 3);
    for (const receipt of delivered.eventDelivery.receipts) {
      assert.equal(receipt.headSha, HEAD);
      assert.equal(receipt.proposedEffect, event().proposedEffect);
      assert.deepEqual(receipt.changedPaths, [source]);
      assert.equal(receipt.deliveredAt, T0);
      assert.equal(receipt.order.authorityClass, 'founder');
      assert.equal(receipt.order.founderAsk.defaultIfSilent, null);
      assert.equal(receipt.order.budget.maxSpendUsd, 0);
      assert.equal(receipt.order.budget.maxAttempts, 1);
      assert.ok(receipt.order.forbiddenActions.includes('certify-runtime'));
      assert.equal(receipt.acknowledgement.orderDigest, receipt.order.digest);
      assert.equal(receipt.acknowledgement.phase, 'acknowledged');
      assert.equal(receipt.acknowledgement.certification.status, 'uncertified');
      assert.equal(receipt.acknowledgement.outcome.status, 'unknown');
    }
    assert.equal(projection.deliveryVerified, false);
  });

  it('never turns Ovie delivery or an already-decided card into Gem runtime certification or approval', async () => {
    for (const status of ['pending', 'approved', 'rejected']) {
      const result = gate([event()], false);
      const before = structuredClone(result);
      result.receipt.decisionRouting = await route(
        result.receipt.decisionRouting,
        {
          fetchImpl: async (_url, init) =>
            new Response(
              JSON.stringify({
                card: { ...storedCard(JSON.parse(init.body)), status },
              }),
              { status: 200 }
            ),
        }
      );
      assert.equal(result.ok, false);
      assert.equal(result.receipt.certified, false);
      assert.deepEqual(result.receipt.issues, before.receipt.issues);
      assert.equal(result.receipt.decisionRouting.deliveryVerified, true);
      assert.equal(result.receipt.decisionRouting.approvalVerified, false);
    }
  });

  it('does not dispatch ordinary work, taste, missing or partly invalid classification', async () => {
    assert.equal(
      (await routeScreenEventReviews(routing([]))).eventDelivery.status,
      'unavailable'
    );
    for (const projection of [
      routing([]),
      routing([event({ kind: 'machine-correctness', eventClass: undefined })]),
      routing([
        event({ kind: 'founder-strategy-taste', eventClass: undefined }),
      ]),
      routing([event(), event({ kind: 'invalid', id: 'bad' })]),
    ]) {
      const result = await route(projection, {
        fetchImpl: async () => {
          throw new Error('must not dispatch');
        },
      });
      assert.deepEqual(result.eventDelivery.receipts, []);
      assert.equal(result.deliveryVerified, false);
    }
    const mixed = await route(
      routing([
        event(),
        event({
          id: 'taste',
          kind: 'founder-strategy-taste',
          eventClass: undefined,
        }),
      ])
    );
    assert.equal(mixed.eventDelivery.status, 'delivered');
    assert.equal(mixed.deliveryVerified, false);
    assert.equal(mixed.status, 'founder-routing-unavailable');
  });

  it('binds new card identities to the exact head, complete paths, effect and evidence', async () => {
    const base = routing();
    const variants = [
      await route(base),
      await route({ ...base, headSha: 'b'.repeat(40) }),
      await route({ ...base, changedPaths: [source, 'deleted.ts'] }),
      await route(
        routing([event({ proposedEffect: 'A materially different effect.' })])
      ),
      await route(routing([event({ evidence: ['canon/VOICE.md'] })])),
    ];
    assert.equal(
      new Set(variants.map(item => item.eventDelivery.receipts[0].order.digest))
        .size,
      5
    );
  });

  it('fails safe without credentials, fresh source binding or a bounded founder packet', async () => {
    for (const overrides of [
      { token: '' },
      { token: 'invalid\ntoken' },
      { issueIdentifier: '' },
      { headCommittedAt: undefined },
      { headCommittedAt: 'invalid' },
      { now: 'invalid' },
      { headCommittedAt: '2026-10-21T00:00:00.000Z' },
      { headCommittedAt: '2026-10-01T00:00:00.000Z' },
    ]) {
      let calls = 0;
      const result = await route(routing(), {
        ...overrides,
        fetchImpl: async () => {
          calls++;
          throw new Error('must not call');
        },
      });
      assert.equal(calls, 0);
      assert.equal(result.eventDelivery.status, 'unavailable');
      assert.equal(result.deliveryVerified, false);
    }
    for (const events of [
      Array.from({ length: 5 }, (_, index) => event({ id: `event-${index}` })),
      [event({ id: 'x'.repeat(65) })],
      [event({ proposedEffect: 'x'.repeat(1001) })],
    ]) {
      const result = await route(routing(events));
      assert.match(result.eventDelivery.findings.join(' '), /budget/);
    }
    for (const paths of [
      Array.from({ length: 9 }, (_, index) => `file-${index}.ts`),
      ['x'.repeat(201)],
    ]) {
      const projection = projectScreenDecisionRouting({
        headSha: HEAD,
        changedPaths: paths,
        declarations: {
          schema: SCREEN_DECISION_SCHEMA,
          headSha: HEAD,
          changedPaths: paths,
          decisions: [event({ paths })],
        },
      });
      assert.match(
        (await route(projection)).eventDelivery.findings.join(' '),
        /budget/
      );
    }
  });

  it('rejects unknown, mismatched, stale, forged and unavailable producer responses without leaking them', async () => {
    const corruptions = [
      () => null,
      () => [],
      () => true,
      card => ({ ...card, id: 'sc_forged' }),
      card => ({ ...card, body: 'different effect' }),
      card => ({ ...card, evidence: [] }),
      card => ({ ...card, defaultDecision: 'approve' }),
      card => ({ ...card, defaultDecision: null }),
      card => ({ ...card, status: 'unknown' }),
      card => ({ ...card, status: null }),
      card => ({ ...card, createdAt: 'invalid' }),
      card => ({ ...card, createdAt: 123 }),
      card => ({ ...card, createdAt: '2026-10-01T00:00:00.000Z' }),
      card => ({ ...card, createdAt: '2026-10-21T00:00:00.000Z' }),
    ];
    for (const corrupt of corruptions) {
      const result = await route(routing(), {
        fetchImpl: async (_url, init) =>
          new Response(
            JSON.stringify({ card: corrupt(storedCard(JSON.parse(init.body))) })
          ),
      });
      assert.equal(result.eventDelivery.status, 'unavailable');
      assert.equal(result.deliveryVerified, false);
    }
    for (const fetchImpl of [
      async () => {
        throw new Error(settings.token);
      },
      async () => new Response('{'),
      ...[null, [], {}].map(
        body => async () => new Response(JSON.stringify(body))
      ),
      ...[302, 401, 403, 409, 503].map(
        status => async () => new Response(settings.token, { status })
      ),
    ]) {
      const result = await route(routing(), { fetchImpl });
      assert.equal(result.eventDelivery.status, 'unavailable');
      assert.ok(!JSON.stringify(result).includes(settings.token));
    }
    const invalidOrder = await route(
      routing([event({ evidence: ['x'.repeat(601)] })])
    );
    assert.equal(invalidOrder.eventDelivery.status, 'unavailable');
  });

  it('records partial delivery and stops after the first failed readback', async () => {
    let calls = 0;
    const result = await route(
      routing(['identity', 'security', 'permanence'].map(id => event({ id }))),
      {
        fetchImpl: async (url, init) =>
          ++calls === 1
            ? success(url, init)
            : new Response('', { status: 503 }),
      }
    );
    assert.equal(calls, 2);
    assert.equal(result.eventDelivery.status, 'partial');
    assert.equal(result.eventDelivery.receipts.length, 1);
    assert.equal(result.deliveryVerified, false);
  });
});
