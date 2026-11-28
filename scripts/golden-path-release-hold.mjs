#!/usr/bin/env node
/**
 * Golden Path release hold gate.
 *
 *   node scripts/golden-path-release-hold.mjs --candidate-sha SHA
 *     --base-sha SHA --certifications certs.json [--out FILE]
 *
 * --certifications maps step -> { status, sha, runUrl } (latest certification
 * per step). --base-sha is the release being replaced. Exit 0 = promote,
 * 1 = hold (summary and fix issues written), 2 = could not decide (also a
 * hold: nothing proceeds silently). Needs LINEAR_API_KEY to open issues.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gitTouched } from './golden-path-cert-reuse.mjs';
import {
  applyReleaseHold,
  decideReleaseHold,
  holdSummaryLines,
} from './lib/golden-path-release-hold.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';
import { SURFACE_IDS } from './lib/prod-cert.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string | undefined} path */
function readCertifications(path) {
  try {
    const body = JSON.parse(readFileSync(String(path), 'utf8'));
    return body?.surfaces ?? body;
  } catch {
    return null;
  }
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  upsert = upsertLinearIssueByTitleFingerprint
) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'candidate-sha': { type: 'string' },
      'base-sha': { type: 'string' },
      certifications: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const candidateSha = String(values['candidate-sha'] ?? '');
  let touched;
  try {
    touched = gitTouched({
      root: ROOT,
      servedSha: candidateSha,
      head: candidateSha,
    })(String(values['base-sha'] ?? ''));
  } catch {
    touched = {
      all: true,
      steps: [...SURFACE_IDS],
      reason: 'diff unavailable',
    };
  }
  const result = await applyReleaseHold(
    decideReleaseHold({
      candidateSha,
      touched,
      certifications: readCertifications(values.certifications),
    }),
    { upsert }
  );
  const lines = holdSummaryLines(result);
  for (const line of lines) console.log(line);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  if (values.out)
    writeFileSync(values.out, `${JSON.stringify(result, null, 2)}\n`);
  return result.decision === 'hold' ? 1 : 0;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().then(
    code => {
      process.exitCode = code;
    },
    error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : error}\n`
      );
      process.exitCode = 2;
    }
  );
}
