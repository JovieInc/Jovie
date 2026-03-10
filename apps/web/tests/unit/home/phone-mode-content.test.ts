import { describe, expect, it } from 'vitest';
import { getTourPersonalization } from '@/components/home/phone-mode-content';

describe('getTourPersonalization', () => {
  it('falls back to Los Angeles when city is unknown', () => {
    expect(
      getTourPersonalization({
        city: 'Seattle',
        region: 'WA',
      })
    ).toEqual({
      city: 'Los Angeles',
      region: 'CA',
      venue: 'Academy LA',
    });
  });

  it('resolves aliases like NYC to New York venues', () => {
    expect(
      getTourPersonalization({
        city: 'NYC',
        region: 'NY',
      })
    ).toEqual({
      city: 'New York',
      region: 'NY',
      venue: 'Brooklyn Steel',
    });
  });

  it('prefers artist city when provided', () => {
    expect(
      getTourPersonalization({
        city: 'Los Angeles',
        region: 'ON',
        artistCity: 'Toronto',
      })
    ).toEqual({
      city: 'Toronto',
      region: 'ON',
      venue: 'The Danforth',
    });
  });
});
