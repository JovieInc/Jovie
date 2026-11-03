import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const read = path => readFileSync(resolve(repoRoot, path), 'utf8');
const prWorkflow = load(read('.github/workflows/golden-path-pr.yml'));
const ci = load(read('.github/workflows/ci.yml'));

describe('Golden Path runs on contract PRs and reports red main pushes (JOV-7998)', () => {
  it('starts only for same-repo, non-draft PRs that touch the contract paths', () => {
    const trigger = prWorkflow.on.pull_request;
    expect(trigger.types).toContain('synchronize');
    for (const path of [
      'apps/web/lib/claim/**',
      'apps/web/lib/auth/**',
      'apps/web/lib/stripe/**',
      'apps/web/lib/onboarding/**',
      'apps/web/app/api/onboarding/**',
      'apps/web/app/claim/**',
    ]) {
      expect(trigger.paths).toContain(path);
    }
    const job = prWorkflow.jobs.dispatch;
    expect(job.if).toContain('!github.event.pull_request.draft');
    expect(job.if).toContain('head.repo.full_name == github.repository');
  });

  it('holds only actions: write and never checks out PR code', () => {
    expect(prWorkflow.permissions).toEqual({});
    expect(prWorkflow.jobs.dispatch.permissions).toEqual({
      actions: 'write',
      contents: 'read',
    });
    const steps = JSON.stringify(prWorkflow.jobs.dispatch.steps);
    expect(steps).not.toContain('actions/checkout');
    expect(steps).toContain('gh workflow run ci.yml');
  });

  it('reports a main push even though the push lane is continue-on-error', () => {
    const report = ci.jobs['ci-golden-path-report'];
    expect(report.if).toContain("github.event_name == 'push'");
    const text = JSON.stringify(report.steps);
    expect(text).toContain('certification_outcome');
    expect(text).toContain('journey_outcome');
    expect(ci.jobs['ci-golden-path']['continue-on-error']).toContain(
      "github.event_name == 'push'"
    );
  });
});
