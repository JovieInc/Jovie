#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const EXPECTED_WEB_AI_HEALTH_SCHEMA = 'jovie-web-ai-health/v1';
export const EXPECTED_GATEWAY_ALLOWLIST_NAME = 'founder-strict-2026-09-17';

const EXPECTED_PROBES = [
  ['web_chat', 'zai/glm-5.3'],
  ['insights', 'zai/glm-5.3-flash'],
  ['pitches', 'zai/glm-5.3-flash'],
  ['titles', 'zai/glm-5.3-flash'],
  ['packaging', 'zai/glm-5.3-flash'],
];
const FAILURE_CAUSES = new Set([
  'forbidden_model',
  'empty_stream',
  'placeholder_saved',
  'request_error',
]);
const MAX_RESPONSE_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 75_000;

function safeFailureDetail(error) {
  if (!error || typeof error !== 'object') return typeof error;
  const name =
    typeof error.name === 'string' && error.name.trim()
      ? error.name.trim()
      : 'Error';
  const status = error.status ?? error.statusCode;
  return typeof status === 'number' || typeof status === 'string'
    ? `${name}:${status}`
    : name;
}

export function fallbackWebAiHealthReceipt(reason) {
  return {
    schema: EXPECTED_WEB_AI_HEALTH_SCHEMA,
    checkedAt: new Date().toISOString(),
    environment: 'production',
    status: 'failed',
    signal: { severity: 'high', route: 'bug' },
    gatewayAllowlist: {
      name: EXPECTED_GATEWAY_ALLOWLIST_NAME,
      models: ['zai/glm-5.3', 'zai/glm-5.3-flash'],
    },
    results: EXPECTED_PROBES.map(([surface, model]) => ({
      surface,
      model,
      ok: false,
      failureCause: 'request_error',
      message: `${surface} (${model}): production health endpoint failed (${reason}) under gateway allowlist ${EXPECTED_GATEWAY_ALLOWLIST_NAME}.`,
      durationMs: 0,
    })),
  };
}

export function isValidWebAiHealthReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  if (receipt.schema !== EXPECTED_WEB_AI_HEALTH_SCHEMA) return false;
  if (!['passed', 'failed'].includes(receipt.status)) return false;
  if (receipt.environment !== 'production') return false;
  if (receipt.signal?.severity !== 'high' || receipt.signal?.route !== 'bug')
    return false;
  if (
    receipt.gatewayAllowlist?.name !== EXPECTED_GATEWAY_ALLOWLIST_NAME ||
    !Array.isArray(receipt.gatewayAllowlist?.models)
  )
    return false;
  if (
    receipt.gatewayAllowlist.models.length !== 2 ||
    !receipt.gatewayAllowlist.models.includes('zai/glm-5.3') ||
    !receipt.gatewayAllowlist.models.includes('zai/glm-5.3-flash')
  )
    return false;
  if (!Array.isArray(receipt.results) || receipt.results.length !== 5)
    return false;

  const expected = new Map(EXPECTED_PROBES);
  const seen = new Set();
  for (const result of receipt.results) {
    if (!result || typeof result !== 'object') return false;
    if (expected.get(result.surface) !== result.model) return false;
    if (seen.has(result.surface)) return false;
    seen.add(result.surface);
    if (typeof result.ok !== 'boolean') return false;
    if (typeof result.message !== 'string' || result.message.length === 0)
      return false;
    if (typeof result.durationMs !== 'number' || result.durationMs < 0)
      return false;
    if (
      result.ok
        ? result.failureCause !== null
        : !FAILURE_CAUSES.has(result.failureCause)
    )
      return false;
  }

  const allPassed = receipt.results.every(result => result.ok);
  return receipt.status === (allPassed ? 'passed' : 'failed');
}

export function summarizeWebAiHealthFailures(receipt) {
  const failures = receipt.results.filter(result => !result.ok);
  if (failures.length === 0) {
    return `All 5 Web AI surfaces passed (${receipt.gatewayAllowlist.name}).`;
  }
  return failures.map(result => result.message).join('\n');
}

export async function fetchWebAiHealthReceipt({
  url,
  cronSecret,
  fetchImpl = fetch,
}) {
  if (!cronSecret) {
    return fallbackWebAiHealthReceipt('missing_cron_secret');
  }

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        Accept: 'application/json',
        'User-Agent': 'Jovie-Web-AI-Health/1.0',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
      return fallbackWebAiHealthReceipt(
        `invalid_receipt_http_${response.status}_oversize`
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return fallbackWebAiHealthReceipt(
        `invalid_receipt_http_${response.status}_json`
      );
    }

    if (!isValidWebAiHealthReceipt(parsed)) {
      return fallbackWebAiHealthReceipt(
        `invalid_receipt_http_${response.status}_contract`
      );
    }
    if (response.ok !== (parsed.status === 'passed')) {
      return fallbackWebAiHealthReceipt(
        `receipt_status_mismatch_http_${response.status}`
      );
    }

    return parsed;
  } catch (error) {
    return fallbackWebAiHealthReceipt(
      `endpoint_transport_${safeFailureDetail(error)}`
    );
  }
}

function appendGithubOutput(receipt) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const summary = summarizeWebAiHealthFailures(receipt);
  const marker = 'WEB_AI_HEALTH_SUMMARY_EOF';
  return import('node:fs/promises').then(({ appendFile }) =>
    appendFile(
      outputPath,
      [
        `health_status=${receipt.status}`,
        `allowlist_name=${receipt.gatewayAllowlist.name}`,
        `failure_summary<<${marker}`,
        summary,
        marker,
        '',
      ].join('\n')
    )
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      receipt: { type: 'string' },
    },
  });
  if (!values.url || !values.receipt) {
    throw new Error('--url and --receipt are required');
  }

  const receipt = await fetchWebAiHealthReceipt({
    url: values.url,
    cronSecret: process.env.CRON_SECRET,
  });
  const receiptPath = resolve(values.receipt);
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  await appendGithubOutput(receipt);
  process.stdout.write(`${summarizeWebAiHealthFailures(receipt)}\n`);
  if (receipt.status !== 'passed') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
