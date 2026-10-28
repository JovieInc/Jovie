import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  WRITING_QUALITY_AXES,
  WRITING_QUALITY_RUBRICS,
} from '../../packages/copy/writing-quality.ts';
import {
  buildRevisionQualityReport,
  revisionEvidenceDigest as hash,
  MAX_REVISION_EXAMPLES,
  REVISION_REPLAY_SCHEMA,
  REVISION_SCENARIOS,
  revisionTextDigest,
} from './jev-revision-report.mjs';
import { main, renderRevisionReport } from './jev-revision-report-cli.mjs';
import { readWritingSurfacesRegistry } from './writing-surfaces.mjs';

// Synthetic owner projections exercise the contract; they are never human quality evidence.
function fixture() {
  const texts = [
    'The artist profile has useful information.',
    'Ready. Your profile is ready.',
    'Budget test candidate.',
    'Your sales doubled without evidence.',
    'New record. Out Friday.',
    'Tu perfil está listo para revisar.',
    'The price is 12 dollars, billed monthly.',
    'Timeout test candidate.',
    'The release date is not confirmed yet.',
  ];
  const examples = REVISION_SCENARIOS.map((scenario, i) => ({
    id: `e${i}`,
    documentId: `doc${i}`,
    split: 'holdout',
    text: texts[i],
    evidenceSha256: 'e'.repeat(64),
    scenarios: [scenario],
    expectedState: [
      'budget-failure',
      'confident-false-claim',
      'timeout',
    ].includes(scenario)
      ? 'abstain'
      : 'accepted',
  }));
  examples.unshift({
    id: 'tuning',
    documentId: 'tuning-doc',
    split: 'tuning',
    text: 'A separate document used during tuning.',
    evidenceSha256: 'a'.repeat(64),
    scenarios: [],
    expectedState: 'accepted',
  });
  const corpus = { version: 'synthetic-contract-only/v1', examples };
  const surface = readWritingSurfacesRegistry().surfaces[0];
  const target = {
    sourceSha: 'a'.repeat(40),
    surfaceId: surface.id,
    policyVersion: surface.policyVersion,
    writerModel: 'fixture/writer-resolved',
    resolvedModel: 'fixture/judge-resolved',
    writerProvider: 'fixture-writer',
    judgeProvider: 'fixture-judge',
    corpusSha256: hash(corpus),
    rubricSha256: hash(WRITING_QUALITY_RUBRICS),
    labelsSha256: null,
  };
  const label = (candidate, revised = false, factual = true) =>
    candidate === null
      ? null
      : {
          textSha256: revisionTextDigest(candidate),
          usefulness: revised ? 4 : 2,
          voice: revised ? 4 : 3,
          factual,
          ...(revised
            ? { introducedDrift: false, preservationFailure: false }
            : {}),
        };
  const labels = {
    issue: 'JOV-6476',
    labelProvenance: 'human-adjudicated',
    ownerRef: 'fixture:source-owner',
    sourceOwnerApprovalRef: 'fixture:label-approval',
    approvedAt: 40,
    corpusSha256: hash(corpus),
    rubricSha256: target.rubricSha256,
    rows: examples.slice(1).map(e => {
      const failed = ['budget-failure', 'timeout'].includes(e.scenarios[0]);
      const unchanged = e.scenarios[0] === 'approved-voice';
      const factual = e.scenarios[0] !== 'confident-false-claim';
      return {
        id: e.id,
        adjudicatorRef: 'fixture:human',
        labelRef: `fixture:label-${e.id}`,
        baseline: label(e.text, false, factual),
        revised: label(
          failed ? null : unchanged ? e.text : `${e.text} Revised.`,
          true,
          factual
        ),
      };
    }),
  };
  labels.rows[1].revised.usefulness = labels.rows[1].baseline.usefulness;
  labels.rows[1].revised.voice = labels.rows[1].baseline.voice;
  target.labelsSha256 = hash(labels);
  const limits = {
    declaredAt: 10,
    minPairs: 7,
    minUsefulnessDelta: 1,
    minVoiceDelta: 0,
    maxFactualFalseAcceptance: 0,
    maxIntroducedDrift: 0,
    maxPreservationFailures: 0,
    maxAbstentionRate: 0.5,
    maxFallbackRate: 0.2,
    maxP95LatencyMs: 1000,
    maxCostPerExampleUsd: 0.1,
  };
  const calibration = {
    kind: 'calibration',
    issue: 'JOV-6476',
    receiptId: 'fixture:calibration',
    ownerRef: 'fixture:calibration-owner',
    targetDigest: hash(target),
    status: 'calibrated',
    decision: 'eligible-for-bounded-canary',
    version: 'synthetic-only/v1',
    issuedAt: 25,
    expiresAt: 100,
    minConfidence: Object.fromEntries(WRITING_QUALITY_AXES.map(a => [a, 0.8])),
    heldout: {
      humanLabelsApprovalRef: labels.sourceOwnerApprovalRef,
      labelProvenance: 'human-adjudicated',
      tuningDocumentIds: ['tuning-doc'],
      holdoutDocumentIds: examples.slice(1).map(e => e.documentId),
      excludedFromWriterPrompts: true,
      digest: hash(examples.slice(1)),
      predeclaredLimitsDigest: hash(limits),
      limitsDeclaredAt: 10,
      openedAt: 20,
    },
  };
  const promptContext = {
    ownerRef: 'fixture:prompt-owner',
    archiveRef: 'fixture:archived-prompts',
    documentIds: ['tuning-doc'],
    prompts: ['Use only the approved evidence.'],
    demonstrations: [examples[0].text],
    revisionInstructions: ['Repair flagged passages once.'],
  };
  const call = (e, phase, role, status = 'succeeded') => ({
    role,
    status,
    requestId: `${e.id}-${phase}-${role}`,
    responseId:
      status === 'succeeded' ? `response-${e.id}-${phase}-${role}` : null,
    modelId: role === 'writer' ? target.writerModel : target.resolvedModel,
    provider: role === 'writer' ? target.writerProvider : target.judgeProvider,
    latencyMs: 10,
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
  });
  const runs = examples.slice(1).map(e => {
    const scenario = e.scenarios[0];
    const budget = scenario === 'budget-failure';
    const timeout = scenario === 'timeout';
    const unchanged = scenario === 'approved-voice';
    return {
      id: e.id,
      receiptId: `fixture:pilot-${e.id}`,
      ownerRef: 'fixture:pilot-owner',
      archiveRef: `fixture:archive-${e.id}`,
      execution: 'gateway',
      recordedAt: 30,
      targetDigest: hash(target),
      calibrationDigest: hash(calibration),
      promptContextDigest: hash(promptContext),
      funding: {
        status: 'approved',
        receiptRef: 'fixture:funded-run',
        targetDigest: hash(target),
        issuedAt: 25,
        expiresAt: 100,
        maxCostUsd: 0.01,
      },
      revisionCount: budget || unchanged ? 0 : 1,
      failure: budget ? 'budget' : timeout ? 'timeout' : null,
      baseline: {
        text: e.text,
        state: 'accepted',
        latencyMs: 25,
        calls: [call(e, 'baseline', 'writer'), call(e, 'baseline', 'judge')],
      },
      revised: {
        text:
          budget || timeout ? null : unchanged ? e.text : `${e.text} Revised.`,
        state: e.expectedState,
        latencyMs: 30,
        calls:
          budget || unchanged
            ? []
            : timeout
              ? [call(e, 'revised', 'writer', 'timeout')]
              : [call(e, 'revised', 'writer'), call(e, 'revised', 'judge')],
      },
    };
  });
  return {
    schema: REVISION_REPLAY_SCHEMA,
    corpus,
    target,
    labels,
    calibration,
    limits,
    promptContext,
    runs,
  };
}

