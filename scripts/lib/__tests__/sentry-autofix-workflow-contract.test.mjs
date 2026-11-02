import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { SCRIPT_CONTRACT_VITEST_TESTS } from '../../ci-fast-lanes.mjs';
import {
  cronGapMinutes,
  triggerNames,
  workflowTriggers,
} from '../workflow-triggers.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/sentry-autofix.yml'),
  'utf8'
);
const RECURRENCE = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/sentry-autofix-recurrence.yml'),
  'utf8'
);

describe('Sentry autofix workflow contract', () => {
  it('holds Sentry intake without running an unapproved code executor', () => {
    for (const test of [
      'scripts/lib/__tests__/sentry-autofix-intake.test.mjs',
      'scripts/lib/__tests__/sentry-autofix-workflow-contract.test.mjs',
    ])
      expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(test);
    const workflow =
      /** @type {{on: object, permissions: object, concurrency: {group: string, 'cancel-in-progress': boolean}, jobs: {autofix: {permissions: object, steps: {run?: string, uses?: string, if?: string, with?: Record<string, unknown>}[]}}}} */ (
        parseYaml(WORKFLOW)
      );
    expect(workflow.on).toEqual({
      repository_dispatch: { types: ['sentry-issue'] },
    });
    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.jobs)).toEqual(['autofix']);
    expect(Object.keys(workflow.jobs.autofix).sort()).toEqual([
      'permissions',
      'runs-on',
      'steps',
      'timeout-minutes',
    ]);
    expect(workflow.jobs.autofix.permissions).toEqual({ contents: 'read' });
    expect(WORKFLOW).not.toMatch(
      /claude-code-action|CLAUDE_CODE|anthropics\//i
    );
    expect(WORKFLOW).not.toMatch(
      /secrets\.|id-token:|pull-requests:|contents: write|git push|gh pr create/
    );
    expect(WORKFLOW).not.toContain('github.event.client_payload');
    const steps = workflow.jobs.autofix.steps;
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step).not.toHaveProperty('env');
      expect(step).not.toHaveProperty('shell');
      expect(step).not.toHaveProperty('continue-on-error');
    }
    expect(steps.find(step => step.run)).not.toHaveProperty('if');
    expect(steps.filter(step => step.run).map(step => step.run.trim())).toEqual(
      ['node scripts/sentry-autofix-intake.mjs']
    );
    expect(steps.filter(step => step.uses).map(step => step.uses)).toEqual([
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      './.github/actions/prime-node-toolcache',
      'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
      'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',
    ]);
    expect(steps[0].with).toMatchObject({
      ref: 'main',
      'persist-credentials': false,
    });
    expect(steps.at(-1).if).toBe('${{ always() }}');
    expect(steps.at(-1).with['if-no-files-found']).toBe('error');
    expect(workflow.concurrency.group).toBe(
      'sentry-autofix-${{ github.run_id }}'
    );
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  });

  it('closes the loop on a scheduled or manual recurrence check, never source PRs', () => {
    // Clock wake (repository_dispatch) plus an hourly-or-better cron
    // backstop and manual dispatch; never a source-PR or merge-queue event.
    const on = workflowTriggers(RECURRENCE);
    for (const event of triggerNames(on)) {
      expect([
        'repository_dispatch',
        'schedule',
        'workflow_dispatch',
      ]).toContain(event);
    }
    expect(on).toHaveProperty('workflow_dispatch');
    expect(cronGapMinutes(on).max).toBeLessThanOrEqual(60);
    expect(RECURRENCE).toContain(
      "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'"
    );
    expect(RECURRENCE).toContain('node scripts/sentry-autofix-recurrence.mjs');
    expect(RECURRENCE).toContain('secrets.SENTRY_AUTH_TOKEN');
    expect(RECURRENCE).not.toContain('secrets.LINEAR_API_KEY');
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/sentry-validation-observation.test.mjs'
    );
    expect(RECURRENCE).toContain('observations_only:');
    expect(RECURRENCE).toContain('SENTRY_RECURRENCE_OBSERVATIONS_ONLY:');
    expect(RECURRENCE).toContain('sentry-recurrence-source-revision.txt');
    expect(RECURRENCE).toContain('sentry-recurrence-observation.json');
  });

  it.each([
    { hasKey: true, dopplerExit: 0, nodeExit: 0, expected: 0 },
    { hasKey: true, dopplerExit: 0, nodeExit: 17, expected: 17 },
    { hasKey: false, dopplerExit: 0, nodeExit: 0, expected: 32 },
    { hasKey: false, dopplerExit: 23, nodeExit: 0, expected: 23 },
  ])(
    'isolates runtime production credentials and propagates exit $expected',
    ({ hasKey, dopplerExit, nodeExit, expected }) => {
      const job =
        /** @type {{jobs: {recurrence: {steps: {name?: string, uses?: string, env?: Record<string,string>, run?: string}[]}}}} */ (
          parseYaml(RECURRENCE)
        ).jobs.recurrence;
      const step = job.steps.find(
        step => step.name === 'Check recurrence and resolve or reopen'
      );
      if (!step?.run || !step.env)
        throw new Error('Missing maintained recurrence shell');
      expect(job.steps).toContainEqual({
        uses: './.github/actions/setup-doppler',
      });
      expect(step.env.DOPPLER_TOKEN).toBe('${{ secrets.DOPPLER_TOKEN_PRD }}');
      expect(step.env).not.toHaveProperty('LINEAR_API_KEY');
      const root = mkdtempSync(resolve(tmpdir(), 'sentry-recurrence-shell-'));
      try {
        writeFileSync(
          resolve(root, 'git'),
          '#!/bin/bash\nprintf fixture-sha\n',
          { mode: 0o755 }
        );
        writeFileSync(
          resolve(root, 'doppler'),
          `#!/bin/bash
set -euo pipefail
[[ "$*" == 'run --project jovie-web --config prd --only-secrets=LINEAR_API_KEY --no-fallback -- env -u DOPPLER_TOKEN node scripts/sentry-autofix-recurrence.mjs' ]]
[[ "$DOPPLER_TOKEN" == 'fixture-doppler-token' ]]
if [[ "$TEST_DOPPLER_EXIT" != 0 ]]; then exit "$TEST_DOPPLER_EXIT"; fi
if [[ "$TEST_HAS_KEY" == true ]]; then export LINEAR_API_KEY=fixture-linear-key; fi
while [[ "$1" != '--' ]]; do shift; done
shift
exec "$@"
`,
          { mode: 0o755 }
        );
        writeFileSync(
          resolve(root, 'node'),
          `#!/bin/bash
set -euo pipefail
[[ "$1" == 'scripts/sentry-autofix-recurrence.mjs' ]]
[[ -z "\${DOPPLER_TOKEN+x}" ]]
[[ "$GH_TOKEN" == fixture-gh && "$SENTRY_AUTH_TOKEN" == fixture-sentry ]]
touch "$RUNNER_TEMP/node-started"
[[ "\${LINEAR_API_KEY:-}" == fixture-linear-key ]] || exit 32
printf '{"fixture":"observed"}\\n'
exit "$TEST_NODE_EXIT"
`,
          { mode: 0o755 }
        );
        const result = spawnSync(
          'bash',
          ['-e', '-o', 'pipefail', '-c', step.run],
          {
            cwd: root,
            encoding: 'utf8',
            timeout: 5000,
            env: {
              PATH: `${root}${delimiter}${process.env.PATH}`,
              RUNNER_TEMP: root,
              DOPPLER_TOKEN: 'fixture-doppler-token',
              GH_TOKEN: 'fixture-gh',
              SENTRY_AUTH_TOKEN: 'fixture-sentry',
              TEST_HAS_KEY: String(hasKey),
              TEST_DOPPLER_EXIT: String(dopplerExit),
              TEST_NODE_EXIT: String(nodeExit),
            },
          }
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(expected);
        expect(existsSync(resolve(root, 'node-started'))).toBe(
          dopplerExit === 0
        );
        expect(
          readFileSync(
            resolve(root, 'sentry-recurrence-source-revision.txt'),
            'utf8'
          )
        ).toBe('fixture-sha');
        expect(result.stdout + result.stderr).not.toContain(
          'fixture-doppler-token'
        );
        expect(
          readFileSync(
            resolve(root, 'sentry-recurrence-observation.json'),
            'utf8'
          )
        ).not.toContain('fixture-linear-key');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it('keeps recurrence off the production-mutation lease with a cost and permission boundary', () => {
    expect(RECURRENCE).toContain('permissions: {}');
    expect(RECURRENCE).toMatch(/runs-on: ubuntu-(?:latest|24\.04)/);
    expect(RECURRENCE).toContain('timeout-minutes: 10');
    expect(RECURRENCE).toContain('group: sentry-autofix-recurrence');
    expect(RECURRENCE).toContain('cancel-in-progress: false');
    expect(RECURRENCE).toContain('permission-contents: read');
    expect(RECURRENCE).toContain('permission-pull-requests: write');
    expect(RECURRENCE).toContain('permission-issues: write');
    expect(RECURRENCE).toContain('persist-credentials: false');
    expect(RECURRENCE).toContain('name: Production – jovie');
    expect(RECURRENCE).not.toContain('group: production-mutation');
    expect(RECURRENCE).not.toContain('permission-contents: write');
    expect(RECURRENCE).not.toContain('id-token: write');
    expect(RECURRENCE).not.toContain('setup-node-pnpm');
    expect(RECURRENCE).not.toContain('jovie-fixed');
  });
});
