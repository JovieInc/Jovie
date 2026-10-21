import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestInfo } from '@playwright/test';
import type {
  ChatProbeSnapshot,
  ChatProbeTiming,
} from '../tests/helpers/chat-performance-probe';
import type { InteractionLatencyReport } from './performance-interaction-report';

export const FAILURE_HEAD = '53d1da25f70cb94797d6a23acf75cc4990bc8580';
export const FAILURE_BASE = 'fa30a27791181430566f71ede2b46a0908681702';
export const FAILURE_PARENT = '83fdbf42ad46af2173d758c47afbe16a86f33bc6';
export const COMPARISON_POLICY = {
  workers: 8,
  warmups: 3,
  scoredSamples: 5,
  attempts: 2,
} as const;

export interface ChatRunBinding {
  sourceSha: string;
  parentSha: string;
  baseSha: string;
  harnessSha: string;
  harnessDigest: string;
  fixtureDigest: string;
  buildDigest: string;
  datasetDigest: string;
}

export function checkedBinding(value: ChatRunBinding): ChatRunBinding {
  const result = {} as ChatRunBinding;
  for (const key of [
    'sourceSha',
    'parentSha',
    'baseSha',
    'harnessSha',
  ] as const) {
    if (!/^[a-f0-9]{40}$/.test(value[key]))
      throw new Error('Invalid source binding');
    result[key] = value[key];
  }
  for (const key of [
    'harnessDigest',
    'fixtureDigest',
    'buildDigest',
    'datasetDigest',
  ] as const) {
    if (!/^[a-f0-9]{64}$/.test(value[key]))
      throw new Error('Invalid digest binding');
    result[key] = value[key];
  }
  return result;
}

const timing = (value: number | undefined) => {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid timing');
  return value;
};

function entries(values: readonly ChatProbeTiming[]) {
  return values.map(value => {
    if (!Number.isFinite(value.startMs)) throw new Error('Invalid task start');
    return {
      startMs: value.startMs,
      durationMs: timing(value.durationMs),
      sourceBucket: [
        'first-party-next',
        'first-party-other',
        'third-party',
      ].includes(value.sourceBucket)
        ? value.sourceBucket
        : 'unknown',
    };
  });
}

/** Construct the publication shape explicitly. Never spread browser/report input. */
export function chatAttemptReceipt(input: {
  binding: ChatRunBinding;
  browser: string;
  attempt: number;
  diagnostics: readonly ChatProbeSnapshot[];
  scheduling: readonly {
    driverDispatchToHandlerMs: number;
    handlerWorkMs: number;
    fulfillAwaitMs: number;
  }[];
  report?: InteractionLatencyReport;
}) {
  if (!/^\d+(?:\.\d+){1,3}$/.test(input.browser))
    throw new Error('Invalid browser version');
  if (
    !Number.isInteger(input.attempt) ||
    input.attempt < 1 ||
    input.attempt > COMPARISON_POLICY.attempts
  )
    throw new Error('Invalid attempt');
  const summary = input.report?.summaries.find(
    row => row.scenario.id === 'chat-message-round-trip'
  );
  return {
    schema: 'jovie-chat-attempt/v1',
    ...checkedBinding(input.binding),
    buildMode: 'production-standalone',
    browser: `chromium-${input.browser}`,
    workers: COMPARISON_POLICY.workers,
    warmups: COMPARISON_POLICY.warmups,
    scoredSamples: COMPARISON_POLICY.scoredSamples,
    dataset: 'creator-ready-synthetic-mocked-chat-v1',
    attempt: input.attempt,
    causality: 'unknown',
    measurementStatus:
      input.diagnostics.length === 5 &&
      input.diagnostics.every(
        row =>
          row.sendMs === 0 &&
          row.fetchStartedMs !== undefined &&
          row.dataReadyMs !== undefined &&
          row.firstFeedbackMs !== undefined &&
          row.usableStateMs !== undefined &&
          row.renderToInteractiveMs !== undefined
      ) &&
      input.scheduling.length === 5 &&
      summary
        ? 'complete'
        : 'incomplete',
    budgetStatus: input.report?.status ?? 'pending',
    summary: summary
      ? {
          feedbackP50Ms: timing(summary.p50FirstFeedbackMs ?? undefined),
          feedbackP95Ms: timing(summary.p95FirstFeedbackMs ?? undefined),
          usableP95Ms: timing(summary.p95UsableStateMs ?? undefined),
          interactiveP95Ms: timing(
            summary.p95RenderToInteractiveMs ?? undefined
          ),
          droppedFrames: timing(summary.maxDroppedFrameCount ?? undefined),
        }
      : null,
    samples: input.diagnostics.map((row, runIndex) => ({
      runIndex,
      sendMs: timing(row.sendMs),
      fetchStartedMs: timing(row.fetchStartedMs),
      responseHeadersMs: timing(row.dataReadyMs),
      userPresentedMs: timing(row.firstFeedbackMs),
      replyPresentedMs: timing(row.usableStateMs),
      renderToInteractiveMs: timing(row.renderToInteractiveMs),
      endMs: timing(row.endMs),
      longTaskSupported: row.longTaskSupported === true,
      scriptTimingSupported: row.scriptTimingSupported === true,
      longTasks: entries(row.longTasks),
      scripts: entries(row.scripts),
    })),
    // Node monotonic durations; never subtract these from browser timestamps.
    mockScheduling: input.scheduling.map(row => ({
      driverDispatchToHandlerMs: timing(row.driverDispatchToHandlerMs),
      handlerWorkMs: timing(row.handlerWorkMs),
      fulfillAwaitMs: timing(row.fulfillAwaitMs),
    })),
  };
}

export async function writeChatAttempt(
  testInfo: TestInfo,
  input: Omit<Parameters<typeof chatAttemptReceipt>[0], 'binding' | 'attempt'>
) {
  if (
    !process.env.CHAT_COMPARISON_BINDING ||
    !process.env.CHAT_COMPARISON_OUTPUT
  )
    return;
  if (testInfo.config.workers !== 8)
    throw new Error('Comparison requires eight workers');
  const receipt = chatAttemptReceipt({
    ...input,
    binding: JSON.parse(process.env.CHAT_COMPARISON_BINDING),
    attempt: Number(process.env.CHAT_COMPARISON_ATTEMPT),
  });
  const output = resolve(process.env.CHAT_COMPARISON_OUTPUT);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(output, `attempt-${receipt.attempt}.json`),
    JSON.stringify(receipt, null, 2),
    { flag: 'wx', mode: 0o600 }
  );
}
