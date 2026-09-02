#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const defaultRegistryPath = path.join(
  repoRoot,
  'audits',
  'continuous',
  'registry.json'
);
const defaultCoveragePath = path.join(
  repoRoot,
  'audits',
  'continuous',
  'coverage-map.json'
);
const modelRegistry = JSON.parse(
  readFileSync(
    path.join(repoRoot, 'scripts', 'hermes', 'config', 'model-registry.json'),
    'utf8'
  )
);
const modelRegistryEntries = new Map(
  modelRegistry.models.map(entry => [entry.id, entry])
);

const DETERMINISTIC_PROBE_COMMANDS = new Set([
  'bash scripts/security/verify-gitleaks-coverage.sh',
  'pnpm run skill-governance:check',
  'python3 .github/scripts/test-security-suppression-audit.py',
  'pnpm run test:fast',
  'pnpm run test:bug-to-test',
  'pnpm --filter @jovie/web run test:nightly-agent:select',
  'node scripts/ci-duration-ratchet.mjs',
  'MERGE_QUEUE_BACKEND=native node scripts/merge-queue-backend.mjs list-state',
  'node scripts/verify-workflow-references.mjs',
  'bash scripts/ci-health-check.sh',
  'node scripts/lib/policy-gate-liveness.mjs',
  'node scripts/dependabot-update-policy.mjs',
  'pnpm audit --audit-level high',
  'pnpm run boundaries:check',
  'node scripts/invariant-stewardship/audit.mjs',
  'pnpm --filter @jovie/web run drizzle:check',
  'pnpm --filter @jovie/web run test:budgets',
  'pnpm --filter @jovie/web run a11y:axe',
  'node scripts/design-governance-audit.mjs',
  'pnpm run test:coverage:diff',
  'pnpm --filter @jovie/web run test:mutation:hotspots',
  'pnpm run evals',
  'pnpm run test:quarantine-ledger',
  'node scripts/doc-freshness-lint.mjs',
  'node scripts/skill-catalog.mjs',
  'bash scripts/automation-verify.sh affected',
]);

const REQUIRED_FAMILY_IDS = [
  'security',
  'correctness-regression',
  'ci-merge-throughput',
  'runtime-production-health',
  'dependency-upgrade',
  'architecture-ownership-drift',
  'data-migration-safety',
  'privacy-access-boundaries',
  'performance-cost',
  'ux-accessibility-visual-drift',
  'test-eval-quality',
  'documentation-skill-context-freshness',
  'operational-automation-liveness',
];

