import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * JOV-7237: Doppler syncs all of jovie-web/prd into the GitHub environment
 * "Production – jovie" and hits the 100-secret cap. The jobs bound to that
 * environment read only a handful of names; everything else comes from
 * `doppler run` at runtime. This contract pins that handful so the sync can
 * shrink to it without breaking a production job, and fails the moment a
 * workflow starts reading a new environment secret without updating it.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW_DIR = resolve(REPO_ROOT, '.github/workflows');
const CONTRACT = JSON.parse(
  readFileSync(
    resolve(REPO_ROOT, '.github/production-environment-secrets.json'),
    'utf8'
  )
);

/** @param {unknown} environment */
function environmentName(environment) {
  if (typeof environment === 'string') return environment;
  if (environment && typeof environment === 'object' && 'name' in environment) {
    return String(environment.name);
  }
  return null;
}

/** @param {string} source */
function secretNamesIn(source) {
  return [...source.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map(m => m[1]);
}

/**
 * @param {string} environment
 * @returns {Map<string, { names: string[], source: string }>} job key -> refs
 */
function secretsByBoundJob(environment) {
  /** @type {Map<string, { names: string[], source: string }>} */
  const jobs = new Map();
  for (const file of readdirSync(WORKFLOW_DIR)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const workflow =
      /** @type {{ jobs?: Record<string, Record<string, unknown>> }} */ (
        parseYaml(readFileSync(resolve(WORKFLOW_DIR, file), 'utf8'))
      );
    for (const [id, job] of Object.entries(workflow?.jobs ?? {})) {
      if (environmentName(job.environment) !== environment) continue;
      const source = JSON.stringify(job);
      jobs.set(`${file}:${id}`, {
        names: [...new Set(secretNamesIn(source))],
        source,
      });
    }
  }
  return jobs;
}

describe('production environment secret contract (JOV-7237)', () => {
  const jobs = secretsByBoundJob(CONTRACT.environment);
  const allowed = new Set(CONTRACT.secrets);
  const used = new Set([...jobs.values()].flatMap(job => job.names));

  it('finds the production-bound jobs', () => {
    expect(jobs.size).toBeGreaterThan(0);
  });

  it('only reads contracted secrets from production-bound jobs', () => {
    const unexpected = [...jobs].flatMap(([job, { names }]) =>
      names.filter(name => !allowed.has(name)).map(name => `${job}: ${name}`)
    );
    expect(
      unexpected,
      'Add the name to .github/production-environment-secrets.json and the Doppler sync, or read it with doppler run'
    ).toEqual([]);
  });

  it.each([
    { hasApiKey: true, exitCode: 17 },
    { hasApiKey: false, exitCode: 0 },
  ])(
    'injects optional production security credentials and propagates exit $exitCode',
    ({ hasApiKey, exitCode }) => {
      const workflow = parseYaml(
        readFileSync(resolve(WORKFLOW_DIR, 'production-release.yml'), 'utf8')
      );
      const job = workflow.jobs['promote-production'];
      const step = job.steps.find(
        step => step.name === 'Security gate before production promotion'
      );
      expect(step.env.DOPPLER_TOKEN).toBe('${{ secrets.DOPPLER_TOKEN_PRD }}');
      expect(step.env).not.toHaveProperty('LINEAR_API_KEY');
      expect(job.steps).toContainEqual({
        uses: './.github/actions/setup-doppler',
      });

      const root = mkdtempSync(resolve(tmpdir(), 'production-security-gate-'));
      try {
        writeFileSync(
          resolve(root, 'doppler'),
          `#!/bin/bash
set -euo pipefail
[[ "$*" == 'run --project jovie-web --config prd --only-secrets=LINEAR_API_KEY --no-exit-on-missing-only-secrets --no-fallback -- env -u DOPPLER_TOKEN node scripts/security/security-gate.mjs' ]]
[[ "$DOPPLER_TOKEN" == 'test-production-token' ]]
if [[ "$TEST_HAS_API_KEY" == 'true' ]]; then
  export LINEAR_API_KEY=test-linear-key
fi
while [[ "$1" != '--' ]]; do shift; done
shift
exec "$@"
`,
          { mode: 0o755 }
        );
        writeFileSync(
          resolve(root, 'node'),
          `#!/bin/bash
set -euo pipefail
[[ "$1" == 'scripts/security/security-gate.mjs' ]]
if [[ "$TEST_HAS_API_KEY" == 'true' ]]; then
  [[ "$LINEAR_API_KEY" == 'test-linear-key' ]]
else
  [[ -z "\${LINEAR_API_KEY+x}" ]]
fi
[[ -z "\${DOPPLER_TOKEN+x}" ]]
[[ "$GH_TOKEN" == 'test-github-token' ]]
[[ "$SECURITY_GATE_ENABLED" == 'true' ]]
[[ "$SECURITY_GATE_MODE" == 'production' ]]
[[ "$SECURITY_GATE_HEAD" == 'test-head' ]]
exit "$TEST_EXIT_CODE"
`,
          { mode: 0o755 }
        );
        const result = spawnSync(
          'bash',
          ['-e', '-o', 'pipefail', '-c', step.run],
          {
            cwd: REPO_ROOT,
            env: {
              PATH: `${root}${delimiter}${process.env.PATH}`,
              DOPPLER_TOKEN: 'test-production-token',
              GH_TOKEN: 'test-github-token',
              SECURITY_GATE_ENABLED: 'true',
              SECURITY_GATE_MODE: 'production',
              SECURITY_GATE_HEAD: 'test-head',
              TEST_HAS_API_KEY: String(hasApiKey),
              TEST_EXIT_CODE: String(exitCode),
            },
            encoding: 'utf8',
            timeout: 5000,
          }
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(exitCode);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it('keeps no stale names in the contract', () => {
    expect([...allowed].filter(name => !used.has(name))).toEqual([]);
  });

  it('keeps the contract sorted and unique', () => {
    expect(CONTRACT.secrets).toEqual([...allowed].sort());
  });

  it('reads both dot-access secret references', () => {
    expect(
      secretNamesIn(
        '${{ secrets.VERCEL_TOKEN }} ${{secrets.SENTRY_AUTH_TOKEN}}'
      )
    ).toEqual(['VERCEL_TOKEN', 'SENTRY_AUTH_TOKEN']);
  });

  it('rejects bracket access, which this contract cannot see', () => {
    const bracket = [...jobs]
      .filter(([, { source }]) => /secrets\[/.test(source))
      .map(([job]) => job);
    expect(bracket).toEqual([]);
  });
});
