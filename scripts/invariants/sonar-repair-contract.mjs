#!/usr/bin/env node
/** JOV-INV-036: Sonar repairs become executable prevention. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { readInvariantRegistry } from './registry.mjs';

export const SONAR_REPAIR_INVARIANT_ID = 'JOV-INV-036';
export const SONAR_REPAIR_SCHEMA = 'jovie-sonar-repair-contract/v1';
const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @typedef {{ uses?: string, with?: { ref?: string, args?: string } }} ScanStep
 * @typedef {{ jobs?: Record<string, { steps?: ScanStep[] }> }} ScanWorkflow
 */

function read(repoRoot, path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

export function validateSonarRepairSources(repoRoot = DEFAULT_ROOT) {
  const errors = [];
  const command = read(repoRoot, '.claude/commands/sonar-fix.md');
  const workflow = read(repoRoot, '.github/workflows/sonarcloud.yml');
  const propertyFiles = ['.sonarcloud.properties', 'sonar-project.properties'];
  const requiredCommandClaims = [
    'gh repo view --json defaultBranchRef',
    'apps/web/scripts/fetch-sonar-issues.mjs',
    'source finding key',
    'root cause',
    'original-defect-failing',
    'exact head',
    'scan-confirmed',
    'locale-sensitive UI ordering',
    'canonical/hash ordering',
  ];
  for (const claim of requiredCommandClaims) {
    if (!command.includes(claim))
      errors.push(`sonar command missing ${JSON.stringify(claim)}`);
  }
  for (const stale of [
    'git checkout develop',
    'Do NOT wait for CI',
    'Skip flaky tests',
    'document and proceed',
    'All SonarCloud issues resolved!',
  ]) {
    if (command.includes(stale))
      errors.push(
        `sonar command retains unsafe guidance ${JSON.stringify(stale)}`
      );
  }
  const missingCredentialStepFails =
    /SONAR_TOKEN is not configured; SonarCloud analysis did not run\.[\s\S]{0,120}exit 1/.test(
      workflow
    );
  if (!missingCredentialStepFails) {
    errors.push('Sonar workflow can report green without a scan');
  }

  // SonarQube Cloud rejects CI analysis while project Automatic Analysis is
  // enabled. The workflow must disable it via api/autoscan/activation before
  // scanning, or a UI toggle re-enabling it fails main again (JOV-7287).
  const disablesAutomaticAnalysis =
    /autoscan\/activation/.test(workflow) && /enable=false/.test(workflow);
  if (!disablesAutomaticAnalysis) {
    errors.push(
      'Sonar workflow does not disable Automatic Analysis before the CI scan'
    );
  }

  // The scanner otherwise auto-detects the workflow_run wrapper's GITHUB_SHA.
  // Bind its published revision to the same producer/fallback as checkout.
  const revision = '${{ github.event.workflow_run.head_sha || github.sha }}';
  let revisionBound = false;
  try {
    const parsed = /** @type {ScanWorkflow} */ (yaml.load(workflow));
    const jobs = Object.values(parsed?.jobs ?? {});
    const scans = jobs.flatMap(job =>
      (job.steps ?? [])
        .filter(step =>
          step.uses?.startsWith('SonarSource/sonarqube-scan-action@')
        )
        .map(scan => ({ job, scan }))
    );
    revisionBound =
      scans.length > 0 &&
      scans.every(({ job, scan }) => {
        const checkout = (job.steps ?? []).find(step =>
          step.uses?.startsWith('actions/checkout@')
        );
        const args = scan.with?.args;
        return (
          checkout?.with?.ref === revision &&
          typeof args === 'string' &&
          args.trim() === `-Dsonar.scm.revision=${revision}`
        );
      });
  } catch {
    // Invalid workflow YAML cannot certify a scan's source identity.
  }
  if (!revisionBound) {
    errors.push(
      'Sonar scan revision must match the producer checkout with a workflow SHA fallback'
    );
  }

  // JOV-6817: the default 4 GiB analyzer heap exhausted twice on the
  // 16 GiB hosted runner. Reserve 8 GiB for Node and leave the remainder
  // for the scanner JVM and OS; changing that budget requires revalidation.
  const analyzerHeap = [
    ...read(repoRoot, 'sonar-project.properties').matchAll(
      /^[\t ]*sonar\.javascript\.node\.maxspace(?:[\t ]*[=:][\t ]*|[\t ]+)([^\r\n]*)$/gm
    ),
  ]
    .at(-1)?.[1]
    .trim();
  if (analyzerHeap !== '8192') {
    errors.push(
      'Sonar CI analyzer heap must use the configured 8192 MB budget'
    );
  }

  for (const propertyFile of propertyFiles) {
    const properties = read(repoRoot, propertyFile);
    const sources = properties.match(/^sonar\.sources=(.+)$/m)?.[1] ?? '';
    const exclusions =
      properties
        .match(/^sonar\.exclusions=\\\n([\s\S]*?)\n\n/m)?.[1]
        ?.replaceAll('\\', '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean) ?? [];
    for (const exclusion of exclusions) {
      const matchesProductSource = sources
        .split(',')
        .some(
          source =>
            exclusion === `${source}/**` || exclusion === `${source}/**/*`
        );
      if (matchesProductSource)
        errors.push(
          `${propertyFile} exclusion can hide product source: ${exclusion}`
        );
      if (
        exclusion.includes('a11y-red') &&
        (!exclusion.includes('/fixtures/') || exclusion.includes('*'))
      ) {
        errors.push(
          `${propertyFile} deliberate-red exclusion is not bound to one fixture file: ${exclusion}`
        );
      }
    }
  }
  return errors;
}

export function validateSonarRepairContract(
  registry = readInvariantRegistry(),
  { repoRoot = DEFAULT_ROOT } = {}
) {
  const errors = validateSonarRepairSources(repoRoot);
  const invariant = registry.invariants.find(
    item => item.id === SONAR_REPAIR_INVARIANT_ID
  );
  if (!invariant) return [...errors, `missing ${SONAR_REPAIR_INVARIANT_ID}`];
  if (invariant.policy?.value?.schema !== SONAR_REPAIR_SCHEMA)
    errors.push(`${SONAR_REPAIR_INVARIANT_ID} schema mismatch`);
  if (!invariant.policy?.value?.proofCommand)
    errors.push(`${SONAR_REPAIR_INVARIANT_ID} missing proof command`);
  if (!invariant.policy?.value?.invalidationCondition)
    errors.push(`${SONAR_REPAIR_INVARIANT_ID} missing invalidation condition`);
  return errors;
}
