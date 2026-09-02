import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildCoveragePlan,
  buildPilotReport,
  computeFindingFingerprint,
  executionManifestDigest,
  normalizeFindings,
  validateCoverageMap,
  validateFinding,
  validateRegistry,
  validateTrackedCoverage,
} from './continuous-audit.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
}

async function loadContracts() {
  const registry = validateRegistry(
    await readJson('audits/continuous/registry.json')
  );
  const coverageMap = validateCoverageMap(
    await readJson('audits/continuous/coverage-map.json'),
    registry
  );
  return { registry, coverageMap };
}

function qualificationReceipt(provider, model) {
  const entries = {
    'codex:gpt-5.6-sol': {
      id: 'codex-sol',
      capabilities: ['architecture', 'root-cause', 'code'],
      quality: 88,
    },
    'codex:gpt-5.6-luna': {
      id: 'codex-luna',
      capabilities: ['code', 'review', 'mechanical', 'tests'],
      quality: 74,
    },
    'grok:grok-4.6': {
      id: 'grok-4.6',
      capabilities: [
        'mechanical',
        'code',
        'review',
        'semantic',
        'architecture',
        'root-cause',
      ],
      quality: 100,
    },
  };
  const entry = entries[`${provider}:${model}`] ?? {
    id: `${provider}-unregistered-fixture`,
    capabilities: ['review', 'architecture', 'root-cause'],
    quality: 100,
  };
  return {
    provider,
    model,
    modelRegistryEntryId: entry.id,
    modelCapabilities: entry.capabilities,
    modelQuality: entry.quality,
    costTier: 'subscription-included',
    authenticatedAt: '2026-09-02T03:00:00Z',
    modelIdentityVerified: true,
    readBoundaryAcknowledged: true,
    secretScanPassed: true,
    customerDataExcluded: true,
    costCapCents: 0,
    fixtureEvalPassRate: 0.95,
    structuredOutputPassed: true,
    receiptLocator: `fixture:${provider}:${model}`,
  };
}

function deterministicProbeResults() {
  const probe = {
    id: 'native-queue-snapshot',
    command:
      'MERGE_QUEUE_BACKEND=native node scripts/merge-queue-backend.mjs list-state',
    status: 'observed',
    summary: 'Fixture queue snapshot completed successfully.',
    observedAt: '2026-09-02T03:59:00Z',
    exitCode: 0,
    outputDigest: createHash('sha256')
      .update('fixture queue output')
      .digest('hex'),
  };
  return [
    {
      ...probe,
      receiptDigest: createHash('sha256')
        .update(JSON.stringify(probe))
        .digest('hex'),
    },
  ];
}

function makeFinding({
  claim = 'The queue depth exceeds the bounded threshold.',
  provider = null,
  providerFamily = null,
  model = null,
  evidence = null,
} = {}) {
  const [probe] = deterministicProbeResults();
  const finding = {
    familyId: 'ci-merge-throughput',
    partitionId: 'delivery-control',
    ruleId: 'queue-depth-budget',
    title: 'Queue depth is above threshold',
    claim,
    severity: 'medium',
    riskScore: 55,
    primaryLocation: 'github:JovieInc/Jovie:merge-queue/main',
    observedAt: '2026-09-02T04:00:00Z',
    evidence: evidence ?? [
      {
        tier: 'queue',
        kind: 'queue-snapshot',
        direct: true,
        locator: 'fixture:queue-snapshot',
        observedAt: '2026-09-02T04:00:00Z',
        summary: 'Queue snapshot reports 76 entries.',
      },
    ],
    source: provider
      ? {
          kind: 'model',
          provider,
          providerFamily:
            providerFamily ??
            ({ codex: 'gpt-5.6', grok: 'grok-4.6' }[provider] || provider),
          model,
          qualificationReceipt: qualificationReceipt(provider, model),
        }
      : {
          kind: 'deterministic',
          probeId: probe.id,
          command: probe.command,
          executionReceiptDigest: probe.receiptDigest,
        },
    acceptance: {
      state: 'validated',
      validatedBy: 'fixture-validator',
      validatedAt: '2026-09-02T04:00:00Z',
    },
    resolution: {
      state: 'blocked',
      owner: 'Summer/Symphony',
      reason:
        'The fixture validates the signal but grants no mutation authority.',
      blocker: 'A bounded root-cause audit is required.',
    },
  };
  finding.fingerprint = computeFindingFingerprint(finding);
  return finding;
}

test('canonical registry and coverage map validate every required family', async () => {
  const { registry, coverageMap } = await loadContracts();
  assert.equal(registry.auditFamilies.length, 13);
  assert.equal(coverageMap.partitions.length, 27);
  assert.equal(
    registry.providerCatalog.find(provider => provider.id === 'hyperagent')
      .qualificationState,
    'unqualified'
  );
});

