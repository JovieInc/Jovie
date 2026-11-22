/** Hermetic Workers AI relay config/routing ratchets (ASS-17 path). */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  chatCompletionsUrl,
  cheapJudgeFallbackModel,
  isWorkersAiModelAllowlistError,
  WORKERS_AI_CHEAP_JUDGE,
  WORKERS_AI_CHEAP_JUDGE_FALLBACK,
  WORKERS_AI_RELAY_BASE_URL,
  WORKERS_AI_STRONG_JUDGE,
  WORKERS_AI_SUBJECT_MODEL,
  withCheapJudgeFallback,
} from './workers-ai';

const routing = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../lib/ai/routing.json'
    ),
    'utf8'
  )
) as { providers: { 'workers-ai': { relayBaseUrl: string } } };

describe('Workers AI relay base URL', () => {
  it('matches routing.json so eval and production share one relay', () => {
    expect(WORKERS_AI_RELAY_BASE_URL).toBe(
      routing.providers['workers-ai'].relayBaseUrl
    );
    expect(WORKERS_AI_RELAY_BASE_URL).toMatch(/\/v1$/);
  });
});

describe('chatCompletionsUrl', () => {
  it('builds the OpenAI-compatible relay path without an account id', () => {
    expect(
      chatCompletionsUrl({
        mode: 'relay',
        baseUrl: 'https://jovie-workers-ai.example/v1/',
        token: () => 't',
      })
    ).toBe('https://jovie-workers-ai.example/v1/chat/completions');
  });

  it('builds the direct Cloudflare account path', () => {
    expect(
      chatCompletionsUrl({
        mode: 'direct',
        accountId: 'acct_123',
        token: () => 't',
      })
    ).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct_123/ai/v1/chat/completions'
    );
  });
});

describe('answerer ≠ judge models', () => {
  it('keeps subject and cheap judge on distinct @cf models', () => {
    expect(WORKERS_AI_SUBJECT_MODEL).toBe('@cf/zai-org/glm-5.3');
    expect(WORKERS_AI_CHEAP_JUDGE).toBe('@cf/openai/gpt-oss-120b');
    expect(WORKERS_AI_CHEAP_JUDGE_FALLBACK).toBe(
      '@cf/deepseek-ai/deepseek-v4.1-flash-1017'
    );
    expect(WORKERS_AI_STRONG_JUDGE).toBe(
      '@cf/deepseek-ai/deepseek-v4-pro-0813'
    );
    expect(WORKERS_AI_SUBJECT_MODEL).not.toBe(WORKERS_AI_CHEAP_JUDGE);
    expect(WORKERS_AI_SUBJECT_MODEL).not.toBe(WORKERS_AI_STRONG_JUDGE);
    expect(WORKERS_AI_SUBJECT_MODEL).not.toBe(WORKERS_AI_CHEAP_JUDGE_FALLBACK);
    // Summer share + answerer ≠ judge: fallback must not be glm-5.3*.
    expect(WORKERS_AI_CHEAP_JUDGE_FALLBACK).not.toMatch(/glm-5\.3/);
  });
});

