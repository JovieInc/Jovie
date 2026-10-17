import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LEARNING_METADATA_SCHEMA,
  LearningMetadataSchema,
  parseLearningEvidenceReceipt,
  reconcileLearningEvidence,
} from '../../../packages/agent-transport-contracts/learning-evidence.ts';
import { bindProviderAttempt } from '../../../packages/agent-transport-contracts/provider-attempt-receipt.ts';

const SHA = 'a'.repeat(40);
const NEXT_SHA = 'b'.repeat(40);
const DIGEST = 'c'.repeat(64);
const REF = 'record://fixtures/evidence/one';
const AT = '2026-10-15T10:00:00.000Z';
const binding = { tenantId: 'tenant-one', productId: 'jovie', cohortId: null };
const context = { binding, work: { id: 'order-one', revision: SHA } };
const known = () => ({ status: 'known', value: 0, sourceRef: REF });
const telemetry = () =>
  Object.fromEntries(
    [
      'wallTimeMs',
      'activeComputeMs',
      'inferenceCostUsd',
      'toolCostUsd',
      'credits',
      'subsidiesUsd',
      'opportunityDelayMs',
    ].map(key => [key, known()])
  );
const workResult = () =>
  JSON.parse(
    '{"schema":"jovie.work-result/v1","orderId":"order-one","orderRevision":1,"orderDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","actor":{"class":"code-lane","runtime":"fixture","provider":null,"model":null,"ref":null},"phase":"terminal","disposition":"accepted","terminalState":"succeeded","actionsTaken":[],"artifacts":[],"outcome":{"predicateId":"predicate-one","status":"met","evidenceRefs":["record://fixtures/evidence/one"]},"certification":{"status":"certified","invalidatedBy":[]},"failures":[],"unknowns":[],"cost":{"attempts":1,"wallSeconds":0,"spendUsd":0,"founderMinutes":0},"next":null,"transportRef":"record://fixtures/evidence/one","dispatchedAt":"2026-10-15T10:00:00.000Z","observedAt":"2026-10-15T10:00:00.000Z","source":{"adapter":"lane","receiptRef":"record://fixtures/evidence/one"}}'
  );
const prediction = () =>
  JSON.parse(
    '{"schema":"jovie.prediction-outcome/prediction/v1","predictionId":"prediction-one","identity":{"decisionId":"decision-one","taskRunId":null,"experimentId":null,"variantId":null,"tenantId":"tenant-one","scopeId":"scope-one","entityId":"entity-one"},"links":{"issueRef":null,"commitRef":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","deploymentRef":null,"certificationRef":null},"decisionAt":"2026-10-15T10:00:00.000Z","predictedAt":"2026-10-15T10:00:00.000Z","temporalClass":"prospective","input":{"snapshotRef":"record://fixtures/evidence/one","snapshotDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","capturedAt":"2026-10-15T10:00:00.000Z","freshness":"fresh","provenanceRefs":["record://fixtures/evidence/one"]},"target":{"stage":"customer","name":"completion","units":"binary","horizonEndsAt":"2026-10-15T10:00:00.000Z","baseline":null},"action":{"eligibleActionsRef":"record://fixtures/evidence/one","selectedAction":"incumbent","selectionMethod":"deterministic","selectionProbability":null},"prediction":{"expected":1,"lower":0,"upper":1,"confidence":"low"},"versions":{"model":null,"provider":null,"prompt":null,"policy":null,"codeRevision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","executionTupleRef":null},"disclosure":{"providerData":"withheld","consent":"not-required","consentRef":null,"consentValidUntil":null},"management":{"productBetContractRef":null}}'
  );
