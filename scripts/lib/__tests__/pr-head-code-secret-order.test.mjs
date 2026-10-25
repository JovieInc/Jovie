// Guard (JOV-7998 secrets audit). A job that executes PR-head code must hold no
// secrets: the runner keeps every referenced secret in memory for the whole
// job, so step ordering is not a boundary. Secrets live in `security-trusted`,
// which only ever runs base-commit code and must never execute PR code.
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
const text = job => JSON.stringify(job);

describe('Source Validation secret boundary', () => {
  it('jobs that run PR-head code reference no secrets in any form', () => {
    for (const name of [
      'deterministic',
      'security',
      'migration',
      'coverage',
      'unit',
      'a11y',
    ]) {
      const job = wf.jobs[name];
      expect(job, name).toBeDefined();
      expect(
        /\$\{\{[^}]*\bsecrets\b/.test(text(job)),
        `${name} references secrets`
      ).toBe(false);
    }
  });

  it('the trusted job never checks out or executes the PR head', () => {
    const job = wf.jobs['security-trusted'];
    const steps = job.steps;
    const checkouts = steps.filter(s =>
      String(s.uses ?? '').includes('actions/checkout')
    );
    for (const c of checkouts) {
      expect(String(c.with.ref)).toMatch(/pull_request\.base\.sha/);
    }
    expect(steps.some(s => String(s.uses ?? '').startsWith('./'))).toBe(false);
    expect(
      /pnpm|npm (ci|install)|yarn/.test(steps.map(s => s.run ?? '').join('\n'))
    ).toBe(false);
    const gate = steps.map(s => s.run ?? '').join('\n');
    expect(gate).toMatch(/node scripts\/security\/security-gate\.mjs/);
    expect(gate).toMatch(/git fetch --no-tags origin "\$HEAD_SHA"/);
  });

  it('PR Ready requires the trusted job', () => {
    expect(wf.jobs.ready.needs).toContain('security-trusted');
  });
});
