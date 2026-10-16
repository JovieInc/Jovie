import { execFileSync } from 'node:child_process';
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
import { runWithRealGh } from '../real-gh-harness.mjs';

/** @typedef {{ id?: string, run?: string, env?: Record<string, string> }} WorkflowStep */
/** @typedef {{ if?: string, steps?: WorkflowStep[] }} WorkflowJob */

const workflow = /** @type {{ jobs: Record<string, WorkflowJob> }} */ (
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
const trigger = workflow.jobs['resolve-target'].steps.find(
  step => step.id === 'trigger'
);
const target = workflow.jobs['resolve-target'].steps.find(
  step => step.id === 'target'
);
const repository = 'JovieInc/Jovie';
const sha = 'a'.repeat(40);
const controller = {
  id: 42,
  name: 'Production Controller',
  path: '.github/workflows/production-controller.yml',
  state: 'active',
};

/**
 * @param {{ event?: Record<string, string>, record?: Record<string, unknown>, jobs?: Record<string, unknown>[] | string, totalCount?: number, apiFailure?: boolean }} [options]
 */
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

// Exercise the complete target step with real git history and the real gh
// returning the production incident's 403. Only Vercel's network is stubbed.
async function resolveTarget({ deployed = 'ancestor', metadata = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'postdeploy-target-'));
  const remote = join(root, 'remote');
  const workspace = join(root, 'workspace');
  const bin = join(root, 'bin');
  for (const dir of [remote, workspace, bin]) mkdirSync(dir);
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Probe test',
    GIT_AUTHOR_EMAIL: 'probe@example.com',
    GIT_COMMITTER_NAME: 'Probe test',
    GIT_COMMITTER_EMAIL: 'probe@example.com',
  };
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: remote,
      env: gitEnv,
      encoding: 'utf8',
    }).trim();
  const executable = (path, script) =>
    writeFileSync(path, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  try {
    git('init', '-q', '-b', 'main');
    git('commit', '--allow-empty', '-qm', 'ancestor');
    const ancestor = git('rev-parse', 'HEAD');
    git('commit', '--allow-empty', '-qm', 'tip');
    const tip = git('rev-parse', 'HEAD');
    git('checkout', '-q', '--orphan', 'foreign');
    git('commit', '--allow-empty', '-qm', 'foreign');
    const foreign = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    let ambiguous = '';
    if (deployed === 'ambiguous') {
      // Find two real commit objects sharing a seven-character prefix, then
      // make both ancestors of main. No fake git or prefix resolver is used.
      const seen = new Map();
      const tree = git('rev-parse', 'HEAD^{tree}');
      for (let i = 0; i < 200_000; i += 1) {
        const body = `tree ${tree}\nauthor Probe <probe@example.com> 1 +0000\ncommitter Probe <probe@example.com> 1 +0000\n\n${i}\n`;
        const hash = createHash('sha1')
          .update(`commit ${Buffer.byteLength(body)}\0${body}`)
          .digest('hex');
        const prefix = hash.slice(0, 7);
        if (seen.has(prefix)) {
          const parents = [seen.get(prefix), body].map(content => {
            const file = join(root, 'commit');
            writeFileSync(file, content);
            return git('hash-object', '-t', 'commit', '-w', file);
          });
          const merge = git(
            'commit-tree',
            tree,
            '-p',
            parents[0],
            '-p',
            parents[1],
            '-m',
            'ambiguous parents'
          );
          git('update-ref', 'refs/heads/main', merge);
          ambiguous = prefix;
          break;
        }
        seen.set(prefix, body);
      }
      if (!ambiguous) throw new Error('could not create ambiguous fixture');
    }
    if (deployed === 'unreadable') git('branch', '-m', 'unavailable');
    const identities = {
      ambiguous,
      ancestor: ancestor.slice(0, 7),
      foreign,
      full: ancestor,
      malformed: 'not-a-sha',
      missing: 'f'.repeat(40),
      tip,
      unreadable: tip,
    };
    const vercelBin = join(workspace, 'node_modules/.bin');
    mkdirSync(vercelBin, { recursive: true });
    const deployment = {
      id: 'dpl_exact',
      url: 'https://jovie-exact-jovie.vercel.app',
      readyState: 'READY',
      target: 'production',
      commitSha: metadata,
    };
    executable(
      join(vercelBin, 'vercel'),
      `printf '%s' '${JSON.stringify(deployment)}'`
    );
    executable(
      join(bin, 'node'),
      `case "$2" in
  resolve-deployment) printf '%s' '${JSON.stringify(deployment)}' ;;
  discover-build-identity) printf '%s' '${JSON.stringify({ commitSha: identities[deployed] })}' ;;
  *) exit 99 ;;
esac`
    );
    const output = join(root, 'output');
    const result = await runWithRealGh({
      script: `cd "$FIXTURE_WORKSPACE"\n${target.run}`,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        FIXTURE_WORKSPACE: workspace,
        GITHUB_OUTPUT: output,
        REPOSITORY: repository,
        SHOULD_PROBE: 'true',
        VERCEL_AUTOMATION_BYPASS_SECRET: 'fixture',
        VERCEL_TOKEN: 'fixture',
        VERCEL_ORG_ID: 'fixture',
        VERCEL_PROJECT_ID: 'fixture',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `url.file://${remote}.insteadOf`,
        GIT_CONFIG_VALUE_0: `https://github.com/${repository}.git`,
      },
      route: () => ({
        status: 403,
        body: { message: 'API rate limit exceeded for installation.' },
      }),
    });
    return {
      ...result,
      output: readFileSync(output, 'utf8'),
      expectedSha: deployed === 'tip' ? tip : ancestor,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('landed production identity during GitHub quota exhaustion (JOV-8495)', () => {
  it.each(['ancestor', 'full', 'tip'])(
    'resolves a deployed %s on main without REST quota',
    async deployed => {
      const result = await resolveTarget({ deployed });
      expect(result.code, result.stderr).toBe(0);
      expect(result.output).toContain(`commit_sha=${result.expectedSha}\n`);
      expect(result.output).toContain('deployment_id=dpl_exact\n');
      expect(result.requests).toEqual([]);
    }
  );

  it.each([
    ['ambiguous', /ambiguous/],
    ['foreign', /did not resolve uniquely|not an ancestor/],
    ['missing', /did not resolve uniquely/],
    ['malformed', /omitted a valid commit SHA/],
    ['unreadable', /couldn't find remote ref/],
  ])('fails closed for a %s deployed identity', async (deployed, error) => {
    const result = await resolveTarget({ deployed });
    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(error);
    expect(result.output).not.toContain('deployment_id=dpl_exact');
    expect(result.output).not.toContain(`commit_sha=${result.expectedSha}`);
  });

  it('fails closed when Vercel metadata disagrees with the served build', async () => {
    const result = await resolveTarget({ metadata: 'b'.repeat(40) });
    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toContain(
      'Vercel list metadata disagrees'
    );
    expect(result.output).not.toContain('deployment_id=dpl_exact');
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
