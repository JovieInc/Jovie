import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);
const NEXT_BUILD_CACHE_WARM_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/next-build-cache-warm.yml'),
  'utf8'
);

function getJobBlock(workflow, jobKey) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);

  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

describe('Next build cache contract (web and Ovie)', () => {
  it('restores the Build+Layout Turbopack cache read-only and writes it only from trusted main', () => {
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    const stepAt = name => buildLayout.indexOf(`      - name: ${name}\n`);
    const step = name => {
      const start = stepAt(name);
      expect(start, name).toBeGreaterThan(-1);
      const next = buildLayout.indexOf('\n      - ', start + 1);
      return buildLayout.slice(start, next === -1 ? undefined : next);
    };
    const restore = step('Restore Next build cache (read-only)');
    const measure = step('Measure Next build cache (trusted main only)');
    const save = step('Save Next build cache (trusted main only)');
    const trustedMain =
      "success() && github.event_name == 'push' && github.ref == 'refs/heads/main'";

    // Restore runs on every event and happens before the build it warms.
    expect(stepAt('Restore Next build cache (read-only)')).toBeLessThan(
      stepAt('Build exact combined head')
    );
    expect(restore).toContain('uses: actions/cache/restore@');
    expect(restore).not.toMatch(/^\s+if:/m);
    expect(restore).toContain('path: apps/web/.next/cache/turbopack');
    expect(restore).toContain(
      "key: ${{ runner.os }}-next-build-web-v1-${{ hashFiles('pnpm-lock.yaml', 'apps/web/package.json', 'apps/web/next.config.js') }}-${{ steps.next-build-cache-hour.outputs.hour }}"
    );
    expect(restore).toMatch(/^\s+\$\{\{ runner\.os \}\}-next-build-web-v1-$/m);

    // Only compiler state is cached: never fetch/image caches or build output.
    expect(buildLayout).not.toMatch(/path: apps\/web\/\.next\/cache\s*$/m);
    expect(buildLayout).not.toContain('uses: actions/cache@');

    // Writes happen after the layout guard, only from trusted main pushes,
    // only on a primary-key miss, and only below the size bound.
    expect(stepAt('Run deterministic layout behavior guard')).toBeLessThan(
      stepAt('Save Next build cache (trusted main only)')
    );
    expect(measure).toContain(`if: \${{ ${trustedMain} &&`);
    expect(measure).toContain(
      "steps.next-build-cache.outputs.cache-hit != 'true'"
    );
    expect(measure).toContain("NEXT_BUILD_CACHE_MAX_BYTES: '3221225472'");
    expect(measure).toContain('must not be a symlink');
    expect(save).toContain(`if: \${{ ${trustedMain} &&`);
    expect(save).toContain(
      "steps.next-build-cache-size.outputs.eligible == 'true'"
    );
    expect(save).toContain('uses: actions/cache/save@');
    expect(save).toContain('path: apps/web/.next/cache/turbopack');
    expect(save).toContain(
      'key: ${{ steps.next-build-cache.outputs.cache-primary-key }}'
    );
    expect(buildLayout.match(/actions\/cache\/save@/g)).toHaveLength(1);
    // Non-saving runs skip the cache write; push must still persist it.
    expect(step('Build exact combined head')).toContain(
      '[ "$GITHUB_EVENT_NAME" = push ] || export TURBO_ENGINE_READ_ONLY=1\n'
    );
    expect(buildLayout).not.toContain('pull_request_target');
    expect(buildLayout).not.toContain('secrets.');
  });

  it('writes the Build+Layout Turbopack cache only from a trusted-main warmer with the identical key', () => {
    const warm = NEXT_BUILD_CACHE_WARM_WORKFLOW;
    const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');
    const stepIn = (block, name) => {
      const start = block.indexOf(`      - name: ${name}\n`);
      expect(start, name).toBeGreaterThan(-1);
      const next = block.indexOf('\n      - ', start + 1);
      return block.slice(start, next === -1 ? undefined : next);
    };
    const stepAt = name => warm.indexOf(`      - name: ${name}\n`);
    const keyLines = step =>
      step
        .split('\n')
        .filter(line => line.includes('-next-build-web-v1-'))
        .map(line => line.trim());

    // Triggers: only push to main and manual dispatch. No PR, fork,
    // merge-group or workflow_run code can reach the save step.
    const header = warm.slice(0, warm.indexOf('\njobs:'));
    expect(header).toMatch(
      /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n\npermissions:/m
    );
    for (const trigger of [
      'pull_request',
      'pull_request_target',
      'merge_group',
      'workflow_run',
      'schedule',
    ]) {
      expect(header).not.toMatch(new RegExp(`^\\s+${trigger}:`, 'm'));
    }
    expect(header).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(header).toContain('group: next-build-cache-warm-${{ github.ref }}');
    expect(warm).not.toContain('secrets.');
    expect(warm).not.toContain('TURBO_TOKEN');
    expect(warm).toContain('persist-credentials: false');
    expect(warm).toMatch(/runs-on: ubuntu-(?:latest|24\.04)/);

    const job = getJobBlock(warm, 'warm');
    expect(job).toContain("github.ref == 'refs/heads/main' &&");
    expect(job).toContain(
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')"
    );

    // Key scheme is byte-identical to the Build + Layout restore.
    const ciRestore = stepIn(
      buildLayout,
      'Restore Next build cache (read-only)'
    );
    const lookup = stepIn(warm, "Look up this hour's Next build cache");
    expect(keyLines(ciRestore)).toHaveLength(3);
    expect(keyLines(lookup)).toEqual(keyLines(ciRestore).slice(0, 1));

    // The warmer always compiles cold. Building on top of a restored older
    // entry grew the cache past the 3 GiB save bound (3.51-3.54 GB vs 2.37 GB
    // cold), so the warmer rebuilt on every main push and never saved.
    expect(warm.match(/actions\/cache\/restore@/g)).toHaveLength(2);
    expect(job.match(/actions\/cache\/restore@/g)).toHaveLength(1);
    expect(warm).not.toContain('restore-keys:');
    const dayRun = step =>
      step.split('\n').find(line => line.trim().startsWith('run:'));
    expect(dayRun(stepIn(warm, 'Resolve Next build cache hour'))).toBe(
      dayRun(stepIn(buildLayout, 'Resolve Next build cache hour'))
    );
    // Hourly keys keep merge groups on a recent main; older hours still
    // restore through the hash prefix.
    expect(dayRun(stepIn(warm, 'Resolve Next build cache hour'))).toContain(
      'hour=$(date -u +%Y%m%d%H)'
    );
    expect(lookup).toContain('path: apps/web/.next/cache/turbopack');

    // Lookup-only early exit: nothing heavy runs on an exact-key hit.
    expect(lookup).toContain('lookup-only: true');
    expect(lookup).not.toMatch(/^\s+if:/m);
    const miss = "steps.next-build-cache-lookup.outputs.cache-hit != 'true'";
    const setupAt = warm.indexOf('- uses: ./.github/actions/setup-node-pnpm');
    expect(stepAt("Look up this hour's Next build cache")).toBeLessThan(
      setupAt
    );
    expect(
      warm.slice(setupAt, warm.indexOf('\n      - ', setupAt + 1))
    ).toContain(miss);
    for (const name of [
      'Build web for cache',
      'Measure Next build cache (trusted main only)',
    ]) {
      expect(stepIn(warm, name), name).toContain(miss);
    }

    // Same web build and public mock env as the combined head build.
    const build = stepIn(warm, 'Build web for cache');
    expect(build).toContain('run: pnpm turbo build --filter=@jovie/web\n');
    expect(warm).not.toContain('TURBO_ENGINE_READ_ONLY');
    const envLines = step =>
      step.split('\n').filter(line => /^ {10}NEXT_[A-Z_]+:/.test(line));
    const ciBuild = stepIn(buildLayout, 'Build exact combined head');
    expect(envLines(build).length).toBeGreaterThan(0);
    expect(envLines(build)).toEqual(envLines(ciBuild));

    // The homepage visual compare restores the same entry, so it builds with
    // the same NEXT_* env and task hash. NEXT_DISABLE_TOOLBAR is the one extra:
    // turbo does not hash it and the homepage baselines render without the
    // cookie banner it disables. No DATABASE_URL/VERCEL_ENV pass-through.
    const visualBuild = stepIn(
      getJobBlock(CI_WORKFLOW, 'ci-visual-snapshot-compare'),
      'Build homepage for rendered snapshot compare'
    );
    expect(envLines(visualBuild)).toEqual([
      ...envLines(build),
      "          NEXT_DISABLE_TOOLBAR: '1'",
    ]);
    expect(visualBuild).not.toMatch(/^ {10}(DATABASE_URL|VERCEL_ENV):/m);

    // Size/symlink guard and a single trusted-main save of the primary key.
    const measure = stepIn(
      warm,
      'Measure Next build cache (trusted main only)'
    );
    const save = stepIn(warm, 'Save Next build cache (trusted main only)');
    expect(measure).toContain("NEXT_BUILD_CACHE_MAX_BYTES: '3221225472'");
    expect(measure).toContain('must not be a symlink');
    expect(stepAt('Build web for cache')).toBeLessThan(
      stepAt('Save Next build cache (trusted main only)')
    );
    expect(save).toContain(
      "if: ${{ success() && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main' && steps.next-build-cache-size.outputs.eligible == 'true' }}"
    );
    expect(save).toContain('path: apps/web/.next/cache/turbopack');
    expect(save).toContain(
      'key: ${{ steps.next-build-cache-lookup.outputs.cache-primary-key }}'
    );
    expect(warm.match(/actions\/cache\/save@/g)).toHaveLength(2);
    expect(job.match(/actions\/cache\/save@/g)).toHaveLength(1);
    expect(warm).not.toContain('uses: actions/cache@');

    // Every pinned action SHA is one ci.yml already uses.
    const pins = source =>
      new Set(source.match(/uses: actions\/[\w/-]+@[0-9a-f]{40}/g));
    const ciPins = pins(CI_WORKFLOW);
    expect(pins(warm).size).toBeGreaterThan(0);
    for (const pin of pins(warm)) expect(ciPins.has(pin), pin).toBe(true);
  });

  it('restores the Ovie Turbopack cache read-only and writes it only from trusted main', () => {
    const build = getJobBlock(CI_WORKFLOW, 'ci-build-ovie');
    const stepAt = name => build.indexOf(`      - name: ${name}\n`);
    const step = name => {
      const start = stepAt(name);
      expect(start, name).toBeGreaterThan(-1);
      const next = build.indexOf('\n      - ', start + 1);
      return build.slice(start, next === -1 ? undefined : next);
    };
    const restore = step('Restore Ovie Next build cache (read-only)');
    const measure = step('Measure Ovie Next build cache (trusted main only)');
    const save = step('Save Ovie Next build cache (trusted main only)');
    const trustedMain =
      "success() && github.event_name == 'push' && github.ref == 'refs/heads/main'";

    // Restore runs on every event (when the app is present) and happens
    // before the build it warms. A miss must not fail the job: the restore
    // action succeeds on a miss and has no continue-on-error / fail gate.
    expect(stepAt('Restore Ovie Next build cache (read-only)')).toBeLessThan(
      stepAt('Build independent Ovie app')
    );
    expect(restore).toContain('uses: actions/cache/restore@');
    expect(restore).toContain("if: hashFiles('apps/ovie/package.json') != ''");
    expect(restore).not.toContain('continue-on-error');
    expect(restore).toContain('path: apps/ovie/.next/cache/turbopack');
    expect(restore).toContain(
      "key: ${{ runner.os }}-next-build-ovie-v1-${{ hashFiles('pnpm-lock.yaml', 'apps/ovie/package.json', 'apps/ovie/next.config.mjs') }}-${{ steps.ovie-next-build-cache-hour.outputs.hour }}"
    );
    expect(restore).toMatch(/^\s+\$\{\{ runner\.os \}\}-next-build-ovie-v1-$/m);

    // Only compiler state is cached: never fetch/image caches or build output.
    expect(build).not.toMatch(/path: apps\/ovie\/\.next\/cache\s*$/m);
    expect(build).not.toContain('uses: actions/cache@');

    // Writes happen after the build, only from trusted main pushes, only
    // on a primary-key miss, and only below the size bound. PR / merge-group
    // runs never reach the save step, so they cannot poison the shared key.
    expect(stepAt('Build independent Ovie app')).toBeLessThan(
      stepAt('Save Ovie Next build cache (trusted main only)')
    );
    expect(measure).toContain(`if: \${{ ${trustedMain} &&`);
    expect(measure).toContain(
      "steps.ovie-next-build-cache.outputs.cache-hit != 'true'"
    );
    expect(measure).toContain("NEXT_BUILD_CACHE_MAX_BYTES: '3221225472'");
    expect(measure).toContain('must not be a symlink');
    expect(save).toContain(`if: \${{ ${trustedMain} &&`);
    expect(save).toContain(
      "steps.ovie-next-build-cache-size.outputs.eligible == 'true'"
    );
    expect(save).toContain('uses: actions/cache/save@');
    expect(save).toContain('path: apps/ovie/.next/cache/turbopack');
    expect(save).toContain(
      'key: ${{ steps.ovie-next-build-cache.outputs.cache-primary-key }}'
    );
    expect(build.match(/actions\/cache\/save@/g)).toHaveLength(1);
    // Non-saving runs skip the cache write; push must still persist it.
    expect(step('Build independent Ovie app')).toContain(
      '[ "$GITHUB_EVENT_NAME" = push ] || export TURBO_ENGINE_READ_ONLY=1\n'
    );
    expect(build).not.toContain('pull_request_target');
    expect(build).not.toContain('secrets.');
  });

  it('writes the Ovie Turbopack cache only from a trusted-main warmer with the identical key', () => {
    const warm = NEXT_BUILD_CACHE_WARM_WORKFLOW;
    const buildOvie = getJobBlock(CI_WORKFLOW, 'ci-build-ovie');
    const job = getJobBlock(warm, 'warm-ovie');
    const stepIn = (block, name) => {
      const start = block.indexOf(`      - name: ${name}\n`);
      expect(start, name).toBeGreaterThan(-1);
      const next = block.indexOf('\n      - ', start + 1);
      return block.slice(start, next === -1 ? undefined : next);
    };
    const stepAt = name => job.indexOf(`      - name: ${name}\n`);
    const keyLines = step =>
      step
        .split('\n')
        .filter(line => line.includes('-next-build-ovie-v1-'))
        .map(line => line.trim());

    expect(job).toContain("github.ref == 'refs/heads/main' &&");
    expect(job).toContain(
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')"
    );
    expect(job).not.toContain('secrets.');
    expect(job).not.toContain('TURBO_TOKEN');
    expect(job).toContain('persist-credentials: false');
    expect(job).toMatch(/runs-on: ubuntu-(?:latest|24\.04)/);

    // Key scheme is byte-identical to the Ovie Build restore.
    const ciRestore = stepIn(
      buildOvie,
      'Restore Ovie Next build cache (read-only)'
    );
    const lookup = stepIn(job, "Look up this hour's Ovie Next build cache");
    expect(keyLines(ciRestore)).toHaveLength(3);
    expect(keyLines(lookup)).toEqual(keyLines(ciRestore).slice(0, 1));

    // The warmer always compiles cold and looks up only the exact primary
    // key (no restore-keys), same as the web warmer.
    expect(job.match(/actions\/cache\/restore@/g)).toHaveLength(1);
    expect(job).not.toContain('restore-keys:');
    const dayRun = step =>
      step.split('\n').find(line => line.trim().startsWith('run:'));
    expect(dayRun(stepIn(job, 'Resolve Ovie Next build cache hour'))).toBe(
      dayRun(stepIn(buildOvie, 'Resolve Ovie Next build cache hour'))
    );
    expect(dayRun(stepIn(job, 'Resolve Ovie Next build cache hour'))).toContain(
      'hour=$(date -u +%Y%m%d%H)'
    );
    expect(lookup).toContain('path: apps/ovie/.next/cache/turbopack');

    // Lookup-only early exit: nothing heavy runs on an exact-key hit.
    expect(lookup).toContain('lookup-only: true');
    expect(lookup).not.toMatch(/^\s+if:/m);
    const miss =
      "steps.ovie-next-build-cache-lookup.outputs.cache-hit != 'true'";
    const setupAt = job.indexOf('- uses: ./.github/actions/setup-node-pnpm');
    expect(stepAt("Look up this hour's Ovie Next build cache")).toBeLessThan(
      setupAt
    );
    expect(
      job.slice(setupAt, job.indexOf('\n      - ', setupAt + 1))
    ).toContain(miss);
    for (const name of [
      'Build Ovie for cache',
      'Measure Ovie Next build cache (trusted main only)',
    ]) {
      expect(stepIn(job, name), name).toContain(miss);
    }

    // Same Ovie build and public env as the combined Ovie build. The warmer
    // must not set TURBO_ENGINE_READ_ONLY, or the cache would stay empty.
    const build = stepIn(job, 'Build Ovie for cache');
    expect(build).toContain(
      'run: NEXT_IGNORE_TYPECHECK=1 pnpm --filter @jovie/ovie build\n'
    );
    expect(job).not.toContain('TURBO_ENGINE_READ_ONLY');
    const envLines = step =>
      step.split('\n').filter(line => /^ {10}NEXT_[A-Z_]+:/.test(line));
    const ciBuild = stepIn(buildOvie, 'Build independent Ovie app');
    expect(envLines(build).length).toBeGreaterThan(0);
    expect(envLines(build)).toEqual(envLines(ciBuild));

    // Size/symlink guard and a single trusted-main save of the primary key.
    const measure = stepIn(
      job,
      'Measure Ovie Next build cache (trusted main only)'
    );
    const save = stepIn(job, 'Save Ovie Next build cache (trusted main only)');
    expect(measure).toContain("NEXT_BUILD_CACHE_MAX_BYTES: '3221225472'");
    expect(measure).toContain('must not be a symlink');
    expect(stepAt('Build Ovie for cache')).toBeLessThan(
      stepAt('Save Ovie Next build cache (trusted main only)')
    );
    expect(save).toContain(
      "if: ${{ success() && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main' && steps.ovie-next-build-cache-size.outputs.eligible == 'true' }}"
    );
    expect(save).toContain('path: apps/ovie/.next/cache/turbopack');
    expect(save).toContain(
      'key: ${{ steps.ovie-next-build-cache-lookup.outputs.cache-primary-key }}'
    );
    expect(job.match(/actions\/cache\/save@/g)).toHaveLength(1);
    expect(job).not.toContain('uses: actions/cache@');
  });
});
