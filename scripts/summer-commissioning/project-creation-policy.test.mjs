import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProjectCreation } from './project-creation-policy.mjs';
import { digestCanonicalJson } from './receipt-trust.mjs';

function fixture() {
  const proposal = {
    schema: 'jovie.project-creation-proposal/v1',
    revision: 1,
    workId: 'JOV-6483',
    teamId: 'team-fixture',
    projectName: 'fixture-project',
    repository: 'Example/fixture',
    requesterId: 'agent-author',
    executorId: 'agent-executor',
    ownerId: 'owner-fixture',
    contributors: ['agent-author'],
    environment: 'production',
    purpose: 'Synthetic isolation requirement',
    existingProjectInsufficient:
      'Existing synthetic project has a different data boundary',
    previewInsufficient:
      'Synthetic standing service needs a durable isolated boundary',
    dependencies: ['service.fixture'],
    deploymentBoundary:
      'Synthetic repository root, domain, region and data boundary',
    ownerAcceptanceRef: 'record://fixture/owner-acceptance',
    controlsRef: 'record://fixture/platform-spending-data',
  };
  const receipt = {
    schema: 'jovie.project-creation-review/v1',
    proposalDigest: digestCanonicalJson(proposal),
    reviewerId: 'agent-independent',
    verdict: 'approved',
    mode: 'adversarial',
    rationale: 'Synthetic independent review of reuse, boundaries and controls',
    reviewedAt: '2026-09-20T00:00:00Z',
    expiresAt: '2026-09-20T00:10:00Z',
  };
  const review = {
    principalType: 'agent',
    immutable: true,
    producerAttestation: 'verified',
    principalId: receipt.reviewerId,
    digest: digestCanonicalJson(receipt),
    receipt,
  };
  const controls = {
    requesterId: proposal.requesterId,
    executorId: proposal.executorId,
    ownerId: proposal.ownerId,
    contributors: [...proposal.contributors],
    proposalDigest: receipt.proposalDigest,
    ownerAcceptanceRef: proposal.ownerAcceptanceRef,
    controlsRef: proposal.controlsRef,
    ownerAccepted: true,
    platformAllowed: true,
    spendingAllowed: true,
    dataAllowed: true,
    permissionAllowed: true,
    current: true,
  };
  return {
    proposal,
    review,
    controls,
    reviewRef: 'record://fixture/independent-review',
    nowMs: Date.parse('2026-09-20T00:05:00Z'),
  };
}
function evaluate(f) {
  return evaluateProjectCreation(f.proposal, f.reviewRef, {
    nowMs: f.nowMs,
    resolveTrustedReview: ref => (ref === f.reviewRef ? f.review : null),
    evaluateExistingAuthority: () => f.controls,
  });
}
function reseal(f) {
  f.review.digest = digestCanonicalJson(f.review.receipt);
}
test('independent affirmative review satisfies policy without another founder gate or any execution', () => {
  const f = fixture();
  assert.deepEqual(evaluate(f), {
    decision: 'approved-within-existing-authority',
    proposalDigest: digestCanonicalJson(f.proposal),
    reviewRef: f.reviewRef,
    additionalFounderApprovalRequired: false,
    executed: false,
  });
});
test('review and authority are resolved independently of proposal-controlled fields', () => {
  const f = fixture();
  assert.throws(
    () => evaluateProjectCreation(f.proposal, f.reviewRef, { nowMs: f.nowMs }),
    /trusted resolvers/
  );
  assert.throws(
    () =>
      evaluateProjectCreation(f.proposal, f.reviewRef, {
        nowMs: f.nowMs,
        resolveTrustedReview: () => null,
        evaluateExistingAuthority: () => f.controls,
      }),
    /trusted review/
  );
  assert.throws(
    () =>
      evaluateProjectCreation(f.proposal, f.reviewRef, {
        nowMs: f.nowMs,
        resolveTrustedReview: () => f.review,
        evaluateExistingAuthority: () => null,
      }),
    /existing authority/
  );
});
for (const field of ['requesterId', 'executorId', 'ownerId']) {
  test(`rejects review by ${field}`, () => {
    const f = fixture();
    f.review.principalId = f.proposal[field];
    f.review.receipt.reviewerId = f.proposal[field];
    reseal(f);
    assert.throws(() => evaluate(f), /independent/);
  });
}
test('rejects a contributor review, including canonical identity aliases resolved upstream', () => {
  const f = fixture();
  f.proposal.contributors.push(f.review.principalId);
  f.review.receipt.proposalDigest = digestCanonicalJson(f.proposal);
  reseal(f);
  assert.throws(() => evaluate(f), /independent/);
});
for (const field of Object.keys(fixture().proposal)) {
  test(`material proposal change invalidates review: ${field}`, () => {
    const f = fixture();
    const replacements = {
      revision: 2,
      workId: 'JOV-9999',
      repository: 'Example/other',
      environment: 'staging',
      contributors: ['agent-other'],
      dependencies: ['service.other'],
    };
    f.proposal[field] = replacements[field] ?? 'changed';
    assert.throws(
      () => evaluate(f),
      field === 'schema' ? /schema/ : /proposal digest mismatch/
    );
  });
}
/** @type {Array<[string, (f: ReturnType<typeof fixture>) => void, RegExp]>} */
const rejected = [
  [
    'non-agent reviewer',
    f => {
      f.review.principalType = 'human';
    },
    /trusted review/,
  ],
  [
    'unverified producer',
    f => {
      f.review.producerAttestation = 'unknown';
    },
    /trusted review/,
  ],
  [
    'mutable review',
    f => {
      f.review.immutable = false;
    },
    /trusted review/,
  ],
  [
    'tampered review',
    f => {
      f.review.receipt.rationale = 'tampered';
    },
    /trusted review/,
  ],
  [
    'spoofed reviewer',
    f => {
      f.review.receipt.reviewerId = 'spoofed';
      reseal(f);
    },
    /principal/,
  ],
  [
    'rejection',
    f => {
      f.review.receipt.verdict = 'rejected';
      reseal(f);
    },
    /affirmative/,
  ],
  [
    'non-adversarial review',
    f => {
      f.review.receipt.mode = 'summary';
      reseal(f);
    },
    /affirmative/,
  ],
  [
    'wrong review schema',
    f => {
      f.review.receipt.schema = 'other';
      reseal(f);
    },
    /schema/,
  ],
  [
    'missing rationale',
    f => {
      f.review.receipt.rationale = '';
      reseal(f);
    },
    /rationale/,
  ],
  [
    'expired',
    f => {
      f.nowMs = Date.parse(f.review.receipt.expiresAt);
    },
    /freshness/,
  ],
  [
    'future',
    f => {
      f.nowMs = Date.parse(f.review.receipt.reviewedAt) - 1;
    },
    /freshness/,
  ],
  [
    'extended expiry',
    f => {
      f.review.receipt.expiresAt = '2026-09-21T00:00:00Z';
      reseal(f);
    },
    /freshness/,
  ],
  [
    'invalid date',
    f => {
      f.review.receipt.reviewedAt = '2026-02-30T00:00:00Z';
      reseal(f);
    },
    /timestamp/,
  ],
  [
    'expiry before review',
    f => {
      f.review.receipt.expiresAt = '2026-09-19T23:59:00Z';
      reseal(f);
    },
    /freshness/,
  ],
  [
    'bad clock',
    f => {
      f.nowMs = NaN;
    },
    /clock/,
  ],
  [
    'missing review ref',
    f => {
      f.reviewRef = '';
    },
    /review reference/,
  ],
  [
    'authority drift',
    f => {
      f.controls.proposalDigest = 'old';
    },
    /existing authority/,
  ],
  [
    'owner receipt drift',
    f => {
      f.controls.ownerAcceptanceRef = 'other';
    },
    /existing authority/,
  ],
  [
    'control receipt drift',
    f => {
      f.controls.controlsRef = 'other';
    },
    /existing authority/,
  ],
  [
    'proposer identity drift',
    f => {
      f.controls.requesterId = 'other';
    },
    /existing authority/,
  ],
  [
    'incomplete authorship',
    f => {
      f.controls.contributors.push('other-author');
    },
    /existing authority/,
  ],
];
for (const [name, mutate, error] of rejected)
  test(`rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => evaluate(f), error);
  });
for (const field of [
  'ownerAccepted',
  'platformAllowed',
  'spendingAllowed',
  'dataAllowed',
  'permissionAllowed',
  'current',
]) {
  test(`affirmative review cannot override ${field}`, () => {
    const f = fixture();
    f.controls[field] = false;
    assert.throws(() => evaluate(f), /existing authority/);
  });
}
test('rejects malformed proposal shapes and duplicate identities', () => {
  const f = fixture();
  assert.throws(
    () => evaluateProjectCreation(null, f.reviewRef, {}),
    /proposal/
  );
  f.proposal.dependencies.push('service.fixture');
  assert.throws(() => evaluate(f), /duplicate/);
  f.proposal.dependencies = [];
  f.proposal.purpose = '';
  assert.throws(() => evaluate(f), /purpose/);
});
test('rejects unknown proposal fields and missing review fields', () => {
  const f = fixture();
  assert.throws(
    () =>
      evaluateProjectCreation({ ...f.proposal, bypass: true }, f.reviewRef, {}),
    /unexpected fields/
  );
  Reflect.deleteProperty(f.review.receipt, 'rationale');
  reseal(f);
  assert.throws(() => evaluate(f), /missing or unexpected fields/);
});
test('rejects proposal mutation while independent producer lookup is running', () => {
  const f = fixture();
  assert.throws(
    () =>
      evaluateProjectCreation(f.proposal, f.reviewRef, {
        nowMs: f.nowMs,
        resolveTrustedReview: () => {
          f.proposal.purpose = 'changed during lookup';
          return f.review;
        },
        evaluateExistingAuthority: () => f.controls,
      }),
    /changed during/
  );
});
