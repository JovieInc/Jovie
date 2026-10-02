import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);
const WEB_PACKAGE = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'apps/web/package.json'), 'utf8')
);
const SEO_CERTIFY_STEP = 'Certify marketing SEO against prerendered HTML';

function getJobBlock(workflow, jobKey) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^ {2}[a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

function stepIndex(jobBlock, stepName) {
  return jobBlock.indexOf(`      - name: ${stepName}\n`);
}

function getStepBlock(jobBlock, stepName) {
  const start = stepIndex(jobBlock, stepName);
  expect(start, `Missing step: ${stepName}`).toBeGreaterThan(-1);
  const next = jobBlock.indexOf('\n      - ', start + 1);
  return jobBlock.slice(start, next === -1 ? undefined : next);
}

describe('seo:certify CI wiring (JOV-7277)', () => {
  const buildLayout = getJobBlock(CI_WORKFLOW, 'ci-build-layout');

  it('runs in the merge-group build job, the one that gates landing', () => {
    expect(buildLayout).toContain("github.event_name == 'merge_group'");
    expect(stepIndex(buildLayout, SEO_CERTIFY_STEP)).toBeGreaterThan(-1);
  });

  it('sweeps the prerendered build output after the build is verified', () => {
    const build = stepIndex(buildLayout, 'Build exact combined head');
    const verify = stepIndex(buildLayout, 'Verify combined build output');
    const certify = stepIndex(buildLayout, SEO_CERTIFY_STEP);
    expect(build).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(build);
    expect(certify).toBeGreaterThan(verify);
  });

  it('invokes the web seo:certify script against local HTML only', () => {
    const step = getStepBlock(buildLayout, SEO_CERTIFY_STEP);
    expect(step).toContain('pnpm --filter @jovie/web seo:certify');
    expect(step).toContain('--sha "$GITHUB_SHA"');
    expect(WEB_PACKAGE.scripts['seo:certify']).toBe(
      'tsx scripts/seo-certify.ts'
    );
    // Build output, never a live URL; never rewrites the baseline or posts.
    expect(step).not.toContain('--base-url');
    expect(step).not.toContain('--write-baseline');
    expect(step).not.toContain('--seed-baseline');
    expect(step).not.toContain('--post');
  });

  it('fails the job on regression instead of soft-failing', () => {
    const step = getStepBlock(buildLayout, SEO_CERTIFY_STEP);
    expect(step).not.toContain('continue-on-error');
    expect(step).not.toMatch(/\|\|\s*true/);
    expect(step).not.toContain('if:');
  });

  it('adds no secrets or write scopes to the step', () => {
    const step = getStepBlock(buildLayout, SEO_CERTIFY_STEP);
    expect(step).not.toContain('secrets.');
    expect(step).not.toContain('CRON_SECRET');
    expect(buildLayout).not.toMatch(/permissions:[\s\S]*write/);
  });
});
