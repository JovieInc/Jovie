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
const JOB_MARKER = 'ci-typecheck:';
const REQUIRED_FLAG = '--force';
const TURBO_CMD_PATTERN = /pnpm\s+turbo\s+typecheck/;

function main() {
  let workflow;
  try {
    workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  } catch {
    console.error(`[ci-typecheck-gate-guard] Cannot read ${WORKFLOW_PATH}`);
    process.exit(1);
  }

  const lines = workflow.split('\n');

  // Locate the ci-typecheck job block and find the turbo typecheck run line.
  let inJob = false;
  let inNextJob = false;
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect job boundaries (top-level job keys end with a colon at column 2 in GH Actions YAML).
    if (/^\s{2}\w[\w-]+:\s*$/.test(line)) {
      if (line.trim() === JOB_MARKER) {
        inJob = true;
        inNextJob = false;
      } else if (inJob) {
        // Entered the next job — stop scanning.
        inNextJob = true;
      }
    }

    if (!inJob || inNextJob) continue;

    // Found a turbo typecheck invocation inside the ci-typecheck job.
    if (TURBO_CMD_PATTERN.test(line)) {
      if (!line.includes(REQUIRED_FLAG)) {
        findings.push({ lineNumber: i + 1, content: line.trim() });
      }
    }
  }

  if (findings.length === 0) {
    console.log(
      `[ci-typecheck-gate-guard] PASS — ci-typecheck gate invokes turbo with ${REQUIRED_FLAG}.`
    );
    process.exit(0);
  }

  console.error(
    '[ci-typecheck-gate-guard] FAIL — ci-typecheck gate is missing --force.'
  );
  console.error('');
  console.error(
    'A stale Turbo remote cache can replay a SUCCESS from a prior commit,'
  );
  console.error(
    'producing a false-green merge gate (JOV-3499). The gate MUST use --force.'
  );
  console.error('');
  for (const { lineNumber, content } of findings) {
    console.error(`  Line ${lineNumber}: ${content}`);
  }
  console.error('');
  console.error(
    `Remediation: add ${REQUIRED_FLAG} to the turbo typecheck command in ${WORKFLOW_PATH}`
  );
  process.exit(1);
}

main();