const outcome = () =>
  JSON.parse(
    '{"schema":"jovie.prediction-outcome/outcome/v1","outcomeId":"outcome-one","predictionId":"prediction-one","revision":1,"supersedesRevision":null,"identity":{"tenantId":"tenant-one","scopeId":"scope-one","entityId":"entity-one"},"exposureRef":null,"attemptRefs":["record://fixtures/evidence/one"],"retries":0,"reworkCount":0,"observedAt":"2026-10-15T10:00:00.000Z","recordedAt":"2026-10-15T10:00:00.000Z","maturity":"mature","stages":{"engineering":{"status":"succeeded","value":1,"observedAt":"2026-10-15T10:00:00.000Z"},"customer":{"status":"succeeded","value":1,"observedAt":"2026-10-15T10:00:00.000Z"},"business":{"status":"succeeded","value":1,"observedAt":"2026-10-15T10:00:00.000Z"}},"fullyLoadedCost":{"usd":0,"attributionRef":"record://fixtures/evidence/one"},"guardrailRefs":[],"runtimeVerificationRef":"record://fixtures/evidence/one","humanCorrectionRefs":[],"certification":null,"disposition":{"kind":"hold","ref":"record://fixtures/evidence/one"}}'
  );
const provider = () =>
  bindProviderAttempt({
    sourceOwner: 'eve-owner',
    binding: {
      parentWrunId: 'wrun_1234567890',
      attemptWrunId: 'wrun_0987654321',
      parentDeploymentId: 'dpl_1234567890',
      attemptDeploymentId: 'dpl_0987654321',
      turnIndex: 0,
      stepIndex: 0,
    },
    providerRequest: {
      requestId: 'request-one',
      requestDigest: DIGEST,
      provider: 'provider-one',
      model: 'model-one',
      route: 'route-one',
      evidenceRef: REF,
    },
    firstFailure: {
      observedAt: AT,
      errorClass: 'transient_provider',
      errorId: null,
      errorCode: null,
      errorDigest: DIGEST,
      httpStatus: 503,
      evidenceRef: REF,
    },
  });
function metadata() {
  const source = {
    eventId: 'event-one',
    kind: 'work-result',
    receiptId: 'order-one',
    receiptRevision: 1,
  };
  return {
    schema: LEARNING_METADATA_SCHEMA,
    revision: 1,
    supersedesRevision: null,
    source,
    work: { ...context.work },
    binding,
    producer: {
      status: 'authorized',
      owner: 'fixture-owner',
      authorizationRef: REF,
    },
    intent: { id: 'intent-one', version: 'v1' },
    plan: { id: 'plan-one', version: 'v1' },
    inputs: [{ ref: REF, digest: DIGEST, binding, freshness: 'fresh' }],
    attempts: [
      {
        ordinal: 1,
        kind: 'tool',
        evidenceRef: REF,
        resourceIds: ['tool-one'],
        status: 'succeeded',
        failureCategory: null,
      },
    ],
    resources: [
      {
        status: 'resolved',
        id: 'tool-one',
        kind: 'tool',
        resolvedRef: REF,
        version: 'v1',
      },
    ],
    verification: [
      {
        stage: 'outcome',
        workRevision: SHA,
        status: 'passed',
        evidenceRef: REF,
      },
    ],
    classification: { failureCategory: null, methodFingerprint: DIGEST },
    redaction: {
      policyRef: REF,
      policyVersion: 'v1',
      mode: 'references-and-digests-only',
    },
    sourceRefs: [REF],
    telemetry: telemetry(),
    triage: 'healthy',
    decision: {
      lessonId: 'lesson-one',
      state: 'candidate',
      supportingRevisions: [
        { source, work: { ...context.work }, binding, ref: REF },
      ],
      applicability: {
        workClass: 'contract-change',
        predicateRef: REF,
        binding,
      },
      owner: 'compiler-owner',
      expectedSaving: { wallTimeMs: known(), netCostUsd: known() },
      rollback: null,
      revalidation: { trigger: 'source-correction', ref: REF },
      review: null,
      compiled: null,
      supersededBy: null,
      consumption: null,
    },
  };
}
const envelope = (learning = metadata()) => ({ ...workResult(), learning });
const parse = value => parseLearningEvidenceReceipt(value, context);
const reconcile = (incoming, existing = []) =>
  reconcileLearningEvidence({ existing, incoming, ownerContext: context });
