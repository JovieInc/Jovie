import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { runWithRealGh } from '../real-gh-harness.mjs';

const workflow = load(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../.github/workflows/postdeploy-probes.yml'
    ),
    'utf8'
  )
);
const trigger = workflow.jobs['resolve-target'].steps.find(
  step => step.id === 'trigger'
);
const repository = 'JovieInc/Jovie';
const sha = 'a'.repeat(40);
const controller = {
  id: 42,
  name: 'Production Controller',
  path: '.github/workflows/production-controller.yml',
  state: 'active',
};

async function decide({
  event = {},
  record = {},
  jobs,
  totalCount,
  apiFailure,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'postdeploy-trigger-'));
  const output = join(root, 'output');
  const run = {
    id: 123,
    run_attempt: 2,
    workflow_id: controller.id,
    head_sha: sha,
    event: 'workflow_run',
    head_branch: 'main',
    path: controller.path,
    head_repository: { full_name: repository },
    status: 'completed',
    conclusion: 'success',
    ...record,
  };
  const evidence = jobs ?? [
    {
      id: 456,
      run_id: 123,
      run_attempt: 2,
      name: 'Lighthouse CI (Production)',
      head_sha: sha,
      head_branch: 'main',
      status: 'completed',
      conclusion: 'skipped',
    },
  ];
  try {
    const result = await runWithRealGh({
      script: trigger.run,
      env: {
        EVENT_NAME: 'workflow_run',
        REPOSITORY: repository,
        TRIGGER_RUN_ID: '123',
        TRIGGER_RUN_ATTEMPT: '2',
        TRIGGER_RUN_EVENT: 'workflow_run',
        TRIGGER_RUN_PATH: controller.path,
        TRIGGER_HEAD_BRANCH: 'main',
        TRIGGER_HEAD_SHA: sha,
        TRIGGER_HEAD_REPOSITORY: repository,
        TRIGGER_RUN_STATUS: 'completed',
        TRIGGER_RUN_CONCLUSION: run.conclusion,
        GITHUB_OUTPUT: output,
        ...event,
      },
      route: path => {
        if (apiFailure)
          return { status: 503, body: { message: 'unavailable' } };
        if (
          path ===
          `repos/${repository}/actions/workflows/production-controller.yml`
        ) {
          return { body: controller };
        }
        if (path === `repos/${repository}/actions/runs/123/attempts/2`) {
          return { body: run };
        }
        if (
          path ===
          `repos/${repository}/actions/runs/123/attempts/2/jobs?per_page=100`
        ) {
          return {
            body: {
              total_count: totalCount ?? evidence.length,
              jobs: evidence,
            },
          };
        }
        return null;
      },
    });
    return {
      ...result,
      shouldProbe: readFileSync(output, 'utf8').trim().split('\n').at(-1),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('automatic landed production probes (JOV-8081)', () => {
  it.each(['success', 'failure', 'cancelled', 'timed_out'])(
    'probes after a %s controller without in-lease evidence',
    async conclusion => {
      const result = await decide({ record: { conclusion } });
      expect(result.code, result.stderr).toBe(0);
      expect(result.shouldProbe).toBe('should_probe=true');
      expect(result.requests).toHaveLength(3);
    }
  );

  it('skips only exact successful in-lease Lighthouse evidence', async () => {
    const job = {
      id: 456,
      run_id: 123,
      run_attempt: 2,
      head_sha: sha,
      head_branch: 'main',
      name: 'Lighthouse CI (Production)',
      status: 'completed',
      conclusion: 'success',
    };
    expect((await decide({ jobs: [job] })).shouldProbe).toBe(
      'should_probe=false'
    );
    for (const mismatch of [
      { run_attempt: 1 },
      { run_id: 124 },
      { head_sha: 'b'.repeat(40) },
    ]) {
      const result = await decide({ jobs: [{ ...job, ...mismatch }] });
      expect(result.code, result.stderr).toBe(0);
      expect(result.shouldProbe).toBe('should_probe=true');
    }
    expect((await decide({ jobs: [job, job] })).code).not.toBe(0);
  });

  it.each([
    { event: { TRIGGER_HEAD_REPOSITORY: 'fork/Jovie' } },
    { event: { TRIGGER_HEAD_BRANCH: 'feature' } },
    { event: { TRIGGER_RUN_EVENT: 'pull_request' } },
    { record: { workflow_id: 43 } },
    { record: { run_attempt: 1 } },
    { record: { head_sha: 'b'.repeat(40) } },
    { record: { status: 'in_progress' } },
    { jobs: 'malformed' },
    { totalCount: 101 },
    { apiFailure: true },
  ])('fails closed on untrusted or incomplete evidence: %j', async options => {
    const result = await decide(options);
    expect(result.code).not.toBe(0);
    expect(result.shouldProbe).toBe('should_probe=false');
  });

  it('retains explicit manual dispatch without requiring controller evidence', async () => {
    const result = await decide({ event: { EVENT_NAME: 'workflow_dispatch' } });
    expect(result.code).toBe(0);
    expect(result.shouldProbe).toBe('should_probe=true');
    expect(result.requests).toEqual([]);
  });
});

// Evaluate the workflow's result expressions using fixture job outcomes.
function evaluate(expression, results) {
  return runInNewContext(
    expression
      .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
      .replaceAll('always()', 'true')
      .replace(
        /needs\.([\w-]+)\.(result|outputs\.should_probe)/g,
        (_, job, field) =>
          JSON.stringify(
            field === 'result' ? results[job] : results.shouldProbe
          )
      )
  );
}

describe('probe darkness is never healthy release evidence (JOV-7195)', () => {
  it.each([
    ['success', 'true', 'success', 'success', 'success', 'success'],
    ['failure', 'true', 'skipped', 'skipped', 'skipped', 'failure'],
    ['failure', 'false', 'skipped', 'skipped', 'skipped', 'failure'],
    ['success', 'true', 'cancelled', 'success', 'success', 'failure'],
    ['success', 'true', 'success', 'success', 'skipped', 'failure'],
    ['success', 'true', 'success', 'failure', 'success', 'failure'],
  ])(
    'reports resolve=%s probe=%s smoke=%s auth=%s lighthouse=%s as %s',
    (resolveResult, shouldProbe, smoke, auth, lighthouse, expected) => {
      const results = {
        'resolve-target': resolveResult,
        shouldProbe,
        smoke,
        'auth-smoke': auth,
        lighthouse,
      };
      const remediation = workflow.jobs.remediation;
      expect(evaluate(remediation.if, results)).toBe(true);
      const intake = remediation.steps.find(
        step => step.env?.REMEDIATION_CONCLUSION
      );
      expect(evaluate(intake.env.REMEDIATION_CONCLUSION, results)).toBe(
        expected
      );
      expect(evaluate(workflow.jobs['notify-failure'].if, results)).toBe(
        expected === 'failure'
      );
    }
  );

  it('does not clear an incident when exact in-lease evidence skips the fallback', () => {
    const results = { 'resolve-target': 'success', shouldProbe: 'false' };
    expect(evaluate(workflow.jobs.remediation.if, results)).toBe(false);
    expect(evaluate(workflow.jobs['notify-failure'].if, results)).toBe(false);
  });
});
