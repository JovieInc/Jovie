import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CI_SKIP = /\$\{CI(?::-)?\}/;

/**
 * Child env for a local-only hook test.
 *
 * GitHub Actions sets CI, and scripts/hooks/warden-local-review.sh exits before
 * it invokes warden when that variable is set. Spreading process.env into the
 * child made the stub unreachable in the merge group (marker missing, strict
 * exit 0). Callers that want the CI skip pass CI in extraEnv.
 */
export function localHookChildEnv(extraEnv = {}, extraPath = '') {
  const env = { ...process.env };
  if (!Object.hasOwn(extraEnv, 'CI')) delete env.CI;
  Object.assign(env, extraEnv);
  env.PATH = `${extraPath}:${process.env.PATH ?? ''}`;
  return env;
}

/** Hook tests whose script skips on CI but whose test does not use localHookChildEnv. */
export function localHookTestsMissingCiIsolation(root) {
  const directory = join(root, 'scripts/hooks');
  const missing = [];
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.sh')) continue;
    const source = readFileSync(join(directory, name), 'utf8');
    if (!CI_SKIP.test(source)) continue;
    const testName = name.replace(/\.sh$/, '.test.mjs');
    let testSource = '';
    try {
      testSource = readFileSync(join(directory, testName), 'utf8');
    } catch {
      missing.push(testName);
      continue;
    }
    if (!testSource.includes('local-hook-child-env')) missing.push(testName);
  }
  return missing;
}
