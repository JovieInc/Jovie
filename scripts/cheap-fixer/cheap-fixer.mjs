#!/usr/bin/env node
/**
 * Dormant cheap-fixer entry point. No network, model, claim or publication calls.
 * The pure classifier and patch guards remain available for offline qualification.
 * Commissioning must install the approved fx/Workers AI substrate and prove the
 * matched-PR pilot before this entry point can perform any repair.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SCHEMA } from './cheap-fixer-lib.mjs';

/** Produce an explicit terminal receipt without reading credentials or making requests. */
export function dormantReceipt({
  env = process.env,
  now = () => new Date(),
} = {}) {
  const startedAt = now().toISOString();
  const requestedMode = env.MODE || 'off';
  const receipt = {
    schema: SCHEMA,
    mode: 'off',
    requestedMode,
    backend: 'unconfigured',
    repo: env.REPO || 'JovieInc/Jovie',
    startedAt,
    stages: { start: startedAt },
    outcome: requestedMode === 'off' ? 'disabled' : 'backend-unconfigured',
    models: [],
    costUsd: 0,
    attempted: false,
    pushedSha: null,
  };
  // Event metadata is useful for joining the terminal receipt to the relay.
  // Malformed/unreadable events remain a terminal configuration result.
  if (env.EVENT_PATH) {
    try {
      const run = JSON.parse(readFileSync(env.EVENT_PATH, 'utf8')).workflow_run;
      if (
        !run ||
        typeof run !== 'object' ||
        Array.isArray(run) ||
        !Number.isSafeInteger(run.id) ||
        run.id <= 0 ||
        typeof run.head_sha !== 'string' ||
        !/^[a-f0-9]{40}$/i.test(run.head_sha) ||
        typeof run.name !== 'string' ||
        !run.name.trim() ||
        !Array.isArray(run.pull_requests) ||
        run.pull_requests.some(
          pr => !pr || !Number.isSafeInteger(pr.number) || pr.number <= 0
        )
      )
        throw new Error('invalid event identity');
      {
        Object.assign(receipt, {
          sha: run.head_sha,
          pr: run.pull_requests?.[0]?.number ?? null,
          runId: run.id,
          workflow: run.name,
        });
      }
    } catch {
      receipt.outcome = 'event-unreadable';
    }
  }
  const finishedAt = now().toISOString();
  return {
    ...receipt,
    finishedAt,
    stages: { ...receipt.stages, terminal: finishedAt },
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
  };
}

export function main({ env = process.env } = {}) {
  const receipt = dormantReceipt({ env });
  const out = env.OUT_DIR || 'cheap-fixer-out';
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  const line = `cheap-fixer ${receipt.outcome}: approved fx/Workers AI backend is unconfigured; no repair attempted`;
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY)
    writeFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`, { flag: 'a' });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
