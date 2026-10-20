import { Readable, Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';
import { main } from './cli.ts';
import {
  decisionPage,
  decisionSlug,
  proposeReviews,
  recordDecision,
  resolveReview,
  setStatus,
} from './decisions.ts';
import { serveMcp, TOOLS } from './mcp.ts';
import { fakeGbrain } from './test-fixtures.ts';
import type { Wiring } from './wiring.ts';

const DECISION = {
  area: 'research',
  title: 'Judge order',
  context: 'Need a cheap relevance judge.',
  options: [
    { name: 'clef-flash', summary: 'credits' },
    { name: 'jev', summary: 'gateway' },
  ],
  chosen: 'clef-flash',
  evidence: [
    'gbrain:research/q-1',
    'https://developers.cloudflare.com/workers-ai/',
  ],
  shipNow: 'clef-flash first, jev fallback',
  reevaluateWhen: ['new decision model', 'agreement < 80%'],
  then: 'swap order in sources.json',
  date: '2026-10-20',
};

describe('decision log', () => {
  it('renders the Ship now / Re-evaluate when / Then convention and validates input', () => {
    const page = decisionPage(DECISION);
    expect(page).toContain('**Ship now:** clef-flash first');
    expect(page).toContain(
      '**Re-evaluate when:** new decision model; agreement < 80%'
    );
    expect(page).toContain('- **clef-flash** (chosen)');
    expect(page).toContain('[[research/q-1]]');
    expect(decisionSlug(DECISION)).toBe('decisions/research/judge-order');
    expect(() => decisionPage({ ...DECISION, chosen: 'nope' })).toThrow(
      'not among'
    );
    expect(() => decisionPage({ ...DECISION, reevaluateWhen: [] })).toThrow(
      'Re-evaluate'
    );
  });

  it('records a decision with a take and refuses to overwrite an existing one', async () => {
    const { gbrain } = fakeGbrain();
    const slug = await recordDecision(gbrain, DECISION);
    expect(gbrain.calls.map(c => c.tool)).toEqual([
      'get_page',
      'put_page',
      'takes_add',
    ]);
    await expect(recordDecision(gbrain, DECISION)).rejects.toThrow(
      'already exists'
    );
    expect(slug).toBe('decisions/research/judge-order');
  });

  it('supersedes explicitly: links, timeline and status flip on the old page', async () => {
    const { gbrain, pages } = fakeGbrain();
    await recordDecision(gbrain, DECISION);
    await recordDecision(gbrain, {
      ...DECISION,
      title: 'Judge order v2',
      supersedes: 'decisions/research/judge-order',
    });
    expect(pages['decisions/research/judge-order']).toMatch(
      /^status: superseded\nsuperseded_by: decisions\/research\/judge-order-v2$/m
    );
    expect(
      gbrain.calls.some(
        c => c.tool === 'add_link' && c.args.link_type === 'supersedes'
      )
    ).toBe(true);
  });

  it('triggers propose linked reviews and never rewrite the old decision', async () => {
    const { gbrain, pages } = fakeGbrain();
    const dry = await proposeReviews(gbrain, {
      trigger: 'Clef 2 released',
      kind: 'model',
      evidence: [],
      dryRun: true,
    });
    expect(dry).toEqual([
      { decision: 'decisions/research/old', review: null, score: 0.9 },
    ]);
    expect(gbrain.calls.some(c => c.tool === 'put_page')).toBe(false);
    const made = await proposeReviews(gbrain, {
      trigger: 'Clef 2 released',
      kind: 'model',
      evidence: ['https://x'],
      date: '2026-10-21',
    });
    expect(made[0].review).toBe('decisions/reviews/2026-10-21-old');
    const puts = gbrain.calls
      .filter(c => c.tool === 'put_page')
      .map(c => c.args.slug);
    expect(puts).toEqual(['decisions/reviews/2026-10-21-old']);
    expect(pages['decisions/reviews/2026-10-21-old']).toContain(
      'reviews: decisions/research/old'
    );
    expect(
      gbrain.calls.find(c => c.tool === 'add_timeline_entry')?.args.slug
    ).toBe('decisions/research/old');
  });

  it('resolves a review as kept with a re-affirming take', async () => {
    const { gbrain, pages } = fakeGbrain({
      'decisions/reviews/r':
        '---\ntype: decision-review\nstatus: proposed\nreviews: decisions/research/old\n---\n',
    });
    await resolveReview(gbrain, 'decisions/reviews/r', 'kept', [
      'https://evidence',
    ]);
    expect(pages['decisions/reviews/r']).toContain('status: kept');
    expect(gbrain.calls.find(c => c.tool === 'takes_add')?.args.slug).toBe(
      'decisions/research/old'
    );
    await expect(resolveReview(gbrain, 'missing', 'kept')).rejects.toThrow(
      'not a decision review'
    );
    await expect(setStatus(gbrain, 'missing', 'active')).rejects.toThrow(
      'no frontmatter'
    );
  });
});

describe('mcp server', () => {
  it('lists tools and answers calls over newline-delimited JSON-RPC', async () => {
    const out: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        out.push(String(chunk));
        cb();
      },
    });
    const { gbrain } = fakeGbrain();
    const wiring = {
      gbrain,
      router: { research: vi.fn() },
      state: {},
      judges: [],
    } as unknown as Wiring;
    const input = Readable.from([
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`,
      `${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'decision_find', arguments: { topic: 'judge' } } })}\n`,
      `${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } })}\n`,
    ]);
    await serveMcp(
      wiring,
      input as unknown as typeof process.stdin,
      sink as unknown as typeof process.stdout
    );
    await new Promise(r => setTimeout(r, 20));
    const replies = out.map(l => JSON.parse(l)).sort((a, b) => a.id - b.id);
    expect(
      replies[1].result.tools.map((t: { name: string }) => t.name)
    ).toEqual(TOOLS.map(t => t.name));
    expect(replies[2].result.content[0].text).toContain(
      'decisions/research/old'
    );
    expect(replies[3].result.isError).toBe(true);
  });
});

describe('decision cli', () => {
  it('rejects an incomplete decision command', async () => {
    await expect(main(['decision', 'record'], () => undefined)).rejects.toThrow(
      'bad decision command'
    );
  });
});
