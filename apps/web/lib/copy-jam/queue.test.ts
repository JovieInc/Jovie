import { describe, expect, it } from 'vitest';
import { buildRewriteQueue, buildTasteExamples } from './queue';
import type { CopyVerdictRecord } from './verdicts';

const row = (id: string, text: string) => ({
  id,
  route: '/',
  section: 'Hero',
  role: 'body',
  text,
  source: 'a.ts:1',
});
const rows = new Map([
  ['HOME-1', row('HOME-1', 'Old one')],
  ['HOME-2', row('HOME-2', 'Fine two')],
  ['HOME-3', row('HOME-3', 'Rewritten three')],
  ['HOME-10', row('HOME-10', 'Ten')],
]);
const v = (
  copyId: string,
  verdict: CopyVerdictRecord['verdict'],
  text: string,
  note = ''
): CopyVerdictRecord => ({
  copyId,
  verdict,
  note,
  text,
  by: 'tim',
  source: 'ovie-tap',
  at: '2026-10-28T00:00:00Z',
  history: [],
});

describe('rewrite queue', () => {
  it('queues sucks and meh lines whose text still matches, in ID order', () => {
    const q = buildRewriteQueue(
      rows,
      [
        v('HOME-10', 'meh', 'Ten'),
        v('HOME-1', 'sucks', 'Old one', 'too long'),
        v('HOME-2', 'great', 'Fine two'),
      ],
      new Map()
    );
    expect(q.map(t => t.copyId)).toEqual(['HOME-1', 'HOME-10']);
    expect(q[0]).toMatchObject({ verdict: 'sucks', note: 'too long' });
  });

  it('skips a line already rewritten or with pending alternatives', () => {
    const alts = new Map([
      [
        'HOME-1',
        {
          copyId: 'HOME-1',
          forText: 'Old one',
          alternatives: ['a', 'b'],
          by: 'summer',
          at: '',
          status: 'pending' as const,
        },
      ],
    ]);
    const q = buildRewriteQueue(
      rows,
      [v('HOME-1', 'sucks', 'Old one'), v('HOME-3', 'sucks', 'Original three')],
      alts
    );
    expect(q).toEqual([]);
  });
});

describe('taste examples', () => {
  it('splits great lines from rejected lines with notes', () => {
    const ex = buildTasteExamples(rows, [
      v('HOME-2', 'great', 'Fine two'),
      v('HOME-1', 'sucks', 'Old one', 'too long'),
      v('HOME-10', 'meh', 'Ten'),
    ]);
    expect(ex.great.map(g => g.text)).toEqual(['Fine two']);
    expect(ex.avoid).toEqual([
      { copyId: 'HOME-1', role: 'body', text: 'Old one', note: 'too long' },
    ]);
  });
});
