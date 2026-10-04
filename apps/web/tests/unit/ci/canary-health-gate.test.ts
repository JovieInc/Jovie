import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

// JOV-7707: the canary health gate is proven by executing its shipped shell
// with stub node/curl that model Vercel and the preview, then asserting the
// exit status, canary_status output and the exact requests it made.

type Step = {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, string>;
};
type Workflow = {
  jobs: Record<
    string,
    { outputs?: Record<string, string>; env?: unknown; steps: Step[] }
  >;
  env?: unknown;
};

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const workflow = parseYaml(
  readFileSync(
    resolve(repoRoot, '.github/workflows/canary-health-gate.yml'),
    'utf8'
  )
) as Workflow;
const gateJob = workflow.jobs['canary-health-gate'];
const canaryStep = gateJob?.steps.find(step => step.id === 'canary-check');
const authStep = gateJob?.steps.find(
  step => step.name === 'Verify public auth controls are interactive'
);
const SHA = 'a'.repeat(40);
const URL = 'https://jovie-git-main-jovie.vercel.app';
const SECRET = 'bypass-secret-value-123';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

type Preview = {
  resolve?: 'ok' | 'fail';
  resolvedUrl?: string;
  resolvedId?: string;
  bootstrap?: 'ok' | 'fail';
  robots?: { code: number; body: string };
  onboarding?: { code: number; body: string };
  chat?: { code: number; body: string }[];
};

// Stub node for vercel-protected-origin.cjs and curl for the preview.
function runCanary(preview: Preview, env: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'jovie-canary-')));
  roots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const state = join(root, 'state');
  mkdirSync(state);
  writeFileSync(
    join(state, 'preview.json'),
    JSON.stringify({
      resolve: 'ok',
      resolvedUrl: URL,
      resolvedId: 'dpl_Exact123',
      bootstrap: 'ok',
      robots: { code: 200, body: 'User-agent: *\nDisallow: /' },
      onboarding: {
        code: 403,
        body: '{"errorCode":"TURNSTILE_REQUIRED"}',
      },
      chat: [{ code: 401, body: '{"errorCode":"AUTH_REQUIRED"}' }],
      ...preview,
    })
  );
  writeFileSync(
    join(bin, 'node'),
    `#!/bin/bash
mode="\${@: -1}"
preview="${state}/preview.json"
case "$mode" in
  resolve-deployment)
    [ "$(jq -r .resolve "$preview")" = ok ] || exit 1
    jq -c '{id: .resolvedId, url: .resolvedUrl}' "$preview" ;;
  bootstrap-cookie-jar)
    [ "$(jq -r .bootstrap "$preview")" = ok ] || exit 1 ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(bin, 'curl'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "${state}/curl.log"
preview="${state}/preview.json"
url="\${@: -1}"
case "$url" in
  */robots.txt*) key=robots ;;
  */api/chat)
    if printf '%s' "$*" | grep -q '"mode":"onboarding"'; then key=onboarding
    else
      n=$(cat "${state}/chat-count" 2>/dev/null || echo 0)
      echo $((n + 1)) > "${state}/chat-count"
      last=$(jq '.chat | length - 1' "$preview")
      [ "$n" -gt "$last" ] && n=$last
      jq -j --argjson n "$n" '.chat[$n].body' "$preview"
      printf '\\n%s' "$(jq -r --argjson n "$n" '.chat[$n].code' "$preview")"
      exit 0
    fi ;;
  *) printf '\\n404'; exit 0 ;;
esac
jq -j --arg k "$key" '.[$k].body' "$preview"
printf '\\n%s' "$(jq -r --arg k "$key" '.[$k].code' "$preview")"
`,
    { mode: 0o755 }
  );
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const output = join(root, 'github-output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', String(canaryStep?.run)], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: root,
      NODE_ENV: 'test',
      GITHUB_OUTPUT: output,
      VERCEL_AUTOMATION_BYPASS_SECRET: SECRET,
      DEPLOYMENT_URL: URL,
      DEPLOYMENT_URL_B64: '',
      DEPLOYMENT_ID: 'dpl_Exact123',
      COMMIT_SHA: SHA,
      WAIT_SECONDS: '30',
      VERCEL_TOKEN: 'vercel-token',
      VERCEL_ORG_ID: 'team_1',
      VERCEL_PROJECT_ID: 'prj_1',
      ...env,
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ])
  );
  const curl = existsSync(join(state, 'curl.log'))
    ? readFileSync(join(state, 'curl.log'), 'utf8').trim().split('\n')
    : [];
  return { ...result, outputs, curl, state };
}

