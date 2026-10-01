#!/usr/bin/env node

import {
  loadDocFreshnessRegistry,
  runDocFreshnessLint,
} from './lib/doc-freshness.mjs';

const includeGardeningOnly = process.argv.includes('--include-gardening');

const registry = loadDocFreshnessRegistry();
const result = runDocFreshnessLint(registry, { includeGardeningOnly });

// A qualification finding is visible but cannot change the existing gate exit.
console.log(
  `doc-review-qualification: ${JSON.stringify(result.qualification)}`
);

if (result.violations.length > 0) {
  console.error('doc-freshness: found documentation drift\n');
  for (const violation of result.violations) {
    console.error(`[${violation.kind}] ${violation.file ?? violation.id}`);
    if (violation.target) {
      console.error(`  link: ${violation.target}`);
    }
    if (violation.expected && violation.actual) {
      console.error(
        `  marker: expected ${violation.expected}, actual ${violation.actual}`
      );
    }
    if (violation.lineCount) {
      console.error(
        `  lines: ${violation.lineCount} (max ${violation.maxLines})`
      );
    }
    console.error(`  fix: ${violation.remediation}`);
    console.error('');
  }
  process.exit(1);
}

console.log(
  `doc-freshness: ok (${result.scanned.crossLinkFiles} cross-link files, ` +
    `${result.scanned.agentsMapLines} AGENTS map lines, ` +
    `${result.scanned.reviewedDocuments} source-bound document reviews)`
);
