import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/** @typedef {{ id?: string, name?: string, if?: string, uses?: string, run?: string, env?: Record<string, string>, with?: Record<string, any> }} WorkflowStep */
/** @typedef {{ if?: string, needs?: string[], outputs?: Record<string, string>, steps?: WorkflowStep[] }} WorkflowJob */
const workflow = /** @type {{jobs: Record<string, WorkflowJob>}} */ (
  load(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/postdeploy-probes.yml'
      ),
      'utf8'
    )
  )
);
const target = workflow.jobs['resolve-target'].steps.find(
  step => step.id === 'target'
);
const repository = 'JovieInc/Jovie';

// Evaluate the actual workflow expression with GitHub-style empty outputs.
/** @param {string} expression @param {Record<string, any>} results */
function evaluate(expression, results) {
  const allPassed = ['smoke', 'auth-smoke', 'lighthouse'].every(
    job => results[job] === 'success'
  );
  const outcome = results.outcome ?? (allPassed ? 'passed' : 'failed');
  const needs = Object.fromEntries(
    ['resolve-target', 'smoke', 'auth-smoke', 'lighthouse'].map(job => [
      job,
      {
        result: results[job] ?? '',
        outputs: {
          should_probe: results.shouldProbe ?? '',
          quota_deferred: results.quotaDeferred ?? '',
          probe_notify_allowed: results.notifyAllowed ?? 'true',
        },
      },
    ])
  );
  const steps = {
    'probe-outcome': {
      outputs: { outcome, quota_deferred: results.outcomeQuota ?? '' },
    },
  };
  return runInNewContext(
    expression
      .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
      .replaceAll('always()', 'true')
      .replace(/(needs|steps)\.([\w-]+)/g, '$1["$2"]'),
    { needs, steps }
  );
}

/** @param {string} expression @param {Record<string, string>} trigger @param {Record<string, string>} admission */
function evaluateOutput(expression, trigger, admission) {
  return runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
    steps: { trigger: { outputs: trigger }, admission: { outputs: admission } },
  });
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

  it('does not dispatch probes or page when the trigger read is rate limited', () => {
    const expression = workflow.jobs['resolve-target'].outputs.should_probe;
    const shouldProbe = (trigger, quotaDeferred) =>
      evaluateOutput(
        expression,
        { should_probe: trigger, quota_deferred: quotaDeferred ?? '' },
        { admitted: trigger, quota_deferred: '' }
      );
    expect(shouldProbe('true', undefined)).toBe(true);
    expect(shouldProbe('true', '')).toBe(true);
    expect(shouldProbe('true', 'true')).toBe(false);
    expect(shouldProbe('false', undefined)).toBe(false);

    const deferred = {
      'resolve-target': 'success',
      shouldProbe: 'false',
      smoke: 'skipped',
      'auth-smoke': 'skipped',
      lighthouse: 'skipped',
    };
    expect(evaluate(workflow.jobs.remediation.if, deferred)).toBe(false);
    expect(evaluate(workflow.jobs['notify-failure'].if, deferred)).toBe(false);
  });

  it('does not clear an incident when exact in-lease evidence skips the fallback', () => {
    const results = { 'resolve-target': 'success', shouldProbe: 'false' };
    expect(evaluate(workflow.jobs.remediation.if, results)).toBe(false);
    expect(evaluate(workflow.jobs['notify-failure'].if, results)).toBe(false);
  });
});

