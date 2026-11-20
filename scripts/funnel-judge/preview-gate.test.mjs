import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  backoffMs,
  funnelPaths,
  POLL_CAP_MS,
  parseDeploymentUrl,
  parseDopplerScopes,
  previewUrlFor,
  readBypassSecret,
} from './preview-gate.mjs';

const SHA = 'a'.repeat(40);

test('only funnel surfaces trigger the gate', () => {
  assert.deepEqual(
    funnelPaths([
      'apps/web/app/[username]/page.tsx',
      'apps/web/app/(dynamic)/start/page.tsx',
      'apps/web/components/features/onboarding/Step.tsx',
      'apps/web/components/features/profile/Card.test.tsx',
      'apps/web/components/features/chat/Composer.tsx',
      'apps/web/app/(marketing)/pricing/page.tsx',
      'scripts/lanes/lane_runner.py',
    ]),
    [
      'apps/web/app/[username]/page.tsx',
      'apps/web/app/(dynamic)/start/page.tsx',
      'apps/web/components/features/onboarding/Step.tsx',
    ]
  );
});

test('preview lookup accepts colorized gh JSON', async () => {
  const paint = value => `\u001B[1;37m${JSON.stringify(value)}\u001B[m\n`;
  const result = await previewUrlFor({
    sha: SHA,
    ref: 'feat/x',
    pr: 1,
    gh: args => {
      const path = args[1] ?? '';
      if (path.includes('/runs?')) {
        return { status: 0, stdout: paint({ workflow_runs: [{ id: 7 }] }) };
      }
      if (path.includes('/jobs?')) {
        return {
          status: 0,
          stdout: paint({
            jobs: [
              {
                id: 9,
                name: 'Preview Deploy (manual)',
                status: 'completed',
                conclusion: 'success',
              },
            ],
          }),
        };
      }
      if (path.includes('/logs')) {
        return {
          status: 0,
          stdout: '  DEPLOYMENT_URL: https://jovie-x.vercel.app\n',
        };
      }
      return { status: 0, stdout: 'null' };
    },
    ...clock(),
  });
  assert.deepEqual(result, {
    url: 'https://jovie-x.vercel.app',
    reason: null,
  });
});

test('reads the preview URL from the readiness step env block', () => {
  const log = [
    '2026-10-04T01:00:00Z ##[group]Run set -euo pipefail',
    '2026-10-04T01:00:00Z env:',
    '2026-10-04T01:00:00Z   DEPLOYMENT_URL: https://jovie-abc123-jovie.vercel.app',
  ].join('\n');
  assert.equal(
    parseDeploymentUrl(log),
    'https://jovie-abc123-jovie.vercel.app'
  );
  assert.equal(parseDeploymentUrl('no url here'), null);
  assert.equal(
    parseDeploymentUrl('  DEPLOYMENT_URL: https://***-abc123-***.vercel.app\n'),
    null
  );
  const encoded = Buffer.from('https://jovie-abc123-jovie.vercel.app').toString(
    'base64'
  );
  assert.equal(
    parseDeploymentUrl(
      [
        '  DEPLOYMENT_URL: https://***-abc123-***.vercel.app',
        `  DEPLOYMENT_URL_B64: ${encoded}`,
      ].join('\n')
    ),
    'https://jovie-abc123-jovie.vercel.app'
  );
});

test('preview readiness prints a base64 URL the log mask cannot punch out', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8'
  );
  const start = workflow.indexOf('name: Wait for PR preview readiness');
  assert.ok(start >= 0);
  const step = workflow.slice(start, workflow.indexOf('\n      - ', start + 1));
  assert.match(
    step,
    /echo "DEPLOYMENT_URL_B64: \$\(printf '%s' "\$DEPLOYMENT_URL" \| base64 -w0\)"/
  );
});

test('backoff never polls faster than every 30s', () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.ok(backoffMs(attempt) >= 30_000);
    assert.ok(backoffMs(attempt) <= 120_000);
  }
});

/** A scripted gh: each `api` path maps to a queue of replies. */
function fakeGh(routes) {
  const calls = [];
  const gh = args => {
    calls.push(args.join(' '));
    if (args[0] === 'workflow') return { status: 0, stdout: '' };
    const path = args[1];
    const key = Object.keys(routes).find(prefix => path.startsWith(prefix));
    const queue = key ? routes[key] : [];
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    return typeof reply === 'string'
      ? { status: 0, stdout: reply }
      : { status: 0, stdout: JSON.stringify(reply ?? null) };
  };
  return { gh, calls };
}

