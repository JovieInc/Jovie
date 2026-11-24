import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

// The product screenshot catalog is stored in Git LFS to keep the repository
// under its tracked-bytes budget. Checkout leaves pointers, so every job that
// deploys, renders or republishes those images must pull or push the objects.

const ROOT = resolve(__dirname, '../../../../..');
const CATALOG = 'apps/web/screenshot-catalog/current/*.png';
const DEMO_VIDEO = 'apps/web/public/demo/jovie-demo.mp4';
const SERVED_LFS = `${CATALOG},${DEMO_VIDEO}`;

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
};
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const steps = (path: string) =>
  Object.values((parseYaml(read(path)) as Workflow).jobs).flatMap(
    job => job.steps ?? []
  );

function expectCatalogPullBefore(path: string, buildStep: string) {
  const all = steps(path);
  const build = all.findIndex(step => step.name === buildStep);
  expect(build, `${path}: ${buildStep}`).toBeGreaterThan(0);
  const pull = all[build - 1];
  expect(pull.uses).toBe('./.github/actions/lfs-pull');
  expect(pull.with?.include).toBe(SERVED_LFS);
  return pull;
}

describe('product screenshot catalog in Git LFS', () => {
  it('stores the catalog in LFS except the two build-time imports', () => {
    const attributes = read('.gitattributes');
    expect(attributes).toContain(
      `${CATALOG} filter=lfs diff=lfs merge=lfs -text`
    );
    for (const name of ['onboarding-dsp-desktop', 'onboarding-handle-desktop'])
      expect(attributes).toContain(
        `apps/web/screenshot-catalog/current/${name}.png -filter -diff -merge binary`
      );
    expect(attributes).toContain(
      `${DEMO_VIDEO} filter=lfs diff=lfs merge=lfs -text`
    );
  });

  it('pulls the catalog before every Vercel build', () => {
    const staging = expectCatalogPullBefore(
      '.github/workflows/production-release.yml',
      'Build (preview target for staging verification)'
    );
    expect(staging.with?.cache).toBe('true');
    const production = expectCatalogPullBefore(
      '.github/workflows/production-release.yml',
      'Build and stage production deployment'
    );
    expect(production.if).toContain('steps.mutation-head.outputs.is_current');
    // The manual preview builds a dispatched ref, so it never saves the cache.
    const preview = expectCatalogPullBefore(
      '.github/workflows/ci.yml',
      'Build (PR preview)'
    );
    expect(preview.with?.cache).toBe('restore');
  });

  it('pulls the catalog before every web build in any workflow', () => {
    const build = /turbo (run )?build --filter=@jovie\/web|vercel build/;
    const missing: string[] = [];
    for (const file of readdirSync(resolve(ROOT, '.github/workflows'))) {
      if (!file.endsWith('.yml')) continue;
      const path = `.github/workflows/${file}`;
      const jobs = (parseYaml(read(path)) as Workflow).jobs ?? {};
      for (const [name, job] of Object.entries(jobs)) {
        let pulled = false;
        for (const step of job.steps ?? []) {
          if (
            (step.uses === './.github/actions/lfs-pull' &&
              step.with?.include === SERVED_LFS) ||
            (step.uses === './.github/actions/setup-playwright' &&
              String(step.with?.product_screenshots ?? 'true') !== 'false')
          )
            pulled = true;
          if (build.test(step.run ?? '') && !pulled)
            missing.push(`${path} ${name}: ${step.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('refuses to copy pointers into the standalone public tree', () => {
    const sync = read('apps/web/scripts/sync-standalone-assets.mjs');
    expect(sync).toContain(
      "import { assertPublicLfsFiles } from './assert-public-lfs-files.mjs';"
    );
    const guard = sync.indexOf('assertPublicLfsFiles({ publicDir');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(sync.indexOf('function countSymlinks'));
  });

  it('pulls the catalog in every Playwright job by default', () => {
    const action = parseYaml(
      read('.github/actions/setup-playwright/action.yml')
    ) as {
      inputs: Record<string, { default?: string }>;
      runs: { steps: Step[] };
    };
    expect(action.inputs.product_screenshots.default).toBe('true');
    const pull = action.runs.steps.find(
      step => step.name === 'Pull product screenshots (Git LFS)'
    );
    expect(pull?.uses).toBe('./.github/actions/lfs-pull');
    expect(pull?.with?.include).toBe(SERVED_LFS);
    expect(pull?.with?.cache).toBe('${{ inputs.cache }}');
  });

  it('pushes LFS objects before the screenshot refresh branch', () => {
    const run =
      steps('.github/workflows/screenshots.yml').find(
        step => step.name === 'Create or update screenshot PR'
      )?.run ?? '';
    const install = run.indexOf('git lfs install --local');
    const add = run.indexOf('git add apps/web/public/product-screenshots/');
    const lfsPush = run.indexOf('lfs push origin "$BRANCH"');
    const push = run.indexOf('push --force origin "$BRANCH"');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(add);
    expect(lfsPush).toBeGreaterThan(add);
    expect(lfsPush).toBeLessThan(push);
  });

  it('keeps LFS upload dispatches out of the baseline refresh group', () => {
    const workflow = parseYaml(
      read('.github/workflows/visual-regression.yml')
    ) as { concurrency: { group: string } };
    expect(workflow.concurrency.group).toContain('lfs_upload_glob');
    expect(workflow.concurrency.group).toContain('github.run_id');
    expect(workflow.concurrency.group).toContain(
      'visual-regression-baseline-refresh'
    );
  });
});
