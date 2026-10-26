import { describe, expect, it } from 'vitest';
import {
  CAPTURE_CONSENT_COPY,
  describeUpdatePromise,
} from './ProfileMobileNotificationsFlow';

/**
 * Audience permission model: Jovie sends verified events. Sharing with the
 * artist is a separate opt-in, never bundled into the subscribe consent.
 */
describe('Get Updates consent wording', () => {
  for (const channel of ['email', 'sms'] as const) {
    it(`${channel}: Jovie is the only sender named, no artist sender or bundled artist consent`, () => {
      const copy = CAPTURE_CONSENT_COPY[channel];
      expect(copy).toMatch(/from Jovie/);
      expect(copy).not.toMatch(/(artist|them) and Jovie/i);
      expect(copy).not.toMatch(/from this artist/i);
      expect(copy).not.toMatch(/fan/i);
      expect(copy.length).toBeLessThanOrEqual(140);
    });
  }

  it('keeps unsubscribe and STOP language', () => {
    expect(CAPTURE_CONSENT_COPY.email).toMatch(/Unsubscribe anytime/);
    expect(CAPTURE_CONSENT_COPY.sms).toMatch(/Reply STOP/);
  });
});

describe('Get Updates promise', () => {
  it('promises only new music unless the artist has more', () => {
    expect(describeUpdatePromise('Tim', ['newMusic'])).toEqual({
      title: 'Get New Music',
      body: 'New music from Tim.',
    });
    expect(describeUpdatePromise('Tim', []).body).not.toMatch(/shows|merch/);
  });

  it('lists exactly the content types provided', () => {
    expect(describeUpdatePromise('Tim', ['newMusic', 'tourDates']).body).toBe(
      'Tim: new music and shows.'
    );
    expect(
      describeUpdatePromise('Tim', ['newMusic', 'tourDates', 'merch']).body
    ).toBe('Tim: new music, shows and merch.');
  });
});
