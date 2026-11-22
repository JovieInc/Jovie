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
  CHAT_TTFT_PROBE_MAX_TOKENS,
  CHAT_TTFT_PROBE_MODEL,
  CHAT_TTFT_PROBE_REASONING_EFFORT,
  deltaContentText,
  measureStreamTtftMs,
  probeOneChatFirstTokenMs,
  runLiveChatFirstTokenProbe,
} from './chat-first-token-live-probe';
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

function sseBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

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

  it('CLI soft-skip, inject, fail-closed', async () => {
    expect(parseArgs(['--out', '/t.json', '--mode', 'live']).mode).toBe('live');
    expect(parseInjectedSamples('1,2')).toEqual([1, 2]);
    const out = path.join(mkdtempSync(path.join(tmpdir(), 't-')), 's.json');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await recordCli(['--out', out], {})).toBe(0);
    expect(
      await recordCli(
        ['--out', out],
        { WORKERS_AI_TOKEN: 't' },
        {
          probe: async () => ({
            ok: false,
            sample: buildUnrunChatFirstTokenSample(
              'Live TTFT probe soft-skip (workers-ai 401); test account harness only.'
            ),
          }),
        }
      )
    ).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('"unrun"');
    expect(
      await recordCli(['--out', out], {
        ASSISTANTS_CHAT_TTFT_SAMPLES_MS: '90,80,70',
      })
    ).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('"recorded"');
    expect(
      await recordCli(['--out', out], {
        ASSISTANTS_CHAT_TTFT_SAMPLES_MS: '900,1000,1100',
      })
    ).toBe(1);
    expect(err.mock.calls.some(c => String(c[0]).includes('<1s'))).toBe(true);
  });

  it('live probe records SSE TTFT and soft-skips unsafe failures', async () => {
    expect(CHAT_TTFT_PROBE_MODEL).toMatch(/^@cf\//);
    expect(CHAT_TTFT_PROBE_REASONING_EFFORT).toBe('none');
    expect(CHAT_TTFT_PROBE_MAX_TOKENS).toBeGreaterThan(8);
    expect(deltaContentText('pong')).toBe('pong');
    expect(deltaContentText([{ type: 'text', text: 'p' }])).toBe('p');
    expect(deltaContentText('')).toBeNull();

    let clock = 1_000;
    const now = () => clock;
    const measured = await measureStreamTtftMs({
      response: new Response(
        sseBody([
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n',
          'data: {"choices":[{"delta":{"content":"p"}}]}\n',
          'data: [DONE]\n',
        ]),
        { status: 200 }
      ),
      startedAt: 1_000,
      now: () => {
        clock = 1_180;
        return clock;
      },
    });
    expect(measured).toEqual({ ms: 180 });

    const reasoningOnly = await measureStreamTtftMs({
      response: new Response(
        sseBody([
          'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n',
          'data: [DONE]\n',
        ]),
        { status: 200 }
      ),
      startedAt: 1_000,
      now,
    });
    expect(reasoningOnly).toEqual({ ms: null, reason: 'reasoning_only' });

    let capturedBody: string | undefined;
    const okFetch: typeof fetch = async (_url, init) => {
      capturedBody =
        typeof init?.body === 'string' ? init.body : String(init?.body ?? '');
      clock += 90;
      return new Response(
        sseBody(['data: {"choices":[{"delta":{"content":"pong"}}]}\n']),
        { status: 200 }
      );
    };
    const live = await runLiveChatFirstTokenProbe({
      token: 'test-token',
      baseUrl: 'https://relay.example/v1',
      sampleCount: 3,
      fetchImpl: okFetch,
      now,
      recordedAt: '2026-11-22T00:00:00.000Z',
    });
    expect(live.ok).toBe(true);
    expect(live.sample).toMatchObject({
      status: 'recorded',
      mode: 'live',
      account: 'test',
      surface: '/app/chat',
    });
    expect(live.sample.samplesMs).toHaveLength(3);
    expect(typeof live.sample.p50Ms).toBe('number');
    if (typeof live.sample.p50Ms === 'number') {
      expect(live.sample.p50Ms).toBeLessThan(ASSISTANTS_FIRST_TOKEN_TARGET_MS);
    }
    expect(capturedBody).toContain(
      `"reasoning_effort":"${CHAT_TTFT_PROBE_REASONING_EFFORT}"`
    );
    expect(capturedBody).toContain(
      `"max_tokens":${CHAT_TTFT_PROBE_MAX_TOKENS}`
    );

    const fail = await probeOneChatFirstTokenMs({
      token: 't',
      fetchImpl: async () => new Response('nope', { status: 503 }),
      now,
    });
    expect(fail).toEqual({ error: 'workers-ai 503' });

    const softReasoning = await probeOneChatFirstTokenMs({
      token: 't',
      fetchImpl: async () =>
        new Response(
          sseBody([
            'data: {"choices":[{"delta":{"reasoning_content":"x"}}]}\n',
            'data: [DONE]\n',
          ]),
          { status: 200 }
        ),
      now,
    });
    expect(softReasoning).toEqual({ error: 'reasoning_only' });

    const soft = await runLiveChatFirstTokenProbe({
      token: 't',
      sampleCount: 2,
      fetchImpl: async () => {
        const err = new Error('aborted');
        err.name = 'TimeoutError';
        throw err;
      },
      now,
    });
    expect(soft.ok).toBe(false);
    expect(soft.sample.status).toBe('unrun');
    expect(soft.sample.notes).toMatch(/TimeoutError/);

    const out = path.join(mkdtempSync(path.join(tmpdir(), 't-')), 'live.json');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(
      await recordCli(
        ['--out', out, '--mode', 'live'],
        { WORKERS_AI_TOKEN: 'tok' },
        {
          probe: async () => live,
        }
      )
    ).toBe(0);
    const written = parseChatFirstTokenSample(
      JSON.parse(readFileSync(out, 'utf8'))
    );
    expect(written.status).toBe('recorded');
    expect(written.mode).toBe('live');
  });
});
