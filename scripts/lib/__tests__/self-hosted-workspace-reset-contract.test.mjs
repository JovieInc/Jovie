import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const { load } = createRequire(import.meta.url)('js-yaml');
const dir = resolve(import.meta.dirname, '../../../.github/workflows');
const isChecked = step => /actions\/checkout/.test(step.uses ?? '');
const resets = step => /sparse-checkout disable/.test(step.run ?? '');

// Fixed self-hosted runners reuse one workspace. A sparse checkout left by one job hides
// .github/scripts from the next full checkout (Production Controller run 40893280985,
// bash: .github/scripts/gh-api-hold.sh: No such file or directory, exit 127).
function pooledJobs() {
  const found = [];
  for (const file of readdirSync(dir).filter(n => /\.ya?ml$/.test(n))) {
    const workflow = load(readFileSync(resolve(dir, file), 'utf8'));
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      const runsOn = JSON.stringify(job['runs-on'] ?? '');
      if (/macos|mac-child|jovie-mac/i.test(runsOn)) continue;
      if (/self-hosted|jovie-fixed|jovie-runner/.test(runsOn))
        found.push({ file, name, steps: job.steps ?? [] });
    }
  }
  return found;
}

// pr-size-guard.yml's size jobs are pinned byte-for-byte by merge-group-size-bootstrap-contract, so they
// cannot carry a clearing step; every consumer that needs a full tree resets before its checkout instead.
const PINNED_SPARSE_JOBS = new Set([
  'pr-size-guard.yml:merge-group-size',
  'pr-size-guard.yml:merge-group-workflow-load',
]);

describe('self-hosted workspace reset contract', () => {
  it('every pooled job that sparse-checks-out clears sparse state afterwards (if: always())', () => {
    for (const { file, name, steps } of pooledJobs()) {
      if (PINNED_SPARSE_JOBS.has(`${file}:${name}`)) continue;
      if (!steps.some(s => isChecked(s) && s.with?.['sparse-checkout']))
        continue;
      const last = steps.filter(resets).at(-1);
      expect(
        last,
        `${file}:${name} leaves a sparse checkout on the shared workspace`
      ).toBeTruthy();
      expect(String(last.if)).toContain('always()');
      expect(steps.indexOf(last)).toBeGreaterThan(
        steps.findLastIndex(s => isChecked(s) && s.with?.['sparse-checkout'])
      );
    }
  });

  it('every pooled job that runs .github/scripts/* from a full checkout resets sparse state first', () => {
    for (const { file, name, steps } of pooledJobs()) {
      const uses = JSON.stringify(steps.map(s => s.run ?? '')).includes(
        '.github/scripts/'
      );
      const full = steps.findIndex(
        s => isChecked(s) && !s.with?.['sparse-checkout']
      );
      if (!uses || full < 0) continue;
      expect(
        steps.slice(0, full).some(resets),
        `${file}:${name} runs .github/scripts/* but a stale sparse checkout could hide them`
      ).toBe(true);
    }
  });

  it('every pooled job that sparse-checks-out and runs .github/scripts/* lists the path', () => {
    for (const { file, name, steps } of pooledJobs()) {
      const sparse = steps.filter(
        s => isChecked(s) && s.with?.['sparse-checkout']
      );
      const text = JSON.stringify(steps.map(s => s.run ?? ''));
      for (const [, path] of text.matchAll(/\.github\/scripts\/([\w.-]+)/g)) {
        if (!sparse.length) continue;
        expect(
          sparse.some(s =>
            s.with['sparse-checkout'].includes(`.github/scripts/${path}`)
          ),
          `${file}:${name} runs .github/scripts/${path} without checking it out`
        ).toBe(true);
      }
    }
  });
});
