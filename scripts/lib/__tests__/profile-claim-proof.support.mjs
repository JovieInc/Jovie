import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { expect } from 'vitest';
import { classifyProductLanes } from '../product-lane-classifier.mjs';

/**
 * @typedef {{jobs: {'ci-storybook-surfaces': {if: string,
 *   steps: Array<{name?: string, run?: string}>}}}} ProfileProofWorkflow
 */
export function assertProfileClaimProof() {
  const root = resolve(import.meta.dirname, '..', '..', '..');
  const spec = 'tests/e2e/storybook-profile-claim-name.spec.ts';
  const source = readFileSync(
    resolve(root, '.github/workflows/ci.yml'),
    'utf8'
  );
  const workflow = /** @type {ProfileProofWorkflow} */ (loadYaml(source));
  const surfaces = workflow.jobs['ci-storybook-surfaces'];
  const runner = surfaces.steps.find(
    step => step.name === 'Run surface elevation matrix (Storybook)'
  );
  const invocation = runner.run.match(
    /pnpm exec playwright test ([\s\S]*?)--config=playwright\.config\.storybook\.ts/
  );
  expect(invocation).not.toBeNull();
  expect(invocation[1].split(/\s+/).filter(path => path === spec)).toHaveLength(
    1
  );
  expect(existsSync(resolve(root, 'apps/web', spec))).toBe(true);
  for (const path of [
    'apps/web/components/features/profile/templates/ProfileCompactSurface.tsx',
    `apps/web/${spec}`,
  ]) {
    expect(classifyProductLanes([path]).selectedLanes, path).toEqual(['web']);
  }
  expect(surfaces.if).toContain("outputs.run_web == 'true'");
  expect(surfaces.if).toContain("github.event_name == 'merge_group'");
  expect(surfaces.if).toContain("github.event_name == 'push'");
  expect(surfaces.if).not.toContain('pull_request');
}
