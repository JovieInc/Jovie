#!/usr/bin/env node
/**
 * Fail-closed contract for the CI/release incident prevention ledger.
 *
 * The ledger is deliberately data-only: remediation code stays with its
 * stage owner, while this contract prevents an incident from being declared
 * handled without executable regression evidence, operations documentation,
 * canonical-template propagation, and a fresh-scaffold proof.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REQUIRED_INCIDENT_IDS = [
  'ci-release/source-pr-queue-evidence',
  'ci-release/duplicate-ci-retry-loop',
  'ci-release/legacy-merge-queue-label',
  'ci-release/async-update-branch-bounds',
  'ci-release/superseded-run-capacity',
  'ci-release/runner-heartbeat-routing',
  'ci-release/runner-image-prerequisites',
  'ci-release/runner-image-source-sha-provenance',
  'ci-release/cache-artifact-fanout',
  'ci-release/runner-emergency-headroom',
  'ci-release/sentry-read-gate-scopes',
  'ci-release/doppler-sync-freshness',
  'ci-release/vercel-immutable-probe',
  'ci-release/seo-redirect-auth-html',
  'ci-release/lighthouse-assertion-matches',
  'ci-release/bypass-secret-containment',
  'ci-release/production-workflow-provenance',
  'ci-release/production-evidence-freshness',
  'ci-release/controller-loop-bounds',
  'ci-release/gbrain-readiness-diagnosis',
  'ci-release/gbrain-pool-recovery',
  'ci-release/coordination-query-bounds',
  'ci-release/agent-task-identity-context-drift',
  'ci-release/admin-secret-log-redaction',
  'ci-release/gbrain-admin-secret-log-redaction',
  'ci-release/secret-scan-synthetic-merge-base',
];

const REQUIRED_STAGES = new Set([
  'source-pr',
  'merge-group',
  'main-release',
  'post-deploy',
  'scheduled-control-plane',
  'operator-bootstrap',
]);

const CANONICAL_TEMPLATE = {
  repository: 'JovieInc/ci',
  templateVersion: 'bc0b0676c058ffa1c8515e8c29fefd2317b160cc',
  template: 'templates/jovie-ci-release-prevention',
  bootstrap: 'templates/jovie-ci-release-prevention/bootstrap.mjs',
  workflow:
    '.github/workflows/verify-ci-release-prevention.yml@bc0b0676c058ffa1c8515e8c29fefd2317b160cc',
  manifest: 'ci-release-prevention.yml',
  requiredFields: [
    'template',
    'template_version',
    'ledger',
    'verifier',
    'scaffold_proof',
  ],
};

const MERGE_QUEUE_LABEL_POLICY = {
  nativeForbidsLegacyLabel: true,
  graphiteExplicitlyAllowsLegacyLabel: true,
};

const CANONICAL_SCAFFOLD_PROOF = {
  repository: 'JovieInc/ci',
  path: 'scripts/test-jovie-ci-template-scaffold.mjs',
  command: 'node scripts/test-jovie-ci-template-scaffold.mjs',
};

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function localPath(value) {
  return (
    nonEmptyString(value) && !value.startsWith('/') && !value.includes('..')
  );
}

function requireExistingPath(value, label, errors) {
  if (!localPath(value)) {
    errors.push(`${label} must be a repository-relative path`);
  } else if (!existsSync(resolve(value))) {
    errors.push(`${label} does not exist: ${value}`);
  }
}

function requireFileText(path, expected, label, errors) {
  if (!localPath(path) || !existsSync(resolve(path))) return;
  if (!readFileSync(resolve(path), 'utf8').includes(expected)) {
    errors.push(`${label} must index ${expected}`);
  }
}

export function validateIncidentLedger(ledger) {
  const errors = [];
  if (
    !ledger ||
    ledger.schemaVersion !== 1 ||
    !Array.isArray(ledger.incidents)
  ) {
    return {
      ok: false,
      errors: ['ledger must contain schemaVersion 1 and an incidents array'],
    };
  }
  if (
    JSON.stringify(ledger.mergeQueueLabelPolicy) !==
    JSON.stringify(MERGE_QUEUE_LABEL_POLICY)
  ) {
    errors.push(
      'ledger must declare the native/Graphite merge-queue label policy'
    );
  }

  const seen = new Set();
  for (const incident of ledger.incidents) {
    const id = incident?.id;
    if (!nonEmptyString(id)) {
      errors.push('incident id is required');
      continue;
    }
    if (seen.has(id)) errors.push(`duplicate incident id: ${id}`);
    seen.add(id);
    if (!nonEmptyString(incident.failureMode))
      errors.push(`${id}: failureMode is required`);

    const regression = incident.regression;
    if (!regression || !['test', 'verifier'].includes(regression.kind)) {
      errors.push(`${id}: regression.kind must be test or verifier`);
    }
    if (
      !nonEmptyString(regression?.command) ||
      !/^(node|pnpm|pytest|test|\.\/)/.test(regression.command)
    )
      errors.push(`${id}: regression.command is required`);
    requireExistingPath(regression?.path, `${id}: regression.path`, errors);

    if (!REQUIRED_STAGES.has(incident.ciStageOwner?.stage)) {
      errors.push(`${id}: ciStageOwner.stage is not a supported CI stage`);
    }
    if (!nonEmptyString(incident.ciStageOwner?.owner)) {
      errors.push(`${id}: ciStageOwner.owner is required`);
    }

    requireExistingPath(
      incident.documentation?.operator,
      `${id}: documentation.operator`,
      errors
    );
    requireExistingPath(
      incident.documentation?.postmortem,
      `${id}: documentation.postmortem`,
      errors
    );
    requireFileText(
      incident.documentation?.operator,
      id,
      `${id}: documentation.operator`,
      errors
    );
    requireFileText(
      incident.documentation?.postmortem,
      'CI_RELEASE_INCIDENTS.md',
      `${id}: documentation.postmortem`,
      errors
    );
    for (const [field, expected] of Object.entries(CANONICAL_TEMPLATE)) {
      const actual = incident.templatePropagation?.[field];
      if (Array.isArray(expected)) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          errors.push(
            `${id}: templatePropagation.${field} must match the canonical JovieInc/ci manifest fields`
          );
        }
      } else if (actual !== expected) {
        errors.push(
          `${id}: templatePropagation.${field} must equal ${expected}`
        );
      }
    }
    for (const [field, expected] of Object.entries(CANONICAL_SCAFFOLD_PROOF)) {
      if (incident.scaffoldProof?.[field] !== expected) {
        errors.push(`${id}: scaffoldProof.${field} must equal ${expected}`);
      }
    }
  }

  for (const id of REQUIRED_INCIDENT_IDS) {
    if (!seen.has(id)) errors.push(`required incident missing: ${id}`);
  }
  for (const id of seen) {
    if (!REQUIRED_INCIDENT_IDS.includes(id))
      errors.push(`unregistered incident id: ${id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateMergeQueueBackendLabels(backend, labels) {
  const hasLegacyLabel = labels.includes('merge-queue');
  if (backend === 'native' && hasLegacyLabel) {
    return ['native merge queue must reject legacy merge-queue labels'];
  }
  if (backend !== 'native' && backend !== 'graphite') {
    return ['merge queue backend must be native or graphite'];
  }
  return [];
}

function main() {
  const ledgerPath =
    process.argv[2] ?? '.github/ci-harness/ci-release-incidents.json';
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    console.error(
      `Unable to read incident ledger ${ledgerPath}: ${error.message}`
    );
    process.exitCode = 1;
    return;
  }
  const result = validateIncidentLedger(ledger);
  if (!result.ok) {
    console.error('CI release incident contract is invalid:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `CI release incident contract valid (${ledger.incidents.length} incidents).`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
