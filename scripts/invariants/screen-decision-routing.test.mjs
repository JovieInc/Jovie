import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  runScreenCertification,
  SCREEN_REGISTRY,
} from './screen-certification.mjs';
import {
  projectScreenDecisionRouting,
  SCREEN_DECISION_SCHEMA,
} from './screen-decision-routing.mjs';

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
      decision({ paths: [] }),
      decision({ paths: [source, source] }),
      decision({ paths: ['unrelated.ts'] }),
      decision({ proposedEffect: '' }),
      decision({ evidence: [] }),
      decision({ evidence: [null] }),
      decision({ eventClass: 'spacing' }),
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
});
