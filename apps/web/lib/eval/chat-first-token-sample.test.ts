import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildRecordedChatFirstTokenSample,
  buildUnrunChatFirstTokenSample,
  CHAT_FIRST_TOKEN_SAMPLE_SCHEMA,
  CHAT_FIRST_TOKEN_SAMPLE_UNRUN_RELATIVE,
  chatFirstTokenSampleToGateInput,
  evaluateChatFirstTokenSample,
  firstTokenP50Ms,
  parseChatFirstTokenSample,
  serializeChatFirstTokenSample,
} from './chat-first-token-sample';
import {
  ASSISTANTS_FIRST_TOKEN_TARGET_MS,
  evaluateChatUxGate,
} from './chat-ux-contract';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

describe('chat first-token sample harness', () => {
  it('pins schema identity and keeps the unrun fixture on disk', () => {
    expect(CHAT_FIRST_TOKEN_SAMPLE_SCHEMA).toBe(
      'jovie.assistants-chat-first-token/v1'
    );
    const fixturePath = path.join(
      webRoot,
      CHAT_FIRST_TOKEN_SAMPLE_UNRUN_RELATIVE
    );
    expect(() => accessSync(fixturePath, constants.R_OK)).not.toThrow();
    const sample = parseChatFirstTokenSample(
      JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
    );
    expect(sample.status).toBe('unrun');
    expect(sample.p50Ms).toBeNull();
    expect(sample.surface).toBe('/app/chat');
    expect(sample.account).toBe('test');
    expect(sample.targetMs).toBe(ASSISTANTS_FIRST_TOKEN_TARGET_MS);
  });

  it('computes p50 with the same nearest-rank rule as UX latency summaries', () => {
    expect(firstTokenP50Ms([])).toBeNull();
    expect(firstTokenP50Ms([100])).toBe(100);
    expect(firstTokenP50Ms([100, 200])).toBe(100);
    expect(firstTokenP50Ms([300, 100, 200])).toBe(200);
  });

  it('feeds evaluateChatUxGate and skips compare while unrun', () => {
    const unrun = buildUnrunChatFirstTokenSample('fixture');
    expect(evaluateChatFirstTokenSample(unrun).ok).toBe(true);
    expect(
      evaluateChatUxGate(chatFirstTokenSampleToGateInput(unrun, true))
    ).toEqual({ ok: true, reasons: [] });
  });

  it('fails closed when a recorded p50 meets or exceeds the 1s Assistants target', () => {
    const slow = buildRecordedChatFirstTokenSample({
      samplesMs: [900, 1_000, 1_100],
      recordedAt: '2026-11-21T00:00:00.000Z',
      mode: 'injected',
    });
    expect(slow.p50Ms).toBe(1_000);
    expect(evaluateChatFirstTokenSample(slow).ok).toBe(false);

    const fast = buildRecordedChatFirstTokenSample({
      samplesMs: [120, 180, 90],
      recordedAt: '2026-11-21T00:00:00.000Z',
      mode: 'injected',
    });
    expect(fast.p50Ms).toBeLessThan(ASSISTANTS_FIRST_TOKEN_TARGET_MS);
    expect(evaluateChatFirstTokenSample(fast)).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it('rejects invalid recorded documents and account drift', () => {
    expect(() =>
      parseChatFirstTokenSample({
        ...buildRecordedChatFirstTokenSample({
          samplesMs: [50],
          recordedAt: '2026-11-21T00:00:00.000Z',
        }),
        p50Ms: 999,
      })
    ).toThrow(/p50Ms/);

    expect(() =>
      parseChatFirstTokenSample({
        ...buildUnrunChatFirstTokenSample(),
        account: 'prod',
      })
    ).toThrow(/account/);
  });

  it('round-trips a recorded sample through serialize + parse', () => {
    const sample = buildRecordedChatFirstTokenSample({
      samplesMs: [80, 120, 95],
      recordedAt: '2026-11-21T12:00:00.000Z',
      mode: 'relay',
      notes: 'test-account only',
    });
    const serialized = serializeChatFirstTokenSample(sample);
    const loaded = parseChatFirstTokenSample(JSON.parse(serialized) as unknown);
    expect(loaded).toEqual(sample);
    expect(JSON.parse(serialized)).toMatchObject({
      status: 'recorded',
      p50Ms: sample.p50Ms,
    });
  });
});
