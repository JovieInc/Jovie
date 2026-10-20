import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateInvariantRegistry } from '../../invariants/registry.mjs';
import {
  compileLesson,
  lessonApplies,
  readReplaySource,
} from '../lesson-compilation.mjs';
import {
  compilationDigest,
  hasCompilationProof,
} from '../lesson-compilation-proof.mjs';
import {
  evaluateLearningPromotion,
  learningReceiptMarker,
  validateLearningReceipt,
} from '../rolling-ci-learning.mjs';

const root = mkdtempSync(join(tmpdir(), 'jovie-lesson-replay-'));
const git = args =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const put = (path, value) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(
    join(root, path),
    typeof value === 'string' ? value : JSON.stringify(value)
  );
};
const invariant = {
  id: 'JOV-INV-999',
  title: 'fixture',
  statement: 'fixture invariant',
  scope: { products: ['Jovie'], surfaces: ['scripts'] },
  authority: { owner: 'Ops', approvedBy: 'Founder' },
  effective: { date: '2026-10-15', version: 1 },
  precedence: 1,
  policy: { key: 'fixture.only', value: true },
  lifecycle: { state: 'adopted' },
  enforcementConsumers: [{ name: 'fixture', path: 'scripts/guard.mjs' }],
  evidence: {
    tests: [{ name: 'valid control', path: 'scripts/guard.test.mjs' }],
    deliberateRed: [{ name: 'deliberate red', path: 'scripts/guard.test.mjs' }],
  },
};
const registry = {
  schema: 'jovie-invariant-registry/v1',
  invariants: [invariant],
};
const broken = structuredClone(registry);
broken.invariants.push(structuredClone(invariant));
put(
  'canon/invariants.jsonl',
  `${JSON.stringify({ schema: registry.schema })}\n${JSON.stringify(invariant)}\n`
);
put('scripts/guard.mjs', '// JOV-INV-999');
put('scripts/guard.test.mjs', '// valid control; deliberate red');
put('policy.json', broken);
put('fixtures/failure.json', { type: 'historical-defect' });
put('fixtures/control.json', registry);
put('fixtures/sibling.json', { type: 'historical-defect' });
put('README.md', 'prose is not executable');
symlinkSync('/etc/passwd', join(root, 'unsafe-link'));
git(['init', '-q']);
git(['config', 'user.name', 'Replay fixture']);
git(['config', 'user.email', 'replay@example.invalid']);
git(['add', '.']);
git(['commit', '-qm', 'fixture origin']);
const origin = git(['rev-parse', 'HEAD']);
put('policy.json', registry);
git(['add', '.']);
git(['commit', '-qm', 'fixture candidate']);
const head = git(['rev-parse', 'HEAD']);
afterAll(() => rmSync(root, { recursive: true, force: true }));

