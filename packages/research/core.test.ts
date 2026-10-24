import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  extractUrls,
  inferFreshness,
  keywords,
  normalizeQuery,
  queryKey,
  similarity,
} from './normalize.ts';
import { capExceeded, ResearchState, rollUsage, summarize } from './state.ts';
import { sampleResult } from './test-fixtures.ts';

describe('normalize', () => {
  it('shares a key across phrasing and word order', () => {
    expect(normalizeQuery('What is the Exa pricing?')).toBe(
      normalizeQuery('exa pricing')
    );
    expect(queryKey('pricing exa', 'month', 'standard')).toBe(
      queryKey('Exa pricing!', 'month', 'standard')
    );
  });
  it('keys differ by freshness, mode and social', () => {
    const base = queryKey('exa pricing', 'month', 'standard');
    expect(queryKey('exa pricing', 'week', 'standard')).not.toBe(base);
    expect(queryKey('exa pricing', 'month', 'deep')).not.toBe(base);
    expect(queryKey('exa pricing', 'month', 'standard', true)).not.toBe(base);
  });
  it('keeps versions and years, strips stopwords in order for keyword search', () => {
    expect(keywords('How does the GPT-5.5 model work in 2026?')).toBe(
      'gpt-5.5 model 2026'
    );
    expect(keywords('the of and')).toBe('');
  });
  it('infers freshness from wording', () => {
    expect(inferFreshness('is vercel down right now')).toBe('live');
    expect(inferFreshness('latest exa changelog')).toBe('week');
    expect(inferFreshness('exa pricing')).toBe('month');
    expect(inferFreshness('what is a merkle tree')).toBe('evergreen');
  });
  it('scores paraphrases high and refuses mismatched versions', () => {
    expect(
      similarity(
        'What does Exa charge per search request?',
        'exa per-request search pricing: what does it charge'
      )
    ).toBeGreaterThanOrEqual(0.75);
    expect(similarity('gpt-5.5 pricing', 'gpt-5.6 pricing')).toBe(0);
    expect(similarity('exa pricing', 'firecrawl pricing')).toBeLessThan(0.75);
  });
  it('extracts urls', () => {
    expect(
      extractUrls('summarize https://exa.ai/pricing and (https://a.b/c)')
    ).toEqual(['https://exa.ai/pricing', 'https://a.b/c']);
  });
});

describe('caps', () => {
  it('rolls periods and enforces each cap', () => {
    const row = rollUsage(
      {
        day: { key: '2026-10-19', calls: 9, usd: 1 },
        month: { key: '2026-10', calls: 9, usd: 1 },
      },
      '2026-10-20',
      '2026-10'
    );
    expect(row.day).toEqual({ key: '2026-10-20', calls: 0, usd: 0 });
    expect(row.month.calls).toBe(9);
    expect(capExceeded(row, { monthlyCalls: 9 }, 0)).toBe('monthlyCalls 9');
    expect(capExceeded(row, { dailyUsd: 0.5 }, 0.6)).toBe('dailyUsd 0.5');
    expect(capExceeded(row, { monthlyUsd: 1.5 }, 0.6)).toBe('monthlyUsd 1.5');
    expect(capExceeded(row, { dailyCalls: 1 }, 0)).toBeNull();
    expect(capExceeded(row, undefined, 99)).toBeNull();
  });
});

describe('ResearchState', () => {
  let dir: string;
  let clock: number;
  let state: ResearchState;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'research-state-'));
    clock = Date.parse('2026-10-20T12:00:00Z');
    state = new ResearchState(dir, () => clock);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('reserves until the cap, then settles to the actual cost', async () => {
    expect(
      await state.reserve('exa', { dailyCalls: 2, dailyUsd: 1 }, 0.4)
    ).toBeNull();
    expect(
      await state.reserve('exa', { dailyCalls: 2, dailyUsd: 1 }, 0.4)
    ).toBeNull();
    expect(
      await state.reserve('exa', { dailyCalls: 2, dailyUsd: 1 }, 0.4)
    ).toBe('dailyCalls 2');
    await state.settle('exa', 0.4, 0.1);
    expect((await state.readUsage()).sources.exa.day.usd).toBeCloseTo(0.5);
    clock += 86_400_000;
    expect(await state.reserve('exa', { dailyCalls: 2 }, 0)).toBeNull();
  });

  it('serves cached results until they expire', async () => {
    await state.putCached(sampleResult());
    expect((await state.getCached('k1'))?.query).toBe('exa pricing');
    clock = Date.parse('2026-11-04T00:00:00Z');
    expect(await state.getCached('k1')).toBeNull();
  });

  it('finds an unexpired paraphrase with the same freshness and mode only', async () => {
    await state.putCached(
      sampleResult({ query: 'What does Exa charge per search request?' })
    );
    const match = { freshness: 'month', mode: 'standard', social: false };
    expect(
      (
        await state.findSimilar(
          'exa per-request search pricing: what does it charge',
          match
        )
      )?.key
    ).toBe('k1');
    expect(
      await state.findSimilar('exa per-request search pricing', {
        ...match,
        mode: 'deep',
      })
    ).toBeNull();
    expect(await state.findSimilar('firecrawl credits', match)).toBeNull();
  });

  it('lets one process own a key and others wait for its result', async () => {
    expect(await state.claim('k1')).toBe(true);
    expect(await state.claim('k1')).toBe(false);
    const waiting = state.waitFor('k1', 5_000);
    await state.putCached(sampleResult());
    await state.release('k1');
    expect((await waiting)?.key).toBe('k1');
    expect(await state.claim('k1')).toBe(true);
  });

  it('reclaims a stale in-flight marker', async () => {
    clock = Date.now();
    expect(await state.claim('k2')).toBe(true);
    clock += 400_000; // markers are dated by real mtime
    expect(await state.claim('k2', 300_000)).toBe(true);
  });

  it('logs metrics as JSONL', async () => {
    await state.log({
      event: 'research',
      cache: 'miss',
      mode: 'quick',
      usd: 0.01,
      ms: 10,
      sources: ['exa'],
    });
    await state.log({
      event: 'research',
      cache: 'local',
      mode: 'quick',
      usd: 0,
      ms: 2,
      sources: [],
    });
    const stats = summarize(await state.readMetrics());
    expect(stats.runs).toBe(2);
    expect(stats.cacheHitRate).toBe(0.5);
    expect(stats.byMode.quick.hits).toBe(1);
    expect(stats.sourceUse).toEqual({ exa: 1 });
  });
});
