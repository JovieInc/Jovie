import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildRecordedChatFirstTokenSample,
  buildUnrunChatFirstTokenSample,
  CHAT_FIRST_TOKEN_SAMPLE_SCHEMA,
  CHAT_FIRST_TOKEN_SAMPLE_UNRUN_RELATIVE,
  evaluateChatFirstTokenSample,
  firstTokenP50Ms,
  parseChatFirstTokenSample,
  serializeChatFirstTokenSample,
} from './chat-first-token-sample';
import { ASSISTANTS_FIRST_TOKEN_TARGET_MS } from './chat-ux-contract';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

describe('chat first-token sample harness', () => {
  it('pins schema + unrun fixture', () => {
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
    expect(sample.account).toBe('test');
    expect(sample.targetMs).toBe(ASSISTANTS_FIRST_TOKEN_TARGET_MS);
  });

  it('computes nearest-rank p50', () => {
    expect(firstTokenP50Ms([])).toBeNull();
    expect(firstTokenP50Ms([100, 200])).toBe(100);
    expect(firstTokenP50Ms([300, 100, 200])).toBe(200);
  });

  it('fails closed when recorded p50 ≥ 1s; passes when under', () => {
    const slow = buildRecordedChatFirstTokenSample({
      samplesMs: [900, 1_000, 1_100],
      recordedAt: '2026-11-21T00:00:00.000Z',
    });
    expect(slow.p50Ms).toBe(1_000);
    expect(evaluateChatFirstTokenSample(slow).ok).toBe(false);

    const fast = buildRecordedChatFirstTokenSample({
      samplesMs: [120, 180, 90],
      recordedAt: '2026-11-21T00:00:00.000Z',
    });
    expect(fast.p50Ms).toBeLessThan(ASSISTANTS_FIRST_TOKEN_TARGET_MS);
    expect(evaluateChatFirstTokenSample(fast).ok).toBe(true);
    expect(
      evaluateChatFirstTokenSample(buildUnrunChatFirstTokenSample()).ok
    ).toBe(true);
  });

  it('rejects bad p50 / account drift; round-trips serialize', () => {
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
    const sample = buildRecordedChatFirstTokenSample({
      samplesMs: [80, 120, 95],
      recordedAt: '2026-11-21T12:00:00.000Z',
    });
    expect(
      parseChatFirstTokenSample(
        JSON.parse(serializeChatFirstTokenSample(sample))
      )
    ).toEqual(sample);
  });
});
