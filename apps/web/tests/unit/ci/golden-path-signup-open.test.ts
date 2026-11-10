import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('E2E jobs that run with public signup open', () => {
  it('runs with public signup open, because closed signup redirects anonymous /start before the journey begins', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../../.github/workflows/ci.yml'),
      'utf8'
    );
    const jobStart = workflow.indexOf('name: Golden Path (manual)');
    const nextJob = workflow.indexOf('name: Golden Path Report', jobStart);

    expect(jobStart).toBeGreaterThan(-1);
    expect(workflow.slice(jobStart, nextJob)).toContain(
      "FEATURE_PUBLIC_SIGNUP_CLOSED: 'false'"
    );
  });

  it('runs the nightly E2E matrix with public signup open and inverts only the closed-signup handoff', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../../.github/workflows/e2e-full-matrix.yml'),
      'utf8'
    );

    expect(workflow).toContain("FEATURE_PUBLIC_SIGNUP_CLOSED: 'false'");
    expect(workflow).toContain(
      'signup lands on the live waitlist role form while public signup is closed'
    );
  });
});
