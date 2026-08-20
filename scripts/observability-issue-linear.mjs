#!/usr/bin/env node

import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';
import { buildObservabilityIssuePayload } from './observability-issue-sync.mjs';

export async function syncObservabilityLinearIssue({
  report,
  occurrenceDelta = 1,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  const payload = buildObservabilityIssuePayload(report, occurrenceDelta);
  const title = `[${payload.fingerprint}] ${payload.title}`.slice(0, 240);
  return upsertLinearIssueByTitleFingerprint({
    fingerprint: payload.fingerprint,
    title,
    description: payload.body,
    priority: 2,
    apiKey,
    fetchImpl,
  });
}

async function main() {
  const payload = process.env.OBSERVABILITY_PAYLOAD;
  if (!payload) {
    throw new Error('OBSERVABILITY_PAYLOAD is required.');
  }
  const report = JSON.parse(payload);
  const occurrenceDelta = Number.parseInt(
    process.env.OCCURRENCE_DELTA ?? `${report.occurrence_delta ?? 1}`,
    10
  );
  const result = await syncObservabilityLinearIssue({
    report,
    occurrenceDelta,
  });
  if (!result.ok) {
    throw new Error(`Observability Linear intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
