#!/usr/bin/env tsx
/**
 * Record (or soft-skip) an Assistants `/app/chat` first-token sample.
 *
 * Usage:
 *   pnpm --filter @jovie/web eval:chat-first-token -- --out /tmp/ttft.json
 *
 * Soft-skip (exit 0) when WORKERS_AI_TOKEN is missing — mirrors ASS-18
 * helpfulness-live-ci-subset. No Gateway spend, no prod writes.
 *
 * To write a recorded sample without a live browser probe, inject durations:
 *   ASSISTANTS_CHAT_TTFT_SAMPLES_MS=120,180,90 pnpm --filter @jovie/web eval:chat-first-token -- --out /tmp/ttft.json
 *
 * Live browser probe (test account only) lands later; until then the workflow
 * stub soft-skips when the token is present but no samples are injected.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRecordedChatFirstTokenSample,
  buildUnrunChatFirstTokenSample,
  type ChatFirstTokenSample,
  evaluateChatFirstTokenSample,
  serializeChatFirstTokenSample,
} from '../lib/eval/chat-first-token-sample';

type Outcome =
  | 'skipped_secret'
  | 'skipped_probe_not_ready'
  | 'recorded'
  | 'failed_gate';

function parseArgs(argv: readonly string[]): {
  outPath: string;
  mode: 'relay' | 'injected' | 'live';
} {
  let outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../test-results/chat-first-token-sample.json'
  );
  let mode: 'relay' | 'injected' | 'live' = 'relay';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // pnpm forwards a literal `--` before script args.
    if (arg === '--') continue;
    if (arg === '--out') {
      const next = argv[i + 1];
      if (typeof next === 'string' && next.length > 0) {
        outPath = next;
        i += 1;
      }
      continue;
    }
    if (arg === '--mode') {
      const next = argv[i + 1];
      if (typeof next !== 'string' || next.length === 0) {
        throw new Error('Missing value for --mode');
      }
      if (next === 'relay' || next === 'injected' || next === 'live') {
        mode = next;
      } else {
        throw new Error(`Unsupported --mode ${next}`);
      }
      i += 1;
    }
  }
  return { outPath, mode };
}

function parseInjectedSamples(): number[] | null {
  const raw = process.env.ASSISTANTS_CHAT_TTFT_SAMPLES_MS?.trim();
  if (!raw) return null;
  const parts = raw.split(',').map(part => Number(part.trim()));
  if (parts.length === 0 || parts.some(n => !Number.isFinite(n) || n < 0)) {
    throw new Error(
      'ASSISTANTS_CHAT_TTFT_SAMPLES_MS must be a comma-separated list of non-negative numbers'
    );
  }
  return parts;
}

function notice(message: string): void {
  process.stdout.write(`::notice::${message}\n`);
}

function main(): number {
  const { outPath, mode } = parseArgs(process.argv.slice(2));
  const token = process.env.WORKERS_AI_TOKEN?.trim() ?? '';
  const injected = parseInjectedSamples();

  let sample: ChatFirstTokenSample;
  let outcome: Outcome;

  if (injected) {
    sample = buildRecordedChatFirstTokenSample({
      samplesMs: injected,
      mode: mode === 'live' ? 'live' : 'injected',
      notes:
        'Injected ASSISTANTS_CHAT_TTFT_SAMPLES_MS (test account only). Not a live browser TTFT.',
    });
    outcome = 'recorded';
  } else if (!token) {
    sample = buildUnrunChatFirstTokenSample(
      'WORKERS_AI_TOKEN missing; soft-skipping live/relay TTFT record (ASS-28 / ASS-18 pattern).'
    );
    outcome = 'skipped_secret';
    notice(
      'WORKERS_AI_TOKEN missing; wrote unrun chat-first-token sample and soft-skipped.'
    );
  } else {
    // Token present but live Playwright probe not enrolled yet — soft-skip
    // rather than spending Gateway or hitting prod.
    sample = buildUnrunChatFirstTokenSample(
      'WORKERS_AI_TOKEN present but live /app/chat TTFT probe not enrolled; soft-skip until test-account relay path is wired. Inject ASSISTANTS_CHAT_TTFT_SAMPLES_MS to record offline.'
    );
    outcome = 'skipped_probe_not_ready';
    notice(
      'Live /app/chat TTFT probe not ready; wrote unrun sample and soft-skipped (no Gateway spend).'
    );
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, serializeChatFirstTokenSample(sample), 'utf8');
  process.stdout.write(
    `chat-first-token sample written: ${outPath} (status=${sample.status}, outcome=${outcome})\n`
  );

  if (sample.status === 'recorded') {
    const gate = evaluateChatFirstTokenSample(sample, true);
    process.stdout.write(
      `gate: ok=${String(gate.ok)}${gate.reasons.length ? ` reasons=${gate.reasons.join('; ')}` : ''}\n`
    );
    if (!gate.ok) {
      process.stderr.write(
        `::error::Recorded first-token p50 failed Assistants <1s gate.\n`
      );
      return 1;
    }
  }

  return 0;
}

process.exitCode = main();
