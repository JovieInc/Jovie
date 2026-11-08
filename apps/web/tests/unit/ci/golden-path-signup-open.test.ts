import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Golden Path job environment', () => {
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
});
