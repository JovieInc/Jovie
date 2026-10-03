import { execFileSync, spawnSync } from 'node:child_process';
const base = '20a3b98515142ac4d9a815c7e2ebb85fa20156fc';
const head = 'db74d3d62295f44dd747e0678fe84d4fdb08b083';
const plan = JSON.parse(execFileSync('node', ['scripts/check-changed-test-coverage.mjs', '--plan', '--base', base, '--head', head], { encoding: 'utf8' }));
const run = spawnSync('pnpm', ['--filter', '@jovie/web', 'test:coverage', '--changed', base, '--bail', '1', '--maxWorkers=1'], {
  stdio: 'inherit', env: { ...process.env, CI: 'true', JOVIE_COVERAGE_INCLUDE: plan.coverageInclude.join('\n'), JOVIE_COVERAGE_RELATED_TESTS: plan.relatedTests.join('\n') }
});
if (run.status !== 0) process.exit(run.status ?? 1);
const check = spawnSync('node', ['scripts/check-changed-test-coverage.mjs', '--base', base, '--head', head], { stdio: 'inherit' });
process.exit(check.status ?? 1);