function corrected(current, state) {
  const learning = structuredClone(current.learning);
  learning.supersedesRevision = learning.revision;
  learning.revision++;
  learning.decision.state = state;
  return { ...current, learning };
}
function history() {
  const candidate = envelope();
  const reviewed = corrected(candidate, 'reviewed');
  reviewed.learning.decision.review = {
    reviewer: 'independent-reviewer',
    workRevision: SHA,
    evidenceRef: REF,
  };
  const compiled = corrected(reviewed, 'compiled');
  compiled.learning.decision.compiled = {
    artifactRef: REF,
    beforeRevision: SHA,
    afterRevision: NEXT_SHA,
  };
  compiled.learning.decision.rollback = {
    artifactRef: REF,
    restoreRevision: SHA,
  };
  const consumed = corrected(compiled, 'consumed');
  consumed.learning.decision.consumption = {
    consumerRef: REF,
    work: { id: 'next-job', revision: NEXT_SHA },
    binding,
  };
  return [candidate, reviewed, compiled, consumed];
}

// These are canonical readers, not runtime/producer commissioning proof.
describe('revision-bound learning attachments', () => {
  it('typechecks its public reader and metadata exports with NodeNext', () => {
    const root = new URL('../../../', import.meta.url);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)),
        '--ignoreConfig',
        '--noEmit',
        '--skipLibCheck',
        '--strict',
        'false',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--allowImportingTsExtensions',
        '--target',
        'es2022',
        '--types',
        'node',
        '--typeRoots',
        fileURLToPath(new URL('apps/web/node_modules/@types', root)),
        '--allowJs',
        '--checkJs',
        fileURLToPath(import.meta.url),
      ],
      { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 25_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });

  it('reads all legacy receipt formats unchanged and checks their original validators', () => {
    for (const receipt of [workResult(), prediction(), outcome(), provider()]) {
      expect(parseLearningEvidenceReceipt(receipt)).toEqual({
        receipt,
        learning: null,
      });
    }
    expect(() =>
      parseLearningEvidenceReceipt({ ...workResult(), terminalState: null })
    ).toThrow();
    expect(() => parseLearningEvidenceReceipt({ schema: 'invented' })).toThrow(
      /unsupported/
    );
  });

  it('validates an attachment without changing the canonical work result', () => {
    expect(parse(envelope())).toEqual({
      receipt: workResult(),
      learning: metadata(),
    });
    expect(() => parseLearningEvidenceReceipt(envelope())).toThrow(
      /trusted owner/
    );
    expect(() => parse(envelope(null))).toThrow();
    expect(() => parse({ ...envelope(), unrelated: true })).toThrow();
  });

  it('attaches to provider evidence without resealing its digest or erasing its failure', () => {
    const receipt = provider();
    const learning = metadata();
    learning.source = {
      ...learning.source,
      kind: 'provider-attempt',
      receiptId: receipt.receiptId,
    };
    learning.work.id = receipt.binding.parentWrunId;
    learning.triage = 'anomalous';
    const expected = { ...context, work: learning.work };
    expect(
      parseLearningEvidenceReceipt({ ...receipt, learning }, expected).receipt
    ).toEqual(receipt);
    expect(() =>
      parseLearningEvidenceReceipt(
        { ...receipt, contentDigest: 'd'.repeat(64), learning },
        expected
      )
    ).toThrow(/digest/);
    learning.triage = 'healthy';
    expect(() =>
      parseLearningEvidenceReceipt({ ...receipt, learning }, expected)
    ).toThrow(/canonical evidence/);
  });

  it.each(['prediction', 'outcome'])(
    'binds the %s attachment to native identities',
    kind => {
      const receipt = kind === 'prediction' ? prediction() : outcome();
      const learning = metadata();
      learning.source = { ...learning.source, kind, receiptId: `${kind}-one` };
      learning.work.id = 'prediction-one';
      learning.triage = 'unassessed';
      const expected = { ...context, work: learning.work };
      expect(
        parseLearningEvidenceReceipt({ ...receipt, learning }, expected)
          .learning
      ).toEqual(learning);
      receipt.identity.tenantId = 'another-tenant';
      expect(() =>
        parseLearningEvidenceReceipt({ ...receipt, learning }, expected)
      ).toThrow(/cross-bound/);
    }
  );

  it('does not confuse prediction, inconclusive outcomes or failed work with healthy evidence', () => {
    for (const kind of ['prediction', 'outcome', 'work-result']) {
      const receipt =
        kind === 'prediction'
          ? prediction()
          : kind === 'outcome'
            ? outcome()
            : workResult();
      const learning = metadata();
      if (kind !== 'work-result') {
        learning.source = {
          ...learning.source,
          kind,
          receiptId: `${kind}-one`,
        };
        learning.work.id = 'prediction-one';
      }
      if (kind === 'outcome') receipt.stages.business.status = 'inconclusive';
      if (kind === 'work-result') {
        receipt.terminalState = 'failed_known';
        receipt.outcome.status = 'not_met';
        receipt.certification.status = 'uncertified';
      }
      expect(() =>
        parseLearningEvidenceReceipt(
          { ...receipt, learning },
          { ...context, work: learning.work }
        )
      ).toThrow(/canonical evidence/);
    }
  });

  it('binds prediction experiments and the exact native code revision', () => {
    const receipt = prediction();
    const learning = metadata();
    learning.source = {
      ...learning.source,
      kind: 'prediction',
      receiptId: receipt.predictionId,
    };
    learning.work.id = receipt.predictionId;
    learning.triage = 'unassessed';
    const expected = { ...context, work: learning.work };
    receipt.identity.experimentId = 'experiment-other';
    expect(() =>
      parseLearningEvidenceReceipt({ ...receipt, learning }, expected)
    ).toThrow(/cross-bound/);
    receipt.identity.experimentId = null;
    receipt.versions.codeRevision = NEXT_SHA;
    receipt.links.commitRef = NEXT_SHA;
    expect(() =>
      parseLearningEvidenceReceipt({ ...receipt, learning }, expected)
    ).toThrow(/cross-bound/);
  });

  it.each(['kind', 'receiptId', 'receiptRevision'])(
    'rejects mismatched source %s',
    key => {
      const value = envelope();
      value.learning.source[key] = key === 'receiptRevision' ? 2 : 'outcome';
      expect(() => parse(value)).toThrow(/source does not match/);
    }
  );

  it.each(['tenantId', 'productId', 'cohortId'])(
    'rejects incompatible %s at every transfer boundary',
    key => {
      for (const location of [
        'owner',
        'input',
        'support',
        'predicate',
        'consumer',
      ]) {
        const value = location === 'consumer' ? history()[3] : envelope();
        const changedBinding = { ...binding, [key]: 'other' };
        if (location === 'owner') {
          expect(() =>
            parseLearningEvidenceReceipt(value, {
              ...context,
              binding: changedBinding,
            })
          ).toThrow(/cross-bound/);
          continue;
        }
        if (location === 'input')
          value.learning.inputs[0].binding = changedBinding;
        if (location === 'support')
          value.learning.decision.supportingRevisions[0].binding =
            changedBinding;
        if (location === 'predicate')
          value.learning.decision.applicability.binding = changedBinding;
        if (location === 'consumer')
          value.learning.decision.consumption.binding = changedBinding;
        expect(() => parse(value)).toThrow(/binding is incompatible/);
      }
    }
  );

  it('rejects mismatched work identity or revision', () => {
    for (const work of [
      { ...context.work, id: 'other' },
      { ...context.work, revision: NEXT_SHA },
    ])
      expect(() =>
        parseLearningEvidenceReceipt(envelope(), { ...context, work })
      ).toThrow(/cross-bound/);
  });

  it.each(Object.keys(telemetry()))(
    'requires explicit known/unknown/unavailable %s',
    key => {
      for (const status of ['unknown', 'unavailable']) {
        const value = envelope();
        value.learning.telemetry[key] = { status, reasonCode: 'not-reported' };
        expect(() => parse(value)).toThrow(/complete telemetry/);
        value.learning.triage = 'anomalous';
        expect(parse(value).learning.telemetry[key].status).toBe(status);
      }
      const missing = envelope();
      delete missing.learning.telemetry[key];
      expect(() => parse(missing)).toThrow();
      missing.learning.telemetry[key] = { status: 'known', value: 0 };
      expect(() => parse(missing)).toThrow();
      for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        missing.learning.telemetry[key] = { ...known(), value };
        expect(() => parse(missing)).toThrow();
      }
    }
  );

  it.each([
    'file:///etc/passwd',
    'http://example.com/a',
    'javascript:alert(1)',
    ['https://', 'user:password', '@example.com/a'].join(''),
    'https://example.com/a?token=private',
    'https://example.com/a#private',
    'https://example.com/%2e%2e/secret',
    'https://example.com/../secret',
    'artifact://fixture/./secret',
    'https://localhost/secret',
    'https://127.0.0.1/secret',
    'https://host.internal/secret',
    'record:///empty-host',
    'record://fixture/$(id)',
  ])('rejects unsafe source locator %s', ref => {
    const value = envelope();
    value.learning.sourceRefs = [ref];
    expect(() => parse(value)).toThrow(/unsafe learning source/);
  });

  it.each([
    'https://github.com/JovieInc/Jovie/pull/1',
    'artifact://fixture/proof',
    REF,
  ])('accepts bounded safe locator %s', ref => {
    const value = envelope();
    value.learning.sourceRefs = [ref];
    expect(parse(value).learning.sourceRefs).toEqual([ref]);
  });

  it('rejects secret-shaped material even inside otherwise safe identifiers and locators', () => {
    for (const prefix of ['sk', 'ghp', 'github_pat', 'lin_api']) {
      const value = envelope();
      value.learning.sourceRefs = [
        `record://fixtures/${prefix}_${'x'.repeat(16)}`,
      ];
      expect(() => parse(value)).toThrow(/secret material/);
    }
    const nativeSecret = envelope();
    nativeSecret.actionsTaken = [`credential sk_${'x'.repeat(16)}`];
    expect(() => parse(nativeSecret)).toThrow(/secret material/);
    const value = envelope();
    value.learning.rawPrompt = 'private prompt';
    expect(() => parse(value)).toThrow();
  });

  it('requires ordered attempts with resolved resource identities and categorized failures', () => {
    for (const mutate of [
      row => {
        row.attempts[0].ordinal = 2;
      },
      row => {
        row.attempts[0].resourceIds = ['missing'];
      },
      row => {
        row.attempts[0].status = 'failed';
      },
      row => {
        row.resources.push(row.resources[0]);
      },
    ]) {
      const row = metadata();
      mutate(row);
      expect(() => LearningMetadataSchema.parse(row)).toThrow();
    }
  });

  it('keeps unresolved and incomplete evidence available without calling it healthy', () => {
    for (const mutate of [
      row => {
        row.resources[0] = {
          status: 'unknown',
          id: 'tool-one',
          kind: 'tool',
          reasonCode: 'not-reported',
        };
      },
      row => {
        row.producer = { status: 'uncommissioned', owner: 'missing-owner' };
      },
      row => {
        row.inputs[0].freshness = 'unknown';
      },
      row => {
        row.verification[0].status = 'unknown';
      },
      row => {
        row.verification[0].stage = 'ci';
      },
      row => {
        row.classification.failureCategory = 'known-failure';
      },
    ]) {
      const row = metadata();
      mutate(row);
      expect(() => LearningMetadataSchema.parse(row)).toThrow(/healthy/);
      row.triage = 'anomalous';
      expect(LearningMetadataSchema.parse(row).triage).toBe('anomalous');
    }
  });

  it('validates distinct revision-bound verification stages and a failure or method signature', () => {
    for (const mutate of [
      row => {
        row.verification.push(row.verification[0]);
      },
      row => {
        row.verification[0].workRevision = NEXT_SHA;
      },
      row => {
        row.verification[0].evidenceRef = null;
      },
      row => {
        row.classification.methodFingerprint = null;
      },
    ]) {
      const row = metadata();
      mutate(row);
      expect(() => LearningMetadataSchema.parse(row)).toThrow();
    }
  });
});

