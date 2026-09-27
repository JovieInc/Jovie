#!/usr/bin/env node
/**
 * Adopt CI-rendered screenshots as committed visual baselines.
 *
 * When a PR intentionally changes a snapshotted surface, the fail-closed
 * compare (scripts/visual-snapshot-compare.mjs, JOV-5459/JOV-5960) fails and
 * uploads Playwright's `<name>-actual.png` renders. This copies those CI
 * (Linux Chromium) renders over the matching committed baselines so the new
 * look is reviewed in the PR diff. It never touches thresholds or the gate.
 *
 * Usage:
 *   node scripts/visual-baseline-adopt.mjs <run-id> [--attempt <n>] [--artifact <name>]
 *   node scripts/visual-baseline-adopt.mjs --from <downloaded-artifact-dir>
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_ROOT = join(REPO_ROOT, 'apps/web/tests/e2e/__snapshots__');
const ACTUAL_SUFFIX = '-actual.png';

/** Recursively list files under dir. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/**
 * Map each `<name>-actual.png` to the one committed baseline named
 * `<name>.png`. Ambiguous or unknown names are reported, never guessed.
 */
export function planAdoption(actualPaths, baselinePaths) {
  const byName = new Map();
  for (const path of baselinePaths) {
    const name = basename(path);
    byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  const copies = [];
  const problems = [];
  const seen = new Set();
  for (const actual of actualPaths) {
    const file = basename(actual);
    if (!file.endsWith(ACTUAL_SUFFIX)) continue;
    const name = `${file.slice(0, -ACTUAL_SUFFIX.length)}.png`;
    if (seen.has(name)) continue; // retries write the same shot more than once
    seen.add(name);
    const matches = byName.get(name) ?? [];
    if (matches.length === 1) copies.push({ from: actual, to: matches[0] });
    else
      problems.push(
        matches.length === 0
          ? `no committed baseline named ${name}`
          : `ambiguous baseline ${name}: ${matches.length} matches`
      );
  }
  return { copies, problems };
}

function downloadArtifact(runId, artifactName) {
  const dir = mkdtempSync(join(tmpdir(), 'visual-adopt-'));
  const result = spawnSync(
    'gh',
    ['run', 'download', runId, '--name', artifactName, '--dir', dir],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`could not download artifact ${artifactName} from run ${runId}`);
  }
  return dir;
}

function parseArgs(argv) {
  const args = { attempt: '1' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--attempt') args.attempt = argv[++i];
    else if (arg === '--artifact') args.artifact = argv[++i];
    else if (arg === '--from') args.from = argv[++i];
    else if (!args.runId) args.runId = arg;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from && !args.runId) {
    console.error(
      'Usage: node scripts/visual-baseline-adopt.mjs <run-id> [--attempt <n>] [--artifact <name>] | --from <dir>'
    );
    process.exit(2);
  }
  const source =
    args.from ??
    downloadArtifact(
      args.runId,
      args.artifact ?? `homepage-visual-${args.runId}-${args.attempt}`
    );
  if (!statSync(source).isDirectory()) throw new Error(`${source} is not a directory`);

  const { copies, problems } = planAdoption(walk(source), walk(SNAPSHOT_ROOT));
  for (const problem of problems) console.error(`::error::${problem}`);
  if (problems.length || copies.length === 0) {
    if (copies.length === 0) console.error('::error::no -actual.png renders to adopt');
    process.exit(1);
  }
  for (const { from, to } of copies) {
    copyFileSync(from, to);
    console.log(`adopted ${relative(REPO_ROOT, to)}`);
  }
  console.log(
    `Adopted ${copies.length} CI-rendered baseline(s). Review the image diff, then commit.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
