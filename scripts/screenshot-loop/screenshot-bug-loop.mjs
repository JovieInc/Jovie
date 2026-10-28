#!/usr/bin/env node
/**
 * Screenshot → verified bug-fix loop (JOV-8121).
 *
 * Standing rule: a Mac screenshot that shows a Jovie/LYB product surface is a
 * bug report. Personal screenshots stay silent — they are classified, receipted
 * as ignored, and never externalized.
 *
 * Pipeline per capture (each stage emits a receipt into a JSONL ledger):
 *
 *   capture    — watch configured screenshot dirs; idempotent event keys
 *                (sha256 of path+size+mtime+content prefix).
 *   classify   — vision provider answers product|personal|unknown. Runs
 *                BEFORE any externalization; only product captures continue.
 *   analyze    — product captures get a bounded bug-analysis pass.
 *   admit      — one Linear issue per bug, deduplicated by a content-hash
 *                fingerprint through scripts/lib/linear-issue-intake.mjs.
 *   dispatch   — issue lands on the normal ledger (agent-ready label).
 *   verify     — chain receipt records every stage; anything short of a
 *                filed/deduped product issue or a silent personal receipt
 *                is not "verified".
 *
 * Vision routing (JOV-8702): Claude Code subscription, then Codex subscription.
 * Reuses the art evaluator's subscription transport; no metered API route.
 * When every provider is unavailable the loop fails closed with a receipt and
 * leaves the event unprocessed so the next sweep retries.
 *
 * Usage:
 *   node scripts/screenshot-loop/screenshot-bug-loop.mjs --once
 *   node scripts/screenshot-loop/screenshot-bug-loop.mjs --watch 5000
 *   node scripts/screenshot-loop/screenshot-bug-loop.mjs --once --dir ~/Desktop
 *
 * Env:
 *   SCREENSHOT_WATCH_DIRS    — colon/comma separated dirs (default ~/Desktop)
 *   SCREENSHOT_LOOP_STATE_DIR— ledger dir (default ~/.jovie/screenshot-loop)
 *   SCREENSHOT_LOOP_DISABLED — "1" halts intake without filing
 */

import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertLinearIssueByTitleFingerprint } from '../lib/linear-issue-intake.mjs';
import { AGENT_READY_LABEL } from '../lib/remediation-signal.mjs';
import { subscriptionVisionTransport } from '../vision/art-evaluator.mjs';

export const SCREENSHOT_LOOP_SCHEMA = 'jovie.screenshot-bug-loop/v1';
export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);
const TERMINAL_STATUSES = new Set([
  'filed',
  'deduplicated',
  'ignored-personal',
  'ignored-unknown',
]);
const MAX_ISSUE_TITLE = 120;

export function screenshotLoopDisabled(env = process.env) {
  return (
    env.SCREENSHOT_LOOP_DISABLED === '1' ||
    env.REMEDIATION_TRIGGERS_DISABLED === 'true'
  );
}

export function watchDirs(env = process.env, home = homedir()) {
  const configured = env.SCREENSHOT_WATCH_DIRS;
  if (!configured || !configured.trim()) return [join(home, 'Desktop')];
  return configured
    .split(/[,:]/)
    .map(dir => dir.trim())
    .filter(Boolean)
    .map(dir => resolve(dir.replace(/^~(?=$|\/)/, home)));
}

export function stateDir(env = process.env, home = homedir()) {
  return (
    env.SCREENSHOT_LOOP_STATE_DIR ?? join(home, '.jovie', 'screenshot-loop')
  );
}

/** Stable idempotent event key: same file content at the same path dedupes. */
export function eventKey(entry) {
  const hash = createHash('sha256')
    .update(entry.path)
    .update(String(entry.size))
    .update(String(entry.mtimeMs))
    .update(entry.contentPrefix ?? '')
    .digest('hex');
  return `shot-${hash.slice(0, 20)}`;
}

/** Content-hash bug fingerprint; same screenshot filed twice dedupes. */
export function bugFingerprint(imageBuffer) {
  const hash = createHash('sha256').update(imageBuffer).digest('hex');
  return `screenshot-${hash.slice(0, 12)}`;
}

