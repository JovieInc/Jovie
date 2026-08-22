#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  CURSOR_AGENTS_URL,
  cursorAuthHeader,
  findOwnedFxAgents,
  planFxCursorLaunch,
} from './lib/rolling-ci-fx.mjs';

async function cursorRequest(apiKey, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: cursorAuthHeader(apiKey),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, body: parsed ?? text };
}

/** @returns {Record<string, unknown> | null} */
function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

async function main() {
  const planPath = process.argv[2];
  if (!planPath) {
    throw new Error('usage: node scripts/rolling-ci-fx-launch.mjs <plan.json>');
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const fx = plan?.fx;
  if (!fx || fx.launch !== true) {
    console.log('FX Cursor-direct launch not requested.');
    return;
  }
  const apiKey = process.env.CURSOR_API_KEY ?? '';
  if (!apiKey.trim()) {
    throw new Error(
      'CURSOR_API_KEY is missing. FX cannot remediate CI failures.'
    );
  }

  const listed = await cursorRequest(apiKey, CURSOR_AGENTS_URL);
  const listedBody = asRecord(listed.body);
  const agents = listed.ok
    ? (listedBody?.agents ?? (Array.isArray(listed.body) ? listed.body : []))
    : [];
  const existingAgentIds = findOwnedFxAgents(agents, fx.fingerprint);
  const launchPlan = planFxCursorLaunch({
    cursorApiKey: apiKey,
    existingAgentIds,
    repository: fx.repository,
    pr: fx.pr,
    head: fx.head,
    branch: fx.branch,
    check: fx.check,
    fingerprint: fx.fingerprint,
    failedSteps: fx.failedSteps,
    eventName: fx.eventName,
  });

  if (launchPlan.action === 'fail_closed') {
    throw new Error(
      'CURSOR_API_KEY is missing. FX cannot remediate CI failures.'
    );
  }
  if (launchPlan.action === 'dedup') {
    console.log(
      `Deduped FX Cursor-direct fingerprint=${launchPlan.fingerprint} agents=${launchPlan.existingAgentIds.join(',')}`
    );
    return;
  }

  const launched = await cursorRequest(apiKey, CURSOR_AGENTS_URL, {
    method: 'POST',
    body: JSON.stringify(launchPlan.request),
  });
  if (!launched.ok) {
    throw new Error(
      `FX Cursor-direct launch failed (status ${launched.status}): ${JSON.stringify(launched.body)}`
    );
  }
  const launchedId = asRecord(launched.body)?.id ?? '';
  console.log(
    `Launched FX Cursor-direct ${launchedId ?? ''} fingerprint=${launchPlan.fingerprint}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