describe('learning history reconciliation', () => {
  it('rejects conflicting supporting revisions and changed native evidence across corrections', () => {
    const repeated = envelope();
    repeated.learning.decision.supportingRevisions.push({
      ...repeated.learning.decision.supportingRevisions[0],
      work: { ...context.work, revision: NEXT_SHA },
    });
    expect(() => parse(repeated)).toThrow(
      /duplicate supporting source revision/
    );
    const first = envelope();
    const next = corrected(first, 'candidate');
    next.actionsTaken = ['rewritten source'];
    expect(() => reconcile([first, next])).toThrow(
      /canonical source revision conflicts/
    );
  });
  it('deduplicates semantic redelivery and retains ordered candidate/review/compile/consume history', () => {
    const rows = history();
    const reversedKeys = Object.fromEntries(Object.entries(rows[0]).reverse());
    const result = reconcile([...rows, reversedKeys]);
    expect(result.revisions).toHaveLength(4);
    expect(result.latest[0].decision.state).toBe('consumed');
    expect(result.affectedSourceEventIds).toEqual(['event-one']);
    expect(reconcile(rows, rows).affectedSourceEventIds).toEqual([]);
    expect(reconcile([workResult()]).revisions).toEqual([]);
  });

  it('rejects conflicting duplicate revisions in metadata or the canonical source', () => {
    for (const mutate of [
      value => {
        value.learning.telemetry.wallTimeMs.value = 1;
      },
      value => {
        value.actionsTaken = ['changed'];
      },
    ]) {
      const value = envelope();
      mutate(value);
      expect(() => reconcile([value], [envelope()])).toThrow(
        /duplicate learning revision conflicts/
      );
    }
  });

  it('accepts no-change, quarantined and superseded decisions with their evidence', () => {
    for (const state of ['no-change', 'quarantined', 'superseded']) {
      const first = envelope();
      const next = corrected(first, state);
      if (state === 'superseded') next.learning.decision.supersededBy = REF;
      expect(reconcile([next, first]).latest[0].decision.state).toBe(state);
    }
  });

  it('rejects broken chains, missing predecessors, skipped reviews and revival of superseded learning', () => {
    const rows = history();
    const broken = corrected(rows[0], 'candidate');
    broken.learning.supersedesRevision = null;
    expect(() => reconcile([broken, rows[0]])).toThrow(/correction chain/);
    expect(() => reconcile([rows[1]])).toThrow(/predecessor/);
    const promoted = structuredClone(rows[1]);
    promoted.learning.revision = 1;
    promoted.learning.supersedesRevision = null;
    expect(() => reconcile([promoted])).toThrow(/candidate and review history/);
    const skipped = structuredClone(rows[2]);
    skipped.learning.revision = 2;
    skipped.learning.supersedesRevision = 1;
    expect(() => reconcile([rows[0], skipped])).toThrow(/state transition/);
    const ended = corrected(rows[0], 'superseded');
    ended.learning.decision.supersededBy = REF;
    const revived = corrected(ended, 'candidate');
    revived.learning.decision.supersededBy = null;
    expect(() => reconcile([rows[0], ended, revived])).toThrow(
      /state transition/
    );
  });

  it('rejects changing source, intent, plan, lesson or owner inside a correction stream', () => {
    for (const mutate of [
      row => {
        row.source.receiptId = 'different';
      },
      row => {
        row.intent.version = 'v2';
      },
      row => {
        row.plan.version = 'v2';
      },
      row => {
        row.decision.lessonId = 'other';
      },
      row => {
        row.decision.owner = 'other';
      },
    ]) {
      const first = envelope();
      const next = corrected(first, 'candidate');
      mutate(next.learning);
      expect(() => reconcile([first, next])).toThrow();
    }
  });

  it('requires independent review, real compilation, rollback, supersession and consumer proof', () => {
    for (const mutate of [
      row => {
        row.decision.review = null;
      },
      row => {
        row.decision.review.reviewer = row.decision.owner;
      },
      row => {
        row.decision.review.workRevision = NEXT_SHA;
      },
      row => {
        row.producer = { status: 'uncommissioned', owner: 'missing' };
      },
      row => {
        row.decision.compiled = null;
      },
      row => {
        row.decision.rollback = null;
      },
      row => {
        row.decision.compiled.afterRevision = SHA;
      },
      row => {
        row.decision.rollback.restoreRevision = NEXT_SHA;
      },
      row => {
        row.decision.consumption = null;
      },
      row => {
        row.decision.supersededBy = REF;
      },
    ]) {
      const rows = history();
      mutate(rows[3].learning);
      expect(() => reconcile(rows)).toThrow();
    }
  });
});