function setup() {
  const finding = {
    disposition: 'target',
    target: 'registry',
    workClass: 'policy-repair',
    rootCause: {
      status: 'supported',
      causeKey: 'duplicate-identity',
      statement: 'duplicate policy identity',
      evidenceRefs: ['record://failure'],
    },
    applicability: { tenantId: 'tenant', productId: 'Jovie', cohortId: null },
    expectedSavings: {
      statement: 'avoid repeated validation failures',
      evidenceRefs: ['record://failure'],
    },
  };
  const analysis = {
    schema: 'jovie.lesson-analysis/v1',
    disposition: 'target',
    finding,
    challenge: { verdict: 'agree', proposalDigest: compilationDigest(finding) },
    policies: {
      analysis: 'bounded-evidence-analysis/2026-10-15',
      independence: 'existing-policy/v1',
    },
    resolutions: [
      {
        role: 'author',
        receipt: {
          selectedRoute: {
            id: 'learner',
            tuple: { provider: 'a', model: 'a/model' },
          },
        },
      },
      {
        role: 'challenger',
        receipt: {
          selectedRoute: {
            id: 'challenger',
            tuple: { provider: 'b', model: 'b/model' },
          },
        },
      },
    ],
    owner: 'Ops',
    affectedScope: ['scripts/policy', 'scripts/sibling'],
    expectedSaving: {
      unit: 'failures',
      amount: 1,
      evidenceRef: 'record://failure',
    },
    lessonClass: 'local',
    attemptGraph: {
      work: { id: 'JOV-8421', revision: origin },
      evidence: [{ ref: 'record://failure', access: 'development' }],
    },
  };
  const request = {
    analysisRef: 'record://reviewed-analysis',
    candidateRevision: head,
    artifact: {
      id: 'existing-policy',
      version: compilationDigest(
        readFileSync(join(root, 'policy.json'), 'utf8')
      ),
    },
    applicability: {
      tenantId: 'tenant',
      cohortId: null,
      productId: 'Jovie',
      workClass: 'policy-repair',
      surfaces: ['scripts/policy'],
    },
    rollback: { revision: origin, reason: 'revert the policy candidate' },
    revalidation: {
      at: '2099-01-01T00:00:00Z',
      trigger: 'artifact or review policy revision changes',
    },
    expectedSaving: {
      unit: 'failures',
      amount: 1,
      evidenceRef: 'record://failure',
    },
    replayRef: 'record://replay',
    outcome: 'compiled',
    learningReceipt: {
      schema: 'jovie-rolling-ci-learning/v1',
      identity: {
        repository: 'JovieInc/Jovie',
        pr: 1,
        head,
        check: 'registry',
        fingerprint: 'duplicate-identity',
      },
      failureKind: 'product',
      rootCauseClass: 'duplicate-identity',
      currentHeadReproduction: {
        reproduced: true,
        head,
        evidence: 'record://replay',
      },
      minimalRepair: 'deduplicate existing policy',
      equivalentSurfaceSweep: {
        surfaces: ['scripts/policy'],
        outcome: 'bounded fixture replay',
      },
      deliberateRedRegression: {
        fixture: 'record://replay',
        failsBeforeRepair: true,
        passesAfterRepair: true,
      },
      guardrailDecision: {
        warranted: true,
        reason: 'existing registry catches the defect',
        delivery: 'same-pr',
      },
      exactHeadGreen: true,
    },
  };
  const row = (id, role, path, surface = 'scripts/policy') => ({
    id,
    role,
    path,
    surface,
    revision: origin,
    access: 'development',
    tenantId: 'tenant',
    cohortId: null,
    productId: 'Jovie',
    workClass: 'policy-repair',
  });
  const suite = {
    access: 'development',
    producerId: 'independent-evidence-owner',
    analysisRef: request.analysisRef,
    originRevision: origin,
    candidateRevision: head,
    artifactVersion: request.artifact.version,
    cases: [
      row('origin', 'origin', 'fixtures/failure.json'),
      row('valid', 'control', 'fixtures/control.json'),
      row('boundary', 'control', 'fixtures/control.json', 'scripts/unaffected'),
    ],
  };
  let executions = 0;
  const target = {
    id: 'existing-policy',
    path: 'policy.json',
    kind: 'routing-policy',
    owner: 'Ops',
    replayVersion: 'invariant-registry/v1',
    estimatedCostUsd: 0,
    applies: () => true,
    // Actual production registry validator, with real Git blobs. No mocked
    // proof booleans: duplicate identity makes the historical artifact fail.
    replay({ originSource, candidateSource, fixtureSource, context }) {
      executions++;
      const validate = source =>
        validateInvariantRegistry(JSON.parse(source), { repoRoot: root });
      if (context.role === 'control') {
        const before = validate(fixtureSource);
        const after = validate(fixtureSource);
        return {
          origin: before.ok ? 'pass' : 'fail',
          candidate: after.ok ? 'pass' : 'fail',
        };
      }
      const before = validate(originSource);
      const after = validate(candidateSource);
      return {
        origin: before.ok ? 'pass' : 'fail',
        candidate: after.ok ? 'prevented' : 'fail',
        causeKey: before.errors.some(error =>
          error.includes('duplicate stable identity')
        )
          ? 'duplicate-identity'
          : 'unknown',
      };
    },
  };
  const environment = {
    repoRoot: root,
    targets: [target],
    loadAnalysis: async () => analysis,
    loadReplay: async () => suite,
    authorize: async subject => ({
      ...subject,
      ok: true,
      actorId: 'existing-writer',
      policyVersion: 'writer-promotion/v1',
    }),
    intake: { apiKey: '' },
  };
  const promotion = receipt =>
    evaluateLearningPromotion({
      liveHead: head,
      receipts: [receipt],
      repairedFailures: [
        {
          ...request.learningReceipt.identity,
          status: 'repaired',
          repairedHead: head,
        },
      ],
    });
  return {
    request,
    analysis,
    suite,
    target,
    environment,
    promotion,
    executions: () => executions,
  };
}

