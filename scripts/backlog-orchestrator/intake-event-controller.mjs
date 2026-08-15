#!/usr/bin/env node

/**
 * Durable, event-first intake receipt controller.
 *
 * This boundary deliberately does not mutate Linear, GitHub, a queue, or a
 * deployment. A webhook/Actions delivery becomes an idempotent receipt first;
 * the bounded admission governor may later consume an authoritative
 * `mechanical-ready` disposition through its existing gates.
 */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const INTAKE_EVENT_SCHEMA = 'jovie-intake-event/v1';
export const INTAKE_EVENT_RECEIPT_SCHEMA = 'jovie-intake-event-receipt/v1';
export const DEFAULT_STATE_DIR = resolve(
  process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
  'state/jovie-intake-controller'
);

const INTAKE_STATES = new Set(['triage', 'backlog', 'todo', 'to do']);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Normalize only the fields required for a bounded, non-mutating receipt. */
export function normalizeIntakeEvent(raw) {
  const payload = raw?.client_payload || raw?.payload || raw || {};
  const source =
    nonEmpty(raw?.source) ||
    nonEmpty(payload.source) ||
    (nonEmpty(payload.dedupe_key) ? 'sentry' : 'linear');
  const issue =
    nonEmpty(payload.issue_identifier) || nonEmpty(payload.identifier);
  const state = nonEmpty(payload.state_name) || nonEmpty(payload.state);
  const deliveryId =
    nonEmpty(raw?.delivery_id) ||
    nonEmpty(raw?.id) ||
    nonEmpty(payload.delivery_id) ||
    nonEmpty(payload.event_id);
  const clusterKey =
    nonEmpty(payload.dedupe_key) || nonEmpty(payload.cluster_key);
  const eventKey =
    deliveryId ||
    digest({
      source,
      issue,
      state,
      updatedAt:
        nonEmpty(payload.issue_updated_at) || nonEmpty(payload.updated_at),
      action: nonEmpty(raw?.action) || nonEmpty(payload.action),
      clusterKey,
    });
  return {
    schema: INTAKE_EVENT_SCHEMA,
    source,
    eventKey,
    issue,
    teamKey: nonEmpty(payload.team_key)?.toUpperCase() || null,
    state,
    updatedAt:
      nonEmpty(payload.issue_updated_at) || nonEmpty(payload.updated_at),
    clusterKey,
    action: nonEmpty(raw?.action) || nonEmpty(payload.action),
  };
}

export function dispositionForIntakeEvent(event) {
  if (event.source === 'sentry') {
    if (!event.clusterKey)
      return { status: 'held', reason: 'sentry-cluster-key-missing' };
    return {
      status: 'clustered',
      reason: 'sentry-cluster-requires-authoritative-lifecycle',
    };
  }
  if (event.source !== 'linear')
    return { status: 'held', reason: 'unsupported-event-source' };
  if (event.teamKey !== 'JOV')
    return { status: 'ignored', reason: 'non-jov-team' };
  if (!event.issue)
    return { status: 'held', reason: 'issue-identifier-missing' };
  if (!event.state || !INTAKE_STATES.has(event.state.toLowerCase()))
    return { status: 'held', reason: 'outside-intake-state' };
  return {
    status: 'enrichment-required',
    reason: 'authoritative-label-free-classification-required',
  };
}

export function buildIntakeEventReceipt(
  event,
  { now = new Date().toISOString() } = {}
) {
  const disposition = dispositionForIntakeEvent(event);
  return {
    schema: INTAKE_EVENT_RECEIPT_SCHEMA,
    receivedAt: now,
    event,
    disposition,
    queue:
      disposition.status === 'enrichment-required' ? 'intake-enrichment' : null,
    externalMutations: 0,
  };
}

export function receiptPath(stateDir, event) {
  return join(
    stateDir,
    'receipts',
    `${digest({ source: event.source, eventKey: event.eventKey })}.json`
  );
}

/**
 * Atomic create is the idempotency primitive: simultaneous duplicate deliveries
 * yield exactly one created receipt, without minting a second lease/workspace.
 */
export async function persistReceipt(
  receipt,
  { stateDir = DEFAULT_STATE_DIR, dryRun = false } = {}
) {
  const destination = receiptPath(stateDir, receipt.event);
  if (dryRun) return { status: 'dry-run', receipt, path: destination };
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  try {
    const handle = await open(destination, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(receipt)}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return { status: 'created', receipt, path: destination };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(destination, 'utf8'));
    return { status: 'duplicate', receipt: existing, path: destination };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const eventFile = args
    .find(arg => arg.startsWith('--event-file='))
    ?.slice('--event-file='.length);
  const stateDir =
    args
      .find(arg => arg.startsWith('--state-dir='))
      ?.slice('--state-dir='.length) || DEFAULT_STATE_DIR;
  const dryRun = args.includes('--dry-run');
  if (!eventFile)
    throw new Error(
      'usage: intake-event-controller.mjs --event-file=<path> [--state-dir=<path>] [--dry-run]'
    );
  const raw = JSON.parse(await readFile(eventFile, 'utf8'));
  const event = normalizeIntakeEvent(raw);
  const receipt = buildIntakeEventReceipt(event);
  const result = await persistReceipt(receipt, { stateDir, dryRun });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(error => {
    process.stderr.write(`intake-event-controller: ${error.message}\n`);
    process.exitCode = 1;
  });
}
