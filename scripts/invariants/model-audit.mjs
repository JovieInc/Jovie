#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  AUDIT_PROBE_SCHEMA,
  AUDIT_RECEIPT_SCHEMA,
  auditCapableModels,
  buildAuditPrompt,
  catalogFingerprint,
  classifyAuditFailure,
  deriveAuditTrigger,
  sha256 as digest,
  parseAuditResponse,
  planAuditMatrix,
  probeOutcome,
  proposalRecords,
  stableSerialize as stable,
  validateAuditResult,
  validateLivingInvariantSet,
} from './model-audit-contract.mjs';
import { readInvariantRegistry } from './registry.mjs';

export * from './model-audit-contract.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_STORE_DIR = join(REPO_ROOT, 'agentos', 'runs', 'invariant-audit');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function appendAuditRecords(path, records) {
  if (records.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    `${records.map(record => JSON.stringify(record)).join('\n')}\n`
  );
}

function configuredExecutable(model, prefix = 'agent_') {
  const envKey = model[`${prefix}executable_env`];
  return (
    (envKey && process.env[envKey]) ||
    model[`${prefix}executable_default`] ||
    ''
  );
}

function renderArgv(argv, replacements) {
  return argv.map(argument =>
    argument.replace(/\{(\w+)\}/g, (_, key) => replacements[key] ?? `{${key}}`)
  );
}