describe('reviewed lesson compilation', () => {
  it('runs historical artifact validation and valid controls before existing promotion', async () => {
    const f = setup();
    const result = await compileLesson(f.request, f.environment);
    expect(result.disposition).toBe('compiled');
    expect(f.executions()).toBe(3);
    expect(result.receipt.compilation.replay.results[0]).toMatchObject({
      origin: 'fail',
      candidate: 'prevented',
      causeKey: 'duplicate-identity',
    });
    expect(f.promotion(result.receipt)).toMatchObject({
      complete: true,
      acceptedReceipts: 1,
    });
    expect(
      hasCompilationProof(
        result.receipt,
        Date.parse(f.request.revalidation.at) + 1
      )
    ).toBe(false);
    expect(validateLearningReceipt(structuredClone(result.receipt)).ok).toBe(
      false
    );
    expect(
      evaluateLearningPromotion({
        liveHead: head,
        comments: [learningReceiptMarker(result.receipt)],
        repairedFailures: [
          {
            ...f.request.learningReceipt.identity,
            status: 'repaired',
            repairedHead: head,
          },
        ],
      }).complete
    ).toBe(false);
    result.receipt.compilation.artifact.version = 'f'.repeat(64);
    expect(f.promotion(result.receipt).complete).toBe(false);
  });

  it('deliberate red: the real registry validator rejects an invalid candidate artifact', async () => {
    const f = setup();
    f.request.candidateRevision = origin;
    f.request.artifact.version = compilationDigest(
      readReplaySource(root, origin, 'policy.json')
    );
    f.request.learningReceipt.identity.head = origin;
    f.request.learningReceipt.currentHeadReproduction.head = origin;
    f.suite.candidateRevision = origin;
    f.suite.artifactVersion = f.request.artifact.version;
    expect(await compileLesson(f.request, f.environment)).toMatchObject({
      disposition: 'held',
      reason: 'unsupported-or-coincidental-replay',
    });
    expect(f.executions()).toBe(1);
  });

  it('accepts an evidenced no-new-invariant outcome using the existing artifact', async () => {
    const f = setup();
    f.analysis.disposition = f.analysis.finding.disposition = 'no-change';
    f.analysis.challenge.proposalDigest = compilationDigest(f.analysis.finding);
    f.request.outcome = 'no-new-invariant';
    f.request.learningReceipt.guardrailDecision.warranted = false;
    const result = await compileLesson(f.request, f.environment);
    expect(result.disposition).toBe('no-new-invariant');
    expect(f.promotion(result.receipt).complete).toBe(true);
  });

  it('selects the cheapest applicable target and rejects a costlier selection', async () => {
    const f = setup();
    f.environment.targets.unshift({
      ...f.target,
      id: 'costly',
      estimatedCostUsd: 10,
    });
    expect((await compileLesson(f.request, f.environment)).disposition).toBe(
      'compiled'
    );
    f.request.artifact.id = 'costly';
    expect((await compileLesson(f.request, f.environment)).disposition).toBe(
      'held'
    );
  });

  it('requires bounded sibling replay for broad lessons', async () => {
    const f = setup();
    f.analysis.lessonClass = 'broad';
    expect((await compileLesson(f.request, f.environment)).reason).toBe(
      'broad-lesson-needs-sibling-sweep'
    );
    f.request.applicability.surfaces.push('scripts/sibling');
    f.request.learningReceipt.equivalentSurfaceSweep.surfaces.push(
      'scripts/sibling'
    );
    expect((await compileLesson(f.request, f.environment)).reason).toBe(
      'sibling-sweep-incomplete'
    );
    f.suite.cases.push({
      ...f.suite.cases[0],
      id: 'sibling',
      role: 'sibling',
      surface: 'scripts/sibling',
      path: 'fixtures/sibling.json',
    });
    expect((await compileLesson(f.request, f.environment)).disposition).toBe(
      'compiled'
    );
  });

  it.each([
    [
      'unsupported assertions',
      f => {
        f.request.proof = { passed: true };
      },
    ],
    [
      'unsafe evidence',
      f => {
        f.analysis.attemptGraph.evidence[0].access = 'protected';
      },
    ],
    [
      'unsafe replay',
      f => {
        f.suite.access = 'unsafe';
      },
    ],
    [
      'unsafe case',
      f => {
        f.suite.cases[0].access = 'protected';
      },
    ],
    [
      'dependent replay',
      f => {
        f.suite.producerId = 'learner';
      },
    ],
    [
      'self review',
      f => {
        f.analysis.resolutions[1] = f.analysis.resolutions[0];
      },
    ],
    [
      'review disagreement',
      f => {
        f.analysis.challenge.verdict = 'disagree';
      },
    ],
    [
      'stale review',
      f => {
        f.analysis.finding.workClass = 'unreviewed';
      },
    ],
    [
      'unknown cause',
      f => {
        f.analysis.finding.rootCause.status = 'unknown';
        f.analysis.challenge.proposalDigest = compilationDigest(
          f.analysis.finding
        );
      },
    ],
    [
      'overbroad predicate',
      f => {
        f.request.applicability.surfaces = ['scripts/*'];
      },
    ],
    [
      'unreviewed scope',
      f => {
        f.request.applicability.surfaces = ['scripts/elsewhere'];
      },
    ],
    [
      'wrong product',
      f => {
        f.request.applicability.productId = 'another';
      },
    ],
    [
      'wrong tenant',
      f => {
        f.request.applicability.tenantId = 'other';
      },
    ],
    [
      'wrong cohort',
      f => {
        f.request.applicability.cohortId = 'other';
      },
    ],
    [
      'missing version',
      f => {
        delete f.request.artifact.version;
      },
    ],
    [
      'wrong version',
      f => {
        f.request.artifact.version = 'a'.repeat(64);
        f.suite.artifactVersion = f.request.artifact.version;
      },
    ],
    [
      'missing owner',
      f => {
        f.target.owner = '';
      },
    ],
    [
      'missing rollback',
      f => {
        delete f.request.rollback;
      },
    ],
    [
      'missing expiry',
      f => {
        delete f.request.revalidation;
      },
    ],
    [
      'expired',
      f => {
        f.request.revalidation.at = '2000-01-01';
      },
    ],
    [
      'unbacked saving',
      f => {
        f.request.expectedSaving.evidenceRef = 'record://invented';
      },
    ],
    [
      'missing rolling proof',
      f => {
        f.request.learningReceipt.deliberateRedRegression.failsBeforeRepair = false;
      },
    ],
    [
      'unbound rolling proof',
      f => {
        f.request.learningReceipt.deliberateRedRegression.fixture = 'assertion';
      },
    ],
    [
      'unbound origin',
      f => {
        f.suite.originRevision = head;
      },
    ],
    [
      'unbound case',
      f => {
        f.suite.cases[0].revision = head;
      },
    ],
    [
      'missing control',
      f => {
        f.suite.cases = [f.suite.cases[0]];
      },
    ],
    [
      'missing boundary',
      f => {
        f.suite.cases.pop();
      },
    ],
    [
      'duplicate case',
      f => {
        f.suite.cases.push(f.suite.cases[0]);
      },
    ],
    [
      'learner authorization',
      f => {
        f.environment.authorize = async s => ({
          ...s,
          ok: true,
          actorId: 'learner',
          policyVersion: 'self',
        });
      },
    ],
    [
      'stale authorization',
      f => {
        f.environment.authorize = async s => ({
          ...s,
          ok: true,
          actorId: 'writer',
          policyVersion: 'p1',
          head: origin,
        });
      },
    ],
    [
      'authorization failure',
      f => {
        f.environment.authorize = async () => ({ ok: false });
      },
    ],
    [
      'prose skill',
      f => {
        f.target.kind = 'skill-method';
        f.target.path = 'README.md';
        f.request.artifact.version = compilationDigest(
          readReplaySource(root, head, 'README.md')
        );
        f.suite.artifactVersion = f.request.artifact.version;
      },
    ],
    [
      'unbound invariant',
      f => {
        f.target.invariantId = 'JOV-INV-999';
      },
    ],
  ])('rejects %s', async (_name, mutate) => {
    const f = setup();
    mutate(f);
    expect((await compileLesson(f.request, f.environment)).disposition).toBe(
      'held'
    );
  });

  it('rejects coincidental success and invalid controls from executable replay', async () => {
    const f = setup();
    f.suite.cases[1].path = 'policy.json'; // historically broken, not a valid control
    expect((await compileLesson(f.request, f.environment)).reason).toBe(
      'valid-control-rejected'
    );
    const g = setup();
    const run = g.target.replay;
    g.target.replay = input => ({
      ...run(input),
      causeKey: 'different-failure',
    });
    expect((await compileLesson(g.request, g.environment)).reason).toBe(
      'unsupported-or-coincidental-replay'
    );
  });

  it('rejects an invalid canonical registry before replay and binds scope to every broad sibling', async () => {
    const f = setup();
    const canonical = readFileSync(
      join(root, 'canon/invariants.jsonl'),
      'utf8'
    );
    try {
      put(
        'canon/invariants.jsonl',
        `${canonical}${JSON.stringify(invariant)}\n`
      );
      expect((await compileLesson(f.request, f.environment)).reason).toBe(
        'invariant-artifact-invalid'
      );
      expect(f.executions()).toBe(0);
    } finally {
      put('canon/invariants.jsonl', canonical);
    }
    f.analysis.lessonClass = 'broad';
    f.analysis.affectedScope.push('scripts/third');
    f.request.applicability.surfaces.push('scripts/sibling');
    f.request.learningReceipt.equivalentSurfaceSweep.surfaces.push(
      'scripts/sibling'
    );
    f.suite.cases.push({
      ...f.suite.cases[0],
      id: 'sibling',
      role: 'sibling',
      surface: 'scripts/sibling',
    });
    expect((await compileLesson(f.request, f.environment)).reason).toBe(
      'broad-lesson-needs-sibling-sweep'
    );
  });

  it('uses existing Linear intake to deduplicate unsupported repairs', async () => {
    const f = setup();
    f.environment.targets = [
      { ...f.target, kind: 'skill-method', path: 'README.md' },
    ];
    f.environment.intake.apiKey = 'test-only';
    let creates = 0;
    let stored = null;
    // Exercise the actual intake search/create/update GraphQL path, without network.
    f.environment.intake.fetchImpl = async (_url, options) => {
      const { query, variables } = JSON.parse(options.body);
      let data;
      if (query.includes('FindIssueByFingerprint'))
        data = {
          issues: { nodes: stored ? [stored] : [] },
          team: { states: { nodes: [] } },
        };
      else if (query.includes('CreateDedupedLinearIssue')) {
        creates++;
        stored = {
          id: 'issue-id',
          identifier: 'JOV-9999',
          title: variables.title,
          state: { type: 'unstarted' },
        };
        data = { issueCreate: { success: true, issue: stored } };
      } else data = { issueUpdate: { success: true, issue: stored } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    };
    const first = await compileLesson(f.request, f.environment);
    const second = await compileLesson(f.request, f.environment);
    expect(first).toMatchObject({
      disposition: 'owner-issue',
      issue: 'JOV-9999',
    });
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(creates).toBe(1);
    f.environment.intake.apiKey = '';
    expect((await compileLesson(f.request, f.environment)).reason).toBe(
      'unsupported-repair-intake-failed'
    );
  });

  it('fails closed without leaking errors and refuses nonlocal, oversized or symlink evidence', async () => {
    const f = setup();
    f.environment.loadAnalysis = async () => {
      throw new Error('private provider response');
    };
    expect(await compileLesson(f.request, f.environment)).toEqual({
      disposition: 'held',
      reason: 'compilation-evidence-invalid',
    });
    for (const path of [
      '../outside',
      '/etc/passwd',
      'unsafe-link',
      'missing',
      'fixtures/../README.md',
    ]) {
      expect(() => readReplaySource(root, origin, path)).toThrow();
    }
    expect(() => readReplaySource(root, 'HEAD', 'README.md')).toThrow();
    expect(hasCompilationProof({})).toBe(false);
    expect(
      lessonApplies(f.request.applicability, {
        productId: 'other',
        workClass: 'policy-repair',
        surface: 'scripts/policy',
      })
    ).toBe(false);
  });
});
