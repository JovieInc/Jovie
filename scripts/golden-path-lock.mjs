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
import { createGoldenPathLinearIssue } from './lib/golden-path-intake.mjs';
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
  let claimStatus;
  let billingStatus;
  let billingBody;
  let stripeWebhookStatus;

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

  try {
    const claim = await fetch(`${origin}/api/onboarding/claim`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    claimStatus = claim.status;
  } catch (error) {
    claimStatus = 0;
    console.error(
      `claim fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const billing = await fetch(`${origin}/api/billing/health`, {
      headers,
      redirect: 'follow',
    });
    billingStatus = billing.status;
    const parsed = await fetchJsonSafe(billing);
    billingBody = parsed.json ?? parsed.text;
  } catch (error) {
    billingStatus = 0;
    billingBody = error instanceof Error ? error.message : String(error);
    console.error(
      `billing health fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const webhook = await fetch(`${origin}/api/stripe/webhooks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    stripeWebhookStatus = webhook.status;
  } catch (error) {
    stripeWebhookStatus = 0;
    console.error(
      `stripe webhook fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  const evaluated = evaluateProdProbe({
    homepageHtml,
    chatStatus,
    chatBody,
    waitlistStatus,
    claimStatus,
    billingStatus,
    billingBody,
    stripeWebhookStatus,
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
  // JOV-5966: the intake itself dedupes by fingerprint (fail-closed) and
  // files P0s straight into Todo, skipping the Triage queue.
  const linear = await createGoldenPathLinearIssue({
    fingerprint: receipt.fingerprint,
    prompt,
  });
  if (!linear.ok) {
    fail(
      `Linear intake failed closed: ${linear.reason}. No GitHub fallback or Cursor dispatch was attempted.`,
      JSON.stringify(linear.body ?? null)
    );
  }

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
