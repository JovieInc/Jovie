#!/usr/bin/env node
/**
 * CLI entry for pr-size-guard-label-override workflow.
 * Posts a passing "PR Size Guard" check-run when big-pr/codemod is applied.
 */

import { execFileSync } from 'node:child_process';
import {
  buildSizeGuardOverrideCheckRun,
  buildValidatedSizeGuardCheckRun,
} from './lib/pr-size-guard-label-override.mjs';

const headSha = process.env.HEAD_SHA ?? '';
const label = process.env.LABEL ?? '';
const runUrl = process.env.RUN_URL ?? '';
const repository = process.env.GITHUB_REPOSITORY ?? '';

if (!repository) {
  console.error('GITHUB_REPOSITORY is required');
  process.exit(1);
}

const validatedPolicy = process.env.VALIDATED_POLICY ?? '';
const payload = validatedPolicy
  ? buildValidatedSizeGuardCheckRun({
      headSha,
      policy: validatedPolicy,
      runUrl,
    })
  : buildSizeGuardOverrideCheckRun({ headSha, label, runUrl });

execFileSync('gh', ['api', `repos/${repository}/check-runs`, '--input', '-'], {
  input: JSON.stringify(payload),
  stdio: ['pipe', 'inherit', 'inherit'],
  encoding: 'utf8',
});

console.log(
  `Posted passing "${payload.name}" check for ${headSha.slice(0, 7)}`
);
