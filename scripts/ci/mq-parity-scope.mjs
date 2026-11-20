/**
 * Affected-path selector for merge-queue parity twins on the source PR.
 *
 * JOV-13071 / release autonomy: close queue-only `gap` exemptions by running
 * the same command on pull_request when the diff touches that lane's inputs.
 * This module starts with the typecheck twin (highest first-pass leverage after
 * the already-landed JOV-6834 affected unit shards).
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  affectsJovieTypecheck,
  affectsWebTestTypecheck,
} from '../lib/ci-repo-lanes.mjs';

/**
 * @param {readonly string[]} files
 * @returns {{ typecheck: boolean }}
 */
export function selectMqParityScope(files) {
  return {
    typecheck: files.some(
      file =>
        affectsJovieTypecheck(file) ||
        affectsWebTestTypecheck(file) ||
        /^(scripts\/ci-fast-lanes\.mjs|scripts\/ci\/mq-parity-|\.github\/workflows\/(?:ci|source-validation)\.yml$)/.test(
          file
        )
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  const base = process.argv[2];
  if (!/^[0-9a-f]{40}$/.test(base ?? '')) {
    throw new Error('Exact diff base SHA required');
  }
  // --no-renames: rename-out of the typecheck graph must still surface the
  // deleted source path (repo convention; see resolve-merge-group-path-diff).
  const files = execFileSync(
    'git',
    ['diff', '--no-renames', '--name-only', '-z', base, 'HEAD'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  )
    .split('\0')
    .filter(Boolean);
  const scope = selectMqParityScope(files);
  for (const [key, value] of Object.entries(scope)) {
    console.log(`${key}=${value}`);
  }
}
