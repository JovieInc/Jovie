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
  buildProdProbeChatPayload,
  buildProdProbeReceipt,
  CURSOR_AGENTS_URL,
  classifyChangedPaths,
  cursorAuthHeader,
  evaluateProdProbe,
  findOpenAutofixPr,
  findOwnedAgents,
  GOLDEN_PATH_LOCK_SELF_TEST_FILES,
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
const EXECUTION_LEDGER =
  process.env.EXECUTION_ATTEMPT_LEDGER ??
  `/tmp/golden-path-lock-${process.pid}/execution-attempts.jsonl`;

function executionAttempt(command, input) {
  if (command !== 'identity') {
    input.coordination = {
      kind: 'github-status',
      repository: process.env.GH_REPO,
      sha: process.env.EXECUTION_GENERATION || process.env.GITHUB_SHA,
      tokenEnv: 'GH_TOKEN',
      targetUrl: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GH_REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    };
  }
  const result = spawnSync(
    'python3',
    [resolve('scripts/lanes/execution_attempt.py')],
    {
      encoding: 'utf8',
      input: JSON.stringify({ command, ...input }),
    }
  );
  const output = JSON.parse(result.stdout || '{}');
  if (result.status !== 0 || output.error) {
    throw new Error(output.error || `execution-attempt-${command}-failed`);
  }
  return output;
}

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

function runVitest(files, { filterWeb, coverage = false }) {
  const coverageReportDirectory = process.env.RUNNER_TEMP
    ? `${process.env.RUNNER_TEMP}/golden-path-lock-coverage`
    : `/tmp/golden-path-lock-coverage-${process.pid}`;
  const coverageArgs = coverage
    ? [
        '--coverage.enabled',
        '--coverage.provider=v8',
        '--coverage.include=lib/golden-path-lock.mjs',
        `--coverage.reportsDirectory=${coverageReportDirectory}`,
        '--coverage.reporter=text',
        '--coverage.reporter=json-summary',
        '--coverage.reporter=json',
      ]
    : [];
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
        ...coverageArgs,
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
  const self = runVitest(GOLDEN_PATH_LOCK_SELF_TEST_FILES, {
    filterWeb: false,
    coverage: true,
  });
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
      headers: {
        ...headers,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildProdProbeChatPayload()),
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
  const hasActionableFailure = evaluated.checks.some(
    check => !check.ok && check.inconclusive !== true
  );
  if (receipt.inconclusive && !hasActionableFailure) {
    fail(
      'Golden-path prod probe is inconclusive: Turnstile was reached without a valid token; the first-message path was not tested, so no pass or autofix is claimed.'
    );
  }
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

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(
      `gh ${args[0]} ${args[1]} failed; refusing to launch a possible duplicate autofix.`,
      result.stderr
    );
  }
  return result.stdout;
}

function listOpenPrs() {
  return JSON.parse(
    gh([
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '300',
      '--json',
      'number,headRefName,title,body',
    ])
  );
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

  const hasActionableFailure = receipt.checks.some(
    check => !check.ok && check.inconclusive !== true
  );
  if (receipt.inconclusive === true && !hasActionableFailure) {
    fail(
      'Golden-path prod probe is inconclusive: Turnstile was reached without a valid token; no autofix was attempted.'
    );
  }

  const apiKey = process.env.CURSOR_API_KEY ?? '';
  let existingAgentIds = [];
  let openPrNumber = null;
  if (apiKey) {
    // JOV-6832: an unreadable owner list is not permission to launch another
    // agent; 28 duplicate PRs in 5 h came from launching blind.
    openPrNumber = findOpenAutofixPr(listOpenPrs(), receipt.fingerprint);
  }
  if (apiKey && !openPrNumber) {
    const listed = await cursorRequest(
      apiKey,
      `${CURSOR_AGENTS_URL}?limit=100`
    );
    if (!listed.ok) {
      fail(
        `Cursor agent list failed (status ${listed.status}); refusing to launch a possible duplicate.`
      );
    }
    const agents = listed.body?.agents ?? listed.body ?? [];
    existingAgentIds = findOwnedAgents(agents, receipt.fingerprint);
  }

  const plan = planAutofix({
    cursorApiKey: apiKey,
    existingAgentIds,
    openPrNumber,
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
  if (plan.openPrNumber) {
    // The open PR already carries the Linear intake; this run's log is the new evidence.
    fail(
      `Golden-path prod probe failed; open autofix PR #${plan.openPrNumber} owns ${receipt.fingerprint}. No new Cursor launch.`
    );
  }
  if (plan.action === 'dedup') {
    fail(
      `Golden-path prod probe failed; active agents ${plan.existingAgentIds.join(',')} own ${receipt.fingerprint}.`
    );
  }

  const executionIdentity = executionAttempt('identity', {
    domain: 'production-verification-remediation',
    work: { origin: receipt.origin, failureFingerprint: receipt.fingerprint },
    generation: {
      deployment: process.env.EXECUTION_GENERATION || process.env.GITHUB_SHA,
    },
  });
  const execution = executionAttempt('claim', {
    path: EXECUTION_LEDGER,
    ident: executionIdentity,
    owner: {
      owner: process.env.GITHUB_RUN_ID || 'local',
      runtime: 'golden-path-prod-autofix',
      provider: 'cursor',
      model: null,
      tool: 'cursor-agent-api',
      accountPool: 'cursor',
    },
    policy: {
      attempts: 1,
      concurrency: 1,
      wallSeconds: 900,
      spend: 1,
      mutations: 2,
      leaseSeconds: 900,
      version: 'golden-path-autofix-v1',
    },
    trigger: {
      triggerId: process.env.GITHUB_RUN_ID || 'local',
      correlationId: receipt.fingerprint,
      causationId: process.env.EXECUTION_GENERATION || process.env.GITHUB_SHA,
    },
  });
  if (!execution.admitted) {
    fail(`Golden-path autofix execution denied: ${execution.reason}.`);
  }
  executionAttempt('boundary', {
    path: EXECUTION_LEDGER,
    ident: executionIdentity,
    fence: execution.fencingToken,
    reservation: { spend: 1, mutations: 2 },
  });
  const finishExecution = (
    result,
    failureClass,
    failureFingerprint,
    dependencies,
    detail = {}
  ) =>
    executionAttempt('finish', {
      path: EXECUTION_LEDGER,
      ident: executionIdentity,
      fence: execution.fencingToken,
      result,
      detail: {
        failureClass,
        failureFingerprint,
        evidenceDigest: receipt.fingerprint,
        costs: {},
        dependencies,
        ...detail,
      },
    });

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
    finishExecution('failed_unknown', 'intake_unknown', linear.reason, [
      'linear',
    ]);
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
      finishExecution(
        'failed_unknown',
        'provider_unknown',
        `cursor:${launched.status}`,
        ['cursor']
      );
      fail(
        `Cursor-direct launch failed (status ${launched.status}).`,
        JSON.stringify(launched.body)
      );
    }
    console.error(
      `Launched Cursor-direct autofix ${launched.body?.id ?? ''} fingerprint=${receipt.fingerprint}`
    );
    finishExecution('succeeded', null, null, ['linear', 'cursor'], {
      costs: { apiCalls: 1 },
      mutationsPerformed: ['linear_issue', 'cursor_agent'],
      confidence: 'high',
    });
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
