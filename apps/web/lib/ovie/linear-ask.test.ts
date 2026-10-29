import { describe, expect, it } from 'vitest';
import { linearAnswerComment, parseLinearAsk } from './linear-ask';

describe('parseLinearAsk', () => {
  it('lifts the options line out of the body', () => {
    expect(
      parseLinearAsk(
        'Sign in to Supabase.\n\noptions:  Signed in | Restarted it myself \nWhy: gbrain is slow.'
      )
    ).toEqual({
      body: 'Sign in to Supabase.\n\nWhy: gbrain is slow.',
      options: ['Signed in', 'Restarted it myself'],
    });
  });

  it('drops empty, duplicate and oversized options and caps at four', () => {
    const long = 'x'.repeat(41);
    expect(
      parseLinearAsk(`Options: A | | A | ${long} | B | C | D | E`).options
    ).toEqual(['A', 'B', 'C', 'D']);
  });

  it('handles a missing description and long bodies', () => {
    expect(parseLinearAsk(null)).toEqual({ body: '', options: [] });
    const body = parseLinearAsk('y'.repeat(700)).body;
    expect(body).toHaveLength(600);
    expect(body.endsWith('…')).toBe(true);
  });

  it('writes an attributable one-line answer comment', () => {
    expect(linearAnswerComment('  OK ')).toBe('Answered in Ovie: OK');
  });
});
