/**
 * Fixture: Asia-Pacific tour booking.
 * Ground truth: should suggest.
 */
export const fixture = {
  id: 'booking_asia_pacific',
  label: 'should_suggest' as const,
  email: {
    subject: 'Asia Pacific Tour Confirmation – September 2026',
    from: 'asia@paradigmagency.com',
    date: '2026-07-01T08:00:00Z',
    body: `Dear Tim,

Your Asia Pacific dates are confirmed:

Tokyo:
Date: Friday, September 11, 2026
Venue: Womb Tokyo, 2-16 Maruyamacho, Shibuya City, Tokyo
Set: 2:00 AM – 5:00 AM
Fee: ¥500,000

Singapore:
Date: Saturday, September 12, 2026
Venue: Zouk Singapore, 3C River Valley Rd, Singapore
Set: 1:00 AM – 4:00 AM
Fee: SGD 6,000

Sydney:
Date: Sunday, September 13, 2026
Venue: Marquee Sydney, The Star, Pirrama Rd, Pyrmont NSW 2009
Set: 1:00 AM – 4:00 AM
Fee: AUD 8,000

Paradigm Asia`,
  },
  existingCalendarEvents: [],
  expectedEvents: [
    {
      title: 'Womb Tokyo',
      startsAt: '2026-09-12T02:00:00',
      city: 'Tokyo',
      country: 'JP',
    },
    {
      title: 'Zouk Singapore',
      startsAt: '2026-09-13T01:00:00',
      city: 'Singapore',
      country: 'SG',
    },
    {
      title: 'Marquee Sydney',
      startsAt: '2026-09-14T01:00:00',
      city: 'Sydney',
      country: 'AU',
    },
  ],
};