// Rebind only to test semantic checks beyond an otherwise valid content digest.
function rebind(input) {
  input.target.corpusSha256 = hash(input.corpus);
  if (input.labels) {
    input.labels.corpusSha256 = hash(input.corpus);
    input.target.labelsSha256 = hash(input.labels);
  }
  input.calibration.targetDigest = hash(input.target);
  input.calibration.heldout.digest = hash(
    input.corpus.examples.filter(e => e.split === 'holdout')
  );
  input.calibration.heldout.predeclaredLimitsDigest = hash(input.limits);
  for (const run of input.runs) {
    run.targetDigest = hash(input.target);
    run.funding.targetDigest = hash(input.target);
    run.calibrationDigest = hash(input.calibration);
    run.promptContextDigest = hash(input.promptContext);
  }
}

test('reports separate paired quality, factual, revision, failure and full pipeline cost denominators', () => {
  const input = fixture();
  const report = buildRevisionQualityReport(input);
  assert.deepEqual(report.reasons, []);
  assert.equal(report.status, 'eligible-for-bounded-canary');
  assert.equal(report.heldoutCount, 9);
  assert.equal(report.metrics.baseline.usefulness.n, 9);
  assert.deepEqual(report.metrics.pairedDelta.usefulness, {
    n: 7,
    mean: 12 / 7,
  });
  assert.deepEqual(report.metrics.baseline.factualFalseAcceptance, {
    numerator: 1,
    denominator: 1,
    rate: 1,
  });
  assert.deepEqual(report.metrics.revised.factualFalseAcceptance, {
    numerator: 0,
    denominator: 1,
    rate: 0,
  });
  assert.deepEqual(report.metrics.introducedDrift, {
    numerator: 0,
    denominator: 6,
    rate: 0,
  });
  assert.deepEqual(report.metrics.revisionCounts, { n: 9, zero: 2, one: 7 });
  assert.deepEqual(report.metrics.failures, {
    timeout: 1,
    budget: 1,
    denominator: 9,
  });
  assert.equal(report.metrics.revised.latencyMs.p95, 55);
  assert.equal(
    report.metrics.baseline.attributableCostUsd.total,
    0.018000000000000002
  );
  assert.ok(
    Math.abs(report.metrics.revised.attributableCostUsd.total - 0.031) < 1e-12
  );
  assert.equal(report.metrics.revised.tokens.input, 310);
  assert.deepEqual(
    buildRevisionQualityReport(JSON.parse(JSON.stringify(input))),
    report
  );
  assert.equal(hash(input), report.hashes.input);
  for (const digest of Object.values(report.hashes))
    assert.match(digest, /^[a-f0-9]{64}$/u);
});