test('coverage planner weights changed high-risk partitions without a full scan', async () => {
  const { registry, coverageMap } = await loadContracts();
  const plan = buildCoveragePlan(coverageMap, {
    asOf: '2026-09-03T00:00:00Z',
    changedFiles: ['apps/web/proxy.ts'],
    selectionPolicy: registry.selectionPolicy,
  });
  assert.equal(plan[0].partitionId, 'trust-boundaries');
  assert.equal(plan[0].changed, true);
  assert.ok(plan[0].score > plan.at(-1).score);
  const strongerPolicy = {
    ...registry.selectionPolicy,
    changedPathMultiplier: registry.selectionPolicy.changedPathMultiplier * 2,
  };
  const strongerPlan = buildCoveragePlan(coverageMap, {
    asOf: '2026-09-03T00:00:00Z',
    changedFiles: ['apps/web/proxy.ts'],
    selectionPolicy: strongerPolicy,
  });
  assert.equal(strongerPlan[0].score, plan[0].score * 2);
});

test('tracked coverage inventory fails closed on an unmapped code path', async () => {
  const { coverageMap } = await loadContracts();
  assert.throws(
    () =>
      validateTrackedCoverage(
        ['apps/web/proxy.ts', 'unknown-product/surprise.ts'],
        coverageMap
      ),
    /unmapped tracked files.*unknown-product\/surprise\.ts/s
  );
});

test('finding normalization deduplicates direct evidence by canonical fingerprint', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding();
  const duplicate = structuredClone(finding);
  duplicate.evidence.push({
    tier: 'ci',
    kind: 'workflow-run',
    direct: true,
    locator: 'fixture:ci-run',
    observedAt: '2026-09-02T04:00:00Z',
    summary: 'Exact-head CI completed.',
  });
  const normalized = normalizeFindings(
    [finding, duplicate],
    registry,
    coverageMap,
    deterministicProbeResults()
  );
  assert.equal(normalized.findings.length, 1);
  assert.equal(normalized.findings[0].sourceRuns.length, 2);
  assert.equal(normalized.findings[0].evidence.length, 2);
});

test('qualified different-provider findings expose disagreements', async () => {
  const { registry, coverageMap } = await loadContracts();
  const codex = makeFinding({
    provider: 'codex',
    providerFamily: 'gpt-5.6',
    model: 'gpt-5.6-sol',
    claim: 'The queue depth exceeds the bounded threshold.',
  });
  const grok = makeFinding({
    provider: 'grok',
    providerFamily: 'grok-4.6',
    model: 'grok-4.6',
    claim:
      'The queue depth is expected and does not exceed the bounded threshold.',
  });
  const normalized = normalizeFindings([codex, grok], registry, coverageMap);
  assert.equal(normalized.comparisons.length, 1);
  assert.equal(normalized.comparisons[0].status, 'disagreement');
  assert.equal(normalized.comparisons[0].independentProviderFamilies, 2);
});

test('model claims fail without direct evidence', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding({
    provider: 'codex',
    providerFamily: 'gpt-5.6',
    model: 'gpt-5.6-sol',
    evidence: [
      {
        tier: 'source',
        kind: 'queue-snapshot',
        direct: false,
        locator: 'fixture:model-output',
        observedAt: '2026-09-02T04:00:00Z',
        summary: 'Model asserted a queue risk.',
      },
    ],
  });
  assert.throws(
    () =>
      validateFinding(
        finding,
        registry,
        coverageMap,
        deterministicProbeResults()
      ),
    /lacks direct evidence/
  );
});

test('finding evidence kinds must be allowed by the selected family', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding();
  finding.evidence[0].kind = 'arbitrary-claim';
  assert.throws(
    () =>
      validateFinding(
        finding,
        registry,
        coverageMap,
        deterministicProbeResults()
      ),
    /evidence kind arbitrary-claim is not allowed/
  );
});

test('deterministic findings require an executed registered probe receipt', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding();
  finding.source.probeId = 'not-a-real-probe';
  assert.throws(
    () =>
      validateFinding(
        finding,
        registry,
        coverageMap,
        deterministicProbeResults()
      ),
    /did not execute successfully/
  );

  const [tampered] = deterministicProbeResults();
  tampered.command = 'node arbitrary-unregistered-probe.mjs';
  assert.throws(
    () => validateFinding(finding, registry, coverageMap, [tampered]),
    /is not registered/
  );
});

test('model qualification enforces family capabilities and quality', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding({
    provider: 'codex',
    providerFamily: 'gpt-5.6',
    model: 'gpt-5.6-luna',
  });
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /lacks required capability architecture/
  );
});

