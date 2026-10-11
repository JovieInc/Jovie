import fs from 'node:fs';
import path from 'node:path';
import {
  DESKTOP_DOGFOOD_INSPECTION_DIMENSIONS,
  expandDesktopDogfoodInventory,
} from './desktop-dogfood-inventory.mjs';

export const DESKTOP_DOGFOOD_SCHEMA = 'jovie-desktop-dogfood/v1';
export const DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA =
  'jovie-desktop-dogfood-observations/v1';

const DISPOSITIONS = new Set([
  'not-visited',
  'tested-pass',
  'tested-fail',
  'blocked',
  'not-applicable',
]);
const INSPECTION_RESULTS = new Set(['pass', 'fail', 'not-applicable']);
const SHA = /^[0-9a-f]{40}$/u;
const PRODUCTION_VERSION = /^\d+\.\d+\.\d+$/u;
const STAGING_VERSION = /^\d+\.\d+\.\d+-staging\.[1-9]\d*\.[1-9]\d*$/u;
const ISSUE_DISPOSITIONS = new Set(['existing', 'new']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function coverageKey(surface, state) {
  return `${surface}::${state}`;
}

export function parsePackagedDesktopIdentity(value) {
  if (!isObject(value)) return null;
  const { channel, version, sourceRevision, builtAt } = value;
  if (!['production', 'staging'].includes(channel)) return null;
  const versionMatches =
    channel === 'production'
      ? PRODUCTION_VERSION.test(version)
      : STAGING_VERSION.test(version);
  if (!nonEmptyString(version) || !versionMatches) return null;
  if (!nonEmptyString(sourceRevision) || !SHA.test(sourceRevision)) return null;
  if (
    !nonEmptyString(builtAt) ||
    Number.isNaN(Date.parse(builtAt)) ||
    new Date(builtAt).toISOString() !== builtAt
  )
    return null;
  return {
    channel,
    version,
    sourceRevision,
    builtAt: new Date(builtAt).toISOString(),
    provenance: 'verified',
  };
}

export function validateObservations(input, outputDir) {
  if (!isObject(input)) throw new Error('observations must be an object');
  if (input.schema !== DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA) {
    throw new Error(
      `observations schema must be ${DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA}`
    );
  }
  if (!Array.isArray(input.observations)) {
    throw new Error('observations must contain an observations array');
  }

  const inventoryKeys = new Set(
    expandDesktopDogfoodInventory().map(item =>
      coverageKey(item.surface, item.state)
    )
  );
  const seen = new Set();
  const errors = [];

  for (const [index, observation] of input.observations.entries()) {
    if (!isObject(observation)) {
      errors.push(`observation ${index} must be an object`);
      continue;
    }
    const key = coverageKey(observation.surface, observation.state);
    if (!inventoryKeys.has(key)) {
      errors.push(`observation ${index} targets unknown ${key}`);
      continue;
    }
    if (seen.has(key)) errors.push(`duplicate observation for ${key}`);
    seen.add(key);
    if (!DISPOSITIONS.has(observation.disposition)) {
      errors.push(`observation ${key} has an invalid disposition`);
      continue;
    }
    if (
      ['blocked', 'not-applicable'].includes(observation.disposition) &&
      !nonEmptyString(observation.reason)
    ) {
      errors.push(`${key} requires a reason for ${observation.disposition}`);
    }
    if (
      observation.disposition === 'blocked' &&
      !nonEmptyString(observation.owner)
    ) {
      errors.push(`${key} requires an owner when blocked`);
    }
    if (observation.disposition.startsWith('tested-')) {
      validateTestedObservation(observation, key, outputDir, errors);
    }
    if (
      observation.disposition === 'tested-fail' &&
      (!nonEmptyString(observation.canonicalIssue) ||
        !nonEmptyString(observation.dedupeDecision) ||
        !ISSUE_DISPOSITIONS.has(observation.issueDisposition))
    ) {
      errors.push(
        `${key} requires canonicalIssue, dedupeDecision, and issueDisposition when tested-fail`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`invalid observations:\n- ${errors.join('\n- ')}`);
  }
  return input.observations;
}

function validateTestedObservation(observation, key, outputDir, errors) {
  if (
    !Array.isArray(observation.evidence) ||
    observation.evidence.length === 0
  ) {
    errors.push(`${key} requires app-owned evidence when tested`);
  } else {
    for (const evidence of observation.evidence) {
      if (!nonEmptyString(evidence) || path.isAbsolute(evidence)) {
        errors.push(`${key} evidence must be a relative artifact path`);
        continue;
      }
      const resolved = path.resolve(outputDir, evidence);
      const relative = path.relative(outputDir, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        errors.push(`${key} evidence escapes the output directory`);
      } else if (!fs.existsSync(resolved)) {
        errors.push(`${key} evidence does not exist: ${evidence}`);
      }
    }
  }

  if (!isObject(observation.inspection)) {
    errors.push(`${key} requires the composed-app inspection checklist`);
    return;
  }
  for (const dimension of DESKTOP_DOGFOOD_INSPECTION_DIMENSIONS) {
    const result = observation.inspection[dimension];
    if (!isObject(result) || !INSPECTION_RESULTS.has(result.result)) {
      errors.push(`${key} inspection missing ${dimension}`);
      continue;
    }
    if (result.result === 'not-applicable' && !nonEmptyString(result.reason)) {
      errors.push(`${key} ${dimension} requires a not-applicable reason`);
    }
  }
}

export function createCoverageLedger({ observations = [], accountRole }) {
  const byKey = new Map(
    observations.map(observation => [
      coverageKey(observation.surface, observation.state),
      observation,
    ])
  );

  return expandDesktopDogfoodInventory().map(item => {
    const observation = byKey.get(coverageKey(item.surface, item.state));
    if (observation) return { ...item, ...observation };
    if (
      item.scope === 'operator' &&
      nonEmptyString(accountRole) &&
      !['operator', 'admin', 'founder'].includes(accountRole)
    ) {
      return {
        ...item,
        disposition: 'not-applicable',
        reason: `operator-only surface; authorized account role is ${accountRole}`,
      };
    }
    return { ...item, disposition: 'not-visited' };
  });
}

export function summarizeCoverage(ledger) {
  const counts = Object.fromEntries([...DISPOSITIONS].map(key => [key, 0]));
  const surfaceDispositions = new Map();
  for (const row of ledger) {
    counts[row.disposition] += 1;
    const current = surfaceDispositions.get(row.surface) ?? [];
    current.push(row.disposition);
    surfaceDispositions.set(row.surface, current);
  }
  const applicable = ledger.length - counts['not-applicable'];
  const tested = counts['tested-pass'] + counts['tested-fail'];
  return {
    totalScreens: surfaceDispositions.size,
    totalStates: ledger.length,
    applicableStates: applicable,
    testedStates: tested,
    testedPass: counts['tested-pass'],
    testedFail: counts['tested-fail'],
    blocked: counts.blocked,
    notVisited: counts['not-visited'],
    notApplicable: counts['not-applicable'],
  };
}

export function buildDesktopDogfoodReport(input) {
  const summary = summarizeCoverage(input.coverage);
  const crashes = input.crashes ?? [];
  const runnerVerified = input.session.runnerStatus === 'verified';
  const verdict = !runnerVerified
    ? 'queued'
    : summary.testedFail > 0 || crashes.length > 0
      ? 'fail'
      : summary.notVisited > 0 || summary.blocked > 0
        ? 'inconclusive'
        : 'pass';
  const findings = input.coverage
    .filter(row => row.disposition === 'tested-fail')
    .map(row => ({
      surface: row.surface,
      state: row.state,
      canonicalIssue: row.canonicalIssue,
      issueDisposition: row.issueDisposition,
      dedupeDecision: row.dedupeDecision,
      evidence: row.evidence,
      repairStage: row.repairStage ?? 'issue-updated',
      pullRequest: row.pullRequest ?? null,
      nativeRetest: row.nativeRetest ?? 'not-run',
      humanDecisionNeeded: row.humanDecisionNeeded === true,
    }));
  const uniqueIssues = new Map();
  for (const finding of findings) {
    if (!uniqueIssues.has(finding.canonicalIssue)) {
      uniqueIssues.set(finding.canonicalIssue, finding);
    }
  }
  const roots = [...uniqueIssues.values()];
  const pullRequests = new Set(
    findings.map(finding => finding.pullRequest).filter(Boolean)
  );

  return {
    schema: DESKTOP_DOGFOOD_SCHEMA,
    issue: 'JOV-6506',
    generatedAt: input.generatedAt,
    verdict,
    runnerStatus: runnerVerified ? 'verified' : 'runner-unverified',
    runnerBlockerCount: Array.isArray(input.session.blockers)
      ? input.session.blockers.length
      : 0,
    session: input.session,
    nativeBuild: input.nativeBuild ?? null,
    hostedWeb: input.hostedWeb ?? null,
    coverageSummary: summary,
    coverage: input.coverage,
    defectSummary: {
      uniqueRootCauses: roots.length,
      existingIssuesUpdated: roots.filter(
        finding => finding.issueDisposition === 'existing'
      ).length,
      genuinelyNewIssues: roots.filter(
        finding => finding.issueDisposition === 'new'
      ).length,
      pullRequests: pullRequests.size,
      fixesNativeReverified: roots.filter(
        finding => finding.nativeRetest === 'pass'
      ).length,
      humanDecisionsNeeded: roots.filter(finding => finding.humanDecisionNeeded)
        .length,
    },
    findings,
    crashes,
    artifacts: input.artifacts,
  };
}

export function observationTemplate() {
  return {
    schema: DESKTOP_DOGFOOD_OBSERVATIONS_SCHEMA,
    observations: [],
  };
}