function clock() {
  let t = 0;
  const sleeps = [];
  return {
    now: () => t,
    sleep: async ms => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

test('dispatches a preview for the exact head, then waits one call per interval', async () => {
  const { gh, calls } = fakeGh({
    'repos/JovieInc/Jovie/actions/workflows/ci.yml/runs': [
      { workflow_runs: [] },
      { workflow_runs: [{ id: 7 }] },
    ],
    'repos/JovieInc/Jovie/branches/': [{ commit: { sha: SHA } }],
    'repos/JovieInc/Jovie/actions/runs/7/jobs': [
      {
        jobs: [
          { id: 9, name: 'Preview Deploy (manual)', status: 'in_progress' },
        ],
      },
      {
        jobs: [
          {
            id: 9,
            name: 'Preview Deploy (manual)',
            status: 'completed',
            conclusion: 'success',
          },
        ],
      },
    ],
    'repos/JovieInc/Jovie/actions/jobs/9/logs': [
      '  DEPLOYMENT_URL: https://jovie-x.vercel.app\n',
    ],
  });
  const time = clock();
  const result = await previewUrlFor({
    sha: SHA,
    ref: 'feat/x',
    pr: 1,
    gh,
    ...time,
  });

  assert.deepEqual(result, { url: 'https://jovie-x.vercel.app', reason: null });
  assert.ok(calls.some(call => call.startsWith('workflow run ci.yml')));
  assert.ok(calls.some(call => call.includes('run_preview_deploy=true')));
  assert.ok(time.sleeps.every(ms => ms >= 30_000));
  // Between sleeps there is exactly one GitHub call once the run is known.
  const polls = calls.filter(call => call.includes('/runs/7/jobs'));
  assert.equal(polls.length, 2);
});

test('holds when the branch moved past the head, without dispatching', async () => {
  const { gh, calls } = fakeGh({
    'repos/JovieInc/Jovie/actions/workflows/ci.yml/runs': [
      { workflow_runs: [] },
    ],
    'repos/JovieInc/Jovie/branches/': [{ commit: { sha: 'b'.repeat(40) } }],
  });
  const result = await previewUrlFor({
    sha: SHA,
    ref: 'feat/x',
    pr: 1,
    gh,
    ...clock(),
  });

  assert.equal(result.url, null);
  assert.match(result.reason, /moved past/);
  assert.ok(!calls.some(call => call.startsWith('workflow')));
});

test('gives up at the 15-minute cap and on a failed preview job', async () => {
  const { gh } = fakeGh({
    'repos/JovieInc/Jovie/actions/workflows/ci.yml/runs': [
      { workflow_runs: [{ id: 7 }] },
    ],
    'repos/JovieInc/Jovie/actions/runs/7/jobs': [
      { jobs: [{ id: 9, name: 'Preview Deploy (manual)', status: 'queued' }] },
    ],
  });
  const time = clock();
  const capped = await previewUrlFor({
    sha: SHA,
    ref: 'feat/x',
    pr: 1,
    gh,
    ...time,
  });
  assert.match(capped.reason, /within 15 minutes/);
  assert.ok(time.now() <= POLL_CAP_MS);

  const { gh: failing } = fakeGh({
    'repos/JovieInc/Jovie/actions/workflows/ci.yml/runs': [
      { workflow_runs: [{ id: 7 }] },
    ],
    'repos/JovieInc/Jovie/actions/runs/7/jobs': [
      {
        jobs: [
          {
            id: 9,
            name: 'Preview Deploy (manual)',
            status: 'completed',
            conclusion: 'failure',
          },
        ],
      },
    ],
  });
  const failed = await previewUrlFor({
    sha: SHA,
    ref: 'feat/x',
    pr: 1,
    gh: failing,
    ...clock(),
  });
  assert.match(failed.reason, /preview deploy failure/);
});

const DOPPLER_CONFIG = `
scoped:
  /work/other:
    token: other-token
    enclave.project: other
    enclave.config: dev
  "/work/jovie":
    token: scoped-token
    enclave.project: "jovie-web"
    enclave.config: 'dev'
version-check: {}
tui:
  introVersionSeen: 0
`;

test('reads jovie-web/dev directories from the Doppler CLI config', () => {
  assert.deepEqual(parseDopplerScopes(DOPPLER_CONFIG), ['/work/jovie']);
  assert.deepEqual(
    parseDopplerScopes(DOPPLER_CONFIG, { project: 'other', config: 'dev' }),
    ['/work/other']
  );
  assert.deepEqual(parseDopplerScopes(''), []);
  // Doppler's own file uses 4-space indentation and an inline sibling map.
  assert.deepEqual(
    parseDopplerScopes(`
scoped:
    /home/dev/Jovie:
        token: secret
        enclave.project: jovie-web
        enclave.config: dev
version-check: {}
tui:
    introVersionSeen: 0
`),
    ['/home/dev/Jovie']
  );
});

test('uses a saved Doppler scope when the worktree has no token', () => {
  const calls = [];
  const secret = readBypassSecret({
    env: {},
    scopes: ['/work/jovie'],
    spawn: (_cmd, args) => {
      calls.push(args);
      if (!args.includes('--scope')) {
        return { status: 1, stdout: '', stderr: 'you must provide a token' };
      }
      return { status: 0, stdout: 'bypass-secret\n' };
    },
  });
  assert.equal(secret, 'bypass-secret');
  assert.equal(calls.length, 2);
  assert.equal(calls[1][calls[1].indexOf('--scope') + 1], '/work/jovie');
  assert.ok(calls[1].includes('--project'));
  assert.ok(calls[1].includes('jovie-web'));
});

test('prefers the environment bypass secret and ignores empty Doppler output', () => {
  let calls = 0;
  assert.equal(
    readBypassSecret({
      env: { VERCEL_AUTOMATION_BYPASS_SECRET: ' from-env ' },
      scopes: ['/work/jovie'],
      spawn: () => {
        calls += 1;
        return { status: 0, stdout: 'should-not-run' };
      },
    }),
    'from-env'
  );
  assert.equal(calls, 0);

  assert.equal(
    readBypassSecret({
      env: {},
      scopes: ['/work/jovie'],
      spawn: () => ({ status: 0, stdout: '  \n' }),
    }),
    null
  );
});
