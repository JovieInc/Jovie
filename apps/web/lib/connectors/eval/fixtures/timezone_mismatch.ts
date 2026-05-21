/**
 * Fixture: booking with ambiguous timezone or cross-midnight date.
 * Ground truth: should suggest — extractor handles timezone ambiguity gracefully.
 */
export const fixture = {
  id: 'timezone_mismatch',
  label: 'should_suggest' as const,
  email: {
    subject: "Booking Confirmed: Club Space Miami – New Year's Eve 2026",
    from: 'bookings@clubspace.com',
    date: '2026-10-15T14:00:00Z',
    body: `Hi Tim,

You are confirmed for our New Year's Eve party!

Date: Thursday, December 31, 2026 / Friday, January 1, 2027
Set time: 2:00 AM EST – 6:00 AM EST (January 1, 2027)
Venue: Club Space, 34 NE 11th St, Miami, FL 33132
Note: The party starts Dec 31 at 10 PM, your set is 2-6 AM on Jan 1.

Fee: $15,000

Club Space`,
  },
  existingCalendarEvents: [],
  expectedEvent: {
    title: 'Club Space Miami',
    startsAt: '2027-01-01T07:00:00Z',
    city: 'Miami',
    region: 'FL',
    country: 'US',
  },
  note: 'Cross-midnight / New Year set — extractor must correctly resolve Jan 1 start time',
};