describe('canary health gate (executed)', { timeout: 60_000 }, () => {
  it('binds the exact deployment, then probes it cookie-only without redirects', () => {
    const result = runCanary({});
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.outputs.verified_deployment_url).toBe(URL);
    expect(result.outputs.canary_status).toBeUndefined();
    // robots, onboarding chat and authenticated chat: three bounded probes.
    expect(result.curl).toHaveLength(3);
    for (const call of result.curl) {
      expect(call).toContain('--max-redirs 0');
      expect(call).toMatch(/--connect-timeout 5 --max-time 15/);
      expect(call).toMatch(/ -b \S+/);
      expect(call).not.toMatch(/ -L |--location/);
      expect(call).not.toContain('x-vercel-protection-bypass');
      expect(call).not.toContain(SECRET);
      expect(call.startsWith('-s ') || call.startsWith('-sS ')).toBe(true);
      expect(call).toContain(URL);
    }
  });

  it('decodes a masked base64 deployment URL handoff', () => {
    const result = runCanary(
      {},
      {
        DEPLOYMENT_URL: '',
        DEPLOYMENT_URL_B64: Buffer.from(`${URL}/`).toString('base64'),
      }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.verified_deployment_url).toBe(URL);
  });

  it.each([
    ['missing bypass secret', {}, { VERCEL_AUTOMATION_BYPASS_SECRET: '' }],
    ['non-integer wait', {}, { WAIT_SECONDS: 'soon' }],
    ['wait above the bound', {}, { WAIT_SECONDS: '301' }],
    ['unresolvable deployment', { resolve: 'fail' as const }, {}],
    [
      'caller URL from another deployment',
      { resolvedUrl: 'https://jovie-other.vercel.app' },
      {},
    ],
    ['caller id mismatch', { resolvedId: 'dpl_Other456' }, {}],
    [
      'non-deployment id',
      { resolvedId: 'not-a-deployment' },
      { DEPLOYMENT_ID: '' },
    ],
    ['exact build verification failure', { bootstrap: 'fail' as const }, {}],
  ] satisfies [string, Preview, Record<string, string>][])(
    'fails closed on %s before probing the preview',
    (_name, preview, env) => {
      const result = runCanary(preview, env);
      expect(result.status).toBe(1);
      expect(result.outputs.canary_status).toBe('failed_config');
      expect(result.outputs.verified_deployment_url).toBeUndefined();
      expect(result.curl).toEqual([]);
    }
  );

  it.each([
    [
      'robots.txt serves 404',
      { robots: { code: 404, body: '' } },
      'failed_seo_robots',
    ],
    [
      'robots.txt allows crawling',
      { robots: { code: 200, body: 'User-agent: *\nDisallow: /\nAllow: /' } },
      'failed_seo_robots',
    ],
    [
      'onboarding chat disabled',
      {
        onboarding: {
          code: 503,
          body: '{"errorCode":"ONBOARDING_CHAT_DISABLED"}',
        },
      },
      'failed_onboarding_chat',
    ],
    [
      'onboarding chat skipping the bot gate',
      { onboarding: { code: 200, body: '{}' } },
      'failed_onboarding_chat',
    ],
    [
      'chat reachable without auth',
      { chat: [{ code: 200, body: '{}' }] },
      'failed_chat_auth_gate',
    ],
  ] satisfies [string, Preview, string][])(
    'fails on %s',
    (_name, preview, status) => {
      const result = runCanary(preview);
      expect(result.status).toBe(1);
      expect(result.outputs.canary_status).toBe(status);
    }
  );

  it('retries a warming chat route at most three times', () => {
    const warm = runCanary({
      chat: [
        { code: 503, body: '' },
        { code: 401, body: '{"errorCode":"AUTH_REQUIRED"}' },
      ],
    });
    expect(warm.status, warm.stdout).toBe(0);
    expect(warm.curl.filter(call => call.includes('profileId'))).toHaveLength(
      2
    );
    const down = runCanary({ chat: [{ code: 500, body: '' }] });
    expect(down.status).toBe(1);
    expect(down.curl.filter(call => call.includes('profileId'))).toHaveLength(
      3
    );
  });

  it('exports the canary outcome and exact verified URL to callers', () => {
    expect(gateJob?.outputs).toEqual({
      canary_status:
        '${{ steps.canary-status.outputs.canary_status || steps.canary-check.outputs.canary_status }}',
      verified_deployment_url:
        '${{ steps.canary-check.outputs.verified_deployment_url }}',
    });
  });
});

