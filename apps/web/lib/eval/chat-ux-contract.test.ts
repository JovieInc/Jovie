import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createJankMonitor } from '@/lib/chat/jank-monitor';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import {
  UX_LATENCY_METRICS,
  type UxLatencyMetric,
} from '@/lib/monitoring/interaction-latency';
import { SUMMER_TTFT_TARGET_MS } from '@/lib/ovie/summer-canary';
import { INTERACTION_CLASS_BUDGETS } from '@/scripts/performance-interaction-manifest';
import {
  ASSISTANTS_CHAT_UX_CONTRACT_VERSION,
  ASSISTANTS_FIRST_TOKEN_METRIC,
  ASSISTANTS_FIRST_TOKEN_TARGET_MS,
  CHAT_JANK_CONTRACT_TESTS,
  evaluateChatUxGate,
} from './chat-ux-contract';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

describe('assistants chat UX contract', () => {
  it('pins version, first-token target, and metric identity', () => {
    expect(ASSISTANTS_CHAT_UX_CONTRACT_VERSION).toBe(
      'jovie.assistants-chat-ux/v1'
    );
    expect(ASSISTANTS_FIRST_TOKEN_TARGET_MS).toBe(1_000);
    expect(ASSISTANTS_FIRST_TOKEN_METRIC).toBe('chat_first_token');
    expect(
      UX_LATENCY_METRICS.some(
        metric =>
          metric.name === (ASSISTANTS_FIRST_TOKEN_METRIC as UxLatencyMetric)
      )
    ).toBe(true);
  });

  it('keeps deploy-gating chat first-feedback budgets under the Assistants 1s target', () => {
    const budget = INTERACTION_CLASS_BUDGETS['chat-message-round-trip'];
    expect(budget.firstFeedbackP50Ms).toBeLessThan(
      ASSISTANTS_FIRST_TOKEN_TARGET_MS
    );
    expect(budget.firstFeedbackP95Ms).toBeLessThan(
      ASSISTANTS_FIRST_TOKEN_TARGET_MS
    );
    expect(budget.usableStateP95Ms).toBeLessThan(
      ASSISTANTS_FIRST_TOKEN_TARGET_MS
    );
  });

  it('documents Summer canary TTFT as a separate, live production budget', () => {
    // Summer canary hits a real model; Assistants product target is stricter.
    expect(SUMMER_TTFT_TARGET_MS.p50).toBeGreaterThan(
      ASSISTANTS_FIRST_TOKEN_TARGET_MS
    );
    expect(SUMMER_TTFT_TARGET_MS.p95).toBeGreaterThan(
      SUMMER_TTFT_TARGET_MS.p50
    );
  });

  it('keeps the chat jank monitor on by default', () => {
    expect(APP_FLAG_DEFAULTS.CHAT_JANK_MONITOR).toBe(true);
  });

  it('lists jank contract tests that exist on disk', () => {
    expect(CHAT_JANK_CONTRACT_TESTS.length).toBeGreaterThan(0);
    for (const relative of CHAT_JANK_CONTRACT_TESTS) {
      expect(() =>
        accessSync(path.join(webRoot, relative), constants.R_OK)
      ).not.toThrow();
    }
  });

  it('treats a clean message stream as jank-free', () => {
    const events: string[] = [];
    const monitor = createJankMonitor({
      emit: event => {
        events.push(event);
      },
      now: () => 1_000,
    });
    monitor.observeMessages('conv-contract', [
      {
        id: 'user-1',
        role: 'user',
        isServerAssigned: false,
        parts: [{ kind: 'text', textLength: 12 }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        isServerAssigned: true,
        parts: [{ kind: 'text', textLength: 24 }],
      },
    ]);
    expect(events).toEqual([]);
    expect(monitor.getSummary('conv-contract').isJankFree).toBe(true);
  });

  it('fails the assistants UX gate on jank regression even when latency is unrun', () => {
    expect(
      evaluateChatUxGate({
        jankPassed: false,
        firstTokenP50Ms: null,
        firstTokenStatus: 'unrun',
      })
    ).toEqual({
      ok: false,
      reasons: ['chat jank contract failed'],
    });
  });

  it('fails the assistants UX gate when a recorded first-token p50 meets or exceeds 1s', () => {
    expect(
      evaluateChatUxGate({
        jankPassed: true,
        firstTokenP50Ms: 1_000,
        firstTokenStatus: 'recorded',
      }).ok
    ).toBe(false);
    expect(
      evaluateChatUxGate({
        jankPassed: true,
        firstTokenP50Ms: 999,
        firstTokenStatus: 'recorded',
      })
    ).toEqual({ ok: true, reasons: [] });
  });

  it('skips first-token compare while status is unrun', () => {
    expect(
      evaluateChatUxGate({
        jankPassed: true,
        firstTokenP50Ms: null,
        firstTokenStatus: 'unrun',
      })
    ).toEqual({ ok: true, reasons: [] });
  });
});
