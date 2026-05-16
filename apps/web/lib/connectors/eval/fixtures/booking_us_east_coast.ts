/**
 * Fixture: US East Coast club booking.
 * Ground truth: should suggest.
 */
export const fixture = {
  id: 'booking_us_east_coast',
  label: 'should_suggest' as const,
  email: {
    subject: 'Confirmed: Good Room Brooklyn – March 14, 2026',
    from: 'bookings@goodroombk.com',
    date: '2026-02-01T18:00:00Z',
    body: `Hey Tim,

You're confirmed for Good Room!

Date: Saturday, March 14, 2026
Time: 11:00 PM – 5:00 AM
Venue: Good Room, 98 Meserole Ave, Brooklyn, NY 11222
Guarantee: $1,500

See you then,
Good Room`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Good Room Brooklyn',
    startsAt: '2026-03-15T04:00:00Z',
    city: 'Brooklyn',
    region: 'NY',
    country: 'US',
  },
};