describe('post-deploy bounded admission wiring', () => {
  const resolveJob = workflow.jobs['resolve-target'];
  const admission = resolveJob.steps.find(step => step.id === 'admission');
  const reservation = resolveJob.steps.find(
    step => step.name === 'Preserve probe admission before production requests'
  );

  it('binds the resolved target and workflow producer before an immutable reservation', () => {
    const steps = resolveJob.steps;
    expect(steps.indexOf(target)).toBeLessThan(steps.indexOf(admission));
    expect(steps.indexOf(admission)).toBeLessThan(steps.indexOf(reservation));
    const admitOn = ref =>
      runInNewContext(admission.if.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
        github: { ref },
        steps: {
          target: { outputs: { commit_sha: 'a'.repeat(40) } },
          trigger: { outputs: { should_probe: 'true', quota_deferred: '' } },
        },
      });
    expect(admitOn('refs/heads/main')).toBe(true);
    expect(admitOn('refs/heads/other')).toBe(false);
    expect(reservation.with.overwrite).toBe(false);
    expect(reservation.with['if-no-files-found']).toBe('error');
    const pending = expression =>
      runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
        steps: {
          admission: {
            outputs: { admitted: 'true', reservation_needed: 'true' },
          },
        },
      });
    expect(pending(reservation.if)).toBe(true);
    for (const job of ['smoke', 'auth-smoke', 'lighthouse'])
      expect(workflow.jobs[job].needs).toContain('resolve-target');
    const remediationSteps = workflow.jobs.remediation.steps;
    const recordIndex = remediationSteps.findIndex(
      step => step.id === 'probe-outcome'
    );
    expect(recordIndex).toBeGreaterThan(-1);
    expect(
      remediationSteps
        .slice(recordIndex + 1)
        .some(step => step.uses?.includes('upload-artifact'))
    ).toBe(false);

    const cwd = mkdtempSync(join(tmpdir(), 'probe-context-'));
    try {
      mkdirSync(join(cwd, '.github/workflows'), { recursive: true });
      mkdirSync(join(cwd, 'bin'));
      const contents = readFileSync(
        resolve(
          import.meta.dirname,
          '../../../.github/workflows/postdeploy-probes.yml'
        )
      );
      writeFileSync(
        join(cwd, '.github/workflows/postdeploy-probes.yml'),
        contents
      );
      writeFileSync(
        join(cwd, 'bin/node'),
        `#!/bin/sh\nif [ "$1" = scripts/postdeploy-probe-admission.mjs ]; then exit 0; fi\nexec '${process.execPath}' "$@"\n`,
        { mode: 0o755 }
      );
      const output = join(cwd, 'output');
      const deployedSha = 'a'.repeat(40);
      const workflowSha = 'b'.repeat(40);
      const run = spawnSync('bash', ['-e', '-c', admission.run], {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${join(cwd, 'bin')}:${process.env.PATH}`,
          RUNNER_TEMP: cwd,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: repository,
          GITHUB_RUN_ID: '42',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_SHA: workflowSha,
          GITHUB_EVENT_NAME: 'workflow_run',
          TARGET_COMMIT_SHA: deployedSha,
          TARGET_DEPLOYMENT_ID: 'dpl_exact',
          TARGET_ORIGIN_B64: Buffer.from('https://immutable.example').toString(
            'base64'
          ),
        },
      });
      expect(run.status, run.stderr).toBe(0);
      const context = JSON.parse(
        readFileSync(join(cwd, 'postdeploy-probe-context.json'), 'utf8')
      );
      expect(context.target).toEqual({
        sha: deployedSha,
        deploymentId: 'dpl_exact',
        origin: 'https://immutable.example',
        policyDigest: createHash('sha256').update(contents).digest('hex'),
      });
      expect(context.workflowSha).toBe(workflowSha);
      expect(context.target.sha).not.toBe(context.workflowSha);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps clock certification and both quota sources independent of admission', () => {
    const outputs = resolveJob.outputs;
    const trigger = { should_certify: 'true', quota_deferred: '' };
    expect(
      evaluateOutput(outputs.should_certify, trigger, {
        admitted: '',
        quota_deferred: '',
      })
    ).toBe(true);
    expect(
      evaluateOutput(outputs.should_probe, trigger, {
        admitted: '',
        quota_deferred: '',
      })
    ).toBe(false);
    /** @type {[Record<string, string>, Record<string, string>, boolean][]} */
    const quotaCases = [
      [
        { ...trigger, quota_deferred: 'true' },
        { admitted: 'true', quota_deferred: '' },
        false,
      ],
      [trigger, { admitted: 'true', quota_deferred: 'true' }, true],
      [
        { ...trigger, should_certify: 'false' },
        { admitted: 'true', quota_deferred: 'true' },
        false,
      ],
    ];
    for (const [t, a, expectedCertify] of quotaCases) {
      expect(evaluateOutput(outputs.should_probe, t, a)).toBe(false);
      expect(evaluateOutput(outputs.should_certify, t, a)).toBe(
        expectedCertify
      );
      expect(evaluateOutput(outputs.quota_deferred, t, a)).toBe(true);
    }
  });

  it('suppresses duplicate failure notifications but lets successful retries resolve', () => {
    const intake = workflow.jobs.remediation.steps.find(
      step => step.env?.REMEDIATION_CONCLUSION
    );
    const base = {
      'resolve-target': 'success',
      shouldProbe: 'true',
      notifyAllowed: 'false',
      smoke: 'failure',
      'auth-smoke': 'success',
      lighthouse: 'success',
    };
    expect(evaluate(workflow.jobs['notify-failure'].if, base)).toBe(false);
    expect(evaluate(intake.if, { ...base, outcome: 'failed' })).toBe(false);
    expect(evaluate(intake.if, { ...base, outcome: 'passed' })).toBe(true);
    expect(
      evaluate(intake.env.REMEDIATION_CONCLUSION, {
        ...base,
        outcome: 'passed',
      })
    ).toBe('success');
    expect(evaluate(intake.if, { ...base, outcome: '' })).toBe(false);
    const unrecordedGreen = { ...base, smoke: 'success', outcome: '' };
    expect(evaluate(intake.if, unrecordedGreen)).toBe(false);
    expect(evaluate(intake.env.REMEDIATION_CONCLUSION, unrecordedGreen)).toBe(
      'unknown'
    );
    expect(
      evaluate(intake.if, { ...base, outcomeQuota: 'true', outcome: '' })
    ).toBe(true);
    expect(
      evaluate(intake.env.REMEDIATION_CONCLUSION, {
        ...base,
        outcomeQuota: 'true',
        outcome: '',
      })
    ).toBe('quota-deferred');
  });
});

it('keeps quota deferral observable without claiming executed probe evidence', () => {
  const results = {
    'resolve-target': 'success',
    shouldProbe: 'false',
    quotaDeferred: 'true',
    smoke: 'skipped',
    'auth-smoke': 'skipped',
    lighthouse: 'skipped',
  };
  const remediation = workflow.jobs.remediation;
  expect(evaluate(remediation.if, results)).toBe(true);
  const intake = remediation.steps.find(
    step => step.env?.REMEDIATION_CONCLUSION
  );
  expect(evaluate(intake.env.REMEDIATION_CONCLUSION, results)).toBe(
    'quota-deferred'
  );
  expect(evaluate(workflow.jobs['notify-failure'].if, results)).toBe(false);
  const quota = workflow.jobs['resolve-target'].outputs.quota_deferred;
  expect(
    evaluateOutput(quota, { quota_deferred: 'true' }, { quota_deferred: '' })
  ).toBe(true);
  expect(
    evaluateOutput(quota, { quota_deferred: '' }, { quota_deferred: 'true' })
  ).toBe(true);
  expect(
    evaluateOutput(quota, { quota_deferred: '' }, { quota_deferred: '' })
  ).toBe(false);
});
