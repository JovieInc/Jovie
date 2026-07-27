import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyProductionAuthSmokePolicy,
  validateProductionAuthSmokePolicy,
} from '../../../../../.github/scripts/production-auth-smoke-policy.mjs';

const workflowId = 42;
const baseline = 30216913117;
const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../../../..');
const policy = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, '.github/release-gates/production-auth-smoke.json'),
    'utf8'
  )
);

function job(id: number, name: string, conclusion = 'success') {
  return { id, name, status: 'completed', conclusion };
}

function controllerRun(
  offset: number,
  { auth = 'success', verified = 'success', release = 'success' } = {}
) {
  const id = baseline + offset;
  return {
    run: {
      id,
      run_attempt: 1,
      workflow_id: workflowId,
      path: '.github/workflows/production-controller.yml',
      head_branch: 'main',
      event: 'workflow_run',
      status: 'completed',
      conclusion:
        auth === 'success' && verified === 'success' ? 'success' : 'failure',
    },
    jobs: [
      job(
        id * 10 + 1,
        'Production Release / Production release result',
        release
      ),
      job(id * 10 + 2, 'Post-Deploy Smoke (Production)'),
      job(id * 10 + 3, 'Post-Deploy Auth Smoke (Production)', auth),
      job(id * 10 + 4, 'Lighthouse CI (Production)'),
      job(id * 10 + 5, 'Production Verified', verified),
    ],
  };
}

describe('temporary production auth smoke release policy', () => {
  it('keeps the failed smoke visible while only its release effect is advisory', () => {
    const workflow = readFileSync(
      resolve(repositoryRoot, '.github/workflows/production-controller.yml'),
      'utf8'
    );
    const authJob = workflow
      .split('\n  ci-post-deploy-auth-smoke:')[1]
      .split('\n  lighthouse-ci:')[0];
    const verifiedJob = workflow.split('\n  production-verified:')[1];

    expect(authJob).not.toContain('continue-on-error');
    expect(authJob).toContain('id: guarded-auth-smoke');
    expect(authJob).toContain('Classify production auth smoke result');
    expect(authJob).toContain("steps.guarded-auth-smoke.outcome == 'success'");
    expect(authJob).toContain(
      'printf "%s\\n" "$status" > "$RUNNER_TEMP/production-auth-smoke-exit"'
    );
    expect(authJob).toContain('exit "$status"');
    expect(verifiedJob).toContain(
      'Classify temporary auth smoke release policy'
    );
    expect(verifiedJob).toContain(
      'the controller remains visibly red while exact deployment verification continues'
    );
  });

  it('stays advisory and exposes authoritative progress before ten clean runs', () => {
    const result = classifyProductionAuthSmokePolicy({
      policy,
      controllerWorkflowId: workflowId,
      runs: [
        ...Array.from({ length: 8 }, (_, index) => controllerRun(index + 1)),
        controllerRun(9, { auth: 'failure' }),
        controllerRun(10),
      ],
    });

    expect(result).toMatchObject({
      mode: 'advisory',
      threshold: 10,
      currentStreak: 1,
      maximumStreak: 8,
      productionRuns: 10,
      graduatedRunId: null,
    });
  });

  it('graduates permanently after any ten-run exact-main passing window', () => {
    const runs = Array.from({ length: 10 }, (_, index) =>
      controllerRun(index + 1)
    );
    runs.push(controllerRun(11, { auth: 'failure' }));

    expect(
      classifyProductionAuthSmokePolicy({
        policy,
        controllerWorkflowId: workflowId,
        runs,
      })
    ).toMatchObject({
      mode: 'blocking',
      maximumStreak: 10,
      currentStreak: 0,
      graduatedRunId: baseline + 10,
    });
  });

  it('ignores generations that never completed a production release', () => {
    const result = classifyProductionAuthSmokePolicy({
      policy,
      controllerWorkflowId: workflowId,
      runs: [controllerRun(1, { release: 'skipped' }), controllerRun(2)],
    });

    expect(result).toMatchObject({
      mode: 'advisory',
      productionRuns: 1,
      currentStreak: 1,
    });
  });

  it('fails closed on malformed policy or incomplete exact job evidence', () => {
    expect(() =>
      validateProductionAuthSmokePolicy({
        ...policy,
        graduation: { consecutiveExactMainPasses: 9 },
      })
    ).toThrow('Malformed production auth smoke release policy');

    const malformed = controllerRun(1);
    malformed.jobs.pop();
    expect(() =>
      classifyProductionAuthSmokePolicy({
        policy,
        controllerWorkflowId: workflowId,
        runs: [malformed],
      })
    ).toThrow('Expected exactly one Production Verified job');
  });
});
