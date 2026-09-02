import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildCoveragePlan,
  buildPilotReport,
  computeFindingFingerprint,
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
  return {
    provider,
    model,
    modelRegistryEntryId: `${provider}-fixture-model`,
    modelCapabilities: ['review', 'architecture', 'root-cause'],
    modelQuality: 100,
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

function makeFinding({
  claim = 'The queue depth exceeds the bounded threshold.',
  provider = null,
  providerFamily = null,
  model = null,
  evidence = null,
} = {}) {
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
          providerFamily: providerFamily ?? provider,
          model,
          qualificationReceipt: qualificationReceipt(provider, model),
        }
      : { kind: 'deterministic', tool: 'fixture-probe' },
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
  const { coverageMap } = await loadContracts();
  const plan = buildCoveragePlan(coverageMap, {
    asOf: '2026-09-03T00:00:00Z',
    changedFiles: ['apps/web/proxy.ts'],
  });
  assert.equal(plan[0].partitionId, 'trust-boundaries');
  assert.equal(plan[0].changed, true);
  assert.ok(plan[0].score > plan.at(-1).score);
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
    coverageMap
  );
  assert.equal(normalized.findings.length, 1);
  assert.equal(normalized.findings[0].sourceRuns.length, 2);
  assert.equal(normalized.findings[0].evidence.length, 2);
});

test('qualified different-provider findings expose disagreements', async () => {
  const { registry, coverageMap } = await loadContracts();
  const codex = makeFinding({
    provider: 'codex',
    providerFamily: 'openai',
    model: 'gpt-5.6-sol',
    claim: 'The queue depth exceeds the bounded threshold.',
  });
  const grok = makeFinding({
    provider: 'grok',
    providerFamily: 'xai',
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
    providerFamily: 'openai',
    model: 'gpt-5.6-sol',
    evidence: [
      {
        tier: 'source',
        kind: 'model-opinion',
        direct: false,
        locator: 'fixture:model-output',
        observedAt: '2026-09-02T04:00:00Z',
        summary: 'Model asserted a queue risk.',
      },
    ],
  });
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /lacks direct evidence/
  );
});

test('model qualification enforces family capabilities and quality', async () => {
  const { registry, coverageMap } = await loadContracts();
  const finding = makeFinding({
    provider: 'codex',
    providerFamily: 'openai',
    model: 'gpt-5.6-luna',
  });
  finding.source.qualificationReceipt.modelCapabilities = ['review'];
  finding.source.qualificationReceipt.modelQuality = 74;
  assert.throws(
    () => validateFinding(finding, registry, coverageMap),
    /lacks required capability architecture/
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
