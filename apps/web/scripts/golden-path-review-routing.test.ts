import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import routingRegistry from '../lib/ai/routing.json';
import { reviewKeyframeTraced } from './golden-path-review-routing';
import type { KeyframeRecord } from './golden-path-visual-review';
import { main, reviewKeyframe } from './golden-path-visual-review';

function record(): KeyframeRecord {
  return {
    id: 'public-profile',
    sequence: 1,
    url: 'https://jov.ie/tim?mode=listen',
    file: '01-public-profile.png',
    sha256: 'a'.repeat(64),
    audit: {
      viewport: { width: 1280, height: 800 },
      overflowPx: 0,
      offscreenInteractive: [],
      smallTargets: [],
      brokenImages: [],
    },
    pageErrors: [],
  };
}

const frame = { png: Buffer.from('x'), stepId: 'home', path: '/' };
const keys = {
  workersAiToken: 'cf-token',
};
const verdictBody = () =>
  Response.json({
    choices: [{ message: { content: '{"verdict":"pass","findings":[]}' } }],
  });

describe('shipping reviewer Cloudflare-only routing', () => {
  afterEach(() => vi.useRealTimers());

  it('declares only the existing Workers AI vision model without a fallback', () => {
    const route = routingRegistry.callers.find(
      c => c.id === 'ci.golden-path-review'
    );
    expect(route).toMatchObject({
      route: 'workers-ai-only',
      fallback: null,
      models: ['@cf/zai-org/glm-5.3-flash'],
      gatewayKey: null,
    });
    expect(route?.gatewayUsdPerDayMax ?? 0).toBe(0);
  });

  it('skips an unconfigured relay without attempting any provider', async () => {
    const attempt = vi.fn(async () => ({
      verdict: 'pass' as const,
      findings: [],
    }));
    const result = await reviewKeyframeTraced(attempt, false);
    expect(attempt).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: null,
      model: { verdict: 'unknown', reason: 'workers-ai not configured' },
    });
  });

  it.each([
    'workers-ai 401',
    'workers-ai 402',
    'workers-ai 403',
    'workers-ai 503',
    'invalid JSON',
    'unusable verdict',
  ])('retains unknown without Gateway or a retry for %s', async reason => {
    const providers: string[] = [];
    const result = await reviewKeyframeTraced(
      async provider => {
        providers.push(provider);
        return { verdict: 'unknown', reason };
      },
      true,
      0
    );
    expect(providers).toEqual(['workers-ai']);
    expect(result.model).toEqual({ verdict: 'unknown', reason });
  });

  it.each(['pass', 'blocker'] as const)(
    'preserves a %s verdict without another provider',
    async verdict => {
      const model = {
        verdict,
        findings: verdict === 'blocker' ? ['layout: clipped'] : [],
      };
      const attempt = vi.fn(async () => model);
      const result = await reviewKeyframeTraced(attempt, true);
      expect(attempt).toHaveBeenCalledExactlyOnceWith('workers-ai');
      expect(result).toEqual({ model, provider: 'workers-ai' });
    }
  );

  it.each(['pass', 'blocker'] as const)(
    'waits ten seconds before its one 429 retry returns %s',
    async verdict => {
      vi.useFakeTimers();
      const attempt = vi
        .fn()
        .mockResolvedValueOnce({ verdict: 'unknown', reason: 'workers-ai 429' })
        .mockResolvedValueOnce({
          verdict,
          findings: verdict === 'blocker' ? ['layout: clipped'] : [],
        });
      const pending = reviewKeyframeTraced(attempt, true);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(attempt).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).model.verdict).toBe(verdict);
      expect(attempt.mock.calls).toEqual([['workers-ai'], ['workers-ai']]);
    }
  );

  it.each([
    'workers-ai 429',
    'workers-ai 402',
    'workers-ai 503',
    'invalid JSON',
  ])('stops after one retry when the next answer is %s', async reason => {
    const providers: string[] = [];
    const result = await reviewKeyframeTraced(
      async provider => {
        providers.push(provider);
        return {
          verdict: 'unknown',
          reason: providers.length === 1 ? 'workers-ai 429' : reason,
        };
      },
      true,
      0
    );
    expect(providers).toEqual(['workers-ai', 'workers-ai']);
    expect(result.model).toEqual({ verdict: 'unknown', reason });
  });
});

