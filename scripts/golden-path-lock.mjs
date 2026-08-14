#!/usr/bin/env node
/**
 * Fail-closed golden-path lock CLI (JOV-5085).
 * merge-gate | prod-probe | autofix --receipt <path>
 * Never skip because secrets are missing. Never read E2E_PROD.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  buildAutofixPrompt,
  buildMergeGateReceipt,
  buildProdProbeReceipt,
  CURSOR_AGENTS_URL,
  classifyChangedPaths,
  cursorAuthHeader,
  evaluateProdProbe,
  findOwnedAgents,
  GOLDEN_PATH_LOCK_SELF_TEST,
  GOLDEN_PATH_PROD_ORIGIN,
  MERGE_GATE_TEST_FILES,
  planAutofix,
  validateReceipt,
} from './lib/golden-path-lock.mjs';

const FORBIDDEN_ENV = Object.freeze([
  'E2E_PROD_USER',
  'E2E_PROD_PASSWORD',
  'E2E_PROD_EMAIL',
  'E2E_CLERK_USER',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/golden-path-lock.mjs merge-gate [--receipt <path>] [--changed-files <path>]',
    '  node scripts/golden-path-lock.mjs prod-probe [--origin <url>] [--receipt <path>]',
    '  node scripts/golden-path-lock.mjs autofix --receipt <path>',
  ].join('\n');
}

function fail(message, extra) {
  console.error(message);
  if (extra) console.error(extra);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { command: argv[2], origin: GOLDEN_PATH_PROD_ORIGIN };
  for (let i = 3; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--receipt') {
      args.receipt = value;
      i += 1;
    } else if (flag === '--changed-files') {
      args.changedFiles = value;
      i += 1;
    } else if (flag === '--origin') {
      args.origin = value;
      i += 1;
    } else if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else {
      fail(`Unknown argument: ${flag}\n${usage()}`);
    }
  }
  return args;
}

function assertNoSignupSecretSkip() {
  // Presence of signup secrets is fine; the CLI never reads them to skip.
  for (const name of FORBIDDEN_ENV) {
    void process.env[name];
  }
}

function readChangedFiles(path) {
  if (!path) {
    const fromEnv = process.env.GOLDEN_PATH_CHANGED_FILES ?? '';
    return fromEnv
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }
  return readFileSync(path, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function writeReceipt(receipt, path) {
  const validated = validateReceipt(receipt);
  if (!validated.ok) {
    fail(
      'Golden-path lock receipt is invalid (fail closed).',
      validated.errors.join('\n')
    );
  }
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  if (path) writeFileSync(path, json);
  process.stdout.write(json);
}

function toWebVitestFiles(files) {
  return files.map(file =>
    file.startsWith('apps/web/') ? file.slice('apps/web/'.length) : file
  );
}

function runVitest(files, { filterWeb }) {
  const command = filterWeb
    ? [
        'pnpm',
        '--filter',
        '@jovie/web',
        'exec',
        'vitest',
        'run',
        ...toWebVitestFiles(files),
      ]
    : [
        'pnpm',
        'exec',
        'vitest',
        '--root',
        'scripts',
        '--config',
        'vitest.config.mts',
        'run',
        ...files,
      ];
  const result = spawnSync(command[0], command.slice(1), {
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    return {
      ok: false,
      reason: `failed to spawn vitest: ${result.error.message}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `vitest exited ${result.status} for ${files.join(', ')}`,
    };
  }
  return { ok: true, reason: `vitest passed ${files.join(', ')}` };
}

async function fetchJsonSafe(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function runMergeGate(args) {
  assertNoSignupSecretSkip();
  const classification = classifyChangedPaths(
    readChangedFiles(args.changedFiles)
  );
  const product = runVitest(MERGE_GATE_TEST_FILES, { filterWeb: true });
  const self = runVitest([GOLDEN_PATH_LOCK_SELF_TEST], { filterWeb: false });
  const checks = [
    {
      id: 'merge-gate-product-tests',
      ok: product.ok,
      reason: product.reason,
    },
    {
      id: 'merge-gate-lock-tests',
      ok: self.ok,
      reason: self.reason,
    },
  ];
  const receipt = buildMergeGateReceipt({
    ok: checks.every(check => check.ok),
    checks,
    classification,
  });
  writeReceipt(receipt, args.receipt);
  if (!receipt.ok) {
    fail('Golden-path merge gate failed closed.');
  }
}

async function runProdProbe(args) {
  assertNoSignupSecretSkip();
  const origin = (args.origin || GOLDEN_PATH_PROD_ORIGIN).replace(/\/$/, '');
  const headers = {
    'User-Agent': 'jovie-golden-path-lock/1',
    Accept: 'text/html,application/json',
  };

  let homepageHtml = '';
  let chatStatus;
  let chatBody = '';
  let waitlistStatus;

  try {
    const homepage = await fetch(origin, { headers, redirect: 'follow' });
    homepageHtml = await homepage.text();
  } catch (error) {
    homepageHtml = '';
    console.error(
      `homepage fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const chat = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    chatStatus = chat.status;
    const parsed = await fetchJsonSafe(chat);
    chatBody = parsed.json ?? parsed.text;
  } catch (error) {
    chatStatus = 0;
    chatBody = error instanceof Error ? error.message : String(error);
  }

  try {
    const waitlist = await fetch(`${origin}/api/waitlist`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryGoal: 'streams' }),
    });
    waitlistStatus = waitlist.status;
  } catch (error) {
    waitlistStatus = 0;
    console.error(
      `waitlist fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  const evaluated = evaluateProdProbe({
    homepageHtml,
    chatStatus,
    chatBody,
    waitlistStatus,
  });
  const receipt = buildProdProbeReceipt({
    ok: evaluated.ok,
    checks: evaluated.checks,
    origin,
  });
  writeReceipt(receipt, args.receipt);
  if (!receipt.ok) {
    fail('Golden-path prod probe failed closed.');
  }
}

async function cursorRequest(apiKey, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: cursorAuthHeader(apiKey),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const parsed = await fetchJsonSafe(response);
  return {
    ok: response.ok,
    status: response.status,
    body: parsed.json ?? parsed.text,
  };
}

async function createGithubIssue({ fingerprint, prompt }) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  if (!token) {
    return { ok: false, reason: 'missing_github_token' };
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `[golden-path-lock] prod break: ${fingerprint}`,
        body: prompt,
        labels: ['p0', 'golden-path-lock'],
      }),
    }
  );
  const parsed = await fetchJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      reason: `github_issue_${response.status}`,
      body: parsed.json ?? parsed.text,
    };
  }
  return { ok: true, url: parsed.json?.html_url ?? null };
}

async function createLinearIssue({ fingerprint, prompt }) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'missing_linear_api_key' };
  }
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation CreateGoldenPathLockIssue($title: String!, $description: String!) {
          issueCreate(input: {
            teamId: "bdc09edc-f91c-4a06-b308-74b4fcf093f8"
            title: $title
            description: $description
            priority: 1
          }) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: {
        title: `P0: golden path broken in prod (${fingerprint})`,
        description: `${prompt}\n\nGem missed this after the JOV-5085 lock was on.`,
      },
    }),
  });
  const parsed = await fetchJsonSafe(response);
  if (!response.ok || !parsed.json?.data?.issueCreate?.success) {
    return {
      ok: false,
      reason: 'linear_issue_failed',
      body: parsed.json ?? parsed.text,
    };
  }
  return { ok: true, url: parsed.json.data.issueCreate.issue?.url ?? null };
}

async function runAutofix(args) {
  if (!args.receipt) fail('autofix requires --receipt <path>');
  const receipt = JSON.parse(readFileSync(resolve(args.receipt), 'utf8'));
  const validated = validateReceipt(receipt);
  if (!validated.ok) {
    fail(
      'Golden-path lock receipt is invalid (fail closed).',
      validated.errors.join('\n')
    );
  }
  if (receipt.ok) {
    writeReceipt(
      {
        ...receipt,
        mode: 'autofix',
        checks: [
          ...receipt.checks,
          {
            id: 'autofix',
            ok: true,
            reason: 'prod probe passed; no Cursor launch',
          },
        ],
      },
      null
    );
    return;
  }

  const apiKey = process.env.CURSOR_API_KEY ?? '';
  let existingAgentIds = [];
  if (apiKey) {
    const listed = await cursorRequest(apiKey, CURSOR_AGENTS_URL);
    if (listed.ok) {
      const agents = listed.body?.agents ?? listed.body ?? [];
      existingAgentIds = findOwnedAgents(agents, receipt.fingerprint);
    }
  }

  const plan = planAutofix({
    cursorApiKey: apiKey,
    existingAgentIds,
    fingerprint: receipt.fingerprint,
    checks: receipt.checks,
    origin: receipt.origin,
    receipt,
  });

  if (plan.action === 'fail_closed') {
    fail(
      'Golden-path prod break cannot autofix: CURSOR_API_KEY is missing. Detect without a ship lock is a hole.'
    );
  }

  const prompt = buildAutofixPrompt({
    fingerprint: receipt.fingerprint,
    checks: receipt.checks,
    origin: receipt.origin,
    receipt,
  });
  const github = await createGithubIssue({
    fingerprint: receipt.fingerprint,
    prompt,
  });
  const linear = await createLinearIssue({
    fingerprint: receipt.fingerprint,
    prompt,
  });

  if (plan.action === 'launch') {
    const launched = await cursorRequest(apiKey, CURSOR_AGENTS_URL, {
      method: 'POST',
      body: JSON.stringify(plan.request),
    });
    if (!launched.ok) {
      fail(
        `Cursor-direct launch failed (status ${launched.status}).`,
        JSON.stringify(launched.body)
      );
    }
    console.error(
      `Launched Cursor-direct autofix ${launched.body?.id ?? ''} fingerprint=${receipt.fingerprint}`
    );
  } else {
    console.error(
      `Deduped Cursor-direct autofix fingerprint=${receipt.fingerprint} agents=${plan.existingAgentIds.join(',')}`
    );
  }

  if (!github.ok) {
    console.error(`GitHub paper trail failed: ${github.reason}`);
  }
  if (!linear.ok) {
    console.error(`Linear paper trail failed: ${linear.reason}`);
  }

  fail(
    `Golden-path prod probe failed; Cursor-direct ${plan.action} for ${receipt.fingerprint}. Gem missed this.`
  );
}

const args = parseArgs(process.argv);
if (args.help || !args.command) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const commands = {
  'merge-gate': runMergeGate,
  'prod-probe': runProdProbe,
  autofix: runAutofix,
};

const run = commands[args.command];
if (!run) fail(`Unknown command: ${args.command}\n${usage()}`);

run(args).catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
