#!/usr/bin/env node
/** JOV-INV-036: Sonar repairs become executable prevention. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const SONAR_REPAIR_INVARIANT_ID = 'JOV-INV-036';
export const SONAR_REPAIR_SCHEMA = 'jovie-sonar-repair-contract/v1';
const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

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
