import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Step = {
  name?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  'continue-on-error'?: boolean;
};
type Workflow = { jobs: Record<string, { steps: Step[] }> };

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const workflow = (name: string) =>
  parseYaml(
    readFileSync(resolve(REPO_ROOT, '.github/workflows', name), 'utf8')
  ) as Workflow;

const BUDGET_STEP = 'Enforce authed route initial JS budgets';
const RENDER_STEP = 'Enforce route render modes and HTML weight';
const BUDGET_RUN =
  'node apps/web/scripts/route-js-budget.mjs --next-dir apps/web/.next';
const RENDER_RUN =
  'node apps/web/scripts/route-render-modes.mjs --next-dir apps/web/.next';

/** The two jobs that build the web app with the secret-free mock env. */
const JOBS = [
  {
    label: 'source-validation.yml#coverage (PR head)',
    steps: workflow('source-validation.yml').jobs.coverage.steps,
    build: 'Build exact PR head',
  },
  {
    label: 'ci.yml#ci-build-layout (combined head)',
    steps: workflow('ci.yml').jobs['ci-build-layout'].steps,
    build: 'Build exact combined head',
  },
];

describe('build-output performance ratchets are wired as blocking steps', () => {
  it.each(JOBS)(
    '$label runs both ratchets after its build',
    ({ steps, build }) => {
      const names = steps.map(step => step.name);
      const budget = steps.find(step => step.name === BUDGET_STEP);
      const render = steps.find(step => step.name === RENDER_STEP);
      expect(budget?.run).toBe(BUDGET_RUN);
      expect(render?.run).toBe(RENDER_RUN);
      expect(names.indexOf(BUDGET_STEP)).toBeGreaterThan(names.indexOf(build));
      expect(names.indexOf(RENDER_STEP)).toBeGreaterThan(
        names.indexOf(BUDGET_STEP)
      );
      // Same condition as the budget step, so a build that ran is always read.
      expect(render?.if).toBe(budget?.if);
      for (const step of [budget, render]) {
        expect(step?.['continue-on-error']).toBeUndefined();
        expect(step?.run).not.toMatch(/\|\|\s*true|--write|--init/);
        // Build output only: no secrets, no deployment, no network.
        expect(JSON.stringify(step?.env ?? {})).not.toMatch(/secrets\./);
      }
    }
  );

  it('measures the same hermetic build in both jobs', () => {
    const [pr, queue] = JOBS.map(({ steps, build }) => {
      const env = steps.find(step => step.name === build)?.env ?? {};
      return Object.fromEntries(
        Object.entries(env).filter(([key]) => /^NEXT_/.test(key))
      );
    });
    expect(pr).toEqual(queue);
    expect(pr).toMatchObject({
      NEXT_PUBLIC_AUTH_MOCK: '1',
      NEXT_PUBLIC_E2E_MODE: '1',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3230',
    });
    expect(JSON.stringify(pr)).not.toMatch(/secrets\.|vars\./);
  });

  it('ships the scripts and committed baselines the steps read', () => {
    for (const file of [
      'apps/web/scripts/route-js-budget.mjs',
      'apps/web/scripts/route-js-budgets.json',
      'apps/web/scripts/route-render-modes.mjs',
      'apps/web/scripts/route-render-modes.json',
    ])
      expect(existsSync(resolve(REPO_ROOT, file)), file).toBe(true);
  });
});