async function execute(executable, argv, options = {}) {
  return execFileAsync(executable, argv, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? 180_000,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
}

async function probeModel(model, runId, at, executeCommand) {
  const executable = configuredExecutable(model, '');
  const argv = renderArgv(model.probe_argv ?? [], {
    executable,
    model: model.model,
  });
  const commandArgv = argv[0] === executable ? argv.slice(1) : argv;
  const base = {
    schema: AUDIT_PROBE_SCHEMA,
    probeId: `probe-${randomUUID()}`,
    runId,
    probedAt: at,
    modelId: model.id,
    provider: model.provider,
    model: model.model,
    executable,
    probeArgvDigest: `sha256:${digest(stable(commandArgv))}`,
  };
  try {
    const { stdout = '', stderr = '' } = await executeCommand(
      executable,
      commandArgv,
      { timeoutMs: 30_000 }
    );
    const outcome = probeOutcome(model, { stdout, stderr });
    return {
      ...base,
      ...outcome,
      outputDigest: `sha256:${digest(`${stdout}\n${stderr}`)}`,
    };
  } catch (error) {
    return {
      ...base,
      available: false,
      reason: error?.code === 'ENOENT' ? 'executable-missing' : 'probe-failed',
      outputDigest: `sha256:${digest(String(error?.message ?? error))}`,
    };
  }
}

async function auditModelBatch({
  model,
  cells,
  runId,
  trigger,
  executeCommand,
  allowPaid,
}) {
  const startedAt = new Date().toISOString();
  const probe = await probeModel(model, runId, startedAt, executeCommand);
  const common = cell => ({
    schema: AUDIT_RECEIPT_SCHEMA,
    receiptId: `receipt-${randomUUID()}`,
    runId,
    trigger,
    invariantId: cell.invariant.id,
    invariantVersion: cell.invariantVersion,
    modelId: model.id,
    provider: model.provider,
    model: model.model,
    channel: model.channel,
    costTier: model.cost_tier,
    sourceEnforcement: 'registry-declared-not-runtime-proven',
    probeId: probe.probeId,
    startedAt,
  });
  if (model.channel === 'api' && !allowPaid) {
    return {
      probe,
      receipts: cells.map(cell => ({
        ...common(cell),
        auditedAt: new Date().toISOString(),
        status: 'blocked',
        reason: 'paid-provider-not-authorized',
      })),
      proposals: [],
    };
  }
  if (!probe.available) {
    return {
      probe,
      receipts: cells.map(cell => ({
        ...common(cell),
        auditedAt: new Date().toISOString(),
        status: 'unavailable',
        reason: probe.reason,
      })),
      proposals: [],
    };
  }

  const workspace = await mkdtemp(join(tmpdir(), 'jovie-invariant-audit-'));
  try {
    const prompt = buildAuditPrompt(cells.map(cell => cell.invariant));
    const executable = configuredExecutable(model);
    const argv = renderArgv(model.agent_argv ?? [], {
      model: model.model,
      prompt,
      cwd: workspace,
    });
    const { stdout = '', stderr = '' } = await executeCommand(
      executable,
      argv,
      {
        cwd: workspace,
        timeoutMs: 300_000,
      }
    );
    const parsed = parseAuditResponse(`${stdout}\n${stderr}`);
    const byInvariant = new Map(
      parsed.results.map(auditResult => [auditResult.invariantId, auditResult])
    );
    const auditedAt = new Date().toISOString();
    const receipts = [];
    const proposals = [];
    for (const cell of cells) {
      const auditResult = byInvariant.get(cell.invariant.id);
      const errors = validateAuditResult(auditResult, cell.invariant);
      if (errors.length > 0) {
        receipts.push({
          ...common(cell),
          auditedAt,
          status: 'failed',
          reason: errors.join('; '),
        });
        continue;
      }
      receipts.push({
        ...common(cell),
        auditedAt,
        status: 'completed',
        verdict: auditResult.verdict,
        meaningfulness: auditResult.meaningfulness,
        rationale: auditResult.rationale.trim(),
        failureMode: auditResult.failureMode.trim(),
        metric: auditResult.metric.trim(),
        responseDigest: `sha256:${digest(stable(auditResult))}`,
      });
      proposals.push(
        ...proposalRecords({
          runId,
          auditedAt,
          model,
          invariant: cell.invariant,
          result: auditResult,
        })
      );
    }
    return { probe, receipts, proposals };
  } catch (error) {
    const failure = String(error?.message ?? error);
    return {
      probe,
      receipts: cells.map(cell => ({
        ...common(cell),
        auditedAt: new Date().toISOString(),
        status: 'failed',
        reason: classifyAuditFailure(error),
        failureDigest: `sha256:${digest(failure)}`,
      })),
      proposals: [],
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

export async function runModelAudit({
  repoRoot = REPO_ROOT,
  storeDir = process.env.JOVIE_INVARIANT_AUDIT_DIR || DEFAULT_STORE_DIR,
  trigger = 'manual',
  maxConcurrency = 2,
  ttlMs = DEFAULT_TTL_MS,
  allowPaid = false,
  executeCommand = execute,
  now = Date.now(),
} = {}) {
  const invariantRegistry = readInvariantRegistry(repoRoot);
  const modelRegistry = JSON.parse(
    readFileSync(
      resolve(repoRoot, 'scripts/hermes/config/model-registry.json'),
      'utf8'
    )
  );
  const invariants = invariantRegistry.invariants.filter(
    item => item.lifecycle.state === 'adopted'
  );
  const contractErrors = validateLivingInvariantSet(invariants);
  if (contractErrors.length > 0) {
    throw new Error(
      `Living invariant contract failed: ${contractErrors.join('; ')}`
    );
  }
  const models = auditCapableModels(modelRegistry.models);
  const fingerprint = catalogFingerprint(modelRegistry.models);
  const runPath = join(storeDir, 'runs.jsonl');
  const previousRuns = readJsonl(runPath);
  const effectiveTrigger = deriveAuditTrigger({
    requestedTrigger: trigger,
    previousRuns,
    fingerprint,
  });
  const receiptPath = join(storeDir, 'receipts.jsonl');
  const receipts = readJsonl(receiptPath);
  const matrix = planAuditMatrix({ invariants, models, receipts, now, ttlMs });
  const pendingByModel = models
    .map(model => ({
      model,
      cells: matrix.filter(
        cell => cell.model.id === model.id && cell.state !== 'current'
      ),
    }))
    .filter(batch => batch.cells.length > 0);
  const runId = `audit-${new Date(now).toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const boundedConcurrency = Math.max(
    1,
    Math.min(4, Number(maxConcurrency) || 2)
  );
  const batches = await mapConcurrent(
    pendingByModel,
    boundedConcurrency,
    batch =>
      auditModelBatch({
        ...batch,
        runId,
        trigger: effectiveTrigger,
        executeCommand,
        allowPaid,
      })
  );
  const probes = batches.map(batch => batch.probe);
  const newReceipts = batches.flatMap(batch => batch.receipts);
  const proposals = batches.flatMap(batch => batch.proposals);
  appendAuditRecords(join(storeDir, 'probes.jsonl'), probes);
  appendAuditRecords(receiptPath, newReceipts);
  appendAuditRecords(join(storeDir, 'proposals.jsonl'), proposals);
  const event = {
    schema: 'jovie-invariant-model-audit-run/v1',
    runId,
    trigger: effectiveTrigger,
    requestedTrigger: trigger,
    startedAt: new Date(now).toISOString(),
    completedAt: new Date().toISOString(),
    catalogFingerprint: fingerprint,
    invariantRegistryVersion: invariantRegistry.version,
    auditCapableModels: models.length,
    invariantCount: invariants.length,
    plannedCells: matrix.filter(cell => cell.state !== 'current').length,
    completedCells: newReceipts.filter(
      receipt => receipt.status === 'completed'
    ).length,
    partialCells: newReceipts.filter(receipt => receipt.status !== 'completed')
      .length,
    proposalCount: proposals.length,
    maxConcurrency: boundedConcurrency,
    paidProvidersAuthorized: allowPaid,
  };
  appendAuditRecords(runPath, [event]);
  return { event, probes, receipts: newReceipts, proposals, matrix };
}

export function parseArgs(argv) {
  const options = { trigger: 'manual', maxConcurrency: 2, allowPaid: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--allow-paid') options.allowPaid = true;
    else if (arg === '--trigger') options.trigger = argv[++index];
    else if (arg === '--max-concurrency')
      options.maxConcurrency = Number(argv[++index]);
    else if (arg === '--store-dir') options.storeDir = resolve(argv[++index]);
    else if (arg === '--ttl-hours')
      options.ttlMs = Number(argv[++index]) * 60 * 60 * 1000;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runModelAudit(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result.event, null, 2)}\n`);
}

// Production consumer bindings: JOV-INV-023, JOV-INV-024, JOV-INV-025, JOV-INV-026.
