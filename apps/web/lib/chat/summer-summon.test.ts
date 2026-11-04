import { describe, expect, it } from 'vitest';

import { isSummerSummon, resolveSummerHandoff } from './summer-summon';

describe('isSummerSummon', () => {
  it.each([
    'summmmahhhhhh',
    'summer',
    'Summer!',
    '@summer',
    '@Summer what is shipping',
    'hey summer',
    'sumerrrr',
    'SUMMMMAH',
    'yo @summmer',
  ])('summons on %s', text => {
    expect(isSummerSummon(text)).toBe(true);
  });

  it.each([
    'what should I do this summer',
    'summer release strategy for my EP',
    'sumo wrestling',
    'sum of streams',
    '',
    'summit',
  ])('does not summon on %s', text => {
    expect(isSummerSummon(text)).toBe(false);
  });
});

describe('resolveSummerHandoff', () => {
  const base = {
    chatMode: null,
    text: 'summmmahhhhhh',
    founderAuthorized: true,
    transportEnabled: true,
  } as const;
  it('hands the founder to Summer', () => {
    expect(resolveSummerHandoff(base)).toBe('ov');
  });
  it('never hands an artist (non-founder) over', () => {
    expect(
      resolveSummerHandoff({ ...base, founderAuthorized: false })
    ).toBeNull();
  });
  it('does nothing when the transport is off', () => {
    expect(
      resolveSummerHandoff({ ...base, transportEnabled: false })
    ).toBeNull();
  });
  it('keeps ov mode', () => {
    expect(resolveSummerHandoff({ ...base, chatMode: 'ov', text: 'hi' })).toBe(
      'ov'
    );
  });
});
