import { describe, expect, it } from 'vitest';
import {
  CATEGORY_TO_CONTACT_ROLE,
  getTerritorySpecificity,
  normalizeSubject,
} from '@/lib/inbox/constants';

describe('Jovie Inbox constants', () => {
  it('normalizes replies and forwarded subject prefixes', () => {
    expect(normalizeSubject('RE: FW: Booking inquiry')).toBe('Booking inquiry');
    expect(normalizeSubject(null)).toBe('');
  });

  it('keeps territory specificity available for display and classification', () => {
    expect(getTerritorySpecificity('USA')).toBe(100);
    expect(getTerritorySpecificity('Worldwide')).toBe(1);
    expect(getTerritorySpecificity('Unknown')).toBe(75);
  });

  it('maps supported Inbox categories to typed responsibilities', () => {
    expect(CATEGORY_TO_CONTACT_ROLE).toMatchObject({
      booking: 'bookings',
      music_collaboration: 'music_collaboration',
      brand_partnership: 'brand_partnerships',
      management: 'management',
      press: 'press_pr',
      fan_mail: 'fan_general',
      spam: null,
    });
  });
});