const RESOLUTION_STATES = new Set([
  'fixed',
  'disproven',
  'deferred-with-expiry',
  'blocked',
]);
const ACCEPTANCE_STATES = new Set(['candidate', 'validated', 'disproven']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const PROVIDER_QUALIFICATION_STATES = new Set([
  'qualified',
  'conditional',
  'unqualified',
]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseTimestamp(value, label) {
  invariant(nonEmptyString(value), `${label} must be a non-empty timestamp`);
  const timestamp = Date.parse(value);
  invariant(Number.isFinite(timestamp), `${label} is not a valid timestamp`);
  return timestamp;
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function assertExactUniqueStrings(values, expected, label) {
  invariant(Array.isArray(values), `${label} must be an array`);
  invariant(
    new Set(values).size === values.length,
    `${label} contains duplicate values`
  );
  const actualSorted = [...values].sort();
  const expectedSorted = [...expected].sort();
  invariant(
    JSON.stringify(actualSorted) === JSON.stringify(expectedSorted),
    `${label} must contain exactly: ${expectedSorted.join(', ')}`
  );
}

function validateProviderCatalog(registry) {
  invariant(
    Array.isArray(registry.providerCatalog) &&
      registry.providerCatalog.length > 0,
    'providerCatalog must be a non-empty array'
  );

  const providerIds = new Set();
  for (const provider of registry.providerCatalog) {
    invariant(isRecord(provider), 'providerCatalog entries must be objects');
    invariant(nonEmptyString(provider.id), 'provider id is required');
    invariant(
      !providerIds.has(provider.id),
      `duplicate provider: ${provider.id}`
    );
    providerIds.add(provider.id);
    invariant(
      PROVIDER_QUALIFICATION_STATES.has(provider.qualificationState),
      `provider ${provider.id} has invalid qualificationState`
    );
  }

  const hyperagent = registry.providerCatalog.find(
    provider => provider.id === 'hyperagent'
  );
  invariant(hyperagent, 'providerCatalog must include hyperagent');
  invariant(hyperagent.failClosed === true, 'hyperagent must fail closed');
  invariant(
    hyperagent.substitutionPolicy === 'forbidden',
    'hyperagent provider substitution must be forbidden'
  );
  invariant(
    Array.isArray(hyperagent.qualificationReceiptsRequired) &&
      hyperagent.qualificationReceiptsRequired.length >= 7,
    'hyperagent qualification receipts are incomplete'
  );
  if (hyperagent.qualificationState !== 'unqualified') {
    const baseline = hyperagent.qualificationBaseline;
    invariant(
      Array.isArray(hyperagent.models) && hyperagent.models.length > 0,
      'qualified hyperagent must declare at least one exact model identity'
    );
    invariant(
      isRecord(baseline) &&
        nonEmptyString(baseline.reviewedAt) &&
        nonEmptyString(baseline.receiptLocator) &&
        baseline.authenticationSuccess === true &&
        baseline.readBoundaryAcknowledged === true &&
        baseline.secretAndCustomerDataEgressBlocked === true &&
        baseline.explicitCostCapCents === 0 &&
        baseline.fixtureEvalScore >= 0.9 &&
        baseline.structuredOutputSchemaPass === true,
      'hyperagent qualification baseline is incomplete or unsafe'
    );
  }

  const requiredQualificationFields =
    registry.providerQualificationSchema?.requiredFields;
  invariant(
    Array.isArray(requiredQualificationFields) &&
      requiredQualificationFields.length >= 10,
    'provider qualification schema is incomplete'
  );

  return providerIds;
}

function validateSelectionPolicy(policy) {
  invariant(isRecord(policy), 'selectionPolicy must be an object');
  assertExactUniqueStrings(
    Object.keys(policy),
    [
      'baseWeight',
      'changedPathMultiplier',
      'highRiskMultiplier',
      'recentIncidentMultiplier',
      'overdueMultiplier',
      'crossModelSampleRate',
      'crossModelMinimumForCritical',
      'sameProviderFamilyCountsAsIndependent',
    ],
    'selectionPolicy keys'
  );
  const multiplierFields = [
    'baseWeight',
    'changedPathMultiplier',
    'highRiskMultiplier',
    'recentIncidentMultiplier',
    'overdueMultiplier',
  ];
  for (const field of multiplierFields) {
    invariant(
      finiteNonNegative(policy[field]) && policy[field] >= 1,
      `selectionPolicy ${field} must be at least 1`
    );
  }
  invariant(
    finiteNonNegative(policy.crossModelSampleRate) &&
      policy.crossModelSampleRate <= 1,
    'selectionPolicy crossModelSampleRate must be between 0 and 1'
  );
  invariant(
    Number.isSafeInteger(policy.crossModelMinimumForCritical) &&
      policy.crossModelMinimumForCritical >= 1,
    'selectionPolicy crossModelMinimumForCritical must be positive'
  );
  invariant(
    policy.sameProviderFamilyCountsAsIndependent === false,
    'same provider family may not count as independent'
  );
  return policy;
}

function validateFamily(family, registry, providerIds) {
  const prefix = `audit family ${family?.id ?? '<unknown>'}`;
  invariant(isRecord(family), 'audit family entries must be objects');
  invariant(nonEmptyString(family.id), `${prefix} is missing id`);
  invariant(nonEmptyString(family.name), `${prefix} is missing name`);
  invariant(isRecord(family.scope), `${prefix} is missing scope`);
  invariant(
    Array.isArray(family.scope.partitions) &&
      family.scope.partitions.length > 0,
    `${prefix} must name at least one scope partition`
  );
  invariant(
    nonEmptyString(family.scope.partitionStrategy),
    `${prefix} is missing partitionStrategy`
  );

  const eligibility = family.providerEligibility;
  invariant(isRecord(eligibility), `${prefix} is missing providerEligibility`);
  invariant(
    eligibility.deterministicFirst === true,
    `${prefix} must run deterministic probes first`
  );
  invariant(
    Array.isArray(eligibility.allowedProviders) &&
      eligibility.allowedProviders.includes('deterministic'),
    `${prefix} must allow deterministic execution`
  );
  for (const providerId of eligibility.allowedProviders) {
    invariant(
      providerIds.has(providerId),
      `${prefix} references unknown provider ${providerId}`
    );
  }
  invariant(
    Array.isArray(eligibility.requiredModelCapabilities),
    `${prefix} is missing required model capabilities`
  );
  invariant(
    finiteNonNegative(eligibility.minimumQuality),
    `${prefix} has invalid minimumQuality`
  );
  invariant(
    nonEmptyString(eligibility.crossCheck),
    `${prefix} is missing cross-check policy`
  );

  invariant(isRecord(family.readBoundary), `${prefix} is missing readBoundary`);
  invariant(
    Array.isArray(family.readBoundary.allow) &&
      Array.isArray(family.readBoundary.deny) &&
      family.readBoundary.deny.length > 0,
    `${prefix} read boundary must include allow and deny lists`
  );

  const budget = family.costBudget;
  invariant(isRecord(budget), `${prefix} is missing costBudget`);
  for (const field of [
    'deterministicMinutes',
    'modelRuns',
    'maxInputTokensPerRun',
    'maxOutputTokensPerRun',
    'maxSpendCents',
  ]) {
    invariant(
      finiteNonNegative(budget[field]),
      `${prefix} has invalid cost budget field ${field}`
    );
  }
  invariant(
    budget.maxSpendCents === 0,
    `${prefix} must default to zero incremental model spend`
  );

  invariant(
    Array.isArray(family.deterministicProbes) &&
      family.deterministicProbes.length > 0 &&
      new Set(family.deterministicProbes).size ===
        family.deterministicProbes.length &&
      family.deterministicProbes.every(probe =>
        DETERMINISTIC_PROBE_COMMANDS.has(probe)
      ),
    `${prefix} must define deterministic probes`
  );
  invariant(
    family.evidenceSchema?.schemaRef === registry.findingSchema.id,
    `${prefix} must reference the canonical finding schema`
  );
  assertExactUniqueStrings(
    family.evidenceSchema.requiredProofTiers,
    registry.policy.proofTiers,
    `${prefix} proof tiers`
  );
  invariant(
    Array.isArray(family.evidenceSchema.requiredKinds) &&
      family.evidenceSchema.requiredKinds.length > 0,
    `${prefix} must define evidence kinds`
  );
  invariant(isRecord(family.riskRubric), `${prefix} is missing riskRubric`);
  invariant(
    Array.isArray(family.riskRubric.baseDimensions) &&
      family.riskRubric.baseDimensions.length >= 3,
    `${prefix} risk rubric is incomplete`
  );
  invariant(isRecord(family.recurrence), `${prefix} is missing recurrence`);
  invariant(
    Array.isArray(family.recurrence.events) &&
      family.recurrence.events.length > 0,
    `${prefix} recurrence events are missing`
  );
  invariant(
    family.recurrence.scheduleStatus === 'proposal-only',
    `${prefix} may not claim an active schedule`
  );
  invariant(
    finiteNonNegative(family.recurrence.coverageWindowDays) &&
      family.recurrence.coverageWindowDays > 0,
    `${prefix} has invalid coverage window`
  );
  invariant(
    ['draft', 'pilot', 'accepted', 'paused', 'retired'].includes(
      family.acceptanceState?.state
    ),
    `${prefix} has invalid acceptance state`
  );
}

export function validateRegistry(registry) {
  invariant(isRecord(registry), 'registry must be an object');
  invariant(registry.schemaVersion === 1, 'registry schemaVersion must be 1');
  invariant(
    registry.registryId === 'jovie-continuous-audit-registry',
    'unexpected registryId'
  );
  invariant(isRecord(registry.policy), 'registry policy is required');
  invariant(
    registry.policy.noRawModelClaims === true,
    'raw model claims must be forbidden'
  );
  invariant(
    registry.policy.providerSubstitution === 'forbidden',
    'provider substitution must be forbidden'
  );
  assertExactUniqueStrings(
    registry.policy.requiredResolutionStates,
    [...RESOLUTION_STATES],
    'resolution states'
  );
  assertExactUniqueStrings(
    registry.policy.proofTiers,
    ['source', 'ci', 'queue', 'deploy', 'runtime'],
    'proof tiers'
  );
  invariant(
    registry.findingSchema?.id === 'continuous-audit-finding/v1',
    'canonical finding schema is missing'
  );
  validateSelectionPolicy(registry.selectionPolicy);
  const providerIds = validateProviderCatalog(registry);
  invariant(
    Array.isArray(registry.auditFamilies),
    'auditFamilies must be an array'
  );
  assertExactUniqueStrings(
    registry.auditFamilies.map(family => family.id),
    REQUIRED_FAMILY_IDS,
    'audit family ids'
  );
  for (const family of registry.auditFamilies) {
    validateFamily(family, registry, providerIds);
  }
  return registry;
}

export function validateCoverageMap(coverageMap, registry) {
  invariant(isRecord(coverageMap), 'coverage map must be an object');
  invariant(
    coverageMap.schemaVersion === 1,
    'coverage schemaVersion must be 1'
  );
  invariant(
    coverageMap.registryId === registry.registryId,
    'coverage map registryId does not match registry'
  );
  invariant(
    coverageMap.coverageIntervalDays === registry.policy.coverageIntervalDays,
    'coverage interval does not match registry policy'
  );
  invariant(
    Array.isArray(coverageMap.partitions) && coverageMap.partitions.length > 0,
    'coverage map must contain partitions'
  );
  invariant(
    Array.isArray(coverageMap.inventoryPolicy?.auditedExtensions) &&
      coverageMap.inventoryPolicy.auditedExtensions.length > 0,
    'coverage inventory policy must define auditedExtensions'
  );
  invariant(
    Array.isArray(coverageMap.inventoryPolicy?.alwaysAuditGlobs),
    'coverage inventory policy must define alwaysAuditGlobs'
  );
  invariant(
    coverageMap.inventoryPolicy.requireEveryTrackedMatch === true,
    'coverage inventory must fail on unmapped tracked files'
  );

  const familyIds = new Set(registry.auditFamilies.map(family => family.id));
  const coveredFamilies = new Set();
  const partitionIds = new Set();
  for (const partition of coverageMap.partitions) {
    invariant(isRecord(partition), 'coverage partition must be an object');
    invariant(
      nonEmptyString(partition.id),
      'coverage partition id is required'
    );
    invariant(
      !partitionIds.has(partition.id),
      `duplicate coverage partition ${partition.id}`
    );
    partitionIds.add(partition.id);
    invariant(
      Array.isArray(partition.includeGlobs) &&
        partition.includeGlobs.length > 0 &&
        partition.includeGlobs.every(nonEmptyString),
      `partition ${partition.id} must define includeGlobs`
    );
    invariant(
      Array.isArray(partition.familyIds) && partition.familyIds.length > 0,
      `partition ${partition.id} must define familyIds`
    );
    for (const familyId of partition.familyIds) {
      invariant(
        familyIds.has(familyId),
        `partition ${partition.id} references unknown family ${familyId}`
      );
      coveredFamilies.add(familyId);
    }
    for (const field of ['baseWeight', 'riskWeight', 'intervalDays']) {
      invariant(
        finiteNonNegative(partition[field]) && partition[field] > 0,
        `partition ${partition.id} has invalid ${field}`
      );
    }
    if (partition.lastAuditedAt !== null) {
      parseTimestamp(partition.lastAuditedAt, `${partition.id}.lastAuditedAt`);
    }
    invariant(
      Array.isArray(partition.highRiskReasons),
      `partition ${partition.id} must define highRiskReasons`
    );
  }
  assertExactUniqueStrings(
    [...coveredFamilies],
    [...familyIds],
    'families referenced by coverage partitions'
  );
  invariant(
    Array.isArray(coverageMap.excludedPaths) &&
      coverageMap.excludedPaths.every(
        entry => nonEmptyString(entry?.glob) && nonEmptyString(entry?.reason)
      ),
    'excluded paths must include a glob and reason'
  );

  const declaredPartitions = new Set(
    registry.auditFamilies.flatMap(family => family.scope.partitions)
  );
  for (const partitionId of declaredPartitions) {
    invariant(
      partitionIds.has(partitionId),
      `audit family references missing partition ${partitionId}`
    );
  }
  return coverageMap;
}

function globToRegExp(glob) {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    const next = glob[index + 1];
    if (character === '*' && next === '*') {
      pattern += '.*';
      index += 1;
    } else if (character === '*') {
      pattern += '[^/]*';
    } else if (character === '?') {
      pattern += '[^/]';
    } else {
      pattern += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${pattern}$`);
}

function matchesPartition(filePath, partition) {
  return partition.includeGlobs.some(glob => globToRegExp(glob).test(filePath));
}

function matchesAnyGlob(filePath, globs) {
  return globs.some(glob => globToRegExp(glob).test(filePath));
}

export function validateTrackedCoverage(trackedFiles, coverageMap) {
  invariant(Array.isArray(trackedFiles), 'tracked files must be an array');
  const policy = coverageMap.inventoryPolicy;
  const auditedFiles = trackedFiles.filter(filePath => {
    const extension = path.extname(filePath);
    return (
      policy.auditedExtensions.includes(extension) ||
      matchesAnyGlob(filePath, policy.alwaysAuditGlobs)
    );
  });
  const excluded = [];
  const mapped = [];
  const unmapped = [];
  for (const filePath of auditedFiles) {
    const exclusion = coverageMap.excludedPaths.find(entry =>
      globToRegExp(entry.glob).test(filePath)
    );
    if (exclusion) {
      excluded.push({ filePath, reason: exclusion.reason });
      continue;
    }
    const partitionIds = coverageMap.partitions
      .filter(partition => matchesPartition(filePath, partition))
      .map(partition => partition.id);
    if (partitionIds.length === 0) {
      unmapped.push(filePath);
    } else {
      mapped.push({ filePath, partitionIds });
    }
  }
  invariant(
    unmapped.length === 0,
    `coverage inventory has ${unmapped.length} unmapped tracked files:\n${unmapped
      .slice(0, 50)
      .join('\n')}`
  );
  return {
    trackedFileCount: trackedFiles.length,
    auditedFileCount: auditedFiles.length,
    mappedFileCount: mapped.length,
    excludedFileCount: excluded.length,
    unmappedFileCount: unmapped.length,
    mapped,
    excluded,
    unmapped,
  };
}

export function buildCoveragePlan(
  coverageMap,
  {
    asOf = new Date().toISOString(),
    changedFiles = [],
    familyId = null,
    selectionPolicy,
  } = {}
) {
  validateSelectionPolicy(selectionPolicy);
  const asOfTimestamp = parseTimestamp(asOf, 'plan asOf');
  return coverageMap.partitions
    .filter(partition => !familyId || partition.familyIds.includes(familyId))
    .map(partition => {
      const changed = changedFiles.some(filePath =>
        matchesPartition(filePath, partition)
      );
      const daysSinceAudit = partition.lastAuditedAt
        ? (asOfTimestamp - Date.parse(partition.lastAuditedAt)) / 86_400_000
        : Number.POSITIVE_INFINITY;
      const overdue = daysSinceAudit >= partition.intervalDays;
      const dueWeight = overdue
        ? selectionPolicy.overdueMultiplier
        : selectionPolicy.baseWeight;
      const changeWeight = changed
        ? selectionPolicy.changedPathMultiplier
        : selectionPolicy.baseWeight;
      const incidentWeight = partition.recentIncident
        ? selectionPolicy.recentIncidentMultiplier
        : selectionPolicy.baseWeight;
      const highRiskWeight = partition.highRiskReasons.length
        ? selectionPolicy.highRiskMultiplier
        : selectionPolicy.baseWeight;
      const score =
        partition.baseWeight *
        partition.riskWeight *
        dueWeight *
        changeWeight *
        incidentWeight *
        highRiskWeight;
      return {
        partitionId: partition.id,
        familyIds: partition.familyIds,
        score,
        changed,
        overdue,
        daysSinceAudit: Number.isFinite(daysSinceAudit)
          ? Number(daysSinceAudit.toFixed(2))
          : null,
        intervalDays: partition.intervalDays,
        reasons: [
          ...(changed ? ['changed-path'] : []),
          ...(overdue ? ['overdue'] : []),
          ...(partition.recentIncident ? ['recent-incident'] : []),
          ...partition.highRiskReasons.map(reason => `risk:${reason}`),
        ],
      };
    })
    .sort((left, right) =>
      right.score === left.score
        ? left.partitionId.localeCompare(right.partitionId)
        : right.score - left.score
    );
}

function normalizedClaim(claim) {
  return claim.trim().toLowerCase().replaceAll(/\s+/g, ' ');
}

export function computeFindingFingerprint(finding) {
  const material = [
    finding.familyId,
    finding.partitionId,
    finding.ruleId,
    finding.primaryLocation,
    normalizedClaim(finding.claim),
  ].join('\n');
  return createHash('sha256').update(material).digest('hex').slice(0, 24);
}

function validateQualificationReceipt(
  receipt,
  provider,
  family,
  registry,
  observedAt
) {
  invariant(
    provider.qualificationState !== 'unqualified',
    `provider ${provider.id} is unqualified; substitution is forbidden`
  );
  invariant(
    isRecord(receipt),
    `provider ${provider.id} needs a qualification receipt`
  );
  for (const field of registry.providerQualificationSchema.requiredFields) {
    invariant(
      receipt[field] !== undefined && receipt[field] !== null,
      `provider qualification receipt is missing ${field}`
    );
  }
  invariant(
    receipt.provider === provider.id,
    'qualification provider mismatch'
  );
  const modelEntry = modelRegistryEntries.get(receipt.modelRegistryEntryId);
  invariant(modelEntry, 'qualification model registry entry is unknown');
  invariant(
    modelEntry.provider === provider.id,
    'qualification model provider mismatch'
  );
  invariant(
    receipt.model === modelEntry.model,
    'qualification model identity mismatch'
  );
  invariant(
    JSON.stringify(receipt.modelCapabilities) ===
      JSON.stringify(modelEntry.capabilities),
    'qualification model capabilities do not match the registry'
  );
  for (const capability of family.providerEligibility
    .requiredModelCapabilities) {
    invariant(
      receipt.modelCapabilities.includes(capability),
      `model ${receipt.model} lacks required capability ${capability}`
    );
  }
  invariant(
    receipt.modelQuality === modelEntry.quality &&
      receipt.modelQuality >= family.providerEligibility.minimumQuality,
    `model ${receipt.model} is below the ${family.id} quality threshold`
  );
  invariant(
    receipt.costTier === modelEntry.cost_tier &&
      ['subscription-included', 'free-local'].includes(receipt.costTier),
    `model ${receipt.model} cost tier is not eligible for zero-spend audits`
  );
  invariant(
    receipt.modelIdentityVerified === true &&
      receipt.readBoundaryAcknowledged === true &&
      receipt.secretScanPassed === true &&
      receipt.customerDataExcluded === true &&
      receipt.structuredOutputPassed === true,
    `provider ${provider.id} qualification did not pass every fail-closed gate`
  );
  invariant(
    finiteNonNegative(receipt.costCapCents) &&
      receipt.costCapCents <= family.costBudget.maxSpendCents,
    'qualification cost cap is invalid'
  );
  invariant(
    receipt.fixtureEvalPassRate >=
      registry.providerQualificationSchema.minimumFixtureEvalPassRate,
    'provider fixture eval is below the qualification threshold'
  );
  const ageHours =
    (parseTimestamp(observedAt, 'finding observedAt') -
      parseTimestamp(receipt.authenticatedAt, 'qualified authenticatedAt')) /
    3_600_000;
  invariant(ageHours >= 0, 'qualification receipt is newer than the finding');
  invariant(
    ageHours <= registry.providerQualificationSchema.maximumReceiptAgeHours,
    'qualification receipt is stale'
  );
  return modelEntry;
}

function deterministicProbeReceiptDigest(probe) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: probe.id,
        command: probe.command,
        status: probe.status,
        summary: probe.summary,
        observedAt: probe.observedAt,
        exitCode: probe.exitCode,
        outputDigest: probe.outputDigest,
      })
    )
    .digest('hex');
}

function validateDeterministicProbeResults(results, family) {
  invariant(
    Array.isArray(results),
    'deterministic probe results must be an array'
  );
  const byId = new Map();
  const commands = new Set();
  for (const probe of results) {
    invariant(isRecord(probe), 'deterministic probe result must be an object');
    assertExactUniqueStrings(
      Object.keys(probe),
      [
        'id',
        'command',
        'status',
        'summary',
        'observedAt',
        'exitCode',
        'outputDigest',
        'receiptDigest',
      ],
      'deterministic probe result keys'
    );
    invariant(nonEmptyString(probe.id), 'probe id is required');
    invariant(!byId.has(probe.id), `duplicate probe id ${probe.id}`);
    invariant(nonEmptyString(probe.command), 'probe command is required');
    invariant(
      family.deterministicProbes.includes(probe.command),
      `probe ${probe.id} is not registered for ${family.id}`
    );
    invariant(
      !commands.has(probe.command),
      `duplicate probe command ${probe.command}`
    );
    invariant(
      ['passed', 'failed', 'observed'].includes(probe.status),
      `probe ${probe.id} has invalid status`
    );
    invariant(nonEmptyString(probe.summary), `probe ${probe.id} needs summary`);
    parseTimestamp(probe.observedAt, `probe ${probe.id} observedAt`);
    invariant(
      Number.isInteger(probe.exitCode) &&
        (probe.status === 'failed'
          ? probe.exitCode !== 0
          : probe.exitCode === 0),
      `probe ${probe.id} exit code does not match its status`
    );
    invariant(
      /^[a-f0-9]{64}$/.test(probe.outputDigest),
      `probe ${probe.id} output digest is invalid`
    );
    invariant(
      probe.receiptDigest === deterministicProbeReceiptDigest(probe),
      `probe ${probe.id} receipt digest is invalid`
    );
    byId.set(probe.id, probe);
    commands.add(probe.command);
  }
  return byId;
}

function validateResolution(resolution, observedAt) {
  invariant(isRecord(resolution), 'finding resolution must be an object');
  invariant(
    RESOLUTION_STATES.has(resolution.state),
    `invalid finding resolution ${resolution.state}`
  );
  invariant(nonEmptyString(resolution.reason), 'resolution reason is required');
  if (resolution.state === 'deferred-with-expiry') {
    invariant(
      parseTimestamp(resolution.expiresAt, 'resolution expiresAt') >
        parseTimestamp(observedAt, 'finding observedAt'),
      'deferred finding expiry must be after observation'
    );
    invariant(
      nonEmptyString(resolution.owner),
      'deferred finding needs an owner'
    );
  }
  if (resolution.state === 'blocked') {
    invariant(
      nonEmptyString(resolution.owner),
      'blocked finding needs an owner'
    );
    invariant(
      nonEmptyString(resolution.blocker),
      'blocked finding needs a concrete blocker'
    );
  }
}

export function validateFinding(
  finding,
  registry,
  coverageMap,
  deterministicProbeResults = []
) {
  invariant(isRecord(finding), 'finding must be an object');
  for (const field of registry.findingSchema.requiredFields) {
    invariant(finding[field] !== undefined, `finding is missing ${field}`);
  }
  const family = registry.auditFamilies.find(
    candidate => candidate.id === finding.familyId
  );
  invariant(family, `finding references unknown family ${finding.familyId}`);
  const partition = coverageMap.partitions.find(
    candidate => candidate.id === finding.partitionId
  );
  invariant(
    partition && partition.familyIds.includes(finding.familyId),
    `finding partition ${finding.partitionId} is not mapped to ${finding.familyId}`
  );
  invariant(nonEmptyString(finding.ruleId), 'finding ruleId is required');
  invariant(nonEmptyString(finding.title), 'finding title is required');
  invariant(nonEmptyString(finding.claim), 'finding claim is required');
  invariant(
    nonEmptyString(finding.primaryLocation),
    'finding primaryLocation is required'
  );
  invariant(SEVERITIES.has(finding.severity), 'finding severity is invalid');
  invariant(
    finiteNonNegative(finding.riskScore) && finding.riskScore <= 100,
    'finding riskScore must be between 0 and 100'
  );
  const minimumRisk =
    registry.findingSchema.severityLevels[finding.severity].minimumRiskScore;
  invariant(
    finding.riskScore >= minimumRisk,
    `finding riskScore is below the ${finding.severity} threshold`
  );
  parseTimestamp(finding.observedAt, 'finding observedAt');
  invariant(
    finding.fingerprint === computeFindingFingerprint(finding),
    'finding fingerprint does not match canonical deduplication material'
  );

  invariant(
    Array.isArray(finding.evidence) && finding.evidence.length > 0,
    'finding evidence must be non-empty'
  );
  let directEvidence = 0;
  for (const evidence of finding.evidence) {
    invariant(isRecord(evidence), 'evidence item must be an object');
    for (const field of registry.findingSchema.evidenceRequired
      .requiredItemFields) {
      invariant(evidence[field] !== undefined, `evidence is missing ${field}`);
    }
    invariant(
      registry.policy.proofTiers.includes(evidence.tier),
      `invalid evidence tier ${evidence.tier}`
    );
    invariant(
      family.evidenceSchema.requiredKinds.includes(evidence.kind),
      `evidence kind ${evidence.kind} is not allowed for ${family.id}`
    );
    invariant(
      typeof evidence.direct === 'boolean',
      'evidence direct is required'
    );
    invariant(nonEmptyString(evidence.locator), 'evidence locator is required');
    invariant(nonEmptyString(evidence.summary), 'evidence summary is required');
    parseTimestamp(evidence.observedAt, 'evidence observedAt');
    if (evidence.direct) directEvidence += 1;
  }
  invariant(
    directEvidence >=
      registry.findingSchema.evidenceRequired.minimumDirectItems,
    'finding lacks direct evidence'
  );

  invariant(isRecord(finding.source), 'finding source is required');
  invariant(
    ['deterministic', 'model'].includes(finding.source.kind),
    'finding source kind must be deterministic or model'
  );
  if (finding.source.kind === 'deterministic') {
    assertExactUniqueStrings(
      Object.keys(finding.source),
      ['kind', 'probeId', 'command', 'executionReceiptDigest'],
      'deterministic finding source keys'
    );
    const probeResults = validateDeterministicProbeResults(
      deterministicProbeResults,
      family
    );
    const probe = probeResults.get(finding.source.probeId);
    invariant(
      probe && ['passed', 'observed'].includes(probe.status),
      `deterministic source probe ${finding.source.probeId} did not execute successfully`
    );
    invariant(
      finding.source.command === probe.command &&
        finding.source.executionReceiptDigest === probe.receiptDigest,
      'deterministic finding source does not match its execution receipt'
    );
    invariant(
      parseTimestamp(probe.observedAt, 'probe observedAt') <=
        parseTimestamp(finding.observedAt, 'finding observedAt'),
      'deterministic probe is newer than the finding'
    );
  } else {
    assertExactUniqueStrings(
      Object.keys(finding.source),
      ['kind', 'provider', 'providerFamily', 'model', 'qualificationReceipt'],
      'model finding source keys'
    );
    const provider = registry.providerCatalog.find(
      candidate => candidate.id === finding.source.provider
    );
    invariant(provider, `unknown model provider ${finding.source.provider}`);
    invariant(
      family.providerEligibility.allowedProviders.includes(provider.id),
      `provider ${provider.id} is not eligible for ${family.id}`
    );
    invariant(
      finding.source.model === finding.source.qualificationReceipt?.model,
      'finding model does not match qualification receipt'
    );
    const modelEntry = validateQualificationReceipt(
      finding.source.qualificationReceipt,
      provider,
      family,
      registry,
      finding.observedAt
    );
    invariant(
      finding.source.providerFamily === modelEntry.family,
      'finding provider family does not match the model registry'
    );
    invariant(
      directEvidence > 0,
      'a model claim can never be the sole evidence'
    );
  }

  invariant(isRecord(finding.acceptance), 'finding acceptance is required');
  invariant(
    ACCEPTANCE_STATES.has(finding.acceptance.state),
    'finding acceptance state is invalid'
  );
  invariant(
    finding.acceptance.state !== 'candidate',
    'pilot output may not retain an unvalidated raw candidate'
  );
  invariant(
    nonEmptyString(finding.acceptance.validatedBy),
    'finding acceptance needs a validator'
  );
  validateResolution(finding.resolution, finding.observedAt);
  return finding;
}

function mergeEvidence(existing, incoming) {
  const byKey = new Map();
  for (const evidence of [...existing, ...incoming]) {
    const key = [
      evidence.tier,
      evidence.kind,
      evidence.locator,
      evidence.observedAt,
      evidence.summary,
    ].join('\n');
    byKey.set(key, evidence);
  }
  return [...byKey.values()];
}

function comparisonKey(finding) {
  return [
    finding.familyId,
    finding.partitionId,
    finding.ruleId,
    finding.primaryLocation,
  ].join(':');
}

export function normalizeFindings(
  findings,
  registry,
  coverageMap,
  deterministicProbeResults = []
) {
  invariant(Array.isArray(findings), 'findings must be an array');
  const deduped = new Map();
  for (const finding of findings) {
    validateFinding(finding, registry, coverageMap, deterministicProbeResults);
    const existing = deduped.get(finding.fingerprint);
    if (!existing) {
      deduped.set(finding.fingerprint, {
        ...finding,
        sourceRuns: [finding.source],
      });
      continue;
    }
    existing.evidence = mergeEvidence(existing.evidence, finding.evidence);
    existing.sourceRuns.push(finding.source);
  }

  const comparisonsByKey = new Map();
  for (const finding of findings.filter(item => item.source.kind === 'model')) {
    const key = comparisonKey(finding);
    const comparison = comparisonsByKey.get(key) ?? {
      comparisonKey: key,
      providers: new Set(),
      providerFamilies: new Set(),
      claims: new Set(),
      fingerprints: new Set(),
    };
    comparison.providers.add(finding.source.provider);
    comparison.providerFamilies.add(
      modelRegistryEntries.get(
        finding.source.qualificationReceipt.modelRegistryEntryId
      ).family
    );
    comparison.claims.add(normalizedClaim(finding.claim));
    comparison.fingerprints.add(finding.fingerprint);
    comparisonsByKey.set(key, comparison);
  }

  const comparisons = [...comparisonsByKey.values()].map(comparison => {
    const independentProviders = registry.selectionPolicy
      .sameProviderFamilyCountsAsIndependent
      ? comparison.providers.size
      : comparison.providerFamilies.size;
    return {
      comparisonKey: comparison.comparisonKey,
      providers: [...comparison.providers].sort(),
      independentProviderFamilies: independentProviders,
      fingerprints: [...comparison.fingerprints].sort(),
      status:
        independentProviders < 2
          ? 'insufficient-provider-diversity'
          : comparison.claims.size === 1
            ? 'agreement'
            : 'disagreement',
    };
  });

  const comparisonsById = new Map(
    comparisons.map(comparison => [comparison.comparisonKey, comparison])
  );
  for (const finding of deduped.values()) {
    if (
      finding.severity !== 'critical' ||
      !finding.sourceRuns.some(source => source.kind === 'model')
    ) {
      continue;
    }
    const comparison = comparisonsById.get(comparisonKey(finding));
    const requiredProviders =
      1 + registry.selectionPolicy.crossModelMinimumForCritical;
    invariant(
      comparison?.independentProviderFamilies >= requiredProviders,
      `critical model finding requires ${requiredProviders} independent provider families`
    );
  }

  return {
    findings: [...deduped.values()],
    comparisons,
  };
}

function validateEvidenceReceipt(evidence, registry, expectedTier) {
  invariant(isRecord(evidence), 'evidence item must be an object');
  invariant(
    evidence.tier === expectedTier,
    `proof evidence tier must be ${expectedTier}`
  );
  invariant(nonEmptyString(evidence.kind), 'proof evidence kind is required');
  invariant(evidence.direct === true, 'proof evidence must be direct');
  invariant(
    nonEmptyString(evidence.locator),
    'proof evidence locator is required'
  );
  invariant(
    nonEmptyString(evidence.summary),
    'proof evidence summary is required'
  );
  parseTimestamp(evidence.observedAt, 'proof evidence observedAt');
  invariant(
    registry.policy.proofTiers.includes(evidence.tier),
    `invalid proof evidence tier ${evidence.tier}`
  );
}

function validateProofTiers(proofTiers, registry) {
  invariant(isRecord(proofTiers), 'pilot proofTiers must be an object');
  assertExactUniqueStrings(
    Object.keys(proofTiers),
    registry.policy.proofTiers,
    'pilot proof tier keys'
  );
  for (const tier of registry.policy.proofTiers) {
    const receipt = proofTiers[tier];
    invariant(isRecord(receipt), `proof tier ${tier} must be an object`);
    invariant(
      registry.policy.proofTierStatuses.includes(receipt.status),
      `proof tier ${tier} has invalid status`
    );
    invariant(
      nonEmptyString(receipt.summary),
      `proof tier ${tier} needs summary`
    );
    invariant(
      Array.isArray(receipt.evidence),
      `proof tier ${tier} needs an evidence array`
    );
    if (
      ['verified', 'observed', 'availability-only'].includes(receipt.status)
    ) {
      invariant(
        receipt.evidence.length > 0,
        `proof tier ${tier} status ${receipt.status} needs evidence`
      );
      for (const evidence of receipt.evidence) {
        validateEvidenceReceipt(evidence, registry, tier);
      }
    }
  }
}

export function executionManifestDigest(input) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        pilot: input.pilot,
        deterministicProbeResults: input.deterministicProbeResults,
        proofTiers: input.proofTiers,
        findings: input.findings ?? [],
      })
    )
    .digest('hex');
}

function validateSafetyReceipt(receipt, registry, input) {
  invariant(isRecord(receipt), 'pilot safetyReceipt must be an object');
  const safetyFields = [
    'externalJobsCreated',
    'providerCredentialsChanged',
    'productionSettingsChanged',
    'customerDataTransferred',
    'secretMaterialTransferred',
    'incrementalModelSpendCents',
    'hyperagentUsed',
    'providerSubstitutionOccurred',
  ];
  assertExactUniqueStrings(
    Object.keys(receipt),
    [...safetyFields, 'observedAt', 'executionManifestDigest', 'evidence'],
    'pilot safety receipt keys'
  );
  invariant(
    parseTimestamp(receipt.observedAt, 'safety receipt observedAt') <=
      parseTimestamp(input.pilot.observedAt, 'pilot observedAt'),
    'safety receipt cannot be newer than the pilot'
  );
  invariant(
    Array.isArray(receipt.evidence) && receipt.evidence.length > 0,
    'safety receipt needs direct evidence'
  );
  for (const evidence of receipt.evidence) {
    validateEvidenceReceipt(evidence, registry, 'source');
  }
  const expectedDigest = executionManifestDigest(input);
  invariant(
    receipt.executionManifestDigest === expectedDigest &&
      receipt.evidence.some(
        evidence =>
          evidence.kind === 'execution-manifest' &&
          evidence.locator === `sha256:${expectedDigest}`
      ),
    'safety receipt is not bound to the execution manifest'
  );
  for (const field of safetyFields.filter(
    field => field !== 'incrementalModelSpendCents'
  )) {
    invariant(receipt[field] === false, `unsafe pilot safety field ${field}`);
  }
  invariant(
    receipt.incrementalModelSpendCents === 0,
    'pilot safety receipt must prove zero incremental model spend'
  );
  return {
    executionManifestDigest: expectedDigest,
    ...Object.fromEntries(safetyFields.map(field => [field, receipt[field]])),
  };
}

export function buildPilotReport(input, registry, coverageMap) {
  invariant(isRecord(input), 'pilot input must be an object');
  invariant(isRecord(input.pilot), 'pilot metadata is required');
  invariant(nonEmptyString(input.pilot.id), 'pilot id is required');
  invariant(
    registry.auditFamilies.some(family => family.id === input.pilot.familyId),
    'pilot family is unknown'
  );
  invariant(
    coverageMap.partitions.some(
      partition =>
        partition.id === input.pilot.partitionId &&
        partition.familyIds.includes(input.pilot.familyId)
    ),
    'pilot partition is not mapped to the pilot family'
  );
  parseTimestamp(input.pilot.observedAt, 'pilot observedAt');
  invariant(
    Array.isArray(input.deterministicProbeResults) &&
      input.deterministicProbeResults.length > 0,
    'pilot must include deterministic probe results'
  );
  const family = registry.auditFamilies.find(
    candidate => candidate.id === input.pilot.familyId
  );
  validateDeterministicProbeResults(input.deterministicProbeResults, family);
  validateProofTiers(input.proofTiers, registry);
  const safety = validateSafetyReceipt(input.safetyReceipt, registry, input);
  const normalized = normalizeFindings(
    input.findings ?? [],
    registry,
    coverageMap,
    input.deterministicProbeResults
  );
  return {
    schemaVersion: 1,
    generatedAt: input.pilot.observedAt,
    pilot: input.pilot,
    summary: {
      deterministicProbeCount: input.deterministicProbeResults.length,
      rawFindingCount: (input.findings ?? []).length,
      deduplicatedFindingCount: normalized.findings.length,
      disagreementCount: normalized.comparisons.filter(
        comparison => comparison.status === 'disagreement'
      ).length,
      unresolvedRawModelClaimCount: 0,
    },
    proofTiers: input.proofTiers,
    deterministicProbeResults: input.deterministicProbeResults,
    findings: normalized.findings,
    modelComparisons: normalized.comparisons,
    safety,
  };
}

async function loadAndValidate(registryPath, coveragePath) {
  const registry = validateRegistry(await loadJson(registryPath));
  const coverageMap = validateCoverageMap(
    await loadJson(coveragePath),
    registry
  );
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const trackedFiles = stdout.split('\0').filter(Boolean);
  const coverageInventory = validateTrackedCoverage(trackedFiles, coverageMap);
  return { registry, coverageMap, coverageInventory };
}

async function runCli() {
  const [command = 'validate', ...rawArgumentTokens] = process.argv.slice(2);
  const argumentTokens =
    rawArgumentTokens[0] === '--'
      ? rawArgumentTokens.slice(1)
      : rawArgumentTokens;
  const { values } = parseArgs({
    args: argumentTokens,
    options: {
      registry: { type: 'string', default: defaultRegistryPath },
      coverage: { type: 'string', default: defaultCoveragePath },
      input: { type: 'string' },
      out: { type: 'string' },
      'as-of': { type: 'string' },
      changed: { type: 'string', multiple: true, default: [] },
      family: { type: 'string' },
      limit: { type: 'string', default: '10' },
    },
    allowPositionals: false,
  });
  const registryPath = path.resolve(values.registry);
  const coveragePath = path.resolve(values.coverage);
  const { registry, coverageMap, coverageInventory } = await loadAndValidate(
    registryPath,
    coveragePath
  );

  if (command === 'validate') {
    process.stdout.write(
      `${JSON.stringify(
        {
          valid: true,
          registryId: registry.registryId,
          familyCount: registry.auditFamilies.length,
          partitionCount: coverageMap.partitions.length,
          auditedTrackedFileCount: coverageInventory.auditedFileCount,
          unmappedTrackedFileCount: coverageInventory.unmappedFileCount,
          hyperagent: 'unqualified-fail-closed',
          schedule: registry.policy.externalScheduleStatus,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (command === 'plan') {
    const limit = Number.parseInt(values.limit, 10);
    invariant(Number.isInteger(limit) && limit > 0, '--limit must be positive');
    const plan = buildCoveragePlan(coverageMap, {
      asOf: values['as-of'] ?? new Date().toISOString(),
      changedFiles: values.changed,
      familyId: values.family ?? null,
      selectionPolicy: registry.selectionPolicy,
    }).slice(0, limit);
    process.stdout.write(`${JSON.stringify({ plan }, null, 2)}\n`);
    return;
  }

  if (command === 'pilot') {
    invariant(values.input, 'pilot requires --input');
    const input = await loadJson(path.resolve(values.input));
    const report = buildPilotReport(input, registry, coverageMap);
    const output = `${JSON.stringify(report, null, 2)}\n`;
    if (values.out) {
      const outputPath = path.resolve(values.out);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, output, 'utf8');
    } else {
      process.stdout.write(output);
    }
    return;
  }

  throw new Error(`unknown continuous audit command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
