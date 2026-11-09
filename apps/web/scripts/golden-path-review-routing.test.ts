import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reviewKeyframeTraced } from './golden-path-review-routing';
import type { KeyframeRecord } from './golden-path-visual-review';
import { main } from './golden-path-visual-review';

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
  it('retries the relay once on a 429 so a burst stays on Cloudflare credits', async () => {
    let relayCalls = 0;
    const hosts: string[] = [];
    const result = await reviewKeyframeTraced(
      {
        ...frame,
        fetchImpl: async url => {
          hosts.push(new URL(String(url)).host);
          if (String(url).includes('workers.dev')) {
            relayCalls += 1;
            return relayCalls === 1
              ? new Response('rate limited', { status: 429 })
              : verdictBody();
          }
          return verdictBody();
        },
      },
      keys,
      0
    );

    expect(relayCalls).toBe(2);
    expect(hosts).toEqual([
      'jovie-workers-ai.tim-fd8.workers.dev',
      'jovie-workers-ai.tim-fd8.workers.dev',
    ]);
    expect(result).toMatchObject({
      provider: 'workers-ai',
      model: { verdict: 'pass' },
    });
    expect(result.workersAiFallbackReason).toBeUndefined();
  });

  it('does not retry the Gateway onto a hard relay rejection', async () => {
    let relayCalls = 0;
    const hosts: string[] = [];
    const result = await reviewKeyframeTraced(
      {
        ...frame,
        fetchImpl: async url => {
          hosts.push(new URL(String(url)).host);
          if (String(url).includes('workers.dev')) {
            relayCalls += 1;
            return new Response('unauthorized', { status: 401 });
          }
          return verdictBody();
        },
      },
      keys,
      0
    );

    expect(relayCalls).toBe(1);
    expect(result).toMatchObject({
      provider: 'gateway',
      workersAiFallbackReason: 'workers-ai 401',
    });
  });

  it('attributes the serving provider for the relay and the unconfigured relay', async () => {
    const viaRelay = await reviewKeyframeTraced(
      { ...frame, fetchImpl: async () => verdictBody() },
      keys,
      0
    );
    expect(viaRelay.provider).toBe('workers-ai');
    expect(viaRelay.workersAiFallbackReason).toBeUndefined();

    const unconfigured = await reviewKeyframeTraced(
      { ...frame, fetchImpl: async () => verdictBody() },
      { ...keys, workersAiToken: undefined },
      0
    );
    expect(unconfigured.provider).toBe('gateway');
    expect(unconfigured.workersAiFallbackReason).toBe('not configured');
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
    const lines = [record(), record()].map(r => JSON.stringify(r));
    writeFileSync(join(dir, 'manifest.jsonl'), `${lines.join('\n')}\n`);
    for (const r of [record(), record()])
      writeFileSync(join(dir, r.file), 'png');
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
