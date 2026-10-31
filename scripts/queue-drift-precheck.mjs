#!/usr/bin/env node
// Queue drift precheck. Runs the cheap main-dependent guards listed in
// scripts/lib/queue-drift-guards.json against the current tree (CI points it at
// a test merge of the PR with the latest main). Exit 0 = clean or nothing
// decidable (fail open); exit 1 = at least one guard reports real drift.
import { spawn as spawnAsync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAILED_MARKER = 'QUEUE_DRIFT_FAILED';
const MAX_OUTPUT_CHARS = 700;
// A guard that cannot even load its dependencies says nothing about drift.
const ENVIRONMENT_ERROR =
  /ERR_MODULE_NOT_FOUND|Cannot find (module|package)|ERR_PACKAGE_PATH_NOT_EXPORTED/;

const here = dirname(fileURLToPath(import.meta.url));

export function loadGuards(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.guards)) {
    throw new Error(`${manifestPath}: "guards" must be an array`);
  }
  for (const guard of manifest.guards) {
    if (
      !guard.id ||
      !Array.isArray(guard.command) ||
      guard.command.length < 1
    ) {
      throw new Error(`${manifestPath}: every guard needs an id and a command`);
    }
  }
  return manifest.guards;
}

function tail(text) {
  const trimmed = String(text ?? '').trim();
  return trimmed.length > MAX_OUTPUT_CHARS
    ? `...${trimmed.slice(-MAX_OUTPUT_CHARS)}`
    : trimmed;
}

function skipReason(guard, root) {
  const missing = (guard.requires ?? []).filter(
    path => !existsSync(resolve(root, path))
  );
  return missing.length > 0 ? `absent: ${missing.join(', ')}` : '';
}

function classify(guard, run) {
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  if (run.error || run.status === null) {
    return {
      id: guard.id,
      status: 'error',
      detail: String(run.error?.code ?? run.signal ?? 'no exit status'),
    };
  }
  if (run.status === 0) return { id: guard.id, status: 'pass', detail: '' };
  if (ENVIRONMENT_ERROR.test(output)) {
    return {
      id: guard.id,
      status: 'error',
      detail: 'guard could not load its dependencies',
    };
  }
  return {
    id: guard.id,
    status: 'fail',
    detail: tail(run.stderr) || tail(run.stdout),
    remediation: guard.remediation ?? '',
  };
}

const guardEnv = () => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  CI: 'true',
});

export function runGuards({
  guards,
  root = process.cwd(),
  spawn = spawnSync,
  timeoutMs = 60_000,
}) {
  return guards.map(guard => {
    const skipped = skipReason(guard, root);
    if (skipped) return { id: guard.id, status: 'skipped', detail: skipped };
    const [command, ...args] = guard.command;
    const run = spawn(command, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      env: guardEnv(),
    });
    return classify(guard, run);
  });
}

/** Same verdicts as runGuards, with every guard running at once (wall time = slowest guard). */
export function runGuardsParallel({
  guards,
  root = process.cwd(),
  timeoutMs = 60_000,
}) {
  return Promise.all(
    guards.map(
      guard =>
        new Promise(resolvePromise => {
          const skipped = skipReason(guard, root);
          if (skipped) {
            resolvePromise({
              id: guard.id,
              status: 'skipped',
              detail: skipped,
            });
            return;
          }
          const [command, ...args] = guard.command;
          const child = spawnAsync(command, args, {
            cwd: root,
            env: guardEnv(),
            timeout: timeoutMs,
          });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', chunk => (stdout += chunk));
          child.stderr.on('data', chunk => (stderr += chunk));
          child.on('error', error =>
            resolvePromise(classify(guard, { error }))
          );
          child.on('close', (status, signal) =>
            resolvePromise(classify(guard, { status, signal, stdout, stderr }))
          );
        })
    )
  );
}

export function formatReport(results) {
  const failed = results.filter(result => result.status === 'fail');
  if (failed.length === 0) return '';
  return [
    FAILED_MARKER,
    ...failed.flatMap(result => [
      `- ${result.id}: ${result.remediation}`.trim(),
      ...result.detail.split('\n').map(line => `    ${line}`),
    ]),
  ].join('\n');
}

async function main(argv) {
  const flag = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const manifest =
    flag('--manifest') ?? resolve(here, 'lib/queue-drift-guards.json');
  const out = flag('--out');
  const started = Date.now();
  const results = await runGuardsParallel({
    guards: loadGuards(manifest),
    root: resolve(flag('--root') ?? process.cwd()),
  });
  console.log(
    `queue-drift: ${results.length} guards in ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  for (const result of results) {
    console.log(
      `queue-drift: ${result.id} ${result.status}${result.detail && result.status !== 'fail' ? ` (${result.detail})` : ''}`
    );
  }
  const report = formatReport(results);
  if (!report) return 0;
  console.error(report);
  if (out) writeFileSync(out, `${report}\n`);
  return 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(await main(process.argv.slice(2)));
}
