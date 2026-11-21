import { accessSync, constants, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseArgs,
  parseInjectedSamples,
  main as recordCli,
} from '../../scripts/record-chat-first-token-sample';
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

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

describe('chat first-token sample', () => {
  afterEach(() => vi.restoreAllMocks());

  it('schema, p50, gate, serialize', () => {
    expect(CHAT_FIRST_TOKEN_SAMPLE_SCHEMA).toBe(
      'jovie.assistants-chat-first-token/v1'
    );
    const fixture = path.join(root, CHAT_FIRST_TOKEN_SAMPLE_UNRUN_RELATIVE);
    expect(() => accessSync(fixture, constants.R_OK)).not.toThrow();
    expect(
      parseChatFirstTokenSample(JSON.parse(readFileSync(fixture, 'utf8')))
    ).toMatchObject({
      status: 'unrun',
      account: 'test',
      targetMs: ASSISTANTS_FIRST_TOKEN_TARGET_MS,
    });
    expect(firstTokenP50Ms([])).toBeNull();
    expect(firstTokenP50Ms([100, 200])).toBe(100);
    expect(firstTokenP50Ms([300, 100, 200])).toBe(200);
    const at = '2026-11-21T00:00:00.000Z';
    const slow = buildRecordedChatFirstTokenSample({
      samplesMs: [900, 1_000, 1_100],
      recordedAt: at,
    });
    expect(slow.p50Ms).toBe(1_000);
    expect(evaluateChatFirstTokenSample(slow).ok).toBe(false);
    const fast = buildRecordedChatFirstTokenSample({
      samplesMs: [120, 180, 90],
      recordedAt: at,
    });
    expect(fast.p50Ms).toBeLessThan(ASSISTANTS_FIRST_TOKEN_TARGET_MS);
    expect(evaluateChatFirstTokenSample(fast).ok).toBe(true);
    expect(
      evaluateChatFirstTokenSample(buildUnrunChatFirstTokenSample()).ok
    ).toBe(true);
    expect(() => parseChatFirstTokenSample({ ...fast, p50Ms: 999 })).toThrow(
      /p50Ms/
    );
    expect(() =>
      parseChatFirstTokenSample({
        ...buildUnrunChatFirstTokenSample(),
        account: 'prod',
      })
    ).toThrow(/account/);
    expect(
      parseChatFirstTokenSample(JSON.parse(serializeChatFirstTokenSample(fast)))
    ).toEqual(fast);
  });

  it('CLI soft-skip, inject, fail-closed', () => {
    expect(parseArgs(['--out', '/t.json', '--mode', 'live']).mode).toBe('live');
    expect(parseInjectedSamples('1,2')).toEqual([1, 2]);
    const out = path.join(mkdtempSync(path.join(tmpdir(), 't-')), 's.json');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(recordCli(['--out', out], {})).toBe(0);
    expect(recordCli(['--out', out], { WORKERS_AI_TOKEN: 't' })).toBe(0);
    expect(
      recordCli(['--out', out], { ASSISTANTS_CHAT_TTFT_SAMPLES_MS: '90,80,70' })
    ).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('"recorded"');
    expect(
      recordCli(['--out', out], {
        ASSISTANTS_CHAT_TTFT_SAMPLES_MS: '900,1000,1100',
      })
    ).toBe(1);
    expect(err.mock.calls.some(c => String(c[0]).includes('<1s'))).toBe(true);
  });
});
