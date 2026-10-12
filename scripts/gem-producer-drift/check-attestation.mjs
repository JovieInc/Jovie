#!/usr/bin/env node
/**
 * JOV-7223: Gem producer install drift alarm.
 *
 * Fails loudly when the Gem host's producer attestation
 * ($GEM_WORKSPACE/state/gem-pr-rehabilitation-attestation.json, written by
 * symphony-control's scripts/symphony/install-gem-pr-rehabilitation.sh) is
 * missing, malformed, or its sourceRevision no longer matches
 * symphony-control main. Replaces the install coverage lost when the
 * "Activate Gem Delivery Controller" workflow was removed (#18812).
 *
 * Usage:
 *   node scripts/gem-producer-drift/check-attestation.mjs \
 *     [--attestation-file PATH] [--repo OWNER/NAME] [--branch main] \
 *     [--expected-sha SHA] [--json]
 *
 * --expected-sha skips the GitHub lookup (manual verification and tests).
 * Without it the script resolves the upstream head through ambient `gh`
 * auth on the Gem runner.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHA_RE = /^[0-9a-f]{40}$/;

export function parseArgs(argv) {
  const args = {
    attestationFile: null,
    repo: 'JovieInc/symphony-control',
    branch: 'main',
    expectedSha: null,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--attestation-file='))
      args.attestationFile = arg.slice('--attestation-file='.length);
    else if (arg.startsWith('--repo=')) args.repo = arg.slice('--repo='.length);
    else if (arg.startsWith('--branch='))
      args.branch = arg.slice('--branch='.length);
    else if (arg.startsWith('--expected-sha='))
      args.expectedSha = arg.slice('--expected-sha='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

export function defaultAttestationPath(env = process.env) {
  const workspace = env.GEM_WORKSPACE || '/home/timwhite/gem-workspace';
  return join(workspace, 'state', 'gem-pr-rehabilitation-attestation.json');
}

/** @returns {{ok: boolean, reason: string, sourceRevision?: string}} */
export function evaluateAttestation(attestation, expectedSha) {
  if (attestation === null)
    return { ok: false, reason: 'attestation file is missing or unreadable' };
  if (typeof attestation !== 'object' || Array.isArray(attestation))
    return { ok: false, reason: 'attestation is not a JSON object' };
  const sourceRevision = attestation.sourceRevision;
  if (typeof sourceRevision !== 'string' || !SHA_RE.test(sourceRevision))
    return {
      ok: false,
      reason:
        'attestation sourceRevision is missing or not a 40-char commit sha',
    };
  if (sourceRevision !== expectedSha)
    return {
      ok: false,
      reason: `attestation sourceRevision ${sourceRevision} does not match upstream head ${expectedSha}`,
      sourceRevision,
    };
  return {
    ok: true,
    reason: 'attestation matches upstream head',
    sourceRevision,
  };
}

export function loadAttestation(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function ghApi(endpoint) {
  return execFileSync('gh', ['api', endpoint], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveUpstreamSha(repo, branch) {
  const raw = ghApi(`repos/${repo}/commits/${branch}`);
  const parsed = JSON.parse(raw);
  if (typeof parsed.sha !== 'string' || !SHA_RE.test(parsed.sha))
    throw new Error(`unexpected sha from repos/${repo}/commits/${branch}`);
  return parsed.sha;
}

function compareStatus(repo, sourceRevision, expectedSha) {
  try {
    const raw = ghApi(
      `repos/${repo}/compare/${sourceRevision}...${expectedSha}`
    );
    const parsed = JSON.parse(raw);
    return `${parsed.status} (behind_by=${parsed.behind_by})`;
  } catch {
    return 'comparison unavailable (revision may not exist upstream)';
  }
}

function report(result, extra, json) {
  const payload = {
    schema: 'gem-producer-drift/v1',
    ok: result.ok,
    reason: result.reason,
    ...extra,
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    const prefix = result.ok ? '' : '::error::';
    console.log(`${prefix}${result.reason}`);
    for (const [key, value] of Object.entries(extra))
      console.log(`${key}=${value}`);
  }
  return payload;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const attestationFile = args.attestationFile ?? defaultAttestationPath(env);
  const attestation = loadAttestation(attestationFile);

  const expectedSha =
    args.expectedSha ?? resolveUpstreamSha(args.repo, args.branch);
  if (args.expectedSha !== null && !SHA_RE.test(args.expectedSha))
    throw new Error('--expected-sha must be a 40-char commit sha');

  const result = evaluateAttestation(attestation, expectedSha);
  const extra = {
    attestationFile,
    upstream: `${args.repo}@${args.branch}`,
    upstreamSha: expectedSha,
  };
  if (result.sourceRevision) extra.sourceRevision = result.sourceRevision;
  if (!result.ok && result.sourceRevision && args.expectedSha === null)
    extra.drift = compareStatus(args.repo, result.sourceRevision, expectedSha);

  report(result, extra, args.json);
  return result.ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
