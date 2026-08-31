/**
 * Comparative outcome quality bar for Jovie components (JOV-5438 / JOV-5452).
 *
 * Public references are outcome/concept inputs only. Evaluation is source-blind
 * and consumes rendered/behavioral observations, never third-party source.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './component-ship-policy.mjs';
import {
  COMPARATIVE_DELIBERATE_RED_FIXTURES,
  COMPARATIVE_QUALIFICATION_CONTROLS,
  DELIBERATE_RED_CONTRACTS,
} from './lib/component-comparative-quality-bar-controls.mjs';
import {
  evaluateComparativeSample,
  isComparativeObject,
  validateDimensionRequirements,
} from './lib/component-comparative-quality-bar-evaluator.mjs';
import {
  discoverAtomMoleculeInventory,
  evaluateAtomMoleculeInventory,
  proposeAtomMoleculeInventoryRatchet,
  validateAtomMoleculeInventoryMetadata,
} from './lib/component-comparative-quality-bar-inventory.mjs';
import {
  ATOM_MOLECULE_INVENTORY_RATCHET,
  COMPARATIVE_QUALITY_BAR,
  COMPARATIVE_QUALITY_BAR_SCHEMA,
  QUALITY_BAR_BATCHES,
  QUALITY_BAR_CONTEXTS,
  QUALITY_BAR_DIMENSIONS,
  QUALITY_BAR_REFERENCES,
} from './lib/component-comparative-quality-bar-registry.mjs';

export {
  ATOM_MOLECULE_INVENTORY_RATCHET,
  COMPARATIVE_DELIBERATE_RED_FIXTURES,
  COMPARATIVE_QUALIFICATION_CONTROLS,
  COMPARATIVE_QUALITY_BAR,
  COMPARATIVE_QUALITY_BAR_SCHEMA,
  DELIBERATE_RED_CONTRACTS,
  discoverAtomMoleculeInventory,
  evaluateAtomMoleculeInventory,
  evaluateComparativeSample,
  proposeAtomMoleculeInventoryRatchet,
  QUALITY_BAR_BATCHES,
  QUALITY_BAR_CONTEXTS,
  QUALITY_BAR_DIMENSIONS,
  QUALITY_BAR_REFERENCES,
  validateAtomMoleculeInventoryMetadata,
  validateDimensionRequirements,
};

const DIMENSION_SET = new Set(QUALITY_BAR_DIMENSIONS);
const CONTEXT_SET = new Set(QUALITY_BAR_CONTEXTS);
const BATCH_SET = new Set(QUALITY_BAR_BATCHES);
const DISPOSITIONS = new Set(['keep', 'improve', 'diverge']);
const LAYERS = new Set(['atom', 'molecule', 'system']);
const REFERENCE_BOUNDARIES = new Set([
  'outcome-reference-only',
  'concept-and-test-dimension-only',
]);
const BASELINE_BY_ID = new Map(
  COMPARATIVE_QUALITY_BAR.map(baseline => [baseline.id, baseline])
);
const CONTRACT_BY_FIXTURE_ID = new Map(
  DELIBERATE_RED_CONTRACTS.map(contract => [contract.fixtureId, contract])
);
const REGISTRY_SOURCE_PATH =
  'scripts/lib/component-comparative-quality-bar-registry.mjs';
const TRUSTED_BASE_CACHE = new Map();
const TRUSTED_REGISTRY_READER = `
let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) source += chunk;
const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const registry = await import(url);
// biome-ignore format: keep the trusted provenance snapshot adjacent to its baseline.
process.stdout.write(JSON.stringify(registry.COMPARATIVE_QUALITY_BAR.map(item => ({ ...item, trustedReference: registry.QUALITY_BAR_REFERENCES[item.referenceId] }))));
`;

const unique = values => [...new Set(values)];

export function resolveTrustedBaseEnrollment(repoRoot = REPO_ROOT) {
  if (TRUSTED_BASE_CACHE.has(repoRoot)) {
    return TRUSTED_BASE_CACHE.get(repoRoot);
  }
  let result;
  try {
    const ref = execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      throw new Error('trusted base did not resolve to a commit');
    }
    const source = execFileSync(
      'git',
      ['show', `${ref}:${REGISTRY_SOURCE_PATH}`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const baselines = JSON.parse(
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', TRUSTED_REGISTRY_READER],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          input: source,
          maxBuffer: 2 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      )
    );
    if (!Array.isArray(baselines) || baselines.length === 0) {
      throw new Error('trusted base comparative enrollment is empty');
    }
    result = { ok: true, ref, baselines };
  } catch (error) {
    result = {
      ok: false,
      ref: null,
      baselines: [],
      issue: `trusted base comparative enrollment is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  TRUSTED_BASE_CACHE.set(repoRoot, result);
  return result;
}

// biome-ignore format: keep the trust direction explicit at the comparison boundary.
function trustedBaselineIdentity(baseline, includeEnrollmentBatch = true, fromTrusted = false) {
  if (!isComparativeObject(baseline) || typeof baseline.id !== 'string') {
    return null;
  }
  const identity = {
    id: baseline.id,
    layer: baseline.layer,
    owner: baseline.owner,
    referenceId: baseline.referenceId,
    referenceUrl: baseline.referenceUrl,
    nearestPattern: baseline.nearestPattern,
    disposition: baseline.disposition,
    reference: fromTrusted
      ? baseline.trustedReference
      : QUALITY_BAR_REFERENCES[baseline.referenceId],
  };
  if (includeEnrollmentBatch) {
    identity.enrollmentBatch = baseline.enrollmentBatch;
  }
  return JSON.stringify(identity);
}

function trustedRequirementHolds(key, trusted, current) {
  if (Array.isArray(trusted)) {
    return (
      Array.isArray(current) && trusted.every(item => current.includes(item))
    );
  }
  if (typeof trusted === 'number') {
    if (typeof current !== 'number' || !Number.isFinite(current)) return false;
    if (key.startsWith('min')) return current >= trusted;
    if (key.startsWith('max')) return current <= trusted;
  }
  return current === trusted;
}

function trustedBaselineIssues(trustedBaselines, ref) {
  const issues = [];
  const currentById = new Map(
    COMPARATIVE_QUALITY_BAR.map(baseline => [baseline.id, baseline])
  );
  for (const trusted of trustedBaselines) {
    const locksEnrollmentBatch = typeof trusted?.enrollmentBatch === 'string';
    const trustedIdentity = trustedBaselineIdentity(
      trusted,
      locksEnrollmentBatch,
      true
    );
    if (!trustedIdentity) {
      issues.push(
        'trusted base comparative enrollment contains a malformed baseline'
      );
      continue;
    }
    const current = currentById.get(trusted.id);
    if (!current) {
      issues.push(
        `comparative enrollment may grow but not shrink against trusted base ${ref}: removed ${trusted.id}`
      );
      continue;
    }
    if (
      trustedBaselineIdentity(current, locksEnrollmentBatch) !== trustedIdentity
    ) {
      issues.push(
        `${trusted.id}: trusted baseline identity is immutable against ${ref}`
      );
    }
    const arrayWeakened = [
      [trusted.contexts, current.contexts],
      [trusted.requiredDimensions, current.requiredDimensions],
    ].some(
      ([before, after]) =>
        !Array.isArray(before) ||
        !Array.isArray(after) ||
        before.some(item => !after.includes(item))
    );
    const requirementWeakened = Object.entries(trusted.requirements ?? {}).some(
      ([key, value]) =>
        !trustedRequirementHolds(key, value, current.requirements?.[key])
    );
    if (arrayWeakened || requirementWeakened) {
      issues.push(`${trusted.id}: trusted baseline contract was weakened`);
    }
  }
  return issues;
}

export function validateComparativeQualityBar(repoRoot = REPO_ROOT) {
  const issues = [];
  const ids = new Set();
  const sources = new Set();
  for (const baseline of COMPARATIVE_QUALITY_BAR) {
    if (ids.has(baseline.id))
      issues.push(`duplicate baseline id: ${baseline.id}`);
    ids.add(baseline.id);
    if (sources.has(baseline.owner.sourcePath))
      issues.push(`duplicate baseline owner: ${baseline.owner.sourcePath}`);
    sources.add(baseline.owner.sourcePath);
    if (!LAYERS.has(baseline.layer))
      issues.push(`${baseline.id}: invalid component layer`);
    const canonicalPrefix =
      baseline.layer === 'system' ? 'typography.' : `${baseline.layer}.`;
    if (!baseline.id.startsWith(canonicalPrefix))
      issues.push(`${baseline.id}: id must use its canonical layer prefix`);
    if (!existsSync(join(repoRoot, baseline.owner.sourcePath)))
      issues.push(`${baseline.id}: owner source does not exist`);
    if (!DISPOSITIONS.has(baseline.disposition))
      issues.push(`${baseline.id}: invalid disposition`);
    if (!BATCH_SET.has(baseline.enrollmentBatch))
      issues.push(`${baseline.id}: invalid enrollment batch`);
    if (
      baseline.enrolled !== true ||
      !Array.isArray(baseline.contexts) ||
      baseline.contexts.length === 0 ||
      unique(baseline.contexts).length !== baseline.contexts.length ||
      baseline.contexts.some(context => !CONTEXT_SET.has(context))
    ) {
      issues.push(`${baseline.id}: unknown Jovie product context`);
    }
    if (
      typeof baseline.nearestPattern !== 'string' ||
      baseline.nearestPattern.trim().length === 0
    ) {
      issues.push(`${baseline.id}: nearest comparison pattern is missing`);
    }
    if (
      typeof baseline.referenceUrl !== 'string' ||
      !baseline.referenceUrl.startsWith('https://')
    ) {
      issues.push(`${baseline.id}: public reference URL is missing`);
    }
    if (
      !Array.isArray(baseline.requiredDimensions) ||
      baseline.requiredDimensions.length === 0 ||
      unique(baseline.requiredDimensions).length !==
        baseline.requiredDimensions.length ||
      baseline.requiredDimensions.some(
        dimension => !DIMENSION_SET.has(dimension)
      )
    ) {
      issues.push(`${baseline.id}: invalid required dimensions`);
    } else {
      for (const dimension of baseline.requiredDimensions) {
        issues.push(...validateDimensionRequirements(baseline, dimension));
      }
    }
    const reference = QUALITY_BAR_REFERENCES[baseline.referenceId];
    if (
      !reference ||
      reference.license.spdx !== 'MIT' ||
      !reference.license.url.startsWith('https://') ||
      reference.sourceImported !== false ||
      !REFERENCE_BOUNDARIES.has(reference.useBoundary)
    ) {
      issues.push(`${baseline.id}: provenance/license boundary is incomplete`);
    }
  }

  const contractBaselineIds = DELIBERATE_RED_CONTRACTS.map(
    contract => contract.baselineId
  );
  const contractFixtureIds = DELIBERATE_RED_CONTRACTS.map(
    contract => contract.fixtureId
  );
  if (
    unique(contractBaselineIds).length !== contractBaselineIds.length ||
    unique(contractFixtureIds).length !== contractFixtureIds.length
  ) {
    issues.push(
      'deliberate-red contracts require unique baseline and fixture ids'
    );
  }
  for (const contract of DELIBERATE_RED_CONTRACTS) {
    const fingerprintKeys = Array.isArray(contract.fingerprints)
      ? contract.fingerprints.map(
          fingerprint => `${fingerprint?.dimension}\u0000${fingerprint?.code}`
        )
      : [];
    if (
      !Array.isArray(contract.fingerprints) ||
      contract.fingerprints.length === 0 ||
      unique(fingerprintKeys).length !== fingerprintKeys.length ||
      contract.fingerprints.some(
        fingerprint =>
          !isComparativeObject(fingerprint) ||
          !DIMENSION_SET.has(fingerprint.dimension) ||
          typeof fingerprint.code !== 'string' ||
          fingerprint.code.length === 0
      )
    ) {
      issues.push(
        `${contract.fixtureId}: deliberate-red contract requires valid regression fingerprints`
      );
    }
  }
  for (const baseline of COMPARATIVE_QUALITY_BAR.filter(
    item => item.enrolled
  )) {
    const count = contractBaselineIds.filter(id => id === baseline.id).length;
    if (count !== 1) {
      issues.push(
        `${baseline.id}: enrolled baseline requires exactly one deliberate-red contract; found ${count}`
      );
    }
  }
  return issues;
}

export function validateApprovedOutcomeAlignment(entries) {
  if (!Array.isArray(entries)) {
    return ['approved Shadcn outcome entries are not an array; fail closed'];
  }
  const issues = [];
  const enrolled = entries.filter(entry => entry?.enrolled === true);
  const byId = new Map(enrolled.map(entry => [entry?.id, entry]));
  if (byId.size !== enrolled.length) {
    issues.push('approved Shadcn outcome entries require unique ids');
  }
  const comparativeIds = COMPARATIVE_QUALITY_BAR.map(entry => entry.id).sort();
  const outcomeIds = [...byId.keys()].filter(Boolean).sort();
  if (comparativeIds.join('\n') !== outcomeIds.join('\n')) {
    issues.push(
      'approved Shadcn outcome ids differ from the comparative registry'
    );
  }
  for (const baseline of COMPARATIVE_QUALITY_BAR) {
    const approved = byId.get(baseline.id);
    if (!approved) continue;
    const contexts = Array.isArray(approved.productContexts)
      ? [...approved.productContexts].sort()
      : [];
    if (
      approved.source !== baseline.owner.sourcePath ||
      approved.layer !== baseline.layer ||
      approved.disposition !== baseline.disposition ||
      approved.enrollmentBatch !== baseline.enrollmentBatch ||
      contexts.join('\n') !== [...baseline.contexts].sort().join('\n')
    ) {
      issues.push(
        `${baseline.id}: approved Shadcn outcome contradicts the comparative registry`
      );
    }
  }
  return issues;
}

const receiptFor = (sample, result) => ({
  id:
    isComparativeObject(sample) && typeof sample.id === 'string'
      ? sample.id
      : null,
  baselineId:
    isComparativeObject(sample) && typeof sample.baselineId === 'string'
      ? sample.baselineId
      : null,
  verdict: result.ok ? 'pass' : 'block',
  findings: result.findings,
});

function hasExactRedFingerprints(receipt, contract) {
  if (
    !contract ||
    receipt.baselineId !== contract.baselineId ||
    !Array.isArray(contract.fingerprints) ||
    contract.fingerprints.length === 0
  ) {
    return false;
  }
  const fingerprintKey = item => `${item.dimension}\u0000${item.code}`;
  const expected = contract.fingerprints.map(fingerprintKey).sort();
  const actual = receipt.findings.map(fingerprintKey).sort();
  return (
    expected.length === actual.length &&
    expected.every((fingerprint, index) => fingerprint === actual[index])
  );
}

function resolveSamplesOption(value, defaults, issue, issues) {
  if (value === undefined) return defaults;
  if (Array.isArray(value)) return value;
  issues.push(issue);
  return [];
}

export function runComparativeQualityBar(options = {}) {
  const optionsValid = isComparativeObject(options);
  const resolvedOptions = optionsValid ? options : {};
  const repoRoot = resolvedOptions.repoRoot ?? REPO_ROOT;
  const issues = validateComparativeQualityBar(repoRoot);
  if (!optionsValid) {
    issues.push(
      'comparative quality bar options must be an object; fail closed'
    );
  }
  if (resolvedOptions.approvedOutcomeEntries !== undefined) {
    issues.push(
      ...validateApprovedOutcomeAlignment(
        resolvedOptions.approvedOutcomeEntries
      )
    );
  }
  const redFixtures = resolveSamplesOption(
    resolvedOptions.redFixtures,
    COMPARATIVE_DELIBERATE_RED_FIXTURES,
    'supplied deliberate-red fixtures must be an array',
    issues
  );
  const qualificationControls = resolveSamplesOption(
    resolvedOptions.qualificationControls,
    COMPARATIVE_QUALIFICATION_CONTROLS,
    'supplied qualification controls must be an array',
    issues
  );

  const inventory = resolveSamplesOption(
    resolvedOptions.inventory,
    discoverAtomMoleculeInventory(repoRoot),
    'supplied atom/molecule inventory must be an array',
    issues
  );
  const trustedBaseEnrollment =
    resolvedOptions.trustedBaseEnrollment === undefined
      ? resolveTrustedBaseEnrollment(repoRoot)
      : resolvedOptions.trustedBaseEnrollment;
  if (
    !isComparativeObject(trustedBaseEnrollment) ||
    trustedBaseEnrollment.ok !== true ||
    typeof trustedBaseEnrollment.ref !== 'string' ||
    !Array.isArray(trustedBaseEnrollment.baselines)
  ) {
    issues.push(
      isComparativeObject(trustedBaseEnrollment) &&
        typeof trustedBaseEnrollment.issue === 'string'
        ? trustedBaseEnrollment.issue
        : 'trusted base comparative enrollment is malformed; fail closed'
    );
  } else {
    issues.push(
      ...trustedBaselineIssues(
        trustedBaseEnrollment.baselines,
        trustedBaseEnrollment.ref
      )
    );
  }
  const inventoryRatchet = evaluateAtomMoleculeInventory(inventory);
  issues.push(...inventoryRatchet.issues);
  if (inventory.length === 0) {
    issues.push('atom/molecule inventory is empty; fail closed');
  }
  if (inventory.some(item => !isComparativeObject(item))) {
    issues.push('atom/molecule inventory contains a malformed entry');
  }
  if (
    new Set(inventory.map(item => item?.sourcePath)).size !== inventory.length
  ) {
    issues.push('atom/molecule inventory contains duplicate source paths');
  }
  issues.push(...validateAtomMoleculeInventoryMetadata(inventory));
  for (const baseline of COMPARATIVE_QUALITY_BAR.filter(item =>
    ['atom', 'molecule'].includes(item.layer)
  )) {
    const matches = inventory.filter(
      item =>
        isComparativeObject(item) &&
        item.sourcePath === baseline.owner.sourcePath &&
        item.layer === baseline.layer &&
        item.baselineId === baseline.id &&
        item.comparisonStatus === 'rubric-enrolled'
    );
    if (matches.length !== 1) {
      issues.push(
        `${baseline.id}: rubric enrollment must resolve to exactly one inventory entry; found ${matches.length}`
      );
    }
  }

  if (redFixtures.length === 0) {
    issues.push('deliberate-red fixture set is empty; fail closed');
  }
  const redCounts = new Map();
  for (const fixture of redFixtures) {
    const id = isComparativeObject(fixture) ? fixture.id : undefined;
    redCounts.set(id, (redCounts.get(id) ?? 0) + 1);
  }
  for (const contract of DELIBERATE_RED_CONTRACTS) {
    const count = redCounts.get(contract.fixtureId) ?? 0;
    if (count !== 1) {
      issues.push(
        `${contract.fixtureId}: deliberate-red contract requires exactly one fixture; found ${count}`
      );
    }
  }

  const enrolledIds = COMPARATIVE_QUALITY_BAR.filter(
    baseline => baseline.enrolled
  ).map(baseline => baseline.id);
  const controlCounts = new Map();
  const controlIdCounts = new Map();
  for (const control of qualificationControls) {
    const baselineId = isComparativeObject(control)
      ? control.baselineId
      : undefined;
    const controlId = isComparativeObject(control) ? control.id : undefined;
    controlCounts.set(baselineId, (controlCounts.get(baselineId) ?? 0) + 1);
    controlIdCounts.set(controlId, (controlIdCounts.get(controlId) ?? 0) + 1);
    if (typeof controlId !== 'string' || controlId.length === 0) {
      issues.push('qualification control requires a non-empty canonical id');
    }
    if (
      typeof baselineId === 'string' &&
      BASELINE_BY_ID.has(baselineId) &&
      controlId !== `qualification-control.${baselineId}`
    ) {
      issues.push(
        `${String(controlId)}: qualification control id must be qualification-control.${baselineId}`
      );
    }
  }
  for (const [controlId, count] of controlIdCounts) {
    if (count > 1)
      issues.push(`${String(controlId)}: duplicate qualification control id`);
  }
  for (const baselineId of enrolledIds) {
    const count = controlCounts.get(baselineId) ?? 0;
    if (count !== 1) {
      issues.push(
        `${baselineId}: enrolled baseline requires exactly one qualification control; found ${count}`
      );
    }
  }
  for (const [baselineId] of controlCounts) {
    if (!BASELINE_BY_ID.has(baselineId)) {
      issues.push(
        `${String(baselineId)}: qualification control has no baseline`
      );
    }
  }

  const redReceipts = redFixtures.map(fixture => {
    const receipt = receiptFor(fixture, evaluateComparativeSample(fixture));
    const contract = CONTRACT_BY_FIXTURE_ID.get(receipt.id);
    if (
      receipt.verdict !== 'block' ||
      !hasExactRedFingerprints(receipt, contract)
    ) {
      issues.push(
        `${receipt.id ?? 'unknown fixture'}: deliberate-red fixture must block with its approved regression fingerprints`
      );
    }
    return receipt;
  });
  const qualificationReceipts = qualificationControls.map(control => {
    const receipt = receiptFor(control, evaluateComparativeSample(control));
    if (receipt.verdict !== 'pass')
      issues.push(
        `${receipt.id ?? 'unknown control'}: comparative quality bar blocked`
      );
    return receipt;
  });

  const ok = issues.length === 0;
  return {
    ok,
    receipt: {
      schema: COMPARATIVE_QUALITY_BAR_SCHEMA,
      ok,
      issues,
      claimBoundary: 'rubric-and-evaluator-qualification-only',
      liveVisualCertification: {
        status: 'not-started',
        certified: 0,
        requires: [
          'rendered observations from the exact Jovie context',
          'exact CI receipt',
          'founder-approved live review diff',
        ],
      },
      provenance: QUALITY_BAR_REFERENCES,
      trustedBaseEnrollment: {
        ref: trustedBaseEnrollment?.ref ?? null,
        requiredIds: Array.isArray(trustedBaseEnrollment?.baselines)
          ? trustedBaseEnrollment.baselines.map(baseline => baseline?.id)
          : [],
      },
      enrollmentBatches: QUALITY_BAR_BATCHES.map(id => ({
        id,
        baselineIds: COMPARATIVE_QUALITY_BAR.filter(
          baseline => baseline.enrollmentBatch === id
        ).map(baseline => baseline.id),
      })),
      inventory: {
        roots: inventoryRatchet.roots,
        total: inventory.length,
        rubricEnrolled: inventory.filter(
          item => item?.comparisonStatus === 'rubric-enrolled'
        ).length,
        pendingComparison: inventory.filter(
          item => item?.comparisonStatus === 'pending-comparison'
        ).length,
        entries: inventory,
      },
      benchmark: COMPARATIVE_QUALITY_BAR.map(baseline => ({
        id: baseline.id,
        enrollmentBatch: baseline.enrollmentBatch,
        owner: baseline.owner,
        nearestPattern: baseline.nearestPattern,
        disposition: baseline.disposition,
        contexts: baseline.contexts,
        requiredDimensions: baseline.requiredDimensions,
        certificationStatus: 'awaiting-live-evidence',
      })),
      fixtures: redReceipts,
      qualificationControls: qualificationReceipts,
    },
  };
}

const isMain =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes('--print-inventory-ratchet')) {
  console.log(JSON.stringify(proposeAtomMoleculeInventoryRatchet(), null, 2));
}
