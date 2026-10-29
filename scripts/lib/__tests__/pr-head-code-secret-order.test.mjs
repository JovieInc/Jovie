// JOV-7998. A secret-bearing job must not execute PR-head code.
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const wf = load(
  readFileSync(
    new URL(
      '../../../.github/workflows/source-validation.yml',
      import.meta.url
    ),
    'utf8'
  )
);
const runs = job => (job.steps ?? []).map(step => step.run ?? '').join('\n');
const secret = job => /\$\{\{[^}]*\bsecrets\b/.test(JSON.stringify(job));

describe('Source Validation secret boundary', () => {
  it('secret jobs never execute PR-head code, and the scan holds none', () => {
    const jobs = Object.entries(wf.jobs).filter(([, job]) => secret(job));
    expect(jobs.map(([name]) => name)).toEqual(['security']);
    for (const [name, job] of jobs) {
      const steps = job.steps ?? [];
      expect(
        steps.some(step => String(step.uses ?? '').startsWith('./')),
        name
      ).toBe(false);
      expect(runs(job), name).not.toMatch(
        /pnpm|npm (ci|install)|yarn|scan-secrets\.sh/
      );
      expect(runs(job), name).toMatch(
        /node scripts\/security\/security-gate\.mjs/
      );
      for (const step of steps.filter(step =>
        String(step.uses ?? '').includes('actions/checkout')
      )) {
        expect(String(step.with.ref), name).toMatch(/base\.sha/);
        expect(String(step.with.ref), name).not.toMatch(/head\.sha/);
        expect(step.with['persist-credentials'], name).toBe(false);
      }
    }
    const holders = Object.entries(wf.jobs).filter(([, job]) =>
      /scan-secrets\.sh ci-pr/.test(runs(job))
    );
    expect(holders.map(([name]) => name)).toEqual(['unit']);
    const job = holders[0][1];
    expect(secret(job)).toBe(false);
    expect(runs(job)).toMatch(/verify-gitleaks-coverage\.sh/);
    expect(runs(job)).toMatch(/golden-path-lock\.mjs merge-gate/);
    const full = job.steps.find(step => step.with?.path === '.secret-scan');
    expect(String(full.with.ref)).toMatch(/head\.sha/);
    expect(Number(full.with['fetch-depth'])).toBe(0);
    expect(full.with['persist-credentials']).toBe(false);
    expect(wf.jobs['security-trusted']).toBeUndefined();
    expect(wf.jobs.ready.needs).toContain('security');
    expect(Object.keys(wf.jobs)).toEqual([
      'deterministic',
      'security',
      'migration',
      'coverage',
      'unit',
      'a11y',
      'ready',
    ]);
  });
});
