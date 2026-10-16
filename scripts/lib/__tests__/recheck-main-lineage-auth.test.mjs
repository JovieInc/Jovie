import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { expect, it } from 'vitest';
import { runWithRealGh } from '../real-gh-harness.mjs';

const gate = resolve(
  import.meta.dirname,
  '../../../.github/scripts/recheck-main-lineage.sh'
);
const token = 'harness-token';
const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
const repoRoot = resolve(import.meta.dirname, '../../..');
const workflow = load(
  readFileSync(
    join(repoRoot, '.github/workflows/production-release.yml'),
    'utf8'
  )
);

/** @param {{ mode?: string, wrongToken?: boolean, denyFetch?: boolean, job?: string, step?: string, compareOnly?: boolean }} [options] */
async function recheck({
  mode = 'ahead',
  wrongToken = false,
  denyFetch = false,
  job,
  step,
  compareOnly = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lineage-https-'));
  const seed = join(root, 'seed');
  const output = join(root, 'output');
  const trace = join(root, 'trace');
  const key = join(root, 'key');
  const cert = join(root, 'cert');
  const gitEnv = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Lineage fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Lineage fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  /** @param {...string} args */
  const git = (...args) =>
    execFileSync('git', args, { env: gitEnv, encoding: 'utf8' }).trim();
  /** @type {{ path: string, authorized: boolean }[]} */
  const requests = [];
  let advertisements = 0;
  let server;
  try {
    mkdirSync(seed);
    git('init', '-q', '-b', 'main', seed);
    git('-C', seed, 'commit', '--allow-empty', '-qm', 'base');
    const base = git('-C', seed, 'rev-parse', 'HEAD');
    if (mode === 'ahead')
      git('-C', seed, 'commit', '--allow-empty', '-qm', 'child');
    if (mode === 'diverged') {
      git('-C', seed, 'checkout', '-q', '--orphan', 'rewritten');
      git('-C', seed, 'commit', '--allow-empty', '-qm', 'rewrite');
      git('-C', seed, 'branch', '-M', 'main');
    }
    const expected =
      mode === 'exact' ? git('-C', seed, 'rev-parse', 'HEAD') : base;
    const current = git('-C', seed, 'rev-parse', 'HEAD');
    git('clone', '-q', '--bare', seed, join(root, 'repo.git'));
    // Ephemeral fixture identity, trusted only by this test's Git processes.
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
    server = createServer(
      { key: readFileSync(key), cert: readFileSync(cert) },
      async (req, res) => {
        const url = new URL(req.url ?? '/', 'https://127.0.0.1');
        if (url.pathname.endsWith('/info/refs')) advertisements++;
        const authHeaders = req.rawHeaders
          .filter((_, i) => i % 2 === 0)
          .filter(name => name.toLowerCase() === 'authorization');
        const authorized =
          authHeaders.length === 1 &&
          /^basic /i.test(req.headers.authorization ?? '') &&
          req.headers.authorization?.slice(6) === encoded &&
          !(denyFetch && advertisements > 1);
        requests.push({ path: url.pathname, authorized });
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
    const workflowJob = job && workflow.jobs[job];
    const workflowStep = workflowJob?.steps.find(s => s.name === step);
    if (job && !workflowStep)
      throw new Error(`Missing workflow boundary: ${job} / ${step}`);
    let workspace = repoRoot;
    const checkout = workflowJob?.steps.find(s =>
      s.uses?.startsWith('actions/checkout@')
    );
    if (checkout?.with?.['sparse-checkout']) {
      workspace = join(root, 'workspace');
      for (const path of checkout.with['sparse-checkout'].trim().split(/\s+/)) {
        const destination = join(workspace, path);
        mkdirSync(resolve(destination, '..'), { recursive: true });
        copyFileSync(join(repoRoot, path), destination);
      }
    }
    const result = await runWithRealGh({
      script: workflowStep
        ? workflowStep.run.replaceAll(
            '${{ github.repository }}',
            'JovieInc/Jovie'
          )
        : 'bash "$LINEAGE_GATE" "at staging alias"',
      env: {
        ...gitEnv,
        GH_API_HOLD_BUDGET_SECONDS:
          workflowStep?.env?.GH_API_HOLD_BUDGET_SECONDS ?? '240',
        LINEAGE_GATE: gate,
        EXPECTED_SHA: expected,
        EXPECTED_MAIN_SHA: expected,
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        GITHUB_WORKSPACE: workspace,
        GITHUB_OUTPUT: output,
        MAIN_LINEAGE_REMOTE: `https://127.0.0.1:${address.port}/repo.git`,
        GH_TOKEN: wrongToken ? 'wrong-fixture-token' : token,
        GIT_SSL_CAINFO: cert,
        GIT_TERMINAL_PROMPT: '0',
        GIT_TRACE: trace,
        // Preserve inherited settings and clear an inherited generic auth header.
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'init.defaultBranch',
        GIT_CONFIG_VALUE_0: 'main',
        GIT_CONFIG_KEY_1: 'http.extraheader',
        GIT_CONFIG_VALUE_1: 'AUTHORIZATION: inherited-fixture',
        NO_PROXY: '127.0.0.1',
        no_proxy: '127.0.0.1',
      },
      route: path => {
        if (compareOnly && path.endsWith('/commits/main'))
          return { body: { sha: current } };
        if (path === 'rate_limit')
          return {
            body: {
              resources: {
                core: { reset: Math.floor(Date.now() / 1000) + 3600 },
              },
            },
          };
        return {
          status: 403,
          body: { message: 'API rate limit exceeded for installation.' },
        };
      },
    });
    const logs = (result.stdout + result.stderr).replace(
      /::add-mask::[^\n]*\n/g,
      ''
    );
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(encoded);
    const argv = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
    expect(argv).not.toContain(token);
    expect(argv).not.toContain(encoded);
    expect(readFileSync(join(root, 'repo.git/config'), 'utf8')).not.toMatch(
      /extraheader|harness-token/i
    );
    return {
      ...result,
      gitRequests: requests,
      current,
      mainSha: current,
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    };
  } finally {
    if (server) await new Promise(done => server.close(() => done(null)));
    rmSync(root, { recursive: true, force: true });
  }
}

it.each(['exact', 'ahead', 'diverged'])(
  'proves %s lineage through authenticated HTTPS when REST is exhausted',
  async mode => {
    const result = await recheck({ mode });
    expect(result.code, result.stderr).toBe(0);
    expect(result.output).toBe(
      mode === 'diverged'
        ? `superseded_sha=${result.mainSha}\nis_current=false\n`
        : 'is_current=true\n'
    );
    // commits/main (and compare) each take one rate_limit probe before git.
    expect(result.requests.length).toBe(mode === 'exact' ? 2 : 4);
    expect(result.gitRequests.length).toBeGreaterThan(0);
    expect(result.gitRequests.every(r => r.authorized)).toBe(true);
    if (mode !== 'exact')
      expect(
        result.gitRequests.some(r => r.path.endsWith('/git-upload-pack'))
      ).toBe(true);
  }
);

const releaseChecks = [
  ['release-head', 'Resolve current main HEAD'],
  ['staging-head', 'Resolve current main HEAD'],
  ['production-head', 'Resolve current main HEAD'],
  ['promote-production', 'Recheck main immediately before production mutation'],
  [
    'promote-production',
    'Recheck main immediately before production promotion',
  ],
];

it.each(releaseChecks)(
  '%s / %s proves an ancestor when the installation reset exceeds its budget',
  async (job, step) => {
    const result = await recheck({ job, step });
    expect(result.code, result.stderr).toBe(0);
    expect(result.output).toContain('is_current=true\n');
    expect(result.requests.some(r => r.includes('compare/'))).toBe(true);
    expect(
      result.gitRequests.some(r => r.path.endsWith('/git-upload-pack'))
    ).toBe(true);
    expect(result.gitRequests.every(r => r.authorized)).toBe(true);
  }
);

it.each(releaseChecks.slice(3))(
  '%s / %s yields a proven rewrite and preserves the superseding SHA',
  async (job, step) => {
    const result = await recheck({ job, step, mode: 'diverged' });
    expect(result.code, result.stderr).toBe(0);
    expect(result.output).toContain('is_current=false\n');
    expect(result.output).toContain(`superseded_sha=${result.current}\n`);
  }
);

it.each(releaseChecks.slice(3))(
  '%s / %s cannot authorize mutation when Git ancestry is unreadable',
  async (job, step) => {
    const result = await recheck({ job, step, denyFetch: true });
    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain('is_current=');
  }
);

it('proves production ancestry when only REST compare is exhausted', async () => {
  const [job, step] = releaseChecks[4];
  const result = await recheck({ job, step, compareOnly: true });
  expect(result.code, result.stderr).toBe(0);
  expect(result.output).toContain('is_current=true\n');
  expect(
    result.gitRequests.some(r => r.path.endsWith('/git-upload-pack'))
  ).toBe(true);
});

it.each([{ wrongToken: true }, { denyFetch: true }])(
  'fails closed on HTTPS credential denial: %j',
  async options => {
    const result = await recheck(options);
    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain('is_current=true');
    expect(result.gitRequests.some(r => !r.authorized)).toBe(true);
    if (options.denyFetch)
      expect(result.gitRequests.some(r => r.authorized)).toBe(true);
  }
);
