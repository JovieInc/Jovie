import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
  gatewayKey: 'gw-key',
  gatewayBaseUrl: 'https://gw.test/v1',
  workersAiToken: 'cf-token',
};
const verdictBody = () =>
  Response.json({
    choices: [{ message: { content: '{"verdict":"pass","findings":[]}' } }],
  });

describe('reviewKeyframeTraced (routing attribution)', () => {
  it('retries the relay once on a 429 and never touches the Gateway', async () => {
    const providers: string[] = [];
    const result = await reviewKeyframeTraced(
      async provider => {
        providers.push(provider);
        return provider === 'workers-ai' && providers.length === 1
          ? { verdict: 'unknown', reason: 'workers-ai 429' }
          : { verdict: 'pass', findings: [] };
      },
      true,
      0
    );

    expect(providers).toEqual(['workers-ai', 'workers-ai']);
    expect(result).toMatchObject({
      provider: 'workers-ai',
      model: { verdict: 'pass' },
    });
    expect(result.workersAiFallbackReason).toBeUndefined();
  });

  it('keeps the fallback reason and the Gateway verdict on a hard relay rejection', async () => {
    const providers: string[] = [];
    const result = await reviewKeyframeTraced(
      async provider => {
        providers.push(provider);
        return provider === 'workers-ai'
          ? { verdict: 'unknown', reason: 'workers-ai 401' }
          : { verdict: 'pass', findings: [] };
      },
      true,
      0
    );

    expect(providers).toEqual(['workers-ai', 'gateway']);
    expect(result).toMatchObject({
      provider: 'gateway',
      model: { verdict: 'pass' },
      workersAiFallbackReason: 'workers-ai 401',
    });
  });

  it('never retries an unusable relay answer, only a rate limit', async () => {
    const providers: string[] = [];
    const result = await reviewKeyframeTraced(
      async provider => {
        providers.push(provider);
        return provider === 'workers-ai'
          ? { verdict: 'unknown', reason: 'unusable verdict: maybe' }
          : { verdict: 'unknown', reason: 'gateway 402' };
      },
      true,
      0
    );
    expect(providers).toEqual(['workers-ai', 'gateway']);
    expect(result.workersAiFallbackReason).toBe('unusable verdict: maybe');
  });

  it('marks an unconfigured relay instead of pretending it was tried', async () => {
    const providers: string[] = [];
    const result = await reviewKeyframeTraced(
      async provider => {
        providers.push(provider);
        return { verdict: 'pass', findings: [] };
      },
      false,
      0
    );
    expect(providers).toEqual(['gateway']);
    expect(result).toMatchObject({
      provider: 'gateway',
      workersAiFallbackReason: 'not configured',
    });
  });
});

describe('reviewKeyframe (relay first, Gateway second)', () => {
  it('serves from the relay and attributes it', async () => {
    const result = await reviewKeyframe(
      { ...frame, fetchImpl: async () => verdictBody() },
      keys
    );
    expect(result.provider).toBe('workers-ai');
    expect(result.workersAiFallbackReason).toBeUndefined();
  });

  it('records the relay rejection reason that triggered the Gateway fallback', async () => {
    const hosts: string[] = [];
    const result = await reviewKeyframe(
      {
        ...frame,
        fetchImpl: async url => {
          hosts.push(new URL(String(url)).host);
          return String(url).includes('workers.dev')
            ? new Response('unauthorized', { status: 401 })
            : verdictBody();
        },
      },
      keys
    );
    expect(hosts[0]).toBe('jovie-workers-ai.tim-fd8.workers.dev');
    expect(result.provider).toBe('gateway');
    expect(result.workersAiFallbackReason).toBe('workers-ai 401');
  });

  it('reports an unconfigured relay as the fallback reason', async () => {
    const hosts: string[] = [];
    const result = await reviewKeyframe(
      {
        ...frame,
        fetchImpl: async url => {
          hosts.push(new URL(String(url)).host);
          return verdictBody();
        },
      },
      { ...keys, workersAiToken: undefined }
    );
    expect(hosts).toEqual(['gw.test']);
    expect(result).toMatchObject({
      provider: 'gateway',
      workersAiFallbackReason: 'not configured',
    });
  });
});

describe('main routing aggregate', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('records the routing aggregate so a Gateway fallback is diagnosable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpr-routing-'));
    dirs.push(dir);
    const records = [record(), record()];
    writeFileSync(
      join(dir, 'manifest.jsonl'),
      records.map(r => JSON.stringify(r)).join('\n')
    );
    for (const r of records) writeFileSync(join(dir, r.file), 'png');
    const out = join(dir, 'verdict.json');
    await main(
      ['--dir', dir, '--out', out],
      { AI_GATEWAY_API_KEY: 'k', VISUAL_REVIEW_BASE_URL: 'https://gw.test' },
      async () => verdictBody()
    );
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.reviewers.routing).toEqual({
      viaWorkersAi: 0,
      viaGateway: 2,
      workersAiFallbackReasons: ['not configured'],
    });
  });
});