describe('reviewKeyframe (Cloudflare only)', () => {
  it.each([undefined, '', '   '])(
    'makes no request without a configured token (%s)',
    async workersAiToken => {
      const fetchImpl = vi.fn(async () => verdictBody());
      const result = await reviewKeyframe(
        { ...frame, fetchImpl },
        { ...keys, workersAiToken }
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(result.model.verdict).toBe('unknown');
      expect(result.provider).toBeNull();
    }
  );

  it.each([401, 402, 403, 500, 503])(
    'never falls back after HTTP %s',
    async status => {
      const hosts: string[] = [];
      const result = await reviewKeyframe(
        {
          ...frame,
          fetchImpl: async url => {
            hosts.push(new URL(String(url)).host);
            return new Response('not available', { status });
          },
        },
        keys
      );
      expect(hosts).toEqual(['jovie-workers-ai.tim-fd8.workers.dev']);
      expect(result.model).toEqual({
        verdict: 'unknown',
        reason: `workers-ai ${status}`,
      });
    }
  );

  it('never reflects credential-bearing exceptions into evidence', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Bearer private-key');
    });
    const result = await reviewKeyframe({ ...frame, fetchImpl }, keys);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.model).toEqual({
      verdict: 'unknown',
      reason: 'workers-ai request failed',
    });
  });

  it('never reflects an arbitrary verdict value into evidence', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ verdict: 'private-key'.repeat(100) }),
            },
          },
        ],
      })
    );
    const result = await reviewKeyframe({ ...frame, fetchImpl }, keys);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.model).toEqual({
      verdict: 'unknown',
      reason: 'unusable verdict',
    });
  });
});

describe('CLI routing evidence', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it.each(['missing', 'unavailable', 'served'] as const)(
    'records %s reviews honestly while ignoring Gateway settings',
    async state => {
      const dir = mkdtempSync(join(tmpdir(), 'gpr-routing-'));
      dirs.push(dir);
      const records = [record(), record()];
      writeFileSync(
        join(dir, 'manifest.jsonl'),
        records.map(r => JSON.stringify(r)).join('\n')
      );
      for (const r of records) writeFileSync(join(dir, r.file), 'png');
      const out = join(dir, 'verdict.json');
      const hosts: string[] = [];
      await main(
        ['--dir', dir, '--out', out],
        {
          AI_GATEWAY_API_KEY: 'must-not-use',
          VISUAL_REVIEW_BASE_URL: 'https://gw.test',
          ...(state !== 'missing' ? { WORKERS_AI_TOKEN: 'cf-token' } : {}),
        },
        async url => {
          hosts.push(new URL(String(url)).host);
          return state === 'unavailable'
            ? new Response('no credit', { status: 402 })
            : verdictBody();
        }
      );
      expect(hosts).toEqual(
        state === 'missing'
          ? []
          : Array(2).fill('jovie-workers-ai.tim-fd8.workers.dev')
      );
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.reviewers.model).toBe('@cf/zai-org/glm-5.3-flash');
      expect(written.reviewers.routing).toMatchObject({
        viaWorkersAi: state === 'served' ? 2 : 0,
        viaGateway: 0,
        unavailable: state === 'unavailable' ? 2 : 0,
        skipped: state === 'missing' ? 2 : 0,
        workersAiFallbackReasons: [],
        workersAiUnavailableReasons:
          state === 'served'
            ? []
            : [
                state === 'missing'
                  ? 'workers-ai not configured'
                  : 'workers-ai 402',
              ],
      });
      expect(
        written.keyframes.map(
          (v: { model: { verdict: string } }) => v.model.verdict
        )
      ).toEqual(Array(2).fill(state === 'served' ? 'pass' : 'unknown'));
    }
  );
});
