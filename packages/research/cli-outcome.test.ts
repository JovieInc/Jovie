import { beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './cli.ts';
import { sampleResult } from './test-fixtures.ts';

const { research } = vi.hoisted(() => ({ research: vi.fn() }));
vi.mock('./wiring.ts', () => ({
  createDefaultWiring: () => ({ router: { research } }),
}));

describe('research CLI outcome', () => {
  beforeEach(() => research.mockReset());

  it('returns machine-readable degradation and nonzero for an unavailable source set', async () => {
    research.mockResolvedValue(
      sampleResult({
        hits: [],
        judge: { model: null, usd: 0, ms: 0 },
        runs: ['firecrawl', 'exa', 'last30days'].map(source => ({
          source,
          tier: 1,
          ok: false,
          hits: 0,
          ms: 0,
          usd: 0,
          skipped: 'no credential',
        })),
        answer: 'Unsupported answer',
      })
    );
    const output: string[] = [];
    expect(await main(['ask', 'q', '--json'], s => output.push(s))).toBe(1);
    expect(JSON.parse(output[0])).toMatchObject({
      verdict: 'degraded',
      reasons: expect.arrayContaining([
        'no external sources',
        'firecrawl: no credential',
      ]),
    });
    const human: string[] = [];
    expect(await main(['ask', 'q'], s => human.push(s))).toBe(1);
    expect(human[0]).toContain('DEGRADED:');
  });

  it('returns zero for verified external evidence (negative control)', async () => {
    research.mockResolvedValue(sampleResult());
    const output: string[] = [];
    expect(await main(['ask', 'q', '--json'], s => output.push(s))).toBe(0);
    expect(JSON.parse(output[0])).toMatchObject({ verdict: 'ok', reasons: [] });
  });
});