test('model qualification binds identity and zero-cost cap to the checked-in registry', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding({
    provider: 'codex',
    providerFamily: 'gpt-5.6',
    model: 'gpt-5.6-sol',
  });
  finding.source.qualificationReceipt.modelRegistryEntryId = 'invented-model';
  finding.source.qualificationReceipt.costCapCents = 999;
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /model registry entry is unknown/
  );
  finding.source.qualificationReceipt.modelRegistryEntryId = 'codex-sol';
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /cost cap is invalid/
  );
});

test('provider-family independence is derived from the model registry', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding({
    provider: 'codex',
    providerFamily: 'invented-independent-family',
    model: 'gpt-5.6-sol',
  });
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /provider family does not match the model registry/
  );
});

test('critical model findings require an independent provider-family cross-check', async () => {
  const { registry, coverageMap } = await loadContracts();
  const codex = makeFinding({
    provider: 'codex',
    providerFamily: 'gpt-5.6',
    model: 'gpt-5.6-sol',
  });
  codex.severity = 'critical';
  codex.riskScore = 95;
  assert.throws(
    () => normalizeFindings([codex], registry, coverageMap),
    /requires 2 independent provider families/
  );
  const grok = makeFinding({
    provider: 'grok',
    providerFamily: 'grok-4.6',
    model: 'grok-4.6',
  });
  grok.severity = 'critical';
  grok.riskScore = 95;
  assert.equal(
    normalizeFindings([codex, grok], registry, coverageMap).findings.length,
    1
  );
});

test('Hyperagent fails closed even with a syntactically complete receipt', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding({
    provider: 'hyperagent',
    providerFamily: 'hyperagent',
    model: 'claimed-model',
  });
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /provider hyperagent is unqualified; substitution is forbidden/
  );
});

test('Hyperagent cannot be marked eligible without a reviewed safe baseline', async () => {
  const { registry } = await loadContracts();
  const hyperagent = registry.providerCatalog.find(
    provider => provider.id === 'hyperagent'
  );
  hyperagent.qualificationState = 'conditional';
  hyperagent.models = ['claimed-model'];
  assert.throws(
    () => validateRegistry(registry),
    /hyperagent qualification baseline is incomplete or unsafe/
  );
});

test('bounded pilot report validates proof-tier separation and terminal finding state', async () => {
  const { registry, coverageMap } = await loadContracts();
  const input = await readJson(
    'audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json'
  );
  const report = buildPilotReport(input, registry, coverageMap);
  assert.equal(report.summary.deduplicatedFindingCount, 1);
  assert.equal(report.findings[0].resolution.state, 'blocked');
  assert.equal(report.proofTiers.runtime.status, 'availability-only');
  assert.equal(report.safety.incrementalModelSpendCents, 0);
  assert.equal(report.safety.externalJobsCreated, false);
});

test('pilot proof and safety receipts fail closed on unsupported claims', async () => {
  const { registry, coverageMap } = await loadContracts();
  const input = await readJson(
    'audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json'
  );
  input.proofTiers.ci.evidence = [{}];
  assert.throws(
    () => buildPilotReport(input, registry, coverageMap),
    /proof evidence tier must be ci/
  );
  const unsafeInput = await readJson(
    'audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json'
  );
  unsafeInput.safetyReceipt.externalJobsCreated = true;
  assert.throws(
    () => buildPilotReport(unsafeInput, registry, coverageMap),
    /unsafe pilot safety field externalJobsCreated/
  );
  const unboundInput = await readJson(
    'audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json'
  );
  unboundInput.safetyReceipt.executionManifestDigest = '0'.repeat(64);
  assert.throws(
    () => buildPilotReport(unboundInput, registry, coverageMap),
    /not bound to the execution manifest/
  );

  const arbitraryProbeInput = await readJson(
    'audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json'
  );
  arbitraryProbeInput.deterministicProbeResults[0].command =
    'node arbitrary-unregistered-probe.mjs';
  assert.throws(
    () => buildPilotReport(arbitraryProbeInput, registry, coverageMap),
    /is not registered/
  );
});

test('the safety manifest digest includes findings and model receipts', async () => {
  const input = await readJson(
    'audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json'
  );
  const before = executionManifestDigest(input);
  input.findings.push(
    makeFinding({
      provider: 'codex',
      model: 'gpt-5.6-sol',
      claim: 'A newly added qualified model finding changes the manifest.',
    })
  );
  const afterFinding = executionManifestDigest(input);
  assert.notEqual(afterFinding, before);
  input.findings.at(-1).source.qualificationReceipt.receiptLocator =
    'fixture:changed-invocation-receipt';
  assert.notEqual(executionManifestDigest(input), afterFinding);
});

test('registry rejects deterministic probes outside the executable allowlist', async () => {
  const registry = await readJson('audits/continuous/registry.json');
  registry.auditFamilies[0].deterministicProbes = ['review it somehow'];
  assert.throws(
    () => validateRegistry(registry),
    /must define deterministic probes/
  );
});
