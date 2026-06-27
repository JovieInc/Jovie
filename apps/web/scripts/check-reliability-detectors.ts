#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatReliabilityDetectorReport,
  nightlyPlaywrightConfigIncludesCanarySpecs,
  validateReliabilityDetectorArtifacts,
} from '@/lib/testing/reliability-detectors';

const repoRoot = resolve(process.cwd(), '../..');
const webRoot = resolve(repoRoot, 'apps/web');

function main() {
  const artifactResult = validateReliabilityDetectorArtifacts(path =>
    existsSync(resolve(repoRoot, path))
  );

  const nightlyConfigPath = resolve(webRoot, 'playwright.config.nightly.ts');
  const nightlyConfigSource = readFileSync(nightlyConfigPath, 'utf8');
  const nightlyIncludesCanaries =
    nightlyPlaywrightConfigIncludesCanarySpecs(nightlyConfigSource);

  console.log(formatReliabilityDetectorReport(artifactResult));

  if (!nightlyIncludesCanaries) {
    console.error(
      'playwright.config.nightly.ts is missing RELIABILITY_CANARY_E2E_GLOBS entries'
    );
    process.exit(1);
  }

  if (!artifactResult.ok) {
    process.exit(1);
  }
}

main();