/** @type {Array<[path: string, value: unknown, reason: string]>} */
const invalidEvidenceCases = [
  ['labels', null, 'human-labels-missing'],
  ['labels.labelProvenance', 'model-generated', 'human-labels-missing'],
  ['labels.sourceOwnerApprovalRef', null, 'human-labels-missing'],
  ['labels.rows.0.adjudicatorRef', null, 'missing-or-mismatched-human-label'],
  [
    'runs.0.revised.text',
    'Changed after adjudication',
    'missing-or-mismatched-human-label',
  ],
  ['labels.rows.0.baseline.usefulness', 5, 'missing-or-mismatched-human-label'],
  ['calibration', null, 'calibration-missing'],
  ['calibration.version', 'provisional', 'calibration-missing'],
  ['calibration.issue', 'JOV-8414', 'calibration-missing'],
  ['calibration.minConfidence.voice-fit', null, 'calibration-missing'],
  ['calibration.heldout.openedAt', 5, 'calibration-missing'],
  ['limits', null, 'predeclared-surface-limits'],
  ['limits.maxIntroducedDrift', 1, 'predeclared-surface-limits'],
  ['limits.maxPreservationFailures', 2, 'predeclared-surface-limits'],
  ['runs.0.funding', null, 'funding-evidence-missing'],
  ['runs.0.funding.expiresAt', 30, 'funding-evidence-missing'],
  ['runs.0.funding.maxCostUsd', 0, 'funding-budget-exceeded'],
  ['runs.0.execution', 'fixture', 'executed-model-evidence-missing'],
  ['runs.0.archiveRef', null, 'executed-model-evidence-missing'],
  [
    'runs.0.revised.calls.0.modelId',
    'other',
    'call-execution-evidence-invalid',
  ],
  [
    'runs.0.revised.calls.0.provider',
    'other',
    'call-execution-evidence-invalid',
  ],
  [
    'runs.0.baseline.calls.0.responseId',
    null,
    'call-execution-evidence-invalid',
  ],
  ['runs.0.baseline.calls.0.costUsd', null, 'attributable-cost-unknown'],
  [
    'runs.0.baseline.calls.0.inputTokens',
    -1,
    'call-execution-evidence-invalid',
  ],
  ['runs.0.baseline.calls.0.role', 'judge', 'repeated-or-unknown-model-call'],
  ['runs.0.revisionCount', 2, 'invalid-revision-or-failure-count'],
  ['runs.0.revised.calls', [], 'accepted-without-recheck'],
  ['runs.0.revisionCount', 0, 'unrecorded-revision'],
  ['target.surfaceId', 'unknown', 'target-or-corpus'],
  ['target.rubricSha256', 'b'.repeat(64), 'target-or-corpus'],
  ['promptContext', null, 'writer-context-provenance'],
  ['promptContext.documentIds', ['doc0'], 'writer-context-provenance'],
  ['runs', null, 'recorded-runs-missing'],
  ['runs.0.revised.text', null, 'invalid-revised-artifact'],
  [
    'runs.0.baseline.text',
    'Other corpus item',
    'baseline-corpus-artifact-mismatch',
  ],
  ['labels.rows.1.revised.voice', 0, 'unchanged-candidate-label-disagreement'],
  ['runs.0.revised.state', 'fallback', 'unapproved-fallback'],
  ['runs.0.baseline.calls.0', null, 'call-execution-evidence-invalid'],
  ['labels.rows', {}, 'human-labels-missing'],
  ['runs.1', null, 'missing-duplicate-or-unmatched-heldout-runs'],
];

