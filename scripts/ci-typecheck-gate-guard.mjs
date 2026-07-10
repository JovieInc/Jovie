#!/usr/bin/env node

/**
 * Guard: ci-typecheck gate must run with --force (JOV-3499).
 *
 * A turbo remote cache or stale tsbuildinfo can replay a SUCCESS from a prior commit,
 * producing a false-green merge gate. The gate MUST use --force so every PR runs a
 * fresh tsc, never a cached replay.
 *
 * This script is invoked by the Structural Contract lane:
 *   pnpm ci:typecheck-gate-guard
 *
 * Exit 0 = pass. Exit 1 = fail (prints the offending line and remediation).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW_PATH = resolve('.github/workflows/ci.yml');
const LANES_PATH = resolve('scripts/ci-fast-lanes.mjs');
// JOV-3464: typecheck lives in the collapsed `ci-fast` job (lanes runner).
// Accept either the legacy `ci-typecheck:` job or the `ci-fast` + lanes script.
const JOB_MARKERS = ['ci-fast:', 'ci-typecheck:'];
const REQUIRED_FLAG = '--force';
const TURBO_CMD_PATTERN = /(?:pnpm\s+)?turbo\s+typecheck/;

function scanFile(filePath, label) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return { missingFile: true, findings: [], hasForce: false, label };
  }

  const lines = content.split('\n');
  // Non-workflow files (lanes script) are scanned in full; workflow files are
  // restricted to the ci-fast / ci-typecheck job blocks below.
  let inJob = !filePath.endsWith('ci.yml');
  let inNextJob = false;
  const findings = [];
  let sawTurbo = false;
  let hasForce = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (filePath.endsWith('ci.yml') && /^\s{2}\w[\w-]+:\s*$/.test(line)) {
      if (JOB_MARKERS.includes(line.trim())) {
        inJob = true;
        inNextJob = false;
      } else if (inJob) {
        inNextJob = true;
      }
    }

    if (!inJob || inNextJob) continue;

    if (TURBO_CMD_PATTERN.test(line)) {
      sawTurbo = true;
      if (line.includes(REQUIRED_FLAG)) {
        hasForce = true;
      } else {
        findings.push({ lineNumber: i + 1, content: line.trim(), label });
      }
    }
  }

  return { missingFile: false, findings, hasForce, sawTurbo, label };
}

function main() {
  // Prefer the lanes script (source of truth after JOV-3464 collapse); also
  // scan ci.yml for any inline turbo typecheck that might bypass the lanes.
  const scans = [
    scanFile(LANES_PATH, 'ci-fast-lanes'),
    scanFile(WORKFLOW_PATH, 'ci.yml'),
  ];

  if (scans[0].missingFile && scans[1].missingFile) {
    console.error(
      '[ci-typecheck-gate-guard] Cannot read workflow or lanes script'
    );
    process.exit(1);
  }

  const findings = scans.flatMap(s => s.findings);
  const hasForce = scans.some(s => s.hasForce);
  const sawTurbo = scans.some(s => s.sawTurbo);

  if (sawTurbo && hasForce && findings.length === 0) {
    console.log(
      `[ci-typecheck-gate-guard] PASS — ci-fast typecheck gate invokes turbo with ${REQUIRED_FLAG}.`
    );
    process.exit(0);
  }

  if (!sawTurbo) {
    console.error(
      '[ci-typecheck-gate-guard] FAIL — no turbo typecheck invocation found in ci-fast.'
    );
    console.error(
      `Remediation: ensure ${LANES_PATH} (or the ci-fast job) runs \`pnpm turbo typecheck --affected --force\`.`
    );
    process.exit(1);
  }

  console.error(
    '[ci-typecheck-gate-guard] FAIL — typecheck gate is missing --force.'
  );
  console.error('');
  console.error(
    'A stale Turbo remote cache can replay a SUCCESS from a prior commit,'
  );
  console.error(
    'producing a false-green merge gate (JOV-3499). The gate MUST use --force.'
  );
  console.error('');
  for (const { lineNumber, content, label } of findings) {
    console.error(`  ${label}:${lineNumber}: ${content}`);
  }
  console.error('');
  console.error(
    `Remediation: add ${REQUIRED_FLAG} to the turbo typecheck command in ${LANES_PATH}`
  );
  process.exit(1);
}

main();
