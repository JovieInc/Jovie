import { describe, expect, it } from 'vitest';
import { viewSpecSchema } from './spec';

const base = {
  schema: 'jovie.view.v1' as const,
  title: 'Weekly',
  blocks: [{ type: 'stat' as const, label: 'Streams', value: '1,204' }],
};

describe('viewSpecSchema', () => {
  it('accepts every block type', () => {
    const result = viewSpecSchema.safeParse({
      ...base,
      description: 'd',
      blocks: [
        { type: 'stat', label: 'Streams', value: '1', hint: 'wk' },
        {
          type: 'sparkline',
          label: 'S',
          points: [1, 2, 3],
          polarity: 'higher-is-better',
        },
        {
          type: 'table',
          columns: [{ key: 'city', label: 'City' }],
          rows: [{ city: 'LA' }, { city: null }],
        },
        { type: 'text', body: 'hello' },
        { type: 'html', html: '<b>x</b>', height: 200 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['wrong schema', { ...base, schema: 'x' }],
    ['no blocks', { ...base, blocks: [] }],
    ['41 blocks', { ...base, blocks: Array(41).fill(base.blocks[0]) }],
    ['unknown key', { ...base, extra: 1 }],
    ['unknown block key', { ...base, blocks: [{ ...base.blocks[0], x: 1 }] }],
    ['unknown block type', { ...base, blocks: [{ type: 'script', src: 'x' }] }],
    [
      'one point',
      { ...base, blocks: [{ type: 'sparkline', label: 'a', points: [1] }] },
    ],
    [
      'neutral polarity',
      {
        ...base,
        blocks: [
          {
            type: 'sparkline',
            label: 'a',
            points: [1, 2],
            polarity: 'neutral',
          },
        ],
      },
    ],
    [
      'bad column key',
      {
        ...base,
        blocks: [
          { type: 'table', columns: [{ key: 'a b', label: 'A' }], rows: [] },
        ],
      },
    ],
    [
      'object cell',
      {
        ...base,
        blocks: [
          {
            type: 'table',
            columns: [{ key: 'a', label: 'A' }],
            rows: [{ a: { x: 1 } }],
          },
        ],
      },
    ],
    [
      'html too tall',
      { ...base, blocks: [{ type: 'html', html: 'x', height: 5000 }] },
    ],
    [
      'html meta refresh',
      {
        ...base,
        blocks: [
          {
            type: 'html',
            html: '<META HTTP-EQUIV=Refresh content="0;url=https://example.com">',
          },
        ],
      },
    ],
    [
      'html too long',
      { ...base, blocks: [{ type: 'html', html: 'x'.repeat(200_001) }] },
    ],
    ['title too long', { ...base, title: 'x'.repeat(121) }],
  ])('rejects %s', (_name, input) => {
    expect(viewSpecSchema.safeParse(input).success).toBe(false);
  });
});
