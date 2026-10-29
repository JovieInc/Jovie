import { describe, expect, it } from 'vitest';
import {
  type CopyVerdictEntry,
  computeStats,
  copyVerdictInputSchema,
  rewriteRatedGreatRate,
} from './verdicts';

const entry = (
  verdict: CopyVerdictEntry['verdict'],
  text: string
): CopyVerdictEntry => ({
  verdict,
  note: '',
  by: 'tim',
  source: 'ovie-tap',
  at: '2026-10-28T00:00:00.000Z',
  text,
});

describe('copy verdict math', () => {
  it('counts reviewed lines and the great share', () => {
    const stats = computeStats(10, [
      { verdict: 'great' },
      { verdict: 'sucks' },
      { verdict: 'great' },
      { verdict: 'meh' },
    ]);
    expect(stats).toMatchObject({
      reviewed: 4,
      great: 2,
      sucks: 1,
      meh: 1,
      greatShare: 0.5,
    });
  });

  it('has no great share before anything is reviewed', () => {
    expect(computeStats(10, []).greatShare).toBeNull();
  });

  it('counts a rewrite only when the text changed after a bad verdict', () => {
    const rewrittenGreat = {
      verdict: 'great' as const,
      text: 'new',
      history: [entry('sucks', 'old')],
    };
    const sameTextRerated = {
      verdict: 'great' as const,
      text: 'same',
      history: [entry('meh', 'same')],
    };
    const rewrittenStillBad = {
      verdict: 'meh' as const,
      text: 'newer',
      history: [entry('sucks', 'old')],
    };
    expect(
      rewriteRatedGreatRate([
        rewrittenGreat,
        sameTextRerated,
        rewrittenStillBad,
      ])
    ).toEqual({ rerated: 2, great: 1, rate: 0.5 });
    expect(rewriteRatedGreatRate([]).rate).toBeNull();
  });

  it('accepts only speakable IDs and the three verdicts', () => {
    expect(
      copyVerdictInputSchema.safeParse({ copyId: 'HOME-3', verdict: 'great' })
        .success
    ).toBe(true);
    expect(
      copyVerdictInputSchema.safeParse({ copyId: 'home-3', verdict: 'great' })
        .success
    ).toBe(false);
    expect(
      copyVerdictInputSchema.safeParse({ copyId: 'HOME-3', verdict: 'ok' })
        .success
    ).toBe(false);
  });
});