describe('canary public auth smoke (executed)', { timeout: 60_000 }, () => {
  function runAuth(failures: number) {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), 'jovie-canary-auth-'))
    );
    roots.push(root);
    const bin = join(root, 'bin');
    mkdirSync(bin);
    mkdirSync(join(root, 'apps/web'), { recursive: true });
    writeFileSync(
      join(bin, 'node'),
      `#!/bin/bash
n=$(cat "${root}/attempts" 2>/dev/null || echo 0); echo $((n + 1)) > "${root}/attempts"
env | grep -E '^(BASE_URL|EXPECTED_VERCEL_ENVIRONMENT|PLAYWRIGHT_DYNAMIC_SECRETS_FILE|VERCEL_AUTOMATION_BYPASS_SECRET)=' > "${root}/env-$n"
printf '%s ' "$@" > "${root}/args"
[ "$n" -ge ${failures} ]
`,
      { mode: 0o755 }
    );
    writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const result = spawnSync('bash', ['-c', String(authStep?.run)], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        NODE_ENV: 'test',
        RUNNER_TEMP: root,
        GITHUB_WORKSPACE: root,
        DEPLOYMENT_URL: URL,
      },
    });
    const attempts = Number(readFileSync(join(root, 'attempts'), 'utf8'));
    return { ...result, attempts, root };
  }

  it('runs the guarded smoke against the exact preview with bounded retries', () => {
    const flaky = runAuth(2);
    expect(flaky.status, flaky.stdout).toBe(0);
    expect(flaky.attempts).toBe(3);
    expect(readFileSync(join(flaky.root, 'args'), 'utf8')).toMatch(
      /guard-playwright-artifacts\.mjs --run -- pnpm exec playwright test tests\/e2e\/auth-public-ready\.spec\.ts/
    );
    const env = readFileSync(join(flaky.root, 'env-0'), 'utf8');
    expect(env).toContain(`BASE_URL=${URL}`);
    expect(env).toContain('EXPECTED_VERCEL_ENVIRONMENT=preview');
    expect(env).toContain('PLAYWRIGHT_DYNAMIC_SECRETS_FILE=');

    const broken = runAuth(3);
    expect(broken.status).toBe(1);
    expect(broken.attempts).toBe(3);
    expect(broken.stdout).toContain('failed after 3 attempts');
  });

  it('scopes the bypass secret to the smoke step under its Playwright name', () => {
    expect(authStep?.env).toEqual({
      DEPLOYMENT_URL:
        '${{ steps.canary-check.outputs.verified_deployment_url || inputs.deployment_url }}',
      EXPECTED_COMMIT_SHA: '${{ inputs.commit_sha }}',
      EXPECTED_VERCEL_DEPLOYMENT_ORIGIN:
        '${{ steps.canary-check.outputs.verified_deployment_url }}',
      PLAYWRIGHT_VERCEL_BYPASS_SECRET:
        '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    });
    expect(workflow.env).toBeUndefined();
    expect(gateJob?.env).toBeUndefined();
  });
});
