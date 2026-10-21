// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardPlaywrightArtifacts } from '../../../.github/scripts/guard-playwright-artifacts.mjs';
import type { ChatProbeSnapshot } from '../tests/helpers/chat-performance-probe';
import {
  chatAttemptReceipt,
  FAILURE_BASE,
  FAILURE_HEAD,
  FAILURE_PARENT,
  writeChatAttempt,
} from './chat-performance-receipt';
import { buildInteractionLatencyReport } from './performance-interaction-report';

const binding = {
  sourceSha: FAILURE_HEAD,
  parentSha: FAILURE_PARENT,
  baseSha: FAILURE_BASE,
  harnessSha: 'a'.repeat(40),
  harnessDigest: 'b'.repeat(64),
  fixtureDigest: 'c'.repeat(64),
  buildDigest: 'd'.repeat(64),
  datasetDigest: 'e'.repeat(64),
};
const slow = {
  sendMs: 0,
  fetchStartedMs: 8,
  dataReadyMs: 280,
  firstFeedbackMs: 240,
  usableStateMs: 330,
  renderToInteractiveMs: 0,
  endMs: 400,
  longTaskCount: 1,
  maxLongTaskMs: 180,
  longTaskSupported: true,
  scriptTimingSupported: false,
  longTasks: [{ startMs: 10, durationMs: 180, sourceBucket: 'unknown' }],
  scripts: [],
  url: 'https://private.example/',
  token: 'private-credential',
  content: 'Private message',
  stack: 'private-stack',
} as ChatProbeSnapshot;
const report = buildInteractionLatencyReport({
  samples: Array.from({ length: 5 }, (_, runIndex) => ({
    scenarioId: 'chat-message-round-trip',
    runIndex,
    firstFeedbackMs: 240,
    usableStateMs: 330,
    renderToInteractiveMs: 0,
    droppedFrameCount: 0,
  })),
});
const input = {
  binding,
  browser: '145.0.1.2',
  attempt: 1,
  diagnostics: Array(5).fill(slow),
  scheduling: Array(5).fill({
    driverDispatchToHandlerMs: 12,
    handlerWorkMs: 3,
    fulfillAwaitMs: 200,
  }),
  report,
};
const temporary: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe('controlled chat receipts', () => {
  it('retains every slow sample and binds both attempts to the same configuration', () => {
    const first = chatAttemptReceipt(input);
    const retry = chatAttemptReceipt({ ...input, attempt: 2 });
    expect(first).toMatchObject({
      ...binding,
      workers: 8,
      warmups: 3,
      scoredSamples: 5,
      attempt: 1,
      budgetStatus: 'fail',
      measurementStatus: 'complete',
      causality: 'unknown',
    });
    expect(first.samples).toHaveLength(5);
    expect(first.samples.every(row => row.replyPresentedMs === 330)).toBe(true);
    expect(retry).toEqual({ ...first, attempt: 2 });
    expect(JSON.stringify(first)).not.toMatch(
      /private|https:|token|stack|content/
    );
  });

  it('publishes only projected timing metadata through the unchanged artifact guard', async () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'chat-receipt-'));
    temporary.push(directory);
    const path = resolve(directory, 'attempt-1.json');
    vi.stubEnv('CHAT_COMPARISON_BINDING', JSON.stringify(binding));
    vi.stubEnv('CHAT_COMPARISON_OUTPUT', directory);
    vi.stubEnv('CHAT_COMPARISON_ATTEMPT', '1');
    await writeChatAttempt({ config: { workers: 8 } } as TestInfo, input);
    const inspect = () =>
      guardPlaywrightArtifacts(
        [path],
        { API_TOKEN: 'private-credential' },
        { workspace: directory }
      );
    expect(inspect()).toEqual([]);
    writeFileSync(path, JSON.stringify({ token: 'private-credential' }));
    expect(inspect()).toEqual([path]);
  });

  it('rejects unbound source, browser, digest, attempt and nonfinite timing data', () => {
    for (const change of [
      { binding: { ...binding, sourceSha: 'main' } },
      { binding: { ...binding, fixtureDigest: '' } },
      { browser: 'https://private.example' },
      { attempt: 0 },
      { diagnostics: [{ ...slow, endMs: Infinity }] },
    ]) {
      expect(() => chatAttemptReceipt({ ...input, ...change })).toThrow();
    }
    expect(
      chatAttemptReceipt({ ...input, diagnostics: [slow] }).measurementStatus
    ).toBe('incomplete');
  });
});
