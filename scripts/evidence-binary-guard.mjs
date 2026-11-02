#!/usr/bin/env node
// Ratchet: evidence binaries live in the off-repo evidence store, never in the
// tree. Fails when a PR adds or modifies a binary under an evidence root;
// existing files are grandfathered only until they are migrated or touched.
// Usage: node scripts/evidence-binary-guard.mjs [--base origin/main]
import { execFileSync } from 'node:child_process';
import { isBannedEvidenceBinary } from './lib/evidence-store.mjs';

export function findBannedEvidenceBinaries(changes) {
  return changes
    .filter(
      ({ status, path }) => status !== 'D' && isBannedEvidenceBinary(path)
    )
    .map(({ path }) => path);
}

export function parseNameStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, ...paths] = line.split('\t');
      return { status: status[0], path: paths.at(-1) };
    });
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const base = args.includes('--base')
    ? args[args.indexOf('--base') + 1]
    : 'origin/main';
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${base}...HEAD`],
    { encoding: 'utf8' }
  );
  const banned = findBannedEvidenceBinaries(parseNameStatus(output));
  if (banned.length > 0) {
    console.error(
      `Evidence binaries must not be committed (repo size budget):\n${banned.join('\n')}\n` +
        'Store them with: node scripts/evidence-store.mjs put <file> --viewport WxH\n' +
        'and commit the .evidence.json pointer instead.'
    );
    process.exitCode = 1;
  } else {
    console.log('No new evidence binaries in the tree.');
  }
}