export function listScreenshotEvents(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .map(name => {
      const path = join(dir, name);
      const stat = statSync(path);
      if (!stat.isFile()) return null;
      const contentPrefix = createHash('sha256')
        .update(readFileSync(path).subarray(0, 4096))
        .digest('hex');
      return {
        path,
        name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        contentPrefix,
        eventKey: null,
      };
    })
    .filter(Boolean)
    .map(entry => ({ ...entry, eventKey: eventKey(entry) }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export function loadLedger(ledgerPath) {
  const events = new Map();
  if (!existsSync(ledgerPath)) return events;
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record?.eventKey) events.set(record.eventKey, record);
  }
  return events;
}

export function appendReceipt(ledgerPath, receipt) {
  mkdirSync(resolve(ledgerPath, '..'), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(receipt)}\n`);
}

const CLASSIFY_PROMPT = `You are classifying a macOS screenshot for a privacy-safe bug-report pipeline.
Answer ONLY with minified JSON:
{"surface":"jovie-product"|"personal"|"unknown","product":"jovie"|"lyb"|null,"summary":"one sentence"}
"jovie-product" means the visible surface is the Jovie web app, Jovie iOS/macOS app, or LYB product UI. Personal photos, messages, code editors, and anything else are "personal".`;

const ANALYZE_PROMPT = `This screenshot shows a Jovie/LYB product surface and is being treated as a bug report.
Answer ONLY with minified JSON:
{"title":"imperative bug title <= 80 chars","symptoms":"what looks broken","repro":"likely reproduction path","severity":"P0"|"P1"|"P2"}
Do not include personal information visible in the capture.`;

function parseJsonObject(text) {
  const match = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Subscription-only routes. Missing CLIs/auth fail through to the next lane. */
export function defaultVisionProviders(
  env = process.env,
  transport = subscriptionVisionTransport({ env })
) {
  return [
    { name: 'claude-subscription', model: 'anthropic/claude-sonnet-5.5' },
    { name: 'codex-subscription', model: 'openai/gpt-5.6-luna' },
  ].map(({ name, model }) => ({
    name,
    // The shared transport checks executable/auth failures without API fallback.
    available: () => true,
    async analyze(path, prompt) {
      const text = await transport({
        model,
        system:
          'Inspect only the attached screenshot. Return only the requested JSON.',
        prompt,
        images: [path],
      });
      return { ok: true, text };
    },
  }));
}

/**
 * Run `prompt` against the provider route in order. Providers that are not
 * configured are skipped; providers that fail move to the next. When every
 * provider fails the caller must fail closed — the returned receipt carries
 * each provider's reason.
 */
export async function routeVisionPrompt({
  path,
  prompt,
  providers,
  fetchImpl,
}) {
  const attempts = [];
  for (const provider of providers) {
    if (!provider.available()) {
      attempts.push({ provider: provider.name, reason: 'unconfigured' });
      continue;
    }
    let result;
    try {
      result = await provider.analyze(path, prompt, fetchImpl);
    } catch (error) {
      result = { ok: false, reason: `transport:${error?.message ?? 'error'}` };
    }
    attempts.push({
      provider: provider.name,
      reason: result.ok ? 'ok' : result.reason,
    });
    if (result.ok) {
      return { ok: true, provider: provider.name, text: result.text, attempts };
    }
  }
  return { ok: false, reason: 'vision_providers_unavailable', attempts };
}

function truncate(text, max) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function issueTitle(analysis) {
  return truncate(
    `Screenshot bug: ${analysis.title ?? 'product capture'}`,
    MAX_ISSUE_TITLE
  );
}

/** Issue body links evidence by hash only — no path, no image content. */
export function issueDescription({
  fingerprint,
  classification,
  analysis,
  entry,
}) {
  return [
    'A Jovie/LYB product screenshot was captured on a Mac; per standing rule it is treated as a bug report.',
    '',
    '## Evidence',
    `- Evidence-Key: ${fingerprint}`,
    `- Captured-At: ${new Date(entry.mtimeMs).toISOString()}`,
    `- Surface: ${classification.surface} (${classification.product ?? 'jovie'})`,
    `- Observed: ${classification.summary ?? 'n/a'}`,
    '',
    '## Analysis',
    `- Symptoms: ${analysis.symptoms ?? 'unknown'}`,
    `- Repro: ${analysis.repro ?? 'unknown'}`,
    `- Severity: ${analysis.severity ?? 'P1'}`,
    '',
    'The image itself stays on the capture host; re-derive it from the evidence key if needed.',
  ].join('\n');
}

/**
 * Process one captured screenshot end to end. Returns the receipt appended to
 * the ledger. Dependencies (vision providers, Linear intake) are injectable so
 * the regression suite can drive every branch without network access.
 */
export async function processScreenshot({
  entry,
  ledgerPath,
  providers = defaultVisionProviders(),
  fetchImpl = fetch,
  intake = upsertLinearIssueByTitleFingerprint,
  env = process.env,
  now = () => new Date().toISOString(),
}) {
  const receipt = {
    schema: SCREENSHOT_LOOP_SCHEMA,
    eventKey: entry.eventKey,
    file: basename(entry.path),
    capturedAt: new Date(entry.mtimeMs).toISOString(),
    stages: {},
    recordedAt: now(),
  };
  const finish = (status, extra = {}) => {
    const record = { ...receipt, status, ...extra };
    appendReceipt(ledgerPath, record);
    return record;
  };

  if (screenshotLoopDisabled(env)) {
    return finish('disabled');
  }

  const classificationResult = await routeVisionPrompt({
    path: entry.path,
    prompt: CLASSIFY_PROMPT,
    providers,
    fetchImpl,
  });
  if (!classificationResult.ok) {
    receipt.stages.classify = {
      status: 'failed-closed',
      attempts: classificationResult.attempts,
    };
    return finish('provider-unavailable', { retryable: true });
  }
  const classification = parseJsonObject(classificationResult.text) ?? {
    surface: 'unknown',
  };
  receipt.stages.classify = {
    status: 'ok',
    provider: classificationResult.provider,
    surface: classification.surface,
  };

  if (classification.surface === 'personal') {
    return finish('ignored-personal');
  }
  if (classification.surface !== 'jovie-product') {
    return finish('ignored-unknown');
  }

  const analysisResult = await routeVisionPrompt({
    path: entry.path,
    prompt: ANALYZE_PROMPT,
    providers,
    fetchImpl,
  });
  if (!analysisResult.ok) {
    receipt.stages.analyze = {
      status: 'failed-closed',
      attempts: analysisResult.attempts,
    };
    return finish('provider-unavailable', { retryable: true });
  }
  const analysis = parseJsonObject(analysisResult.text) ?? {};
  receipt.stages.analyze = { status: 'ok', provider: analysisResult.provider };

  const imageBuffer = readFileSync(entry.path);
  const fingerprint = bugFingerprint(imageBuffer);
  const priority = { P0: 1, P1: 2, P2: 3 }[analysis.severity] ?? 2;
  const result = await intake({
    fingerprint,
    title: issueTitle(analysis),
    description: issueDescription({
      fingerprint,
      classification,
      analysis,
      entry,
    }),
    priority,
    labelKey: fingerprint,
    createLabelIds: [],
    fetchImpl,
  });
  receipt.stages.admit = {
    status: result?.ok ? 'ok' : 'failed',
    reason: result?.reason ?? null,
    issue: result?.identifier ?? null,
  };
  if (!result?.ok) {
    return finish('admission-failed', { reason: result?.reason ?? 'unknown' });
  }
  const deduplicated = result.action !== 'created';
  receipt.stages.dispatch = { status: 'ok', label: AGENT_READY_LABEL };
  receipt.stages.verify = {
    status: 'chain-verified',
    chain: ['capture', 'classify', 'analyze', 'admit', 'dispatch'],
  };
  return finish(deduplicated ? 'deduplicated' : 'filed', {
    fingerprint,
    issue: receipt.stages.admit.issue,
  });
}

/**
 * One sweep over the watch dirs. Terminal receipts dedupe; retryable failures
 * (provider-unavailable) are left unprocessed so the next sweep retries.
 */
export async function sweepOnce({
  dirs = watchDirs(),
  ledgerPath = join(stateDir(), 'events.jsonl'),
  ...deps
} = {}) {
  const ledger = loadLedger(ledgerPath);
  const receipts = [];
  for (const dir of dirs) {
    for (const entry of listScreenshotEvents(dir)) {
      const prior = ledger.get(entry.eventKey);
      if (prior && TERMINAL_STATUSES.has(prior.status)) {
        receipts.push({ ...prior, status: 'deduplicated-sweep' });
        continue;
      }
      const receipt = await processScreenshot({ entry, ledgerPath, ...deps });
      ledger.set(entry.eventKey, receipt);
      receipts.push(receipt);
    }
  }
  return receipts;
}

function parseArgs(argv) {
  const args = { dirs: [], watchMs: 0, ledgerPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--watch') args.watchMs = Number(argv[++i] ?? 5000);
    else if (arg === '--once') args.watchMs = 0;
    else if (arg === '--dir') args.dirs.push(resolve(argv[++i]));
    else if (arg === '--state-dir')
      args.ledgerPath = join(resolve(argv[++i]), 'events.jsonl');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirs = args.dirs.length > 0 ? args.dirs : watchDirs();
  const ledgerPath = args.ledgerPath ?? join(stateDir(), 'events.jsonl');
  const run = async () => {
    const receipts = await sweepOnce({ dirs, ledgerPath });
    for (const receipt of receipts) {
      console.log(
        `${receipt.status} ${receipt.eventKey} ${receipt.file ?? ''} ${receipt.issue ?? ''}`.trim()
      );
    }
  };
  if (args.watchMs > 0) {
    for (;;) {
      await run();
      await new Promise(resolvePromise =>
        setTimeout(resolvePromise, args.watchMs)
      );
    }
  } else {
    await run();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error);
    process.exit(2);
  });
}
