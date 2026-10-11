import { describe, expect, it } from 'vitest';
import { visualDimensionOf, visualRework } from './stages-page';

describe('visualDimensionOf', () => {
  it('tags findings by what they are about', () => {
    expect(
      visualDimensionOf('mobile@390: the headline wraps to four lines')
    ).toBe('copy');
    expect(
      visualDimensionOf('desktop@1440: the hero image reads as stock')
    ).toBe('imagery');
    expect(visualDimensionOf('desktop@1440: two competing focal points')).toBe(
      'layout'
    );
    expect(visualDimensionOf('ref-copy: matches corpus ref 12')).toBe(
      'imagery'
    );
    // An explicit judge tag wins over keywords.
    expect(visualDimensionOf('[layout] the headline sits off the grid')).toBe(
      'layout'
    );
    expect(visualDimensionOf('mobile@390: feels off')).toBe('copy');
  });
});

describe('visualRework', () => {
  it('rewinds to the earliest owning stage and tags every finding', () => {
    expect(
      visualRework([
        'desktop@1440: the hero image reads as stock',
        'mobile@390: the subhead wraps badly',
      ])
    ).toEqual({
      stage: 'copy',
      findings: [
        '[imagery] desktop@1440: the hero image reads as stock',
        '[copy] mobile@390: the subhead wraps badly',
      ],
    });
    expect(visualRework(['desktop@1440: spacing is crowded']).stage).toBe(
      'layout'
    );
    expect(
      visualRework(['desktop@1440: the photo is low contrast']).stage
    ).toBe('asset');
  });
});