describe('cheap judge allowlist fallback', () => {
  const liveAllowlistMiss = new Error(
    `Workers AI ${WORKERS_AI_CHEAP_JUDGE} HTTP 400: {"error":{"message":"model not allowed","type":"invalid_request_error"}}`
  );

  it('detects the live relay model-not-allowed HTTP 400', () => {
    expect(isWorkersAiModelAllowlistError(liveAllowlistMiss)).toBe(true);
    expect(
      isWorkersAiModelAllowlistError(
        new Error('Workers AI x HTTP 400: model not on the allowlist')
      )
    ).toBe(true);
    expect(
      isWorkersAiModelAllowlistError(
        new Error(`Workers AI x HTTP 500: ${'model not allowed'}`)
      )
    ).toBe(false);
    expect(
      isWorkersAiModelAllowlistError(
        new Error('Workers AI x HTTP 400: rate limited')
      )
    ).toBe(false);
  });

  it('offers fallback only for cheap judge + allowlist misses', () => {
    expect(
      cheapJudgeFallbackModel(WORKERS_AI_CHEAP_JUDGE, liveAllowlistMiss)
    ).toBe(WORKERS_AI_CHEAP_JUDGE_FALLBACK);
    expect(
      cheapJudgeFallbackModel(WORKERS_AI_STRONG_JUDGE, liveAllowlistMiss)
    ).toBeNull();
    expect(
      cheapJudgeFallbackModel(
        WORKERS_AI_CHEAP_JUDGE,
        new Error('Workers AI x HTTP 429: rate limited')
      )
    ).toBeNull();
  });

  it('retries once on allowlist miss then returns the fallback result', async () => {
    const calls: string[] = [];
    const result = await withCheapJudgeFallback(
      WORKERS_AI_CHEAP_JUDGE,
      async model => {
        calls.push(model);
        if (model === WORKERS_AI_CHEAP_JUDGE) throw liveAllowlistMiss;
        return { model, ok: true };
      }
    );
    expect(calls).toEqual([
      WORKERS_AI_CHEAP_JUDGE,
      WORKERS_AI_CHEAP_JUDGE_FALLBACK,
    ]);
    expect(result).toEqual({
      model: WORKERS_AI_CHEAP_JUDGE_FALLBACK,
      ok: true,
    });
  });

  it('does not retry non-allowlist errors or non-cheap judges', async () => {
    await expect(
      withCheapJudgeFallback(WORKERS_AI_CHEAP_JUDGE, async () => {
        throw new Error('Workers AI x HTTP 429: rate limited');
      })
    ).rejects.toThrow(/HTTP 429/);

    const strongCalls: string[] = [];
    await expect(
      withCheapJudgeFallback(WORKERS_AI_STRONG_JUDGE, async model => {
        strongCalls.push(model);
        throw liveAllowlistMiss;
      })
    ).rejects.toThrow(/model not allowed/);
    expect(strongCalls).toEqual([WORKERS_AI_STRONG_JUDGE]);
  });
});

describe('resolveWorkersAiConfig', () => {
  it('prefers WORKERS_AI_TOKEN relay over Cloudflare account credentials', async () => {
    const { resolveWorkersAiConfig } = await import('./resolve-config');
    const config = resolveWorkersAiConfig({
      WORKERS_AI_TOKEN: ' relay-secret ',
      CLOUDFLARE_ACCOUNT_ID: 'acct_should_be_ignored',
      CLOUDFLARE_API_TOKEN: 'cf-should-be-ignored',
    } as NodeJS.ProcessEnv);
    expect(config).toMatchObject({
      mode: 'relay',
      baseUrl: WORKERS_AI_RELAY_BASE_URL,
    });
    expect(config.token()).toBe('relay-secret');
  });

  it('honors WORKERS_AI_BASE_URL override on the relay path', async () => {
    const { resolveWorkersAiConfig } = await import('./resolve-config');
    const config = resolveWorkersAiConfig({
      WORKERS_AI_TOKEN: 't',
      WORKERS_AI_BASE_URL: 'https://staging-relay.example/v1/',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      mode: 'relay',
      baseUrl: 'https://staging-relay.example/v1',
      token: expect.any(Function),
    });
  });

  it('falls back to direct Cloudflare when only account credentials exist', async () => {
    const { resolveWorkersAiConfig } = await import('./resolve-config');
    const config = resolveWorkersAiConfig({
      CLOUDFLARE_ACCOUNT_ID: 'acct_abc',
      CLOUDFLARE_API_TOKEN: 'cf-token',
    } as NodeJS.ProcessEnv);
    expect(config.mode).toBe('direct');
    if (config.mode !== 'direct') throw new Error('expected direct');
    expect(config.accountId).toBe('acct_abc');
    expect(config.token()).toBe('cf-token');
  });

  it('names both auth paths when nothing is configured', async () => {
    const { resolveWorkersAiConfig } = await import('./resolve-config');
    expect(() => resolveWorkersAiConfig({} as NodeJS.ProcessEnv)).toThrow(
      /WORKERS_AI_TOKEN.*CLOUDFLARE_ACCOUNT_ID/
    );
  });
});
