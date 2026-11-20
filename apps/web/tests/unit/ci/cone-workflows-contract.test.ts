import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { CONE_WORKFLOWS } from '@/lib/acquisition/eligibility.server';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowsDir = resolve(repoRoot, '.github/workflows');

interface ParsedWorkflow {
  readonly name?: string;
  readonly on?: Record<string, unknown> | string | readonly string[];
  readonly permissions?: Record<string, string>;
  readonly jobs?: Record<
    string,
    {
      readonly name?: string;
      readonly 'runs-on'?: string | readonly string[];
      readonly permissions?: Record<string, string>;
      readonly steps?: readonly {
        readonly name?: string;
        readonly uses?: string;
        readonly run?: string;
        readonly 'continue-on-error'?: boolean;
      }[];
    }
  >;
}

describe('CONE_WORKFLOWS GitHub Actions wiring contract', () => {
  it('resolves every workflow file (and #Job Name selector) in CONE_WORKFLOWS to a real .github/workflows definition', () => {
    const entries = Object.entries(CONE_WORKFLOWS);
    expect(entries.length).toBeGreaterThanOrEqual(3);

    for (const [coneKey, workflowSpec] of entries) {
      const [workflowFile, expectedJobName] = workflowSpec.split('#', 2);
      expect(
        workflowFile,
        `CONE_WORKFLOWS.${coneKey} must specify a workflow filename`
      ).toMatch(/^[a-z0-9._-]+\.ya?ml$/i);

      const fullPath = resolve(workflowsDir, workflowFile);
      expect(
        existsSync(fullPath),
        `CONE_WORKFLOWS.${coneKey} references missing workflow .github/workflows/${workflowFile}`
      ).toBe(true);

      const parsed = parseYaml(
        readFileSync(fullPath, 'utf8')
      ) as ParsedWorkflow;
      const jobs = Object.values(parsed.jobs ?? {});
      expect(
        jobs.length,
        `.github/workflows/${workflowFile} must define at least one job`
      ).toBeGreaterThan(0);

      if (expectedJobName) {
        const matchingJob = jobs.find(job => job.name === expectedJobName);
        expect(
          matchingJob,
          `CONE_WORKFLOWS.${coneKey} (${workflowSpec}) found no job named "${expectedJobName}" in .github/workflows/${workflowFile}`
        ).toBeDefined();
      }
    }
  });

  it('keeps buyer-eval-gate.yml hermetic, read-only, and fail-closed on scripts/buyer-eval/gate.mjs', () => {
    const buyerEvalFile = CONE_WORKFLOWS.buyerEval.split('#', 1)[0];
    const raw = readFileSync(resolve(workflowsDir, buyerEvalFile), 'utf8');
    const parsed = parseYaml(raw) as ParsedWorkflow;

    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(parsed.on).toHaveProperty('workflow_dispatch');
    expect(parsed.on).not.toHaveProperty('schedule');

    const job = parsed.jobs?.['buyer-eval-gate'];
    expect(job).toBeDefined();
    expect(job?.['runs-on']).toBe('ubuntu-24.04');
    expect(job?.permissions).toEqual({ contents: 'read' });

    const steps = job?.steps ?? [];
    for (const step of steps) {
      expect(step['continue-on-error']).toBeFalsy();
      if (step.uses && !step.uses.startsWith('./')) {
        expect(
          step.uses,
          `external action ${step.uses} must be pinned to a 40-char commit SHA`
        ).toMatch(/^[^@]+@[0-9a-f]{40}$/);
      }
    }

    const contractTestStep = steps.find(step =>
      step.run?.includes('scripts/buyer-eval/gate.test.mjs')
    );
    expect(contractTestStep?.run).toContain(
      'scripts/buyer-eval/buyer-eval.test.mjs'
    );

    const gateStep = steps.find(step =>
      step.run?.includes('node scripts/buyer-eval/gate.mjs')
    );
    expect(gateStep).toBeDefined();
    expect(gateStep?.run).toContain('exit "$status"');
    expect(gateStep?.run).not.toMatch(/\|\|\s*true\b/);
    expect(gateStep?.run).not.toMatch(/exit\s+0\b/);
  });
});
