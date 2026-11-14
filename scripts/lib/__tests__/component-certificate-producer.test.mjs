import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const { load } = createRequire(import.meta.url)('js-yaml');
const workflowText = name =>
  readFileSync(resolve(REPO_ROOT, '.github/workflows', name), 'utf8');
const certificate = load(workflowText('component-certificate.yml'));
const job = certificate.jobs.certify;
const steps = job.steps;

describe('component certificate producer completion admission', () => {
  it('refreshes on existing main evidence producers without a self-loop or PR trigger', () => {
    const producerNames = [
      'ci.yml',
      'visual-a11y.yml',
      'mutation-diff.yml',
    ].map(file => load(workflowText(file)).name);
    expect(certificate.on.workflow_run).toEqual({
      workflows: producerNames,
      types: ['completed'],
      branches: ['main'],
    });
    expect(producerNames).not.toContain(certificate.name);
    expect(Object.keys(certificate.on).sort()).toEqual([
      'workflow_dispatch',
      'workflow_run',
    ]);
  });
  it('admits only successful same-repository current-main producer completions', () => {
    const mainSha = 'a'.repeat(40);
    const allowed = github =>
      Function(
        'github',
        'contains',
        'fromJSON',
        `return (${job.if});`
      )(github, (values, value) => values.includes(value), JSON.parse);
    const context = overrides => ({
      ref: 'refs/heads/main',
      sha: mainSha,
      repository: 'JovieInc/Jovie',
      event_name: 'workflow_run',
      event: {
        workflow_run: {
          conclusion: 'success',
          event: 'push',
          head_branch: 'main',
          head_repository: { full_name: 'JovieInc/Jovie' },
          head_sha: mainSha,
          ...overrides,
        },
      },
    });
    for (const event of ['push', 'workflow_dispatch', 'workflow_run'])
      expect(allowed(context({ event }))).toBe(true);
    for (const overrides of [
      { conclusion: 'failure' },
      { conclusion: 'cancelled' },
      { head_branch: 'feature' },
      { head_repository: { full_name: 'fork/Jovie' } },
      { head_sha: 'b'.repeat(40) },
      { event: 'pull_request' },
      { event: 'pull_request_target' },
    ])
      expect(allowed(context(overrides)), JSON.stringify(overrides)).toBe(
        false
      );
    const dispatch = context({ head_sha: 'b'.repeat(40) });
    dispatch.event_name = 'workflow_dispatch';
    expect(allowed(dispatch)).toBe(true);
    dispatch.ref = 'refs/heads/feature';
    expect(allowed(dispatch)).toBe(false);
  });
  it('binds checkout and cancellation to the same SHA, isolating older main completions', () => {
    const source =
      'inputs.sha || github.event.workflow_run.head_sha || github.sha';
    expect(job.env.CERT_SHA).toBe(`\${{ ${source} }}`);
    expect(job.concurrency).toEqual({
      group: `component-certificate-\${{ ${source} }}`,
      'cancel-in-progress': true,
    });
    expect(steps.find(step => step.name === 'Checkout').with.ref).toBe(
      '${{ env.CERT_SHA }}'
    );
  });
});
