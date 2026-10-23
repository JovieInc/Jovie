/**
 * Runs every art-direction check. Vision findings stay shadow unless
 * vision.config.json sets promoteToBlocking.
 */
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set([
  'color.mjs',
  'paths.mjs',
  'ratchet.mjs',
  'run.mjs',
]);

export async function loadChecks(dir = HERE) {
  const files = readdirSync(dir)
    .filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && !SKIP.has(name))
    .sort();
  const checks = [];
  for (const file of files) {
    const loaded = await import(pathToFileURL(join(dir, file)).href);
    const check = loaded.check ?? loaded.default;
    if (typeof check !== 'function') {
      throw new Error(`${file} does not export check()`);
    }
    checks.push({ file, check });
  }
  return checks;
}

export async function runArtDirection(repoRoot = REPO_ROOT) {
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const shadow = [];
  for (const { file, check } of await loadChecks()) {
    const result = await check(repoRoot);
    for (const failure of result.failures ?? []) {
      failures.push(`${file}: ${failure}`);
    }
    for (const note of result.shadow ?? []) shadow.push(`${file}: ${note}`);
  }
  return { failures, shadow };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { failures, shadow } = await runArtDirection();
  for (const note of shadow) process.stdout.write(`${note}\n`);
  if (failures.length > 0) {
    process.stderr.write(failures.join('\n') + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('art-direction: ok\n');
  }
}