for (const [path, value, reason] of invalidEvidenceCases)
  test(`inconclusive for invalid ${path} = ${JSON.stringify(value)}`, () => {
    const input = fixture();
    const keys = path.split('.');
    const key = keys.pop();
    const parent = keys.reduce((obj, part) => obj[part], input);
    parent[key] = value;
    const report = buildRevisionQualityReport(input);
    assert.equal(report.status, 'inconclusive');
    assert.equal(report.qualityGain, null);
    assert.ok(
      report.reasons.some(r => r.startsWith(reason)),
      report.reasons.join(', ')
    );
  });

for (const field of ['prompts', 'demonstrations', 'revisionInstructions'])
  test(`rejects held-out reference text in ${field}`, () => {
    const input = fixture();
    input.promptContext[field].push(
      `Reference: ${input.corpus.examples[1].text.toUpperCase()}`
    );
    rebind(input);
    assert.ok(
      buildRevisionQualityReport(input).reasons.includes(
        'heldout-text-in-writer-context'
      )
    );
  });

test('rejects source-document and normalized text overlap even with rebound digests', () => {
  for (const field of ['documentId', 'text']) {
    const input = fixture();
    input.corpus.examples[0][field] = input.corpus.examples[1][field];
    rebind(input);
    assert.ok(
      buildRevisionQualityReport(input).reasons.includes(
        'tuning-holdout-contamination'
      )
    );
  }
});

