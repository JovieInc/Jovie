import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { runWithRealGh } from '../real-gh-harness.mjs';

/** @typedef {{ id?: string, run?: string, env?: Record<string, string> }} WorkflowStep */
/** @typedef {{ if?: string, outputs?: { should_probe?: string, quota_deferred?: string }, steps?: WorkflowStep[] }} WorkflowJob */

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
 * @param {{ event?: Record<string, string>, record?: Record<string, unknown>, jobs?: Record<string, unknown>[] | string, totalCount?: number, apiFailure?: boolean, rateLimit?: boolean }} [options]
 */
async function decide({
  event = {},
  record = {},
  jobs,
  totalCount,
  apiFailure,
  rateLimit,
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
        if (rateLimit) {
          return {
            status: 403,
            body: {
              message:
                'API rate limit exceeded for installation. If you reach out to GitHub Support for help, please include the request ID 980B:3C6EDF:1EF9221:648E828:6AD12A91 and timestamp 2026-10-15 19:33:37 UTC.',
            },
          };
        }
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

  it('defers an installation rate limit instead of failing the production monitor', async () => {
    const result = await decide({ rateLimit: true });
    expect(result.code, result.stderr).toBe(0);
    expect(result.shouldProbe).toBe('should_probe=false');
    expect(result.stderr).toContain('GitHub primary-rate-limit');
    expect(result.stdout).not.toContain(
      'following up against landed production'
    );
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
        /needs\.([\w-]+)\.(result|outputs\.should_probe|outputs\.quota_deferred)/g,
        (_, job, field) =>
          JSON.stringify(
            field === 'result'
              ? results[job]
              : field === 'outputs.quota_deferred'
                ? results.quotaDeferred
                : results.shouldProbe
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

  it('does not dispatch probes or page when the trigger read is rate limited', () => {
    const expression = workflow.jobs['resolve-target'].outputs.should_probe;
    const shouldProbe = (trigger, quotaDeferred) =>
      runInNewContext(
        expression
          .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
          .replaceAll(
            'steps.trigger.outputs.quota_deferred',
            quotaDeferred === undefined ? 'null' : JSON.stringify(quotaDeferred)
          )
          .replaceAll(
            'steps.trigger.outputs.should_probe',
            JSON.stringify(trigger)
          )
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

/** @param {{ mode?: string, wrongToken?: boolean, crossRepository?: boolean }} [options] */
async function resolveTargetHttps({
  mode = 'ancestor',
  wrongToken = false,
  crossRepository = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'postdeploy-https-'));
  const seed = join(root, 'seed');
  const workspace = join(root, 'workspace');
  const bin = join(root, 'bin');
  const output = join(root, 'output');
  const trace = join(root, 'trace');
  const key = join(root, 'key');
  const cert = join(root, 'cert');
  const token = 'harness-token';
  const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
  const gitEnv = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Probe HTTPS fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Probe HTTPS fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  /** @param {...string} args */
  const git = (...args) =>
    execFileSync('git', args, { env: gitEnv, encoding: 'utf8' }).trim();
  /** @type {{ path: string, authorized: boolean }[]} */
  const gitRequests = [];
  /** @type {import('node:https').Server | undefined} */
  let server;
  try {
    for (const dir of [seed, workspace, bin]) mkdirSync(dir);
    git('init', '-q', '-b', 'main', seed);
    git('-C', seed, 'commit', '--allow-empty', '-qm', 'ancestor');
    const ancestor = git('-C', seed, 'rev-parse', 'HEAD');
    git('-C', seed, 'commit', '--allow-empty', '-qm', 'tip');
    const tip = git('-C', seed, 'rev-parse', 'HEAD');
    git('clone', '-q', '--bare', seed, join(root, 'repo.git'));
    // A fixture-only identity; Git trusts only this test's ephemeral certificate.
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        key,
        '-out',
        cert,
      ],
      { stdio: 'ignore' }
    );
    server = createHttpsServer(
      { key: readFileSync(key), cert: readFileSync(cert) },
      async (req, res) => {
        const url = new URL(req.url ?? '/', 'https://127.0.0.1');
        const authHeaders = req.rawHeaders
          .filter((_, i) => i % 2 === 0)
          .filter(name => name.toLowerCase() === 'authorization');
        const authorized =
          authHeaders.length === 1 &&
          /^basic /i.test(req.headers.authorization ?? '') &&
          req.headers.authorization?.slice(6) === encoded &&
          url.pathname.startsWith('/repo.git/');
        gitRequests.push({ path: url.pathname, authorized });
        if (!authorized) {
          res.writeHead(401, { 'www-authenticate': 'Basic realm="fixture"' });
          res.end();
          return;
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const input = Buffer.concat(chunks);
        const backend = spawnSync('git', ['http-backend'], {
          input,
          env: {
            ...gitEnv,
            GIT_PROJECT_ROOT: root,
            GIT_HTTP_EXPORT_ALL: '1',
            REQUEST_METHOD: req.method,
            PATH_INFO: url.pathname,
            QUERY_STRING: url.search.slice(1),
            CONTENT_TYPE: req.headers['content-type'] ?? '',
            CONTENT_LENGTH: String(input.length),
            REMOTE_USER: 'fixture',
          },
        });
        const separator = backend.stdout.indexOf('\r\n\r\n');
        if (backend.status || separator < 0) {
          res.writeHead(500);
          res.end();
          return;
        }
        let status = 200;
        /** @type {Record<string, string>} */
        const headers = {};
        for (const line of backend.stdout
          .subarray(0, separator)
          .toString()
          .split('\r\n')) {
          const colon = line.indexOf(':');
          const name = line.slice(0, colon);
          const value = line.slice(colon + 1).trim();
          if (name.toLowerCase() === 'status')
            status = Number(value.split(' ')[0]);
          else headers[name] = value;
        }
        res.writeHead(status, headers);
        res.end(backend.stdout.subarray(separator + 4));
      }
    );
    await new Promise(done => server.listen(0, '127.0.0.1', () => done(null)));
    const address = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    );
    const remote = `https://127.0.0.1:${address.port}/repo.git`;
    const expected = mode === 'tip' ? tip : ancestor;
    const deployed = mode === 'prefix' ? expected.slice(0, 7) : expected;
    const deployment = {
      id: 'dpl_https_fixture',
      url: 'https://jovie-exact-jovie.vercel.app',
      readyState: 'READY',
      target: 'production',
      commitSha: '',
    };
    const vercelBin = join(workspace, 'node_modules/.bin');
    mkdirSync(vercelBin, { recursive: true });
    writeFileSync(
      join(vercelBin, 'vercel'),
      `#!/bin/sh\nprintf '%s' '${JSON.stringify(deployment)}'\n`,
      { mode: 0o755 }
    );
    writeFileSync(
      join(bin, 'node'),
      `#!/bin/sh\ncase "$2" in
resolve-deployment) printf '%s' '${JSON.stringify(deployment)}' ;;
discover-build-identity) printf '%s' '${JSON.stringify({ commitSha: deployed })}' ;;
*) exit 99 ;;
esac\n`,
      { mode: 0o755 }
    );
    // Substitute only the remote endpoint, retaining the exact workflow shell,
    // auth configuration, Git binary, identity checks and ancestor proof.
    let script = target.run.replaceAll(
      'https://github.com/$REPOSITORY.git',
      remote
    );
    if (crossRepository)
      script = script.replace(
        `"${remote}"`,
        `"${remote.replace('/repo.git', '/other.git')}"`
      );
    const result = await runWithRealGh({
      script: `cd "$FIXTURE_WORKSPACE"\n${script}`,
      env: {
        ...gitEnv,
        PATH: `${bin}:${process.env.PATH}`,
        FIXTURE_WORKSPACE: workspace,
        GITHUB_OUTPUT: output,
        GH_TOKEN: wrongToken ? 'wrong-fixture-token' : token,
        REPOSITORY: repository,
        SHOULD_PROBE: 'true',
        VERCEL_AUTOMATION_BYPASS_SECRET: 'fixture',
        VERCEL_TOKEN: 'fixture',
        VERCEL_ORG_ID: 'fixture',
        VERCEL_PROJECT_ID: 'fixture',
        GIT_SSL_CAINFO: cert,
        GIT_TRACE: trace,
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'init.defaultBranch',
        GIT_CONFIG_VALUE_0: 'main',
        GIT_CONFIG_KEY_1: 'http.extraheader',
        GIT_CONFIG_VALUE_1: 'AUTHORIZATION: inherited-fixture',
        NO_PROXY: '127.0.0.1',
        no_proxy: '127.0.0.1',
      },
      route: () => ({
        status: 403,
        body: { message: 'API rate limit exceeded for installation.' },
      }),
    });
    const logs = (result.stdout + result.stderr).replace(
      /::add-mask::[^\n]*\n/g,
      ''
    );
    const argv = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
    for (const value of [token, encoded, 'wrong-fixture-token']) {
      expect(logs).not.toContain(value);
      expect(argv).not.toContain(value);
    }
    expect(readFileSync(join(root, 'repo.git/config'), 'utf8')).not.toMatch(
      /extraheader|harness-token/i
    );
    return {
      ...result,
      gitRequests,
      expected,
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    };
  } finally {
    if (server) await new Promise(done => server.close(() => done(null)));
    rmSync(root, { recursive: true, force: true });
  }
}

describe('postdeploy resolver authenticates real Git HTTPS (JOV-8495)', () => {
  it.each(['ancestor', 'tip', 'prefix'])(
    'resolves %s through the actual authenticated workflow fetch',
    async mode => {
      const result = await resolveTargetHttps({ mode });
      expect(result.code, result.stderr).toBe(0);
      expect(result.output).toContain(`commit_sha=${result.expected}\n`);
      expect(result.output).toContain('deployment_id=dpl_https_fixture\n');
      expect(result.requests).toEqual([]);
      expect(result.gitRequests.length).toBeGreaterThan(0);
      expect(result.gitRequests.every(request => request.authorized)).toBe(
        true
      );
      expect(
        result.gitRequests.some(request =>
          request.path.endsWith('/git-upload-pack')
        )
      ).toBe(true);
    }
  );
  it.each([{ wrongToken: true }, { crossRepository: true }])(
    'fails closed for credential or repository mismatch: %j',
    async options => {
      const result = await resolveTargetHttps(options);
      expect(result.code).not.toBe(0);
      expect(result.output).not.toContain('deployment_id=dpl_https_fixture');
      expect(result.output).not.toContain('commit_sha=' + result.expected);
      expect(result.gitRequests.some(request => !request.authorized)).toBe(
        true
      );
    }
  );
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
  expect(workflow.jobs['resolve-target'].outputs.quota_deferred).toBe(
    "${{ steps.trigger.outputs.quota_deferred == 'true' }}"
  );
});
