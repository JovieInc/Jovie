#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import {
  buildExactArtifactReceipt,
  classifyPrivateStorageFailure,
  evaluateExactArtifactSoak,
  privateReceiptDigest,
  RECEIPT_SCHEMA,
  redactExactArtifactReceipt,
  SOAK_SCHEMA,
} from './lib/exact-artifact-synthetic.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

const PRIVATE_PREFIX = 'exact-artifact-synthetic/v1';
const BLOB_TIMEOUT_MS = 10_000;
const requireFromWeb = createRequire(
  new URL('../apps/web/package.json', import.meta.url)
);

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`invalid argument near ${flag ?? 'end of command'}`);
    }
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

async function readJson(pathname) {
  if (!pathname) return null;
  try {
    return JSON.parse(await readFile(pathname, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(pathname, value) {
  await mkdir(dirname(pathname), { recursive: true });
  await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function blobClient() {
  const client = requireFromWeb('@vercel/blob');
  return { get: client.get, list: client.list, put: client.put };
}

async function readPrivateBlob(get, pathname) {
  const response = await get(pathname, {
    access: 'private',
    abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    useCache: false,
  });
  if (!response?.stream || response.statusCode !== 200) return null;
  const text = await new Response(response.stream).text();
  return JSON.parse(text);
}

export async function persistPrivateReceipt(receipt, client = blobClient()) {
  const pathname = `${PRIVATE_PREFIX}/${receipt.startedAt.slice(0, 10)}/${receipt.receiptId}.json`;
  const body = `${JSON.stringify(receipt)}\n`;
  const digest = privateReceiptDigest(receipt);
  try {
    await client.put(pathname, body, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
      cacheControlMaxAge: 60,
      contentType: 'application/json; charset=utf-8',
    });
  } catch (error) {
    const existing = await readPrivateBlob(client.get, pathname).catch(
      () => null
    );
    if (
      existing?.schema !== RECEIPT_SCHEMA ||
      existing.receiptId !== receipt.receiptId ||
      privateReceiptDigest(existing) !== digest
    ) {
      throw error;
    }
  }
  return { pathname, sha256: digest };
}

export async function listPrivateReceipts(client = blobClient()) {
  const receipts = [];
  let cursor;
  for (let page = 0; page < 10; page += 1) {
    const response = await client.list({
      prefix: `${PRIVATE_PREFIX}/`,
      limit: 1_000,
      ...(cursor ? { cursor } : {}),
      abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    for (const blob of response.blobs ?? []) {
      const receipt = await readPrivateBlob(client.get, blob.pathname);
      if (receipt) receipts.push(receipt);
    }
    if (!response.hasMore) return receipts;
    if (!response.cursor || response.cursor === cursor) {
      throw new Error('private receipt pagination did not advance');
    }
    cursor = response.cursor;
  }
  throw new Error('private receipt pagination exceeded the bounded page limit');
}

function appendGithubOutput(values) {
  const pathname = process.env.GITHUB_OUTPUT;
  if (!pathname) return Promise.resolve();
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value ?? '')}`)
    .join('\n');
  return writeFile(pathname, `${lines}\n`, { flag: 'a' });
}

function transitionSummary(receipt) {
  return receipt.transitions
    .map(transition =>
      [transition.name, transition.status, transition.code]
        .filter(Boolean)
        .join(':')
    )
    .join(', ');
}

export async function upsertSyntheticIncident(receipt) {
  if (receipt.outcome === 'success') {
    return { ok: true, action: 'none', url: null };
  }
  const fingerprint = receipt.rootCauseFingerprint;
  const dependency = fingerprint.endsWith('journey-producer-unavailable')
    ? 'JOV-8252'
    : 'None';
  const description = `## Source
- Current issue: JOV-8253
- Source PR: ${receipt.runUrl ?? 'scheduled production synthetic'}
- Source branch/session: synthetic-monitoring.yml

## Follow-up
The exact-artifact production synthetic classified the customer path as **${receipt.pathStatus}**. This issue is updated in place for the stable root-cause fingerprint; repeat event volume is not treated as additional affected users.

## Why it matters
The production revenue spine cannot be certified while this root cause remains active.

## Classification
Required

## Acceptance criteria or triage question
Restore a successful controlled run on the exact deployed build, including returning-session and cleanup proof.

## Dependency
${dependency}

- Receipt: \`${receipt.receiptId}\`
- Build SHA: \`${receipt.buildSha}\`
- Deployment: \`${receipt.deploymentId}\`
- Attempt: \`${receipt.attemptId}\`
- Failure domain: \`${receipt.classification}\`
- Path status: \`${receipt.pathStatus}\`
- Transitions: ${transitionSummary(receipt)}
- Fingerprint: \`${fingerprint}\``;
  return upsertLinearIssueByTitleFingerprint({
    fingerprint,
    labelKey: fingerprint,
    title: `P0: exact-artifact path ${receipt.pathStatus} (${fingerprint})`,
    description,
    priority: 1,
    reopenTerminal: true,
  });
}

async function finalize(options) {
  const result = await readJson(options.result);
  const buildInfo = await readJson(options['build-info']);
  let privateReceipt = buildExactArtifactReceipt({
    result,
    buildInfo,
    attemptId: options['attempt-id'],
    event: options.event,
    runUrl: options['run-url'],
    producerStatus: Number.parseInt(options['producer-status'] ?? '0', 10),
    now: new Date(),
  });
  let storage = null;
  if (options['public-only'] === 'true') {
    privateReceipt = classifyPrivateStorageFailure(privateReceipt);
  } else {
    try {
      storage = await persistPrivateReceipt(privateReceipt);
    } catch {
      privateReceipt = classifyPrivateStorageFailure(privateReceipt);
    }
  }

  const publicReceipt = redactExactArtifactReceipt(privateReceipt, storage);
  if (!options.public) throw new Error('--public is required');
  await writeJson(options.public, publicReceipt);

  const incident = await upsertSyntheticIncident(publicReceipt);
  const alertAction = !incident.ok
    ? 'unavailable'
    : incident.reopened
      ? 'reopened'
      : incident.action;
  await appendGithubOutput({
    alert_action: alertAction,
    classification: publicReceipt.classification,
    incident_url: incident.ok ? incident.url : '',
    outcome: publicReceipt.outcome,
    path_status: publicReceipt.pathStatus,
    private_stored: storage !== null,
    receipt_id: publicReceipt.receiptId,
    root_cause_fingerprint: publicReceipt.rootCauseFingerprint ?? '',
  });
  process.stdout.write(
    `${JSON.stringify({
      receiptId: publicReceipt.receiptId,
      outcome: publicReceipt.outcome,
      classification: publicReceipt.classification,
      pathStatus: publicReceipt.pathStatus,
      rootCauseFingerprint: publicReceipt.rootCauseFingerprint,
      privateReceiptStored: storage !== null,
      incidentAction: alertAction,
    })}\n`
  );
}

async function evaluateSoak(options) {
  if (!options.public) throw new Error('--public is required');
  const windowDays = Number.parseInt(options.days ?? '', 10);
  try {
    const receipts = await listPrivateReceipts();
    const evidence = evaluateExactArtifactSoak({
      receipts,
      windowDays,
      now: new Date(),
    });
    await writeJson(options.public, evidence);
    process.stdout.write(
      `${JSON.stringify({
        status: evidence.status,
        attempts: evidence.attempts,
        successfulAttempts: evidence.successfulAttempts,
        successRate: evidence.successRate,
        missingDays: evidence.missingDays,
      })}\n`
    );
  } catch {
    await writeJson(options.public, {
      schema: SOAK_SCHEMA,
      status: 'unknown',
      evaluatedAt: new Date().toISOString(),
      windowDays: Number.isInteger(windowDays) ? windowDays : null,
      classification: 'infrastructure',
      reason: 'private-receipt-read-failed',
    });
    process.exitCode = 1;
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'finalize') return finalize(options);
  if (command === 'soak') return evaluateSoak(options);
  throw new Error('usage: exact-artifact-synthetic.mjs <finalize|soak>');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'exact-artifact synthetic failed'}\n`
    );
    process.exit(1);
  });
}
