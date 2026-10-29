import { describe, expect, it } from 'vitest';
import { parseJam } from './parse-jam';

const ids = new Set([
  'HOME-3',
  'HOME-4',
  'HOME-12',
  'SL-2',
  'SL-7',
  'PRICE-21',
  'PAY-2',
  'AP-5',
  'SITE-8',
]);

describe('parseJam', () => {
  it('parses the synthetic memo: spoken IDs, verdicts and notes', () => {
    const memo =
      'Okay. HOME-3 sucks, too long. Home four great. S L two meh, say it plainer. ' +
      'Pricing twenty one is terrible because it sounds like a bank. Pay two, love it.';
    expect(parseJam(memo, ids)).toEqual({
      verdicts: [
        { copyId: 'HOME-3', verdict: 'sucks', note: 'too long' },
        { copyId: 'HOME-4', verdict: 'great', note: '' },
        { copyId: 'SL-2', verdict: 'meh', note: 'say it plainer' },
        { copyId: 'PRICE-21', verdict: 'sucks', note: 'it sounds like a bank' },
        { copyId: 'PAY-2', verdict: 'great', note: '' },
      ],
      leftovers: [],
    });
  });

  it('shares one verdict across "home three and four"', () => {
    const { verdicts } = parseJam('home three and four are great', ids);
    expect(verdicts.map(v => [v.copyId, v.verdict])).toEqual([
      ['HOME-3', 'great'],
      ['HOME-4', 'great'],
    ]);
  });

  it('accepts digits, hyphens, spelled letters and transcription slips', () => {
    expect(
      parseJam('SL-7 meh. S L to meh', ids).verdicts.map(v => v.copyId)
    ).toEqual(['SL-7', 'SL-2']);
    expect(parseJam('home 12 not good', ids).verdicts[0]).toMatchObject({
      copyId: 'HOME-12',
      verdict: 'sucks',
    });
    expect(parseJam('A P five love', ids).verdicts[0]?.copyId).toBe('AP-5');
  });

  it('keeps an ID with no verdict as a leftover for the model', () => {
    const r = parseJam('HOME-3 hmm that one feels off. SL-2 great.', ids);
    expect(r.verdicts.map(v => v.copyId)).toEqual(['SL-2']);
    expect(r.leftovers).toEqual([
      {
        segment: 'hmm that one feels off .',
        copyIds: ['HOME-3'],
        reason: 'no-verdict',
      },
    ]);
  });

  it('flags an ID that is not in the inventory', () => {
    const r = parseJam('home ninety nine sucks', ids);
    expect(r.verdicts).toEqual([]);
    expect(r.leftovers[0]).toMatchObject({
      copyIds: ['HOME-99'],
      reason: 'unknown-id',
    });
  });

  it('ignores talk with no IDs', () => {
    expect(parseJam('this is great, I love the vibe', ids)).toEqual({
      verdicts: [],
      leftovers: [],
    });
  });
});
