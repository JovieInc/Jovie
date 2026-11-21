#!/usr/bin/env tsx
/** ASS-28 TTFT record/soft-skip CLI. */
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

export function parseArgs(argv: readonly string[]): {
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
    if (arg === '--' || arg === undefined) continue;
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
      if (next !== 'relay' && next !== 'injected' && next !== 'live') {
        throw new Error(`Unsupported --mode ${next}`);
      }
      mode = next;
      i += 1;
    }
  }
  return { outPath, mode };
}

export function parseInjectedSamples(
  raw = process.env.ASSISTANTS_CHAT_TTFT_SAMPLES_MS
): number[] | null {
  const text = raw?.trim();
  if (!text) return null;
  const parts = text.split(',').map(part => Number(part.trim()));
  if (parts.length === 0 || parts.some(n => !Number.isFinite(n) || n < 0)) {
    throw new Error(
      'ASSISTANTS_CHAT_TTFT_SAMPLES_MS must be non-negative numbers'
    );
  }
  return parts;
}

export function main(
  argv: readonly string[] = process.argv.slice(2),
  env: Readonly<Record<string, string | undefined>> = process.env
): number {
  const { outPath, mode } = parseArgs(argv);
  const token = env.WORKERS_AI_TOKEN?.trim() ?? '';
  const injected = parseInjectedSamples(env.ASSISTANTS_CHAT_TTFT_SAMPLES_MS);
  let sample: ChatFirstTokenSample;
  if (injected) {
    sample = buildRecordedChatFirstTokenSample({
      samplesMs: injected,
      mode: mode === 'live' ? 'live' : 'injected',
      notes: 'Injected ASSISTANTS_CHAT_TTFT_SAMPLES_MS (test account only).',
    });
  } else if (!token) {
    sample = buildUnrunChatFirstTokenSample(
      'WORKERS_AI_TOKEN missing; soft-skip TTFT record.'
    );
    process.stdout.write('::notice::WORKERS_AI_TOKEN missing; soft-skipped.\n');
  } else {
    sample = buildUnrunChatFirstTokenSample(
      'Token present but live TTFT probe not enrolled; soft-skip.'
    );
    process.stdout.write('::notice::TTFT probe not ready; soft-skipped.\n');
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, serializeChatFirstTokenSample(sample), 'utf8');
  process.stdout.write(
    `chat-first-token sample written: ${outPath} (status=${sample.status})\n`
  );
  if (sample.status === 'recorded') {
    const gate = evaluateChatFirstTokenSample(sample, true);
    if (!gate.ok) {
      process.stderr.write(
        '::error::Recorded first-token p50 failed <1s gate.\n'
      );
      return 1;
    }
  }
  return 0;
}

if (process.argv[1]?.endsWith('record-chat-first-token-sample.ts')) {
  process.exitCode = main();
}
