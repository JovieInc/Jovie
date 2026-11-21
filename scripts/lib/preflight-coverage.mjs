import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shellQuote } from './preflight-shell.mjs';

/**
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, base: string, head: string,
 *   sh: (command: string, options: {cwd: string, env: NodeJS.ProcessEnv, timeoutMs?: number}) => Promise<{code: number, out: string, ms: number}>,
 *   hostSlotted: (command: string) => string }} options
 */
export async function runPreflightCoverage({
  cwd,
  env,
  base,
  head,
  sh,
  hostSlotted,
}) {
  const plan = await sh(
    `node scripts/check-changed-test-coverage.mjs --base ${base} --head ${head} --plan`,
    { cwd, env }
  );
  let parsed;
  try {
    parsed = JSON.parse(plan.out.trim().split('\n').pop());
  } catch {
    return { code: 1, out: plan.out, ms: plan.ms };
  }
  if (!parsed.applicable)
    return {
      skip: 'no coverable web product source',
      code: 0,
      out: '',
      ms: plan.ms,
    };
  const e = {
    ...env,
    JOVIE_COVERAGE_INCLUDE: (parsed.coverageInclude ?? []).join('\n'),
    JOVIE_COVERAGE_RELATED_TESTS: (parsed.relatedTests ?? []).join('\n'),
  };
  // A cancelled Vitest can leave a live or zombie owner on its report lock.
  // Own this invocation's evidence instead of deleting another owner's lock.
  const reportsDirectory = mkdtempSync(
    path.join(env.TMPDIR || tmpdir(), 'preflight-coverage-')
  );
  try {
    const run = await sh(
      hostSlotted(
        `pnpm --filter @jovie/web test:coverage --changed ${base} --bail 1 --testTimeout=60000 --retry=1 --coverage.reportsDirectory=${shellQuote(reportsDirectory)} && node scripts/check-changed-test-coverage.mjs --base ${base} --head ${head} --coverage ${shellQuote(path.join(reportsDirectory, 'coverage-final.json'))}`
      ),
      { cwd, env: e, timeoutMs: 900_000 }
    );
    return {
      ...run,
      ms: run.ms + plan.ms,
      note: 'covers committed lines; commit first',
    };
  } finally {
    rmSync(reportsDirectory, { recursive: true, force: true });
  }
}
