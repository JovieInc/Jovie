/**
 * Fixture: European tour booking with multiple cities.
 * Ground truth: should suggest — confirmed booking with clear date/venue.
 */
export const fixture = {
  id: 'booking_europe_tour',
  label: 'should_suggest' as const,
  email: {
    subject: 'Tour Confirmation: Amsterdam → Barcelona → Rome, Nov 2026',
    from: 'tour@paradigmagency.com',
    date: '2026-09-15T13:00:00Z',
    body: `Hi Tim,

Your European tour is confirmed:

Show 1:
Date: Friday, November 6, 2026
Venue: Shelter Amsterdam, Jonge Roelensteeg 20-26, Amsterdam
Time: 11:00 PM – 5:00 AM
Fee: €4,500

Show 2:
Date: Saturday, November 7, 2026
Venue: Nitsa Barcelona, Av. del Paral·lel, 64, Barcelona
Time: 2:00 AM – 6:00 AM
Fee: €5,000

Show 3:
Date: Sunday, November 8, 2026
Venue: Goa Club Roma, Via Libetta, 13, Rome
Time: Midnight – 5:00 AM
Fee: €3,500

Travel details to follow.

Paradigm`,
  },
  existingCalendarEvents: [],
  expectedEvents: [
    {
      title: 'Shelter Amsterdam',
      startsAt: '2026-11-06T23:00:00',
      city: 'Amsterdam',
      country: 'NL',
    },
    {
      title: 'Nitsa Barcelona',
      startsAt: '2026-11-08T02:00:00',
      city: 'Barcelona',
      country: 'ES',
    },
    {
      title: 'Goa Club Roma',
      startsAt: '2026-11-09T00:00:00',
      city: 'Rome',
      country: 'IT',
    },
  ],
  note: 'Multi-date tour — extractor should suggest all three shows',
};
