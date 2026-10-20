import { describe, expect, it } from 'vitest';

import { main, UsageError } from './cli.ts';
import { renderResult } from './report.ts';
import {
  clip,
  exaSearch,
  firecrawlSearch,
  hyperagentDeep,
  parseDeepAnswer,
} from './sources-web.ts';
import {
  client,
  fakeFetch,
  type Reply,
  sampleResult,
} from './test-fixtures.ts';

describe('search adapters go through the api-client contract', () => {
  it('exa: date filter for fresh queries and provider-reported cost', async () => {
    const f = fakeFetch(() => ({
      body: {
        costDollars: { total: 0.007 },
        results: [
          {
            url: 'https://e/1',
            title: 'T',
            highlights: ['a', 'b'],
            publishedDate: '2026-10-01',
          },
        ],
      },
    }));
    const out = await exaSearch(client('exa', f.impl), 'q', 'week', 5);
    expect(out.usd).toBe(0.007);
    expect(out.hits[0]).toMatchObject({
      source: 'exa',
      snippet: 'a … b',
      publishedAt: '2026-10-01',
    });
    expect(
      (f.calls[0].body as { startPublishedDate?: string }).startPublishedDate
    ).toBeDefined();
    await exaSearch(client('exa', f.impl), 'q', 'evergreen');
    expect(
      (f.calls[1].body as { startPublishedDate?: string }).startPublishedDate
    ).toBeUndefined();
  });

  it('firecrawl: time-bounded search, errors surface as failures', async () => {
    const f = fakeFetch(() => ({
      body: {
        data: [
          {
            url: 'https://f',
            title: 'F',
            description: '[x](https://y) ![i](z) ## d',
          },
        ],
      },
    }));
    const out = await firecrawlSearch(
      client('firecrawl', f.impl),
      'q',
      'month'
    );
    expect(out.hits[0].snippet).toBe('x d');
    expect((f.calls[0].body as { tbs?: string }).tbs).toBe('qdr:m');
    const bad = fakeFetch(() => ({
      status: 402,
      body: { error: 'Insufficient credits' },
    }));
    await expect(
      firecrawlSearch(client('firecrawl', bad.impl), 'q', 'month')
    ).rejects.toThrow();
  });

  it('hyperagent: opens a session, creates one thread, polls to the JSON answer', async () => {
    let polls = 0;
    const f = fakeFetch((_url, init): Reply => {
      const msg = JSON.parse(String(init.body)) as {
        method: string;
        params?: { name: string };
      };
      if (msg.method === 'initialize')
        return {
          body: { jsonrpc: '2.0', id: 1, result: {} },
          headers: { 'mcp-session-id': 'S' },
        };
      if (msg.method === 'notifications/initialized')
        return { status: 202, body: '' };
      const tool = msg.params?.name;
      const payload =
        tool === 'create_thread'
          ? { threadId: 'T1' }
          : polls++ === 0
            ? { isRunning: true }
            : {
                isRunning: false,
                messages: [
                  {
                    role: 'assistant',
                    content:
                      'Here: {"answer":"A [1]","sources":[{"title":"S","url":"https://s","snippet":"x"}]}',
                  },
                ],
              };
      return {
        body: `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } })}\n`,
        headers: { 'content-type': 'text/event-stream' },
      };
    });
    const out = await hyperagentDeep(
      client('hyperagent', f.impl),
      'agent',
      'q',
      'week',
      { pollMs: 0, sleep: async () => undefined }
    );
    expect(out).toMatchObject({ threadId: 'T1', answer: 'A [1]' });
    expect(out.hits[0].url).toBe('https://s');
    expect(
      f.calls.filter(
        c =>
          (c.body as { params?: { name?: string } })?.params?.name ===
          'create_thread'
      )
    ).toHaveLength(1);
    expect(f.calls[2].headers.get('mcp-session-id')).toBe('S');
  });

  it('parses non-JSON deep answers by harvesting urls', () => {
    const out = parseDeepAnswer('See https://a.dev/x and https://a.dev/x.');
    expect(out.hits.map(h => h.url)).toEqual([
      'https://a.dev/x',
      'https://a.dev/x.',
    ]);
    expect(clip('a\n\n b', 10)).toBe('a b');
  });
});

describe('rendering', () => {
  it('renders a bounded summary with prior decisions first', () => {
    const text = renderResult(
      sampleResult({
        answer: 'A',
        runs: [
          {
            source: 'exa',
            tier: 2,
            ok: false,
            hits: 0,
            ms: 0,
            usd: 0,
            skipped: 'cap dailyUsd 1',
          },
        ],
      })
    );
    expect(text.split('\n')[1]).toContain('PRIOR DECISIONS');
    expect(text).toContain('skipped: exa:cap dailyUsd 1');
    expect(renderResult(sampleResult({ hits: [] }))).toContain(
      'No relevant results'
    );
  });
});

describe('cli', () => {
  it('prints usage and rejects bad input with a usage error', async () => {
    const out: string[] = [];
    expect(await main([], s => out.push(s))).toBe(64);
    expect(out[0]).toContain('usage: jovie-research');
    await expect(main(['ask'], () => undefined)).rejects.toBeInstanceOf(
      UsageError
    );
    await expect(
      main(['ask', 'q', '--mode', 'huge'], () => undefined)
    ).rejects.toThrow('bad --mode');
    await expect(main(['nope'], () => undefined)).rejects.toThrow(
      'unknown command'
    );
  });
});