test('reports missing holdout scenarios and rejects duplicate or unbounded corpora', () => {
  for (const scenario of REVISION_SCENARIOS) {
    const input = fixture();
    input.corpus.examples.find(e => e.scenarios.includes(scenario)).scenarios =
      [];
    assert.ok(
      buildRevisionQualityReport(input).reasons.includes(
        `missing-scenario:${scenario}`
      )
    );
  }
  for (const input of [undefined, null, {}, { schema: 'wrong' }])
    assert.equal(buildRevisionQualityReport(input).status, 'inconclusive');
  for (const mutate of [
    i => {
      i.corpus.examples[0].id = i.corpus.examples[1].id;
    },
    i => {
      i.corpus.examples[0] = null;
    },
    i => {
      i.corpus.examples = Array(MAX_REVISION_EXAMPLES + 1).fill(
        i.corpus.examples[0]
      );
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(buildRevisionQualityReport(input).status, 'inconclusive');
  }
});

test('style gains cannot compensate for false acceptance, drift, preservation loss or wrong fallback', () => {
  for (const mutate of [
    i => {
      i.runs[3].revised.state = 'accepted';
    },
    i => {
      i.labels.rows[0].revised.introducedDrift = true;
    },
    i => {
      i.labels.rows[0].revised.preservationFailure = true;
    },
    i => {
      i.runs[0].revised.state = 'fallback';
      i.runs[0].revised.approvedTemplateRef = 'fixture:approved-template';
    },
  ]) {
    const input = fixture();
    input.limits.minPairs = 6;
    mutate(input);
    rebind(input);
    const report = buildRevisionQualityReport(input);
    assert.deepEqual(report.reasons, []);
    assert.equal(report.comparisonPassed, true);
    assert.equal(report.criticalFixturesPassed, false);
    assert.equal(report.status, 'retain');
    assert.equal(report.qualityGain, false);
  }
});

test('retains weak quality or expensive/slow pipelines and requires protected denominators', () => {
  for (const mutate of [
    i => {
      i.labels.rows.forEach(r => {
        if (r.revised) {
          r.revised.usefulness = r.baseline.usefulness;
        }
      });
    },
    i => {
      i.runs[0].revised.latencyMs = 2000;
    },
    i => {
      i.limits.maxCostPerExampleUsd = 0;
    },
  ]) {
    const input = fixture();
    mutate(input);
    rebind(input);
    assert.equal(buildRevisionQualityReport(input).status, 'retain');
  }
  const input = fixture();
  input.limits.minPairs = 8;
  rebind(input);
  assert.equal(buildRevisionQualityReport(input).status, 'inconclusive');
  delete input.runs[0].baseline.calls[0].costUsd;
  const costs =
    buildRevisionQualityReport(input).metrics.revised.attributableCostUsd;
  assert.equal(costs.total, null);
  assert.equal(costs.n, 8);
});

test('counts an approved fallback without treating template prose as a revision gain', () => {
  const input = fixture();
  input.runs[1].revised.state = 'fallback';
  input.runs[1].revised.approvedTemplateRef = 'fixture:existing-template';
  input.corpus.examples[2].expectedState = 'fallback';
  input.limits.minPairs = 6;
  rebind(input);
  const report = buildRevisionQualityReport(input);
  assert.deepEqual(report.reasons, []);
  assert.equal(report.status, 'eligible-for-bounded-canary');
  assert.equal(report.metrics.revised.fallback.numerator, 1);
  assert.equal(report.metrics.pairedDelta.usefulness.n, 6);
});

test('renders and replays identical machine/human reports; invalid input exits explicitly inconclusive', () => {
  const dir = mkdtempSync(join(tmpdir(), 'revision-report-'));
  try {
    const input = join(dir, 'input.json');
    const json = join(dir, 'report.json');
    const md = join(dir, 'report.md');
    writeFileSync(input, JSON.stringify(fixture()));
    const report = main(['--input', input, '--json', json, '--markdown', md]);
    assert.deepEqual(JSON.parse(readFileSync(json, 'utf8')), report);
    assert.equal(readFileSync(md, 'utf8'), renderRevisionReport(report));
    const run = spawnSync(
      process.execPath,
      ['scripts/invariants/jev-revision-report-cli.mjs', '--input', input],
      {
        encoding: 'utf8',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => key !== 'NODE_TEST_CONTEXT'
          )
        ),
      }
    );
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), report);
    writeFileSync(input, '{bad json');
    const invalid = spawnSync(
      process.execPath,
      ['scripts/invariants/jev-revision-report-cli.mjs', '--input', input],
      {
        encoding: 'utf8',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => key !== 'NODE_TEST_CONTEXT'
          )
        ),
      }
    );
    assert.ifError(invalid.error);
    assert.equal(invalid.status, 2);
    const inconclusive = JSON.parse(invalid.stdout);
    assert.equal(inconclusive.qualityGain, null);
    assert.match(renderRevisionReport(inconclusive), /Inconclusive evidence:/u);
    const absent = main(['--json', json]);
    assert.equal(absent.status, 'inconclusive');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
